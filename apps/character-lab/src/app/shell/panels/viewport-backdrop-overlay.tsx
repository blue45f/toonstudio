/**
 * SHAPER 창작자 뷰포트 구도 매칭 도구(투명 격자 배경 · 원고 컷 언더레이/오버레이 · 5:8 웹툰 원고 안전 프레임 가이드 ·
 * 0°/35°/90°/180° 4방향 시점 바 · 로우/아이레벨/하이앵글 컷 구도 프리셋) 및 온보딩·관절/형상 제어점 SVG 오버레이 보조 컴포넌트.
 * 파일명을 소문자 하이픈(`viewport-backdrop-overlay.tsx`)으로 두어 `app/composition.ts`의 최상위 패널 규칙을 지킨다.
 */
import { useEffect, useId, useRef } from "react";

import { jointLabelKo } from "./viewport-interactions";

import type { BoneLinkSegment } from "./shaper-bone-gizmo";
import type { ShaperControlPointId, ShaperGizmoMode, ShaperProjectedControlPoint } from "./shaper-control-points";
import type { EngineBackend, JointDragHandle } from "../../../contracts";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";

export type ReferenceCutPlacement = "underlay" | "overlay";
export type ViewportPitchDeg = -18 | 0 | 22;

export interface ViewportTurnaroundPreset {
  readonly id: "front-0" | "quarter-35" | "side-90" | "back-180";
  readonly yawDeg: 0 | 35 | 90 | 180;
  readonly labelKo: string;
}

export interface ViewportPitchPreset {
  readonly id: "low-angle" | "eye-level" | "high-angle";
  readonly pitchDeg: ViewportPitchDeg;
  readonly labelKo: string;
}

export const VIEWPORT_TURNAROUND_PRESETS: readonly ViewportTurnaroundPreset[] = Object.freeze([
  { id: "front-0", yawDeg: 0, labelKo: "0° 정면" },
  { id: "quarter-35", yawDeg: 35, labelKo: "35° 반측면" },
  { id: "side-90", yawDeg: 90, labelKo: "90° 측면" },
  { id: "back-180", yawDeg: 180, labelKo: "180° 후면" },
]);

export const VIEWPORT_DRAMATIC_PITCH_PRESETS: readonly ViewportPitchPreset[] = Object.freeze([
  { id: "low-angle", pitchDeg: -18, labelKo: "로우앵글" },
  { id: "eye-level", pitchDeg: 0, labelKo: "아이레벨" },
  { id: "high-angle", pitchDeg: 22, labelKo: "하이앵글" },
]);

export interface ReferenceCutState {
  readonly url: string;
  readonly fileName: string;
  readonly opacity: number;
  readonly placement: ReferenceCutPlacement;
}

export function clampReferenceOpacity(value: number): number {
  if (!Number.isFinite(value)) return 0.45;
  return Math.min(0.95, Math.max(0.05, value));
}

export interface ViewportBackdropLayerProps {
  readonly checkerboard: boolean;
  readonly manuscriptGuide?: boolean;
  readonly referenceCut: ReferenceCutState | null;
}

const LAYER_BASE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const NO_POINTER_SVG: CSSProperties = {
  ...LAYER_BASE,
  width: "100%",
  height: "100%",
};

const CHECKERBOARD_STYLE: CSSProperties = {
  ...LAYER_BASE,
  zIndex: 0,
  backgroundColor: "#1a2030",
  backgroundImage:
    "linear-gradient(45deg, #273046 25%, transparent 25%), linear-gradient(-45deg, #273046 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #273046 75%), linear-gradient(-45deg, transparent 75%, #273046 75%)",
  backgroundSize: "24px 24px",
  backgroundPosition: "0 0, 0 12px, 12px -12px, -12px 0",
};

