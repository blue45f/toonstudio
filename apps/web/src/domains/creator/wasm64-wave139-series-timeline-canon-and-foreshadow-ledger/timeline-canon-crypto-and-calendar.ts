/**
 * Wave 139 — 그레고리력 윤년·만 나이·반구별 계절 정합성 계산 및 순수 ES2017 동기 FIPS 180-4 SHA-256.
 *
 * - 브라우저/Node 시간대 오차를 완전히 배제하기 위해 정수 그레고리력 연산만 사용한다.
 * - BigInt 리터럴(`0n`) 및 정규식 `/s` 플래그 없이 strict ES2017 호환으로 동작한다.
 */

import type {
  CharacterCanonSpec,
  DepictedSeason,
  WorldHemisphere,
} from "./timeline-canon-types";

export interface ParsedWorldDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly iso: string;
  readonly epochDay: number;
}

export interface BirthDateParts {
  readonly birthYear: number;
  readonly birthMonth: number;
  readonly birthDay: number;
}

export type SeasonMismatchKind =
  | "match"
  | "opposite-season"
  | "peak-month-season-mismatch"
  | "adjacent-season-mismatch";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const SEASON_RING: readonly DepictedSeason[] = ["spring", "summer", "autumn", "winter"];

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * 그레고리력 윤년 여부를 판정한다(4년 윤년, 100년 평년, 400년 윤년).
 */
export function isGregorianLeapYear(year: number): boolean {
  if (!Number.isInteger(year)) return false;
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 지정 연·월의 실제 일수를 반환한다. 잘못된 월이면 0을 돌려준다.
 */
export function daysInGregorianMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return 0;
  }
  if (month === 2) {
    return isGregorianLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

/**
 * 유효한 그레고리력 날짜(연·월·일)인지 검증한다.
 */
export function isValidCivilDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1 || year > 9999 || month < 1 || month > 12) {
    return false;
  }
  const maxDay = daysInGregorianMonth(year, month);
  return day >= 1 && day <= maxDay;
}

/**
 * 프로렙틱 그레고리력 연·월·일을 1970-01-01 기준 정수 일수(epoch day)로 변환한다.
 */
