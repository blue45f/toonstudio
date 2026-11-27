/**
 * Wave 50: 한국어 자연어 음성 디렉팅 및 스타일러스 버튼·제스처 매크로 결정론적 컴파일러.
 *
 * - `"노을 역광 깔아줘"`, `"3번 컷 대사 10% 키우고 흰 점 메워줘"`,
 *   `"어시스턴트 밑색 레이어만 비교해줘"`, `"선화 삐침 정리해줘"` 같은 음성 명령과
 *   스타일러스 사이드 버튼·제스처 조합을 단일 원자 실행 계획(`DynamicMacroPlan`)으로 컴파일한다.
 */

import type { CanvasLayerRole } from "./context-reactive-tool-orchestrator";

export type MacroPlanSource = "voice" | "pen_button" | "hybrid";
export type AtmospherePresetKind = "sunset" | "dawn" | "night" | "studio_daylight";
export type LayerOwnerFilter = "all" | "lead" | "assistant";
export type StylusButtonId = "primary_side" | "secondary_side" | "eraser_tail";
export type StylusButtonGesture =
  | "single_click"
  | "double_click"
  | "hold_drag_up"
  | "hold_drag_down"
  | "hold_drag_left"
  | "hold_drag_right"
  | "hold_tap_canvas";

export interface OklchToneVector {
  readonly lightness: number;
  readonly chroma: number;
  readonly hueDeg: number;
}

interface MacroStepHeader {
  readonly stepId: string;
  readonly order: number;
  readonly labelKo: string;
  readonly reversible: true;
  readonly estimatedCostMs: number;
}

export type DynamicMacroStep =
  | (MacroStepHeader & {
      readonly opcode: "apply_atmosphere_grade";
      readonly params: { readonly cutNumbers: readonly number[]; readonly preset: AtmospherePresetKind; readonly kelvin: number; readonly keyToneOklch: OklchToneVector; readonly opacity: number };
    })
  | (MacroStepHeader & {
      readonly opcode: "apply_rim_backlight";
      readonly params: { readonly cutNumbers: readonly number[]; readonly preset: AtmospherePresetKind; readonly azimuthDeg: number; readonly elevationDeg: number; readonly intensity: number };
    })
  | (MacroStepHeader & {
      readonly opcode: "scale_dialogue_text";
      readonly params: { readonly cutNumbers: readonly number[]; readonly scaleDeltaPercent: number; readonly scaleFactor: number };
    })
  | (MacroStepHeader & {
      readonly opcode: "fill_white_specs";
      readonly params: { readonly cutNumbers: readonly number[]; readonly maxSpecRadiusPx: number; readonly gapClosingEnabled: boolean };
    })
  | (MacroStepHeader & {
      readonly opcode: "compare_filtered_layers";
      readonly params: { readonly ownerFilter: LayerOwnerFilter; readonly layerRole: CanvasLayerRole | "all"; readonly isolateOnly: boolean; readonly comparisonMode: "split_diff" | "toggle_blink" };
    })
  | (MacroStepHeader & {
      readonly opcode: "trim_lineart_overshoots";
      readonly params: { readonly cutNumbers: readonly number[]; readonly layerRole: "lineart"; readonly tolerancePx: number };
    })
  | (MacroStepHeader & {
      readonly opcode: "adjust_brush_radius";
      readonly params: { readonly cutNumbers: readonly number[]; readonly deltaPx: number };
    })
  | (MacroStepHeader & {
      readonly opcode: "draft_quick_balloon";
      readonly params: { readonly cutNumbers: readonly number[]; readonly labelTag: string };
    });

export interface VoiceMacroCompileInput {
  readonly utteranceKo: string;
  readonly activeCutNumber?: number;
  readonly activeLayerRole?: CanvasLayerRole;
}

export interface PenButtonMacroCompileInput {
  readonly button: StylusButtonId;
  readonly gesture: StylusButtonGesture;
  readonly layerRole: CanvasLayerRole;
  readonly activeCutNumber?: number;
  readonly dragDistancePx?: number;
}

export interface HybridMacroCompileInput {
  readonly voice?: VoiceMacroCompileInput;
  readonly penButton?: PenButtonMacroCompileInput;
}

export interface DynamicMacroPlan {
  readonly planId: string;
  readonly source: MacroPlanSource;
  readonly rawCommand: string;
  readonly normalizedCommand: string;
  readonly summaryKo: string;
  readonly atomicGroupLabelKo: string;
  readonly targetCutNumbers: readonly number[];
  readonly steps: readonly DynamicMacroStep[];
  readonly unmatchedFragments: readonly string[];
  readonly warningsKo: readonly string[];
  readonly isExecutable: boolean;
}

