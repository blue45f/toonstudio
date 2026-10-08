import type { EngineeringDiagram } from "./engineering-diagram-types";

/** 도식 렌더러·검증기 테스트와 시각 점검용 기준 도식. 실제 콘텐츠가 아니라 계약을 보여주는 예시다. */

export const FIXTURE_GRAPH: EngineeringDiagram = {
  id: "fixture-local-first-write",
  kind: "graph",
  title: { ko: "로컬 우선 저장 흐름", en: "Local-first write path" },
  caption: { ko: "편집은 기기 안에서 끝나고, 서버는 나중에 따라옵니다.", en: "Editing finishes on the device; the server follows later." },
  alt: {
    ko: "편집 명령이 Worker를 거쳐 OPFS에 기록되고 SQLite WASM이 색인을 만듭니다. 마지막에 내보내기나 개인 클라우드로 백업합니다.",
    en: "An edit command goes through a Worker into OPFS, SQLite WASM builds an index, and export or personal-cloud backup comes last.",
  },
  nodes: [
    { id: "edit", label: { ko: "편집 명령", en: "Edit command" }, tone: "local", shape: "pill", at: [0, 0] },
    { id: "worker", label: { ko: "Worker", en: "Worker" }, sub: { ko: "Dedicated Worker", en: "Dedicated Worker" }, tone: "local", at: [1, 0] },
    { id: "opfs", label: { ko: "OPFS", en: "OPFS" }, sub: { ko: "원본 레이어·타일", en: "Layers and tiles" }, tone: "local", shape: "cylinder", at: [2, 0] },
    { id: "sqlite", label: { ko: "SQLite WASM", en: "SQLite WASM" }, sub: { ko: "검색용 색인", en: "Search index" }, tone: "local", shape: "cylinder", at: [3, 0] },
    { id: "backup", label: { ko: "개인 클라우드", en: "Personal cloud" }, sub: { ko: "선택 백업", en: "Optional backup" }, tone: "external", shape: "cloud", at: [4, 0] },
    { id: "sw", label: { ko: "Service Worker", en: "Service Worker" }, sub: { ko: "앱 셸 복구", en: "App-shell recovery" }, tone: "edge", at: [1, 1] },
  ],
  edges: [
    { from: "edit", to: "worker", label: { ko: "명령", en: "command" } },
    { from: "worker", to: "opfs", label: { ko: "기록", en: "write" } },
    { from: "opfs", to: "sqlite", label: { ko: "색인", en: "index" } },
    { from: "sqlite", to: "backup", style: "dashed", label: { ko: "내보내기", en: "export" } },
    { from: "worker", to: "sw", style: "dashed", both: true },
    { from: "sqlite", to: "edit", style: "dashed", label: { ko: "재열기", en: "reopen" } },
  ],
  groups: [
    { id: "device", label: { ko: "사용자 기기", en: "User's device" }, tone: "local", nodeIds: ["edit", "worker", "opfs", "sqlite", "sw"] },
  ],
};

export const FIXTURE_SEQUENCE: EngineeringDiagram = {
  id: "fixture-huddle-signaling",
  kind: "sequence",
  title: { ko: "허들 연결 시그널링", en: "Huddle signaling" },
  caption: { ko: "서버는 연결을 소개만 하고 미디어는 브라우저끼리 흐릅니다.", en: "The server only introduces peers; media flows browser to browser." },
  alt: {
    ko: "A가 티켓으로 방에 들어가 오퍼를 보내면 서버가 B에게 전달하고, B의 응답과 ICE 후보를 교환한 뒤 직접 연결됩니다.",
    en: "A joins with a ticket and sends an offer, the server relays it to B, they exchange answer and ICE candidates, then connect directly.",
  },
  actors: [
    { id: "a", label: { ko: "브라우저 A", en: "Browser A" }, tone: "local" },
    { id: "room", label: { ko: "시그널링 방", en: "Signaling room" }, sub: { ko: "Durable Objects", en: "Durable Objects" }, tone: "edge" },
    { id: "b", label: { ko: "브라우저 B", en: "Browser B" }, tone: "local" },
  ],
  messages: [
    { from: "a", to: "room", label: { ko: "티켓으로 입장", en: "Join with ticket" } },
    { from: "a", to: "room", label: { ko: "오퍼(SDP)", en: "Offer (SDP)" }, note: { ko: "미디어 설명서", en: "Media description" } },
    { from: "room", to: "b", label: { ko: "오퍼 전달", en: "Relay offer" }, style: "dashed" },
    { from: "b", to: "b", label: { ko: "답변 만들기", en: "Create answer" } },
    { from: "b", to: "a", label: { ko: "직접 미디어 연결", en: "Direct media link" }, note: { ko: "WebRTC P2P", en: "WebRTC P2P" } },
  ],
};

export const FIXTURE_LAYERS: EngineeringDiagram = {
  id: "fixture-free-tier-map",
  kind: "layers",
  title: { ko: "요청이 지나는 무료 계층", en: "Free layers a request crosses" },
  caption: { ko: "위에서 아래로 갈수록 비용과 책임이 커집니다.", en: "Cost and responsibility grow toward the bottom." },
  alt: {
    ko: "브라우저, Cloudflare 정적 서빙, Render API, Neon 데이터베이스 순으로 요청이 내려갑니다.",
    en: "A request descends from the browser through Cloudflare static serving and the Render API to the Neon database.",
  },
  layers: [
    { id: "browser", label: { ko: "브라우저", en: "Browser" }, sub: { ko: "원본은 여기에", en: "Sources live here" }, tone: "local", chips: ["OPFS", "Worker", "WASM"] },
    { id: "edge", label: { ko: "Cloudflare", en: "Cloudflare" }, sub: { ko: "정적 서빙·실시간", en: "Static serving and realtime" }, tone: "edge", chips: ["Static Assets", "Durable Objects"] },
    { id: "api", label: { ko: "Render Core API", en: "Render Core API" }, sub: { ko: "인증·권한·원장", en: "Auth, permissions, ledger" }, tone: "server", chips: ["NestJS"] },
    { id: "db", label: { ko: "Neon PostgreSQL", en: "Neon PostgreSQL" }, sub: { ko: "동적 데이터", en: "Dynamic data" }, tone: "server", chips: ["Drizzle"] },
  ],
  brackets: [{ label: { ko: "무료 플랜 · 수동 배포", en: "Free plans · manual release" }, layerIds: ["edge", "api", "db"] }],
};
