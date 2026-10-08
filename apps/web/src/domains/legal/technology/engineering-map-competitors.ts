import type { EngineeringDiagram } from "./engineering-diagram-types";
import { COMPETITOR_ROWS } from "./engineering-map-competitors-rows";
import { COMPETITOR_COUNTS } from "./engineering-map-competitors-summary";
import type { EngineeringMap } from "./engineering-map-types";

/**
 * 기술 지도 · competitors (경쟁·참고 제품). 계약과 작성 규칙은 engineering-map-types.ts 를 따른다.
 *
 * 이 지도는 "누가 더 낫다"를 가리는 표가 아니라 "비슷한 일을 하는 제품에서 무엇을 배우고, 무엇을 다르게 했고, 무엇을 하지 않았나"를 모은 표다.
 * 행의 근거는 모두 저장소 문서(벤치마크·ADR·플레이북·참고 카드·코드 주석)이며, 행은 `engineering-map-competitors-rows*.ts` 에 영역별로 나뉘어 있다.
 * 본문의 개수(영역 수·제품 수)는 손으로 적지 않고 `engineering-map-competitors-summary.ts` 가 행에서 계산한다.
 */

const { total: TOTAL, studied: STUDIED, unresearched: UNRESEARCHED, areas: AREAS } = COMPETITOR_COUNTS;

