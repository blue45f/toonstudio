/**
 * 뷰포트 3D 웹툰 소품·배경 워크벤치 바 (Unslop Warm Ink Atelier 정제 규약):
 * - 손 소품 4종(`smartphone`, `coffee-cup`, `case-folder`, `aether-blade`) + 왼손/오른손 전환 + 1-클릭 그립 포즈
 * - 머리 액세서리 4종(`wire-glasses`, `rofan-tiara`, `tactical-headset`, `pearl-earrings-pin`) 실시간 head 본 부착
 * - 배경 스테이지 프롭 3종(`cafe-bistro-table`, `academy-desk`, `murim-sword-aura`) 발밑·등 뒤 배치
 */
import { useState } from "react";

import { isLabFailure } from "../../../contracts";
import { qNormalize } from "../../../shared/math";

import type {
  CharacterEngine,
  HandPropAttachment,
  HandPropId,
  HandPropSide,
  HeadPropAttachment,
  HeadPropId,
  LabCommand,
  Pose,
  PresetId,
  Quat,
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
]);

export const WEBTOON_HEAD_PROPS: readonly WebtoonHeadPropSpec[] = Object.freeze([
  {
    id: "wire-glasses",
    labelKo: "메탈 라운드 안경",
    genreHintKo: "오피스·학원·추리 지성파 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/wire-glasses.glb",
    sha256: "5c82ef01a3e43d04e79b08c2fb37e7b11b626c6b2dbc09a41fcb1d57c99cc053",
  },
  {
    id: "rofan-tiara",
    labelKo: "로판 황실 사파이어 티아라",
    genreHintKo: "로맨스판타지·성녀 대관식 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/rofan-tiara.glb",
    sha256: "9b7426f04c2d43bf789cfc1a8d6d0b5f2cb86bfbfb5d68f58677f7e78dc48551",
  },
  {
    id: "tactical-headset",
    labelKo: "전술 홀로그램 헤드셋",
    genreHintKo: "아포칼립스·헌터·사이버 전술 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/tactical-headset.glb",
    sha256: "947e0feac84c4256974676c4f67e84742abf45c95880ad9b81fbec576a55a2c1",
  },
  {
    id: "pearl-earrings-pin",
    labelKo: "진주 드롭 귀걸이·골드 헤어핀",
    genreHintKo: "로맨스·아이돌·캠퍼스 클로즈업 연출",
    glbUrl: "/assets/props/webtoon-head-props-v1/pearl-earrings-pin.glb",
    sha256: "de92d56c0fc0456d862da11c8547f8cd6d28c032abb3ae8769c45b55460f4913",
  },
]);

