import { Box3, Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import { gripIntersectsBody, bookSolids, gripBodySurface, turnGripBodySurface, type GripBodySurface, type GripBodyCollisionSolid } from "./studio-vrm-grip-body-surface";
import { mugCollisionSolid } from "./studio-vrm-mug-collision-shape";
import { solveTwoBoneTarget } from "../studio-rig-two-bone-ik";
import { NATURAL_IDLE_POSES } from "../studio-pose-presets";
import { applyVrmTwoBoneGrip, createVrmTwoBoneGripState, releaseVrmTwoBoneGripState } from "./studio-vrm-prop-ik";
import { usesDefaultFittedThumbGrip } from "./studio-vrm-microphone-grip";
import { createAutoGripFingerOverrides, resolvePropAttachment } from "./studio-vrm-prop-rig";
import { propDefById, type PropInstance } from "./studio-vrm-props";
import type { VRM } from "@pixiv/three-vrm";
import type { Object3D } from "three";
import type { VrmPropRigMetrics } from "./studio-vrm-prop-rig";

function supportsIdleGrip(item: PropInstance) {
  return item.propId === "book" || item.propId === "mug";
}

export function idleGripClearanceItems(items: readonly PropInstance[], metrics: VrmPropRigMetrics, poseId?: string) {
  if (!items.some(supportsIdleGrip) || !NATURAL_IDLE_POSES.some(pose => pose.id === poseId)) return [];
  const authority = createAutoGripFingerOverrides(items, propDefById, metrics);
  return items.filter(item => supportsIdleGrip(item) && usesDefaultFittedThumbGrip(item, metrics)
    && Boolean(authority[item.bone === "leftHand" ? "leftIndexProximal" : "rightIndexProximal"]));
}

export function createIdleGripBodyClearance(vrm: VRM, item: PropInstance, metrics: VrmPropRigMetrics, root: Object3D, locked: readonly string[]) {
  const side = item.bone === "leftHand" ? "left" : "right";
  const names = [`${side}UpperArm`, `${side}LowerArm`, `${side}Hand`] as const;
  if (names.some(name => locked.includes(name)) || !usesDefaultFittedThumbGrip(item, metrics) || !supportsIdleGrip(item)) return null;
  const hand = vrm.humanoid.getNormalizedBoneNode(names[2]);
  const upper = vrm.humanoid.getNormalizedBoneNode(names[0]), lower = vrm.humanoid.getNormalizedBoneNode(names[1]);
  const leg = vrm.humanoid.getNormalizedBoneNode(`${side}UpperLeg`);
  const other = vrm.humanoid.getNormalizedBoneNode(side === "left" ? "rightUpperLeg" : "leftUpperLeg");
  const hips = vrm.humanoid.getNormalizedBoneNode("hips"), spine = vrm.humanoid.getNormalizedBoneNode("spine");
  const def = propDefById(item.propId);
  if (!hand || !upper || !lower || !leg || !other || !hips || !spine || !def) return null;
  const fit = resolvePropAttachment(def, item, metrics);
  const mug = item.propId === "mug";
  let solids: GripBodyCollisionSolid[] | null = null;
  const rig = { hand, upper, lower, leg, other, hips, spine };
  const rotation = new Quaternion().setFromEuler(new Euler(...fit.rotationDeg.map(MathUtils.degToRad)));
  const size = new Vector3().setScalar(fit.scale);
  const state = createVrmTwoBoneGripState();
  const basis = new Matrix4(), comparison = new Matrix4();
  const key = () => {
    hips.updateWorldMatrix(true, false);
    basis.copy(hips.matrixWorld).invert();
    return [hand, leg, other].flatMap(bone => {
      bone.updateWorldMatrix(true, false);
      return [...comparison.multiplyMatrices(basis, bone.matrixWorld).elements];
    }).concat(hips.getWorldScale(new Vector3()).toArray());
  };
  let previous: number[] | null = null;
  let pending: Generator<void> | null = null;
  const matches = (pose: number[]) => previous?.every((value, i) => Math.abs(value - pose[i]!) < 1e-7);
  const release = () => { pending = null; previous = null; return releaseVrmTwoBoneGripState(state); };
  function* solve() {
    solids ??= mug ? yield* mugCollisionSolid(root) : yield* bookSolids(root);
    if (!solids.length) return;
    const shapes = solids;
    const { hand, upper, lower, leg, other, hips, spine } = rig;
    const wrist = hand.getWorldPosition(new Vector3()), wristRotation = hand.getWorldQuaternion(new Quaternion());
    const orientation = wristRotation.clone().multiply(rotation), inverseRotation = orientation.clone().invert();
    const origin = hand.localToWorld(new Vector3(...fit.socketPosition)).sub(new Vector3(...fit.anchor.position).multiplyScalar(fit.scale).applyQuaternion(orientation));
    const inverseGrip = new Matrix4().compose(origin, orientation, size).invert();
    const bounds = shapes.reduce((box, solid) => box.union(solid.bounds), new Box3());
    const maxShift = metrics.avatarHeight * 0.22 / fit.scale;
    const surface = yield* gripBodySurface(vrm, inverseGrip, bounds.expandByScalar(maxShift), mug);
    const offset = new Vector3();
    if (!(yield* gripIntersectsBody(surface, shapes, offset))) return;
    const up = spine.getWorldPosition(new Vector3()).sub(hips.getWorldPosition(new Vector3())).normalize();
    const outward = leg.getWorldPosition(new Vector3()).sub(other.getWorldPosition(new Vector3()));
    outward.addScaledVector(up, -outward.dot(up)).normalize();
    if (outward.lengthSq() < 0.9 || up.lengthSq() < 0.9) return;
    const forward = up.clone().cross(outward).normalize();
    const shoulder = upper.getWorldPosition(new Vector3()), elbow = lower.getWorldPosition(new Vector3());
    function reachableTarget(axis: Vector3, distance: number) {
      const requested = wrist.clone().addScaledVector(axis, distance * fit.scale);
      return solveTwoBoneTarget(shoulder, elbow, wrist, requested, elbow)?.end ?? wrist;
    }
    const gripPivot = wrist.clone().applyMatrix4(inverseGrip);
    const orientedFaces = (turn: Quaternion) => turnGripBodySurface(surface, gripPivot,
      inverseRotation.clone().multiply(turn.clone().invert()).multiply(orientation));
    type Solution = { axis: Vector3; distance: number; turn: Quaternion; faces: GripBodySurface };
    const best: { score: number; solution?: Solution } = { score: Infinity };
    function* tryDirection(axis: Vector3, turn: Quaternion, angle: number, candidates: GripBodySurface) {
      const gripInverse = inverseRotation.clone().multiply(turn.clone().invert());
      const occupied = (distance: number) => gripIntersectsBody(candidates, shapes, offset.copy(reachableTarget(axis, distance))
        .sub(wrist).applyQuaternion(gripInverse).divideScalar(fit.scale));
      const turnCost = Math.abs(angle) * metrics.hand * 0.6;
      const ceiling = Math.min(maxShift, (best.score - turnCost) / fit.scale);
      if (ceiling <= 0) return;
      let lo = 0, hi = Math.min(0.008 / fit.scale, ceiling);
      while (hi < ceiling && (yield* occupied(hi))) { lo = hi; hi = Math.min(ceiling, hi * 2); }
      if (yield* occupied(hi)) return;
      while (hi - lo > 0.001 / fit.scale) {
        const mid = 0.5 * (lo + hi);
        if (yield* occupied(mid)) lo = mid; else hi = mid;
      }
      const score = hi * fit.scale + turnCost;
      if (score < best.score) { best.score = score; best.solution = { axis, distance: hi, turn, faces: candidates }; }
    }
    const identity = new Quaternion();
    for (const lift of [0, 0.55, 1.5]) for (const yaw of [0, 40, -40, 75, -75]) {
      const angle = MathUtils.degToRad(yaw);
      const axis = outward.clone().multiplyScalar(Math.cos(angle)).addScaledVector(forward, Math.sin(angle)).addScaledVector(up, lift).normalize();
      yield* tryDirection(axis, identity, 0, surface);
    }
    const alternative = best.solution?.axis ?? outward;
    // 몸에서 멀리 뻗어야 할 때만 손목을 조금 돌려 더 가까운 탈출 방향을 비교한다.
    if (!mug && best.score > metrics.hand * 0.48) {
      for (const pivotAxis of [up, forward]) for (const sign of [1, -1]) {
        const angle = sign * Math.PI / 9;
        const turn = new Quaternion().setFromAxisAngle(pivotAxis, angle);
        const candidates = yield* orientedFaces(turn);
        if (!(yield* gripIntersectsBody(candidates, shapes, offset.set(0, 0, 0)))) {
          let lo = 0, hi = Math.abs(angle);
          while (hi - lo > MathUtils.degToRad(1)) {
            const mid = 0.5 * (lo + hi);
            const trial = new Quaternion().setFromAxisAngle(pivotAxis, mid * sign);
            if (yield* gripIntersectsBody(yield* orientedFaces(trial), shapes, offset)) lo = mid; else hi = mid;
          }
          const score = hi * metrics.hand * 0.6;
          if (score < best.score) {
            best.score = score;
            turn.setFromAxisAngle(pivotAxis, hi * sign);
            best.solution = { axis: outward, distance: 0, turn, faces: yield* orientedFaces(turn) };
          }
        } else {
          yield* tryDirection(alternative, turn, angle, candidates);
          yield* tryDirection(outward, turn, angle, candidates);
        }
      }
    }
    const chosen = best.solution;
    if (!chosen) return;
    const targetRotation = chosen.turn.clone().multiply(wristRotation);
    const gripInverse = inverseRotation.clone().multiply(chosen.turn.clone().invert());
    const target = chosen.distance ? reachableTarget(chosen.axis, chosen.distance + 0.001 / fit.scale) : wrist.clone();
    let clear = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!applyVrmTwoBoneGrip(vrm, side, target, 1, undefined, { targetQuaternion: targetRotation, state })) break;
      const actual = hand.getWorldPosition(new Vector3()).sub(wrist).applyQuaternion(gripInverse).divideScalar(fit.scale);
      const check = gripIntersectsBody(chosen.faces, shapes, actual);
      let result = check.next();
      while (!result.done) result = check.next();
      if (!result.value) { clear = true; break; }
      target.addScaledVector(chosen.axis, 0.004);
    }
    if (!clear) releaseVrmTwoBoneGripState(state);
  }
  function runUntil(deadline: number) {
    const pose = key();
    if (!pose.every(Number.isFinite)) { release(); return true; }
    if (!matches(pose)) {
      release();
      previous = key();
      pending = solve();
    }
    while (pending && (deadline === Infinity || performance.now() < deadline)) {
      if (pending.next().done) { pending = null; previous = key(); }
    }
    return !pending;
  }
  return { release, runUntil, run: () => { runUntil(Infinity); } };
}
