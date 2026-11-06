import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { LANDMARK_APPLY_SCOPES, LANDMARK_VISIBILITY_MIN, POSE_SCOPE_LABELS_KO, failVisible, isLabFailure } from "../../../contracts";
import { handLandmarksToPose } from "../../../domains/vision/hand-landmarks-to-pose";
import { handOverlayPlan, poseOverlayPlan } from "../../../domains/vision/landmark-overlay";
import { controllableBones, landmarksToPose } from "../../../domains/vision/landmarks-to-pose";
import { resolveHandSide } from "../../../domains/vision/vision-ports";
import { useDispatch, useLabContext } from "../lab-store-context";

import { ShaperVisionAiSection } from "./shaper-vision-ai-section";
import { useVisionCamera } from "./vision-camera";
import { useImageLifecycle } from "./vision-image-lifecycle";
import { VisionLandmarkPreview } from "./vision-landmark-preview";
import { LiveHandsControls } from "./vision-live-hands-controls";

import type { VisionPoseTarget } from "./shaper-vision-ai-section";
import type { DecodedImage, VisionPanelDeps } from "./vision-panel-deps";
import type { LabFailure, LandmarkApplyScope } from "../../../contracts";
import type { LandmarkSpace } from "../../../domains/vision/landmark-space";
import type { LandmarksToPoseResult } from "../../../domains/vision/landmarks-to-pose";
import type { HandDetection, PoseDetection } from "../../../domains/vision/vision-ports";
import type { VisionSession } from "../../../domains/vision/vision-session";

type PoseState =
  | { readonly phase: "idle" }
  | { readonly phase: "working"; readonly step: string }
  | { readonly phase: "ready"; readonly image: DecodedImage; readonly detection: PoseDetection | null; readonly hands: readonly HandDetection[] | null; readonly handFailure: LabFailure | null; readonly inputSource: "photo" | "camera" }
  | { readonly phase: "failed"; readonly failure: LabFailure };
function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

interface PhotoPoseSectionProps {
  readonly session: VisionSession;
  readonly deps: VisionPanelDeps;
  readonly now: () => number;
}

