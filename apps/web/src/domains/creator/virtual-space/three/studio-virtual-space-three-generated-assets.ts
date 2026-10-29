import { studioWorldInteractions, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import type { StudioThreePropSpec } from "./studio-virtual-space-three-scene";

/** 실제 내려받은 실생성 바이너리만 연결한다. 402 응답 뒤 만든 합성 월드빌드 폴백은 이 목록에 넣지 않는다. */
export interface StudioThreeGeneratedAsset {
  readonly id: string;
  readonly provider: "tripo" | "varco";
  readonly url: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly heightMeters: number;
  readonly rooms: readonly string[];
  readonly offset: readonly [number, number];
  readonly animated?: boolean;
}

export const STUDIO_THREE_GENERATED_ASSETS: readonly StudioThreeGeneratedAsset[] = Object.freeze([
  { id: "tripo-artist-easel", provider: "tripo", url: "/models/tripo3d-mcp/tripo_h31_mannequin_artist_easel_prop_kit.glb",
    byteLength: 1652776, sha256: "038e3bfba90407baea20b28252ffa97c4f28dfd7f654066773485d1d578f210c",
    heightMeters: 1.7, rooms: ["hq-ink-bay", "personal-atelier"], offset: [0.8, 0.3] },
  { id: "tripo-story-desk", provider: "tripo", url: "/models/tripo3d-mcp/tripo_h31_detective_office_desk_kit.glb",
    byteLength: 1551716, sha256: "55dc1ff9b660849dc4b7c88248e639a6fc3470fbd39a600c5010276e585e4895",
    heightMeters: 1.15, rooms: ["hq-story-room", "story-lab"], offset: [0.76, 0.3] },
  { id: "tripo-reference-shelf", provider: "tripo", url: "/models/tripo3d-mcp/tripo_h31_fantasy_alchemy_lab_shelf_kit.glb",
    byteLength: 1503340, sha256: "cbd2028c2e53a3d830e7a8c97c935c332f72d3d81721d10a0597a6b1d56b52de",
    heightMeters: 1.85, rooms: ["hq-reference-library", "review-gallery"], offset: [0.8, 0.28] },
  { id: "tripo-creator-arcade", provider: "tripo", url: "/models/tripo3d-mcp/tripo_h31_cyberpunk_arcade_cabinet_kit.glb",
    byteLength: 2021344, sha256: "55d421d44c5192a31528f62f8e4ec11f04479e5a1c9ea5ee775d920aac65dacd",
    heightMeters: 1.8, rooms: ["hq-lounge", "arcade"], offset: [0.78, 0.32] },
  { id: "varco-reference-desk", provider: "varco", url: "/models/varco3d/varco_prop_school_desk_remesh_quad.glb",
    byteLength: 960772, sha256: "ff7bd6cd8014eb6e20998a1c79df3895de7989c3857fd7cb89c906eee0be59e3",
    heightMeters: 1.0, rooms: ["hq-color-lab", "personal-atelier"], offset: [0.25, 0.32] },
  { id: "varco-animated-reference", provider: "varco", url: "/models/varco3d/varco_char_student_council_standing_idle.glb",
    byteLength: 6474256, sha256: "67bf36372efd19f5edf747da0331b3476bfb48f72fb8b9adb065b0bbcb3f125b",
    heightMeters: 1.82, rooms: ["hq-bg3d-lab", "review-gallery"], offset: [0.76, 0.62], animated: true },
]);

export interface StudioThreeModelProp extends StudioThreePropSpec {
  readonly animated?: boolean;
}

/** 새 배경에 이미 그려진 가구의 충돌 사각형 내부다. 스폰·통로·도구·좌석을 새로 점유하지 않는다. */
const ENVIRONMENT_GENERATED_PLACEMENTS = [
  { roomId: "forest-atelier", assetId: "tripo-artist-easel", x: 410, y: 390 },
  { roomId: "orbital-observatory", assetId: "tripo-reference-shelf", x: 850, y: 385 },
  { roomId: "tidal-atelier", assetId: "varco-reference-desk", x: 875, y: 355 },
] as const;

export function isStudioThreeCampusManifest(manifest?: StudioVirtualSpaceWorldManifest): boolean {
  return !manifest || CAMPUS_ZONES.every((zone) => manifest.rooms.some((room) => room.id === zone.roomId));
}

/** 캠퍼스 고정 좌표가 없는 월드에서도 실제 상호작용 위치에 제작 장비를 둔다. */
export function studioThreeManifestProps(manifest: StudioVirtualSpaceWorldManifest): readonly StudioThreeModelProp[] {
  return studioWorldInteractions(manifest).map((interaction) => ({
    id: `world-${interaction.id}`,
    url: interaction.action === "story" || interaction.action === "review"
      ? "/assets/3d/refined-v8/blackboard.glb"
      : interaction.action === "community" ? "/assets/3d/round_table.glb" : "/assets/3d/refined-v8/desk.glb",
    x: interaction.point.x, y: interaction.point.y,
    heightMeters: interaction.action === "story" || interaction.action === "review" ? 1.55 : 0.95,
  }));
}

/** 2D/3D에서 같은 방의 같은 위치를 가리키도록 활성 manifest의 방 사각형으로 배치한다. */
export function studioThreeGeneratedProps(manifest?: StudioVirtualSpaceWorldManifest): readonly StudioThreeModelProp[] {
  if (!manifest) return [];
  const props: StudioThreeModelProp[] = STUDIO_THREE_GENERATED_ASSETS.flatMap((asset) => {
    const room = manifest.rooms.find((candidate) => asset.rooms.includes(candidate.id));
    return room ? [{
      id: asset.id, url: asset.url, heightMeters: asset.heightMeters,
      x: room.x + room.width * asset.offset[0], y: room.y + room.height * asset.offset[1],
      ...(asset.animated ? { animated: true } : {}),
    }] : [];
  });
  for (const placement of ENVIRONMENT_GENERATED_PLACEMENTS) {
    if (!manifest.rooms.some((room) => room.id === placement.roomId)) continue;
    const asset = STUDIO_THREE_GENERATED_ASSETS.find((candidate) => candidate.id === placement.assetId);
    if (asset) props.push({ id: asset.id, url: asset.url, heightMeters: asset.heightMeters, x: placement.x, y: placement.y });
  }
  return props;
}
