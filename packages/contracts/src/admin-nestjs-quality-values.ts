/** 작업 진행 상태와 테스트·빌드 결과는 서로 다른 기록이다. */
export const STATUSES = ["미확인", "진행 중", "검토 필요", "승인 대기", "검증 완료", "main 머지 완료"] as const;
export const NEST_BOARD_REPOSITORY = "blue45f/toonstudio" as const;
export const NEST_BOARD_MAX_JSON_BYTES = 2_000_000;

const FUTURE_TOLERANCE_MS = 300_000;
const MAX_JSON_DEPTH = 20;
const MAX_JSON_NODES = 50_000;
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function assertJsonText(value: string): void {
  // Unicode 모드에서는 정상 surrogate pair를 유지하고 짝이 없는 코드 단위만 찾는다.
  if (value.includes("\u0000") || /[\uD800-\uDFFF]/u.test(value)) {
    throw new Error("보드 JSON 문자열의 NUL 또는 잘못된 유니코드 문자를 제거하세요.");
  }
}

/** 파싱 전에 크기·깊이·프로토타입을 제한해 브라우저와 API에서 같은 입력 경계를 지킨다. */
export function boundedJson(value: unknown): unknown {
  let input = value;
  if (typeof input === "string") {
    if (input.length > NEST_BOARD_MAX_JSON_BYTES || new TextEncoder().encode(input).length > NEST_BOARD_MAX_JSON_BYTES) {
      throw new Error("보드 JSON은 최대 2MB까지 허용합니다.");
    }
    try { input = JSON.parse(input) as unknown; }
    catch { throw new Error("보드 JSON 형식이 올바르지 않습니다."); }
  }
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    nodes += 1;
    if (depth > MAX_JSON_DEPTH || nodes > MAX_JSON_NODES) throw new Error("보드 JSON의 깊이 또는 항목 수가 너무 큽니다.");
    if (item === null || typeof item === "boolean") return;
    if (typeof item === "string") {
      if (item.length > NEST_BOARD_MAX_JSON_BYTES) throw new Error("보드 JSON 문자열이 너무 깁니다.");
      assertJsonText(item);
      return;
    }
    if (typeof item === "number" && Number.isFinite(item)) return;
    if (!item || typeof item !== "object") throw new Error("보드에는 유효한 JSON 값만 저장할 수 있습니다.");
    if (ancestors.has(item)) throw new Error("순환 참조가 있는 보드는 허용하지 않습니다.");
    if (Array.isArray(item) && (item.length > MAX_JSON_NODES || Object.keys(item).length !== item.length)) {
      throw new Error("보드 JSON 배열에 빈 항목이나 허용 범위를 넘는 항목이 있습니다.");
    }
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new Error("보드에는 일반 JSON 객체만 저장할 수 있습니다.");
    }
    ancestors.add(item);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === "length") continue;
      assertJsonText(key);
      if (Array.isArray(item) && (!/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= item.length)) {
        throw new Error("보드 JSON 배열에 허용하지 않는 속성이 있습니다.");
      }
      if (RESERVED_KEYS.has(key) || !("value" in descriptor)) throw new Error("보드 JSON에 허용하지 않는 속성이 있습니다.");
      visit(descriptor.value, depth + 1);
    }
    if (Object.getOwnPropertySymbols(item).length) throw new Error("보드 JSON에 허용하지 않는 속성이 있습니다.");
    ancestors.delete(item);
  };
  visit(input, 0);
  const encoded = JSON.stringify(input);
  if (new TextEncoder().encode(encoded).length > NEST_BOARD_MAX_JSON_BYTES) throw new Error("보드 JSON은 최대 2MB까지 허용합니다.");
  return input;
}

export function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field}: 객체가 필요합니다.`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, field: string, max = 12_000, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new Error(`${field}: 올바른 길이의 문자열이 필요합니다.`);
  }
  return value;
}
export function identifier(value: unknown, field: string): string {
  const id = text(value, field, 120, true);
  if (!/^[a-z0-9][a-z0-9._:-]*$/iu.test(id)) throw new Error(`${field}: 올바른 식별자가 필요합니다.`);
  return id;
}
export function integer(value: unknown, field: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${field}: 유효한 정수가 필요합니다.`);
  return value;
}
export function flag(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field}: 참 또는 거짓 값이 필요합니다.`);
  return value;
}
export function list(value: unknown, field: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${field}: 최대 ${max}개 배열이 필요합니다.`);
  return value;
}
export function unique<T>(items: T[], key: (item: T) => string | number, field: string): T[] {
  if (new Set(items.map(key)).size !== items.length) throw new Error(`${field}: 중복 식별자가 있습니다.`);
  return items;
}
export function url(value: unknown, field: string, optional = false): string {
  const result = text(value, field, 4096, !optional);
  if (optional && !result) return result;
  let parsed: URL;
  try { parsed = new URL(result); } catch { throw new Error(`${field}: 유효한 HTTP(S) 링크가 필요합니다.`); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${field}: 인증 정보가 없는 HTTP(S) 링크가 필요합니다.`);
  }
  return result;
}
export function commit(value: unknown, field: string, full = false): string {
  const result = text(value, field, 40, full);
  if (!full && (!result || result === "미확인")) return result;
  if (!(full ? /^[a-f0-9]{40}$/iu : /^[a-f0-9]{7,40}$/iu).test(result)) throw new Error(`${field}: 올바른 커밋 SHA가 필요합니다.`);
  return result;
}
export function date(value: unknown, field: string, now: number, optional = false, display = false): string {
  const result = text(value, field, 64, !optional);
  if (optional && (!result || result === "미확인")) return result;
  const kst = display ? /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(:\d{2})? KST$/u.exec(result) : null;
  const normalized = kst ? `${kst[1]}T${kst[2]}${kst[3] ?? ":00"}+09:00` : result;
  const matched = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2}))?$/u.exec(normalized);
  if (!matched) throw new Error(`${field}: 시간대가 있는 ISO 시각 또는 날짜가 필요합니다.`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = matched;
  const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > days
    || Number(hourText ?? 0) > 23 || Number(minuteText ?? 0) > 59 || Number(secondText ?? 0) > 59) {
    throw new Error(`${field}: 실제 달력에 있는 날짜가 필요합니다.`);
  }
  const parsed = Date.parse(normalized);
  // 날짜만 입력한 검증일은 사용자 화면의 한국 날짜를 기준으로 비교한다.
  const current = hourText === undefined ? now + 9 * 60 * 60 * 1000 : now;
  if (!Number.isFinite(now) || !Number.isFinite(parsed) || parsed > current + FUTURE_TOLERANCE_MS) {
    throw new Error(`${field}: 미래 검증 시각은 허용하지 않습니다.`);
  }
  return result;
}
export function evidence(value: string): boolean {
  return Boolean(value.trim()) && !/^(?:미확인|미검증|미실행|실행 증거 없음|unknown|not verified|n\/a)(?:\s|[·:.-]|$)/iu.test(value.trim());
}