/** 가운데 ToonStudio 와 열한 영역의 허브-스포크. 화살표는 "그 영역에서 배운 점이 ToonStudio 로 들어온다"는 뜻이다. 영역 이름은 표의 첫 열과 같은 말이다. */
const LANDSCAPE_DIAGRAM: EngineeringDiagram = {
  id: "competitors-landscape-diagram",
  kind: "graph",
  title: { ko: "경쟁·참고 제품의 큰 그림", en: "The big picture of competitors and references" },
  caption: {
    ko: `${AREAS}개 영역의 제품을 비교했고, 화살표는 거기서 배운 점이 ToonStudio 로 들어온다는 뜻입니다.`,
    en: `Products in ${AREAS} areas were compared; arrows show what was learned flowing into ToonStudio.`,
  },
  alt: {
    ko: `가운데에 ToonStudio가 있고 둘레에 그림·페인팅, 2D 애니메이션·모션, 3D·캐릭터, 디자인·문서, 콘티·검토, AI·에이전트, 협업·가상공간, 웹툰 유통·생태계, 엔진·표준, 마켓·소재·창작자 지원, 계정·로그인 ${AREAS}개 영역이 있습니다. 각 영역에서 ToonStudio로 향하는 화살표 옆 글자는 그 영역에서 배운 대표적인 점을 줄여 쓴 것입니다. 이 도식은 우열이 아니라 비교하고 참고한 관계만 보여줍니다.`,
    en: `ToonStudio sits in the middle, surrounded by ${AREAS} areas: drawing and painting, 2D animation and motion, 3D and characters, design and documents, storyboard and review, AI and agents, collaboration and virtual space, webtoon publishing and ecosystem, engines and standards, marketplaces and creator support, and accounts and sign-in. The short words beside each arrow into ToonStudio name the main lesson taken from that area. The diagram shows who was compared and referenced, not who is better.`,
  },
  nodes: [
    {
      id: "toonstudio",
      label: { ko: "ToonStudio", en: "ToonStudio" },
      sub: { ko: "브라우저 웹툰 스튜디오", en: "Browser webtoon studio" },
      tone: "local",
      shape: "pill",
      at: [2, 2],
    },
    {
      id: "drawing",
      label: { ko: "그림·페인팅", en: "Drawing & painting" },
      sub: { ko: "Clip Studio Paint, Krita, Procreate", en: "Clip Studio Paint, Krita, Procreate" },
      tone: "external",
      at: [0, 0],
    },
    {
      id: "animation",
      label: { ko: "2D 애니메이션", en: "2D animation & motion" },
      sub: { ko: "Toon Boom Harmony, Moho, Rive", en: "Toon Boom Harmony, Moho, Rive" },
      tone: "external",
      at: [2, 0],
    },
    {
      id: "three-d",
      label: { ko: "3D·캐릭터", en: "3D & characters" },
      sub: { ko: "Blender, SketchUp, VRoid Studio", en: "Blender, SketchUp, VRoid Studio" },
      tone: "external",
      at: [4, 0],
    },
    {
      id: "design",
      label: { ko: "디자인·문서", en: "Design & documents" },
      sub: { ko: "Canva, Adobe Express, Remotion", en: "Canva, Adobe Express, Remotion" },
      tone: "external",
      at: [0, 1],
    },
    {
      id: "storyboard",
      label: { ko: "콘티·검토", en: "Storyboard & review" },
      sub: { ko: "Storyboard Pro, Boords, KROCK.io", en: "Storyboard Pro, Boords, KROCK.io" },
      tone: "external",
      at: [0, 2],
    },
    {
      id: "ai",
      label: { ko: "AI·에이전트", en: "AI & agents" },
      sub: { ko: "Dashtoon, Runway, OpenRouter", en: "Dashtoon, Runway, OpenRouter" },
      tone: "ai",
      at: [0, 3],
    },
    {
      id: "collab",
      label: { ko: "협업·가상공간", en: "Collaboration & spaces" },
      sub: { ko: "Figma, tldraw, Gather, Magma", en: "Figma, tldraw, Gather, Magma" },
      tone: "external",
      at: [4, 1],
    },
    {
      id: "publishing",
      label: { ko: "웹툰 유통·생태계", en: "Publishing & ecosystem" },
      sub: { ko: "WEBTOON CANVAS, Tapas, Creco", en: "WEBTOON CANVAS, Tapas, Creco" },
      tone: "external",
      at: [4, 2],
    },
    {
      id: "engines",
      label: { ko: "엔진·표준", en: "Engines & standards" },
      sub: { ko: "Three.js, Babylon.js, MQM-Core", en: "Three.js, Babylon.js, MQM-Core" },
      tone: "neutral",
      at: [0, 4],
    },
    {
      id: "market",
      label: { ko: "마켓·소재·창작자 지원", en: "Marketplaces & support" },
      sub: { ko: "Clip Studio Assets, Fab, Poly Haven", en: "Clip Studio Assets, Fab, Poly Haven" },
      tone: "external",
      at: [2, 4],
    },
    {
      id: "identity",
      label: { ko: "계정·로그인", en: "Accounts & sign-in" },
      sub: { ko: "Google, Kakao, Naver sign-in", en: "Google, Kakao, Naver sign-in" },
      tone: "external",
      at: [4, 4],
    },
  ],
  edges: [
    { from: "drawing", to: "toonstudio", label: { ko: "획 보정·자", en: "Strokes, rulers" } },
    { from: "animation", to: "toonstudio", label: { ko: "리깅·변형", en: "Rigs, deform" } },
    { from: "three-d", to: "toonstudio", label: { ko: "프리셋·분리 출력", en: "Presets, layers" } },
    { from: "design", to: "toonstudio", label: { ko: "빠른 첫 결과", en: "Quick start" } },
    { from: "storyboard", to: "toonstudio", label: { ko: "상태 한눈에", en: "Status board" } },
    { from: "ai", to: "toonstudio", label: { ko: "안전한 재시도", en: "Safe retries" } },
    { from: "collab", to: "toonstudio", label: { ko: "커서·따라가기", en: "Cursors, follow" } },
    { from: "publishing", to: "toonstudio", label: { ko: "게시 전 점검", en: "Publish check" } },
    { from: "engines", to: "toonstudio", label: { ko: "교체 대신 분리", en: "Keep separate" } },
    { from: "market", to: "toonstudio", label: { ko: "적합성 판정", en: "Fit verdict" } },
    { from: "identity", to: "toonstudio", label: { ko: "최소 동의 범위", en: "Minimal consent" } },
  ],
};

