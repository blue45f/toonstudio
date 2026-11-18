/**
 * 뷰포트 3D 웹툰 손 소품(스마트폰·테이크아웃 커피컵·수사/결재 서류철·에테르 마력 단검) 실시간 장착 바 & 그립 포즈 매칭.
 */
import { qNormalize } from "../../../shared/math";

import type { HandPropAttachment, HandPropId, HandPropSide, LabCommand, Pose, PresetId, Quat, Vec3 } from "../../../contracts";

function eulerDegToQuat(deg: Vec3): Quat {
  const rx = (deg[0] * Math.PI) / 360;
  const ry = (deg[1] * Math.PI) / 360;
  const rz = (deg[2] * Math.PI) / 360;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return qNormalize([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}

export interface WebtoonHandPropSpec {
  readonly id: HandPropId;
  readonly labelKo: string;
  readonly genreHintKo: string;
  readonly glbUrl: string;
  readonly sha256: string;
  readonly handPreset: PresetId;
  /**
   * 오른손 장착 기준 모델 공간 오일러 회전(deg, XYZ — 우수 좌표 T-포즈 -X 팔 기준:
   * +Z = 팔 내리기, +Y = 팔 앞으로 당기기, +X = 전완 외회전/손바닥 위로)
   */
  readonly rightArmEulerDeg: {
    readonly upperArm: Vec3;
    readonly lowerArm: Vec3;
    readonly hand: Vec3;
  };
}

/** 반대쪽 빈 손이 T-포즈로 들려 있지 않도록 자연스럽게 허리 옆으로 내려 주는 기본 휴식 각도(오른팔 기준) */
const RELAXED_RIGHT_OFF_ARM: { readonly upperArm: Vec3; readonly lowerArm: Vec3; readonly hand: Vec3 } = {
  upperArm: [6, 12, 66],
  lowerArm: [8, 22, -8],
  hand: [0, 6, 6],
};

export const WEBTOON_HAND_PROPS: readonly WebtoonHandPropSpec[] = Object.freeze([
  {
    id: "smartphone",
    labelKo: "📱 웹툰 메신저 스마트폰",
    genreHintKo: "현대·학원·로맨스 대화 컷",
    glbUrl: "/assets/props/webtoon-hand-props-v1/smartphone.glb",
    sha256: "5d3a602ec978a73f0714b9ada7c0e675683103029526b861d30a37c7b1e7de5f",
    handPreset: "hand-pose/fist",
    rightArmEulerDeg: {
      upperArm: [14, 28, 60],
      lowerArm: [32, 82, -26],
      hand: [18, 12, -8],
    },
  },
  {
    id: "coffee-cup",
    labelKo: "☕ 로스터리 테이크아웃 커피컵",
    genreHintKo: "일상·힐링·오피스 카페 컷",
    glbUrl: "/assets/props/webtoon-hand-props-v1/coffee-cup.glb",
    sha256: "97b46cc6107a5df8e18f38ac042a72eea86bcfa7735774b888f58f6f9a11de40",
    handPreset: "hand-pose/fist",
    rightArmEulerDeg: {
      upperArm: [10, 24, 62],
      lowerArm: [12, 86, -24],
      hand: [6, 14, -10],
    },
  },
  {
    id: "case-folder",
    labelKo: "📁 수사·학생회 결재 서류철",
    genreHintKo: "스릴러·오피스·아카데미 브리핑 컷",
    glbUrl: "/assets/props/webtoon-hand-props-v1/case-folder.glb",
    sha256: "9503a76571b6bd91ec074de5c1d067d4e7979fe993c4904b12c3da37140621ae",
    handPreset: "hand-pose/relaxed",
    rightArmEulerDeg: {
      upperArm: [12, 22, 62],
      lowerArm: [24, 78, -18],
      hand: [10, 10, -6],
    },
  },
  {
    id: "aether-blade",
    labelKo: "🗡️ 청운 에테르 마력 단검",
    genreHintKo: "무협·판타지·헌터 전투 컷",
    glbUrl: "/assets/props/webtoon-hand-props-v1/aether-blade.glb",
    sha256: "d4f7cdf53d5ed31d9b20ae88935f68d94a60093481be9cb3ef48b6c314c2b9ab",
    handPreset: "hand-pose/fist",
    rightArmEulerDeg: {
      upperArm: [-8, 32, 48],
      lowerArm: [-12, 68, -18],
      hand: [-14, 18, -12],
    },
  },
]);

export function findWebtoonHandPropSpec(propId: string): WebtoonHandPropSpec | null {
  return WEBTOON_HAND_PROPS.find((item) => item.id === propId) ?? null;
}

export function toHandPropAttachment(propId: string, hand: HandPropSide): HandPropAttachment | null {
  const spec = findWebtoonHandPropSpec(propId);
  if (!spec) return null;
  return {
    propId: spec.id,
    hand,
    glbUrl: spec.glbUrl,
    sha256: spec.sha256,
  };
}

function mirrorRightEulerToLeft(deg: Vec3): Vec3 {
  return [deg[0], -deg[1], -deg[2]];
}

/**
 * 선택한 소품과 장착 손(`rightHand` / `leftHand`)에 맞춰 소품 파지 팔을 가슴 앞으로 자연스럽게 올리고,
 * 반대쪽 팔이 T-포즈인 경우 자연스러운 스탠딩 팔 각도로 함께 내려 주는 원자적 `LabCommand` 목록을 생성한다.
 */
export function buildHandPropGripPoseCommands(
  currentPose: Pose,
  propId: HandPropId,
  hand: HandPropSide,
): readonly LabCommand[] {
  const spec = findWebtoonHandPropSpec(propId);
  if (!spec) return [];

  const { upperArm, lowerArm, hand: wrist } = spec.rightArmEulerDeg;
  const nextPose: Record<string, Quat> = { ...(currentPose as Record<string, Quat>) };

  // 상체에도 자연스러운 웹툰 호흡을 살짝 부여(기존 척추/고개 포즈가 비어 있을 때만)
  if (!nextPose.hips) nextPose.hips = eulerDegToQuat([0, -6, 2]);
  if (!nextPose.chest) nextPose.chest = eulerDegToQuat([-2, 5, 0]);
  if (!nextPose.head) nextPose.head = eulerDegToQuat([3, -6, -2]);

  if (hand === "rightHand") {
    nextPose.rightUpperArm = eulerDegToQuat(upperArm);
    nextPose.rightLowerArm = eulerDegToQuat(lowerArm);
    nextPose.rightHand = eulerDegToQuat(wrist);
    if (!currentPose.leftUpperArm) {
      nextPose.leftUpperArm = eulerDegToQuat(mirrorRightEulerToLeft(RELAXED_RIGHT_OFF_ARM.upperArm));
      nextPose.leftLowerArm = eulerDegToQuat(mirrorRightEulerToLeft(RELAXED_RIGHT_OFF_ARM.lowerArm));
      nextPose.leftHand = eulerDegToQuat(mirrorRightEulerToLeft(RELAXED_RIGHT_OFF_ARM.hand));
    }
  } else {
    nextPose.leftUpperArm = eulerDegToQuat(mirrorRightEulerToLeft(upperArm));
    nextPose.leftLowerArm = eulerDegToQuat(mirrorRightEulerToLeft(lowerArm));
    nextPose.leftHand = eulerDegToQuat(mirrorRightEulerToLeft(wrist));
    if (!currentPose.rightUpperArm) {
      nextPose.rightUpperArm = eulerDegToQuat(RELAXED_RIGHT_OFF_ARM.upperArm);
      nextPose.rightLowerArm = eulerDegToQuat(RELAXED_RIGHT_OFF_ARM.lowerArm);
      nextPose.rightHand = eulerDegToQuat(RELAXED_RIGHT_OFF_ARM.hand);
    }
  }

  const sideKo = hand === "rightHand" ? "오른손" : "왼손";
  return [
    {
      type: "pose/set",
      pose: nextPose as Pose,
      scope: "full",
      labelKo: `소품 그립 포즈 (${sideKo} · ${spec.labelKo})`,
    },
    {
      type: "slot/apply",
      slot: "hand-pose",
      presetId: spec.handPreset,
    },
  ];
}

export interface ViewportHandPropControlsProps {
  readonly engineReady: boolean;
  readonly propId: HandPropId | "";
  readonly hand: HandPropSide;
  readonly busy: boolean;
  readonly onSelectProp: (propId: HandPropId | "") => void;
  readonly onChangeHand: (hand: HandPropSide) => void;
  readonly onApplyGripPose: () => void;
}

export function ViewportHandPropControls({
  engineReady,
  propId,
  hand,
  busy,
  onSelectProp,
  onChangeHand,
  onApplyGripPose,
}: ViewportHandPropControlsProps) {
  const activeSpec = propId ? findWebtoonHandPropSpec(propId) : null;
  return (
    <span className="cl-viewport-group" role="group" aria-label="웹툰 3D 손 소품 어태치먼트" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <select
        className="cl-viewport-select"
        aria-label="웹툰 손 소품 선택"
        data-testid="viewport-hand-prop-select"
        value={propId}
        disabled={!engineReady || busy}
        title={activeSpec ? `${activeSpec.labelKo} (${activeSpec.genreHintKo})` : "캐릭터 손 본에 실시간 부착할 Blender 3D 웹툰 소품을 선택합니다(PNG·4컷 스트립·GLB 내보내기 포함)"}
        onChange={(event) => onSelectProp(event.target.value as HandPropId | "")}
      >
        <option value="">손 소품 없음</option>
        {WEBTOON_HAND_PROPS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.labelKo}
          </option>
        ))}
      </select>
      {propId ? (
        <>
          <select
            className="cl-viewport-select"
            aria-label="소품 장착 손"
            data-testid="viewport-hand-prop-side"
            value={hand}
            disabled={!engineReady || busy}
            onChange={(event) => onChangeHand(event.target.value as HandPropSide)}
          >
            <option value="rightHand">오른손</option>
            <option value="leftHand">왼손</option>
          </select>
          <button
            type="button"
            className="cl-viewport-button"
            data-testid="viewport-hand-prop-grip-pose"
            disabled={!engineReady || busy}
            title="선택한 소품이 카메라와 상반신 컷에서 자연스럽게 보이도록 팔·손목·손가락 그립 포즈를 즉시 맞춥니다"
            onClick={onApplyGripPose}
          >
            그립 포즈 맞춤
          </button>
        </>
      ) : null}
    </span>
  );
}
