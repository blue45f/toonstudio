/**
 * IR 페이지(/ir)의 표시 데이터 — 문제·파편화 지도·제작 흐름·제품 역량·BM·GTM·검증 목표·Ask·예비 창업 도전자 경력.
 * IrPitchPage.tsx의 파일 크기 제한(800줄)에 맞춰 상수만 분리한 파일로, 문안·수치의 정본은 이 파일이 소유한다.
 */
import {
  Boxes,
  Database,
  Layers,
  PenTool,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

/** IR 컷: 제품 투어(8:24)의 챕터 중 개요·드로잉·3D·제작·마무리를 완결 단위로 발췌한 4:48 편집본. 실제 제품 화면만으로 구성했다. */
export const IR_FILM_SRC = "/brand/toonstudio-ir-tour.mp4";
export const IR_FILM_POSTER = "/brand/toonstudio-product-tour-poster.jpg";

/** 발표 자료 파일. 덱 정본을 사이트 public 자산으로 함께 배포한다. */
export const IR_DECK_PPTX = "/brand/toonstudio-ir-deck.pptx";
export const IR_DECK_PDF = "/brand/toonstudio-ir-deck.pdf";

/** 발표 중 질의가 나오면 전체 투어의 해당 챕터로 바로 점프한다. 시작 초는 product-tour-content의 챕터 정본을 쓴다. */
export const CHAPTER_JUMPS = [
  { start: 108, ko: "드로잉", en: "Drawing" },
  { start: 228, ko: "3D 배경", en: "3D sets" },
  { start: 300, ko: "AI 보조", en: "AI assist" },
  { start: 354, ko: "협업·제작 관리", en: "Production" },
] as const;

export const PROBLEMS = [
  {
    icon: Layers,
    ko: { title: "도구 파편화", body: "대본, 콘티, 드로잉, 3D, 파일 공유, 일정이 전부 다른 앱에 흩어져 있어요." },
    en: { title: "Fragmented tools", body: "Scripts, storyboards, drawing, 3D, file sharing and schedules — all in different apps." },
  },
  {
    icon: UsersRound,
    ko: { title: "협업 손실", body: "누가 뭘 맡았고, 어떤 피드백이 오갔고, 뭐가 승인됐는지가 메신저와 파일 이름 속에 묻혀요. 그러다 보면 같은 작업을 두 번 하게 됩니다." },
    en: { title: "Collaboration loss", body: "Who owns what, which feedback was given, what got approved — it all sinks into messengers and file names, and the same work gets done twice." },
  },
  {
    icon: ShieldCheck,
    ko: { title: "연재 리스크", body: "회차가 얼마나 진행됐는지, 마감이 위험한지, 플랫폼 규격에 맞는지를 뒤늦게 알게 돼요. 품질도 일정도 흔들립니다." },
    en: { title: "Release risk", body: "You find out too late how far an episode has come, whether the deadline is at risk, or whether the file meets platform specs — and quality and schedule both wobble." },
  },
] as const;

/** 제작 현장의 파편화 지도. 카테고리마다 표준으로 굳은 도구가 따로 있고, 그 사이를 창작자가 오간다. */
export const LANDSCAPE = [
  { ko: { category: "전문 드로잉", tools: "클립스튜디오 · 포토샵 · 메디방" }, en: { category: "Pro drawing", tools: "Clip Studio · Photoshop · MediBang" } },
  { ko: { category: "3D 배경·소재", tools: "스케치업 · 에이콘3D · 블렌더" }, en: { category: "3D sets & assets", tools: "SketchUp · Acon3D · Blender" } },
  { ko: { category: "3D 포즈", tools: "Design Doll · Magic Poser" }, en: { category: "3D posing", tools: "Design Doll · Magic Poser" } },
  { ko: { category: "협업·관리", tools: "크레코(CRECO) · 메신저 · 드라이브 · 노션" }, en: { category: "Collaboration", tools: "CRECO · messengers · Drive · Notion" } },
  { ko: { category: "AI 보조", tools: "내 작품을 모르는 생성형 AI" }, en: { category: "AI assist", tools: "Generative AI that knows nothing about your work" } },
] as const;

export const FLOW_STEPS = [
  { ko: "기획", en: "Plan" },
  { ko: "대본", en: "Script" },
  { ko: "콘티", en: "Storyboard" },
  { ko: "드로잉", en: "Draw" },
  { ko: "검수", en: "Review" },
  { ko: "연재·운영", en: "Release & run" },
] as const;

/** 제품 역량 다섯 가지. 이미지는 전부 제품 투어 제작 때 찍은 실제 제품 화면 캡처다. */
export const CAPABILITIES = [
  {
    id: "drawing",
    image: "/brand/product-tour/03-draw.png",
    href: "/studio/canvas",
    chapterStart: 108,
    icon: PenTool,
    stats: [{ ko: "WebGPU · Vello", en: "WebGPU · Vello" }, { ko: "브러시 프리셋 226종", en: "226 brush presets" }],
    ko: { title: "드로잉 엔진", body: "직접 포팅·패치한 WebGPU 벡터 렌더러(Vello)와 Skia 캔버스 덕분에, 큰 원고도 브라우저에서 바로 다룰 수 있어요. 직접 설계·튜닝한 브러시 프리셋 226종에 레이어·선택·보정까지 한 화면에 다 있습니다.", cta: "캔버스 열기" },
    en: { title: "Drawing engine", body: "With a WebGPU vector renderer (Vello) that we ported and patched ourselves, plus a Skia canvas, even large manuscripts just work in the browser — 226 brush presets designed and tuned in-house, layers, selection and adjustments, all on one screen.", cta: "Open the canvas" },
  },
  {
    id: "three-d",
    image: "/brand/product-tour/05-3d.png",
    href: "/studio/bg3d",
    chapterStart: 228,
    icon: Boxes,
    stats: [{ ko: "테마 팩 42", en: "42 theme packs" }, { ko: "배치 가능 에셋 14,928", en: "14,928 placeable assets" }, { ko: "프리셋 9", en: "9 presets" }],
    ko: { title: "3D 배경·가상 스튜디오", body: "상용 라이선스를 확보한 3D 에셋 번들을 배경 스튜디오에 연결해 뒀어요. 테마 팩 42종에서 골라 배치하고 카메라 구도를 잡으면, 그대로 컷의 밑그림이 됩니다. 가상 스튜디오는 클래식 2D 무대에서 내 캐릭터로 만나 함께 작업하는 공간이에요.", cta: "3D 배경 스튜디오" },
    en: { title: "3D sets & virtual studio", body: "We wired a commercially licensed 3D asset bundle into the background studio: pick from 42 theme packs, place what you need, frame the camera — and it becomes the base of your panel. The virtual studio is a classic 2D stage where you meet and work as your character.", cta: "Open the 3D studio" },
  },
  {
    id: "collaboration",
    image: "/brand/product-tour/07-production.png",
    href: "/production",
    chapterStart: 354,
    icon: UsersRound,
    stats: [{ ko: "Yjs 실시간 동기화", en: "Yjs real-time sync" }],
    ko: { title: "실시간 협업·제작 관리", body: "Yjs로 여럿이 동시에 편집하고, 코멘트와 권한, 승인 기록이 원고에 바로 붙어요. 회차 진행률과 마감도 같은 화면에서 봅니다.", cta: "제작 관리 열기" },
    en: { title: "Real-time collaboration", body: "With Yjs, several people edit at once, and comments, permissions and approvals stick right onto the manuscript. Episode progress and deadlines live on the same screen.", cta: "Open production" },
  },
  {
    id: "ai",
    image: "/brand/product-tour/06-ai.png",
    href: "/studio/ai-lab",
    chapterStart: 300,
    icon: Sparkles,
    stats: [{ ko: "BYOK · 로컬 모델 선택", en: "BYOK · local models" }],
    ko: { title: "Responsible AI", body: "AI는 장면 나누기, 설정이 어긋난 곳 찾기, 규격 검사 같은 반복 일을 도와요. 작품의 방향과 표현, 최종 승인과 권리는 사람이 정합니다. 무엇을 썼는지는 기록에 남고, 무료 모델·내 키(BYOK)·로컬 모델 중에서 고를 수 있어요.", cta: "AI 도구 보기" },
    en: { title: "Responsible AI", body: "AI helps with the repetitive parts — splitting scenes, spotting continuity slips, checking specs. Direction, expression, final approvals and rights stay with people. Everything AI does is recorded, and you choose between free models, your own key (BYOK) and local models.", cta: "See AI tools" },
  },
  {
    id: "local-first",
    image: "/brand/product-tour/01-overview.png",
    href: "/about/technology",
    chapterStart: null,
    icon: Database,
    stats: [{ ko: "OPFS · IndexedDB", en: "OPFS · IndexedDB" }],
    ko: { title: "로컬 우선 데이터", body: "원고는 먼저 내 기기에 저장돼요. 오프라인에서도 작업이 이어지고, 클라우드 동기화는 원할 때만 켭니다. 회차·장면·레이어·피드백이 하나의 제작 기록으로 쌓여요.", cta: "기술 자세히 보기" },
    en: { title: "Local-first data", body: "Your manuscript saves to your own device first. Work carries on offline, and cloud sync only turns on when you want it. Episodes, scenes, layers and feedback build up into one production record.", cta: "Read the engineering hub" },
  },
] as const;

export const BUSINESS_MODEL = [
  { ko: { tier: "Free", body: "회원이 1만 명이 될 때까지는 전 기능을 무료로 운영해요. 핵심 제작 흐름부터 협업·AI까지 전부요." }, en: { tier: "Free", body: "Until membership reaches 10,000, every feature runs free — the full production flow, collaboration and AI included." } },
  { ko: { tier: "Pro", body: "유료화 뒤에 열 고급 제작 기능, 넉넉한 저장·버전, 귀찮은 일을 줄여 주는 자동화. 월 19,900원은 그때의 예시 가격이에요 — 아직 확정된 가격은 아니에요." }, en: { tier: "Pro", body: "Advanced tools, roomier storage and versions, and automation for the tedious parts — opening with the paid switch. KRW 19,900 a month is an example price for that point, not a confirmed one." } },
  { ko: { tier: "Team · Education", body: "권한과 공정, 자산을 팀 단위로 관리하고, 교육용으로는 반과 과제를 운영할 수 있어요." }, en: { tier: "Team · Education", body: "Manage permissions, workflow and assets as a team — or run classes and assignments for education" } },
  { ko: { tier: "Marketplace", body: "향후 계획이에요. 브러시·소재·3D·템플릿을 사고팔고, 산 것은 제작 화면에 바로 갖다 쓰는 거래 수수료 모델로 준비하고 있어요. 아직 운영 중인 마켓은 아니에요." }, en: { tier: "Marketplace", body: "A future plan, not a running market: brushes, materials, 3D and templates traded on transaction fees, usable right in the studio." } },
] as const;

/** 고객 확보 순서 — 무료 구간(1만 명) 안에서 단계별로 넓혀 간다. */
export const GTM_STEPS = [
  { ko: { title: "작가부터 모아요", body: "투자 유치 뒤에는 웹툰·만화 온라인 커뮤니티와 네이버 카페 같은 온라인 채널에서 알리며 작가 회원을 모아요." }, en: { title: "Creators first", body: "After raising investment, we promote in online webtoon and comics communities — online communities and Naver Cafes — to bring in creator members." } },
  { ko: { title: "교육으로 자리 잡아요", body: "학원과 교육기관을 장기 고객으로 확보해요. 배우는 단계에서 익숙해진 도구가 현장의 표준이 되니까요." }, en: { title: "Education for the long term", body: "We secure academies and educational institutions as long-term customers — the tool you learn on tends to become the tool you work on." } },
  { ko: { title: "팀 규모를 키워 가요", body: "소규모 아마추어 팀에서 시작해 대형 스튜디오로, 고객층을 단계씩 넓혀 갑니다." }, en: { title: "Grow team by team", body: "Starting with small amateur teams, we expand the customer base step by step toward large studios." } },
] as const;

/** 아래 수치는 성과가 아니라 검증 목표다. */
export const VALIDATION_GOALS = [
  { value: "30명", ko: "무료 베타 창작자", en: "Free beta creators" },
  { value: "10명+", ko: "직무별 심층 인터뷰", en: "In-depth interviews by role" },
  { value: "3–6개월", ko: "유료로 쓸 의향 검증", en: "Willingness-to-pay validation" },
] as const;

export const ASKS = [
  { ko: "초기 창작자 코호트 연결", en: "Early creator cohort access" },
  { ko: "BM·가격 검증 조언", en: "Advice on model & pricing validation" },
  { ko: "콘텐츠 업계 네트워크", en: "Content industry network" },
  { ko: "후속 투자·정부 지원 연결", en: "Follow-on investment & public programs" },
] as const;

/** 예비 창업 도전자(김희준) 주요 경력. 출처는 본인 포트폴리오(heejun.cloud)이고, 근무 기간·연도는 사용자 지시로 넣지 않는다. */
export const FOUNDER_CAREER = [
  { ko: "배달의민족(우아한형제들) — 주문·결제·장바구니 구조를 설계하고 이끌었어요. 국내에서 처음으로 애플페이 결제를 붙였고, React로 갈아타며 번들을 70% 줄이고 성능은 30% 끌어올렸습니다.", en: "Baemin (Woowa Brothers) — designed and led the order, payment and cart architecture. Shipped Korea's first Apple Pay checkout, and cut the bundle by 70% while improving performance 30% in the move to React." },
  { ko: "스마일게이트 스토브 — 웹서비스개발팀 팀장으로 10명 팀을 이끌며 STOVE 플랫폼을 맡았어요.", en: "Smilegate STOVE — led a 10-person web service team running the STOVE platform." },
  { ko: "삼쩜삼(자비스앤빌런즈) — Tax그룹 FE 챕터 리드로 프론트엔드를 이끌었어요.", en: "Samjjeomsam (Jarvis & Villains) — front-end chapter lead in the Tax group." },
  { ko: "카카오 — 다음 메일 프론트엔드를 만들었어요.", en: "Kakao — built the Daum Mail front-end." },
  { ko: "엔씨소프트 — 모바일 퍼블리싱 플랫폼을 다뤘어요.", en: "NCSOFT — worked on the mobile publishing platform." },
] as const;
