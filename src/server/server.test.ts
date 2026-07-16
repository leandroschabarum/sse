import { Server } from './server';
import { Request, Response } from './types';
import { uuidv4 } from '../random';

jest.mock('../random', () => ({
	uuidv4: jest.fn(() => 'mock-uuid-1234')
}));

const mockUuidv4 = uuidv4 as jest.Mock;

const createMockResponse = (): jest.Mocked<Response> => ({
	setHeader: jest.fn(),
	write: jest.fn<boolean, [string]>(() => true),
	once: jest.fn()
});

interface MockRequest extends Request {
	_triggerEvent: (event: string) => void;
}

const createMockRequest = (): jest.Mocked<MockRequest> => {
	const listeners: Record<string, Array<() => void>> = {};

	const mockRequest: MockRequest = {
		on: jest.fn(function (
			this: MockRequest,
			event: string,
			listener: () => void
		) {
			if (!listeners[event]) listeners[event] = [];

			listeners[event].push(listener);

			return this;
		}),
		_triggerEvent: (event: string) => {
			listeners[event]?.forEach((listener) => listener());
		}
	};

	return mockRequest as jest.Mocked<MockRequest>;
};

/**
 * Test subclass to access protected members.
 */
class TestableServer extends Server<Request, Response> {
	public static resetInstance() {
		(this as unknown as { _instance: undefined })._instance = undefined;
	}

	public static createTestInstance() {
		return new this();
	}

	public getConnectionsMap() {
		return this.connections;
	}

	public getMaxConnections() {
		return this.maxConnections;
	}

	public testResolveId(id?: string) {
		return this.resolveId(id);
	}
}

