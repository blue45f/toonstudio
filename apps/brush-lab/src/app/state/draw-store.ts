import { useSyncExternalStore } from "react";

import { pushRecentColor } from "./color-utils";

import type { LabOverrides } from "./lab-store";
import type { LiveStrokeTimings } from "./live-session";
import type { BrushFamily } from "../../engine/presets/program-schema";
import type { LaneId, StrokeReceipt } from "../../lanes/lane";
import type { GalleryRenderResult } from "../../platform/worker-client";

/**
 * "그리기" 화면 상태 저장소. A/B 비교용 `lab-store`와 분리돼 있어 서로의 상태(프리셋·오버라이드·레인 A/B)를 건드리지 않는다.
 * 레인 능력 탐지(`capability`) 결과만 `lab-store`와 공유한다(읽기 전용).
 * 외부 런타임 의존성은 React의 `useSyncExternalStore`뿐이다.
 */

/** 캔버스 크기 선택. `fit`은 표시 영역을 장치 픽셀로 채운다. */
export type DrawCanvasMode = "1024x640" | "512" | "1024" | "fit";

export const DRAW_CANVAS_MODES: readonly { id: DrawCanvasMode; label: string }[] = [
  { id: "1024x640", label: "1024×640(기본)" },
  { id: "512", label: "512×512" },
  { id: "1024", label: "1024×1024" },
  { id: "fit", label: "화면 맞춤" },
];

/** 종이 종류. `preset`은 프리셋의 종이 값을 그대로 쓴다. */
export type DrawPaperKind = "preset" | "smooth" | "standard" | "rough" | "watercolor";

export interface DrawPaperSpec {
  id: DrawPaperKind;
  label: string;
  /** `preset`이면 오버라이드 없음. */
  values: { paperScale: number; paperRoughness: number; paperAbsorbency: number } | null;
}

/** 종이 종류 프리셋(자체 정의 값, 베타). 스키마 범위 안의 값만 쓴다. */
export const DRAW_PAPER_KINDS: readonly DrawPaperSpec[] = [
  { id: "preset", label: "브러시 기본", values: null },
  { id: "smooth", label: "매끈한 종이", values: { paperScale: 1.6, paperRoughness: 0.25, paperAbsorbency: 0.3 } },
  { id: "standard", label: "보통 종이", values: { paperScale: 1, paperRoughness: 0.5, paperAbsorbency: 0.5 } },
  { id: "rough", label: "거친 종이", values: { paperScale: 0.8, paperRoughness: 0.85, paperAbsorbency: 0.5 } },
  { id: "watercolor", label: "수채화지(냉압)", values: { paperScale: 0.7, paperRoughness: 0.9, paperAbsorbency: 0.85 } },
];

/** 입력 보정 방식. 서비스 `applyStabilizer`는 경계 규칙상 이 앱에서 쓸 수 없다(README "그리기" 한계 참고). */
export type DrawStabilizerMode = "one-euro" | "lazy-brush";

/** 브러시 목록 필터. */
export type DrawFamilyFilter = BrushFamily | "all" | "recent";

/** 브러시 미리보기 1개(캐시). Worker 실패는 오류로 남긴다(무음 대체 없음). */
export interface DrawPreviewEntry {
  status: "pending" | "done" | "error";
  result: GalleryRenderResult | null;
  error: string | null;
}

/** 마지막 획의 HUD 지표. */
export interface DrawStrokeStats {
  addSamplesP50Ms: number | null;
  addSamplesP95Ms: number | null;
  endStrokeMs: number;
  readbackMs: number;
  dabCount: number;
  overflowDabs: number;
  frames: number;
  receipt: StrokeReceipt;
  timings: LiveStrokeTimings;
}

export type DrawSessionStatus = "idle" | "starting" | "ready" | "error";

export interface DrawNotice {
  seq: number;
  code: string;
  message: string;
}