interface AtmospherePresetSpec {
  readonly labelKo: string;
  readonly kelvin: number;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly keyToneOklch: OklchToneVector;
}

const ATMOSPHERE_PRESETS: Readonly<Record<AtmospherePresetKind, AtmospherePresetSpec>> = {
  sunset: { labelKo: "노을", kelvin: 3200, azimuthDeg: 215, elevationDeg: 18, keyToneOklch: { lightness: 0.72, chroma: 0.16, hueDeg: 44 } },
  dawn: { labelKo: "새벽", kelvin: 4400, azimuthDeg: 65, elevationDeg: 15, keyToneOklch: { lightness: 0.76, chroma: 0.09, hueDeg: 28 } },
  night: { labelKo: "야간", kelvin: 7800, azimuthDeg: 150, elevationDeg: 32, keyToneOklch: { lightness: 0.36, chroma: 0.08, hueDeg: 252 } },
  studio_daylight: { labelKo: "주광", kelvin: 5600, azimuthDeg: 120, elevationDeg: 42, keyToneOklch: { lightness: 0.88, chroma: 0.03, hueDeg: 85 } },
};

function computeDeterministicPlanId(signature: string): string {
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i += 1) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `macro-plan-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeKoreanCommand(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ").replace(/[.!?]+$/gu, "");
}

function extractTargetCutNumbers(text: string, fallbackCutNumber: number): readonly number[] {
  const rangeMatch = /(\d+)\s*[~-]\s*(\d+)\s*번?\s*컷/u.exec(text);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start) {
      const cuts: number[] = [];
      for (let cut = start; cut <= Math.min(end, start + 30); cut += 1) cuts.push(cut);
      return cuts;
    }
  }
  const unique = new Set<number>();
  for (const match of text.matchAll(/(\d+)\s*번?\s*컷/gu)) {
    const cutNum = Number(match[1]);
    if (Number.isInteger(cutNum) && cutNum >= 1) unique.add(cutNum);
  }
  return unique.size > 0 ? [...unique].sort((a, b) => a - b) : [Math.max(1, Math.trunc(fallbackCutNumber))];
}

function splitCommandClauses(normalized: string): readonly string[] {
  return normalized
    .replace(/(키우고|줄이고|메우고|깔고|정리하고)\s+/gu, "$1 | ")
    .replace(/\s+그리고\s+|\s*,\s*/gu, " | ")
    .split("|")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function detectAtmospherePreset(clause: string): AtmospherePresetKind | null {
  if (/(노을|석양|해질녘)/u.test(clause)) return "sunset";
  if (/(새벽|아침\s*빛|여명)/u.test(clause)) return "dawn";
  if (/(밤|야간|달빛)/u.test(clause)) return "night";
  if (/(주광|정오|역광)/u.test(clause)) return "studio_daylight";
  return null;
}

function detectLayerRole(clause: string): CanvasLayerRole | "all" {
  if (/(밑색|플랫|채색)/u.test(clause)) return "flat";
  if (/(선화|펜선|잉킹)/u.test(clause)) return "lineart";
  if (/(명암|그림자|음영)/u.test(clause)) return "shade";
  if (/(러프|콘티|스케치)/u.test(clause)) return "rough";
  if (/(대사|식자|말풍선)/u.test(clause)) return "lettering";
  return "all";
}

function compileSingleVoiceClause(
  clause: string,
  cutNumbers: readonly number[],
  nextOrder: () => number,
): readonly DynamicMacroStep[] {
  const steps: DynamicMacroStep[] = [];

  if (/(대사|말풍선|글자|폰트)/u.test(clause) && /(키우|키워|크게|확대|줄이|줄여|작게|축소)/u.test(clause)) {
    const pctMatch = /(\d+(?:\.\d+)?)\s*%/u.exec(clause);
    const magnitude = pctMatch ? Math.min(80, Math.max(1, Number(pctMatch[1]))) : 10;
    const isShrink = /(줄이|줄여|작게|축소)/u.test(clause);
    const scaleDeltaPercent = isShrink ? -magnitude : magnitude;
    const order = nextOrder();
    steps.push({
      stepId: `step-${order}-scale-dialogue`,
      order,
      opcode: "scale_dialogue_text",
      labelKo: `대사 ${magnitude}% ${isShrink ? "축소" : "확대"}`,
      reversible: true,
      estimatedCostMs: 14,
      params: { cutNumbers, scaleDeltaPercent, scaleFactor: Number((1 + scaleDeltaPercent / 100).toFixed(4)) },
    });
  }

  if (/(흰\s*점|빈\s*틈|틈새|안\s*칠해진)/u.test(clause) && /(메우|메워|채우|채워|보정)/u.test(clause)) {
    const order = nextOrder();
    steps.push({
      stepId: `step-${order}-fill-white-specs`,
      order,
      opcode: "fill_white_specs",
      labelKo: "흰 점·미세 틈새 메우기",
      reversible: true,
      estimatedCostMs: 28,
      params: { cutNumbers, maxSpecRadiusPx: 6, gapClosingEnabled: true },
    });
  }

  if (/(선화|펜선|교차|삐침)/u.test(clause) && /(삐침|정리|지워|다듬|교차)/u.test(clause)) {
    const order = nextOrder();
    steps.push({
      stepId: `step-${order}-trim-overshoots`,
      order,
      opcode: "trim_lineart_overshoots",
      labelKo: "선화 교차 삐침 정리",
      reversible: true,
      estimatedCostMs: 22,
      params: { cutNumbers, layerRole: "lineart", tolerancePx: 4 },
    });
  }

  if (/(비교|대조|차이\s*보여)/u.test(clause) && /(레이어|밑색|선화|명암|어시)/u.test(clause)) {
    const ownerFilter: LayerOwnerFilter = /(어시스턴트|어시)/u.test(clause)
      ? "assistant"
      : /(메인\s*작가|원작자|리드)/u.test(clause)
        ? "lead"
        : "all";
    const layerRole = detectLayerRole(clause);
    const isolateOnly = /(만\s*비교|만\s*보여|단독)/u.test(clause);
    const order = nextOrder();
    steps.push({
      stepId: `step-${order}-compare-layers`,
      order,
      opcode: "compare_filtered_layers",
      labelKo: `${ownerFilter === "assistant" ? "어시스턴트 " : ""}${layerRole === "flat" ? "밑색 " : layerRole === "lineart" ? "선화 " : ""}레이어 비교 보기`.trim(),
      reversible: true,
      estimatedCostMs: 10,
      params: { ownerFilter, layerRole, isolateOnly, comparisonMode: "split_diff" },
    });
  }

  const preset = detectAtmospherePreset(clause);
  const wantsBacklight = /(역광|림\s*라이트|테두리\s*빛)/u.test(clause);
  const wantsAtmosphere = preset !== null && /(깔아|입혀|적용|분위기|조명|노을|새벽|야간)/u.test(clause);
  if (wantsAtmosphere || wantsBacklight) {
    const resolvedPreset = preset ?? "sunset";
    const spec = ATMOSPHERE_PRESETS[resolvedPreset];
    if (wantsAtmosphere) {
      const order = nextOrder();
      steps.push({
        stepId: `step-${order}-atmosphere-grade`,
        order,
        opcode: "apply_atmosphere_grade",
        labelKo: `${spec.labelKo} 분위기 색온도 보정`,
        reversible: true,
        estimatedCostMs: 24,
        params: { cutNumbers, preset: resolvedPreset, kelvin: spec.kelvin, keyToneOklch: spec.keyToneOklch, opacity: 0.42 },
      });
    }
    if (wantsBacklight) {
      const order = nextOrder();
      steps.push({
        stepId: `step-${order}-rim-backlight`,
        order,
        opcode: "apply_rim_backlight",
        labelKo: `${spec.labelKo} 역광 림라이트 적용`,
        reversible: true,
        estimatedCostMs: 26,
        params: { cutNumbers, preset: resolvedPreset, azimuthDeg: spec.azimuthDeg, elevationDeg: spec.elevationDeg, intensity: 0.75 },
      });
    }
  }

  return steps;
}

/** 한국어 자연어 음성 명령을 결정론적 복합 매크로 계획(`DynamicMacroPlan`)으로 컴파일한다. */
export function compileVoiceMacroPlan(input: VoiceMacroCompileInput): DynamicMacroPlan {
  const normalized = normalizeKoreanCommand(input.utteranceKo);
  const targetCutNumbers = extractTargetCutNumbers(normalized, input.activeCutNumber ?? 1);
  const steps: DynamicMacroStep[] = [];
  const unmatchedFragments: string[] = [];
  let seq = 0;
  const nextOrder = (): number => {
    seq += 1;
    return seq;
  };

  for (const clause of splitCommandClauses(normalized)) {
    const effectiveCuts = /(\d+)\s*번?\s*컷/u.test(clause)
      ? extractTargetCutNumbers(clause, targetCutNumbers[0] ?? 1)
      : targetCutNumbers;
    const matched = compileSingleVoiceClause(clause, effectiveCuts, nextOrder);
    if (matched.length === 0) unmatchedFragments.push(clause);
    else steps.push(...matched);
  }

  return finalizeMacroPlan({ source: "voice", rawCommand: input.utteranceKo, normalizedCommand: normalized, targetCutNumbers, steps, unmatchedFragments });
}

/** 스타일러스 사이드 버튼·제스처 조합을 현재 레이어 맥락에 맞는 원자 매크로 계획으로 컴파일한다. */
export function compilePenButtonMacroPlan(input: PenButtonMacroCompileInput): DynamicMacroPlan {
  const cutNumbers = [Math.max(1, Math.trunc(input.activeCutNumber ?? 1))];
  const rawCommand = `${input.button}:${input.gesture}@${input.layerRole}`;
  const steps: DynamicMacroStep[] = [];

  if (input.button === "primary_side" && input.gesture === "double_click") {
    if (input.layerRole === "lineart") {
      steps.push({ stepId: "step-1-pen-trim", order: 1, opcode: "trim_lineart_overshoots", labelKo: "선화 교차 삐침 즉시 정리", reversible: true, estimatedCostMs: 18, params: { cutNumbers, layerRole: "lineart", tolerancePx: 4 } });
    } else if (input.layerRole === "flat") {
      steps.push({ stepId: "step-1-pen-white-specs", order: 1, opcode: "fill_white_specs", labelKo: "밑색 흰 점 즉시 메우기", reversible: true, estimatedCostMs: 20, params: { cutNumbers, maxSpecRadiusPx: 6, gapClosingEnabled: true } });
    } else if (input.layerRole === "shade") {
      steps.push({ stepId: "step-1-pen-rim", order: 1, opcode: "apply_rim_backlight", labelKo: "빠른 역광 하이라이트 추가", reversible: true, estimatedCostMs: 20, params: { cutNumbers, preset: "sunset", azimuthDeg: 215, elevationDeg: 18, intensity: 0.65 } });
    } else if (input.layerRole === "lettering") {
      steps.push({ stepId: "step-1-pen-dialogue-boost", order: 1, opcode: "scale_dialogue_text", labelKo: "대사 가독성 10% 확대", reversible: true, estimatedCostMs: 12, params: { cutNumbers, scaleDeltaPercent: 10, scaleFactor: 1.1 } });
    } else {
      steps.push({ stepId: "step-1-pen-balloon-draft", order: 1, opcode: "draft_quick_balloon", labelKo: "러프 말풍선 빠른 배치", reversible: true, estimatedCostMs: 12, params: { cutNumbers, labelTag: `cut-${cutNumbers[0] ?? 1}-quick-balloon` } });
    }
  } else if (input.button === "primary_side" && (input.gesture === "hold_drag_up" || input.gesture === "hold_drag_down")) {
    const magnitude = Math.max(1, Math.min(40, Math.round(Math.abs(input.dragDistancePx ?? 24) / 6)));
    const deltaPx = input.gesture === "hold_drag_up" ? magnitude : -magnitude;
    steps.push({ stepId: "step-1-pen-brush-size", order: 1, opcode: "adjust_brush_radius", labelKo: `브러시 크기 ${deltaPx > 0 ? `+${deltaPx}` : `${deltaPx}`}px 조절`, reversible: true, estimatedCostMs: 4, params: { cutNumbers, deltaPx } });
  } else if (input.button === "secondary_side" && input.gesture === "single_click") {
    steps.push({ stepId: "step-1-pen-compare", order: 1, opcode: "compare_filtered_layers", labelKo: "어시스턴트 레이어 빠른 비교", reversible: true, estimatedCostMs: 8, params: { ownerFilter: "assistant", layerRole: input.layerRole, isolateOnly: true, comparisonMode: "toggle_blink" } });
  } else if (input.button === "secondary_side" && input.gesture === "double_click") {
    steps.push(
      { stepId: "step-1-finish-trim", order: 1, opcode: "trim_lineart_overshoots", labelKo: "선화 삐침 일괄 정리", reversible: true, estimatedCostMs: 22, params: { cutNumbers, layerRole: "lineart", tolerancePx: 4 } },
      { stepId: "step-2-finish-specs", order: 2, opcode: "fill_white_specs", labelKo: "흰 점 일괄 메우기", reversible: true, estimatedCostMs: 26, params: { cutNumbers, maxSpecRadiusPx: 6, gapClosingEnabled: true } },
    );
  } else if (input.button === "eraser_tail" && input.gesture === "hold_tap_canvas") {
    steps.push({ stepId: "step-1-tail-trim", order: 1, opcode: "trim_lineart_overshoots", labelKo: "지우개 꼬리 선화 삐침 정리", reversible: true, estimatedCostMs: 18, params: { cutNumbers, layerRole: "lineart", tolerancePx: 5 } });
  }

  return finalizeMacroPlan({ source: "pen_button", rawCommand, normalizedCommand: rawCommand, targetCutNumbers: cutNumbers, steps, unmatchedFragments: steps.length === 0 ? [rawCommand] : [] });
}

/** 음성 명령과 스타일러스 버튼 입력을 단일 원자 매크로 실행 계획으로 통합 컴파일한다. */
export function compileDynamicMacroPlan(input: HybridMacroCompileInput): DynamicMacroPlan {
  if (input.voice && !input.penButton) return compileVoiceMacroPlan(input.voice);
  if (input.penButton && !input.voice) return compilePenButtonMacroPlan(input.penButton);
  if (!input.voice || !input.penButton) {
    return finalizeMacroPlan({ source: "hybrid", rawCommand: "", normalizedCommand: "", targetCutNumbers: [1], steps: [], unmatchedFragments: [] });
  }

  const penPlan = compilePenButtonMacroPlan(input.penButton);
  const voicePlan = compileVoiceMacroPlan(input.voice);
  const mergedCuts = [...new Set([...penPlan.targetCutNumbers, ...voicePlan.targetCutNumbers])].sort((a, b) => a - b);
  const mergedSteps: DynamicMacroStep[] = [...penPlan.steps, ...voicePlan.steps].map((step, idx) => ({
    ...step,
    order: idx + 1,
    stepId: `step-${idx + 1}-${step.opcode}`,
  }));

  return finalizeMacroPlan({
    source: "hybrid",
    rawCommand: `${penPlan.rawCommand} + ${voicePlan.rawCommand}`,
    normalizedCommand: `${penPlan.normalizedCommand} | ${voicePlan.normalizedCommand}`,
    targetCutNumbers: mergedCuts,
    steps: mergedSteps,
    unmatchedFragments: [...penPlan.unmatchedFragments, ...voicePlan.unmatchedFragments],
  });
}

function finalizeMacroPlan(params: {
  readonly source: MacroPlanSource;
  readonly rawCommand: string;
  readonly normalizedCommand: string;
  readonly targetCutNumbers: readonly number[];
  readonly steps: readonly DynamicMacroStep[];
  readonly unmatchedFragments: readonly string[];
}): DynamicMacroPlan {
  const warningsKo: string[] = [];
  if (params.steps.length === 0) warningsKo.push("실행 가능한 매크로 동작을 찾지 못했습니다.");
  if (params.unmatchedFragments.length > 0) warningsKo.push(`해석하지 못한 구문 ${params.unmatchedFragments.length}건을 건너뛰었습니다.`);

  const firstCut = params.targetCutNumbers[0] ?? 1;
  const lastCut = params.targetCutNumbers[params.targetCutNumbers.length - 1] ?? firstCut;
  const cutPrefix = params.targetCutNumbers.length === 1 ? `${firstCut}번 컷 ` : `${firstCut}~${lastCut}번 컷 `;
  const summaryKo = params.steps.length > 0 ? `${cutPrefix}${params.steps.map((s) => s.labelKo).join(" · ")}` : "실행할 매크로 없음";

  const signature = JSON.stringify({
    source: params.source,
    normalizedCommand: params.normalizedCommand,
    targetCutNumbers: params.targetCutNumbers,
    steps: params.steps.map((step) => ({ opcode: step.opcode, params: step.params })),
  });

  return {
    planId: computeDeterministicPlanId(signature),
    source: params.source,
    rawCommand: params.rawCommand,
    normalizedCommand: params.normalizedCommand,
    summaryKo,
    atomicGroupLabelKo: `[원자 매크로] ${summaryKo}`,
    targetCutNumbers: params.targetCutNumbers,
    steps: params.steps,
    unmatchedFragments: params.unmatchedFragments,
    warningsKo,
    isExecutable: params.steps.length > 0,
  };
}
