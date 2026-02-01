import { Connection } from './connection';
import { Response } from './types';

jest.mock('../random', () => ({
	uuidv4: jest.fn(() => 'mock-uuid-1234')
}));

const createMockResponse = (): jest.Mocked<Response> => ({
	setHeader: jest.fn(),
	write: jest.fn()
});

/**
 * Test subclass to access protected members.
 */
class TestableConnection extends Connection<Response> {
	public getId() {
		return this.id;
	}

	public getChannel() {
		return this.channel;
	}
}

describe('Connection', () => {
	let mockResponse: jest.Mocked<Response>;

	beforeEach(() => {
		mockResponse = createMockResponse();
		jest.clearAllMocks();
	});

	describe('constructor', () => {
		it('should set SSE headers on initialization', () => {
			new TestableConnection(mockResponse, 'test-id');

			expect(mockResponse.setHeader).toHaveBeenCalledTimes(3);
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

		it('should accept an optional id parameter', () => {
			const connection = new TestableConnection(
				mockResponse,
				'custom-id'
			);

			expect(connection).toBeInstanceOf(Connection);
		});

		it('should accept empty string as id', () => {
			const connection = new TestableConnection(mockResponse, '');

			expect(connection).toBeInstanceOf(Connection);
		});

		it('should use empty string as default id when not provided', () => {
			const connection = new TestableConnection(mockResponse);

			expect(connection).toBeInstanceOf(Connection);
		});
	});

	describe('send', () => {
		it('should write SSE formatted message with event and data', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');
			const testData = { message: 'Hello, World!' };

			connection.send('test-event', testData);

			expect(mockResponse.write).toHaveBeenCalledTimes(3);
			expect(mockResponse.write).toHaveBeenNthCalledWith(
				1,
				'id: mock-uuid-1234\n'
			);
			expect(mockResponse.write).toHaveBeenNthCalledWith(
				2,
				'event: test-event\n'
			);
			expect(mockResponse.write).toHaveBeenNthCalledWith(
				3,
				`data: ${JSON.stringify(testData)}\n\n`
			);
		});

		it('should send null as data when data is not provided', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('test-event');

			expect(mockResponse.write).toHaveBeenNthCalledWith(
				3,
				'data: null\n\n'
			);
		});

		it('should send null as data when data is undefined', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('test-event', undefined);

			expect(mockResponse.write).toHaveBeenNthCalledWith(
				3,
				'data: null\n\n'
			);
		});

		it('should handle primitive data types', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('string-event', 'simple string');
			expect(mockResponse.write).toHaveBeenLastCalledWith(
				'data: "simple string"\n\n'
			);

			jest.clearAllMocks();
			connection.send('number-event', 42);
			expect(mockResponse.write).toHaveBeenLastCalledWith('data: 42\n\n');

			jest.clearAllMocks();
			connection.send('boolean-event', true);
			expect(mockResponse.write).toHaveBeenLastCalledWith(
				'data: true\n\n'
			);
		});

		it('should handle array data', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');
			const arrayData = [1, 2, 3, 'test'];

			connection.send('array-event', arrayData);

			expect(mockResponse.write).toHaveBeenLastCalledWith(
				`data: ${JSON.stringify(arrayData)}\n\n`
			);
		});

		it('should handle nested object data', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');
			const nestedData = {
				level1: {
					level2: {
						value: 'deep'
					}
				}
			};

			connection.send('nested-event', nestedData);

			expect(mockResponse.write).toHaveBeenLastCalledWith(
				`data: ${JSON.stringify(nestedData)}\n\n`
			);
		});

		it('should handle null data explicitly', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('null-event', null);

			expect(mockResponse.write).toHaveBeenLastCalledWith(
				'data: null\n\n'
			);
		});

		it('should be callable with generic type parameter', () => {
			interface CustomEvent {
				id: number;
				name: string;
			}

			const connection = new TestableConnection(mockResponse, 'test-id');
			const typedData: CustomEvent = { id: 1, name: 'Test' };

			connection.send<CustomEvent>('typed-event', typedData);

			expect(mockResponse.write).toHaveBeenLastCalledWith(
				`data: ${JSON.stringify(typedData)}\n\n`
			);
		});
	});

	describe('protected members', () => {
		it('should expose id through protected getter', () => {
			const connection = new TestableConnection(
				mockResponse,
				'test-id-123'
			);

			expect(connection.getId()).toBe('test-id-123');
		});

		it('should expose channel through protected getter', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			expect(connection.getChannel()).toBe(mockResponse);
		});
	});
});