describe('Server', () => {
	beforeEach(() => {
		TestableServer.resetInstance();
		jest.clearAllMocks();
	});

	describe('singleton pattern', () => {
		it('should create instance on first access', () => {
			const instance = TestableServer.instance;

			expect(instance).toBeInstanceOf(Server);
		});

		it('should return the same instance when accessed multiple times', () => {
			const instance1 = TestableServer.instance;
			const instance2 = TestableServer.instance;

			expect(instance1).toBe(instance2);
		});
	});

	describe('resolveId', () => {
		it('should use the id supplied by the application', () => {
			const server = TestableServer.createTestInstance();

			expect(server.testResolveId('user-123')).toBe('user-123');
		});

		it('should trim whitespace from the supplied id', () => {
			const server = TestableServer.createTestInstance();

			expect(server.testResolveId('  user-123  ')).toBe('user-123');
		});

		it('should generate a UUID when the supplied id is empty or whitespace', () => {
			const server = TestableServer.createTestInstance();

			expect(server.testResolveId('   ')).toBe('mock-uuid-1234');
		});

		it('should generate a UUID when no id is supplied', () => {
			const server = TestableServer.createTestInstance();

			expect(server.testResolveId()).toBe('mock-uuid-1234');
		});

		it('should not derive the id from any request input', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest();
			const mockResponse = createMockResponse();

			// A connection created without an explicit id gets a random UUID,
			// never a value taken from the request.
			server.createConnection(mockRequest, mockResponse);

			expect(server.getConnectionsMap().has('mock-uuid-1234')).toBe(true);
		});
	});

	describe('createConnection', () => {
		it('should create a new connection and store it under the supplied id', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest();
			const mockResponse = createMockResponse();

			server.createConnection(
				mockRequest,
				mockResponse,
				'test-connection-id'
			);

			expect(server.getConnectionsMap().size).toBe(1);
			expect(server.getConnectionsMap().has('test-connection-id')).toBe(
				true
			);
		});

		it('should fall back to a generated id when none is supplied', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest();
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);

			expect(server.getConnectionsMap().size).toBe(1);
			expect(server.getConnectionsMap().has('mock-uuid-1234')).toBe(true);
		});

		it('should set SSE headers on the response', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest();
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);

			expect(mockResponse.setHeader).toHaveBeenCalledWith(
				'Content-Type',
				'text/event-stream'
			);
			expect(mockResponse.setHeader).toHaveBeenCalledWith(
				'Cache-Control',
				'no-cache'
			);
			expect(mockResponse.setHeader).toHaveBeenCalledWith(
				'Connection',
				'keep-alive'
			);
		});

		it('should register close event listener on request', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest();
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse, 'close-test-id');

			expect(mockRequest.on).toHaveBeenCalledWith(
				'close',
				expect.any(Function)
			);
		});

		it('should remove connection when request closes', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest();
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse, 'close-test-id');
			expect(server.getConnectionsMap().size).toBe(1);

			// Simulate connection close
			mockRequest._triggerEvent('close');
			expect(server.getConnectionsMap().size).toBe(0);
		});

		it('should allow multiple connections', () => {
			const server = TestableServer.createTestInstance();

			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'conn-1'
			);
			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'conn-2'
			);
			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'conn-3'
			);

			expect(server.getConnectionsMap().size).toBe(3);
		});

		it('should overwrite connection with same id', () => {
			const server = TestableServer.createTestInstance();

			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'same-id'
			);
			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'same-id'
			);

			expect(server.getConnectionsMap().size).toBe(1);
		});
	});

	describe('maxConnections', () => {
		it('should default to a conservative cap when setMaxConnections is not called', () => {
			const server = TestableServer.createTestInstance();

			expect(server.getMaxConnections()).toBe(1_000);
		});

		it('should update the cap when setMaxConnections is called', () => {
			const server = TestableServer.createTestInstance();

			server.setMaxConnections(5);

			expect(server.getMaxConnections()).toBe(5);
		});

		it.each([0, -1, 1.5, NaN, Infinity])(
			'should reject invalid cap value: %s',
			(value) => {
				const server = TestableServer.createTestInstance();

				expect(() => server.setMaxConnections(value)).toThrow(
					RangeError
				);
				expect(server.getMaxConnections()).toBe(1_000);
			}
		);

		it('should refuse new connections once the cap is reached', () => {
			const consoleError = jest
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			const server = TestableServer.createTestInstance();
			server.setMaxConnections(2);

			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'conn-1'
			);
			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'conn-2'
			);

			const refusedResponse = createMockResponse();
			server.createConnection(
				createMockRequest(),
				refusedResponse,
				'conn-3'
			);

			expect(server.getConnectionsMap().size).toBe(2);
			expect(server.getConnectionsMap().has('conn-3')).toBe(false);
			// A refused connection is never wired up as an SSE stream.
			expect(refusedResponse.setHeader).not.toHaveBeenCalled();
			expect(consoleError).toHaveBeenCalledWith(
				'[sse] connection refused: reached maxConnections limit of 2'
			);

			consoleError.mockRestore();
		});

		it('should still accept a reconnection reusing a tracked id at the cap', () => {
			const server = TestableServer.createTestInstance();
			server.setMaxConnections(1);

			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'conn-1'
			);

			const reconnectResponse = createMockResponse();
			server.createConnection(
				createMockRequest(),
				reconnectResponse,
				'conn-1'
			);

			expect(server.getConnectionsMap().size).toBe(1);
			expect(reconnectResponse.setHeader).toHaveBeenCalled();
		});

		it('should free capacity when a connection closes', () => {
			const server = TestableServer.createTestInstance();
			server.setMaxConnections(1);

			const request1 = createMockRequest();
			server.createConnection(request1, createMockResponse(), 'conn-1');
			expect(server.getConnectionsMap().size).toBe(1);

			// Freeing the slot should let a brand-new connection in.
			request1._triggerEvent('close');
			server.createConnection(
				createMockRequest(),
				createMockResponse(),
				'conn-2'
			);

			expect(server.getConnectionsMap().size).toBe(1);
			expect(server.getConnectionsMap().has('conn-2')).toBe(true);
		});
	});

	describe('getConnection', () => {
		it('should return connection by id', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest();
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse, 'get-test-id');
			const connection = server.getConnection('get-test-id');

			expect(connection).toBeDefined();
		});

		it('should return undefined for non-existent connection', () => {
			const server = TestableServer.createTestInstance();

			const connection = server.getConnection('non-existent-id');

			expect(connection).toBeUndefined();
		});
	});

	describe('broadcast', () => {
		const frame = (event: string, dataJson: string) =>
			`id: mock-uuid-1234\nevent: ${event}\ndata: ${dataJson}\n\n`;

		it('should send event to all connections', () => {
			const server = TestableServer.createTestInstance();
			const responses = [
				createMockResponse(),
				createMockResponse(),
				createMockResponse()
			];

			responses.forEach((response, index) => {
				server.createConnection(
					createMockRequest(),
					response,
					`broadcast-conn-${index}`
				);
			});

			server.broadcast('test-event', { message: 'broadcast message' });

			responses.forEach((response) => {
				expect(response.write).toHaveBeenCalledTimes(1);
				expect(response.write).toHaveBeenCalledWith(
					frame('test-event', '{"message":"broadcast message"}')
				);
			});
		});

		it('should format the frame once and reuse it for every connection', () => {
			const server = TestableServer.createTestInstance();
			const responses = [
				createMockResponse(),
				createMockResponse(),
				createMockResponse()
			];

			responses.forEach((response, index) => {
				server.createConnection(
					createMockRequest(),
					response,
					`reuse-conn-${index}`
				);
			});

			mockUuidv4.mockClear();
			server.broadcast('shared', { n: 1 });

			expect(mockUuidv4).toHaveBeenCalledTimes(1);

			const frames = responses.map(
				(response) => response.write.mock.calls[0][0]
			);
			expect(new Set(frames).size).toBe(1);
		});

		it('should work with no connections', () => {
			const server = TestableServer.createTestInstance();

			expect(() => server.broadcast('test-event', {})).not.toThrow();
			mockUuidv4.mockClear();
			server.broadcast('test-event', {});
			expect(mockUuidv4).not.toHaveBeenCalled();
		});

		it('should broadcast without data', () => {
			const server = TestableServer.createTestInstance();
			const mockResponse = createMockResponse();

			server.createConnection(
				createMockRequest(),
				mockResponse,
				'no-data-broadcast'
			);
			server.broadcast('no-data-event');

			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('no-data-event', 'null')
			);
		});

		it('should strip CR/LF from the event name to prevent SSE injection', () => {
			const server = TestableServer.createTestInstance();
			const mockResponse = createMockResponse();

			server.createConnection(
				createMockRequest(),
				mockResponse,
				'inject-broadcast'
			);
			server.broadcast('evil\ndata: forged', { ok: true });

			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('evildata: forged', '{"ok":true}')
			);
		});

		it('should keep delivering to healthy clients when one is saturated', () => {
			const server = TestableServer.createTestInstance();

			const slow = createMockResponse();
			slow.write.mockReturnValue(false);
			const fast = createMockResponse();

			server.createConnection(createMockRequest(), slow, 'slow');
			server.createConnection(createMockRequest(), fast, 'fast');

			server.broadcast('first', { n: 1 });
			server.broadcast('second', { n: 2 });

			expect(slow.write).toHaveBeenCalledTimes(1);
			expect(fast.write).toHaveBeenCalledTimes(2);
		});

		describe('error isolation', () => {
			let consoleError: jest.SpyInstance;

			beforeEach(() => {
				consoleError = jest
					.spyOn(console, 'error')
					.mockImplementation(() => {});
			});

			afterEach(() => {
				consoleError.mockRestore();
			});

			it('should keep delivering to other clients when one write throws', () => {
				const server = TestableServer.createTestInstance();

				const broken = createMockResponse();
				broken.write.mockImplementation(() => {
					throw new Error('socket destroyed');
				});
				const healthy = createMockResponse();

				server.createConnection(createMockRequest(), broken, 'broken');
				server.createConnection(
					createMockRequest(),
					healthy,
					'healthy'
				);

				expect(() => server.broadcast('evt', { n: 1 })).not.toThrow();
				expect(healthy.write).toHaveBeenCalledWith(
					frame('evt', '{"n":1}')
				);
			});

			it('should drop a connection whose write throws', () => {
				const server = TestableServer.createTestInstance();

				const broken = createMockResponse();
				broken.write.mockImplementation(() => {
					throw new Error('socket destroyed');
				});

				server.createConnection(createMockRequest(), broken, 'broken');
				expect(server.getConnectionsMap().size).toBe(1);

				server.broadcast('evt', { n: 1 });

				expect(server.getConnectionsMap().has('broken')).toBe(false);
			});

			it('should log the failure', () => {
				const server = TestableServer.createTestInstance();

				const broken = createMockResponse();
				const failure = new Error('socket destroyed');
				broken.write.mockImplementation(() => {
					throw failure;
				});

				server.createConnection(createMockRequest(), broken, 'broken');
				server.broadcast('evt', { n: 1 });

				expect(consoleError).toHaveBeenCalledWith(
					'[sse] write failed for connection broken:',
					failure
				);
			});
		});

		it('should use generic type parameter for data', () => {
			interface BroadcastPayload {
				type: string;
				count: number;
			}

			const server = TestableServer.createTestInstance();
			const mockResponse = createMockResponse();

			server.createConnection(
				createMockRequest(),
				mockResponse,
				'typed-broadcast'
			);
			server.broadcast<BroadcastPayload>('typed-event', {
				type: 'test',
				count: 5
			});

			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('typed-event', '{"type":"test","count":5}')
			);
		});
	});
});
