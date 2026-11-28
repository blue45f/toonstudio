import { Color } from "three";

import {
  computeLightingUniforms,
  type EnvVariant,
  type LightingParams,
} from "./studio-vrm-poser-utils";

import type { StudioVrmLightingTone } from "./studio-vrm-scene-document";
import type * as THREE from "three";


export type LightingTone = StudioVrmLightingTone;

const HEMI_SKY_COLOR = "#fff8ef";
const STAGE_WALL_COLOR = "#2b2b32";

const LIGHT_RIGS = {
  morning: { amb: [0.68, "#ffffff"], d1: [1.32, "#ffffff"], d2: [0.54, "#f7d8c4"], d3: [0.42, "#cfdcff"] },
  sunset: { amb: [0.52, "#ffe8d6"], d1: [1.45, "#ffccac"], d2: [0.6, "#edac9c"], d3: [0.35, "#ffd2ac"] },
  night: { amb: [0.48, "#7684ad"], d1: [0.99, "#b6ccf3"], d2: [0.46, "#8d94c5"], d3: [0.52, "#b4a1da"] },
  studio: { amb: [0.82, "#ffffff"], d1: [1.5, "#ffffff"], d2: [0.66, "#ffffff"], d3: [0.72, "#ffffff"] },
} as const;

export function VrmLighting({
  tone,
  lighting,
  env,
  formStudy = false,
  envRootRef,
}: {
  tone: LightingTone;
  lighting?: LightingParams;
  env?: EnvVariant;
  formStudy?: boolean;
  /** Capture lease hides this group so subject-only inserts exclude floor/wall env. */
  envRootRef?: { current: THREE.Group | null };
}) {
  const li = lighting ? computeLightingUniforms(lighting) : null;
  const iMul = li ? li.intensity : 1;
  const col = li ? li.color : null;
  const dirPos = li ? [li.dir.x * 3.5, li.dir.y * 4, li.dir.z * 3.5] as const : [2.8, 4.2, 3.6] as const;

  const base = LIGHT_RIGS[tone];
  const ambI = base.amb[0] * iMul * 0.9 * (formStudy ? 0.68 : 1);
  const d1I = base.d1[0] * iMul * (formStudy ? 1.12 : 1);
  const d2I = base.d2[0] * iMul * 0.9 * (formStudy ? 0.82 : 1);
  const d3I = base.d3[0] * iMul * 0.8 * (formStudy ? 1.38 : 1);

  // 프리셋의 주광과 반사광 색을 보존한 채 선형 RGB에서 색온도를 곱한다.
  const temperature = col ? new Color(...col) : new Color(1, 1, 1);
  const c1 = new Color(base.d1[1]).multiply(temperature);
  const c2 = new Color(base.d2[1]).multiply(temperature);

  return (
    <>
      <ambientLight intensity={ambI} color={base.amb[1]} />
      <hemisphereLight
        intensity={(formStudy ? 0.26 : 0.16) * iMul}
        color={HEMI_SKY_COLOR}
        groundColor={tone === "night" ? "#1e2436" : "#566070"}
      />
      <directionalLight
        castShadow
        intensity={d1I}
        position={dirPos as [number,number,number]}
        color={c1}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.018}
        shadow-camera-near={0.5}
        shadow-camera-far={14}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={2.3}
        shadow-camera-bottom={-0.5}
      />
      <directionalLight intensity={d2I} position={[-3.2, 2.6, 2.1]} color={c2} />
      <directionalLight intensity={d3I} position={[-1.6, 3.4, -3.2]} color={base.d3[1]} />

      {/* Env variants (floor / wall / room / outdoor) — excluded from subject-only capture. */}
      <group ref={envRootRef}>
        {(env === "floor" || env === "room" || env === "outdoor") && (
          <mesh position={[0, -0.01, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 8]} />
            <meshStandardMaterial
              color={env === "outdoor" ? "#3a5f3a" : "#3a3a3f"}
              roughness={0.86}
              metalness={0}
            />
          </mesh>
        )}
        {(env === "wall" || env === "room") && (
          <>
            <mesh position={[0, 2.5, -2.8]} receiveShadow>
              <planeGeometry args={[6, 5]} />
              <meshStandardMaterial color={STAGE_WALL_COLOR} roughness={0.86} metalness={0} />
            </mesh>
            <mesh position={[0, 2.5, 2.8]} rotation={[0, Math.PI, 0]} receiveShadow>
              <planeGeometry args={[6, 5]} />
              <meshStandardMaterial color={STAGE_WALL_COLOR} roughness={0.86} metalness={0} />
            </mesh>
          </>
        )}
        {env === "room" && (
          <>
            <mesh position={[-3.2, 2.5, 0]} rotation={[0, Math.PI/2, 0]} receiveShadow>
              <planeGeometry args={[6, 5]} />
              <meshStandardMaterial color={STAGE_WALL_COLOR} roughness={0.86} metalness={0} />
            </mesh>
            <mesh position={[3.2, 2.5, 0]} rotation={[0, -Math.PI/2, 0]} receiveShadow>
              <planeGeometry args={[6, 5]} />
              <meshStandardMaterial color={STAGE_WALL_COLOR} roughness={0.86} metalness={0} />
            </mesh>
          </>
        )}
      </group>
    </>
  );
}
