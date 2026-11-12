/**
 * Studio 3D 데생 인형 v5 — 체형(에코르셰·웹툰 원형·호흡 확장·.3dp) 및 관절(잠금·견갑상완 리듬·동세선·콘트라포스토·손발 신체/바닥 밀착·시선 응시·무게중심·키보드/터치 2D 핸드 패드·.pep) 섹션.
 *
 * 정적 연결 게이트(`check-unconnected-code`) 준수를 위해 실제 JSX에 마운트되는 두 섹션 컴포넌트만 export 하며,
 * 모든 조작 컨트롤에 모바일 44px 터치 타깃(`pointer-coarse:min-h-11`)과 키보드 포커스 링(`STUDIO_FOCUS_RING`)을 보장한다.
 */

import { Compass, Download, Eye, Hand, Lock, RotateCcw, Scale, Sparkles, Unlock, Upload } from "lucide-react";
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";

import {
  STUDIO_FOCUS_RING,
  StudioPanelChip,
  StudioSectionHeader,
  StudioSliderRow,
  StudioToggleChip,
} from "../studio-panel-ui";

import {
  STUDIO_MANNEQUIN_FIST_STYLES,
  STUDIO_MANNEQUIN_SURFACE_MODES,
  resolveStudioMannequinHandPadPose,
  type StudioMannequinFistStyleId,
  type StudioMannequinHandPadOutput,
  type StudioMannequinSurfaceMode,
} from "./studio-mannequin-ecorche-anatomy";
import {
  STUDIO_MANNEQUIN_HAND_CONTACT_TARGETS,
  type StudioMannequinGestureAnalysis,
  type StudioMannequinHandContactTargetId,
} from "./studio-mannequin-gesture-dynamics";
import {
  STUDIO_MANNEQUIN_ANATOMY_PARAM_RANGES,
  STUDIO_MANNEQUIN_ARCHETYPE_PRESETS,
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_HEAD_PARAM_RANGES,
  STUDIO_MANNEQUIN_HEAD_PRESETS,
  STUDIO_MANNEQUIN_JOINT_IDS,
  STUDIO_MANNEQUIN_JOINT_LABELS,
  STUDIO_MANNEQUIN_MATERIAL_STYLES,
  STUDIO_MANNEQUIN_PARAM_RANGES,
  clampStudioMannequinBodyParams,
  getStudioMannequinJointLimit,
  type StudioMannequinAnatomyParamKey,
  type StudioMannequinArchetypePresetId,
  type StudioMannequinBodyParams,
  type StudioMannequinBodyPresetId,
  type StudioMannequinCoreParamKey,
  type StudioMannequinHeadParamKey,
  type StudioMannequinHeadPresetId,
  type StudioMannequinJointId,
  type StudioMannequinMaterialStyle,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
  countStudioMannequinLockedJoints,
  type StudioMannequinBalanceReport,
  type StudioMannequinGuideVisibility,
  type StudioMannequinJointLockMap,
} from "./studio-mannequin-pro-kinematics";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const TOUCH_OUTLINE_BTN = "gap-1 text-xs pointer-coarse:min-h-11 pointer-coarse:px-3";

