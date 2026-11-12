/**
 * 파라메트릭 3D 배경 오브젝트·생활감 소품 클러스터 조형 엔진 (`studio-bg3d-background-object-cluster.ts`).
 *
 * 배경 3D 전용 범위:
 * - 캐릭터·데생인형·브러시 모듈과 완전히 독립된 순수 배경 오브젝트 합성기다.
 * - `makeGeometry`의 단위 메시 치수(`cylinder` 지름 0.6, `cone` 지름 0.8, `torus` 1.1×1.1×0.3) 보정,
 *   Three.js 기본 오일러 `'XYZ'` 월드 Y축 회전 행렬 합성(짐벌락 방지), 회전 OBB 기준 바닥 접지(`minY === 0`),
 *   장면 문서 v3 정규화 계약(`STUDIO_BG3D_TAG_MAX_CODE_POINTS = 32`, `normalizedRotation` `[-π, π)` 래핑)과
 *   1:1 일치하는 무손실 필드 출력 및 반복 삽입 비중첩·고유 ID 생성을 보장한다.
 */

import type { BgPrimitive, BgPrimitiveKind } from "../studio-background-3d-metadata";

export type Bg3dObjectClusterArchetypeId =
  | "alley-wall-utility-clutter"
  | "classroom-front-locker-rig"
  | "office-creator-workstation"
  | "convenience-patio-street-furniture"
  | "subway-platform-gate-bay"
  | "hospital-ward-corridor-set"
  | "hanok-jangdokdae-stone-wall"
  | "fantasy-dungeon-alchemy-props";

export type Bg3dObjectClutterDensity = "essential" | "detailed" | "lived-in";
export type Bg3dObjectClusterArrangement = "linear-wall" | "l-corner" | "staggered-street";
export type Bg3dObjectSurfaceTheme = "daylight-neutral" | "weathered-urban" | "night-glow" | "warm-wood";

export interface Bg3dObjectClusterArchetypeMeta {
  readonly id: Bg3dObjectClusterArchetypeId;
  readonly shortCode: string;
  readonly labelKo: string;
  readonly genreTagKo: string;
  readonly descriptionKo: string;
  readonly v10GlbAssetId: string;
  readonly keywordsKo: readonly string[];
}

export interface Bg3dObjectClusterSpec {
  readonly archetype: Bg3dObjectClusterArchetypeId;
  readonly moduleCount: number;
  readonly clutterDensity: Bg3dObjectClutterDensity;
  readonly arrangement: Bg3dObjectClusterArrangement;
  readonly surfaceTheme: Bg3dObjectSurfaceTheme;
  readonly anchorOffsetXZ?: readonly [number, number];
  /** 반복 삽입 시 노드 ID 충돌을 막는 선택 인스턴스 토큰 (`[A-Za-z0-9._~-]`). */
  readonly instanceKey?: string;
}

export interface Bg3dObjectClusterBuildResult {
  readonly archetype: Bg3dObjectClusterArchetypeId;
  readonly labelKo: string;
  readonly primitives: readonly BgPrimitive[];
  readonly partCount: number;
  readonly estimatedLineArtEdges: number;
  readonly monotonyReliefScore: number;
  readonly footprintMeters: readonly [number, number, number];
  readonly anchorOffsetXZ: readonly [number, number];
  readonly summaryKo: string;
}

export interface Bg3dPrimitivesWorldBoundsSummary {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly size: readonly [number, number, number];
}

