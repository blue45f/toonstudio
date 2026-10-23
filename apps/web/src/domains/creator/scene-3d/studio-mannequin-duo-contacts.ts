/**
 * Studio 3D 데생 인형 — 2인 구도 손 접촉 맞추기(순수 계층, B-02).
 *
 * 2인 프리셋의 팔 각도는 한 체형·한 거리 기준으로 저작돼 있어, 배치 솔버가 거리·체형에 맞춰
 * 상대를 세운 뒤에도 포옹하는 손이 상대 몸을 뚫고 등 뒤로 한참 빠져나가고, 하이파이브 손은
 * 서로 엇갈리고, 벽치기 손은 상대 머리 너머 허공을 짚었다(브라우저 측면 실측).
 *
 * 이 모듈은 구도마다 "손이 닿아야 하는 곳"을 상대 몸의 관절 프레임(등·배·팔꿈치·뒤통수
 * 뒤 벽면)으로 정의하고, 팔 2본 IK 로 손목을 그 자리에 옮긴다. 팔꿈치 굽힘 방향은 저작
 * 포즈의 팔꿈치를 폴로 써서 유지한다. 목표는 체형 비례(두신·몸통 두께)로 잡아 SD 체형과
 * 키 차이가 있는 짝에서도 같은 연출이 나온다. Three.js 없이 결정적으로 계산한다.
 */

import {
  computeStudioMannequinJointFrames,
  studioMannequinMat3Apply,
  studioMannequinMat3FromEulerXyz,
} from "./studio-mannequin-forward-kinematics";
import { reachStudioMannequinLimbEnd } from "./studio-mannequin-pose-ground-contact";

import type { StudioMannequinJointId, StudioMannequinSpec, StudioMannequinVec3 } from "./studio-mannequin-model";
import type { StudioMannequinPose } from "./studio-mannequin-poses";

export type StudioMannequinDuoFigure = "lead" | "partner";
type ArmChain = "leftArm" | "rightArm";

/** 접촉 계산에 쓰는 한 인형의 배치 상태(주인공 로컬 프레임 = 월드). */
export interface StudioMannequinDuoFigureState {
  readonly spec: StudioMannequinSpec;
  readonly pose: StudioMannequinPose;
  readonly offset: StudioMannequinVec3;
  readonly yawRad: number;
  /** 몸통 반 두께(m) — 등·배 표면 위치. */
  readonly halfDepthM: number;
}

export interface StudioMannequinDuoContactResult {
  readonly lead: StudioMannequinPose;
  readonly partner: StudioMannequinPose;
  /** 맞춘 손 접촉 수. */
  readonly count: number;
  /** 목표 손목 위치와 실제 손목 위치 사이 최대 거리(m) — 팔이 닿지 않으면 커진다. */
  readonly maxErrorM: number;
}

interface HandTarget {
  readonly figure: StudioMannequinDuoFigure;
  readonly chain: ArmChain;
  readonly world: StudioMannequinVec3;
}

type Vec = StudioMannequinVec3;

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const lerp = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const distance = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const UP: Vec = [0, 1, 0];
const EFFECTOR: Readonly<Record<ArmChain, StudioMannequinJointId>> = { leftArm: "leftHand", rightArm: "rightHand" };
const ELBOW: Readonly<Record<ArmChain, StudioMannequinJointId>> = { leftArm: "leftLowerArm", rightArm: "rightLowerArm" };

/** 인형 하나의 월드 관절 위치·방향 조회기. */
interface FigureView {
  readonly state: StudioMannequinDuoFigureState;
  joint(id: StudioMannequinJointId): Vec;
  /** 인형이 바라보는 수평 방향(월드). */
  forward(): Vec;
  /** 인형의 왼쪽(+X 로컬) 수평 방향(월드). */
  left(): Vec;
  /** 견갑골 높이의 등 기준점. */
  upperBack(): Vec;
  /** 허리 높이의 등 기준점. */
  lowerBack(): Vec;
  /** 두 손 중 더 높이 든 쪽 체인. */
  raisedArm(): ArmChain;
}

function figureView(state: StudioMannequinDuoFigureState): FigureView {
  const frames = computeStudioMannequinJointFrames(state.spec, state.pose, state.offset, state.yawRad);
  const joint = (id: StudioMannequinJointId): Vec => frames.get(id)?.position ?? state.offset;
  return {
    state,
    joint,
    forward: () => [Math.sin(state.yawRad), 0, Math.cos(state.yawRad)],
    left: () => [Math.cos(state.yawRad), 0, -Math.sin(state.yawRad)],
    upperBack: () => lerp(joint("chest"), joint("neck"), 0.5),
    lowerBack: () => lerp(joint("spine"), joint("chest"), 0.5),
    raisedArm: () => (joint("rightHand")[1] >= joint("leftHand")[1] ? "rightArm" : "leftArm"),
  };
}

/** 등 표면 바로 뒤(손바닥이 닿는 자리) — 몸통 두께 + 손목 여유. */
function behind(view: FigureView, point: Vec, extraM: number): Vec {
  return add(point, scale(view.forward(), -(view.state.halfDepthM + extraM)));
}