export function civilDateToEpochDay(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = month > 2 ? month - 3 : month + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * 연·월·일을 `YYYY-MM-DD` 문자열로 직렬화한다.
 */
export function formatCivilDateIso(year: number, month: number, day: number): string {
  const y = String(Math.trunc(year)).padStart(4, "0");
  const m = String(Math.trunc(month)).padStart(2, "0");
  const d = String(Math.trunc(day)).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * `YYYY-MM-DD` 문자열을 엄격히 파싱해 윤년·월말 유효성까지 검증한다.
 */
export function parseWorldDateIso(worldDateIso: string): ParsedWorldDate | null {
  const match = ISO_DATE_PATTERN.exec(worldDateIso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCivilDate(year, month, day)) {
    return null;
  }
  return {
    year,
    month,
    day,
    iso: worldDateIso,
    epochDay: civilDateToEpochDay(year, month, day),
  };
}

/**
 * 캐릭터 생년월일과 세계관 기준 날짜(`YYYY-MM-DD`)로 정밀 만 나이(정수 연수)를 계산한다.
 *
 * - 생일 전날까지는 `yearDiff - 1`, 생일 당일부터 `yearDiff`를 반환한다.
 * - 2월 29일 윤일 출생자는 평년 2월 28일까지 생일 전, 3월 1일부터 만 나이가 1세 오른다.
 * - 유효하지 않은 날짜나 생년월일이 들어오면 명시적으로 오류를 던진다(fail-closed).
 */
export function computeExactAgeYears(
  birth: BirthDateParts | CharacterCanonSpec,
  worldDateIso: string,
): number {
  if (!isValidCivilDate(birth.birthYear, birth.birthMonth, birth.birthDay)) {
    throw new Error(
      `유효하지 않은 출생일입니다: ${formatCivilDateIso(birth.birthYear, birth.birthMonth, birth.birthDay)}`,
    );
  }
  const target = parseWorldDateIso(worldDateIso);
  if (!target) {
    throw new Error(`유효하지 않은 세계관 날짜 형식입니다: ${worldDateIso}`);
  }
  const rawYears = target.year - birth.birthYear;
  const hasReachedBirthday =
    target.month > birth.birthMonth ||
    (target.month === birth.birthMonth && target.day >= birth.birthDay);
  return hasReachedBirthday ? rawYears : rawYears - 1;
}

/**
 * 북/남반구 기준 기상학적 월별 정본 계절을 산출한다.
 *
 * - 북반구: 3~5월 봄, 6~8월 여름, 9~11월 가을, 12·1·2월 겨울
 * - 남반구: 3~5월 가을, 6~8월 겨울, 9~11월 봄, 12·1·2월 여름
 */
export function inferExpectedSeasonForMonth(
  month: number,
  hemisphere: WorldHemisphere = "north",
): DepictedSeason {
  let northSeason: DepictedSeason;
  if (month >= 3 && month <= 5) {
    northSeason = "spring";
  } else if (month >= 6 && month <= 8) {
    northSeason = "summer";
  } else if (month >= 9 && month <= 11) {
    northSeason = "autumn";
  } else {
    northSeason = "winter";
  }
  if (hemisphere === "north") {
    return northSeason;
  }
  const idx = SEASON_RING.indexOf(northSeason);
  return SEASON_RING[(idx + 2) % 4];
}

/**
 * 한 계절의 정중앙 핵심 월(1·4·7·10월) 여부를 반환한다.
 */
export function isCorePeakSeasonMonth(month: number): boolean {
  return month === 1 || month === 4 || month === 7 || month === 10;
}

/**
 * 월·반구와 작화 묘사 계절의 정합성을 분류한다.
 */
export function classifySeasonCalendarCompatibility(
  month: number,
  hemisphere: WorldHemisphere,
  depictedSeason: DepictedSeason,
): { readonly expectedSeason: DepictedSeason; readonly kind: SeasonMismatchKind } {
  const expectedSeason = inferExpectedSeasonForMonth(month, hemisphere);
  if (expectedSeason === depictedSeason) {
    return { expectedSeason, kind: "match" };
  }
  const expectedIdx = SEASON_RING.indexOf(expectedSeason);
  const depictedIdx = SEASON_RING.indexOf(depictedSeason);
  const cyclicDistance = Math.min(
    Math.abs(expectedIdx - depictedIdx),
    4 - Math.abs(expectedIdx - depictedIdx),
  );
  if (cyclicDistance === 2) {
    return { expectedSeason, kind: "opposite-season" };
  }
  if (isCorePeakSeasonMonth(month)) {
    return { expectedSeason, kind: "peak-month-season-mismatch" };
  }
  return { expectedSeason, kind: "adjacent-season-mismatch" };
}

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/**
 * 순수 ES2017 동기 FIPS 180-4 SHA-256 64자리 소문자 16진수 해시를 계산한다.
 */
export function sha256CanonLedgerHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/**
 * 객체 키를 사전순으로 정규화하여 결정론적 JSON 문자열을 생성한다.
 */
export function canonicalizeCanonLedgerJson(value: unknown): string {
  if (value === null) return "null";
  const valueType = typeof value;
  if (valueType === "boolean") return value ? "true" : "false";
  if (valueType === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    return Object.is(num, -0) ? "0" : JSON.stringify(num);
  }
  if (valueType === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const serialized = value.map((item) =>
      item === undefined ? "null" : canonicalizeCanonLedgerJson(item),
    );
    return `[${serialized.join(",")}]`;
  }
  if (valueType === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (record[key] !== undefined) {
        parts.push(`${JSON.stringify(key)}:${canonicalizeCanonLedgerJson(record[key])}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}
