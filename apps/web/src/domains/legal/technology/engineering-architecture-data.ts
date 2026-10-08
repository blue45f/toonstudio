import type { LocalizedText } from "./engineering-story-content";

/**
 * 아키텍처 도식(`EngineeringArchitectureDiagram`)의 데이터. 화면 도식과 오프라인 발표본의 글 개요가 같은 원본을 쓴다.
 * 컴포넌트 파일에는 컴포넌트만 두기 위해(Fast Refresh) 데이터와 개요 함수를 이 파일로 분리했다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export type ZoneTone = "local" | "edge" | "server";

export interface ArchitectureBox {
  readonly id: string;
  readonly title: LocalizedText;
  readonly lines: readonly LocalizedText[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ArchitectureZone {
  readonly id: string;
  readonly tone: ZoneTone;
  readonly title: LocalizedText;
  readonly caption?: LocalizedText;
  readonly x: number;
  readonly width: number;
  readonly boxes: readonly ArchitectureBox[];
}

/**
 * 운영 구조의 정본은 DEPLOY.md·render.yaml·deploy/cloudflare-realtime/wrangler.jsonc이다.
 * 이 도식은 그 내용을 발표용으로 요약하며, 값이나 공급자를 새로 추가하지 않는다.
 */
export const ARCHITECTURE_ZONES: readonly ArchitectureZone[] = [
  {
    id: "browser",
    tone: "local",
    title: t("사용자 브라우저 · 로컬 우선", "User's browser · local-first"),
    caption: t("React 19 SPA · Vite", "React 19 SPA · Vite"),
    x: 12,
    width: 452,
    boxes: [
      { id: "drawing", title: t("드로잉 엔진", "Drawing engine"), lines: [t("Canvas · WebGPU", "Canvas · WebGPU"), t("Rust / WASM", "Rust / WASM")], x: 32, y: 98, width: 200, height: 96 },
      { id: "three", title: t("3D · 캐릭터", "3D · characters"), lines: [t("three.js · R3F", "three.js · R3F"), t("VRM 뼈대", "VRM skeleton")], x: 244, y: 98, width: 200, height: 96 },
      { id: "space", title: t("가상 스튜디오", "Virtual studio"), lines: [t("Phaser 2D 공간", "Phaser 2D space"), t("근접 반응", "Proximity")], x: 32, y: 206, width: 200, height: 96 },
      { id: "collab", title: t("협업 문서", "Shared document"), lines: [t("Yjs CRDT", "Yjs CRDT"), t("의미 연산 병합", "Semantic merges")], x: 244, y: 206, width: 200, height: 96 },
      { id: "local", title: t("로컬 원본", "Local sources"), lines: [t("OPFS", "OPFS"), t("SQLite WASM", "SQLite WASM")], x: 32, y: 314, width: 200, height: 96 },
      { id: "worker", title: t("실행 계층", "Execution layer"), lines: [t("Web Worker", "Web Worker"), t("Service Worker", "Service Worker")], x: 244, y: 314, width: 200, height: 96 },
    ],
  },
  {
    id: "edge",
    tone: "edge",
    title: t("Cloudflare 엣지", "Cloudflare edge"),
    x: 528,
    width: 300,
    boxes: [
      { id: "static", title: t("Static Assets + Worker", "Static Assets + Worker"), lines: [t("SPA를 직접 제공", "Serves the SPA directly"), t("API·Socket.IO만 전달", "Forwards only API · Socket.IO")], x: 548, y: 98, width: 260, height: 150 },
      { id: "realtime", title: t("Durable Objects", "Durable Objects"), lines: [t("접속 상태·시그널링", "Presence · signaling"), t("API 발급 티켓으로 입장", "Joined with API tickets")], x: 548, y: 290, width: 260, height: 150 },
    ],
  },
  {
    id: "server",
    tone: "server",
    title: t("서버 원장", "Server ledger"),
    x: 892,
    width: 296,
    boxes: [
      { id: "core", title: t("Render · Core API", "Render · Core API"), lines: [t("NestJS 11 · Socket.IO", "NestJS 11 · Socket.IO"), t("인증·권한·원장", "Auth · permissions · ledger")], x: 912, y: 98, width: 256, height: 150 },
      // 운영 원장은 Supabase PostgreSQL이고 Neon은 legacy 보존이다(docs/operations/canonical-database-topology.md, 기준일 2026-09-29).
      { id: "db", title: t("PostgreSQL (Supabase)", "PostgreSQL (Supabase)"), lines: [t("Drizzle · 마이그레이션 원장", "Drizzle · migration ledger"), t("Neon은 legacy 보존", "Neon kept as legacy")], x: 912, y: 276, width: 256, height: 92 },
      { id: "files", title: t("비공개 파일 저장소", "Private file storage"), lines: [t("R2 · B2 · Supabase", "R2 · B2 · Supabase")], x: 912, y: 390, width: 256, height: 92 },
    ],
  },
];