function inFront(view: FigureView, point: Vec, extraM: number): Vec {
  return add(point, scale(view.forward(), view.state.halfDepthM + extraM));
}

type ContactResolver = (lead: FigureView, partner: FigureView) => readonly HandTarget[];

/** 두 손목이 한 점에서 맞닿도록 가운데 점에서 각자 쪽으로 gap/2 씩 물린 목표. */
function meetHands(
  a: { readonly figure: StudioMannequinDuoFigure; readonly view: FigureView; readonly chain: ArmChain },
  b: { readonly figure: StudioMannequinDuoFigure; readonly view: FigureView; readonly chain: ArmChain },
  gapM: number,
  lift = 0,
): readonly HandTarget[] {
  const handA = a.view.joint(EFFECTOR[a.chain]);
  const handB = b.view.joint(EFFECTOR[b.chain]);
  const middle = add(lerp(handA, handB, 0.5), scale(UP, lift));
  // b → a 수평 축: 각자 손목을 자기 쪽으로 gap/2 씩 물려 손바닥이 가운데에서 맞닿게 한다.
  const axis = add(a.view.state.offset, scale(b.view.state.offset, -1));
  const length = Math.hypot(axis[0], axis[2]) || 1;
  const unit: Vec = [axis[0] / length, 0, axis[2] / length];
  return [
    { figure: a.figure, chain: a.chain, world: add(middle, scale(unit, gapM / 2)) },
    { figure: b.figure, chain: b.chain, world: add(middle, scale(unit, -gapM / 2)) },
  ];
}

/**
 * 귓속말 손: 상대 쪽 손이 주인공 머리에서 상대 머리 쪽 55% 지점(얼굴 앞·입 높이)을 가린다.
 * 반대 손으로 몸을 가로질러 뻗으면 팔 길이가 모자라(웹툰 판 실측 7~14cm) 상대 쪽 손을 쓴다.
 */
function whisperHand(lead: FigureView, partner: FigureView): HandTarget {
  const headUnit = lead.state.spec.headUnit;
  const between = lerp(lead.joint("head"), partner.joint("head"), 0.55);
  const toPartner = add(partner.state.offset, scale(lead.state.offset, -1));
  const partnerOnLeft = toPartner[0] * lead.left()[0] + toPartner[2] * lead.left()[2] > 0;
  return {
    figure: "lead",
    chain: partnerOnLeft ? "leftArm" : "rightArm",
    world: add(add(between, scale(lead.forward(), headUnit * 0.35)), scale(UP, -headUnit * 0.1)),
  };
}