export const ENGINEERING_MAP_COMPETITORS: EngineeringMap | null = {
  id: "competitors",
  title: { ko: "경쟁·참고 제품 지도", en: "Competitors and references map" },
  intro: {
    ko: `비슷한 일을 하는 제품들은 무엇이고, 우리는 그중에서 무엇을 배우고 무엇을 다르게 했는지를 ${AREAS}개 영역별로 한 표에 모았습니다. 저장소 문서에 기록된 관찰만 담았고, 누가 더 낫다는 비교는 하지 않습니다.`,
    en: `A single table, in ${AREAS} areas, of the products that do similar jobs, and what ToonStudio learned from each, did differently, or chose not to adopt. It holds only observations recorded in repository documents and makes no better-or-worse comparison.`,
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
      ko: `표의 ${TOTAL}곳 가운데 ${STUDIED}곳은 저장소 문서가 비교·적용·불채택을 적은 제품이고, ${UNRESEARCHED}곳은 제품 감시 목록이나 벤치마크의 대상 목록에만 이름이 있어 ‘미조사’라고 적었습니다. 목록에 오른 것은 써 보았거나 채택했다는 뜻이 아닙니다.`,
      en: `Of the ${TOTAL} entries, ${STUDIED} are products where a repository document records a comparison, an adoption or a decision not to adopt, and ${UNRESEARCHED} are named only on a product watch list or a benchmark's target list and are marked not researched. Being listed does not mean the product was used or adopted.`,
    },
    {
      ko: "이 표의 비교는 저장소 문서에 기록된 관찰만 담았습니다. 경쟁 제품의 가격·점유율·최신 버전·기능 우열은 조사하지 않았으므로 싣지 않았고, 문서가 적지 않은 것은 ‘미확인’이라고 적었습니다. ADR은 ‘설계 결정 기록’입니다.",
      en: "Comparisons here use only observations recorded in repository documents. Competitors' prices, market share, latest versions and feature rankings were not researched, so none appear, and anything the documents do not say is marked unconfirmed. An ADR is an architecture decision record.",
    },
    {
      ko: "근거 문서마다 조사한 날짜가 다릅니다. 탐색 서비스(Spectrum) 문서는 2026-05 기준이라 ‘참고한 것’으로만 읽어야 합니다. 문서가 적은 시장 평가(별점이 무너졌다는 식의 판단), 자체 평가표(‘동등+’), 마케팅 문구의 성능·속도 주장은 사실이나 수치로 옮기지 않았습니다.",
      en: "Each source document was written on a different date. The discovery-service (Spectrum) document is from 2026-05 and should be read only as what was referenced. Market judgments in documents (such as star ratings having collapsed), self-assessment tables ('parity+') and marketing claims about performance or speed are not carried over as facts or figures.",
    },
    {
      ko: "넣은 기준은 저장소의 문서·ADR·코드 주석이 벤치마크했거나 참고했다고 적은 외부 제품·서비스·표준입니다. 의존성으로 쓰는 라이브러리는 오픈소스 지도에, 연동한 API는 Open API 지도에 있어 여기에는 평가·대안으로 검토한 것만 넣었습니다. 논문, 다른 제품 설명 안에서 지나가듯 언급된 서비스, 라이선스 원장에 ‘금지’로만 적힌 저장소는 넣지 않았습니다.",
      en: "Entries are the external products, services and standards that a repository document, ADR or code comment says were benchmarked or referenced. Libraries used as dependencies are on the open-source map and integrated APIs on the Open API map, so only those evaluated as alternatives appear here. Papers, services mentioned only in passing inside another product's description, and repositories that the license ledger lists only as prohibited are left out.",
    },
    {
      ko: "저장소는 스스로 ‘대체·동등’ 주장을 막아 둡니다(replacementClaimAllowed: false). 경쟁 제품 기능 감사(docs/evidence/studio-competitor-capability-audit.json)는 57개 항목 중 45개가 verified, 12개가 external-validation-pending이며, 서명된 외부 증거가 나오기 전에는 대체했다고 말하지 않습니다.",
      en: "The repository blocks replacement and parity claims on its own (replacementClaimAllowed: false). Of the 57 items in the competitor capability audit (docs/evidence/studio-competitor-capability-audit.json), 45 are verified and 12 are external-validation-pending, and nothing is called a replacement until signed external evidence exists.",
    },
    {
      ko: "정량 비교(성능·번들 크기 같은 수치)는 싣지 않았습니다. 저장소의 측정값은 대부분 한 대의 개발 기기에서 잰 내부 값이고, 마켓 수수료율은 경쟁사 사실이 아니라 우리가 설계한 값입니다.",
      en: "No quantitative comparisons (performance, bundle size) are shown. Most repository measurements come from a single development machine, and the marketplace fee rates are our own design values, not facts about competitors.",
    },
    {
      ko: "공식 링크는 접속을 점검했고 열리지 않는 링크는 쓰지 않았습니다. 403은 봇 차단일 수 있어 죽은 링크로 보지 않았습니다. 링크가 없는 행은 저장소 문서에 공식 주소가 없거나 열리지 않아 달지 않은 것입니다.",
      en: "Official links were checked and links that do not open were not used. A 403 can be a bot block, so it was not treated as a dead link. A row without a link has no official address in the repository documents, or the address did not open.",
    },
  ],
  reviewedAt: "2026-10-08",
};
