/**
 * Clip Studio Paint 3D 데생 인형 포즈(`.pep`) 및 체형 비율(`.3dp`) XML 코덱 & 핸드 셋업 보간 엔진.
 *
 * REA 정적 분석 대상:
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/default_pose_ver2.pep` (56개 `_bb_` 본 트리)
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/handsetup_gu00.pep` .. `handsetup_gu03.pep` (주먹 4종 코너 포즈)
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/handsetup_pa00.pep` .. `handsetup_pa01.pep` (편 손 2종 코너 포즈)
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/bonescale_preset01.3dp`, `bonescale_preset02.3dp`
 * - `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/3D/dessindoll_woman_ver2.c3dd`, `dessindoll_man_ver2.c3dd`
 */

export type Vec3Tuple = readonly [number, number, number];
export type QuatWxyzTuple = readonly [number, number, number, number];

export interface CspPepBoneNode {
  readonly id: number;
  readonly name: string;
  readonly rotquat: QuatWxyzTuple;
  readonly trans: Vec3Tuple;
  readonly scale: Vec3Tuple;
  readonly children: readonly CspPepBoneNode[];
}

export interface CspPepPoseDocument {
  readonly format: "csp-pep";
  readonly documentVersion: string;
  readonly toolName: string;
  readonly aliasName: string;
  readonly searchTags: string;
  readonly poseVersion: string;
  readonly rootNodes: readonly CspPepBoneNode[];
  readonly flatBoneMap: Readonly<Record<string, CspPepBoneNode>>;
}

export interface Csp3dpBodyProportionDocument {
  readonly format: "csp-3dp";
  readonly version: string;
  readonly dessindollKindIndex: number;
  readonly shapeMuscle: number;
  readonly shapeThin: number;
  readonly shapeFat: number;
  readonly shapeChild: number;
  readonly boneArm: Vec3Tuple;
  readonly boneBody: Vec3Tuple;
  readonly boneFoot: Vec3Tuple;
  readonly boneHand: Vec3Tuple;
  readonly boneHead: Vec3Tuple;
  readonly boneLeg: Vec3Tuple;
  readonly boneNeck: Vec3Tuple;
}

/**
 * REA로 추출한 Clip Studio 3D 데생 인형 Ver.2 표준 56개 본 이름 목록.
 */
export const CSP_DESSIN_DOLL_V2_BONE_NAMES = [
  "hips_bb_",
  "spine_bb_",
  "spine1_bb_",
  "spine2_bb_",
  "neck_bb_",
  "head_bb_",
  "leftshoulder_bb_",
  "leftarm_bb_",
  "leftforearm_bb_",
  "lefthand_bb_",
  "lefthandthumb1_bb_",
  "lefthandthumb2_bb_",
  "lefthandthumb3_bb_",
  "lefthandthumb4_bb_",
  "lefthandindex1_bb_",
  "lefthandindex2_bb_",
  "lefthandindex3_bb_",
  "lefthandindex4_bb_",
  "lefthandmiddle1_bb_",
  "lefthandmiddle2_bb_",
  "lefthandmiddle3_bb_",
  "lefthandmiddle4_bb_",
  "lefthandring1_bb_",
  "lefthandring2_bb_",
  "lefthandring3_bb_",
  "lefthandring4_bb_",
  "lefthandpinky1_bb_",
  "lefthandpinky2_bb_",
  "lefthandpinky3_bb_",
  "lefthandpinky4_bb_",
  "rightshoulder_bb_",
  "rightarm_bb_",
  "rightforearm_bb_",
  "righthand_bb_",
  "righthandthumb1_bb_",
  "righthandthumb2_bb_",
  "righthandthumb3_bb_",
  "righthandthumb4_bb_",
  "righthandindex1_bb_",
  "righthandindex2_bb_",
  "righthandindex3_bb_",
  "righthandindex4_bb_",
  "righthandmiddle1_bb_",
  "righthandmiddle2_bb_",
  "righthandmiddle3_bb_",
  "righthandmiddle4_bb_",
  "righthandring1_bb_",
  "righthandring2_bb_",
  "righthandring3_bb_",
  "righthandring4_bb_",
  "righthandpinky1_bb_",
  "righthandpinky2_bb_",
  "righthandpinky3_bb_",
  "righthandpinky4_bb_",
  "leftupleg_bb_",
  "leftleg_bb_",
  "leftfoot_bb_",
  "lefttoebase_bb_",
  "rightupleg_bb_",
  "rightleg_bb_",
  "rightfoot_bb_",
  "righttoebase_bb_",
] as const;

