/**
 * @file legacy-layer-name-decoder.ts
 * @description 구버전 PSD/CLIP 한글·일본어 레이어명 깨짐(mojibake) 자동 복구를 위한
 * UTF-8 → CP949(EUC-KR + UHC 확장 한글 8,822자) → Shift-JIS 순차 판별 디코더.
 */

import { stripTrailingNuls } from "./format-common";

export type LegacyLayerEncoding =
  | "utf-8"
  | "cp949"
  | "shift-jis"
  | "utf-16be"
  | "utf-16le"
  | "fallback-utf8";

export interface LegacyEncodingCandidateScores {
  readonly cp949: number | null;
  readonly shiftJis: number | null;
}

export interface DecodedLegacyLayerName {
  readonly text: string;
  readonly detectedEncoding: LegacyLayerEncoding;
  /** UTF-8 외 레거시 인코딩(CP949·Shift-JIS 등)에서 복구되었으면 true. */
  readonly wasRecovered: boolean;
  /** 0~1 범위의 판별 신뢰도. */
  readonly confidence: number;
  /** 입력 바이트가 깨진 레거시 문자열이었거나 치환 문자(U+FFFD)가 발생했는지 여부. */
  readonly mojibakeDetected: boolean;
  readonly candidateScores: LegacyEncodingCandidateScores;
}

export interface DecodeLegacyLayerNameOptions {
  /** CP949와 Shift-JIS 점수가 동률일 때 우선할 레거시 인코딩. 기본값은 `cp949`. */
  readonly preferredLegacyEncoding?: "cp949" | "shift-jis";
  /** true면 C0 제어 문자(탭·개행 외)가 섞인 바이트도 거부하지 않는다. 기본값 false. */
  readonly preserveControlChars?: boolean;
}

const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true });
const UTF8_LENIENT = new TextDecoder("utf-8", { fatal: false });
const EUC_KR_STRICT = new TextDecoder("euc-kr", { fatal: true });
const SHIFT_JIS_STRICT = new TextDecoder("shift_jis", { fatal: true });
const UTF16_BE_STRICT = new TextDecoder("utf-16be", { fatal: true });
const UTF16_LE_STRICT = new TextDecoder("utf-16le", { fatal: true });

/** Windows-1252 `0x80..0x9F` 코드포인트 → 원본 단일 바이트 역매핑 표. */
const WINDOWS_1252_REVERSE_MAP = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

let cachedUhcHangulTable: readonly string[] | null = null;

/**
 * Node ICU의 `TextDecoder("euc-kr")`가 지원하지 않는 CP949 UHC 확장 한글 8,822자를
 * KS X 1001 2,350자 차집합의 유니코드 코드포인트 순 정렬 성질로 결정론 생성한다.
 */
function getUhcHangulTable(): readonly string[] {
  if (cachedUhcHangulTable !== null) return cachedUhcHangulTable;
  const ksxHangul = new Set<number>();
  const pair = new Uint8Array(2);
  for (let lead = 0xb0; lead <= 0xc8; lead += 1) {
    pair[0] = lead;
    for (let trail = 0xa1; trail <= 0xfe; trail += 1) {
      pair[1] = trail;
      try {
        const decoded = EUC_KR_STRICT.decode(pair);
        if (decoded.length === 1) {
          const codePoint = decoded.charCodeAt(0);
          if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
            ksxHangul.add(codePoint);
          }
        }
      } catch {
        // 미배당 KS X 1001 슬롯은 건너뛴다.
      }
    }
  }
  const table: string[] = [];
  for (let codePoint = 0xac00; codePoint <= 0xd7a3; codePoint += 1) {
    if (!ksxHangul.has(codePoint)) {
      table.push(String.fromCharCode(codePoint));
    }
  }
  cachedUhcHangulTable = table;
  return table;
}

