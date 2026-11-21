import type { StudioSoakPointerLatency, StudioSoakPointerMode } from "./studio-soak-pointer-latency";

interface StudioSoakDocumentEvidence {
  readonly layerCountBefore: number | null;
  readonly layerCountAfter: number | null;
  readonly historyEntryCountBefore: number | null;
  readonly historyUndoDepthBefore: number | null;
  readonly historyEntryCount: number | null;
  readonly historyUndoDepth: number | null;
  readonly acceptedByDocument: boolean;
  readonly rejectedStrokeCount: number;
  /** 예산 퇴출과 실제 append·보존량을 분리해 기록한다. */
  readonly historyEvictedStepsBefore: number | null;
  readonly historyEvictedStepsAfter: number | null;
  readonly historyRetainedBytesBefore: number | null;
  readonly historyRetainedBytesAfter: number | null;
  readonly historyLastEntryBytesAfter: number | null;
  readonly historyTotalAppendsBefore: number | null;
  readonly historyTotalAppendsAfter: number | null;
  readonly rejectedStrokeCountBefore: number | null;
  readonly rejectedStrokeCountAfter: number | null;
  readonly commitErrorText: string | null;
  /** 별도 진단 옵션을 켰을 때만 획 직후의 GC 힙을 기록한다. */
  readonly heapUsedBytesAfter: number | null;
  readonly pointerLatency: StudioSoakPointerLatency | null;
}

interface StudioSoakPointerEvidence {
  readonly mode: StudioSoakPointerMode;
  readonly points: number;
  readonly pressureMin: number;
  readonly pressureMax: number;
  readonly tiltXMin: number;
  readonly tiltXMax: number;
  readonly tiltYMin: number;
  readonly tiltYMax: number;
  readonly twistMin: number;
  readonly twistMax: number;
}

export interface StudioSoakStrokeEvidence extends StudioSoakDocumentEvidence {
  readonly changed: number;
  readonly shot: Buffer;
  readonly pointer: StudioSoakPointerEvidence;
}

export interface StudioSoakPixelSample extends StudioSoakDocumentEvidence {
  readonly cycle: number;
  readonly atMs: number;
  readonly changedPixels: number;
  readonly brushId: string | null;
  readonly brushName: string | null;
  readonly inputMode: StudioSoakPointerMode;
  readonly pointerPoints: number;
  readonly pressureMin: number;
  readonly pressureMax: number;
  readonly tiltXMin: number;
  readonly tiltXMax: number;
  readonly tiltYMin: number;
  readonly tiltYMax: number;
  readonly twistMin: number;
  readonly twistMax: number;
}
