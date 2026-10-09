import { DEFAULT_INPUT_CONFIG } from "../../engine/input/input-pipeline";
import { lazyRadiusPxFromPct, stabilizerPctToOneEuro } from "../../engine/input/stabilizer-map";
import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { brushConfigHashSync, BRUSH_FAMILIES, normalizeProgram } from "../../engine/presets/program-schema";

import { DRAW_PAPER_KINDS } from "./draw-store";
import { effectiveStabilizerPct } from "./input-chain";
import { messageOf, resolveProgram } from "./run-compare";

import type { DrawFamilyFilter, DrawState } from "./draw-store";
import type { LabOverrides } from "./lab-store";
import type { ResolvedProgram } from "./run-compare";
import type { OneEuroParams } from "../../engine/input/one-euro";
import type { BrushFamily, BrushProgram } from "../../engine/presets/program-schema";
import type { LaneCapabilityReport, LaneDescriptor, LaneId } from "../../lanes/lane";

/** 브러시 가족 한글 이름. `Record<BrushFamily, …>`라서 가족이 늘면 컴파일 오류로 알려 준다. */
export const FAMILY_LABELS: Record<BrushFamily, string> = {
  pencil: "연필",
  ballpoint: "볼펜",
  ink: "잉크",
  marker: "마커",
  chalk: "분필",
  charcoal: "목탄",
  conte: "콩테",
  crayon: "크레용",
  watercolor: "수채",
  sumi: "수묵",
  gouache: "구아슈",
  oil: "유화",
  acrylic: "아크릴",
  airbrush: "에어브러시",
  spray: "스프레이",
  hatch: "해칭",
  halftone: "망점",
  texture: "질감 스탬프",
  smudge: "문지르기",
  eraser: "지우개",
  special: "특수 효과",
};

/** 카탈로그에 실제로 있는 가족만, `BRUSH_FAMILIES` 순서로. */
export function catalogFamilies(): BrushFamily[] {
  const used = new Set<BrushFamily>(PRESET_CATALOG.map((p) => p.family));
  return BRUSH_FAMILIES.filter((f) => used.has(f));
}

type DrawProgramState = Pick<DrawState, "presetId" | "overrides" | "paperKind" | "stabilizerMode" | "stabilizerPct">;

/** 그리기 상태 → 프리셋 위 오버라이드(고급 패널 값 + 종이 종류). 안정화는 로그 매핑이라 `resolveDrawProgram`이 따로 얹는다. */
export function buildDrawOverrides(state: Pick<DrawState, "overrides" | "paperKind">): LabOverrides {
  const out: LabOverrides = { ...state.overrides };
  const paper = DRAW_PAPER_KINDS.find((p) => p.id === state.paperKind);
  if (paper?.values) {
    // 종이 값만 바꾼다. 켜기/끄기는 '종이 질감' 스위치(`overrides.grain`)가 정한다(종류를 고르면 UI가 스위치를 켠다).
    out.paperScale = paper.values.paperScale;
    out.paperRoughness = paper.values.paperRoughness;
    out.paperAbsorbency = paper.values.paperAbsorbency;
  }
  return out;
}

/**
 * 안정화 상태 → 엔진 입력 파이프라인의 위치 1€ 파라미터(로그 매핑 `stabilizerPctToOneEuro`). 프리셋 기본을 쓰면 null.
 * - 1€ 방식: 슬라이더를 정했으면 그 값, 아니면 프리셋 기본(null).
 * - 끈 당김·물리 펜·끔: 앞단 입력 단계(또는 보정 없음)가 평활을 맡으므로 엔진 1€는 0(사실상 raw)으로 둬 두 평활이 겹치지 않게 한다.
 */
export function drawOneEuroPosition(state: Pick<DrawState, "stabilizerMode" | "stabilizerPct">): OneEuroParams | null {
  if (state.stabilizerMode !== "one-euro") return stabilizerPctToOneEuro(0);
  return state.stabilizerPct === null ? null : stabilizerPctToOneEuro(state.stabilizerPct);
}