function lookupUhcIndex(lead: number, trail: number): number {
  if (lead >= 0x81 && lead <= 0xa0) {
    let column = -1;
    if (trail >= 0x41 && trail <= 0x5a) column = trail - 0x41;
    else if (trail >= 0x61 && trail <= 0x7a) column = 26 + (trail - 0x61);
    else if (trail >= 0x81 && trail <= 0xfe) column = 52 + (trail - 0x81);
    return column < 0 ? -1 : (lead - 0x81) * 178 + column;
  }
  if (lead >= 0xa1 && lead <= 0xc6) {
    let column = -1;
    if (trail >= 0x41 && trail <= 0x5a) column = trail - 0x41;
    else if (trail >= 0x61 && trail <= 0x7a) column = 26 + (trail - 0x61);
    else if (trail >= 0x81 && trail <= 0xa0) column = 52 + (trail - 0x81);
    return column < 0 ? -1 : 32 * 178 + (lead - 0xa1) * 84 + column;
  }
  return -1;
}

function isDisallowedControlCode(codePoint: number): boolean {
  if (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d) {
    return true;
  }
  return codePoint >= 0x7f && codePoint <= 0x9f;
}

function hasDisallowedControlChars(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (isDisallowedControlCode(code)) return true;
  }
  return false;
}

function trimTrailingZeroBytes(bytes: Uint8Array): Uint8Array {
  let end = bytes.byteLength;
  while (end > 0 && bytes[end - 1] === 0) {
    end -= 1;
  }
  return end === bytes.byteLength ? bytes : bytes.subarray(0, end);
}

interface Cp949DecodeCandidate {
  readonly text: string;
  readonly ksxHangulCount: number;
  readonly uhcHangulCount: number;
}

function decodeStrictCp949(
  bytes: Uint8Array,
  preserveControlChars: boolean,
): Cp949DecodeCandidate | null {
  const uhcTable = getUhcHangulTable();
  let output = "";
  let ksxHangulCount = 0;
  let uhcHangulCount = 0;

  for (let cursor = 0; cursor < bytes.byteLength;) {
    const lead = bytes[cursor]!;
    if (lead < 0x80) {
      if (!preserveControlChars && isDisallowedControlCode(lead)) {
        return null;
      }
      output += String.fromCharCode(lead);
      cursor += 1;
      continue;
    }
    if (cursor + 1 >= bytes.byteLength) {
      return null;
    }
    const trail = bytes[cursor + 1]!;
    if (lead >= 0xa1 && lead <= 0xfe && trail >= 0xa1 && trail <= 0xfe) {
      try {
        const ch = EUC_KR_STRICT.decode(bytes.subarray(cursor, cursor + 2));
        if (ch.length !== 1) return null;
        output += ch;
        const codePoint = ch.charCodeAt(0);
        if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
          ksxHangulCount += 1;
        }
        cursor += 2;
        continue;
      } catch {
        return null;
      }
    }

    const uhcIndex = lookupUhcIndex(lead, trail);
    if (uhcIndex < 0 || uhcIndex >= uhcTable.length) {
      return null;
    }
    output += uhcTable[uhcIndex]!;
    uhcHangulCount += 1;
    cursor += 2;
  }

  return { text: output, ksxHangulCount, uhcHangulCount };
}

