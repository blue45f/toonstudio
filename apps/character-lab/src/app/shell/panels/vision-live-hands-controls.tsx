import { useEffect, useMemo, useRef, useState } from "react";

import { failVisible } from "../../../contracts";
import { useLabContext, useLabState } from "../lab-store-context";
import { createLiveHandsController } from "../vision-live-hands";

import type { VisionSession } from "../../../domains/vision/vision-session";
import type { LiveHandsStatus } from "../vision-live-hands";
import type { VisionPanelDeps } from "./vision-panel-deps";
import type { RefObject } from "react";

interface LiveHandsProps {
  readonly session: VisionSession;
  readonly deps: VisionPanelDeps;
  readonly enabled: boolean;
  readonly stream: MediaStream | null;
  readonly video: RefObject<HTMLVideoElement | null>;
  readonly cancelRef: RefObject<(() => void) | null>;
  readonly onStop: () => void;
}

function scheduleFrame(video: HTMLVideoElement | null, next: () => void): () => void {
  if (video && typeof video.requestVideoFrameCallback === "function") {
    const id = video.requestVideoFrameCallback(next);
    return () => video.cancelVideoFrameCallback(id);
  }
  const id = requestAnimationFrame(next);
  return () => cancelAnimationFrame(id);
}

export function LiveHandsControls({ session, deps, enabled, stream, video, cancelRef, onStop }: LiveHandsProps) {
  const { store } = useLabContext();
  const handCapability = useLabState().capabilities["hand-pose"];
  const handUnavailable = handCapability.status === "unavailable";
  const [state, setState] = useState<LiveHandsStatus>({ phase: "idle", frames: 0, appliedHands: 0, latencyMs: null, messageKo: "카메라를 열고 손 연속 인식을 시작하세요." });
  const [selfie, setSelfie] = useState(false);
  const [mirror, setMirror] = useState(false);
  const applying = useRef(false);
  const stopRef = useRef(onStop); stopRef.current = onStop;
  const controller = useMemo(() => createLiveHandsController({
    ensureDetector: () => session.ensure("handLandmarker").then((model) => model.port),
    capture: async () => {
      const element = video.current;
      if (!element) return null;
      if (deps.captureHandsFrame) return deps.captureHandsFrame(element);
      const image = await deps.captureVideo?.(element);
      return image ? { ...image, release: () => { image.releaseSource?.(); image.releasePreview?.(); } } : null;
    },
    schedule: (next) => scheduleFrame(video.current, next),
    now: () => performance.now(),
    apply(pose, sessionId) {
      const capability = store.getState().capabilities["hand-pose"];
      if (capability.status === "unavailable") throw failVisible("vision-hand-pose-unavailable", capability.reasonKo ?? "현재 모델은 손가락 포즈 변형을 지원하지 않습니다.");
      applying.current = true;
      try {
        // pose/set은 스코프에서 빠진 본을 rest로 돌리므로 기존 팔·손목·반대 손은 명시적으로 보존한다.
        store.dispatch({ type: "pose/set", pose: { ...store.getState().recipe.pose, ...pose }, scope: "arms-hands", labelKo: "연속 손 인식", coalesceKey: sessionId, coalesceMode: "session" });
      } finally { applying.current = false; }
    },
    status(next) {
      setState(next);
      if (next.failure) { store.applyEvent({ type: "failure", failure: next.failure }); stopRef.current(); }
    },
  }), [deps, session, store, video]);
  useEffect(() => {
    cancelRef.current = () => controller.stop();
    let revision = store.getState().history.revision;
    const unsubscribe = store.subscribe(() => {
      const next = store.getState().history.revision;
      if (controller.running() && store.getState().capabilities["hand-pose"].status === "unavailable") {
        controller.stop("현재 모델이 손가락 포즈 변형을 지원하지 않아 인식을 중지했습니다.");
        stopRef.current();
      } else if (next !== revision && !applying.current && controller.running()) {
        controller.stop("다른 편집이나 실행 취소로 연속 인식을 중지했습니다.");
        stopRef.current();
      }
      revision = next;
    });
    const unsubscribeModel = session.subscribe(() => {
      if (session.status("handLandmarker").phase === "idle" && controller.running()) { controller.stop("손 모델이 해제되어 중지했습니다."); stopRef.current(); }
    });
    return () => { cancelRef.current = null; unsubscribe(); unsubscribeModel(); controller.dispose(); };
  }, [cancelRef, controller, session, store]);
  useEffect(() => { if ((!enabled || !stream) && controller.running()) controller.stop(); }, [controller, enabled, stream]);
  const active = state.phase === "loading" || state.phase === "running" || state.phase === "waiting";
  if (!enabled) return null;
  return <div className="cl-vision-row" data-testid="live-hands-controls">
    <p>카메라의 손가락 굴곡을 따라합니다. 손가락 벌림과 엄지 대립은 아직 지원하지 않습니다.</p>
    {handCapability.status !== "available" ? <p role="note">{handUnavailable ? "현재 모델은 손가락 포즈 변형을 지원하지 않습니다." : "현재 모델은 손가락 포즈를 일부만 지원합니다."}{handCapability.reasonKo ? ` ${handCapability.reasonKo}` : ""}</p> : null}
    <label><input type="checkbox" checked={selfie} disabled={active} onChange={(event) => setSelfie(event.target.checked)} />연속 인식 입력이 셀피 반전 영상</label>
    <label><input type="checkbox" checked={mirror} disabled={active} onChange={(event) => setMirror(event.target.checked)} />연속 인식 거울 적용</label>
    <button type="button" disabled={handUnavailable || !stream || active || (!deps.captureVideo && !deps.captureHandsFrame)} onClick={() => controller.start({ selfie, mirror })}>손 연속 인식 시작</button>
    <button type="button" disabled={!active} onClick={() => { controller.stop(); onStop(); }}>손 연속 인식 중지</button>
    <p role={state.failure ? "alert" : "status"} data-testid="live-hands-status">{state.messageKo} · 처리 {state.frames}프레임{state.latencyMs === null ? "" : ` · 최근 추론 ${state.latencyMs.toFixed(1)}ms`}{state.failure ? ` (${state.failure.code})` : ""}</p>
    <details>
      <summary>처리 방식과 제한</summary>
      <p>연속 이미지 분석(IMAGE) 방식이며 동기 추론은 메인 스레드에서 실행됩니다. 한 프레임을 처리한 뒤 다음 비디오 프레임을 요청합니다. 손 월드 21점이 있으면 월드 좌표를 쓰고, 없으면 이미지 21점을 씁니다. 모델과 CPU/GPU 델리게이트를 자동 전환하지 않습니다.</p>
      {state.coordinateSpace ? <p>최근 좌표 공간: {state.coordinateSpace === "world" ? "월드" : state.coordinateSpace === "image" ? "이미지" : "월드·이미지"}</p> : null}
    </details>
    <p>손 미검출·좌우 미정 시 마지막 포즈를 유지합니다. 인식 세션은 실행 취소 한 단계로 묶이며 다른 편집·실행 취소를 하면 카메라와 인식을 중지합니다.</p>
  </div>;
}
