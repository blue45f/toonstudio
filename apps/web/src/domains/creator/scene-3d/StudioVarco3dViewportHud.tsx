/**
 * Studio 3D 에셋 프리뷰 & 뷰포트 인스펙터 플로팅 HUD (`StudioVarco3dViewportHud`).
 *
 * `https://3d.varco.ai/myAssets/:taskId` (`MyAssetViewerPage` / `ViewModeSelector` / `LightingRotationDial` /
 * `ViewHelper` / `StudioModeSelector`)의 UI/UX를 ToonStudio 디자인 토큰(OKLCH 의미 토큰)과
 * Modern Web Guidance(`declarative-dialog-popover-control`, `slider`, `html`) 표준에 맞춰 구현한 컴포넌트입니다.
 */

import {
   Bone,
  Box,
  Camera,
  Eye,
  Grid3x3,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCw,
  Scissors,
  Sparkles,
  Sun,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import { cn } from "@/shared/lib/utils";

import {
  applyVarco3dLightingDialDrag,
  createStudioVarco3dViewportPolicy,
  lightingDialDegToRad,
  lightingRadToDialDeg,
  normalizeLightingRotationRad,
  resolveVarco3dAxisSnapCameraPosition,
  selectStudioVarco3dMapPreviewMode as selectVarco3dMapPreview,
  STUDIO_VARCO3D_ENVIRONMENTS,
  STUDIO_VARCO3D_MAP_CHANNELS as STUDIO_VARCO3D_MAP_CHANNEL_RECORD,
  toggleStudioVarco3dMapPreview as toggleVarco3dMasterMapPreview,
  toggleStudioVarco3dViewMode as toggleVarco3dViewMode,
  type StudioMannequinVec3,
  type StudioVarco3dAxisOrientation,
  type StudioVarco3dEnvironmentId,
  type StudioVarco3dFaceTopology,
  type StudioVarco3dMapPreviewMode,
  type StudioVarco3dStudioMode,
  type StudioVarco3dViewportHudState,
  type StudioVarco3dViewportPolicy,
} from "./studio-varco3d-preview-inspector";

const STUDIO_VARCO3D_STUDIO_MODES: readonly { readonly id: StudioVarco3dStudioMode; readonly labelKo: string }[] = [
  { id: "edit", labelKo: "편집" },
  { id: "remesh", labelKo: "리메시" },
  { id: "pbr", labelKo: "PBR" },
  { id: "animate", labelKo: "애니메이션" },
  { id: "export", labelKo: "내보내기" },
  { id: "bridge", labelKo: "DCC 브리지" },
];
const STUDIO_VARCO3D_AXIS_GIZMO_DIRS: readonly { readonly axis: StudioVarco3dAxisOrientation; readonly labelKo: string }[] = [
  { axis: "+x", labelKo: "우측면" },
  { axis: "-x", labelKo: "좌측면" },
  { axis: "+y", labelKo: "상면" },
  { axis: "-y", labelKo: "하면" },
  { axis: "+z", labelKo: "정면" },
  { axis: "-z", labelKo: "배면" },
];
const STUDIO_VARCO3D_MAP_CHANNELS = Object.values(STUDIO_VARCO3D_MAP_CHANNEL_RECORD);
const STUDIO_VARCO3D_ENVIRONMENT_PRESETS = Object.values(STUDIO_VARCO3D_ENVIRONMENTS);
function buildVarco3dLightingDialTicks(count = 24) {
  return Array.from({ length: count }, (_, index) => ({
    index,
    isCardinal: index % 6 === 0,
    isMajor: index % 3 === 0,
    opacity: index % 6 === 0 ? 0.9 : index % 3 === 0 ? 0.65 : 0.35,
  }));
}
function applyVarco3dLightingDialPointerDelta(state: StudioVarco3dViewportHudState, deltaX: number, widthPx: number): StudioVarco3dViewportHudState {
  return applyVarco3dLightingDialDrag(state, lightingRadToDialDeg(state.lightingRotationRad), (deltaX / Math.max(1, widthPx)) * 360);
}
function computeVarco3dAxisCameraPlacement(opts: { readonly axis: StudioVarco3dAxisOrientation; readonly target: StudioMannequinVec3; readonly distance: number }) {
  return { position: resolveVarco3dAxisSnapCameraPosition(opts.axis, opts.distance, opts.target), lookAt: opts.target };
}
const selectVarco3dStudioMode = (s: StudioVarco3dViewportHudState, studioMode: StudioVarco3dStudioMode): StudioVarco3dViewportHudState => Object.freeze({ ...s, studioMode });
const selectVarco3dFaceTopology = (s: StudioVarco3dViewportHudState, faceTopology: StudioVarco3dFaceTopology): StudioVarco3dViewportHudState => Object.freeze({ ...s, faceTopology });
const selectVarco3dEnvironment = (s: StudioVarco3dViewportHudState, environmentId: StudioVarco3dEnvironmentId): StudioVarco3dViewportHudState => Object.freeze({ ...s, environmentId });
const setVarco3dLightingPopoverOpen = (s: StudioVarco3dViewportHudState, isLightingPopoverOpen: boolean): StudioVarco3dViewportHudState => Object.freeze({ ...s, isLightingPopoverOpen });
const setVarco3dLightingRotationRad = (s: StudioVarco3dViewportHudState, rad: number): StudioVarco3dViewportHudState => Object.freeze({ ...s, lightingRotationRad: normalizeLightingRotationRad(rad) });
const setVarco3dLightingBackgroundVisible = (s: StudioVarco3dViewportHudState, isLightingBackgroundOn: boolean): StudioVarco3dViewportHudState => Object.freeze({ ...s, isLightingBackgroundOn });
const toggleVarco3dLightingAutoRotate = (s: StudioVarco3dViewportHudState): StudioVarco3dViewportHudState => Object.freeze({ ...s, isLightingAutoRotateOn: !s.isLightingAutoRotateOn });
const toggleVarco3dAnimationPlaying = (s: StudioVarco3dViewportHudState): StudioVarco3dViewportHudState => Object.freeze({ ...s, isAnimationPaused: !s.isAnimationPaused });
const toggleVarco3dCameraTracking = (s: StudioVarco3dViewportHudState): StudioVarco3dViewportHudState => Object.freeze({ ...s, isCameraTrackingOn: !s.isCameraTrackingOn });

export interface StudioVarco3dViewportHudProps {
  readonly state: StudioVarco3dViewportHudState;
  readonly onChange: (next: StudioVarco3dViewportHudState) => void;
  readonly policy?: StudioVarco3dViewportPolicy;
  readonly onSnapCameraAxis?: (
    axis: StudioVarco3dAxisOrientation,
    placement: ReturnType<typeof computeVarco3dAxisCameraPlacement>,
  ) => void;
  readonly onCaptureTransparentScreenshot?: () => void;
  readonly className?: string;
}

const DIAL_TICKS = buildVarco3dLightingDialTicks(24);
const DEFAULT_VIEWPORT_POLICY = createStudioVarco3dViewportPolicy();

export function StudioVarco3dViewportHud({
  state,
  onChange,
  policy = DEFAULT_VIEWPORT_POLICY,
  onSnapCameraAxis,
  onCaptureTransparentScreenshot,
  className,
}: StudioVarco3dViewportHudProps): ReactElement {
  const uid = useId();
  const popoverId = `varco3d-lighting-popover-${uid}`;
  const sliderId = `varco3d-lighting-slider-${uid}`;
  const dialTrackRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly startRad: number;
  } | null>(null);
  const [supportsInvokerPopover, setSupportsInvokerPopover] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const hasCommandFor =
      typeof HTMLButtonElement !== "undefined" &&
      "commandForElement" in HTMLButtonElement.prototype;
    const hasPopover =
      typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
    setSupportsInvokerPopover(hasCommandFor && hasPopover);
  }, []);

  const dialDegrees = Math.round(lightingRadToDialDeg(state.lightingRotationRad));

  const handleDialPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    dragStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startRad: state.lightingRotationRad,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleDialPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const width = dialTrackRef.current?.getBoundingClientRect().width ?? 180;
    const deltaX = event.clientX - drag.startX;
    onChange(
      applyVarco3dLightingDialPointerDelta(
        { ...state, lightingRotationRad: drag.startRad },
        deltaX,
        width,
      ),
    );
  };

  const handleDialPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragStartRef.current?.pointerId === event.pointerId) {
      dragStartRef.current = null;
    }
  };

  const handleMapSelect = (mode: StudioVarco3dMapPreviewMode): void => {
    const nextMode = state.mapPreviewMode === mode ? null : mode;
    onChange(selectVarco3dMapPreview(state, policy, nextMode));
  };

  const handleAxisClick = (axis: StudioVarco3dAxisOrientation): void => {
    const placement = computeVarco3dAxisCameraPlacement({
      axis,
      target: { x: 0, y: 0.5, z: 0 },
      distance: 2.5,
    });
    onSnapCameraAxis?.(axis, placement);
  };

  const sliderCustomVars = {
    "--attr-min": 0,
    "--attr-max": 360,
    "--control-value": dialDegrees,
  } as CSSProperties;

  return (
    <section
      aria-label="VARCO 3D 뷰포트 인스펙터 HUD"
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-line bg-panel/90 p-2.5 text-fg shadow-sm backdrop-blur-md",
        className,
      )}
    >
      {/* 상단: 스튜디오 6-모드 스위처 & 6축 ViewHelper 오리엔테이션 바 */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-line pb-2">
        <div
          role="group"
          aria-label="스튜디오 3D 작업 모드"
          className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-card p-1"
        >
          {STUDIO_VARCO3D_STUDIO_MODES.map((m) => {
            const active = state.studioMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange(selectVarco3dStudioMode(state, m.id as StudioVarco3dStudioMode))
                }
                className={cn(
                  "rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
                  active
                    ? "bg-accent text-fg"
                    : "text-fg-3 hover:bg-raised hover:text-fg-2",
                )}
              >
                {m.labelKo}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="6축 카메라 뷰 오리엔테이션 스냅"
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
        >
          {STUDIO_VARCO3D_AXIS_GIZMO_DIRS.map((entry) => (
            <button
              key={entry.axis}
              type="button"
              onClick={() => handleAxisClick(entry.axis)}
              aria-label={`카메라 ${entry.labelKo} (${entry.axis.toUpperCase()}) 스냅`}
              title={`${entry.labelKo} (${entry.axis.toUpperCase()})`}
              className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.64rem] font-bold uppercase text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
            >
              {entry.axis}
            </button>
          ))}
        </div>
      </div>

      {/* 하단 4-그룹 플로팅 뷰포트 컨트롤 바 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* 그룹 1: PBR 맵 채널 인스펙터 (M + B/N/R/M/O) */}
        <div
          role="group"
          aria-label="PBR 맵 채널 인스펙터"
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
        >
          <button
            type="button"
            aria-pressed={state.mapPreviewMode !== null}
            onClick={() => onChange(toggleVarco3dMasterMapPreview(state, policy))}
            title="맵 채널 프리뷰 마스터 토글 (M)"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.mapPreviewMode !== null
                ? "bg-accent-soft/40 text-accent"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Layers size={13} aria-hidden="true" />
            <span>맵 (M)</span>
          </button>
          {STUDIO_VARCO3D_MAP_CHANNELS.map((channel) => {
            const active = state.mapPreviewMode === channel.mode;
            return (
              <button
                key={channel.mode}
                type="button"
                aria-pressed={active}
                aria-label={`${channel.labelKo} (${channel.shortcut.label})`}
                title={`${channel.labelKo} (${channel.shortcut.label})`}
                onClick={() => handleMapSelect(channel.mode)}
                className={cn(
                  "min-w-6 rounded-md px-1.5 py-0.5 text-[0.66rem] font-bold transition-colors",
                  active
                    ? "bg-accent text-fg"
                    : "text-fg-3 hover:bg-raised hover:text-fg-2",
                )}
              >
                {channel.shortLabel}
              </button>
            );
          })}
        </div>

        {/* 그룹 2: 표면 셰이딩 모드 (Texture / Normal / PBR / Cel-Toon) */}
        <div
          role="group"
          aria-label="표면 셰이딩 모드"
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
        >
          <button
            type="button"
            aria-pressed={state.isTextureOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "texture"))}
            title="텍스처 / Matcap 클레이 전환 (T)"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isTextureOn
                ? "bg-accent-soft/40 text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Eye size={13} aria-hidden="true" />
            <span>텍스처</span>
          </button>
          <button
            type="button"
            aria-pressed={state.isNormalMapOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "normalMap"))}
            title="노말 맵 토글 (N)"
            className={cn(
              "rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isNormalMapOn
                ? "bg-accent-soft/40 text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            노말
          </button>
          <button
            type="button"
            aria-pressed={state.isPbrOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "pbr"))}
            title="PBR 라이팅 토글 (P)"
            className={cn(
              "rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isPbrOn
                ? "bg-accent-soft/40 text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            PBR
          </button>
          <button
            type="button"
            aria-pressed={state.isCelToonOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "celToon"))}
            title="웹툰 3단 셀 셰이딩 토글 (L)"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isCelToonOn
                ? "bg-accent-soft/40 text-accent"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>웹툰 셀</span>
          </button>
        </div>

        {/* 그룹 3: 메시 & 리그 오버레이 (Wireframe + Topology / UV Seam / VertexColor / Bone) */}
        <div
          role="group"
          aria-label="메시 및 스켈레톤 오버레이"
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
        >
          <button
            type="button"
            aria-pressed={state.isWireframeOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "wireframe"))}
            title="와이어프레임 토글 (W)"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isWireframeOn
                ? "bg-accent-soft/40 text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Grid3x3 size={13} aria-hidden="true" />
            <span>와이어</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const nextTopo: StudioVarco3dFaceTopology =
                state.faceTopology === "quad" ? "triangle" : "quad";
              onChange(selectVarco3dFaceTopology(state, nextTopo));
            }}
            aria-label={`토폴로지 모드: ${state.faceTopology === "quad" ? "Quad" : "Triangle"}`}
            title="Triangle / Quad 와이어프레임 토폴로지 전환"
            className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[0.64rem] font-bold uppercase text-fg-2 hover:border-accent/50 hover:text-fg"
          >
            {state.faceTopology === "quad" ? "Quad" : "Tri"}
          </button>
          <button
            type="button"
            aria-pressed={state.isUvSeamOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "uvSeam"))}
            title="UV 심(Seam) 라인 오버레이 토글 (U)"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isUvSeamOn
                ? "bg-accent-soft/40 text-accent"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Scissors size={13} aria-hidden="true" />
            <span>UV 심</span>
          </button>
          <button
            type="button"
            aria-pressed={state.isVertexColorOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "vertexColor"))}
            title="버텍스 컬러 오버레이 토글"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isVertexColorOn
                ? "bg-accent-soft/40 text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Box size={13} aria-hidden="true" />
            <span>버텍스</span>
          </button>
          <button
            type="button"
            aria-pressed={state.isBoneOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "bone"))}
            title="스켈레톤 본 계층 시각화 토글 (S)"
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isBoneOn
                ? "bg-accent-soft/40 text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Bone size={13} aria-hidden="true" />
            <span>본 (S)</span>
          </button>
        </div>

        {/* 그룹 4: 라이팅 팝오버 트리거 + 애니메이션/카메라 추적/전체화면/투명 캡처 */}
        <div
          role="group"
          aria-label="조명·카메라 및 유틸리티"
          className="inline-flex items-center gap-1 rounded-xl border border-line bg-card p-1"
        >
          <button
            type="button"
            {...({
              commandfor: popoverId,
              command: "toggle-popover",
              popoverTarget: popoverId,
            } as Record<string, unknown>)}
            aria-expanded={state.isLightingPopoverOpen}
            aria-controls={popoverId}
            onClick={() =>
              onChange(setVarco3dLightingPopoverOpen(state, !state.isLightingPopoverOpen))
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isLightingPopoverOpen
                ? "bg-accent-soft/40 text-accent"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            <Sun size={13} aria-hidden="true" />
            <span>라이팅 ({dialDegrees}°)</span>
          </button>

          <button
            type="button"
            aria-pressed={!state.isAnimationPaused}
            onClick={() => onChange(toggleVarco3dAnimationPlaying(state))}
            aria-label={!state.isAnimationPaused ? "애니메이션 일시정지" : "애니메이션 재생"}
            title="애니메이션 재생/일시정지 (Space)"
            className="rounded-lg p-1.5 text-fg-2 hover:bg-raised hover:text-fg"
          >
            {!state.isAnimationPaused ? (
              <Pause size={13} aria-hidden="true" />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            aria-pressed={state.isCameraTrackingOn}
            onClick={() => onChange(toggleVarco3dCameraTracking(state))}
            title="루트 본 카메라 트래킹 토글 (C)"
            className={cn(
              "rounded-lg px-2 py-1 text-[0.68rem] font-semibold transition-colors",
              state.isCameraTrackingOn
                ? "bg-accent-soft/40 text-fg"
                : "text-fg-3 hover:bg-raised hover:text-fg-2",
            )}
          >
            추적 (C)
          </button>

          {onCaptureTransparentScreenshot ? (
            <button
              type="button"
              onClick={onCaptureTransparentScreenshot}
              aria-label="투명 배경 스크린샷 캡처"
              title="투명 배경 스크린샷 캡처"
              className="rounded-lg p-1.5 text-fg-2 hover:bg-raised hover:text-fg"
            >
              <Camera size={13} aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            aria-pressed={state.isFullScreenOn}
            onClick={() => onChange(toggleVarco3dViewMode(state, policy, "fullScreen"))}
            aria-label={state.isFullScreenOn ? "전체화면 종료 (F)" : "전체화면 전환 (F)"}
            title="전체화면 전환 (F)"
            className="rounded-lg p-1.5 text-fg-2 hover:bg-raised hover:text-fg"
          >
            {state.isFullScreenOn ? (
              <Minimize2 size={13} aria-hidden="true" />
            ) : (
              <Maximize2 size={13} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* 라이팅 & 360° 다이얼 팝오버 (Popover API + inert 접근성 보호) */}
      <div
        id={popoverId}
        role="region"
        aria-label="360도 조명 회전 및 HDRI 환경 설정"
        {...({
          popover: state.isLightingPopoverOpen ? undefined : "auto",
          inert: !state.isLightingPopoverOpen,
        } as Record<string, unknown>)}
        data-invoker-ready={supportsInvokerPopover ? "true" : "false"}
        hidden={!state.isLightingPopoverOpen}
        className={cn(
          "mt-1 rounded-xl border border-line bg-card p-3",
          !state.isLightingPopoverOpen && "hidden",
        )}
      >
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={sliderId} className="text-[0.7rem] font-semibold text-fg">
              조명 수평 회전 다이얼
            </label>
            <span className="font-mono text-[0.7rem] font-bold text-accent">
              {dialDegrees}°
            </span>
          </div>

          {/* 24틱 장식용 SVG 눈금 + 포인터 수평 드래그 트랙 */}
          <div
            ref={dialTrackRef}
            onPointerDown={handleDialPointerDown}
            onPointerMove={handleDialPointerMove}
            onPointerUp={handleDialPointerUp}
            className="relative flex h-8 cursor-ew-resize select-none items-center rounded-lg border border-line bg-panel px-2"
          >
            <svg
              viewBox="0 0 240 24"
              aria-hidden="true"
              className="h-5 w-full overflow-visible text-fg-3"
            >
              {DIAL_TICKS.map((tick) => {
                const x = (tick.index / 23) * 224 + 8;
                const y1 = tick.isCardinal ? 3 : tick.isMajor ? 6 : 8;
                const y2 = tick.isCardinal ? 21 : tick.isMajor ? 18 : 16;
                return (
                  <line
                    key={tick.index}
                    x1={x}
                    y1={y1}
                    x2={x}
                    y2={y2}
                    stroke="currentColor"
                    strokeWidth={tick.isCardinal ? 2 : 1.25}
                    strokeOpacity={Math.max(0.25, tick.opacity)}
                  />
                );
              })}
            </svg>
          </div>

          {/* 네이티브 <input type="range"> 슬라이더 (Modern Web Guidance `slider` 준수) */}
          <input
            id={sliderId}
            type="range"
            min={0}
            max={360}
            step={1}
            value={dialDegrees}
            aria-valuetext={`${dialDegrees}°`}
            style={sliderCustomVars}
            onChange={(event) => {
              const deg = Number(event.currentTarget.value);
              onChange(setVarco3dLightingRotationRad(state, lightingDialDegToRad(deg)));
            }}
            className="h-6 w-full cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />

          {/* 자동 회전 & HDRI 배경 표시 토글 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-pressed={state.isLightingAutoRotateOn}
              onClick={() => onChange(toggleVarco3dLightingAutoRotate(state))}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[0.68rem] font-semibold transition-colors",
                state.isLightingAutoRotateOn
                  ? "border-accent/60 bg-accent-soft/40 text-fg"
                  : "border-line text-fg-3 hover:text-fg-2",
              )}
            >
              <RotateCw size={12} aria-hidden="true" />
              <span>조명 자동 회전</span>
            </button>

            <button
              type="button"
              aria-pressed={state.isLightingBackgroundOn}
              onClick={() =>
                onChange(setVarco3dLightingBackgroundVisible(state, !state.isLightingBackgroundOn))
              }
              className={cn(
                "rounded-lg border px-2 py-1 text-[0.68rem] font-semibold transition-colors",
                state.isLightingBackgroundOn
                  ? "border-accent/60 bg-accent-soft/40 text-fg"
                  : "border-line text-fg-3 hover:text-fg-2",
              )}
            >
              HDRI 배경 표시
            </button>
          </div>

          {/* 4종 HDRI 환경 프리셋 선택기 */}
          <div
            role="group"
            aria-label="HDRI 환경 프리셋"
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
          >
            {STUDIO_VARCO3D_ENVIRONMENT_PRESETS.map((preset) => {
              const active = state.environmentId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange(
                      selectVarco3dEnvironment(state, preset.id as StudioVarco3dEnvironmentId),
                    )
                  }
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[0.66rem] font-semibold transition-colors",
                    active
                      ? "border-accent bg-accent-soft/40 text-fg"
                      : "border-line bg-panel text-fg-2 hover:border-accent/40 hover:text-fg",
                  )}
                >
                  <span className="truncate">{preset.labelKo}</span>
                  <span className="text-[0.6rem] text-fg-3">{preset.defaultIntensity}x</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