/** 그리기 상태 → 검증된 프로그램(범위 밖이면 사유 문자열, 무음 보정 없음). */
export function resolveDrawProgram(state: DrawProgramState): ResolvedProgram {
  const resolved = resolveProgram({ presetId: state.presetId, overrides: buildDrawOverrides(state) });
  const position = drawOneEuroPosition(state);
  if (!resolved.program || position === null) return resolved;
  try {
    const input = resolved.program.input;
    const program = normalizeProgram({
      ...resolved.program,
      input: {
        ...input,
        oneEuro: {
          position,
          pressure: input.oneEuro?.pressure ?? DEFAULT_INPUT_CONFIG.oneEuro.pressure,
          tilt: input.oneEuro?.tilt ?? DEFAULT_INPUT_CONFIG.oneEuro.tilt,
        },
      },
    });
    return { program, hash: brushConfigHashSync(program), error: null };
  } catch (error) {
    return { program: null, hash: null, error: `파라미터가 스키마 범위를 벗어났다: ${messageOf(error)}` };
  }
}

/** 끈 당김 모드의 끈 길이(px): 슬라이더 값(없으면 방식 기본값)의 로그 매핑. */
export function lazyRadiusPx(stabilizerPct: number | null): number {
  return lazyRadiusPxFromPct(effectiveStabilizerPct("lazy-brush", stabilizerPct) ?? 0);
}

/** 목록 필터(가족 칩 + 검색어 + 최근). 검색은 한글 이름·id·가족 한글 이름·설명에서 대소문자 무시로 찾는다. */
export function filterPresets(
  presets: readonly BrushProgram[],
  filter: DrawFamilyFilter,
  search: string,
  recentIds: readonly string[],
): BrushProgram[] {
  const q = search.trim().toLowerCase();
  let list: BrushProgram[];
  if (filter === "recent") {
    list = recentIds.map((id) => presets.find((p) => p.id === id)).filter((p): p is BrushProgram => p !== undefined);
  } else if (filter === "all") {
    list = [...presets];
  } else {
    list = presets.filter((p) => p.family === filter);
  }
  if (q.length === 0) return list;
  return list.filter((p) =>
    [p.name, p.id, FAMILY_LABELS[p.family], p.family, p.description].some((text) => text.toLowerCase().includes(q)),
  );
}

/** 라이브 표시(`presentCanvas`)를 레인이 직접 하는 레인. 나머지는 획이 끝난 뒤 readback을 2D 캔버스에 올린다. */
const LIVE_PRESENT_LANES: ReadonlySet<LaneId> = new Set<LaneId>([
  "webgpu-compute",
  "wasm-gpu-hybrid",
  "webgpu-instanced",
  "webgl2-instanced",
]);

export function lanePresentsLive(id: LaneId): boolean {
  return LIVE_PRESENT_LANES.has(id);
}

/** 초기 레인 우선순위(ADR-0018: 능력 탐지로 한 번만 정한다). */
export const INITIAL_LANE_PRIORITY: readonly LaneId[] = ["webgpu-compute", "wasm-cpu", "cpu-reference"];

export type InitialLaneDecision =
  | { kind: "pending" }
  | { kind: "picked"; laneId: LaneId }
  | { kind: "none" };

/**
 * 능력 탐지 결과로 초기 레인을 고른다. 우선순위의 앞쪽 후보가 아직 probe되지 않았으면 `pending`(뒤 후보로 건너뛰지 않는다),
 * 후보가 모두 unavailable이면 `none`(다른 레인으로 몰래 대체하지 않고 사용자 선택을 기다린다).
 * 레지스트리에 없거나 reserved인 후보는 건너뛴다.
 */
export function decideInitialLane(
  registry: readonly LaneDescriptor[],
  capability: Readonly<Record<LaneId, LaneCapabilityReport | null>>,
): InitialLaneDecision {
  for (const id of INITIAL_LANE_PRIORITY) {
    const desc = registry.find((d) => d.id === id);
    if (!desc || desc.status === "reserved") continue;
    const cap = capability[id];
    if (cap === null) return { kind: "pending" };
    if (cap.status === "supported") return { kind: "picked", laneId: id };
  }
  return { kind: "none" };
}

/** 최근접 순위 백분위(p 0..100). 빈 배열이면 null. */
export function nearestRankPercentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}
