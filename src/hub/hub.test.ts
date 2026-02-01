import { Hub } from './hub';
import { Connection } from '../server/connection';

jest.mock('../server', () => ({
	default: {
		broadcast: jest.fn(),
		getConnection: jest.fn()
	},
	__esModule: true
}));

import Server from '../server';

/**
 * Test subclass to access protected members.
 */
class TestableHub extends Hub {
	public static resetInstance() {
		(this as unknown as { _instance: undefined })._instance = undefined;
	}

	public static createTestInstance() {
		return new this();
	}

	public testTrigger<T>(target: string | '*', name: string, data?: T) {
		return this.trigger<T>(target, name, data);
	}
}

describe('Hub', () => {
	const mockBroadcast = Server.broadcast as jest.Mock;
	const mockGetConnection = Server.getConnection as jest.Mock;

	beforeEach(() => {
		TestableHub.resetInstance();
		jest.clearAllMocks();
	});

	describe('singleton pattern', () => {
		it('should create instance on first access', () => {
			const instance = TestableHub.instance;

			expect(instance).toBeInstanceOf(Hub);
		});

		it('should return the same instance when accessed multiple times', () => {
			const instance1 = TestableHub.instance;
			const instance2 = TestableHub.instance;

			expect(instance1).toBe(instance2);
		});
	});

	describe('trigger', () => {
		it('should call Server.broadcast when target is wildcard', () => {
			const hub = TestableHub.createTestInstance();
			const testData = { message: 'broadcast test' };

			hub.testTrigger('*', 'test-event', testData);

			expect(mockBroadcast).toHaveBeenCalledWith('test-event', testData);
			expect(mockGetConnection).not.toHaveBeenCalled();
		});

		it('should call Server.getConnection and send when target is specific id', () => {
			const mockConnection = {
				send: jest.fn()
			} as unknown as Connection<never>;
			mockGetConnection.mockReturnValue(mockConnection);

			const hub = TestableHub.createTestInstance();
			const testData = { message: 'targeted test' };

			hub.testTrigger('specific-id', 'test-event', testData);

			expect(mockGetConnection).toHaveBeenCalledWith('specific-id');
			expect(mockConnection.send).toHaveBeenCalledWith(
				'test-event',
				testData
			);
			expect(mockBroadcast).not.toHaveBeenCalled();
		});

		it('should not throw when connection does not exist', () => {
			mockGetConnection.mockReturnValue(undefined);

			const hub = TestableHub.createTestInstance();

			expect(() =>
				hub.testTrigger('non-existent', 'test-event')
			).not.toThrow();
		});

		it('should handle undefined data', () => {
			const hub = TestableHub.createTestInstance();

			hub.testTrigger('*', 'test-event', undefined);

			expect(mockBroadcast).toHaveBeenCalledWith('test-event', undefined);
		});
	});

	describe('to', () => {
		it('should return an object with emit method', () => {
			const hub = TestableHub.createTestInstance();

			const result = hub.to('target-id');

			expect(result).toHaveProperty('emit');
			expect(typeof result.emit).toBe('function');
		});

		it('should emit to specific connection when called with id', () => {
			const mockConnection = {
				send: jest.fn()
			} as unknown as Connection<never>;
			mockGetConnection.mockReturnValue(mockConnection);

			const hub = TestableHub.createTestInstance();
			const testData = { key: 'value' };

			hub.to('target-id').emit('custom-event', testData);

			expect(mockGetConnection).toHaveBeenCalledWith('target-id');
			expect(mockConnection.send).toHaveBeenCalledWith(
				'custom-event',
				testData
			);
		});

		it('should broadcast when called with wildcard', () => {
			const hub = TestableHub.createTestInstance();
			const testData = { broadcast: true };

			hub.to('*').emit('broadcast-event', testData);

			expect(mockBroadcast).toHaveBeenCalledWith(
				'broadcast-event',
				testData
			);
		});

		it('should support generic type parameter', () => {
			interface CustomPayload {
				id: number;
				data: string;
			}

			const mockConnection = {
				send: jest.fn()
			} as unknown as Connection<never>;
			mockGetConnection.mockReturnValue(mockConnection);

			const hub = TestableHub.createTestInstance();
			const typedPayload: CustomPayload = { id: 123, data: 'typed' };

			hub.to('typed-target').emit<CustomPayload>(
				'typed-event',
				typedPayload
			);

			expect(mockConnection.send).toHaveBeenCalledWith(
				'typed-event',
				typedPayload
			);
		});

		it('should allow chaining multiple to().emit() calls', () => {
			const mockConnection = {
				send: jest.fn()
			} as unknown as Connection<never>;
			mockGetConnection.mockReturnValue(mockConnection);

			const hub = TestableHub.createTestInstance();

			hub.to('conn-1').emit('event-1', { msg: 'first' });
			hub.to('conn-2').emit('event-2', { msg: 'second' });

			expect(mockGetConnection).toHaveBeenCalledTimes(2);
			expect(mockConnection.send).toHaveBeenCalledTimes(2);
		});
	});

	describe('emit', () => {
		it('should broadcast to all connections', () => {
			const hub = TestableHub.createTestInstance();
			const testData = { global: 'message' };

			hub.emit('global-event', testData);

			expect(mockBroadcast).toHaveBeenCalledWith(
				'global-event',
				testData
			);
		});

		it('should work without data', () => {
			const hub = TestableHub.createTestInstance();

			hub.emit('no-data-event');

			expect(mockBroadcast).toHaveBeenCalledWith(
				'no-data-event',
				undefined
			);
		});

		it('should support generic type parameter', () => {
			interface GlobalPayload {
				timestamp: number;
				type: string;
			}

			const hub = TestableHub.createTestInstance();
			const typedPayload: GlobalPayload = {
				timestamp: Date.now(),
				type: 'notification'
			};

			hub.emit<GlobalPayload>('global-typed', typedPayload);

			expect(mockBroadcast).toHaveBeenCalledWith(
				'global-typed',
				typedPayload
			);
		});

		it('should handle null data', () => {
			const hub = TestableHub.createTestInstance();

			hub.emit('null-event', null);

			expect(mockBroadcast).toHaveBeenCalledWith('null-event', null);
		});

		it('should handle various data types', () => {
			const hub = TestableHub.createTestInstance();

			hub.emit('string-event', 'string data');
			expect(mockBroadcast).toHaveBeenLastCalledWith(
				'string-event',
				'string data'
			);

			hub.emit('number-event', 42);
			expect(mockBroadcast).toHaveBeenLastCalledWith('number-event', 42);

			hub.emit('array-event', [1, 2, 3]);
			expect(mockBroadcast).toHaveBeenLastCalledWith(
				'array-event',
				[1, 2, 3]
			);
		});
	});
});
