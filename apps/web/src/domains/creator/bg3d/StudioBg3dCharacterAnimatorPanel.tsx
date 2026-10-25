import { User, Smile, Play, Sparkles } from "lucide-react";
import React, { useMemo, useState } from "react";

import {
  PROPORTION_PRESETS,
  FACIAL_EXPRESSION_PRESETS,
  CORE_ANIMATION_CLIPS,
  type ProportionRatioPreset,
  type AnimeFacialExpressionKind,
  type CoreAnimationClipKind,
  type BodyProportionsSpec,
  type FacialMorphWeights,
} from "../scene-3d/studio-3d-character-animator-and-proportions";
import { Studio3DCharacterRigGraph } from "../scene-3d/studio-3d-character-rig-graph";
import {
  STUDIO_MANNEQUIN_HEAD_STYLES,
  type StudioMannequinHeadStyle,
} from "../scene-3d/studio-3d-feature-pack-2026";
import { STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE } from "../scene-3d/studio-mannequin-hand-controller";
import {
  WEBTOON_VRM_MOOD_PRESETS,
  alignObjectToNormal,
  applyVrmMoodPreset,
  type VrmExpressionState,
} from "../scene-3d/studio-vrm-expression-controller";
import { checkStudioVrmPoseJointLimits } from "../vrm/studio-vrm-pose-anatomy-check";

export interface StudioBg3dCharacterAnimatorPanelProps {
  readonly onApplyProportions?: (spec: BodyProportionsSpec) => void;
  readonly onApplyFacialExpression?: (weights: FacialMorphWeights) => void;
  readonly onPlayAnimationClip?: (clipId: CoreAnimationClipKind) => void;
  readonly onApplyHeadStyle?: (style: StudioMannequinHeadStyle) => void;
  readonly onApplyVrmMood?: (state: VrmExpressionState) => void;
}

