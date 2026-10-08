import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 2 "VRM·3D·캐릭터".
 * 사실의 정본은 오픈소스 지도(three-js·babylon-js·gltf-transform-stack·manifold-csg·rapier-recast-ik 행)·
 * 제작 스토리 챕터 web-3d-engine·ADR-0026·scripts/verify-studio-bg3d-webgpu-engine.mjs 의 측정 주석이다. 기준일 2026-10-08.
 */

const CREATOR = "apps/web/src/domains/creator";

export const LIBRARY_AREA_VRM_3D: LibraryGuideArea = {
  id: "vrm-3d-characters",
  number: 2,
  title: t("VRM·3D·캐릭터", "VRM, 3D and characters"),
  question: t("3D 장면과 VRM 캐릭터는 무엇으로 그리고 움직이나?", "What draws and moves the 3D scene and VRM characters?"),
  oneLine: t(
    "장면은 three.js 하나가 소유하고, 캐릭터는 VRM 표준 위에서 움직이며, 전문 계산은 필요할 때만 따로 불러옵니다.",
    "One library, three.js, owns the scene, characters move on the VRM standard, and specialist math is loaded separately only when needed.",
  ),
  easy: t(
    "촬영장과 같습니다. 감독(three.js)은 한 명이고, 배우는 같은 이름표(VRM의 표준 뼈 이름)를 달고 있어 이름표를 단 배우라면 누구에게든 같은 연기 지시가 통합니다. 소품 가공이나 정밀 도면은 필요할 때만 전문 업체에 맡깁니다.",
    "It is like a film set. There is one director (three.js), every actor wears the same name tags (VRM's standard bone names) so the same direction works for any actor who wears them, and prop workshops or precise drafting are outsourced to specialists only when needed.",
  ),
  designWhy: [
    {
      title: t("대화형 장면의 주인은 하나", "One owner for the live scene"),
      body: t(
        "뷰포트·선택·기즈모는 three/R3F가 소유하고, 작품의 상태는 엔진 객체가 아니라 문서에 둡니다. 같은 장면을 엔진 둘이 나눠 가지면 선택·GPU 자원·캡처 시점이 충돌하기 때문입니다.",
        "Three/R3F owns the viewport, selection and gizmos, and the work's state lives in a document rather than in engine objects. If two engines shared one scene, selection, GPU resources and capture timing would collide.",
      ),
    },
    {
      title: t("거대 엔진 하나 대신 역할별로", "Roles, not one giant engine"),
      body: t(
        "뷰포트·캐릭터 리깅·CAD·불리언·UV·내보내기를 한 엔진이 모두 맡으면 번들·메모리·파일 호환 문제가 함께 커집니다. 그래서 역할별 엔진을 두고 GLB·VRM 파일과 영수증으로 잇습니다.",
        "If one engine owned viewport, rigging, CAD, booleans, UVs and export, bundle, memory and compatibility risks would grow together. So roles get their own engines, linked by GLB and VRM files and receipts.",
      ),
    },
    {
      title: t("엔진은 폴백이 아니라 선택", "Engines are chosen, not fallen back to"),
      body: t(
        "WebGPU냐 WebGL2냐는 사용자가 고르고, 안 되면 이유를 보여 줍니다. 같은 VRM이 두 엔진에서 색이 최대 169/255(번들 모델 1개, 2026-08-29) 달랐던 실측 뒤, 캐릭터가 있는 장면은 WebGL2로 고정했습니다.",
        "The user picks WebGPU or WebGL2, and if it cannot run the screen says why. After the same VRM measured up to 169/255 apart in color on the two engines (one bundled model, 2026-08-29), scenes with a character were fixed to WebGL2.",
      ),
    },
    {
      title: t("전문 계산은 필요할 때만, Worker에서", "Specialist math on demand, in Workers"),
      body: t(
        "Manifold·OpenCascade·glTF Transform 같은 계산은 사용자가 동작한 뒤에 불러오고, 에셋 도구에서는 Worker와 WASM으로 돌려 화면 멈춤을 줄입니다. 운영 CSP(unsafe-eval 금지)에 맞추려 Manifold·glTF Transform·ktx2-encoder에 패치 3개를 얹었습니다. OpenCascade는 그대로 씁니다.",
        "Manifold, OpenCascade and glTF Transform are loaded after the user acts, and the asset tools run them in Workers and WASM to reduce screen freezes. The production CSP forbids unsafe-eval. Three patches were applied to Manifold, glTF Transform and ktx2-encoder; OpenCascade is used unmodified.",
      ),
    },
  ],
  diagram: {
    id: "vrm-3d-characters-diagram",
    kind: "layers",
    title: t("3D·캐릭터를 받치는 다섯 층", "Five layers behind 3D and characters"),
    caption: t(
      "장면과 캐릭터는 three 계열이 함께 소유하고, 계산·모델 가공·전문 엔진은 필요할 때만 따로 불러옵니다.",
      "The three family owns the scene and characters; computation, model processing and specialist engines load separately only when needed.",
    ),
    alt: t(
      "위에서 아래로 다섯 층입니다. 첫째는 three.js와 R3F로 장면을 그리는 층이고, 둘째는 VRM 표준 뼈 이름 위에서 three-vrm이 포즈와 표정을 맡는 캐릭터 층입니다. 셋째는 Rapier, recast-navigation, closed-chain-ik, Manifold가 움직임과 형태를 계산하는 층, 넷째는 glTF Transform이 모델 파일을 가공하는 층입니다. 맨 아래는 Babylon.js와 OpenCascade.js처럼 따로 격리한 전문 엔진입니다. 위 두 층은 장면의 주인이고 아래 세 층은 필요할 때만 불러옵니다.",
      "Five layers from top to bottom. First is the layer that draws the scene with three.js and R3F; second is the character layer where three-vrm handles poses and expressions on VRM's standard bone names. Third is where Rapier, recast-navigation, closed-chain-ik and Manifold compute motion and shape; fourth is where glTF Transform processes model files. At the bottom sit specialist engines kept apart, such as Babylon.js and OpenCascade.js. The top two layers own the scene, and the bottom three load only when needed.",
    ),
    layers: [
      {
        id: "view",
        label: t("장면을 그리는 층", "Scene drawing"),
        sub: t("three.js가 그리고 R3F가 React와 이어 줍니다", "three.js draws and R3F connects it to React"),
        tone: "good",
        chips: ["three.js", "React Three Fiber", "drei"],
      },
      {
        id: "character",
        label: t("캐릭터 층 (VRM)", "Character layer (VRM)"),
        sub: t("표준 뼈 이름 위에서 포즈·손발 IK(자체 솔버)·웹캠이 함께 돕니다", "Poses, own-solver IK and webcam share the standard bone names"),
        tone: "local",
        chips: ["VRM", "three-vrm", "MediaPipe"],
      },
      {
        id: "compute",
        label: t("움직임·형태 계산", "Motion and shape math"),
        sub: t("Worker와 WASM에서 필요할 때만 불러옵니다", "Loaded only when needed, in Workers and WASM"),
        tone: "local",
        chips: ["Rapier", "recast-navigation", "closed-chain-ik", "Manifold", "three-bvh-csg"],
      },
      {
        id: "assets",
        label: t("모델 파일 가공", "Model file processing"),
        sub: t("낯선 3D 파일을 GLB로 들이고 가볍게 줄입니다", "Brings odd 3D files in as GLB and slims them down"),
        tone: "local",
        chips: ["glTF Transform", "meshoptimizer", "KTX2", "rhino3dm", "web-ifc"],
      },
      {
        id: "specialist",
        label: t("전문 엔진 (따로 격리)", "Specialist engines (kept apart)"),
        sub: t("제한된 일에만 쓰고 장면은 소유하지 않습니다", "Used for limited jobs; never owns the scene"),
        tone: "neutral",
        chips: ["Babylon.js", "OpenCascade.js"],
      },
    ],
    brackets: [
      { label: t("장면의 주인은 three 계열 하나", "The three family owns the scene"), layerIds: ["view", "character"] },
      { label: t("필요할 때만 불러옴", "Loaded only when needed"), layerIds: ["compute", "assets", "specialist"] },
    ],
  },
  libraries: [
    {
      id: "three-js",
      name: "three.js",
      kind: "library",
      package: "three",
      oneLine: t("브라우저에서 3D 장면을 그리는 라이브러리", "A library that draws 3D scenes in the browser"),
      usedFor: t(
        "3D 배경 편집기·캐릭터 포저·하이브리드 DCC 뷰포트에서 배경, 마네킹, 포즈를 그리고 카메라와 기즈모를 다룹니다.",
        "Draws backgrounds, mannequins and poses in the 3D background editor, the character poser and the hybrid DCC viewport, and handles cameras and gizmos.",
      ),
      why: t(
        "대화형 편집 장면의 주인을 three/R3F 하나로 두면 선택·기즈모·GPU 자원·캡처 시점이 충돌하지 않습니다. 상태는 문서에 두어 엔진 객체가 아니라 작품이 남습니다.",
        "Making three/R3F the single owner of the live editing scene avoids collisions in selection, gizmos, GPU resources and capture timing. State lives in the document, so the work outlives any engine object.",
      ),
      alternatives: t(
        "Babylon.js는 실험 앱 character-lab의 주 엔진이지만 제품에서는 전문 작업에만 씁니다. PlayCanvas 등은 문서 비교 대상이었습니다(ADR-0026).",
        "Babylon.js is the main engine of the experimental character-lab app but is used only for specialist jobs in the product. PlayCanvas and others were document-only comparisons (ADR-0026).",
      ),
      cost: t(
        "정지 구도는 바뀔 때만 그리고 느리면 해상도 배율을 낮춥니다. 캐릭터가 있는 장면은 MToon 색 차이 때문에 WebGL2로 고정돼 WebGPU의 이점을 못 씁니다.",
        "A still scene draws only on change and lowers resolution when slow. Scenes with a character are fixed to WebGL2 because of MToon color differences, so they cannot use WebGPU's benefits.",
      ),
      paths: [
        `${CREATOR}/bg3d/StudioBg3dEditorViewport.tsx`,
        `${CREATOR}/hybrid-dcc/StudioHybridDccViewportCore.tsx`,
        `${CREATOR}/vrm/StudioVrmPoserViewport.tsx`,
      ],
      license: "MIT",
      status: "live",
      mapRowId: "three-js",
      atlasIds: ["three-r3f-viewport", "webgpu-explicit-engine"],
    },
    {
      id: "three-vrm",
      name: "three-vrm",
      kind: "library",
      package: "@pixiv/three-vrm",
      oneLine: t("VRM 캐릭터 파일을 읽어 표정과 뼈대를 움직이는 부품", "A part that reads VRM character files and drives expressions and bones"),
      usedFor: t(
        "VRM 캐릭터를 불러와 포즈·표정·시선을 적용하고, 웹캠 추적 결과를 같은 뼈 이름의 회전으로 캐릭터에 씁니다.",
        "Loads VRM characters, applies poses, expressions and gaze, and writes webcam tracking results onto the character as rotations under the same bone names.",
      ),
      why: t(
        "VRM 로딩과 정규화 뼈, 툰 재질(MToon)을 three 위에서 한 번에 제공합니다. 정규화 뼈 덕분에 기본 자세가 다른 모델도 같은 기준(회전 0)에서 다룰 수 있습니다.",
        "It provides VRM loading, normalized bones and the toon material (MToon) on top of three. Normalized bones let models with different rest poses be handled from one baseline (zero rotation).",
      ),
      alternatives: t(
        "Babylon 실험 앱은 VRM 의미 보존이 약한 부분 파서(베타)를 씁니다. 제품 캐릭터 경로는 three-vrm을 유지합니다(ADR-0026).",
        "The Babylon experimental app uses a partial VRM parser (beta) that preserves less of VRM's meaning. The product's character path stays on three-vrm (ADR-0026).",
      ),
      cost: t(
        "같은 MToon 규격이 WebGPU와 WebGL2에서 따로 구현돼 색이 달랐습니다(최대 169/255, 2026-08-29 한 모델 측정). 그래서 캐릭터 장면은 WebGL2로 고정합니다.",
        "The same MToon spec is implemented separately for WebGPU and WebGL2 and the colors differed (up to 169/255, one model, 2026-08-29), so character scenes are fixed to WebGL2.",
      ),
      paths: [
        `${CREATOR}/vrm/StudioVrmActor.tsx`,
        `${CREATOR}/bg3d/studio-bg3d-shared-vrm-runtime.ts`,
        `${CREATOR}/vrm/StudioVrmPoserViewport.tsx`,
      ],
      license: "MIT",
      status: "live",
      mapRowId: "three-js",
      atlasIds: ["vrm-humanoid-rig", "mediapipe-webcam-pose"],
    },
    {
      id: "vrm-format",
      name: "VRM",
      kind: "format",
      oneLine: t("3D 캐릭터의 뼈와 표정에 표준 이름표를 붙인 파일 형식(glTF 기반)", "A file format (built on glTF) that gives a 3D character's bones and expressions standard names"),
      usedFor: t(
        "번들된 캐릭터를 읽고 새로 만든 캐릭터를 VRM 1.0으로 내보냅니다. 포즈 도구·IK·웹캠이 같은 뼈 이름을 씁니다.",
        "Reads the bundled characters and exports new ones as VRM 1.0. The pose tool, IK and webcam tracking all use the same bone names.",
      ),
      why: t(
        "뼈 이름이 표준이라 한 번 만든 포즈를 필수 뼈 15개를 갖춘 어느 VRM 캐릭터에든 입힐 수 있습니다. 55개 이름 허용 목록으로 낯선 파일이 엉뚱한 노드를 건드리는 일도 막습니다.",
        "Because bone names are standard, a pose made once fits any VRM character that has the 15 required bones, and an allowlist of 55 names stops an unknown file from touching unrelated nodes.",
      ),
      alternatives: t(
        "모델마다 뼈 이름을 번역하거나 특정 엔진 전용 리그를 쓰면 캐릭터가 늘수록 번역표도 늘어납니다.",
        "Translating bone names per model or using an engine-specific rig means the translation tables grow with every new character.",
      ),
      cost: t(
        "모델이 필수 뼈 15개를 갖춰야 하고 관절 범위와 표정은 모델마다 달라 검증이 필요합니다. 번들 모델은 각자 이용조건이 따로 있습니다.",
        "A model must supply the 15 required bones, and joint ranges and expressions differ per model, so each needs validation. Each bundled model has its own usage terms.",
      ),
      paths: [
        `${CREATOR}/studio-humanoid-bones.ts#STUDIO_HUMANOID_BONE_NAMES`,
        `${CREATOR}/vrm/studio-vrm-proportion-core.ts#STUDIO_VRM_REQUIRED_HUMANOID_BONES`,
        `${CREATOR}/vrm/studio-vrm-pose-material-adapter.ts`,
        "apps/web/public/vrm/LICENSES.md",
      ],
      license: "Per-model terms",
      licenseSource: "apps/web/public/vrm/LICENSES.md",
      status: "live",
      atlasIds: ["vrm-humanoid-rig"],
    },
    {
      id: "react-three-fiber",
      name: "React Three Fiber · drei",
      kind: "library",
      package: "@react-three/fiber",
      oneLine: t("React 안에서 three.js 장면을 선언적으로 쓰게 해 주는 연결 부품", "A bridge that lets you build three.js scenes declaratively inside React"),
      usedFor: t(
        "3D 뷰포트를 React 컴포넌트로 만들고, 프레임 루프(always·demand·never)와 해상도 배율로 GPU 낭비를 줄입니다.",
        "Builds the 3D viewport as React components and cuts GPU waste with frame loops (always, demand, never) and a resolution scale.",
      ),
      why: t(
        "화면 전체가 React라 3D 뷰포트도 같은 방식으로 상태와 이어집니다. 정지 구도는 demand 루프로 바뀔 때만 그려, 같은 자세를 계속 다시 그리다 느린 GPU 큐가 밀리는 일을 줄입니다.",
        "The whole UI is React, so the 3D viewport connects to state the same way. A still scene uses the demand loop and draws only on change, so a slow GPU queue is not backed up by redrawing an unchanged pose.",
      ),
      cost: t(
        "R3F 9.6.1이 폐기된 THREE.Clock을 써서 pnpm 패치로 Timer 기반으로 바꾸고 정리 때의 'Context Lost' 경고도 막았습니다. Hybrid DCC 뷰포트는 별도 적응 정책을 씁니다.",
        "R3F 9.6.1 uses the deprecated THREE.Clock, so a pnpm patch moved it to a Timer and also silences the planned-teardown Context Lost warning. The Hybrid DCC viewport adapts by its own policy.",
      ),
      paths: [
        `${CREATOR}/bg3d/StudioBg3dEditorViewport.tsx`,
        "patches/@react-three__fiber@9.6.1.patch",
        `${CREATOR}/hybrid-dcc/StudioHybridDccViewportCore.tsx`,
      ],
      license: "MIT",
      status: "live",
      mapRowId: "three-js",
      atlasIds: ["three-r3f-viewport"],
    },
    {
      id: "babylon-js",
      name: "Babylon.js",
      kind: "engine",
      package: "@babylonjs/core",
      oneLine: t("또 하나의 3D 엔진. 제품에서는 법선 맵 추출 같은 전문 작업에만 씁니다", "A second 3D engine, used in the product only for specialist jobs such as normal-map extraction"),
      usedFor: t(
        "3D 배경의 법선(표면 방향) 맵과 산출물을 뽑는 전문 단계에만 쓰고, 실험 앱 character-lab에서는 주 엔진입니다.",
        "Used only for specialist passes that extract normal maps (surface direction) and artifacts for the 3D background; in the experimental character-lab app it is the main engine.",
      ),
      why: t(
        "PBR·IBL·그림자·후처리는 core에, glTF 내보내기는 serializers 패키지에 있어(모두 Apache-2.0) 캐릭터 실험의 주 엔진으로 골랐습니다(ADR-0026). 제품에서는 장면 소유자인 three와 겹치지 않게 전문 작업에만 씁니다.",
        "PBR, IBL, shadows and post-processing live in core and glTF export in the serializers package (all Apache-2.0), so it was chosen as the main engine for the character experiment (ADR-0026). In the product it stays on specialist jobs so it never overlaps three, the scene owner.",
      ),
      alternatives: t(
        "character-lab 엔진 비교에서 Three WebGPURenderer(실험적)·PlayCanvas·Bevy 등은 문서 비교 전용이거나 기각됐습니다(ADR-0026). 제품 BG3D에서 Three WebGPU는 사용자가 고르는 엔진입니다.",
        "In the character-lab engine comparison, Three's WebGPURenderer (experimental), PlayCanvas and Bevy were kept as document comparisons or rejected (ADR-0026). In the product's BG3D editor, Three WebGPU is an engine the user can choose.",
      ),
      cost: t(
        "번들 검사가 Babylon이 앱 진입점·Studio 경로에 정적으로 들어오는 것을 막습니다. ADR-0026은 아직 Proposed이고 실험 앱은 운영 배포 대상이 아닙니다.",
        "The bundle check blocks Babylon from entering the app entry or Studio routes statically. ADR-0026 is still Proposed and the experimental app is not a production deploy target.",
      ),
      paths: [
        `${CREATOR}/bg3d/studio-bg3d-babylon-specialist-entry.ts`,
        "scripts/check-studio-bundle.mjs",
        "docs/reports/character-lab-engine-alternatives-2026-10-01.md",
      ],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "babylon-js",
    },
    {
      id: "gltf-transform",
      name: "glTF Transform · meshoptimizer",
      kind: "library",
      package: "@gltf-transform/core",
      oneLine: t("3D 모델 파일(GLB)을 가볍게 줄이고 다듬는 도구 모음", "A toolkit that slims and tidies 3D model files (GLB)"),
      usedFor: t(
        "BG3D 프로 스위트의 에셋 도구 패널에서 Worker로 돌려 모델 구조 편집·압축, 단계별 단순 모델(LOD), 텍스처 압축(KTX2)을 합니다.",
        "Runs in a Worker from the asset tools panel of the BG3D Pro suite for model structure editing and compression, distance-based simplified models (LOD) and texture compression (KTX2).",
      ),
      why: t(
        "낯선 3D 파일을 GLB 하나로 들이고 가볍게 내보내려면 구조 편집·압축·LOD·텍스처 압축이 모두 필요한데, 허용형(MIT) 도구가 이를 한 흐름으로 제공합니다.",
        "Bringing odd 3D files in as one GLB and exporting them light needs structure editing, compression, LOD and texture compression, and these permissive (MIT) tools offer them as one flow.",
      ),
      cost: t(
        "운영 CSP에 unsafe-eval이 없어 pnpm 패치 2개(glTF Transform의 Function() 이미지 커널 지연, ktx2-encoder의 new Function 제거와 mip 옵션 추가)를 적용했습니다. 실측은 합성 샘플 기준입니다.",
        "The production CSP has no unsafe-eval, so two pnpm patches defer glTF Transform's Function()-based image kernel and remove ktx2-encoder's new Function calls while adding mip options. Measurements use synthetic samples.",
      ),
      paths: [
        `${CREATOR}/scene3d/specialists/specialist-assets.ts`,
        `${CREATOR}/scene3d/specialists/specialist.worker.ts`,
        "patches/@gltf-transform__functions@4.4.2.patch",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "gltf-transform-stack",
      atlasIds: ["glb-optimization-pipeline"],
    },
    {
      id: "manifold-csg",
      name: "Manifold · three-bvh-csg",
      kind: "library",
      package: "manifold-3d",
      oneLine: t("3D 도형을 합치고 빼고 겹친 부분만 남기는 불리언 연산 부품", "Parts that merge, subtract or intersect 3D shapes (boolean operations)"),
      usedFor: t(
        "빠른 미리보기는 three-bvh-csg로, 구멍 없이 단단한 결과가 필요하면 Manifold(WASM)로 계산합니다. 에셋 도구는 Worker, 하이브리드 DCC 불리언은 화면 스레드입니다.",
        "A fast preview uses three-bvh-csg, and when a watertight solid result is needed, Manifold (WASM) does the calculation: in a Worker for the asset tools, on the main thread for the Hybrid DCC boolean.",
      ),
      why: t(
        "미리보기는 빨라야 하고 최종 결과는 새지 않아야 해서 '빠른 칼'과 '단단한 칼'을 나눠 씁니다. 더 정밀한 CAD 계산은 따로 OpenCascade.js에 맡깁니다.",
        "A preview must be fast and the final result must be watertight, so a quick tool and a solid tool are used separately. Finer CAD calculation is handed to OpenCascade.js.",
      ),
      alternatives: t(
        "OpenCascade.js(LGPL-2.1-only)는 정밀하지만 wasm이 약 65.9MB라 선택형으로만 불러오고, 문서에 법무 최종 확인 대기로 적혀 있습니다.",
        "OpenCascade.js (LGPL-2.1-only) is precise but its wasm is about 65.9 MB, so it loads only by choice, and its document records legal review as pending.",
      ),
      cost: t(
        "manifold-3d는 pnpm 패치로 new Function 2곳을 정적 코드로 바꿔야 운영 CSP(wasm-unsafe-eval만 허용)에서 돕니다.",
        "manifold-3d needs a pnpm patch that replaces two new Function sites with static code to run under the production CSP, which allows only wasm-unsafe-eval.",
      ),
      paths: [
        `${CREATOR}/studio-manifold-mesh-provider.ts`,
        `${CREATOR}/scene3d/specialists/specialist-csg.ts`,
        "patches/manifold-3d@3.5.1.patch",
      ],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "manifold-csg",
      atlasIds: ["opencascade-manifold-precision"],
    },
    {
      id: "rapier-recast",
      name: "Rapier · recast-navigation",
      kind: "library",
      package: "@dimforge/rapier3d-deterministic-compat",
      oneLine: t("3D 속 움직임 계산: 충돌·중력, 걸을 수 있는 길, 관절 IK", "Motion math in 3D: collisions and gravity, walkable paths and joint IK"),
      usedFor: t(
        "소품 충돌·접지(Rapier), 걸어 다닐 길 만들기(recast-navigation), 리깅된 GLB의 관절 체인을 목표점에 맞추기(closed-chain-ik)를 Worker에서 계산합니다.",
        "Computes prop collisions and ground contact (Rapier), walkable-path generation (recast-navigation) and fitting a joint chain of a rigged GLB to a target point (closed-chain-ik) in Workers.",
      ),
      why: t(
        "결정성과 WASM 내장을 갖춘 deterministic-compat 변형이라 같은 입력이 같은 결과를 내고 별도 파일 없이 불러옵니다. 실험 앱은 캐릭터 물리를 자체 솔버로 두고 Rapier를 보조로 씁니다(ADR-0026).",
        "The deterministic-compat variant gives the same output for the same input and embeds its WASM, so no extra file is fetched. The experimental app keeps its own solver for character physics and uses Rapier as support (ADR-0026).",
      ),
      alternatives: t(
        "Havok은 cloth가 없고 결정성 보장이 없으며 wasm이 약 4.4MB라 주 물리로 쓰지 않았습니다(ADR-0026 대안 표).",
        "Havok has no cloth, no determinism guarantee and a wasm of about 4.4 MB, so it was not made the main physics (ADR-0026 alternatives table).",
      ),
      cost: t(
        "ADR-0026이 아직 Proposed라 '캐릭터 물리는 자체 솔버, Rapier는 보조'는 확정 방침이 아닙니다. closed-chain-ik는 버전이 0.0.3입니다.",
        "ADR-0026 is still Proposed, so 'own solver for character physics, Rapier as support' is not yet settled. closed-chain-ik is at version 0.0.3.",
      ),
      paths: [
        `${CREATOR}/bg3d/studio-bg3d-physics.worker.ts`,
        `${CREATOR}/scene3d/specialists/specialist-navigation.ts`,
        `${CREATOR}/scene3d/specialists/specialist-ik.ts`,
      ],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "rapier-recast-ik",
    },
  ],
  pitfall: t(
    "ADR-0026은 아직 Proposed이고 Babylon·자체 물리 솔버 이야기는 실험 앱(character-lab) 방향입니다. 제품의 캐릭터 경로는 three-vrm이며, Babylon은 전문 작업에만 씁니다.",
    "ADR-0026 is still Proposed, and the Babylon and own-physics-solver story is the direction of the experimental character-lab app. The product's character path is three-vrm; Babylon is used only for specialist jobs.",
  ),
  status: "live",
  atlasIds: ["three-r3f-viewport", "webgpu-explicit-engine", "vrm-humanoid-rig", "glb-optimization-pipeline", "opencascade-manifold-precision"],
  chapterIds: ["web-3d-engine", "open-source", "blender-mcp-boundary"],
  glossaryIds: ["vrm", "threejs", "r3f", "gltf", "meshopt", "humanoid-bones", "mtoon", "csg-boolean", "ik", "bvh", "ktx2-basis"],
};
