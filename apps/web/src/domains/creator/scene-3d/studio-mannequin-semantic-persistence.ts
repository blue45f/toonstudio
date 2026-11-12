/**
 * Studio 3D 데생 인형 — 손 접촉·콘트라포스토·사면도 영속 복구 진단 및 Undo/Redo·체형 변경 일관성 전이 엔진.
 *
 * 1. `importStudioMannequinStateWithDiagnostics` / `parseStudioMannequinShareHashWithDiagnostics`:
 *    기존 v1/v2/v3 정본 문서를 무손실 복원하고, 구버전 포즈 전용(`studio-mannequin-pose` v1)·비버전 레거시·
 *    부분 오염된 `rig` 하위 필드는 기존 포즈·체형 데이터를 보존한 채 안전한 기본값으로 복구하며 한글 안내를 반환한다.
 *    손상 JSON·크기 초과·타 도메인 문서·미지원 상위 버전은 기존 상태를 덮어쓰지 않고 명확한 오류 문구를 돌려준다.
 * 2. `retargetStudioMannequinSemanticPose` 및 상태 전이 헬퍼:
 *    체형(`params`)·호흡(`breathPhase`) 변경, Undo/Redo, 좌우 미러, 수동 관절 회전 시
 *    손 접촉 목표(`hip`·`chin`·`chest`·`occiput`·`ground`)와 콘트라포스토(`left`·`right`)를 일관되게 유지·조율한다.
 *
 * Three.js 비의존 순수 모듈 — 단위 테스트와 UI 통합 테스트에서 동일 계약을 검증한다.
 */

import {
  applyStudioMannequinHandContact,
  buildStudioMannequinContrappostoPose,
  type StudioMannequinHandContactTargetId,
} from "./studio-mannequin-gesture-dynamics";
import {
  clampStudioMannequinBodyParams,
  clampStudioMannequinJointRotation,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinSpec,
} from "./studio-mannequin-model";
import { groundStudioMannequinPoseForSupport } from "./studio-mannequin-pose-ground-contact";
import {
  STUDIO_MANNEQUIN_POSE_DOC_KIND,
  STUDIO_MANNEQUIN_POSE_DOC_VERSION,
  STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION,
  STUDIO_MANNEQUIN_STATE_DOC_KIND,
  STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES,
  STUDIO_MANNEQUIN_STATE_DOC_RIG_VERSION,
  STUDIO_MANNEQUIN_STATE_DOC_VERSION,
  canonicalizeStudioMannequinRigState,
  createStudioMannequinRestPose,
  isStudioMannequinPersistedHandContactTargetId,
  normalizeStudioMannequinPartner,
  normalizeStudioMannequinPose,
  type StudioMannequinHandContactMap,
  type StudioMannequinPersistentState,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  applyStudioMannequinJointLocks,
  type StudioMannequinJointLockMap,
} from "./studio-mannequin-pro-kinematics";
import {
  redoStudioPoseHistory,
  undoStudioPoseHistory,
  type StudioMannequinPoseSemanticMeta,
  type StudioPoseHistory,
} from "./studio-pose-history";

const RIG_FOV_MIN_DEG = 15;
const RIG_FOV_MAX_DEG = 85;

function rad(degVal: number): number {
  return (degVal * Math.PI) / 180;
}

// ── 1. 안전한 외부 가져오기·구버전/부분 오염 복구 진단 ────────────────────────────

export type StudioMannequinStateImportFailureReason =
  | "oversized"
  | "corrupt-json"
  | "invalid-shape"
  | "invalid-kind"
  | "unsupported-version";

export type StudioMannequinStateImportSourceFormat =
  | "state-v1"
  | "state-v2"
  | "state-v3"
  | "pose-v1"
  | "legacy-unversioned";

