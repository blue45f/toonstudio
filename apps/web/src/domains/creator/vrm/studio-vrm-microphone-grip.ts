import { Quaternion, Vector3 } from "three";

import type { VrmPropHandSocket, VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { PropAnchorDef, PropHandBone } from "./studio-vrm-props";

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
  // The socket is halfway between wrist and middle MCP. Move to the distal palm and support
  // the cylinder on the soft pad, accounting for the avatar's measured bone-local scale.
  const localUnitsPerMetre = center.length() * 2 / (handSize / 1.15);
  const pad = Math.min(0.01, Math.max(0.003, handSize * 0.08));
  const normal = new Vector3(0, hand === "rightHand" ? -1 : 1, 0).applyQuaternion(basis);
  center.multiplyScalar(1.8).addScaledVector(normal, (anchor.gripRadius * scale + pad) * localUnitsPerMetre);
  // Measured socket +X points from the little finger toward the index on either hand.
  basis.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2)).normalize();
  return { position: [center.x, center.y, center.z], rotationQuaternion: [basis.x, basis.y, basis.z, basis.w], source: socket.source };
}
