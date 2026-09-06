/**
 * Lives apart from store.ts so feature modules can throw it without importing
 * the store, which would create a cycle.
 */
export class StoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
