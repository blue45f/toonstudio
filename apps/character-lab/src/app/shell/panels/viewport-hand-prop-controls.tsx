/**
 * 뷰포트 3D 웹툰 소품·배경·효과음 스탬프 워크벤치 바 (Unslop Warm Ink Atelier 정제 규약):
 * - 손 소품 6종(`smartphone`, `coffee-cup`, `case-folder`, `aether-blade`, `imperial-scroll`, `jade-folding-fan`) + 왼손/오른손 전환 + 1-클릭 그립 포즈
 * - 머리 액세서리 4종(`wire-glasses`, `rofan-tiara`, `tactical-headset`, `pearl-earrings-pin`) 실시간 head 본 부착
 * - 배경 스테이지 프롭 6종(`cafe-bistro-table`, `academy-desk`, `murim-sword-aura`, `rofan-throne-dais`, `noir-interrogation-lamp`, `rooftop-safety-railing`) 발밑·등 뒤 배치
 * - 한국형 웹툰 3D 오노마토페 스탬프 4종(`seureung`, `dugeun`, `kugugung`, `pat`) 상단 프레임 배치
 */
import { qNormalize } from "../../../shared/math";

import type {
  HandPropAttachment,
  HandPropId,
  HandPropSide,
  HeadPropAttachment,
  HeadPropId,
  LabCommand,
  Pose,
  PresetId,
  Quat,
  SfxStampAttachment,
  SfxStampId,
  StagePropAttachment,
  StagePropId,
  Vec3,
} from "../../../contracts";

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
  readonly rightArmEulerDeg: {
    readonly upperArm: Vec3;
    readonly lowerArm: Vec3;
    readonly hand: Vec3;
  };
}

export interface WebtoonHeadPropSpec {
  readonly id: HeadPropId;
  readonly labelKo: string;
  readonly genreHintKo: string;
  readonly glbUrl: string;
  readonly sha256: string;
}

export interface WebtoonStagePropSpec {
  readonly id: StagePropId;
  readonly labelKo: string;
  readonly genreHintKo: string;
  readonly glbUrl: string;
  readonly sha256: string;
}

export interface WebtoonSfxStampSpec {
  readonly id: SfxStampId;
  readonly glyphKo: string;
  readonly labelKo: string;
  readonly genreHintKo: string;
  readonly accentHex: string;
  readonly glbUrl: string;
  readonly sha256: string;
}

const RELAXED_RIGHT_OFF_ARM: { readonly upperArm: Vec3; readonly lowerArm: Vec3; readonly hand: Vec3 } = {
  upperArm: [6, 12, 66],
  lowerArm: [8, 22, -8],
  hand: [0, 6, 6],
};