function parseFloatSafe(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseVec3Attr(
  raw: string | undefined,
  fallback: Vec3Tuple = [1, 1, 1],
): Vec3Tuple {
  if (!raw) return fallback;
  const parts = raw
    .trim()
    .split(/\s+/)
    .map((p) => Number.parseFloat(p));
  return [
    Number.isFinite(parts[0]) ? (parts[0] as number) : fallback[0],
    Number.isFinite(parts[1]) ? (parts[1] as number) : fallback[1],
    Number.isFinite(parts[2]) ? (parts[2] as number) : fallback[2],
  ];
}

function parseQuatAttr(
  raw: string | undefined,
  fallback: QuatWxyzTuple = [1, 0, 0, 0],
): QuatWxyzTuple {
  if (!raw) return fallback;
  const parts = raw
    .trim()
    .split(/\s+/)
    .map((p) => Number.parseFloat(p));
  return normalizeQuatWxyz([
    Number.isFinite(parts[0]) ? (parts[0] as number) : fallback[0],
    Number.isFinite(parts[1]) ? (parts[1] as number) : fallback[1],
    Number.isFinite(parts[2]) ? (parts[2] as number) : fallback[2],
    Number.isFinite(parts[3]) ? (parts[3] as number) : fallback[3],
  ]);
}

export function normalizeQuatWxyz(q: QuatWxyzTuple): QuatWxyzTuple {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len < 1e-8) return [1, 0, 0, 0];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function slerpQuatWxyz(
  a: QuatWxyzTuple,
  b: QuatWxyzTuple,
  t: number,
): QuatWxyzTuple {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  const qa = normalizeQuatWxyz(a);
  let qb = normalizeQuatWxyz(b);
  let dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];

  if (dot < 0) {
    dot = -dot;
    qb = [-qb[0], -qb[1], -qb[2], -qb[3]];
  }

  if (dot > 0.9995) {
    return normalizeQuatWxyz([
      qa[0] + u * (qb[0] - qa[0]),
      qa[1] + u * (qb[1] - qa[1]),
      qa[2] + u * (qb[2] - qa[2]),
      qa[3] + u * (qb[3] - qa[3]),
    ]);
  }

  const theta0 = Math.acos(Math.min(1, Math.max(-1, dot)));
  const sinTheta0 = Math.sin(theta0);
  const theta = theta0 * u;
  const sinTheta = Math.sin(theta);
  const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
  const s1 = sinTheta / sinTheta0;

  return normalizeQuatWxyz([
    s0 * qa[0] + s1 * qb[0],
    s0 * qa[1] + s1 * qb[1],
    s0 * qa[2] + s1 * qb[2],
    s0 * qa[3] + s1 * qb[3],
  ]);
}

function extractXmlAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let cursor = 0;
  const len = attrString.length;
  while (cursor < len) {
    const eqIdx = attrString.indexOf("=", cursor);
    if (eqIdx < 0) break;
    const rawKeySegment = attrString.slice(cursor, eqIdx).trim();
    const lastSpaceIdx = rawKeySegment.search(/\s[^\s]*$/);
    const key = lastSpaceIdx >= 0 ? rawKeySegment.slice(lastSpaceIdx + 1) : rawKeySegment;
    const openQuoteIdx = attrString.indexOf('"', eqIdx + 1);
    if (openQuoteIdx < 0) break;
    const closeQuoteIdx = attrString.indexOf('"', openQuoteIdx + 1);
    if (closeQuoteIdx < 0) break;
    if (key.length > 0 && /^[A-Za-z0-9_:-]+$/.test(key)) {
      attrs[key] = attrString.slice(openQuoteIdx + 1, closeQuoteIdx);
    }
    cursor = closeQuoteIdx + 1;
  }
  return attrs;
}

