import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { SpecialistError } from "./specialist-contract";
import { glbArtifact, readSpecialistDocument, sha256 } from "./specialist-gltf";
import type { Node, WebIO } from "@gltf-transform/core";
import type {
  SpecialistArtifact,
  SpecialistOptions,
} from "./specialist-contract";

interface ChainJointState {
  readonly restPos: Vector3;
  readonly restRot: Quaternion;
  rx: number;
  ry: number;
  rz: number;
}

const UNIT_X = new Vector3(1, 0, 0);
const UNIT_Y = new Vector3(0, 1, 0);
const UNIT_Z = new Vector3(0, 0, 1);

function clampAngle(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

function solveSymmetric3x3(
  a00: number,
  a01: number,
  a02: number,
  a11: number,
  a12: number,
  a22: number,
  b0: number,
  b1: number,
  b2: number,
): readonly [number, number, number] | null {
  const c00 = a11 * a22 - a12 * a12;
  const c01 = a02 * a12 - a01 * a22;
  const c02 = a01 * a12 - a02 * a11;
  const c11 = a00 * a22 - a02 * a02;
  const c12 = a01 * a02 - a00 * a12;
  const c22 = a00 * a11 - a01 * a01;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18) return null;
  const invDet = 1 / det;
  return [
    (c00 * b0 + c01 * b1 + c02 * b2) * invDet,
    (c01 * b0 + c11 * b1 + c12 * b2) * invDet,
    (c02 * b0 + c12 * b1 + c22 * b2) * invDet,
  ];
}

function evaluateChainFk(
  anchorPos: Vector3,
  anchorQuat: Quaternion,
  joints: readonly ChainJointState[],
  outWorldPos: Vector3[],
  outBaseQuat: Quaternion[],
): Vector3 {
  const curPos = anchorPos.clone();
  const curQuat = anchorQuat.clone();
  const stepVec = new Vector3();
  const deltaQuat = new Quaternion();
  const euler = new Euler(0, 0, 0, "XYZ");
  const lastIndex = joints.length - 1;

  for (let i = 0; i <= lastIndex; i += 1) {
    const joint = joints[i]!;
    stepVec.copy(joint.restPos).applyQuaternion(curQuat);
    curPos.add(stepVec);
    outWorldPos[i]!.copy(curPos);

    curQuat.multiply(joint.restRot).normalize();
    outBaseQuat[i]!.copy(curQuat);

    if (i < lastIndex) {
      euler.set(joint.rx, joint.ry, joint.rz, "XYZ");
      deltaQuat.setFromEuler(euler);
      curQuat.multiply(deltaQuat).normalize();
    }
  }
  return curPos;
}

/**
 * Bounded damped-least-squares rotation-chain solver with exact analytic XYZ Euler Jacobians
 * and symmetric joint-angle limits. Zero third-party IK package dependencies.
 */