function decodeStrictShiftJis(
  bytes: Uint8Array,
  preserveControlChars: boolean,
): string | null {
  try {
    const decoded = SHIFT_JIS_STRICT.decode(bytes);
    if (!preserveControlChars && hasDisallowedControlChars(decoded)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function scoreCp949Candidate(candidate: Cp949DecodeCandidate): number {
  let score =
    candidate.ksxHangulCount * 4.5
    + candidate.uhcHangulCount * (candidate.ksxHangulCount > 0 ? 1.5 : 0.4);
  for (const ch of candidate.text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x3131 && cp <= 0x318e) score += 2.0; // 한글 호환 자모
    else if (cp >= 0x4e00 && cp <= 0x9fff) score += 1.5; // 한자
    else if (cp >= 0x3000 && cp <= 0x303f) score += 1.0; // CJK 기호
    else if (cp >= 0xff01 && cp <= 0xff5e) score += 0.5; // 전각 ASCII
  }
  return score;
}

function scoreShiftJisCandidate(text: string): number {
  let score = 0;
  let fullWidthKanaCount = 0;
  let halfWidthKanaCount = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x3040 && cp <= 0x309f) || (cp >= 0x30a0 && cp <= 0x30ff)) {
      score += 5.0;
      fullWidthKanaCount += 1;
    } else if (cp >= 0x4e00 && cp <= 0x9fff) {
      score += 3.0;
    } else if (cp >= 0xff61 && cp <= 0xff9f) {
      halfWidthKanaCount += 1;
    } else if (cp >= 0x3000 && cp <= 0x303f) {
      score += 1.5;
    } else if (cp >= 0xff01 && cp <= 0xff5e) {
      score += 0.5;
    }
  }
  // 한국어 EUC-KR(0xB0..0xC8 0xA1..0xFE)이 Shift-JIS 반각 가타카나(ﾀﾎｹｰ)로 오인되는 현상을 방지한다.
  score += fullWidthKanaCount > 0 ? halfWidthKanaCount * 0.5 : halfWidthKanaCount * -2.5;
  return score;
}

/**
 * 원시 바이트 배열을 `UTF-8 → CP949(EUC-KR) → Shift-JIS` 순차 판별 파이프라인으로 복구한다.
 * - BOM(`UTF-8`/`UTF-16BE`/`UTF-16LE`)과 순수 ASCII를 우선 처리한다.
 * - CP949와 Shift-JIS가 동시에 유효한 바이트열이면 스크립트 자연도(KS X 1001 한글 vs 히라가나·가타카나·한자 vs 반각 가타카나 오탐)로 판별한다.
 */
