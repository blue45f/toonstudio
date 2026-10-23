/**
 * Studio 3D 데생 인형 — 카메라·캡처 섹션(웹캠 동작 인식·앵글 프리셋·투영·캡처 배율·캡처).
 *
 * `StudioMannequinPoserPanel.tsx`에서 분리한 표시 섹션이다. 상태는 패널이 소유하고 props로 받는다.
 * 앵글 프리셋 6개는 원근·직교 칩과 같은 선택 칩(aria-pressed)이라 지금 고른 앵글이 보이고,
 * 궤도 회전·이동·부위 확대로 화면이 프리셋에서 벗어나면 패널이 선택을 푼다(selectedCameraAngle=null).
 */

import { Camera, FlipHorizontal2, Hand, Loader2, Lock, RotateCcw, ScanFace, Unlock, Video } from "lucide-react";
import type { ReactElement } from "react";

import { frozenStatus2Text } from "../status-i18n/studio-frozen2-status-i18n";
import { StudioSectionHeader, StudioToggleChip } from "../studio-panel-ui";
import type { StudioMannequinCameraPreset, StudioMannequinProjection } from "./studio-mannequin-scene";

import { buttonClass } from "@/shared/components/ui/button-utils";

/** 웹캠 동작 인식 준비 단계(엔진 내려받기 → 카메라 권한). null이면 준비 중이 아니다. */
export type StudioMannequinWebcamLoadingStage = "engine" | "camera" | null;

const CAPTURE_SCALES = [1, 2, 3] as const;