export type StudioMannequinStateImportResult =
  | {
      readonly ok: true;
      readonly state: StudioMannequinPersistentState;
      readonly warnings: readonly string[];
      readonly sourceFormat: StudioMannequinStateImportSourceFormat;
    }
  | {
      readonly ok: false;
      readonly reason: StudioMannequinStateImportFailureReason;
      readonly messageKo: string;
    };

function inspectRigRecoveryWarnings(rawRig: unknown): string[] {
  if (rawRig === undefined) return [];
  if (typeof rawRig !== "object" || rawRig === null || Array.isArray(rawRig)) {
    return ["형식이 잘못된 사면도·접촉 설정을 기본값으로 복구했습니다."];
  }
  const src = rawRig as Record<string, unknown>;
  const issues: string[] = [];
  const allowedKeys = new Set(["handContacts", "contrapposto", "quadView", "cameraFovDeg", "projection"]);
  if (Object.keys(src).some((k) => !allowedKeys.has(k))) {
    issues.push("알 수 없는 뷰포트·접촉 옵션");
  }
  if (src.handContacts !== undefined) {
    if (typeof src.handContacts !== "object" || src.handContacts === null || Array.isArray(src.handContacts)) {
      issues.push("손 접촉 정보");
    } else {
      const hc = src.handContacts as Record<string, unknown>;
      if (
        (hc.left !== undefined && !isStudioMannequinPersistedHandContactTargetId(hc.left)) ||
        (hc.right !== undefined && !isStudioMannequinPersistedHandContactTargetId(hc.right)) ||
        Object.keys(hc).some((k) => k !== "left" && k !== "right")
      ) {
        issues.push("지원하지 않는 손 접촉 위치");
      }
    }
  }
  if (src.contrapposto !== undefined && src.contrapposto !== "left" && src.contrapposto !== "right") {
    issues.push("콘트라포스토 방향");
  }
  if (src.quadView !== undefined && typeof src.quadView !== "boolean") {
    issues.push("사면도 표시 값");
  }
  if (src.cameraFovDeg !== undefined) {
    if (
      typeof src.cameraFovDeg !== "number" ||
      !Number.isFinite(src.cameraFovDeg) ||
      src.cameraFovDeg < RIG_FOV_MIN_DEG ||
      src.cameraFovDeg > RIG_FOV_MAX_DEG
    ) {
      issues.push("렌즈 화각 범위(15°~85°)");
    }
  }
  if (src.projection !== undefined && src.projection !== "perspective" && src.projection !== "orthographic") {
    issues.push("카메라 투영 방식");
  }
  return issues.length > 0
    ? [`일부 비정상 설정(${issues.join(", ")})을 안전한 기본값으로 복구했습니다.`]
    : [];
}