export const WEBTOON_STAGE_PROPS: readonly WebtoonStagePropSpec[] = Object.freeze([
  {
    id: "cafe-bistro-table",
    labelKo: "오후 카페 비스트로 테이블",
    genreHintKo: "일상·힐링·오피스 대화 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/cafe-bistro-table.glb",
    sha256: "baddc4e3de86ed82574456b824bfbe457e54979e28dbe02a3e7b56f40aca16cc",
  },
  {
    id: "academy-desk",
    labelKo: "학원물 교실 책상·노트",
    genreHintKo: "학원·청춘·학생회실 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/academy-desk.glb",
    sha256: "7781d63821d014a91847ec638974b7b96e759a7ccfcbac2440372572c98cbf90",
  },
  {
    id: "murim-sword-aura",
    labelKo: "무협 청운 검기 진법",
    genreHintKo: "무협·판타지·헌터 각성 스테이지",
    glbUrl: "/assets/props/webtoon-stage-props-v1/murim-sword-aura.glb",
    sha256: "8629d4d2e8df7cad8184c245637deba56393aefa84f5a441e8d2cea5dc1053f3",
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

/** 세 소품 슬롯의 선택 상태·장착 요청·그립 포즈 명령을 표시부와 함께 유지한다. */
export function ViewportHandPropAttachment({ engine, pose, dispatch, setNotice }: {
  readonly engine: CharacterEngine | null;
  readonly pose: Pose;
  readonly dispatch: (command: LabCommand) => void;
  readonly setNotice: (notice: string) => void;
}) {
  const [handPropId, setHandPropId] = useState<HandPropId | "">("");
  const [handPropSide, setHandPropSide] = useState<HandPropSide>("rightHand");
  const [headPropId, setHeadPropId] = useState<HeadPropId | "">("");
  const [stagePropId, setStagePropId] = useState<StagePropId | "">("");
  const [handPropBusy, setHandPropBusy] = useState(false);

  const onApplyHandProp = async (nextPropId: HandPropId | "", nextSide: HandPropSide): Promise<void> => {
    setHandPropId(nextPropId);
    setHandPropSide(nextSide);
    if (!engine?.setHandProp) return;
    const attachment = nextPropId ? toHandPropAttachment(nextPropId, nextSide) : null;
    setHandPropBusy(true);
    try {
      await engine.setHandProp(attachment);
      const spec = nextPropId ? findWebtoonHandPropSpec(nextPropId) : null;
      setNotice(
        spec
          ? `손 소품 장착: ${spec.labelKo} (${nextSide === "rightHand" ? "오른손" : "왼손"})`
          : "손 소품을 해제했습니다.",
      );
    } catch (error) {
      setNotice(isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : "손 소품을 장착하지 못했습니다.");
    } finally {
      setHandPropBusy(false);
    }
  };
  const onApplyHandPropGripPose = (): void => {
    if (!handPropId) return;
    const cmds = buildHandPropGripPoseCommands(pose, handPropId, handPropSide);
    for (const cmd of cmds) dispatch(cmd);
    const spec = findWebtoonHandPropSpec(handPropId);
    if (spec) setNotice(`소품 그립 포즈 적용: ${spec.labelKo} (${handPropSide === "rightHand" ? "오른손" : "왼손"})`);
  };
  const onApplyHeadProp = async (nextHeadPropId: HeadPropId | ""): Promise<void> => {
    setHeadPropId(nextHeadPropId);
    if (!engine?.setHeadProp) return;
    const attachment = nextHeadPropId ? toHeadPropAttachment(nextHeadPropId) : null;
    setHandPropBusy(true);
    try {
      await engine.setHeadProp(attachment);
      const spec = nextHeadPropId ? findWebtoonHeadPropSpec(nextHeadPropId) : null;
      setNotice(spec ? `머리 액세서리 장착: ${spec.labelKo}` : "머리 액세서리를 해제했습니다.");
    } catch (error) {
      setNotice(isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : "머리 액세서리를 장착하지 못했습니다.");
    } finally {
      setHandPropBusy(false);
    }
  };
  const onApplyStageProp = async (nextStagePropId: StagePropId | ""): Promise<void> => {
    setStagePropId(nextStagePropId);
    if (!engine?.setStageProp) return;
    const attachment = nextStagePropId ? toStagePropAttachment(nextStagePropId) : null;
    setHandPropBusy(true);
    try {
      await engine.setStageProp(attachment);
      const spec = nextStagePropId ? findWebtoonStagePropSpec(nextStagePropId) : null;
      setNotice(spec ? `배경 스테이지 배치: ${spec.labelKo}` : "배경 스테이지를 해제했습니다.");
    } catch (error) {
      setNotice(isLabFailure(error) ? `${error.reasonKo} [${error.code}]` : "배경 스테이지를 배치하지 못했습니다.");
    } finally {
      setHandPropBusy(false);
    }
  };

  return <ViewportHandPropControls
    engineReady={Boolean(engine?.setHandProp)}
    propId={handPropId}
    hand={handPropSide}
    headPropId={headPropId}
    stagePropId={stagePropId}
    busy={handPropBusy}
    onSelectProp={(nextPropId) => void onApplyHandProp(nextPropId, handPropSide)}
    onChangeHand={(nextSide) => void onApplyHandProp(handPropId, nextSide)}
    onApplyGripPose={onApplyHandPropGripPose}
    onSelectHeadProp={(nextHeadPropId) => void onApplyHeadProp(nextHeadPropId)}
    onSelectStageProp={(nextStagePropId) => void onApplyStageProp(nextStagePropId)}
  />;
}
