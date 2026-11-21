/**
 * VRoid Studio 클린룸 + Shaper Pro 통합 UI 패널의 6대 탭 섹션 컴포넌트 모음.
 * (헤어 · 얼굴 36종 · 체형 등신대 · 레이어드 의상 · 표정 18종 · 포즈 IK/원근)
 */
import { ChevronDown, Eye, Layers, Send, Sliders, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  VROID_BODY_PROPORTION_PRESETS,
  VROID_EYE_HIGHLIGHT_STYLES,
  VROID_FACE_CATEGORY_LABELS,
  VROID_FACE_PARAMETER_SPECS,
  VROID_HAIR_GROUP_SPECS,
  VROID_HAIR_PALETTE_PRESETS,
  VROID_LOOKAT_PRESETS,
  VROID_OUTFIT_LAYER_SPECS,
  VROID_OUTFIT_PALETTE_PRESETS,
  VROID_OUTFIT_PATTERN_SPECS,
  VROID_VRM1_EXPRESSION_PRESETS,
  formatOklchCss,
  type VroidArkitVisemeName,
  type VroidBodyProportionPresetId,
  type VroidBodyProportionResolved,
  type VroidDuoHeightComparison,
  type VroidFaceCategory,
  type VroidFaceMorphApplyResult,
  type VroidFaceParameterId,
  type VroidHairGroupKind,
  type VroidHairSpringBoneSpec,
  type VroidLookAtPresetId,
  type VroidOutfitLayerKind,
  type VroidOutfitPatternKind,
  type VroidToBg3dHandoffPayload,
  type VroidVrm1ExpressionName,
} from "../vrm/studio-vroid-atelier-engine";

import {
  SHAPER_DUO_INTERACTION_PRESETS,
  SHAPER_HAND_SOCKET_PROPS,
  SHAPER_MANGA_PERSPECTIVE_PRESETS,
  type ShaperDuoInteractionPoseId,
  type ShaperDuoInteractionResolved,
  type ShaperFootGroundAndLookAtResult,
  type ShaperHandSocketGripResult,
  type ShaperHandSocketPropKind,
  type WebtoonPerspectiveAndLineWeightResult,
} from "./shaper-pro-ik-pose-engine";

import { cn } from "@/shared/lib/utils";

const FOCUS = STUDIO_FOCUS_RING;

