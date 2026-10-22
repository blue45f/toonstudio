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
 * 사용법:
 *   node scripts/generate-creator-bundle-theme-packs.mjs \
 *     --manifest-v2 <manifest-v2.json 경로> [--asset-root <파일 트리 루트>] \
 *     [--themes <bundle-v1 manifest 경로>] [--out <출력 경로>] [--dry-run]
 *   --asset-root 기본값은 manifest-v2.json이 있는 폴더 (파일 실재·해시·메트릭 실측에 쓴다).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const manifestV2Path = argValue("--manifest-v2");
const themesPath = argValue("--themes") ?? "apps/web/public/assets/3d/environments/bundle-v1/manifest.json";
const outPath = argValue("--out") ?? "apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json";
const dryRun = args.includes("--dry-run");
if (!manifestV2Path) {
  console.error("usage: node scripts/generate-creator-bundle-theme-packs.mjs --manifest-v2 <path> [--asset-root <dir>] [--themes <path>] [--out <path>] [--dry-run]");
  process.exit(2);
}
const assetRoot = resolve(argValue("--asset-root") ?? dirname(resolve(manifestV2Path)));

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
 * 2026-10-22 갱신: 5라운드 종결(STATUS §143)로 인제스션 팩 ID가 재부여돼
 *   매핑 표를 새 ID로 교체했다. 대응 근거는 구·신 매니페스트 파일 sha256
 *   겹침 전수 대조다(대부분 팩이 파일 단위 100% 일치, 묘지상·묘지 키트·
 *   무덤 키트는 gltf/glb 변형 팩으로 분할, Winter Atolls는 blend/glb 분할).
 *   메트로 FBX 248파일이 모인 범용 팩 cbv1-ingest-127-fbxs-2는 메트로
 *   항목에 넣지 않았다(전부 FBX라 배치 가능 수치에는 영향이 없고, 범용
 *   팩 전체를 특정 제품으로 귀속시키지 않기 위해서다). 구
 *   swamp-builder-godot의 25파일은 cbv1-ingest-293-swamparch(SwampArch
 *   전량본)의 부분집합과 sha가 전부 일치해 같은 항목으로 편입했다.
 * ────────────────────────────────────────────────────────────────────────── */
