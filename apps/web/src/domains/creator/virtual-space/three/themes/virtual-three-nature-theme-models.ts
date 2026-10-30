import type { VirtualThreeLayoutRoleKind, VirtualThreeThemeModelRefBundle } from './virtual-three-theme-types';

/** 2026-10-30 실제 5,229개 카탈로그에서 읽었다. 실제 장면의 시각 검수·배포 완료 표시는 아니다. */
export const NATURE_THEME_CATALOG_SNAPSHOT_SHA256 = 'e855c272c15db1f75a7a398c93f01c9ce6ff27342f2b10b2707e4daf9abe3ce4';
export const NATURE_THEME_CATALOG_ID = 'cbv1-030-nature-megapack-extended';
const PREFIX = 'cbv1-ingest-007-030-nature-godot/native/';

/** 표시 규격은 균일한 부모 transform 제안이며 실제 footprint·화면·가독성 검수는 별도로 수행한다. */
export const NATURE_THEME_MODEL_SOURCE_FACTS = [
  { assetId: 'cbv1-ingest-007-030-nature-godot-85e1a7acd99713144559', path: PREFIX + 'Trees/Tree_7_AA.glb',
    sha256: 'd25e5afe8d225f3eb238e4b05d79a4c9b4428bbfdd25aaf949d2cf0400076314', byteLength: 582592, triangles: 256,
    display: { kind: 'botanical', axis: 'height', meters: 2.4 } },
  { assetId: 'cbv1-ingest-007-030-nature-godot-e44a67b5d6a32d38b1c3', path: PREFIX + 'Other/Bush_1_1_A.glb',
    sha256: '08d2c0f4774cd9b068301f934db8c23a9aa9f5223b526585bf2204f0624c5190', byteLength: 587464, triangles: 320,
    display: { kind: 'botanical', axis: 'ground-extent', meters: 0.85 } },
  { assetId: 'cbv1-ingest-007-030-nature-godot-aa3b1b24c8e79f90ca6e', path: PREFIX + 'Rocks/Rock_1_1_A.glb',
    sha256: 'b5f5d5301d9ad67d8d5122b796573187ae9e11f3e2e1ebee6a81095cdea79d28', byteLength: 567788, triangles: 146,
    display: { kind: 'accent', axis: 'ground-extent', meters: 0.7 } },
  { assetId: 'cbv1-ingest-007-030-nature-godot-caac7714d1d60e7ff007', path: PREFIX + 'Mushrooms/Mushroom_1_2_A.glb',
    sha256: '762c0eaafd171abd1ce88f38c0687c3ed1d3d779199ecbdf42004cfc28184338', byteLength: 568648, triangles: 126,
    display: { kind: 'botanical', axis: 'ground-extent', meters: 0.32 } },
  { assetId: 'cbv1-ingest-007-030-nature-godot-a773f0da4c48f7adaab6', path: PREFIX + 'Trees/BananaTree_1_AA.glb',
    sha256: 'a3303068b6a8efdb5523a0199758e735e9079e5eaccbc3b792bbb355483d650d', byteLength: 738776, triangles: 2130,
    display: { kind: 'botanical', axis: 'height', meters: 1.9 } },
  { assetId: 'cbv1-ingest-007-030-nature-godot-3e0e1dbf7202095743d2', path: PREFIX + 'Farm Plants/Field_1_1_A.glb',
    sha256: '9ee90182009d52e4cb930a1a8eec3b0af3954de5ae630e255c83c2b912865709', byteLength: 621112, triangles: 732,
    display: { kind: 'botanical', axis: 'ground-extent', meters: 0.9 } },
  { assetId: 'cbv1-ingest-007-030-nature-godot-0b052d00b4ebd468a197', path: PREFIX + 'Farm Plants/Lettuce_C.glb',
    sha256: 'd0278329da4045e00515f0bad66925eccdf08985c9aed1f66d90a929a777f3a3', byteLength: 563256, triangles: 94,
    display: { kind: 'botanical', axis: 'ground-extent', meters: 0.24 } },
  { assetId: 'cbv1-ingest-007-030-nature-godot-a24715bf0aeae8890dd8', path: PREFIX + 'Flowers/Flower_1_1_A.glb',
    sha256: '33e5f93467b25ae68ec08b08fbd5541f9aebd36f5deb95011cea38ab98c624f2', byteLength: 605432, triangles: 592,
    display: { kind: 'botanical', axis: 'ground-extent', meters: 0.35 } },
] as const;

export const VIRTUAL_THREE_NATURE_MODEL_IDS = {
  natureTree: NATURE_THEME_MODEL_SOURCE_FACTS[0].assetId,
  natureBush: NATURE_THEME_MODEL_SOURCE_FACTS[1].assetId,
  natureRock: NATURE_THEME_MODEL_SOURCE_FACTS[2].assetId,
  natureMushroom: NATURE_THEME_MODEL_SOURCE_FACTS[3].assetId,
  natureBanana: NATURE_THEME_MODEL_SOURCE_FACTS[4].assetId,
  natureField: NATURE_THEME_MODEL_SOURCE_FACTS[5].assetId,
  natureLettuce: NATURE_THEME_MODEL_SOURCE_FACTS[6].assetId,
  natureFlower: NATURE_THEME_MODEL_SOURCE_FACTS[7].assetId,
} as const;

/** 새 생성물로 대체하지 않고 기존 bundle source/Worker의 검증 경계를 통과시킨다. */
export const VIRTUAL_THREE_NATURE_MODEL_REFS: readonly VirtualThreeThemeModelRefBundle[] = NATURE_THEME_MODEL_SOURCE_FACTS.map((model): VirtualThreeThemeModelRefBundle => ({
  source: 'bundle', assetId: model.assetId, expectedSha256: `sha256:${model.sha256}` as const,
  byteLength: model.byteLength, catalogId: NATURE_THEME_CATALOG_ID,
}));

export function findVirtualThreeNatureDisplaySize(kind: VirtualThreeLayoutRoleKind, modelAssetId: string): {
  readonly axis: 'height' | 'ground-extent'; readonly meters: number;
} | undefined {
  const model = NATURE_THEME_MODEL_SOURCE_FACTS.find(item => item.assetId === modelAssetId && item.display.kind === kind);
  return model ? { axis: model.display.axis, meters: model.display.meters } : undefined;
}