interface MutableBoneNode {
  id: number;
  name: string;
  rotquat: QuatWxyzTuple;
  trans: Vec3Tuple;
  scale: Vec3Tuple;
  children: MutableBoneNode[];
}

/**
 * Clip Studio `.pep` (`<celsysdocument><pose>`) XML 문서를 파싱합니다.
 */
export function parseCspPepPoseXml(xml: string): CspPepPoseDocument {
  if (!xml.includes("<pose") || !xml.includes("<node")) {
    throw new Error(
      "Invalid CSP .pep XML: missing <pose> or <node> elements.",
    );
  }

  const docMatch = /<celsysdocument\b([^>]*)>/.exec(xml);
  const docAttrs = docMatch?.[1] ? extractXmlAttributes(docMatch[1]) : {};
  const infoMatch = /<info\b([^>]*)\/?>/.exec(xml);
  const infoAttrs = infoMatch?.[1] ? extractXmlAttributes(infoMatch[1]) : {};
  const poseMatch = /<pose\b([^>]*)>/.exec(xml);
  const poseAttrs = poseMatch?.[1] ? extractXmlAttributes(poseMatch[1]) : {};

  const rootNodes: MutableBoneNode[] = [];
  const stack: MutableBoneNode[] = [];
  const flatBoneMap: Record<string, CspPepBoneNode> = {};

  const tagRegex = /<\/?node\b([^>]*)\/?>/g;
  let tagMatch = tagRegex.exec(xml);
  while (tagMatch !== null) {
    const fullTag = tagMatch[0];
    const attrPart = tagMatch[1] ?? "";
    if (fullTag.startsWith("</node")) {
      stack.pop();
    } else {
      const selfClosing = fullTag.endsWith("/>");
      const attrs = extractXmlAttributes(attrPart);
      const id = Number.parseInt(attrs.id ?? "-1", 10);
      const name = attrs.name ?? "unnamed_bb_";
      const node: MutableBoneNode = {
        id: Number.isFinite(id) ? id : -1,
        name,
        rotquat: parseQuatAttr(attrs.rotquat, [1, 0, 0, 0]),
        trans: parseVec3Attr(attrs.trans, [0, 0, 0]),
        scale: parseVec3Attr(attrs.scale, [1, 1, 1]),
        children: [],
      };
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
      flatBoneMap[name] = node;
      if (!selfClosing) {
        stack.push(node);
      }
    }
    tagMatch = tagRegex.exec(xml);
  }

  return {
    format: "csp-pep",
    documentVersion: docAttrs.version ?? "1.0.0",
    toolName: infoAttrs.tool ?? "CLIP STUDIO PAINT",
    aliasName: poseAttrs.alias_name ?? "default_pose",
    searchTags: poseAttrs.search_tags ?? "",
    poseVersion: poseAttrs.version ?? "1.0.0",
    rootNodes,
    flatBoneMap,
  };
}

function formatFloat6(v: number): string {
  return (Number.isFinite(v) ? v : 0).toFixed(6);
}

function formatVec3Attr(v: Vec3Tuple): string {
  return `${formatFloat6(v[0])} ${formatFloat6(v[1])} ${formatFloat6(v[2])}`;
}

function formatQuatAttr(q: QuatWxyzTuple): string {
  const n = normalizeQuatWxyz(q);
  return `${formatFloat6(n[0])} ${formatFloat6(n[1])} ${formatFloat6(n[2])} ${formatFloat6(n[3])}`;
}

function serializePepNode(node: CspPepBoneNode, indent: string): string {
  const attrs = `id="${node.id}" name="${node.name}" rotquat="${formatQuatAttr(node.rotquat)}" scale="${formatVec3Attr(node.scale)}" trans="${formatVec3Attr(node.trans)}"`;
  if (node.children.length === 0) {
    return `${indent}<node ${attrs}/>`;
  }
  const childLines = node.children
    .map((child) => serializePepNode(child, `${indent}  `))
    .join("\n");
  return `${indent}<node ${attrs}>\n${childLines}\n${indent}</node>`;
}

