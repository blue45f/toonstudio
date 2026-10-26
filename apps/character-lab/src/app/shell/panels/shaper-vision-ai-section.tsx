/**
 * ShaperVisionAiSection: SHAPER `BoneAIManager` (`0x02000014`) & `UIAIPreset` (`0x02000059`)
 * AI 포즈·손·6부위 프리셋 추천 파이프라인 스튜디오 인스펙터 섹션.
 */
import { useId, useMemo, useState } from "react";

import {
  SHAPER_AI_BODY_BONE_COUNT,
  SHAPER_AI_BONE_UNCERTAINTY_THRESHOLD,
  SHAPER_AI_IMAGE_MAX_SIDE,
  SHAPER_AI_MIN_CONFIDENT_BODY_BONES,
  SHAPER_AI_POSE_TYPES,
  SHAPER_AI_POSE_TYPE_LABELS_KO,
  SHAPER_AI_PRESET_FADE_DURATION_SEC,
  SHAPER_AI_WEBCAM_CAPTURE_SIZE,
  buildShaperAiPresetRecommendations,
  computeShaperAiImageDownscaleDimensions,
  computeShaperAiPresetBorderAlpha,
  evaluateShaperAiBodyPoseJson,
  stepShaperFixVectorCycle,
} from "../../../domains/vision/shaper-bone-ai";

import type {
  ShaperAiPoseType,
  ShaperAiPresetPart,
} from "../../../domains/vision/shaper-bone-ai";

const DEFAULT_PRESET_CANDIDATES = {
  head: [
    { idx: 0, prob: 0.74, presetId: "head/oval-balanced", labelKo: "계란형 표준 두상" },
    { idx: 1, prob: 0.18, presetId: "head/sharp-v", labelKo: "샤프 V라인 두상" },
    { idx: 2, prob: 0.08, presetId: "head/soft-round", labelKo: "소프트 라운드 두상" },
  ],
  eyes: [
    { idx: 0, prob: 0.68, presetId: "eyes/almond-clear", labelKo: "아몬드 클리어 눈매" },
    { idx: 1, prob: 0.21, presetId: "eyes/round-bright", labelKo: "라운드 브라이트 눈매" },
    { idx: 2, prob: 0.11, presetId: "eyes/cat-upturned", labelKo: "캣아이 눈매" },
  ],
  nose: [
    { idx: 0, prob: 0.64, presetId: "nose/straight-slim", labelKo: "슬림 직선 코" },
    { idx: 1, prob: 0.24, presetId: "nose/button-soft", labelKo: "소프트 버튼 코" },
    { idx: 2, prob: 0.12, presetId: "nose/high-bridge", labelKo: "하이 브릿지 코" },
  ],
  mouth: [
    { idx: 0, prob: 0.61, presetId: "mouth/natural-smile", labelKo: "내추럴 스마일 입술" },
    { idx: 1, prob: 0.26, presetId: "mouth/plump-gloss", labelKo: "플럼프 글로스 입술" },
    { idx: 2, prob: 0.13, presetId: "mouth/petite-bow", labelKo: "큐피드 보우 입술" },
  ],
  ears: [
    { idx: 0, prob: 0.79, presetId: "ears/standard-human", labelKo: "표준 인체 귀" },
    { idx: 1, prob: 0.14, presetId: "ears/elf-pointed", labelKo: "엘프 포인티드 귀" },
    { idx: 2, prob: 0.07, presetId: "ears/small-compact", labelKo: "소형 밀착 귀" },
  ],
  hair: [
    { idx: 0, prob: 0.71, presetId: "hair/soft-bob", labelKo: "소프트 보브 헤어" },
    { idx: 1, prob: 0.19, presetId: "hair/twin-tail", labelKo: "트윈테일 헤어" },
    { idx: 2, prob: 0.1, presetId: "hair/long-wave", labelKo: "롱 웨이브 헤어" },
  ],
} as const;