export const STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES: readonly Bg3dObjectClusterArchetypeMeta[] = Object.freeze([
  {
    id: "alley-wall-utility-clutter", shortCode: "alley", labelKo: "골목 2단 실외기·가스배관 세트", genreTagKo: "현대·스릴러",
    descriptionKo: "앵글 브래킷 2단 실외기·도시가스 계량기·동관/배수 파이프·차단 밸브를 벽면에 밀착 배치해요.",
    v10GlbAssetId: "kitbash-v10-alley-ac-meter-pipe-wall-v10",
    keywordsKo: Object.freeze(["골목", "실외기", "에어컨", "가스계량기", "배관", "파이프", "스릴러", "느와르"]),
  },
  {
    id: "classroom-front-locker-rig", shortCode: "class", labelKo: "교실 와이드 칠판·교탁·사물함", genreTagKo: "학원·청춘",
    descriptionKo: "웨인스코팅 벽체·녹색 칠판·분필받이·교탁·3×3 철제 사물함과 벽시계를 한 번에 구성해요.",
    v10GlbAssetId: "kitbash-v10-classroom-podium-locker-wall-v10",
    keywordsKo: Object.freeze(["교실", "학교", "칠판", "교탁", "사물함", "로커", "시계", "학원물"]),
  },
  {
    id: "office-creator-workstation", shortCode: "desk", labelKo: "작업실 모션데스크·액정태블릿", genreTagKo: "오피스·일상",
    descriptionKo: "전동 데스크·기울임 펜 디스플레이·서브 모니터 암·타공판 선반·데스크 램프·스피커를 배치해요.",
    v10GlbAssetId: "kitbash-v10-creator-dual-monitor-desk-v10",
    keywordsKo: Object.freeze(["작업실", "오피스", "책상", "모션데스크", "액정태블릿", "모니터", "컴퓨터", "스피커"]),
  },
  {
    id: "convenience-patio-street-furniture", shortCode: "street", labelKo: "도심 분리수거함·입간판·볼라드", genreTagKo: "일상·스트리트",
    descriptionKo: "캐노피 3색 분리수거 스테이션·원목 A보드 카페 입간판·반사띠 볼라드로 보도블록을 채워요.",
    v10GlbAssetId: "kitbash-v10-street-recycling-station-a-board-v10",
    keywordsKo: Object.freeze(["거리", "도심", "분리수거", "쓰레기통", "입간판", "카페", "볼라드", "파라솔"]),
  },
  {
    id: "subway-platform-gate-bay", shortCode: "subway", labelKo: "지하철 개찰구·플랩 게이트 베이", genreTagKo: "도시·액션",
    descriptionKo: "스테인리스 개찰구 하우징·교통카드 단말기·강화유리 플랩·점자 유도 타일 통로를 생성해요.",
    v10GlbAssetId: "kitbash-v10-subway-turnstile-gate-set-v10",
    keywordsKo: Object.freeze(["지하철", "역사", "개찰구", "게이트", "교통카드", "점자블록", "플랫폼", "도시"]),
  },
  {
    id: "hospital-ward-corridor-set", shortCode: "ward", labelKo: "병원 복도 대기석·수액 폴대 세트", genreTagKo: "메디컬·드라마",
    descriptionKo: "복도 범퍼레일 벽체·3인용 대기 벤치·5발 이동식 IV 수액 폴대·진료 호출 모니터를 조합해요.",
    v10GlbAssetId: "kitbash-v10-hospital-corridor-station-v10",
    keywordsKo: Object.freeze(["병원", "병동", "복도", "대기석", "벤치", "수액", "링거", "모니터", "메디컬"]),
  },
  {
    id: "hanok-jangdokdae-stone-wall", shortCode: "hanok", labelKo: "한옥 기와담장·장독대·석등 마당", genreTagKo: "사극·무협·전통",
    descriptionKo: "암수키와 토담·2단 장대석 단상·배흘림 옹기 독 군락·사각 화강암 석등으로 전통 마당을 꾸며요.",
    v10GlbAssetId: "kitbash-v10-hanok-jangdokdae-courtyard-v10",
    keywordsKo: Object.freeze(["한옥", "전통", "사극", "무협", "기와", "담장", "장독대", "옹기", "항아리", "석등"]),
  },
  {
    id: "fantasy-dungeon-alchemy-props", shortCode: "alchemy", labelKo: "마탑 고딕 아치 서가·포션·촛대", genreTagKo: "로판·판타지",
    descriptionKo: "황동 아치 고목 서가·마도서 묶음·발광 엘릭서 플라스크·3구 스탠드 촛대로 실내 밀도를 높여요.",
    v10GlbAssetId: "kitbash-v10-fantasy-alchemy-bookshelf-rack-v10",
    keywordsKo: Object.freeze(["판타지", "로판", "마탑", "서가", "책장", "마도서", "포션", "연금술", "촛대"]),
  },
]);

/** 검색어로 8종 배경 오브젝트 클러스터 아키타입을 필터링한다 (한/영 키워드·장르·설명 매칭). */
export function searchStudioBg3dObjectClusterArchetypes(query: string): readonly Bg3dObjectClusterArchetypeMeta[] {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES;
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  return STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.filter((item) => {
    const haystack = [item.id, item.shortCode, item.labelKo, item.genreTagKo, item.descriptionKo, item.v10GlbAssetId, ...item.keywordsKo]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR");
    return tokens.every((token) => haystack.includes(token));
  });
}

/** 반복 배치 시 외곽 크기에 비례해 겹치지 않는 XZ 앵커 오프셋을 계산한다 (첫 배치는 `[0, 0]`). */
export function computeBg3dClusterNonOverlappingOffsetXZ(
  placementOrdinal: number,
  footprintMeters: readonly [number, number, number],
  gapMeters = 0.8,
): readonly [number, number] {
  const safeOrd = Math.max(0, Math.floor(placementOrdinal));
  if (safeOrd === 0) return [0, 0];
  const col = safeOrd % 4;
  const row = Math.floor(safeOrd / 4);
  const stepX = Math.max(1.6, footprintMeters[0] + gapMeters);
  const stepZ = Math.max(1.4, footprintMeters[2] + gapMeters);
  return [round4(col * stepX), round4(row * stepZ)];
}

let clusterInstanceSequence = 0;

function randomBase36Token(length: number): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % 36]!).join("");
  }
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * 36)]!;
  return out;
}

/** 저장 후 재불러오기·탭 재마운트·다중 패널 마운트에서도 기존 노드 ID와 충돌하지 않는 인스턴스 키를 만든다. */
export function createBg3dClusterUniqueInstanceKey(prefix = "c"): string {
  clusterInstanceSequence = (clusterInstanceSequence + 1) % 1_679_616;
  const safePrefix = prefix.replace(/[^a-z0-9]/giu, "").toLowerCase().slice(0, 3) || "c";
  return `${safePrefix}${clusterInstanceSequence.toString(36)}-${randomBase36Token(5)}`;
}

/** 기존 장면 도형 수와 클러스터 파츠 수로부터 소수 기존 도형·부분 삭제에서도 겹치지 않는 배치 순번을 계산한다. */
export function resolveBg3dClusterPlacementOrdinal(
  existingCount: number,
  partCount: number,
  usedOrdinals?: Set<number>,
): number {
  const safeExisting = Math.max(0, Math.floor(existingCount));
  const safeParts = Math.max(1, Math.floor(partCount));
  let ord = safeExisting > 0 ? Math.floor((safeExisting - 1) / safeParts) + 1 : 0;
  if (usedOrdinals) {
    while (usedOrdinals.has(ord)) ord += 1;
    usedOrdinals.add(ord);
  }
  return ord;
}

interface ThemePalette {
  readonly base: string;
  readonly metal: string;
  readonly wood: string;
  readonly accent: string;
  readonly glow: string;
  readonly dark: string;
}

