/**
 * Wave 147 — 21-관절 손 해부학 순기구학(FK) 빌더 및 관절 가동범위(ROM) 감사기.
 *
 * - 정본 21관절 트리(`wrist` + 5손가락 x 4관절)와 20개 캡슐 뼈대 생성
 * - 좌수/우수(`left` | `right`) 정확한 X축 미러 대칭 보장
 * - PIP/DIP 역꺾임(< -5°), 과굴곡(> 115°/90°), 외전·대립·손목 이탈 탐지 및 클램핑
 */

import {
  DEFAULT_PALM_WIDTH_MM,
  FINGER_ANATOMY_METRICS,
  FINGER_NAME_KO,
  HAND_FINGER_IDS,
  HAND_FINGER_ROM_LIMITS,
  WRIST_ROM_LIMITS,
  type AngleRangeDeg,
  type FingerPoseAngleMap,
  type FingerPoseAngles,
  type Hand21JointPose,
  type HandAnatomicalRomAudit,
  type HandBoneCapsule,
  type HandFingerId,
  type HandJoint3D,
  type HandJointId,
  type HandPoseSpec,
  type HandRomJointField,
  type HandRomViolation,
  type HandRomViolationKind,
  type HandSegmentKind,
  type WristPoseAngles,
} from "./hand-21joint-presets-and-types";
import {
  addVec3,
  clampNumber,
  degToRad,
  dotVec3,
  normalizeVec3,
  rotateVec3EulerDeg,
  roundFixed,
  scaleVec3,
  subVec3,
  vec3,
  type Vec3,
} from "./hand-pose-math-and-sha256";

export {
  DEFAULT_PALM_WIDTH_MM,
  HAND_21_JOINT_IDS,
  HAND_FINGER_IDS,
  HAND_FINGER_ROM_LIMITS,
  HAND_POSE_PRESETS,
  HAND_PRESET_IDS,
  WRIST_ROM_LIMITS,
  createHandPresetSpec,
  getPresetDefaultProp,
  type AngleRangeDeg,
  type FingerPoseAngleMap,
  type FingerPoseAngles,
  type FingerRomLimitSpec,
  type Hand21JointPose,
  type HandAnatomicalRomAudit,
  type HandBoneCapsule,
  type HandFingerId,
  type HandJoint3D,
  type HandJointId,
  type HandPoseSpec,
  type HandPresetDefinition,
  type HandPresetId,
  type HandRomJointField,
  type HandRomViolation,
  type HandRomViolationKind,
  type HandSegmentKind,
  type Handedness,
  type WristPoseAngles,
  type WristRomLimitSpec,
} from "./hand-21joint-presets-and-types";

function normalizeWristAngles(input?: Partial<WristPoseAngles>): WristPoseAngles {
  return {
    flexionDeg: Number.isFinite(input?.flexionDeg) ? (input?.flexionDeg ?? 0) : 0,
    radialUlnarDeg: Number.isFinite(input?.radialUlnarDeg) ? (input?.radialUlnarDeg ?? 0) : 0,
    pronationDeg: Number.isFinite(input?.pronationDeg) ? (input?.pronationDeg ?? 0) : 0,
  };
}

function normalizeFingerAngles(
  finger: HandFingerId,
  input: FingerPoseAngles,
): FingerPoseAngles {
  return {
    mcpFlexDeg: Number.isFinite(input.mcpFlexDeg) ? input.mcpFlexDeg : 0,
    mcpAbductDeg: Number.isFinite(input.mcpAbductDeg) ? input.mcpAbductDeg : 0,
    pipFlexDeg: Number.isFinite(input.pipFlexDeg) ? input.pipFlexDeg : 0,
    dipFlexDeg: Number.isFinite(input.dipFlexDeg) ? input.dipFlexDeg : 0,
    oppositionDeg:
      finger === "thumb" && Number.isFinite(input.oppositionDeg)
        ? (input.oppositionDeg ?? 0)
        : 0,
  };
}

