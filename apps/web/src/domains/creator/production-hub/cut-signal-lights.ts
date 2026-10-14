/**
 * 미완성 컷 신호등 — 순수 판정 모델 (REPORT A-2).
 *
 * 마감 전날 사람이 컷을 전수 확인하는 비용을 줄이기 위해, 기계적으로 판정 가능한
 * 신호(빈 레이어·스케치 레이어 가시·톤 누락·레이어 자체 없음)를 컷 단위로 집계한다.
 * 이것은 "미완성 판정"이 아니라 작가가 정한 규칙의 신호등이다 — 규칙은 작가가
 * 개별적으로 끌 수 있고(settings), 재료가 없으면 판정하지 않는다(지어내지 않음).
 *
 * 입력은 구조적(structural) 레이어 메타다. 에디터 레이어 모델
 * (StudioLayerLikeItem: id·visible·opacity·blendMode·groupId, 요소의 sketch·screentone
 * 플래그)에서 어댑터가 채우는 최소 필드만 받으므로, 이 모듈은 에디터 본체(호스트)에
 * 의존하지 않는다. 회차 QC 체크리스트(production-episode-qc)와 같은 층에서
 * "QC(사람 검수) 이전의 기계 자가 점검"으로 합류한다.
 */
import type { BilingualLabel } from "./production-labels";

export type CutSignalRuleId = "no-layers" | "empty-layer" | "sketch-visible" | "tone-missing";

/** block=빨강(컷이 비어 있는 수준) · warn=노랑(확인 필요) */
export type CutSignalSeverity = "block" | "warn";

/** red=block 신호 있음 · yellow=warn만 있음 · green=평가된 규칙 전부 통과 · none=평가 불가(재료 없음·전 규칙 꺼짐) */
export type CutSignalLight = "red" | "yellow" | "green" | "none";

export interface CutSignalRule {
  readonly id: CutSignalRuleId;
  readonly label: BilingualLabel;
  readonly description: BilingualLabel;
  readonly severity: CutSignalSeverity;
}

export const CUT_SIGNAL_RULES: readonly CutSignalRule[] = Object.freeze([
  {
    id: "no-layers",
    label: { ko: "레이어 없음", en: "No layers" },
    description: {
      ko: "컷에 레이어가 하나도 없으면 빨간불을 켭니다.",
      en: "Lights red when a cut has no layers at all.",
    },
    severity: "block",
  },
  {
    id: "empty-layer",
    label: { ko: "빈 레이어", en: "Empty layer" },
    description: {
      ko: "그린 요소가 하나도 없는 레이어가 남아 있으면 신호를 켭니다.",
      en: "Flags layers that contain no drawn elements.",
    },
    severity: "warn",
  },
  {
    id: "sketch-visible",
    label: { ko: "스케치 레이어 보임", en: "Sketch layer visible" },
    description: {
      ko: "스케치(밑그림) 레이어가 보이는 상태로 남아 있으면 신호를 켭니다.",
      en: "Flags sketch (rough) layers left visible.",
    },
    severity: "warn",
  },
  {
    id: "tone-missing",
    label: { ko: "톤 누락", en: "Tone missing" },
    description: {
      ko: "채색 단계에 들어갔는데 톤 레이어가 없으면 신호를 켭니다.",
      en: "Flags cuts in the coloring stage that have no tone layer.",
    },
    severity: "warn",
  },
]);

const RULE_BY_ID: Readonly<Record<CutSignalRuleId, CutSignalRule>> = Object.freeze(
  Object.fromEntries(CUT_SIGNAL_RULES.map((rule) => [rule.id, rule])) as Record<CutSignalRuleId, CutSignalRule>,
);

export function cutSignalRule(ruleId: CutSignalRuleId): CutSignalRule {
  return RULE_BY_ID[ruleId];
}

/** 에디터 레이어 메타에서 어댑터가 채우는 최소 구조. 모르는 값은 undefined로 두면 그 규칙은 평가하지 않는다. */
export interface CutSignalLayerMeta {
  readonly id: string;
  readonly name?: string;
  /** 레이어 역할. 에디터가 역할을 모르면 undefined — 스케치·톤 규칙은 이름이 아니라 이 값으로만 판정한다. */
  readonly role?: "sketch" | "line" | "color" | "tone" | "effect" | "other";
  readonly visible: boolean;
  /** 그려진 요소·획 수. 0이면 빈 레이어. 모르면 undefined(빈 레이어 규칙 보류). */
  readonly contentCount?: number;
  /** 스크린톤(망점)이 적용된 레이어인지 — 톤 레이어 판정의 보조 재료. */
  readonly hasTone?: boolean;
}