export interface DrawState {
  /** 선택된 레인. 능력 탐지 끝나기 전엔 null. */
  laneId: LaneId | null;
  /** 사용자가 직접 골랐는가. true가 된 뒤에는 능력 탐지로 레인을 바꾸지 않는다(ADR-0018). */
  laneChosenByUser: boolean;
  /** 초기 선택을 이미 정했는가(한 번만). */
  initialLanePicked: boolean;
  presetId: string;
  /** 프리셋 위에 얹는 파라미터 오버라이드(크기·불투명도·흐름·고급 패널). */
  overrides: LabOverrides;
  paperKind: DrawPaperKind;
  /** 현재 색 `#rrggbb`. */
  color: string;
  recentColors: string[];
  recentPresetIds: string[];
  stabilizerMode: DrawStabilizerMode;
  /** 안정화 0..100. null이면 프리셋 기본(1€ 모드). */
  stabilizerPct: number | null;
  mousePressureSim: boolean;
  canvasMode: DrawCanvasMode;
  search: string;
  familyFilter: DrawFamilyFilter;
  panelOpen: boolean;
  previews: Record<string, DrawPreviewEntry>;
  /** 지우기·레인 변경으로 문서를 새로 만들 때마다 늘어난다(세션 재생성 신호). */
  nonce: number;
  sessionStatus: DrawSessionStatus;
  /** 지금 문서의 폭·높이(레인 init 크기). */
  documentSize: { width: number; height: number } | null;
  strokes: number;
  lastStroke: DrawStrokeStats | null;
  /** 마지막 획의 readback(PNG 저장용). */
  lastImage: { width: number; height: number; data: Uint8ClampedArray } | null;
  notices: DrawNotice[];
}

export const DEFAULT_DRAW_PRESET_ID = "pencil-hb";
export const MAX_RECENT_PRESETS = 8;
export const MAX_RECENT_COLORS = 8;

export function initialDrawState(): DrawState {
  return {
    laneId: null,
    laneChosenByUser: false,
    initialLanePicked: false,
    presetId: DEFAULT_DRAW_PRESET_ID,
    overrides: {},
    paperKind: "preset",
    color: "#000000",
    recentColors: [],
    recentPresetIds: [],
    stabilizerMode: "one-euro",
    stabilizerPct: null,
    mousePressureSim: true,
    canvasMode: "1024x640",
    search: "",
    familyFilter: "all",
    panelOpen: true,
    previews: {},
    nonce: 0,
    sessionStatus: "idle",
    documentSize: null,
    strokes: 0,
    lastStroke: null,
    lastImage: null,
    notices: [],
  };
}

export type DrawPatch = Partial<DrawState> | ((prev: DrawState) => Partial<DrawState>);

export interface DrawStore {
  get(): DrawState;
  set(patch: DrawPatch): void;
  subscribe(cb: () => void): () => void;
  reset(initial?: Partial<DrawState>): void;
}

export function createDrawStore(initial: Partial<DrawState> = {}): DrawStore {
  let state: DrawState = { ...initialDrawState(), ...initial };
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const l of listeners) l();
  };
  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === "function" ? patch(state) : patch;
      let changed = false;
      for (const key of Object.keys(next) as (keyof DrawState)[]) {
        if (!Object.is(next[key], state[key])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...next };
      emit();
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    reset: (init = {}) => {
      state = { ...initialDrawState(), ...init };
      emit();
    },
  };
}

/** 앱 전역 그리기 저장소. 테스트는 `createDrawStore()`로 독립 인스턴스를 만든다. */
export const drawStore: DrawStore = createDrawStore();

export function useDrawState<T>(selector: (s: DrawState) => T, store: DrawStore = drawStore): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