/** 모든 관절각을 해부학적 ROM 범위로 클램핑한 새 HandPoseSpec을 반환한다. */
export function clampHandPoseSpecToRom(spec: HandPoseSpec): HandPoseSpec {
  const wrist = normalizeWristAngles(spec.wristAngles);
  const clampedWrist: WristPoseAngles = {
    flexionDeg: clampNumber(
      wrist.flexionDeg,
      WRIST_ROM_LIMITS.flexion.minDeg,
      WRIST_ROM_LIMITS.flexion.maxDeg,
    ),
    radialUlnarDeg: clampNumber(
      wrist.radialUlnarDeg,
      WRIST_ROM_LIMITS.radialUlnar.minDeg,
      WRIST_ROM_LIMITS.radialUlnar.maxDeg,
    ),
    pronationDeg: clampNumber(
      wrist.pronationDeg,
      WRIST_ROM_LIMITS.pronation.minDeg,
      WRIST_ROM_LIMITS.pronation.maxDeg,
    ),
  };

  const clampFinger = (finger: HandFingerId): FingerPoseAngles => {
    const lim = HAND_FINGER_ROM_LIMITS[finger];
    const src = normalizeFingerAngles(finger, spec.fingers[finger]);
    return {
      mcpFlexDeg: clampNumber(src.mcpFlexDeg, lim.mcpFlex.minDeg, lim.mcpFlex.maxDeg),
      mcpAbductDeg: clampNumber(src.mcpAbductDeg, lim.mcpAbduct.minDeg, lim.mcpAbduct.maxDeg),
      pipFlexDeg: clampNumber(src.pipFlexDeg, lim.pipFlex.minDeg, lim.pipFlex.maxDeg),
      dipFlexDeg: clampNumber(src.dipFlexDeg, lim.dipFlex.minDeg, lim.dipFlex.maxDeg),
      oppositionDeg:
        finger === "thumb"
          ? clampNumber(src.oppositionDeg ?? 0, lim.opposition.minDeg, lim.opposition.maxDeg)
          : 0,
    };
  };

  return {
    ...spec,
    wristAngles: clampedWrist,
    fingers: {
      thumb: clampFinger("thumb"),
      index: clampFinger("index"),
      middle: clampFinger("middle"),
      ring: clampFinger("ring"),
      pinky: clampFinger("pinky"),
    },
    clampToRom: true,
  };
}

function buildThumbChainLocal(
  angles: FingerPoseAngles,
  scale: number,
): readonly [Vec3, Vec3, Vec3, Vec3] {
  const metric = FINGER_ANATOMY_METRICS.thumb;
  const cmc = scaleVec3(metric.baseOffsetMm, scale);

  const abdRad = degToRad(metric.naturalSplayDeg + angles.mcpAbductDeg);
  const oppRad = degToRad(angles.oppositionDeg ?? 0);
  const yaw = oppRad * 0.88;

  const forwardBase = normalizeVec3(
    vec3(
      Math.sin(abdRad) * Math.cos(yaw),
      Math.cos(abdRad),
      Math.sin(abdRad) * Math.sin(yaw) + 0.16,
    ),
    vec3(0.45, 0.85, 0.25),
  );

  const rawInward = vec3(
    -(0.45 + 0.55 * Math.sin(oppRad)),
    -0.08 * Math.sin(oppRad),
    0.72 * Math.cos(oppRad) + 0.18,
  );
  const proj = dotVec3(rawInward, forwardBase);
  const flexAxis = normalizeVec3(
    subVec3(rawInward, scaleVec3(forwardBase, proj)),
    vec3(-0.6, 0, 0.8),
  );

  const t1 = degToRad(angles.mcpFlexDeg);
  const t2 = t1 + degToRad(angles.pipFlexDeg);
  const t3 = t2 + degToRad(angles.dipFlexDeg);

  const d1 = addVec3(scaleVec3(forwardBase, Math.cos(t1)), scaleVec3(flexAxis, Math.sin(t1)));
  const d2 = addVec3(scaleVec3(forwardBase, Math.cos(t2)), scaleVec3(flexAxis, Math.sin(t2)));
  const d3 = addVec3(scaleVec3(forwardBase, Math.cos(t3)), scaleVec3(flexAxis, Math.sin(t3)));

  const mcp = addVec3(cmc, scaleVec3(d1, metric.lengthsMm[0] * scale));
  const ip = addVec3(mcp, scaleVec3(d2, metric.lengthsMm[1] * scale));
  const tip = addVec3(ip, scaleVec3(d3, metric.lengthsMm[2] * scale));
  return [cmc, mcp, ip, tip];
}

