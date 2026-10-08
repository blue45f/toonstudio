import { CREATOR, D, row, t, watch } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 그림·페인팅 영역의 추가분(웹 그리기 도구, 사진·벡터 편집기, 픽셀 도구, 자연 매체, 감시 목록).
 * 앞부분의 대표 제품(Clip Studio Paint·Krita·Procreate 등)은 engineering-map-competitors-rows.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 */

const WEB_DRAWING = "docs/studio-web-drawing-benchmark-2026-07-12.md";
const UI_UX_MULTI = "docs/studio-ui-ux-multi-product-benchmark-2026-07-15.md";
const FULL_AREA = "docs/studio-full-area-benchmark-2026-07-15.md";
const FILE_LIFECYCLE = "docs/rewrite/studio-file-lifecycle-benchmark-2026-09-09.md";
const EFFECTS = "docs/rewrite/studio-effects-workspace-benchmark-2026-09-09.md";
const SELECTION = "docs/studio-selection-benchmark.md";
const INPUT_CENTER = "docs/studio-drawing-input-center-benchmark-2026-09-09.md";
const PIXEL = "docs/studio-pixel-pencil-pro-benchmark-2026-09-09.md";
const INTAKE = "docs/benchmarks/studio-competitive-intake-2026-09-02.md";
const EMERGING_INTAKE = "docs/benchmarks/studio-emerging-research-intake-2026-09-02.md";
const RADAR = "docs/studio-commercial-clean-room-radar-2026-07-28.md";
const MORPHOLOGY = "docs/studio/brush-material-morphology-2026-09.md";
const OPEN_ENGINES = "docs/candidates/natural-media/commercial-open-engines.md";
const OPEN_ENGINE_EVALUATION = `${CREATOR}/studio-commercial-open-engine-evaluation.ts`;
const LABS_REFERENCES = "docs/engines/labs-brush-engine-references-2026-10-01.md";
const V5_ARCHITECTURE = "docs/architecture/ToonStudio_최종공유본_초확장_멀티엔진_제품기능_UIUX_성능품질_아키텍처_V5_2026-08-07.md";