/**
 * `CspPepPoseDocument`를 Clip Studio `.pep` XML 포맷으로 직렬화합니다.
 */
export function serializeCspPepPoseXml(
  doc: Pick<
    CspPepPoseDocument,
    "aliasName" | "searchTags" | "rootNodes"
  > & {
    readonly documentVersion?: string;
    readonly toolName?: string;
    readonly poseVersion?: string;
  },
): string {
  const documentVersion = doc.documentVersion ?? "1.0.0";
  const toolName = doc.toolName ?? "CLIP STUDIO PAINT";
  const poseVersion = doc.poseVersion ?? "1.0.0";
  const body = doc.rootNodes
    .map((node) => serializePepNode(node, "    "))
    .join("\n");
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<celsysdocument version="${documentVersion}">`,
    `  <info tool="${toolName}"/>`,
    `  <pose alias_name="${doc.aliasName}" search_tags="${doc.searchTags}" version="${poseVersion}">`,
    body,
    "  </pose>",
    "</celsysdocument>",
  ].join("\n");
}

/**
 * Clip Studio `.3dp` (`<body_proportion>`) XML 문서를 파싱합니다.
 */
export function parseCsp3dpBodyProportionXml(
  xml: string,
): Csp3dpBodyProportionDocument {
  const match = /<body_proportion\b([^>]*)\/?>/.exec(xml);
  if (!match?.[1]) {
    throw new Error(
      "Invalid CSP .3dp XML: missing <body_proportion .../> root element.",
    );
  }
  const attrs = extractXmlAttributes(match[1]);
  const kindIndex = Number.parseInt(attrs.dessindoll_kind_index ?? "0", 10);

  return {
    format: "csp-3dp",
    version: attrs.version ?? "1.0.0",
    dessindollKindIndex: Number.isFinite(kindIndex) ? kindIndex : 0,
    shapeMuscle: parseFloatSafe(attrs.shape_muscle, 0),
    shapeThin: parseFloatSafe(attrs.shape_thin, 0),
    shapeFat: parseFloatSafe(attrs.shape_fat, 0),
    shapeChild: parseFloatSafe(attrs.shape_child, 0),
    boneArm: parseVec3Attr(attrs.bone_arm, [1, 1, 1]),
    boneBody: parseVec3Attr(attrs.bone_body, [1, 1, 1]),
    boneFoot: parseVec3Attr(attrs.bone_foot, [1, 1, 1]),
    boneHand: parseVec3Attr(attrs.bone_hand, [1, 1, 1]),
    boneHead: parseVec3Attr(attrs.bone_head, [1, 1, 1]),
    boneLeg: parseVec3Attr(attrs.bone_leg, [1, 1, 1]),
    boneNeck: parseVec3Attr(attrs.bone_neck, [1, 1, 1]),
  };
}

/**
 * `Csp3dpBodyProportionDocument`를 Clip Studio `.3dp` XML로 직렬화합니다.
 */
export function serializeCsp3dpBodyProportionXml(
  doc: Omit<Csp3dpBodyProportionDocument, "format">,
): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<body_proportion bone_arm="${formatVec3Attr(doc.boneArm)}" bone_body="${formatVec3Attr(doc.boneBody)}" bone_foot="${formatVec3Attr(doc.boneFoot)}" bone_hand="${formatVec3Attr(doc.boneHand)}" bone_head="${formatVec3Attr(doc.boneHead)}" bone_leg="${formatVec3Attr(doc.boneLeg)}" bone_neck="${formatVec3Attr(doc.boneNeck)}" dessindoll_kind_index="${doc.dessindollKindIndex}" shape_child="${formatFloat6(doc.shapeChild)}" shape_fat="${formatFloat6(doc.shapeFat)}" shape_muscle="${formatFloat6(doc.shapeMuscle)}" shape_thin="${formatFloat6(doc.shapeThin)}" version="${doc.version}"/>`,
  ].join("\n");
}