export const WEBTOON_HAND_PROPS: readonly WebtoonHandPropSpec[] = Object.freeze([
  {
    id: "smartphone",
    labelKo: "웹툰 메신저 스마트폰",
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
    labelKo: "로스터리 테이크아웃 커피컵",
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
    labelKo: "수사·학생회 결재 서류철",
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
    labelKo: "청운 에테르 마력 단검",
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
  {
    id: "imperial-scroll",
    labelKo: "황실 칙령·계약 두루마리",
    genreHintKo: "로판·무협·사극 황실 조서 컷",
    glbUrl: "/assets/props/webtoon-hand-props-v1/imperial-scroll.glb",
    sha256: "77fbd9018fa4f238c75933054ffce0a5edc262fcef229f35fe7cdd6c250a915f",
    handPreset: "hand-pose/fist",
    rightArmEulerDeg: {
      upperArm: [12, 26, 60],
      lowerArm: [22, 80, -20],
      hand: [10, 12, -8],
    },
  },
  {
    id: "jade-folding-fan",
    labelKo: "청옥 접선 부채",
    genreHintKo: "무협·동양풍·로판 귀족 회담 컷",
    glbUrl: "/assets/props/webtoon-hand-props-v1/jade-folding-fan.glb",
    sha256: "a540bacdad39d9234fedc31e7844a548346c94fb45203c8a55ff0bbee3ddc347",
    handPreset: "hand-pose/relaxed",
    rightArmEulerDeg: {
      upperArm: [16, 28, 56],
      lowerArm: [28, 86, -24],
      hand: [16, 16, -10],
    },
  },
]);

export const WEBTOON_HEAD_PROPS: readonly WebtoonHeadPropSpec[] = Object.freeze([
  {
    id: "wire-glasses",
    labelKo: "메탈 라운드 안경",
    genreHintKo: "오피스·학원·추리 지성파 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/wire-glasses.glb",
    sha256: "3bbb641020fe34e91f292490947392293b1b6d2d7c94ff04e7045fca5347f303",
  },
  {
    id: "rofan-tiara",
    labelKo: "로판 황실 사파이어 티아라",
    genreHintKo: "로맨스판타지·성녀 대관식 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/rofan-tiara.glb",
    sha256: "58053ca4b8090c134141b7c5f3730dd715e9a5912378fe8c49087186e8ee1734",
  },
  {
    id: "tactical-headset",
    labelKo: "전술 홀로그램 헤드셋",
    genreHintKo: "아포칼립스·헌터·사이버 전술 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/tactical-headset.glb",
    sha256: "7105564a2e7db203c30d1276a0da3f8a7b9083d7f01aae5014195c675bdd955c",
  },
  {
    id: "pearl-earrings-pin",
    labelKo: "진주 드롭 귀걸이·골드 헤어핀",
    genreHintKo: "로맨스·아이돌·캠퍼스 클로즈업 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/pearl-earrings-pin.glb",
    sha256: "90e889c9c6a533f0fb1f3638b3bf137e6e0ab22f84469d77abf70c83d4073eaf",
  },
  {
    id: "studio-headphones",
    labelKo: "청춘 무선 네크 헤드폰",
    genreHintKo: "학원·청춘·아이돌 옥상 황혼 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/studio-headphones.glb",
    sha256: "5eba8a11dcaf7f6948e8e532e89d371757431ac55b3ab54b5d44bc42dbebcb3e",
  },
  {
    id: "silver-monocle",
    labelKo: "괴도·집사 실버 체인 모노클",
    genreHintKo: "로판·느와르·추리 귀족 클로즈업 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/silver-monocle.glb",
    sha256: "ffb96d9b4c590822fc46a9988b7f6b5d05e54fc1a6cd471d514f7fdcbd51f14b",
  },
]);

export const WEBTOON_STAGE_PROPS: readonly WebtoonStagePropSpec[] = Object.freeze([
  {
    id: "cafe-bistro-table",
    labelKo: "오후 카페 비스트로 테이블",
    genreHintKo: "일상·힐링·오피스 대화 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/cafe-bistro-table.glb",
    sha256: "b53f5f7947f23b4c2eb734f05f19bd2726a980528d8f2fc4b7b3c08cdf3efabd",
  },
  {
    id: "academy-desk",
    labelKo: "학원물 교실 책상·노트",
    genreHintKo: "학원·청춘·학생회실 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/academy-desk.glb",
    sha256: "7d665228a084326822b6c3fbb73c8ed165fbf7515d65718dea7bd33d34c3a9c5",
  },
  {
    id: "murim-sword-aura",
    labelKo: "무협 청운 검기 진법",
    genreHintKo: "무협·판타지·헌터 각성 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/murim-sword-aura.glb",
    sha256: "6473e234bf764d87509a7a4cf101b3e8808230119df304d5f65a4ecf6f30e8d1",
  },
  {
    id: "rofan-throne-dais",
    labelKo: "로판 황실 대관식 대리석 단상",
    genreHintKo: "로판·황실·성녀 대관식 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/rofan-throne-dais.glb",
    sha256: "f8892e523eb8a92e522311ab3ebd7c4914fb2e6ba885468289b734a75f402eca",
  },
  {
    id: "noir-interrogation-lamp",
    labelKo: "느와르 취조실 스틸 책상·펜던트 조명",
    genreHintKo: "스릴러·느와르·추리 브리핑 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/noir-interrogation-lamp.glb",
    sha256: "d704492daf28d0fd448aa7b603d2cae413a9cd7897339825642fed09a76db830",
  },
  {
    id: "rooftop-safety-railing",
    labelKo: "옥상 황혼 안전 난간·벤치",
    genreHintKo: "학원·청춘·스릴러 옥상 독대 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/rooftop-safety-railing.glb",
    sha256: "f18ff2d59f400a439d9d37efbc20110c5d1340635e4f698344e9df4fc11edb64",
  },
]);

export const WEBTOON_SFX_STAMPS: readonly WebtoonSfxStampSpec[] = Object.freeze([
  {
    id: "seureung",
    glyphKo: "스릉",
    labelKo: "스릉 (발도·검기 효과음)",
    genreHintKo: "무협·로판·헌터 발도 컷",
    accentHex: "#5ce8f2",
    glbUrl: "/assets/props/webtoon-sfx-stamps-v1/sfx-seureung.glb",
    sha256: "69d81ae58c47956533b3b6d4a104b1b1ec2da40613840f02a57f85c59a547b62",
  },
  {
    id: "dugeun",
    glyphKo: "두근",
    labelKo: "두근 (로맨스·설렘 효과음)",
    genreHintKo: "로맨스·캠퍼스·로판 아이컨택 컷",
    accentHex: "#f486a8",
    glbUrl: "/assets/props/webtoon-sfx-stamps-v1/sfx-dugeun.glb",
    sha256: "aaac089e175b1937a33c655c26fa281254e886cb64fcbea5783e9949064cb3e6",
  },
  {
    id: "kugugung",
    glyphKo: "쿠구궁",
    labelKo: "쿠구궁 (위압·각성 효과음)",
    genreHintKo: "액션·각성·클라이맥스 컷",
    accentHex: "#f0b856",
    glbUrl: "/assets/props/webtoon-sfx-stamps-v1/sfx-kugugung.glb",
    sha256: "f6e7c1c628f94b3a85155a1220e2af0a19d531d43c9d32af37ee1a80792bb11c",
  },
  {
    id: "pat",
    glyphKo: "팟",
    labelKo: "팟 (섬광·반전 효과음)",
    genreHintKo: "스릴러·추리·시선 반전 컷",
    accentHex: "#ffe076",
    glbUrl: "/assets/props/webtoon-sfx-stamps-v1/sfx-pat.glb",
    sha256: "5986d529a9b8955d8d59e75b6085e25e19f67b7e7034dfa65ba6f735f78fc898",
  },
  {
    id: "ssaa",
    glyphKo: "싸아",
    labelKo: "싸아 (정적·서늘한 밤바람 효과음)",
    genreHintKo: "옥상 독대·스릴러·느와르 냉기 컷",
    accentHex: "#93c5fd",
    glbUrl: "/assets/props/webtoon-sfx-stamps-v1/sfx-ssaa.glb",
    sha256: "8f3ca315f1ae0f5a3ae4a389c6cdc5ce30b93ff2b9e0efad490fd5c7642662df",
  },
  {
    id: "beonjjeok",
    glyphKo: "번쩍",
    labelKo: "번쩍 (각성·진실 섬광 효과음)",
    genreHintKo: "판타지·무협·추리 단서 포착 컷",
    accentHex: "#facc15",
    glbUrl: "/assets/props/webtoon-sfx-stamps-v1/sfx-beonjjeok.glb",
    sha256: "f5627e459a8a7c8587e97ec7f243491e8cbd8ffaf08afc7c552011897b01107a",
  },
]);

export function findWebtoonHandPropSpec(propId: string): WebtoonHandPropSpec | null {
  return WEBTOON_HAND_PROPS.find((item) => item.id === propId) ?? null;
}

export function findWebtoonHeadPropSpec(propId: string): WebtoonHeadPropSpec | null {
  return WEBTOON_HEAD_PROPS.find((item) => item.id === propId) ?? null;
}

export function findWebtoonStagePropSpec(propId: string): WebtoonStagePropSpec | null {
  return WEBTOON_STAGE_PROPS.find((item) => item.id === propId) ?? null;
}

export function findWebtoonSfxStampSpec(stampId: string): WebtoonSfxStampSpec | null {
  return WEBTOON_SFX_STAMPS.find((item) => item.id === stampId) ?? null;
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

export function toHeadPropAttachment(propId: string): HeadPropAttachment | null {
  const spec = findWebtoonHeadPropSpec(propId);
  if (!spec) return null;
  return {
    propId: spec.id,
    glbUrl: spec.glbUrl,
    sha256: spec.sha256,
  };
}

export function toStagePropAttachment(propId: string): StagePropAttachment | null {
  const spec = findWebtoonStagePropSpec(propId);
  if (!spec) return null;
  return {
    propId: spec.id,
    glbUrl: spec.glbUrl,
    sha256: spec.sha256,
  };
}

export function toSfxStampAttachment(stampId: string): SfxStampAttachment | null {
  const spec = findWebtoonSfxStampSpec(stampId);
  if (!spec) return null;
  return {
    stampId: spec.id,
    glbUrl: spec.glbUrl,
    sha256: spec.sha256,
  };
}

function mirrorRightEulerToLeft(deg: Vec3): Vec3 {
  return [deg[0], -deg[1], -deg[2]];
}

export function buildHandPropGripPoseCommands(
  currentPose: Pose,
  propId: HandPropId,
  hand: HandPropSide,
): readonly LabCommand[] {
  const spec = findWebtoonHandPropSpec(propId);
  if (!spec) return [];

  const { upperArm, lowerArm, hand: wrist } = spec.rightArmEulerDeg;
  const nextPose: Record<string, Quat> = { ...(currentPose as Record<string, Quat>) };

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
  readonly headPropId?: HeadPropId | "";
  readonly stagePropId?: StagePropId | "";
  readonly busy: boolean;
  readonly onSelectProp: (propId: HandPropId | "") => void;
  readonly onChangeHand: (hand: HandPropSide) => void;
  readonly onApplyGripPose: () => void;
  readonly onSelectHeadProp?: (propId: HeadPropId | "") => void;
  readonly onSelectStageProp?: (propId: StagePropId | "") => void;
}

export function ViewportHandPropControls({
  engineReady,
  propId,
  hand,
  headPropId = "",
  stagePropId = "",
  busy,
  onSelectProp,
  onChangeHand,
  onApplyGripPose,
  onSelectHeadProp,
  onSelectStageProp,
}: ViewportHandPropControlsProps) {
  const activeHandSpec = propId ? findWebtoonHandPropSpec(propId) : null;
  const activeHeadSpec = headPropId ? findWebtoonHeadPropSpec(headPropId) : null;
  const activeStageSpec = stagePropId ? findWebtoonStagePropSpec(stagePropId) : null;

  return (
    <span className="cl-viewport-group cl-viewport-prop-cluster" role="group" aria-label="웹툰 3D 소품·액세서리·스테이지">
      <select
        className="cl-viewport-select"
        aria-label="웹툰 손 소품 선택"
        data-testid="viewport-hand-prop-select"
        value={propId}
        disabled={!engineReady || busy}
        title={activeHandSpec ? `${activeHandSpec.labelKo} (${activeHandSpec.genreHintKo})` : "캐릭터 손 본에 실시간 부착할 Blender 3D 웹툰 소품을 선택합니다"}
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
            title="선택한 소품이 상반신 컷에서 자연스럽게 보이도록 파지 팔과 반대쪽 휴식 팔 각도를 즉시 맞춥니다"
            onClick={onApplyGripPose}
          >
            그립 포즈 맞춤
          </button>
        </>
      ) : null}
      {onSelectHeadProp ? (
        <select
          className="cl-viewport-select"
          aria-label="웹툰 머리 액세서리 선택"
          data-testid="viewport-head-prop-select"
          value={headPropId}
          disabled={!engineReady || busy}
          title={activeHeadSpec ? `${activeHeadSpec.labelKo} (${activeHeadSpec.genreHintKo})` : "캐릭터 머리(head) 본에 실시간 부착할 안경·티아라·헤드셋·귀걸이를 선택합니다"}
          onChange={(event) => onSelectHeadProp(event.target.value as HeadPropId | "")}
        >
          <option value="">머리 액세서리 없음</option>
          {WEBTOON_HEAD_PROPS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.labelKo}
            </option>
          ))}
        </select>
      ) : null}
      {onSelectStageProp ? (
        <select
          className="cl-viewport-select"
          aria-label="웹툰 배경 스테이지 선택"
          data-testid="viewport-stage-prop-select"
          value={stagePropId}
          disabled={!engineReady || busy}
          title={activeStageSpec ? `${activeStageSpec.labelKo} (${activeStageSpec.genreHintKo})` : "캐릭터 발밑과 주변에 배치할 경량 웹툰 배경 스탠드를 선택합니다"}
          onChange={(event) => onSelectStageProp(event.target.value as StagePropId | "")}
        >
          <option value="">배경 스테이지 없음</option>
          {WEBTOON_STAGE_PROPS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.labelKo}
            </option>
          ))}
        </select>
      ) : null}
    </span>
  );
}
