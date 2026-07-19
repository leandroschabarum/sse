import { Request, Response } from './types';
import { Connection, formatEvent } from './connection';
import { uuidv4 } from '../random';

const MAX_CONNECTION_ID_LENGTH = 256;
const DEFAULT_MAX_CONNECTIONS = 1_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_STALLED_TIMEOUT_MS = 30_000;

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

	protected heartbeatIntervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS;

	protected stalledTimeoutMs: number = DEFAULT_STALLED_TIMEOUT_MS;

	protected heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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

	public setHeartbeatInterval(ms: number): void {
		if (!Number.isInteger(ms) || ms <= 0) {
			throw new RangeError(
				`heartbeatInterval must be a positive integer, received: ${ms}`
			);
		}

		this.heartbeatIntervalMs = ms;

		if (this.heartbeatTimer) {
			this.stopHeartbeat();
			this.startHeartbeat();
		}
	}

	public setStalledTimeout(ms: number): void {
		if (!Number.isInteger(ms) || ms <= 0) {
			throw new RangeError(
				`stalledTimeout must be a positive integer, received: ${ms}`
			);
		}

		this.stalledTimeoutMs = ms;
	}

	protected sweep(): void {
		const now = Date.now();

		for (const [id, connection] of this.connections) {
			if (connection.stalledFor(now) >= this.stalledTimeoutMs) {
				this.evict(
					id,
					connection,
					`stalled for at least ${this.stalledTimeoutMs}ms`
				);

				continue;
			}

			try {
				connection.ping();
			} catch (e) {
				this.evict(id, connection, e);
			}
		}

		if (this.connections.size === 0) this.stopHeartbeat();
	}

	private evict(
		id: string,
		connection: Connection<TRes>,
		reason: unknown
	): void {
		this.connections.delete(id);
		connection.close();
		console.error(`[sse] evicting connection ${id}:`, reason);
	}

	private startHeartbeat(): void {
		if (this.heartbeatTimer) return;

		const timer = setInterval(() => this.sweep(), this.heartbeatIntervalMs);

		if (typeof timer !== 'number') timer.unref();

		this.heartbeatTimer = timer;
	}

	private stopHeartbeat(): void {
		if (!this.heartbeatTimer) return;

		clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = null;
	}

	protected resolveId(id?: string): string {
		if (typeof id !== 'string') return uuidv4();

		const trimmed = id.trim();

		if (!trimmed) return uuidv4();

		if (trimmed === '*') {
			throw new RangeError(
				"connection id '*' is reserved for broadcast and cannot be used"
			);
		}

		if (trimmed.length > MAX_CONNECTION_ID_LENGTH) {
			throw new RangeError(
				`connection id must be at most ${MAX_CONNECTION_ID_LENGTH} characters, received: ${trimmed.length}`
			);
		}

		return trimmed;
	}

	public broadcast<T>(event: string, data?: T): void {
		if (this.connections.size === 0) return;

		const frame = formatEvent(uuidv4(), event, data);

		for (const [id, connection] of this.connections) {
			try {
				connection.write(frame);
			} catch (e) {
				this.evict(id, connection, e);
			}
		}

		if (this.connections.size === 0) this.stopHeartbeat();
	}

	public createConnection(req: TReq, res: TRes, id?: string): void {
		id = this.resolveId(id);

		const existing = this.connections.get(id);

		if (!existing && this.connections.size >= this.maxConnections) {
			console.error(
				`[sse] connection refused: reached maxConnections limit of ${this.maxConnections}`
			);

			res.end();

			return;
		}

		const connection = new Connection<TRes>(res, id);

		if (existing) existing.close();

		req.on('close', () => {
			if (this.connections.get(id) !== connection) return;

			this.connections.delete(id);

			if (this.connections.size === 0) this.stopHeartbeat();
		});

		this.connections.set(id, connection);

		this.startHeartbeat();
	}

	public getConnection(id: string): Connection<TRes> | undefined {
		return this.connections.get(id);
	}
}
