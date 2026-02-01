import { randomUUID, randomBytes } from 'crypto';

function getAvailableUUIDGenerator() {
	if (typeof randomUUID === 'function') {
		return randomUUID;
	}

	return () =>
		'10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: string) =>
			(
				Number(c) ^
				(randomBytes(1)[0] & (15 >> (Number(c) / 4)))
			).toString(16)
		);
}

export const uuidv4 = getAvailableUUIDGenerator();
