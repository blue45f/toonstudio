import { CREATOR, D, row, t } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 엔진·표준 영역의 추가분(3D 전문 엔진 후보, 2D 캔버스 엔진 후보, 번역·줄바꿈 품질 기준).
 * 앞부분의 대표 엔진(Three.js·Babylon.js·PlayCanvas·Godot·Unity·Unreal 등)은 engineering-map-competitors-rows-market.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 * 표준은 ‘벤치마크·품질 기준으로 코드가 직접 인용한 것’만 싣는다(glTF·VRM 같은 채택한 파일 형식은 용어집과 오픈소스 지도에 있다).
 */

const TOPOLOGY = "docs/studio-3d-engine-specialist-topology-2026-07-18.md";
const CHARACTER_ALTERNATIVES = "docs/reports/character-lab-engine-alternatives-2026-10-01.md";
const ENGINE_EVALUATION = "docs/reports/studio-3d-engine-evaluation-2026-09-12.md";
const CANVAS_DECISION = "docs/studio-canvas-engine-decision-2026-07-24.md";
const LOCALIZATION_QA = "docs/webtoon-localization-qa-benchmark-2026-09-03.md";
const RUNTIME_TOPOLOGY = `${CREATOR}/bg3d/studio-bg3d-runtime-topology.ts`;
const LETTERING = `${CREATOR}/lettering`;