const SURFACE_THEMES: Readonly<Record<Bg3dObjectSurfaceTheme, ThemePalette>> = Object.freeze({
  "daylight-neutral": { base: "#e2e0d8", metal: "#94a3b8", wood: "#8b5a36", accent: "#0284c7", glow: "#38bdf8", dark: "#1e293b" },
  "weathered-urban": { base: "#cbd5e1", metal: "#64748b", wood: "#6b442a", accent: "#d97706", glow: "#fbbf24", dark: "#0f172a" },
  "night-glow": { base: "#334155", metal: "#475569", wood: "#452c1e", accent: "#06b6d4", glow: "#22d3ee", dark: "#090d16" },
  "warm-wood": { base: "#ede4d5", metal: "#a8a29e", wood: "#9a5b32", accent: "#2f6f5e", glow: "#fde68a", dark: "#292524" },
});

function round4(n: number): number {
  const r = Math.round(n * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** `studio-bg3d-scene-document.ts`의 `normalizedRotation`과 동일한 IEEE-754 `[-π, π)` 정본 각도로 맞춘다. */
function canonicalizeSceneRotationAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const out = wrapped - Math.PI;
  return Object.is(out, -0) ? 0 : out;
}

function sanitizeInstanceKey(raw: string | undefined): string {
  return raw ? raw.replace(/[^A-Za-z0-9._~-]/gu, "").slice(0, 20) : "";
}

function rotateXZ(x: number, z: number, yawRad: number): readonly [number, number] {
  if (Math.abs(yawRad) < 1e-7) return [x, z];
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return [x * c + z * s, -x * s + z * c];
}

/** `makeGeometry(kind)`의 단위 메시 전체 크기 `[baseX, baseY, baseZ]`. */
export function unitMeshFullSizeForKind(kind: BgPrimitiveKind): readonly [number, number, number] {
  switch (kind) {
    case "cylinder":
    case "tube":
      return [0.6, 1.0, 0.6];
    case "cone":
      return [0.8, 1.0, 0.8];
    case "torus":
      return [1.1, 1.1, 0.3];
    case "capsule":
      return [0.6, 1.3, 0.6];
    case "plane":
    case "ring":
      return [1.0, 0.002, 1.0];
    default:
      return [1.0, 1.0, 1.0];
  }
}

/** Three.js 기본 오일러 `'XYZ'`(`L = Rx * Ry * Rz`) 로컬 회전에 월드 Y축 회전(`Ry(yaw)`)을 좌측 곱셈해 정규 오일러를 돌려준다. */
export function composeWorldYawWithLocalEulerXyz(
  localRot: readonly [number, number, number],
  yawRad: number,
): [number, number, number] {
  const [rx, ry, rz] = localRot;
  if (Math.abs(yawRad) < 1e-7) {
    return [
      canonicalizeSceneRotationAngle(rx),
      canonicalizeSceneRotationAngle(ry),
      canonicalizeSceneRotationAngle(rz),
    ];
  }
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);

  const l00 = c * e;
  const l01 = -c * f;
  const l02 = d;
  const l11 = a * e - b * f * d;
  const l12 = -b * c;
  const l20 = b * f - a * e * d;
  const l21 = b * e + a * f * d;
  const l22 = a * c;

  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const m00 = cy * l00 + sy * l20;
  const m01 = cy * l01 + sy * l21;
  const m02 = cy * l02 + sy * l22;
  const m11 = l11;
  const m12 = l12;
  const m21 = -sy * l01 + cy * l21;
  const m22 = -sy * l02 + cy * l22;

  const sinY = clamp(m02, -1, 1);
  const outY = Math.asin(sinY);
  const outX = Math.abs(sinY) < 0.9999995 ? Math.atan2(-m12, m22) : Math.atan2(m21, m11);
  const outZ = Math.abs(sinY) < 0.9999995 ? Math.atan2(-m01, m00) : 0;
  return [
    canonicalizeSceneRotationAngle(outX),
    canonicalizeSceneRotationAngle(outY),
    canonicalizeSceneRotationAngle(outZ),
  ];
}

function rotateVecEulerXyz(
  vx: number,
  vy: number,
  vz: number,
  rot: readonly [number, number, number],
): readonly [number, number, number] {
  const [rx, ry, rz] = rot;
  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  return [
    c * e * vx - c * f * vy + d * vz,
    (a * f + b * e * d) * vx + (a * e - b * f * d) * vy - b * c * vz,
    (b * f - a * e * d) * vx + (b * e + a * f * d) * vy + a * c * vz,
  ];
}

/** `makeGeometry(kind)`와 `scale`·`rotation`을 모두 반영한 정확한 월드 축 정렬 반크기 `[hx, hy, hz]`. */
export function computePrimitiveWorldHalfExtents(
  kind: BgPrimitiveKind,
  rotation: readonly [number, number, number],
  scale: readonly [number, number, number],
): readonly [number, number, number] {
  const [ux, uy, uz] = unitMeshFullSizeForKind(kind);
  const hx = Math.abs(ux * 0.5 * scale[0]);
  const hy = Math.abs(uy * 0.5 * scale[1]);
  const hz = Math.abs(uz * 0.5 * scale[2]);
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const ox of [-1, 1] as const) {
    for (const oy of [-1, 1] as const) {
      for (const oz of [-1, 1] as const) {
        const [wx, wy, wz] = rotateVecEulerXyz(hx * ox, hy * oy, hz * oz, rotation);
        maxX = Math.max(maxX, Math.abs(wx));
        maxY = Math.max(maxY, Math.abs(wy));
        maxZ = Math.max(maxZ, Math.abs(wz));
      }
    }
  }
  return [maxX, maxY, maxZ];
}

