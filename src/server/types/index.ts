export interface Response {
	setHeader(name: string, value: string): void;
	flushHeaders?(): void;
	write(chunk: string): boolean;
	once(event: string, listener: () => void): void;
	end(): void;
}

export interface Request {
	on(event: string, listener: () => void): this;
}
