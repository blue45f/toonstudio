/**
 * 길이 직접 입력(VCB, Value Control Box)용 단위 파서 — 순수 함수.
 *
 * SketchUp처럼 도구를 쓰는 중에 `2.4m`, `80cm`, `1200mm`, `3'6"` 같은 문자열을 입력하고 Enter로
 * 정확한 길이를 적용한다. 잘못된 입력은 조용히 보정하지 않고 이유(reason)와 한국어 안내(message)를
 * 돌려줘 UI가 그대로 보여줄 수 있게 한다. 허용 문법은 의도적으로 좁다.
 *
 *   입력   := [부호] 항 (공백* 항)*
 *   항     := 숫자 공백* 단위?
 *   숫자   := 정수 | 정수.소수 | .소수          (쉼표·지수·분수·16진수는 거부)
 *   단위   := mm | cm | m | ' | ft | " | in (+ 한글/영문 별칭)
 *
 * 규칙: 미터법과 야드파운드법은 섞을 수 없고, 단위는 큰 것부터 한 번씩만 쓴다. 단위 없는 숫자는
 * 단독일 때 기본 단위, `3'6`처럼 피트 뒤에 오면 인치로 해석한다(그 외 뒤따르는 숫자는 모호해 거부).
 */

import { formatStudioBg3dMeasurementLength } from "./studio-bg3d-measurement";

import type { StudioBg3dMeasurementUnit } from "./studio-bg3d-measurement";

export type StudioBg3dLengthParseFailureReason =
  | "not-text"
  | "empty"
  | "too-long"
  | "invalid-character"
  | "missing-number"
  | "missing-unit"
  | "multiple-decimal-points"
  | "trailing-decimal-point"
  | "decimal-comma"
  | "scientific-notation"
  | "fraction"
  | "unknown-unit"
  | "unit-order"
  | "unit-repeated"
  | "mixed-systems"
  | "ambiguous-trailing-number"
  | "negative-not-allowed"
  | "zero-not-allowed"
  | "too-small"
  | "too-large"
  | "not-finite";

export interface StudioBg3dLengthParseFailure {
  readonly ok: false;
  readonly reason: StudioBg3dLengthParseFailureReason;
  /** 사용자에게 그대로 보여줄 수 있는 한국어 안내. */
  readonly message: string;
}

export interface StudioBg3dLengthParseSuccess {
  readonly ok: true;
  /** 부호가 있는 미터 값. 1e-9m 단위로 반올림해 부동소수점 잡음을 없앤다. */
  readonly meters: number;
  /** 정규화한 표기 — 라이브 영역 안내와 입력창 되돌려 쓰기에 사용한다. */
  readonly normalized: string;
  readonly system: "metric" | "imperial";
  /** 단위 없는 숫자에 기본 단위를 적용했는지 여부. */
  readonly usedDefaultUnit: boolean;
}

export type StudioBg3dLengthParseResult =
  | StudioBg3dLengthParseSuccess
  | StudioBg3dLengthParseFailure;

export interface StudioBg3dLengthParseOptions {
  /** 단위 없는 숫자를 해석할 단위. 기본 `m`. */
  readonly defaultUnit?: StudioBg3dMeasurementUnit;
  /** true면 단위 없는 숫자를 거부한다. */
  readonly requireUnit?: boolean;
  /** 음수 허용(밀기·당기기처럼 방향이 있는 거리). 기본 false. */
  readonly allowNegative?: boolean;
  readonly allowZero?: boolean;
  /** 절댓값 하한(m). 기본 1e-6. */
  readonly minMeters?: number;
  /** 절댓값 상한(m). 기본 20,000. */
  readonly maxMeters?: number;
}

export const STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS = 64;
export const STUDIO_BG3D_LENGTH_INPUT_DEFAULT_MIN_METERS = 1e-6;
export const STUDIO_BG3D_LENGTH_INPUT_DEFAULT_MAX_METERS = 20_000;
export const STUDIO_BG3D_LENGTH_INPUT_EXAMPLES: readonly string[] = Object.freeze([
  "2.4m",
  "80cm",
  "1200mm",
  "3'6\"",
]);

