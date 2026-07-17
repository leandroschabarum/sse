import { Response } from './types';
import { uuidv4 } from '../random';

function sanitizeField(value: string): string {
	return value.replace(/[\r\n]/g, '');
}

export function formatEvent<T>(id: string, event: string, data?: T): string {
	return (
		`id: ${id}\n` +
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

	protected get id() {
		return this._id;
	}

	protected get channel(): TRes {
		return this._channel;
	}

	public constructor(res: TRes, id: string = '') {
		this._id ??= id;
		this._channel ??= res;
		this.setHeaders();
	}

	protected setHeaders(): void {
		this.channel.setHeader('Content-Type', 'text/event-stream');
		this.channel.setHeader('Cache-Control', 'no-cache');
		this.channel.setHeader('Connection', 'keep-alive');
	}

	public send<T>(event: string, data?: T): void {
		this.write(formatEvent(uuidv4(), event, data));
	}

	public write(frame: string): void {
		// A saturated socket keeps buffering in memory even though write() has
		// signalled backpressure, so drop the frame rather than pile onto it.
		if (this.saturated) return;

		if (this.channel.write(frame) === false) {
			this.saturated = true;
			this.channel.once('drain', () => {
				this.saturated = false;
			});
		}
	}
}
