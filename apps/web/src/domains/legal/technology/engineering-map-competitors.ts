import type { EngineeringDiagram } from "./engineering-diagram-types";
import { COMPETITOR_ROWS } from "./engineering-map-competitors-rows";
import type { EngineeringMap } from "./engineering-map-types";

/**
 * 기술 지도 · competitors (경쟁·참고 제품). 계약과 작성 규칙은 engineering-map-types.ts 를 따른다.
 *
 * 이 지도는 "누가 더 낫다"를 가리는 표가 아니라 "비슷한 일을 하는 제품에서 무엇을 배우고, 무엇을 다르게 했고, 무엇을 하지 않았나"를 모은 표다.
 * 행의 근거는 모두 저장소 문서(벤치마크·ADR·플레이북·참고 카드)이며, 행은 `engineering-map-competitors-rows.ts` 에 있다.
 */

/** 가운데 ToonStudio 와 여덟 영역의 허브-스포크. 화살표는 "그 영역에서 배운 점이 ToonStudio 로 들어온다"는 뜻이다. */
const LANDSCAPE_DIAGRAM: EngineeringDiagram = {
  id: "competitors-landscape-diagram",
  kind: "graph",
  title: { ko: "경쟁·참고 제품의 큰 그림", en: "The big picture of competitors and references" },
  caption: {
    ko: "여덟 영역의 제품을 비교했고, 화살표는 거기서 배운 점이 ToonStudio 로 들어온다는 뜻입니다.",
    en: "Products in eight areas were compared; arrows show what was learned flowing into ToonStudio.",
  },
  alt: {
    ko: "가운데에 ToonStudio가 있고 둘레에 그림·페인팅, 3D·캐릭터, 디자인·문서, 협업·가상공간, 웹툰 유통·생태계, 콘티·검토, AI·에이전트, 엔진·표준 여덟 영역이 있습니다. 각 영역에서 ToonStudio로 향하는 화살표 옆 글자는 그 영역에서 배운 대표적인 점을 줄여 쓴 것입니다. 이 도식은 우열이 아니라 비교하고 참고한 관계만 보여줍니다.",
    en: "ToonStudio sits in the middle, surrounded by eight areas: drawing and painting, 3D and characters, design and documents, collaboration and virtual space, webtoon publishing and ecosystem, storyboard and review, AI and agents, and engines and standards. The short words beside each arrow into ToonStudio name the main lesson taken from that area. The diagram shows who was compared and referenced, not who is better.",
  },
  nodes: [
    {
      id: "toonstudio",
      label: { ko: "ToonStudio", en: "ToonStudio" },
      sub: { ko: "브라우저 웹툰 스튜디오", en: "Browser webtoon studio" },
      tone: "local",
      shape: "pill",
      at: [2, 1],
    },
    {
      id: "drawing",
      label: { ko: "그림·페인팅", en: "Drawing & painting" },
      sub: { ko: "Clip Studio Paint, Krita, Procreate", en: "Clip Studio Paint, Krita, Procreate" },
      tone: "external",
      at: [2, 0],
    },
    {
      id: "three-d",
      label: { ko: "3D·캐릭터", en: "3D & characters" },
      sub: { ko: "Blender, SketchUp, VRoid Studio", en: "Blender, SketchUp, VRoid Studio" },
      tone: "external",
      at: [0, 0],
    },
    {
      id: "design",
      label: { ko: "디자인·문서", en: "Design & documents" },
      sub: { ko: "Canva, Adobe Express, Remotion", en: "Canva, Adobe Express, Remotion" },
      tone: "external",
      at: [4, 0],
    },
    {
      id: "engines",
      label: { ko: "엔진·표준", en: "Engines & standards" },
      sub: { ko: "Skia, Vello, Three.js, Babylon.js", en: "Skia, Vello, Three.js, Babylon.js" },
      tone: "neutral",
      at: [0, 1],
    },
    {
      id: "collab",
      label: { ko: "협업·가상공간", en: "Collaboration & spaces" },
      sub: { ko: "Figma, tldraw, Gather, Magma", en: "Figma, tldraw, Gather, Magma" },
      tone: "external",
      at: [4, 1],
    },
    {
      id: "ai",
      label: { ko: "AI·에이전트", en: "AI & agents" },
      sub: { ko: "Dia, OpenRouter, Browser Use", en: "Dia, OpenRouter, Browser Use" },
      tone: "ai",
      at: [0, 2],
    },
    {
      id: "storyboard",
      label: { ko: "콘티·검토", en: "Storyboard & review" },
      sub: { ko: "Storyboard Pro, Boords, KROCK.io", en: "Storyboard Pro, Boords, KROCK.io" },
      tone: "external",
      at: [2, 2],
    },
    {
      id: "publishing",
      label: { ko: "웹툰 유통·생태계", en: "Publishing & ecosystem" },
      sub: { ko: "WEBTOON CANVAS, Tapas, Creco", en: "WEBTOON CANVAS, Tapas, Creco" },
      tone: "external",
      at: [4, 2],
    },
  ],
  edges: [
    { from: "drawing", to: "toonstudio", label: { ko: "획 보정·자", en: "Strokes, rulers" } },
    { from: "three-d", to: "toonstudio", label: { ko: "프리셋·분리 출력", en: "Presets, layers" } },
    { from: "design", to: "toonstudio", label: { ko: "빠른 첫 결과", en: "Quick start" } },
    { from: "engines", to: "toonstudio", label: { ko: "교체 대신 분리", en: "Keep separate" } },
    { from: "collab", to: "toonstudio", label: { ko: "커서·따라가기", en: "Cursors, follow" } },
    { from: "ai", to: "toonstudio", label: { ko: "안전한 재시도", en: "Safe retries" } },
    { from: "storyboard", to: "toonstudio", label: { ko: "상태 한눈에", en: "Status board" } },
    { from: "publishing", to: "toonstudio", label: { ko: "게시 전 점검", en: "Publish check" } },
  ],
};