/** 캔버스 뒤(투명 격자·언더레이) 및 캔버스 위(오버레이·5:8 웹툰 원고 안전 프레임) 구도 매칭 레이어 */
export function ViewportBackdropLayers({ checkerboard, manuscriptGuide = false, referenceCut }: ViewportBackdropLayerProps) {
  return (
    <>
      {checkerboard ? <div className="cl-viewport-checkerboard" data-testid="viewport-checkerboard" aria-hidden="true" style={CHECKERBOARD_STYLE} /> : null}
      {referenceCut ? (
        <img
          src={referenceCut.url}
          alt={`원고 컷 참조 (${referenceCut.fileName})`}
          className="cl-viewport-reference-cut"
          data-testid="viewport-reference-cut-image"
          data-placement={referenceCut.placement}
          style={{
            ...LAYER_BASE,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: clampReferenceOpacity(referenceCut.opacity),
            zIndex: referenceCut.placement === "overlay" ? 2 : 0,
          }}
        />
      ) : null}
      {manuscriptGuide ? (
        <div
          className="cl-viewport-manuscript-guide"
          data-testid="viewport-manuscript-guide"
          aria-hidden="true"
          style={{
            ...LAYER_BASE,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 16px 24px 16px",
          }}
        >
          <svg
            viewBox="0 0 500 800"
            preserveAspectRatio="xMidYMid meet"
            style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }}
          >
            <rect x="4" y="4" width="492" height="792" fill="none" stroke="rgba(116, 192, 252, 0.85)" strokeWidth="3" rx="6" />
            <rect x="28" y="28" width="444" height="744" fill="none" stroke="rgba(255, 212, 59, 0.55)" strokeWidth="1.5" strokeDasharray="8 6" />
            <line x1="166.7" y1="4" x2="166.7" y2="796" stroke="rgba(116, 192, 252, 0.32)" strokeWidth="1.2" />
            <line x1="333.3" y1="4" x2="333.3" y2="796" stroke="rgba(116, 192, 252, 0.32)" strokeWidth="1.2" />
            <line x1="4" y1="266.7" x2="496" y2="266.7" stroke="rgba(116, 192, 252, 0.32)" strokeWidth="1.2" />
            <line x1="4" y1="533.3" x2="496" y2="533.3" stroke="rgba(116, 192, 252, 0.32)" strokeWidth="1.2" />
          </svg>
        </div>
      ) : null}
    </>
  );
}

export interface ViewportCompositionBarProps {
  readonly engineReady: boolean;
  readonly checkerboard: boolean;
  readonly manuscriptGuide?: boolean;
  readonly activeYawDeg: number | null;
  readonly activePitchDeg?: number | null;
  readonly referenceCut: ReferenceCutState | null;
  readonly onToggleCheckerboard: () => void;
  readonly onToggleManuscriptGuide?: () => void;
  readonly onSelectTurnaround: (yawDeg: 0 | 35 | 90 | 180) => void;
  readonly onSelectPitch?: (pitchDeg: ViewportPitchDeg) => void;
  readonly onLoadReferenceFile: (file: File) => void;
  readonly onChangeReferenceOpacity: (opacity: number) => void;
  readonly onChangeReferencePlacement: (placement: ReferenceCutPlacement) => void;
  readonly onClearReference: () => void;
}

export function ViewportCompositionBar({
  engineReady,
  checkerboard,
  manuscriptGuide = false,
  activeYawDeg,
  activePitchDeg = null,
  referenceCut,
  onToggleCheckerboard,
  onToggleManuscriptGuide,
  onSelectTurnaround,
  onSelectPitch,
  onLoadReferenceFile,
  onChangeReferenceOpacity,
  onChangeReferencePlacement,
  onClearReference,
}: ViewportCompositionBarProps) {
  const ids = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ownedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = ownedUrlRef.current;
    const current = referenceCut?.url ?? null;
    if (prev && prev !== current && prev.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(prev);
    }
    ownedUrlRef.current = current;
  }, [referenceCut?.url]);

  useEffect(
    () => () => {
      const last = ownedUrlRef.current;
      if (last && last.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(last);
      }
    },
    [],
  );

  return (
    <span className="cl-viewport-group" role="group" aria-label="SHAPER 구도·턴어라운드 도구" style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {VIEWPORT_TURNAROUND_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="cl-viewport-button"
          data-testid={`viewport-turnaround-${preset.yawDeg}`}
          aria-pressed={activeYawDeg === preset.yawDeg}
          disabled={!engineReady}
          title={`SHAPER 4방향 캐릭터 설정표 시점 (${preset.labelKo})`}
          onClick={() => onSelectTurnaround(preset.yawDeg)}
        >
          {preset.labelKo}
        </button>
      ))}
      {onSelectPitch
        ? VIEWPORT_DRAMATIC_PITCH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="cl-viewport-button"
              data-testid={`viewport-pitch-${preset.pitchDeg}`}
              aria-pressed={activePitchDeg === preset.pitchDeg}
              disabled={!engineReady}
              title={`웹툰 원고 연출 부감/앙각 프리셋 (${preset.labelKo} ${preset.pitchDeg > 0 ? `+${preset.pitchDeg}°` : `${preset.pitchDeg}°`})`}
              onClick={() => onSelectPitch(preset.pitchDeg)}
            >
              {preset.labelKo}
            </button>
          ))
        : null}
      <button
        type="button"
        className="cl-viewport-button"
        data-testid="viewport-toggle-checkerboard"
        aria-pressed={checkerboard}
        title="SHAPER 투명 배경 작업 모드(체커보드 격자로 실루엣·외곽선 확인)"
        onClick={onToggleCheckerboard}
      >
        투명 격자
      </button>
      {onToggleManuscriptGuide ? (
        <button
          type="button"
          className="cl-viewport-button"
          data-testid="viewport-toggle-manuscript-guide"
          aria-pressed={manuscriptGuide}
          title="세로 스크롤 웹툰 5:8 컷 안전 프레임 및 삼분할 구도선을 표시합니다"
          onClick={onToggleManuscriptGuide}
        >
          원고 컷 가이드
        </button>
      ) : null}
      <button
        type="button"
        className="cl-viewport-button"
        data-testid="viewport-load-reference-cut"
        title="외부 작화 툴의 원고 콘티·배경 컷 이미지를 불러와 캐릭터 구도를 맞춥니다"
        onClick={() => fileInputRef.current?.click()}
      >
        원고 컷 불러오기
      </button>
      <input
        ref={fileInputRef}
        id={`${ids}-ref-file`}
        data-testid="viewport-reference-file-input"
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onLoadReferenceFile(file);
        }}
      />
      {referenceCut ? (
        <>
          <select
            className="cl-viewport-select"
            aria-label="원고 컷 배치"
            data-testid="viewport-reference-placement"
            value={referenceCut.placement}
            onChange={(event) => onChangeReferencePlacement(event.target.value === "overlay" ? "overlay" : "underlay")}
          >
            <option value="underlay">컷 배경(언더레이)</option>
            <option value="overlay">컷 가이드(오버레이)</option>
          </select>
          <label className="cl-viewport-button" htmlFor={`${ids}-ref-opacity`} style={{ gap: 6 }}>
            <span>컷 투명도</span>
            <input
              id={`${ids}-ref-opacity`}
              data-testid="viewport-reference-opacity"
              type="range"
              min={0.1}
              max={0.95}
              step={0.05}
              value={referenceCut.opacity}
              onChange={(event) => onChangeReferenceOpacity(Number(event.target.value))}
              style={{ width: 68 }}
            />
          </label>
          <button type="button" className="cl-viewport-button" data-testid="viewport-clear-reference-cut" onClick={onClearReference}>
            컷 지우기
          </button>
        </>
      ) : null}
    </span>
  );
}