function buildFingerChainLocal(
  finger: Exclude<HandFingerId, "thumb">,
  angles: FingerPoseAngles,
  scale: number,
): readonly [Vec3, Vec3, Vec3, Vec3] {
  const metric = FINGER_ANATOMY_METRICS[finger];
  const mcp = scaleVec3(metric.baseOffsetMm, scale);
  const splayRad = degToRad(metric.naturalSplayDeg + metric.abductSign * angles.mcpAbductDeg);

  const uY = vec3(Math.sin(splayRad), Math.cos(splayRad), 0);
  const uZ = vec3(0, 0, 1);

  const t1 = degToRad(angles.mcpFlexDeg);
  const t2 = t1 + degToRad(angles.pipFlexDeg);
  const t3 = t2 + degToRad(angles.dipFlexDeg);

  const d1 = addVec3(scaleVec3(uY, Math.cos(t1)), scaleVec3(uZ, Math.sin(t1)));
  const d2 = addVec3(scaleVec3(uY, Math.cos(t2)), scaleVec3(uZ, Math.sin(t2)));
  const d3 = addVec3(scaleVec3(uY, Math.cos(t3)), scaleVec3(uZ, Math.sin(t3)));

  const pip = addVec3(mcp, scaleVec3(d1, metric.lengthsMm[0] * scale));
  const dip = addVec3(pip, scaleVec3(d2, metric.lengthsMm[1] * scale));
  const tip = addVec3(dip, scaleVec3(d3, metric.lengthsMm[2] * scale));
  return [mcp, pip, dip, tip];
}

/**
 * 21-관절 손 해부학 기구학 포즈와 20개 캡슐 뼈대를 결정론적으로 생성한다.
 * 좌수(`left`)는 우수(`right`)의 로컬 X축 완전 미러 대칭을 보장한다.
 */