export function StudioMannequinCameraSection({
  projection,
  onProjectionChange,
  captureScale,
  onCaptureScaleChange,
  onCameraPreset,
  selectedCameraAngle = null,
  onResetCamera,
  onCapture,
  capturing,
  captureDisabled = false,
  captureLabel = "캔버스로 캡처",
  webcamActive,
  webcamLoadingStage,
  webcamError,
  onToggleWebcam,
  poseFrozen = false,
  onTogglePoseFreeze,
  mirrorMode = true,
  onToggleMirrorMode,
  handTracking = false,
  onToggleHandTracking,
  handTrackingLoading = false,
  handTrackingError = null,
  facialTracking = true,
  onToggleFacialTracking,
}: {
  projection: StudioMannequinProjection;
  onProjectionChange: (projection: StudioMannequinProjection) => void;
  captureScale: number;
  onCaptureScaleChange: (scale: number) => void;
  onCameraPreset: (preset: "front" | "side" | "back" | "top" | "high" | "low") => void;
  /** 마지막으로 고른 앵글. 궤도 회전·리셋 뒤에는 null(어떤 칩도 선택되지 않음). */
  selectedCameraAngle?: StudioMannequinCameraPreset | null;
  onResetCamera: () => void;
  onCapture: () => void;
  capturing: boolean;
  captureDisabled?: boolean;
  captureLabel?: string;
  webcamActive: boolean;
  webcamLoadingStage: StudioMannequinWebcamLoadingStage;
  webcamError: string | null;
  onToggleWebcam: () => void;
  poseFrozen?: boolean;
  onTogglePoseFreeze?: () => void;
  mirrorMode?: boolean;
  onToggleMirrorMode?: () => void;
  handTracking?: boolean;
  onToggleHandTracking?: () => void;
  handTrackingLoading?: boolean;
  handTrackingError?: string | null;
  facialTracking?: boolean;
  onToggleFacialTracking?: () => void;
}): ReactElement {
  const webcamLoading = webcamLoadingStage !== null;

  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="카메라·캡처"
        description="드래그 = 회전, 휠 = 줌, 우클릭 드래그 = 이동."
        action={
          <button
            type="button"
            onClick={onResetCamera}
            className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
            title="카메라 초기 위치로"
          >
            <RotateCcw size={13} aria-hidden /> 리셋
          </button>
        }
      />
      <div className="space-y-1">
        <span className="text-xs text-fg-2">실시간 웹캠 동작 인식 (Live Motion Tracking)</span>
        <button
          type="button"
          onClick={onToggleWebcam}
          aria-pressed={webcamActive}
          aria-busy={webcamLoading}
          className={buttonClass({
            size: "sm",
            variant: webcamActive ? "solid" : "quiet",
            className: "w-full justify-center gap-1.5",
          })}
        >
          {webcamLoading ? (
            <Loader2 size={13} className="animate-spin" aria-hidden />
          ) : (
            <Video size={13} aria-hidden />
          )}
          {webcamLoading
            ? webcamLoadingStage === "engine"
              ? "엔진 준비 취소"
              : "카메라 연결 취소"
            : webcamActive
              ? "실시간 동작 인식 중지"
              : webcamError
                ? "웹캠 동작 인식 다시 시도"
                : "웹캠 실시간 동작 인식 시작"}
        </button>

        {webcamLoadingStage === "engine" ? (
          <p role="status" className="mt-1 text-[0.7rem] leading-relaxed text-fg-3">
            동작 인식 엔진을 준비하고 있습니다. 처음 실행할 때는 모델을 내려받아 잠시 걸릴 수 있습니다.
          </p>
        ) : webcamLoadingStage === "camera" ? (
          <p role="status" className="mt-1 text-[0.7rem] leading-relaxed text-fg-3">
            엔진 준비 완료. 브라우저의 카메라 권한을 허용해 주세요. 권한 창이 보이지 않으면 주소창의 카메라 아이콘을 확인하세요.
          </p>
        ) : null}

        {webcamActive && (
          <div className="grid grid-cols-2 gap-1 pt-1.5" role="group" aria-label="모션 캡처 옵션">
            <button
              type="button"
              onClick={onTogglePoseFreeze}
              className={buttonClass({
                size: "sm",
                variant: poseFrozen ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              {poseFrozen ? <Lock size={13} aria-hidden /> : <Unlock size={13} aria-hidden />}
              {poseFrozen ? "포즈 고정됨" : "포즈 고정"}
            </button>
            <button
              type="button"
              onClick={onToggleMirrorMode}
              className={buttonClass({
                size: "sm",
                variant: mirrorMode ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              <FlipHorizontal2 size={13} aria-hidden />
              {mirrorMode ? "좌우 반전 ON" : "좌우 반전"}
            </button>
            <button
              type="button"
              onClick={onToggleHandTracking}
              aria-pressed={handTracking}
              aria-busy={handTrackingLoading}
              title={frozenStatus2Text("studio.frozenStatus2.mannequin.handTrackingTitle", "웹캠에서 손을 인식해 손목 방향을 실시간으로 반영합니다. 손 인식 엔진 준비에 실패해도 신체 동작 인식은 계속됩니다.")}
              className={buttonClass({
                size: "sm",
                variant: handTracking ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              {handTrackingLoading ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Hand size={13} aria-hidden />
              )}
              {handTrackingLoading
                ? frozenStatus2Text("studio.frozenStatus2.mannequin.handPreparing", "손 인식 준비 중")
                : handTracking
                  ? "라이브 손 트래킹 ON"
                  : "라이브 손 트래킹"}
            </button>
            <button
              type="button"
              onClick={onToggleFacialTracking}
              className={buttonClass({
                size: "sm",
                variant: facialTracking ? "solid" : "quiet",
                className: "text-[0.7rem] justify-center gap-1",
              })}
            >
              <ScanFace size={13} aria-hidden />
              {facialTracking ? "표정 맵핑 ON" : "표정 맵핑"}
            </button>
          </div>
        )}

        {webcamError ? (
          <p role="alert" className="mt-1 text-[0.7rem] leading-relaxed text-danger">
            {webcamError}
          </p>
        ) : null}
        {handTrackingError ? (
          <p role="alert" className="mt-1 text-[0.7rem] leading-relaxed text-danger">
            {handTrackingError}
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <span className="text-xs text-fg-2">카메라 앵글 프리셋</span>
        {/* 원근·직교 칩과 같은 선택 칩 — 고른 앵글이 눌린 상태(aria-pressed)로 남는다. 궤도 회전 뒤에는 풀린다. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="카메라 앵글">
          {([["front", "정면"], ["side", "측면"], ["back", "후면"], ["top", "탑뷰"], ["high", "하이앵글"], ["low", "로우앵글"]] as const).map(([id, label]) => (
            <StudioToggleChip key={id} active={selectedCameraAngle === id} onClick={() => onCameraPreset(id)}>
              {label}
            </StudioToggleChip>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="투영 방식">
        <StudioToggleChip
          active={projection === "perspective"}
          onClick={() => onProjectionChange("perspective")}
        >
          원근
        </StudioToggleChip>
        <StudioToggleChip
          active={projection === "orthographic"}
          onClick={() => onProjectionChange("orthographic")}
        >
          직교
        </StudioToggleChip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="캡처 배율">
        <span className="text-xs text-fg-2">캡처 배율</span>
        {CAPTURE_SCALES.map((scale) => (
          <StudioToggleChip
            key={scale}
            active={captureScale === scale}
            onClick={() => onCaptureScaleChange(scale)}
          >
            {scale}x
          </StudioToggleChip>
        ))}
      </div>
      <button
        type="button"
        onClick={onCapture}
        disabled={capturing || captureDisabled}
        title={captureDisabled ? "SQLite 저장 상태를 확인한 뒤 캡처할 수 있습니다." : undefined}
        className={buttonClass({ size: "md", variant: "solid", className: "w-full gap-1.5" })}
      >
        {capturing ? (
          <Loader2 size={15} className="animate-spin" aria-hidden />
        ) : (
          <Camera size={15} aria-hidden />
        )}
        {captureLabel}
      </button>
    </div>
  );
}