export function importStudioMannequinStateWithDiagnostics(
  raw: unknown,
  options: { readonly fallbackParams?: StudioMannequinBodyParams } = {},
): StudioMannequinStateImportResult {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length > STUDIO_MANNEQUIN_STATE_DOC_MAX_BYTES) {
      return {
        ok: false,
        reason: "oversized",
        messageKo: "데생 인형 파일 크기가 한도(24KB)를 초과합니다. 기존 포즈 데이터를 그대로 유지합니다.",
      };
    }
    try {
      value = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        reason: "corrupt-json",
        messageKo: "유효하지 않은 JSON 구문입니다. 기존 포즈 데이터를 그대로 유지합니다.",
      };
    }
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      ok: false,
      reason: "invalid-shape",
      messageKo: "유효하지 않은 데생 인형 데이터 형식입니다. 기존 포즈 데이터를 그대로 유지합니다.",
    };
  }

  const doc = value as Record<string, unknown>;

  if (doc.kind === STUDIO_MANNEQUIN_POSE_DOC_KIND) {
    if (doc.version !== STUDIO_MANNEQUIN_POSE_DOC_VERSION) {
      return {
        ok: false,
        reason: "unsupported-version",
        messageKo: `지원하지 않는 포즈 문서 버전(v${String(doc.version)})입니다. 기존 포즈 데이터를 그대로 유지합니다.`,
      };
    }
    return {
      ok: true,
      sourceFormat: "pose-v1",
      state: {
        params: clampStudioMannequinBodyParams(options.fallbackParams),
        pose: normalizeStudioMannequinPose(doc),
      },
      warnings: ["포즈 전용(v1) 문서를 불러와 현재 체형을 유지한 채 포즈를 적용했습니다."],
    };
  }

  if (doc.kind === undefined && ("pose" in doc || "joints" in doc)) {
    const hasPoseField = typeof doc.pose === "object" && doc.pose !== null;
    const params = clampStudioMannequinBodyParams(doc.params ?? options.fallbackParams);
    const pose = normalizeStudioMannequinPose(hasPoseField ? doc.pose : doc);
    const partner = normalizeStudioMannequinPartner(doc.partner);
    const rig = canonicalizeStudioMannequinRigState(doc.rig);
    const warnings = [
      "구버전 데생 인형 데이터를 현재 규격으로 안전하게 복구했습니다.",
      ...inspectRigRecoveryWarnings(doc.rig),
    ];
    return {
      ok: true,
      sourceFormat: "legacy-unversioned",
      state: {
        params,
        pose,
        ...(partner ? { partner } : {}),
        ...(rig ? { rig } : {}),
      },
      warnings,
    };
  }

  if (doc.kind !== STUDIO_MANNEQUIN_STATE_DOC_KIND) {
    return {
      ok: false,
      reason: "invalid-kind",
      messageKo: "데생 인형 전용 JSON 파일이 아닙니다. 기존 포즈 데이터를 그대로 유지합니다.",
    };
  }

  if (
    doc.version !== STUDIO_MANNEQUIN_STATE_DOC_VERSION &&
    doc.version !== STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION &&
    doc.version !== STUDIO_MANNEQUIN_STATE_DOC_RIG_VERSION
  ) {
    return {
      ok: false,
      reason: "unsupported-version",
      messageKo: `지원하지 않는 데생 인형 문서 버전(v${String(doc.version)})입니다. 기존 포즈 데이터를 그대로 유지합니다.`,
    };
  }

  const params = clampStudioMannequinBodyParams(doc.params ?? options.fallbackParams);
  const pose = normalizeStudioMannequinPose(doc.pose);
  const partner =
    doc.version === STUDIO_MANNEQUIN_STATE_DOC_VERSION
      ? null
      : normalizeStudioMannequinPartner(doc.partner);
  const rig = canonicalizeStudioMannequinRigState(doc.rig);
  const warnings = inspectRigRecoveryWarnings(doc.rig);

  if (doc.version === STUDIO_MANNEQUIN_STATE_DOC_RIG_VERSION && doc.rig === undefined) {
    warnings.push("누락된 v3 사면도·접촉 설정을 기본값으로 복구했습니다.");
  }

  const sourceFormat: StudioMannequinStateImportSourceFormat =
    doc.version === STUDIO_MANNEQUIN_STATE_DOC_VERSION
      ? "state-v1"
      : doc.version === STUDIO_MANNEQUIN_STATE_DOC_DUO_VERSION
        ? "state-v2"
        : "state-v3";

  return {
    ok: true,
    sourceFormat,
    state: {
      params,
      pose,
      ...(partner ? { partner } : {}),
      ...(rig ? { rig } : {}),
    },
    warnings,
  };
}

export function parseStudioMannequinShareHashWithDiagnostics(
  hash: string,
  options: { readonly fallbackParams?: StudioMannequinBodyParams } = {},
): StudioMannequinStateImportResult | null {
  if (!hash.includes("mannequin=")) return null;
  const match = /mannequin=([^&]+)/.exec(hash);
  if (!match || !match[1]) {
    return {
      ok: false,
      reason: "corrupt-json",
      messageKo: "공유 링크의 데생 인형 데이터가 비어 있습니다. 기존 포즈 데이터를 그대로 유지합니다.",
    };
  }
  try {
    const json = atob(decodeURIComponent(match[1]));
    return importStudioMannequinStateWithDiagnostics(json, options);
  } catch {
    return {
      ok: false,
      reason: "corrupt-json",
      messageKo: "공유 링크 인코딩이 손상되었습니다. 기존 포즈 데이터를 그대로 유지합니다.",
    };
  }
}