const RESOLVERS: Readonly<Record<string, ContactResolver>> = {
  // 마주 안기: 주인공 손은 상대 등 위쪽(어깨 너머), 상대 손은 주인공 허리 뒤(겨드랑이 아래).
  "duo-hug-front": (lead, partner) => {
    const leadSpan = lead.state.spec.headUnit * 0.32;
    const partnerSpan = partner.state.spec.headUnit * 0.32;
    const leadTarget = behind(partner, partner.upperBack(), 0.025);
    const partnerTarget = behind(lead, lead.lowerBack(), 0.025);
    return [
      { figure: "lead", chain: "leftArm", world: add(leadTarget, scale(lead.left(), leadSpan)) },
      { figure: "lead", chain: "rightArm", world: add(leadTarget, scale(lead.left(), -leadSpan)) },
      { figure: "partner", chain: "leftArm", world: add(partnerTarget, scale(partner.left(), partnerSpan)) },
      { figure: "partner", chain: "rightArm", world: add(partnerTarget, scale(partner.left(), -partnerSpan)) },
    ];
  },
  // 백허그: 뒤에 선 주인공 양손이 앞사람 배 앞에서 모인다.
  "duo-back-hug": (lead, partner) => {
    const target = inFront(partner, lerp(partner.joint("spine"), partner.joint("chest"), 0.7), 0.035);
    const span = lead.state.spec.headUnit * 0.22;
    return [
      { figure: "lead", chain: "leftArm", world: add(target, scale(lead.left(), span)) },
      { figure: "lead", chain: "rightArm", world: add(target, scale(lead.left(), -span)) },
    ];
  },
  // 손잡고 걷기: 안쪽 두 손이 두 사람 사이에서 맞잡힌다(상대는 주인공 오른쪽).
  "duo-hand-hold-walk": (lead, partner) =>
    meetHands(
      { figure: "lead", view: lead, chain: "rightArm" },
      { figure: "partner", view: partner, chain: "leftArm" },
      0.03,
    ),
  // 어깨 기대기: 기대는 쪽(왼쪽) 손이 상대 팔꿈치 앞에 걸친다(상대는 주인공 왼쪽).
  "duo-shoulder-lean": (_lead, partner) => [
    {
      figure: "lead",
      chain: "leftArm",
      world: add(partner.joint(ELBOW.rightArm), add(scale(partner.forward(), 0.06), scale(UP, -0.02))),
    },
  ],
  // 귓속말: 든 손이 입과 상대 귀 사이에서 소리를 가린다.
  "duo-whisper": (lead, partner) => [whisperHand(lead, partner)],
  "duo-whisper-secret": (lead, partner) => [whisperHand(lead, partner)],
  // 우산 같이 쓰기: 우산을 든 오른손이 두 사람 머리 사이 위쪽에서 손잡이를 받친다.
  "duo-umbrella-share": (lead, partner) => [
    {
      figure: "lead",
      chain: "rightArm",
      world: add(
        add(lerp(lead.joint("head"), partner.joint("head"), 0.5), scale(UP, lead.state.spec.headUnit * 0.9)),
        scale(lead.forward(), 0.08),
      ),
    },
  ],
  // 어깨동무: 서로 바깥쪽 어깨에 팔을 두른다(상대는 주인공 왼쪽).
  "duo-shoulder-arm": (lead, partner) => [
    {
      figure: "lead",
      chain: "leftArm",
      world: add(partner.joint("leftUpperArm"), add(scale(UP, 0.05), scale(partner.forward(), 0.03))),
    },
    {
      figure: "partner",
      chain: "rightArm",
      world: add(lead.joint("rightUpperArm"), add(scale(UP, 0.05), scale(lead.forward(), 0.03))),
    },
  ],
  // 하이파이브: 높이 든 두 손바닥이 두 사람 가운데에서 마주친다.
  "duo-high-five": (lead, partner) =>
    meetHands(
      { figure: "lead", view: lead, chain: lead.raisedArm() },
      { figure: "partner", view: partner, chain: partner.raisedArm() },
      0.05,
      0.02,
    ),
  // 팔짱: 서로의 안쪽 손이 상대 팔꿈치 앞에 걸린다.
  "duo-arm-link": (lead, partner) => [
    {
      figure: "lead",
      chain: "rightArm",
      world: add(partner.joint(ELBOW.leftArm), add(scale(partner.forward(), 0.07), scale(UP, -0.03))),
    },
    {
      figure: "partner",
      chain: "leftArm",
      world: add(lead.joint(ELBOW.rightArm), add(scale(lead.forward(), 0.07), scale(UP, -0.03))),
    },
  ],
  // 벽치기: 든 손이 상대 뒤통수 뒤 벽면, 머리 옆을 짚는다.
  "duo-wall-slam": (lead, partner) => {
    const chain = lead.raisedArm();
    const side = chain === "leftArm" ? 1 : -1;
    const headUnit = partner.state.spec.headUnit;
    const wall = add(partner.joint("head"), scale(partner.forward(), -(headUnit * 0.5 + 0.03)));
    const world = add(add(wall, scale(lead.left(), side * headUnit * 0.75)), scale(UP, headUnit * 0.25));
    return [{ figure: "lead", chain, world }];
  },
};

/** 월드 점 → 인형 로컬(루트 기준) 점. */
function toFigureLocal(state: StudioMannequinDuoFigureState, world: Vec): Vec {
  const unYaw = studioMannequinMat3FromEulerXyz([0, -state.yawRad, 0]);
  return studioMannequinMat3Apply(unYaw, [
    world[0] - state.offset[0],
    world[1] - state.offset[1],
    world[2] - state.offset[2],
  ]);
}

/**
 * 구도 id 에 맞는 손 접촉을 두 인형 포즈에 반영한다. 접촉이 정의되지 않은 구도(스펙 없는
 * 2인 프리셋의 기본 마주 보기)는 포즈를 그대로 돌려준다.
 */
export function applyStudioMannequinDuoHandContacts(input: {
  readonly compositionId: string;
  readonly lead: StudioMannequinDuoFigureState;
  readonly partner: StudioMannequinDuoFigureState;
}): StudioMannequinDuoContactResult {
  const resolver = Object.hasOwn(RESOLVERS, input.compositionId) ? RESOLVERS[input.compositionId] : undefined;
  if (!resolver) return { lead: input.lead.pose, partner: input.partner.pose, count: 0, maxErrorM: 0 };
  const targets = resolver(figureView(input.lead), figureView(input.partner));
  let lead = input.lead.pose;
  let partner = input.partner.pose;
  for (const target of targets) {
    const state = target.figure === "lead" ? { ...input.lead, pose: lead } : { ...input.partner, pose: partner };
    const solved = reachStudioMannequinLimbEnd(state.spec, state.pose, target.chain, toFigureLocal(state, target.world));
    if (target.figure === "lead") lead = solved;
    else partner = solved;
  }
  const leadView = figureView({ ...input.lead, pose: lead });
  const partnerView = figureView({ ...input.partner, pose: partner });
  const maxErrorM = targets.reduce((worst, target) => {
    const view = target.figure === "lead" ? leadView : partnerView;
    return Math.max(worst, distance(view.joint(EFFECTOR[target.chain]), target.world));
  }, 0);
  return { lead, partner, count: targets.length, maxErrorM };
}
