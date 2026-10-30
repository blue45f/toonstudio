export function defaultSetTimeout(handler: () => void, delay: number): unknown { return globalThis.setTimeout(handler, delay); }
export function defaultClearTimeout(handle: unknown): void { globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>); }