// ── 2. 체형 변경·미러·수동 편집·Undo/Redo 의미론적 접촉 전이 ───────────────────

export interface StudioMannequinSemanticContactState {
  readonly handContacts?: {
    readonly left?: StudioMannequinHandContactTargetId;
    readonly right?: StudioMannequinHandContactTargetId;
  };
  readonly contrapposto?: "left" | "right" | null;
}

export function hasActiveStudioMannequinSemanticContacts(
  meta: StudioMannequinSemanticContactState | undefined,
): boolean {
  if (!meta) return false;
  return Boolean(meta.contrapposto || meta.handContacts?.left || meta.handContacts?.right);
}

export function mirrorStudioMannequinSemanticContacts(
  meta: StudioMannequinSemanticContactState,
): StudioMannequinPoseSemanticMeta {
  const left = meta.handContacts?.right;
  const right = meta.handContacts?.left;
  const handContacts =
    left || right
      ? {
          ...(left ? { left } : {}),
          ...(right ? { right } : {}),
        }
      : undefined;
  const contrapposto =
    meta.contrapposto === "left"
      ? "right"
      : meta.contrapposto === "right"
        ? "left"
        : undefined;
  return {
    ...(handContacts ? { handContacts } : {}),
    ...(contrapposto ? { contrapposto } : {}),
  };
}

function jointRotChanged(
  a: StudioMannequinPose,
  b: StudioMannequinPose,
  jointId: StudioMannequinJointId,
  eps = 1e-4,
): boolean {
  const ra = a.joints[jointId] ?? [0, 0, 0];
  const rb = b.joints[jointId] ?? [0, 0, 0];
  return (
    Math.abs(ra[0] - rb[0]) > eps ||
    Math.abs(ra[1] - rb[1]) > eps ||
    Math.abs(ra[2] - rb[2]) > eps
  );
}

export function reconcileStudioMannequinSemanticContactsAfterManualEdit(
  prevPose: StudioMannequinPose,
  nextPose: StudioMannequinPose,
  meta: StudioMannequinSemanticContactState,
): StudioMannequinPoseSemanticMeta {
  if (!hasActiveStudioMannequinSemanticContacts(meta)) return {};
  const leftArmEdited = (
    ["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"] as const
  ).some((j) => jointRotChanged(prevPose, nextPose, j));
  const rightArmEdited = (
    ["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"] as const
  ).some((j) => jointRotChanged(prevPose, nextPose, j));
  const coreOrLegEdited =
    (
      [
        "pelvis",
        "spine",
        "chest",
        "leftUpperLeg",
        "leftLowerLeg",
        "leftFoot",
        "rightUpperLeg",
        "rightLowerLeg",
        "rightFoot",
      ] as const
    ).some((j) => jointRotChanged(prevPose, nextPose, j)) ||
    Math.hypot(
      prevPose.pelvisOffset[0] - nextPose.pelvisOffset[0],
      prevPose.pelvisOffset[2] - nextPose.pelvisOffset[2],
    ) > 1e-3;

  let nextLeft = leftArmEdited ? undefined : meta.handContacts?.left;
  let nextRight = rightArmEdited ? undefined : meta.handContacts?.right;
  if (coreOrLegEdited) {
    if (nextLeft === "ground") nextLeft = undefined;
    if (nextRight === "ground") nextRight = undefined;
  }
  const contrapposto = coreOrLegEdited ? undefined : (meta.contrapposto ?? undefined);
  const handContacts =
    nextLeft || nextRight
      ? {
          ...(nextLeft ? { left: nextLeft } : {}),
          ...(nextRight ? { right: nextRight } : {}),
        }
      : undefined;

  return {
    ...(handContacts ? { handContacts } : {}),
    ...(contrapposto ? { contrapposto } : {}),
  };
}

