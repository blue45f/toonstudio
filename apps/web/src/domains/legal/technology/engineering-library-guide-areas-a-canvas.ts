import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 3 "2D 편집과 가상 스튜디오".
 * 사실의 정본은 오픈소스 지도(react·konva·pixijs·phaser·vector-geometry·zustand·ui-kit 행)·ADR-0003/0018/0019/0022/0025·
 * 렌더러 역할 원장(docs/engines/renderer-roles.md)·docs/studio/virtual-studio-world-authoring.md 이다. 기준일 2026-10-08.
 */

const CREATOR = "apps/web/src/domains/creator";

export const LIBRARY_AREA_CANVAS_2D: LibraryGuideArea = {
  id: "canvas-2d-virtual-studio",
  number: 3,
  title: t("2D 편집과 가상 스튜디오", "2D editing and the virtual studio"),
  question: t("편집 캔버스·가상 공간·화면 UI는 무엇이 받치나?", "What supports the editing canvas, the virtual space and the screen UI?"),
  oneLine: t(
    "편집 캔버스의 입력·선택은 Konva가, 가상 스튜디오는 Phaser가 맡고, 둘 다 React 화면 위에 얹힙니다.",
    "Konva owns input and selection on the editing canvas, Phaser runs the virtual studio, and both sit on top of the React screens.",
  ),
  easy: t(
    "극장 두 곳이 있는 건물과 같습니다. 편집 캔버스 극장은 무대(Konva)가 하나이고, 조명(PixiJS)과 특수 효과(CanvasKit)는 각자 맡은 일만 합니다. 가상 스튜디오는 옆 극장(Phaser)이라 입장할 때만 문을 엽니다.",
    "It is like a building with two theaters. The editing-canvas theater has a single stage (Konva), and lighting (PixiJS) and special effects (CanvasKit) each do only their own job. The virtual studio is the theater next door (Phaser) and opens its doors only when you enter.",
  ),
  designWhy: [
    {
      title: t("입력·선택은 Konva, 나머지는 섬으로", "Konva owns input and selection; the rest are islands"),
      body: t(
        "포인터 입력·선택 크롬은 Konva 한 곳이 갖고, 선택 오버레이는 Pixi, 조건이 맞는 페이지의 문서 표시는 CanvasKit 섬이 '자기 섬 하나'만 소유합니다. 엔진이 많아도 한 권위를 둘이 나눠 갖지 않습니다(ADR-0003·0019).",
        "Konva alone holds pointer input and selection chrome, while Pixi owns only the selection-overlay island and CanvasKit only the document display of eligible pages. Even with many engines, no authority is shared by two (ADR-0003, 0019).",
      ),
    },
    {
      title: t("월드 내용은 데이터, 권한은 따로", "World content is data; permissions are separate"),
      body: t(
        "가상 스튜디오의 방·벽·문은 Tiled JSON과 WorldManifest가 소유해 Phaser 장면을 다시 쓰지 않고 월드를 바꿀 수 있습니다. 권한과 승인은 공간이나 Phaser가 아니라 별도 시스템이 가집니다(ADR-0022).",
        "Rooms, walls and doors of the virtual studio are owned by Tiled JSON and the WorldManifest, so the world can change without rewriting the Phaser scene. Permissions and approvals belong to a separate system, not to the space or to Phaser (ADR-0022).",
      ),
    },
    {
      title: t("큰 엔진은 들어갈 때만 불러온다", "Load the big engine only on entry"),
      body: t(
        "Phaser는 공간에 들어갈 때 import()로 받고 나갈 때 game.destroy로 모두 정리합니다. 공간을 쓰지 않는 사용자가 엔진을 내려받지 않게 하려는 설계입니다.",
        "Phaser is fetched with import() when you enter the studio and fully released with game.destroy when you leave. The design keeps people who never use the studio from downloading the engine.",
      ),
    },
    {
      title: t("화면 UI와 캔버스 UI를 나눈다", "Separate screen UI from canvas UI"),
      body: t(
        "대화상자·메뉴 같은 DOM 입력은 접근성을 갖춘 부품(Radix)에 맡기고, 캔버스 안의 자주 바뀌는 표시는 엔진이 그립니다. 설계 문서(V11)가 정한 역할 분리입니다.",
        "DOM inputs such as dialogs and menus go to accessible parts (Radix), while frequently changing visuals inside the canvas are drawn by the engines. This is the role split set in the V11 design document.",
      ),
    },
  ],
  diagram: {
    id: "canvas-2d-virtual-studio-diagram",
    kind: "graph",
    title: t("편집 캔버스와 가상 스튜디오의 분업", "Division of labor: editing canvas and virtual studio"),
    caption: t(
      "React 화면 위에 편집 캔버스 섬들과 가상 스튜디오가 얹히고, 권한과 승인은 공간 밖의 별도 시스템이 맡습니다.",
      "Editing-canvas islands and the virtual studio sit on the React screens, and permissions and approvals belong to a separate system outside the space.",
    ),
    alt: t(
      "왼쪽의 React 화면이 위쪽으로는 Konva 무대를 올립니다. Konva 무대에는 선택 오버레이를 그리는 PixiJS, 벡터를 표시하는 CanvasKit 섬, 경로를 정리하는 Paper.js와 손그림 도형을 만드는 Rough.js가 이어집니다. 아래쪽으로는 공간에 들어갈 때만 Phaser를 불러옵니다. Phaser는 Tiled JSON 월드 데이터를 읽어 월드를 그리고 움직이며, 권한과 승인은 별도 시스템에 맡깁니다. React 화면은 Zustand와 상태를 주고받습니다.",
      "The React screen on the left mounts the Konva stage upward. The Konva stage links to PixiJS for the selection overlay, the CanvasKit island for vector display, and Paper.js for path cleanup and Rough.js for sketch shapes. Downward it loads Phaser only when you enter the studio. Phaser reads Tiled JSON world data to draw and move the world and leaves permissions and approvals to a separate system. The React screen exchanges state with Zustand.",
    ),
    nodes: [
      { id: "react", label: t("React 화면", "React screens"), sub: t("라우트 · 패널 · Compiler", "Routes, panels, Compiler"), tone: "local", at: [0, 1] },
      { id: "store", label: t("Zustand", "Zustand"), sub: t("공유 상태 · 일부 IndexedDB", "Shared state, some in IndexedDB"), tone: "local", shape: "cylinder", at: [0, 0] },
      { id: "konva", label: t("Konva 무대", "Konva stage"), sub: t("입력·선택의 주인", "Owns input, selection"), tone: "good", at: [1, 1] },
      { id: "pixi", label: t("PixiJS 오버레이", "PixiJS overlay"), sub: t("선택 요소 테두리·옅은 면", "Selection outline and fill"), tone: "local", at: [2, 0] },
      { id: "skia", label: t("CanvasKit 섬", "CanvasKit island"), sub: t("벡터 표시(WebGL2)", "Vector display (WebGL2)"), tone: "local", at: [2, 1] },
      { id: "vec", label: t("Paper.js · Rough.js", "Paper.js, Rough.js"), sub: t("경로 정리 · 손그림 도형", "Path cleanup, sketch shapes"), tone: "local", at: [2, 2] },
      { id: "phaser", label: t("Phaser", "Phaser"), sub: t("가상 스튜디오 2D 월드", "2D world of the virtual studio"), tone: "local", at: [1, 3] },
      { id: "world", label: t("월드 데이터", "World data"), sub: t("Tiled JSON + WorldManifest", "Tiled JSON + WorldManifest"), tone: "local", shape: "cylinder", at: [2, 3] },
      { id: "perm", label: t("권한·승인", "Permissions"), sub: t("별도 시스템(ADR-0022)", "A separate system (ADR-0022)"), tone: "warn", at: [1, 4] },
    ],
    edges: [
      { from: "react", to: "store", both: true, label: t("상태", "state") },
      { from: "react", to: "konva", label: t("react-konva", "react-konva") },
      { from: "konva", to: "pixi", label: t("투명 오버레이", "overlay") },
      { from: "konva", to: "skia", label: t("승인된 페이지", "approved") },
      { from: "konva", to: "vec", style: "dashed", label: t("경로 정리", "path cleanup") },
      { from: "react", to: "phaser", style: "dashed", label: t("입장할 때만", "on entry only") },
      { from: "phaser", to: "world", label: t("월드 읽기", "reads") },
      { from: "perm", to: "phaser", style: "dashed", label: t("승인은 따로", "separate") },
    ],
    groups: [
      { id: "editor", label: t("편집 캔버스", "Editing canvas"), tone: "good", nodeIds: ["konva", "pixi", "skia", "vec"] },
      { id: "studio", label: t("가상 스튜디오", "Virtual studio"), tone: "local", nodeIds: ["phaser", "world", "perm"] },
    ],
  },
  libraries: [
    {
      id: "konva",
      name: "Konva · react-konva",
      kind: "library",
      package: "konva",
      oneLine: t("편집 캔버스의 무대. 레이어와 말풍선을 고르고 옮기고 변형하는 화면", "The stage of the editing canvas, where layers and speech bubbles are picked, moved and transformed"),
      usedFor: t(
        "레이어·말풍선·텍스트를 고르고 옮기고 변형하는 화면과 포인터 입력을 맡습니다. 입력·선택 크롬의 단독 소유자이고, 문서 표시는 조건이 맞을 때 CanvasKit 섬이 넘겨받습니다.",
        "Handles the view where layers, speech bubbles and text are picked, moved and transformed, plus pointer input. It is the sole owner of input and selection chrome, and the CanvasKit island takes over document display when its conditions are met.",
      ),
      why: t(
        "react-konva로 React 화면과 같은 방식으로 이어지는 2D 장면 라이브러리라 편집 도구의 무대로 알맞습니다. 렌더러 역할 원장이 표시·입력·선택의 주인을 Konva 하나로 정했습니다(ADR-0019).",
        "As a 2D scene library that connects to React screens through react-konva, it suits the stage of an editing tool. The renderer role ledger names Konva the single owner of display, input and selection (ADR-0019).",
      ),
      alternatives: t(
        "Fabric.js는 Konva와 장면 모델이 겹쳐 제품 런타임에 도입하지 않았습니다(README).",
        "Fabric.js was not brought into the product runtime because its scene model overlaps with Konva (README).",
      ),
      cost: t(
        "ADR-0018은 Konva를 제거 후보로 두고 픽셀 권한부터 줄이는 중입니다. 캔버스 글자는 폰트가 바뀐 것을 몰라 폰트 로드 뒤 다시 그리는 훅이 필요합니다.",
        "ADR-0018 lists Konva as a removal candidate and is reducing its pixel authority first. Canvas text cannot notice a font swap, so a redraw hook runs after fonts load.",
      ),
      paths: [
        `${CREATOR}/render/studio-konva-runtime.ts`,
        `${CREATOR}/canvas/StudioCanvasViewportStageHost.tsx`,
        "docs/engines/renderer-roles.md",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "konva",
      atlasIds: ["konva-transform-snap", "renderer-role-ledger"],
    },
    {
      id: "pixijs",
      name: "PixiJS",
      kind: "library",
      package: "pixi.js",
      oneLine: t("Konva 위에 투명 캔버스를 겹쳐 선택한 요소의 테두리와 옅은 면을 GPU로 그리는 부품", "A part that layers a transparent canvas over Konva and draws the outline and a light fill of selected elements on the GPU"),
      usedFor: t(
        "선택한 요소의 경계 사각형에 옅은 색 면과 테두리를 투명 캔버스에 GPU로 그립니다. 마우스 올림 강조·클릭 판정·변형 핸들은 Konva 몫입니다.",
        "Draws a light fill and an outline around the bounds of each selected element on the GPU, in a transparent canvas above Konva. Hover highlights, click hit-testing and the resize and rotate handles stay with Konva.",
      ),
      why: t(
        "문서 픽셀과 입력은 Konva가 갖고, Pixi는 투명한 선택 오버레이 섬 하나만 단독 소유합니다. 같은 권위를 두 엔진이 나눠 갖지 않는 규칙(ADR-0003·0019)을 지키는 분업입니다.",
        "Konva keeps document pixels and input, and Pixi solely owns one transparent selection-overlay island. It is a division of labor that keeps the rule that no authority is shared by two engines (ADR-0003, 0019).",
      ),
      cost: t(
        "호출자가 WebGPU·WebGL 중 하나만 허용하고(제품은 WebGPU), 다른 렌더러가 켜지면 닫습니다(ADR-0018). CanvasKit 섬이 페이지를 미지원(legacy)으로 판정할 때만 켜집니다.",
        "The caller allows only WebGPU or WebGL (the product picks WebGPU), and another active renderer closes the provider (ADR-0018). The overlay is mounted only when the CanvasKit island rates the page as unsupported (legacy).",
      ),
      paths: [
        `${CREATOR}/render/studio-pixi-scene-provider.ts`,
        `${CREATOR}/StudioPixiSceneOverlayHost.tsx`,
        "docs/adr/0003-one-primary-surface-owner.md",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "pixijs",
    },
    {
      id: "phaser",
      name: "Phaser",
      kind: "engine",
      package: "phaser",
      oneLine: t("가상 스튜디오(2D 월드)의 이동·카메라·충돌을 맡는 2D 게임 엔진", "The 2D game engine behind movement, camera and collisions in the virtual studio"),
      usedFor: t(
        "가상 스튜디오에서 걷기·카메라·충돌·말 걸기·NPC 이동을 맡고, 방·벽·문 같은 월드 내용은 Tiled JSON과 WorldManifest에서 읽습니다.",
        "Handles walking, camera, collisions, interactions and NPC movement in the virtual studio, reading world content such as rooms, walls and doors from Tiled JSON and the WorldManifest.",
      ),
      why: t(
        "이동·충돌·카메라를 이미 갖춘 게임 엔진을 쓰고, 방 구조는 데이터가 소유해 Phaser 장면을 다시 쓰지 않고 월드를 바꿀 수 있습니다. 공간 화면은 들어갈 때 동적 import로 불러오게 짜여 있습니다.",
        "A game engine that already provides movement, collisions and camera is used, while data owns the room layout so the world can change without rewriting the Phaser scene. The studio screen is written to load it with a dynamic import on entry.",
      ),
      cost: t(
        "정적 import 1건이 남아 별도 청크로 분리되는지는 단정할 수 없습니다(실제 청크 크기는 미확인). 권한·승인은 Phaser가 아니라 별도 시스템이 가집니다.",
        "One static import remains, so a separate chunk cannot be assumed (real chunk sizes were not checked). Permissions and approvals belong to a separate system, not to Phaser.",
      ),
      paths: [
        `${CREATOR}/virtual-space/StudioVirtualSpacePhaserCanvas.tsx`,
        `${CREATOR}/virtual-space/studio-virtual-space-world-manifest.ts`,
        "docs/studio/virtual-studio-world-authoring.md",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "phaser",
      atlasIds: ["phaser-lazy-scene-lifecycle", "tiled-world-data-model", "space-is-not-permission"],
    },
    {
      id: "vector-geometry",
      name: "Paper.js · Rough.js · polygon-clipping",
      kind: "library",
      package: "paper",
      oneLine: t("벡터 도형을 합치고 겹침을 계산하고 손그림처럼 보이게 하는 수학 도구 모음", "A kit of vector math that merges shapes, computes overlaps and gives them a hand-drawn look"),
      usedFor: t(
        "선택한 획의 경로 정리(Paper.js), 말풍선 합치기 같은 다각형 합치기(polygon-clipping), 손그림 느낌 도형(Rough.js)을 필요할 때 불러와 계산합니다.",
        "Paper.js cleans up the path of a selected stroke, polygon-clipping merges polygons such as speech bubbles, and Rough.js makes hand-drawn-looking shapes, each brought in when needed.",
      ),
      why: t(
        "경로 합치기·평탄화·겹침 연산 같은 벡터 수학을 직접 짜지 않고 검증된 라이브러리를 씁니다. 라이브러리 객체가 경계 밖으로 나가지 않게 Paper.js는 PaperScope 하나에 가둡니다.",
        "Vector math such as merging, flattening and overlap operations comes from proven libraries instead of hand-written code, and Paper.js is confined to one PaperScope so library objects never cross the boundary.",
      ),
      cost: t(
        "도형 합치기·빼기 버튼은 이 셋이 아니라 CanvasKit 경로 연산(Worker)이 맡습니다. Paper.js는 작업마다 Project를 만들고 지워야 해서 감싸는 코드가 필요합니다.",
        "The shape combine and subtract buttons are computed by CanvasKit path operations in a Worker, not by these three. Paper.js needs a wrapper because each job must create and remove a Project.",
      ),
      paths: [
        `${CREATOR}/render/studio-engine-vector-geometry-provider.ts`,
        `${CREATOR}/studio-path-boolean.ts`,
        `${CREATOR}/studio-rough-shape.ts`,
      ],
      license: "MIT",
      status: "live",
      mapRowId: "vector-geometry",
    },
    {
      id: "react",
      name: "React 19 · React Compiler",
      kind: "library",
      package: "react",
      oneLine: t("모든 화면을 그리는 UI 뼈대. 대부분의 컴포넌트는 Compiler가 다시 그리기를 줄입니다", "The UI skeleton behind every screen; in most components the Compiler trims needless re-rendering"),
      usedFor: t(
        "라우트·편집 패널·3D 뷰포트까지 모든 화면을 컴포넌트로 짓습니다. 빌드할 때 React Compiler가 자동 메모이제이션을 하되 편집기 본체 등 일부는 뺍니다.",
        "Builds every screen, from routes and editing panels to the 3D viewport, as components. The React Compiler adds automatic memoization at build time, except in the editor body and some other files.",
      ),
      why: t(
        "Konva(react-konva)와 3D(R3F)가 모두 React용 연결 부품을 쓰는 구조라, 편집 화면과 캔버스·3D 뷰포트가 같은 컴포넌트 방식으로 이어집니다.",
        "Konva (react-konva) and 3D (R3F) both use React bindings, so the editing screens and the canvas and 3D viewports connect in one component style.",
      ),
      cost: t(
        "편집기 본체와 3D 배경 편집기 파일 다수는 'use no memo'로 Compiler에서 일부러 뺐습니다. 린트 플러그인은 아직 RC입니다. 프레임워크 비교 기록은 찾지 못했습니다.",
        "The editor body and many 3D background editor files are deliberately opted out of the Compiler with 'use no memo'. The lint plugin is still a release candidate. We found no record of comparing frameworks.",
      ),
      paths: [
        "apps/web/src/app/main.tsx",
        "apps/web/src/app/routes/AppRouter.tsx",
        "apps/web/vite.config.ts",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "react",
    },
    {
      id: "zustand",
      name: "Zustand",
      kind: "library",
      package: "zustand",
      oneLine: t("여러 화면이 함께 쓰는 작은 상태를 담는 가벼운 저장소", "A lightweight store for small bits of state shared by several screens"),
      usedFor: t(
        "컷츠 피드(조회·좋아요)·평점·참여·언어와 모드 같은 상태를 담고, 일부는 IndexedDB(브라우저 안 데이터베이스)에 이어 저장합니다.",
        "Holds state such as the Cuts feed (views and likes), ratings, engagement, language and mode, and persists some of it to IndexedDB, the browser's built-in database.",
      ),
      why: t(
        "패널·모달·사용자 설정 같은 화면 상태를 문서 상태와 분리해 담는 가벼운 저장소로, 설계 문서(V5)가 후보로 올렸습니다.",
        "A light store for screen state such as panels, modals and user settings, kept apart from document state; the V5 design document listed it as a candidate.",
      ),
      alternatives: t(
        "설계 문서(V5)에는 Jotai도 같은 후보로 적혀 있습니다. 둘을 견주어 고른 기록은 찾지 못했습니다.",
        "The V5 design document lists Jotai as a candidate too. We found no record of comparing the two before choosing.",
      ),
      cost: t(
        "다른 상태 라이브러리와 견준 문서가 없어 선택 이유의 근거는 약합니다. 일부 스토어만 IndexedDB에 이어 저장합니다.",
        "With no document comparing it against other state libraries, the basis for the choice is thin. Only some stores persist to IndexedDB.",
      ),
      paths: [
        "apps/web/src/domains/cuts/cuts-store.ts",
        "apps/web/src/shared/lib/idb-json-storage.ts",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "zustand",
    },
    {
      id: "ui-kit",
      name: "Tailwind CSS · Radix UI · cmdk",
      kind: "library",
      package: "tailwindcss",
      oneLine: t("화면 스타일, 접근성을 갖춘 대화상자·메뉴, ⌘K 명령 팔레트", "Screen styling, accessible dialogs and menus, and the ⌘K command palette"),
      usedFor: t(
        "스타일은 Tailwind, 키보드·스크린리더를 지원하는 대화상자와 메뉴는 Radix, 명령 팔레트는 cmdk가 맡습니다.",
        "Tailwind handles styling, Radix provides dialogs and menus with keyboard and screen-reader support, and cmdk powers the command palette.",
      ),
      why: t(
        "접근성이 필요한 DOM 입력(대화상자·메뉴·팝오버)은 직접 만들지 않고 검증된 부품을 쓰도록 설계 문서(V11)가 정했습니다. 캔버스 안의 표시와는 역할을 나눕니다.",
        "The V11 design document decided that accessibility-critical DOM inputs (dialogs, menus, popovers) use proven parts instead of hand-built ones, separate in role from what is drawn inside the canvas.",
      ),
      cost: t(
        "Tailwind는 빌드할 때만 도는 PostCSS 플러그인이라 코드는 제품 번들에 들어가지 않고 만들어진 CSS만 담깁니다. Tailwind를 고른 이유를 견준 문서는 찾지 못했습니다.",
        "Tailwind runs only at build time as a PostCSS plugin, so its code is not in the product bundle, only the generated CSS. We found no document comparing it with alternatives.",
      ),
      paths: [
        "apps/web/src/shared/components/command-palette.tsx",
        "apps/web/src/shared/components/age-gate-modal.tsx",
        "postcss.config.mjs",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "ui-kit",
    },
  ],
  pitfall: t(
    "'Konva를 걷어낸다'는 목표이지 현재가 아닙니다. 지금은 Konva가 입력·선택의 주인이고, 페이지의 모든 요소가 승인된 종류일 때만 CanvasKit 섬이 문서 표시를 넘겨받습니다(ADR-0025). 전체 편집기 교체가 아닙니다.",
    "'Removing Konva' is a goal, not today's state. Konva still owns input and selection, and the CanvasKit island takes over document display only when every element on the page is an approved kind (ADR-0025). It is not a whole-editor replacement.",
  ),
  status: "live",
  atlasIds: [
    "konva-transform-snap",
    "renderer-role-ledger",
    "virtual-studio-architecture-overview",
    "phaser-lazy-scene-lifecycle",
    "tiled-world-data-model",
    "space-is-not-permission",
  ],
  chapterIds: ["virtual-studio-world-authority", "architecture", "open-source"],
  glossaryIds: ["virtual-studio", "tiled-map", "hit-test-canvas", "renderer-role-ledger", "snap", "pointer-capture"],
};