export const ENGINEERING_MAP_COMPETITORS: EngineeringMap | null = {
  id: "competitors",
  title: { ko: "경쟁·참고 제품 지도", en: "Competitors and references map" },
  intro: {
    ko: "비슷한 일을 하는 제품들은 무엇이고, 우리는 그중에서 무엇을 배우고 무엇을 다르게 했는지를 영역별로 한 표에 모았습니다. 저장소 문서에 기록된 관찰만 담았고, 누가 더 낫다는 비교는 하지 않습니다.",
    en: "A single table of the products that do similar jobs, and what ToonStudio learned from each, did differently, or chose not to adopt. It holds only observations recorded in repository documents and makes no better-or-worse comparison.",
  },
  takeaway: {
    ko: "제품을 따라 만들지 않고 배운 점만 가져왔으며, ‘대체했다’거나 ‘동등하다’는 말은 하지 않습니다.",
    en: "Lessons were taken, products were not copied, and we do not say that any of them has been replaced or matched.",
  },
  columns: [
    { id: "domain", label: { ko: "영역", en: "Area" }, narrow: true },
    { id: "what", label: { ko: "무엇인가", en: "What it is" } },
    { id: "learned", label: { ko: "배운 점 · 다르게 한 점 · 안 한 점", en: "Learned · done differently · not adopted" } },
    { id: "overlap", label: { ko: "겹치는 ToonStudio 기능", en: "Overlapping ToonStudio feature" } },
  ],
  rows: COMPETITOR_ROWS,
  diagram: LANDSCAPE_DIAGRAM,
  notes: [
    {
      ko: "이 표의 비교는 저장소 문서에 기록된 관찰만 담았습니다. 경쟁 제품의 가격·점유율·최신 버전·기능 우열은 조사하지 않았으므로 싣지 않았고, 문서가 적지 않은 것은 ‘미확인’이라고 적었습니다. ADR은 ‘설계 결정 기록’입니다.",
      en: "Comparisons here use only observations recorded in repository documents. Competitors' prices, market share, latest versions and feature rankings were not researched, so none appear, and anything the documents do not say is marked unconfirmed. An ADR is an architecture decision record.",
    },
    {
      ko: "저장소는 스스로 ‘대체·동등’ 주장을 막아 둡니다(replacementClaimAllowed: false). 경쟁 제품 대체 프로그램 57개 워크스트림은 45개가 verified, 12개가 external-validation-pending이며, 서명된 외부 증거가 나오기 전에는 대체했다고 말하지 않습니다.",
      en: "The repository blocks replacement and parity claims on its own (replacementClaimAllowed: false). Of the 57 replacement-program workstreams, 45 are verified and 12 are external-validation-pending, and nothing is called a replacement until signed external evidence exists.",
    },
    {
      ko: "정량 비교(성능·번들 크기 같은 수치)는 싣지 않았습니다. 저장소의 측정값은 대부분 한 대의 개발 기기에서 잰 내부 값이고, 마켓 수수료율은 경쟁사 사실이 아니라 우리가 설계한 값입니다.",
      en: "No quantitative comparisons (performance, bundle size) are shown. Most repository measurements come from a single development machine, and the marketplace fee rates are our own design values, not facts about competitors.",
    },
    {
      ko: "공식 링크는 접속을 점검했고 열리지 않는 링크(404)는 쓰지 않았습니다. 403은 봇 차단일 수 있어 죽은 링크로 보지 않았습니다. 가상 공간 근거 문서가 인용한 도움말 링크 12개 중 7개는 지금 열리지 않아, 그 문서의 세부 서술은 다시 확인해야 합니다.",
      en: "Official links were checked and links that return 404 were not used. A 403 can be a bot block, so it was not treated as a dead link. Seven of the twelve help links cited by the virtual-space evidence document no longer open, so that document's fine details need rechecking.",
    },
  ],
  reviewedAt: "2026-10-07",
};
