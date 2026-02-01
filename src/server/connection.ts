import { Response } from './types';
import { uuidv4 } from '../random';

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
		this.channel.write(`id: ${uuidv4()}\n`);
		this.channel.write(`event: ${event}\n`);
		this.channel.write(`data: ${JSON.stringify(data ?? null)}\n\n`);
	}
}