const BODY_SLIDERS: readonly {
  key: StudioMannequinCoreParamKey;
  label: string;
  step: number;
  format: (v: number) => string;
}[] = Object.freeze([
  { key: "heightCm", label: "신장", step: 1, format: (v) => `${Math.round(v)}cm` },
  { key: "headCount", label: "두신 비율", step: 0.1, format: (v) => `${v.toFixed(1)}등신` },
  { key: "shoulderWidth", label: "어깨 너비", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "pelvisWidth", label: "골반 너비", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "armLength", label: "팔 길이", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "legLength", label: "다리 비율", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  {
    key: "build",
    label: "체형 블렌드",
    step: 0.1,
    format: (v) => (v < 0.5 ? "마른" : v < 1.5 ? "표준" : v < 2.5 ? "근육" : "통통"),
  },
]);

const ANATOMY_SLIDERS: readonly { key: StudioMannequinAnatomyParamKey; label: string; step: number }[] = Object.freeze([
  { key: "torsoDepth", label: "몸통 깊이", step: 0.02 },
  { key: "chestWidth", label: "흉곽 너비", step: 0.02 },
  { key: "pelvisDepth", label: "골반 깊이", step: 0.02 },
  { key: "waistWidth", label: "허리 너비", step: 0.02 },
  { key: "limbThickness", label: "사지 전체 굵기", step: 0.02 },
  { key: "upperArmThickness", label: "상완 굵기", step: 0.02 },
  { key: "forearmThickness", label: "전완 굵기", step: 0.02 },
  { key: "thighThickness", label: "허벅지 굵기", step: 0.02 },
  { key: "calfThickness", label: "종아리 굵기", step: 0.02 },
  { key: "handScale", label: "손 크기", step: 0.02 },
  { key: "footScale", label: "발 크기", step: 0.02 },
  { key: "neckThickness", label: "목 굵기", step: 0.02 },
]);

const HEAD_SLIDERS: readonly {
  key: keyof StudioMannequinBodyParams;
  label: string;
  step: number;
  format: (v: number) => string;
}[] = Object.freeze([
  { key: "faceWidth", label: "턱/얼굴 너비", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "chinLength", label: "턱 길이", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "eyeScale", label: "눈 크기/비율", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
  { key: "noseHeight", label: "코 높이", step: 0.02, format: (v) => `${Math.round(v * 100)}%` },
]);

const BALANCE_LABELS: Readonly<
  Record<StudioMannequinBalanceReport["state"], { label: string; tone: string }>
> = Object.freeze({
  balanced: { label: "균형 안정", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" },
  edge: { label: "지지 경계", tone: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  "off-balance": { label: "전도 위험", tone: "border-rose-500/40 bg-rose-500/10 text-rose-400" },
  airborne: { label: "공중·도약", tone: "border-sky-500/40 bg-sky-500/10 text-sky-400" },
});

export function StudioMannequinBodySection({
  params,
  materialStyle,
  surfaceMode = "ecorche",
  pectoralVolume = 1,
  muscleDefinition = 1,
  breathPhase = 0,
  onParamsChange,
  onApplyPreset,
  onApplyArchetype,
  onMaterialStyleChange,
  onSurfaceModeChange,
  onPectoralVolumeChange,
  onMuscleDefinitionChange,
  onBreathPhaseChange,
  onImportCsp3dp,
  onExportCsp3dp,
}: {
  readonly params: StudioMannequinBodyParams;
  readonly materialStyle: StudioMannequinMaterialStyle;
  readonly surfaceMode?: StudioMannequinSurfaceMode;
  readonly pectoralVolume?: number;
  readonly muscleDefinition?: number;
  readonly breathPhase?: number;
  readonly onParamsChange: (next: StudioMannequinBodyParams) => void;
  readonly onApplyPreset: (presetId: StudioMannequinBodyPresetId) => void;
  readonly onApplyArchetype?: (presetId: StudioMannequinArchetypePresetId) => void;
  readonly onMaterialStyleChange: (style: StudioMannequinMaterialStyle) => void;
  readonly onSurfaceModeChange?: (mode: StudioMannequinSurfaceMode) => void;
  readonly onPectoralVolumeChange?: (next: number) => void;
  readonly onMuscleDefinitionChange?: (next: number) => void;
  readonly onBreathPhaseChange?: (next: number) => void;
  readonly onImportCsp3dp?: () => void;
  readonly onExportCsp3dp?: () => void;
}): ReactElement {
  return (
    <div className="space-y-4">
      {onApplyArchetype ? (
        <div className="space-y-1.5 rounded-xl border border-accent/25 bg-accent-soft/25 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-fg-2">
              <Sparkles size={13} className="text-accent" aria-hidden /> 웹툰 캐릭터 원형 프리셋
            </span>
            <span className="text-[0.7rem] text-fg-3">23종 해부·두상 통합</span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="웹툰 캐릭터 원형 프리셋">
            {(Object.keys(STUDIO_MANNEQUIN_ARCHETYPE_PRESETS) as StudioMannequinArchetypePresetId[]).map((id) => (
              <StudioPanelChip key={id} onClick={() => onApplyArchetype(id)} title={STUDIO_MANNEQUIN_ARCHETYPE_PRESETS[id].desc}>
                {STUDIO_MANNEQUIN_ARCHETYPE_PRESETS[id].label}
              </StudioPanelChip>
            ))}
          </div>
        </div>
      ) : null}

      <StudioSectionHeader title="체형 프리셋" description="다양한 등신 비율 및 신장 파라미터를 선택하세요." />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="체형 프리셋">
        {(Object.keys(STUDIO_MANNEQUIN_BODY_PRESETS) as StudioMannequinBodyPresetId[]).map((presetId) => (
          <StudioPanelChip
            key={presetId}
            onClick={() => onApplyPreset(presetId)}
            title={`${STUDIO_MANNEQUIN_BODY_PRESETS[presetId].label} 체형 프리셋 적용`}
          >
            {STUDIO_MANNEQUIN_BODY_PRESETS[presetId].label}
          </StudioPanelChip>
        ))}
      </div>

      {onSurfaceModeChange ? (
        <div className="space-y-2 rounded-xl border border-line/70 bg-card/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-fg-2">에코르셰 조형 모드</span>
            <span className="text-[0.7rem] text-accent">v5 연속 스키닝</span>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="에코르셰 조형 모드">
            {STUDIO_MANNEQUIN_SURFACE_MODES.map((mode) => (
              <StudioToggleChip key={mode.id} active={surfaceMode === mode.id} onClick={() => onSurfaceModeChange(mode.id)} title={mode.desc}>
                {mode.label}
              </StudioToggleChip>
            ))}
          </div>
          <div className="space-y-1.5 pt-1">
            {surfaceMode !== "standard" && onMuscleDefinitionChange ? (
              <StudioSliderRow
                label="근육 선명도"
                min={0}
                max={1.5}
                step={0.05}
                value={muscleDefinition}
                onChange={onMuscleDefinitionChange}
                readout={`${Math.round(muscleDefinition * 100)}%`}
              />
            ) : null}
            {surfaceMode !== "standard" && onPectoralVolumeChange ? (
              <StudioSliderRow
                label="대흉근 볼륨"
                min={0.75}
                max={1.4}
                step={0.05}
                value={pectoralVolume}
                onChange={onPectoralVolumeChange}
                readout={`${Math.round(pectoralVolume * 100)}%`}
              />
            ) : null}
            {onBreathPhaseChange ? (
              <StudioSliderRow
                label="흉곽 호흡 확장"
                min={-1}
                max={1}
                step={0.05}
                value={breathPhase}
                onChange={onBreathPhaseChange}
                readout={breathPhase > 0.05 ? `들숨 +${Math.round(breathPhase * 100)}%` : breathPhase < -0.05 ? `날숨 ${Math.round(breathPhase * 100)}%` : "평상시"}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5 pt-1">
        <span className="text-xs font-semibold text-fg-2">재질·표면 스타일</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="재질 스타일">
          {STUDIO_MANNEQUIN_MATERIAL_STYLES.map((style) => (
            <StudioToggleChip key={style.id} active={materialStyle === style.id} onClick={() => onMaterialStyleChange(style.id)} title={style.desc}>
              {style.label}
            </StudioToggleChip>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <span className="text-xs font-semibold text-fg-2">세부 체형 조절</span>
        {BODY_SLIDERS.map(({ key, label, step, format }) => {
          const [min, max] = STUDIO_MANNEQUIN_PARAM_RANGES[key];
          return (
            <StudioSliderRow
              key={key}
              label={label}
              min={min}
              max={max}
              step={step}
              value={params[key]}
              onChange={(next) => onParamsChange(clampStudioMannequinBodyParams({ ...params, [key]: next }))}
              readout={format(params[key])}
            />
          );
        })}
      </div>

      <div className="space-y-3 border-t border-line/60 pt-3">
        <StudioSectionHeader
          title="해부학 비례"
          description="흉곽·골반 깊이와 상완·전완·허벅지·종아리를 독립 조절해 같은 등신에서도 실제 인체에 가까운 테이퍼와 질량 분포를 만듭니다."
        />
        <div className="space-y-2">
          {ANATOMY_SLIDERS.map(({ key, label, step }) => {
            const [min, max] = STUDIO_MANNEQUIN_ANATOMY_PARAM_RANGES[key];
            const value = params[key] ?? 1;
            return (
              <StudioSliderRow
                key={key}
                label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(next) => onParamsChange(clampStudioMannequinBodyParams({ ...params, [key]: next }))}
                readout={`${Math.round(value * 100)}%`}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-3 border-t border-line/60 pt-3">
        <StudioSectionHeader title="얼굴 비율" description="웹툰·애니 스타일의 머리 형태와 턱선·눈·코 비율을 조절합니다." />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="헤드 프리셋">
          {(Object.keys(STUDIO_MANNEQUIN_HEAD_PRESETS) as StudioMannequinHeadPresetId[]).map((headId) => (
            <StudioPanelChip
              key={headId}
              onClick={() => onParamsChange(clampStudioMannequinBodyParams({ ...params, ...STUDIO_MANNEQUIN_HEAD_PRESETS[headId].params }))}
              title={`${STUDIO_MANNEQUIN_HEAD_PRESETS[headId].label} 헤드 프리셋 적용`}
            >
              {STUDIO_MANNEQUIN_HEAD_PRESETS[headId].label}
            </StudioPanelChip>
          ))}
        </div>
        <div className="space-y-2">
          {HEAD_SLIDERS.map(({ key, label, step, format }) => {
            const [min, max] = STUDIO_MANNEQUIN_HEAD_PARAM_RANGES[key as StudioMannequinHeadParamKey];
            const value = (params[key] as number | undefined) ?? 1.0;
            return (
              <StudioSliderRow
                key={key}
                label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(next) => onParamsChange(clampStudioMannequinBodyParams({ ...params, [key]: next }))}
                readout={format(value)}
              />
            );
          })}
        </div>
      </div>

      {onImportCsp3dp || onExportCsp3dp ? (
        <div className="space-y-2 border-t border-line/60 pt-3">
          <StudioSectionHeader title="클립스튜디오 체형(.3dp) 호환" description="CLIP STUDIO PAINT 체형 소재(.3dp XML)를 불러오거나 내보냅니다." />
          <div className="flex flex-wrap gap-1.5">
            {onImportCsp3dp ? (
              <button type="button" onClick={onImportCsp3dp} className={buttonClass({ size: "sm", variant: "outline", className: TOUCH_OUTLINE_BTN })}>
                <Upload size={13} aria-hidden /> .3dp 체형 가져오기
              </button>
            ) : null}
            {onExportCsp3dp ? (
              <button type="button" onClick={onExportCsp3dp} className={buttonClass({ size: "sm", variant: "outline", className: TOUCH_OUTLINE_BTN })}>
                <Download size={13} aria-hidden /> .3dp 체형 내보내기
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HandSetupPad2D({
  onApplyHandPad,
}: {
  readonly onApplyHandPad: (side: "left" | "right" | "both", output: StudioMannequinHandPadOutput) => void;
}): ReactElement {
  const padRef = useRef<HTMLDivElement | null>(null);
  const [side, setSide] = useState<"left" | "right" | "both">("both");
  const [fistStyle, setFistStyle] = useState<StudioMannequinFistStyleId>("standard");
  const [spread, setSpread] = useState(0.15);
  const [clench, setClench] = useState(0.18);
  const [thumbOpposition, setThumbOpposition] = useState(0.2);

  const emitFromCoords = (nextSpread: number, nextClench: number, nextOpp: number, nextStyle: StudioMannequinFistStyleId) => {
    onApplyHandPad(
      side,
      resolveStudioMannequinHandPadPose({
        spread: nextSpread,
        clench: nextClench,
        thumbOpposition: nextOpp,
        fistStyle: nextStyle,
      }),
    );
  };

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const nextSpread = Math.round((-0.25 + nx * 1.25) * 100) / 100;
    const nextClench = Math.round(ny * 100) / 100;
    setSpread(nextSpread);
    setClench(nextClench);
    emitFromCoords(nextSpread, nextClench, thumbOpposition, fistStyle);
  };

  const handlePadKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.02 : 0.08;
    let nextSpread = spread;
    let nextClench = clench;
    if (event.key === "ArrowRight") nextSpread = Math.min(1, Math.round((spread + step) * 100) / 100);
    else if (event.key === "ArrowLeft") nextSpread = Math.max(-0.25, Math.round((spread - step) * 100) / 100);
    else if (event.key === "ArrowDown") nextClench = Math.min(1, Math.round((clench + step) * 100) / 100);
    else if (event.key === "ArrowUp") nextClench = Math.max(0, Math.round((clench - step) * 100) / 100);
    else if (event.key === "Home") {
      nextSpread = 0;
      nextClench = 0;
    } else if (event.key === "End") {
      nextClench = 1;
    } else {
      return;
    }
    event.preventDefault();
    setSpread(nextSpread);
    setClench(nextClench);
    emitFromCoords(nextSpread, nextClench, thumbOpposition, fistStyle);
  };

  const cursorLeftPct = ((spread + 0.25) / 1.25) * 100;
  const cursorTopPct = clench * 100;

  return (
    <div className="space-y-2 rounded-xl border border-line/70 bg-card/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold text-fg-2">
          <Hand size={13} className="text-accent" aria-hidden /> 2D 핸드 셋업 패드
        </span>
        <div className="flex gap-1" role="group" aria-label="핸드 패드 대상 손">
          {([["left", "왼손"], ["right", "오른손"], ["both", "양손"]] as const).map(([id, label]) => (
            <StudioToggleChip key={id} active={side === id} onClick={() => setSide(id)}>
              {label}
            </StudioToggleChip>
          ))}
        </div>
      </div>

      <div
        ref={padRef}
        role="slider"
        tabIndex={0}
        aria-label="2D 핸드 셋업 패드 — 좌우 화살표로 손가락 벌림, 상하 화살표로 주먹 쥐기 조절"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clench * 100)}
        aria-valuetext={`벌림 ${Math.round(spread * 100)}%, 쥐기 ${Math.round(clench * 100)}%`}
        onKeyDown={handlePadKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) updateFromPointer(e);
        }}
        className={cn(
          "relative h-28 w-full cursor-crosshair select-none rounded-lg border border-line bg-canvas/70 touch-none pointer-coarse:h-36",
          STUDIO_FOCUS_RING,
        )}
      >
        <span className="pointer-events-none absolute left-2 top-1.5 text-[0.68rem] text-fg-3">모으기 · 편 손</span>
        <span className="pointer-events-none absolute right-2 top-1.5 text-[0.68rem] text-fg-3">최대 벌림</span>
        <span className="pointer-events-none absolute bottom-1.5 left-2 text-[0.68rem] text-fg-3">주먹 쥐기</span>
        <span className="pointer-events-none absolute bottom-1.5 right-2 text-[0.68rem] text-fg-3">갈퀴·파지</span>
        <div
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-accent shadow pointer-coarse:size-5"
          style={{ left: `${cursorLeftPct}%`, top: `${cursorTopPct}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="주먹 변형 스타일">
        {STUDIO_MANNEQUIN_FIST_STYLES.map((style) => (
          <StudioToggleChip
            key={style.id}
            active={fistStyle === style.id}
            onClick={() => {
              setFistStyle(style.id);
              emitFromCoords(spread, clench, thumbOpposition, style.id);
            }}
            title={style.desc}
          >
            {style.label}
          </StudioToggleChip>
        ))}
      </div>

      <StudioSliderRow
        label="엄지 대립(맞섬)"
        min={0}
        max={1}
        step={0.05}
        value={thumbOpposition}
        onChange={(next) => {
          setThumbOpposition(next);
          emitFromCoords(spread, clench, next, fistStyle);
        }}
        readout={`${Math.round(thumbOpposition * 100)}%`}
      />
    </div>
  );
}

export function StudioMannequinJointSection({
  selectedJointId,
  rotation,
  noJointSelectedText = "선택된 관절이 없습니다. 뷰포트의 마네킹을 클릭하면 해당 부위 관절이 선택됩니다.",
  jointLocks = {},
  scapulohumeralRhythm = true,
  guideVisibility = STUDIO_MANNEQUIN_DEFAULT_GUIDE_VISIBILITY,
  balanceReport,
  gestureAnalysis,
  onSelectJoint,
  onRotate,
  onResetJoint,
  onToggleJointLock,
  onClearAllJointLocks,
  onToggleScapulohumeralRhythm,
  onGuideVisibilityChange,
  onAutoBalance,
  onApplyContrapposto,
  onApplyHandContact,
  onLookAtCamera,
  onApplyHandPad,
  onImportCspPep,
  onExportCspPep,
}: {
  readonly selectedJointId: StudioMannequinJointId | null;
  readonly rotation: StudioMannequinVec3;
  readonly noJointSelectedText?: string;
  readonly jointLocks?: StudioMannequinJointLockMap;
  readonly scapulohumeralRhythm?: boolean;
  readonly guideVisibility?: StudioMannequinGuideVisibility;
  readonly balanceReport?: StudioMannequinBalanceReport;
  readonly gestureAnalysis?: StudioMannequinGestureAnalysis;
  readonly onSelectJoint: (jointId: StudioMannequinJointId) => void;
  readonly onRotate: (rotation: StudioMannequinVec3) => void;
  readonly onResetJoint: () => void;
  readonly onToggleJointLock?: (jointId: StudioMannequinJointId) => void;
  readonly onClearAllJointLocks?: () => void;
  readonly onToggleScapulohumeralRhythm?: (enabled: boolean) => void;
  readonly onGuideVisibilityChange?: (patch: Partial<StudioMannequinGuideVisibility>) => void;
  readonly onAutoBalance?: () => void;
  readonly onApplyContrapposto?: (weightSide: "left" | "right") => void;
  readonly onApplyHandContact?: (side: "left" | "right", targetId: StudioMannequinHandContactTargetId) => void;
  readonly onLookAtCamera?: () => void;
  readonly onApplyHandPad?: (side: "left" | "right" | "both", output: StudioMannequinHandPadOutput) => void;
  readonly onImportCspPep?: () => void;
  readonly onExportCspPep?: () => void;
}): ReactElement {
  const [contactSide, setContactSide] = useState<"left" | "right">("right");
  const jointLimit = selectedJointId ? getStudioMannequinJointLimit(selectedJointId) : null;
  const isSelectedLocked = selectedJointId ? jointLocks[selectedJointId] === true : false;
  const lockedCount = countStudioMannequinLockedJoints(jointLocks);
  const axes: readonly { axis: 0 | 1 | 2; label: string; range: readonly [number, number] }[] = jointLimit
    ? [
        { axis: 0, label: "X 회전", range: jointLimit.x },
        { axis: 1, label: "Y 회전", range: jointLimit.y },
        { axis: 2, label: "Z 회전", range: jointLimit.z },
      ]
    : [];

  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="관절"
        description="몸 드래그로 관절 회전, 손·발 핸들 드래그로 IK, 포커스 후 방향키로 2° 정밀 회전합니다."
        action={
          selectedJointId ? (
            <button
              type="button"
              onClick={onResetJoint}
              disabled={isSelectedLocked}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 pointer-coarse:min-h-11" })}
              title="선택한 관절 회전 초기화"
            >
              <RotateCcw size={13} aria-hidden /> 초기화
            </button>
          ) : undefined
        }
      />

      <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
        관절 선택
        <select
          value={selectedJointId ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            if (next) onSelectJoint(next as StudioMannequinJointId);
          }}
          aria-label="편집할 관절 선택"
          className={cn(
            "h-8 min-w-0 flex-1 rounded-md border border-line bg-card px-2 text-[0.72rem] text-fg outline-none focus:border-accent/60 pointer-coarse:min-h-11",
            STUDIO_FOCUS_RING,
          )}
        >
          <option value="" disabled>관절을 선택하세요</option>
          {STUDIO_MANNEQUIN_JOINT_IDS.map((jointId) => (
            <option key={jointId} value={jointId}>
              {STUDIO_MANNEQUIN_JOINT_LABELS[jointId]}{jointLocks[jointId] ? " (잠김)" : ""}
            </option>
          ))}
        </select>
      </label>

      {onToggleJointLock ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedJointId ? (
            <StudioToggleChip
              active={isSelectedLocked}
              onClick={() => onToggleJointLock(selectedJointId)}
              title="잠긴 관절은 IK 드래그·포즈 프리셋·미러 시 고정됩니다"
            >
              {isSelectedLocked ? <Lock size={12} aria-hidden /> : <Unlock size={12} aria-hidden />}
              {isSelectedLocked ? "선택 관절 잠금 해제" : "선택 관절 잠금"}
            </StudioToggleChip>
          ) : null}
          {lockedCount > 0 && onClearAllJointLocks ? (
            <StudioPanelChip onClick={onClearAllJointLocks} title="모든 관절 잠금을 한 번에 해제합니다">
              잠금 전체 해제 ({lockedCount})
            </StudioPanelChip>
          ) : null}
          {onToggleScapulohumeralRhythm ? (
            <StudioToggleChip
              active={scapulohumeralRhythm}
              onClick={() => onToggleScapulohumeralRhythm(!scapulohumeralRhythm)}
              title="팔을 들어 올릴 때 쇄골·견갑골이 2:1 해부학 비율로 자연 동반 회전합니다"
            >
              견갑상완 리듬 {scapulohumeralRhythm ? "ON" : "OFF"}
            </StudioToggleChip>
          ) : null}
        </div>
      ) : null}

      {selectedJointId && jointLimit ? (
        <div className={cn("space-y-2", isSelectedLocked && "opacity-55 pointer-events-none")}>
          {axes.map(({ axis, label, range }) => (
            <StudioSliderRow
              key={axis}
              label={label}
              min={Math.round(range[0] * RAD_TO_DEG)}
              max={Math.round(range[1] * RAD_TO_DEG)}
              step={1}
              value={Math.round(rotation[axis] * RAD_TO_DEG)}
              onChange={(nextDeg) => {
                if (isSelectedLocked) return;
                const next: [number, number, number] = [rotation[0], rotation[1], rotation[2]];
                next[axis] = nextDeg * DEG_TO_RAD;
                onRotate(next);
              }}
              readout={`${Math.round(rotation[axis] * RAD_TO_DEG)}°`}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-line/70 bg-card/60 p-3 text-[0.72rem] leading-relaxed text-fg-3">
          {noJointSelectedText}
        </p>
      )}

      {balanceReport ? (
        <div className="space-y-2 rounded-xl border border-line/70 bg-card/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-fg-2">
              <Scale size={13} className="text-accent" aria-hidden /> 무게중심(CoM) 밸런스
            </span>
            <span role="status" aria-live="polite" className={cn("rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold", BALANCE_LABELS[balanceReport.state].tone)}>
              {BALANCE_LABELS[balanceReport.state].label} · 편차 {balanceReport.horizontalOffsetCm}cm
            </span>
          </div>
          {onAutoBalance ? (
            <button
              type="button"
              onClick={onAutoBalance}
              disabled={balanceReport.state === "airborne"}
              className={buttonClass({ size: "sm", variant: "outline", className: `w-full justify-center ${TOUCH_OUTLINE_BTN}` })}
            >
              <Scale size={13} aria-hidden /> 원클릭 무게중심 균형 보정
            </button>
          ) : null}
        </div>
      ) : null}

      {gestureAnalysis || onApplyContrapposto || onLookAtCamera ? (
        <div className="space-y-2 rounded-xl border border-line/70 bg-card/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-fg-2">
              <Sparkles size={13} className="text-accent" aria-hidden /> 동세·콘트라포스토·시선
            </span>
            {gestureAnalysis ? (
              <span role="status" aria-live="polite" className="text-[0.7rem] text-fg-3">
                반대기울기 {gestureAnalysis.contrappostoAngleDeg}° · 만곡 {gestureAnalysis.actionCurveBowCm}cm
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {onApplyContrapposto ? (
              <>
                <StudioPanelChip onClick={() => onApplyContrapposto("left")} title="왼다리 지지 콘트라포스토 S-리듬 및 발바닥 밀착">
                  좌측 콘트라포스토
                </StudioPanelChip>
                <StudioPanelChip onClick={() => onApplyContrapposto("right")} title="오른다리 지지 콘트라포스토 S-리듬 및 발바닥 밀착">
                  우측 콘트라포스토
                </StudioPanelChip>
              </>
            ) : null}
            {onLookAtCamera ? (
              <StudioPanelChip onClick={onLookAtCamera} title="현재 카메라를 향해 가슴(15%)·목(35%)·머리(50%) 시선을 배분합니다">
                <Eye size={12} aria-hidden /> 카메라 시선 응시
              </StudioPanelChip>
            ) : null}
          </div>
        </div>
      ) : null}

      {onApplyHandContact ? (
        <div className="space-y-2 rounded-xl border border-line/70 bg-card/50 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-fg-2">
              <Hand size={13} className="text-accent" aria-hidden /> 손 신체·바닥 밀착 스냅
            </span>
            <div className="flex gap-1" role="group" aria-label="손 밀착 대상 팔">
              <StudioToggleChip active={contactSide === "left"} onClick={() => setContactSide("left")}>왼손</StudioToggleChip>
              <StudioToggleChip active={contactSide === "right"} onClick={() => setContactSide("right")}>오른손</StudioToggleChip>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="손 밀착 위치">
            {STUDIO_MANNEQUIN_HAND_CONTACT_TARGETS.map((target) => (
              <StudioPanelChip key={target.id} onClick={() => onApplyHandContact(contactSide, target.id)} title={target.desc}>
                {target.label}
              </StudioPanelChip>
            ))}
          </div>
        </div>
      ) : null}

      {onGuideVisibilityChange ? (
        <div className="space-y-1.5 rounded-xl border border-line/70 bg-card/50 p-2.5">
          <span className="flex items-center gap-1 text-xs font-semibold text-fg-2">
            <Compass size={13} className="text-accent" aria-hidden /> 작화 보조선 (캡처 시 자동 숨김)
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="작화 보조선 표시">
            <StudioToggleChip
              active={guideVisibility.lineOfAction !== false}
              onClick={() => onGuideVisibilityChange({ lineOfAction: !(guideVisibility.lineOfAction !== false) })}
            >
              3D 동세선
            </StudioToggleChip>
            <StudioToggleChip active={guideVisibility.loomisHead} onClick={() => onGuideVisibilityChange({ loomisHead: !guideVisibility.loomisHead })}>
              루미스 두상선
            </StudioToggleChip>
            <StudioToggleChip active={guideVisibility.torsoCenterline} onClick={() => onGuideVisibilityChange({ torsoCenterline: !guideVisibility.torsoCenterline })}>
              흉곽·골반 축
            </StudioToggleChip>
            <StudioToggleChip active={guideVisibility.limbCrossContours} onClick={() => onGuideVisibilityChange({ limbCrossContours: !guideVisibility.limbCrossContours })}>
              단축 등고선
            </StudioToggleChip>
            <StudioToggleChip active={guideVisibility.balancePlumbLine} onClick={() => onGuideVisibilityChange({ balancePlumbLine: !guideVisibility.balancePlumbLine })}>
              무게중심 추선
            </StudioToggleChip>
          </div>
        </div>
      ) : null}

      {onApplyHandPad ? <HandSetupPad2D onApplyHandPad={onApplyHandPad} /> : null}

      {onImportCspPep || onExportCspPep ? (
        <div className="space-y-2 border-t border-line/60 pt-3">
          <StudioSectionHeader title="클립스튜디오 포즈(.pep) 호환" description="CLIP STUDIO PAINT 56본 포즈 파일(.pep XML, 손가락 30관절 포함)을 양방향 변환합니다." />
          <div className="flex flex-wrap gap-1.5">
            {onImportCspPep ? (
              <button type="button" onClick={onImportCspPep} className={buttonClass({ size: "sm", variant: "outline", className: TOUCH_OUTLINE_BTN })}>
                <Upload size={13} aria-hidden /> .pep 포즈 가져오기
              </button>
            ) : null}
            {onExportCspPep ? (
              <button type="button" onClick={onExportCspPep} className={buttonClass({ size: "sm", variant: "outline", className: TOUCH_OUTLINE_BTN })}>
                <Download size={13} aria-hidden /> .pep 포즈 내보내기
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