/** 배치된 `BgPrimitive[]` 묶음 전체의 월드 AABB(`min`, `max`, `size`)를 계산한다. */
export function measureBg3dPrimitivesWorldBounds(primitives: readonly BgPrimitive[]): Bg3dPrimitivesWorldBoundsSummary {
  if (primitives.length === 0) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
  let [minX, minY, minZ, maxX, maxY, maxZ] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const prim of primitives) {
    const [hx, hy, hz] = computePrimitiveWorldHalfExtents(prim.kind, prim.rotation, prim.scale);
    minX = Math.min(minX, prim.position[0] - hx);
    maxX = Math.max(maxX, prim.position[0] + hx);
    minY = Math.min(minY, prim.position[1] - hy);
    maxY = Math.max(maxY, prim.position[1] + hy);
    minZ = Math.min(minZ, prim.position[2] - hz);
    maxZ = Math.max(maxZ, prim.position[2] + hz);
  }
  return {
    min: [round4(minX), round4(minY), round4(minZ)],
    max: [round4(maxX), round4(maxY), round4(maxZ)],
    size: [round4(maxX - minX), round4(maxY - minY), round4(maxZ - minZ)],
  };
}

interface LocalPart {
  readonly suffix: string;
  readonly name: string;
  readonly kind: BgPrimitiveKind;
  readonly pos: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rawScale?: readonly [number, number, number];
  readonly color: string;
  readonly rot?: readonly [number, number, number];
}

function resolvePartScale(part: LocalPart): readonly [number, number, number] {
  if (part.rawScale) return [round4(part.rawScale[0]), round4(part.rawScale[1]), round4(part.rawScale[2])];
  const [ux, uy, uz] = unitMeshFullSizeForKind(part.kind);
  return [round4(part.size[0] / ux), round4(part.size[1] / uy), round4(part.size[2] / uz)];
}

