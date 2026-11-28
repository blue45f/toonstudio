import { Matrix4, Quaternion, Vector3 } from "three";

import { microphoneGripSocket } from "./studio-vrm-microphone-grip";

import type { VrmPropHandSocket, VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { PropAnchorDef, PropHandBone } from "./studio-vrm-props";

type GripSocket = Pick<VrmPropHandSocket, "position" | "rotationQuaternion" | "source">;

/** 실측 손바닥의 엄지 방향(X), 법선(Y), 손목에서 중지로 향하는 축(Z)으로 새 장착점을 잡는다. */
export function measuredPropGripSocket(
  propId: string, anchor: PropAnchorDef, hand: PropHandBone | null, metrics: VrmPropRigMetrics, scale: number,
): GripSocket | null {
  if (propId === "mic") return microphoneGripSocket(propId, anchor, hand, metrics, scale);
  const mug = propId === "mug" && anchor.id === "handle-grip";
  const book = propId === "book" && anchor.id === "cover-grip";
  if (!hand || (!mug && !book)) return null;
  const socket = metrics.handSockets[hand];
  if (socket.source !== "measured") return null;

  const sign = hand === "rightHand" ? -1 : 1;
  const basis = new Quaternion(...socket.rotationQuaternion).normalize();
  const center = new Vector3(...socket.position);
  const palmLength = center.length() * 2;
  const handSize = hand === "rightHand" ? metrics.rightHand : metrics.leftHand;
  const unitsPerMeter = palmLength / (handSize / 1.15);
  const x = new Vector3();
  const y = new Vector3();
  const z = new Vector3();
  const offset = new Vector3();

  if (mug) {
    // 컵 입구는 손목 쪽, 컵 몸통은 검지 쪽에 두고 손잡이만 중지 안쪽으로 끼운다.
    y.set(0.19, -sign * 0.2, -1).normalize();
    x.set(-0.48, sign * 0.88, 0);
    z.crossVectors(x, y).normalize();
    x.crossVectors(y, z);
    offset.set(-0.04 * palmLength, sign * 0.046 * scale * unitsPerMeter, 0.48 * palmLength);
  } else {
    // 책등은 첫 마디, 양쪽 표지는 엄지와 나머지 네 손가락 사이에 놓인다.
    x.set(0, 0, 1);
    z.set(0.22, sign * 0.89, -0.4).normalize();
    y.crossVectors(z, x).normalize();
    x.crossVectors(y, z);
    offset.set(0, sign * 0.0195 * scale * unitsPerMeter, 0.63 * palmLength);
  }
  center.add(offset.applyQuaternion(basis));
  basis.multiply(new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z)));
  return { position: [center.x, center.y, center.z], rotationQuaternion: [basis.x, basis.y, basis.z, basis.w], source: socket.source };
}