export interface CutSignalCutInput {
  readonly cutId: string;
  /** 회차 맵에 표시할 컷 이름(예: "12컷"). 어댑터가 제공한다. */
  readonly label: string;
  readonly layers: readonly CutSignalLayerMeta[];
  /** 채색 단계 진입 여부. 모르면 undefined — 톤 누락 규칙은 평가하지 않는다. */
  readonly coloringStarted?: boolean;
}

/** 작가가 끈 규칙 목록만 들고 있는 설정. 켜짐이 기본값이라 저장에는 꺼진 것만 남는다. */
export interface CutSignalSettings {
  readonly disabledRuleIds: readonly CutSignalRuleId[];
}

export const DEFAULT_CUT_SIGNAL_SETTINGS: CutSignalSettings = Object.freeze({ disabledRuleIds: Object.freeze([]) });

export const CUT_SIGNAL_SETTINGS_STORAGE_KEY = "toonstudio.cut-signal-lights.settings.v1";

export function isCutSignalRuleEnabled(settings: CutSignalSettings, ruleId: CutSignalRuleId): boolean {
  return !settings.disabledRuleIds.includes(ruleId);
}

/** 규칙 켜기/끄기 — 입력을 바꾸지 않고 새 설정을 돌려준다. CUT_SIGNAL_RULES 순서를 유지한다. */
export function toggleCutSignalRule(
  settings: CutSignalSettings,
  ruleId: CutSignalRuleId,
  enabled: boolean,
): CutSignalSettings {
  const disabled = new Set(settings.disabledRuleIds);
  if (enabled) disabled.delete(ruleId);
  else disabled.add(ruleId);
  return { disabledRuleIds: CUT_SIGNAL_RULES.map((rule) => rule.id).filter((id) => disabled.has(id)) };
}

export function serializeCutSignalSettings(settings: CutSignalSettings): string {
  return JSON.stringify({ disabledRuleIds: [...settings.disabledRuleIds] });
}

/** 저장값을 방어적으로 읽는다. 깨진 값·모르는 규칙 id는 버리고 기본 설정으로 떨어진다. */
export function parseCutSignalSettings(raw: string | null): CutSignalSettings {
  if (!raw) return DEFAULT_CUT_SIGNAL_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_CUT_SIGNAL_SETTINGS;
    const list = (parsed as { disabledRuleIds?: unknown }).disabledRuleIds;
    if (!Array.isArray(list)) return DEFAULT_CUT_SIGNAL_SETTINGS;
    const known = new Set<string>(CUT_SIGNAL_RULES.map((rule) => rule.id));
    const disabledRuleIds = CUT_SIGNAL_RULES.map((rule) => rule.id).filter(
      (id) => list.includes(id) && known.has(id),
    );
    return { disabledRuleIds };
  } catch {
    return DEFAULT_CUT_SIGNAL_SETTINGS;
  }
}

export interface CutSignal {
  readonly ruleId: CutSignalRuleId;
  readonly severity: CutSignalSeverity;
  readonly detail: BilingualLabel;
}

export interface CutSignalResult {
  readonly cutId: string;
  readonly label: string;
  readonly light: CutSignalLight;
  readonly signals: readonly CutSignal[];
  /** 실제로 판정한 규칙(재료가 있어 평가한 규칙). 꺼진 규칙·재료 없는 규칙은 들어가지 않는다. */
  readonly evaluatedRuleIds: readonly CutSignalRuleId[];
}

function layerDisplayName(layer: CutSignalLayerMeta): string {
  return layer.name ?? layer.id;
}

function joinNames(names: readonly string[]): BilingualLabel {
  // 이름은 언어 공통 표기라 ko/en에 같은 결합을 쓴다.
  const joined = names.join(" · ");
  return { ko: joined, en: joined };
}

/**
 * 컷 하나를 판정한다. 규칙별 평가 조건:
 * - no-layers: 항상 평가 가능. layers가 비면 block 신호.
 * - empty-layer: contentCount를 아는 레이어가 하나라도 있을 때만 평가.
 * - sketch-visible: role을 아는 레이어가 하나라도 있을 때만 평가.
 * - tone-missing: coloringStarted를 알 때만 평가. 톤 재료는 role==="tone" 또는 hasTone===true.
 * 신호가 없고 평가한 규칙이 하나라도 있으면 green, 평가한 규칙이 없으면 none.
 */