function buildSingleModuleParts(
  archetype: Bg3dObjectClusterArchetypeId,
  density: number,
  pal: ThemePalette,
): { readonly spanX: number; readonly parts: readonly LocalPart[] } {
  const parts: LocalPart[] = [];

  switch (archetype) {
    case "alley-wall-utility-clutter": {
      parts.push(
        { suffix: "rack-l", name: "Angle_Rack_Post_L", kind: "box", pos: [-0.48, 0.88, 0], size: [0.05, 1.76, 0.48], color: pal.metal },
        { suffix: "rack-r", name: "Angle_Rack_Post_R", kind: "box", pos: [0.48, 0.88, 0], size: [0.05, 1.76, 0.48], color: pal.metal },
        { suffix: "ac-low", name: "AC_Condenser_Lower", kind: "box", pos: [0, 0.45, 0.02], size: [0.86, 0.56, 0.38], color: pal.base },
        { suffix: "fan-low", name: "AC_Fan_Shroud_Lower", kind: "torus", pos: [-0.14, 0.45, 0.22], size: [0.38, 0.38, 0.06], color: pal.dark },
        { suffix: "ac-high", name: "AC_Condenser_Upper", kind: "box", pos: [0, 1.26, 0.02], size: [0.86, 0.56, 0.38], color: pal.base },
        { suffix: "fan-high", name: "AC_Fan_Shroud_Upper", kind: "torus", pos: [-0.14, 1.26, 0.22], size: [0.38, 0.38, 0.06], color: pal.dark },
        { suffix: "gas-meter", name: "CityGas_Meter_Box", kind: "box", pos: [0.74, 1.28, -0.04], size: [0.28, 0.34, 0.18], color: pal.metal },
        { suffix: "gas-pipe", name: "Gas_Riser_Pipe", kind: "cylinder", pos: [0.68, 0.92, -0.06], size: [0.05, 1.84, 0.05], color: "#eab308" },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "copper-pipe", name: "Coolant_Copper_Line", kind: "cylinder", pos: [0.55, 0.86, -0.08], size: [0.04, 1.72, 0.04], color: "#b45309" },
          { suffix: "valve", name: "Gas_Shutoff_Valve", kind: "box", pos: [0.68, 0.98, 0.02], size: [0.11, 0.04, 0.06], color: "#dc2626" },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "crate", name: "Alley_Utility_Crate", kind: "box", pos: [0.76, 0.22, 0.16], size: [0.38, 0.44, 0.34], color: pal.accent },
          { suffix: "conduit-box", name: "Wall_Junction_Box", kind: "box", pos: [-0.72, 1.42, -0.05], size: [0.24, 0.34, 0.14], color: pal.metal },
        );
      }
      return { spanX: 1.85, parts };
    }

    case "classroom-front-locker-rig": {
      parts.push(
        { suffix: "wall", name: "Classroom_Front_Wall", kind: "box", pos: [0, 1.28, -0.36], size: [3.6, 2.56, 0.12], color: pal.base },
        { suffix: "wainscot", name: "Wood_Wainscot_Base", kind: "box", pos: [0, 0.40, -0.34], size: [3.62, 0.80, 0.14], color: pal.wood },
        { suffix: "board", name: "Wide_Chalkboard", kind: "box", pos: [-0.52, 1.48, -0.28], size: [2.28, 1.12, 0.05], color: "#1f4d3a" },
        { suffix: "tray", name: "Chalk_Ledge_Rail", kind: "box", pos: [-0.52, 0.90, -0.22], size: [2.34, 0.04, 0.12], color: pal.metal },
        { suffix: "podium", name: "Teacher_Oak_Podium", kind: "box", pos: [-0.52, 0.52, 0.32], size: [0.84, 1.04, 0.54], color: pal.wood },
        { suffix: "locker-body", name: "Student_Locker_Bank", kind: "box", pos: [1.24, 0.90, -0.10], size: [1.08, 1.80, 0.44], color: pal.metal },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "clock", name: "Classroom_Wall_Clock", kind: "cylinder", pos: [-0.52, 2.26, -0.28], size: [0.32, 0.05, 0.32], color: "#f8fafc", rot: [Math.PI / 2, 0, 0] },
          { suffix: "eraser", name: "Chalk_Eraser", kind: "box", pos: [-0.15, 0.94, -0.20], size: [0.16, 0.05, 0.07], color: pal.accent },
          { suffix: "mic", name: "Podium_Gooseneck_Mic", kind: "cylinder", pos: [-0.34, 1.18, 0.42], size: [0.03, 0.28, 0.03], color: pal.dark, rot: [-0.25, 0, 0] },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "broom-cabinet", name: "Cleaning_Tool_Locker", kind: "box", pos: [-1.88, 0.90, -0.12], size: [0.44, 1.80, 0.42], color: pal.metal },
          { suffix: "top-plant", name: "Locker_Top_Planter", kind: "sphere", pos: [1.38, 1.94, -0.08], size: [0.34, 0.28, 0.34], color: "#2f855a" },
        );
      }
      return { spanX: 3.85, parts };
    }

    case "office-creator-workstation": {
      parts.push(
        { suffix: "leg-l", name: "MotionDesk_Leg_L", kind: "box", pos: [-0.68, 0.37, 0], size: [0.08, 0.74, 0.62], color: pal.dark },
        { suffix: "leg-r", name: "MotionDesk_Leg_R", kind: "box", pos: [0.68, 0.37, 0], size: [0.08, 0.74, 0.62], color: pal.dark },
        { suffix: "top", name: "MotionDesk_Walnut_Slab", kind: "box", pos: [0, 0.76, 0], size: [1.64, 0.04, 0.78], color: pal.wood },
        { suffix: "pen-disp", name: "Pen_Display_24in", kind: "box", pos: [-0.10, 0.92, 0.08], size: [0.58, 0.34, 0.04], color: pal.glow, rot: [-0.62, 0, 0] },
        { suffix: "sub-arm", name: "Monitor_Arm_Post", kind: "cylinder", pos: [-0.54, 1.08, -0.28], size: [0.05, 0.62, 0.05], color: pal.dark },
        { suffix: "sub-mon", name: "Reference_Monitor", kind: "box", pos: [-0.42, 1.28, -0.16], size: [0.52, 0.32, 0.03], color: pal.dark, rot: [0, 0.26, 0] },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "pegboard", name: "Desk_Pegboard_Back", kind: "box", pos: [0.46, 1.05, -0.34], size: [0.56, 0.54, 0.03], color: pal.base },
          { suffix: "lamp-post", name: "Desk_LED_Stand_Arm", kind: "cylinder", pos: [0.12, 1.10, -0.24], size: [0.03, 0.64, 0.03], color: pal.dark },
          { suffix: "lamp-bar", name: "Desk_LED_TaskBar", kind: "box", pos: [-0.08, 1.42, -0.02], size: [0.44, 0.03, 0.04], color: pal.glow },
          { suffix: "spk-l", name: "Studio_Speaker_L", kind: "box", pos: [-0.70, 0.89, -0.18], size: [0.13, 0.22, 0.16], color: pal.dark },
          { suffix: "spk-r", name: "Studio_Speaker_R", kind: "box", pos: [0.70, 0.89, -0.18], size: [0.13, 0.22, 0.16], color: pal.dark },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "pc-tower", name: "Workstation_PC_Case", kind: "box", pos: [0.96, 0.24, -0.06], size: [0.23, 0.48, 0.46], color: pal.dark },
          { suffix: "stylus-cup", name: "Brass_Stylus_Holder", kind: "cylinder", pos: [0.30, 0.83, 0.16], size: [0.08, 0.10, 0.08], color: "#d97706" },
        );
      }
      return { spanX: 2.25, parts };
    }

    case "convenience-patio-street-furniture": {
      parts.push(
        { suffix: "pad", name: "Recycle_Shelter_Pad", kind: "box", pos: [-0.32, 0.03, 0], size: [1.66, 0.06, 0.78], color: pal.dark },
        { suffix: "post-l", name: "Recycle_Shelter_Post_L", kind: "box", pos: [-1.06, 0.76, -0.26], size: [0.06, 1.46, 0.06], color: pal.dark },
        { suffix: "post-r", name: "Recycle_Shelter_Post_R", kind: "box", pos: [0.42, 0.76, -0.26], size: [0.06, 1.46, 0.06], color: pal.dark },
        { suffix: "canopy", name: "Recycle_Sloped_Canopy", kind: "box", pos: [-0.32, 1.48, 0], size: [1.64, 0.06, 0.82], color: pal.dark, rot: [0.18, 0, 0] },
        { suffix: "bin-1", name: "Recycle_Bin_Plastic", kind: "box", pos: [-0.82, 0.54, 0], size: [0.42, 0.96, 0.48], color: "#2563eb" },
        { suffix: "bin-2", name: "Recycle_Bin_Glass", kind: "box", pos: [-0.32, 0.54, 0], size: [0.42, 0.96, 0.48], color: "#16a34a" },
        { suffix: "bin-3", name: "Recycle_Bin_Can", kind: "box", pos: [0.18, 0.54, 0], size: [0.42, 0.96, 0.48], color: "#d97706" },
        { suffix: "aboard", name: "Cafe_Wood_ABoard", kind: "box", pos: [0.84, 0.48, 0.10], size: [0.52, 0.96, 0.36], color: pal.wood, rot: [0, -0.22, 0] },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "bollard-l", name: "Reflective_Bollard_L", kind: "cylinder", pos: [-1.10, 0.39, 0.42], size: [0.14, 0.78, 0.14], color: pal.dark },
          { suffix: "bollard-r", name: "Reflective_Bollard_R", kind: "cylinder", pos: [1.28, 0.39, 0.42], size: [0.14, 0.78, 0.14], color: pal.dark },
        );
      }
      if (density >= 3) {
        parts.push(
          { suffix: "patio-tbl", name: "Patio_Round_Table", kind: "cylinder", pos: [1.68, 0.74, -0.05], size: [0.76, 0.05, 0.76], color: pal.base },
          { suffix: "patio-pole", name: "Patio_Parasol_Pole", kind: "cylinder", pos: [1.68, 1.05, -0.05], size: [0.06, 2.10, 0.06], color: pal.metal },
          { suffix: "parasol", name: "Patio_Parasol_Canopy", kind: "cone", pos: [1.68, 2.12, -0.05], size: [1.55, 0.42, 1.55], color: pal.accent },
        );
      }
      return { spanX: 3.15, parts };
    }

    case "subway-platform-gate-bay": {
      parts.push(
        { suffix: "deck", name: "Station_Floor_Base", kind: "box", pos: [0, 0.03, 0], size: [1.68, 0.06, 1.56], color: pal.dark },
        { suffix: "gate-l", name: "Turnstile_Pedestal_L", kind: "box", pos: [-0.46, 0.53, 0], size: [0.26, 0.94, 1.38], color: pal.metal },
        { suffix: "gate-r", name: "Turnstile_Pedestal_R", kind: "box", pos: [0.46, 0.53, 0], size: [0.26, 0.94, 1.38], color: pal.metal },
        { suffix: "flap-l", name: "Barrier_Flap_L", kind: "box", pos: [-0.19, 0.54, 0.05], size: [0.24, 0.66, 0.03], color: "#ef4444" },
        { suffix: "flap-r", name: "Barrier_Flap_R", kind: "box", pos: [0.19, 0.54, 0.05], size: [0.24, 0.66, 0.03], color: "#ef4444" },
        { suffix: "reader-l", name: "NFC_Card_Pad_L", kind: "cylinder", pos: [-0.46, 1.02, 0.52], size: [0.14, 0.04, 0.14], color: pal.glow },
        { suffix: "reader-r", name: "NFC_Card_Pad_R", kind: "cylinder", pos: [0.46, 1.02, 0.52], size: [0.14, 0.04, 0.14], color: pal.glow },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "tactile", name: "Tactile_Guide_Strip", kind: "box", pos: [0, 0.068, 0.58], size: [1.20, 0.016, 0.28], color: "#eab308" },
          { suffix: "portal-l", name: "Gate_Portal_Post_L", kind: "box", pos: [-0.74, 1.24, -0.35], size: [0.06, 2.36, 0.06], color: pal.dark },
          { suffix: "portal-r", name: "Gate_Portal_Post_R", kind: "box", pos: [0.74, 1.24, -0.35], size: [0.06, 2.36, 0.06], color: pal.dark },
          { suffix: "sign", name: "Hanging_Station_Sign", kind: "box", pos: [0, 2.34, -0.35], size: [1.54, 0.32, 0.08], color: pal.accent },
        );
      }
      if (density >= 3) {
        parts.push({ suffix: "fire-hydrant", name: "Station_Fire_Cabinet", kind: "box", pos: [1.05, 0.62, -0.45], size: [0.42, 1.24, 0.22], color: "#dc2626" });
      }
      return { spanX: 2.35, parts };
    }

    case "hospital-ward-corridor-set": {
      parts.push(
        { suffix: "wall", name: "Ward_Corridor_Wall", kind: "box", pos: [0, 1.04, -0.36], size: [2.36, 2.08, 0.12], color: pal.base },
        { suffix: "bumper", name: "Ward_Handrail_Bumper", kind: "box", pos: [0, 0.88, -0.28], size: [2.38, 0.14, 0.05], color: pal.accent },
        { suffix: "bench-leg-l", name: "Waiting_Bench_Leg_L", kind: "box", pos: [-0.84, 0.19, 0.02], size: [0.08, 0.38, 0.42], color: pal.dark },
        { suffix: "bench-leg-r", name: "Waiting_Bench_Leg_R", kind: "box", pos: [0.28, 0.19, 0.02], size: [0.08, 0.38, 0.42], color: pal.dark },
        { suffix: "beam", name: "Waiting_Bench_Beam", kind: "box", pos: [-0.28, 0.38, 0.02], size: [1.66, 0.08, 0.14], color: pal.dark },
        { suffix: "seat-1", name: "Ward_Seat_1", kind: "box", pos: [-0.84, 0.58, -0.02], size: [0.48, 0.40, 0.44], color: "#4fd1c5" },
        { suffix: "seat-2", name: "Ward_Seat_2", kind: "box", pos: [-0.28, 0.58, -0.02], size: [0.48, 0.40, 0.44], color: "#4fd1c5" },
        { suffix: "seat-3", name: "Ward_Seat_3", kind: "box", pos: [0.28, 0.58, -0.02], size: [0.48, 0.40, 0.44], color: "#4fd1c5" },
        { suffix: "iv-pole", name: "Mobile_IV_Stand", kind: "cylinder", pos: [0.92, 0.90, 0.08], size: [0.05, 1.76, 0.05], color: pal.metal },
        { suffix: "iv-base", name: "IV_Caster_Base", kind: "cylinder", pos: [0.92, 0.04, 0.08], size: [0.46, 0.08, 0.46], color: pal.dark },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "iv-bag", name: "Saline_Fluid_Bag", kind: "box", pos: [0.84, 1.56, 0.08], size: [0.11, 0.22, 0.05], color: pal.glow },
          { suffix: "monitor", name: "Queue_Display_Board", kind: "box", pos: [-0.28, 1.52, -0.27], size: [0.94, 0.54, 0.05], color: pal.glow },
        );
      }
      if (density >= 3) {
        parts.push({ suffix: "sanitizer", name: "Hand_Sanitizer_Unit", kind: "box", pos: [0.48, 1.28, -0.26], size: [0.14, 0.26, 0.10], color: "#f8fafc" });
      }
      return { spanX: 2.45, parts };
    }

    case "hanok-jangdokdae-stone-wall": {
      parts.push(
        { suffix: "wall", name: "Hanok_Courtyard_Wall", kind: "box", pos: [0, 0.78, -0.68], size: [2.84, 1.56, 0.28], color: pal.base },
        { suffix: "giwa-cap", name: "Giwa_Roof_Coping", kind: "triangularPrism", pos: [0, 1.63, -0.68], size: [2.96, 0.28, 0.56], rawScale: [0.56, 2.96, 0.28], color: pal.dark, rot: [-Math.PI / 2, 0, Math.PI / 2] },
        { suffix: "tier-1", name: "Jangdok_Stone_Tier1", kind: "box", pos: [-0.26, 0.09, 0.04], size: [2.08, 0.18, 1.20], color: pal.metal },
        { suffix: "tier-2", name: "Jangdok_Stone_Tier2", kind: "box", pos: [-0.26, 0.27, -0.20], size: [1.84, 0.18, 0.58], color: pal.metal },
        { suffix: "jar-1", name: "Onggi_Large_Jar_1", kind: "sphere", pos: [-0.78, 0.65, -0.20], size: [0.48, 0.62, 0.48], color: "#4a2511" },
        { suffix: "jar-2", name: "Onggi_Large_Jar_2", kind: "sphere", pos: [-0.26, 0.67, -0.20], size: [0.52, 0.66, 0.52], color: "#5c2e14" },
        { suffix: "jar-3", name: "Onggi_Large_Jar_3", kind: "sphere", pos: [0.26, 0.63, -0.20], size: [0.46, 0.58, 0.46], color: "#4a2511" },
        { suffix: "lantern", name: "Granite_Stone_Lantern", kind: "box", pos: [1.06, 0.52, 0.12], size: [0.36, 1.04, 0.36], color: pal.metal },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "jar-sm-1", name: "Onggi_Medium_Jar_1", kind: "sphere", pos: [-0.56, 0.38, 0.32], size: [0.36, 0.44, 0.36], color: "#5c2e14" },
          { suffix: "jar-sm-2", name: "Onggi_Medium_Jar_2", kind: "sphere", pos: [-0.04, 0.38, 0.32], size: [0.36, 0.44, 0.36], color: "#4a2511" },
          { suffix: "lantern-glow", name: "Lantern_Light_Core", kind: "box", pos: [1.06, 0.84, 0.12], size: [0.22, 0.18, 0.22], color: pal.glow },
        );
      }
      if (density >= 3) {
        parts.push({ suffix: "lantern-cap", name: "Lantern_Pyramid_Cap", kind: "pyramid", pos: [1.06, 1.15, 0.12], size: [0.48, 0.22, 0.48], color: pal.dark });
      }
      return { spanX: 3.05, parts };
    }

    case "fantasy-dungeon-alchemy-props": {
      parts.push(
        { suffix: "shelf-body", name: "Gothic_Bookshelf_Frame", kind: "box", pos: [-0.18, 1.06, 0], size: [1.54, 2.12, 0.44], color: pal.wood },
        { suffix: "arch", name: "Ornate_Brass_Arch", kind: "torus", pos: [-0.18, 2.08, 0], size: [1.36, 0.68, 0.08], color: "#d97706" },
        { suffix: "tomes-1", name: "Grimoire_Row_Lower", kind: "box", pos: [-0.32, 0.74, 0.04], size: [1.12, 0.28, 0.28], color: "#7f1d1d" },
        { suffix: "tomes-2", name: "Grimoire_Row_Mid", kind: "box", pos: [-0.46, 1.24, 0.04], size: [0.76, 0.28, 0.28], color: "#1e3a8a" },
        { suffix: "potion-1", name: "Mana_Potion_Flask", kind: "sphere", pos: [0.12, 1.18, 0.06], size: [0.16, 0.18, 0.16], color: pal.glow },
        { suffix: "potion-2", name: "Vitality_Elixir_Flask", kind: "sphere", pos: [0.32, 1.18, 0.06], size: [0.16, 0.18, 0.16], color: "#ec4899" },
        { suffix: "candelabra-base", name: "Candelabra_Disc_Base", kind: "cylinder", pos: [0.86, 0.03, 0.08], size: [0.36, 0.06, 0.36], color: "#d97706" },
        { suffix: "candelabra", name: "Brass_Stand_Candelabra", kind: "cylinder", pos: [0.86, 0.71, 0.08], size: [0.08, 1.36, 0.08], color: "#d97706" },
      );
      if (density >= 2) {
        parts.push(
          { suffix: "flame", name: "Beeswax_Candle_Glow", kind: "cone", pos: [0.86, 1.48, 0.08], size: [0.16, 0.18, 0.16], color: "#fbbf24" },
          { suffix: "tomes-3", name: "Grimoire_Row_Upper", kind: "box", pos: [-0.22, 1.72, 0.04], size: [0.88, 0.26, 0.26], color: "#4c1d95" },
        );
      }
      if (density >= 3) {
        parts.push({ suffix: "chest", name: "Arcane_Relic_Chest", kind: "box", pos: [0.88, 0.22, -0.32], size: [0.58, 0.44, 0.38], color: pal.wood });
      }
      return { spanX: 2.15, parts };
    }
  }
}

