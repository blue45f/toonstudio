import { useSyncExternalStore } from "react";

import { PART_ROLE_LABELS_KO, isLabFailure } from "../../../contracts";
import { describeEngineStatus } from "../engine-status-text";

import { ViewportOnboardingCard } from "./viewport-backdrop-overlay";

import type { EngineBackend, EngineStatus } from "../../../contracts";
import type { PaintSession } from "../../../paint/paint-session";

interface ViewportStatusOverlayProps {
  readonly engineStatus: EngineStatus;
  readonly hasEngine: boolean;
  readonly onSelectBackend: (backend: EngineBackend) => void;
  readonly drawingMode: boolean;
  readonly paint: PaintSession;
  readonly notice: string | null;
  readonly noHandleReason: string | null;
}

export function failureText(error: unknown, fallback: string): string {
  return isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : fallback;
}

/** 엔진 안내·드로잉 설정·조작 실패를 표시하고, 표시용 페인트 설정만 구독한다. */
export function ViewportStatusOverlay({
  engineStatus, hasEngine, onSelectBackend, drawingMode, paint, notice, noHandleReason,
}: ViewportStatusOverlayProps) {
  const activePart = useSyncExternalStore(paint.subscribe, () => paint.getState().activePart, () => paint.getState().activePart);
  const activeSublayer = useSyncExternalStore(paint.subscribe, () => paint.getState().activeSublayer, () => paint.getState().activeSublayer);
  const brushRadius = useSyncExternalStore(paint.subscribe, () => Math.round(paint.getState().brush.radiusPx), () => Math.round(paint.getState().brush.radiusPx));
  const toolMode = useSyncExternalStore(paint.subscribe, () => paint.getState().toolMode, () => paint.getState().toolMode);
  const paintSymmetry = useSyncExternalStore(paint.subscribe, () => paint.getState().symmetry, () => paint.getState().symmetry);
  const engineText = describeEngineStatus(engineStatus);

  return (
    <>
      {engineStatus.phase === "idle" ? <ViewportOnboardingCard onSelectBackend={onSelectBackend} /> : null}
      {engineStatus.phase !== "ready" ? (
        <p className="cl-viewport-status" role="status" data-tone={engineText.tone} style={{ position: "absolute", left: 12, right: 12, bottom: 12, margin: 0 }}>{engineText.text}</p>
      ) : null}

      {hasEngine && drawingMode ? (
        <p className="cl-viewport-hint" style={{ position: "absolute", top: 44, left: 8, margin: 0 }}>
          드로잉 모드({toolMode === "eraser" ? "지우개" : "브러시"}{paintSymmetry ? " · 대칭 ON" : ""}) · 레이어 {PART_ROLE_LABELS_KO[activePart]}(L{activeSublayer}) · 브러시 {brushRadius}px — 카메라 조작은 꺼져 있습니다(드로잉을 끄면 회전·확대).
        </p>
      ) : null}

      {notice || noHandleReason ? (
        <p className="cl-viewport-notice" role="status" style={{ position: "absolute", left: 8, right: 8, bottom: hasEngine ? 8 : 56, margin: 0 }}>
          {notice ?? noHandleReason}
        </p>
      ) : null}
    </>
  );
}