export function evaluateCutSignals(
  cut: CutSignalCutInput,
  settings: CutSignalSettings = DEFAULT_CUT_SIGNAL_SETTINGS,
): CutSignalResult {
  const signals: CutSignal[] = [];
  const evaluatedRuleIds: CutSignalRuleId[] = [];
  const enabled = (ruleId: CutSignalRuleId) => isCutSignalRuleEnabled(settings, ruleId);

  if (enabled("no-layers")) {
    evaluatedRuleIds.push("no-layers");
    if (cut.layers.length === 0) {
      signals.push({
        ruleId: "no-layers",
        severity: "block",
        detail: { ko: "레이어가 하나도 없는 컷입니다.", en: "This cut has no layers at all." },
      });
    }
  }

  if (enabled("empty-layer")) {
    const known = cut.layers.filter((layer) => typeof layer.contentCount === "number");
    if (known.length > 0) {
      evaluatedRuleIds.push("empty-layer");
      const empty = known.filter((layer) => layer.contentCount === 0);
      if (empty.length > 0) {
        const names = joinNames(empty.map(layerDisplayName));
        signals.push({
          ruleId: "empty-layer",
          severity: "warn",
          detail: {
            ko: `빈 레이어 ${empty.length}개: ${names.ko}`,
            en: `${empty.length} empty layer(s): ${names.en}`,
          },
        });
      }
    }
  }

  if (enabled("sketch-visible")) {
    const known = cut.layers.filter((layer) => layer.role !== undefined);
    if (known.length > 0) {
      evaluatedRuleIds.push("sketch-visible");
      const visibleSketches = known.filter((layer) => layer.role === "sketch" && layer.visible);
      if (visibleSketches.length > 0) {
        const names = joinNames(visibleSketches.map(layerDisplayName));
        signals.push({
          ruleId: "sketch-visible",
          severity: "warn",
          detail: {
            ko: `스케치 레이어가 보입니다: ${names.ko}`,
            en: `Sketch layer still visible: ${names.en}`,
          },
        });
      }
    }
  }

  if (enabled("tone-missing") && typeof cut.coloringStarted === "boolean") {
    evaluatedRuleIds.push("tone-missing");
    const hasToneLayer = cut.layers.some((layer) => layer.role === "tone" || layer.hasTone === true);
    if (cut.coloringStarted && !hasToneLayer) {
      signals.push({
        ruleId: "tone-missing",
        severity: "warn",
        detail: {
          ko: "채색 단계인데 톤 레이어가 없습니다.",
          en: "Coloring has started but there is no tone layer.",
        },
      });
    }
  }

  const light: CutSignalLight = signals.some((signal) => signal.severity === "block")
    ? "red"
    : signals.length > 0
      ? "yellow"
      : evaluatedRuleIds.length > 0
        ? "green"
        : "none";

  return { cutId: cut.cutId, label: cut.label, light, signals, evaluatedRuleIds };
}

export interface EpisodeCutSignalSummary {
  readonly results: readonly CutSignalResult[];
  readonly totalCuts: number;
  readonly redCount: number;
  readonly yellowCount: number;
  readonly greenCount: number;
  /** 평가 재료가 없어 신호등을 켜지 못한 컷 수. "통과"로 세지 않는다. */
  readonly unevaluatedCount: number;
  /** 규칙별 신호가 켜진 컷 수. */
  readonly signalCountByRule: Readonly<Record<CutSignalRuleId, number>>;
}

/** 회차 맵 한 회차 분의 컷들을 한 번에 판정·집계한다. 입력 순서를 그대로 유지한다. */
export function summarizeCutSignals(
  cuts: readonly CutSignalCutInput[],
  settings: CutSignalSettings = DEFAULT_CUT_SIGNAL_SETTINGS,
): EpisodeCutSignalSummary {
  const results = cuts.map((cut) => evaluateCutSignals(cut, settings));
  const signalCountByRule = Object.fromEntries(
    CUT_SIGNAL_RULES.map((rule) => [rule.id, 0]),
  ) as Record<CutSignalRuleId, number>;
  for (const result of results) {
    for (const signal of result.signals) signalCountByRule[signal.ruleId] += 1;
  }
  return {
    results,
    totalCuts: results.length,
    redCount: results.filter((result) => result.light === "red").length,
    yellowCount: results.filter((result) => result.light === "yellow").length,
    greenCount: results.filter((result) => result.light === "green").length,
    unevaluatedCount: results.filter((result) => result.light === "none").length,
    signalCountByRule,
  };
}
