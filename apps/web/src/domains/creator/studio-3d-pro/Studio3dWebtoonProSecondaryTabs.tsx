import { useMemo, useState } from "react";
import { Hand, Wind } from "lucide-react";

import {
  FINGER_LABELS_KO,
  FINGER_ORDER,
  HAND_GESTURE_PRESET_LIST,
  WEBTOON_ACTION_POSE_PRESETS,
  applyFalsePerspectiveExaggeration,
  applyHandGesturePreset,
  createInitialTenFingerRig,
  mirrorHandPose,
  readFingerCurlPercent,
  resolveBodySelfCollisions,
  solveCascadeurAutoBalance,
  updateFingerCurlPercent,
  type ActionPosePresetId,
  type HandSide,
} from "./cascadeur-designdoll-rig-pro";
import {
  ARKIT_52_BLENDSHAPES,
  DEFAULT_MODIFIER_STACK,
  INITIAL_VROID_SHADER_LAB,
  QUADRUPED_AND_WEAPON_RIG_PRESETS,
  WEBTOON_EXPRESSION_RECIPES,
  bakeClothHairWindPhysics,
  compileVroidShaderLabUniforms,
  createGreasePencil3dStroke,
  evaluateModifierStack,
  generateProceduralScatter,
  setBlendshapeWeight,
  validateVrm1ExportSettings,
  type EyeCatchlightShape,
  type ProceduralScatterKind,
  type SpatialStrokePresetId,
  type WebtoonExpressionRecipeId,
} from "./blender-sketchup-vroid-pro-ops";

const CATCHLIGHT_OPTIONS: readonly { readonly id: EyeCatchlightShape; readonly labelKo: string }[] =
  Object.freeze([
    { id: "star", labelKo: "별빛 하이라이트" },
    { id: "heart", labelKo: "하트 하이라이트" },
    { id: "crescent", labelKo: "초승달 눈빛" },
    { id: "double-ring", labelKo: "이중 원형 광채" },
  ]);

const SCATTER_OPTIONS: readonly { readonly id: ProceduralScatterKind; readonly labelKo: string }[] =
  Object.freeze([
    { id: "crowd-silhouettes", labelKo: "배경 인물 실루엣" },
    { id: "street-lamps", labelKo: "거리 가로등 줄배치" },
    { id: "blossom-petals", labelKo: "흩날리는 꽃잎" },
    { id: "cafe-tables", labelKo: "테라스 테이블 세트" },
  ]);

const STROKE_OPTIONS: readonly { readonly id: SpatialStrokePresetId; readonly labelKo: string }[] =
  Object.freeze([
    { id: "speedline", labelKo: "액션 집중선" },
    { id: "magic-rune", labelKo: "마법진 빛줄기" },
    { id: "aura-ribbon", labelKo: "검기·오라 띠" },
    { id: "ink-callout", labelKo: "강조 손그림 선" },
  ]);

const SUBCARD_CLS =
  "rounded-lg border border-[var(--color-line,oklch(0.88_0.010_75))] bg-[var(--color-raised,oklch(0.96_0.006_75))] p-2.5";
const BTN_BASE_CLS =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent,oklch(0.54_0.16_255))]";

function pillClass(active: boolean): string {
  return active
    ? `${BTN_BASE_CLS} border-[var(--color-accent,oklch(0.54_0.16_255))] bg-[var(--color-accent,oklch(0.54_0.16_255))] text-[var(--color-on-accent,oklch(0.99_0.003_75))]`
    : `${BTN_BASE_CLS} border-[var(--color-line,oklch(0.86_0.012_75))] bg-[var(--color-panel,oklch(0.99_0.004_75))] text-[var(--color-fg,oklch(0.24_0.015_60))] hover:bg-[var(--color-raised,oklch(0.95_0.008_75))]`;
}

export interface Studio3dProPoseHandTabProps {
  readonly active: boolean;
}