export const COMPETITOR_ROWS_DRAWING: readonly EngineeringMapRow[] = [
  /* ── 웹 그리기·사진 편집 ── */
  row({
    id: "photopea",
    name: "Photopea",
    domain: D.drawing,
    url: "https://www.photopea.com/",
    what: t(
      "브라우저 안에서 파일을 로컬로 처리하는 포토샵 계열 이미지 편집기입니다. PSD 중심 문서, 레이어·마스크·조정 레이어·스마트 필터가 비교 대상이었습니다.",
      "A Photoshop-class image editor that handles files locally in the browser. Its PSD-centered documents, layers, masks, adjustment layers and smart filters were compared.",
    ),
    learned: t(
      "배움: PSD 구조를 최대한 살리고 보정을 순서 바꿀 수 있는 스택으로 둠. tilt·역할 기반 협업은 공식 문서에서 확인 못 해 ‘없다’고 단정하지 않음.",
      "Learned: keep PSD structure where possible and keep corrections as a reorderable stack. Tilt and role-based collaboration were not confirmed in its docs, so they are not declared absent.",
    ),
    overlap: t("PSD 불러오기, 스마트 필터 패널, 전경·배경 이중 색상 우물.", "PSD import, the smart filters panel and the dual foreground/background color well."),
    evidence: [WEB_DRAWING, UI_UX_MULTI, FILE_LIFECYCLE, EFFECTS, `${CREATOR}/studio-psd-import.ts`, `${CREATOR}/StudioSmartFiltersPanel.tsx`, `${CREATOR}/StudioDualColorWell.tsx`],
  }),
  row({
    id: "kleki",
    name: "Kleki",
    domain: D.drawing,
    url: "https://kleki.com/",
    what: t(
      "설치 없이 바로 그리는 가벼운 웹 그림 도구입니다. 작은 화면용 화면 구성, 터치 제스처, 필압 크기·불투명도, 간단한 레이어와 PSD 출력이 비교 대상이었습니다.",
      "A light web drawing tool you can use without installing anything. Its small-screen layout, touch gestures, pressure-based size and opacity, simple layers and PSD output were compared.",
    ),
    learned: t(
      "배움: 첫 획까지 거리가 짧은 초보용 Simple 모드, 모바일은 핵심 도구 우선·고급은 검색·전체 화면 시트. 스프레이·초크는 오픈소스판 Klecks(MIT) 알고리즘을 출처 표기 후 다시 구현, 나머지 브러시는 공개된 동작만 보고 새로 만듦.",
      "Learned: a Simple mode with a short path to the first stroke, core tools first on mobile and advanced ones in search and full-screen sheets. Spray and chalk re-implement the open-source Klecks (MIT) algorithms with attribution; other brushes were rebuilt from public behavior only.",
    ),
    overlap: t(
      "Simple·Full·Focus 화면 밀도, 웹 그리기 브러시 키트(구름 스프레이·채우기), Klecks 유래 스프레이·초크 커널.",
      "Simple, Full and Focus density modes, the web-drawing brush kit (soft cloud spray, flat fills) and the spray and chalk kernels derived from Klecks.",
    ),
    evidence: [
      WEB_DRAWING,
      UI_UX_MULTI,
      `${CREATOR}/studio-web-drawing-competitive-kit.ts`,
      `${CREATOR}/studio-web-drawing-coloring-kit.ts`,
      `${CREATOR}/studio-oss-brush-kernels.ts`,
      OPEN_ENGINES,
    ],
  }),
  row({
    id: "pixlr",
    name: "Pixlr",
    domain: D.drawing,
    url: "https://pixlr.com/",
    what: t(
      "웹과 모바일에서 쓰는 사진 편집 서비스입니다. 레이어·마스크, 밝기·곡선·레벨 같은 보정, 템플릿 중심의 빠른 결과가 비교 대상이었습니다.",
      "A photo editing service for web and mobile. Its layers and masks, brightness, curves and levels corrections, and template-led quick results were compared.",
    ),
    learned: t(
      "배움: 보정 기능 수를 더 늘리기보다 비파괴 스택·검색·즐겨찾기·최근 사용으로 정리하는 UX. 필압 근거는 2022년 공식 글이라 기기별 실측을 계속 유지.",
      "Learned: organize the already wide set of corrections as a non-destructive stack with search, favorites and recents instead of adding more filters. Its pressure evidence is a 2022 post, so per-device checks continue.",
    ),
    overlap: t("효과 작업공간의 검색·즐겨찾기·최근 사용과 비파괴 필터 스택.", "The effects workspace's search, favorites, recents and non-destructive filter stack."),
    evidence: [WEB_DRAWING, UI_UX_MULTI, FULL_AREA, `${CREATOR}/StudioSmartFiltersPanel.tsx`],
  }),
  row({
    id: "sketchbook",
    name: "Sketchbook",
    domain: D.drawing,
    url: "https://www.sketchbook.com/",
    what: t(
      "캔버스를 크게 쓰는 그림 앱입니다. 화면을 가리지 않는 작은 떠 있는 도구 막대와, 저장·자동 복구·백업 방식이 비교 대상이었습니다.",
      "A drawing app that gives the canvas most of the screen. Its small floating toolbar and its save, auto-recovery and backup handling were compared.",
    ),
    learned: t(
      "배움: 복구용 임시 저장은 ‘임시’라고 표시하고, 레이어 보존 백업·저장 확인·외부 사본을 서로 다른 보호로 구분. 작은 진입점에서 단계적으로 여는 UI도 참고.",
      "Learned: label recovery caches as temporary, and keep layered backup, save verification and external copies as separate protections. Its small entry points that open step by step were also a reference.",
    ),
    overlap: t("초안 저장 센터·체크포인트와 캔버스 집중 화면.", "The draft save center, checkpoints and the canvas-focus layout."),
    evidence: [FILE_LIFECYCLE, UI_UX_MULTI, "docs/quality/drawing-stabilization-2026-09-26.md", INPUT_CENTER, `${CREATOR}/StudioCheckpointPanel.tsx`, `${CREATOR}/StudioDraftSaveCenter.tsx`],
  }),
  row({
    id: "concepts",
    name: "Concepts",
    domain: D.drawing,
    url: "https://concepts.app/",
    what: t(
      "무한 캔버스에서 고치기 쉬운 선과 정밀한 도구를 쓰는 모바일 스케치 앱입니다. 줌·단위를 보여 주는 알약 모양 표시와 프로젝트 백업이 비교 대상이었습니다.",
      "A mobile sketching app with an infinite canvas, editable strokes and precision tools. Its pill-shaped zoom and unit readouts and its project backup were compared.",
    ),
    learned: t(
      "배움: 도구·색·속성을 가까이 두어 패널 왕복을 줄이고, 줌·단위 같은 정밀 값을 작은 표시로 보여 줌. 동기화 데이터와 기기 전체 백업을 같은 말로 쓰지 않음.",
      "Learned: keep tools, colors and properties close to cut panel round trips, show precision values such as zoom and units in small pills, and never call synced data and whole-device backup the same thing.",
    ),
    overlap: t("그리기 HUD의 지표 알약(줌·단위)과 정밀 입력.", "The drawing HUD's metric pills (zoom, units) and precision input."),
    evidence: [UI_UX_MULTI, INPUT_CENTER, FILE_LIFECYCLE, INTAKE, "docs/benchmarks/studio-competitor-registry.json", `${CREATOR}/brush/studio-draw-hud.ts`],
  }),
  row({
    id: "adobe-fresco",
    name: "Adobe Fresco",
    domain: D.drawing,
    url: "https://www.adobe.com/products/fresco.html",
    what: t(
      "펜·터치 중심의 그림 앱으로 물 흐름과 안료가 움직이는 ‘라이브 브러시’를 갖췄다고 문서가 적었습니다. 좌·우 도구막대, 터치 단축, 필압 곡선 조절도 비교 대상이었습니다.",
      "A pen and touch painting app whose 'live brushes' move water and pigment, as the documents record. Its left or right toolbar, touch shortcuts and pressure-curve editing were also compared.",
    ),
    learned: t(
      "배움: 왼손·오른손 도크, 길게 눌러 임시 도구, 곡선 옆 시험 영역에서 필압 확인, 젖은 수채 상태를 저장해 다시 열기. 정지된 안료 무늬를 유체 시뮬레이션과 같다고 말하지 않음.",
      "Learned: left- and right-hand docks, hold-for-temporary-tool, a test area beside the pressure curve, and saving wet watercolor state for reopening. Static pigment patterns are not claimed to equal fluid simulation.",
    ),
    overlap: t("필압 곡선 그래프와 시험선, 모바일 퀵 액션, 젖은 잉크 영속 코덱.", "The pressure-curve graph and test stroke, mobile quick actions and the wet-ink persistence codec."),
    evidence: [
      "docs/studio-commercial-manual-benchmark-2026-07-10.md",
      RADAR,
      "docs/studio-drawing-pressure-lab-2026-09-05.md",
      MORPHOLOGY,
      "docs/benchmarks/studio-competitor-registry.json",
      `${CREATOR}/studio-pressure-curve-graph.ts`,
    ],
  }),
  row({
    id: "affinity-photo",
    name: "Affinity Photo",
    domain: D.drawing,
    url: "https://affinity.serif.com/photo/",
    what: t(
      "사진·이미지 편집 프로그램입니다. 원본을 건드리지 않는 라이브 필터, 레이어 상태(Layer States), 아래 레이어를 변위 지도로 쓰는 효과, 조명 효과가 비교 대상이었습니다.",
      "A photo and image editing program. Its non-destructive live filters, Layer States, displacement effects that use the layer below as a map, and lighting effects were compared.",
    ),
    learned: t(
      "배움: 필터를 원본과 분리한 비파괴 스택, 합성 상태를 저장해 재사용, 높이장으로 다시 조명. 변위·조명은 CPU 기준 구현과 다중 조명 Worker까지 있고 효과 그래프 연결은 남음.",
      "Learned: a non-destructive filter stack kept apart from the source, saved composite states, and relighting from a height field. Displacement and lighting exist as CPU reference code plus a multi-light Worker; wiring into the effect graph remains.",
    ),
    overlap: t("스마트 필터 패널과 레이어 스마트 보기, 다중 조명 표면 제공자(Worker).", "The smart filters panel, layer smart views and the multi-light surface provider (Worker)."),
    evidence: [
      RADAR,
      "docs/studio-layer-intelligence-upgrade-2026-09-09.md",
      EFFECTS,
      SELECTION,
      `${CREATOR}/StudioSmartFiltersPanel.tsx`,
      `${CREATOR}/studio-multi-light-surface-provider.ts`,
    ],
  }),
  row({
    id: "affinity-designer",
    name: "Affinity Designer",
    domain: D.drawing,
    url: "https://affinity.serif.com/designer/",
    what: t(
      "벡터와 래스터를 한 문서에서 다루는 디자인 프로그램입니다. 그린 뒤에도 고칠 수 있는 벡터 선, 제어점, 폭 프로필이 제품군 단위로 비교됐습니다.",
      "A design program that handles vector and raster in one document. Strokes that stay editable after drawing, control points and width profiles were compared at the product-group level.",
    ),
    learned: t(
      "배움(제품군 기록): 그린 뒤에도 편집 가능한 벡터 선, Nudge·Slice·폭 프로필, 래스터·벡터 하이브리드 문서. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (group-level record): strokes editable after drawing, Nudge and Slice, width profiles and hybrid raster/vector documents. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("편집 가능한 벡터 선(Smart Shape)과 벡터 지우개·선 편집.", "Editable vector strokes (Smart Shape), the vector eraser and line editing."),
    evidence: [INTAKE, "docs/benchmarks/studio-competitor-registry.json", "docs/studio-competitor-residual-batch-2026-07-24.md"],
  }),
  row({
    id: "adobe-illustrator",
    name: "Adobe Illustrator",
    domain: D.drawing,
    url: "https://www.adobe.com/products/illustrator.html",
    what: t(
      "벡터 그래픽 편집 프로그램입니다. 그룹 안의 개체를 고르는 방식과 겹친 개체 뒤쪽 고르기, 고치기 쉬운 벡터 선이 비교 대상이었습니다.",
      "A vector graphics editor. Its way of picking objects inside groups, selecting objects behind others, and its editable vector strokes were compared.",
    ),
    learned: t(
      "배움: 그룹 단위 선택을 유지하면서 겹친 후보를 순서대로 보여 주는 ‘뒤 고르기’의 기반, 더하기·빼기 선택. 이 제품만의 적용 위치는 문서에 따로 없음.",
      "Learned: keep group-unit selection while exposing an ordered candidate stack for select-behind, plus additive and subtractive selection. No product-specific place of adoption is recorded.",
    ),
    overlap: t("요소 다중 선택의 후보 순서·뒤 고르기와 편집 가능한 벡터 선.", "The ordered candidate stack and select-behind for multi-selection, and editable vector strokes."),
    evidence: ["docs/studio-selection-benchmark-2026-09-09.md", INTAKE, "docs/benchmarks/studio-competitor-registry.json", `${CREATOR}/studio-figma-selection-ux.ts`],
  }),
  row({
    id: "gimp",
    name: "GIMP",
    domain: D.drawing,
    url: "https://www.gimp.org/",
    what: t(
      "오픈소스 이미지 편집 프로그램입니다. 선택 결합 방식(바꾸기·더하기·빼기·교집합)과 GEGL 기반 비파괴 필터 스택이 비교 대상이었습니다.",
      "An open-source image editor. Its selection combine modes (replace, add, subtract, intersect) and the GEGL-based non-destructive filter stack were compared.",
    ),
    learned: t(
      "배움: 선택 틀의 이동과 선택된 내용의 이동을 구분하고, 필터는 한 번 실행이 아니라 작업 단위의 스택과 상태 진단으로 다룸. GEGL 자체는 라이선스 때문에 격리 provider로만 검토(ADR 0008).",
      "Learned: keep moving a selection frame apart from moving its content, and treat filters as a per-job stack with status diagnostics. GEGL itself is considered only as an isolated provider for license reasons (ADR 0008).",
    ),
    overlap: t("픽셀 선택 HUD·결합 규칙과 효과 스택 진단.", "The pixel-selection HUD and combine rules, and effect-stack diagnostics."),
    evidence: [SELECTION, EFFECTS, "docs/adr/0008-license-isolation-policy.md", "docs/benchmarks/studio-competitor-registry.json", `${CREATOR}/StudioPixelSelectionHud.tsx`],
  }),

  /* ── 픽셀·보조 그림 ── */
  row({
    id: "aseprite",
    name: "Aseprite",
    domain: D.drawing,
    url: "https://www.aseprite.org/",
    what: t(
      "픽셀 아트 전용 그림 프로그램입니다. 정수 브러시 크기, 픽셀 퍼펙트 스위치, 대칭축, 타일 편집이 비교 대상이었습니다.",
      "A drawing program dedicated to pixel art. Its integer brush sizes, pixel-perfect switch, symmetry axes and tiled editing were compared.",
    ),
    learned: t(
      "배움: 픽셀 의도를 일반 브러시 엔진 뒤에 숨기지 않고 주 문맥 바에 드러냄, 1px 모서리 정리, 대칭을 문서 변환 계약으로 공유. 팔레트 잠금·디더링은 문서 변경이 필요해 후속.",
      "Learned: show pixel intent in the main context bar instead of hiding it in a brush engine, clean 1px corners, and share symmetry through the document transform contract. Palette lock and dithering need document changes and come later.",
    ),
    overlap: t("픽셀 연필(정수 단단한 촉·픽셀 퍼펙트 정리·대칭).", "The pixel pencil (integer hard tips, pixel-perfect cleanup, symmetry)."),
    evidence: [PIXEL, UI_UX_MULTI, `${CREATOR}/studio-pixel-pencil.ts`, `${CREATOR}/studio-pixel-art-mode.ts`],
  }),
  row({
    id: "piskel",
    name: "Piskel",
    domain: D.drawing,
    url: "https://www.piskelapp.com/",
    what: t(
      "브라우저에서 스프라이트를 그리고 바로 미리 보는 픽셀 아트 도구입니다. 편집 옆에 붙은 스프라이트 미리보기·내보내기가 비교 대상이었습니다.",
      "A browser pixel-art tool for drawing sprites and previewing them at once. Its sprite preview and export placed next to editing were compared.",
    ),
    learned: t(
      "배움: 애니메이션 미리보기는 가치가 있지만 프레임·타임라인 영역의 일이라 픽셀 연필의 획 계약에 넣지 않음. 타일·래핑 미리보기와 스프라이트 재생은 후속.",
      "Learned: animation preview is valuable but belongs to the frame and timeline boundary, not the pixel-pencil stroke contract. Tile and wrap-around preview and sprite playback come later.",
    ),
    overlap: t("픽셀 연필과 프레임·타임라인 경계(후속 과제).", "The pixel pencil and the frame/timeline boundary (follow-up work)."),
    evidence: [PIXEL, UI_UX_MULTI, `${CREATOR}/studio-pixel-pencil.ts`],
  }),
  row({
    id: "autodraw",
    name: "AutoDraw",
    domain: D.drawing,
    url: "https://www.autodraw.com/",
    what: t(
      "낙서를 깔끔한 그림으로 바꿔 주는 보조 그리기 도구입니다. 도움을 켜고 끄는 모드 전환이 눈에 잘 띄는 점이 비교 대상이었습니다.",
      "An assistive drawing tool that turns doodles into clean shapes. Its easy-to-see toggle for turning assistance on and off was compared.",
    ),
    learned: t(
      "배움: AI 보조는 기본으로 켜 두지 않고 선택 사항으로 두어 화면을 어지럽히지 않음. 낙서를 깔끔한 도형으로 바꾸는 흐름은 QuickShape 승격으로 참고.",
      "Learned: keep AI assistance optional rather than a default that clutters the screen. The doodle-to-clean-shape flow was a reference for promoting QuickShape.",
    ),
    overlap: t("도형 자동 보정(quick shape)과 선택형 AI 보조 켜기·끄기.", "Shape snapping (quick shape) and an opt-in toggle for AI assistance."),
    evidence: [UI_UX_MULTI, `${CREATOR}/studio-creative-ux.ts`, `${CREATOR}/drawing/quick-shape.ts`],
  }),
  row({
    id: "lospec",
    name: "Lospec",
    domain: D.drawing,
    url: "https://lospec.com/",
    what: t(
      "픽셀 아트용 팔레트와 디더링(색 수를 줄이는 점 섞기) 자료를 모아 두는 사이트입니다. 팔레트·디더링 제약을 명시적으로 두는 방식이 참고 대상이었습니다.",
      "A site that collects pixel-art palettes and dithering (mixing dots to cut color count). Its explicit palette and dithering constraints were the reference.",
    ),
    learned: t(
      "배움: 팔레트 잠금과 디더 행렬은 펜 안의 숨은 변경이 아니라 문서·색 정책으로 구현해야 함. 내보내기와 재생 불일치를 막기 위해 후속 단계로 남김.",
      "Learned: palette lock and dither matrices belong in document and color policy, not hidden pen mutations. They are left as a follow-up to avoid export and replay mismatches.",
    ),
    overlap: t("픽셀 연필의 후속 과제(팔레트 잠금·디더링).", "The pixel pencil's follow-ups (palette lock, dithering)."),
    evidence: [PIXEL, `${CREATOR}/studio-creative-ux.ts`],
  }),

  /* ── 자연 매체·붓 ── */
  row({
    id: "rebelle",
    name: "Rebelle",
    domain: D.drawing,
    url: "https://www.escapemotions.com/products/rebelle/about",
    what: t(
      "수채·안료 번짐과 종이 질감을 시뮬레이션하는 자연 매체 그림 프로그램입니다. 안료 혼색, 물의 확산·건조, 개별 붓털, 임파스토(두꺼운 물감)가 비교 대상이었습니다.",
      "A natural-media painting program that simulates watercolor and pigment bleed and paper texture. Pigment mixing, water spread and drying, individual bristles and impasto (thick paint) were compared.",
    ),
    learned: t(
      "배움: 기능 수가 아니라 안료·수분·종이 높이 같은 엔진 상태로 판단, 안료 혼색은 사용자가 제공한 반사율만 사용. 안 한 점: 상용 코드·프리셋·종이 스캔 반입(clean-room).",
      "Learned: judge by engine state such as pigment, water and paper height, and mix pigments only from user-supplied reflectance. Not adopted: importing commercial code, presets or paper scans (clean-room).",
    ),
    overlap: t("스펙트럼 혼색·부호 있는 임파스토 높이장·개별 섬유 붓털 제공자와 Hokusai 엔진.", "The spectral mixing, signed impasto height and individual-fiber bristle providers, and the Hokusai engine."),
    evidence: [RADAR, INTAKE, MORPHOLOGY, "docs/brush-texture-competitive-analysis-2026-08-22.md", `${CREATOR}/studio-impasto-height-provider.ts`, `${CREATOR}/render/wet-ink-lab-b/studio-wet-ink-b-km.ts`],
  }),
  row({
    id: "artrage",
    name: "ArtRage",
    domain: D.drawing,
    url: "https://www.artrage.com/",
    what: t(
      "오일·수채·캔버스 질감을 흉내 내는 자연 매체 그림 프로그램입니다. 물감 두께와 캔버스 결이 비교 대상이었습니다.",
      "A natural-media painting program that imitates oil, watercolor and canvas texture. Paint depth and canvas grain were compared.",
    ),
    learned: t(
      "배움(제품군 기록): 물감 두께·종이 높이·젖음 시간 같은 상태를 획에 유지. 이 제품만의 적용·불채택은 문서에 따로 적혀 있지 않음.",
      "Learned (group-level record): keep state such as paint height, paper height and wetness age with the stroke. No product-specific adoption or exclusion is recorded.",
    ),
    overlap: t("자체 자연 매체 브러시 엔진(Hokusai)과 임파스토 높이 제공자.", "The in-house natural-media brush engine (Hokusai) and the impasto height provider."),
    evidence: [INTAKE, RADAR, "docs/benchmarks/studio-competitor-registry.json", `${CREATOR}/studio-impasto-height-provider.ts`],
  }),
  row({
    id: "mypaint",
    name: "MyPaint",
    domain: D.drawing,
    url: "https://mypaint.app/",
    what: t(
      "무한 캔버스와 브러시 엔진 중심의 오픈소스 그림 프로그램입니다. 브러시를 파일 형식(mypaint-brush)으로 주고받는 점이 관찰 초점이었습니다.",
      "An open-source painting program built around an infinite canvas and a brush engine. Exchanging brushes as a file format (mypaint-brush) was the focus.",
    ),
    learned: t(
      "배움: 브러시 데이터가 CC0로 공개돼 프리셋 12종의 설정을 출처 경로와 함께 옮겨 쓰고, 옮기지 못한 입력은 숨기지 않고 기록. 엔진은 libmypaint 교차검증용이고 Hokusai가 1차 후보(ADR 0006).",
      "Learned: its brush data is published as CC0, so 12 presets' settings are transcribed with source paths and unmapped inputs are recorded rather than hidden. The engine serves only as a libmypaint cross-check, with Hokusai as the first candidate (ADR 0006).",
    ),
    overlap: t("CC0 MyPaint 프리셋 가져오기(스탬프 브러시 엔진)와 브러시 입력 수명 주기 정리.", "Importing CC0 MyPaint presets (stamp brush engine) and the brush-input lifecycle."),
    evidence: ["docs/benchmarks/studio-competitor-registry.json", "docs/adr/0006-natural-media-hokusai-first.md", "docs/engines/native-brush-probe-dirty-transfer-2026-09-19.md", `${CREATOR}/studio-cc0-mypaint-preset-import-v1.ts`],
  }),
  row({
    id: "infinite-painter",
    name: "Infinite Painter",
    domain: D.drawing,
    url: "https://www.infinitestudio.art/painter.php",
    what: t(
      "모바일 그림 앱입니다. 전체 레이어·선택 영역에 필터를 적용하고, 길게 눌러 원본과 비교하며, 빠른 마스크를 쓰는 방식이 비교 대상이었습니다.",
      "A mobile painting app. Applying filters to a whole layer or a selection, hold-to-compare with the original, and quick masks were compared.",
    ),
    learned: t(
      "배움: 비용·순서 진단을 먼저 만들고, 전후 분할 비교와 톤 기반 빠른 마스크는 렌더 계약 확장 항목으로 남김. 브러시의 갈필(속도에 따라 캔버스 결이 비침) 같은 손맛도 참고.",
      "Learned: build cost and order diagnostics first, and leave split before/after and tone-based quick masks as render-contract extensions. Brush feel such as speed-thinned coverage (dry brush) was also a reference.",
    ),
    overlap: t("효과 스택 진단과 필터 마스크, 손맛 매체 부하 모델.", "Effect-stack diagnostics and filter masks, and the hand-feel media-load model."),
    evidence: [EFFECTS, INTAKE, "docs/benchmarks/studio-competitor-registry.json", `${CREATOR}/studio-hand-feel-media-load-v1.ts`, `${CREATOR}/studio-web-drawing-competitive-kit.ts`],
  }),
  row({
    id: "picsart",
    name: "Picsart",
    domain: D.drawing,
    url: "https://picsart.com/",
    what: t(
      "사진·그림을 꾸미는 모바일·웹 서비스입니다. 종류별로 나뉜 브러시 트레이와 획 미리보기 타일이 코드 주석에서 참고 대상으로 적혔습니다.",
      "A mobile and web service for decorating photos and drawings. Its category-grouped brush tray and stroke-preview tiles are cited as references in code comments.",
    ),
    learned: t(
      "배움: 브러시를 이름 목록이 아니라 획 미리보기 타일로 보여 주는 트레이. 이름·화면은 복제하지 않고 정보 구조만 가져옴(코드 주석 기준, 별도 벤치마크 문서는 없음).",
      "Learned: a tray that shows brushes as stroke-preview tiles instead of name lists. Only the information structure is taken, not names or screens (per code comments; no separate benchmark document).",
    ),
    overlap: t("브러시 트레이의 획 미리보기 타일과 종류별 묶음.", "The brush tray's stroke-preview tiles and category groups."),
    evidence: [UI_UX_MULTI, `${CREATOR}/studio-creative-ux.ts`, `${CREATOR}/brush/studio-brush-visual.ts`, `${CREATOR}/brush/StudioBrushTray.tsx`],
  }),
  row({
    id: "expresii",
    name: "Expresii",
    domain: D.drawing,
    url: "https://www.expresii.com/",
    what: t(
      "물의 흐름을 흉내 내는 수채 그림 프로그램입니다. 젖은 가장자리가 어두운 테두리로 남는 ‘수채 느낌’이 코드 주석에서 참고 대상으로 적혔습니다.",
      "A watercolor program that imitates the flow of water. The wet-edge look where paint leaves a darker rim is cited as a reference in code comments.",
    ),
    learned: t(
      "배움: 젖은 가장자리 링처럼 구조로 보이는 수채 특징을 숫자 투명도 조정이 아닌 팁 모양으로 표현. 별도 비교 문서는 없고 코드 주석이 근거(미확인 범위 큼).",
      "Learned: express a visible watercolor trait such as a wet-edge ring as tip structure, not an opacity tweak. There is no separate comparison document; the code comments are the evidence, so most detail is unconfirmed.",
    ),
    overlap: t("수채 팁 가장자리 링 커버리지(오픈소스 브러시 커널)와 브러시 별칭 프로필.", "The watercolor tip's edge-ring coverage (open-source brush kernels) and the brush alias profile."),
    evidence: [`${CREATOR}/studio-oss-brush-kernels.ts`, `${CREATOR}/brush/studio-brush-alias-profile.ts`],
  }),
  row({
    id: "bomomo",
    name: "Bomomo",
    domain: D.drawing,
    url: "https://bomomo.com/",
    what: t(
      "여러 점이 흔적을 남기며 움직이는 웹 그림 장난감입니다. 다중 에이전트 흔적과 만화경(N겹 방사) 펜이 코드 주석에서 참고 장르로 적혔습니다.",
      "A web drawing toy where many points leave trails as they move. Its multi-agent trails and kaleidoscope (N-fold radial) pens are cited as a reference genre in code comments.",
    ),
    learned: t(
      "배움: 기하학적 의도만 공개된 동작에서 가져와 순수·결정적 함수로 구현. 소스·자산은 복사하지 않음(clean-room). 별도 벤치마크 문서는 없고 코드 주석이 근거.",
      "Learned: take only the geometric intent from public behavior and build it as pure, deterministic functions. No source or assets are copied (clean-room). There is no benchmark document; code comments are the evidence.",
    ),
    overlap: t("웹 그리기 브러시 키트의 다중 에이전트·만화경 잉크.", "The web-drawing brush kit's multi-agent and kaleidoscope ink."),
    evidence: [`${CREATOR}/studio-web-drawing-competitive-kit.ts`, `${CREATOR}/studio-web-drawing-assist-kit.ts`],
  }),
  row({
    id: "enkava",
    name: "Enkava",
    domain: D.drawing,
    url: "https://enkava.com/",
    what: t(
      "설치 없이 브라우저에서 그림, 고칠 수 있는 벡터 선, 프레임 애니메이션을 한 문서로 다루는 서비스입니다. 로컬 파일 우선 구조가 관찰 대상이었습니다.",
      "A service that handles painting, editable vector strokes and frame animation in one document, with no install. Its local-file-first design was observed.",
    ),
    learned: t(
      "적용 방향(계획): 래스터·벡터가 같은 편집·선택·이력 경계를 쓰고, 애니메이션 프레임이 현재 페이지·레이어 상태를 유지. 완료로 센 항목은 아님.",
      "Planned direction: raster and vector share one editing, selection and history boundary, and animation frames keep the current page and layer state. None of this is counted as finished.",
    ),
    overlap: t("OPFS 로컬 저장과 자체 아카이브(로그인·네트워크와 분리).", "OPFS local storage and the self-contained archive (independent of login and network)."),
    evidence: [EMERGING_INTAKE, "docs/benchmarks/studio-emerging-product-registry.json"],
  }),

  /* ── 오픈소스·연구용 그림 도구(라이선스 때문에 개념만 참고한 것 포함) ── */
  row({
    id: "graphite-editor",
    name: "Graphite",
    domain: D.drawing,
    url: "https://graphite.art/",
    what: t(
      "벡터와 래스터 그림을 노드 그래프로 비파괴 편집하는 오픈소스 그래픽 편집기입니다. 신규 제품 감시 목록(우선순위 P1)에 있고, 설계 문서가 레이어 화면과 노드 그래프의 관계를 눈여겨봤습니다.",
      "An open-source graphics editor that edits vector and raster art non-destructively through a node graph. It is on the emerging-product watchlist (priority P1), and a design document looked at how its layer view relates to its node graph.",
    ),
    learned: t(
      "배움(설계 단계): 레이어 화면과 노드 그래프를 서로 다른 문서가 아니라 같은 절차 구조의 두 보기로 둠. 비파괴 스트로크·블렌드 수식은 개념만 참고하고 코드는 복제하지 않음.",
      "Learned (design stage): keep the layer view and the node graph as two views of one procedural structure, not two documents. Non-destructive strokes and blend formulas are consulted as concepts only; no code is copied.",
    ),
    overlap: t(
      "설계 문서의 레이어↔노드 이중 표현 계획(BrushGraph·ProceduralGraph). 어디까지 구현됐는지는 문서에 없어 확인하지 못함.",
      "The design document's plan for dual layer and node views (BrushGraph, ProceduralGraph). How far it is implemented is not in the documents, so it was not confirmed.",
    ),
    evidence: [LABS_REFERENCES, V5_ARCHITECTURE, "docs/benchmarks/studio-emerging-product-registry.json"],
  }),
  row({
    id: "harmony-mrdoob",
    name: "Harmony (mrdoob)",
    domain: D.drawing,
    url: "https://mrdoob.com/projects/harmony/",
    urlTitle: "Harmony (mrdoob)",
    what: t(
      "가까운 점끼리 선으로 이어 스케치 같은 질감을 내는 ‘Sketchy’·‘Web’ 붓, 접선 방향 털 가닥 붓을 가진 절차형 웹 그림 도구입니다. 참고 문헌 원장은 코드를 GPL로 적었습니다.",
      "A procedural web drawing tool with Sketchy and Web brushes, which join nearby points with lines for a sketch-like texture, and a fur brush of tangent-following strands. The reference ledger lists its code as GPL.",
    ),
    learned: t(
      "배움: 근접 결합 수식과 털 가닥 수식을 clean-room으로 다시 씀(코드 복사 아님). 원장은 GPL 저장소를 ‘금지: 문서·개념만’으로 분류해, 개념과 수식 수준에서만 참고함.",
      "Learned: the proximity-coupling and fur-strand formulas were re-derived clean-room (no code copied). The ledger classes GPL repositories as 'prohibited: documents and concepts only', so it was consulted at the concept and formula level only.",
    ),
    overlap: t(
      "자연 매체 커널 모음(studio-oss-brush-kernels)의 근접 결합 함수와 털 가닥 함수.",
      "The proximity-coupling and fur-strand functions in the natural-media kernel set (studio-oss-brush-kernels).",
    ),
    evidence: [`${CREATOR}/studio-oss-brush-kernels.ts`, LABS_REFERENCES],
  }),
  row({
    id: "liquidfun-paint",
    name: "LiquidFun Paint",
    domain: D.drawing,
    url: "https://github.com/google/liquidfunpaint",
    urlTitle: "LiquidFun Paint (Google)",
    what: t(
      "구글이 Google Play에 낸 입자 유체 그림 놀이 앱입니다(오픈소스 LiquidFun 물리 엔진 기반). 저장소의 상용급 엔진 평가표는 이 앱을 ‘개념 영감’ 역할로 분류했습니다.",
      "A particle-fluid painting toy that Google released on Google Play, built on the open-source LiquidFun physics engine. The repository's commercial-grade engine evaluation files it as a concept inspiration.",
    ),
    learned: t(
      "배움: 액체·끈적임·마른 도구의 세 갈래 분류에서 펜·물·고정 모드 아이디어를 얻음. 안드로이드 앱은 넣지 않고, 입자 유체는 튀김·물방울 같은 특수 붓용 선택지로만 둠.",
      "Learned: the liquid, sticky and dry tool split gave the idea for pen, water and fix modes. The Android app is not embedded, and particle fluid stays an option for specialty brushes such as splatter and drip.",
    ),
    overlap: t(
      "펜·물·고정을 나누는 도구 구분 UX. LiquidFun 코드를 직접 쓰는 곳은 저장소에서 찾지 못함(평가표와 테스트에만 이름이 있음).",
      "The pen, water and fix tool split. No code that uses LiquidFun directly was found in the repository (the name appears only in the evaluation table and its test).",
    ),
    evidence: [OPEN_ENGINE_EVALUATION, OPEN_ENGINES],
  }),
  row({
    id: "inkwash",
    name: "Inkwash",
    domain: D.drawing,
    url: "https://johnowhitaker.github.io/inkwash/about",
    urlTitle: "Inkwash: how it works",
    what: t(
      "수채 번짐을 HTML 파일 하나로 구현한 웹 시연입니다. 펜과 물 붓이 따로 있고 흐름이 젖은 종이 안에 갇힙니다. 저장소에 라이선스가 없어 ‘연구용, 소스 복사 금지’로 분류됐습니다.",
      "A web demo that simulates watercolor in a single HTML file, with separate pen and water brushes and flow confined to wet paper. Its repository has no license, so it is classed as research only with no source copying.",
    ),
    learned: t(
      "배움(개념만): 펜과 물 붓의 분리, 젖은 곳에 갇히는 흐름, 잉크·고정·젖음 상태 구분을 ‘살아 있는 잉크’ 설계의 영감으로 삼음. 소스는 복사하지 않음.",
      "Learned (concepts only): separate pen and water brushes, flow confined to wet areas, and distinct ink, fixed and wet states inspired the Living Ink design. No source is copied.",
    ),
    overlap: t(
      "살아 있는 잉크(Living Ink) 습식 필드. 필드 코드 주석이 ‘InkWash §06’ 번짐 계수를 언급함.",
      "The Living Ink wet field. A comment in the field code mentions the 'InkWash section 06' bleed coefficients.",
    ),
    evidence: ["third_party/inkwash/README.md", OPEN_ENGINE_EVALUATION, `${CREATOR}/studio-living-ink-field.ts`],
  }),

  /* ── 감시 목록에만 있는 그리기 제품 ── */
  watch({
    id: "firealpaca",
    name: "FireAlpaca",
    domain: D.drawing,
    url: "https://firealpaca.com/",
    registry: "competitor",
    category: "comic-drawing",
    priority: "P1",
    focus: t("가벼운 그림, 만화 템플릿, 브러시, 어니언 스킨, 여러 운영체제 지원", "lightweight painting, comic templates, brushes, onion skin and cross-platform use"),
    extraEvidence: ["docs/benchmarks/studio-emerging-product-registry.json"],
  }),
  watch({
    id: "painttool-sai",
    name: "PaintTool SAI",
    domain: D.drawing,
    url: "https://www.systemax.jp/en/sai/",
    registry: "competitor",
    category: "comic-drawing",
    priority: "P1",
    focus: t("선의 품질, 손떨림 보정, 가벼움, 브러시, 벡터 선화", "line quality, stabilization, light weight, brushes and vector line work"),
  }),
  watch({
    id: "heavypaint",
    name: "HEAVYPAINT",
    domain: D.drawing,
    url: "https://www.heavypoly.com/heavypaint",
    registry: "competitor",
    category: "mobile-drawing",
    priority: "P2",
    focus: t("단순한 그리기, 모바일, 색·도형, 속도, 최소 화면", "simplified painting, mobile use, color and shapes, speed and a minimal UI"),
  }),
  watch({
    id: "pixieditor",
    name: "PixiEditor",
    domain: D.drawing,
    url: "https://pixieditor.net/",
    registry: "emerging",
    category: "image-editor",
    priority: "P1",
    focus: t("래스터·벡터 혼합, 노드 그래프, 픽셀 아트, 오픈소스, 비파괴 편집", "raster/vector mixing, node graphs, pixel art, open source and non-destructive editing"),
  }),
  watch({
    id: "rnote",
    name: "Rnote",
    domain: D.drawing,
    url: "https://rnote.flxzt.net/",
    registry: "emerging",
    category: "vector-infinite-canvas",
    priority: "P1",
    focus: t("무한 캔버스, 펜 입력, 도형 인식, 문서 노트, 오픈소스", "infinite canvas, pen input, shape recognition, document notes and open source"),
  }),
  watch({
    id: "vector-wizard",
    name: "Vector Wizard",
    domain: D.drawing,
    url: "https://vectorwizard.ai/",
    registry: "emerging",
    category: "vector-infinite-canvas",
    priority: "P1",
    focus: t("AI 벡터화, SVG 애니메이션, 색 편집, 벡터 공유", "AI vectorization, SVG animation, color editing and vector sharing"),
  }),
];
