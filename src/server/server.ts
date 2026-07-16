import { Request, Response } from './types';
import { Connection, formatEvent } from './connection';
import { uuidv4 } from '../random';

const DEFAULT_MAX_CONNECTIONS = 1_000;

export class Server<TReq extends Request, TRes extends Response> {
	private static _instance: Server<Request, Response>;

	public static get instance() {
		if (!this._instance) {
			this._instance = new this();
		}

		return this._instance;
	}

	protected connections: Map<string, Connection<TRes>>;

	protected maxConnections: number = DEFAULT_MAX_CONNECTIONS;

	protected constructor() {
		this.connections = new Map<string, Connection<TRes>>();
	}

	public setMaxConnections(max: number): void {
		if (!Number.isInteger(max) || max <= 0) {
			throw new RangeError(
				`maxConnections must be a positive integer, received: ${max}`
			);
		}

		this.maxConnections = max;
	}

	protected resolveId(id?: string): string {
		return (typeof id === 'string' && id.trim()) || uuidv4();
	}

	public broadcast<T>(event: string, data?: T): void {
		if (this.connections.size === 0) return;

		const frame = formatEvent(uuidv4(), event, data);

		for (const [id, connection] of this.connections) {
			try {
				connection.write(frame);
			} catch (e) {
				this.connections.delete(id);
				console.error(`[sse] write failed for connection ${id}:`, e);
			}
		}
	}

	public createConnection(req: TReq, res: TRes, id?: string): void {
		id = this.resolveId(id);

		if (
			this.connections.size >= this.maxConnections &&
			!this.connections.has(id)
		) {
			console.error(
				`[sse] connection refused: reached maxConnections limit of ${this.maxConnections}`
			);

			return;
		}

		const connection = new Connection<TRes>(res, id);

		req.on('close', () => this.connections.delete(id));

		this.connections.set(id, connection);
	}

	public getConnection(id: string): Connection<TRes> | undefined {
		return this.connections.get(id);
	}
}