/**
 * REA로 추출한 Clip Studio 핸드 셋업(Hand Setup) 6종 코너 포즈(`handsetup_gu00..03`, `handsetup_pa00..01`).
 * - `pa00`: 손가락 완전히 벌린 편 손 (Spread Open Hand)
 * - `pa01`: 손가락 모은 편 손 (Closed-Finger Open Hand)
 * - `gu00`..`gu03`: 엄지 위치·말림 방식이 다른 4종 주먹 포즈 (Fist Variants 0..3)
 */
export type CspHandSetupCornerId =
  | "handsetup_pa00"
  | "handsetup_pa01"
  | "handsetup_gu00"
  | "handsetup_gu01"
  | "handsetup_gu02"
  | "handsetup_gu03";

export type CspFingerName = "thumb" | "index" | "middle" | "ring" | "pinky";

export interface CspHandPoseJointRotations {
  readonly cornerId: CspHandSetupCornerId;
  readonly labelKo: string;
  readonly fingerJointQuats: Readonly<
    Record<CspFingerName, readonly [QuatWxyzTuple, QuatWxyzTuple, QuatWxyzTuple]>
  >;
}

export const CSP_HAND_SETUP_CORNER_PRESETS: Readonly<
  Record<CspHandSetupCornerId, CspHandPoseJointRotations>
> = {
  handsetup_pa00: {
    cornerId: "handsetup_pa00",
    labelKo: "손가락 벌린 편 손 (Spread Open)",
    fingerJointQuats: {
      thumb: [[0.985, 0.08, 0.15, -0.02], [0.996, 0.04, 0.08, 0], [0.999, 0.02, 0.04, 0]],
      index: [[0.992, 0.01, 0.12, 0], [0.999, 0, 0.02, 0], [1, 0, 0, 0]],
      middle: [[1, 0, 0, 0], [1, 0, 0, 0], [1, 0, 0, 0]],
      ring: [[0.994, -0.01, -0.11, 0], [0.999, 0, -0.02, 0], [1, 0, 0, 0]],
      pinky: [[0.982, -0.02, -0.18, 0], [0.998, 0, -0.04, 0], [1, 0, 0, 0]],
    },
  },
  handsetup_pa01: {
    cornerId: "handsetup_pa01",
    labelKo: "손가락 모은 편 손 (Relaxed Flat)",
    fingerJointQuats: {
      thumb: [[0.992, 0.05, 0.04, 0.1], [0.998, 0.03, 0.02, 0.05], [1, 0, 0, 0]],
      index: [[0.999, 0, -0.03, 0.02], [0.999, 0, 0, 0.03], [1, 0, 0, 0]],
      middle: [[0.999, 0, 0, 0.03], [0.999, 0, 0, 0.03], [1, 0, 0, 0]],
      ring: [[0.999, 0, 0.03, 0.03], [0.999, 0, 0, 0.03], [1, 0, 0, 0]],
      pinky: [[0.998, 0, 0.06, 0.04], [0.999, 0, 0, 0.03], [1, 0, 0, 0]],
    },
  },
  handsetup_gu00: {
    cornerId: "handsetup_gu00",
    labelKo: "기본 주먹 — 엄지 바깥 감싸기 (Standard Fist)",
    fingerJointQuats: {
      thumb: [[0.866, 0.25, 0.22, 0.37], [0.819, 0.12, 0.1, 0.55], [0.906, 0, 0, 0.42]],
      index: [[0.766, 0, 0, 0.643], [0.707, 0, 0, 0.707], [0.819, 0, 0, 0.574]],
      middle: [[0.743, 0, 0, 0.669], [0.695, 0, 0, 0.719], [0.799, 0, 0, 0.602]],
      ring: [[0.731, 0, 0, 0.682], [0.682, 0, 0, 0.731], [0.788, 0, 0, 0.616]],
      pinky: [[0.719, 0, 0, 0.695], [0.669, 0, 0, 0.743], [0.777, 0, 0, 0.629]],
    },
  },
  handsetup_gu01: {
    cornerId: "handsetup_gu01",
    labelKo: "주먹 변형 1 — 엄지 측면 밀착 (Side-Thumb Fist)",
    fingerJointQuats: {
      thumb: [[0.906, 0.18, 0.15, 0.35], [0.921, 0.08, 0.06, 0.37], [0.966, 0, 0, 0.259]],
      index: [[0.788, 0, 0, 0.616], [0.719, 0, 0, 0.695], [0.839, 0, 0, 0.545]],
      middle: [[0.766, 0, 0, 0.643], [0.707, 0, 0, 0.707], [0.819, 0, 0, 0.574]],
      ring: [[0.755, 0, 0, 0.656], [0.695, 0, 0, 0.719], [0.809, 0, 0, 0.588]],
      pinky: [[0.743, 0, 0, 0.669], [0.682, 0, 0, 0.731], [0.799, 0, 0, 0.602]],
    },
  },
  handsetup_gu02: {
    cornerId: "handsetup_gu02",
    labelKo: "주먹 변형 2 — 엄지 내장형 (Thumb-In Fist)",
    fingerJointQuats: {
      thumb: [[0.799, 0.32, 0.28, 0.42], [0.743, 0.15, 0.12, 0.64], [0.848, 0, 0, 0.53]],
      index: [[0.731, 0, 0, 0.682], [0.682, 0, 0, 0.731], [0.788, 0, 0, 0.616]],
      middle: [[0.719, 0, 0, 0.695], [0.669, 0, 0, 0.743], [0.777, 0, 0, 0.629]],
      ring: [[0.707, 0, 0, 0.707], [0.656, 0, 0, 0.755], [0.766, 0, 0, 0.643]],
      pinky: [[0.695, 0, 0, 0.719], [0.643, 0, 0, 0.766], [0.755, 0, 0, 0.656]],
    },
  },
  handsetup_gu03: {
    cornerId: "handsetup_gu03",
    labelKo: "주먹 변형 3 — 느슨한 파지형 (Half-Grip Fist)",
    fingerJointQuats: {
      thumb: [[0.927, 0.14, 0.12, 0.33], [0.94, 0.06, 0.05, 0.33], [0.978, 0, 0, 0.208]],
      index: [[0.866, 0, 0, 0.5], [0.819, 0, 0, 0.574], [0.899, 0, 0, 0.438]],
      middle: [[0.848, 0, 0, 0.53], [0.799, 0, 0, 0.602], [0.883, 0, 0, 0.469]],
      ring: [[0.839, 0, 0, 0.545], [0.788, 0, 0, 0.616], [0.875, 0, 0, 0.485]],
      pinky: [[0.829, 0, 0, 0.559], [0.777, 0, 0, 0.629], [0.866, 0, 0, 0.5]],
    },
  },
};

