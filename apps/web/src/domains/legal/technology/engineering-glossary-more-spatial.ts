import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 3D · 공간. 입체 모델과 가상 공간을 이루는 말들. */
export const GLOSSARY_MORE_SPATIAL: readonly GlossaryTerm[] = [
  {
    id: "mesh",
    category: "spatial",
    term: t("메시 (삼각형 그물)", "Mesh (triangle net)"),
    definition: t(
      "3D 물체의 표면을 작은 삼각형 수만 개로 이어 붙여 표현한 그물입니다. 정점(점)과 삼각형(면)의 목록으로 이루어집니다.",
      "A net that represents a 3D object's surface as thousands of tiny triangles, stored as lists of vertices (points) and triangles (faces).",
    ),
    analogy: t(
      "철사로 엮은 닭장 그물을 사람 모양으로 구부린 뒤 천을 씌운 조각상과 같습니다. 삼각형이 많을수록 곡선이 매끄럽고, 무거워집니다.",
      "Like a chicken-wire figure bent into a person's shape and covered with cloth: more triangles mean smoother curves and a heavier object.",
    ),
    inToonstudio: t(
      "한도를 코드로 못 박아 브라우저가 멈추지 않게 합니다. 3D 에셋 메타데이터의 삼각형 상한은 2,000,000(studio-bg3d-asset-metadata.ts), 불리언 연산 입력은 삼각형 500,000·출력 1,000,000(studio-manifold-mesh-provider.ts)입니다. 편집용 메시는 half-edge 구조(studio-editable-half-edge-mesh.ts)로 다룹니다.",
      "Limits are written into code so the browser never stalls: the triangle cap in 3D asset metadata is 2,000,000 (studio-bg3d-asset-metadata.ts), and boolean operations accept 500,000 input and 1,000,000 output triangles (studio-manifold-mesh-provider.ts). Editable meshes use a half-edge structure (studio-editable-half-edge-mesh.ts).",
    ),
    chapters: ["web-3d-engine", "precision-geometry"],
    atlasIds: ["glb-optimization-pipeline"],
  },
  {
    id: "bvh",
    category: "spatial",
    term: t("BVH (경계 부피 계층)", "BVH (bounding volume hierarchy)"),
    definition: t(
      "수많은 삼각형을 상자 안의 상자로 묶어 두어, ‘이 광선·영역에 닿는 삼각형’을 전부 검사하지 않고 빠르게 찾는 자료구조입니다.",
      "A structure that nests triangles in boxes within boxes so ‘which triangles does this ray or region touch?’ is answered without testing every one.",
    ),
    analogy: t(
      "도서관에서 책을 한 권씩 뒤지는 대신 ‘층 → 서가 → 칸’ 순서로 좁혀 가는 것과 같습니다.",
      "Like narrowing down a library by floor, then shelf, then slot instead of checking every book.",
    ),
    inToonstudio: t(
      "three-mesh-bvh 0.9.13 위에 예산이 있는 공급자 모듈(studio-three-mesh-bvh-provider.ts: 삼각형 2,000,000·깊이 48·동시 작업 4 등)을 만들어 두었지만, 앱 코드에서 이 모듈을 부르는 곳은 테스트 밖에서 찾지 못했습니다(구현됨·미연결). LT 변환의 1차 경로는 BVH 가 아니라 이미지 기반 Sobel 이며, BVH 는 향후 숨은선 제거 가속 후보로만 기록돼 있습니다.",
      "A budgeted provider module (studio-three-mesh-bvh-provider.ts: 2,000,000 triangles, depth 48, 4 concurrent operations and so on) exists on top of three-mesh-bvh 0.9.13, but no caller outside tests was found (implemented, not wired). LT conversion's primary path is image-based Sobel, not BVH; BVH is only noted as a future hidden-line speed-up.",
    ),
    chapters: ["web-3d-engine", "web-3d-dcc-pipeline"],
    atlasIds: ["implemented-not-wired-modules"],
  },
  {
    id: "csg-boolean",
    category: "spatial",
    term: t("CSG · 불리언 연산", "CSG · boolean operations"),
    definition: t(
      "입체 두 개를 합치고(union), 빼고(difference), 겹친 부분만 남기는(intersection) 모델링 방식입니다.",
      "A modelling method that merges two solids (union), subtracts one from the other (difference) or keeps only the overlap (intersection).",
    ),
    analogy: t(
      "점토 덩어리 두 개로 하는 놀이와 같습니다. 붙이거나, 쿠키 틀로 도려내거나, 겹친 조각만 남깁니다.",
      "Like playing with two lumps of clay: stick them together, cut one out with a cookie cutter, or keep just the overlapping piece.",
    ),
    inToonstudio: t(
      "manifold-3d 3.5.1 을 감싼 공급자(studio-manifold-mesh-provider.ts)가 union·difference·intersection 을 하며, 입력 삼각형 500,000·출력 1,000,000·출력 128MiB·동시 작업 1개로 제한합니다. 하이브리드 DCC 의 모디파이어 스택과 3D 전문가 도구의 솔리드 합성이 이를 씁니다(studio-solid-boolean-backend.ts). 원본 manifold-3d 의 new Function 호출은 패치로 걷어 unsafe-eval 없이 돕니다.",
      "A provider around manifold-3d 3.5.1 (studio-manifold-mesh-provider.ts) performs union, difference and intersection, limited to 500,000 input and 1,000,000 output triangles, 128 MiB of output and one concurrent job. The hybrid DCC modifier stack and the 3D specialist solid compound use it (studio-solid-boolean-backend.ts). A patch removes manifold-3d's new Function call so it runs without unsafe-eval.",
    ),
    chapters: ["precision-geometry", "web-3d-dcc-pipeline"],
    atlasIds: ["opencascade-manifold-precision"],
  },
  {
    id: "uv-atlas",
    category: "spatial",
    term: t("UV · UV 아틀라스", "UV · UV atlas"),
    definition: t(
      "UV 는 3D 표면을 평평한 그림판에 펴 놓았을 때의 좌표이고, UV 아틀라스는 여러 조각을 한 장의 그림판에 효율적으로 배치한 것입니다.",
      "UV is the flat coordinate system you get by unfolding a 3D surface onto a sheet; a UV atlas packs many such pieces onto one sheet efficiently.",
    ),
    analogy: t(
      "상자를 펼쳐 전개도를 만들고 그 위에 그림을 그리는 것과 같습니다. 전개도를 한 장에 빽빽하게 배치하면 종이를 아낍니다.",
      "Like unfolding a box into a net and drawing on it; packing several nets tightly on one sheet saves paper.",
    ),
    inToonstudio: t(
      "xatlasjs 0.2.0 으로 UV 를 자동 전개하는 공급자(xatlas-uv/studio-xatlas-uv-provider.ts)가 Worker 로 구현돼 있습니다. 다만 xatlas-uv 폴더 밖에서 이 공급자를 부르는 코드는 찾지 못해 ‘구현됨·미연결’ 상태입니다. 발표에서 ‘UV 자동 전개를 제공한다’고 말하지 않습니다.",
      "A Worker-based provider (xatlas-uv/studio-xatlas-uv-provider.ts) that auto-unwraps UVs with xatlasjs 0.2.0 is implemented, but no code outside the xatlas-uv folder calls it, so it is ‘implemented, not wired’. The talk does not claim automatic UV unwrapping as a feature.",
    ),
    chapters: ["web-3d-dcc-pipeline", "precision-geometry"],
    atlasIds: ["implemented-not-wired-modules"],
  },
  {
    id: "ktx2-basis",
    category: "spatial",
    term: t("KTX2 · Basis (GPU 텍스처 압축)", "KTX2 · Basis (GPU texture compression)"),
    definition: t(
      "3D 모델의 텍스처를 작게 압축해 담고, 기기의 GPU 가 이해하는 형식으로 바꿔 쓰는 컨테이너(KTX2)와 압축 방식(Basis)입니다.",
      "A container (KTX2) and compression scheme (Basis) that stores 3D textures small and converts them into whatever format the device's GPU understands.",
    ),
    analogy: t(
      "여행용 압축팩에 담아 가서 숙소(기기)에서 그 나라 규격에 맞춰 푸는 것과 같습니다. 짐은 작게, 푸는 방식은 현지에 맞게.",
      "Like packing in a travel vacuum bag and unpacking to local standards at the hotel (the device): small to carry, adapted on arrival.",
    ),
    inToonstudio: t(
      "GLB 의 필수 확장 허용 목록에 KHR_texture_basisu 가 들어 있고(studio-bg3d-meshopt.ts), 변환기를 쓰기 전에 입력 바이트를 검사하는 입장 한도를 둡니다. 변환 입력 64MiB 상한과 SHA-256 으로 인증된 능력만 허용합니다(studio-bg3d-ktx2-transcoder-contract.ts). ktx2-encoder 0.6.0 의 new Function 호출은 패치로 걷었습니다.",
      "KHR_texture_basisu is on the GLB required-extension allowlist (studio-bg3d-meshopt.ts), and admission limits inspect the bytes before a transcoder may see them: a 64 MiB input cap and a capability attested by SHA-256 (studio-bg3d-ktx2-transcoder-contract.ts). A patch removes the new Function call from ktx2-encoder 0.6.0.",
    ),
    chapters: ["web-3d-dcc-pipeline", "web-3d-engine"],
    atlasIds: ["glb-optimization-pipeline"],
  },
  {
    id: "meshopt",
    category: "spatial",
    term: t("meshopt 압축 (EXT_meshopt_compression)", "meshopt compression (EXT_meshopt_compression)"),
    definition: t(
      "3D 모델의 점·삼각형 데이터를 작게 줄여 담고, 읽을 때 빠르게 풀 수 있게 하는 glTF 압축 확장입니다.",
      "A glTF extension that shrinks a 3D model's vertex and triangle data and unpacks quickly at load time.",
    ),
    analogy: t(
      "이삿짐 상자의 빈틈을 메우고 부피를 줄여 포개는 것과 같습니다. 같은 짐이 더 적은 트럭에 실립니다.",
      "Like filling the gaps in moving boxes and nesting them so the same load fits fewer trucks.",
    ),
    inToonstudio: t(
      "표준 허용 목록(STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS)에는 EXT_meshopt_compression·KHR_mesh_quantization·KHR_texture_basisu·EXT_texture_webp 가 있고 Draco(KHR_draco_mesh_compression)는 없습니다. 디코더는 동적 import 로 3D 작업실에 들어갈 때만 내려받아, 3D를 안 쓰는 사용자는 WASM 비용을 내지 않습니다(studio-bg3d-meshopt.ts).",
      "The canonical allowlist (STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS) holds EXT_meshopt_compression, KHR_mesh_quantization, KHR_texture_basisu and EXT_texture_webp, and not Draco (KHR_draco_mesh_compression). The decoder is a dynamic import fetched only when the 3D workspace is entered, so users who never use 3D do not pay the WASM cost (studio-bg3d-meshopt.ts).",
    ),
    chapters: ["web-3d-dcc-pipeline", "performance-budget"],
    atlasIds: ["glb-optimization-pipeline"],
  },
  {
    id: "pbr",
    category: "spatial",
    term: t("PBR (물리 기반 재질)", "PBR (physically based rendering)"),
    definition: t(
      "금속성·거칠기 같은 실제 물질의 성질로 재질을 정의해, 어떤 조명 아래서도 그럴듯하게 보이게 하는 재질 방식입니다.",
      "A material model defined by real-world properties such as metalness and roughness, so surfaces look plausible under any lighting.",
    ),
    analogy: t(
      "‘빨간색으로 칠해라’ 대신 ‘이 소재는 광택 나는 플라스틱이다’라고 적는 것과 같습니다. 낮이든 밤이든 소재의 성질이 알아서 보입니다.",
      "Like writing ‘this is glossy plastic’ instead of ‘paint it red’: day or night, the material's nature shows by itself.",
    ),
    inToonstudio: t(
      "소품 GLB 의 재질은 Three.js MeshStandardMaterial 로 읽습니다. glTF 구조 복제본은 캐시가 가진 재질을 공유하므로, userData.toonspectrum_tintable 이 표시된 재질만 복제해 색을 바꿔 공유 캐시를 오염시키지 않습니다(vrm/studio-vrm-prop-material.ts). 캐릭터는 PBR 이 아니라 MToon 으로 그립니다.",
      "Prop GLB materials are read as Three.js MeshStandardMaterial. Structural clones of a glTF share cache-owned materials, so only materials flagged userData.toonspectrum_tintable are cloned before recolouring, keeping the shared cache clean (vrm/studio-vrm-prop-material.ts). Characters are drawn with MToon, not PBR.",
    ),
    chapters: ["web-3d-engine", "threejs-r3f"],
    atlasIds: ["three-r3f-viewport"],
  },
  {
    id: "mtoon",
    category: "spatial",
    term: t("MToon (툰 셰이딩)", "MToon (toon shading)"),
    definition: t(
      "캐릭터를 만화·애니메이션처럼 보이게 하는 VRM 표준 셰이더입니다. 부드러운 명암 대신 또렷한 단계와 윤곽선으로 그립니다.",
      "The VRM standard shader that makes characters look like cartoons, with crisp shading steps and outlines instead of smooth gradients.",
    ),
    analogy: t(
      "사진을 셀 애니메이션 종이에 옮겨 그린 것과 같습니다. 그림자는 ‘있다/없다’ 두세 단계로 나뉩니다.",
      "Like redrawing a photo on a cel-animation sheet: shadows come in two or three steps, present or not.",
    ),
    inToonstudio: t(
      "같은 VRM 을 WebGPU 와 WebGL 두 엔진으로 그리면 색이 다릅니다. 번들 VRM 한 개·한 장면 실측에서 합성 최대 차이가 164~169/255 였고, 같은 엔진 두 번은 0이라 원인은 MToon 구현입니다(docs/studio-bg3d-vrm-mtoon-backend-color-divergence-2026-08-29.md). 윤곽 일치만 게이트로 삼고 색은 비교하지 않았던 빈틈을 이 측정이 드러냈습니다.",
      "The same VRM drawn by the WebGPU and WebGL engines comes out in different colours. One bundled VRM in one scene showed a maximum composite difference of 164-169/255 while two runs on the same engine matched exactly, which points at MToon itself (docs/studio-bg3d-vrm-mtoon-backend-color-divergence-2026-08-29.md). The gate had compared silhouettes only, and this measurement exposed that colour had never been checked.",
    ),
    chapters: ["vrm-standard", "web-3d-engine"],
    atlasIds: ["webgpu-explicit-engine"],
  },
  {
    id: "humanoid-bones",
    category: "spatial",
    term: t("휴머노이드 본 (표준 뼈 이름)", "Humanoid bones (standard bone names)"),
    definition: t(
      "VRM 이 정한 사람 뼈대의 표준 이름 목록(hips, spine, head, leftHand …)입니다. 어떤 캐릭터든 같은 이름으로 포즈를 줄 수 있습니다.",
      "VRM's standard list of human skeleton names (hips, spine, head, leftHand ...), letting any character be posed by the same names.",
    ),
    analogy: t(
      "사람 몸의 해부도 용어와 같습니다. 어느 병원에서든 ‘오른쪽 팔꿈치’라고 하면 같은 곳을 가리킵니다.",
      "Like anatomy terms: in any hospital, ‘right elbow’ points to the same place.",
    ),
    inToonstudio: t(
      "studio-humanoid-bones.ts 의 STUDIO_HUMANOID_BONE_NAMES 가 단일 허용 목록입니다. 저장된 포즈가 임의의 장면 노드 이름을 가리키지 못하게 해, 한 가져오기 도구에 묶이는 일과 신뢰할 수 없는 파일이 엉뚱한 노드를 건드리는 일을 막습니다. 이 덕에 포즈·손발 IK·웹캠 추적이 어떤 VRM 에도 같은 이름으로 적용됩니다.",
      "STUDIO_HUMANOID_BONE_NAMES in studio-humanoid-bones.ts is the single allowlist. Saved poses cannot address arbitrary scene-node names, which avoids coupling to one importer and stops untrusted files from touching unrelated nodes. Poses, hand and foot IK and webcam tracking therefore work on any VRM by the same names.",
    ),
    chapters: ["vrm-standard", "web-3d-engine"],
    atlasIds: ["vrm-humanoid-rig"],
  },
  {
    id: "webxr",
    category: "spatial",
    term: t("WebXR (VR · AR 세션)", "WebXR (VR and AR sessions)"),
    definition: t(
      "브라우저에서 VR 헤드셋이나 AR 화면을 쓰게 해 주는 표준입니다. 기기가 위치와 방향을 추적하고, 그 위에 3D 장면을 보여 줍니다.",
      "A standard for using VR headsets and AR views in the browser: the device tracks position and orientation, and a 3D scene is shown on top.",
    ),
    analogy: t(
      "안경 대신 쓰는 창문과 같습니다. 창문(기기)이 내 위치를 알려 주고, 창밖 풍경(3D 장면)은 앱이 그립니다.",
      "Like a window you wear instead of glasses: the window (device) tracks where you are and the app paints the view outside.",
    ),
    inToonstudio: t(
      "studio-webxr-session.ts 는 기존 Three.js 렌더러를 위한 좁은 세션 권한 모듈로, immersive-ar·immersive-vr 두 모드의 지원 여부(supported / unsupported / unknown)를 먼저 확인합니다. XRSession·참조 공간·프레임은 프로젝트 데이터가 아니므로 문서나 OPFS 에 저장하지 않습니다. 실기기 검증 범위는 코드로 확인하지 못했습니다(미확인).",
      "studio-webxr-session.ts is a narrow session-authority module for the existing Three.js renderer; it first reports support (supported / unsupported / unknown) for immersive-ar and immersive-vr. XRSession, reference spaces and frames are not project data and are never serialized into a document or OPFS. How far real-device verification goes could not be confirmed from code (unconfirmed).",
    ),
    chapters: ["nextgen-web-experiments", "web-3d-engine"],
  },
  {
    id: "tiled-map",
    category: "spatial",
    term: t("Tiled 맵 (타일맵)", "Tiled map (tilemap)"),
    definition: t(
      "세계를 같은 크기의 타일 칸으로 나누고 칸마다 어떤 그림 조각을 놓을지 번호로 적어 둔 지도 형식입니다. 무료 지도 편집기 Tiled 의 JSON 이 널리 쓰입니다.",
      "A map format that divides the world into equal tiles and records, per cell, a number saying which picture piece to place. The JSON of the free editor Tiled is widely used.",
    ),
    analogy: t(
      "모눈종이에 칸마다 스티커 번호를 적어 둔 설계도와 같습니다. 그림은 스티커 시트 한 장이고, 지도는 번호표입니다.",
      "Like graph paper with a sticker number in each square: the pictures live on one sticker sheet, the map is just the numbering.",
    ),
    inToonstudio: t(
      "기본 가상 스튜디오 월드가 Tiled JSON(apps/web/public/assets/virtual-studio/world/default-world.json: orthogonal 640×480칸·칸 크기 2px·레이어 12개)입니다. 타일 번호(gid)는 STUDIO_WORLD_TILE_GID_MASK = 0x0fffffff 로 아래 28비트만 번호로 읽고, 월드를 코드가 아니라 데이터로 적어 둡니다.",
      "The default virtual-studio world is Tiled JSON (apps/web/public/assets/virtual-studio/world/default-world.json: orthogonal, 640x480 cells, 2 px per cell, 12 layers). A tile id (gid) is read from the low 28 bits via STUDIO_WORLD_TILE_GID_MASK = 0x0fffffff, and the world is written as data rather than code.",
    ),
    chapters: ["virtual-studio-world-authority", "spatial-collaboration-products"],
    atlasIds: ["tiled-world-data-model"],
  },
  {
    id: "a-star-pathfinding",
    category: "spatial",
    term: t("A* 길찾기", "A* pathfinding"),
    definition: t(
      "격자 위에서 ‘지금까지 온 거리 + 남은 거리 추정’이 가장 작은 칸부터 살피며 가장 짧은 길을 찾는 알고리즘입니다.",
      "An algorithm that searches a grid, always expanding the cell with the smallest (distance so far + estimated distance left), to find the shortest path.",
    ),
    analogy: t(
      "내비게이션이 막다른 골목을 일일이 가 보지 않고, 목적지 방향의 유망한 길부터 시도하는 것과 같습니다.",
      "Like a navigator that skips exploring every dead end and tries the promising roads toward the destination first.",
    ),
    inToonstudio: t(
      "가상 스튜디오에서 클릭한 곳으로 걸어갈 길을 찾습니다(virtual-space/studio-virtual-space-world-pathfinding.ts). 힙(CellHeap)과 gScore·fScore·cameFrom 으로 탐색하고, 한 번에 펼치는 칸을 MAX_EXPANSIONS = 150,000 으로 제한하며 경로 캐시는 2,000개까지 둡니다. 대각선 모서리를 깎지 않도록 여유(CORNER_CLEARANCE_CELLS = 0.5)를 줍니다.",
      "In the virtual studio it finds the path to a clicked spot (virtual-space/studio-virtual-space-world-pathfinding.ts). It searches with a heap (CellHeap) and gScore, fScore and cameFrom, caps one search at MAX_EXPANSIONS = 150,000 cells and keeps up to 2,000 cached paths. A clearance margin (CORNER_CLEARANCE_CELLS = 0.5) stops paths from cutting diagonal corners.",
    ),
    chapters: ["virtual-studio-world-authority", "spatial-collaboration-products"],
    atlasIds: ["pathfinding-astar-los"],
  },
  {
    id: "proximity-hysteresis",
    category: "spatial",
    term: t("근접 히스테리시스 (들어올 때와 나갈 때 기준 다르게)", "Proximity hysteresis"),
    definition: t(
      "‘가까워졌다’고 판단하는 거리와 ‘멀어졌다’고 판단하는 거리를 다르게 두어, 경계에서 상태가 깜빡이는 것을 막는 규칙입니다.",
      "Using a different distance to decide ‘near’ than to decide ‘far’ so the state does not flicker at the boundary.",
    ),
    analogy: t(
      "에어컨 설정 온도와 같습니다. 26도에서 켜지고 24도에서 꺼지게 하면 25도 언저리에서 계속 켜졌다 꺼지지 않습니다.",
      "Like an air-conditioner thermostat: on at 26 and off at 24 means it does not click on and off around 25.",
    ),
    inToonstudio: t(
      "가상 스튜디오의 근처 대화는 120px 안에 300ms 머물러야 들어가고(STUDIO_ACOUSTIC_ENTER_RADIUS/ENTER_MS), 156px 밖에 800ms 있어야 나갑니다(EXIT_RADIUS/EXIT_MS). 경계에서 어정쩡하게 서 있어도 대화가 켜졌다 꺼지지 않습니다(virtual-space/studio-virtual-space-acoustics.ts). 이 숫자는 설계값이며 부하·체감 시험 결과가 아닙니다.",
      "Nearby conversation in the virtual studio starts only after staying within 120 px for 300 ms (STUDIO_ACOUSTIC_ENTER_RADIUS/ENTER_MS) and ends only after being beyond 156 px for 800 ms (EXIT_RADIUS/EXIT_MS), so standing on the edge does not toggle the call on and off (virtual-space/studio-virtual-space-acoustics.ts). The numbers are design values, not measured results.",
    ),
    chapters: ["virtual-studio-world-authority", "webrtc-media-authority"],
    atlasIds: ["space-is-not-permission", "proximity-hysteresis-160-220"],
  },
  {
    id: "b-rep-tessellation",
    category: "spatial",
    term: t("B-Rep · 테셀레이션", "B-Rep · tessellation"),
    definition: t(
      "B-Rep 은 입체를 ‘면·모서리·꼭짓점’의 수학 곡면으로 정확히 기록하는 CAD 방식이고, 테셀레이션은 그 곡면을 화면용 삼각형으로 잘게 쪼개는 일입니다.",
      "B-Rep records a solid exactly as mathematical faces, edges and vertices (the CAD way); tessellation slices those curved faces into triangles for display.",
    ),
    analogy: t(
      "구의 정확한 공식(B-Rep)과 지구본의 사각 조각 지도(테셀레이션)의 차이입니다. 공식은 정확하고, 지도는 눈에 보이고 가볍습니다.",
      "The difference between a sphere's exact formula (B-Rep) and a flat gore map glued onto a globe (tessellation): one is exact, the other is visible and light.",
    ),
    inToonstudio: t(
      "opencascade.js 1.1.1(OpenCascade, LGPL-2.1)을 별도 WASM 모듈로 동적 로드해 정밀 입체 연산을 합니다(studio-occt-wasm-facade.ts). 스튜디오 셸 번들에는 들어가지 않고 Worker 로 부르며(studio-occt-worker-client.ts), 결과는 삼각형으로 쪼갠 편집 메시와 ‘위상 영수증’(경계 모서리·비다양체 모서리 수)으로 대조합니다.",
      "opencascade.js 1.1.1 (OpenCascade, LGPL-2.1) is loaded dynamically as a separate WASM module for precise solid operations (studio-occt-wasm-facade.ts). It stays out of the studio shell bundle and is called through a Worker (studio-occt-worker-client.ts); results are checked against the tessellated edit mesh with a topology receipt (boundary-edge and non-manifold-edge counts).",
    ),
    chapters: ["precision-geometry", "web-3d-dcc-pipeline"],
    atlasIds: ["opencascade-manifold-precision"],
  },
];
