import { uuidv4 } from './index';

const crypto = jest.requireActual('crypto');

// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
// where y is one of 8, 9, a, or b
const uuidV4Regex =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuidv4', () => {
	it('should generate a valid UUID v4 format', () => {
		const uuid = uuidv4();

		expect(uuid).toMatch(uuidV4Regex);
	});

	it('should return a string of length 36', () => {
		const uuid = uuidv4();

		expect(typeof uuid).toBe('string');
		expect(uuid.length).toBe(36);
	});

	it('should have version 4 indicator at position 14', () => {
		const uuid = uuidv4();

		// The 15th character (index 14) should be '4' indicating version 4
		expect(uuid[14]).toBe('4');
	});

	it('should have valid variant indicator at position 19', () => {
		const uuid = uuidv4();

		// The 20th character (index 19) should be 8, 9, a, or b
		expect(['8', '9', 'a', 'b']).toContain(uuid[19].toLowerCase());
	});

	it('should generate unique UUIDs on each call', () => {
		const uuids = new Set<string>();
		const iterations = 1000;

		for (let i = 0; i < iterations; i++) {
			uuids.add(uuidv4());
		}

		expect(uuids.size).toBe(iterations);
	});
});

describe('uuidv4 fallback generator', () => {
	beforeEach(() => {
		jest.resetModules();
	});

	it('should generate valid UUID v4 format when randomUUID is not available', () => {
		jest.doMock('crypto', () => ({
			randomBytes: crypto.randomBytes
		}));

		const { uuidv4: fallbackUuidv4 } = require('./index');
		const uuid = fallbackUuidv4();

		expect(uuid).toMatch(uuidV4Regex);
	});

	it('should generate unique UUIDs with fallback generator', () => {
		jest.doMock('crypto', () => ({
			randomBytes: crypto.randomBytes
		}));

		const { uuidv4: fallbackUuidv4 } = require('./index');
		const uuids = new Set<string>();
		const iterations = 1000;

		for (let i = 0; i < iterations; i++) {
			uuids.add(fallbackUuidv4());
		}

		expect(uuids.size).toBe(iterations);
	});
});