/** 좁은 화면·스크린 리더용 목록의 안내 문장. 오프라인 발표본(`architectureOutline`)도 같은 문장을 쓴다. */
export const ARCHITECTURE_LIST_NOTES: readonly LocalizedText[] = [
  t(
    "연결: 브라우저 → Cloudflare(HTTPS) → Core API · 브라우저 ↔ Durable Objects(WSS) · Core API → PostgreSQL·파일 저장소 · 음성·영상은 브라우저 간 WebRTC로 직접 연결하며 서버에 저장하지 않습니다.",
    "Connections: browser → Cloudflare (HTTPS) → Core API · browser ↔ Durable Objects (WSS) · Core API → PostgreSQL and file storage · voice and video connect browser to browser over WebRTC and are never stored on servers.",
  ),
  t(
    "모노레포 실제 구성(apps 7 · packages 13): 앱은 web·admin-web·api·mobile·desktop-sync·brush-lab·character-lab, 패키지는 contracts·core·play-core·product-tour-film과 studio 접두사 9개(brush-platform·command-registry·engine-registry·engine-skia·engine-thorvg·engine-vello·format-gateway·hokusai-wasm·project-model)입니다. 위 도식은 이 중 web 앱이 실행될 때의 런타임 경계만 그린 것입니다.",
    "Actual monorepo layout (7 apps · 13 packages): apps are web, admin-web, api, mobile, desktop-sync, brush-lab and character-lab; packages are contracts, core, play-core, product-tour-film and nine studio-prefixed packages (brush-platform, command-registry, engine-registry, engine-skia, engine-thorvg, engine-vello, format-gateway, hokusai-wasm, project-model). The diagram above draws only the runtime boundaries of the web app.",
  ),
];

export const ARCHITECTURE_P2P_NOTE = {
  title: t("음성·영상 · WebRTC P2P", "Voice & video · WebRTC P2P"),
  line: t("브라우저끼리 직접 연결 · 서버에 저장하지 않음", "Browser to browser · never stored on servers"),
} as const;

export const ARCHITECTURE_EDGE_NOTE = t("정적 트래픽은 API 서버를 깨우지 않음", "Static traffic never wakes the API");

export interface ArchitectureOutline {
  readonly zones: readonly {
    readonly title: string;
    readonly caption?: string;
    readonly boxes: readonly { readonly title: string; readonly detail: string }[];
  }[];
  /** 영역 밖에 따로 그려진 보조 문장(P2P·정적 트래픽 등). */
  readonly notes: readonly string[];
}

/** 도식을 그릴 수 없는 곳(오프라인 발표본)에서 같은 데이터를 글로 보여 주기 위한 개요. */
export function architectureOutline(localize: (value: LocalizedText) => string): ArchitectureOutline {
  return {
    zones: ARCHITECTURE_ZONES.map((zone) => ({
      title: localize(zone.title),
      caption: zone.caption ? localize(zone.caption) : undefined,
      boxes: zone.boxes.map((box) => ({ title: localize(box.title), detail: box.lines.map(localize).join(" · ") })),
    })),
    notes: [
      `${localize(ARCHITECTURE_P2P_NOTE.title)}: ${localize(ARCHITECTURE_P2P_NOTE.line)}`,
      localize(ARCHITECTURE_EDGE_NOTE),
      ...ARCHITECTURE_LIST_NOTES.map(localize),
    ],
  };
}