export function PhotoPoseSection({ session, deps, now }: PhotoPoseSectionProps) {
  const dispatch = useDispatch();
  const { store } = useLabContext();
  const ids = useId();
  const [pose, setPose] = useState<PoseState>({ phase: "idle" });
  const [target, setTarget] = useState<VisionPoseTarget>("body");
  const [scope, setScope] = useState<LandmarkApplyScope>("full");
  const [mirror, setMirror] = useState(false);
  const [selfie, setSelfie] = useState(false);
  const [visibilityMin, setVisibilityMin] = useState(LANDMARK_VISIBILITY_MIN);
  const [space, setSpace] = useState<LandmarkSpace>("world");
  const [handSides, setHandSides] = useState<Readonly<Record<number, "left" | "right">>>({});
  const cancelLive = useRef<(() => void) | null>(null);
  const camera = useVisionCamera(deps.openCamera, (failure) => store.applyEvent({ type: "failure", failure }), () => cancelLive.current?.());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mounted = useRef(true);
  const requestEpoch = useRef(0);
  const images = useImageLifecycle();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const stopCamera = useCallback((): void => {
    requestEpoch.current += 1;
    cancelLive.current?.(); camera.close();
    if (mounted.current) setPose((current) => current.phase === "working" ? { phase: "idle" } : current);
  }, [camera.close]);
  useEffect(() => {
    requestEpoch.current += 1;
    images.clear(); setPose({ phase: "idle" });
    return () => { requestEpoch.current += 1; images.clear(); stopCamera(); };
  }, [images, session, stopCamera]);
  useEffect(() => {
    const video = videoRef.current;
    if (video && camera.stream) {
      video.srcObject = camera.stream;
      const expected = camera.stream;
      void video.play?.()?.catch((error: unknown) => camera.fail(toFailure("vision-camera-play-failed", "카메라 영상을 재생하지 못했습니다.", error, now()), expected));
    }
    return () => { if (video) video.srcObject = null; };
  }, [camera.fail, camera.stream, now]);

  const analyze = useCallback(
    async (decode: () => Promise<DecodedImage>, inputSource: "photo" | "camera" = "photo"): Promise<void> => {
      const epoch = ++requestEpoch.current;
      const current = (): boolean => mounted.current && requestEpoch.current === epoch;
      const update = (next: PoseState): void => {
        if (current()) setPose(next);
      };
      let image: DecodedImage | null = null;
      try {
        update({ phase: "working", step: "이미지 디코드" });
        image = await decode();
        if (!current()) { image.releasePreview?.(); return; }
        if (!images.track(image)) return;
        let detection: PoseDetection | null = null;
        if (target === "body") {
          update({ phase: "working", step: "포즈 랜드마커 로드" });
          const poseModel = await session.ensure("poseLandmarker");
          if (!current()) return;
          update({ phase: "working", step: "포즈 추론" });
          detection = await poseModel.port.detect(image.source);
          if (!current()) return;
          if (!detection) throw failVisible("vision-no-person", "사진에서 사람(포즈)을 찾지 못했습니다.", undefined, now());
        }
        let hands: readonly HandDetection[] | null = null;
        let handFailure: LabFailure | null = null;
        try {
          update({ phase: "working", step: "손 랜드마커 로드·추론" });
          const handModel = await session.ensure("handLandmarker");
          if (!current()) return;
          hands = await handModel.port.detect(image.source);
          if (!current()) return;
        } catch (error) {
          if (!current()) return;
          if (target === "hands") throw error;
          handFailure = toFailure("vision-hand-failed", "손 랜드마크 추론에 실패했습니다.", error, now());
        }
        if (target === "hands" && !hands?.length) throw failVisible("vision-no-hands", "사진에서 손을 찾지 못했습니다. 손과 손목이 잘 보이는 사진을 선택해 주세요.", undefined, now());
        setHandSides({});
        update({ phase: "ready", image, detection, hands, handFailure, inputSource });
        if (!detection?.worldLandmarks) setSpace("image");
      } catch (error) {
        if (!current()) return;
        if (image) images.discard(image);
        const failure = toFailure("vision-pose-failed", "사진 포즈 인식에 실패했습니다.", error, now());
        update({ phase: "failed", failure });
        store.applyEvent({ type: "failure", failure });
      } finally {
        // 포즈·손 추정이 끝났으니(성공·실패 모두) 입력 비트맵을 닫는다. 이후에는 width·height·미리보기만 쓴다.
        image?.releaseSource?.();
      }
    },
    [images, now, session, store, target],
  );

  const onFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) { stopCamera(); void analyze(() => deps.decodeImage(file)); }
  };

  const capture = (): void => {
    const video = videoRef.current;
    const captureVideo = deps.captureVideo;
    if (!video || !captureVideo) return;
    cancelLive.current?.();
    void analyze(() => captureVideo(video), "camera");
  };

  const effectiveSpace: LandmarkSpace = pose.phase === "ready" && !pose.detection?.worldLandmarks ? "image" : space;
  const poseResult: LandmarksToPoseResult | null = useMemo(() => {
    if (pose.phase !== "ready" || !pose.detection) return null;
    const landmarks = effectiveSpace === "world" && pose.detection.worldLandmarks ? pose.detection.worldLandmarks : pose.detection.landmarks;
    try {
      return landmarksToPose(landmarks, { scope, mirror, visibilityMin, space: effectiveSpace, aspectRatio: pose.image.width / pose.image.height });
    } catch {
      return null;
    }
  }, [effectiveSpace, mirror, pose, scope, visibilityMin]);

  const applyPose = (): void => {
    if (!poseResult) return;
    dispatch({ type: "pose/set", pose: poseResult.pose, scope, labelKo: `${pose.phase === "ready" && pose.inputSource === "camera" ? "카메라" : "사진"} 포즈(${POSE_SCOPE_LABELS_KO[scope]}${mirror ? ", 거울" : ""})` });
  };

  const sideOf = (index: number, hand: HandDetection): "left" | "right" | null => handSides[index] ?? resolveHandSide(hand.reportedHandedness, { selfie });

  const applyHand = (index: number, hand: HandDetection): void => {
    const side = sideOf(index, hand);
    if (!side) return;
    const result = handLandmarksToPose(hand.landmarks, { side, mirror, space: "image", aspectRatio: pose.phase === "ready" ? pose.image.width / pose.image.height : 1 });
    dispatch({ type: "pose/set", pose: result.pose, scope: result.side === "left" ? "left-hand" : "right-hand", labelKo: `${pose.phase === "ready" && pose.inputSource === "camera" ? "카메라" : "사진"} 손 포즈(${result.side === "left" ? "왼손" : "오른손"})` });
  };

  const bodyOverlay = pose.phase === "ready" && pose.detection ? poseOverlayPlan(pose.detection.landmarks, pose.image.width, pose.image.height, { visibilityMin }) : null;
  const handOverlays = pose.phase === "ready" && pose.hands ? pose.hands.map((hand) => handOverlayPlan(hand.landmarks, pose.image.width, pose.image.height)) : [];
  const overlay = bodyOverlay ?? handOverlays[0] ?? null;

  return (
    <section className="cl-vision-pose" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`}>사진·카메라 포즈 인식</h3>
      <ShaperVisionAiSection target={target} disabled={pose.phase === "working"} onTargetChange={(next) => {
        requestEpoch.current += 1;
        stopCamera();
        images.clear();
        setPose({ phase: "idle" });
        setTarget(next);
      }} />
      <div className="cl-vision-row">
        <label htmlFor={`${ids}-file`}>포즈 사진 파일</label>
        <input id={`${ids}-file`} type="file" accept="image/*" onChange={onFile} disabled={pose.phase === "working"} />
      </div>
      <div className="cl-vision-row cl-vision-camera">
        {deps.openCamera ? (
          camera.stream ? (
            <>
              <video ref={videoRef} className="cl-vision-video" muted playsInline autoPlay aria-label="카메라 미리보기" />
              <button type="button" onClick={capture} disabled={pose.phase === "working" || !deps.captureVideo}>
                촬영
              </button>
              <button type="button" onClick={stopCamera}>
                카메라 닫기
              </button>
            </>
          ) : (
            <button type="button" disabled={camera.opening} onClick={() => void camera.open()}>
              카메라 열기
            </button>
          )
        ) : (
          <>
            <button type="button" disabled>
              카메라 열기
            </button>
            <span className="cl-vision-hint">이 환경은 카메라(getUserMedia)를 지원하지 않습니다.</span>
          </>
        )}
        {camera.failure ? (
          <span className="cl-vision-failure" role="alert">
            {camera.failure.reasonKo}
          </span>
        ) : null}
      </div>
      <LiveHandsControls session={session} deps={deps} enabled={target === "hands"} stream={camera.stream} video={videoRef} cancelRef={cancelLive} onStop={camera.close} />
      {pose.phase === "working" ? (
        <p className="cl-vision-progress" role="status">
          분석 중: {pose.step}
        </p>
      ) : null}
      {pose.phase === "failed" ? (
        <p className="cl-vision-failure" role="alert">
          {pose.failure.reasonKo} ({pose.failure.code})
        </p>
      ) : null}
      {pose.phase === "ready" && overlay ? (
        <div className="cl-vision-pose-result">
          <VisionLandmarkPreview image={pose.image} bodyOverlay={bodyOverlay} handOverlays={handOverlays} />
          <div className="cl-vision-pose-controls">
            {pose.detection ? <div className="cl-vision-row">
              <label htmlFor={`${ids}-scope`}>적용 범위</label>
              <select id={`${ids}-scope`} value={scope} onChange={(event) => setScope(LANDMARK_APPLY_SCOPES.find((candidate) => candidate === event.target.value) ?? "full")}>
                {LANDMARK_APPLY_SCOPES.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {POSE_SCOPE_LABELS_KO[candidate]}
                  </option>
                ))}
              </select>
            </div> : null}
            <div className="cl-vision-row">
              <label htmlFor={`${ids}-mirror`}>거울 모드(사진 속 왼팔 → 캐릭터 오른팔)</label>
              <input id={`${ids}-mirror`} type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} />
            </div>
            <div className="cl-vision-row">
              <label htmlFor={`${ids}-selfie`}>셀피(전면 카메라, 좌우 반전) 사진</label>
              <input id={`${ids}-selfie`} type="checkbox" checked={selfie} onChange={(event) => setSelfie(event.target.checked)} />
            </div>
            {pose.detection ? <div className="cl-vision-row">
              <label htmlFor={`${ids}-visibility`}>가시성 임계</label>
              <input id={`${ids}-visibility`} type="range" min={0} max={1} step={0.05} value={visibilityMin} onChange={(event) => setVisibilityMin(Number(event.target.value))} />
              <output htmlFor={`${ids}-visibility`}>{visibilityMin.toFixed(2)}</output>
            </div> : null}
            {pose.detection ? <div className="cl-vision-row">
              <label htmlFor={`${ids}-space`}>랜드마크 좌표</label>
              <select id={`${ids}-space`} value={effectiveSpace} disabled={!pose.detection?.worldLandmarks} onChange={(event) => setSpace(event.target.value === "image" ? "image" : "world")}>
                <option value="world">월드(미터)</option>
                <option value="image">이미지(정규화)</option>
              </select>
            </div> : null}
            {pose.detection ? <p className="cl-vision-pose-summary" role="status">
              {poseResult
                ? `적용 ${poseResult.appliedBones.length}/${controllableBones(scope).length}본 · 건너뜀 ${poseResult.skippedBones.length}본 · 관절 한계 클램프 ${poseResult.clampedBones.length}본`
                : "포즈 변환 실패"}
            </p> : null}
            {poseResult && poseResult.skippedBones.length > 0 ? (
              <details className="cl-vision-skipped">
                <summary>건너뛴 본(사유)</summary>
                <ul>
                  {poseResult.skippedBones.map((entry) => (
                    <li key={entry.bone}>
                      {entry.bone}: {entry.reasonKo}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {pose.detection ? <button type="button" onClick={applyPose} disabled={!poseResult || poseResult.appliedBones.length === 0}>
              포즈 적용
            </button> : null}
          </div>
          <div className="cl-vision-hands">
            <h4>손 포즈(베타: 굴곡만, 벌림 미적용)</h4>
            {pose.handFailure ? (
              <p className="cl-vision-failure" role="alert">
                {pose.handFailure.reasonKo} ({pose.handFailure.code})
              </p>
            ) : null}
            {pose.hands && pose.hands.length === 0 ? <p className="cl-vision-hint">사진에서 손을 찾지 못했습니다.</p> : null}
            {pose.hands?.map((hand, index) => {
              const side = sideOf(index, hand);
              const sideLabel = side === "left" ? "왼손" : side === "right" ? "오른손" : "미정";
              return (
                <div key={`hand-${index}`} className="cl-vision-hand-item">
                  <span>
                    손 {index + 1}: 모델 보고 {hand.reportedHandedness} → {sideLabel} (점수 {(hand.score * 100).toFixed(0)}%)
                  </span>
                  <label htmlFor={`${ids}-hand-${index}`}>적용 측</label>
                  <select id={`${ids}-hand-${index}`} value={side ?? ""} onChange={(event) => setHandSides((current) => ({ ...current, [index]: event.target.value === "left" ? "left" : "right" }))}>
                    <option value="" disabled>
                      선택
                    </option>
                    <option value="left">왼손</option>
                    <option value="right">오른손</option>
                  </select>
                  <button type="button" disabled={!side} onClick={() => applyHand(index, hand)}>
                    {sideLabel} 포즈 적용
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