type CanonicalUnit = "m" | "cm" | "mm" | "ft" | "in";

interface UnitInfo {
  readonly system: "metric" | "imperial";
  /** 같은 체계 안에서 큰 단위일수록 작은 순번. */
  readonly rank: number;
  readonly meters: number;
}

const UNIT_INFO: Readonly<Record<CanonicalUnit, UnitInfo>> = Object.freeze({
  m: { system: "metric", rank: 0, meters: 1 },
  cm: { system: "metric", rank: 1, meters: 0.01 },
  mm: { system: "metric", rank: 2, meters: 0.001 },
  ft: { system: "imperial", rank: 0, meters: 0.3048 },
  in: { system: "imperial", rank: 1, meters: 0.0254 },
});

const UNIT_ALIASES: Readonly<Record<string, CanonicalUnit>> = Object.freeze({
  m: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  미터: "m",
  cm: "cm",
  centimeter: "cm",
  centimeters: "cm",
  centimetre: "cm",
  centimetres: "cm",
  센티미터: "cm",
  센티: "cm",
  mm: "mm",
  millimeter: "mm",
  millimeters: "mm",
  millimetre: "mm",
  millimetres: "mm",
  밀리미터: "mm",
  밀리: "mm",
  "'": "ft",
  ft: "ft",
  foot: "ft",
  feet: "ft",
  피트: "ft",
  "\"": "in",
  in: "in",
  inch: "in",
  inches: "in",
  인치: "in",
});

const UNIT_LABEL_KO: Readonly<Record<CanonicalUnit, string>> = Object.freeze({
  m: "m",
  cm: "cm",
  mm: "mm",
  ft: "피트(')",
  in: "인치(\")",
});

function fail(
  reason: StudioBg3dLengthParseFailureReason,
  message: string,
): StudioBg3dLengthParseFailure {
  return Object.freeze({ ok: false, reason, message });
}

