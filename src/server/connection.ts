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
		this.channel.write(frame);
	}
}