export function decodeLegacyLayerNameBytes(
  rawBytes: Uint8Array,
  options: DecodeLegacyLayerNameOptions = {},
): DecodedLegacyLayerName {
  const preserveControlChars = options.preserveControlChars ?? false;
  const preferredLegacy = options.preferredLegacyEncoding ?? "cp949";

  // BOM 우선 감지 (UTF-16은 끝 NUL 바이트를 자르기 전에 확인해야 한다)
  if (rawBytes.byteLength >= 3 && rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf) {
    const trimmed = trimTrailingZeroBytes(rawBytes.subarray(3));
    try {
      const text = stripTrailingNuls(UTF8_STRICT.decode(trimmed));
      return {
        text,
        detectedEncoding: "utf-8",
        wasRecovered: false,
        confidence: 1,
        mojibakeDetected: false,
        candidateScores: { cp949: null, shiftJis: null },
      };
    } catch {
      // 잘못된 BOM 본문은 일반 파이프라인으로 내려보낸다.
    }
  }

  if (rawBytes.byteLength >= 2 && rawBytes[0] === 0xfe && rawBytes[1] === 0xff && rawBytes.byteLength % 2 === 0) {
    try {
      const text = stripTrailingNuls(UTF16_BE_STRICT.decode(rawBytes.subarray(2)));
      return {
        text,
        detectedEncoding: "utf-16be",
        wasRecovered: true,
        confidence: 0.99,
        mojibakeDetected: false,
        candidateScores: { cp949: null, shiftJis: null },
      };
    } catch {
      // fall through
    }
  }

  if (rawBytes.byteLength >= 2 && rawBytes[0] === 0xff && rawBytes[1] === 0xfe && rawBytes.byteLength % 2 === 0) {
    try {
      const text = stripTrailingNuls(UTF16_LE_STRICT.decode(rawBytes.subarray(2)));
      return {
        text,
        detectedEncoding: "utf-16le",
        wasRecovered: true,
        confidence: 0.99,
        mojibakeDetected: false,
        candidateScores: { cp949: null, shiftJis: null },
      };
    } catch {
      // fall through
    }
  }

  const bytes = trimTrailingZeroBytes(rawBytes);
  if (bytes.byteLength === 0) {
    return {
      text: "",
      detectedEncoding: "utf-8",
      wasRecovered: false,
      confidence: 1,
      mojibakeDetected: false,
      candidateScores: { cp949: null, shiftJis: null },
    };
  }

  // 1단계: 엄격 UTF-8 (순수 ASCII 포함)
  try {
    const utf8Text = stripTrailingNuls(UTF8_STRICT.decode(bytes));
    if (preserveControlChars || !hasDisallowedControlChars(utf8Text)) {
      return {
        text: utf8Text,
        detectedEncoding: "utf-8",
        wasRecovered: false,
        confidence: 1,
        mojibakeDetected: false,
        candidateScores: { cp949: null, shiftJis: null },
      };
    }
  } catch {
    // UTF-8 실패 → 2·3단계 레거시 인코딩 판별로 진행
  }

  // 2단계: CP949(EUC-KR + UHC) / 3단계: Shift-JIS
  const cp949Candidate = decodeStrictCp949(bytes, preserveControlChars);
  const shiftJisText = decodeStrictShiftJis(bytes, preserveControlChars);

  const cp949Score = cp949Candidate !== null ? scoreCp949Candidate(cp949Candidate) : null;
  const shiftJisScore = shiftJisText !== null ? scoreShiftJisCandidate(shiftJisText) : null;
  const candidateScores: LegacyEncodingCandidateScores = {
    cp949: cp949Score,
    shiftJis: shiftJisScore,
  };

  if (cp949Candidate !== null && shiftJisText === null) {
    return {
      text: stripTrailingNuls(cp949Candidate.text),
      detectedEncoding: "cp949",
      wasRecovered: true,
      confidence: cp949Score !== null && cp949Score > 0 ? 0.96 : 0.8,
      mojibakeDetected: true,
      candidateScores,
    };
  }

  if (cp949Candidate === null && shiftJisText !== null) {
    return {
      text: stripTrailingNuls(shiftJisText),
      detectedEncoding: "shift-jis",
      wasRecovered: true,
      confidence: shiftJisScore !== null && shiftJisScore > 0 ? 0.96 : 0.8,
      mojibakeDetected: true,
      candidateScores,
    };
  }

  if (cp949Candidate !== null && shiftJisText !== null && cp949Score !== null && shiftJisScore !== null) {
    const preferCp949 =
      cp949Score > shiftJisScore
      || (cp949Score === shiftJisScore && preferredLegacy === "cp949");
    const delta = Math.abs(cp949Score - shiftJisScore);
    const confidence = Math.min(0.98, Number((0.75 + Math.min(delta, 10) * 0.023).toFixed(3)));
    if (preferCp949) {
      return {
        text: stripTrailingNuls(cp949Candidate.text),
        detectedEncoding: "cp949",
        wasRecovered: true,
        confidence,
        mojibakeDetected: true,
        candidateScores,
      };
    }
    return {
      text: stripTrailingNuls(shiftJisText),
      detectedEncoding: "shift-jis",
      wasRecovered: true,
      confidence,
      mojibakeDetected: true,
      candidateScores,
    };
  }

  const fallbackText = stripTrailingNuls(UTF8_LENIENT.decode(bytes));
  return {
    text: fallbackText,
    detectedEncoding: "fallback-utf8",
    wasRecovered: false,
    confidence: 0.25,
    mojibakeDetected: fallbackText.includes("\ufffd"),
    candidateScores,
  };
}

/**
 * 이미 Latin-1 / Windows-1252로 잘못 디코드되어 깨진 레이어명 문자열
 * (예: `"ÀÎ¹°_¼±È­"`, `"ƒŒƒCƒ„[1"`)을 원본 바이트로 환원한 뒤 CP949/Shift-JIS로 복구한다.
 * 이미 정상적인 한글·일본어·이모지·ASCII 문자열은 건드리지 않는다.
 */
