/**
 * 8대 부위 × 42개 정본 VRM 본 소켓 레지스트리 (미터 단위 1.0 = 1m).
 * `character-3d-item-autofit-engine.ts`에서 본 스냅·Anti-Clip 밀착·스킨 웨이트 전사에 사용한다.
 */

export type VrmSocketGroupId =
  | "head"
  | "neck"
  | "chest"
  | "leftHand"
  | "rightHand"
  | "hips"
  | "back"
  | "feet";

export type ItemAutoFitCategory =
  | "glasses"
  | "hat"
  | "earring"
  | "mask"
  | "necklace"
  | "scarf"
  | "armor-chest"
  | "cape"
  | "weapon-grip"
  | "ring-watch"
  | "belt-holster"
  | "backpack-wings"
  | "footwear";

export interface Vec3Meters {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VrmAutoFitSocketSpec {
  readonly id: string;
  readonly group: VrmSocketGroupId;
  readonly labelKo: string;
  readonly vrmBone: string;
  readonly neighborBones: readonly string[];
  readonly localOffsetM: Vec3Meters;
  readonly surfaceNormal: Vec3Meters;
  readonly curvatureRadiusMm: number;
  readonly defaultAntiClipOffsetMm: number;
  readonly recommendedCategories: readonly ItemAutoFitCategory[];
}

export const ANTI_CLIP_OFFSET_RANGE_MM = {
  min: 1.5,
  max: 3.0,
  floatingWarnThresholdMm: 4.5,
} as const;

export const VRM_SOCKET_GROUP_LABELS: Readonly<Record<VrmSocketGroupId, string>> = {
  head: "머리 · 얼굴",
  neck: "목 · 칼라",
  chest: "상체 · 어깨",
  leftHand: "왼손 · 왼팔",
  rightHand: "오른손 · 오른팔",
  hips: "허리 · 골반",
  back: "등 · 척추",
  feet: "발 · 발목",
};

export const STUDIO_SCALE_FIT_SPRITE_PATHS = {
  vrm: "/assets/studio/vibrant-sprites/tool-vrm.webp",
  bg3d: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
  production: "/assets/studio/vibrant-sprites/emblem-production.webp",
  character: "/assets/studio/vibrant-sprites/emblem-character.webp",
} as const;

type SocketTuple = readonly [
  id: string,
  group: VrmSocketGroupId,
  labelKo: string,
  vrmBone: string,
  neighborBones: readonly string[],
  offset: readonly [number, number, number],
  normal: readonly [number, number, number],
  curvatureRadiusMm: number,
  defaultAntiClipOffsetMm: number,
  categories: readonly ItemAutoFitCategory[],
];

function defineSocket(tuple: SocketTuple): VrmAutoFitSocketSpec {
  const [id, group, labelKo, vrmBone, neighborBones, offset, normal, curvatureRadiusMm, defaultAntiClipOffsetMm, recommendedCategories] = tuple;
  return {
    id,
    group,
    labelKo,
    vrmBone,
    neighborBones,
    localOffsetM: { x: offset[0], y: offset[1], z: offset[2] },
    surfaceNormal: { x: normal[0], y: normal[1], z: normal[2] },
    curvatureRadiusMm,
    defaultAntiClipOffsetMm,
    recommendedCategories,
  };
}

const RAW_VRM_AUTO_FIT_SOCKETS: readonly SocketTuple[] = [
  // head (7)
  ["head-crown", "head", "정수리 (모자·왕관)", "head", ["neck"], [0, 0.145, 0.005], [0, 1, 0], 92, 2.0, ["hat"]],
  ["head-forehead", "head", "이마 (머리띠·고글)", "head", ["neck"], [0, 0.095, 0.092], [0, 0.2, 0.98], 86, 1.8, ["hat", "glasses"]],
  ["head-nose-bridge", "head", "콧등 (안경·선글라스)", "head", ["neck"], [0, 0.048, 0.102], [0, 0.05, 0.99], 64, 1.6, ["glasses", "mask"]],
  ["head-left-ear", "head", "왼쪽 귀 (귀걸이·이어커프)", "head", ["neck"], [0.076, 0.042, -0.004], [1, 0, 0], 28, 1.5, ["earring"]],
  ["head-right-ear", "head", "오른쪽 귀 (귀걸이·이어폰)", "head", ["neck"], [-0.076, 0.042, -0.004], [-1, 0, 0], 28, 1.5, ["earring"]],
  ["head-chin", "head", "턱 · 하관 (마스크·베일)", "head", ["jaw", "neck"], [0, -0.025, 0.088], [0, -0.25, 0.96], 58, 1.9, ["mask"]],
  ["head-occiput", "head", "뒤통수 (리본·헤어핀)", "head", ["neck"], [0, 0.052, -0.095], [0, 0.1, -0.99], 88, 2.1, ["hat"]],
  // neck (4)
  ["neck-collar-front", "neck", "목 앞 칼라 (목걸이·넥타이)", "neck", ["upperChest", "head"], [0, 0.018, 0.054], [0, 0.1, 0.99], 54, 2.0, ["necklace", "scarf"]],
  ["neck-collar-back", "neck", "목 뒤 칼라 (망토 여밈·후드)", "neck", ["upperChest", "head"], [0, 0.015, -0.056], [0, 0.1, -0.99], 56, 2.2, ["cape", "scarf"]],
  ["neck-left-side", "neck", "목 좌측 (초커 버클·스카프 매듭)", "neck", ["upperChest", "leftShoulder"], [0.052, 0.012, 0.008], [0.98, 0, 0.18], 52, 1.9, ["necklace", "scarf"]],
  ["neck-right-side", "neck", "목 우측 (스카프 브로치)", "neck", ["upperChest", "rightShoulder"], [-0.052, 0.012, 0.008], [-0.98, 0, 0.18], 52, 1.9, ["necklace", "scarf"]],
  // chest (6)
  ["chest-sternum", "chest", "흉골 중앙 (브로치·펜던트·갑주)", "upperChest", ["chest", "neck", "spine"], [0, 0.06, 0.118], [0, 0.05, 0.99], 145, 2.2, ["armor-chest", "necklace"]],
  ["chest-left-clavicle", "chest", "좌측 쇄골 (배지·훈장·망토 핀)", "upperChest", ["leftShoulder", "neck"], [0.072, 0.095, 0.098], [0.2, 0.25, 0.94], 120, 2.0, ["cape", "armor-chest"]],
  ["chest-right-clavicle", "chest", "우측 쇄골 (견장·망토 핀)", "upperChest", ["rightShoulder", "neck"], [-0.072, 0.095, 0.098], [-0.2, 0.25, 0.94], 120, 2.0, ["cape", "armor-chest"]],
  ["chest-upper-rib", "chest", "명치 · 상복부 (코르셋·조끼)", "chest", ["upperChest", "spine"], [0, -0.025, 0.112], [0, 0, 1], 138, 2.4, ["armor-chest"]],
  ["chest-left-shoulder", "chest", "왼쪽 어깨 (견갑·가방 끈)", "leftShoulder", ["upperChest", "leftUpperArm"], [0.138, 0.088, 0.008], [0.65, 0.75, 0.05], 78, 2.6, ["armor-chest", "cape", "backpack-wings"]],
  ["chest-right-shoulder", "chest", "오른쪽 어깨 (견갑·가방 끈)", "rightShoulder", ["upperChest", "rightUpperArm"], [-0.138, 0.088, 0.008], [-0.65, 0.75, 0.05], 78, 2.6, ["armor-chest", "cape", "backpack-wings"]],
  // leftHand (6)
  ["leftHand-palm-grip", "leftHand", "왼손 손바닥 그립 (검·펜·컵)", "leftHand", ["leftLowerArm", "leftIndexProximal"], [0.022, -0.015, 0.018], [0, -1, 0], 34, 1.5, ["weapon-grip"]],
  ["leftHand-wrist", "leftHand", "왼손 손목 (시계·팔찌)", "leftHand", ["leftLowerArm"], [0, 0.008, -0.032], [0, 1, 0], 31, 1.7, ["ring-watch"]],
  ["leftHand-thumb-pinch", "leftHand", "왼손 엄지 핀치 (카드·소품)", "leftThumbDistal", ["leftHand", "leftIndexDistal"], [0.012, -0.008, 0.024], [0.6, -0.5, 0.62], 16, 1.5, ["weapon-grip"]],
  ["leftHand-index-ring", "leftHand", "왼손 반지 소켓", "leftRingProximal", ["leftHand"], [0.005, 0, 0.014], [0, 1, 0], 10, 1.5, ["ring-watch"]],
  ["leftHand-forearm-bracer", "leftHand", "왼팔 전완 (방패·완갑)", "leftLowerArm", ["leftHand", "leftUpperArm"], [0.036, 0.014, -0.085], [0.9, 0.42, 0], 46, 2.3, ["armor-chest", "weapon-grip"]],
  ["leftHand-back-gauntlet", "leftHand", "왼손 손등 (장갑·마법진)", "leftHand", ["leftLowerArm"], [0, 0.018, 0.028], [0, 1, 0], 38, 1.8, ["armor-chest", "ring-watch"]],
  // rightHand (6)
  ["rightHand-palm-grip", "rightHand", "오른손 손바닥 그립 (무기·스마트폰)", "rightHand", ["rightLowerArm", "rightIndexProximal"], [-0.022, -0.015, 0.018], [0, -1, 0], 34, 1.5, ["weapon-grip"]],
  ["rightHand-wrist", "rightHand", "오른손 손목 (시계·팔찌)", "rightHand", ["rightLowerArm"], [0, 0.008, -0.032], [0, 1, 0], 31, 1.7, ["ring-watch"]],
  ["rightHand-thumb-pinch", "rightHand", "오른손 엄지 핀치 (붓·열쇠)", "rightThumbDistal", ["rightHand", "rightIndexDistal"], [-0.012, -0.008, 0.024], [-0.6, -0.5, 0.62], 16, 1.5, ["weapon-grip"]],
  ["rightHand-index-ring", "rightHand", "오른손 반지 소켓", "rightRingProximal", ["rightHand"], [-0.005, 0, 0.014], [0, 1, 0], 10, 1.5, ["ring-watch"]],
  ["rightHand-forearm-bracer", "rightHand", "오른팔 전완 (완갑·아대)", "rightLowerArm", ["rightHand", "rightUpperArm"], [-0.036, 0.014, -0.085], [-0.9, 0.42, 0], 46, 2.3, ["armor-chest", "weapon-grip"]],
  ["rightHand-back-gauntlet", "rightHand", "오른손 손등 (글러브 장식)", "rightHand", ["rightLowerArm"], [0, 0.018, 0.028], [0, 1, 0], 38, 1.8, ["armor-chest", "ring-watch"]],
  // hips (5)
  ["hips-waist-front", "hips", "허리 전면 버클 (벨트·리본)", "hips", ["spine", "leftUpperLeg", "rightUpperLeg"], [0, 0.042, 0.105], [0, 0, 1], 132, 2.3, ["belt-holster"]],
  ["hips-waist-back", "hips", "허리 후면 (뒤 리본·파우치)", "hips", ["spine"], [0, 0.038, -0.108], [0, 0, -1], 136, 2.4, ["belt-holster", "backpack-wings"]],
  ["hips-left-holster", "hips", "좌측 골반 (검집·홀스터·키링)", "hips", ["leftUpperLeg", "spine"], [0.145, 0.01, 0.012], [1, 0, 0], 110, 2.5, ["belt-holster", "weapon-grip"]],
  ["hips-right-holster", "hips", "우측 골반 (파우치·무기집)", "hips", ["rightUpperLeg", "spine"], [-0.145, 0.01, 0.012], [-1, 0, 0], 110, 2.5, ["belt-holster", "weapon-grip"]],
  ["hips-tail-root", "hips", "미골 (꼬리·뒷장식)", "hips", ["spine"], [0, -0.028, -0.112], [0, -0.2, -0.98], 95, 2.2, ["belt-holster"]],
  // back (4)
  ["back-upper-spine", "back", "등 상부 (백팩·책가방)", "upperChest", ["chest", "leftShoulder", "rightShoulder"], [0, 0.045, -0.125], [0, 0.05, -0.99], 162, 2.6, ["backpack-wings", "cape"]],
  ["back-scapula-wings", "back", "견갑골 (날개·제트팩)", "upperChest", ["chest", "spine"], [0, 0.082, -0.122], [0, 0.15, -0.98], 155, 2.4, ["backpack-wings"]],
  ["back-diagonal-scabbard", "back", "등 사선 (대검·활·우산)", "chest", ["upperChest", "spine"], [0.035, 0.02, -0.132], [0.15, 0.1, -0.98], 150, 2.8, ["backpack-wings", "weapon-grip"]],
  ["back-lumbar-pack", "back", "허리 등판 (요대 팩·망토 하단)", "spine", ["hips", "chest"], [0, -0.015, -0.118], [0, -0.05, -0.99], 144, 2.5, ["backpack-wings", "cape"]],
  // feet (4)
  ["feet-left-ankle", "feet", "왼쪽 발목 (발찌·부츠 커프)", "leftFoot", ["leftLowerLeg"], [0, 0.032, -0.012], [0, 0.2, 0.98], 44, 2.0, ["footwear"]],
  ["feet-right-ankle", "feet", "오른쪽 발목 (발찌·부츠 커프)", "rightFoot", ["rightLowerLeg"], [0, 0.032, -0.012], [0, 0.2, 0.98], 44, 2.0, ["footwear"]],
  ["feet-left-sole", "feet", "왼쪽 밑창 (신발·스니커즈)", "leftFoot", ["leftToes", "leftLowerLeg"], [0, -0.042, 0.048], [0, -1, 0], 62, 2.1, ["footwear"]],
  ["feet-right-sole", "feet", "오른쪽 밑창 (신발·힐)", "rightFoot", ["rightToes", "rightLowerLeg"], [0, -0.042, 0.048], [0, -1, 0], 62, 2.1, ["footwear"]],
];

export const VRM_AUTO_FIT_SOCKETS: readonly VrmAutoFitSocketSpec[] =
  RAW_VRM_AUTO_FIT_SOCKETS.map(defineSocket);

export const VRM_AUTO_FIT_SOCKET_COUNT = VRM_AUTO_FIT_SOCKETS.length;
