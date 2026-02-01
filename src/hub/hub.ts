import Server from '../server';

export class Hub {
	private static _instance: Hub;

	public static get instance() {
		if (!this._instance) {
			this._instance = new this();
		}

		return this._instance;
	}

	protected trigger<T>(target: string | '*', name: string, data?: T): void {
		if (target === '*') return Server.broadcast(name, data);

		return Server.getConnection(target)?.send(name, data);
	}

	public to(id: string | '*') {
		return {
			emit: <T>(event: string, data?: T) =>
				this.trigger<T>(id, event, data)
		};
	}

	public emit<T>(event: string, data?: T) {
		return this.trigger<T>('*', event, data);
	}
}
