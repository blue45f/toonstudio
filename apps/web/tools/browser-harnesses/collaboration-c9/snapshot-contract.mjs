import assert from 'node:assert/strict';

// PG Date를 JSON에 쓰기 전에 정규 ISO로 바꾼다. 원본 객체를 바꾸지 않는다.
export function normalizeSnapshot(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeSnapshot);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeSnapshot(entry)]));
  return value;
}

export function unchangedDb(before, after) {
  const omitTime = (value) => { const copy = { ...value }; delete copy.checkedAt; return copy; };
  assert.deepEqual(omitTime(after), omitTime(before), 'C9 측정 중 원고·aggregate·membership·event·mutation receipt가 바뀌었습니다.');
}
