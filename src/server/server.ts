import { Request, Response } from './types';
import { Connection } from './connection';
import { uuidv4 } from '../random';

const HEADER_REQUEST_ID = 'x-request-id';

export class Server<TReq extends Request, TRes extends Response> {
	private static _instance: Server<Request, Response>;

	public static get instance() {
		if (!this._instance) {
			this._instance = new this();
		}

		return this._instance;
	}

	protected connections: Map<string, Connection<TRes>>;

	protected constructor() {
		this.connections = new Map<string, Connection<TRes>>();
	}

	protected generateId(req: TReq): string {
		const data = req.headers[HEADER_REQUEST_ID];

		return (typeof data === 'string' && data?.trim()) || uuidv4();
	}

	public broadcast<T>(event: string, data?: T): void {
		for (const connection of this.connections.values()) {
			connection.send<T>(event, data);
		}
	}

	public createConnection(req: TReq, res: TRes): void {
		const id = this.generateId(req);
		const connection = new Connection<TRes>(res, id);

		req.on('close', () => this.connections.delete(id));

		this.connections.set(id, connection);
	}

	public getConnection(id: string): Connection<TRes> | undefined {
		return this.connections.get(id);
	}
}