export function ShaperVisionAiSection() {
  const ids = useId();
  const [aiPoseType, setAiPoseType] = useState<ShaperAiPoseType>("body");
  const [confidentBonesInput, setConfidentBonesInput] = useState<number>(20);
  const [fixVectorStep, setFixVectorStep] = useState<0 | 1 | 2>(0);
  const [hoveredCardKey, setHoveredCardKey] = useState<string | null>(null);
  const [selectedPresetByPart, setSelectedPresetByPart] = useState<
    Partial<Record<ShaperAiPresetPart, string>>
  >({});

  const downscalePlan = useMemo(
    () =>
      aiPoseType === "bodyWebCam" || aiPoseType === "handWebCam"
        ? {
            originalWidth: 1280,
            originalHeight: 720,
            targetWidth: SHAPER_AI_WEBCAM_CAPTURE_SIZE[0],
            targetHeight: SHAPER_AI_WEBCAM_CAPTURE_SIZE[1],
            scaled: true,
            scaleFactor: SHAPER_AI_WEBCAM_CAPTURE_SIZE[0] / 1280,
          }
        : computeShaperAiImageDownscaleDimensions(1920, 1080, SHAPER_AI_IMAGE_MAX_SIDE),
    [aiPoseType],
  );

  const bodyEvaluation = useMemo(() => {
    const uncertainties = Array.from({ length: SHAPER_AI_BODY_BONE_COUNT }, (_, i) => [
      i < confidentBonesInput ? 0.012 : 0.045,
    ]);
    const pose = Array.from({ length: SHAPER_AI_BODY_BONE_COUNT }, () => [15, -10, 5] as const);
    return evaluateShaperAiBodyPoseJson(
      { uncertainties, pose },
      {
        fixBoneAngles: [[fixVectorStep, 0, 0]],
      },
    );
  }, [confidentBonesInput, fixVectorStep]);

  const presetRecommendations = useMemo(
    () => buildShaperAiPresetRecommendations(DEFAULT_PRESET_CANDIDATES),
    [],
  );

  const activeHoverFade = computeShaperAiPresetBorderAlpha(
    hoveredCardKey ? 1 : 2,
    SHAPER_AI_PRESET_FADE_DURATION_SEC,
  );

  return (
    <section
      className="cl-vision-shaper-ai"
      data-testid="shaper-vision-ai-section"
      aria-labelledby={`${ids}-shaper-ai-title`}
    >
      <h3 id={`${ids}-shaper-ai-title`}>
        SHAPER BoneAIManager · UIAIPreset 파이프라인
      </h3>

      <fieldset className="cl-vision-row">
        <legend>AI 추론 모드 (AIPoseType 5종)</legend>
        {SHAPER_AI_POSE_TYPES.map((mode) => (
          <label key={mode} htmlFor={`${ids}-mode-${mode}`}>
            <input
              id={`${ids}-mode-${mode}`}
              type="radio"
              name={`${ids}-ai-pose-type`}
              value={mode}
              checked={aiPoseType === mode}
              onChange={() => setAiPoseType(mode)}
            />
            {SHAPER_AI_POSE_TYPE_LABELS_KO[mode]}
          </label>
        ))}
      </fieldset>

      <p className="cl-vision-hint" data-testid="shaper-ai-downscale-badge">
        입력 리샘플링 규격:{" "}
        {aiPoseType === "bodyWebCam" || aiPoseType === "handWebCam"
          ? `웹캠 ScaleTexture 고정 ${SHAPER_AI_WEBCAM_CAPTURE_SIZE[0]}×${SHAPER_AI_WEBCAM_CAPTURE_SIZE[1]}px`
          : `정지 영상 최장변 ${SHAPER_AI_IMAGE_MAX_SIDE}px 종횡비 보존 (${downscalePlan.originalWidth}×${downscalePlan.originalHeight} → ${downscalePlan.targetWidth}×${downscalePlan.targetHeight}px)`}
      </p>

      <div className="cl-vision-row">
        <label htmlFor={`${ids}-confident-bones`}>
          신뢰 본 개수 시뮬레이션 (uncertainty &lt; {SHAPER_AI_BONE_UNCERTAINTY_THRESHOLD}, 최소{" "}
          {SHAPER_AI_MIN_CONFIDENT_BODY_BONES}/{SHAPER_AI_BODY_BONE_COUNT}본)
        </label>
        <input
          id={`${ids}-confident-bones`}
          type="range"
          min={0}
          max={SHAPER_AI_BODY_BONE_COUNT}
          step={1}
          value={confidentBonesInput}
          onChange={(event) => setConfidentBonesInput(Number(event.target.value))}
        />
        <output htmlFor={`${ids}-confident-bones`}>
          {confidentBonesInput}/{SHAPER_AI_BODY_BONE_COUNT}본
        </output>
      </div>

      <div className="cl-vision-row">
        <button
          type="button"
          data-testid="shaper-ai-fix-vector-btn"
          onClick={() => setFixVectorStep((prev) => stepShaperFixVectorCycle(prev))}
        >
          축 보정 순환 (ChangeFixVector +{fixVectorStep * 90}°)
        </button>
        <span data-testid="shaper-ai-confidence-gate-status">
          {bodyEvaluation.accepted
            ? `게이트 통과 (${bodyEvaluation.confidentBoneCount}/${SHAPER_AI_BODY_BONE_COUNT}본 · 루트 X ${bodyEvaluation.bones[0]?.eulerDeg[0] ?? 0}°)`
            : `게이트 거부 (${bodyEvaluation.rejectionReasonKo ?? ""})`}
        </span>
      </div>

      <div className="cl-vision-recs" data-testid="shaper-ai-preset-grid">
        <h4>
          UIAIPreset 6부위 × 3후보 추천 (테두리 페이드 {SHAPER_AI_PRESET_FADE_DURATION_SEC}s · 알파{" "}
          {activeHoverFade.alpha.toFixed(1)})
        </h4>
        {presetRecommendations.map((group) => (
          <div
            key={group.part}
            className="cl-vision-rec-slot"
            data-shaper-part={group.part}
          >
            <h5>
              {group.partLabelKo} (Y {group.rowY}px)
            </h5>
            <div className="cl-vision-row">
              {group.items.map((item) => {
                const key = `${item.part}:${item.presetId}`;
                const isSelected = selectedPresetByPart[group.part] === item.presetId;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={isSelected}
                    data-testid={`shaper-ai-preset-card-${group.part}-${item.rank}`}
                    onMouseEnter={() => setHoveredCardKey(key)}
                    onMouseLeave={() => setHoveredCardKey(null)}
                    onClick={() =>
                      setSelectedPresetByPart((prev) => ({
                        ...prev,
                        [group.part]: item.presetId,
                      }))
                    }
                  >
                    {item.rank + 1}위 {item.labelKo} ({Math.round(item.probability * 100)}%)
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