function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[′’‘ʹ]/gu, "'")
    .replace(/[″”“ʺ]/gu, "\"")
    .replace(/''/gu, "\"")
    .replace(/[−–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

function trimNumber(value: number): string {
  return String(Math.round(value * 1e9) / 1e9);
}

interface ParsedTerm {
  readonly value: number;
  readonly unit: CanonicalUnit | null;
  readonly text: string;
}

function scan(text: string, startIndex: number): {
  readonly terms: readonly ParsedTerm[];
  readonly failure: StudioBg3dLengthParseFailure | null;
} {
  const terms: ParsedTerm[] = [];
  let index = startIndex;
  const skipSpaces = () => {
    while (index < text.length && text[index] === " ") index += 1;
  };
  skipSpaces();
  while (index < text.length) {
    const rest = text.slice(index);
    if (/^\d+(?:\.\d+)?[eE][+-]?\d/u.test(rest)) {
      return { terms, failure: fail("scientific-notation", "지수 표기(1e3)는 쓸 수 없습니다. 2.4m처럼 숫자와 단위만 입력하세요.") };
    }
    const numberMatch = /^(?:\d+\.\d+|\d+|\.\d+)/u.exec(rest);
    if (!numberMatch) {
      const char = rest[0] ?? "";
      if (char === ",") {
        return { terms, failure: fail("decimal-comma", "쉼표(,)는 쓸 수 없습니다. 소수점은 마침표(.)로 입력하세요. 예: 2.4m") };
      }
      if (char === "/") {
        return { terms, failure: fail("fraction", "분수(1/2)는 지원하지 않습니다. 소수로 입력하세요. 예: 3.5\"") };
      }
      if (char === ".") {
        return { terms, failure: fail("missing-number", "소수점 앞뒤에 숫자를 입력하세요. 예: 0.5m") };
      }
      if (/[a-zA-Z가-힣'"]/u.test(char)) {
        return { terms, failure: fail("missing-number", `단위 '${char}' 앞에 숫자를 입력하세요. 예: 2.4m`) };
      }
      return { terms, failure: fail("invalid-character", `'${char}'은(는) 입력할 수 없는 문자입니다. 숫자와 단위(m, cm, mm, ', ")만 쓸 수 있습니다.`) };
    }
    const numberText = numberMatch[0];
    index += numberText.length;
    if (text[index] === ".") {
      const afterDot = text[index + 1] ?? "";
      return {
        terms,
        failure: /\d/u.test(afterDot)
          ? fail("multiple-decimal-points", "소수점은 숫자 하나에 한 번만 쓸 수 있습니다.")
          : fail("trailing-decimal-point", "소수점 뒤에 숫자가 없습니다. 2.4m처럼 소수점 뒤에도 숫자를 입력하세요."),
      };
    }
    if (text[index] === ",") {
      return { terms, failure: fail("decimal-comma", "쉼표(,)는 쓸 수 없습니다. 소수점은 마침표(.)로 입력하세요. 천 단위 구분 기호도 쓰지 않습니다.") };
    }
    if (text[index] === "/") {
      return { terms, failure: fail("fraction", "분수(1/2)는 지원하지 않습니다. 소수로 입력하세요. 예: 3.5\"") };
    }
    skipSpaces();
    let unit: CanonicalUnit | null = null;
    const unitChar = text[index] ?? "";
    if (unitChar === "'" || unitChar === "\"") {
      unit = UNIT_ALIASES[unitChar] ?? null;
      index += 1;
    } else {
      const unitMatch = /^[a-zA-Z가-힣]+/u.exec(text.slice(index));
      if (unitMatch) {
        const alias = unitMatch[0].toLowerCase();
        const resolved = Object.hasOwn(UNIT_ALIASES, alias) ? UNIT_ALIASES[alias] : undefined;
        if (!resolved) {
          return {
            terms,
            failure: fail("unknown-unit", `'${unitMatch[0]}'은(는) 알 수 없는 단위입니다. mm, cm, m, 피트('), 인치(")를 쓸 수 있습니다.`),
          };
        }
        unit = resolved;
        index += unitMatch[0].length;
      }
    }
    terms.push({ value: Number(numberText), unit, text: numberText });
    skipSpaces();
  }
  return { terms, failure: null };
}

/**
 * 길이 문자열을 미터로 해석한다. 성공/실패를 `ok`로 구분하며 예외를 던지지 않는다.
 */
export function parseStudioBg3dLengthInput(
  raw: unknown,
  options: StudioBg3dLengthParseOptions = {},
): StudioBg3dLengthParseResult {
  if (typeof raw !== "string") {
    return fail("not-text", "길이는 텍스트로 입력해 주세요. 예: 2.4m, 80cm");
  }
  if (raw.length > STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS * 2) {
    return fail("too-long", `입력이 너무 깁니다. ${STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS}자 이내로 입력하세요.`);
  }
  const text = normalizeText(raw);
  if (text.length === 0) {
    return fail("empty", "길이를 입력하세요. 예: 2.4m, 80cm, 1200mm, 3'6\"");
  }
  if (text.length > STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS) {
    return fail("too-long", `입력이 너무 깁니다. ${STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS}자 이내로 입력하세요.`);
  }

  let negative = false;
  let start = 0;
  if (text[0] === "-" || text[0] === "+") {
    negative = text[0] === "-";
    start = 1;
  }
  const scanned = scan(text, start);
  if (scanned.failure) return scanned.failure;
  const terms = scanned.terms;
  if (terms.length === 0) {
    return fail("missing-number", "숫자를 입력하세요. 예: 2.4m");
  }

  const defaultUnit = options.defaultUnit ?? "m";
  let system: "metric" | "imperial" | null = null;
  let lastRank = -1;
  const seen = new Set<CanonicalUnit>();
  let totalMeters = 0;
  let usedDefaultUnit = false;
  let previousUnit: CanonicalUnit | null = null;

  for (let termIndex = 0; termIndex < terms.length; termIndex += 1) {
    const term = terms[termIndex];
    if (!term) continue;
    let unit = term.unit;
    if (unit === null) {
      if (terms.length === 1) {
        if (options.requireUnit) {
          return fail("missing-unit", `단위를 붙여 입력하세요. 예: ${term.text}m, ${term.text}cm`);
        }
        unit = defaultUnit;
        usedDefaultUnit = true;
      } else if (termIndex === terms.length - 1 && previousUnit === "ft") {
        unit = "in";
      } else {
        return fail(
          "ambiguous-trailing-number",
          `'${term.text}'의 단위를 알 수 없습니다. 모든 숫자에 단위를 붙이거나 3'6처럼 피트 뒤에서만 생략하세요.`,
        );
      }
    }
    const info = UNIT_INFO[unit];
    if (system !== null && system !== info.system) {
      return fail("mixed-systems", "미터법(m, cm, mm)과 피트·인치(', \")는 한 번에 섞어 쓸 수 없습니다.");
    }
    system = info.system;
    if (seen.has(unit)) {
      return fail("unit-repeated", `단위 ${UNIT_LABEL_KO[unit]}를 두 번 쓸 수 없습니다.`);
    }
    if (info.rank <= lastRank) {
      return fail("unit-order", "큰 단위부터 순서대로 입력하세요. 예: 1m 20cm, 3'6\"");
    }
    seen.add(unit);
    lastRank = info.rank;
    previousUnit = unit;
    totalMeters += term.value * info.meters;
  }

  if (!Number.isFinite(totalMeters)) {
    return fail("not-finite", "입력한 값이 너무 커서 계산할 수 없습니다.");
  }
  const meters = Math.round(totalMeters * 1e9) / 1e9;
  if (totalMeters > 0 && meters === 0) {
    return fail("too-small", "너무 짧습니다. 0.000001m(0.001mm) 이상으로 입력하세요.");
  }
  const signedMeters = negative ? -meters : meters;
  if (negative && meters !== 0 && !options.allowNegative) {
    return fail("negative-not-allowed", "이 입력에는 음수를 쓸 수 없습니다. 0보다 큰 길이를 입력하세요.");
  }
  if (meters === 0) {
    if (!options.allowZero) {
      return fail("zero-not-allowed", "0은 길이로 쓸 수 없습니다. 0보다 큰 길이를 입력하세요.");
    }
  }
  const minMeters = options.minMeters ?? STUDIO_BG3D_LENGTH_INPUT_DEFAULT_MIN_METERS;
  const maxMeters = options.maxMeters ?? STUDIO_BG3D_LENGTH_INPUT_DEFAULT_MAX_METERS;
  if (meters !== 0 && meters < minMeters) {
    return fail(
      "too-small",
      `너무 짧습니다. ${formatStudioBg3dMeasurementLength(minMeters, "mm", 6) ?? `${minMeters}m`} 이상으로 입력하세요.`,
    );
  }
  if (meters > maxMeters) {
    return fail(
      "too-large",
      `너무 깁니다. ${trimNumber(maxMeters)}m 이하로 입력하세요.`,
    );
  }
  return Object.freeze({
    ok: true,
    meters: Object.is(signedMeters, -0) ? 0 : signedMeters,
    normalized: `${trimNumber(Object.is(signedMeters, -0) ? 0 : signedMeters)} m`,
    system: system ?? "metric",
    usedDefaultUnit,
  });
}

/** 입력창에 되돌려 쓸 문자열 — 문서 표시 단위로 변환하고 불필요한 0을 없앤다. */
export function formatStudioBg3dLengthForInput(
  meters: number,
  unit: StudioBg3dMeasurementUnit,
): string {
  if (!Number.isFinite(meters)) return "";
  const text = formatStudioBg3dMeasurementLength(Math.abs(meters), unit, 4);
  if (!text) return "";
  const compact = text.replace(" ", "");
  return meters < 0 ? `-${compact}` : compact;
}