/** 선택된 아키타입·모듈 수·밀도·배치 대형에 맞춰 배경 전용 다중 파츠 오브젝트 클러스터를 생성한다. */
export function buildBg3dObjectClusterPrimitives(rawSpec: Bg3dObjectClusterSpec): Bg3dObjectClusterBuildResult {
  const modules = clamp(Math.round(rawSpec.moduleCount), 1, 4);
  const densityNum = rawSpec.clutterDensity === "lived-in" ? 3 : rawSpec.clutterDensity === "detailed" ? 2 : 1;
  const pal = SURFACE_THEMES[rawSpec.surfaceTheme];
  const [anchorX, anchorZ] = rawSpec.anchorOffsetXZ ?? [0, 0];
  const safeKey = sanitizeInstanceKey(rawSpec.instanceKey);
  const meta =
    STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES.find((item) => item.id === rawSpec.archetype) ??
    STUDIO_BG3D_OBJECT_CLUSTER_ARCHETYPES[0]!;

  const { spanX, parts: baseParts } = buildSingleModuleParts(rawSpec.archetype, densityNum, pal);
  // STUDIO_BG3D_TAG_MAX_CODE_POINTS(32자) 상한 안에서 아키타입별 고유 태그와 V10 공통 태그를 코드 유닛 순으로 고정한다.
  const canonicalTags = Object.freeze([`BgCluster_${meta.shortCode}`, "BgObject_Cluster_V10"].sort());

  interface StagedPrim {
    readonly id: string;
    readonly name: string;
    readonly kind: BgPrimitiveKind;
    readonly wx: number;
    readonly wy: number;
    readonly wz: number;
    readonly rot: [number, number, number];
    readonly scale: [number, number, number];
    readonly half: readonly [number, number, number];
    readonly color: string;
  }

  const staged: StagedPrim[] = [];
  const halfCornerTurn = Math.ceil(modules / 2);

  for (let m = 0; m < modules; m++) {
    let modOffsetX = (m - (modules - 1) * 0.5) * (spanX + 0.18);
    let modOffsetZ = 0;
    let yaw = 0;

    if (rawSpec.arrangement === "l-corner" && m >= halfCornerTurn) {
      const idxInCorner = m - halfCornerTurn;
      modOffsetX = (halfCornerTurn - 0.5) * (spanX * 0.65) + 0.35;
      modOffsetZ = (idxInCorner + 0.65) * (spanX + 0.18);
      yaw = -Math.PI / 2;
    } else if (rawSpec.arrangement === "staggered-street") {
      modOffsetZ = (m % 2 === 0 ? -1 : 1) * 0.45;
    }

    for (const part of baseParts) {
      const [rx, rz] = rotateXZ(part.pos[0], part.pos[2], yaw);
      const scale = resolvePartScale(part);
      const rot = composeWorldYawWithLocalEulerXyz(part.rot ?? [0, 0, 0], yaw);
      const mutableScale: [number, number, number] = [scale[0], scale[1], scale[2]];
      const half = computePrimitiveWorldHalfExtents(part.kind, rot, mutableScale);
      const wx = round4(anchorX + modOffsetX + rx);
      const wy = Math.max(half[1], part.pos[1]);
      const wz = round4(anchorZ + modOffsetZ + rz);
      const idCore = safeKey ? `${meta.shortCode}-${safeKey}` : meta.shortCode;

      staged.push({
        id: `bgobj-v10-${idCore}-m${m + 1}-${part.suffix}`,
        name: `${part.name}_${m + 1}`,
        kind: part.kind,
        wx,
        wy,
        wz,
        rot,
        scale: mutableScale,
        half,
        color: part.color.toLowerCase(),
      });
    }
  }

  let rawMinY = Infinity;
  for (const item of staged) rawMinY = Math.min(rawMinY, item.wy - item.half[1]);
  const groundShiftY = Number.isFinite(rawMinY) ? rawMinY : 0;

  let [minX, maxX, maxY, minZ, maxZ] = [Infinity, -Infinity, 0, Infinity, -Infinity];
  const primitives: BgPrimitive[] = staged.map((item) => {
    const finalY = round4(Math.max(item.half[1], item.wy - groundShiftY));
    minX = Math.min(minX, item.wx - item.half[0]);
    maxX = Math.max(maxX, item.wx + item.half[0]);
    maxY = Math.max(maxY, finalY + item.half[1]);
    minZ = Math.min(minZ, item.wz - item.half[2]);
    maxZ = Math.max(maxZ, item.wz + item.half[2]);

    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      position: [item.wx, finalY, item.wz],
      rotation: item.rot,
      scale: item.scale,
      color: item.color,
      visible: true,
      locked: false,
      parentId: null,
      componentRef: { id: meta.v10GlbAssetId, name: meta.labelKo },
      tags: [...canonicalTags],
    };
  });

  const estimatedLineArtEdges = primitives.length * 14;
  const monotonyReliefScore = clamp(Math.round(78 + primitives.length * 0.55 + (densityNum - 1) * 4), 80, 99);
  const footprintMeters: readonly [number, number, number] = [
    round4(Math.max(0.5, maxX - minX)),
    round4(Math.max(0.5, maxY)),
    round4(Math.max(0.5, maxZ - minZ)),
  ];

  return {
    archetype: rawSpec.archetype,
    labelKo: meta.labelKo,
    primitives,
    partCount: primitives.length,
    estimatedLineArtEdges,
    monotonyReliefScore,
    footprintMeters,
    anchorOffsetXZ: [round4(anchorX), round4(anchorZ)],
    summaryKo: `${meta.labelKo} (${modules}모듈 · ${primitives.length}파츠 · 선화 엣지 약 ${estimatedLineArtEdges}선)`,
  };
}