export function retargetStudioMannequinSemanticPose(
  spec: StudioMannequinSpec,
  basePose: StudioMannequinPose,
  meta: StudioMannequinSemanticContactState | undefined,
  locks: StudioMannequinJointLockMap = {},
): StudioMannequinPose {
  if (!meta || !hasActiveStudioMannequinSemanticContacts(meta)) return basePose;

  const leftTarget = meta.handContacts?.left;
  const rightTarget = meta.handContacts?.right;
  const hasGround = leftTarget === "ground" || rightTarget === "ground";
  let current = basePose;

  if (meta.contrapposto && !hasGround) {
    current = buildStudioMannequinContrappostoPose(spec, current, meta.contrapposto, 0.8, locks);
  }

  if (leftTarget === "ground" && rightTarget === "ground") {
    const leftGround = applyStudioMannequinHandContact(spec, current, "left", "ground", locks).pose;
    const bothCandidate = normalizeStudioMannequinPose({
      joints: {
        ...leftGround.joints,
        rightUpperArm: clampStudioMannequinJointRotation("rightUpperArm", [rad(-92), 0, rad(-6)]),
        rightLowerArm: clampStudioMannequinJointRotation("rightLowerArm", [rad(-8), 0, 0]),
        rightHand: clampStudioMannequinJointRotation("rightHand", [rad(58), 0, 0]),
      },
      pelvisOffset: leftGround.pelvisOffset,
    });
    const groundedBoth = groundStudioMannequinPoseForSupport(spec, bothCandidate, {
      support: "kneeling",
      contacts: ["leftFoot", "rightFoot", "leftHand", "rightHand"],
    });
    return applyStudioMannequinJointLocks(basePose, groundedBoth, locks);
  }

  if (leftTarget === "ground") {
    current = applyStudioMannequinHandContact(spec, current, "left", "ground", locks).pose;
    if (rightTarget) current = applyStudioMannequinHandContact(spec, current, "right", rightTarget, locks).pose;
    return current;
  }

  if (rightTarget === "ground") {
    current = applyStudioMannequinHandContact(spec, current, "right", "ground", locks).pose;
    if (leftTarget) current = applyStudioMannequinHandContact(spec, current, "left", leftTarget, locks).pose;
    return current;
  }

  if (leftTarget) current = applyStudioMannequinHandContact(spec, current, "left", leftTarget, locks).pose;
  if (rightTarget) current = applyStudioMannequinHandContact(spec, current, "right", rightTarget, locks).pose;
  return current;
}

export function resolveContrappostoToggleTransition(input: {
  readonly spec: StudioMannequinSpec;
  readonly currentPose: StudioMannequinPose;
  readonly currentMeta: StudioMannequinPoseSemanticMeta;
  readonly weightSide: "left" | "right";
  readonly locks: StudioMannequinJointLockMap;
  readonly groundFallback: (pose: StudioMannequinPose) => StudioMannequinPose;
}): { readonly pose: StudioMannequinPose; readonly meta: StudioMannequinPoseSemanticMeta } {
  const toggledOff = input.currentMeta.contrapposto === input.weightSide;
  const hc = input.currentMeta.handContacts;
  const keptHandContacts: StudioMannequinHandContactMap = {
    ...(hc?.left && hc.left !== "ground" ? { left: hc.left } : {}),
    ...(hc?.right && hc.right !== "ground" ? { right: hc.right } : {}),
  };
  const nextMeta: StudioMannequinPoseSemanticMeta = {
    ...(keptHandContacts.left || keptHandContacts.right ? { handContacts: keptHandContacts } : {}),
    ...(toggledOff ? {} : { contrapposto: input.weightSide }),
  };
  const seedPose = toggledOff ? createStudioMannequinRestPose() : input.currentPose;
  const pose = hasActiveStudioMannequinSemanticContacts(nextMeta)
    ? retargetStudioMannequinSemanticPose(input.spec, seedPose, nextMeta, input.locks)
    : input.groundFallback(applyStudioMannequinJointLocks(input.currentPose, seedPose, input.locks));
  return { pose, meta: nextMeta };
}

