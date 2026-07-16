import { Response } from './types';
import { uuidv4 } from '../random';

const HEARTBEAT_FRAME = ': ping\n\n';

function sanitizeField(value: string): string {
	return value.replace(/[\r\n]/g, '');
}

export function formatEvent<T>(id: string, event: string, data?: T): string {
	return (
		`id: ${sanitizeField(id)}\n` +
		`event: ${sanitizeField(event)}\n` +
		`data: ${JSON.stringify(data ?? null)}\n\n`
	);
}

export class Connection<TRes extends Response> {
	private _id: string;

	private _channel: TRes;

	/**
	 * True while the underlying socket buffer is above its high-water mark.
	 * Frames written while saturated are dropped for this connection until the
	 * channel drains, bounding memory usage against slow or stalled clients.
	 */
	private saturated = false;

	/**
	 * Timestamp (ms) when the channel last became saturated, or null while it is
	 * draining normally. Lets the server evict a client that has been stalled for
	 * too long instead of holding its socket open forever.
	 */
	private saturatedSince: number | null = null;

	protected get id() {
		return this._id;
	}

	protected get channel(): TRes {
		return this._channel;
	}

	public constructor(res: TRes, id: string = '') {
		this._id = id;
		this._channel = res;
		this.setHeaders();
	}

	protected setHeaders(): void {
		this.channel.setHeader('Content-Type', 'text/event-stream');
		this.channel.setHeader('Cache-Control', 'no-cache');
		this.channel.setHeader('Connection', 'keep-alive');
		this.channel.setHeader('X-Accel-Buffering', 'no');
		this.channel.flushHeaders?.();
	}

	public send<T>(event: string, data?: T): void {
		this.write(formatEvent(uuidv4(), event, data));
	}

	public ping(): void {
		this.write(HEARTBEAT_FRAME);
	}

	public stalledFor(now: number = Date.now()): number {
		return this.saturatedSince === null ? 0 : now - this.saturatedSince;
	}

	public close(): void {
		this.channel.end();
	}

	public write(frame: string): void {
		// A saturated socket keeps buffering in memory even though write() has
		// signalled backpressure, so drop the frame rather than pile onto it.
		if (this.saturated) return;

		if (this.channel.write(frame) === false) {
			this.saturated = true;
			this.saturatedSince = Date.now();
			this.channel.once('drain', () => {
				this.saturated = false;
				this.saturatedSince = null;
			});
		}
	}
}