const CATALOG_PACKS = [
  // 도시
  { catalogIds: ["cbv1-001-cartoon-city-massive-pack"], title: "Cartoon City Massive Pack", creator: "RG Poly", theme: "city", category: "environment", ingest: ["cbv1-ingest-001-001-city"] },
  { catalogIds: ["cbv1-004-old-town-courtyards"], title: "Old Town — Courtyards", creator: "EmaceArt", theme: "city", category: "environment", ingest: ["cbv1-ingest-250-oldtownenvironmentcourtyardslite-2026-08-20", "cbv1-ingest-409-old-town-environment-courtyards-blend"], presetSource: ["cbv1-ingest-409-old-town-environment-courtyards-blend"] },
  { catalogIds: ["cbv1-005-harboria-victorian-town"], title: "Harboria — Victorian Town", creator: "EmaceArt", theme: "city", category: "environment", ingest: ["cbv1-ingest-002-005-harboria-full", "cbv1-ingest-394-harboria-blend"], presetSource: ["cbv1-ingest-394-harboria-blend"], note: "FBX 원본 회수는 끝났고 배치 가능 에셋은 blend 변형의 병합 GLB뿐이다. 나머지는 GLB 변환 후 채워진다." },
  // 중세·판타지 — 021·022/023은 회수 종결·확정 승격으로 편입 (2026-10-21 최종 재생성). 020/024는 미수신, 063은 귀속 판정 유지로 pending.
  { catalogIds: ["cbv1-021-slavica-medieval-village"], title: "Slavica — Slavic Medieval Village", creator: "EmaceArt", theme: "medieval-fantasy", category: "environment", ingest: ["cbv1-ingest-005-021-slavica-full"], note: "FBX 원본 회수는 끝났고, GLB 변환 후 에셋이 채워진다." },
  { catalogIds: ["cbv1-022-low-poly-medieval-village", "cbv1-023-medieval-megapack-low-poly"], title: "Medieval Village / Megapack", creator: "RG Poly", theme: "medieval-fantasy", category: "environment", ingest: ["cbv1-ingest-006-022-medieval-godot"] },
  // 자연
  { catalogIds: ["cbv1-028-lumagrove-wonky-woods"], title: "LumaGrove — Wonky Woods", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-231-lumagrovewonkywoods", "cbv1-ingest-404-lumagrove-wonky-woods-low-poly-nature-asset-pack"], presetSource: ["cbv1-ingest-404-lumagrove-wonky-woods-low-poly-nature-asset-pack"] },
  { catalogIds: ["cbv1-030-nature-megapack-extended"], title: "Nature Megapack - Extended", creator: "RG Poly", theme: "nature", category: "environment", ingest: ["cbv1-ingest-007-030-nature-godot"] },
  { catalogIds: ["cbv1-031-poly-meadows"], title: "Poly Meadows", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-410-poly-meadows-blend"], presetSource: ["cbv1-ingest-410-poly-meadows-blend"] },
  { catalogIds: ["cbv1-032-low-poly-tiny-forest"], title: "Low Poly Tiny Forest", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-228-lowpolynatureproject-ea04-tiny-forest-free", "cbv1-ingest-403-low-poly-stylized-tiny-forest-blend"], presetSource: ["cbv1-ingest-403-low-poly-stylized-tiny-forest-blend"] },
  { catalogIds: ["cbv1-034-natureforge-woodland-forest"], title: "NatureForge — Stylized Woodland Forest Pack", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-243-natureforgeprostylizedwoodland-godot-2026-10-18-"] },
  { catalogIds: ["cbv1-056-farm-land"], title: "Farm Land", creator: "RG Poly", theme: "nature", category: "environment", ingest: ["cbv1-ingest-132-farm-pack"] },
  { catalogIds: ["cbv1-033-rocks-and-stone"], title: "Rocks and Stone", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-276-rocksandstone", "cbv1-ingest-395-l100-rocks-stones-and-clifs-blend"], presetSource: ["cbv1-ingest-395-l100-rocks-stones-and-clifs-blend"] },
  { catalogIds: ["cbv1-029-terratoon-tree-pack"], title: "TerraToon — Stylized Tree Pack", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-297-terratoonstylizedtreepack"] },
  { catalogIds: ["cbv1-049-lava-plants"], title: "Low Poly Lava Plants", creator: "EmaceArt", theme: "nature", category: "environment", ingest: ["cbv1-ingest-226-lowpolylavaplants-2025-09-12-20-54-22"] },
  // 실내
  { catalogIds: ["cbv1-042-restaurant-megapack"], title: "Restaurant Megapack", creator: "RG Poly", theme: "interior", category: "environment", ingest: ["cbv1-ingest-270-restaurant-godot"] },
  { catalogIds: ["cbv1-044-pixeldrift-metro"], title: "PixelDrift Metro — 3D Pixel Art Subway (VR)", creator: "EmaceArt", theme: "interior", category: "environment", ingest: ["cbv1-ingest-238-metro-2026-31-1-00-17-18"] },
  { catalogIds: ["cbv1-065-free-analog-memory-rooms"], title: "FREE Analog Memory — 80s/90s CRT VHS Rooms", creator: "EmaceArt", theme: "interior", category: "environment", ingest: ["cbv1-ingest-011-80s-store"], presetSource: ["cbv1-ingest-011-80s-store"] },
  { catalogIds: ["cbv1-071-pixeldrift-metro-free"], title: "PixelDrift: Metro — FREE", creator: "EmaceArt", theme: "interior", category: "environment", ingest: ["cbv1-ingest-257-pixelart-ea01-metro-2-v1", "cbv1-ingest-258-pixelart-ea01-metro-v11-2-v2", "cbv1-ingest-260-pixeldriftmetrofree"] },
  // SF
  { catalogIds: ["cbv1-050-scifi-arena-1"], title: "Sci-Fi Arena: 1", creator: "RG Poly", theme: "sci-fi", category: "environment", ingest: ["cbv1-ingest-280-sci-fi-arena-pack-2022-3-6f1"] },
  { catalogIds: ["cbv1-051-scifi-arena-2"], title: "Sci-Fi Arena: 2", creator: "RG Poly", theme: "sci-fi", category: "environment", ingest: ["cbv1-ingest-279-sci-fi-arena-pack-2-2022-3-6f1"] },
  { catalogIds: ["cbv1-046-cosmokit-planets"], title: "CosmoKit — Stylized Low Poly Planets", creator: "EmaceArt", theme: "sci-fi", category: "environment", ingest: ["cbv1-ingest-046-cosmokitstylizedlowpolyplanets", "cbv1-ingest-333-cosmokit-low-poly-planet-pack-blend"], presetSource: ["cbv1-ingest-333-cosmokit-low-poly-planet-pack-blend"] },
  // 공포
  { catalogIds: ["cbv1-006-polyvania-burton-horror-town"], title: "Polyvania — Burton Horror Town", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-411-polyvania-blend"], note: "blend 원본만 수신돼 있어 GLB 변환 후 에셋이 채워진다." },
  { catalogIds: ["cbv1-011-necropolyy-graveyard"], title: "NecroPOLY — Stylized Graveyard", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-221-lowpolycemeterykitnecropolygravesmodule-2026-09-", "cbv1-ingest-247-necropolytombkit", "cbv1-ingest-401-low-poly-cemetery-kit-necropoly-tombs-module-god", "cbv1-ingest-400-low-poly-cemetery-kit-necropoly-tombs-module-ble"], presetSource: ["cbv1-ingest-400-low-poly-cemetery-kit-necropoly-tombs-module-ble"] },
  { catalogIds: ["cbv1-013-graves-kit"], title: "Graves Kit", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-246-necropolygravekit", "cbv1-ingest-399-low-poly-cemetery-grave-kit-with-lods-godot", "cbv1-ingest-398-low-poly-cemetery-grave-kit-with-lods-blend"], presetSource: ["cbv1-ingest-398-low-poly-cemetery-grave-kit-with-lods-blend"] },
  { catalogIds: ["cbv1-012-cemetery-statues"], title: "Cemetery Statues Pack", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-038-cemeterystatuespack", "cbv1-ingest-039-cemeterystatuespack-godot-2026-09-29"] },
  { catalogIds: ["cbv1-015-haunted-grounds"], title: "Haunted Grounds — Halloween Props & Scene", creator: "EmaceArt", theme: "horror", category: "environment", ingest: ["cbv1-ingest-004-015-haunted-grounds"], note: "FBX 원본만 수신돼 있어 GLB 변환 후 에셋이 채워진다." },
  // 사막·열대
  { catalogIds: ["cbv1-035-pirate-island"], title: "Pirate Island", creator: "RG Poly", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-255-pirateisland-godot"] },
  { catalogIds: ["cbv1-037-voxel-summer"], title: "Voxel Summer", creator: "EmaceArt", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-071-epicvoxelworldsummeratollsforestmodularassetpack", "cbv1-ingest-336-epicvoxel-low-poly-voxel-summer-blend"], presetSource: ["cbv1-ingest-336-epicvoxel-low-poly-voxel-summer-blend"] },
  { catalogIds: ["cbv1-038-aztec-jungle"], title: "Aztec Jungle", creator: "RG Poly", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-026-aztecjungle-godot"] },
  { catalogIds: ["cbv1-039-raft-on-the-desert"], title: "Raft on the Desert", creator: "EmaceArt", theme: "desert-tropical", category: "environment", ingest: ["cbv1-ingest-267-raftonthedesert-godotproject"] },
  // 늪 (040 Nature + 041 Architecture는 파일만으로 분리할 수 없어 통합 편입)
  { catalogIds: ["cbv1-040-swamp-builder-nature", "cbv1-041-swamp-builder-architecture"], title: "Swamp Builder — Nature·Architecture", creator: "EmaceArt", theme: "swamp", category: "environment", ingest: ["cbv1-ingest-293-swamparch", "cbv1-ingest-295-swampremake", "cbv1-ingest-422-swamp-builder-blend"], presetSource: ["cbv1-ingest-422-swamp-builder-blend"] },
  // 기타
  { catalogIds: ["cbv1-026-iowa-covered-bridges"], title: "Iowa Covered Bridges", creator: "EmaceArt", theme: "other", category: "environment", ingest: ["cbv1-ingest-275-roadsidetalesiowacoveredbridges-2026-09-6-17-41-", "cbv1-ingest-418-roadside-tales-iowa-covered-bridges-blend"], presetSource: ["cbv1-ingest-418-roadside-tales-iowa-covered-bridges-blend"] },
  { catalogIds: ["cbv1-080-free-stylized-asia-megapack-urp"], title: "FREE Stylized Asia Environment Megapack — Unity URP", creator: "RG Poly", theme: "other", category: "environment", ingest: ["cbv1-ingest-020-asia-megapack-low-poly-refreshed-urp-2022-3-38f1"] },
  { catalogIds: ["cbv1-055-winter-atolls-pack"], title: "Winter Atolls Pack", creator: "EmaceArt", theme: "other", category: "environment", ingest: ["cbv1-ingest-334-epic-3d-winter-map-for-roblox-and-unity-blend", "cbv1-ingest-335-epic-3d-winter-map-for-roblox-and-unity-blend-33"], presetSource: ["cbv1-ingest-335-epic-3d-winter-map-for-roblox-and-unity-blend-33"], note: "Epic 3D Winter Map 변형으로 귀속한 팩이다." },
  { catalogIds: ["cbv1-066-modular-bridge"], title: "Modular Bridge", creator: "EmaceArt", theme: "other", category: "environment", ingest: ["cbv1-ingest-032-bridge-v-1-2"], presetSource: ["cbv1-ingest-032-bridge-v-1-2"] },
  // 소품 (테마가 아니라 장면 조합용 카테고리)
  { catalogIds: ["cbv1-077-small-props-pack"], title: "Small Props Pack", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-285-small-props-pack"] },
  { catalogIds: ["cbv1-045-food-packaging"], title: "Low Poly Food Packaging", creator: "EmaceArt", theme: null, category: "prop", ingest: ["cbv1-ingest-222-lowpolyfoodandpackaging"] },
  { catalogIds: [], title: "Food Pack", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-154-food-pack"], note: "카탈로그 번호는 정본 카탈로그에서 확인되지 않아 비워 뒀다." },
  { catalogIds: ["cbv1-067-fences-and-walls"], title: "Fences and Walls", creator: "EmaceArt", theme: null, category: "prop", ingest: ["cbv1-ingest-151-fences-and-walls-glb"] },
  { catalogIds: ["cbv1-076-medieval-weapons"], title: "Medieval Weapons", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-329-weapons"], note: "Weapons 폴더 귀속은 추정 판정(STATUS §2)이다." },
  { catalogIds: ["cbv1-019-blasters-rg"], title: "Blasters RG", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-028-blasters-rg"] },
  { catalogIds: ["cbv1-074-blasters-free"], title: "Blasters Free", creator: "RG Poly", theme: null, category: "prop", ingest: ["cbv1-ingest-027-blasters-free"] },
];

/** 배경 군중 (렌더 전용 — bg3d 장면에 직접 배치하지 않고 오프라인 렌더 소재로만 쓴다). */
const CROWD_PACKS = [
  { catalogIds: ["cbv1-003-characters-1"], title: "Characters 1", creator: "EmaceArt", ingest: ["cbv1-ingest-043-characters-1-godot"] },
  { catalogIds: ["cbv1-007-characters-2"], title: "Characters 2", creator: "EmaceArt", ingest: ["cbv1-ingest-003-007-characters-2"] },
  { catalogIds: ["cbv1-010-philipp-character"], title: "PHILIPP — Stylized Modular Low Poly Character", creator: "EmaceArt", ingest: ["cbv1-ingest-252-philippstylizedmodularlowpolycharacter-2026-30-5"] },
  { catalogIds: ["cbv1-009-victorian-citizens"], title: "Victorian Citizens", creator: "EmaceArt", ingest: [], note: "귀속은 확정됐으나 매니페스트 v2 최종본에도 단독 팩으로 등록된 모델이 없어 편입 보류 중이다." },
  { catalogIds: ["cbv1-002-villagers"], title: "Villagers", creator: "EmaceArt", ingest: [], note: "귀속은 확정됐으나 매니페스트 v2 최종본에도 단독 팩으로 등록된 모델이 없어 편입 보류 중이다." },
];

/** 확정 데이터에 넣지 않는 팩과 사유 (패널의 "준비 중" 표기용). */
const PENDING_PACKS = [
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

/* ── 본 실행 ─────────────────────────────────────────────────────────────── */
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
function hasGlbTwin(asset) {
  const siblings = assetsByPack.get(asset.packId) ?? [];
  const stem = stemOf(asset.sourcePath);
  return siblings.some((sibling) => sibling.format === "glb" && stemOf(sibling.sourcePath) === stem);
}

const packs = [];
const assets = [];
const presets = [];
const seenAssetIds = new Set();
let hashMismatch = 0;

for (const def of CATALOG_PACKS) {
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
        console.error(`실물 파일이 없습니다: ${primary.path}`);
        process.exit(2);
      }
      const buffer = readFileSync(fileAbs);
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      if (primary.sha256 && sha256 !== primary.sha256) {
        hashMismatch += 1;
        console.error(`해시 불일치: ${asset.id}`);
        continue;
      }
      if (buffer.length !== primary.bytes) {
        console.error(`크기 불일치: ${asset.id} manifest=${primary.bytes} disk=${buffer.length}`);
        process.exit(2);
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
    ...(def.note ? { note: def.note } : {}),
  });
}

const crowdPacks = CROWD_PACKS.map((def) => {
  let glbAssets = 0;
  for (const ingestId of def.ingest) {
    glbAssets += (assetsByPack.get(ingestId) ?? []).filter((asset) => asset.format === "glb").length;
  }
  return {
    catalogIds: def.catalogIds,
    title: def.title,
    creator: def.creator,
    category: "crowd-render-only",
    glbAssets,
    ...(def.note ? { note: def.note } : {}),
  };
});

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
  pendingPacks: PENDING_PACKS,
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

console.log(`packs: ${packs.length}, placeable assets: ${assets.length}, presets: ${presets.length}`);
console.log(`crowd GLB (render-only): ${output.totals.crowdGlbAssets}, deferred: ${output.totals.deferredAssets}, hash mismatches skipped: ${hashMismatch}`);
for (const pack of packs) {
  console.log(`  ${pack.title}: placeable ${pack.placeable}, twin ${pack.twinCovered}, deferred ${JSON.stringify(pack.deferred)}`);
}
if (!dryRun) {
  writeFileSync(resolve(outPath), JSON.stringify(output) + "\n");
  console.log(`written: ${resolve(outPath)} (${statSync(resolve(outPath)).size} bytes)`);
} else {
  console.log("dry-run: nothing written");
}