export function resolveHandContactToggleTransition(input: {
  readonly spec: StudioMannequinSpec;
  readonly currentPose: StudioMannequinPose;
  readonly currentMeta: StudioMannequinPoseSemanticMeta;
  readonly side: "left" | "right";
  readonly targetId: StudioMannequinHandContactTargetId;
  readonly locks: StudioMannequinJointLockMap;
  readonly groundFallback: (pose: StudioMannequinPose) => StudioMannequinPose;
}): { readonly pose: StudioMannequinPose; readonly meta: StudioMannequinPoseSemanticMeta } {
  const currentContacts = input.currentMeta.handContacts ?? {};
  const toggledOff = currentContacts[input.side] === input.targetId;
  const otherSide = input.side === "left" ? "right" : "left";
  const otherTarget = currentContacts[otherSide];
  const nextHandContacts: StudioMannequinHandContactMap = {
    ...(otherTarget ? { [otherSide]: otherTarget } : {}),
    ...(toggledOff ? {} : { [input.side]: input.targetId }),
  };
  const hasGround = nextHandContacts.left === "ground" || nextHandContacts.right === "ground";
  const nextContrapposto = hasGround ? null : (input.currentMeta.contrapposto ?? null);
  const nextMeta: StudioMannequinPoseSemanticMeta = {
    ...(nextHandContacts.left || nextHandContacts.right ? { handContacts: nextHandContacts } : {}),
    ...(nextContrapposto ? { contrapposto: nextContrapposto } : {}),
  };

  let seedPose = input.currentPose;
  if (toggledOff) {
    const armJoints =
      input.side === "left"
        ? (["leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand"] as const)
        : (["rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand"] as const);
    const relaxedJoints = { ...input.currentPose.joints };
    for (const jid of armJoints) {
      if (!input.locks[jid]) delete relaxedJoints[jid];
    }
    seedPose =
      input.targetId === "ground" && !hasGround
        ? createStudioMannequinRestPose()
        : normalizeStudioMannequinPose({
            joints: relaxedJoints,
            pelvisOffset: input.currentPose.pelvisOffset,
          });
  } else if ((currentContacts.left === "ground" || currentContacts.right === "ground") && !hasGround) {
    seedPose = createStudioMannequinRestPose();
  }

  const pose = hasActiveStudioMannequinSemanticContacts(nextMeta)
    ? retargetStudioMannequinSemanticPose(input.spec, seedPose, nextMeta, input.locks)
    : input.groundFallback(applyStudioMannequinJointLocks(input.currentPose, seedPose, input.locks));
  return { pose, meta: nextMeta };
}

export function resolveUndoRedoSemanticStep(input: {
  readonly direction: "undo" | "redo";
  readonly history: StudioPoseHistory;
  readonly currentPose: StudioMannequinPose;
  readonly currentMeta: StudioMannequinPoseSemanticMeta;
  readonly spec: StudioMannequinSpec;
  readonly locks: StudioMannequinJointLockMap;
}): {
  readonly history: StudioPoseHistory;
  readonly pose: StudioMannequinPose;
  readonly meta: StudioMannequinPoseSemanticMeta;
} | null {
  const step =
    input.direction === "undo"
      ? undoStudioPoseHistory(input.history, input.currentPose, input.currentMeta)
      : redoStudioPoseHistory(input.history, input.currentPose, input.currentMeta);
  if (!step) return null;
  const meta = step.meta ?? {};
  const pose = hasActiveStudioMannequinSemanticContacts(meta)
    ? retargetStudioMannequinSemanticPose(input.spec, step.pose, meta, input.locks)
    : step.pose;
  return { history: step.history, pose, meta };
}
