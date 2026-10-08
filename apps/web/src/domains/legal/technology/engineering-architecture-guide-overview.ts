import { t } from "./engineering-architecture-guide-kit";
import type { ArchitectureGuideOverview } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 맨 위 "한 장으로 보기". 12개 구간 전체를 한 도식으로 엮고, 구조를 지탱하는 원칙과 읽는 법을 담는다.
 * 도식의 색(tone)은 "누가 소유하는가"를 뜻한다: local=사용자 기기, edge=Cloudflare, server=서버·원장, ai=AI, external=외부.
 * 모든 설명은 구간 본문(`engineering-architecture-guide-runtime*.ts`, `-delivery*.ts`)이 코드·설정으로 확인한 내용의 요약이다.
 */
export const ARCHITECTURE_GUIDE_OVERVIEW: ArchitectureGuideOverview = {
  diagram: {
    id: "architecture-overview-diagram",
    kind: "graph",
    title: t("ToonStudio 한 장 지도", "ToonStudio on one map"),
    caption: t(
      "원본은 내 기기에, 화면은 Cloudflare 가 바로, 기록은 서버 원장 하나에 — 물건마다 주인이 정해져 있습니다.",
      "Sources live on your device, pages come straight from Cloudflare, records go to one server ledger: every kind of data has one owner.",
    ),
    alt: t(
      "사용자 브라우저가 화면과 API 를 요청하면 Cloudflare 가 정적 화면은 바로 돌려주고, 로그인·저장 같은 동적 요청만 Core API 로 전달합니다. Core API 는 서버 원장(PostgreSQL)과 비공개 파일 저장소에 기록하고 AI 공급자를 부릅니다. 접속 상태는 Cloudflare 의 실시간 방이, 통화는 사람 사이의 직통 통로가 맡고, 코드는 승인한 커밋만 사람이 수동으로 배포합니다.",
      "The browser asks Cloudflare for pages and API calls; static pages come straight back and only dynamic requests such as sign-in and saving are forwarded to the Core API. The Core API writes to the server ledger (PostgreSQL) and private file storage, and calls AI providers. Cloudflare realtime rooms carry presence, people call each other over a direct channel, and only approved commits are deployed, by hand.",
    ),
    nodes: [
      { id: "browser", label: t("브라우저 스튜디오", "Browser studio"), sub: t("그리기·3D·로컬 저장", "Drawing, 3D, local save"), tone: "local", at: [0, 1] },
      { id: "peer", label: t("함께 작업하는 사람", "Collaborator"), sub: t("공동 편집 · 직통 통화", "Co-editing, direct calls"), tone: "local", at: [0, 3] },
      { id: "edge", label: t("화면 배달", "Page delivery"), sub: t("Static Assets + Worker", "Static Assets + Worker"), tone: "edge", at: [1, 1] },
      { id: "rt", label: t("실시간 방", "Realtime rooms"), sub: t("Durable Objects", "Durable Objects"), tone: "edge", at: [1, 0] },
      { id: "api", label: t("Core API", "Core API"), sub: t("NestJS · 인증·권한", "NestJS, auth, permissions"), tone: "server", at: [2, 1] },
      { id: "db", label: t("서버 원장", "Server ledger"), sub: t("Supabase PostgreSQL", "Supabase PostgreSQL"), tone: "server", shape: "cylinder", at: [3, 0] },
      { id: "files", label: t("비공개 파일", "Private files"), sub: t("R2 · B2 · Supabase", "R2, B2, Supabase"), tone: "server", shape: "cylinder", at: [3, 1] },
      { id: "ai", label: t("AI 공급자", "AI providers"), sub: t("무료 우선 · 내 키", "Free first, your own key"), tone: "ai", shape: "cloud", at: [3, 2] },
      { id: "repo", label: t("코드 저장소", "Code repository"), sub: t("승인한 커밋만 수동 배포", "Only approved commits, by hand"), tone: "neutral", at: [1, 3] },
    ],
    edges: [
      { from: "browser", to: "edge", label: t("화면·API 요청", "Pages, API") },
      { from: "browser", to: "rt", both: true, style: "dashed", label: t("접속 상태", "Presence") },
      { from: "edge", to: "api", label: t("동적 요청만", "Dynamic only") },
      { from: "api", to: "db", label: t("기록·조회", "Read, write") },
      { from: "api", to: "files", label: t("큰 파일", "Large files") },
      { from: "api", to: "ai", style: "dashed", label: t("공유 풀", "Shared pool") },
      { from: "browser", to: "peer", both: true, style: "dashed", label: t("직통 통화", "Direct calls") },
      { from: "repo", to: "edge", style: "dashed", label: t("수동 배포", "Manual deploy") },
    ],
    groups: [
      { id: "devices", label: t("사용자 기기", "User devices"), tone: "local", nodeIds: ["browser", "peer"] },
      { id: "cloudflare", label: t("Cloudflare (전달 계층)", "Cloudflare (delivery layer)"), tone: "edge", nodeIds: ["edge", "rt"] },
      { id: "server", label: t("서버와 데이터", "Server and data"), tone: "server", nodeIds: ["api", "db", "files"] },
    ],
  },
  principles: [
    {
      title: t("원본은 내 기기, 서버는 원장만", "Sources on your device, a ledger on the server"),
      body: t(
        "작업 원본은 OPFS·SQLite 에 두고, 서버는 계정·권한·거래처럼 여럿이 함께 믿어야 하는 기록만 맡습니다.",
        "Working sources stay in OPFS and SQLite; the server keeps only what many people must trust together: accounts, permissions and transactions.",
      ),
    },
    {
      title: t("정적은 곧장, 계산은 필요할 때만", "Static straight through, compute only when needed"),
      body: t(
        "화면 파일은 Cloudflare 가 바로 내주고, Worker 는 지정한 경로에서만, 서버는 동적 요청에만 깨어나 무료 플랜의 한도를 아낍니다.",
        "Cloudflare serves page files directly; the Worker runs only on listed paths and the server wakes only for dynamic requests, which saves free-plan limits.",
      ),
    },
    {
      title: t("쓰기 권위는 하나, 몰래 갈아타지 않기", "One write authority, no silent switching"),
      body: t(
        "데이터마다 쓰기 권위를 하나만 두고, GPU·DB 가 막혀도 슬쩍 다른 것으로 바꾸지 않고 알립니다. AI 도 애매한 실패는 다시 보내지 않습니다.",
        "Each kind of data has one write authority; when a GPU or database is blocked the app says so instead of quietly switching, and AI never resends an ambiguous failure.",
      ),
    },
    {
      title: t("AI 는 제안만, 확정은 사람이", "AI proposes, people decide"),
      body: t(
        "AI 결과는 제안으로 돌아오고, 호출 전에 예산을 예약하며, 유료 길은 사용자가 허락해야 열립니다.",
        "AI results come back as proposals, budget is reserved before each call, and paid routes open only when the user allows them.",
      ),
    },
    {
      title: t("지키는 일은 문서가 아니라 검사가", "Checks guard it, not documents"),
      body: t(
        "경계·접근성·번들 예산은 테스트와 래칫이 지키고, 배포는 승인한 커밋 하나를 사람이 올립니다.",
        "Boundaries, accessibility and bundle budgets are held by tests and ratchets, and a person ships exactly one approved commit.",
      ),
    },
    {
      title: t("확인한 것만 말한다", "Say only what was verified"),
      body: t(
        "상태 배지는 코드·설정으로 확인한 현재 상태이고, 운영에서 확인하지 못한 것은 그렇다고 적었습니다.",
        "Status badges show what code and configuration confirm today, and anything not confirmed in production is marked as such.",
      ),
    },
  ],
  howToRead: [
    t(
      "도식을 먼저 보고 → 한 줄 요약 → '쉽게 말해' → 흐름 단계 순으로 읽으면 비전문가도 구조가 그려집니다.",
      "Read the diagram first, then the one-line summary, the plain-words box and the flow steps; the structure takes shape even without a technical background.",
    ),
    t(
      "도식의 색은 '누가 소유하는가'를 뜻합니다. 도식 바로 아래의 범례를 함께 보세요.",
      "Diagram colors show who owns what. Keep the legend right below the diagram in view while you read.",
    ),
    t(
      "개발자는 구간마다 '더 깊이'를 펼쳐 배경 지식, 쓰인 파일 경로, 선택과 대가를 확인하세요.",
      "Developers can open 'Go deeper' in each section for background, the files that implement it, and the choices with their costs.",
    ),
    t(
      "더 깊은 근거는 구간 아래의 기술 도감 카드, 제작 스토리 챕터, 용어집 링크로 이어집니다.",
      "Deeper evidence is one click away through the tech atlas cards, story chapters and glossary links under each section.",
    ),
  ],
};

/** 구간 본문의 수치와 경로를 코드·설정으로 마지막으로 확인한 날짜(화면의 "확인 기준일"). */
export const ARCHITECTURE_GUIDE_REVIEWED_AT = "2026-10-08";
