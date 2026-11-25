import type { PanelBeatInput, PanelRhythmTemplateId, ScrollRhythmAnalysis, WebtoonPlatformPresetId } from "./panel-rhythm-engine";

export const MAX_RHYTHM_PANELS = 128;
export const WEBTOON_PLATFORM_IDS: readonly WebtoonPlatformPresetId[] = ["naver-800", "kakao-690", "global-1080"];
export const PANEL_RHYTHM_TEMPLATE_IDS: readonly PanelRhythmTemplateId[] = [
  "action-3beat-impact", "romance-silence-longscroll", "thriller-blackout-reveal", "slice-4cut-comedy",
  "flashback-sepia-overlap", "cliffhanger-ending-drop", "dialogue-zigzag-banter", "panorama-wide-breather",
];

export function requireFinite(values: readonly number[]): void {
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError("리듬 계산 입력은 유한한 수여야 합니다.");
}

export function requireChoice(value: string, choices: readonly string[]): void {
  if (!choices.includes(value)) throw new RangeError("등록되지 않은 리듬 예제 모드입니다.");
}

/** 원문은 바꾸지 않고 분석과 보정에 동일한 범위·식별자 계약을 적용한다. */
export function normalizePanelInputs(panels: readonly PanelBeatInput[]): readonly PanelBeatInput[] {
  if (panels.length > MAX_RHYTHM_PANELS) throw new RangeError(`리듬 예제는 최대 ${MAX_RHYTHM_PANELS}컷입니다.`);
  const ids = new Set<string>();
  return panels.map((panel, index) => {
    requireFinite([panel.heightPx, panel.gutterAfterPx, panel.dialogueCharCount]);
    requireChoice(panel.role, ["establishing", "dialogue", "closeup", "action", "silence", "reveal", "cliffhanger", "panorama"]);
    requireChoice(panel.shape, ["standard", "wide-bleed", "slanted", "floating", "vertical-long", "blackout-transition"]);
    requireChoice(panel.visualDensity, ["low", "medium", "high"]);
    if ([panel.id, panel.labelKo, panel.labelEn].some((value) => typeof value !== "string" || value.length > 4096)) throw new RangeError("컷 ID와 설명은 4096자 이하 문자열이어야 합니다.");
    const id = panel.id || `panel-${index + 1}`;
    if (ids.has(id)) throw new RangeError("컷 ID는 고유해야 합니다.");
    ids.add(id);
    return {
      ...panel, id,
      heightPx: Math.round(Math.min(3200, Math.max(180, panel.heightPx))),
      gutterAfterPx: Math.round(Math.min(1400, Math.max(0, panel.gutterAfterPx))),
      dialogueCharCount: Math.round(Math.min(400, Math.max(0, panel.dialogueCharCount))),
    };
  });
}

function matchesModel(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => matchesModel(actual[index], value));
  }
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object" || Array.isArray(actual)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => matchesModel(Reflect.get(actual, key), Reflect.get(expected, key)));
}

/** 외부 분석은 같은 입력을 현재 모델에서 재계산한 값과 일치할 때만 내보낸다. */
export function assertExportAnalysis(analysis: ScrollRhythmAnalysis, model: ScrollRhythmAnalysis): void {
  const platform = analysis.platform;
  requireFinite([platform.widthPx, platform.recommendedGutterMinPx, platform.recommendedGutterMaxPx, ...Object.values(analysis.summary)]);
  if (platform.widthPx < 320 || platform.widthPx > 2400 || platform.recommendedGutterMinPx < 0 ||
    platform.recommendedGutterMaxPx > 1400 || platform.recommendedGutterMinPx > platform.recommendedGutterMaxPx) {
    throw new RangeError("분석의 플랫폼 수치가 예제 범위를 벗어났습니다.");
  }
  if (!matchesModel(analysis, model)) throw new RangeError("외부 분석이 현재 모델의 정규 좌표·요약·메타데이터와 일치하지 않습니다.");
}
