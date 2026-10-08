import type { LocalizedText } from "./engineering-story-content";

export interface SeminarLesson {
  readonly id: string;
  readonly chapterId: string;
  readonly section: LocalizedText;
  readonly title: LocalizedText;
  readonly takeaway: LocalizedText;
  readonly points: readonly LocalizedText[];
  readonly flow: readonly LocalizedText[];
  readonly script: LocalizedText;
  readonly question: LocalizedText;
  readonly technologies: readonly string[];
  /** 이 레슨에서 질문이 나오면 열어 볼 기술 도감 카드(최대 4개). 발표자 패널의 "도감 카드 열기" 단추가 된다. */
  readonly atlasIds?: readonly string[];
  readonly demo?: { readonly href: string; readonly action: LocalizedText; readonly expected: LocalizedText; readonly fallback: LocalizedText };
}
const t = (ko: string, en: string): LocalizedText => ({ ko, en });
const product = t("01 · 창작자의 문제", "01 · The creator's problem");
const drawing = t("02 · 입력에서 한 장의 그림까지", "02 · From input to a drawing");
const local = t("03 · 브라우저의 한계 넘기", "03 · Beyond browser constraints");
const spatial = t("04 · 3D를 작품의 일부로", "04 · 3D as part of the artwork");
const ai = t("05 · 협업과 AI의 역할", "05 · Collaboration and AI");
const delivery = t("06 · 시연, 검증, 재사용", "06 · Demonstration, evidence and reuse");
const openWorld = t("07 · 오픈소스·벤치마크·Open API", "07 · Open source, benchmarks and Open APIs");
const aiDev = t("08 · AI와 함께 만드는 방법", "08 · Building with AI");
const wrapUp = t("09 · 마무리", "09 · Wrap-up");

/**
 * 발표용 요약과 발표자가 읽을 설명을 분리한다. 도입 상태와 코드 근거는 공개 챕터에서 가져온다.
 * 대본(`script`)은 한국어 5자/초로 레슨당 배정 90초의 60~75%를 채우도록 비유·근거 파일·숫자·다음 레슨으로 넘기는 문장을 담는다.
 * 대본에 쓴 수치와 파일은 `engineering-seminar-lessons.test.ts`가 소스와 대조한다.
 */
