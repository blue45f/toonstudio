import {
  EDITORIAL_MOODBOARD_PRESET_IDS, PIGMENT_ROLE_IDS, auditChromaticBalance,
  type ChromaticBalanceAuditInput, type ChromaticBalanceAuditReport, type OklchColor,
} from "./editorial-moodboard-engine";

export function requireFiniteMoodboard(values: readonly number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("색상·비율은 유한한 수여야 합니다.");
}

export function requireOpaqueMoodboardColors(...colors: readonly OklchColor[]): void {
  if (colors.some((color) => (color.alpha ?? 1) !== 1)) throw new RangeError("대비 예제는 불투명 안료만 지원합니다. 투명색은 합성 배경 검사가 필요합니다.");
}

export function assertChromaticInput(input?: ChromaticBalanceAuditInput): void {
  if (input?.presetId && !EDITORIAL_MOODBOARD_PRESET_IDS.includes(input.presetId)) throw new RangeError("등록되지 않은 프리셋입니다.");
  const extras = input?.extraSamples ?? [];
  if (extras.length > 256) throw new RangeError("추가 색상 상한은 256개입니다.");
  const ids = new Set<string>([...PIGMENT_ROLE_IDS, "on-accent"]);
  const colors: OklchColor[] = [];
  for (const role of PIGMENT_ROLE_IDS) { const color = input?.pigmentOverrides?.[role]; if (color) colors.push(color); }
  if (input?.onAccentOverride) colors.push(input.onAccentOverride);
  for (const sample of extras) {
    if (!sample.id.trim() || sample.id.length > 256 || ids.has(sample.id) || Object.hasOwn(Object.prototype, sample.id)) throw new RangeError("추가 색상 ID는 고유하며 예약 이름을 사용할 수 없습니다.");
    ids.add(sample.id);
    if (sample.labelKo.length > 4096 || sample.labelEn.length > 4096) throw new RangeError("색상 설명 상한은 4096자입니다.");
    colors.push(sample.color);
  }
  for (const color of colors) {
    requireFiniteMoodboard([color.l, color.c, color.h, color.alpha ?? 1]);
    if (color.l < 0 || color.l > 1 || color.c < 0 || color.c > 0.4 || Math.abs(color.h) > 36000 || (color.alpha ?? 1) < 0 || (color.alpha ?? 1) > 1) throw new RangeError("색상 입력이 예제 범위를 벗어났습니다.");
  }
  requireOpaqueMoodboardColors(...colors);
  requireFiniteMoodboard(Object.values(input?.ratio ?? {}).filter((value) => value !== undefined));
}

function matches(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => matches(actual[index], value));
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object" || Array.isArray(actual)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => matches(Reflect.get(actual, key), Reflect.get(expected, key)));
}

/** 외부 결과를 현재 예제 모델과 대조하며 SVG/CSS 메타데이터를 그대로 신뢰하지 않는다. */
export function assertMoodboardExport(audit: ChromaticBalanceAuditReport): void {
  requireFiniteMoodboard([audit.minWcagRatio, audit.minApcaAbsLc, audit.overallScore]);
  const p = audit.resolvedPigments;
  const model = auditChromaticBalance({ presetId: audit.preset.id, pigmentOverrides: { ground: p.ground.color, surface: p.surface.color, ink: p.ink.color, domain: p.domain.color, accent: p.accent.color }, onAccentOverride: audit.resolvedOnAccent, ratio: audit.ratio.input, extraSamples: audit.extraSamples });
  if (!matches({ ...audit, extraSamples: audit.extraSamples ?? [] }, model)) throw new RangeError("외부 감사 결과가 현재 모델과 일치하지 않습니다.");
}

export function assertPosterText(text: string): string {
  if (text.length > 4096) throw new RangeError("포스터 원문 상한은 4096자입니다.");
  return text;
}
