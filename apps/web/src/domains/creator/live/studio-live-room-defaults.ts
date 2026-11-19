export function defaultRandomId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("안전한 공동작업 세션 식별자를 만들 수 없습니다.");
  }
  return crypto.randomUUID();
}

export function defaultSetInterval(handler: () => void, delay: number): unknown {
  return globalThis.setInterval(handler, delay);
}

export function defaultClearInterval(handle: unknown): void {
  globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
}

export function defaultSetTimeout(handler: () => void, delay: number): unknown {
  return globalThis.setTimeout(handler, delay);
}

export function defaultClearTimeout(handle: unknown): void {
  globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
}