export const COMPETITOR_ROWS_ENGINES: readonly EngineeringMapRow[] = [
  row({
    id: "spark-splat-renderer",
    name: "Spark (splat renderer)",
    domain: D.engines,
    url: "https://sparkjs.dev/",
    what: t(
      "Three.js 장면 안에서 도는 가우시안 스플랫(점 구름을 번지게 그리는 3D 기법) 렌더러입니다. 정렬한 스플랫을 한 번의 묶음 그리기로 합친다고 문서가 적었습니다.",
      "A Gaussian splat renderer (a 3D technique that draws point clouds as soft blobs) that runs inside a Three.js scene. The document says it sorts splats and combines them into one instanced draw.",
    ),
    learned: t(
      "결론: 두 번째 범용 엔진 없이 기존 Three 장면에 스플랫 배경을 넣는 1순위 후보. 채택: 의존성으로 설치했고 ‘정본 3D 렌더러가 아닌 제한된 참고 뷰어’로만 씀.",
      "Conclusion: top candidate for putting splat backgrounds into the existing Three scene without a second general engine. Adopted: installed as a dependency and used only as a bounded reference viewer, never the canonical 3D renderer.",
    ),
    overlap: t("스플랫 참고 뷰어(splat-reference-runtime).", "The splat reference viewer (splat-reference-runtime)."),
    evidence: [TOPOLOGY, `${CREATOR}/scene3d/specialists/splat-reference-runtime.ts`, "package.json"],
  }),
  row({
    id: "google-filament",
    name: "Google Filament",
    domain: D.engines,
    url: "https://google.github.io/filament/",
    what: t(
      "모바일을 겨냥한 물리 기반 렌더링(PBR) 엔진입니다. 문서는 WASM 판의 WebGL2 백엔드와 glTF/GLB, 압축 확장(Draco·KTX2·meshopt), 스킨·모프 애니메이션 지원을 정리했습니다.",
      "A mobile-oriented physically based rendering (PBR) engine. The document noted the WASM build's WebGL2 backend, glTF/GLB, compression extensions (Draco, KTX2, meshopt) and skin and morph animation.",
    ),
    learned: t(
      "결론: 편집 엔진이 아니라 재질(PBR) 기준 렌더와 glTF 호환 검증용 보조 후보. 캐릭터 실험실에서는 웹 백엔드가 WebGL2뿐이라는 점 등으로 제외. 코드에는 격리 실험(lab) 자리만 있음.",
      "Conclusion: not an editing engine; a candidate helper for PBR reference renders and glTF compatibility checks. The character lab excluded it, among other reasons because its web backend is WebGL2 only. Code holds only an isolated lab slot.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 Filament 실험(lab) 자리.", "The Filament lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, CHARACTER_ALTERNATIVES, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "cesiumjs",
    name: "CesiumJS",
    domain: D.engines,
    url: "https://cesium.com/learn/cesiumjs-fundamentals/",
    urlTitle: "CesiumJS fundamentals",
    what: t(
      "지구 전체(WGS84) 지도와 지형, 3D Tiles 스트리밍을 다루는 WebGL 엔진입니다. 문서는 도시·거리·지형을 큰 규모로 스트리밍해 카메라 구도를 뽑는 쓰임을 비교했습니다.",
      "A WebGL engine for a WGS84 globe, terrain and 3D Tiles streaming. The document compared its use for streaming cities, streets and terrain at scale and extracting camera compositions.",
    ),
    learned: t(
      "결론: 지리 장면 전용 보조(specialist)로만 검토. 일반 3D 편집 엔진으로는 쓰지 않음. 코드에는 격리 실험(lab) 자리만 있고 설치 의존성은 아님.",
      "Conclusion: considered only as a helper for geographic scenes, never as a general 3D editing engine. Code holds only an isolated lab slot and it is not an installed dependency.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 Cesium 실험(lab) 자리.", "The Cesium lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "xeokit",
    name: "xeokit",
    domain: D.engines,
    url: "https://xeokit.github.io/xeokit-sdk/",
    what: t(
      "건축·공학(BIM) 모델과 의미 데이터에 특화된 웹 뷰어입니다. 문서는 SDK 페이지가 AGPL과 상용 이중 라이선스를 밝힌다는 점까지 적었습니다.",
      "A web viewer specialized for architectural and engineering (BIM) models and semantic data. The document also records that its SDK page states a dual AGPL and commercial license.",
    ),
    learned: t(
      "결론: 건축 배경의 층·부재 검색과 단면 용도로 기술 적합하나 AGPL 또는 상용 라이선스 검토가 필수라 설치하지 않음. 코드에는 격리 실험(lab) 자리만 있음.",
      "Conclusion: technically suited to floor and element search and sections for architectural backgrounds, but AGPL or commercial licensing must be reviewed first, so it is not installed. Code holds only an isolated lab slot.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 xeokit 실험(lab) 자리.", "The xeokit lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "potree",
    name: "Potree",
    domain: D.engines,
    url: "https://github.com/potree/potree",
    urlTitle: "Potree repository",
    what: t(
      "Three.js 기반의 대규모 포인트 클라우드(점 구름) WebGL 뷰어입니다. octree 구조로 여러 해상도를 나눠 읽고 LAS/LAZ 변환 도구가 따라온다고 문서가 적었습니다.",
      "A large-scale WebGL point-cloud viewer built on Three.js. The document says it reads multiple resolutions through an octree and comes with LAS and LAZ conversion tooling.",
    ),
    learned: t(
      "결론: 스캔 배경·LiDAR 소재를 메시로 바꾸지 않고 탐색·구도 추출하는 포인트 클라우드 전용 보조 후보. 기존 Three 버전과의 충돌은 격리해야 함. 설치 의존성은 아님.",
      "Conclusion: a point-cloud-only helper candidate for browsing and composing scan backgrounds without meshing them. Conflicts with the existing Three version must be isolated. Not an installed dependency.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 Potree 실험(lab) 자리.", "The Potree lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "deck-gl",
    name: "deck.gl",
    domain: D.engines,
    url: "https://deck.gl/",
    what: t(
      "luma.gl 위에서 대규모 지리·데이터 레이어를 그리는 시각화 프레임워크입니다. 문서는 공식 문서가 WebGPU는 아직 상용 준비가 안 됐다고 적은 점까지 기록했습니다.",
      "A visualization framework that draws large geographic and data layers on top of luma.gl. The document also records that its official docs say WebGPU is not yet production-ready.",
    ),
    learned: t(
      "결론: 수십만 개 지리 객체·점·경로를 데이터 중심으로 보여 주는 데이터 시각화 전용 보조로만 검토. 일반 편집 엔진으로 쓰지 않음.",
      "Conclusion: considered only as a data-visualization helper for showing hundreds of thousands of geographic objects, points and paths. Not used as a general editing engine.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 deck.gl 실험(lab) 자리.", "The deck.gl lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "maplibre-gl-js",
    name: "MapLibre GL JS",
    domain: D.engines,
    url: "https://maplibre.org/maplibre-gl-js/docs/",
    urlTitle: "MapLibre GL JS documentation",
    what: t(
      "WebGL로 벡터 타일 지도를 그리는 오픈소스 라이브러리입니다. 지도 카메라와 깊이를 공유하는 3D 사용자 정의 레이어 계약이 있다고 문서가 적었습니다.",
      "An open-source library that draws vector-tile maps with WebGL. The document notes a custom 3D layer contract that shares the map camera and depth.",
    ),
    learned: t(
      "결론: 배경 지도·건물·경로를 스트리밍해 Studio 카메라와 배치로 바꾸는 지도 전용 보조 후보. 일반 3D 편집 엔진으로 쓰지 않음.",
      "Conclusion: a map-only helper candidate for streaming background maps, buildings and routes and turning them into Studio camera and placement. Not used as a general 3D editing engine.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 MapLibre 실험(lab) 자리.", "The MapLibre lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "vtk-js",
    name: "VTK.js",
    domain: D.engines,
    url: "https://kitware.github.io/vtk-js/",
    what: t(
      "과학·의료 데이터를 시각화하는 Kitware의 웹 라이브러리입니다. 문서는 GPU 볼륨 렌더링과 스칼라·벡터·텐서 파이프라인, 위젯을 정리했습니다.",
      "Kitware's web library for scientific and medical visualization. The document noted GPU volume rendering, scalar, vector and tensor pipelines, and widgets.",
    ),
    learned: t(
      "결론: CT·과학 볼륨이 제품 범위가 될 때만 의미가 있는 현재 범위 밖 보조 후보. 코드에는 격리 실험(lab) 자리만 있음.",
      "Conclusion: a helper candidate outside today's scope, relevant only if CT or scientific volumes become part of the product. Code holds only an isolated lab slot.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 VTK 실험(lab) 자리.", "The VTK lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "wonderland-engine",
    name: "Wonderland Engine",
    domain: D.engines,
    url: "https://wonderlandengine.com/documentation/",
    urlTitle: "Wonderland Engine documentation",
    what: t(
      "웹 중심의 가벼운 3D 엔진입니다. 데스크톱 에디터와 WebAssembly 런타임, WebXR을 갖췄다고 문서가 적었습니다.",
      "A lightweight web-focused 3D engine. The document notes a desktop editor, a WebAssembly runtime and WebXR.",
    ),
    learned: t(
      "결론: 내장 편집기 교체에는 부적합하고 독립 XR 체험 후보로만 봄. 캐릭터 실험실에서는 런타임·에디터 약관이 닫혀 있어 공급망 정책과 맞지 않아 제외.",
      "Conclusion: unsuitable to replace the built-in editor and seen only as a candidate for standalone XR experiences. The character lab excluded it because its runtime and editor terms are closed and clash with the supply-chain policy.",
    ),
    overlap: t("3D 배경 런타임 위상 표의 Wonderland 실험(lab) 자리.", "The Wonderland lab slot in the 3D background runtime topology."),
    evidence: [TOPOLOGY, CHARACTER_ALTERNATIVES, RUNTIME_TOPOLOGY],
  }),
  row({
    id: "needle-engine",
    name: "Needle Engine",
    domain: D.engines,
    url: "https://engine.needle.tools/docs/",
    urlTitle: "Needle Engine documentation",
    what: t(
      "Three.js 위의 컴포넌트 시스템으로, Rapier 물리·XR·네트워킹과 Blender·Unity 제작 도구, 에셋 압축 파이프라인을 묶는다고 문서가 적었습니다.",
      "A component system on top of Three.js that, per the document, bundles Rapier physics, XR, networking, Blender and Unity authoring and an asset-compression pipeline.",
    ),
    learned: t(
      "결론: 런타임을 병행하기보다 ‘DCC에서 만든 상호작용 장면을 웹 패키지로 전달하는 파이프라인’의 참고로 봄. Three 포크와 버전 중복 검증이 필요하다고 기록.",
      "Conclusion: treated as a reference for a pipeline that delivers DCC-made interactive scenes as web packages rather than as a parallel runtime. Duplicate Three forks and versions would need checking.",
    ),
    overlap: t("겹치는 ToonStudio 기능은 문서에 적혀 있지 않음(참고만).", "No overlapping ToonStudio feature is recorded (reference only)."),
    evidence: [TOPOLOGY],
  }),
  row({
    id: "verge3d",
    name: "Verge3D",
    domain: D.engines,
    url: "https://www.soft8soft.com/verge3d/",
    what: t(
      "Blender·3ds Max·Maya와 연계해 비주얼 스크립팅으로 glTF 기반 웹 3D를 출판하는 상용 도구입니다. 문서가 기능을 정리했습니다.",
      "A commercial tool that publishes glTF-based web 3D through visual scripting, linked with Blender, 3ds Max and Maya. The document listed its features.",
    ),
    learned: t(
      "결론: 비개발자용 외부 상호작용 장면 제작·출판 후보이지만 Studio 핵심 런타임에는 부적합한 상용 DCC 파이프라인으로 봄. 도입하지 않음.",
      "Conclusion: seen as a commercial DCC pipeline for non-developer interactive scenes, unsuitable for Studio's core runtime. Not adopted.",
    ),
    overlap: t("겹치는 ToonStudio 기능은 문서에 적혀 있지 않음(참고만).", "No overlapping ToonStudio feature is recorded (reference only)."),
    evidence: [TOPOLOGY],
  }),
  row({
    id: "bevy",
    name: "Bevy",
    domain: D.engines,
    url: "https://bevy.org/",
    what: t(
      "Rust로 만든 ECS(개체-구성요소-시스템) 게임 엔진입니다. 문서는 웹(WASM) 배포를 위한 크기 최적화 설정과 네이티브·웹 코드 공유를 정리했습니다.",
      "A Rust ECS (entity-component-system) game engine. The document noted size-optimization settings for web (WASM) delivery and code shared between native and web.",
    ),
    learned: t(
      "결론: React 편집기 대체로는 부적합하고, 구체적인 시뮬레이션 요구가 있을 때의 별도 WASM 실험 또는 장기 후보로만 둠. 당시 세션에 필요한 빌드 도구가 없어 렌더 레인을 만들지 못함.",
      "Conclusion: unsuitable to replace the React editor; kept only as a separate WASM lab or long-term candidate when a concrete simulation need appears. A needed build tool was missing in that session, so no render lane was built.",
    ),
    overlap: t("겹치는 ToonStudio 기능은 문서에 적혀 있지 않음(후보만).", "No overlapping ToonStudio feature is recorded (candidate only)."),
    evidence: [TOPOLOGY, CHARACTER_ALTERNATIVES],
  }),
  row({
    id: "a-frame",
    name: "A-Frame",
    domain: D.engines,
    url: "https://aframe.io/",
    what: t(
      "Three.js 위에 선언형 ECS를 얹은 WebXR 프레임워크입니다. 헤드셋·컨트롤러 지원이 넓다고 문서가 적었습니다.",
      "A WebXR framework that puts a declarative ECS on top of Three.js. The document notes broad headset and controller support.",
    ),
    learned: t(
      "결론: 빠른 XR 시제품과 교육용 장면 제작에는 맞지만, 이미 Three를 쓰므로 별도 렌더 엔진으로서의 이점이 없다고 판단. 도입하지 않음.",
      "Conclusion: fine for quick XR prototypes and teaching scenes, but with Three already in use it offers no advantage as a separate render engine. Not adopted.",
    ),
    overlap: t("겹치는 ToonStudio 기능은 문서에 적혀 있지 않음(후보만).", "No overlapping ToonStudio feature is recorded (candidate only)."),
    evidence: [TOPOLOGY],
  }),
  row({
    id: "model-viewer",
    name: "model-viewer",
    domain: D.engines,
    url: "https://modelviewer.dev/",
    what: t(
      "GLB 모델 표시, 카메라 조작, 모바일 AR 진입을 웹 컴포넌트로 주는 라이브러리입니다.",
      "A web component for displaying GLB models, camera controls and entering mobile AR.",
    ),
    learned: t(
      "결론: 편집 엔진이 아니라 라이브러리 카드의 안전한 단일 모델·AR 미리보기 후보. 이 문서는 후보로만 적었고 설치했다는 기록은 없음.",
      "Conclusion: not an editing engine; a candidate for safe single-model and AR previews on library cards. The document records it only as a candidate with no install on record.",
    ),
    overlap: t("겹치는 ToonStudio 기능은 문서에 적혀 있지 않음(후보만).", "No overlapping ToonStudio feature is recorded (candidate only)."),
    evidence: [TOPOLOGY],
  }),
  row({
    id: "cocos",
    name: "Cocos",
    domain: D.engines,
    url: "https://www.cocos.com/",
    what: t(
      "게임 엔진 계열입니다. 캐릭터 실험실의 엔진 대안 보고서는 엔진 코드는 MIT이지만 README가 에디터(Creator)와 떼어 쓰지 말라고 적은 점을 확인했습니다.",
      "A game engine family. The character lab's engine-alternatives report confirmed that the engine code is MIT but its README says not to use it independently of the Creator editor.",
    ),
    learned: t(
      "결론: 에디터에 종속돼 저장소 안에서 독립 빌드를 재현할 수 없다고 보아 제외. 도입하지 않음.",
      "Conclusion: excluded because it is tied to its editor, so a standalone build cannot be reproduced inside the repository. Not adopted.",
    ),
    overlap: t("겹치는 ToonStudio 기능 없음(제외한 사례로만 기록).", "No overlapping feature (recorded only as an excluded case)."),
    evidence: [CHARACTER_ALTERNATIVES],
  }),
  row({
    id: "havok",
    name: "Havok",
    domain: D.engines,
    what: t(
      "Babylon.js의 물리(Physics V2)에 쓰는 Havok 플러그인입니다. 캐릭터 실험실 보고서는 wasm 미설치와 천(cloth) 미지원을 확인했습니다.",
      "The Havok plugin used for Babylon.js physics (Physics V2). The character lab report confirmed that its wasm is not installed and that it has no cloth support.",
    ),
    learned: t(
      "결론: 직접 만든 결정적 체인·천 계산을 1급으로 두고 소품·접지에만 Rapier를 선택적으로 씀. Havok은 설치하지 않고 미설치 사유를 표시하기로 함.",
      "Conclusion: in-house deterministic chain and cloth simulation comes first, with Rapier optional for props and ground contact. Havok is not installed, and the plan is to show the reason for that.",
    ),
    overlap: t("캐릭터 실험실의 물리 레인(자체 체인·천, Rapier).", "The character lab's physics lane (in-house chains and cloth, Rapier)."),
    evidence: [CHARACTER_ALTERNATIVES, ENGINE_EVALUATION],
  }),
  row({
    id: "konva",
    name: "Konva",
    domain: D.engines,
    url: "https://konvajs.org/",
    what: t(
      "HTML5 캔버스로 레이어와 도형을 다루는 2D 라이브러리입니다. 스튜디오 편집기의 현행 캔버스 엔진이며 다른 캔버스 라이브러리를 평가할 때의 기준점이었습니다.",
      "A 2D library for layers and shapes on the HTML5 canvas. It is the Studio editor's current canvas engine and the baseline against which other canvas libraries were evaluated.",
    ),
    learned: t(
      "결론: 화이트보드 도구로 편집기 몸체를 갈아엎지 않고 Konva를 확정 요소·변형·레이어 탐색의 정본으로 유지. 다만 장기 목표는 이후 브라우저 네이티브 엔진 계획이 이어받았고 Konva는 단계적 이전 동안 복구 정본으로 남음.",
      "Conclusion: keep Konva as the authority for committed elements, transforms and layer navigation instead of swapping the editor body for a whiteboard tool. The long-term target was later taken over by a browser-native engine plan, with Konva remaining the recovery authority during the staged migration.",
    ),
    overlap: t("스튜디오 편집기의 확정 요소·레이어 탐색·내보내기 폴백 경로.", "Studio's committed elements, layer navigation and export fallback."),
    evidence: [CANVAS_DECISION, "package.json", `${CREATOR}/StudioKonvaBubbleNode.tsx`],
  }),
  row({
    id: "fabric-js",
    name: "Fabric.js",
    domain: D.engines,
    url: "https://www.fabricjs.com/",
    what: t(
      "HTML5 캔버스 위에서 개체를 고르고 변형하는 2D 라이브러리입니다. 캔버스 엔진 결정 문서는 사진·굿즈 편집기에 맞는 도구로 분류했습니다.",
      "A 2D library for picking and transforming objects on the HTML5 canvas. The canvas-engine decision document classed it as suited to photo and merchandise editors.",
    ),
    learned: t(
      "채택하지 않음: Konva와 역할이 겹치는데 동시 편집(CRDT)·마스크·레이어 스택에서 얻는 이점이 없다고 판단.",
      "Not adopted: it duplicates Konva without gains in collaborative (CRDT) editing, masks or layer stacks, the document concluded.",
    ),
    overlap: t("겹치는 ToonStudio 기능 없음(평가만 함).", "No overlapping feature (evaluated only)."),
    evidence: [CANVAS_DECISION, "docs/studio-competitor-residual-batch-2026-07-24.md"],
  }),
  row({
    id: "p5-js",
    name: "p5.js",
    domain: D.engines,
    url: "https://p5js.org/",
    what: t(
      "창작 코딩과 교육에 쓰는 HTML5 캔버스 라이브러리입니다. 캔버스 엔진 결정 문서는 인터랙티브 아트와 교육용 반복 실습에 맞는 도구로 분류했습니다.",
      "An HTML5 canvas library for creative coding and teaching. The canvas-engine decision document classed it as suited to interactive art and teaching loops.",
    ),
    learned: t(
      "결론: 편집기 몸체로는 쓰지 않고 ‘선택적 효과(FX)’ 용도로만 둠.",
      "Conclusion: not used as the editor body; kept only for optional effects (FX).",
    ),
    overlap: t("겹치는 ToonStudio 기능은 문서에 적혀 있지 않음(후보만).", "No overlapping ToonStudio feature is recorded (candidate only)."),
    evidence: [CANVAS_DECISION, "docs/studio-competitor-residual-batch-2026-07-24.md"],
  }),
  row({
    id: "pixijs",
    name: "PixiJS",
    domain: D.engines,
    url: "https://pixijs.com/",
    what: t(
      "WebGL로 빠르게 그리는 2D 라이브러리입니다. 캔버스 엔진 결정 문서는 많은 입자와 브러시 성능에 맞는 도구로 분류했습니다.",
      "A fast WebGL 2D library. The canvas-engine decision document classed it as suited to heavy particle and brush performance.",
    ),
    learned: t(
      "결론: 편집기 몸체로는 쓰지 않음. 제품에서는 선택한 요소의 테두리·옅은 면 오버레이로만 쓰고(CanvasKit이 legacy로 판정할 때), Konva가 정본이라는 결정은 그대로.",
      "Conclusion: not used as the editor body. The product uses it only for an outline and light-fill overlay of selected elements (when CanvasKit rates a page legacy), and the decision that Konva is the authority stands.",
    ),
    overlap: t("선택 요소 오버레이(선택).", "The optional selected-element overlay."),
    evidence: [CANVAS_DECISION, "package.json", "docs/engines/renderer-roles.md"],
  }),

  /* ───────────── 표준·품질 기준(코드가 직접 인용한 것) ───────────── */

  row({
    id: "mqm-core",
    name: "MQM-Core",
    domain: D.engines,
    url: "https://www.themqm.org/",
    what: t(
      "번역 품질을 오류 분류와 심각도 점수로 재는 공개 틀(Multidimensional Quality Metrics)입니다. 문서는 7개 차원·38개 하위 유형과 심각도 배수를 ‘공식’ 자료로 정리했습니다.",
      "A public framework (Multidimensional Quality Metrics) that rates translation quality by error categories and severity scores. The document records its seven dimensions, 38 subtypes and severity weights from the official source.",
    ),
    learned: t(
      "배움: 심각도 가중치(0/1/5/25)·합격선·치명 오류 1건 즉시 불합격을 코드에 옮기고, 분모 단위(단어·글자·행)를 결과에 밝힘. 말풍선 넘침은 ‘텍스트 확장’ 오류로 자동 채점. BLEU는 게이트로 쓰지 않음.",
      "Learned: severity weights (0/1/5/25), a pass line and automatic fail on one critical error are in code, with the denominator unit (words, characters, lines) stated. Balloon overflow is auto-scored as a text-expansion error. BLEU is not used as a gate.",
    ),
    overlap: t("현지화 QA 계층의 MQM 채점(studio-localization-mqm).", "The localization QA layer's MQM scoring (studio-localization-mqm)."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-localization-mqm.ts`, `${LETTERING}/studio-localization-qa.ts`],
  }),
  row({
    id: "iso-5060",
    name: "ISO 5060:2024",
    domain: D.engines,
    url: "https://www.iso.org/standard/80443.html",
    what: t(
      "번역 결과를 평가하는 국제 표준(규격 개요)입니다. 문서는 분모를 단어 대신 글자나 행으로 잡을 수 있다는 점을 만화 말풍선에 필요한 근거로 적었습니다.",
      "An international standard for evaluating translation output (overview only). The document cites its allowance to use characters or lines instead of words as the denominator, which balloons need.",
    ),
    learned: t(
      "배움: 분모 단위를 단어·글자·행 중에서 결과에 명시. 안 한 점: 수치 배수는 유료 규격이라 확인하지 못해 ‘미검증’으로 남기고 새 숫자를 만들지 않음.",
      "Learned: state the denominator unit (word, character or line) in results. Not adopted: its numeric multipliers sit in the paid text and were not verified, so they stay marked unverified and no new numbers were invented.",
    ),
    overlap: t("현지화 QA 채점의 분모 단위 표기.", "Denominator-unit labelling in localization QA scoring."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-localization-mqm.ts`],
  }),
  row({
    id: "unicode-uax-14",
    name: "Unicode UAX #14",
    domain: D.engines,
    url: "https://www.unicode.org/reports/tr14/",
    what: t(
      "유니코드의 줄바꿈 규칙 표준입니다. 문서는 한글 음절이 기본적으로 어절 중간 분리를 허용하며 CSS word-break: keep-all이 한국어 말풍선의 올바른 기본값이라고 정리했습니다.",
      "Unicode's line-breaking standard. The document notes that Hangul syllables allow breaks mid-word by default, and that CSS word-break: keep-all is the right default for Korean balloons.",
    ),
    learned: t(
      "배움: 한국어 말풍선은 어절 단위로 줄을 바꾸는 것을 기본으로 삼고 금칙 처리를 넘침 게이트에 연결. 가로쓰기 한국어 말풍선의 실제 렌더 경로 배선은 별도 과제로 남김.",
      "Learned: break Korean balloons by word by default and wire kinsoku handling into the overflow gate. Wiring this into the actual render path of horizontal Korean balloons is left as a separate task.",
    ),
    overlap: t("금칙 줄바꿈 모듈과 넘침 예측 게이트.", "The kinsoku line-break module and the overflow-prediction gate."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-kinsoku-line-break.ts`, `${LETTERING}/studio-localization-overflow-gate.ts`],
  }),
  row({
    id: "w3c-i18n-text-size",
    name: "W3C i18n text-size guidance",
    domain: D.engines,
    url: "https://www.w3.org/International/articles/article-text-size",
    urlTitle: "W3C: Text size in translation",
    what: t(
      "W3C 국제화 문서 ‘번역 시 글자 크기’입니다. 원문 길이별 확장률 표와 언어별 폭 정규화 비율을 담고 있고, 51~70자 행이 앞뒤와 맞지 않아 원문 오타로 의심된다고 문서가 적었습니다.",
      "The W3C internationalization article 'Text size in translation'. It holds expansion rates by source length and per-language width ratios; the document flags its 51 to 70 character row as inconsistent and a suspected typo.",
    ),
    learned: t(
      "배움: 글자 폭 예산으로 말풍선 넘침을 미리 예측하고 줄바꿈→축소→확대→사람 순으로 처방. 근거 없는 언어쌍은 숫자를 만들지 않으며, 의심스러운 표 값도 임의로 고치지 않음.",
      "Learned: predict balloon overflow from a width budget and prescribe re-break, shrink, enlarge, then a human. No numbers are invented for language pairs without a source, and the suspect table value is not silently fixed.",
    ),
    overlap: t("현지화 넘침 게이트(studio-localization-overflow-gate).", "The localization overflow gate (studio-localization-overflow-gate)."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-localization-overflow-gate.ts`],
  }),
  row({
    id: "microsoft-pseudolocalization",
    name: "Microsoft pseudolocalization guidance",
    domain: D.engines,
    url: "https://learn.microsoft.com/en-us/globalization/methodology/pseudolocalization",
    urlTitle: "Microsoft Learn: Pseudolocalization",
    what: t(
      "Microsoft 세계화 문서의 ‘의사 현지화’ 지침입니다. 번역 전에 글자를 일부러 늘려 화면이 깨지는지 미리 보는 방법으로, 영어 원문은 40% 늘려 보라고 하고 번역문이 200~400% 길어지는 극단 사례도 적습니다.",
      "Microsoft's globalization guidance on pseudolocalization: lengthen text on purpose before translation to see whether the screen breaks. For English source text it suggests adding 40% and notes extreme cases where a translation runs 200 to 400% longer.",
    ),
    learned: t(
      "배움: 이 수치를 참고 상수(140%, 극단 200~400%)로만 적어 두고 넘침 게이트의 판정에는 쓰지 않음. ‘최악을 미리 보기’ 모드용으로 남겼으며, 이를 쓰는 화면은 아직 없음.",
      "Learned: the figures are kept only as reference constants (140%, extremes of 200 to 400%) and are not used in the overflow gate's verdict. They are reserved for a 'preview the worst case' mode that no screen uses yet.",
    ),
    overlap: t("현지화 넘침 게이트(studio-localization-overflow-gate)의 참고 상수.", "The reference constants in the localization overflow gate (studio-localization-overflow-gate)."),
    evidence: [LOCALIZATION_QA, `${LETTERING}/studio-localization-overflow-gate.ts`],
  }),
];
