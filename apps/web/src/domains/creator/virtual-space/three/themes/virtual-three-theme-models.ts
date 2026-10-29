import type { VirtualThreeThemeModelRef } from './virtual-three-theme-types';

/** 현재 bundle theme-packs.json과 기존 generated-assets.ts에서 읽은 ID만 참조한다. */
export const VIRTUAL_THREE_THEME_MODEL_IDS = {
  parkBench: 'cbv1-ingest-local-cute-park-bench-1-1-fd595aaee762',
  parkTree: 'cbv1-ingest-local-cute-park-treecube-1-1-76ad34f7a96f',
  parkFlower: 'cbv1-ingest-local-cute-park-flower-1-1-7745b2d14b44',
  dungeonTable: 'cbv1-ingest-local-cute-dungeon-table-1-be5614aa9194',
  dungeonChair: 'cbv1-ingest-local-cute-dungeon-chair-1-576db609c1ae',
  dungeonShelf: 'cbv1-ingest-local-cute-dungeon-shelf-long-1-32823a2a3c28',
  dungeonBowl: 'cbv1-ingest-local-cute-dungeon-bowl-1-1-396d3d097b97',
  dungeonCup: 'cbv1-ingest-local-cute-dungeon-cup-1-1-60aa14b75e67',
  blueWall: 'cbv1-ingest-local-scifi-blue-base-other-wallpp-1-1-a-b2ae009e5d66',
  graveCross: 'cbv1-ingest-local-cute-graveyard-cross-1-1-285866a4d7fc',
  graveFence: 'cbv1-ingest-local-cute-graveyard-fence-1-1-b2c37907195a',
  car: 'cbv1-ingest-local-cartoon-car-megapack-car-1-car-1-1-80734dec8dc7',
  artistEasel: 'tripo-artist-easel', storyDesk: 'tripo-story-desk', referenceShelf: 'tripo-reference-shelf',
  creatorArcade: 'tripo-creator-arcade', referenceDesk: 'varco-reference-desk', animatedReference: 'varco-animated-reference',
} as const;
const M = VIRTUAL_THREE_THEME_MODEL_IDS;