function solveBoundedRotationChain(
  anchorPos: Vector3,
  anchorQuat: Quaternion,
  joints: readonly ChainJointState[],
  target: Vector3,
  limitRadians: number,
  tolerance: number,
): { readonly error: number; readonly statuses: readonly string[] } {
  const n = joints.length;
  const activeCount = n - 1;
  const dofCount = activeCount * 3;
  const worldPos = Array.from({ length: n }, () => new Vector3());
  const baseQuat = Array.from({ length: n }, () => new Quaternion());
  const jacX = new Float64Array(dofCount);
  const jacY = new Float64Array(dofCount);
  const jacZ = new Float64Array(dofCount);
  const delta = new Float64Array(dofCount);
  const saved = new Float64Array(dofCount);

  const axis = new Vector3();
  const lever = new Vector3();
  const cross = new Vector3();
  const qTemp = new Quaternion();
  const qAxis = new Quaternion();
  const convergeThreshold = tolerance / 2;
  const maxIterations = 160;
  let lambda = 0.03;

  let tipPos = evaluateChainFk(anchorPos, anchorQuat, joints, worldPos, baseQuat);
  let error = tipPos.distanceTo(target);
  if (error <= convergeThreshold) {
    return { error, statuses: ["CONVERGED"] };
  }

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const ex = target.x - tipPos.x;
    const ey = target.y - tipPos.y;
    const ez = target.z - tipPos.z;

    let a00 = lambda * lambda;
    let a01 = 0;
    let a02 = 0;
    let a11 = lambda * lambda;
    let a12 = 0;
    let a22 = lambda * lambda;

    for (let i = 0; i < activeCount; i += 1) {
      const joint = joints[i]!;
      lever.subVectors(tipPos, worldPos[i]!);
      qTemp.copy(baseQuat[i]!);

      // Axis X in world frame
      axis.copy(UNIT_X).applyQuaternion(qTemp);
      cross.crossVectors(axis, lever);
      const col0 = i * 3;
      jacX[col0] = cross.x;
      jacY[col0] = cross.y;
      jacZ[col0] = cross.z;

      // Axis Y after Rx(rx)
      qAxis.setFromAxisAngle(UNIT_X, joint.rx);
      qTemp.multiply(qAxis);
      axis.copy(UNIT_Y).applyQuaternion(qTemp);
      cross.crossVectors(axis, lever);
      const col1 = col0 + 1;
      jacX[col1] = cross.x;
      jacY[col1] = cross.y;
      jacZ[col1] = cross.z;

      // Axis Z after Rx(rx) * Ry(ry)
      qAxis.setFromAxisAngle(UNIT_Y, joint.ry);
      qTemp.multiply(qAxis);
      axis.copy(UNIT_Z).applyQuaternion(qTemp);
      cross.crossVectors(axis, lever);
      const col2 = col0 + 2;
      jacX[col2] = cross.x;
      jacY[col2] = cross.y;
      jacZ[col2] = cross.z;

      for (let c = col0; c <= col2; c += 1) {
        const jx = jacX[c]!;
        const jy = jacY[c]!;
        const jz = jacZ[c]!;
        a00 += jx * jx;
        a01 += jx * jy;
        a02 += jx * jz;
        a11 += jy * jy;
        a12 += jy * jz;
        a22 += jz * jz;
      }
    }

    const solved = solveSymmetric3x3(a00, a01, a02, a11, a12, a22, ex, ey, ez);
    if (!solved) {
      lambda = Math.min(10, lambda * 4);
      continue;
    }

    const [y0, y1, y2] = solved;
    let maxStep = 0;
    for (let c = 0; c < dofCount; c += 1) {
      const step = jacX[c]! * y0 + jacY[c]! * y1 + jacZ[c]! * y2;
      delta[c] = step;
      const absStep = Math.abs(step);
      if (absStep > maxStep) maxStep = absStep;
    }

    // Escape collinear singular rest poses deterministically on the first stalled step.
    if (maxStep < 1e-7 && iter < 4 && activeCount >= 2) {
      const mid = Math.floor(activeCount / 2);
      const nudge = Math.min(0.08, limitRadians * 0.25);
      joints[mid]!.rx = clampAngle(joints[mid]!.rx + nudge, limitRadians);
      tipPos = evaluateChainFk(anchorPos, anchorQuat, joints, worldPos, baseQuat);
      error = tipPos.distanceTo(target);
      continue;
    }

    const scale = maxStep > 0.35 ? 0.35 / maxStep : 1;
    for (let i = 0; i < activeCount; i += 1) {
      const joint = joints[i]!;
      const c = i * 3;
      saved[c] = joint.rx;
      saved[c + 1] = joint.ry;
      saved[c + 2] = joint.rz;
      joint.rx = clampAngle(joint.rx + delta[c]! * scale, limitRadians);
      joint.ry = clampAngle(joint.ry + delta[c + 1]! * scale, limitRadians);
      joint.rz = clampAngle(joint.rz + delta[c + 2]! * scale, limitRadians);
    }

    const nextTip = evaluateChainFk(anchorPos, anchorQuat, joints, worldPos, baseQuat);
    const nextError = nextTip.distanceTo(target);
    if (nextError < error) {
      const improvement = error - nextError;
      tipPos = nextTip;
      error = nextError;
      lambda = Math.max(1e-4, lambda * 0.7);
      if (error <= convergeThreshold) {
        return { error, statuses: ["CONVERGED"] };
      }
      if (improvement < 1e-7 && iter > 12) {
        return { error, statuses: [error <= tolerance ? "CONVERGED" : "STALLED"] };
      }
    } else {
      for (let i = 0; i < activeCount; i += 1) {
        const joint = joints[i]!;
        const c = i * 3;
        joint.rx = saved[c]!;
        joint.ry = saved[c + 1]!;
        joint.rz = saved[c + 2]!;
      }
      lambda = Math.min(20, lambda * 2.5);
      if (lambda >= 20) {
        return { error, statuses: ["STALLED"] };
      }
    }
  }

  return { error, statuses: [error <= tolerance ? "CONVERGED" : "MAX_ITERATIONS"] };
}

