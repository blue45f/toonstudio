/** 정착 호스트의 내부 작업·캐시 타입. 실행 코드와 저장 문서 계약을 포함하지 않는다. */
import type { StudioWetPaperRasterJob } from "./studio-wet-paper-composite";
import type { WetPaperInputDab } from "./studio-wet-paper-deposit";
import type { StudioWetPaperCanvasBake } from "./studio-wet-paper-host";
import type { StudioWetPaperBakeRequestKey } from "./studio-wet-paper-program-ids";
import type { StudioWetPaperBakeResult, WetPaperSolve } from "./studio-wet-paper-solver";

export interface WetPaperBakeCacheEntry {
  readonly signature: Float64Array;
  readonly result: StudioWetPaperBakeResult | null;
  readonly cells: number;
  /** 색 → 합성 캔버스(null = 해석할 수 없는 색이거나 캔버스를 만들 수 없음). */
  readonly rasters: Map<string, StudioWetPaperCanvasBake | null>;
  /** 마지막 요청 시각(ms)과 색별 래스터 요청 시각 — 핀 판정. */
  requestedAt: number;
  readonly rasterRequestedAt: Map<string, number>;
}

/** 기다리는 쪽: 리스너와 요청자. 요청자 없이 부른 호출(익명)이 있으면 요청자가 모두 떠나도 작업을 버리지 않는다. */
export interface PendingWaiters {
  readonly listeners: Set<() => void>;
  readonly requesters: Set<string>;
  anonymous: boolean;
}

export interface PendingSolveJob extends PendingWaiters {
  readonly key: string;
  readonly dabs: readonly WetPaperInputDab[];
  readonly signature: Float64Array;
  readonly request: StudioWetPaperBakeRequestKey;
  /** 처음 요청한 획 색(익명 요청자는 풀이가 끝나면 이 색으로 곧바로 합성한다). */
  readonly color: string;
  solve: WetPaperSolve | null;
  seeded: boolean;
}

export interface PendingCompositeJob extends PendingWaiters {
  readonly key: string;
  /** 결과 캐시 키(합성 도중 결과가 LRU에서 밀려났는지 확인한다). */
  readonly entryKey: string;
  readonly color: string;
  readonly entry: WetPaperBakeCacheEntry;
  raster: StudioWetPaperRasterJob | null;
  started: boolean;
}

/** 요청자(요소·변형)가 마지막으로 요청한 결과 키와 색. */
export interface RequesterState {
  readonly key: string;
  readonly color: string;
  ready?: () => void;
  notify?: () => void;
}

/** 캐시 상한. 소프트를 넘으면 핀이 아닌 오래된 것부터 버리고, 하드를 넘겨야 하면 새 것을 보관하지 않는다. */
export interface StudioWetPaperBakeHostLimits {
  /** 결과 항목 수·보관 셀 수(셀당 Float32 밀도 + Uint8 덮임·전선 ≈ 6 B → 소프트 약 24 MiB). */
  readonly entrySoftCount: number;
  readonly entryHardCount: number;
  readonly cellSoftCount: number;
  readonly cellHardCount: number;
  /** 래스터(캔버스) 총 픽셀(RGBA8 → 소프트 약 24 MiB). */
  readonly rasterSoftPixels: number;
  readonly rasterHardPixels: number;
}