export function recoverGarbledLayerName(
  text: string,
  options: DecodeLegacyLayerNameOptions = {},
): DecodedLegacyLayerName {
  if (text.length === 0) {
    return {
      text: "",
      detectedEncoding: "utf-8",
      wasRecovered: false,
      confidence: 1,
      mojibakeDetected: false,
      candidateScores: { cp949: null, shiftJis: null },
    };
  }

  let hasHighByte = false;
  let win1252ControlByteCount = 0;
  let consecutiveHighBytePairs = 0;
  let prevWasHighByte = false;
  const rawBytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 0xff) {
      if (code >= 0x80) {
        hasHighByte = true;
        if (code <= 0x9f) win1252ControlByteCount += 1;
        if (prevWasHighByte) consecutiveHighBytePairs += 1;
        prevWasHighByte = true;
      } else {
        prevWasHighByte = false;
      }
      rawBytes[index] = code;
      continue;
    }
    const win1252Byte = WINDOWS_1252_REVERSE_MAP.get(code);
    if (win1252Byte !== undefined) {
      hasHighByte = true;
      win1252ControlByteCount += 1;
      if (prevWasHighByte) consecutiveHighBytePairs += 1;
      prevWasHighByte = true;
      rawBytes[index] = win1252Byte;
      continue;
    }
    // 이미 정상 유니코드(한글·일본어 등)가 들어 있으면 재해석하지 않는다.
    return {
      text: stripTrailingNuls(text),
      detectedEncoding: "utf-8",
      wasRecovered: false,
      confidence: 1,
      mojibakeDetected: text.includes("\ufffd"),
      candidateScores: { cp949: null, shiftJis: null },
    };
  }

  // `0x80..0x9F` 제어 바이트나 연속 상위 바이트 쌍 없이 단독 Latin-1 악센트 문자(`Café`, `Crème`)만 있으면 원문을 보존한다.
  if (!hasHighByte || (win1252ControlByteCount === 0 && consecutiveHighBytePairs === 0)) {
    return {
      text: stripTrailingNuls(text),
      detectedEncoding: "utf-8",
      wasRecovered: false,
      confidence: 1,
      mojibakeDetected: false,
      candidateScores: { cp949: null, shiftJis: null },
    };
  }

  const decoded = decodeLegacyLayerNameBytes(rawBytes, options);
  if (decoded.detectedEncoding === "fallback-utf8") {
    // 유럽 악센트 라틴 문자열(`Café` 등)은 깨진 문자로 취급하지 않고 원문을 유지한다.
    return {
      text: stripTrailingNuls(text),
      detectedEncoding: "utf-8",
      wasRecovered: false,
      confidence: 0.7,
      mojibakeDetected: false,
      candidateScores: decoded.candidateScores,
    };
  }

  // 라틴-1로 잘못 풀렸던 UTF-8 바이트열(`ì\x9d\xb8ë¬¼` → `인물`)도 복구로 기록한다.
  return {
    ...decoded,
    wasRecovered: decoded.text !== stripTrailingNuls(text),
    mojibakeDetected: decoded.text !== stripTrailingNuls(text),
  };
}

/**
 * PSD 레이어 레코드의 `luni`(UTF-16BE 유니코드 이름)와 구버전 Pascal 문자열 바이트를 결합해
 * 가장 신뢰도 높은 레이어명을 복구한다.
 */
export function decodePsdPascalLayerName(
  pascalBytes: Uint8Array,
  unicodeName?: string | null,
  options: DecodeLegacyLayerNameOptions = {},
): DecodedLegacyLayerName {
  if (unicodeName !== undefined && unicodeName !== null) {
    const cleanedUnicode = stripTrailingNuls(unicodeName);
    if (cleanedUnicode.length > 0 && !cleanedUnicode.includes("\ufffd")) {
      return {
        text: cleanedUnicode,
        detectedEncoding: "utf-8",
        wasRecovered: false,
        confidence: 1,
        mojibakeDetected: false,
        candidateScores: { cp949: null, shiftJis: null },
      };
    }
  }
  return decodeLegacyLayerNameBytes(pascalBytes, options);
}