/** Rotation-only chain solve on a derived GLB. Not an anatomical/full-body constraint solver. */
export async function processIkPose(
  io: WebIO,
  source: Uint8Array,
  options: Extract<SpecialistOptions, { kind: "ik" }>,
): Promise<{ artifacts: SpecialistArtifact[]; warnings: string[] }> {
  const document = await readSpecialistDocument(io, source);
  const root = document.getRoot();
  if (root.listAnimations().length)
    throw new SpecialistError(
      "unsupported",
      "Use a rigged GLB without animation clips so playback cannot overwrite the solved pose.",
    );
  const byName = (name: string): Node => {
    const matches = root.listNodes().filter((node) => node.getName() === name);
    if (matches.length !== 1)
      throw new SpecialistError(
        "invalid-input",
        "Choose a unique node name: " + name,
      );
    return matches[0]!;
  };
  const first = byName(options.rootName);
  const tip = byName(options.tipName);
  const chain: Node[] = [];
  for (let node: Node | null = tip; node; node = node.getParentNode()) {
    chain.unshift(node);
    if (node === first) break;
  }
  if (chain[0] !== first || chain.length < 3 || chain.length > 16)
    throw new SpecialistError(
      "unsupported",
      "Choose a root and descendant tip spanning 3 to 16 nodes.",
    );
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const parent = first.getParentNode();
  if (parent) matrix.fromArray(parent.getWorldMatrix());
  matrix.decompose(position, quaternion, scale);
  if (
    scale.distanceTo(new Vector3(1, 1, 1)) > 1e-5 ||
    chain.some((node) => node.getScale().some((n) => Math.abs(n - 1) > 1e-5))
  ) {
    throw new SpecialistError(
      "unsupported",
      "Bake scale before IK processing; the solver only accepts unit-scale chains.",
    );
  }

  const limit = (options.angleLimitDegrees * Math.PI) / 180;
  const joints: ChainJointState[] = chain.map((node) => ({
    restPos: new Vector3(...node.getTranslation()),
    restRot: new Quaternion().fromArray(node.getRotation()).normalize(),
    rx: 0,
    ry: 0,
    rz: 0,
  }));
  const target = new Vector3(...options.target);
  const { error, statuses } = solveBoundedRotationChain(
    position,
    quaternion,
    joints,
    target,
    limit,
    options.tolerance,
  );
  if (!Number.isFinite(error) || error > options.tolerance)
    throw new SpecialistError(
      "runtime",
      "The bounded IK solve did not reach the target. Adjust the target or joint limits.",
    );
  const rotations: { name: string; quaternion: number[] }[] = [];
  const deltaEuler = new Euler(0, 0, 0, "XYZ");
  const deltaQuat = new Quaternion();
  for (const [index, joint] of joints.entries()) {
    deltaEuler.set(joint.rx, joint.ry, joint.rz, "XYZ");
    deltaQuat.setFromEuler(deltaEuler);
    const rotation = new Quaternion()
      .fromArray(chain[index]!.getRotation())
      .multiply(deltaQuat)
      .normalize();
    if (!rotation.toArray().every(Number.isFinite))
      throw new SpecialistError("runtime", "Non-finite pose output.");
    chain[index]!.setRotation(rotation.toArray());
    rotations.push({
      name: chain[index]!.getName(),
      quaternion: rotation.toArray(),
    });
  }
  const restoredTip = new Vector3().setFromMatrixPosition(
    new Matrix4().fromArray(tip.getWorldMatrix()),
  );
  const roundTripError = restoredTip.distanceTo(target);
  if (roundTripError > options.tolerance)
    throw new SpecialistError(
      "runtime",
      "glTF pose projection differs from the solved chain.",
    );
  const artifact = await glbArtifact(io, document, "ik-pose.glb");
  const reopened = await io.readBinary(artifact.bytes);
  const reopenedTip = reopened
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === options.tipName);
  if (!reopenedTip)
    throw new SpecialistError(
      "runtime",
      "The exported pose lost the endpoint.",
    );
  const persistedError = new Vector3()
    .setFromMatrixPosition(
      new Matrix4().fromArray(reopenedTip.getWorldMatrix()),
    )
    .distanceTo(target);
  if (!Number.isFinite(persistedError) || persistedError > options.tolerance)
    throw new SpecialistError(
      "runtime",
      "Persisted GLB pose does not reach the requested target.",
    );
  const receipt = new TextEncoder().encode(
    JSON.stringify(
      {
        version: 1,
        sourceSha256: sha256(source),
        options,
        error,
        roundTripError,
        persistedError,
        solverStatuses: statuses,
        rotations,
        authority: "derived-glb-only",
      },
      null,
      2,
    ),
  );
  return {
    artifacts: [
      artifact,
      {
        name: "ik-pose.json",
        mime: "application/json",
        bytes: receipt,
        sha256: sha256(receipt),
      },
    ],
    warnings: [
      "This is a position-only rotation-chain solver with symmetric XYZ limits. It does not guarantee anatomical joint limits, body contact, self-collision, full-body balance or VRM compatibility. Source and editor poses remain unchanged.",
    ],
  };
}