/** metadata 존재는 로딩 성공·현재 권리·배포 완료를 보증하지 않는다. 사용 시 기존 검증 포트를 재호출한다. */
export const VIRTUAL_THREE_THEME_MODEL_REFS: readonly VirtualThreeThemeModelRef[] = [
  { source: 'bundle', assetId: M.parkBench, expectedSha256: 'sha256:fd595aaee76239496994f165d27387ee8b80d4734eff4d89b7c0de59d1294e18', byteLength: 671364, catalogId: 'cbv1-008-cute-park-pack' },
  { source: 'bundle', assetId: M.parkTree, expectedSha256: 'sha256:76ad34f7a96f415e345f2a879f0db89d64d7f96a395c4878b117bd5835321f30', byteLength: 570708, catalogId: 'cbv1-008-cute-park-pack' },
  { source: 'bundle', assetId: M.parkFlower, expectedSha256: 'sha256:7745b2d14b444ad02f7ee8785526b5cb2a6b6f5caa43c272990488ddc2fb9b2c', byteLength: 573036, catalogId: 'cbv1-008-cute-park-pack' },
  { source: 'bundle', assetId: M.dungeonTable, expectedSha256: 'sha256:be5614aa91943edcb1e3437f51c390df5ee1b7c889bdb042e93a2c46b42b830e', byteLength: 609664, catalogId: 'cbv1-024-cute-dungeon-megapack' },
  { source: 'bundle', assetId: M.dungeonChair, expectedSha256: 'sha256:576db609c1aecfc28e5eafc536b766d2e3efa1ea5d55e639a0fcd9b7125c4216', byteLength: 620752, catalogId: 'cbv1-024-cute-dungeon-megapack' },
  { source: 'bundle', assetId: M.dungeonShelf, expectedSha256: 'sha256:32823a2a3c285a8d24f8690ec361e39442a25071bc5edfe622e86f5d02db01d8', byteLength: 589388, catalogId: 'cbv1-024-cute-dungeon-megapack' },
  { source: 'bundle', assetId: M.dungeonBowl, expectedSha256: 'sha256:396d3d097b97123b27ff4c9c5c4030d1f2e24c1110edd3467283032305b9308e', byteLength: 598724, catalogId: 'cbv1-024-cute-dungeon-megapack' },
  { source: 'bundle', assetId: M.dungeonCup, expectedSha256: 'sha256:60aa14b75e67826e461e22eb17a826933e98ad8053583a7afe1276d0b3f8cdc2', byteLength: 604588, catalogId: 'cbv1-024-cute-dungeon-megapack' },
  { source: 'bundle', assetId: M.blueWall, expectedSha256: 'sha256:b2ae009e5d666dac32a50ede33694fdb29d2f21ee1a68a14af599fbbfcb35ab5', byteLength: 569744, catalogId: 'cbv1-053-scifi-arena-blue-base' },
  { source: 'bundle', assetId: M.graveCross, expectedSha256: 'sha256:285866a4d7fc308962a9ef8183ec272f3a2c4d0d5b56972543e7b74bbb5d541e', byteLength: 571532, catalogId: 'cbv1-014-cute-graveyard' },
  { source: 'bundle', assetId: M.graveFence, expectedSha256: 'sha256:b2c37907195a7bdaac5dacaebc96e970b41c379e9dbf1e510a42b03e84aaa69e', byteLength: 582900, catalogId: 'cbv1-014-cute-graveyard' },
  { source: 'bundle', assetId: M.car, expectedSha256: 'sha256:80734dec8dc72a8d79c67dcbef8800b9b7e73c53ef2e05f898f003a76ae0aa42', byteLength: 1665088, catalogId: 'cbv1-081-cartoon-car-megapack' },
  { source: 'generated', id: M.artistEasel, url: '/models/tripo3d-mcp/tripo_h31_mannequin_artist_easel_prop_kit.glb', byteLength: 1652776, sha256: '038e3bfba90407baea20b28252ffa97c4f28dfd7f654066773485d1d578f210c', provenanceId: 'tripo-artist-easel' },
  { source: 'generated', id: M.storyDesk, url: '/models/tripo3d-mcp/tripo_h31_detective_office_desk_kit.glb', byteLength: 1551716, sha256: '55dc1ff9b660849dc4b7c88248e639a6fc3470fbd39a600c5010276e585e4895', provenanceId: 'tripo-story-desk' },
  { source: 'generated', id: M.referenceShelf, url: '/models/tripo3d-mcp/tripo_h31_fantasy_alchemy_lab_shelf_kit.glb', byteLength: 1503340, sha256: 'cbd2028c2e53a3d830e7a8c97c935c332f72d3d81721d10a0597a6b1d56b52de', provenanceId: 'tripo-reference-shelf' },
  { source: 'generated', id: M.creatorArcade, url: '/models/tripo3d-mcp/tripo_h31_cyberpunk_arcade_cabinet_kit.glb', byteLength: 2021344, sha256: '55d421d44c5192a31528f62f8e4ec11f04479e5a1c9ea5ee775d920aac65dacd', provenanceId: 'tripo-creator-arcade' },
  { source: 'generated', id: M.referenceDesk, url: '/models/varco3d/varco_prop_school_desk_remesh_quad.glb', byteLength: 960772, sha256: 'ff7bd6cd8014eb6e20998a1c79df3895de7989c3857fd7cb89c906eee0be59e3', provenanceId: 'varco-reference-desk' },
  { source: 'generated', id: M.animatedReference, url: '/models/varco3d/varco_char_student_council_standing_idle.glb', byteLength: 6474256, sha256: '67bf36372efd19f5edf747da0331b3476bfb48f72fb8b9adb065b0bbcb3f125b', provenanceId: 'varco-animated-reference' },
];
export function findVirtualThreeThemeModelRef(id: string): VirtualThreeThemeModelRef | undefined {
  return VIRTUAL_THREE_THEME_MODEL_REFS.find(model => (model.source === 'bundle' ? model.assetId : model.id) === id);
}