export const SEMINAR_LESSONS = [
  {
    id: "seminar-opening", chapterId: "product-intent", section: product,
    title: t("웹페이지를 넘어, 작업이 이어지는 제작실로", "Beyond a webpage: a studio that keeps work connected"),
    takeaway: t("오늘의 질문은 ‘기능이 몇 개인가’가 아니라 ‘브라우저에서 작업을 어떻게 끝까지 지키는가’입니다.", "Today's question is not how many features exist, but how a browser can protect the whole creative journey."),
    points: [t("창작 흐름을 먼저 보고 기술을 설명합니다.", "Start with the creative journey, then explain the technology."), t("드로잉·3D·저장·AI를 하나의 사례로 연결합니다.", "Connect drawing, 3D, persistence and AI through one example."), t("구현된 경로, 설정이 필요한 기능, 실험을 구분합니다.", "Distinguish implemented paths, required setup and experiments.")],
    flow: [t("아이디어", "Idea"), t("한 장면", "A scene"), t("다시 열 수 있는 작품", "A work you can reopen")],
    script: t(
      "먼저 청중에게 묻습니다. ‘그리던 파일을 다른 도구로 옮기다가 레이어나 맥락을 잃은 적 있나요?’ 툰스튜디오는 전문 프로그램을 모두 갖췄다는 이야기가 아닙니다. 브라우저가 작업의 연결을 어디까지 책임질 수 있는지 보여 주는 사례입니다. 24초 브랜드 필름은 분위기만 전하고, 이후의 모든 주장은 스토리 챕터 40개에 적힌 상태, 곧 운영·설정 필요·실험·문서화를 그대로 따릅니다. 라이브 데모가 실패하면 어디까지 확인했는지 있는 그대로 말씀드립니다. 그럼 컷 하나의 하루를 따라가 봅니다.",
      "Start by asking whether anyone has lost layers or context while moving work between tools. ToonStudio is not a claim to have everything a professional program has; it is a case study in how far a browser can keep a workflow connected. The 24-second brand film only sets the mood. Every later claim follows the status written in the 40 story chapters: live, setup required, experimental or documented. If a live demo fails, say exactly what was verified. Now follow one panel through its day.",
    ),
    question: t("오늘 듣고 나서 설명할 수 있어야 하는 것: 왜 로컬 저장, Worker, 렌더러 경계를 나눴을까요?", "By the end: why separate local storage, workers and rendering boundaries?"),
    technologies: ["React", "TypeScript", "Browser-native workflows"],
    atlasIds: ["implemented-not-wired-modules"],
    demo: { href: "/brand-film#creator-film", action: t("브랜드 필름 24초로 시작", "Open the 24-second brand film"), expected: t("제품이 연결하려는 창작 흐름을 먼저 이해합니다.", "Establish the creative workflow before the technical detail."), fallback: t("영상을 재생하지 못하면 같은 페이지의 스토리보드로 소개합니다.", "Use the storyboard on the same page when playback is unavailable.") },
  },
  {
    id: "seminar-problem", chapterId: "product-intent", section: product,
    title: t("도구를 옮길 때마다, 작업의 설명서가 사라집니다", "Every tool handoff can lose the explanation of the work"),
    takeaway: t("파일 하나보다 중요한 것은 장면의 의도, 원본, 수정 이력과 다음 행동입니다.", "A scene's intent, source, revision history and next action matter as much as its file."),
    points: [t("기획 → 콘티 → 드로잉 → 3D → 검수의 단절", "Gaps between planning, boards, drawing, 3D and review"), t("그림과 함께 출처·버전·담당 맥락을 유지", "Keep source, version and ownership alongside the artwork"), t("같은 프로젝트에서 다음 작업으로 이동", "Move to the next task within the same project")],
    flow: [t("흩어진 파일", "Scattered files"), t("프로젝트로 연결", "Connect by project"), t("맥락을 유지한 전달", "A handoff with context")],
    script: t(
      "‘카페에서 주인공이 대화하는 컷’ 하나를 끝까지 따라갑니다. 대본, 배경 고르기, 포즈 잡기, 대사와 그림 합치기, 검수까지 도구마다 좋아도 어느 버전이 원본인지 모르면 수정할 때마다 일을 되풀이합니다. 상자마다 내용물 목록이 없는 이삿짐과 같습니다. 그래서 Workspace와 Project를 중심에 두고 회차·컷·자산·검수와 게시 기록을 한 흐름으로 이었고, 제품 문서 PRODUCT.md도 기획에서 배포까지를 하나의 작업 흐름으로 적습니다. 자료를 가져올 때마다 출처 영수증을 붙이는 것도 같은 이유입니다. 모든 전문 기능을 갖췄다고 주장하지 않고 실제로 연결된 범위만 말합니다. 다음은 이 흐름을 여러 페이지가 어떻게 이어 주는지입니다.",
      "Follow one panel of a character talking in a cafe: script, background, pose, dialogue plus drawing, then review. Even good tools make you redo work when nobody knows which revision is the source. It is like moving boxes with no inventory. So Workspace and Project sit at the center, and episodes, panels, assets, review and publication records hang off one flow; the product document PRODUCT.md likewise describes planning through publishing as a single workflow. Attaching a provenance receipt to every imported resource follows the same idea. We claim no full set of professional features, only the scope that is actually connected. Next: how several pages connect this flow.",
    ),
    question: t("우리 제품에서 사용자가 맥락을 다시 입력하는 지점은 어디인가요?", "Where does your product make users re-enter their context?"), technologies: ["Project", "Document", "Asset provenance"],
    atlasIds: ["rights-provenance-receipt"],
  },
  {
    id: "seminar-workflow", chapterId: "product-intent", section: product,
    title: t("한 컷을 만드는 순서가, 페이지를 잇는 순서입니다", "The order of making one panel should connect the pages"),
    takeaway: t("서비스 소개는 ‘무엇’, 제품투어는 ‘어떻게’, 기술 발표는 ‘왜’를 담당합니다.", "The introduction explains what, the product tour how, and the engineering talk why."),
    points: [t("소개·필름: 어떤 문제를 해결하는가", "Introduction and film: which problem is being solved?"), t("제품투어: 작업자가 어떤 순서로 사용하는가", "Product tour: in what order does a creator work?"), t("기술·참고 자료: 선택의 이유와 한계를 설명", "Engineering and references: choices, evidence and limits")],
    flow: [t("서비스 소개", "Introduction"), t("제품 동작", "Product behavior"), t("설계 이유", "Design rationale"), t("재사용 자료", "Reusable references")],
    script: t(
      "여러 페이지를 처음부터 읽으면 같은 소개가 반복됩니다. 그래서 소개는 짧게, 제품투어는 드로잉·3D·AI 구간만, 기술 발표는 방금 본 동작의 내부를 설명합니다. 소개가 지도라면 제품투어는 주행, 기술 스토리는 정비 기록입니다. 참고 자료와 기술 도감은 발표 중 읽는 글이 아니라 질문이 나올 때 발표자 패널의 ‘도감 카드 열기’로 꺼내는 근거입니다. 데모 링크는 새 탭으로 열고, 슬라이드 링크는 번호가 아니라 id로 복사해 순서가 바뀌어도 같은 슬라이드를 가리킵니다. 이제 화면 뒤에서 책임을 어떻게 나눴는지 봅니다.",
      "Reading every page from the start repeats the introduction. So orientation stays brief, the product tour shows only the drawing, 3D and AI segments, and the engineering talk explains the inside of the action just seen. If the introduction is the map, the tour is the drive and the engineering story is the maintenance log. References and the tech atlas are not read aloud; when a question comes up, open the card from the presenter panel. Demo links open in a new tab, and slide links are copied by id rather than number, so they keep pointing at the same slide when the order changes. Next: how responsibilities are split behind the screen.",
    ),
    question: t("이 페이지의 다음 행동이 앞에서 설명한 문제와 연결되나요?", "Does the page's next action connect to the problem just explained?"), technologies: ["Route registry", "Chapter deep links", "Progressive disclosure"],
  },
  {
    id: "seminar-architecture", chapterId: "architecture", section: product,
    title: t("화면, 작업 엔진, 서버의 책임을 나눕니다", "Separate the responsibilities of UI, engines and server"),
    takeaway: t("React는 작업을 조작하는 화면이지, 모든 픽셀과 파일의 저장소가 아닙니다.", "React is the interface for manipulating work, not the storage for every pixel and file."),
    points: [t("화면: 메뉴·도구·선택 상태", "UI: menus, tools and selection state"), t("문서·엔진: 편집 명령·렌더링·로컬 저장", "Document and engines: commands, rendering and local persistence"), t("서버: 계정·권한·공유·외부 서비스 경계", "Server: accounts, authorization, sharing and external services")],
    flow: [t("사용자 입력", "User input"), t("편집 명령", "Edit command"), t("문서와 엔진", "Document and engine"), t("저장·공유", "Persist and share")],
    script: t(
      "식당에 비유하면 React 화면은 주문을 받는 곳이고 문서와 렌더러는 주방입니다. 주문과 재료를 한 곳에 쌓으면 하나를 바꿀 때 다른 것이 흔들립니다. 그래서 상태 라이브러리를 고르기 전에 무엇을 누가 소유하는지부터 정합니다. 앱 사이 직접 import는 config/architecture-boundary-ratchet.json이 0건으로 잠가 두었고, 낡은 경계 위반은 새로 늘지 못하게 숫자로 묶습니다. 덕분에 화면을 바꾸거나 전문 엔진을 붙여도 원본 문서를 덮어쓰지 않습니다. 다음은 그림이 저장되는 순간입니다.",
      "Think of the React UI as a restaurant's order counter and the document and renderer as its kitchen. Piling orders and ingredients in one place makes every change shake something else. So decide who owns each state before choosing a state library. Direct imports between apps are locked at zero by config/architecture-boundary-ratchet.json, and older boundary violations are capped so they cannot grow. That is why swapping the UI or adding a specialist engine does not overwrite the source document. Next: the moment a drawing is saved.",
    ),
    question: t("이 상태는 UI, 원본 문서, 캐시 중 어디에 있어야 할까요?", "Does this state belong to the UI, the source document or a cache?"), technologies: ["React", "TypeScript", "Zustand", "Command / document contracts"],
    atlasIds: ["module-boundary-ratchet", "nestjs-role-frozen-runtime"],
  },
  {
    id: "seminar-document", chapterId: "brush-render-authority", section: drawing,
    title: t("빠르게 보이는 그림과, 저장할 원본은 다릅니다", "A fast preview is not the source we commit"),
    takeaway: t("미리보기는 빠르게, 확정 결과는 다시 열어도 같은 의미로 남깁니다.", "Make previews responsive; preserve the meaning of committed results when reopened."),
    points: [t("입력 중에는 지연을 줄이는 임시 표시", "Use a low-latency preview while drawing"), t("입력 종료 후 검증된 경로로 결과 확정", "Commit through the validated rendering path"), t("Undo·저장·내보내기는 확정 문서를 기준으로", "Undo, persistence and export use the committed document")],
    flow: [t("펜 이동", "Pen movement"), t("즉시 미리보기", "Immediate preview"), t("확정", "Commit"), t("다시 열기", "Reopen")],
    script: t(
      "펜을 움직일 때는 바로 따라오는 느낌이 중요합니다. 하지만 임시 화면을 그대로 저장하면 브라우저가 짐작한 예측 점까지 영구 데이터가 됩니다. 그래서 하드웨어가 준 실제 샘플만 저장하고 예측은 화면에만 그렸다가 지웁니다(studio-pointer-input.ts). 정본은 최종 판단의 기준이 되는 데이터이고, 썸네일·미리보기·캡처는 영수증의 복사본 같은 결과물입니다. 한 획은 시작할 때 엔진 하나를 고르고 실패해도 몰래 다른 엔진으로 넘기지 않습니다(ADR-0018). 이 장은 실험 단계라 계약을 목표로 설명합니다. 그 첫 단계, 펜 입력부터 봅니다.",
      "While drawing, the stroke must follow the pen at once. But saving the temporary screen as-is would turn the browser's predicted points into permanent data. So only samples reported by the hardware are saved, and predictions are drawn on screen and erased (studio-pointer-input.ts). The authoritative document is the data used as the final reference; thumbnails, previews and captures are derived copies, like photocopies of a receipt. A stroke picks one engine at its start and never silently hands over to another when it fails (ADR-0018). This chapter is experimental, so describe the contract as a goal. First step: pen input.",
    ),
    question: t("미리보기와 내보내기 결과가 다를 때 어느 쪽이 기준인가요?", "Which result is authoritative when preview and export differ?"), technologies: ["Pointer Events", "Pointer prediction", "Tile commit", "Undo / redo", "Document authority"],
    atlasIds: ["stroke-replay-deterministic", "stroke-surface-route-pointerdown", "undo-history-byte-budget"],
  },
  {
    id: "seminar-input", chapterId: "brush-engine", section: drawing,
    title: t("손의 움직임은 점이고, 브러시는 그 점을 해석합니다", "Your hand produces samples; a brush interprets them"),
    takeaway: t("자연스러운 선은 좌표를 잇는 것만으로 만들어지지 않습니다.", "Natural strokes need more than joining coordinates."),
    points: [t("Pointer Events에서 좌표·압력·시간을 수집", "Collect position, pressure and time with Pointer Events"), t("안정화와 보간으로 흔들림·간격을 조절", "Control jitter and spacing through stabilization and interpolation"), t("선의 형상과 질감·색 혼합을 구분", "Separate stroke geometry from texture and color mixing")],
    flow: [t("입력 샘플", "Input samples"), t("안정화", "Stabilization"), t("선·브러시 자국", "Geometry and marks"), t("레이어 합성", "Layer compositing")],
    script: t(
      "같은 마우스 이동이라도 연필, 펜, 수채화는 달라야 합니다. 펜은 1초에 백 번 넘게 위치를 알려 주지만 브라우저는 화면 속도에 맞춰 묶어서 줍니다. 그 묶음을 풀어 실제 점을 모두 쓰는 것이 첫 단계입니다. 안정화는 부드러움과 반응 속도를 맞바꾸는 거래라서 강도 10의 시간 상수를 약 56ms로 정해 두었습니다(studio-stroke-stabilizer.ts). 지나치게 매끈하면 손보다 늦게 따라옵니다. 시연에서는 빠른 선과 느린 선을 비교하고 브러시를 바꿔 결과가 달라지는지 봅니다. 다음은 점을 선으로 바꾸는 라이브러리들입니다.",
      "The same mouse movement should look different as pencil, pen or watercolor. A pen reports its position well over a hundred times a second, but the browser bundles those events to screen speed; unbundling them to use every real point is step one. Stabilization trades smoothness for responsiveness, so strength 10 has a time constant of about 56 ms (studio-stroke-stabilizer.ts). Too much smoothing makes the line trail the hand. In the demo, compare fast and slow strokes and check that changing the brush changes the result. Next: the libraries that turn points into strokes.",
    ),
    question: t("지연을 줄이면서도 저장 결과를 유지하려면 무엇을 분리해야 할까요?", "What should be separated to reduce latency without changing saved output?"), technologies: ["Pointer Events", "perfect-freehand", "Brush platform"],
    atlasIds: ["pointer-input-contract", "stroke-smoothing-one-euro", "stroke-surface-route-pointerdown"],
    demo: { href: "/product-tour?t=108&player=mp4#product-tour-video", action: t("1:48 드로잉 구간 보기", "Open the drawing chapter at 1:48"), expected: t("브러시 선택과 그리기 흐름을 확인합니다. 영상은 제품 동작의 소개이며 성능 측정은 아닙니다.", "Observe brush selection and drawing. This video demonstrates the workflow, not a performance measurement."), fallback: t("제품투어 아래 드로잉 설명 또는 기술 스토리의 입력 파이프라인을 사용합니다.", "Use the drawing description or the engineering story's input pipeline.") },
  },
  {
    id: "seminar-brush-libraries", chapterId: "brush-engine", section: drawing,
    title: t("드로잉 라이브러리는 경쟁자가 아니라 역할 분담입니다", "Drawing libraries solve different parts of the problem"),
    takeaway: t("외곽선, 벡터 연산, 자연매체와 화면 편집은 서로 다른 문제입니다.", "Outlines, vector operations, natural media and scene editing are different problems."),
    points: [t("perfect-freehand: 압력 입력을 선의 외곽으로(Google Ink는 후보)", "perfect-freehand: pressure samples to outlines (Google Ink is a candidate)"), t("Paper.js: 벡터 경로와 기하 연산(선택형 provider)", "Paper.js: vector paths and geometry (an opt-in provider)"), t("p5.brush·Hokusai: 자연매체 표현(Hokusai는 실험)", "p5.brush and Hokusai: natural media (Hokusai is experimental)")],
    flow: [t("어떤 결과인가?", "What output?"), t("역할에 맞는 도구", "A role-specific tool"), t("공통 문서로 연결", "Connect to the document")],
    script: t(
      "perfect-freehand는 압력이 있는 선의 외곽을 만들 뿐 수채화 물리 엔진이 아닙니다. Google Ink는 획 끝 ‘예측 꼬리’ 미리보기에만 연결됐고 확정 획에는 쓰이지 않습니다. Paper.js는 벡터 경로, p5.brush와 Hokusai는 자연매체라는 다른 문제를 맡습니다. Hokusai는 우리가 만든 엔진이 아니라 MIT OR Apache-2.0의 외부 크레이트(reearth/hokusai 0.3.0)를 얇은 Rust 래퍼로 감싼 것이고, 비교 측정에서 수채 품질 게이트를 넘지 못해 자동 경로에는 오르지 않았습니다. 패키지가 있다는 사실이 주 렌더러라는 뜻은 아닙니다. 역할은 렌더러 역할 원장에 적혀 있습니다. 다음은 재료의 반응입니다.",
      "perfect-freehand creates pressure-sensitive outlines, not watercolor physics. Google Ink is wired only into the predicted-tail preview at stroke ends and is not used for committed strokes. Paper.js handles vector paths, while p5.brush and Hokusai address a different problem, natural media. Hokusai is not an engine we wrote: it is an external MIT OR Apache-2.0 crate (reearth/hokusai 0.3.0) wrapped by a thin Rust wrapper, and it did not pass the watercolor quality gate in comparison runs, so it is not on the automatic route. A dependency does not mean it is the main renderer. The roles are written in the renderer role ledger. Next: how materials respond.",
    ),
    question: t("이 라이브러리를 교체하면 문서 형식도 함께 바뀌어야 하나요?", "Would replacing this library require changing the document format?"), technologies: ["perfect-freehand", "Google Ink", "Paper.js", "p5.brush", "Hokusai", "Konva / React Konva"],
    atlasIds: ["renderer-role-ledger", "hokusai-wasm-natural-media"],
  },
  {
    id: "seminar-natural-media", chapterId: "brush-engine", section: drawing,
    title: t("수채화는 투명한 선이 아니라, 재료의 반응입니다", "Watercolor is a material response, not just a transparent line"),
    takeaway: t("색 혼합, 종이 질감, 젖음과 가장자리 표현은 따로 검증해야 합니다.", "Color mixing, paper texture, wetness and edge behavior need separate validation."),
    points: [t("형상·색 혼합·표면 질감을 독립적으로 판단", "Evaluate geometry, color mixing and surface texture separately"), t("Mixbox·spectral.js 등 혼색 도구도 적용 범위를 확인", "Check the actual integration scope of mixing tools such as Mixbox and spectral.js"), t("다른 엔진으로 바뀌어도 같은 색이라는 보장은 없음", "Changing engines does not guarantee equivalent color")],
    flow: [t("안료·압력", "Pigment and pressure"), t("재료 모델", "Material model"), t("종이와 합성", "Surface and composite")],
    script: t(
      "빨강과 파랑의 RGB 평균은 물감을 섞은 결과와 다릅니다. 자연스럽다는 말에는 색뿐 아니라 가장자리, 번짐, 농도 변화가 들어갑니다. 그래서 혼색과 자연매체를 따로 맡기고, 예쁜 데모 한 장으로 품질을 확정하지 않고 같은 입력의 재실행과 내보내기 차이를 함께 봅니다. 도구마다 조건도 다릅니다. Mixbox는 CC BY-NC 4.0 비상업 라이선스라서 상용 빌드에는 제거하거나 별도 라이선스가 필요하다고 고지 파일에 적혀 있습니다(THIRD_PARTY_NOTICES.md). 판단은 소유자의 몫이고 저는 사실만 말씀드립니다. 이제 그리는 엔진들의 분담입니다.",
      "An RGB average of red and blue is not what mixing paint gives. Natural includes edges, diffusion and concentration as well as color. So mixing and natural media are assigned separately, quality is never settled by one attractive demo, and rerun results and export differences are checked together. Terms also differ per tool. Mixbox is CC BY-NC 4.0, non-commercial, and the notice file records that a commercial build must remove it or obtain a separate license (THIRD_PARTY_NOTICES.md). The judgment belongs to the owner; I only state facts. Next: how the drawing engines share the work.",
    ),
    question: t("우리 품질 기준은 ‘예쁜 한 장’인가요, ‘반복 가능한 결과’인가요?", "Is quality one attractive image or a repeatable result?"), technologies: ["Hokusai / WASM", "p5.brush", "Mixbox", "spectral.js", "Material brush providers"],
    atlasIds: ["spectral-color-mixing-mixbox", "material-physics-paper-tooth", "hokusai-wasm-natural-media"],
  },
  {
    id: "seminar-renderers", chapterId: "brush-render-authority", section: drawing,
    title: t("렌더러를 늘리는 것보다, 결과를 섞지 않는 게 중요합니다", "More renderers matter less than keeping their results coherent"),
    takeaway: t("Canvas2D·WebGL·WebGPU·WASM은 각각 도구이며, 품질 보증 자체는 아닙니다.", "Canvas2D, WebGL, WebGPU and WASM are tools, not quality guarantees."),
    points: [t("CanvasKit/Skia·Vello·ThorVG 등의 역할을 등록부에서 관리", "Manage roles of CanvasKit/Skia, Vello and ThorVG in the registry"), t("장치 지원과 출력 특성에 맞춰 경로 선택", "Select paths by device capability and output characteristics"), t("미지원 시 명시적 안내·검증된 대체 경로", "Expose unsupported cases and use validated fallbacks")],
    flow: [t("문서·요청", "Document and request"), t("기능·품질 확인", "Capability and quality check"), t("선택된 렌더러", "Selected renderer"), t("확정 결과", "Committed output")],
    script: t(
      "WebGPU를 썼다고 앱 전체가 빨라지거나 모든 브러시가 같게 지원되지는 않습니다. CanvasKit은 Skia를 웹에서 쓰는 길이고, Vello·ThorVG와 GPU 경로는 출력 특성과 비용이 다릅니다. 그래서 엔진 20개의 역할을 packages/studio-engine-registry/src/renderer-roles.ts 한 곳에 적고, 권위 13종 중 12종은 책임자가 정확히 한 명이며(1종은 소유자 없음 선언) 어긋나면 테스트가 깨집니다. 메뉴판이자 계약서입니다. 대체 경로가 선의 모양을 바꾼다면 성공한 척하지 않고 기능 제한을 알립니다. 이제 그리는 입력 말고, 끄는 입력을 봅니다.",
      "Using WebGPU does not make the whole app faster or support every brush identically. CanvasKit exposes Skia to the web; Vello, ThorVG and the GPU paths differ in output and cost. So the roles of 20 engines are written in one file, packages/studio-engine-registry/src/renderer-roles.ts; of 13 authorities, 12 have exactly one owner (one is declared ownerless), and tests break when they drift. It is both a menu and a contract. If a fallback changes the shape of a stroke, say that a capability is limited instead of pretending success. Next: not drawing input, but dragging input.",
    ),
    question: t("대체 경로가 결과를 바꾼다면 사용자에게 어떻게 알려야 할까요?", "How should users be informed when a fallback changes the output?"), technologies: ["Canvas2D", "CanvasKit / Skia", "WebGL2", "WebGPU", "Vello", "ThorVG", "Renderer registry"],
    atlasIds: ["renderer-role-ledger", "skia-canvaskit-retained-surface", "gpu-fabric-device-lease-vello", "webgpu-tier-budget-recovery"],
  },
  {
    id: "seminar-dnd", chapterId: "quality", section: drawing,
    title: t("끌어 놓기는 라이브러리 없이, 끌지 않는 길도 함께", "Drag and drop without a library, with a no-drag path beside it"),
    takeaway: t("일에 따라 표준 DnD·Pointer Events·엔진 기능을 고르고, 문서에는 놓는 순간 한 번만 기록합니다.", "Pick native DnD, Pointer Events or an engine feature per job, and write to the document once at drop."),
    points: [t("표준 HTML5 DnD: 파일 반입·레이어·페이지 순서", "Native HTML5 DnD: file import, layers and page order"), t("Pointer Events: 5px 넘어야 시작하는 칸반·패널", "Pointer Events: kanban and panels that start after 5 px"), t("끌지 않는 짝: Alt+방향키·클릭 삽입", "A no-drag twin: Alt+arrows and click-to-insert")],
    flow: [t("끌기 시작(검사)", "Start (validate)"), t("놓을 자리 계획", "Plan the drop"), t("놓는 순간 한 번 기록", "Commit once at drop"), t("취소·복구", "Cancel and restore")],
    script: t(
      "끌기는 물건 옮기기와 같아서 방법이 셋입니다. 택배 창구(브라우저 표준 DnD), 손수레(Pointer Events로 직접), 공장 컨베이어(Konva·three.js 내장 기능)입니다. package.json에는 끌어 놓기 라이브러리가 하나도 없습니다. 칸반은 5px 넘게 움직여야 끌기가 시작되고(use-board-dnd.ts), 끄는 동안은 놓일 자리 계획만 계산해 손을 놓는 순간 문서에 한 번만 기록합니다. 페이지 순서는 끌기와 Alt+←/→가 같은 함수를 씁니다. 직접 만든 대가는 접근성과 터치 처리를 스스로 책임지는 것입니다. 다음은 무거운 계산을 UI 밖으로 보내는 일꾼입니다.",
      "Dragging is like moving goods, so there are three ways: a parcel counter (the browser's native DnD), a handcart (Pointer Events, built by hand) and a factory conveyor (the built-in features of Konva and three.js). package.json lists no drag-and-drop library. The kanban starts a drag only after 5 px of movement (use-board-dnd.ts); while dragging it only computes the drop plan and writes to the document once, at release. Page order uses the same function for dragging and Alt+Left/Right. The price of building it ourselves is owning accessibility and touch handling. Next: the workers that move heavy computation out of the UI.",
    ),
    question: t("끌기를 직접 만들었다면, 끌 수 없는 사용자는 같은 일을 어떻게 하나요?", "If dragging is hand-built, how does a user who cannot drag do the same job?"), technologies: ["Pointer Events", "Konva", "Three.js", "React"],
    atlasIds: ["dnd-implementation-choice", "layer-panel-reorder-dnd", "pointer-drag-kanban", "keyboard-alternatives-for-drag"],
  },
  {
    id: "seminar-workers", chapterId: "worker-architecture", section: local,
    title: t("무거운 작업을 옮겨도, UI는 같은 작업을 기다립니다", "Moving work off-thread still requires a clear completion contract"),
    takeaway: t("Worker는 별도 작업자입니다. 시작·취소·진행·완료를 연결하는 설계가 필요합니다.", "A worker is another executor. It needs a contract for start, cancellation, progress and completion."),
    points: [t("메인 스레드는 입력과 화면 반응을 우선", "Prioritize input and UI response on the main thread"), t("렌더·연산·저장은 작업별 Worker로 분리", "Separate rendering, compute and persistence by workload"), t("이전 요청의 늦은 결과는 최신 문서를 덮지 않음", "Late results must not overwrite a newer document")],
    flow: [t("명령 + 작업 ID", "Command and job ID"), t("Worker 실행", "Worker execution"), t("버전 확인", "Version check"), t("결과 반영", "Apply result")],
    script: t(
      "Worker는 일꾼을 하나 더 둔 것과 비슷하지만, 일을 보냈다는 것과 끝났다는 것은 다릅니다. 사용자가 다른 장면으로 떠났는데 늦게 온 결과를 붙이면 안 됩니다. 그래서 요청에 번호를 붙여 늦은 응답을 버리고, 취소하면 일꾼을 끝내고, 큰 데이터는 복사 대신 소유권을 넘기고, 제한 시간을 둡니다. 워커 스크립트는 apps/web/src에 64개지만 어느 것을 열어도 같은 규약으로 읽힙니다. WebAssembly는 실행 형식, Worker는 실행 위치라서 WASM을 메인 스레드에서 오래 돌리면 화면은 여전히 멈춥니다. 결과가 어디에 남는지 이어서 봅니다.",
      "A worker is like hiring one more employee, but sending a job is not finishing it. A result arriving after the user has moved to another scene must not be attached. So each request carries an ID so late replies are dropped, cancelling ends the worker, large data changes owner instead of being copied, and every job has a time limit. There are 64 worker scripts under apps/web/src, yet each reads the same way. WebAssembly is an execution format and a Worker is an execution place, so long WASM on the main thread still freezes the screen. Next: where the results end up.",
    ),
    question: t("사용자가 취소한 작업의 결과가 늦게 도착하면 어떻게 되나요?", "What happens when a cancelled job returns late?"), technologies: ["Web Workers", "OffscreenCanvas", "Transferable", "WebAssembly", "Job identity"],
    atlasIds: ["worker-envelope-64-workers", "main-thread-yielding"],
  },

  {
    id: "seminar-local-store", chapterId: "storage", section: local,
    title: t("저장 버튼보다 먼저, 데이터가 어디에 남는지 묻습니다", "Before the save button, ask where the data actually lives"),
    takeaway: t("로컬 저장과 서버 동기화는 같은 성공 메시지로 묶을 수 없습니다.", "Local persistence and server synchronization are different success states."),
    points: [t("OPFS: 이 사이트 전용 파일 공간", "OPFS: an origin-private file space"), t("SQLite WASM·IndexedDB: 구조화된 로컬 데이터", "SQLite WASM and IndexedDB: structured local data"), t("서버 업로드·다른 기기 복구는 별도 확인", "Verify upload and cross-device recovery separately")],
    flow: [t("편집", "Edit"), t("기기 안에 저장", "Persist on device"), t("동기화 대기", "Queue synchronization"), t("서버 확인", "Server acknowledgement")],
    script: t(
      "저장했다고 표시돼도 실제로는 메모리에만 있거나 업로드가 대기 중일 수 있습니다. 로컬 우선은 이 기기의 작업을 먼저 지키고 서버 연결을 별도 단계로 둡니다. 큰 파일은 OPFS에, 찾고 정렬할 데이터는 SQLite WASM에 두며 DB는 전용 Worker 하나만 쥡니다(studio-local-database.worker.ts). 자동저장은 두 칸짜리 서랍처럼 새 내용을 빈 칸에 먼저 쓰고 마지막에 ‘여기가 최신’ 표지만 바꿉니다. 하지만 이것은 이 기기 안의 안전망이지 백업이 아니라서, 사이트 데이터 삭제와 용량 제한은 그대로 남습니다. 인터넷을 끊으면 어디까지 열리는지 봅니다.",
      "A saved indicator may only mean the data is in memory or an upload is queued. Local-first protects work on this device first and treats server sync as a separate stage. Large files go to OPFS, searchable data to SQLite WASM, and one dedicated worker alone holds the database (studio-local-database.worker.ts). Autosave works like a two-slot drawer: write new content to the empty slot first, then flip the 'latest is here' marker. But that is a safety net on this device, not a backup, so site-data deletion and quotas remain real constraints. Next: how much opens with the network cut.",
    ),
    question: t("인터넷을 끊고 새로 열었을 때, 어디까지 복구되어야 하나요?", "What must recover when the network is disconnected and the work is reopened?"), technologies: ["OPFS", "SQLite WASM", "IndexedDB", "Checkpoint", "Sync acknowledgement"],
    atlasIds: ["sqlite-wasm-opfs-sah-pool", "autosave-crash-recovery-journal", "opfs-content-addressed-store", "storage-persistence-quota-safe-mode"],
  },
  {
    id: "seminar-offline", chapterId: "pwa-continuity", section: local,
    title: t("오프라인은 기능 이름이 아니라, 준비된 범위입니다", "Offline is a prepared scope, not a blanket promise"),
    takeaway: t("앱 화면, 작업 데이터, 브러시·모델 파일이 함께 준비되어야 작업이 이어집니다.", "App code, document data and brush or model assets all need to be available."),
    points: [t("Service Worker: 준비된 앱·정적 파일 응답", "Service Worker: serve prepared app and static assets"), t("로컬 DB: 내 작업의 내용과 복구 지점", "Local database: document content and recovery checkpoints"), t("서버 AI·새 자산·공동 접속은 연결이 필요할 수 있음", "Remote AI, new assets and live sessions may still require a network")],
    flow: [t("온라인에서 준비", "Prepare online"), t("앱·자산 캐시", "Cache app and assets"), t("로컬 작업", "Work locally"), t("재연결 확인", "Check reconnection")],
    script: t(
      "앱을 설치했다는 것과 모든 기능이 오프라인이라는 것은 다릅니다. 앱 셸만 캐시되고 고른 브러시나 3D 모델이 없으면 화면이 열려도 작업은 멈춥니다. 서비스 워커는 스튜디오를 열 때 응답을 4초까지만 기다리고(studio-service-worker-navigation.ts), 넘으면 기기에 준비한 같은 화면을, 그것도 없으면 아주 작은 긴급 복구 드로잉을 엽니다. 미리 받을 양에는 바이트 예산이 있어 넘으면 빌드가 실패합니다. 그래서 오프라인 데모는 문서와 자산을 먼저 준비하고, 끊은 뒤 새로 열기·저장·다시 열기를 확인합니다. 그런데 새 버전이 오면 어떻게 될까요?",
      "Installing an app does not make every capability offline. If only the shell is cached and the chosen brush or 3D model is missing, the screen opens but work stalls. When opening the studio, the service worker waits at most four seconds for a response (studio-service-worker-navigation.ts); past that it opens the same screen prepared on the device, and failing that, a tiny emergency drawing page. The pre-download amount has a byte budget, and exceeding it fails the build. So prepare the exact document and assets, disconnect, then verify reopening, saving and reopening again. And what happens when a new version arrives?",
    ),
    question: t("‘오프라인 지원’을 어떤 작업 단위로 검증할까요?", "Which user task defines the boundary of offline support?"), technologies: ["PWA", "Service Worker", "Cache Storage", "OPFS", "Offline readiness"],
    atlasIds: ["service-worker-app-shell-policy", "server-down-fallback-deadline", "precache-budget-offline-core"],
  },
  {
    id: "seminar-recovery", chapterId: "pwa-continuity", section: local,
    title: t("업데이트가 작업 중인 원고를 밀어내면 안 됩니다", "An application update must not displace an active manuscript"),
    takeaway: t("새 버전 배포, 캐시 교체, 두 탭의 저장 충돌을 함께 생각합니다.", "Consider version deployment, cache replacement and multi-tab writes together."),
    points: [t("작업 중 새 Service Worker를 무조건 활성화하지 않음", "Do not blindly activate a new service worker during editing"), t("자산·문서 버전과 복구 지점을 함께 확인", "Check asset versions, document versions and recovery checkpoints"), t("두 탭·저장 실패·용량 부족도 성공 기준에 포함", "Include multiple tabs, failed writes and storage pressure in acceptance criteria")],
    flow: [t("새 버전 감지", "Detect update"), t("현재 작업 보존", "Preserve current work"), t("전환", "Switch"), t("복구 확인", "Verify recovery")],
    script: t(
      "웹은 새 버전을 빨리 배포할 수 있지만 작업 도구에서는 그 장점이 위험이 되기도 합니다. 앱 코드와 캐시된 자산의 버전이 어긋나거나 다른 탭이 오래된 상태를 저장하면 작업이 뒤로 돌아갑니다. 그래서 새 버전은 뒤에서 받아 두기만 하고, 저장과 동기화가 끝났다고 각 모듈이 말해야 ‘지금 업데이트’ 버튼이 눌립니다(studio-update-safety.ts). 같은 원고를 탭 두 개로 열어도 문서의 저자는 Web Locks 번호표를 쥔 한 명뿐입니다. 비상용 reset 킬 스위치도 작품 데이터는 건드리지 않습니다. 다음은 아직 표준이 굳지 않은 새 웹 기능을 다루는 규칙입니다.",
      "The web can ship new versions fast, which becomes a risk for an authoring tool. If code and cached asset versions drift, or another tab saves an older state, work can move backwards. So a new version is only downloaded in the background, and the Update now button works only after every module says saving and sync are done (studio-update-safety.ts). Even with two tabs on one manuscript, only the holder of the Web Locks ticket is the author. The emergency reset kill switch never touches work data. Next: the rules for new web features whose standards are not settled.",
    ),
    question: t("새 버전과 오래된 문서가 동시에 존재할 때 누가 전환을 결정하나요?", "Who controls the transition when new code and an older document coexist?"), technologies: ["Service Worker lifecycle", "Versioned assets", "Web Locks", "Checkpoint", "Multi-tab ownership"],
    atlasIds: ["user-approved-update-kill-switch", "web-locks-broadcastchannel-single-author", "autosave-crash-recovery-journal", "hashed-assets-cache-contract"],
  },
  {
    id: "seminar-nextgen-web", chapterId: "nextgen-web-experiments", section: local,
    title: t("새 웹 기능은 감지하고, 표지를 달고, 끌 수 있게 넣습니다", "New web features are detected, labeled and switchable"),
    takeaway: t("27종을 한곳에서 감지해 설정에 표지하고, 실제로 켠 기능 중 3개는 사용자가 끌 수 있습니다.", "27 APIs are detected in one place and labeled in settings; three of the enabled ones can be switched off."),
    points: [t("27종 감지: 없으면 오류가 아니라 ‘미지원’", "27 APIs detected: absent means unsupported, never an error"), t("연결된 것: 화면 유지·프리렌더·화면 전환·스포이트", "Wired up: wake lock, prerender, view transitions, eyedropper"), t("WebTransport는 코드만, Speculation Rules는 효과 미검증", "WebTransport is code only; Speculation Rules is unmeasured")],
    flow: [t("능력 감지", "Detect"), t("실험 표지", "Label experimental"), t("끄는 토글", "User toggle"), t("미지원이면 조용히 없음", "Silently absent if unsupported")],
    script: t(
      "새 웹 기능은 브라우저마다 지원이 달라서 쓰기 전에 있는지부터 묻습니다. 27종의 감지를 nextgen-web-capabilities.ts에 모았고, 감지는 절대 오류를 던지지 않습니다. 설정의 실험 기능에는 표지를 달고 3개는 끌 수 있게 했습니다. 실제로 켠 것은 화면 꺼짐 방지, 스튜디오 프리렌더, 화면 전환, 스포이트입니다. 한계도 분명합니다. WebTransport는 클라이언트 소켓만 있고 서버 종단과 켜는 배선이 없어 운영은 WebSocket뿐이며, Speculation Rules는 보안 정책에 막히는지 실제 브라우저로 확인하지 못했습니다. 이제 3D 이야기로 갑니다.",
      "Browsers differ in support for new web features, so we ask whether a feature exists before using it. Detection for 27 APIs lives in nextgen-web-capabilities.ts, and detection never throws. The experimental section of settings carries a label, and three features can be switched off. What is actually on: screen wake lock, studio prerender, view transitions and the eyedropper. The limits are clear. WebTransport has only a client socket, with no server endpoint or switch-on wiring, so production runs on WebSocket alone; and whether the security policy blocks Speculation Rules was never confirmed in a real browser. Now on to 3D.",
    ),
    question: t("새 브라우저 기능이 안 되는 환경에서도 사용자는 막히지 않나요?", "Is a user on a browser without the feature ever blocked?"), technologies: ["Speculation Rules", "View Transitions", "Screen Wake Lock", "EyeDropper", "Compute Pressure", "WebTransport"],
    atlasIds: ["capability-detection-registry-27", "speculation-rules-prerender", "webtransport-experiment", "cross-origin-isolation-studio-gate"],
  },
  {
    id: "seminar-scene3d", chapterId: "web-3d-engine", section: spatial,
    title: t("3D는 보여주는 물체가 아니라, 수정 가능한 장면입니다", "3D is an editable scene, not merely a displayed object"),
    takeaway: t("모델, 카메라, 조명과 포즈를 분리해야 같은 장면으로 여러 컷을 만들 수 있습니다.", "Separate models, cameras, lighting and poses to reuse a scene across panels."),
    points: [t("장면 문서: 무엇이 어디에 있는가", "Scene document: what exists and where"), t("카메라·조명: 어떻게 보이는가", "Camera and lighting: how it is seen"), t("2D 연결: 어떤 컷과 레이어에 쓰이는가", "2D link: which panel and layer use it")],
    flow: [t("모델·포즈", "Model and pose"), t("카메라·조명", "Camera and light"), t("장면 결과", "Scene output"), t("2D 컷에 연결", "Link to the 2D panel")],
    script: t(
      "카페 모델을 띄우는 것만으로 제작용 3D 도구가 되지는 않습니다. 주인공의 위치와 포즈, 카메라 구도, 조명을 바꾸고 같은 장면을 다른 컷에서 다시 써야 합니다. 그래서 완성 이미지뿐 아니라 그 이미지를 다시 만드는 장면 상태를 저장합니다. Three.js는 장면을 그리는 바탕이고 React Three Fiber·Drei는 그 장면을 React에서 조립하는 도구입니다. 3D 캡처는 색·깊이·법선을 읽어 컬러·톤·질감선·주선 네 레이어로 나뉘어 2D 컷에 붙습니다(LT 변환). 먼저 3D 공구함부터 봅니다.",
      "Displaying a cafe model does not make a production 3D tool. Creators need to change the character's position and pose, the camera framing and the lighting, then reuse the scene in another panel. So we save not only the finished image but the scene state that can recreate it. Three.js is the foundation that draws the scene; React Three Fiber and Drei assemble it in React. A 3D capture is read for color, depth and normals and split into four layers (color, tone, texture line, main line) before it joins the 2D panel; this is the LT conversion. First, the 3D toolbox.",
    ),
    question: t("3D 결과를 그림으로 넣은 뒤, 원래 구도를 다시 수정할 수 있나요?", "Can the original composition still be edited after inserting the 3D output into a drawing?"), technologies: ["Three.js", "React Three Fiber", "Drei", "Scene document", "Linked layers"],
    atlasIds: ["three-r3f-viewport", "toon-shading-outline", "lift-2d-to-3d"],
    demo: { href: "/product-tour?t=228&player=mp4#product-tour-video", action: t("3:48 캐릭터·포즈·3D 보기", "Open character, pose and 3D at 3:48"), expected: t("모델·포즈·장면 편집의 연결을 확인합니다.", "Observe the connection between model, pose and scene editing."), fallback: t("3D 기술 스토리에서 장면 문서와 캡처 경계를 설명합니다.", "Explain the scene-document and capture boundary using the engineering story.") },
  },
  {
    id: "seminar-3d-toolkit", chapterId: "web-3d-engine", section: spatial,
    title: t("3D 라이브러리를 기능별 공구함으로 읽습니다", "Read the 3D stack as a task-specific toolbox"),
    takeaway: t("렌더링, 충돌, 선택, 파일 최적화는 같은 3D라도 서로 다른 작업입니다.", "Rendering, collision, selection and asset optimization are different workloads."),
    points: [t("Three.js·Babylon.js: 역할별 렌더링·런타임 경로", "Three.js and Babylon.js: role-specific rendering and runtime paths"), t("Rapier·Manifold·CSG: 물리와 형상 연산", "Rapier, Manifold and CSG: physics and geometry operations"), t("glTF Transform·Meshoptimizer·KTX2: 자산 변환과 최적화", "glTF Transform, Meshoptimizer and KTX2: asset conversion and optimization")],
    flow: [t("파일 가져오기", "Import asset"), t("검사·최적화", "Validate and optimize"), t("편집·렌더", "Edit and render"), t("자원 해제", "Release resources")],
    script: t(
      "Three.js와 Babylon.js가 함께 설치돼 있다고 모든 장면을 두 번 그리는 것은 아닙니다. 장면 유형에 맞춰 연결된 경로를 구분합니다. Rapier는 물리, Manifold와 three-bvh-csg는 도형을 합치고 빼는 일을 맡습니다. three-mesh-bvh는 예산이 있는 공급자 모듈(studio-three-mesh-bvh-provider.ts)을 만들었지만 테스트 밖에서 부르는 곳이 없어 ‘구현됨·미연결’입니다. 다만 three-bvh-csg가 안에서 쓰므로 CSG Worker 번들에는 들어 있습니다. 모델 최적화는 다운로드 크기만이 아니라 압축 해제 시간과 GPU 텍스처 크기까지 봅니다. 다음은 캐릭터의 뼈대입니다.",
      "Having Three.js and Babylon.js installed together does not mean every scene is drawn twice; the connected path depends on the scene type. Rapier handles physics, while Manifold and three-bvh-csg handle merging and subtracting shapes. For three-mesh-bvh we built a budgeted provider module (studio-three-mesh-bvh-provider.ts), but nothing outside tests calls it, so it is implemented but not wired. Even so, three-bvh-csg uses it internally, so it is inside the CSG Worker bundle. Model optimization looks beyond download size to decompression time and GPU texture size. Next: a character's skeleton.",
    ),
    question: t("파일 크기는 작아졌는데 왜 첫 화면은 더 느려질 수 있을까요?", "Why might a smaller file make the first frame slower?"), technologies: ["Three.js", "Babylon.js", "Rapier", "Manifold", "three-bvh-csg", "glTF Transform", "Meshoptimizer", "KTX2"],
    atlasIds: ["glb-optimization-pipeline", "opencascade-manifold-precision", "coordinate-unit-roundtrip"],
  },
  {
    id: "seminar-avatar", chapterId: "web-3d-engine", section: spatial,
    title: t("캐릭터의 포즈는 뼈대를 움직이는 약속입니다", "A pose is a contract for moving a character's skeleton"),
    takeaway: t("모델의 형태, 뼈대, 표정과 포즈의 호환성을 각각 확인해야 합니다.", "Validate model geometry, skeleton, expressions and pose compatibility separately."),
    points: [t("VRM·three-vrm: 캐릭터의 구조와 런타임", "VRM and three-vrm: character structure and runtime"), t("IK: 손·발의 목표에서 관절 자세를 계산", "IK: derive joint positions from hand or foot targets"), t("표정·스프링본·접지의 결과는 모델마다 검증", "Verify expressions, spring bones and grounding per model")],
    flow: [t("캐릭터 불러오기", "Load character"), t("뼈대·표정 확인", "Check skeleton and expressions"), t("포즈 조작", "Manipulate pose"), t("컷에서 검수", "Review in the panel")],
    script: t(
      "인물의 손을 컵 가까이 옮긴다는 말은 내부적으로 여러 관절의 회전을 조절한다는 뜻입니다. IK는 끝점의 목표를 주면 관절의 자세를 계산하는 방법입니다. VRM은 모든 캐릭터가 같은 뼈 이름을 쓰게 하는 약속이라서 포즈 도구와 웹캠 추적이 같은 뼈대에 붙습니다. 다만 관절 제한, 발의 접지, 표정은 모델마다 다르고, VRM 파일이 열렸다고 모든 포즈가 자연스러운 것은 아닙니다. 웹캠 영상은 서버로 올리지 않고 브라우저 안에서 읽으며, 내려받는 것은 모델 파일뿐입니다. 라이선스와 호환성은 별개의 검사입니다. 이제 3D의 성능을 봅니다.",
      "Moving a character's hand toward a cup means adjusting several joint rotations inside. IK takes an endpoint target and solves the joint pose. VRM is a promise that every character uses the same bone names, so pose tools and webcam tracking attach to one skeleton. But joint limits, grounding and expressions differ by model, and opening a VRM file does not make every pose natural. Webcam video is read inside the browser and never uploaded; only model files are downloaded. Licensing and compatibility are separate checks. Now, 3D performance.",
    ),
    question: t("모델이 열리는 것과 작품에 쓸 수 있는 것 사이에는 어떤 검사가 필요할까요?", "Which checks separate loading a model from using it in production?"), technologies: ["VRM", "@pixiv/three-vrm", "IK", "Morph targets", "Pose presets"],
    atlasIds: ["vrm-humanoid-rig", "mediapipe-webcam-pose"],
  },
  {
    id: "seminar-3d-performance", chapterId: "performance", section: spatial,
    title: t("빠른 3D는 FPS보다 먼저, 기다림과 메모리를 봅니다", "Before frame rate, inspect waiting time and memory"),
    takeaway: t("다운로드 → 해석 → GPU 업로드 → 첫 조작의 시간을 따로 봅니다.", "Measure download, parsing, GPU upload and first interaction separately."),
    points: [t("LOD·압축·지연 로딩으로 필요한 자원부터", "Prioritize resources using LOD, compression and lazy loading"), t("뷰어를 닫으면 GPU·이벤트·Worker도 정리", "Release GPU resources, listeners and workers when a viewer closes"), t("모바일과 인앱 브라우저는 독립적으로 검증", "Validate mobile and in-app browsers independently")],
    flow: [t("다운로드", "Download"), t("해석·업로드", "Parse and upload"), t("첫 조작", "First interaction"), t("닫기·재진입", "Close and reopen")],
    script: t(
      "장면이 열린 뒤 FPS가 높아도 첫 화면을 오래 기다리거나 두 번째 실행에서 메모리가 모자라면 사용성은 나쁩니다. 텍스처는 압축 파일 크기보다 GPU에 올라간 크기가 중요하고, 닫은 뷰어가 자원을 붙잡으면 누수가 쌓입니다. 그래서 GPU는 이름이 아니라 기기가 보고한 한도로 등급을 매기는데 maxBufferSize가 1 GiB·384 MiB·256 MiB 이상이면 각각 full·standard·lite입니다(studio-capability-tier.ts). 장치가 3번 끊기면 이번 세션의 GPU를 포기합니다. 이 발표는 측정하지 않은 FPS나 다른 제품 대비 수치를 말하지 않습니다. 이제 브라우저가 못 하는 일을 봅니다.",
      "High FPS after loading is not enough if the first frame takes long or the second session runs out of memory. Decoded GPU textures can matter more than compressed file size, and closed viewers that keep resources leak over time. So the GPU is graded by the limits the device reports, not by its name: maxBufferSize of at least 1 GiB, 384 MiB or 256 MiB maps to full, standard or lite (studio-capability-tier.ts). After three device losses, the GPU is given up for that session. This talk states no unmeasured FPS or competitor comparisons. Next: what the browser cannot do alone.",
    ),
    question: t("측정 지표가 사용자가 실제 기다리는 순간과 일치하나요?", "Do your metrics reflect the moments users actually wait?"), technologies: ["WebGPU", "LOD", "Lazy loading", "Texture compression", "Resource ownership", "Device capability checks"],
    atlasIds: ["webgpu-tier-budget-recovery", "glb-optimization-pipeline", "three-r3f-viewport"],
  },
  {
    id: "seminar-blender", chapterId: "blender-mcp-boundary", section: spatial,
    title: t("브라우저 밖의 전문 도구는, 명확한 출입구로 연결합니다", "Connect specialist desktop tools through an explicit boundary"),
    takeaway: t("Blender·MCP·로컬 브리지는 웹의 권한 밖에서 실행되는 별도 경로입니다.", "Blender, MCP and a local bridge run in a separate permission and execution boundary."),
    points: [t("웹: 작업 요청과 결과 확인", "Web: request work and inspect the result"), t("로컬 도구: 설치된 Blender 등으로 전문 작업", "Local tools: specialist work in installed applications such as Blender"), t("복귀: 결과 파일·출처·검증 기록을 프로젝트에 연결", "Return: attach output, provenance and validation to the project")],
    flow: [t("사용자 승인", "User approval"), t("로컬 도구 작업", "Local tool execution"), t("결과 검사", "Validate output"), t("프로젝트 반영", "Apply to project")],
    script: t(
      "웹의 한계를 넘는다는 것은 브라우저 보안을 몰래 우회한다는 뜻이 아닙니다. Blender 같은 전문 도구가 필요한 일은 명시적인 로컬 브리지와 권한을 거쳐 따로 실행합니다. MCP는 도구를 호출하고 결과를 받는 연결 규약이지 3D 엔진이 아닙니다. 검문소를 지나야 들어가는 공장과 같아서, 브라우저를 열었다고 Blender가 저절로 설치되거나 실행되지는 않습니다. VRM 생성 MCP는 연결된 호스트가 없으면 성공을 흉내 내지 않고 unavailable을 돌려줍니다(studio-vrm-generate-mcp.ts). 결과 파일은 권리와 버전을 확인한 뒤 반영합니다. 마지막 3D 이야기는 헤드셋입니다.",
      "Going beyond browser limits does not mean bypassing browser security. Work that needs a specialist tool such as Blender runs separately through an explicit local bridge and permissions. MCP is a protocol for calling tools and receiving results, not a 3D engine. It is like a factory you enter through a checkpoint: opening the website does not install or launch Blender by itself. The VRM-generation MCP returns unavailable instead of faking success when no host is connected (studio-vrm-generate-mcp.ts). Returned files are applied only after rights and versions are checked. The last 3D topic: headsets.",
    ),
    question: t("어디까지 웹만으로 가능하고, 어느 단계부터 로컬 설치가 필요한가요?", "Which steps work in the browser alone, and which require a local installation?"), technologies: ["Blender", "MCP", "ToonBridge", "GLB / glTF", "Artifact validation"],
    atlasIds: ["blender-mcp-toonbridge", "coordinate-unit-roundtrip"],
  },
  {
    id: "seminar-webxr", chapterId: "web-3d-engine", section: spatial,
    title: t("헤드셋이 없어도 읽히고, 있으면 방 안에 펼쳐집니다", "Readable without a headset, unfolding in the room with one"),
    takeaway: t("WebXR이 되는 환경에서만 3D를 준비하는 점진적 향상이며, 실제 헤드셋 검증은 아직 없습니다.", "A progressive enhancement that prepares 3D only where WebXR works; not yet verified on a real headset."),
    points: [t("감지 → 버튼 → 권한: 눌러야 기기 권한을 묻습니다", "Detect, press, then permission: the device is asked only on click"), t("닫으면 즉시 해제, 방과 카메라 위치는 저장하지 않음", "Closing releases at once; room and camera pose are never stored"), t("검증: 모의 세션 테스트와 2D 스모크, 실기기는 없음", "Verified by mock-session tests and a 2D smoke test, not on hardware")],
    flow: [t("WebXR 감지", "Detect WebXR"), t("버튼 클릭", "Button click"), t("세션 시작", "Start session"), t("닫기·해제", "Close and release")],
    script: t(
      "이 웹툰은 헤드셋이 없어도 끝까지 읽히고, 있으면 방 안에 펼쳐집니다. 점진적 향상이라서 WebXR이 되는 환경에서만 3D 런타임을 불러오고, 버튼을 눌러야 기기 권한을 묻고, 닫으면 곧바로 카메라·추적 권한을 풉니다. 방과 카메라 위치는 저장하지 않습니다(studio-webxr-session.ts). 솔직한 한계가 하나 있습니다. 세션 로직은 모의 세션 단위 테스트로, 2D 경로는 스모크 테스트로 확인했을 뿐 실제 헤드셋 검증은 없고, 저장소 문서도 헤드셋을 에뮬레이션하거나 인증하지 않는다고 적습니다. 이제 혼자가 아니라 함께 작업하는 이야기입니다.",
      "This webtoon reads to the end without a headset and unfolds in the room with one. As a progressive enhancement, the 3D runtime loads only where WebXR works, the device is asked for permission only after a button press, and closing releases camera and tracking permissions at once. The room and camera pose are never stored (studio-webxr-session.ts). There is one honest limit: the session logic is covered by mock-session unit tests and the 2D path by a smoke test, but there is no real-headset verification, and the repository's own document says it neither emulates nor certifies headset hardware. Next: working together rather than alone.",
    ),
    question: t("헤드셋 없는 사용자는 같은 작품을 어디까지 읽을 수 있나요?", "How far can a reader without a headset get in the same work?"), technologies: ["WebXR", "Three.js", "WebGL2"],
    atlasIds: ["webxr-spatial-webtoon"],
    demo: { href: "/read/spatial", action: t("공간 리더를 열어 2D 읽기 확인", "Open the spatial reader and read in 2D"), expected: t("헤드셋이 없어도 같은 작품이 2D로 읽히고, WebXR이 되는 환경에서만 입체 진입 단추가 보입니다.", "The same work reads in 2D without a headset; the immersive entry appears only where WebXR works."), fallback: t("도감의 WebXR 공간 웹툰 카드 도식으로 점진적 향상 흐름을 설명합니다.", "Explain the progressive-enhancement flow with the diagram of the WebXR spatial-webtoon atlas card.") },
  },
  {
    id: "seminar-collaboration", chapterId: "collaborative-crdt-boundary", section: ai,
    title: t("함께 보이는 것과, 같은 문서를 가진 것은 다릅니다", "Seeing each other is not the same as sharing the same document"),
    takeaway: t("커서·접속 상태, 편집 변경, 저장 확인을 별도 신호로 다룹니다.", "Treat presence, document updates and durable acknowledgement as separate signals."),
    points: [t("Presence: 누가 어디를 보고 있는가", "Presence: who is looking where"), t("CRDT: 지원되는 문서 변경을 어떻게 합치는가", "CRDT: how supported document changes merge"), t("권한·저장·재연결: 서버와 별도 검증", "Permissions, persistence and reconnection need separate verification")],
    flow: [t("편집 명령", "Edit command"), t("변경 전파", "Propagate update"), t("병합", "Merge"), t("저장 확인", "Persistence acknowledgement")],
    script: t(
      "서로의 커서가 움직이는 화면은 인상적이지만 그것만으로 공동 편집이나 저장 일관성이 증명되지는 않습니다. Yjs 같은 CRDT는 지원하는 변경을 병합해 주지만 이미지·3D 상태·권한은 해결하지 못합니다. 그래서 서버가 편집 권한과 변경 내용을 먼저 검사한 뒤에야 저장하고 전달합니다. 소켓은 로그인 쿠키 대신 60초짜리 입장권으로 들어가 15초마다 권한을 다시 확인받고, 문서 방은 30명까지입니다(studio-live-gateway-constants.ts). 큰 래스터는 CRDT에 넣지 않고 해시와 영수증으로 따로 둡니다. 이 장은 실험 단계입니다. 이제 이 연결 위의 통화를 봅니다.",
      "Moving cursors are impressive but do not prove co-editing or durable consistency. A CRDT such as Yjs merges the changes it supports, yet it does not solve images, 3D state or authorization. So the server checks edit rights and the change contents first, then stores and forwards. A socket joins with a 60-second ticket instead of the login cookie, is re-authorized every 15 seconds, and a document room holds 30 people (studio-live-gateway-constants.ts). Large rasters stay out of the CRDT and are referenced by hash and receipt. This chapter is experimental. Next: calls on top of this connection.",
    ),
    question: t("상대방에게 보인 변경이 서버에도 저장되었음을 어떻게 알 수 있나요?", "How do you know a change visible to a peer is also durably saved?"), technologies: ["Yjs", "CRDT", "Socket.IO", "State vector", "Document permissions"],
    atlasIds: ["yjs-crdt-document", "crdt-lock-revision", "socket-io-room-tickets", "durable-objects-realtime"],
  },
  {
    id: "seminar-webrtc", chapterId: "webrtc-media-authority", section: ai,
    title: t("대화 연결과 문서 동기화는 같은 연결이 아닙니다", "A call connection is not the document synchronization channel"),
    takeaway: t("WebRTC 미디어, 시그널링, 문서 저장의 성공 여부를 구분합니다.", "Distinguish media, signaling and document-persistence success."),
    points: [t("WebRTC: 오디오·비디오 등 실시간 통신", "WebRTC: real-time audio, video and related communication"), t("시그널링 세 겹: 방 서버는 입장·시작 신호, 통화 설정은 직통 레인", "Three signaling lanes: room server for entry, direct lane for call setup"), t("TURN 중계는 배선됐지만 운영 키는 미확인", "TURN relay is wired, but the production key is unconfirmed")],
    flow: [t("장치 권한", "Device permission"), t("시그널링", "Signaling"), t("미디어 연결", "Media connection"), t("해제·복구", "Release and recover")],
    script: t(
      "같은 방에 들어왔다고 음성이 연결된 것은 아닙니다. 방 서버는 소개소처럼 입장과 접속 상태, 화면 공유 신호, 직통 데이터 통로를 처음 여는 신호만 전하고, 허들의 통화 설정(SDP·ICE)과 채팅은 브라우저끼리 직통 레인(studio-direct-v1)으로만 오갑니다. 서버 음성 중계는 render.yaml에서 꺼져 있습니다. 직접 연결이 막히는 네트워크를 위한 TURN 단기 자격(4시간) 발급은 배선됐지만 운영 키 등록은 저장소로 확인할 수 없어 켜졌다고 말하지 않습니다. 허들 원격 참가자는 3명까지입니다. 다음은 이 연결 위에 얹은 걸어 다니는 공간입니다.",
      "Joining a room does not mean voice is connected. The room server acts like an introducer: it relays only entry and presence, screen-share signals and the signal that first opens a direct data channel. A huddle's call setup (SDP and ICE) and chat travel only over the browsers' direct lane (studio-direct-v1). Server voice relay is switched off in render.yaml. Issuing short-lived TURN credentials (four hours) for networks that block direct connections is wired, but registration of the production key cannot be confirmed from the repository, so we do not say it is on. A huddle allows three remote participants. Next: the walkable space layered on top of this connection.",
    ),
    question: t("방 입장 성공, 통화 성공, 저장 성공을 각각 어떻게 표시하나요?", "How are room entry, call connectivity and persistence reported independently?"), technologies: ["WebRTC", "RTCPeerConnection", "RTCDataChannel", "ICE", "STUN/TURN", "Cloudflare Realtime TURN"],
    atlasIds: ["webrtc-three-plane-signaling", "webrtc-datachannel-direct-lane", "webrtc-ice-turn-paths", "webrtc-mesh-limits"],
  },
  {
    id: "seminar-virtual-studio", chapterId: "virtual-studio-world-authority", section: ai,
    title: t("걸어 다니는 공간도, 진실은 서버가 하나만 쥡니다", "A walkable space still has exactly one source of truth: the server"),
    takeaway: t("월드 설계도는 서버가 확정하고, 브라우저는 해시로 다시 검증한 사본만 그립니다.", "The server commits the world blueprint; browsers draw only a copy they re-verified by hash."),
    points: [t("월드 설계도: 방·벽·문을 데이터 한 장으로", "World blueprint: rooms, walls and doors as one data file"), t("서버 확정·브라우저 검증: 기대 버전이 맞을 때만 새 판", "Server commit, browser verify: a new revision only if the expected one matches"), t("근접 규칙과 인원 사다리: 24 → 8 → 3", "Proximity rules and a headcount ladder: 24, 8, then 3")],
    flow: [t("월드 데이터", "World data"), t("서버 확정", "Server commit"), t("브라우저 검증", "Browser verify"), t("걷기·근접", "Walk and proximity")],
    script: t(
      "겉은 게임 마을이지만 속은 관리실이 설계도를 쥔 사무실 건물입니다. 방·벽·문은 월드 매니페스트 데이터이고, 서버는 ‘내가 본 판이 아직 최신일 때만’ 새 판을 쓰며(studio-world-publication.repository.ts) 어긋나면 거절합니다. 브라우저는 SHA-256을 다시 계산해 맞을 때만 읽습니다. 영상은 동의한 사람끼리 168px 안에서 붙고 216px 밖에서 끊깁니다. 160/220px 인사 규칙은 코드와 테스트만 있고 화면에는 연결돼 있지 않습니다. 정원은 공간 상수 24, 직접 메시 8, 영상 3 중 가장 작은 3입니다. 이제 이 공간에도 들어오는 AI를 봅니다.",
      "It looks like a game village but is really an office building whose management office holds the blueprint. Rooms, walls and doors are world-manifest data; the server writes a new revision only if the one you saw is still the latest (studio-world-publication.repository.ts) and rejects anything else. The browser recomputes the SHA-256 and reads only on a match. Video attaches between consenting people within 168 px and detaches beyond 216 px. The 160/220 px greeting rule exists only in code and tests and is not wired to the screen. For headcount, the space constant is 24, the direct mesh 8 and video 3; the smallest, 3, is the real video capacity. Next: the AI that also enters this space.",
    ),
    question: t("‘24명 지원’이라고 말해도 될까요? 숫자마다 어느 층의 한도인가요?", "Can we say '24 people supported'? Which layer does each number belong to?"), technologies: ["Phaser 3", "RTCDataChannel", "Durable Objects", "NestJS", "Supabase PostgreSQL"],
    atlasIds: ["virtual-studio-architecture-overview", "world-authority-cas-projection", "proximity-video-capacity-chain", "space-is-not-permission"],
    demo: { href: "/studio/space", action: t("스튜디오 공간 열기 — 걷기와 근접 확인", "Open the studio space and check walking and proximity"), expected: t("아바타가 걷고, 가까운 동료와의 대화·영상은 동의 버튼을 눌러야 붙는 흐름을 확인합니다.", "Observe walking, and that chat and video with nearby teammates attach only after consent."), fallback: t("공간을 열 수 없으면 도감 카드 ‘Virtual Studio’의 도식으로 여섯 층을 설명합니다.", "If the space cannot open, explain the six layers with the diagram of the Virtual Studio atlas card.") },
  },
  {
    id: "seminar-ai-routing", chapterId: "free-ai-routing", section: ai,
    title: t("AI에게 맡기는 일과, 사람이 확정하는 일을 나눕니다", "Separate AI proposals from human approval"),
    takeaway: t("AI는 작업의 보조자입니다. 공급자 연결, 실패 처리와 결과 검수가 함께 필요합니다.", "AI assists the workflow; provider setup, failure handling and review are part of the feature."),
    points: [t("입력: 문맥·참조·허용된 데이터만 전달", "Input: send only relevant context, references and permitted data"), t("실행: 사용 가능한 공급자와 기능을 확인", "Execution: check available providers and capabilities"), t("결과: 미리보기 → 사람 검수 → 명시적 반영", "Output: preview, human review, then explicit application")],
    flow: [t("작업 의도", "Task intent"), t("공급자·기능 확인", "Provider and capability check"), t("AI 제안", "AI proposal"), t("검수·반영", "Review and apply")],
    script: t(
      "AI가 있다고 말하는 대신 무엇을 맡기는지 구체적으로 말합니다. 아이디어 정리, 참조 이미지 활용, 포즈나 영상 보조처럼 작업 단위가 먼저이고, 글 도구 결과는 제안으로 돌아와 작가가 비교하고 고릅니다. 호출 전에 하루 예산을 먼저 예약하는데 브라우저 장부는 경로별 하루 25회·64,000토큰입니다(free-ai-runtime-budget.ts). 한도 소진(402·429)이면 다음 무료 길로 넘어가지만 시간 초과나 5xx는 다시 보내지 않고, 유료 경로는 사용자가 허락해야만 씁니다. 서버 공유 무료 풀은 키와 운영 확인이 필요한 설정 필요 상태입니다. 서버 AI의 반대편, 기기 안 AI로 갑니다.",
      "Instead of saying AI exists, say what is delegated: organizing ideas, using reference images, assisting pose or video. The work unit comes first, and text-tool results return as proposals that the creator compares and chooses. The daily budget is reserved before the call; the browser ledger allows 25 requests and 64,000 tokens a day per route (free-ai-runtime-budget.ts). Definitive refusals (402, 429) move to the next free route, but timeouts and 5xx are never replayed, and paid routes need the user's approval. The shared server free pool needs keys and operator confirmation, so it is setup-required. Next: the opposite of server AI, on-device AI.",
    ),
    question: t("AI가 실패하거나 잘못된 결과를 주면 기존 작업은 안전한가요?", "Is existing work safe when AI fails or produces an unsuitable result?"), technologies: ["Provider adapters", "Capability checks", "Prompt context", "Human review"],
    atlasIds: ["free-first-ai-routing", "ambiguous-failure-no-retry", "byok-paid-approval-gate", "ai-proposal-not-commit"],
    demo: { href: "/product-tour?t=300&player=mp4#product-tour-video", action: t("5:00 AI 보조 구간 보기", "Open AI assistance at 5:00"), expected: t("AI가 개입하는 작업 흐름을 확인합니다. 실제 생성 가능 여부는 별도 공급자 상태로 확인합니다.", "Observe the AI-assisted workflow; check provider status separately for actual generation availability."), fallback: t("새 생성 요청 대신 기존 예시와 입력·검수 흐름을 설명합니다.", "Explain an existing example and its input/review flow without issuing a new generation request.") },
  },
  {
    id: "seminar-local-ai", chapterId: "browser-local-compute", section: ai,
    title: t("브라우저 안에서 AI를 실행하면 무엇이 달라질까요?", "What changes when AI runs inside the browser?"),
    takeaway: t("로컬 추론은 전송을 줄일 수 있지만 모델 준비, 메모리와 장치 성능을 요구합니다.", "Local inference can reduce data transfer, but requires model preparation, memory and device capacity."),
    points: [t("ONNX Runtime Web: 모델을 웹에서 실행하는 런타임", "ONNX Runtime Web: a runtime for executing models on the web"), t("MediaPipe·OpenCV: 비전 작업별 도구와 처리 경로", "MediaPipe and OpenCV: task-specific vision and processing paths"), t("로컬 기능과 서버 생성 AI는 다른 능력·비용·제약", "Local processing and remote generative AI have different capabilities, costs and constraints")],
    flow: [t("모델 준비", "Prepare model"), t("입력 전처리", "Preprocess input"), t("장치에서 추론", "Infer on device"), t("결과 후처리", "Postprocess result")],
    script: t(
      "채색·배경 제거·선 추출·4배 확대·화풍 변환, 이 5종은 모델 파일과 입력을 준비한 뒤 브라우저가 직접 추론합니다. 서버에 맡기면 호출마다 GPU 비용과 업로드 대기가 쌓이지만, 기기 안에서 돌리면 그림이 밖으로 나가지 않고 키도 한도도 필요 없습니다. 대신 재료를 미리 들여놓는 주방처럼 처음에 모델을 한 번 내려받아야 하고 기기 성능과 메모리가 그대로 제약이 됩니다. WebGPU가 되면 그 길을, 안 되면 느린 WASM 길을 씁니다. 글이나 이미지를 만들어 내는 큰 모델은 여전히 클라우드의 몫입니다. 숫자로 구체적으로 보겠습니다.",
      "Five features (colorizing, background removal, line extraction, 4x upscaling and style conversion) prepare model files and input, then infer directly in the browser. Sending work to a server accumulates GPU cost and upload waits on every call; running on the device keeps the picture local and needs no key or quota. The trade-off is that, like a kitchen stocked in advance, the model must be downloaded once first, and device speed and memory become the limits. With WebGPU it takes that path; without it, the slower WASM path. Large models that generate text or images remain a cloud matter. Next: the concrete numbers.",
    ),
    question: t("모델을 미리 내려받지 않은 새 기기에서도 같은 기능을 쓸 수 있나요?", "Will this capability work on a new device without a prepared model?"), technologies: ["ONNX Runtime Web", "MediaPipe Tasks Vision", "OpenCV.js", "WASM / WebGPU", "Model caching"],
    atlasIds: ["onnx-runtime-web-inference", "mediapipe-webcam-pose"],
  },
  {
    id: "seminar-on-device-ai", chapterId: "on-device-inference", section: ai,
    title: t("기기 안 AI: 기능 5종, 모델 파일 6개, 모두 해시로 고정", "On-device AI: five features, six model files, all hash-pinned"),
    takeaway: t("그림이 서버로 나가지 않는 기능 5종, 번역은 모델 배치가 필요합니다.", "Five features keep the picture on the device; translation needs a deployed model."),
    points: [t("ONNX Runtime Web: 5종·6개 파일, SHA-256이 다르면 거절", "ONNX Runtime Web: five features, six files, rejected if SHA-256 differs"), t("MediaPipe: 웹캠은 기기 안, 모델 파일은 Google 저장소", "MediaPipe: webcam stays on device, model files come from Google storage"), t("Transformers.js 번역: 약 123MB, 배치 전에는 사전·원문", "Transformers.js translation: about 123 MB; dictionary and original text until deployed")],
    flow: [t("첫 사용 때 모델 받기", "Download on first use"), t("SHA-256 대조", "Match SHA-256"), t("WebGPU → WASM", "WebGPU, else WASM"), t("결과를 캔버스로", "Return to the canvas")],
    script: t(
      "ONNX 기능은 5종이고 모델 파일은 6개, 합계 119,438,571바이트입니다. 가장 큰 채색 모델이 약 79MB라서 처음 켤 때 내려받는 비용이 큽니다. 받은 바이트의 SHA-256이 레지스트리 값과 다르면 세션을 열지 않습니다(studio-onnx-inference-provider.ts). 반면 MediaPipe 얼굴·포즈·손 모델은 Google 저장소에서 그대로 받아 해시 고정이 없습니다. 번역은 Transformers.js 모델 약 123MB를 배포에 배치해야 켜지는 설정 필요 상태이고, 모델 정확도를 비교한 평가 수치는 확인하지 못했습니다. 이어서 AI에 넣는 참고 자료의 권리를 봅니다.",
      "There are five ONNX features and six model files, 119,438,571 bytes in total. The largest, the colorizing model, is about 79 MB, so the first-use download is costly. If the SHA-256 of the downloaded bytes differs from the registry value, no session is opened (studio-onnx-inference-provider.ts). By contrast, the MediaPipe face, pose and hand models are fetched from Google storage as they are, with no hash pinning. Translation needs about 123 MB of Transformers.js model files placed in the deployment before it turns on, so it is setup-required, and no evaluation figures comparing model accuracy were found. Next: the rights behind reference material fed to AI.",
    ),
    question: t("모델 파일이 바뀌거나 손상되면 어떻게 알아챌까요?", "How would you notice a changed or corrupted model file?"), technologies: ["ONNX Runtime Web", "WebGPU", "WASM", "MediaPipe Tasks Vision", "Transformers.js", "OPUS-MT"],
    atlasIds: ["onnx-runtime-web-inference", "transformers-js-translation", "mediapipe-webcam-pose"],
  },
  {
    id: "seminar-references", chapterId: "licenses", section: ai,
    title: t("참고한 이미지와, 배포 가능한 자산은 다릅니다", "A useful reference is not automatically a distributable asset"),
    takeaway: t("기술 문서·생성 도구·자산 사이트를 역할과 사용 조건으로 구분합니다.", "Separate technical documentation, generation tools and asset sites by role and usage conditions."),
    points: [t("공식 문서: API와 제약을 이해하는 자료", "Official documentation: understand APIs and constraints"), t("생성 도구: 입력 권한과 결과 검수가 필요한 외부 서비스", "Generation tools: external services requiring input rights and output review"), t("자산 사이트: 파일별 라이선스·출처·호환성 확인", "Asset sites: check per-file licenses, provenance and compatibility")],
    flow: [t("참조 선택", "Choose reference"), t("권리·출처 확인", "Check rights and provenance"), t("생성·편집", "Generate or edit"), t("결과 기록", "Record the result")],
    script: t(
      "Poly Haven·ambientCG·Blender 문서처럼 참고할 곳과 OpenAI 이미지 생성·Adobe Firefly처럼 생성 기능을 주는 외부 도구는 역할이 다릅니다. 참고 링크가 서비스에 내장됐다는 뜻은 아니며 실제 연동은 구현 근거와 공급자 설정에서 따로 확인합니다. 다운로드 버튼이 있다고 재배포할 수 있는 것도 아닙니다. 출처, 파일별 조건, 작가 표시를 보고, 가져오는 자료마다 권리 영수증을 붙입니다. AI에 보내는 참고 이미지는 요청당 16장·장당 12MiB를 넘으면 유료 요청 전에 막히고(studio-ai-reference-images.ts) 쓸 권한도 필요하며, 기록은 프롬프트 원문 대신 해시를 남기고 서명이나 증명은 아닙니다. 이제 서비스 운영으로 넘어가 비용부터 봅니다.",
      "Reference sites such as Poly Haven, ambientCG and the Blender manual differ from external tools that provide generation, like OpenAI image generation or Adobe Firefly. A reference link does not mean an embedded integration; check actual integration in the implementation and provider settings. A download button is not a redistribution license: read the source, per-file terms and attribution, and attach a rights receipt to each imported item. Reference images sent to AI are stopped before a paid request beyond 16 per request or 12 MiB each (studio-ai-reference-images.ts) and also need permission; the record keeps a prompt hash instead of the prompt text, and it is a log, not a signature or proof. Next: operations, starting with cost.",
    ),
    question: t("이 자산을 어디서 얻었고, 작품에 어떻게 사용할 수 있는지 설명할 수 있나요?", "Can you explain where this asset came from and how it may be used?"), technologies: ["Poly Haven API", "Asset provenance", "Reference images", "License review", "Provider configuration"],
    atlasIds: ["image-generation-providers", "ai-provenance-rights", "rights-provenance-receipt"],
  },
  {
    id: "seminar-cost", chapterId: "cost-engineering", section: delivery,
    title: t("무료 우선 설계는, 비용이 생기는 지점을 드러내는 일입니다", "Free-first design makes cost boundaries explicit"),
    takeaway: t("정적 파일, API, 저장, 실시간 연결과 AI의 비용을 한 덩어리로 보지 않습니다.", "Separate the costs of static delivery, APIs, storage, realtime sessions and AI."),
    points: [t("정적 웹·API·실시간 경로를 배포 단위로 분리", "Separate static web, API and realtime deployment units"), t("쿼터·실패·대체 경로를 사용자 흐름과 연결", "Connect quotas, failure and fallback to the user journey"), t("운영 반영은 승인된 SHA와 검증 결과를 기준으로", "Release an approved SHA with its verification evidence")],
    flow: [t("기능 요청", "Capability request"), t("비용·쿼터 확인", "Check cost and quota"), t("승인된 실행", "Authorized execution"), t("측정·회수", "Measure and reclaim")],
    script: t(
      "무료 서비스를 조합했다고 운영 비용이 영원히 0이 되는 것은 아닙니다. 정적 파일, API, 데이터베이스, 실시간, AI 요청은 비용 곡선이 서로 다릅니다. 그래서 정적 화면은 Cloudflare가 곧장 내주고 Worker는 동적 요청만 먼저 받으며, API는 Render 무료 웹 서비스에 두고, 원장 DB는 Supabase PostgreSQL이 현재 권위이고 Neon은 legacy로 보존합니다. 무료의 대가는 콜드 스타트와 공급자가 바꿀 수 있는 한도입니다. 비용 최적화가 검증을 생략할 이유는 되지 않고, 배포는 승인한 커밋 하나만 올립니다. 이 무료 조합을 구체적으로 펼쳐 봅니다.",
      "Combining free services does not make operating cost zero forever. Static files, APIs, databases, realtime and AI requests follow different cost curves. So Cloudflare serves static screens directly and a Worker takes only dynamic requests first; the API runs on Render's free web service; and for the ledger database, Supabase PostgreSQL is the current authority with Neon preserved as legacy. The price of free is cold starts and limits a provider can change. Cost optimization is no reason to skip verification, and a release ships exactly one approved commit. Next: this free combination, spelled out.",
    ),
    question: t("사용자가 늘 때 가장 먼저 비용이나 한계에 도달하는 경로는 무엇인가요?", "Which path reaches a cost or capacity limit first as usage grows?"), technologies: ["Static assets", "Cloudflare", "Render", "Deployment units", "Quota / capability policy"],
    atlasIds: ["static-first-edge-gateway", "supabase-single-writer-authority", "manual-sha-release-gate", "release-order-expand-contract-rollback"],
  },
  {
    id: "seminar-free-infra", chapterId: "infrastructure", section: delivery,
    title: t("무료 한도는 기록한 날짜와 함께, 닿기 전에 멈춥니다", "Free limits come with a record date, and we stop before they bite"),
    takeaway: t("무료는 한도가 있는 조건이라, 호출 전에 예산을 예약하고 승인 없이는 유료로 넘기지 않습니다.", "Free is a limited condition: reserve budget before calls and never move to paid without approval."),
    points: [t("서비스마다 쓰임·한도·한도 시 동작을 표로 기록", "Each service recorded by use, limit and behavior at the limit"), t("예산 원장: 브라우저 하루 25회, 서버 사용자당 200회", "Budget ledgers: 25 a day in the browser, 200 per user on the server"), t("유료 전환·DB 이전은 자동이 아니라 사람이 승인", "Paid switches and database moves are approved by a person, never automatic")],
    flow: [t("한도 기록(날짜)", "Record the limit (dated)"), t("호출 전 예약", "Reserve before calling"), t("한도 앞에서 멈춤", "Stop at the limit"), t("승인된 승격", "Approved promotion")],
    script: t(
      "무료 한도는 공급자가 바꿀 수 있어서 기록한 날짜와 함께 말합니다. 예를 들어 Render 무료 웹 서비스는 15분 동안 요청이 없으면 잠들고 첫 응답에 약 1분이 걸린다고 DEPLOY.md에 적었습니다. Neon 무료 한도에 막혔을 때는 2026-09-26 사람의 승인으로 Supabase에서 빈 상태로 새로 시작했고 자동 전환은 없습니다. AI는 호출 전에 예산을 예약하며 브라우저 25회·64,000토큰, 서버 사용자당 200회·1,000,000토큰은 우리가 건 상한이지 공급자 한도가 아닙니다. 하루의 경계는 UTC입니다. 비용 다음은 사람, 곧 로그인입니다.",
      "Free limits can change on the provider's side, so we state them with the date they were recorded. For example, DEPLOY.md records that Render's free web service sleeps after 15 minutes without requests and the first response takes about a minute. When Neon's free quota blocked us, a person approved a fresh start on Supabase on 2026-09-26; nothing switched automatically. AI reserves its budget before each call: 25 requests and 64,000 tokens in the browser, 200 requests and 1,000,000 tokens per user on the server are our own ceilings, not provider limits. The day boundary is UTC. After cost comes people: login.",
    ),
    question: t("지금 무료 한도에 가장 먼저 닿을 곳은 어디이고, 닿으면 서비스는 어떻게 행동하나요?", "Which free limit would be hit first, and how does the service behave when it is?"), technologies: ["Cloudflare Static Assets", "Cloudflare Workers", "R2", "Render", "Supabase PostgreSQL", "Upstash Redis", "Neon"],
    atlasIds: ["quota-ledger-budget", "byok-paid-approval-gate", "federated-free-data-plane", "supabase-single-writer-authority"],
    demo: { href: "/about/technology/atlas#map-free-tier", action: t("무료로 세운 서비스 지도 보기", "Open the map of services built on free tiers"), expected: t("서비스마다 쓰임·기록된 한도·한도 시 동작이 날짜와 함께 표로 나옵니다.", "Each service appears with its use, recorded limit and behavior at the limit, with dates."), fallback: t("도감 카드 ‘Quota ledger’의 도식으로 호출 전 예약 흐름을 설명합니다.", "Explain the reserve-before-call flow with the diagram of the Quota ledger atlas card.") },
  },
  {
    id: "seminar-auth", chapterId: "authentication", section: delivery,
    title: t("로그인 성공 뒤에도, 작품의 접근 권한은 계속 확인합니다", "Authorization continues after a successful login"),
    takeaway: t("인증은 ‘누구인가’, 권한은 ‘이 작품에 무엇을 할 수 있는가’입니다.", "Authentication identifies a user; authorization determines what they may do to a work."),
    points: [t("OAuth·세션: 계정과 로그인 상태", "OAuth and sessions: identity and login state"), t("프로젝트 권한: 읽기·편집·공유 범위", "Project permissions: read, edit and sharing scope"), t("공유 링크·AI 전송·파일 반입도 권한 경계", "Shared links, AI transfers and file imports cross permission boundaries")],
    flow: [t("사용자 확인", "Identify user"), t("작품 권한 검사", "Authorize access"), t("작업 실행", "Execute action"), t("결과·기록", "Result and record")],
    script: t(
      "로그인을 했다고 모든 프로젝트를 읽거나 고칠 수 있는 것은 아닙니다. 화면에서 버튼을 숨기는 것과 서버에서 권한을 검사하는 것도 다릅니다. 로그인 상태는 세 겹으로 지킵니다. 세션 토큰에 버전 번호가 있어 로그아웃하면 이미 나간 토큰이 한꺼번에 무효가 되고, 변경 요청은 전용 헤더와 Origin·Fetch Metadata로 확인하며, 소셜 로그인 중간 쿠키는 공급자별 경로로 좁혀 10분만 둡니다. 파일 업로드와 외부 AI 전송은 데이터가 경계를 넘는 순간이라 따로 검토합니다. 발표는 샘플 계정으로 합니다. 로그인 이후의 생애주기로 이어집니다.",
      "A logged-in user cannot automatically read or edit every project. Hiding a button is not server-side authorization. The login state is protected in three layers. The session token carries a version number, so logging out invalidates already-issued tokens at once; state-changing requests are checked with a dedicated header, Origin and Fetch Metadata; and the intermediate social-login cookie is narrowed to a per-provider path and kept for only ten minutes. Uploads and external AI transfers are the moments data crosses a boundary, so they get their own review. Present with sample accounts. Next: the lifecycle after login.",
    ),
    question: t("버튼을 숨긴 것과 요청을 거부한 것을 각각 테스트하고 있나요?", "Do you test both hidden controls and rejected unauthorized requests?"), technologies: ["OAuth / OIDC", "Session", "Project authorization", "Input validation"],
    atlasIds: ["session-token-csrf-oauth-cookie", "socket-io-room-tickets"],
  },
  {
    id: "seminar-identity-share", chapterId: "social-identity-lifecycle", section: delivery,
    title: t("로그인은 생애주기, 공유는 유입과 개인정보의 계약입니다", "Login is a lifecycle; sharing is a contract on traffic and privacy"),
    takeaway: t("인증·세션·탈퇴를 분리하고, 공유는 한 payload에서 채널별 실패를 격리합니다.", "Separate provider auth, our session and withdrawal; isolate each share channel's failure."),
    points: [t("공급자 인증과 HttpOnly 자체 세션을 분리", "Provider authentication and our HttpOnly session are separate"), t("연결 해제·탈퇴·마지막 로그인 수단까지 생애주기", "Unlink, withdrawal and the last login method are part of the lifecycle"), t("공유: 채널 13종을 한 payload로, 취소는 오류가 아님", "Sharing: 13 channels from one payload; cancelling is not an error")],
    flow: [t("공급자 로그인", "Provider sign-in"), t("우리 세션 발급", "Issue our session"), t("연결·해제", "Link and unlink"), t("공유 payload → 채널", "Share payload to channel")],
    script: t(
      "소셜 로그인은 버튼이 아니라 계정의 생애주기입니다. Google·Apple·Kakao·Naver·GitHub는 공급자마다 검증 흐름이 다르고, state는 모든 코드 흐름에서, PKCE는 GitHub에서 확인한 뒤에야 우리 HttpOnly 세션을 발급합니다. Apple은 코드가 있어도 운영 활성 여부를 저장소로 확인할 수 없어 설정 필요로 말합니다. 공유는 정규화한 payload 하나에서 Web Share API를 먼저 쓰고, 채널 13종 중 하나가 실패해도 다른 경로를 막지 않습니다. 카카오 SDK는 필요할 때 무결성 검사(SRI)와 함께 불러옵니다. 공유 완료가 열람은 아닙니다. 다음은 공유되는 영상의 재생입니다.",
      "Social login is not a button but an account lifecycle. Google, Apple, Kakao, Naver and GitHub each verify differently: state is checked in every code flow and PKCE for GitHub before our HttpOnly session is issued. Apple has code, but whether it is active in production cannot be confirmed from the repository, so we call it setup-required. Sharing starts from one normalized payload, tries the Web Share API first, and a failure in one of the 13 channels never blocks another path. The Kakao SDK loads on demand with an integrity check (SRI). A completed share is not a view. Next: playing the video that gets shared.",
    ),
    question: t("로그인 수단을 해제하거나 공유를 취소하면 사용자의 작업은 어떻게 되나요?", "What happens to a user's work when a login method is unlinked or a share is cancelled?"), technologies: ["OAuth 2.0", "OpenID Connect", "PKCE", "Web Share API", "Clipboard API", "Open Graph", "Kakao SDK"],
    atlasIds: ["session-token-csrf-oauth-cookie"],
  },
  {
    id: "seminar-media", chapterId: "delivery", section: delivery,
    title: t("영상의 중간으로 이동하면, 모든 시계를 함께 옮겨야 합니다", "Seeking a video means moving every clock together"),
    takeaway: t("장면 프레임, 내레이션, BGM과 자막이 같은 시간 위치를 가리켜야 합니다.", "Scene frames, narration, music and captions must refer to the same position."),
    points: [t("Remotion: 시간으로부터 장면을 구성", "Remotion: derive scenes from time"), t("중간 재생: 최초 위치·오디오 준비·연속 요청의 순서", "Seeking: initial position, audio readiness and request ordering"), t("MP4: 호환 재생 경로와 위치를 유지한 복구", "MP4: compatible playback and position-preserving recovery")],
    flow: [t("사용자가 선택한 시간", "Requested time"), t("미디어 준비", "Prepare media"), t("같은 위치로 탐색", "Seek to one position"), t("재생·확인", "Play and verify")],
    script: t(
      "영상이 처음부터 잘 재생된다고 발표 준비가 끝난 것은 아닙니다. 8분 24초 제품 투어(product-tour-manifest.json)에서 3분 48초를 눌렀다가 1분 48초로 돌아가는 일이 흔한데, 화면만 옮겨 가고 오디오가 이전 위치에 남으면 청중은 설명과 다른 장면을 봅니다. 벽시계 여러 개를 같은 시각에 맞추는 일과 같습니다. 그래서 최초 마운트 위치, 마지막 탐색 요청, 재생 의도와 실제 준비 상태를 구분하고, 늦게 실패한 이전 play 요청이 새 탐색을 망치지 않게 합니다. 호환 MP4와 대본을 함께 두되 대체 재생은 같은 음향 믹싱을 보장하지 않습니다. 이제 발표 전 리허설입니다.",
      "A video that plays well from the start does not finish the preparation. In the 8:24 product tour (product-tour-manifest.json), presenters often jump to 3:48 and back to 1:48; if the picture moves but audio stays at the old position, the audience sees a scene that no longer matches the explanation. It is like setting several wall clocks to the same time. So the initial mount position, the latest seek request, playback intent and actual readiness are kept apart, and a late failure of an earlier play request must not spoil a newer seek. A compatible MP4 and a transcript are provided, but the fallback playback does not guarantee the same audio mixing. Next: the rehearsal before presenting.",
    ),
    question: t("‘재생 버튼을 눌렀다’ 대신 어떤 미디어 상태를 성공으로 확인할까요?", "Which media states prove success beyond merely clicking Play?"), technologies: ["Remotion Player", "HTMLMediaElement", "Metadata / seeking", "WebVTT", "Playback state machine"],
  },
  {
    id: "seminar-rehearsal", chapterId: "troubleshooting-evidence", section: delivery,
    title: t("데모는 성공 장면보다, 돌아올 경로를 먼저 준비합니다", "Prepare the way back before the live demonstration"),
    takeaway: t("발표 슬라이드, 실제 화면, 영상과 읽을 수 있는 설명을 같은 흐름으로 연결합니다.", "Connect slides, live UI, video and readable explanations into one route."),
    points: [t("발표 위치 링크와 새 탭 데모로 맥락 유지", "Preserve context with slide links and new-tab demos"), t("첫 재생·역방향·연속 탐색·일시정지를 확인", "Check cold playback, reverse and rapid seeking, and pause"), t("연결 실패 시 MP4·스토리보드·오프라인 발표본", "Use MP4, storyboards or the offline deck when a connection fails")],
    flow: [t("슬라이드에서 예고", "Set up the demo"), t("실제 동작", "Show behavior"), t("예상 결과 확인", "Check expected result"), t("같은 슬라이드로 복귀", "Return to the slide")],
    script: t(
      "데모를 열기 전에 청중에게 무엇을 볼지 한 문장으로 알려 줍니다. ‘3D 모델이 있다는 사실이 아니라 포즈와 구도가 같은 프로젝트에 이어지는 점을 보겠습니다’처럼 관찰 대상을 정합니다. 끝나면 새 기능을 계속 누르지 않고 준비한 슬라이드로 돌아옵니다. 이륙 전 점검표처럼 데모마다 실패했을 때 갈 대체 경로를 함께 적어 둡니다. 연결이 끊기면 MP4나 스토리보드, 오프라인 발표본을 씁니다. 오프라인 발표본은 텍스트 중심 백업이라 외부 링크와 새 AI 요청까지 보장하지는 않습니다. 그 준비를 증거로 바꾸는 방법을 봅니다.",
      "Before opening a demo, tell the audience in one sentence what to watch: not that a 3D model exists, but that pose and composition connect to the same project. Afterwards, return to the prepared slide instead of pressing more features. Like a pre-flight checklist, every demo is written down together with the fallback to use if it fails. When the connection drops, use the MP4, the storyboard or the offline deck. The offline deck is a text-oriented backup and does not guarantee external links or new AI requests. Next: turning that preparation into evidence.",
    ),
    question: t("인터넷이 끊겨도 핵심 설명을 이어갈 수 있나요?", "Can the core explanation continue without the network?"), technologies: ["Deep links", "Compatible MP4", "Storyboard", "Offline HTML", "Browser regression tests"],
  },
  {
    id: "seminar-quality", chapterId: "quality", section: delivery,
    title: t("좋은 데모를, 반복해서 확인할 수 있는 증거로 바꿉니다", "Turn a good demonstration into repeatable evidence"),
    takeaway: t("코드가 존재함, 테스트 통과, 브라우저 검증, 운영 반영은 서로 다른 상태입니다.", "Code existence, passing tests, browser verification and production deployment are different states."),
    points: [t("단위 테스트: 입력·경계값·실패 순서", "Unit tests: inputs, boundaries and failure ordering"), t("브라우저: 실제 조작·레이아웃·미디어 상태", "Browser tests: interactions, layout and media state"), t("운영: 배포 SHA·연결 설정·실제 환경 확인", "Production: release SHA, configuration and environment checks")],
    flow: [t("문제 재현", "Reproduce"), t("수정", "Fix"), t("회귀 검증", "Regression test"), t("검토 가능한 기록", "Reviewable evidence")],
    script: t(
      "‘테스트가 모두 초록’이라는 말에는 어떤 테스트를 어느 환경에서 돌렸는지가 붙어야 합니다. 병합을 막는 CI core는 직접 지정한 일부이고, 전체 테스트는 별도 진단 워크플로가 돌립니다. 그림 품질은 평균이 아니라 꼬리로 판정해 포인터 추가 처리 p95 8ms·p99 16.7ms를 합격 예산으로 둡니다(studio-brush-frame-budget-policy.ts). jsdom은 화면 배치와 오디오 디코딩을 재현하지 못하고, 브라우저에서 한 번 성공했다고 빠른 연속 요청까지 안전하다는 뜻도 아닙니다. 그래서 단위 테스트와 실제 브라우저 검증, 접근성 점검을 함께 남기고 실행하지 못한 범위를 적습니다. 이제 우리가 가져다 쓴 오픈소스 이야기입니다.",
      "A statement that all tests are green must say which tests ran in which environment. The CI core that blocks merges is a hand-picked subset, and the full suite runs in a separate diagnostic workflow. Drawing quality is judged on the tail, not the average: pointer-append p95 8 ms and p99 16.7 ms form the pass budget (studio-brush-frame-budget-policy.ts). jsdom reproduces neither visual layout nor real audio decoding, and one browser success does not prove safety under rapid, reordered requests. So unit tests, real browser checks and accessibility checks are kept together, and the scope that was not run is stated. Next: the open source we borrowed.",
    ),
    question: t("이 기능의 완료를 증명하는 최소한의 재현 절차는 무엇인가요?", "What is the smallest repeatable procedure that proves completion?"), technologies: ["Vitest", "Testing Library", "Playwright", "TypeScript", "ESLint", "CI evidence"],
    atlasIds: ["test-honesty-and-time-budget-isolation", "axe-a11y-matrix", "drawing-quality-gates", "module-boundary-ratchet"],
  },
  {
    id: "seminar-open-source", chapterId: "open-source", section: openWorld,
    title: t("오픈소스는 가져다 쓰고, 고쳐 쓰고, 기록합니다", "Open source is taken, patched and recorded"),
    takeaway: t("패치 7개와 포크 2개를 정확한 버전에 묶고, 고지는 손이 아니라 빌드가 만듭니다.", "Seven patches and two forks, pinned to exact versions; notices come from the build."),
    points: [t("pnpm 패치 7개: 3개는 unsafe-eval 없이 돌게 고침", "Seven pnpm patches; three make libraries run without unsafe-eval"), t("포크 2개: wgpu(피처 뒤)·braces(깊이 가드)", "Two forks: wgpu behind a feature, braces with a depth guard"), t("라이선스 고지는 빌드가 생성, 판단은 소유자 몫", "Notices are generated by the build; judgments belong to the owner")],
    flow: [t("가져오기", "Adopt"), t("정확한 버전에 고정", "Pin to exact versions"), t("고쳐 쓰기(패치·포크)", "Patch or fork"), t("고지·감사", "Notice and audit")],
    script: t(
      "오픈소스는 가져다 쓰는 것으로 끝나지 않습니다. pnpm 패치 7개 중 3개는 라이브러리의 문자열 코드 실행을 걷어 내거나 늦춰서, 보안 정책에 unsafe-eval을 열지 않고도 3D 불리언과 압축이 돌게 했습니다. 포크는 둘입니다. wgpu 29.0.4는 패치 1개를 toon-fabric 피처 뒤에만 두었고(crates/vendor/wgpu-toon), braces는 업스트림 수정이 없는 취약점 때문에 중첩 깊이 100 가드를 더한 사본(patches/braces)으로 바꿨습니다. 모두 정확한 버전에 묶여 업그레이드 때 다시 쓰며 상류 PR은 찾지 못했습니다. Mixbox는 CC BY-NC 4.0, Remotion은 자격 조건이 있는 자체 라이선스라는 사실만 말합니다. 다음은 참고한 제품들입니다.",
      "Open source does not end at using it. Of seven pnpm patches, three remove or defer string-code execution inside libraries so that 3D booleans and compression run without opening unsafe-eval in the security policy. There are two forks. wgpu 29.0.4 keeps one patch behind the toon-fabric feature only (crates/vendor/wgpu-toon), and braces was swapped for a copy with a nesting-depth guard of 100 (patches/braces) because a vulnerability has no upstream fix. All are pinned to exact versions and must be rewritten on upgrade, and no upstream PR from us was found. We state only the facts that Mixbox is CC BY-NC 4.0 and that Remotion has its own license with eligibility conditions. Next: the products we studied.",
    ),
    question: t("라이브러리를 올릴 때 패치와 고지는 누가 어떻게 다시 확인하나요?", "When a library is upgraded, who re-checks the patches and notices, and how?"), technologies: ["SPDX", "Manifold", "glTF Transform", "KTX2", "Vello", "Remotion", "Mixbox"],
    atlasIds: ["oss-pnpm-patches-no-unsafe-eval", "oss-fork-wgpu-toon", "oss-license-notice-pipeline", "oss-supply-chain-pinning"],
    demo: { href: "/about/technology/licenses", action: t("라이선스 인벤토리 보기", "Open the license inventory"), expected: t("그룹별 의무와 주의사항, 도구별 라이선스를 확인합니다.", "Review obligations and cautions by group and the license of each tool."), fallback: t("도감 카드 ‘Third-party notices’의 도식으로 고지 생성 흐름을 설명합니다.", "Explain the notice-generation flow with the diagram of the Third-party notices atlas card.") },
  },
  {
    id: "seminar-benchmark", chapterId: "product-intent", section: openWorld,
    title: t("벤치마크는 따라 만들기가 아니라, 배운 점의 기록입니다", "Benchmarking is a record of what was learned, not copying"),
    takeaway: t("공식 자료에서 사용자의 문제만 추출해 독립 구현하고, 우열·가격·점유율은 말하지 않습니다.", "Extract the user problem from official sources and build independently; no rank, price or share claims."),
    points: [t("영역별 지도: 배운 점·다르게 한 점·안 한 점", "A map by domain: what we learned, did differently and did not do"), t("clean-room: 공개 사양과 관찰 가능한 동작만 입력", "Clean-room: only public specs and observable behavior as input"), t("대체·동등 주장 금지, 가격·점유율은 조사하지 않음", "No replacement or parity claims; prices and share were not researched")],
    flow: [t("공개 근거 읽기", "Read public sources"), t("문제와 결과만 추출", "Extract problem and outcome"), t("독립 구현", "Implement independently"), t("검증 뒤에만 주장", "Claim only after verification")],
    script: t(
      "벤치마크는 따라 만들기가 아니라 배운 점의 기록입니다. 경쟁·참고 제품 지도는 그림, 3D, 협업 공간, 콘티, 웹툰 유통, 엔진, AI 같은 영역별로 저장소 문서에 적힌 관찰만 담았고 가격·점유율·우열은 조사하지 않았습니다. 규칙은 clean-room입니다. 공식 매뉴얼과 공개 사양에서 사용자가 풀려는 문제와 검증 가능한 결과만 뽑고, 상용 소스·프리셋 반입이나 디컴파일은 금지합니다(docs/studio-commercial-clean-room-radar-2026-07-28.md). 예컨대 Krita의 GPL 코어 코드는 참고만 하고 가져오지 않았고, Gather에서는 근접 대화와 전체 방송의 구분을 배웠습니다. 다음은 제품이 아니라 외부 API입니다.",
      "Benchmarking is not copying but a record of what was learned. The map of competitor and reference products covers domains such as drawing, 3D, collaborative spaces, storyboards, webtoon distribution, engines and AI, containing only observations written in repository documents; prices, market share and rank were not researched. The rule is clean-room: take only the user problem and a verifiable outcome from official manuals and public specifications, and never import commercial source or presets or decompile (docs/studio-commercial-clean-room-radar-2026-07-28.md). For example, Krita's GPL core code was consulted but not imported, and from Gather we learned to separate nearby conversation from room-wide broadcast. Next: not products but external APIs.",
    ),
    question: t("경쟁 제품의 기능을 보고 만들었다면, 어디까지가 참고이고 어디부터가 복제인가요?", "If a feature was built after seeing a competitor's, where does reference end and copying begin?"), technologies: ["Clip Studio Paint", "Krita", "Procreate", "Figma", "Gather", "WorkAdventure", "Blender"],
    atlasIds: ["virtual-studio-architecture-overview", "layer-panel-reorder-dnd", "hokusai-wasm-natural-media"],
    demo: { href: "/about/technology/atlas#map-competitors", action: t("경쟁·참고 제품 지도 보기", "Open the map of competitors and references"), expected: t("영역별로 무엇을 배웠고 무엇을 다르게 했으며 무엇을 하지 않았는지가 표로 나옵니다.", "Each domain shows what was learned, what was done differently and what was not done."), fallback: t("도감 카드 ‘Virtual Studio’의 비교 질문과 답변으로 같은 원칙을 설명합니다.", "Explain the same principle with the comparison question and answer on the Virtual Studio atlas card.") },
  },
  {
    id: "seminar-open-api", chapterId: "open-api-data", section: openWorld,
    title: t("외부 API는 한 관문으로만 빌리고, 권리 영수증을 붙입니다", "External APIs are borrowed through one gate, with a rights receipt"),
    takeaway: t("공급자가 많아도 화면은 같은 규칙(시간·크기·모양·권리)을 통과한 데이터만 받습니다.", "Whatever the provider, the UI gets only data that passed the same checks: time, size, shape and rights."),
    points: [t("자료 엔진 한 관문: 6초·2MiB·리디렉션 차단·모양 검사", "One engine gate: 6 s, 2 MiB, no redirects, shape check"), t("권리 게이트: 통과한 자료만 출처 영수증과 함께", "Rights gate: only items that pass, with a provenance receipt"), t("표지 프록시는 허용 호스트만, 개발자용 Open API는 선언 단계", "The cover proxy serves listed hosts only; the developer Open API is only declared")],
    flow: [t("요청", "Request"), t("관문: 제한·검사", "Gate: limits and checks"), t("권리·출처 영수증", "Rights and provenance"), t("화면 표시", "Display")],
    script: t(
      "화면은 외부 공공 API를 직접 부르지 않습니다. 서버의 자료 엔진 하나가 26개 공급자의 요청을 받아 6초 안에 못 오면 포기하고, 리디렉션을 막고, 2MiB가 넘는 응답은 버리고, 모양이 틀리면 ‘불러오지 못함’으로 알립니다. 공급자가 공개라고 해도 호스트와 형식, 우리 규칙을 모두 통과해야 영수증과 함께 올립니다. 작품 표지는 허용한 호스트만 서버가 대신 받고 환경변수 하나로 중계를 멈출 수 있습니다. 한도는 서버 한 대 메모리 기준입니다. 개발자에게 내놓은 Open API는 권한 범위 10개를 선언한 매니페스트까지이고 키 발급은 없습니다. 이제 AI와 만든 방식입니다.",
      "The UI never calls external public APIs directly. One server-side resource engine takes requests for 26 providers, gives up after 6 seconds, blocks redirects, drops responses over 2 MiB and reports a wrong shape as failed to load. Even if a provider says an item is public, it is published with a receipt only after the host, format and our rules all pass. Work covers are fetched by the server only from allowed hosts, and one environment variable can stop the relay. Limits are per server process memory. The Open API offered to developers is only a manifest declaring 10 scopes; key issuance does not exist. Next: how we built with AI.",
    ),
    question: t("공급자 API가 갑자기 응답 모양을 바꾸거나 장애가 나면 화면은 무엇을 보여 주나요?", "What does the UI show when a provider changes its response shape or fails?"), technologies: ["AbortController", "NestJS", "Poly Haven API", "Google Books API", "Wikimedia Commons", "R2"],
    atlasIds: ["resource-engine-one-contract", "rights-provenance-receipt", "cover-image-proxy-killswitch", "developer-open-api-manifest"],
    demo: { href: "/research/open-data", action: t("자료 데스크의 무료 공개 API 목록 보기", "Open the research desk's free public APIs"), expected: t("공급자별 자료와 권리 표시, 출처가 같은 형식으로 나옵니다.", "Items from each provider appear in one format with rights labels and sources."), fallback: t("도감 카드 ‘ResourceEngine’의 도식으로 관문 흐름을 설명합니다.", "Explain the gate flow with the diagram of the ResourceEngine atlas card.") },
  },
  {
    id: "seminar-skills", chapterId: "ai-assisted-engineering", section: aiDev,
    title: t("AI 개발 도구도, 작업 절차가 있어야 팀원이 됩니다", "AI development tools need an operating procedure"),
    takeaway: t("스킬은 작업 지침, MCP는 도구 연결, 테스트는 결과를 판정하는 근거입니다.", "Skills guide the task, MCP connects tools, and tests provide evidence about the result."),
    points: [t("AGENTS·스킬: 경계·순서·완료 기준 전달", "AGENTS and skills: boundaries, workflow and completion criteria"), t("도구 연결: 읽기·수정·배포 권한을 구분", "Tool connections: separate read, edit and deployment authority"), t("검증: 변경분·테스트·브라우저 증거를 리뷰", "Verification: review diffs, tests and browser evidence")],
    flow: [t("요구사항", "Requirements"), t("지침·도구", "Guidance and tools"), t("구현", "Implementation"), t("검증·리뷰", "Verification and review")],
    script: t(
      "스킬을 썼다는 말은 3D 엔진을 설치했다는 말과 다릅니다. 스킬은 자료를 어떤 순서로 읽고 구현하고 검증할지 알려 주는 작업 설명서이고, MCP는 필요한 도구를 연결하는 규약이며, 어느 쪽도 제품에 실리는 렌더링 라이브러리가 아닙니다. AI가 ‘다 했다’고 말해도 성공으로 치지 않고 실제 변경분, 테스트 결과, 브라우저 동작을 확인합니다. 신입 사원의 보고서를 검토하는 것과 같습니다. PR 병합과 운영 배포는 서로 다른 승인 단계입니다. AI 활용의 핵심은 생성 속도가 아니라 사람이 검토할 수 있는 증거를 남기는 것입니다. 그 규칙을 어디에 적었는지 봅니다.",
      "Using a skill is not installing a 3D engine. A skill is a work manual on what to read, implement and verify in which order, and MCP is a protocol for connecting the tools you need; neither is a rendering library shipped in the product. When an AI says it is done, that is not counted as success: the actual diff, test results and browser behavior are checked, like reviewing a new hire's report. Merging a PR and deploying to production are separate approval steps. The core of using AI is not generation speed but leaving evidence a person can review. Next: where those rules are written.",
    ),
    question: t("AI가 ‘완료’라고 말할 때, 사람이 확인할 수 있는 증거는 무엇인가요?", "When AI says a task is complete, what evidence can a person inspect?"), technologies: ["AGENTS.md", "Task skills", "MCP", "Git worktrees", "Vitest", "Playwright"],
    atlasIds: ["agents-md-single-policy", "agent-harness-verify-gates"],
  },
  {
    id: "seminar-ai-harness", chapterId: "ai-assisted-engineering", section: aiDev,
    title: t("AI에게도 규칙은 한 곳에, 확인은 사람과 같은 문으로", "One place for the rules, and AI passes the same gates as people"),
    takeaway: t("AGENTS.md가 단일 정책이고, AI의 ‘다 했어요’도 사람의 변경과 같은 검증 문을 지납니다.", "AGENTS.md is the single policy, and an AI's 'done' passes the same gates as a person's change."),
    points: [t("AGENTS.md 한 곳, 도구별 파일은 가리키기만", "One AGENTS.md; tool files only point to it"), t("harness:verify → 훅 → CI: AI도 같은 문을 통과", "harness:verify, hooks, CI: AI passes the same gates"), t("OpenWiki는 길잡이, 충돌하면 코드·테스트가 이김", "OpenWiki is a guide; code and tests win any conflict")],
    flow: [t("규칙(AGENTS.md)", "Rules (AGENTS.md)"), t("작업·검증(harness)", "Work and verify (harness)"), t("훅·CI", "Hooks and CI"), t("사람의 리뷰·승인", "Human review and approval")],
    script: t(
      "AI 도구가 여러 개라서 규칙을 도구마다 쓰면 금방 어긋납니다. 그래서 규칙은 AGENTS.md 한 곳에 두고 CLAUDE.md 같은 파일은 그곳을 가리키기만 합니다. 하네스는 필수 파일 19개의 연결을 확인하고, 작업자는 harness:verify를 돌리고, 훅과 CI가 같은 검사를 다시 합니다. 사실이 충돌하면 코드와 테스트가 먼저이고 OpenWiki는 코드를 찾아가는 길잡이입니다. 반복 작업용 loop 명령 파일 23개는 이름표일 뿐이고 실행 기록은 확인하지 못했습니다. 운영 배포는 늘 사람의 별도 승인입니다. 개발 속도나 결함률의 정량 효과는 측정하지 않았습니다. 이제 프런트와 백엔드를 어떻게 맞추는지 봅니다.",
      "With several AI tools, rules written per tool drift apart fast. So the rules live in one AGENTS.md and files such as CLAUDE.md only point to it. The harness checks the wiring of 19 required files, the worker runs harness:verify, and hooks and CI repeat the same checks. When facts conflict, code and tests win, and OpenWiki is only a guide to find the code. The 23 loop command files for repeated work are just name tags, and no execution record was found. Production deployment is always a person's separate approval. The quantitative effect on speed or defect rate was not measured. Next: how the front end and back end are lined up.",
    ),
    question: t("AI가 규칙을 어기거나 검사를 건너뛰면 무엇이 막아 주나요?", "If an AI breaks a rule or skips a check, what stops it?"), technologies: ["AGENTS.md", "MCP", "GitHub Actions", "Playwright", "Vitest", "ESLint"],
    atlasIds: ["agents-md-single-policy", "agent-harness-verify-gates", "openwiki-fact-precedence", "opencode-loop-commands"],
    demo: { href: "/about/technology/atlas#map-ai-dev", action: t("AI 개발 도구 지도 보기", "Open the map of AI development tools"), expected: t("규칙·검증·반복 실행 도구가 상태와 함께 한 표로 나옵니다.", "Rules, verification and repeat-run tools appear in one table with their status."), fallback: t("도감 카드 ‘agent-harness’의 도식으로 검증 문의 순서를 설명합니다.", "Explain the order of the verification gates with the diagram of the agent-harness atlas card.") },
  },
  {
    id: "seminar-build-alignment", chapterId: "architecture", section: aiDev,
    title: t("프런트와 백엔드가 어긋나지 않게, 절차와 코드가 함께 막습니다", "Keeping front end and back end in step takes both procedure and code"),
    takeaway: t("같은 SHA는 절차가 보증하고, 공유 계약·프로토콜 버전은 코드가 어긋남을 막으며 Node·pnpm 버전은 파일로 맞추되 막는 검사는 없습니다.", "A shared SHA is guaranteed by procedure; shared contracts and protocol versions are guarded by code, while Node and pnpm versions are pinned in files with no check that blocks a mismatch."),
    points: [t("승인 SHA 한 개만 배포(절차) — 번들·API 응답엔 SHA가 없음", "Only one approved SHA ships (procedure); bundles and API replies carry no SHA"), t("pnpm 11·Node 24.16+·--frozen-lockfile로 도구 고정", "pnpm 11, Node 24.16+ and --frozen-lockfile pin the tools"), t("공유 계약·프로토콜 버전 8, 어긋나면 거절", "Shared contracts and protocol version 8; mismatches are rejected")],
    flow: [t("SHA 승인(절차)", "Approve a SHA (procedure)"), t("도구·락파일 고정", "Pin tools and lockfile"), t("내용 해시 buildId", "Content-hash buildId"), t("어긋남은 거절·복구", "Reject or recover from skew")],
    script: t(
      "프런트와 백엔드가 다른 버전으로 만나면 사용자는 이상한 오류를 봅니다. 그래서 올릴 것을 하나로 정합니다. 승인한 40자리 main SHA 하나만 정적 웹과 Core API에 반영하고 배포 스크립트가 브랜치와 HEAD 일치를 확인하지만, 번들과 API 응답은 SHA를 말하지 않아 같은 SHA인지는 절차가 보증합니다. 도구는 pnpm 11, Node 24.16 이상, --frozen-lockfile로 맞추고 프런트는 내용 해시 buildId(12자)로 캐시를 구분합니다. 웹과 API가 @toonstudio/contracts를 함께 import하고 실시간 서버는 다른 프로토콜 버전(8)을 거절하며 사라진 청크는 한 번만 새로고침합니다. 마무리로 갑니다.",
      "When the front end and back end meet at different versions, users see strange errors. So first settle on a single thing to ship. Only one approved 40-character main SHA reaches the static web and the Core API and the deploy script checks the branch and that HEAD matches, but bundles and API responses do not state the SHA, so procedure guarantees it is the same one. Tools are aligned with pnpm 11, Node 24.16 or newer and --frozen-lockfile, and the front end tells caches apart with a content-hash buildId of 12 characters. Web and API import @toonstudio/contracts together, the realtime server rejects another protocol version (8), and a vanished chunk is reloaded only once. On to the wrap-up.",
    ),
    question: t("프런트는 새 버전인데 서버는 옛 버전이면(또는 반대면) 사용자는 무엇을 보게 되나요?", "If the front end is new and the server old, or the reverse, what does a user see?"), technologies: ["GitHub Actions", "Cloudflare Workers", "Render", "Service Worker", "TypeScript"],
    atlasIds: ["build-fingerprint-map", "shared-contract-patterns", "version-pin-layers", "version-skew-chunk-reload-recovery"],
  },
  {
    id: "seminar-close", chapterId: "delivery", section: wrapUp,
    title: t("가져갈 것은 라이브러리 목록보다, 경계를 나누는 방법입니다", "Take away the boundaries, not just the library list"),
    takeaway: t("빠른 입력, 안전한 원본, 명확한 실패, 사람이 검토할 수 있는 결과를 함께 설계합니다.", "Design responsive input, safe source data, explicit failure and reviewable output together."),
    points: [t("무엇이 원본이며 누가 확정하는가", "What is the source, and who commits it?"), t("어디까지 로컬이고 어디부터 연결이 필요한가", "What is local, and what requires a connection?"), t("실패와 대체 경로를 어떻게 확인하는가", "How are failures and fallback paths verified?")],
    flow: [t("사용자 문제", "User problem"), t("책임 구분", "Clear responsibilities"), t("작은 구현", "Small implementation"), t("반복 검증", "Repeatable verification")],
    script: t(
      "오늘은 한 컷을 만드는 과정에서 웹의 입력, 렌더링, 3D, 저장, 협업, AI와 외부 자산이 만나는 지점을 살펴봤습니다. 결론은 특정 라이브러리를 모두 도입하자가 아닙니다. 우리 제품에서 가장 먼저 지켜야 할 작업 하나와 그 원본을 정하는 것이 시작입니다. 질문에는 구현 경로, 실제 환경의 검증 결과, 아직 확인하지 못한 범위를 나눠 답하겠습니다. ‘구현했다’와 ‘제품에 연결됐다’를 구분해 말하는 것이 오늘의 약속이었습니다. 근거는 기술 도감과 공식 자료에 있습니다. 마지막으로 여러분의 서비스에서 가장 먼저 분리하고 싶은 책임 하나를 물어봅니다.",
      "Today we followed one panel through the points where web input, rendering, 3D, persistence, collaboration, AI and outside assets meet. The conclusion is not to adopt every library. Start by choosing one task your product must protect first and the source data it needs. Questions will be answered by separating the implementation path, verification in the real environment and the scope not yet checked. Distinguishing implemented from wired into the product was today's promise. The evidence is in the tech atlas and the official references. Finally, ask the audience which responsibility they would separate first in their own service.",
    ),
    question: t("우리 서비스에 내일부터 적용할 경계 하나는 무엇인가요?", "Which boundary would you apply to your service tomorrow?"), technologies: ["Local-first", "Document authority", "Explicit fallback", "Evidence-based delivery"],
    atlasIds: ["implemented-not-wired-modules"],
  },
] as const satisfies readonly SeminarLesson[];