export function buildHand21JointPose(rawSpec: HandPoseSpec): Hand21JointPose {
  const spec = rawSpec.clampToRom ? clampHandPoseSpecToRom(rawSpec) : rawSpec;
  const palmWidthMm = clampNumber(spec.palmWidthMm ?? DEFAULT_PALM_WIDTH_MM, 48, 130);
  const scale = palmWidthMm / DEFAULT_PALM_WIDTH_MM;
  const mirrorSign = spec.handedness === "right" ? 1 : -1;
  const wristAngles = normalizeWristAngles(spec.wristAngles);
  const wristTranslationMm = spec.wristTranslationMm ?? vec3(0, 0, 0);

  const normalizedFingers: FingerPoseAngleMap = {
    thumb: normalizeFingerAngles("thumb", spec.fingers.thumb),
    index: normalizeFingerAngles("index", spec.fingers.index),
    middle: normalizeFingerAngles("middle", spec.fingers.middle),
    ring: normalizeFingerAngles("ring", spec.fingers.ring),
    pinky: normalizeFingerAngles("pinky", spec.fingers.pinky),
  };

  const wristEuler = vec3(
    wristAngles.flexionDeg,
    wristAngles.pronationDeg * mirrorSign,
    wristAngles.radialUlnarDeg * mirrorSign,
  );

  const toWorld = (localRightMm: Vec3): Vec3 => {
    const mirrored = vec3(localRightMm.x * mirrorSign, localRightMm.y, localRightMm.z);
    const rotated = rotateVec3EulerDeg(mirrored, wristEuler);
    const moved = addVec3(rotated, wristTranslationMm);
    return vec3(roundFixed(moved.x, 4), roundFixed(moved.y, 4), roundFixed(moved.z, 4));
  };

  const joints: HandJoint3D[] = [];
  const jointRecord: Partial<Record<HandJointId, HandJoint3D>> = {};
  const wristJoint: HandJoint3D = {
    index: 0,
    id: "wrist",
    parentId: null,
    finger: "palm",
    positionMm: toWorld(vec3(0, 0, 0)),
    radiusMm: roundFixed(13 * scale, 3),
  };
  joints.push(wristJoint);
  jointRecord.wrist = wristJoint;

  const capsules: HandBoneCapsule[] = [];
  const segKinds: readonly HandSegmentKind[] = ["metacarpal", "proximal", "middle", "distal"];

  for (let fIdx = 0; fIdx < HAND_FINGER_IDS.length; fIdx += 1) {
    const finger = HAND_FINGER_IDS[fIdx];
    if (finger === undefined) {
      continue;
    }
    const metric = FINGER_ANATOMY_METRICS[finger];
    const angles = normalizedFingers[finger];
    const chain =
      finger === "thumb"
        ? buildThumbChainLocal(angles, scale)
        : buildFingerChainLocal(finger, angles, scale);

    let prevId: HandJointId = "wrist";
    let prevPos = wristJoint.positionMm;

    for (let j = 0; j < 4; j += 1) {
      const jointId = metric.jointIds[j];
      const localPos = chain[j];
      const segKind = segKinds[j];
      const rawRadius = metric.radiiMm[j];
      if (
        jointId === undefined ||
        localPos === undefined ||
        segKind === undefined ||
        rawRadius === undefined
      ) {
        continue;
      }

      const worldPos = toWorld(localPos);
      const radiusMm = roundFixed(rawRadius * scale, 3);
      const joint: HandJoint3D = {
        index: joints.length,
        id: jointId,
        parentId: prevId,
        finger,
        positionMm: worldPos,
        radiusMm,
      };
      joints.push(joint);
      jointRecord[jointId] = joint;

      const delta = subVec3(worldPos, prevPos);
      const lengthMm = roundFixed(
        Math.sqrt(delta.x * delta.x + delta.y * delta.y + delta.z * delta.z),
        4,
      );
      capsules.push({
        segmentIndex: capsules.length,
        id: `${prevId}_to_${jointId}`,
        fromJointId: prevId,
        toJointId: jointId,
        finger,
        kind: segKind,
        startMm: prevPos,
        endMm: worldPos,
        lengthMm,
        radiusMm,
      });

      prevId = jointId;
      prevPos = worldPos;
    }
  }

  const palmNormal = normalizeVec3(rotateVec3EulerDeg(vec3(0, 0, 1), wristEuler), vec3(0, 0, 1));
  return {
    handedness: spec.handedness,
    palmWidthMm,
    presetId: spec.presetId ?? "custom",
    wristAngles,
    wristTranslationMm,
    fingerAngles: normalizedFingers,
    joints,
    jointMap: jointRecord as Readonly<Record<HandJointId, HandJoint3D>>,
    capsules,
    palmNormal: vec3(
      roundFixed(palmNormal.x, 4),
      roundFixed(palmNormal.y, 4),
      roundFixed(palmNormal.z, 4),
    ),
  };
}

