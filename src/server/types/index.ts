export interface Response {
	setHeader(name: string, value: string): void;
	write(chunk: string): boolean;
	once(event: string, listener: () => void): void;
}

export interface Request {
	on(event: string, listener: () => void): this;
	headers: { [key: string]: string | string[] | undefined };
}