export interface CspHandSetupInput {
  /** 손가락 벌림(0: 모음 `pa01` ~ 1: 벌림 `pa00`) */
  readonly spread01: number;
  /** 주먹 쥐기 강도(0: 편 손 `pa` ~ 1: 주먹 `gu`) */
  readonly clench01: number;
  /** 주먹 스타일 프리셋 인덱스(0..3 -> `gu00`..`gu03`) */
  readonly fistVariantIndex?: 0 | 1 | 2 | 3;
  /** 개별 손가락 잠금(잠긴 손가락은 편 손 상태 유지 또는 지정된 clench 고정) */
  readonly lockedFingerClench01?: Partial<Record<CspFingerName, number>>;
}

/**
 * Clip Studio 핸드 셋업(Hand Setup) 2D 삼각형·사각형 컨트롤 패드 보간기.
 * `pa00`/`pa01` 편 손 프리셋과 `gu00..03` 주먹 프리셋 사이를 구면 선형 보간(Slerp)합니다.
 */
export function interpolateCspHandSetupPose(
  input: CspHandSetupInput,
): Readonly<Record<CspFingerName, readonly [QuatWxyzTuple, QuatWxyzTuple, QuatWxyzTuple]>> {
  const spread = Math.max(0, Math.min(1, Number.isFinite(input.spread01) ? input.spread01 : 0.5));
  const baseClench = Math.max(0, Math.min(1, Number.isFinite(input.clench01) ? input.clench01 : 0));
  const variantIdx = input.fistVariantIndex ?? 0;
  const fistCornerId: CspHandSetupCornerId =
    variantIdx === 1
      ? "handsetup_gu01"
      : variantIdx === 2
        ? "handsetup_gu02"
        : variantIdx === 3
          ? "handsetup_gu03"
          : "handsetup_gu00";

  const openSpread = CSP_HAND_SETUP_CORNER_PRESETS.handsetup_pa00.fingerJointQuats;
  const openClosed = CSP_HAND_SETUP_CORNER_PRESETS.handsetup_pa01.fingerJointQuats;
  const fist = CSP_HAND_SETUP_CORNER_PRESETS[fistCornerId].fingerJointQuats;

  const fingers: readonly CspFingerName[] = ["thumb", "index", "middle", "ring", "pinky"];
  const out = {} as Record<CspFingerName, readonly [QuatWxyzTuple, QuatWxyzTuple, QuatWxyzTuple]>;

  for (const finger of fingers) {
    const locked = input.lockedFingerClench01?.[finger];
    const clench =
      locked !== undefined && Number.isFinite(locked)
        ? Math.max(0, Math.min(1, locked))
        : baseClench;

    const openJ0 = slerpQuatWxyz(openClosed[finger][0], openSpread[finger][0], spread);
    const openJ1 = slerpQuatWxyz(openClosed[finger][1], openSpread[finger][1], spread);
    const openJ2 = slerpQuatWxyz(openClosed[finger][2], openSpread[finger][2], spread);

    out[finger] = [
      slerpQuatWxyz(openJ0, fist[finger][0], clench),
      slerpQuatWxyz(openJ1, fist[finger][1], clench),
      slerpQuatWxyz(openJ2, fist[finger][2], clench),
    ];
  }

  return out;
}