/** 21-관절 손 포즈의 관절 가동범위(ROM) 위반을 감사하고 클램핑 복구 포즈를 함께 반환한다. */
export function auditHandAnatomicalRom(spec: HandPoseSpec): HandAnatomicalRomAudit {
  const violations: HandRomViolation[] = [];
  const wrist = normalizeWristAngles(spec.wristAngles);

  const checkRange = (
    target: HandFingerId | "wrist",
    field: HandRomJointField,
    actualDeg: number,
    range: AngleRangeDeg,
    kindBelow: HandRomViolationKind,
    kindAbove: HandRomViolationKind,
    labelKo: string,
  ): void => {
    if (actualDeg < range.minDeg) {
      violations.push({
        target,
        field,
        kind: kindBelow,
        actualDeg: roundFixed(actualDeg, 3),
        minDeg: range.minDeg,
        maxDeg: range.maxDeg,
        excessDeg: roundFixed(range.minDeg - actualDeg, 3),
        clampedDeg: range.minDeg,
        messageKo: `${labelKo}이 ${roundFixed(actualDeg, 1)}°로 허용 하한(${range.minDeg}°)을 넘어 역꺾임 상태입니다.`,
      });
    } else if (actualDeg > range.maxDeg) {
      violations.push({
        target,
        field,
        kind: kindAbove,
        actualDeg: roundFixed(actualDeg, 3),
        minDeg: range.minDeg,
        maxDeg: range.maxDeg,
        excessDeg: roundFixed(actualDeg - range.maxDeg, 3),
        clampedDeg: range.maxDeg,
        messageKo: `${labelKo}이 ${roundFixed(actualDeg, 1)}°로 허용 상한(${range.maxDeg}°)을 초과했습니다.`,
      });
    }
  };

  checkRange("wrist", "wrist.flexionDeg", wrist.flexionDeg, WRIST_ROM_LIMITS.flexion, "wrist-limit", "wrist-limit", "손목 굴곡·신전각");
  checkRange("wrist", "wrist.radialUlnarDeg", wrist.radialUlnarDeg, WRIST_ROM_LIMITS.radialUlnar, "wrist-limit", "wrist-limit", "손목 요측·척측 편위각");
  checkRange("wrist", "wrist.pronationDeg", wrist.pronationDeg, WRIST_ROM_LIMITS.pronation, "wrist-limit", "wrist-limit", "손목 회내·회외각");

  for (let i = 0; i < HAND_FINGER_IDS.length; i += 1) {
    const finger = HAND_FINGER_IDS[i];
    if (finger === undefined) {
      continue;
    }
    const lim = HAND_FINGER_ROM_LIMITS[finger];
    const ang = normalizeFingerAngles(finger, spec.fingers[finger]);
    const nameKo = FINGER_NAME_KO[finger];

    checkRange(finger, "mcpFlexDeg", ang.mcpFlexDeg, lim.mcpFlex, "hyperextension", "overflexion", `${nameKo} ${finger === "thumb" ? "CMC" : "MCP"} 굴곡각`);
    checkRange(finger, "mcpAbductDeg", ang.mcpAbductDeg, lim.mcpAbduct, "abduction-limit", "abduction-limit", `${nameKo} 외전·벌림각`);
    checkRange(finger, "pipFlexDeg", ang.pipFlexDeg, lim.pipFlex, "hyperextension", "overflexion", `${nameKo} ${finger === "thumb" ? "MCP" : "PIP"} 굴곡각`);
    checkRange(finger, "dipFlexDeg", ang.dipFlexDeg, lim.dipFlex, "hyperextension", "overflexion", `${nameKo} ${finger === "thumb" ? "IP" : "DIP"} 굴곡각`);
    if (finger === "thumb") {
      checkRange(finger, "oppositionDeg", ang.oppositionDeg ?? 0, lim.opposition, "opposition-limit", "opposition-limit", "엄지 대립각");
    }
  }

  let hyperextensionCount = 0;
  let overflexionCount = 0;
  let maxExcessDeg = 0;
  for (let i = 0; i < violations.length; i += 1) {
    const v = violations[i];
    if (v === undefined) {
      continue;
    }
    if (v.kind === "hyperextension") {
      hyperextensionCount += 1;
    } else if (v.kind === "overflexion") {
      overflexionCount += 1;
    }
    if (v.excessDeg > maxExcessDeg) {
      maxExcessDeg = v.excessDeg;
    }
  }

  const clampedSpec = clampHandPoseSpecToRom(spec);
  return {
    passed: violations.length === 0,
    violationCount: violations.length,
    hyperextensionCount,
    overflexionCount,
    maxExcessDeg: roundFixed(maxExcessDeg, 3),
    violations,
    clampedSpec,
    clampedPose: buildHand21JointPose(clampedSpec),
  };
}
