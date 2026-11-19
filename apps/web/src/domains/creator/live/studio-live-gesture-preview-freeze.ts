/** 공유 프리뷰 값의 중첩 객체를 기존 순서대로 동결한다. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const child = value[index];
      if (child !== null && typeof child === "object") deepFreeze(child);
    }
    return Object.freeze(value);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child !== null && typeof child === "object") deepFreeze(child);
  }
  return Object.freeze(value);
}