export function ProCollapsibleGroup({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  readonly title: string;
  readonly badge?: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <details className="vroid-pro-group" open={defaultOpen}>
      <summary className={cn("[word-break:keep-all]", FOCUS)}>
        <span className="truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[0.68rem] font-medium tabular-nums text-fg-3">
          {badge ? <span>{badge}</span> : null}
          <ChevronDown size={14} aria-hidden className="vroid-pro-chevron" />
        </span>
      </summary>
      <div className="vroid-pro-group-body space-y-2.5">{children}</div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. 헤어 탭                                                                  */
/* -------------------------------------------------------------------------- */

export function VroidProHairSection({
  activeGroup,
  paletteId,
  strandCount,
  lengthMeters,
  curl,
  springBone,
  vertexCount,
  triangleCount,
  locked,
  onSelectGroup,
  onSelectPalette,
  onChangeParams,
}: {
  readonly activeGroup: VroidHairGroupKind;
  readonly paletteId: string;
  readonly strandCount: number;
  readonly lengthMeters: number;
  readonly curl: number;
  readonly springBone: VroidHairSpringBoneSpec;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly locked: boolean;
  readonly onSelectGroup: (group: VroidHairGroupKind) => void;
  readonly onSelectPalette: (paletteId: string) => void;
  readonly onChangeParams: (patch: { strandCount?: number; lengthMeters?: number; curl?: number }) => void;
}) {
  return (
    <div className="space-y-2.5" data-testid="vroid-pro-section-hair">
      <div role="group" aria-label="프로시저럴 헤어 그룹" className="grid grid-cols-3 gap-1.5">
        {VROID_HAIR_GROUP_SPECS.map((spec) => (
          <button
            key={spec.kind}
            type="button"
            disabled={locked}
            aria-pressed={activeGroup === spec.kind}
            onClick={() => onSelectGroup(spec.kind)}
            className={cn("vroid-pro-chip", FOCUS)}
          >
            {spec.labelKo}
          </button>
        ))}
      </div>

      <div role="group" aria-label="OKLCH 헤어 팔레트" className="grid grid-cols-2 gap-1.5">
        {VROID_HAIR_PALETTE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={locked}
            aria-pressed={paletteId === preset.id}
            onClick={() => onSelectPalette(preset.id)}
            className={cn("vroid-pro-chip justify-start", FOCUS)}
          >
            <span
              className="vroid-pro-swatch-dot"
              aria-hidden
              style={{ backgroundColor: formatOklchCss(preset.base) }}
            />
            <span className="truncate">{preset.labelKo}</span>
          </button>
        ))}
      </div>

      <ProCollapsibleGroup
        title="스트랜드 커브 & SpringBone 물리"
        badge={`${vertexCount}v · ${triangleCount}△`}
        defaultOpen={false}
      >
        <label className="block space-y-1 text-xs text-fg-2">
          <span className="flex justify-between">
            <span>가닥 수</span>
            <span className="vroid-pro-metric text-fg-3">{strandCount}가닥</span>
          </span>
          <input
            type="range"
            aria-label="헤어 가닥 수"
            min={2}
            max={18}
            step={1}
            value={strandCount}
            disabled={locked}
            onChange={(e) => onChangeParams({ strandCount: e.currentTarget.valueAsNumber })}
            className="h-9 w-full accent-accent"
          />
        </label>
        <label className="block space-y-1 text-xs text-fg-2">
          <span className="flex justify-between">
            <span>길이</span>
            <span className="vroid-pro-metric text-fg-3">{Math.round(lengthMeters * 100)}cm</span>
          </span>
          <input
            type="range"
            aria-label="헤어 스트랜드 길이"
            min={0.08}
            max={0.75}
            step={0.02}
            value={lengthMeters}
            disabled={locked}
            onChange={(e) => onChangeParams({ lengthMeters: e.currentTarget.valueAsNumber })}
            className="h-9 w-full accent-accent"
          />
        </label>
        <label className="block space-y-1 text-xs text-fg-2">
          <span className="flex justify-between">
            <span>컬 곡률</span>
            <span className="vroid-pro-metric text-fg-3">{Math.round(curl * 100)}%</span>
          </span>
          <input
            type="range"
            aria-label="헤어 컬 곡률"
            min={-0.8}
            max={0.8}
            step={0.05}
            value={curl}
            disabled={locked}
            onChange={(e) => onChangeParams({ curl: e.currentTarget.valueAsNumber })}
            className="h-9 w-full accent-accent"
          />
        </label>
        <p className="vroid-pro-metric text-[0.68rem] text-fg-3">
          SpringBone 강성 {springBone.stiffness.toFixed(2)} · 중력 {springBone.gravityPower.toFixed(2)} · 드래그{" "}
          {springBone.dragForce.toFixed(2)} · 충돌반경 {(springBone.hitRadius * 1000).toFixed(0)}mm
        </p>
      </ProCollapsibleGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. 얼굴 36종 탭                                                             */
/* -------------------------------------------------------------------------- */

const FACE_CATEGORIES: readonly VroidFaceCategory[] = ["eyes", "brows", "nose", "mouth", "jaw", "ears", "makeup"];

export function VroidProFaceSection({
  faceResult,
  locked,
  onChangeParam,
}: {
  readonly faceResult: VroidFaceMorphApplyResult;
  readonly locked: boolean;
  readonly onChangeParam: (id: VroidFaceParameterId, value: number) => void;
}) {
  const [category, setCategory] = useState<VroidFaceCategory>("eyes");
  const visibleSpecs = VROID_FACE_PARAMETER_SPECS.filter(
    (spec) => spec.category === category && spec.id !== "pupilHighlightStyle",
  );

  return (
    <div className="space-y-2.5" data-testid="vroid-pro-section-face">
      <div role="group" aria-label="동공 하이라이트 5종" className="grid grid-cols-2 gap-1.5">
        {VROID_EYE_HIGHLIGHT_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            disabled={locked}
            aria-pressed={faceResult.materialTextureParams.highlightStyle.id === style.id}
            onClick={() => onChangeParam("pupilHighlightStyle", style.index)}
            className={cn("vroid-pro-chip justify-start", FOCUS)}
          >
            <Eye size={13} aria-hidden />
            <span className="truncate">{style.labelKo}</span>
          </button>
        ))}
      </div>

      <ProCollapsibleGroup
        title="얼굴 정밀 파라미터 36종 (엘프귀·홍조·아이라인)"
        badge={`${Object.keys(faceResult.blendShapeWeights).length} 활성`}
        defaultOpen
      >
        <div role="group" aria-label="얼굴 부위 필터" className="vroid-pro-tabs">
          {FACE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={category === cat}
              onClick={() => setCategory(cat)}
              className={cn("vroid-pro-tab", FOCUS)}
            >
              {VROID_FACE_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          {visibleSpecs.map((spec) => {
            const val = faceResult.values[spec.id];
            return (
              <label key={spec.id} className="block rounded-lg border border-line/70 bg-panel px-2.5 py-1.5 text-xs">
                <span className="flex items-center justify-between gap-2 text-fg-2">
                  <span>{spec.labelKo}</span>
                  <span className="vroid-pro-metric text-[0.68rem] text-fg-3">{Math.round(val * 100)}%</span>
                </span>
                <input
                  type="range"
                  aria-label={`VRoid ${spec.labelKo}`}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={val}
                  disabled={locked}
                  onChange={(e) => onChangeParam(spec.id, e.currentTarget.valueAsNumber)}
                  className="mt-1 h-8 w-full accent-accent"
                />
              </label>
            );
          })}
        </div>
      </ProCollapsibleGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. 체형 등신대 & 2인 신장차 탭                                                */
/* -------------------------------------------------------------------------- */

export function VroidProBodySection({
  presetId,
  bodyPlan,
  partnerHeightCm,
  heightComparison,
  locked,
  onSelectPreset,
  onChangePartnerHeight,
}: {
  readonly presetId: VroidBodyProportionPresetId;
  readonly bodyPlan: VroidBodyProportionResolved;
  readonly partnerHeightCm: number;
  readonly heightComparison: VroidDuoHeightComparison;
  readonly locked: boolean;
  readonly onSelectPreset: (id: VroidBodyProportionPresetId) => void;
  readonly onChangePartnerHeight: (cm: number) => void;
}) {
  return (
    <div className="space-y-2.5" data-testid="vroid-pro-section-body">
      <div role="group" aria-label="등신대 바디 프리셋" className="grid grid-cols-2 gap-1.5">
        {VROID_BODY_PROPORTION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={locked}
            aria-pressed={presetId === preset.id}
            onClick={() => onSelectPreset(preset.id)}
            className={cn("vroid-pro-chip flex-col items-start py-2 text-left", FOCUS)}
          >
            <span>{preset.labelKo}</span>
            <span className="vroid-pro-metric text-[0.65rem] font-normal text-fg-3">
              기준 {preset.defaultHeightCm}cm · {preset.targetHeadUnits.toFixed(1)}등신
            </span>
          </button>
        ))}
      </div>

      <p className="vroid-pro-metric rounded-lg border border-line/70 bg-panel px-2.5 py-2 text-xs text-fg-2">
        실측 {bodyPlan.heightCm}cm · {bodyPlan.metrics.headUnits.toFixed(2)}등신 · 전단 검증 오류{" "}
        {bodyPlan.validationIssues.length}건
      </p>

      <ProCollapsibleGroup
        title="2인 신장차 계산기"
        badge={`Δ${heightComparison.heightDiffCm > 0 ? "+" : ""}${heightComparison.heightDiffCm}cm`}
        defaultOpen={false}
      >
        <label className="block space-y-1 text-xs text-fg-2">
          <span className="flex justify-between">
            <span>상대역 신장</span>
            <span className="vroid-pro-metric text-fg-3">{partnerHeightCm}cm</span>
          </span>
          <input
            type="range"
            aria-label="상대역 신장 (cm)"
            min={100}
            max={205}
            step={1}
            value={partnerHeightCm}
            disabled={locked}
            onChange={(e) => onChangePartnerHeight(e.currentTarget.valueAsNumber)}
            className="h-9 w-full accent-accent"
          />
        </label>
        <p role="status" className="vroid-pro-metric text-[0.68rem] leading-relaxed text-fg-3">
          {heightComparison.summaryKo}
        </p>
      </ProCollapsibleGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. 레이어드 의상 텍스처 믹서 탭                                               */
/* -------------------------------------------------------------------------- */

export function VroidProOutfitSection({
  activeLayers,
  pattern,
  paletteId,
  textureResolution,
  locked,
  onToggleLayer,
  onSelectPattern,
  onSelectPalette,
}: {
  readonly activeLayers: readonly VroidOutfitLayerKind[];
  readonly pattern: VroidOutfitPatternKind;
  readonly paletteId: string;
  readonly textureResolution: number;
  readonly locked: boolean;
  readonly onToggleLayer: (layer: VroidOutfitLayerKind) => void;
  readonly onSelectPattern: (pattern: VroidOutfitPatternKind) => void;
  readonly onSelectPalette: (paletteId: string) => void;
}) {
  return (
    <div className="space-y-2.5" data-testid="vroid-pro-section-outfit">
      <div role="group" aria-label="의상 레이어 구성" className="grid grid-cols-3 gap-1.5">
        {VROID_OUTFIT_LAYER_SPECS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            disabled={locked}
            aria-pressed={activeLayers.includes(spec.id)}
            onClick={() => onToggleLayer(spec.id)}
            className={cn("vroid-pro-chip", FOCUS)}
          >
            <Layers size={13} aria-hidden />
            {spec.labelKo}
          </button>
        ))}
      </div>

      <div role="group" aria-label="의상 패턴 5종" className="grid grid-cols-3 gap-1.5">
        {VROID_OUTFIT_PATTERN_SPECS.map((spec) => (
          <button
            key={spec.id}
            type="button"
            disabled={locked}
            aria-pressed={pattern === spec.id}
            onClick={() => onSelectPattern(spec.id)}
            className={cn("vroid-pro-chip", FOCUS)}
          >
            {spec.labelKo}
          </button>
        ))}
      </div>

      <ProCollapsibleGroup title="3색 OKLCH 의상 팔레트" badge={`${textureResolution}px 텍스처`} defaultOpen={false}>
        <div role="group" aria-label="3색 OKLCH 의상 팔레트" className="grid grid-cols-2 gap-1.5">
          {VROID_OUTFIT_PALETTE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={locked}
              aria-pressed={paletteId === preset.id}
              onClick={() => onSelectPalette(preset.id)}
              className={cn("vroid-pro-chip justify-start", FOCUS)}
            >
              <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
                <span className="vroid-pro-swatch-dot" style={{ backgroundColor: formatOklchCss(preset.palette.primary) }} />
                <span className="vroid-pro-swatch-dot" style={{ backgroundColor: formatOklchCss(preset.palette.accent) }} />
              </span>
              <span className="truncate">{preset.labelKo}</span>
            </button>
          ))}
        </div>
      </ProCollapsibleGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. VRM 1.0 표정 18종 · ARKit 립싱크 · LookAt 탭                              */
/* -------------------------------------------------------------------------- */

const ARKIT_VISEMES: readonly { readonly id: VroidArkitVisemeName; readonly labelKo: string }[] = [
  { id: "aa", labelKo: "아 (aa)" },
  { id: "ih", labelKo: "이 (ih)" },
  { id: "ou", labelKo: "우 (ou)" },
  { id: "ee", labelKo: "에 (ee)" },
  { id: "oh", labelKo: "오 (oh)" },
];

export function VroidProExpressionSection({
  activeEmotion,
  activeViseme,
  lookAtPresetId,
  arkitCount,
  locked,
  onSelectEmotion,
  onSelectViseme,
  onSelectLookAt,
}: {
  readonly activeEmotion: VroidVrm1ExpressionName;
  readonly activeViseme: VroidArkitVisemeName | null;
  readonly lookAtPresetId: VroidLookAtPresetId;
  readonly arkitCount: number;
  readonly locked: boolean;
  readonly onSelectEmotion: (name: VroidVrm1ExpressionName) => void;
  readonly onSelectViseme: (viseme: VroidArkitVisemeName | null) => void;
  readonly onSelectLookAt: (presetId: VroidLookAtPresetId) => void;
}) {
  const emotionPresets = VROID_VRM1_EXPRESSION_PRESETS.filter((p) => p.group === "emotion" || p.group === "blink");
  return (
    <div className="space-y-2.5" data-testid="vroid-pro-section-expression">
      <div role="group" aria-label="VRM 1.0 표정 프리셋" className="grid grid-cols-3 gap-1.5">
        {emotionPresets.map((spec) => (
          <button
            key={spec.name}
            type="button"
            disabled={locked}
            aria-pressed={activeEmotion === spec.name}
            onClick={() => onSelectEmotion(spec.name)}
            className={cn("vroid-pro-chip", FOCUS)}
          >
            {spec.labelKo}
          </button>
        ))}
      </div>

      <ProCollapsibleGroup
        title="ARKit 립싱크 (aa/ih/ou/ee/oh)"
        badge={activeViseme ? `${activeViseme} · ARKit ${arkitCount}키` : "대기"}
        defaultOpen={false}
      >
        <div role="group" aria-label="ARKit 립싱크 모음" className="grid grid-cols-3 gap-1.5">
          {ARKIT_VISEMES.map((viseme) => (
            <button
              key={viseme.id}
              type="button"
              disabled={locked}
              aria-pressed={activeViseme === viseme.id}
              onClick={() => onSelectViseme(activeViseme === viseme.id ? null : viseme.id)}
              className={cn("vroid-pro-chip", FOCUS)}
            >
              {viseme.labelKo}
            </button>
          ))}
        </div>
      </ProCollapsibleGroup>

      <ProCollapsibleGroup title="LookAt 시선 추적 프리셋" defaultOpen={false}>
        <div role="group" aria-label="LookAt 시선 프리셋" className="grid grid-cols-2 gap-1.5">
          {VROID_LOOKAT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={locked}
              aria-pressed={lookAtPresetId === preset.id}
              onClick={() => onSelectLookAt(preset.id)}
              className={cn("vroid-pro-chip", FOCUS)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
      </ProCollapsibleGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Shaper Pro IK · 2인 12종 · 만화 퍼스펙티브 · BG3D 전송 탭                 */
/* -------------------------------------------------------------------------- */

export function VroidProPoseIkSection({
  propKind,
  twoHanded,
  handGripResult,
  footLookAtResult,
  duoPoseId,
  duoResolved,
  focalMm,
  perspectiveResult,
  handoffPayload,
  locked,
  onSelectProp,
  onToggleTwoHanded,
  onSelectDuoPose,
  onSelectFocalMm,
  onExportBg3dHandoff,
}: {
  readonly propKind: ShaperHandSocketPropKind;
  readonly twoHanded: boolean;
  readonly handGripResult: ShaperHandSocketGripResult;
  readonly footLookAtResult: ShaperFootGroundAndLookAtResult;
  readonly duoPoseId: ShaperDuoInteractionPoseId;
  readonly duoResolved: ShaperDuoInteractionResolved;
  readonly focalMm: number;
  readonly perspectiveResult: WebtoonPerspectiveAndLineWeightResult;
  readonly handoffPayload: VroidToBg3dHandoffPayload | null;
  readonly locked: boolean;
  readonly onSelectProp: (kind: ShaperHandSocketPropKind) => void;
  readonly onToggleTwoHanded: () => void;
  readonly onSelectDuoPose: (id: ShaperDuoInteractionPoseId) => void;
  readonly onSelectFocalMm: (focalMm: number) => void;
  readonly onExportBg3dHandoff: () => void;
}) {
  return (
    <div className="space-y-2.5" data-testid="vroid-pro-section-pose-ik">
      <div role="group" aria-label="소품·무기 자동 그립 소켓 6종" className="grid grid-cols-3 gap-1.5">
        {SHAPER_HAND_SOCKET_PROPS.map((item) => (
          <button
            key={item.kind}
            type="button"
            disabled={locked}
            aria-pressed={propKind === item.kind}
            onClick={() => onSelectProp(item.kind)}
            className={cn("vroid-pro-chip", FOCUS)}
          >
            {item.labelKo.split(" ")[0]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-line/70 bg-panel px-2.5 py-2 text-xs">
        <span className="vroid-pro-metric text-fg-2">
          FootIK 접지오차 {(footLookAtResult.maxGroundResidualMeters * 1000).toFixed(1)}mm · LookAt{" "}
          {footLookAtResult.lookAt.inComfortCone ? "정상 시야" : "한계 보정"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={twoHanded}
          disabled={locked || !handGripResult.spec.supportsTwoHanded}
          onClick={onToggleTwoHanded}
          className={cn("vroid-pro-chip shrink-0 px-2.5", FOCUS)}
        >
          양손 IK {twoHanded ? "ON" : "OFF"}
        </button>
      </div>

      <ProCollapsibleGroup
        title="2인 인터랙션 웹툰 포즈 12종 (신장차 보정)"
        badge={duoResolved.preset.labelKo}
        defaultOpen={false}
      >
        <div role="group" aria-label="2인 웹툰 포즈 12종" className="grid grid-cols-2 gap-1.5">
          {SHAPER_DUO_INTERACTION_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={locked}
              aria-pressed={duoPoseId === preset.id}
              onClick={() => onSelectDuoPose(preset.id)}
              className={cn("vroid-pro-chip justify-start", FOCUS)}
            >
              <Sparkles size={12} aria-hidden />
              <span className="truncate">{preset.labelKo}</span>
            </button>
          ))}
        </div>
        <p role="status" className="vroid-pro-metric text-[0.68rem] leading-relaxed text-fg-3">
          {duoResolved.compensationSummaryKo}
        </p>
      </ProCollapsibleGroup>

      <ProCollapsibleGroup
        title="만화 퍼스펙티브 (18~135mm) & 거리 감쇠 선화"
        badge={`${focalMm}mm · ${perspectiveResult.effectiveStrokePx.toFixed(1)}px`}
        defaultOpen={false}
      >
        <div role="group" aria-label="만화 퍼스펙티브 렌즈" className="grid grid-cols-3 gap-1.5">
          {SHAPER_MANGA_PERSPECTIVE_PRESETS.map((preset) => (
            <button
              key={preset.focalMm}
              type="button"
              disabled={locked}
              aria-pressed={focalMm === preset.focalMm}
              onClick={() => onSelectFocalMm(preset.focalMm)}
              className={cn("vroid-pro-chip", FOCUS)}
            >
              <Sliders size={12} aria-hidden />
              {preset.focalMm}mm
            </button>
          ))}
        </div>
        <p className="vroid-pro-metric text-[0.68rem] leading-relaxed text-fg-3">
          {perspectiveResult.framingHintKo}
        </p>
      </ProCollapsibleGroup>

      <button
        type="button"
        disabled={locked}
        data-testid="vroid-pro-bg3d-handoff-btn"
        onClick={onExportBg3dHandoff}
        className={cn(
          "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-accent/60 bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2 disabled:opacity-45",
          FOCUS,
        )}
      >
        <Send size={14} aria-hidden />
        3D 배경(BG3D) 스테이지 전송 페이로드 생성
      </button>
      {handoffPayload ? (
        <p role="status" data-testid="vroid-pro-bg3d-handoff-status" className="vroid-pro-metric text-[0.68rem] text-good">
          VRM {handoffPayload.vrm1Manifest.specVersion} → BG3D 준비 완료 ({handoffPayload.vrm1Manifest.humanoid.headUnits.toFixed(1)}등신 ·{" "}
          SpringBone {handoffPayload.vrm1Manifest.springBone.totalJointChains}체인 · 바닥접지 Y={handoffPayload.bg3dStagePlacement.floorGroundedY})
        </p>
      ) : null}
    </div>
  );
}