export function StudioBg3dCharacterAnimatorPanel({
  onApplyProportions,
  onApplyFacialExpression,
  onPlayAnimationClip,
  onApplyHeadStyle,
  onApplyVrmMood,
}: StudioBg3dCharacterAnimatorPanelProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<"proportions" | "facial" | "motion">("proportions");
  const [selectedPropPreset, setSelectedPropPreset] = useState<ProportionRatioPreset>("7-head-standard-manga");
  const [proportions, setProportions] = useState<BodyProportionsSpec>(
    () => PROPORTION_PRESETS["7-head-standard-manga"],
  );
  const [headStyle, setHeadStyle] = useState<StudioMannequinHeadStyle>("anime");

  const [selectedExpression, setSelectedExpression] = useState<AnimeFacialExpressionKind>("joy-smile");
  const [selectedVrmMood, setSelectedVrmMood] = useState<string>("기쁨·미소");
  const [selectedClip, setSelectedClip] = useState<CoreAnimationClipKind>("idle-breathing");

  const rigSummary = useMemo(() => {
    const graph = new Studio3DCharacterRigGraph();
    graph.mapBone("hips", "J_Bip_C_Hips", [0, 0.95, 0]);
    graph.mapBone("spine", "J_Bip_C_Spine", [0, 1.1, 0]);
    graph.mapBone("head", "J_Bip_C_Head", [0, 1.55, 0]);
    const handPresets = Studio3DCharacterRigGraph.getDefaultHandPresets();
    const limitFindings = checkStudioVrmPoseJointLimits({
      id: selectedClip,
      jointRotations: {
        hips: [0, 0, 0],
        leftUpperArm: [0.25, 0, -0.35],
        rightUpperArm: [0.25, 0, 0.35],
      },
    });
    const alignedUpEuler = alignObjectToNormal([0, 1, 0]);
    return {
      mappedBones: graph.getAllBones().length,
      handPresetCount: handPresets.length,
      handJoints: `${STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE.left}/${STUDIO_MANNEQUIN_HAND_JOINT_BY_SIDE.right}`,
      limitViolationCount: limitFindings.length,
      alignedUpEuler,
    };
  }, [selectedClip]);

  const handleProportionSelect = (preset: ProportionRatioPreset) => {
    setSelectedPropPreset(preset);
    const spec = PROPORTION_PRESETS[preset];
    setProportions(spec);
    onApplyProportions?.(spec);
  };

  const handleExpressionSelect = (exp: AnimeFacialExpressionKind) => {
    setSelectedExpression(exp);
    onApplyFacialExpression?.(FACIAL_EXPRESSION_PRESETS[exp]);
  };

  const handlePlayClip = (clip: CoreAnimationClipKind) => {
    setSelectedClip(clip);
    onPlayAnimationClip?.(clip);
  };

  return (
    <div className="flex flex-col gap-3 p-3 text-xs text-fg">
      {/* Top Tab Switches */}
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveTab("proportions")}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[0.7rem] font-bold transition-all ${
            activeTab === "proportions"
              ? "border border-line bg-raised text-fg shadow-sm"
              : "text-fg-3 hover:text-fg"
          }`}
        >
          <User className="size-3.5 text-accent" />
          <span>등신대 비율</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("facial")}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[0.7rem] font-bold transition-all ${
            activeTab === "facial"
              ? "border border-line bg-raised text-fg shadow-sm"
              : "text-fg-3 hover:text-fg"
          }`}
        >
          <Smile className="size-3.5 text-accent" />
          <span>애니 표정 (12종)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("motion")}
          className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[0.7rem] font-bold transition-all ${
            activeTab === "motion"
              ? "border border-line bg-raised text-fg shadow-sm"
              : "text-fg-3 hover:text-fg"
          }`}
        >
          <Play className="size-3.5 text-accent" />
          <span>모션 클립</span>
        </button>
      </div>

      {/* Tab 1: Head-to-Body Proportions */}
      {activeTab === "proportions" && (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "8-head-heroic-real" as const, label: "8등신 극화 실사형" },
              { id: "7-head-standard-manga" as const, label: "7등신 표준 만화형" },
              { id: "6-head-teen-anime" as const, label: "6등신 청소년 애니형" },
              { id: "4-head-sd-chibi" as const, label: "4등신 SD 귀여운 치비" },
              { id: "2.5-head-mini-mascot" as const, label: "2.5등신 미니 마스코트" },
            ].map((prop) => (
              <button
                key={prop.id}
                type="button"
                onClick={() => handleProportionSelect(prop.id)}
                className={`flex items-center justify-between rounded-lg border p-2 text-left transition-all ${
                  selectedPropPreset === prop.id
                    ? "border-accent bg-accent/10 font-bold text-accent shadow-sm"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <span className="text-[0.72rem]">{prop.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-line bg-card p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] text-fg-2">머리 크기 배율 (Head):</span>
              <span className="font-mono text-xs font-bold text-fg">{proportions.headScale}x</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] text-fg-2">어깨 너비 (Shoulder):</span>
              <span className="font-mono text-xs font-bold text-fg">{proportions.shoulderWidth}x</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[0.68rem] text-fg-2">다리 길이 (Leg):</span>
              <span className="font-mono text-xs font-bold text-fg">{proportions.legLength}x</span>
            </div>
          </div>

          <div
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2.5"
            data-testid="bg3d-mannequin-head-style-section"
          >
            <span className="text-[0.68rem] font-bold text-fg">
              데생 인형 두상 스타일 교체·숨김 ({STUDIO_MANNEQUIN_HEAD_STYLES.length}종)
            </span>
            <div className="flex flex-wrap gap-1">
              {STUDIO_MANNEQUIN_HEAD_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  data-testid={`bg3d-head-style-${style.id}`}
                  onClick={() => {
                    setHeadStyle(style.id);
                    onApplyHeadStyle?.(style.id);
                  }}
                  className={`rounded border px-2 py-0.5 text-[0.65rem] ${
                    headStyle === style.id
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-raised text-fg-2"
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Facial Expressions */}
      {activeTab === "facial" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
            {[
              { id: "joy-smile" as const, label: "활짝 웃음 (Joy)" },
              { id: "anger-shout" as const, label: "분노 외침 (Anger)" },
              { id: "sorrow-crying" as const, label: "슬픔 눈물 (Sorrow)" },
              { id: "panic-shock" as const, label: "경악 패닉 (Shock)" },
              { id: "smug-confident" as const, label: "자신만만 미소 (Smug)" },
              { id: "wink-left" as const, label: "왼쪽 윙크 (Wink L)" },
              { id: "wink-right" as const, label: "오른쪽 윙크 (Wink R)" },
              { id: "blushing-embarrassed" as const, label: "홍조 부끄러움 (Blush)" },
              { id: "focused-determined" as const, label: "결의 집중 (Determined)" },
              { id: "sleepy-yawn" as const, label: "졸림 하품 (Sleepy)" },
              { id: "screaming-fear" as const, label: "공포 비명 (Fear)" },
              { id: "neutral-calm" as const, label: "무표정 (Neutral)" },
            ].map((exp) => (
              <button
                key={exp.id}
                type="button"
                onClick={() => handleExpressionSelect(exp.id)}
                className={`flex items-center justify-between rounded-lg border p-2 text-left transition-all ${
                  selectedExpression === exp.id
                    ? "border-accent bg-accent/10 font-bold text-accent shadow-sm"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <span className="text-[0.72rem]">{exp.label}</span>
              </button>
            ))}
          </div>

          <div
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2"
            data-testid="bg3d-vrm-mood-presets-section"
          >
            <span className="text-[0.66rem] font-bold text-fg">
              VRM 1.0 감정 무드 조합 프리셋
            </span>
            <div className="flex flex-wrap gap-1">
              {Object.keys(WEBTOON_VRM_MOOD_PRESETS).map((mood) => (
                <button
                  key={mood}
                  type="button"
                  onClick={() => {
                    setSelectedVrmMood(mood);
                    onApplyVrmMood?.(applyVrmMoodPreset(mood));
                  }}
                  className={`rounded border px-2 py-0.5 text-[0.64rem] ${
                    selectedVrmMood === mood
                      ? "border-accent bg-accent/15 font-bold text-accent"
                      : "border-line bg-raised text-fg-2"
                  }`}
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Motion Clips */}
      {activeTab === "motion" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
            {CORE_ANIMATION_CLIPS.map((clip) => (
              <button
                key={clip.id}
                type="button"
                onClick={() => handlePlayClip(clip.id)}
                className={`flex items-center justify-between rounded-lg border p-2 text-left transition-all ${
                  selectedClip === clip.id
                    ? "border-accent bg-accent/10 font-bold text-accent shadow-sm"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-[0.72rem] font-medium text-fg">{clip.label}</span>
                  <span className="text-[0.62rem] text-fg-3">{clip.description}</span>
                </div>
                <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.62rem] text-fg-2">
                  {clip.durationSeconds}s
                </span>
              </button>
            ))}
          </div>
          <div
            className="rounded-lg border border-line bg-card/60 px-2.5 py-1.5 text-[0.64rem] text-fg-3"
            data-testid="bg3d-rig-anatomy-readout"
          >
            핸드 프리셋 {rigSummary.handPresetCount}종 ({rigSummary.handJoints}) · 해부학 리밋 위반{" "}
            {rigSummary.limitViolationCount}건 · 법선 정렬 ({rigSummary.alignedUpEuler.join(", ")}°)
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          onApplyProportions?.(proportions);
          onApplyFacialExpression?.(FACIAL_EXPRESSION_PRESETS[selectedExpression]);
          onPlayAnimationClip?.(selectedClip);
        }}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-[0.72rem] font-bold text-on-accent shadow-sm transition-all hover:bg-accent/90"
      >
        <Sparkles className="size-3.5" />
        <span>캐릭터 신체/표정/모션 파라미터 적용</span>
      </button>
    </div>
  );
}
