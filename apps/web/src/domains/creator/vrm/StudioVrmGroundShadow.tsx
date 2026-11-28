import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { MathUtils, Vector3, Vector4 } from "three";

import type { VRM } from "@pixiv/three-vrm";
import type { Mesh, Object3D } from "three";

const vertexShader = `
  varying vec2 groundPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    groundPosition = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = `
  varying vec2 groundPosition;
  uniform vec4 leftPrint;
  uniform vec4 rightPrint;
  uniform vec4 softness;
  float contact(vec4 footprint, float width, float weight) {
    vec2 axis = footprint.zw - footprint.xy;
    vec2 local = groundPosition - footprint.xy;
    float along = clamp(dot(local, axis) / max(dot(axis, axis), 0.000001), 0.0, 1.0);
    vec2 offset = (local - along * axis) / max(width, 0.0001);
    float radius2 = dot(offset, offset);
    return weight * (0.21 * exp(-2.5 * radius2) + 0.12 * exp(-0.48 * radius2));
  }
  void main() {
    float left = contact(leftPrint, softness.x, softness.y);
    float right = contact(rightPrint, softness.z, softness.w);
    gl_FragColor = vec4(vec3(0.0), 1.0 - (1.0 - left) * (1.0 - right));
  }
`;

type Foot = { ankle: Object3D | null; toes: Object3D | null; knee: Object3D | null };

/** 뼈대의 현재 발 위치와 높이를 한 장의 투명 바닥에 투영한다. 공중에 든 발은 부드럽게 사라진다. */
export function StudioVrmGroundShadow({ vrm, groundRef }: {
  readonly vrm: VRM;
  readonly groundRef: { current: Mesh | null };
}) {
  const feet = useMemo(() => {
    const foot = (side: "left" | "right"): Foot => ({
      ankle: vrm.humanoid.getRawBoneNode(`${side}Foot`),
      toes: vrm.humanoid.getRawBoneNode(`${side}Toes`),
      knee: vrm.humanoid.getRawBoneNode(`${side}LowerLeg`),
    });
    return [foot("left"), foot("right")] as const;
  }, [vrm]);
  const state = useMemo(() => ({
    ankle: new Vector3(), toes: new Vector3(), knee: new Vector3(),
    uniforms: {
      leftPrint: { value: new Vector4() }, rightPrint: { value: new Vector4() },
      softness: { value: new Vector4(0, 0, 0, 0) },
    },
  }), []);

  useFrame(() => {
    const mesh = groundRef.current;
    if (!mesh || !mesh.visible) return;
    const { ankle, toes, knee, uniforms } = state;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [index, foot] of feet.entries()) {
      const channel = index * 2;
      const softness = uniforms.softness.value;
      softness.setComponent(channel + 1, 0);
      if (!foot.ankle) continue;
      foot.ankle.getWorldPosition(ankle);
      if (foot.toes) foot.toes.getWorldPosition(toes);
      else toes.copy(ankle);
      const shinLength = foot.knee ? foot.knee.getWorldPosition(knee).distanceTo(ankle) : 0;
      const length = Math.max(0.04, shinLength * 0.36, ankle.distanceTo(toes));
      const aboveGround = Math.max(0, Math.min(ankle.y, toes.y) - length * (foot.toes ? 0.18 : 0.55));
      const weight = 1 - MathUtils.smoothstep(aboveGround, 0, length * 2.8);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      const radius = length * 0.52 + aboveGround * 0.28;
      const footprint = index === 0 ? uniforms.leftPrint.value : uniforms.rightPrint.value;
      footprint.set(ankle.x, ankle.z, toes.x, toes.z);
      softness.setComponent(channel, radius);
      softness.setComponent(channel + 1, weight);
      const margin = radius * 3.5;
      minX = Math.min(minX, ankle.x - margin, toes.x - margin);
      maxX = Math.max(maxX, ankle.x + margin, toes.x + margin);
      minZ = Math.min(minZ, ankle.z - margin, toes.z - margin);
      maxZ = Math.max(maxZ, ankle.z + margin, toes.z + margin);
    }
    if (Number.isFinite(minX)) {
      mesh.position.set((minX + maxX) / 2, 0.002, (minZ + maxZ) / 2);
      mesh.scale.set(maxX - minX, maxZ - minZ, 1);
    }
  });

  return (
    <mesh ref={groundRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={state.uniforms}
        transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