export function ViewportOnboardingCard({ onSelectBackend }: { readonly onSelectBackend: (backend: EngineBackend) => void }) {
  return (
    <div className="cl-viewport-onboarding" data-testid="viewport-onboarding-card" style={{ position: "absolute", inset: "52px 16px 56px 16px", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div className="cl-viewport-onboarding-inner" style={{ pointerEvents: "auto" }}>
        <h2 className="cl-viewport-onboarding-title">빠른 시작 3단계 가이드</h2>
        <p className="cl-viewport-onboarding-desc">렌더 엔진은 자동으로 시작되거나 대체되지 않습니다(ADR-0018). 아래 1단계 버튼으로 엔진을 먼저 시작하세요.</p>
        <ol className="cl-viewport-onboarding-steps">
          <li>
            <strong>1단계: 렌더 엔진 선택</strong> — 환경에 맞는 그래픽 백엔드를 직접 선택합니다.
            <div className="cl-viewport-onboarding-actions" role="group" aria-label="빠른 엔진 시작">
              <button type="button" className="cl-button cl-button--primary" data-testid="onboarding-start-webgpu" onClick={() => onSelectBackend("webgpu")}>WebGPU로 시작</button>
              <button type="button" className="cl-button" data-testid="onboarding-start-webgl2" onClick={() => onSelectBackend("webgl2")}>WebGL2로 시작</button>
            </div>
          </li>
          <li><strong>2단계: 좌측 15슬롯 외형 조합 &amp; 상단 빠른 테마 프리셋 적용</strong> — 체형·얼굴·헤어·의상 슬롯을 고르고 상단 스타일 프리셋으로 셰이딩 분위기를 바꿉니다.</li>
          <li><strong>3단계: 우측 인스펙터에서 체형·표정·포즈·렌더 조절 및 PNG/PSD/GLB 내보내기</strong> — 세부 슬라이더·관절 핸들·페인트 조절 후 결과물을 저장합니다.</li>
        </ol>
      </div>
    </div>
  );
}

export interface ViewportSvgGizmoLayerProps {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly gizmoMode: ShaperGizmoMode;
  readonly viewBox: string | undefined;
  readonly ratio: number;
  readonly showHandles: boolean;
  readonly showControlPoints: boolean;
  readonly skeletonCorrupted: boolean;
  readonly boneLinks: readonly BoneLinkSegment[];
  readonly handles: readonly JointDragHandle[];
  readonly activeHandle: JointDragHandle | null;
  readonly draggingBone: string | null;
  readonly controlPoints: readonly ShaperProjectedControlPoint[];
  readonly draggingCp: ShaperControlPointId | null;
  readonly onHandleDown: (event: ReactPointerEvent<SVGCircleElement>, handle: JointDragHandle) => void;
  readonly onHandleMove: (event: ReactPointerEvent<SVGCircleElement>) => void;
  readonly onHandleUp: (event: ReactPointerEvent<SVGCircleElement>) => void;
  readonly onHandleCancel: (event: ReactPointerEvent<SVGCircleElement>) => void;
  readonly onHandleLostCapture: (event: ReactPointerEvent<SVGCircleElement>) => void;
  readonly onControlPointDown: (event: ReactPointerEvent<SVGCircleElement>, cp: ShaperProjectedControlPoint) => void;
  readonly onControlPointMove: (event: ReactPointerEvent<SVGCircleElement>) => void;
  readonly onControlPointUp: (event: ReactPointerEvent<SVGCircleElement>) => void;
  readonly onControlPointCancel: (event: ReactPointerEvent<SVGCircleElement>) => void;
  readonly onControlPointLostCapture: (event: ReactPointerEvent<SVGCircleElement>) => void;
}

export function ViewportSvgGizmoLayer(props: ViewportSvgGizmoLayerProps) {
  const {
    svgRef, gizmoMode, viewBox, ratio, showHandles, showControlPoints, skeletonCorrupted,
    boneLinks, handles, activeHandle, draggingBone, controlPoints, draggingCp,
    onHandleDown, onHandleMove, onHandleUp, onHandleCancel, onHandleLostCapture,
    onControlPointDown, onControlPointMove, onControlPointUp, onControlPointCancel, onControlPointLostCapture,
  } = props;
  return (
    <svg ref={svgRef} className="cl-viewport-handles" role="group" aria-label="관절 핸들" data-gizmo-mode={gizmoMode} viewBox={viewBox} preserveAspectRatio="none" style={NO_POINTER_SVG}>
      {boneLinks.map((link) => (
        <line key={`${link.fromBone}->${link.toBone}`} className="cl-viewport-bone-link" data-from={link.fromBone} data-to={link.toBone} data-side={link.side} x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} stroke={link.side === "left" ? "rgba(255, 107, 107, 0.72)" : link.side === "right" ? "rgba(77, 171, 247, 0.72)" : "rgba(105, 219, 124, 0.72)"} strokeWidth={Math.max(1.5, 1.8 * ratio)} strokeLinecap="round" />
      ))}
      {activeHandle ? (
        <circle className="cl-viewport-gizmo-ring" data-gizmo-ring={activeHandle.bone} cx={activeHandle.screen[0]} cy={activeHandle.screen[1]} r={22 * Math.max(1, ratio)} fill="none" stroke="rgba(255, 212, 59, 0.9)" strokeWidth={Math.max(1.5, 2 * ratio)} strokeDasharray="4 3" />
      ) : null}
      {showHandles
        ? handles.map((handle) => (
            <circle
              key={handle.bone}
              className="cl-viewport-handle"
              data-bone={handle.bone}
              data-dragging={draggingBone === handle.bone ? "true" : undefined}
              aria-disabled={skeletonCorrupted ? "true" : undefined}
              aria-label={`${jointLabelKo(handle.bone)} 관절 핸들`}
              cx={handle.screen[0]}
              cy={handle.screen[1]}
              r={(draggingBone === handle.bone ? 8 : 6) * Math.max(1, ratio)}
              style={{ pointerEvents: "all", cursor: skeletonCorrupted ? "not-allowed" : draggingBone === handle.bone ? "grabbing" : "grab", touchAction: "none" }}
              onPointerDown={(event) => onHandleDown(event, handle)}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleCancel}
              onLostPointerCapture={onHandleLostCapture}
            >
              <title>{jointLabelKo(handle.bone)}</title>
            </circle>
          ))
        : null}
      {showControlPoints
        ? controlPoints.map((cp) => (
            <circle
              key={cp.id}
              className="cl-viewport-control-point"
              data-control-point={cp.id}
              data-category={cp.category}
              data-dragging={draggingCp === cp.id ? "true" : undefined}
              aria-label={cp.labelKo}
              cx={cp.screen[0]}
              cy={cp.screen[1]}
              r={(draggingCp === cp.id ? 7.5 : 5.5) * Math.max(1, ratio)}
              fill={cp.category === "face" ? "rgba(64, 224, 128, 0.9)" : "rgba(56, 217, 169, 0.88)"}
              stroke="#0b2e13"
              strokeWidth={Math.max(1.2, 1.5 * ratio)}
              style={{ pointerEvents: "all", cursor: "move", touchAction: "none" }}
              onPointerDown={(event) => onControlPointDown(event, cp)}
              onPointerMove={onControlPointMove}
              onPointerUp={onControlPointUp}
              onPointerCancel={onControlPointCancel}
              onLostPointerCapture={onControlPointLostCapture}
            >
              <title>{cp.labelKo}</title>
            </circle>
          ))
        : null}
    </svg>
  );
}
