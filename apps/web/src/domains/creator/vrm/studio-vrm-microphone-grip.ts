import { Quaternion, Vector3 } from "three";

import type { VrmPropHandSocket, VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { PropAnchorDef, PropHandBone, PropInstance } from "./studio-vrm-props";

type GripSocket = Pick<VrmPropHandSocket, "position" | "rotationQuaternion" | "source">;

/** Fit the microphone's +Y shaft across the curled fingers; the original primary anchor stays readable. */
export function microphoneGripSocket(
  propId: string,
  anchor: PropAnchorDef,
  hand: PropHandBone | null,
  metrics: VrmPropRigMetrics,
  scale: number,
): GripSocket | null {
  if (propId !== "mic" || anchor.id !== "palm-grip" || !hand) return null;
  const socket = metrics.handSockets[hand];
  if (socket.source !== "measured" || !anchor.gripRadius) return null;

  const basis = new Quaternion(...socket.rotationQuaternion).normalize();
  const center = new Vector3(...socket.position);
  const handSize = hand === "rightHand" ? metrics.rightHand : metrics.leftHand;
  // Place the barrel against the flexed fingers, with its center offset from the palm bone
  // by skin thickness and the handle diameter. A half-radius setback leaves room at the knuckles.
  const localUnitsPerMetre = center.length() * 2 / (handSize / 1.15);
  const radius = anchor.gripRadius * scale;
  const pad = Math.min(0.01, Math.max(0.003, handSize * 0.08));
  const normalSign = hand === "rightHand" ? -1 : 1;
  const normal = new Vector3(0, normalSign, 0).applyQuaternion(basis);
  const forward = new Vector3(0, 0, 1).applyQuaternion(basis);
  center.multiplyScalar(1.8)
    .addScaledVector(normal, (2 * radius + pad) * localUnitsPerMetre)
    .addScaledVector(forward, -0.5 * radius * localUnitsPerMetre);

  // Both hands point the grille toward the index. The small diagonal follows the crease
  // between the thumb web and the little finger rather than crossing the palm perpendicularly.
  const diagonal = Math.tan(8 * Math.PI / 180);
  const shaft = new Vector3(-normalSign * diagonal, 1, -diagonal).normalize();
  basis.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2))
    .multiply(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), shaft)).normalize();
  return { position: [center.x, center.y, center.z], rotationQuaternion: [basis.x, basis.y, basis.z, basis.w], source: socket.source };
}

export function usesDefaultMicrophoneThumbGrip(item: PropInstance, metrics: VrmPropRigMetrics): boolean {
  const rig = item.rig;
  const bone = item.bone;
  return item.propId === "mic" && (bone === "rightHand" || bone === "leftHand")
    && metrics.handSockets[bone].source === "measured" && rig?.anchorId === "palm-grip"
    && rig.mode === "auto" && rig.autoScale && rig.autoFingerPose && rig.gripFit === 1
    && rig.deltaScale === 1 && rig.deltaPosition.every(value => value === 0)
    && rig.deltaRotationDeg.every(value => value === 0);
}
