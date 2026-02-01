describe('Main index module', () => {
	it('should be importable without errors', async () => {
		const importFn = async () => await import('./index');

		await expect(importFn()).resolves.toBeDefined();
	});
});