export interface DrawActions {
  /** 사용자가 레인을 고른다(이후 자동 선택 없음). 문서는 비워진다(nonce 증가). */
  chooseLane(id: LaneId): void;
  /** 능력 탐지로 초기 레인을 정한다. 이미 정했거나 사용자가 골랐으면 무시한다. */
  pickInitialLane(id: LaneId): boolean;
  /** 브러시를 바꾼다. 파라미터 오버라이드·안정화·종이 종류는 새 브러시 기본값으로 돌아가고 색은 유지한다. */
  setPreset(id: string): void;
  setOverride(patch: LabOverrides): void;
  resetOverrides(): void;
  setPaperKind(kind: DrawPaperKind): void;
  setColor(hex: string): void;
  /** 쓴 색을 최근 색(8칸)에 올린다. */
  commitColor(hex: string): void;
  setStabilizerMode(mode: DrawStabilizerMode): void;
  setStabilizerPct(pct: number | null): void;
  setMousePressureSim(on: boolean): void;
  setCanvasMode(mode: DrawCanvasMode): void;
  setSearch(text: string): void;
  setFamilyFilter(filter: DrawFamilyFilter): void;
  setPanelOpen(open: boolean): void;
  setPreview(presetId: string, entry: DrawPreviewEntry): void;
  /** 문서를 비운다(세션 재생성). */
  clearDocument(): void;
  setSessionStatus(status: DrawSessionStatus): void;
  setDocumentSize(size: DrawState["documentSize"]): void;
  recordStroke(stats: DrawStrokeStats, image: NonNullable<DrawState["lastImage"]>): void;
  /** 새 문서로 바뀌었을 때(지우기·레인 변경) 획 통계를 비운다. */
  resetDocumentStats(): void;
  pushNotice(code: string, message: string): void;
  clearNotices(): void;
}

export function createDrawActions(store: DrawStore): DrawActions {
  let noticeSeq = 0;
  return {
    chooseLane: (id) =>
      store.set((prev) => ({ laneId: id, laneChosenByUser: true, initialLanePicked: true, nonce: prev.nonce + 1 })),
    pickInitialLane: (id) => {
      const s = store.get();
      if (s.initialLanePicked || s.laneChosenByUser) return false;
      store.set({ laneId: id, initialLanePicked: true });
      return true;
    },
    setPreset: (id) =>
      store.set((prev) => ({
        presetId: id,
        overrides: {},
        paperKind: "preset",
        stabilizerPct: null,
        recentPresetIds: [id, ...prev.recentPresetIds.filter((p) => p !== id)].slice(0, MAX_RECENT_PRESETS),
      })),
    setOverride: (patch) => store.set((prev) => ({ overrides: { ...prev.overrides, ...patch } })),
    resetOverrides: () => store.set({ overrides: {}, paperKind: "preset", stabilizerPct: null }),
    setPaperKind: (paperKind) => store.set({ paperKind }),
    setColor: (color) => store.set({ color }),
    commitColor: (hex) => store.set((prev) => ({ recentColors: pushRecentColor(prev.recentColors, hex, MAX_RECENT_COLORS) })),
    setStabilizerMode: (stabilizerMode) => store.set({ stabilizerMode }),
    setStabilizerPct: (stabilizerPct) => store.set({ stabilizerPct }),
    setMousePressureSim: (mousePressureSim) => store.set({ mousePressureSim }),
    setCanvasMode: (canvasMode) => store.set((prev) => (prev.canvasMode === canvasMode ? {} : { canvasMode })),
    setSearch: (search) => store.set({ search }),
    setFamilyFilter: (familyFilter) => store.set({ familyFilter }),
    setPanelOpen: (panelOpen) => store.set({ panelOpen }),
    setPreview: (presetId, entry) => store.set((prev) => ({ previews: { ...prev.previews, [presetId]: entry } })),
    clearDocument: () => store.set((prev) => ({ nonce: prev.nonce + 1 })),
    setSessionStatus: (sessionStatus) => store.set({ sessionStatus }),
    setDocumentSize: (documentSize) => store.set({ documentSize }),
    recordStroke: (stats, image) =>
      store.set((prev) => ({ strokes: prev.strokes + 1, lastStroke: stats, lastImage: image })),
    resetDocumentStats: () => store.set({ strokes: 0, lastStroke: null, lastImage: null }),
    pushNotice: (code, message) => {
      noticeSeq += 1;
      const notice: DrawNotice = { seq: noticeSeq, code, message };
      store.set((prev) => ({ notices: [...prev.notices.slice(-7), notice] }));
    },
    clearNotices: () => store.set({ notices: [] }),
  };
}

export const drawActions: DrawActions = createDrawActions(drawStore);