/**
 * Clip Studio `.3dp` 4사분면 체형 모프 패드(`shape_muscle`, `shape_thin`, `shape_fat`, `shape_child`)로부터
 * 7개 부위별 본 스케일(`bone_arm`, `bone_body`, `bone_foot`, `bone_hand`, `bone_head`, `bone_leg`, `bone_neck`)을 계산합니다.
 */
export function computeCspBodyMorphBoneScales(input: {
  readonly shapeMuscle?: number;
  readonly shapeThin?: number;
  readonly shapeFat?: number;
  readonly shapeChild?: number;
  readonly dessindollKindIndex?: number;
}): Csp3dpBodyProportionDocument {
  const muscle = Math.max(0, Math.min(1, input.shapeMuscle ?? 0));
  const thin = Math.max(0, Math.min(1, input.shapeThin ?? 0));
  const fat = Math.max(0, Math.min(1, input.shapeFat ?? 0));
  const child = Math.max(0, Math.min(1, input.shapeChild ?? 0));

  const girthDelta = muscle * 0.22 + fat * 0.32 - thin * 0.2 - child * 0.08;
  const limbLenDelta = thin * 0.06 + muscle * 0.03 - child * 0.24 - fat * 0.03;
  const headScale = 1 + child * 0.28 - muscle * 0.04;

  return {
    format: "csp-3dp",
    version: "1.0.0",
    dessindollKindIndex: input.dessindollKindIndex ?? 0,
    shapeMuscle: muscle,
    shapeThin: thin,
    shapeFat: fat,
    shapeChild: child,
    boneHead: [headScale, headScale, headScale],
    boneNeck: [1 + girthDelta * 0.65, 1 - child * 0.12, 1 + girthDelta * 0.65],
    boneBody: [
      1 + muscle * 0.24 + fat * 0.28 - thin * 0.18,
      1 + limbLenDelta * 0.5,
      1 + fat * 0.34 + muscle * 0.16 - thin * 0.18,
    ],
    boneArm: [
      1 + girthDelta * 0.85,
      1 + limbLenDelta,
      1 + girthDelta * 0.85,
    ],
    boneHand: [1 + child * 0.06, 1 + child * 0.04, 1 + child * 0.06],
    boneLeg: [
      1 + girthDelta * 0.9,
      1 + limbLenDelta * 1.15,
      1 + girthDelta * 0.9,
    ],
    boneFoot: [1 + child * 0.05, 1, 1 + limbLenDelta * 0.35],
  };
}
