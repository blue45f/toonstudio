import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 1: 전체 지도 · Godot 무대 수명주기 · 임베드 상태와 렌더 품질 · 월드 데이터.
 * 경로·수치는 2026-10-12 기준 코드에서 직접 확인한 값이다. 초기 Phaser 구현은
 * 2026-10 Godot 무대로 교체됐고, 이 파일의 카드는 모두 Godot 체제의 사실을 서술한다.
 */

const V = "apps/web/src/domains/creator/virtual-space";

export const VIRTUAL_SPACE_CORE_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "virtual-studio-architecture-overview",
    category: "virtual-space",
    name: "Virtual Studio",
    title: t("Godot 무대와 웹 셸로 나뉜 협업 공간의 전체 지도", "The whole map of a collaboration space split into a Godot stage and a web shell"),
    status: "live",
    tagline: t(
      "공간은 Godot 무대가 그리고, 계정·채팅·업무 패널은 웹 셸이 맡습니다.",
      "The Godot stage draws the space; the web shell owns accounts, chat and work panels.",
    ),
    background: [
      t(
        "가상 스튜디오는 팀원이 아바타로 공간을 걸어 다니며 가까워지면 만나고 대화하는 협업 공간입니다. 지금의 공간은 두 부분으로 나뉩니다. 걷고 만나는 무대 자체는 Godot 엔진으로 만든 빌드이고, 웹 페이지는 그 무대를 iframe으로 품은 셸입니다. 셸이 계정 세션과 티켓 발급, 채팅과 회의·배치 같은 업무 패널, 한글 입력을 맡고, 무대는 공간 렌더와 이동, 구역 판정을 맡습니다.",
        "The virtual studio is a collaboration space where teammates walk around as avatars and meet and talk when they get close. The space now has two parts. The stage you walk and meet in is a build made with the Godot engine, and the web page is a shell that holds that stage in an iframe. The shell owns the account session and ticket issuing, chat and work panels such as meetings and layout, and Korean text input, while the stage owns spatial rendering, movement and zone decisions.",
      ),
      t(
        "두 부분은 브리지 메시지로만 대화합니다. 무대에서 셸로는 window.__tsvsHost 콜백으로 준비 완료, 연결 상태, 구역 변화, 근접 변화 같은 통지가 오고, 셸에서 무대로는 iframe 전역 콜백으로 세션 주입, 가시성, 신호 중계, 말풍선과 이모트 표시를 보냅니다. 어느 쪽도 상대의 내부 상태를 직접 만지지 않으므로, 무대를 교체해도 셸의 계정·업무 기능은 그대로 남습니다.",
        "The two parts talk only through bridge messages. From the stage to the shell, notifications such as ready, connection state, zone changes and proximity changes arrive through the window.__tsvsHost callbacks, and from the shell to the stage, session injection, visibility, signal relay, bubbles and emotes go through iframe global callbacks. Neither side touches the other's internals, so replacing the stage leaves the shell's account and work features untouched.",
      ),
      t(
        "월드 데이터의 진실은 여전히 서버가 갖습니다. 공간 정의는 정적 기본값에서 시작해 작품별 저장본이 있으면 그것이 우선하고, 월드 발행은 기대 리비전을 확인하는 CAS 방식으로 리비전과 콘텐츠 해시를 기록합니다. 초기 Phaser 구현은 2026-10 Godot로 교체됐고, 걷기·충돌·카메라를 웹 캔버스가 그리던 구조는 사라졌습니다. 남은 웹 모듈은 프레즌스 프로토콜과 월드 매니페스트처럼 무대와 독립적인 계약을 다룹니다.",
        "The server still owns the truth of world data. A space definition starts from a static default, a per-work saved layout wins when one exists, and world publication records a revision and a content hash through a CAS check of the expected revision. The early Phaser implementation was replaced by Godot in 2026-10, and the structure where a web canvas drew walking, collisions and the camera is gone. The remaining web modules cover stage-independent contracts such as the presence protocol and the world manifest.",
      ),
      t(
        "이 카드는 지도입니다. 실시간 전송 자체는 협업·WebRTC 카테고리 카드가 다루고, 이 파일의 이어지는 카드는 무대의 수명, 임베드 상태와 렌더 품질의 경계, 월드 데이터 모델을 각각 설명합니다. 영상 회의는 사용자가 직접 켜는 옵트인 기능이며, 공간에 들어왔다는 사실 자체가 어떤 권한도 주지 않습니다.",
        "This card is the map. The realtime transports themselves are covered by the collaboration and WebRTC cards, and the following cards in this file explain the stage lifecycle, the boundary between embed state and render quality, and the world data model. Video meetings are an opt-in feature each user switches on, and merely entering the space grants no permission at all.",
      ),
    ],
    keyPoints: [
      t("무대는 Godot, 계정·업무는 웹 셸", "The stage is Godot; accounts and work stay in the shell"),
      t("셸과 무대는 브리지 메시지로만 통신", "Shell and stage talk only through bridge messages"),
      t("월드 데이터의 진실은 서버가 확정", "The server confirms the truth of world data"),
      t("공간은 권한이 아니라 안내판", "Space is a signpost, not a permission"),
    ],
    diagram: {
      id: "virtual-studio-architecture-overview-diagram",
      kind: "layers",
      title: t("가상 스튜디오의 이층 구조", "The two-part structure of the virtual studio"),
      caption: t(
        "위는 웹 셸, 아래는 Godot 무대와 서버이며, 경계는 브리지 메시지뿐입니다.",
        "The web shell sits on top, the Godot stage and server below, and bridge messages are the only boundary.",
      ),
      alt: t(
        "여섯 층이 위에서 아래로 쌓여 있습니다. 위부터 회의·채팅 패널, 웹 셸, 브리지, Godot 무대, 서버 권위, 월드 데이터입니다. 웹 셸이 계정과 업무를 맡고 Godot 무대가 공간을 그리며, 아래 두 층이 월드 원본을 갖습니다.",
        "Six layers are stacked from top to bottom: meeting and chat panels, the web shell, the bridge, the Godot stage, server authority and world data. The web shell owns accounts and work, the Godot stage draws the space, and the bottom two layers own the world source.",
      ),
      layers: [
        { id: "people", label: t("회의·채팅 패널", "Meeting and chat panels"), sub: t("셸이 여는 업무 패널 · 영상은 사용자가 켬", "Work panels opened by the shell · video is user-enabled"), tone: "local", chips: ["WebRTC"] },
        { id: "shell", label: t("웹 셸", "Web shell"), sub: t("계정·티켓·한글 입력·연결 상태 표기", "Accounts, tickets, Korean input, status display"), tone: "local" },
        { id: "bridge", label: t("브리지", "Bridge"), sub: t("__tsvsHost 통지 · iframe 전역 콜백", "Host notifications and iframe global callbacks"), tone: "neutral" },
        { id: "stage", label: t("Godot 무대", "Godot stage"), sub: t("공간 렌더·이동·구역 판정 (iframe 임베드)", "Spatial rendering, movement, zones (iframe embed)"), tone: "local", chips: ["Godot", "iframe"] },
        { id: "authority", label: t("서버 권위", "Server authority"), sub: t("월드 발행(CAS)·권한·티켓 발급", "Publish (CAS), permissions, ticket issuing"), tone: "server", chips: ["NestJS", "Supabase PostgreSQL"] },
        { id: "world", label: t("월드 데이터", "World data"), sub: t("공간 정의 v1 · 월드 매니페스트", "Space definition v1 and the world manifest"), tone: "neutral", chips: ["Zod"] },
      ],
      brackets: [
        { label: t("브라우저 안 (셸과 무대)", "In the browser (shell and stage)"), layerIds: ["people", "shell", "bridge", "stage"] },
        { label: t("서버·저장소 (원본)", "Server and storage (source)"), layerIds: ["authority", "world"] },
      ],
    },
    usage: [
      {
        feature: t("협업 스튜디오 · 공간 화면", "Collaboration studio · spatial screen"),
        role: t(
          "페이지 셸이 입장 동선과 계정을 확인한 뒤 Godot 무대 임베드를 화면에 조립합니다.",
          "The page shell checks the entry flow and the account, then assembles the Godot stage embed on the screen.",
        ),
        paths: [`${V}/StudioVirtualSpacePageRoot.tsx`, `${V}/StudioVirtualSpacePage.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("Godot 무대 임베드", "Godot stage embed"),
        role: t(
          "iframe으로 무대를 띄우고 티켓 발급·갱신과 브리지 통지를 맡으며, 회의·배치 패널을 셸 쪽에 엽니다.",
          "It loads the stage in an iframe, owns ticket issuing and renewal and bridge notifications, and opens the meeting and layout panels on the shell side.",
        ),
        paths: [`${V}/StudioGodotSpaceEmbed.tsx`, `${V}/studio-godot-space-embed-support.ts`],
      },
      {
        feature: t("월드 발행 서버", "World publishing server"),
        role: t(
          "관리자가 발행한 월드를 서버가 리비전·해시와 함께 보관하고, 동시 발행은 CAS 충돌로 거절합니다.",
          "The server stores the world a manager publishes with a revision and a hash, and rejects concurrent publishes as CAS conflicts.",
        ),
        paths: [
          "apps/api/src/modules/studio-project-graph/studio-world-publication.repository.ts",
          "packages/studio-project-model/src/graph/world-publication.ts",
        ],
      },
      {
        feature: t("프레즌스 프로토콜", "Presence protocol"),
        role: t(
          "위치·상태 패킷의 와이어 형식을 무대와 셸이 함께 쓰는 순수 모듈로 정의합니다.",
          "A pure module shared by the stage and the shell defines the wire format of position and state packets.",
        ),
        paths: [`${V}/studio-virtual-space-presence.ts`, `${V}/studio-virtual-space-presence-protocol.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("무대 iframe 주소 정하기", "Choosing the stage iframe address"),
        language: "ts",
        code: `// 셸은 무대를 직접 그리지 않고 iframe 주소만 정한다(단순화).
export const GODOT_SPACE_EMBED_PATH = "/godot-space/index.html";

export function stageSrc(spaceId: string, restore = ""): string {
  return \`\${GODOT_SPACE_EMBED_PATH}?space=\${spaceId}\${restore}\`;
}`,
        codeEn: `// The shell never draws the stage; it only picks the iframe address (simplified).
export const GODOT_SPACE_EMBED_PATH = "/godot-space/index.html";

export function stageSrc(spaceId: string, restore = ""): string {
  return \`\${GODOT_SPACE_EMBED_PATH}?space=\${spaceId}\${restore}\`;
}`,
        explain: t(
          "무대 빌드는 정적 파일로 서빙되고 셸은 그 주소를 iframe에 넣을 뿐입니다. 마지막 위치 복원 같은 값은 쿼리로만 붙입니다.",
          "The stage build is served as static files and the shell only puts its address into an iframe. Values such as the restored last position are attached only as a query.",
        ),
        source: `${V}/StudioGodotSpaceEmbed.tsx`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("발행은 기대 리비전이 맞을 때만", "Publishing only when the expected revision matches"),
        language: "ts",
        code: `// 발행은 기대 리비전을 함께 보내고, 어긋나면 충돌로 거절한다(단순화).
type PublishInput = {
  expectedPublishedRevisionId: string | null;
  manifest: unknown;
};

export function assertPublishable(
  previousRevisionId: string | null,
  input: PublishInput,
): void {
  if (previousRevisionId !== input.expectedPublishedRevisionId) {
    throw new Error("world publication conflict");
  }
}`,
        codeEn: `// A publish carries the expected revision and is rejected on mismatch (simplified).
type PublishInput = {
  expectedPublishedRevisionId: string | null;
  manifest: unknown;
};

export function assertPublishable(
  previousRevisionId: string | null,
  input: PublishInput,
): void {
  if (previousRevisionId !== input.expectedPublishedRevisionId) {
    throw new Error("world publication conflict");
  }
}`,
        explain: t(
          "두 관리자가 동시에 발행하면 먼저 도착한 쪽만 성공하고 다른 쪽은 충돌을 받습니다. 그래서 누구도 남의 발행을 조용히 덮어쓰지 못합니다.",
          "When two managers publish at once, only the first succeeds and the other receives a conflict. Nobody silently overwrites someone else's publication.",
        ),
        source: "packages/studio-project-model/src/graph/world-publication.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "Godot Engine docs", url: "https://docs.godotengine.org/en/stable/", kind: "docs", note: t("무대 엔진의 공식 문서", "Official docs of the stage engine") },
      { title: "MDN · iframe element", url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe", kind: "docs", note: t("무대를 품는 임베드 방식", "The embed element that holds the stage") },
      { title: "MDN · WebRTC API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API", kind: "docs", note: t("회의 패널 영상의 바탕", "Basis of meeting panel video") },
      { title: "Zod", url: "https://zod.dev/", kind: "docs", note: t("웹·서버가 함께 쓰는 월드 스키마", "The world schema shared by web and server") },
    ],
    chapterIds: ["virtual-studio-world-authority", "architecture"],
    talk: {
      pitch: t(
        "가상 스튜디오는 Godot 무대와 웹 셸의 이층 구조입니다. 무대가 공간 렌더와 이동을 맡고, 셸이 계정·티켓·채팅·업무 패널·한글 입력을 맡으며, 둘은 브리지 메시지로만 대화합니다. 월드 데이터의 진실은 서버가 발행 리비전과 해시로 확정합니다. 초기 Phaser 구현은 2026-10 Godot로 교체됐습니다.",
        "The virtual studio is a two-part structure of a Godot stage and a web shell. The stage owns spatial rendering and movement, the shell owns accounts, tickets, chat, work panels and Korean input, and the two talk only through bridge messages. The server confirms world truth with publication revisions and hashes. The early Phaser implementation was replaced by Godot in 2026-10.",
      ),
      analogy: t(
        "무대와 분장실이 붙은 극장과 같습니다. 배우(무대)는 연기만 하고, 표와 안내와 자막(셸)은 극장 직원이 맡으며, 둘은 약속된 신호로만 소통합니다.",
        "It is like a theatre with a stage and a backstage crew. The actors (the stage) only perform, while tickets, guidance and subtitles (the shell) belong to the staff, and the two communicate only through agreed signals.",
      ),
      questions: [
        {
          question: t("왜 무대만 Godot로 바꿨나요?", "Why was only the stage replaced with Godot?"),
          answer: t(
            "계정·채팅·업무 패널과 한글 입력은 웹 기술이 가장 잘하는 영역이라 셸에 남겼습니다. 걷고 만나는 공간 연출만 게임 엔진이 맡는 편이 각자 잘하는 일을 나누는 구조입니다.",
            "Accounts, chat, work panels and Korean input are what web technology does best, so they stayed in the shell. Letting a game engine own only the walking-and-meeting stage splits the work by strength.",
          ),
        },
        {
          question: t("몇 명까지 함께 들어올 수 있나요?", "How many people can be there together?"),
          answer: t(
            "실시간 룸의 연결 상한은 방당 64개로 설정돼 있지만, 검증된 동시접속 목표는 2명 기준 안정화입니다. 자세한 내용은 프레즌스와 실시간 카드를 보세요.",
            "The realtime room connection cap is configured at 64 per room, but the verified concurrency goal is stability for two people. See the presence and realtime cards for details.",
          ),
        },
        {
          question: t("무대와 셸은 어떻게 통신하나요?", "How do the stage and shell communicate?"),
          answer: t(
            "무대에서 셸로는 window.__tsvsHost 콜백으로 통지가 오고, 셸에서 무대로는 iframe 전역 콜백으로 세션과 신호를 보냅니다. 티켓 같은 자격 정보는 이 경계로만 주입되고 저장되지 않습니다.",
            "Notifications come from the stage to the shell through the window.__tsvsHost callbacks, and sessions and signals go from the shell to the stage through iframe global callbacks. Credentials such as tickets are injected only across this boundary and never stored.",
          ),
        },
      ],
      pitfall: t(
        "클래식 Phaser 화면을 현행처럼 말하지 마세요. 초기 Phaser 구현은 2026-10 Godot로 교체됐고, 지금 웹 코드에 남는 것은 셸·브리지·프로토콜·월드 계약입니다. 방당 연결 상한 64도 검증된 수용량이 아니라 설정값입니다.",
        "Do not describe the classic Phaser screen as current. The early Phaser implementation was replaced by Godot in 2026-10, and what remains in the web code is the shell, the bridge, the protocol and the world contracts. The 64-per-room cap is also a configured value, not a verified capacity.",
      ),
    },
    technologies: ["Godot", "React", "TypeScript", "Zod", "NestJS", "Supabase PostgreSQL"],
    facts: [
      { value: "/godot-space/index.html", label: t("Godot 무대 임베드 경로 상수(GODOT_SPACE_EMBED_PATH)", "Godot stage embed path constant (GODOT_SPACE_EMBED_PATH)"), source: `${V}/StudioGodotSpaceEmbed.tsx` },
      { value: "2 MiB", label: t("월드 매니페스트 크기 상한(설계값)", "World manifest size cap (design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "64", label: t("실시간 룸당 연결 상한(REALTIME_MAX_CONNECTIONS_PER_ROOM, 설정값)", "Max connections per realtime room (REALTIME_MAX_CONNECTIONS_PER_ROOM, configured)"), source: "deploy/cloudflare-realtime/wrangler.jsonc" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "phaser-lazy-scene-lifecycle",
    category: "virtual-space",
    name: "Virtual Studio · Godot stage",
    title: t("필요할 때만 받는 Godot 무대와 임베드의 한살이", "A Godot stage fetched on demand, and the life of its embed"),
    status: "live",
    tagline: t(
      "공간에 들어갈 때만 무대를 받고, 셸이 티켓과 브리지로 한살이를 관리합니다.",
      "The stage is fetched only on entry, and the shell manages its life through tickets and the bridge.",
    ),
    background: [
      t(
        "Godot 무대는 웹 빌드로 서빙되는 별도 산출물입니다. 공간을 쓰지 않는 사용자까지 무대 파일을 받게 하면 낭비라서, 공간 페이지 자체를 라우트 지연 로딩으로 받고 무대 iframe도 입장한 뒤에야 주소를 정해 띄웁니다. 극장에 비유하면 손님이 입장할 때만 무대를 세우고, 나가면 셸이 브리지 등록을 해제하는 방식입니다.",
        "The Godot stage is a separate artifact served as a web build. Making users who never open the studio download the stage files would be wasteful, so the spatial page itself is lazy-loaded by the router and the stage iframe gets its address only after entry. Think of a theatre that builds the stage only when guests enter, and where the shell unregisters the bridge when they leave.",
      ),
      t(
        "순서는 이렇습니다. 셸이 먼저 window.__tsvsHost 브리지를 등록합니다. iframe 로드보다 등록이 늦으면 무대의 준비 완료 통지를 놓치기 때문입니다. 이어서 필요하면 실시간 티켓을 발급해 무대에 주입하고, 무대가 준비 통지를 보내면 연결 단계로 넘어갑니다. 연결된 동안 셸은 20초 간격으로 브리지 ping을 보내 생존을 확인하고, 티켓 만료 10초 전까지를 여유로 보고 갱신을 준비합니다.",
        "The order is: the shell first registers the window.__tsvsHost bridge, because registering after the iframe loads would miss the stage's ready notification. Next it issues a realtime ticket when needed and injects it into the stage, and once the stage reports ready the embed moves to the connecting phase. While connected, the shell sends a bridge ping every 20 seconds to check liveness and prepares renewal with a 10-second margin before ticket expiry.",
      ),
      t(
        "실패와 특수한 경우도 단계로 드러납니다. 임베드 단계는 booting, ticket, connecting, connected, disconnected, denied, unavailable, local의 여덟 가지이고, 거절이나 사용 불가 단계에서는 다시 시도 동선을 보여 줍니다. 개인 공간처럼 티켓을 발급할 수 없는 경우에는 무대만 로컬로 띄우는 local 단계로 동작합니다. 게스트 접속은 프레즌스 전용 티켓이라 회의·배치 기능을 켜지 않습니다.",
        "Failures and special cases surface as phases too. The embed phases are eight: booting, ticket, connecting, connected, disconnected, denied, unavailable and local, and the denied and unavailable phases show a retry path. When no ticket can be issued, as in a personal space, the stage runs locally in the local phase. Guest access uses a presence-only ticket, so meeting and layout features stay off.",
      ),
      t(
        "초기 Phaser 구현은 2026-10 Godot로 교체됐습니다. 이전에는 웹 페이지가 게임 엔진을 동적으로 불러와 장면을 만들고 지우는 일을 직접 맡았지만, 지금 그 책임은 Godot 빌드 안에 있고 셸은 임베드 주소, 티켓, 브리지, 단계 표기만 관리합니다. 그래서 이 카드가 말하는 수명주기는 엔진 내부가 아니라 셸과 무대 사이의 계약입니다.",
        "The early Phaser implementation was replaced by Godot in 2026-10. The web page used to load a game engine dynamically and create and destroy scenes itself, but that responsibility now lives inside the Godot build, and the shell manages only the embed address, tickets, the bridge and phase display. So the lifecycle in this card is the contract between shell and stage, not engine internals.",
      ),
    ],
    keyPoints: [
      t("공간 페이지와 무대는 입장할 때만 받습니다", "The page and stage are fetched only on entry"),
      t("브리지 등록이 iframe 로드보다 먼저입니다", "The bridge registers before the iframe loads"),
      t("20초 ping과 티켓 만료 10초 여유로 관리", "Managed with a 20 s ping and a 10 s ticket margin"),
    ],
    diagram: {
      id: "phaser-lazy-scene-lifecycle-diagram",
      kind: "sequence",
      title: t("입장부터 퇴장까지 Godot 임베드의 한살이", "Life of the Godot embed from entry to exit"),
      caption: t(
        "셸이 브리지를 먼저 걸고 무대를 띄우며, 연결 중에는 ping으로 생존을 확인합니다.",
        "The shell registers the bridge first and loads the stage, then checks liveness with pings while connected.",
      ),
      alt: t(
        "사용자가 공간에 입장하면 React 셸이 브리지를 등록하고 티켓을 발급한 뒤 무대 iframe을 띄웁니다. Godot 무대가 준비 통지를 보내면 연결 단계가 되고, 셸은 20초 간격 ping으로 생존을 확인합니다. 나갈 때는 셸이 브리지 등록을 해제합니다.",
        "When the user enters, the React shell registers the bridge, issues a ticket and loads the stage iframe. When the Godot stage reports ready the embed becomes connected, and the shell checks liveness with a ping every 20 seconds. On exit the shell unregisters the bridge.",
      ),
      actors: [
        { id: "user", label: t("사용자", "User"), tone: "local" },
        { id: "shell", label: t("React 셸", "React shell"), sub: t("임베드 관리", "Embed manager"), tone: "local" },
        { id: "stage", label: t("Godot 무대", "Godot stage"), sub: t("iframe 안의 빌드", "Build inside the iframe"), tone: "local" },
        { id: "server", label: t("티켓 발급", "Ticket issuer"), sub: t("실시간 티켓", "Realtime ticket"), tone: "warn" },
      ],
      messages: [
        { from: "user", to: "shell", label: t("공간에 입장", "Enter the studio"), note: t("라우트 청크를 먼저 받음", "The route chunk loads first") },
        { from: "shell", to: "shell", label: t("브리지 등록", "Register the bridge"), note: t("iframe 로드보다 먼저", "Before the iframe loads") },
        { from: "shell", to: "server", label: t("티켓 발급 요청", "Request a ticket"), note: t("자격은 메모리에만 둠", "Credentials stay in memory only") },
        { from: "server", to: "shell", label: t("티켓 도착", "Ticket arrives"), style: "dashed", note: t("게스트는 프레즌스 전용", "Guests get presence only") },
        { from: "shell", to: "stage", label: t("iframe 주소 지정", "Set the iframe address"), note: t("/godot-space/index.html", "/godot-space/index.html") },
        { from: "stage", to: "shell", label: t("준비 완료 통지", "Ready notification"), style: "dashed", note: t("onGodotReady 콜백", "The onGodotReady callback") },
        { from: "shell", to: "stage", label: t("세션 주입", "Inject the session"), note: t("전역 콜백으로 전달", "Passed via a global callback") },
        { from: "shell", to: "stage", label: t("20초 간격 ping", "Ping every 20 s"), style: "dashed", note: t("연결 생존 확인", "Liveness check") },
        { from: "user", to: "shell", label: t("공간에서 나가기", "Leave the studio") },
        { from: "shell", to: "shell", label: t("브리지 해제", "Unregister the bridge"), note: t("등록한 호스트만 지움", "Removes only its own host") },
      ],
    },
    usage: [
      {
        feature: t("협업 스튜디오 · 공간 입장", "Collaboration studio · entering the studio"),
        role: t(
          "브리지를 먼저 등록하고 티켓을 주입한 뒤 무대를 띄우며, 임베드 단계를 화면 상태로 노출합니다.",
          "It registers the bridge first, injects a ticket and loads the stage, exposing the embed phase as screen state.",
        ),
        paths: [`${V}/StudioGodotSpaceEmbed.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("브리지 보조 모듈", "Bridge support module"),
        role: t(
          "셸과 무대가 주고받는 콜백 타입과 마지막 위치 저장, 통지 페이로드 파싱을 React 없는 순수 모듈로 둡니다.",
          "The callback types exchanged by shell and stage, last-position storage and payload parsing live in a pure module without React.",
        ),
        paths: [`${V}/studio-godot-space-embed-support.ts`],
      },
      {
        feature: t("라우트 지연 로딩", "Route-level lazy loading"),
        role: t(
          "공간 페이지 자체도 라우트에 들어갈 때 받으며, 실패하면 재시도하는 lazyRetry로 감쌉니다.",
          "The spatial page itself is fetched on route entry, wrapped in lazyRetry which retries on failure.",
        ),
        paths: ["apps/web/src/app/routes/groups/creator-route-pages.ts"],
        route: "/studio/space",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("라우트에서만 받는 공간 페이지", "A studio page fetched only by its route"),
        language: "ts",
        code: `// 공간 페이지는 라우트에 들어갈 때만 청크를 받는다(단순화).
import { lazyRetry } from "@/shared/lib/lazy-retry";

export const StudioVirtualSpacePage = lazyRetry(
  () =>
    import("@/domains/creator/virtual-space/StudioVirtualSpacePage").then(
      (module) => ({ default: module.StudioVirtualSpacePage }),
    ),
  "StudioVirtualSpacePage",
);`,
        codeEn: `// The studio page chunk is fetched only when its route is entered (simplified).
import { lazyRetry } from "@/shared/lib/lazy-retry";

export const StudioVirtualSpacePage = lazyRetry(
  () =>
    import("@/domains/creator/virtual-space/StudioVirtualSpacePage").then(
      (module) => ({ default: module.StudioVirtualSpacePage }),
    ),
  "StudioVirtualSpacePage",
);`,
        explain: t(
          "공간을 쓰지 않는 사용자는 공간 페이지와 무대 파일을 받지 않습니다. 불러오기가 실패하면 lazyRetry가 다시 시도합니다.",
          "Users who never open the studio download neither the studio page nor the stage files. When loading fails, lazyRetry tries again.",
        ),
        source: "apps/web/src/app/routes/groups/creator-route-pages.ts",
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("20초 간격 브리지 생존 확인", "Bridge liveness check every 20 seconds"),
        language: "ts",
        code: `// 연결된 동안 20초 간격으로 브리지에 ping을 보내 생존을 확인한다(단순화).
const BRIDGE_PING_INTERVAL_MS = 20_000;

export function watchBridge(
  ping: () => void,
  isConnected: () => boolean,
): () => void {
  const timer = setInterval(() => {
    if (isConnected()) ping();
  }, BRIDGE_PING_INTERVAL_MS);
  return () => clearInterval(timer);
}`,
        codeEn: `// While connected, ping the bridge every 20 seconds to check liveness (simplified).
const BRIDGE_PING_INTERVAL_MS = 20_000;

export function watchBridge(
  ping: () => void,
  isConnected: () => boolean,
): () => void {
  const timer = setInterval(() => {
    if (isConnected()) ping();
  }, BRIDGE_PING_INTERVAL_MS);
  return () => clearInterval(timer);
}`,
        explain: t(
          "무대가 멈췄는데 화면만 연결된 것처럼 보이는 상황을 막기 위해, 연결 단계에서만 주기적으로 ping을 보내고 정리 함수로 타이머를 끕니다.",
          "To avoid a screen that looks connected while the stage has stalled, it pings periodically only in the connected phase and stops the timer in cleanup.",
        ),
        source: `${V}/StudioGodotSpaceEmbed.tsx`,
        verify: "types",
      },
    ],
    links: [
      { title: "Godot · Exporting for the Web", url: "https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html", kind: "docs", note: t("무대 웹 빌드의 내보내기 방식", "How the stage web build is exported") },
      { title: "MDN · iframe element", url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe", kind: "docs", note: t("무대를 품는 임베드 방식", "The embed element that holds the stage") },
      { title: "MDN · import()", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import", kind: "docs", note: t("동적 import의 동작", "How dynamic import works") },
      { title: "MDN · Page Visibility API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API", kind: "docs", note: t("탭 가시성과 연결 생존성", "Tab visibility and connection liveness") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "Godot 무대는 공간에 들어갈 때만 받습니다. 셸이 브리지를 먼저 등록하고, 티켓을 발급해 주입하고, 무대의 준비 통지를 받아 연결 단계로 넘어갑니다. 연결 중에는 20초 간격 ping으로 생존을 확인하고 티켓은 만료 10초 전 여유를 두고 갱신합니다. 초기 Phaser 구현은 2026-10 Godot로 교체됐습니다.",
        "The Godot stage is fetched only when you enter the studio. The shell registers the bridge first, issues and injects a ticket, and moves to the connected phase on the stage's ready notification. While connected it checks liveness with a ping every 20 seconds and renews the ticket with a 10-second margin. The early Phaser implementation was replaced by Godot in 2026-10.",
      ),
      analogy: t(
        "손님이 올 때만 무대를 세우는 극장입니다. 안내 데스크(셸)가 먼저 자리를 잡고 입장권을 건넨 뒤에야 막이 오르고, 공연 중에는 안내원이 주기적으로 무대가 잘 돌아가는지 확인합니다.",
        "A theatre that builds its stage only when guests arrive. The front desk (the shell) takes its place first and hands over the ticket before the curtain rises, and during the show the usher periodically checks that the stage is running well.",
      ),
      questions: [
        {
          question: t("무대가 처음 로딩에 들어가나요?", "Is the stage part of the first load?"),
          answer: t(
            "아니요. 공간 페이지는 라우트 지연 로딩이고 무대 iframe 주소도 입장 뒤에 정해집니다. 공간을 쓰지 않는 사용자는 둘 다 받지 않습니다.",
            "No. The studio page is route-lazy-loaded and the stage iframe address is set only after entry. Users who never open the studio download neither.",
          ),
        },
        {
          question: t("티켓은 어디에 저장되나요?", "Where is the ticket stored?"),
          answer: t(
            "저장되지 않습니다. 티켓은 메모리에만 두고 저장소·URL·로그에 남기지 않는 것이 임베드 셸의 규칙입니다.",
            "It is not stored. The embed shell's rule is to keep tickets in memory only and never in storage, URLs or logs.",
          ),
        },
        {
          question: t("연결이 끊기면 사용자는 무엇을 보나요?", "What does the user see when the connection drops?"),
          answer: t(
            "임베드 단계가 disconnected로 바뀌어 상태 문구로 드러나고, 거절이나 사용 불가 단계에서는 다시 시도 동선이 보입니다. 티켓이 필요한 경우 무대가 통지로 재발급을 요청합니다.",
            "The embed phase changes to disconnected and shows in the status copy, and the denied and unavailable phases show a retry path. When a ticket is needed, the stage requests a reissue through a notification.",
          ),
        },
      ],
      pitfall: t(
        "Phaser 장면의 preload·create 같은 수명주기를 현행처럼 말하지 마세요. 그 구조는 2026-10 Godot 교체로 사라졌고, 지금 셸이 관리하는 것은 임베드 단계와 브리지 계약뿐입니다.",
        "Do not describe a Phaser scene lifecycle such as preload and create as current. That structure disappeared with the 2026-10 Godot replacement, and the shell now manages only embed phases and the bridge contract.",
      ),
    },
    technologies: ["Godot", "React", "TypeScript", "Vite"],
    facts: [
      { value: "20초", label: t("브리지 ping 간격(BRIDGE_PING_INTERVAL_MS 20_000, 설계값)", "Bridge ping interval (BRIDGE_PING_INTERVAL_MS 20_000, design value)"), source: `${V}/StudioGodotSpaceEmbed.tsx` },
      { value: "10초", label: t("티켓 만료 여유(TICKET_EXPIRY_MARGIN_MS 10_000, 설계값)", "Ticket expiry margin (TICKET_EXPIRY_MARGIN_MS 10_000, design value)"), source: `${V}/StudioGodotSpaceEmbed.tsx` },
      { value: "/godot-space/index.html", label: t("서빙되는 Godot 무대 빌드의 진입 파일", "Entry file of the served Godot stage build"), source: "apps/web/public/godot-space/index.html" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "renderer-quality-tier-adaptive",
    category: "virtual-space",
    name: "Virtual Studio · Embed state",
    title: t("렌더 품질은 Godot가, 셸은 임베드 상태만 관리합니다", "Godot owns render quality; the shell manages only embed state"),
    status: "live",
    tagline: t(
      "무대 안의 렌더링과 품질은 Godot 엔진이 맡고, 셸은 연결 단계만 표기합니다.",
      "Rendering and quality inside the stage belong to the Godot engine; the shell only displays connection phases.",
    ),
    background: [
      t(
        "가상 스튜디오의 그림 품질은 이제 웹 코드가 정하지 않습니다. 공간 렌더링과 해상도, 프레임 처리 같은 품질 결정은 Godot 무대와 그 엔진이 소유합니다. 식당에 비유하면 주방(무대)이 요리의 완성도를 책임지고, 안내 데스크(셸)는 가게가 열렸는지, 자리가 준비됐는지, 잠시 쉬는 중인지 같은 상태판만 정확히 보여 주는 역할입니다.",
        "The picture quality of the virtual studio is no longer decided by web code. Spatial rendering, resolution and frame handling belong to the Godot stage and its engine. In restaurant terms, the kitchen (the stage) is responsible for the finished dish, while the front desk (the shell) only keeps an accurate status board: open, seating ready, or briefly paused.",
      ),
      t(
        "셸이 관리하는 상태는 임베드 단계 여덟 가지입니다. booting에서 시작해 ticket과 connecting을 거쳐 connected가 되고, 끊기면 disconnected, 자격이 없으면 denied, 무대를 쓸 수 없으면 unavailable로 표기하며, 티켓 없이 띄우는 개인 공간은 local입니다. 무대 배경의 로드 상태도 무대가 window에 idle, loading, ready, failed 중 하나로 표기하고 셸은 그 값을 읽어 보여 줄 뿐 값을 만들어 내지 않습니다.",
        "The state the shell manages is the eight embed phases. It starts at booting, passes ticket and connecting to connected, shows disconnected when the link drops, denied without credentials and unavailable when the stage cannot be used, and local for personal spaces loaded without a ticket. The stage background load state is also written by the stage onto window as one of idle, loading, ready or failed, and the shell only reads and displays that value instead of inventing one.",
      ),
      t(
        "왜 경계를 이렇게 그었을까요? 셸이 프레임 속도를 재서 무대 품질을 추정하면, 실제로 무대 안에서 일어나는 일과 다른 상태판을 보여 줄 위험이 큽니다. 초기 Phaser 구현은 2026-10 Godot로 교체됐고, 웹 쪽 렌더러 선택과 품질 등급 조절기도 함께 사라졌습니다. 지금은 무대가 품질을, 셸이 연결 생존성을 맡고, 생존 확인은 연결 단계에서 20초 간격 브리지 ping으로 합니다.",
        "Why draw the boundary here? If the shell measured frame rates and guessed at stage quality, its status board could easily disagree with what actually happens inside the stage. The early Phaser implementation was replaced by Godot in 2026-10, and the web-side renderer choice and quality tier controller disappeared with it. Now the stage owns quality and the shell owns connection liveness, checked with a bridge ping every 20 seconds while connected.",
      ),
      t(
        "정직한 한계도 있습니다. Godot 무대 내부의 해상도나 품질 단계가 어떻게 정해지는지는 웹 저장소의 코드로 확인하지 못했습니다. 그래서 이 카드는 무대 내부 품질을 수치로 말하지 않고, 셸이 실제로 읽고 표기하는 상태만 설명합니다. 기기별 체감 품질은 무대 빌드 쪽에서 따로 검증해야 합니다.",
        "There is an honest limit. How resolution and quality steps are decided inside the Godot stage could not be verified from the web repository's code. So this card puts no numbers on stage-internal quality and explains only the state the shell actually reads and displays. Per-device perceived quality must be verified on the stage build itself.",
      ),
    ],
    keyPoints: [
      t("렌더 품질의 소유자는 Godot 무대입니다", "The Godot stage owns render quality"),
      t("셸은 임베드 단계 8가지만 표기합니다", "The shell displays only the eight embed phases"),
      t("배경 로드 상태도 무대가 표기합니다", "The stage also writes the background load state"),
    ],
    diagram: {
      id: "renderer-quality-tier-adaptive-diagram",
      kind: "layers",
      title: t("품질은 무대 안, 상태는 셸의 몫", "Quality inside the stage, state in the shell"),
      caption: t(
        "위층은 셸이 표기하는 임베드 상태이고, 아래층은 무대 엔진이 소유하는 렌더링입니다.",
        "The upper layers are embed state the shell displays; the lower layer is rendering owned by the stage engine.",
      ),
      alt: t(
        "위에서 아래로 임베드 단계, 배경 로드 상태, 브리지 생존 확인, 실패와 재시도, Godot 렌더링 층이 쌓여 있습니다. 셸은 위 네 층의 상태만 읽어 표기하고, 렌더링 품질은 맨 아래 Godot 엔진이 소유합니다.",
        "From top to bottom the layers are embed phases, background load state, bridge liveness, failure and retry, and Godot rendering. The shell only reads and displays the top four layers of state, while the Godot engine at the bottom owns rendering quality.",
      ),
      layers: [
        { id: "phase", label: t("임베드 단계", "Embed phases"), sub: t("booting부터 local까지 8단계 표기", "Eight phases from booting to local"), tone: "local" },
        { id: "bg", label: t("배경 로드 상태", "Background load state"), sub: t("idle · loading · ready · failed", "idle, loading, ready, failed"), tone: "local" },
        { id: "ping", label: t("브리지 생존 확인", "Bridge liveness"), sub: t("연결 중 20초 간격 ping", "Ping every 20 s while connected"), tone: "local" },
        { id: "retry", label: t("실패와 재시도", "Failure and retry"), sub: t("denied · unavailable에서 재시도 동선", "A retry path from denied and unavailable"), tone: "warn" },
        { id: "engine", label: t("Godot 렌더링", "Godot rendering"), sub: t("해상도·프레임·품질은 엔진이 소유", "Resolution, frames and quality owned by the engine"), tone: "neutral", chips: ["Godot"] },
      ],
      brackets: [
        { label: t("셸이 읽어 표기하는 상태", "State the shell reads and displays"), layerIds: ["phase", "bg", "ping", "retry"] },
      ],
    },
    usage: [
      {
        feature: t("공간 화면 · 임베드 상태 표기", "Spatial screen · embed status display"),
        role: t(
          "임베드 단계에 따라 로딩·연결·거절 상태를 보여 주고, 거절과 사용 불가에서는 다시 시도 동선을 냅니다.",
          "It shows loading, connected and denied states by embed phase, and offers a retry path for denied and unavailable.",
        ),
        paths: [`${V}/StudioGodotSpaceEmbed.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("무대 배경 로드 상태 읽기", "Reading the stage background load state"),
        role: t(
          "무대가 window에 표기한 배경 상태를 셸이 읽는 창구 타입을 보조 모듈이 정의합니다.",
          "The support module defines the window surface through which the shell reads the background state the stage writes.",
        ),
        paths: [`${V}/studio-godot-space-embed-support.ts`],
      },
      {
        feature: t("서빙되는 Godot 무대 빌드", "The served Godot stage build"),
        role: t(
          "렌더링을 실제로 수행하는 무대 빌드가 정적 파일로 서빙되고 셸은 그 진입 파일을 iframe에 넣습니다.",
          "The stage build that actually renders is served as static files, and the shell puts its entry file into an iframe.",
        ),
        paths: ["apps/web/public/godot-space/index.html"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("셸이 표기하는 임베드 단계 여덟 가지", "The eight embed phases the shell displays"),
        language: "ts",
        code: `// 셸이 표기하는 임베드 단계는 여덟 가지다(StudioGodotSpaceEmbed의 타입).
type StudioGodotSpacePhase =
  | "booting"
  | "ticket"
  | "connecting"
  | "connected"
  | "disconnected"
  | "denied"
  | "unavailable"
  | "local";

export const isBusy = (phase: StudioGodotSpacePhase): boolean =>
  phase === "booting" || phase === "ticket" || phase === "connecting";`,
        codeEn: `// The shell displays eight embed phases (the type in StudioGodotSpaceEmbed).
type StudioGodotSpacePhase =
  | "booting"
  | "ticket"
  | "connecting"
  | "connected"
  | "disconnected"
  | "denied"
  | "unavailable"
  | "local";

export const isBusy = (phase: StudioGodotSpacePhase): boolean =>
  phase === "booting" || phase === "ticket" || phase === "connecting";`,
        explain: t(
          "셸의 상태판은 연결 과정에 대한 값만 갖습니다. 무대 안의 해상도나 프레임 같은 품질 값은 이 타입 어디에도 없습니다.",
          "The shell's status board only holds values about the connection process. Quality values such as stage resolution or frames appear nowhere in this type.",
        ),
        source: `${V}/StudioGodotSpaceEmbed.tsx`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("무대가 표기한 배경 상태 읽기", "Reading the background state the stage writes"),
        language: "ts",
        code: `// 무대 배경 로드 상태는 무대가 window에 표기하고 셸이 읽는다(단순화).
type GodotBgState = "idle" | "loading" | "ready" | "failed";

interface GodotFrameWindow {
  __godotBgState?: string;
}

export function readBgState(frame: GodotFrameWindow): GodotBgState {
  const value = frame.__godotBgState;
  if (value === "loading" || value === "ready" || value === "failed") return value;
  return "idle";
}`,
        codeEn: `// The stage writes its background load state on window and the shell reads it (simplified).
type GodotBgState = "idle" | "loading" | "ready" | "failed";

interface GodotFrameWindow {
  __godotBgState?: string;
}

export function readBgState(frame: GodotFrameWindow): GodotBgState {
  const value = frame.__godotBgState;
  if (value === "loading" || value === "ready" || value === "failed") return value;
  return "idle";
}`,
        explain: t(
          "배경 GLB가 로드됐는지는 무대만 알 수 있는 사실이라 무대가 표기하고 셸은 모르는 값을 idle로 읽습니다. 셸이 추측으로 상태를 만들지 않는 경계입니다.",
          "Only the stage can know whether its background GLB loaded, so the stage writes the state and the shell reads an unknown value as idle. The shell never invents state by guessing.",
        ),
        source: `${V}/studio-godot-space-embed-support.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Godot Engine docs", url: "https://docs.godotengine.org/en/stable/", kind: "docs", note: t("무대 엔진의 공식 문서", "Official docs of the stage engine") },
      { title: "Godot · Performance", url: "https://docs.godotengine.org/en/stable/tutorials/performance/index.html", kind: "docs", note: t("엔진 쪽 성능 안내", "Engine-side performance guidance") },
      { title: "MDN · iframe element", url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe", kind: "docs", note: t("무대를 품는 임베드 방식", "The embed element that holds the stage") },
    ],
    chapterIds: ["performance", "virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "렌더 품질은 Godot 무대가 소유하고 웹 셸은 임베드 상태만 관리합니다. 셸이 표기하는 것은 booting부터 local까지 여덟 단계와 무대가 표기한 배경 로드 상태뿐입니다. 초기 Phaser 구현에 있던 웹 쪽 렌더러 선택과 품질 등급 조절은 2026-10 Godot 교체와 함께 사라졌습니다.",
        "Render quality belongs to the Godot stage and the web shell manages only embed state. The shell displays just the eight phases from booting to local and the background load state the stage writes. The web-side renderer choice and quality tiers of the early Phaser implementation disappeared with the 2026-10 Godot replacement.",
      ),
      analogy: t(
        "주방이 요리 완성도를 책임지고 안내 데스크는 영업 상태판만 정확히 보여 주는 식당과 같습니다. 데스크가 주방의 불 세기를 추정해 게시하지는 않습니다.",
        "It is a restaurant where the kitchen owns the finished dish and the front desk only keeps an accurate open-status board. The desk does not guess the kitchen's flame level and post it.",
      ),
      questions: [
        {
          question: t("기기가 느리면 화질은 누가 낮추나요?", "Who lowers quality on a slow device?"),
          answer: t(
            "무대 안의 결정이라 Godot 엔진 쪽의 일입니다. 웹 셸은 품질 값을 읽지도 정하지도 않고, 무대 내부 수치는 웹 저장소에서 확인하지 못해 이 카드에서 수치로 말하지 않습니다.",
            "That decision happens inside the stage, so it belongs to the Godot engine side. The web shell neither reads nor sets quality values, and stage-internal figures were not verified in the web repository, so this card gives none.",
          ),
        },
        {
          question: t("셸이 아는 무대 상태는 무엇인가요?", "What stage state does the shell know?"),
          answer: t(
            "임베드 단계 여덟 가지와 배경 로드 상태 네 가지입니다. 둘 다 연결과 로딩에 대한 사실이고, 렌더 품질에 대한 값은 포함되지 않습니다.",
            "The eight embed phases and the four background load states. Both are facts about connection and loading, and neither includes any render quality value.",
          ),
        },
        {
          question: t("무대가 멈추면 어떻게 알 수 있나요?", "How would you know the stage has stalled?"),
          answer: t(
            "연결 단계에서 셸이 20초 간격으로 브리지 ping을 보냅니다. 응답이 끊기는 상황은 연결 상태 표기와 재연결 동선으로 드러납니다.",
            "In the connected phase the shell sends a bridge ping every 20 seconds. A loss of responses surfaces through the connection status display and the reconnect path.",
          ),
        },
      ],
      pitfall: t(
        "웹 쪽 품질 5등급이나 WebGL과 Canvas 자동 선택을 현행처럼 말하지 마세요. 그 조절기는 Phaser 교체 때 사라졌고, 지금 품질의 소유자는 Godot 무대입니다. 무대 내부 수치를 웹 코드 근거 없이 말하는 것도 피하세요.",
        "Do not describe web-side five quality tiers or automatic WebGL versus Canvas choice as current. That controller disappeared with the Phaser replacement, and quality now belongs to the Godot stage. Avoid quoting stage-internal figures without web code evidence too.",
      ),
    },
    technologies: ["Godot", "React", "TypeScript"],
    facts: [
      { value: "8단계", label: t("셸이 표기하는 임베드 단계 수(booting부터 local까지)", "Number of embed phases the shell displays (booting to local)"), source: `${V}/StudioGodotSpaceEmbed.tsx` },
      { value: "idle|loading|ready|failed", label: t("무대가 window에 표기하는 배경 로드 상태 값", "Background load state values the stage writes on window"), source: `${V}/studio-godot-space-embed-support.ts` },
      { value: "20초", label: t("연결 중 브리지 ping 간격(설계값)", "Bridge ping interval while connected (design value)"), source: `${V}/StudioGodotSpaceEmbed.tsx` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "tiled-world-data-model",
    category: "virtual-space",
    name: "Virtual Studio · World data",
    title: t("서버가 확정하는 월드 매니페스트와 Godot 공간 정의", "The server-confirmed world manifest and the Godot space definition"),
    status: "live",
    tagline: t(
      "월드는 데이터로 적어 서버가 확정하고, Godot 무대는 그 정의를 소비합니다.",
      "The world is written as data, confirmed by the server, and the Godot stage consumes the definition.",
    ),
    background: [
      t(
        "가상 스튜디오의 공간은 코드 곳곳에 흩어져 있지 않고 데이터로 표현됩니다. 지금 무대가 소비하는 것은 Godot 공간 정의 v1입니다. 크기, 문 위치, 바닥 종류, 배경 GLB 참조, 구역과 소품, NPC 이동 경로까지가 하나의 정의 안에 들어갑니다. 정적 기본 정의는 빌드와 함께 배포되는 카탈로그(spaces.json)에 있고, 작품별 저장본이 있으면 Core API에서 받은 정의가 우선합니다.",
        "The virtual studio's space is not scattered through the code; it is expressed as data. What the stage now consumes is the Godot space definition v1. Size, door position, floor kind, a background GLB reference, zones and props, and NPC paths all fit inside one definition. The static default definitions live in a catalog (spaces.json) shipped with the build, and a per-work saved layout from the Core API wins when one exists.",
      ),
      t(
        "검증은 zod 스키마가 맡고 상한이 분명합니다. 구역은 최대 24개, 소품은 최대 64개, NPC는 최대 6명까지만 정의할 수 있고, 배경 GLB 참조 같은 문자열에도 길이 상한이 있습니다. 편집 저장은 revision을 들고 가며, 서버에 저장된 revision과 어긋나면 충돌(409)로 거절돼 셸이 재조회 동선을 제시합니다. 실시간 채널에는 정의 전체가 아니라 revision 알림만 흐릅니다.",
        "Validation belongs to a zod schema with clear caps. A definition may hold at most 24 zones, 64 props and 6 NPCs, and strings such as the background GLB reference have length caps too. A layout save carries a revision, and a mismatch with the server revision is rejected as a conflict (409) so the shell can offer a reload path. Only a revision notice flows over the realtime channel, not the whole definition.",
      ),
      t(
        "서버 발행 월드 쪽에는 월드 매니페스트 계약이 따로 살아 있습니다. 매니페스트는 방·충돌·스폰 같은 공간 정보를 담고, 발행 때는 JSON 바이트 기준 2MiB 상한과 구조·의미 검증을 거치며, 발행 기록은 리비전과 콘텐츠 해시를 남깁니다. 웹의 검증기는 여기에 엔티티 총량 4,096개 같은 상한을 더해 한 번 더 확인합니다. 무대가 바뀌어도 서버가 월드를 확정한다는 원칙은 그대로입니다.",
        "On the server-published side, the world manifest contract lives on separately. The manifest holds spatial information such as rooms, colliders and spawns, and publishing passes a 2 MiB cap measured in JSON bytes plus structure and meaning checks, leaving a revision and a content hash in the record. The web validator adds caps such as 4,096 total entities and checks once more. The stage changed, but the principle that the server confirms the world did not.",
      ),
      t(
        "초기 Phaser 구현은 2026-10 Godot로 교체됐습니다. 이전 데이터 동선이던 Tiled JSON 어댑터와 타일 청크 렌더러는 웹 코드에서 사라졌고, 타일맵 관련 상수는 발행 매니페스트 스키마 쪽에만 계약으로 남아 있습니다. 지금 공간을 바꾸는 정식 동선은 공간 정의를 편집해 저장하고 무대가 새 정의를 받는 것입니다.",
        "The early Phaser implementation was replaced by Godot in 2026-10. The Tiled JSON adapter and tile chunk renderer of the old data path are gone from the web code, and tilemap constants remain only as a contract inside the published manifest schema. The supported way to change a space now is to edit and save a space definition and let the stage receive the new definition.",
      ),
    ],
    keyPoints: [
      t("무대는 Godot 공간 정의 v1을 소비합니다", "The stage consumes the Godot space definition v1"),
      t("구역 24개·소품 64개·NPC 6명 상한", "Caps of 24 zones, 64 props and 6 NPCs"),
      t("발행 매니페스트는 2MiB 상한과 해시 기록", "The published manifest has a 2 MiB cap and a hash record"),
    ],
    diagram: {
      id: "tiled-world-data-model-diagram",
      kind: "graph",
      title: t("공간 정의와 매니페스트가 무대에 닿기까지", "How definitions and the manifest reach the stage"),
      caption: t(
        "정의는 검증과 저장을 거쳐 무대가 소비하고, 발행 월드는 서버가 리비전으로 확정합니다.",
        "Definitions pass validation and storage before the stage consumes them, and published worlds are confirmed by the server with revisions.",
      ),
      alt: t(
        "공간 정의가 카탈로그와 저장 레이아웃에서 와서 스키마 검증을 거친 뒤 Godot 무대가 소비합니다. 검증에 실패하면 기본 정의를 씁니다. 한편 월드 매니페스트는 서버 발행으로 리비전과 해시가 확정됩니다.",
        "A space definition comes from the catalog and the saved layout, passes schema validation and is consumed by the Godot stage. A validation failure uses the default definition. Meanwhile the world manifest is confirmed by server publication with a revision and a hash.",
      ),
      nodes: [
        { id: "catalog", label: t("기본 카탈로그", "Default catalog"), sub: t("spaces.json", "spaces.json"), tone: "neutral", shape: "cylinder", at: [0, 0] },
        { id: "layout", label: t("저장 레이아웃", "Saved layout"), sub: t("작품별 정의와 revision", "Per-work definition and revision"), tone: "local", at: [1, 0] },
        { id: "check", label: t("스키마 검증", "Schema check"), sub: t("구조와 상한", "Shape and caps"), tone: "warn", shape: "diamond", at: [2, 0] },
        { id: "definition", label: t("공간 정의 v1", "Space definition v1"), sub: t("구역·소품·배경 GLB", "Zones, props, background GLB"), tone: "good", at: [3, 0] },
        { id: "stage", label: t("Godot 무대", "Godot stage"), sub: t("정의의 소비자", "Consumer of the definition"), tone: "local", at: [4, 0] },
        { id: "notice", label: t("revision 알림", "Revision notice"), sub: t("실시간 채널에는 알림만", "Only a notice on the realtime channel"), tone: "local", at: [5, 0] },
        { id: "fallback", label: t("기본 정의", "Default definition"), sub: t("검증 실패 시 대체", "Used when checks fail"), tone: "warn", at: [2, 1] },
        { id: "publish", label: t("서버 발행", "Server publish"), sub: t("매니페스트·해시 확정", "Manifest and hash confirmed"), tone: "good", at: [3, 1] },
      ],
      edges: [
        { from: "catalog", to: "layout", label: t("우선순위", "priority") },
        { from: "layout", to: "check", label: t("검증", "validate") },
        { from: "check", to: "definition", label: t("통과", "pass") },
        { from: "check", to: "fallback", label: t("실패", "fail"), style: "dashed" },
        { from: "definition", to: "stage", label: t("소비", "consume") },
        { from: "stage", to: "notice", label: t("알림", "notify") },
        { from: "definition", to: "publish", label: t("발행본은 서버 확정", "server-confirmed"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("Godot 공간 정의와 카탈로그", "Godot space definition and catalog"),
        role: t(
          "공간 정의 v1의 zod 스키마와 상한을 정의하고, 정적 카탈로그와 작품별 저장 레이아웃을 읽어 무대에 넘깁니다.",
          "It defines the zod schema and caps of space definition v1 and reads the static catalog and per-work saved layouts for the stage.",
        ),
        paths: [`${V}/studio-godot-space.ts`, "apps/web/public/godot-space/spaces.json"],
      },
      {
        feature: t("배치 편집 패널", "Layout editing panel"),
        role: t(
          "셸의 패널에서 구역과 소품 배치를 편집해 저장하고, revision 충돌이면 재조회 동선을 보여 줍니다.",
          "The shell panel edits zone and prop layout and saves it, showing a reload path on a revision conflict.",
        ),
        paths: [`${V}/StudioGodotLayoutPanel.tsx`, `${V}/StudioGodotSpaceEmbed.tsx`],
      },
      {
        feature: t("월드 검증(웹·서버 공용)", "World validation (shared by web and server)"),
        role: t(
          "서버와 웹이 같은 스키마로 매니페스트 구조와 크기를 확인하고, 웹이 엔티티 상한 같은 의미를 한 번 더 확인합니다.",
          "Server and web check manifest structure and size with the same schema, and the web checks meaning such as entity caps once more.",
        ),
        paths: [
          `${V}/studio-virtual-space-world-manifest.ts#validateStudioWorldManifest`,
          "packages/studio-project-model/src/graph/world-publication.ts",
        ],
      },
      {
        feature: t("타운 배치 모듈", "Town layout module"),
        role: t(
          "광장과 랜드마크 같은 타운 배치 정보를 순수 모듈로 계산해 월드 표현에 씁니다.",
          "Town layout information such as plazas and landmarks is computed in a pure module for world presentation.",
        ),
        paths: [`${V}/studio-virtual-space-town-layout.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("Godot 공간 정의 v1의 상한", "Caps of the Godot space definition v1"),
        language: "ts",
        code: `// Godot 공간 정의 v1의 상한: 구역 24개, 소품 64개, NPC 6명(단순화).
import { z } from "zod";

export const GodotSpaceDefinitionShape = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  zones: z.array(z.unknown()).max(24),
  props: z.array(z.unknown()).max(64),
  npcs: z.array(z.unknown()).max(6).optional(),
});`,
        codeEn: `// Caps of the Godot space definition v1: 24 zones, 64 props, 6 NPCs (simplified).
import { z } from "zod";

export const GodotSpaceDefinitionShape = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  zones: z.array(z.unknown()).max(24),
  props: z.array(z.unknown()).max(64),
  npcs: z.array(z.unknown()).max(6).optional(),
});`,
        explain: t(
          "정의가 무대에 닿기 전에 개수와 길이 상한을 먼저 봅니다. 상한을 넘는 정의는 무대가 아니라 검증 단계에서 거절됩니다.",
          "Counts and length caps are checked before a definition reaches the stage. An over-cap definition is rejected at validation, not by the stage.",
        ),
        source: `${V}/studio-godot-space.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("매니페스트 바이트 상한 확인", "Checking the manifest byte cap"),
        language: "ts",
        code: `// 월드 매니페스트는 JSON 바이트 기준 2MiB를 넘으면 발행할 수 없다(단순화).
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

export function manifestFitsBudget(manifest: unknown): boolean {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;
  return bytes <= MAX_MANIFEST_BYTES;
}`,
        codeEn: `// A world manifest over 2 MiB in JSON bytes cannot be published (simplified).
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

export function manifestFitsBudget(manifest: unknown): boolean {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;
  return bytes <= MAX_MANIFEST_BYTES;
}`,
        explain: t(
          "문자 수가 아니라 인코딩된 바이트로 재기 때문에 한글처럼 멀티바이트 문자가 많은 월드도 같은 기준으로 판정합니다.",
          "It measures encoded bytes rather than character count, so worlds rich in multibyte characters such as Korean are judged by the same standard.",
        ),
        source: "packages/studio-project-model/src/graph/world-publication.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "Godot Engine docs", url: "https://docs.godotengine.org/en/stable/", kind: "docs", note: t("정의를 소비하는 무대 엔진", "The stage engine that consumes definitions") },
      { title: "Zod", url: "https://zod.dev/", kind: "docs", note: t("정의와 매니페스트의 검증 스키마", "The validation schema for definitions and manifests") },
      { title: "MDN · JSON", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON", kind: "docs", note: t("정의와 카탈로그의 직렬화 형식", "The serialization format of definitions and the catalog") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "월드는 데이터로 적습니다. 무대가 소비하는 Godot 공간 정의 v1은 구역 24개, 소품 64개, NPC 6명 같은 상한을 zod 스키마로 검증받고, 저장은 revision 충돌로 동시 편집을 막습니다. 서버 발행 월드의 매니페스트는 2MiB 상한과 해시 기록을 거칩니다. 초기 Tiled 동선은 2026-10 Godot 교체로 사라졌습니다.",
        "The world is written as data. The Godot space definition v1 that the stage consumes is validated by a zod schema with caps such as 24 zones, 64 props and 6 NPCs, and saves are guarded against concurrent edits by revision conflicts. The server-published world manifest passes a 2 MiB cap and a hash record. The early Tiled path disappeared with the 2026-10 Godot replacement.",
      ),
      analogy: t(
        "건축 도면과 인허가의 관계입니다. 도면(정의)은 양식과 상한을 지켜야 접수되고, 접수 번호(revision)가 찍힌 도면만 공사 현장(무대)에 전달됩니다.",
        "It is like architectural plans and their permit. Plans (definitions) are accepted only in the right form and within caps, and only a plan stamped with a filing number (revision) reaches the construction site (the stage).",
      ),
      questions: [
        {
          question: t("지금 월드는 무엇으로 편집하나요?", "What edits a world now?"),
          answer: t(
            "셸의 배치 패널에서 공간 정의를 편집해 저장합니다. 저장본이 없으면 빌드와 함께 배포되는 기본 카탈로그 정의를 씁니다.",
            "You edit a space definition in the shell's layout panel and save it. Without a saved layout, the default catalog definition shipped with the build is used.",
          ),
        },
        {
          question: t("동시에 편집하면 어떻게 되나요?", "What happens with concurrent edits?"),
          answer: t(
            "저장은 revision을 들고 가고, 서버 값과 어긋나면 충돌(409)로 거절됩니다. 셸은 그 경우 재조회 동선을 제시합니다.",
            "A save carries a revision, and a mismatch with the server value is rejected as a conflict (409). The shell then offers a reload path.",
          ),
        },
        {
          question: t("Tiled로 만든 월드는 이제 못 쓰나요?", "Can Tiled-made worlds no longer be used?"),
          answer: t(
            "웹 코드의 Tiled 어댑터와 타일 청크 경로는 Godot 교체 때 제거됐습니다. 지금의 정식 동선은 공간 정의 v1이며, 타일맵 상수는 발행 매니페스트 스키마의 계약으로만 남아 있습니다.",
            "The web code's Tiled adapter and tile chunk path were removed in the Godot replacement. The supported path now is space definition v1, and tilemap caps remain only as a contract in the published manifest schema.",
          ),
        },
      ],
      pitfall: t(
        "'Tiled로 만든 월드를 청크로 그린다'고 현행처럼 말하지 마세요. 그 경로는 2026-10 Godot 교체로 제거됐습니다. 지금 말할 수 있는 것은 공간 정의 v1의 상한과 revision 저장, 발행 매니페스트의 2MiB 상한과 해시입니다.",
        "Do not say that Tiled-made worlds are drawn in chunks as if that were current. That path was removed in the 2026-10 Godot replacement. What can be stated now is the space definition v1 caps and revision saves, and the published manifest's 2 MiB cap and hash.",
      ),
    },
    technologies: ["Godot", "Zod", "TypeScript"],
    facts: [
      { value: "24개", label: t("Godot 공간 정의의 구역 수 상한(zones max)", "Zone count cap of the Godot space definition (zones max)"), source: `${V}/studio-godot-space.ts` },
      { value: "64개", label: t("Godot 공간 정의의 소품 수 상한(props max)", "Prop count cap of the Godot space definition (props max)"), source: `${V}/studio-godot-space.ts` },
      { value: "2 MiB", label: t("월드 매니페스트 크기 상한(JSON 바이트, 설계값)", "World manifest size cap (JSON bytes, design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "4,096개", label: t("월드 엔티티 총량 상한(STUDIO_WORLD_MAX_ENTITIES, 설계값)", "Total world entity cap (STUDIO_WORLD_MAX_ENTITIES, design value)"), source: `${V}/studio-virtual-space-world-manifest.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
