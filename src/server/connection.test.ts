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
		const frame = (event: string, dataJson: string) =>
			`id: mock-uuid-1234\nevent: ${event}\ndata: ${dataJson}\n\n`;

		it('should write SSE formatted message with event and data in a single write', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');
			const testData = { message: 'Hello, World!' };

			connection.send('test-event', testData);

			expect(mockResponse.write).toHaveBeenCalledTimes(1);
			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('test-event', JSON.stringify(testData))
			);
		});

		it('should send null as data when data is not provided', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('test-event');

			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('test-event', 'null')
			);
		});

		it('should send null as data when data is undefined', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('test-event', undefined);

			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('test-event', 'null')
			);
		});

		it('should handle primitive data types', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('string-event', 'simple string');
			expect(mockResponse.write).toHaveBeenLastCalledWith(
				frame('string-event', '"simple string"')
			);

			connection.send('number-event', 42);
			expect(mockResponse.write).toHaveBeenLastCalledWith(
				frame('number-event', '42')
			);

			connection.send('boolean-event', true);
			expect(mockResponse.write).toHaveBeenLastCalledWith(
				frame('boolean-event', 'true')
			);
		});

		it('should handle array data', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');
			const arrayData = [1, 2, 3, 'test'];

			connection.send('array-event', arrayData);

			expect(mockResponse.write).toHaveBeenLastCalledWith(
				frame('array-event', JSON.stringify(arrayData))
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
				frame('nested-event', JSON.stringify(nestedData))
			);
		});

		it('should handle null data explicitly', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('null-event', null);

			expect(mockResponse.write).toHaveBeenLastCalledWith(
				frame('null-event', 'null')
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
				frame('typed-event', JSON.stringify(typedData))
			);
		});

		it('should strip CR/LF from the event name to prevent SSE injection', () => {
			const connection = new TestableConnection(mockResponse, 'test-id');

			connection.send('evil\ndata: forged\nevent: hijack', {
				ok: true
			});

			expect(mockResponse.write).toHaveBeenCalledWith(
				frame('evildata: forgedevent: hijack', '{"ok":true}')
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
