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

const createMockRequest = (
	headers: Record<string, string> = {}
): jest.Mocked<MockRequest> => {
	const listeners: Record<string, Array<() => void>> = {};

	const mockRequest: MockRequest = {
		headers,
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

	public testGenerateId(req: Request) {
		return this.generateId(req);
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

	describe('generateId', () => {
		it('should use x-request-id header when provided', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({
				'x-request-id': 'custom-request-id'
			});

			const id = server.testGenerateId(mockRequest);

			expect(id).toBe('custom-request-id');
		});

		it('should trim whitespace from x-request-id header', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({
				'x-request-id': '  custom-id-with-spaces  '
			});

			const id = server.testGenerateId(mockRequest);

			expect(id).toBe('custom-id-with-spaces');
		});

		it('should generate UUID when x-request-id header is empty', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({ 'x-request-id': '   ' });

			const id = server.testGenerateId(mockRequest);

			expect(id).toBe('mock-uuid-1234');
		});

		it('should generate UUID when x-request-id header is not present', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({});

			const id = server.testGenerateId(mockRequest);

			expect(id).toBe('mock-uuid-1234');
		});
	});

	describe('createConnection', () => {
		it('should create a new connection and store it', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({
				'x-request-id': 'test-connection-id'
			});
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);

			expect(server.getConnectionsMap().size).toBe(1);
			expect(server.getConnectionsMap().has('test-connection-id')).toBe(
				true
			);
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
			const mockRequest = createMockRequest({
				'x-request-id': 'close-test-id'
			});
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);

			expect(mockRequest.on).toHaveBeenCalledWith(
				'close',
				expect.any(Function)
			);
		});

		it('should remove connection when request closes', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({
				'x-request-id': 'close-test-id'
			});
			const mockResponse = createMockResponse();

			let closeListener: (() => void) | undefined;

			// Capture the close listener
			mockRequest.on.mockImplementation(function (
				this: MockRequest,
				event: string,
				listener: () => void
			) {
				if (event === 'close') {
					closeListener = listener;
				}

				return this;
			});

			server.createConnection(mockRequest, mockResponse);
			expect(server.getConnectionsMap().size).toBe(1);

			// Simulate connection close
			closeListener?.();
			expect(server.getConnectionsMap().size).toBe(0);
		});

		it('should allow multiple connections', () => {
			const server = TestableServer.createTestInstance();

			const mockRequest1 = createMockRequest({
				'x-request-id': 'conn-1'
			});
			const mockRequest2 = createMockRequest({
				'x-request-id': 'conn-2'
			});
			const mockRequest3 = createMockRequest({
				'x-request-id': 'conn-3'
			});

			server.createConnection(mockRequest1, createMockResponse());
			server.createConnection(mockRequest2, createMockResponse());
			server.createConnection(mockRequest3, createMockResponse());

			expect(server.getConnectionsMap().size).toBe(3);
		});

		it('should overwrite connection with same id', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest1 = createMockRequest({
				'x-request-id': 'same-id'
			});
			const mockRequest2 = createMockRequest({
				'x-request-id': 'same-id'
			});
			const mockResponse1 = createMockResponse();
			const mockResponse2 = createMockResponse();

			server.createConnection(mockRequest1, mockResponse1);
			server.createConnection(mockRequest2, mockResponse2);

			expect(server.getConnectionsMap().size).toBe(1);
		});
	});

	describe('getConnection', () => {
		it('should return connection by id', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({
				'x-request-id': 'get-test-id'
			});
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);
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
				const request = createMockRequest({
					'x-request-id': `broadcast-conn-${index}`
				});
				server.createConnection(request, response);
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
				const request = createMockRequest({
					'x-request-id': `reuse-conn-${index}`
				});
				server.createConnection(request, response);
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
			const mockRequest = createMockRequest({
				'x-request-id': 'no-data-broadcast'
			});
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);
			server.broadcast('no-data-event');

			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('no-data-event', 'null')
			);
		});

		it('should strip CR/LF from the event name to prevent SSE injection', () => {
			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({
				'x-request-id': 'inject-broadcast'
			});
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);
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

			server.createConnection(
				createMockRequest({ 'x-request-id': 'slow' }),
				slow
			);
			server.createConnection(
				createMockRequest({ 'x-request-id': 'fast' }),
				fast
			);

			server.broadcast('first', { n: 1 });
			server.broadcast('second', { n: 2 });

			expect(slow.write).toHaveBeenCalledTimes(1);
			expect(fast.write).toHaveBeenCalledTimes(2);
		});

		it('should use generic type parameter for data', () => {
			interface BroadcastPayload {
				type: string;
				count: number;
			}

			const server = TestableServer.createTestInstance();
			const mockRequest = createMockRequest({
				'x-request-id': 'typed-broadcast'
			});
			const mockResponse = createMockResponse();

			server.createConnection(mockRequest, mockResponse);
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
