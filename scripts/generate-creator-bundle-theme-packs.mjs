#!/usr/bin/env node
/**
 * generate-creator-bundle-theme-packs.mjs
 *
 * Creator Bundle 테마 팩 데이터 생성기.
 *
 * 입력: 인제스션 v2 산출(manifest-v2.json + 그 파일 트리)과 테마 그룹핑 정본
 *   (apps/web/public/assets/3d/environments/bundle-v1/manifest.json).
 * 출력: bg3d가 런타임에 fetch하는 테마 팩 데이터
 *   (apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json).
 *
 * 원칙 (사용자 확정 — 서비스 안에서만 사용·이용되는 구조):
 *   - rights · inServiceOnly:true · downloadable:false 를 항상 기록하고,
 *     다운로드 동선 필드는 만들지 않는다.
 *   - 회수 중(부분 수신)·귀속 불확정 팩은 확정 데이터에 넣지 않고
 *     pendingPacks(사유 포함)로만 기록한다. 회수가 끝나면 이 스크립트의
 *     매핑 표를 갱신해 재실행하는 것이 편입 절차다.
 *   - 배치 가능 에셋은 GLB 형태가 실재하는 에셋뿐이다. FBX/glTF 원본은
 *     GLB 쌍둥이(같은 팩·같은 원본 경로)가 있으면 그쪽으로 대표되고,
 *     없으면 deferred로 세어만 둔다 (디스크립터 전용 배치는 하지 않는다).
 *   - 배치 가능 판정은 bg3d 검증기의 모바일 프로필 예산
 *     (studio-bg3d-glb-validation.ts의 DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES.mobile)을
 *     GLB 헤더(JSON 청크) 실측으로 미리 적용한 것이다. 최종 검증은 런타임
 *     검증기가 그대로 수행한다 (환경 팩과 같은 경계).
 *   - 같은 검증기는 buffers/images에 uri 속성이 하나라도 있으면
 *     external-resource-uri로 거부한다 (외부 텍스처를 참조하는 GLB는 바이트를
 *     배포해도 배치할 수 없다). 생성기도 같은 기준으로 그런 GLB를
 *     deferred.overBudget["external-resource"]로 분리한다 — 텍스처를 GLB 안에
 *     임베드하는 재익스포트가 끝나야 편입할 수 있다 (2026-10-22 실측 정정:
 *     Godot판 모듈 GLB 9,362개가 공유 아틀라스를 상대 경로로 참조하고 있었다).
 *
 * 권리 게이트 (fail-closed, 2026-10-22):
 *   - 팩별 서빙 판정은 권리 원장(config/creator-bundle-pack-rights.json)이 정한다.
 *     원장에서 allow이고 증빙 자격까지 갖춘 팩만 packs/assets/crowdPacks에 들어간다.
 *   - hold이거나 원장에 없는 팩은 파일을 읽지 않고 pendingPacks(reason "rights-hold")로만 기록한다.
 *     원장이 팩 정의를 빠짐없이 덮지 못하면 생성 자체를 거부한다.
 *   - 허용된 팩에는 팩별 rights(라이선스명·상업 이용 여부)를 싣는다. 로더는 이 값만 쓴다.
 *   - 원장을 바꾼 뒤에는 이 스크립트를 다시 실행해야 theme-packs.json에 반영된다. 팩 순서가 바뀌므로
 *     packIndex를 쓰는 장르 씬팩 연결(studio-bg3d-genre-scene-pack-links.ts)도 같은 변경에서 갱신한다.
 *
 * 사용법:
 *   node scripts/generate-creator-bundle-theme-packs.mjs \
 *     --manifest-v2 <manifest-v2.json 경로> [--asset-root <파일 트리 루트>] \
 *     [--themes <bundle-v1 manifest 경로>] [--out <출력 경로>] \
 *     [--pack-rights <권리 원장 경로>] [--dry-run]
 *   --asset-root 기본값은 manifest-v2.json이 있는 폴더 (파일 실재·해시·메트릭 실측에 쓴다).
 *   --pack-rights 기본값은 config/creator-bundle-pack-rights.json.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkLedgerCoversDefs,
  DEFAULT_PACK_RIGHTS_PATH,
  evaluateServeDecision,
  HOLD_PUBLIC_LABEL,
  loadPackRightsLedger,
  packRightsProjection,
  RIGHTS_HOLD_REASON,
  validatePackRightsLedger,
} from "./lib/creator-bundle-pack-rights.mjs";

/* ── bg3d 모바일 프로필 예산 (studio-bg3d-glb-validation.ts와 동기 유지) ── */
const MOBILE_BUDGET = {
  maxModelBytes: 64 * 1024 * 1024,
  maxNodes: 256,
  maxTriangles: 500000,
  maxDrawCalls: 256,
  maxMaterials: 128,
  maxTextures: 64,
  maxAnimations: 32,
  maxSkins: 32,
};
const ALLOWED_REQUIRED_EXTENSIONS = new Set([
  "KHR_meshopt_compression",
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
  "KHR_texture_basisu",
  "EXT_texture_webp",
]);

