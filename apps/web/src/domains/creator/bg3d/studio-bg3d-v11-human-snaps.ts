import type { Bg3dObjectClusterArchetypeId } from "./studio-bg3d-background-object-cluster";
import type {
  Bg3dHumanSnapPoint,
  Bg3dHumanSnapRole,
  Bg3dV11ScenePrimitive,
} from "./studio-bg3d-v11-upper-catalog";
import {
  cleanZero,
  computeV11PrimitiveWorldHalfExtents,
} from "./studio-bg3d-v11-geometry";

const ARCHETYPE_LOCAL_SNAPS: Readonly<
  Record<
    Bg3dObjectClusterArchetypeId,
    readonly {
      role: Bg3dHumanSnapRole;
      labelKo: string;
      localPos: [number, number, number];
      localForward: [number, number, number];
    }[]
  >
> = {
  "office-creator-workstation": [
    {
      role: "seat",
      labelKo: "워크스테이션 의자 배치 기준점",
      localPos: [0, 0.45, 0.58],
      localForward: [0, 0, -1],
    },
    {
      role: "desk-hands",
      labelKo: "모션데스크 양손 작업 기준점",
      localPos: [0, 0.76, 0.12],
      localForward: [0, 0, -1],
    },
  ],
  "classroom-front-locker-rig": [
    {
      role: "counter-rest",
      labelKo: "교탁 정면 강의 손짚기 기준점",
      localPos: [-0.52, 1.04, 0.42],
      localForward: [0, 0, 1],
    },
    {
      role: "lean-wall",
      labelKo: "후면 사물함 기대기 기준점",
      localPos: [0.85, 1.05, 0.36],
      localForward: [0, 0, 1],
    },
  ],
  "convenience-patio-street-furniture": [
    {
      role: "seat",
      labelKo: "파라솔 옆 의자 배치 기준점",
      localPos: [2.3, 0.45, -0.05],
      localForward: [1, 0, 0],
    },
    {
      role: "desk-hands",
      labelKo: "야외 원형 테이블 상판 기준점",
      localPos: [1.68, 0.765, -0.05],
      localForward: [0, 0, -1],
    },
  ],
  "subway-platform-gate-bay": [
    {
      role: "gate-pass",
      labelKo: "개찰구 카드 태그·통과 기준점",
      localPos: [0, 1.02, 0.25],
      localForward: [0, 0, -1],
    },
  ],
  "hospital-ward-corridor-set": [
    {
      role: "seat",
      labelKo: "병동 복도 대기석 착석점",
      localPos: [-0.35, 0.45, 0.38],
      localForward: [0, 0, 1],
    },
    {
      role: "lean-wall",
      labelKo: "병동 복도 핸드레일 기대기 기준점",
      localPos: [0.65, 1.02, 0.22],
      localForward: [0, 0, 1],
    },
  ],
  "alley-wall-utility-clutter": [
    {
      role: "lean-wall",
      labelKo: "골목 담벼락 기대기 기준점",
      localPos: [-0.45, 1.05, 0.48],
      localForward: [0, 0, 1],
    },
  ],
  "hanok-jangdokdae-stone-wall": [
    {
      role: "lean-wall",
      labelKo: "한옥 돌담 기대기 기준점",
      localPos: [0.6, 1.05, 0.52],
      localForward: [0, 0, 1],
    },
  ],
  "fantasy-dungeon-alchemy-props": [
    {
      role: "desk-hands",
      labelKo: "연금술 소품 선반 작업 기준점",
      localPos: [0, 0.82, 0.44],
      localForward: [0, 0, -1],
    },
  ],
};

export function resolveBg3dClusterHumanSnapPoints(params: {
  archetype: Bg3dObjectClusterArchetypeId;
  offsetXZ?: [number, number];
  yawDeg?: number;
  /** 조립 결과가 있으면 실제 가구 표면을 기준으로 접점을 보정한다. */
  primitives?: readonly Bg3dV11ScenePrimitive[];
}): Bg3dHumanSnapPoint[] {
  const [ox, oz] = params.offsetXZ ?? [0, 0];
  const yawRad = ((params.yawDeg ?? 0) * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  return ARCHETYPE_LOCAL_SNAPS[params.archetype].flatMap((snap, idx) => {
    const wx = ox + snap.localPos[0] * cosY + snap.localPos[2] * sinY;
    const wz = oz - snap.localPos[0] * sinY + snap.localPos[2] * cosY;
    const nx = snap.localForward[0] * cosY + snap.localForward[2] * sinY;
    const nz = -snap.localForward[0] * sinY + snap.localForward[2] * cosY;
    const point: Bg3dHumanSnapPoint = {
      id: `snap-${params.archetype}-${idx + 1}`,
      role: snap.role,
      labelKo: snap.labelKo,
      worldPosition: [cleanZero(wx), snap.localPos[1], cleanZero(wz)],
      forwardNormal: [
        cleanZero(Number(nx.toFixed(4))),
        snap.localForward[1],
        cleanZero(Number(nz.toFixed(4))),
      ],
    };
    const name =
      snap.role === "desk-hands"
        ? params.archetype === "office-creator-workstation"
          ? "MotionDesk_Walnut_Slab"
          : params.archetype === "convenience-patio-street-furniture"
            ? "Patio_Round_Table"
            : "Grimoire_Row_Lower"
        : snap.role === "counter-rest"
          ? "Teacher_Oak_Podium"
          : snap.role === "seat" &&
              params.archetype === "hospital-ward-corridor-set"
            ? "Ward_Seat_2"
            : null;
    const surface = name
      ? params.primitives?.find((p) => p.name?.startsWith(name))
      : undefined;
    if (params.primitives !== undefined) {
      if (name && !surface) return [];
      if (
        params.archetype === "convenience-patio-street-furniture"
        && snap.role === "seat"
        && !params.primitives.some((p) => p.name?.startsWith("Patio_Parasol_Canopy"))
      ) return [];
    }
    if (surface) {
      const [, hy] = computeV11PrimitiveWorldHalfExtents(
        surface.kind,
        surface.scale,
        surface.rotation,
      );
      point.worldPosition = [
        surface.position[0],
        cleanZero(surface.position[1] + hy),
        surface.position[2],
      ];
    }
    return [point];
  });
}
