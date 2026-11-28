import { Matrix4, Quaternion, Vector3 } from "three";

import { fitBookCoverToHand } from "./studio-vrm-book-cover-grip";
import { microphoneGripSocket } from "./studio-vrm-microphone-grip";

import type { VrmPropHandSocket, VrmPropRigMetrics } from "./studio-vrm-prop-rig";
import type { PropAnchorDef, PropHandBone } from "./studio-vrm-props";

type GripSocket = Pick<VrmPropHandSocket, "position" | "rotationQuaternion" | "source">;

/** 손바닥 중심을 원점으로, 검지·중지 첫 마디 사이의 고리 중심을 손 로컬 단위로 구한다. */
function mugHandleOpening(hand: PropHandBone, metrics: VrmPropRigMetrics, palmLength: number) {
  const side = hand === "rightHand" ? "right" : "left";
  const bones = metrics.boneWorldPositions;
  const wrist = bones[hand];
  const index = bones[`${side}IndexProximal`];
  const middle = bones[`${side}MiddleProximal`];
  const little = bones[`${side}LittleProximal`];
  const indexJoint = bones[`${side}IndexIntermediate`];
  const middleJoint = bones[`${side}MiddleIntermediate`];
  if (!wrist || !index || !middle || !little || !indexJoint || !middleJoint) return null;

  const wristPoint = new Vector3(...wrist);
  const indexPoint = new Vector3(...index);
  const middlePoint = new Vector3(...middle);
  const forward = middlePoint.clone().sub(wristPoint);
  const worldPalmLength = forward.length();
  const firstJointLength = (indexPoint.distanceTo(new Vector3(...indexJoint))
    + middlePoint.distanceTo(new Vector3(...middleJoint))) / 2;
  if (worldPalmLength < 1e-4 || firstJointLength < 1e-4) return null;
  forward.normalize();
  const across = indexPoint.clone().sub(new Vector3(...little));
  across.addScaledVector(forward, -across.dot(forward));
  if (across.lengthSq() < 1e-8) return null;
  across.normalize();
  const normal = forward.clone().cross(across);
  // (검지 + 중지)/2에서 소켓 원점 (손목 + 중지)/2를 뺀 거리.
  const midpointFromPalm = indexPoint.sub(wristPoint).multiplyScalar(0.5);
  const towardPalm = side === "right" ? -1 : 1;
  const unitsPerMeter = palmLength / worldPalmLength;
  const center = new Vector3(
    midpointFromPalm.dot(across),
    midpointFromPalm.dot(normal) + towardPalm * firstJointLength * 0.23,
    midpointFromPalm.dot(forward) + firstJointLength * 0.1,
  ).multiplyScalar(unitsPerMeter);
  // 손등의 기울기가 다른 리그에서도 입구가 손목 쪽을 향하도록 아래팔의 정렬을 반영한다.
  // 아래팔이 더하는 기울기를 약 12도까지로 제한해 손목을 굽혀도 장착점이 안정되게 한다.
  const cupUp = new Vector3(0.2, -towardPalm * 0.09, -1);
  const elbow = bones[`${side}LowerArm`];
  if (elbow) {
    const forearm = new Vector3(...elbow).sub(wristPoint).normalize();
    const lateral = new Vector3(forearm.dot(across), forearm.dot(normal), 0);
    cupUp.add(lateral.clampLength(0, 0.2));
  }
  return { center, cupUp: cupUp.normalize(), unitsPerMeter };
}

/** 실측 손바닥의 엄지 방향(X), 법선(Y), 손목에서 중지로 향하는 축(Z)으로 새 장착점을 잡는다. */
export function measuredPropGripSocket(
  propId: string, anchor: PropAnchorDef, hand: PropHandBone | null, metrics: VrmPropRigMetrics, scale: number, autoFit: boolean,
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
    const opening = autoFit ? mugHandleOpening(hand, metrics, palmLength) : null;
    if (opening) {
      y.copy(opening.cupUp);
      // 고리의 바깥쪽을 손바닥 안으로 조금 돌려 굽힌 손끝이 닿게 한다.
      x.set(-1, sign * 0.14, 0);
    } else {
      y.set(0.19, -sign * 0.2, -1).normalize();
      x.set(-0.48, sign * 0.88, 0);
    }
    z.crossVectors(x, y).normalize();
    x.crossVectors(y, z);
    if (opening) {
      // 원본 GLB에서 손잡이 중심은 x=45mm, 장착점은 바깥쪽 고리 위에 있다.
      offset.copy(opening.center).addScaledVector(x, (anchor.position[0] - 0.045) * scale * opening.unitsPerMeter);
    } else {
      offset.set(-0.04 * palmLength, sign * 0.046 * scale * unitsPerMeter, 0.48 * palmLength);
    }
  } else {
    // 책등은 첫 마디, 양쪽 표지는 엄지와 나머지 네 손가락 사이에 놓인다.
    x.set(0, 0, 1);
    z.set(0.22, sign * 0.89, -0.4).normalize();
    y.crossVectors(z, x).normalize();
    x.crossVectors(y, z);
    offset.set(0, sign * 0.0195 * scale * unitsPerMeter, 0.63 * palmLength);
    if (autoFit) fitBookCoverToHand(hand, metrics, unitsPerMeter, scale, offset, x, y, z);
  }
  center.add(offset.applyQuaternion(basis));
  basis.multiply(new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z)));
  return { position: [center.x, center.y, center.z], rotationQuaternion: [basis.x, basis.y, basis.z, basis.w], source: socket.source };
}