/* ── 카탈로그 팩 → 인제스션 팩 매핑 ─────────────────────────────────────────
 * 근거: bundle-ingest/STATUS.md §2 커버리지(확정 판정), §10 갱신, 이후 체크포인트.
 * 규칙: 팩당 대표 변형 1개 우선 (네이티브 GLB Godot판 > GLB판 > 변환 쌍둥이),
 *   서로 다른 모듈(묘지 모듈 등)은 각각 편입한다. 변형 중복은 넣지 않는다.
 * presetSource: blend 스토어형 변형 — GLB 1개가 팩 전체를 담은 병합 씬이라
 *   프리빌트 프리셋 후보가 된다.
 * ────────────────────────────────────────────────────────────────────────── */
export const CATALOG_PACKS = [
  // 도시
  { catalogIds: ["cbv1-001-cartoon-city-massive-pack"], title: "Cartoon City Massive Pack", creator: "RG Poly", theme: "city", category: "environment", ingest: ["cbv1-ingest-001-001-city"] },
  { catalogIds: ["cbv1-004-old-town-courtyards"], title: "Old Town — Courtyards", creator: "EmaceArt", theme: "city", category: "environment", ingest: ["cbv1-ingest-145-oldtownenvironmentcourtyardslite-2026-08-20", "cbv1-ingest-224-old-town-environment-courtyards-blend"], presetSource: ["cbv1-ingest-224-old-town-environment-courtyards-blend"] },
  { catalogIds: ["cbv1-005-harboria-victorian-town"], title: "Harboria — Victorian Town", creator: "EmaceArt", theme: "city", category: "environment", ingest: ["cbv1-ingest-002-005-harboria-full", "cbv1-ingest-212-harboria-blend"], presetSource: ["cbv1-ingest-212-harboria-blend"], note: "FBX 원본 회수는 끝났고 배치 가능 에셋은 blend 변형의 병합 GLB뿐이다. 나머지는 GLB 변환 후 채워진다." },
  // 중세·판타지 — 021·022/023은 회수 종결·확정 승격으로 편입 (2026-10-21 최종 재생성). 020/024는 미수신, 063은 귀속 판정 유지로 pending.
  { catalogIds: ["cbv1-021-slavica-medieval-village"], title: "Slavica — Slavic Medieval Village", creator: "EmaceArt", theme: "medieval-fantasy", category: "environment", ingest: ["cbv1-ingest-005-021-slavica-full"], note: "FBX 원본 회수는 끝났고, GLB 변환 후 에셋이 채워진다." },
  { catalogIds: ["cbv1-022-low-poly-medieval-village", "cbv1-023-medieval-megapack-low-poly"], title: "Medieval Village / Megapack", creator: "RG Poly", theme: "medieval-fantasy", category: "environment", ingest: ["cbv1-ingest-006-022-medieval-godot"] },
  // 자연
  { catalogIds: ["cbv1-028-lumagrove-wonky-woods"], title: "LumaGrove — Wonky Woods", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-135-lumagrovewonkywoods-godot-2026-09-29", "cbv1-ingest-221-lumagrove-wonky-woods-low-poly-nature-asset-pack"], presetSource: ["cbv1-ingest-221-lumagrove-wonky-woods-low-poly-nature-asset-pack"] },
  { catalogIds: ["cbv1-030-nature-megapack-extended"], title: "Nature Megapack - Extended", creator: "RG Poly", theme: "nature", category: "environment", ingest: ["cbv1-ingest-007-030-nature-godot"] },
  { catalogIds: ["cbv1-031-poly-meadows"], title: "Poly Meadows", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-225-poly-meadows-blend"], presetSource: ["cbv1-ingest-225-poly-meadows-blend"] },
  { catalogIds: ["cbv1-032-low-poly-tiny-forest"], title: "Low Poly Tiny Forest", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-131-lowpolynatureproject-ea04-tiny-forest-free", "cbv1-ingest-220-low-poly-stylized-tiny-forest-blend"], presetSource: ["cbv1-ingest-220-low-poly-stylized-tiny-forest-blend"] },
  { catalogIds: ["cbv1-034-natureforge-woodland-forest"], title: "NatureForge — Stylized Woodland Forest Pack", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-143-natureforgeprostylizedwoodland-godot-2026-10-18-"] },
  { catalogIds: ["cbv1-056-farm-land"], title: "Farm Land", creator: "RG Poly", theme: "nature", category: "environment", ingest: ["cbv1-ingest-080-farm-pack-godot"] },
  { catalogIds: ["cbv1-033-rocks-and-stone"], title: "Rocks and Stone", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-160-rocksandstone-godot-2026-09-29", "cbv1-ingest-213-l100-rocks-stones-and-clifs-blend"], presetSource: ["cbv1-ingest-213-l100-rocks-stones-and-clifs-blend"] },
  { catalogIds: ["cbv1-029-terratoon-tree-pack"], title: "TerraToon — Stylized Tree Pack", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-238-terratoon-stylized-tree-pack-low-poly-forest-fol"] },
  { catalogIds: ["cbv1-049-lava-plants"], title: "Low Poly Lava Plants", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-129-lowpolylavaplants-2025-09-12-20-54-22"] },
  // 실내
  { catalogIds: ["cbv1-042-restaurant-megapack"], title: "Restaurant Megapack", creator: "RG Poly", theme: "interior", category: "environment", ingest: ["cbv1-ingest-156-restaurant-godot-43-9l2x"] },
  { catalogIds: ["cbv1-044-pixeldrift-metro"], title: "PixelDrift Metro — 3D Pixel Art Subway (VR)", creator: "EmaceArt", theme: "interior", category: "environment", ingest: ["cbv1-ingest-138-metro-2026-31-1-00-17-18"] },
  { catalogIds: ["cbv1-065-free-analog-memory-rooms"], title: "FREE Analog Memory — 80s/90s CRT VHS Rooms", creator: "EmaceArt", theme: "interior", category: "environment", ingest: ["cbv1-ingest-010-80s-store"], presetSource: ["cbv1-ingest-010-80s-store"] },
  { catalogIds: ["cbv1-071-pixeldrift-metro-free"], title: "PixelDrift: Metro — FREE", creator: "EmaceArt", theme: "interior", category: "environment", ingest: ["cbv1-ingest-150-pixelart-ea01-metro-2-v1", "cbv1-ingest-151-pixelart-ea01-metro-v11-2-v2", "cbv1-ingest-153-pixeldriftmetrofree-godot4-project"] },
  // SF
  { catalogIds: ["cbv1-050-scifi-arena-1"], title: "Sci-Fi Arena: 1", creator: "RG Poly", theme: "sci-fi", category: "environment", ingest: ["cbv1-ingest-162-sci-fi-arena-pack-2022-3-6f1"] },
  { catalogIds: ["cbv1-051-scifi-arena-2"], title: "Sci-Fi Arena: 2", creator: "RG Poly", theme: "sci-fi", category: "environment", ingest: ["cbv1-ingest-161-sci-fi-arena-pack-2-2022-3-6f1"] },
  { catalogIds: ["cbv1-046-cosmokit-planets"], title: "CosmoKit — Stylized Low Poly Planets", creator: "EmaceArt", theme: "sci-fi", category: "environment", ingest: ["cbv1-ingest-032-cosmokitstylizedlowpolyplanets-godot-2026-09-29", "cbv1-ingest-181-cosmokit-low-poly-planet-pack-blend"], presetSource: ["cbv1-ingest-181-cosmokit-low-poly-planet-pack-blend"] },
  // 공포
  { catalogIds: ["cbv1-006-polyvania-burton-horror-town"], title: "Polyvania — Burton Horror Town", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-226-polyvania-blend-41-emsu"], note: "blend 원본만 수신돼 있어 GLB 변환 후 에셋이 채워진다." },
  { catalogIds: ["cbv1-011-necropolyy-graveyard"], title: "NecroPOLY — Stylized Graveyard", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-125-lowpolycemeterykitnecropolygravesmodule-2026-09-", "cbv1-ingest-218-low-poly-cemetery-kit-necropoly-tombs-module-god", "cbv1-ingest-217-low-poly-cemetery-kit-necropoly-tombs-module-ble"], presetSource: ["cbv1-ingest-217-low-poly-cemetery-kit-necropoly-tombs-module-ble"] },
  { catalogIds: ["cbv1-013-graves-kit"], title: "Graves Kit", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-216-low-poly-cemetery-grave-kit-with-lods-godot", "cbv1-ingest-215-low-poly-cemetery-grave-kit-with-lods-blend"], presetSource: ["cbv1-ingest-215-low-poly-cemetery-grave-kit-with-lods-blend"] },
  { catalogIds: ["cbv1-012-cemetery-statues"], title: "Cemetery Statues Pack", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-028-cemeterystatuespack-godot-2026-09-29"] },
  { catalogIds: ["cbv1-015-haunted-grounds"], title: "Haunted Grounds — Halloween Props & Scene", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-004-015-haunted-grounds"], note: "FBX 원본만 수신돼 있어 GLB 변환 후 에셋이 채워진다." },
  // 사막·열대
  { catalogIds: ["cbv1-035-pirate-island"], title: "Pirate Island", creator: "RG Poly", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-149-pirateisland-godot-28-s0w2"] },
  { catalogIds: ["cbv1-037-voxel-summer"], title: "Voxel Summer", creator: "EmaceArt", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-050-epicvoxelworldsummeratollsforestmodularassetpack", "cbv1-ingest-183-epicvoxel-low-poly-voxel-summer-blend"], presetSource: ["cbv1-ingest-183-epicvoxel-low-poly-voxel-summer-blend"] },
  { catalogIds: ["cbv1-038-aztec-jungle"], title: "Aztec Jungle", creator: "RG Poly", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-021-aztecjungle-godot"] },
  { catalogIds: ["cbv1-039-raft-on-the-desert"], title: "Raft on the Desert", creator: "EmaceArt", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-228-raft-on-the-desert-godot"] },
  // 늪 (040 Nature + 041 Architecture는 파일만으로 분리할 수 없어 통합 편입)
  { catalogIds: ["cbv1-040-swamp-builder-nature", "cbv1-041-swamp-builder-architecture"], title: "Swamp Builder — Nature·Architecture", creator: "EmaceArt", theme: "swamp", category: "environment", ingest: ["cbv1-ingest-235-swamp-builder-godot", "cbv1-ingest-236-swampia-godot-35-3yuh", "cbv1-ingest-234-swamp-builder-blend"], presetSource: ["cbv1-ingest-234-swamp-builder-blend"] },
  // 기타
  { catalogIds: ["cbv1-026-iowa-covered-bridges"], title: "Iowa Covered Bridges", creator: "EmaceArt", theme: "other", category: "environment", ingest: ["cbv1-ingest-159-roadsidetalesiowacoveredbridges-2026-09-6-17-41-", "cbv1-ingest-232-roadside-tales-iowa-covered-bridges-blend"], presetSource: ["cbv1-ingest-232-roadside-tales-iowa-covered-bridges-blend"] },
  { catalogIds: ["cbv1-080-free-stylized-asia-megapack-urp"], title: "FREE Stylized Asia Environment Megapack — Unity URP", creator: "RG Poly", theme: "other", category: "environment", ingest: ["cbv1-ingest-015-asia-megapack-low-poly-refreshed-urp-2022-3-38f1"] },
  { catalogIds: ["cbv1-055-winter-atolls-pack"], title: "Winter Atolls Pack", creator: "EmaceArt", theme: "other", category: "environment", ingest: ["cbv1-ingest-182-epic-3d-winter-map-for-roblox-and-unity-blend-33"], presetSource: ["cbv1-ingest-182-epic-3d-winter-map-for-roblox-and-unity-blend-33"], note: "Epic 3D Winter Map 변형으로 귀속한 팩이다." },
  { catalogIds: ["cbv1-066-modular-bridge"], title: "Modular Bridge", creator: "EmaceArt", theme: "other", category: "environment", ingest: ["cbv1-ingest-026-bridge-v-1-2"], presetSource: ["cbv1-ingest-026-bridge-v-1-2"] },
  // 소품 (테마가 아니라 장면 조합용 카테고리)
  { catalogIds: ["cbv1-077-small-props-pack"], title: "Small Props Pack", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-166-small-props-pack"] },
  { catalogIds: ["cbv1-045-food-packaging"], title: "Low Poly Food Packaging", creator: "EmaceArt", theme: null, category: "prop", ingest: ["cbv1-ingest-126-lowpolyfoodandpackaging-godot-2026-09-25"] },
  { catalogIds: [], title: "Food Pack", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-093-food-pack"], note: "카탈로그 번호는 정본 카탈로그에서 확인되지 않아 비워 뒀다." },
  { catalogIds: ["cbv1-067-fences-and-walls"], title: "Fences and Walls", creator: "EmaceArt", theme: null, category: "prop", ingest: ["cbv1-ingest-091-fences-and-walls-glb"] },
  { catalogIds: ["cbv1-076-medieval-weapons"], title: "Medieval Weapons", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-180-weapons"], note: "Weapons 폴더 귀속은 추정 판정(STATUS §2)이다." },
  { catalogIds: ["cbv1-019-blasters-rg"], title: "Blasters RG", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-023-blasters-rg"] },
  { catalogIds: ["cbv1-074-blasters-free"], title: "Blasters Free", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-022-blasters-free"] },
];

/** 배경 군중 (렌더 전용 — bg3d 장면에 직접 배치하지 않고 오프라인 렌더 소재로만 쓴다). */
export const CROWD_PACKS = [
  // 제작사·id는 공식 카탈로그(virtual-studio/bundle-v1/manifest.json)와 라이브러리 packs.json 기준이다 (2026-10-22 정정: EmaceArt·characters-N → RG Poly·cartoon-characters-N).
  { catalogIds: ["cbv1-003-cartoon-characters-1"], title: "Characters 1", creator: "RG Poly", ingest: ["cbv1-ingest-031-characters-1-godot-40-3jio"] },
  { catalogIds: ["cbv1-007-cartoon-characters-2"], title: "Characters 2", creator: "RG Poly", ingest: ["cbv1-ingest-003-007-characters-2"] },
  { catalogIds: ["cbv1-010-philipp-character"], title: "PHILIPP — Stylized Modular Low Poly Character", creator: "EmaceArt", ingest: ["cbv1-ingest-147-philippstylizedmodularlowpolycharacter-2026-30-5"] },
  { catalogIds: ["cbv1-009-victorian-citizens"], title: "Victorian Citizens", creator: "EmaceArt", ingest: [], note: "귀속은 확정됐으나 매니페스트 v2 최종본에도 단독 팩으로 등록된 모델이 없어 편입 보류 중이다." },
  { catalogIds: ["cbv1-002-villagers"], title: "Villagers", creator: "EmaceArt", ingest: [], note: "귀속은 확정됐으나 매니페스트 v2 최종본에도 단독 팩으로 등록된 모델이 없어 편입 보류 중이다." },
];

/** 확정 데이터에 넣지 않는 팩과 사유 (패널의 "준비 중" 표기용). */
export const PENDING_PACKS = [
  { catalogIds: ["cbv1-043-rewind-memory-80s-90s-rooms"], title: "Rewind Memory — 80s/90s Rooms", reason: "retrieval-partial", reasonLabel: "무료판만 수신돼 있고 본편은 대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-069-gravefield-cemetery-kit"], title: "Gravefield Cemetery Kit — Dark Corners", reason: "retrieval-partial", reasonLabel: "확장 일부만 수신돼 있다." },
  { catalogIds: ["cbv1-070-ps1-psx-alone-in-the-dusk"], title: "PS1 PSX Alone in the DUSK", reason: "retrieval-partial", reasonLabel: "glTF판 회수가 남았다." },
  { catalogIds: ["cbv1-025-backroad-bridges"], title: "Backroad Bridges — Stylized Modular", reason: "attribution-unconfirmed", reasonLabel: "수신분이 추정 귀속이라 확정 후 편입한다." },
  { catalogIds: ["cbv1-063-free-fantasy-medieval-houses"], title: "Free Fantasy Medieval Houses", reason: "attribution-unconfirmed", reasonLabel: "수신 blend의 내용이 Slavica 무료판과 겹쳐 귀속 확정 후 편입한다." },
  { catalogIds: ["cbv1-008-cute-park-pack"], title: "Cute Park Pack", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-014-cute-graveyard"], title: "Cute Graveyard", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-020-viking-world-stylized"], title: "Viking World - Stylized", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-024-cute-dungeon-megapack"], title: "Cute Dungeon Megapack", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-036-desert-canyon"], title: "Desert Canyon", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-052-scifi-arena-cargo", "cbv1-053-scifi-arena-blue-base"], title: "Sci-Fi Arena: Cargo / Blue Base", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-054-low-poly-asia-pack"], title: "Low Poly Asia Pack", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-079-free-stylized-medieval-village-urp"], title: "Free Stylized Medieval Village — Unity URP", reason: "unreceived", reasonLabel: "대형 파일 회수가 남았다." },
  { catalogIds: ["cbv1-016-cars", "cbv1-017-cars-megapack", "cbv1-081-car-megapack", "cbv1-018-army-pack"], title: "차량·군사 팩", reason: "deferred-category", reasonLabel: "웹툰 배경 수요 대비 후순위로 보류한다 (2026-10-20 활용 계획)." },
];

/* ── GLB 메트릭 실측 ─────────────────────────────────────────────────────── */
function readGlbMetrics(buffer) {
  if (buffer.length < 20) return null;
  if (buffer.readUInt32LE(0) !== 0x46546c67) return null; // 'glTF'
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) return null; // 'JSON'
  let json;
  try {
    json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
  } catch {
    return null;
  }
  const accessors = Array.isArray(json.accessors) ? json.accessors : [];
  let triangles = 0;
  let primitives = 0;
  for (const mesh of Array.isArray(json.meshes) ? json.meshes : []) {
    for (const prim of Array.isArray(mesh?.primitives) ? mesh.primitives : []) {
      primitives += 1;
      const indexAccessor = typeof prim?.indices === "number" ? accessors[prim.indices] : null;
      const positionAccessor = typeof prim?.attributes?.POSITION === "number"
        ? accessors[prim.attributes.POSITION] : null;
      const count = indexAccessor?.count ?? positionAccessor?.count ?? 0;
      triangles += Math.floor(count / 3);
    }
  }
  // 런타임 검증기(studio-bg3d-glb-validation.ts의 hasExternalResourceUri 및
  // 이미지 검사)와 같은 판정: buffers/images 항목이 uri 속성을 가지면 외부
  // 리소스 참조로 본다 (data: URI도 예외가 아니다 — 검증기가 속성 존재
  // 자체를 거부한다).
  const hasExternalResourceUri = [...(Array.isArray(json.buffers) ? json.buffers : []),
    ...(Array.isArray(json.images) ? json.images : [])]
    .some((resource) => resource !== null && typeof resource === "object"
      && Object.hasOwn(resource, "uri"));
  return {
    nodes: Array.isArray(json.nodes) ? json.nodes.length : 0,
    primitives,
    triangles,
    materials: Array.isArray(json.materials) ? json.materials.length : 0,
    textures: Array.isArray(json.images) ? json.images.length : 0,
    animations: Array.isArray(json.animations) ? json.animations.length : 0,
    skins: Array.isArray(json.skins) ? json.skins.length : 0,
    extensionsRequired: Array.isArray(json.extensionsRequired) ? json.extensionsRequired : [],
    externalResource: hasExternalResourceUri,
  };
}

function budgetFailure(metrics, bytes) {
  if (bytes > MOBILE_BUDGET.maxModelBytes) return "bytes";
  if (!metrics) return "metrics-unavailable";
  // 예산 이전의 하드 거부 사유: 런타임 검증기가 external-resource-uri로
  // 실패시키는 GLB는 예산과 무관하게 배치할 수 없다.
  if (metrics.externalResource) return "external-resource";
  if (metrics.nodes > MOBILE_BUDGET.maxNodes) return "nodes";
  if (metrics.triangles > MOBILE_BUDGET.maxTriangles) return "triangles";
  if (metrics.primitives > MOBILE_BUDGET.maxDrawCalls) return "draw-calls";
  if (metrics.materials > MOBILE_BUDGET.maxMaterials) return "materials";
  if (metrics.textures > MOBILE_BUDGET.maxTextures) return "textures";
  if (metrics.animations > MOBILE_BUDGET.maxAnimations) return "animations";
  if (metrics.skins > MOBILE_BUDGET.maxSkins) return "skins";
  if (metrics.extensionsRequired.some((ext) => !ALLOWED_REQUIRED_EXTENSIONS.has(ext))) {
    return "required-extension";
  }
  return null;
}

/* ── 생성 ────────────────────────────────────────────────────────────────── */

/** 권리 게이트가 theme-packs에서 뺀 팩을 패널에 "준비 중"으로 알리는 pendingPacks 항목. */
function heldPendingPack(def, entry) {
  return {
    catalogIds: def.catalogIds,
    title: def.title,
    reason: RIGHTS_HOLD_REASON,
    reasonLabel: entry?.holdLabel ?? HOLD_PUBLIC_LABEL,
  };
}

/**
 * 인제스션 매니페스트 v2 + 권리 원장 → theme-packs 문서.
 * 순수 계산이다(파일은 읽기만 하고 쓰지 않는다). 원장이 잘못됐거나 팩 정의를 덮지 못하면 던진다.
 * 반환: { output, stats } — stats.heldPacks는 원장 때문에 빠진 팩 목록, stats.hashMismatch는 제외한 에셋 수.
 */
export function buildThemePacks({ manifestV2, themesDoc, assetRoot, ledger, onError = console.error }) {
  const ledgerProblems = validatePackRightsLedger(ledger);
  if (ledgerProblems.length > 0) {
    throw new Error(`권리 원장이 올바르지 않습니다 (${ledgerProblems.length}건): ${ledgerProblems.slice(0, 5).join(" / ")}`);
  }
  const coverageProblems = checkLedgerCoversDefs(ledger, {
    pack: CATALOG_PACKS,
    crowd: CROWD_PACKS,
    pending: PENDING_PACKS,
  });
  if (coverageProblems.length > 0) {
    throw new Error(`권리 원장이 팩 정의를 덮지 못합니다 (${coverageProblems.length}건): ${coverageProblems.slice(0, 5).join(" / ")}`);
  }

  const themeOrder = (Array.isArray(themesDoc.themes) ? themesDoc.themes : [])
    .map((theme) => ({ id: theme.theme, label: theme.label }));

  const assetsByPack = new Map();
  for (const asset of manifestV2.assets) {
    const list = assetsByPack.get(asset.packId) ?? [];
    list.push(asset);
    assetsByPack.set(asset.packId, list);
  }
  // GLB 쌍둥이 판정: 같은 인제스션 팩 + 같은 원본 경로(확장자 제외)에 GLB가 있으면 대표된다.
  const stemOf = (sourcePath) => (sourcePath ?? "").replace(/\.[^/.]+$/, "").toLowerCase();
  const hasGlbTwin = (asset) => {
    const siblings = assetsByPack.get(asset.packId) ?? [];
    const stem = stemOf(asset.sourcePath);
    return siblings.some((sibling) => sibling.format === "glb" && stemOf(sibling.sourcePath) === stem);
  };

  const packs = [];
  const assets = [];
  const presets = [];
  const seenAssetIds = new Set();
  const heldPacks = [];
  let hashMismatch = 0;

  for (const def of CATALOG_PACKS) {
    // 권리 게이트: 서빙이 허용되지 않은 팩은 실물 파일을 읽지도 않고 대기 목록으로만 보낸다.
    const decision = evaluateServeDecision(ledger, def, { group: "pack" });
    if (!decision.serve) {
      heldPacks.push({ def, decision });
      continue;
    }
    const packIndex = packs.length;
    const deferred = { fbx: 0, gltf: 0, blend: 0, overBudget: {} };
    let twinCovered = 0;
    let placeable = 0;
    for (const ingestId of def.ingest) {
      const list = assetsByPack.get(ingestId) ?? [];
      const isPresetSource = (def.presetSource ?? []).includes(ingestId);
      for (const asset of list) {
        if (asset.role !== "runtime" && asset.format !== "glb") {
          if (asset.format === "blend") deferred.blend += 1;
          continue;
        }
        if (asset.format !== "glb") {
          if (asset.missingDependencies?.length) {
            deferred[asset.format] = (deferred[asset.format] ?? 0) + 1;
            continue;
          }
          if (hasGlbTwin(asset)) { twinCovered += 1; continue; }
          deferred[asset.format] = (deferred[asset.format] ?? 0) + 1;
          continue;
        }
        // GLB — 실물 검증 (해시·크기) + 메트릭 실측 + 예산 게이트
        const primary = (asset.files ?? []).find((file) => file.kind === "primary") ?? asset.files?.[0];
        if (!primary) continue;
        const fileAbs = join(assetRoot, primary.path);
        if (!existsSync(fileAbs)) {
          throw new Error(`실물 파일이 없습니다: ${primary.path}`);
        }
        const buffer = readFileSync(fileAbs);
        const sha256 = createHash("sha256").update(buffer).digest("hex");
        if (primary.sha256 && sha256 !== primary.sha256) {
          hashMismatch += 1;
          onError(`해시 불일치: ${asset.id}`);
          continue;
        }
        if (buffer.length !== primary.bytes) {
          throw new Error(`크기 불일치: ${asset.id} manifest=${primary.bytes} disk=${buffer.length}`);
        }
        const metrics = readGlbMetrics(buffer);
        const failure = budgetFailure(metrics, buffer.length);
        if (failure) {
          deferred.overBudget[failure] = (deferred.overBudget[failure] ?? 0) + 1;
          continue;
        }
        if (seenAssetIds.has(asset.id)) continue;
        seenAssetIds.add(asset.id);
        const assetIndex = assets.length;
        assets.push({
          id: asset.id,
          pack: packIndex,
          path: primary.path,
          bytes: buffer.length,
          sha256,
          tris: metrics.triangles,
        });
        placeable += 1;
        // 프리셋: 스토어형 변형의 단독 병합 씬 (그 변형에서 GLB가 이 에셋뿐일 때)
        if (isPresetSource) {
          const glbCount = list.filter((entry) => entry.format === "glb").length;
          if (glbCount === 1 && buffer.length >= 128 * 1024) {
            presets.push({
              id: `bundle-preset-${asset.id}`,
              label: `${def.title} — 완성 장면`,
              theme: def.theme,
              pack: packIndex,
              asset: assetIndex,
            });
          }
        }
      }
    }
    packs.push({
      catalogIds: def.catalogIds,
      title: def.title,
      creator: def.creator,
      theme: def.theme,
      category: def.category,
      ingestPackIds: def.ingest,
      placeable,
      twinCovered,
      deferred,
      rights: packRightsProjection(decision.entry),
      ...(def.note ? { note: def.note } : {}),
    });
  }

  const crowdPacks = [];
  for (const def of CROWD_PACKS) {
    const decision = evaluateServeDecision(ledger, def, { group: "crowd" });
    if (!decision.serve) {
      heldPacks.push({ def, decision });
      continue;
    }
    let glbAssets = 0;
    for (const ingestId of def.ingest) {
      glbAssets += (assetsByPack.get(ingestId) ?? []).filter((asset) => asset.format === "glb").length;
    }
    crowdPacks.push({
      catalogIds: def.catalogIds,
      title: def.title,
      creator: def.creator,
      category: "crowd-render-only",
      glbAssets,
      ...(def.note ? { note: def.note } : {}),
    });
  }

  const output = {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1",
    version: 1,
    generatedAt: null,
    sourceManifest: {
      kind: manifestV2.kind,
      generatedAt: manifestV2.generatedAt ?? null,
      totals: manifestV2.totals ?? null,
    },
    provider: "itch.io Creator Bundle: Volume 1 (EmaceArt · RG Poly)",
    rights: {
      holder: "EmaceArt / RG Poly (구매 라이선스)",
      inServiceOnly: true,
      downloadable: false,
      statement: "서비스 안에서만 사용·이용되는 구조 전용. 모델 파일 다운로드·내보내기를 제공하지 않으며, 장면은 참조 단위로 저장하고 렌더된 이미지만 외부로 나간다.",
    },
    inServiceOnly: true,
    downloadable: false,
    assetRoot: "/assets/studio/bundle-v2/",
    budgetProfile: "mobile",
    themes: themeOrder,
    packs,
    assets,
    presets,
    crowdPacks,
    pendingPacks: [
      ...PENDING_PACKS,
      ...heldPacks.map(({ def, decision }) => heldPendingPack(def, decision.entry)),
    ],
    totals: {
      packs: packs.length,
      placeableAssets: assets.length,
      presets: presets.length,
      crowdGlbAssets: crowdPacks.reduce((sum, pack) => sum + pack.glbAssets, 0),
      deferredAssets: packs.reduce((sum, pack) => sum
        + pack.deferred.fbx + pack.deferred.gltf + pack.deferred.blend
        + Object.values(pack.deferred.overBudget).reduce((a, b) => a + b, 0), 0),
    },
  };
  return { output, stats: { heldPacks, hashMismatch } };
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

const USAGE = "usage: node scripts/generate-creator-bundle-theme-packs.mjs --manifest-v2 <path> [--asset-root <dir>] [--themes <path>] [--out <path>] [--pack-rights <path>] [--dry-run]";

function main(argv) {
  const argValue = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  const manifestV2Path = argValue("--manifest-v2");
  const themesPath = argValue("--themes") ?? "apps/web/public/assets/3d/environments/bundle-v1/manifest.json";
  const outPath = argValue("--out") ?? "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json";
  const packRightsPath = resolve(argValue("--pack-rights") ?? DEFAULT_PACK_RIGHTS_PATH);
  const dryRun = argv.includes("--dry-run");
  if (!manifestV2Path) {
    console.error(USAGE);
    process.exit(2);
  }
  const assetRoot = resolve(argValue("--asset-root") ?? dirname(resolve(manifestV2Path)));

  const manifestV2 = JSON.parse(readFileSync(resolve(manifestV2Path), "utf8"));
  if (manifestV2.kind !== "toonstudio.asset-bundle.v2" || manifestV2.version !== 2) {
    console.error("manifest-v2 형식이 아닙니다 (kind/version 불일치).");
    process.exit(2);
  }
  if (manifestV2.inServiceOnly !== true || manifestV2.downloadable !== false) {
    console.error("서비스 내 사용 전용으로 선언되지 않은 매니페스트는 테마 팩으로 만들 수 없습니다.");
    process.exit(2);
  }
  const themesDoc = JSON.parse(readFileSync(resolve(themesPath), "utf8"));

  let result;
  try {
    const ledger = loadPackRightsLedger(packRightsPath);
    result = buildThemePacks({ manifestV2, themesDoc, assetRoot, ledger });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  const { output, stats } = result;
  const { packs, assets, presets } = output;

  console.log(`packs: ${packs.length}, placeable assets: ${assets.length}, presets: ${presets.length}`);
  console.log(`crowd GLB (render-only): ${output.totals.crowdGlbAssets}, deferred: ${output.totals.deferredAssets}, hash mismatches skipped: ${stats.hashMismatch}`);
  console.log(`권리 게이트: 허용 팩 ${packs.length + output.crowdPacks.length}개, hold로 제외한 팩 ${stats.heldPacks.length}개 (원장 ${packRightsPath})`);
  for (const { def, decision } of stats.heldPacks) {
    console.log(`  hold: ${def.title} — ${decision.reason === "hold" ? decision.entry.holdReason : decision.reason}`);
  }
  for (const pack of packs) {
    console.log(`  ${pack.title}: placeable ${pack.placeable}, twin ${pack.twinCovered}, deferred ${JSON.stringify(pack.deferred)}`);
  }
  if (!dryRun) {
    writeFileSync(resolve(outPath), JSON.stringify(output) + "\n");
    console.log(`written: ${resolve(outPath)} (${statSync(resolve(outPath)).size} bytes)`);
  } else {
    console.log("dry-run: nothing written");
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