export function Studio3dProPoseHandTab({ active }: Studio3dProPoseHandTabProps) {
  const [actionPoseId, setActionPoseId] = useState<ActionPosePresetId>("hunter-slash");
  const [autoBalanced, setAutoBalanced] = useState(false);
  const [collisionFixed, setCollisionFixed] = useState(false);
  const [falsePerspectivePercent, setFalsePerspectivePercent] = useState(35);
  const [activeHandSide, setActiveHandSide] = useState<HandSide>("right");
  const [fingerRig, setFingerRig] = useState(createInitialTenFingerRig);

  const poseEvaluation = useMemo(() => {
    const preset =
      WEBTOON_ACTION_POSE_PRESETS.find((item) => item.id === actionPoseId) ??
      WEBTOON_ACTION_POSE_PRESETS[0];
    const balanced = solveCascadeurAutoBalance(preset.pose, {
      stanceMode: preset.stanceMode,
      balanceStrength: autoBalanced ? 0.96 : 0.1,
    });
    const basePose = autoBalanced ? balanced.pose : preset.pose;
    const collision = resolveBodySelfCollisions(basePose);
    const workingPose = collisionFixed ? collision.pose : basePose;
    const perspective = applyFalsePerspectiveExaggeration(
      workingPose,
      { x: 0, y: 1.35, z: 2.4 },
      falsePerspectivePercent / 100,
    );
    return { balanced, collision, perspective };
  }, [actionPoseId, autoBalanced, collisionFixed, falsePerspectivePercent]);

  if (!active) return null;

  return (
    <div role="tabpanel" className="flex flex-col gap-3">
      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <strong className="text-xs font-semibold [word-break:keep-all]">
          무게중심 자동 균형 & 몸통 겹침 자동 풀기
        </strong>
        <div className="grid grid-cols-2 gap-1.5">
          {WEBTOON_ACTION_POSE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={pillClass(actionPoseId === preset.id)}
              onClick={() => setActionPoseId(preset.id)}
            >
              {preset.labelKo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={pillClass(autoBalanced)}
            onClick={() => setAutoBalanced((v) => !v)}
          >
            무게중심 자동 균형 {autoBalanced ? "적용됨" : "실행"}
          </button>
          <button
            type="button"
            className={pillClass(collisionFixed)}
            onClick={() => setCollisionFixed((v) => !v)}
          >
            팔·몸통 겹침 풀기 ({poseEvaluation.collision.resolvedCollisionCount}곳)
          </button>
        </div>
        <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
          균형 안정도 {Math.round(poseEvaluation.balanced.stabilityScore * 100)}% · 상체 기울기{" "}
          {poseEvaluation.balanced.leanAngleDeg}° · 가까운 팔 원근 강조{" "}
          {Math.round(poseEvaluation.perspective.nearLimbBoostRatio * 100)}%
        </p>
        <label className="flex flex-col gap-1 text-xs">
          <span className="flex justify-between">
            <span>카메라 과장 원근 강도</span>
            <strong className="tabular-nums">{falsePerspectivePercent}%</strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={falsePerspectivePercent}
            aria-label="카메라 과장 원근 강도"
            className="min-h-11 w-full"
            onChange={(e) => setFalsePerspectivePercent(Number(e.target.value))}
          />
        </label>
      </div>

      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <strong className="flex items-center gap-1.5 text-xs font-semibold [word-break:keep-all]">
            <Hand size={14} aria-hidden />
            양손 10손가락 관절 조절
          </strong>
          <div className="flex gap-1">
            <button
              type="button"
              className={pillClass(activeHandSide === "left")}
              onClick={() => setActiveHandSide("left")}
            >
              왼손
            </button>
            <button
              type="button"
              className={pillClass(activeHandSide === "right")}
              onClick={() => setActiveHandSide("right")}
            >
              오른손
            </button>
            <button
              type="button"
              className={pillClass(false)}
              onClick={() => setFingerRig((prev) => mirrorHandPose(prev, activeHandSide))}
            >
              반대손 복사
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {HAND_GESTURE_PRESET_LIST.map((gesture) => (
            <button
              key={gesture.id}
              type="button"
              className={pillClass(false)}
              onClick={() =>
                setFingerRig((prev) => applyHandGesturePreset(prev, activeHandSide, gesture.id))
              }
            >
              {gesture.labelKo}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {FINGER_ORDER.map((finger) => {
            const percent = readFingerCurlPercent(finger, fingerRig[activeHandSide][finger]);
            const sideLabel = activeHandSide === "left" ? "왼손" : "오른손";
            return (
              <label key={finger} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0">
                  {sideLabel} {FINGER_LABELS_KO[finger]}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={percent}
                  aria-label={`${sideLabel} ${FINGER_LABELS_KO[finger]} 굽힘`}
                  className="min-h-11 flex-1"
                  onChange={(e) =>
                    setFingerRig((prev) =>
                      updateFingerCurlPercent(prev, activeHandSide, finger, Number(e.target.value)),
                    )
                  }
                />
                <span className="w-9 text-right tabular-nums">{percent}%</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface Studio3dProVroidBlenderTabProps {
  readonly active: boolean;
  readonly inkPx: number;
}

export function Studio3dProVroidBlenderTab({
  active,
  inkPx,
}: Studio3dProVroidBlenderTabProps) {
  const [windSpeed, setWindSpeed] = useState(6);
  const [shaderLab, setShaderLab] = useState(INITIAL_VROID_SHADER_LAB);
  const [expressionRecipeId, setExpressionRecipeId] =
    useState<WebtoonExpressionRecipeId>("rofan-flutter");
  const [expressionWeights, setExpressionWeights] = useState(WEBTOON_EXPRESSION_RECIPES[0].weights);
  const [strokePreset, setStrokePreset] = useState<SpatialStrokePresetId>("speedline");
  const [scatterKind, setScatterKind] = useState<ProceduralScatterKind>("crowd-silhouettes");
  const [scatterCount, setScatterCount] = useState(12);
  const [modifiers, setModifiers] = useState(DEFAULT_MODIFIER_STACK);
  const [vrmTitle, setVrmTitle] = useState("로판 주인공 아바타");

  const windPreview = useMemo(
    () =>
      bakeClothHairWindPhysics({
        windSpeedMps: windSpeed,
        windDirectionDeg: 25,
        stiffness: 0.42,
        drag: 0.35,
        frameCount: 24,
      }),
    [windSpeed],
  );
  const shaderUniforms = useMemo(() => compileVroidShaderLabUniforms(shaderLab), [shaderLab]);
  const scatterInstances = useMemo(
    () =>
      generateProceduralScatter({
        kind: scatterKind,
        count: scatterCount,
        areaWidthMeters: 8,
        areaDepthMeters: 8,
        minSpacingMeters: 0.85,
        seed: 2026,
      }),
    [scatterKind, scatterCount],
  );
  const strokePreview = useMemo(
    () =>
      createGreasePencil3dStroke(
        [
          { x: -0.8, y: 1.2, z: 0 },
          { x: 0, y: 1.55, z: 0.25 },
          { x: 0.9, y: 1.35, z: 0.05 },
        ],
        { presetId: strokePreset, baseWidthPx: inkPx * 1.4 },
      ),
    [strokePreset, inkPx],
  );
  const modifierEval = useMemo(() => evaluateModifierStack(4200, modifiers), [modifiers]);
  const vrmCheck = useMemo(
    () =>
      validateVrm1ExportSettings({
        title: vrmTitle,
        author: "ToonStudio 작가",
        commercialUsageAllowed: true,
        bakeUnifiedScreenOutline: true,
        includeSpringBones: true,
        includeArkit52Expressions: true,
        targetMaxTriangles: 32000,
        currentTriangles: 20404,
      }),
    [vrmTitle],
  );

  if (!active) return null;

  return (
    <div role="tabpanel" className="flex flex-col gap-3">
      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <strong className="flex items-center gap-1.5 text-xs font-semibold [word-break:keep-all]">
          <Wind size={14} aria-hidden />
          머리카락·의상 바람 흔들림 & 눈빛·표정 랩
        </strong>
        <label className="flex flex-col gap-1 text-xs">
          <span className="flex justify-between">
            <span>바람 세기 (24프레임 자동 굽기)</span>
            <strong className="tabular-nums">
              {windSpeed} m/s · 최대 흔들림 {windPreview[windPreview.length - 1]?.hairSwayDeg ?? 0}°
            </strong>
          </span>
          <input
            type="range"
            min={0}
            max={16}
            value={windSpeed}
            aria-label="바람 세기"
            className="min-h-11 w-full"
            onChange={(e) => setWindSpeed(Number(e.target.value))}
          />
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          {CATCHLIGHT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={pillClass(shaderLab.eyeCatchlight === opt.id)}
              onClick={() => setShaderLab((prev) => ({ ...prev, eyeCatchlight: opt.id }))}
            >
              {opt.labelKo}
            </button>
          ))}
        </div>
        <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
          엔젤링 높이 {Math.round(shaderUniforms.uHairRingCenterV * 100)}% · 눈동자 깊이{" "}
          {shaderUniforms.uIrisGradientContrast} · 표정 근육 {ARKIT_52_BLENDSHAPES.length}종 지원
        </p>

        <div className="grid grid-cols-3 gap-1.5">
          {WEBTOON_EXPRESSION_RECIPES.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className={pillClass(expressionRecipeId === recipe.id)}
              onClick={() => {
                setExpressionRecipeId(recipe.id);
                setExpressionWeights(recipe.weights);
              }}
            >
              {recipe.labelKo}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="flex justify-between">
            <span>미소 강도 세부 조절</span>
            <strong className="tabular-nums">
              {Math.round((expressionWeights.mouthSmileLeft ?? 0) * 100)}%
            </strong>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round((expressionWeights.mouthSmileLeft ?? 0) * 100)}
            aria-label="미소 강도 세부 조절"
            className="min-h-11 w-full"
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setExpressionWeights((prev) =>
                setBlendshapeWeight(setBlendshapeWeight(prev, "mouthSmileLeft", v), "mouthSmileRight", v),
              );
            }}
          />
        </label>
      </div>

      <div className={`${SUBCARD_CLS} flex flex-col gap-2`}>
        <strong className="text-xs font-semibold [word-break:keep-all]">
          3D 공간 펜선 · 자동 소품 배치 · 단계별 다듬기 · 탈것/무기 뼈대
        </strong>
        <div className="grid grid-cols-2 gap-1.5">
          {STROKE_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={pillClass(strokePreset === item.id)}
              onClick={() => setStrokePreset(item.id)}
            >
              {item.labelKo}
            </button>
          ))}
        </div>
        <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
          공간 선 길이 {strokePreview.totalLengthMeters}m · 점 {strokePreview.points.length}개
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          {SCATTER_OPTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={pillClass(scatterKind === item.id)}
              onClick={() => setScatterKind(item.id)}
            >
              {item.labelKo}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="flex justify-between">
            <span>자동 흩뿌리기 개수</span>
            <strong className="tabular-nums">{scatterInstances.length}개 배치</strong>
          </span>
          <input
            type="range"
            min={4}
            max={36}
            value={scatterCount}
            aria-label="자동 흩뿌리기 개수"
            className="min-h-11 w-full"
            onChange={(e) => setScatterCount(Number(e.target.value))}
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {modifiers.map((mod) => (
            <button
              key={mod.id}
              type="button"
              className={pillClass(mod.enabled)}
              onClick={() =>
                setModifiers((prev) =>
                  prev.map((m) => (m.id === mod.id ? { ...m, enabled: !m.enabled } : m)),
                )
              }
            >
              {mod.labelKo}
            </button>
          ))}
        </div>
        <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
          {modifierEval.summaryKo}
        </p>

        <ul className="flex flex-col gap-1 text-[11px]">
          {QUADRUPED_AND_WEAPON_RIG_PRESETS.map((rig) => (
            <li
              key={rig.id}
              className="flex items-center justify-between rounded-md border border-[var(--color-line,oklch(0.88_0.010_75))] px-2 py-1"
            >
              <span className="font-medium [word-break:keep-all]">{rig.labelKo}</span>
              <span className="opacity-75 tabular-nums">관절 {rig.boneCount}개</span>
            </li>
          ))}
        </ul>

        <label className="flex flex-col gap-1 text-xs">
          <span>캐릭터 내보내기 이름 (VRM 1.0 표준 점검)</span>
          <input
            type="text"
            value={vrmTitle}
            aria-label="캐릭터 내보내기 이름"
            className="min-h-11 rounded-lg border border-[var(--color-line,oklch(0.86_0.012_75))] bg-[var(--color-panel,oklch(0.99_0.004_75))] px-2.5 text-xs"
            onChange={(e) => setVrmTitle(e.target.value)}
          />
        </label>
        <p className="text-[11px] opacity-80 tabular-nums [word-break:keep-all]">
          {vrmCheck.ready
            ? `내보내기 준비 완료 · 예상 용량 ${vrmCheck.estimatedSizeKb}KB`
            : vrmCheck.issuesKo.join(" ")}
        </p>
      </div>
    </div>
  );
}
