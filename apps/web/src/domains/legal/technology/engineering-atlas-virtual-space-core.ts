import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 1: 전체 지도 · Phaser 무대 수명주기 · 렌더 품질 등급 · 월드 데이터.
 * 경로·수치는 2026-10-21 기준 코드에서 직접 확인한 값이다. 3D 무대(Godot·Unity)는
 * 2026-10-21 제거됐고, 이 파일의 카드는 모두 Phaser 2D 체제의 사실을 서술한다.
 */

const V = "apps/web/src/domains/creator/virtual-space";

export const VIRTUAL_SPACE_CORE_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "virtual-studio-architecture-overview",
    category: "virtual-space",
    name: "Virtual Studio",
    title: t("Phaser 캔버스와 웹 셸이 한 화면에 있는 협업 공간의 전체 지도", "The whole map of a collaboration space where a Phaser canvas and the web shell share one screen"),
    status: "live",
    tagline: t(
      "공간은 웹 앱 안의 Phaser 캔버스가 그리고, 계정·채팅·업무 패널도 같은 화면의 웹 앱이 맡습니다.",
      "A Phaser canvas inside the web app draws the space, and the same screen's web app owns accounts, chat and work panels.",
    ),
    background: [
      t(
        "가상 스튜디오는 팀원이 아바타로 공간을 걸어 다니며 가까워지면 만나고 대화하는 협업 공간입니다. 지금의 공간은 웹 앱 한 화면 안에서 돌아갑니다. 걷고 만나는 무대는 웹 앱이 같은 문서에 직접 띄우는 Phaser 캔버스이고, 웹 앱이 계정 세션과 티켓 발급, 채팅과 회의·배치 같은 업무 패널, 한글 입력을 맡고, 캔버스는 공간 렌더와 이동, 구역 판정을 맡습니다.",
        "The virtual studio is a collaboration space where teammates walk around as avatars and meet and talk when they get close. The space now runs inside one web app screen. The stage you walk and meet in is a Phaser canvas the web app mounts directly in the same document, and the web app owns the account session and ticket issuing, chat and work panels such as meetings and layout, and Korean text input, while the canvas owns spatial rendering, movement and zone decisions.",
      ),
      t(
        "캔버스와 셸은 같은 프로세스 안에서 계약으로만 대화합니다. 캔버스에서 셸로는 엔진 브리지 객체와 콜백으로 준비 상태, 구역 변화, 근접 변화 같은 통지가 오고, 셸에서 캔버스로는 같은 브리지를 통해 이모트·순간이동 같은 요청과 조이스틱 입력이 갑니다. 어느 쪽도 상대의 내부 상태를 직접 만지지 않으므로, 렌더 방식을 바꿔도 셸의 계정·업무 기능은 그대로 남습니다.",
        "The canvas and the shell talk only through contracts inside the same process. From the canvas to the shell, notifications such as engine status, zone changes and proximity changes arrive through an engine bridge object and callbacks, and from the shell to the canvas, requests such as emotes and teleports and joystick input go through the same bridge. Neither side touches the other's internals, so changing how rendering works leaves the shell's account and work features untouched.",
      ),
      t(
        "월드 데이터의 진실은 여전히 서버가 갖습니다. 공간 정의는 정적 기본값에서 시작해 작품별 저장본이 있으면 그것이 우선하고, 월드 발행은 기대 리비전을 확인하는 CAS 방식으로 리비전과 콘텐츠 해시를 기록합니다. 무대는 한때 Godot로 교체된 적이 있으나 2026-10-21 3D 무대가 제거되면서 Phaser 캔버스가 유일한 무대로 복귀했습니다. 걷기·충돌·카메라는 웹 캔버스가 맡고, 웹 모듈은 프레즌스 프로토콜과 월드 매니페스트 같은 계약도 함께 다룹니다.",
        "The server still owns the truth of world data. A space definition starts from a static default, a per-work saved layout wins when one exists, and world publication records a revision and a content hash through a CAS check of the expected revision. The stage was once replaced by Godot, but when the 3D stages were removed on 2026-10-21 the Phaser canvas returned as the only stage. A web canvas draws walking, collisions and the camera, and the web modules also cover contracts such as the presence protocol and the world manifest.",
      ),
      t(
        "이 카드는 지도입니다. 실시간 전송 자체는 협업·WebRTC 카테고리 카드가 다루고, 이 파일의 이어지는 카드는 캔버스의 수명과 지연 로딩, 렌더 품질 등급, 월드 데이터 모델을 각각 설명합니다. 영상 회의는 사용자가 직접 켜는 옵트인 기능이며, 공간에 들어왔다는 사실 자체가 어떤 권한도 주지 않습니다.",
        "This card is the map. The realtime transports themselves are covered by the collaboration and WebRTC cards, and the following cards in this file explain the canvas lifecycle and lazy loading, the render quality tiers, and the world data model. Video meetings are an opt-in feature each user switches on, and merely entering the space grants no permission at all.",
      ),
    ],
    keyPoints: [
      t("무대는 Phaser 캔버스, 계정·업무도 같은 화면", "The stage is a Phaser canvas; accounts and work share the screen"),
      t("캔버스와 셸은 브리지 객체와 콜백으로만 통신", "Canvas and shell talk only through a bridge object and callbacks"),
      t("월드 데이터의 진실은 서버가 확정", "The server confirms the truth of world data"),
      t("공간은 권한이 아니라 안내판", "Space is a signpost, not a permission"),
    ],
    diagram: {
      id: "virtual-studio-architecture-overview-diagram",
      kind: "layers",
      title: t("가상 스튜디오의 한 화면 구조", "The one-screen structure of the virtual studio"),
      caption: t(
        "위는 업무 패널과 웹 셸, 아래는 Phaser 캔버스와 서버이며, 경계는 브리지 객체뿐입니다.",
        "Work panels and the web shell sit on top, the Phaser canvas and server below, and a bridge object is the only boundary.",
      ),
      alt: t(
        "여섯 층이 위에서 아래로 쌓여 있습니다. 위부터 회의·채팅 패널, 웹 셸, 브리지, Phaser 캔버스, 서버 권위, 월드 데이터입니다. 웹 셸이 계정과 업무를 맡고 Phaser 캔버스가 공간을 그리며, 아래 두 층이 월드 원본을 갖습니다.",
        "Six layers are stacked from top to bottom: meeting and chat panels, the web shell, the bridge, the Phaser canvas, server authority and world data. The web shell owns accounts and work, the Phaser canvas draws the space, and the bottom two layers own the world source.",
      ),
      layers: [
        { id: "people", label: t("회의·채팅 패널", "Meeting and chat panels"), sub: t("셸이 여는 업무 패널 · 영상은 사용자가 켬", "Work panels opened by the shell · video is user-enabled"), tone: "local", chips: ["WebRTC"] },
        { id: "shell", label: t("웹 셸", "Web shell"), sub: t("계정·티켓·한글 입력·연결 상태 표기", "Accounts, tickets, Korean input, status display"), tone: "local" },
        { id: "bridge", label: t("브리지", "Bridge"), sub: t("엔진 브리지 객체 · 콜백 props", "Engine bridge object and callback props"), tone: "neutral" },
        { id: "stage", label: t("Phaser 캔버스", "Phaser canvas"), sub: t("공간 렌더·이동·구역 판정 (같은 문서에 마운트)", "Spatial rendering, movement, zones (mounted in the same document)"), tone: "local", chips: ["Phaser", "Canvas"] },
        { id: "authority", label: t("서버 권위", "Server authority"), sub: t("월드 발행(CAS)·권한·티켓 발급", "Publish (CAS), permissions, ticket issuing"), tone: "server", chips: ["NestJS", "Supabase PostgreSQL"] },
        { id: "world", label: t("월드 데이터", "World data"), sub: t("월드 매니페스트 · 공간 정의", "World manifest and space definition"), tone: "neutral", chips: ["Zod"] },
      ],
      brackets: [
        { label: t("브라우저 안 (셸과 캔버스)", "In the browser (shell and canvas)"), layerIds: ["people", "shell", "bridge", "stage"] },
        { label: t("서버·저장소 (원본)", "Server and storage (source)"), layerIds: ["authority", "world"] },
      ],
    },
    usage: [
      {
        feature: t("협업 스튜디오 · 공간 화면", "Collaboration studio · spatial screen"),
        role: t(
          "페이지 셸이 입장 동선과 계정을 확인한 뒤 Phaser 캔버스를 같은 화면에 조립합니다.",
          "The page shell checks the entry flow and the account, then assembles the Phaser canvas on the same screen.",
        ),
        paths: [`${V}/StudioVirtualSpacePageRoot.tsx`, `${V}/StudioVirtualSpacePage.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("Phaser 캔버스 무대", "Phaser canvas stage"),
        role: t(
          "같은 문서에 캔버스를 직접 생성하고 엔진 브리지로 셸과 요청·통지를 주고받으며, 회의·배치 패널은 셸 쪽에 엽니다.",
          "It creates the canvas directly in the same document, exchanges requests and notifications with the shell through the engine bridge, and the meeting and layout panels open on the shell side.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx`, `${V}/studio-virtual-space-engine-bridge.ts`],
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
          "위치·상태 패킷의 와이어 형식을 캔버스와 셸이 함께 쓰는 순수 모듈로 정의합니다.",
          "A pure module shared by the canvas and the shell defines the wire format of position and state packets.",
        ),
        paths: [`${V}/studio-virtual-space-presence.ts`, `${V}/studio-virtual-space-presence-protocol.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("캔버스가 Phaser 게임을 마운트", "The canvas mounts the Phaser game"),
        language: "ts",
        code: `import Phaser from "phaser";
class StageScene extends Phaser.Scene {
  constructor() { super("ToonStudioVirtualStudio"); }
}
// 무대 빌드는 따로 없다. 캔버스가 같은 문서의 div에 게임을 직접 만든다(단순화).
export function mountStage(mount: HTMLElement): Phaser.Game {
  return new Phaser.Game({ type: Phaser.AUTO, parent: mount, scene: StageScene });
}`,
        codeEn: `import Phaser from "phaser";
class StageScene extends Phaser.Scene {
  constructor() { super("ToonStudioVirtualStudio"); }
}
// There is no separate stage build. The canvas creates the game in a div of the same document (simplified).
export function mountStage(mount: HTMLElement): Phaser.Game {
  return new Phaser.Game({ type: Phaser.AUTO, parent: mount, scene: StageScene });
}`,
        explain: t(
          "Phaser는 앱 번들의 청크로 지연 로드되고, 캔버스는 마운트한 div 안에 게임 캔버스를 직접 생성합니다. 정적 파일로 서빙되는 별도 무대 빌드는 없습니다.",
          "Phaser lazy-loads as a chunk of the app bundle, and the canvas creates the game canvas directly inside the div it mounts. There is no separate stage build served as static files.",
        ),
        source: `${V}/StudioVirtualSpacePhaserCanvas.tsx`,
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
      { title: "Phaser docs", url: "https://docs.phaser.io/", kind: "docs", note: t("무대 엔진의 공식 문서", "Official docs of the stage engine") },
      { title: "MDN · Canvas API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API", kind: "docs", note: t("캔버스가 그려지는 바탕", "The surface the canvas draws on") },
      { title: "MDN · WebRTC API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API", kind: "docs", note: t("회의 패널 영상의 바탕", "Basis of meeting panel video") },
      { title: "Zod", url: "https://zod.dev/", kind: "docs", note: t("웹·서버가 함께 쓰는 월드 스키마", "The world schema shared by web and server") },
    ],
    chapterIds: ["virtual-studio-world-authority", "architecture"],
    talk: {
      pitch: t(
        "가상 스튜디오는 웹 앱 한 화면 안의 Phaser 캔버스와 셸이 함께 만드는 협업 공간입니다. 캔버스가 공간 렌더와 이동을 맡고, 셸이 계정·티켓·채팅·업무 패널·한글 입력을 맡으며, 둘은 브리지 객체와 콜백으로만 대화합니다. 월드 데이터의 진실은 서버가 발행 리비전과 해시로 확정합니다. 3D 무대는 2026-10-21 제거됐고 Phaser가 유일한 무대입니다.",
        "The virtual studio is a collaboration space built by a Phaser canvas and the shell inside one web app screen. The canvas owns spatial rendering and movement, the shell owns accounts, tickets, chat, work panels and Korean input, and the two talk only through a bridge object and callbacks. The server confirms world truth with publication revisions and hashes. The 3D stages were removed on 2026-10-21, and Phaser is the only stage.",
      ),
      analogy: t(
        "무대와 분장실이 한 건물 안에 있는 극장과 같습니다. 배우(캔버스)는 연기만 하고, 표와 안내와 자막(셸)은 극장 직원이 맡으며, 둘은 약속된 신호로만 소통합니다.",
        "It is like a theatre whose stage and backstage crew share one building. The actors (the canvas) only perform, while tickets, guidance and subtitles (the shell) belong to the staff, and the two communicate only through agreed signals.",
      ),
      questions: [
        {
          question: t("왜 무대를 웹 코드로 직접 그리나요?", "Why is the stage drawn by web code directly?"),
          answer: t(
            "계정·채팅·업무 패널과 한글 입력이 이미 웹 기술 위에 있어, 공간 연출까지 같은 앱이 맡으면 배포와 수정이 한 번에 끝납니다. 걷고 만나는 연출은 Phaser가 맡고, 나머지는 웹 앱이 맡는 구조입니다.",
            "Accounts, chat, work panels and Korean input already live on web technology, so when the same app also owns the stage, shipping and fixing take one step. Phaser owns the walking-and-meeting staging and the web app owns the rest.",
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
          question: t("캔버스와 셸은 어떻게 통신하나요?", "How do the canvas and shell communicate?"),
          answer: t(
            "캔버스에서 셸로는 엔진 브리지 객체와 콜백으로 통지가 오고, 셸에서 캔버스로는 같은 브리지를 통해 요청이 갑니다. 티켓 같은 자격 정보는 캔버스에 주입되지 않고 협업 전송 층이 소비합니다.",
            "Notifications come from the canvas to the shell through an engine bridge object and callbacks, and requests go from the shell to the canvas through the same bridge. Credentials such as tickets are never injected into the canvas; the collaboration transport layer consumes them.",
          ),
        },
      ],
      pitfall: t(
        "Godot 무대를 현행처럼 말하지 마세요. Godot·Unity 3D 무대는 2026-10-21 제거됐고, 지금 웹 코드가 직접 그리는 Phaser 캔버스가 유일한 무대입니다. 방당 연결 상한 64도 검증된 수용량이 아니라 설정값입니다.",
        "Do not describe the Godot stage as current. The Godot and Unity 3D stages were removed on 2026-10-21, and the Phaser canvas the web code draws directly is the only stage now. The 64-per-room cap is also a configured value, not a verified capacity.",
      ),
    },
    technologies: ["Phaser", "React", "TypeScript", "Zod", "NestJS", "Supabase PostgreSQL"],
    facts: [
      { value: "/assets/virtual-studio/world/default-world.json", label: t("기본 월드(Tiled 맵) 경로 상수(DEFAULT_STUDIO_TILED_MAP_URL)", "Default world (Tiled map) path constant (DEFAULT_STUDIO_TILED_MAP_URL)"), source: `${V}/studio-virtual-space-world-loader.ts` },
      { value: "2 MiB", label: t("월드 매니페스트 크기 상한(설계값)", "World manifest size cap (design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "64", label: t("실시간 룸당 연결 상한(REALTIME_MAX_CONNECTIONS_PER_ROOM, 설정값)", "Max connections per realtime room (REALTIME_MAX_CONNECTIONS_PER_ROOM, configured)"), source: "deploy/cloudflare-realtime/wrangler.jsonc" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "phaser-lazy-scene-lifecycle",
    category: "virtual-space",
    name: "Virtual Studio · Phaser stage",
    title: t("필요할 때만 받는 Phaser 무대와 캔버스 장면의 한살이", "A Phaser stage fetched on demand, and the life of its canvas scene"),
    status: "live",
    tagline: t(
      "공간에 들어갈 때만 무대를 받고, 캔버스는 장면을 만들고 지우며 한살이를 마칩니다.",
      "The stage is fetched only on entry, and the canvas creates and destroys its scene over its life.",
    ),
    background: [
      t(
        "Phaser 무대는 웹 앱 번들의 청크입니다. 공간을 쓰지 않는 사용자까지 무대 파일을 받게 하면 낭비라서, 공간 페이지 자체를 라우트 지연 로딩으로 받고 엔진(Phaser)도 캔버스가 마운트될 때 동적으로 불러옵니다. 극장에 비유하면 손님이 입장할 때만 무대를 세우고, 나가면 캔버스를 파괴해 정리하는 방식입니다.",
        "The Phaser stage is a chunk of the web app bundle. Making users who never open the studio download the stage files would be wasteful, so the spatial page itself is lazy-loaded by the router and the engine (Phaser) is also loaded dynamically when the canvas mounts. Think of a theatre that builds the stage only when guests enter, and destroys the canvas to clean up when they leave.",
      ),
      t(
        "순서는 이렇습니다. 페이지가 엔진 브리지 객체를 만들어 캔버스에 prop으로 넘깁니다. 캔버스가 마운트되면 Phaser를 동적으로 불러와 장면을 정의하고, 장면은 preload에서 텍스처를 받고 create에서 월드와 아바타를 세웁니다. 준비 상태는 loading·ready·error 세 값으로 셸에 콜백됩니다. 실시간 티켓은 캔버스가 아니라 협업 전송 층이 발급·갱신하고, 캔버스는 티켓을 받지 않습니다.",
        "The order is: the page creates an engine bridge object and passes it to the canvas as a prop. When the canvas mounts it loads Phaser dynamically and defines the scene, and the scene receives textures in preload and builds the world and avatars in create. Readiness is reported to the shell as one of three values: loading, ready or error. Realtime tickets are issued and renewed by the collaboration transport layer, not the canvas, and the canvas never receives a ticket.",
      ),
      t(
        "실패와 특수한 경우도 상태로 드러납니다. 엔진 상태가 error이면 다시 시도 버튼이 시도를 올려 캔버스를 새로 마운트합니다. 불러오기가 느리면 8초를 넘긴 시점에 느린 연결 안내가 뜨고, 부팅이 멈춘 구간은 제한 시간으로 판정해 오류로 넘깁니다. 개인 공간처럼 티켓을 발급할 수 없는 경우에는 같은 캔버스를 발행·전송 없이 여는 모드로 동작합니다. 게스트 접속은 접근 게이트를 거친 뒤 viewer 역할로 조립됩니다.",
        "Failures and special cases surface as state too. When the engine status is error, a retry button raises the attempt count and mounts the canvas afresh. If loading is slow, a slow-connection notice appears after eight seconds, and a stalled boot is judged by a time limit and turned into an error. When no ticket can be issued, as in a personal space, the same canvas opens in a mode without publication or transport. Guest access passes an access gate and is then assembled with the viewer role.",
      ),
      t(
        "이 수명주기는 웹 페이지가 맡는 일입니다. 무대가 한때 Godot 빌드로 교체된 적이 있으나 2026-10-21 제거됐고, 지금은 웹 페이지가 게임 엔진을 동적으로 불러와 장면을 만들고 지우는 구조가 유일한 현행입니다. 그래서 이 카드가 말하는 수명주기는 장면의 preload·create·destroy와 셸이 받는 상태 콜백의 계약입니다.",
        "This lifecycle is the web page's own work. The stage was once replaced by a Godot build, but that was removed on 2026-10-21, and the structure where the web page loads a game engine dynamically and creates and destroys scenes is the only current one. So the lifecycle in this card is the contract of the scene's preload, create and destroy and the status callbacks the shell receives.",
      ),
    ],
    keyPoints: [
      t("공간 페이지와 엔진은 입장할 때만 받습니다", "The page and engine are fetched only on entry"),
      t("장면은 preload·create로 세우고 정리 때 파괴", "The scene is built in preload and create and destroyed on cleanup"),
      t("엔진 상태는 loading·ready·error 세 값", "Engine status has three values: loading, ready, error"),
    ],
    diagram: {
      id: "phaser-lazy-scene-lifecycle-diagram",
      kind: "sequence",
      title: t("입장부터 퇴장까지 Phaser 캔버스의 한살이", "Life of the Phaser canvas from entry to exit"),
      caption: t(
        "페이지가 브리지를 만들어 넘기고, 캔버스는 엔진을 불러와 장면을 세웁니다.",
        "The page creates and passes the bridge, and the canvas loads the engine and builds the scene.",
      ),
      alt: t(
        "사용자가 공간에 입장하면 React 셸이 라우트 청크를 받고 엔진 브리지 객체를 만들어 캔버스에 넘깁니다. 캔버스는 Phaser를 동적으로 불러와 장면을 preload·create로 세우고 준비 상태를 콜백합니다. 나갈 때는 effect 정리가 게임을 파괴하고 마운트를 지웁니다.",
        "When the user enters, the React shell receives the route chunk, creates an engine bridge object and passes it to the canvas. The canvas loads Phaser dynamically, builds the scene in preload and create, and calls back its readiness. On exit the effect cleanup destroys the game and removes the mount.",
      ),
      actors: [
        { id: "user", label: t("사용자", "User"), tone: "local" },
        { id: "shell", label: t("React 셸", "React shell"), sub: t("페이지 조립", "Page assembly"), tone: "local" },
        { id: "stage", label: t("Phaser 캔버스", "Phaser canvas"), sub: t("같은 문서의 캔버스", "Canvas in the same document"), tone: "local" },
        { id: "server", label: t("티켓 발급", "Ticket issuer"), sub: t("실시간 티켓", "Realtime ticket"), tone: "warn" },
      ],
      messages: [
        { from: "user", to: "shell", label: t("공간에 입장", "Enter the studio"), note: t("라우트 청크를 먼저 받음", "The route chunk loads first") },
        { from: "shell", to: "stage", label: t("브리지 객체 전달", "Pass the bridge object"), note: t("prop으로 같은 프로세스 안", "As a prop, in the same process") },
        { from: "stage", to: "stage", label: t("Phaser 동적 로드", "Load Phaser dynamically"), note: t("await import(\"phaser\")", "await import(\"phaser\")") },
        { from: "stage", to: "stage", label: t("장면 preload·create", "Scene preload and create"), note: t("텍스처와 월드를 세움", "Builds textures and the world") },
        { from: "stage", to: "shell", label: t("준비 상태 콜백", "Readiness callback"), style: "dashed", note: t("loading · ready · error", "loading · ready · error") },
        { from: "shell", to: "server", label: t("티켓 발급 요청", "Request a ticket"), note: t("협업 전송 층이 소비", "Consumed by the transport layer") },
        { from: "user", to: "shell", label: t("공간에서 나가기", "Leave the studio") },
        { from: "stage", to: "stage", label: t("게임 파괴·마운트 제거", "Destroy the game, remove the mount"), note: t("effect 정리", "Effect cleanup") },
      ],
    },
    usage: [
      {
        feature: t("협업 스튜디오 · 공간 입장", "Collaboration studio · entering the studio"),
        role: t(
          "캔버스를 같은 문서에 마운트하고 Phaser를 동적으로 불러와 장면을 세우며, 엔진 상태를 화면 상태로 노출합니다.",
          "It mounts the canvas in the same document, loads Phaser dynamically to build the scene, and exposes the engine status as screen state.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("브리지·부팅 보조 모듈", "Bridge and boot support modules"),
        role: t(
          "셸과 캔버스가 주고받는 요청·이벤트 타입과 부팅 진행 감시, 마지막 위치 저장을 React 없는 순수 모듈로 둡니다.",
          "The request and event types exchanged by shell and canvas, boot progress watching and last-position storage live in pure modules without React.",
        ),
        paths: [`${V}/studio-virtual-space-engine-bridge.ts`, `${V}/studio-virtual-space-phaser-canvas-boot-progress.ts`, `${V}/studio-virtual-space-last-position.ts`],
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
type PageLoader = () => Promise<{ default: unknown }>;

function lazyRetry(loader: PageLoader, name: string): PageLoader {
  return async () => {
    try {
      return await loader();
    } catch {
      return loader(); // 실제 구현은 새로고침으로 복구하고, 그래도 실패하면 오류가 위로 올라간다
    }
  };
}

// 실제 등록은 routes 파일이 동적 import 로더를 넘긴다.
export const registerSpacePage = (loader: PageLoader) =>
  lazyRetry(loader, "StudioVirtualSpacePage");`,
        codeEn: `// The studio page chunk is fetched only when its route is entered (simplified).
type PageLoader = () => Promise<{ default: unknown }>;

function lazyRetry(loader: PageLoader, name: string): PageLoader {
  return async () => {
    try {
      return await loader();
    } catch {
      return loader(); // the real one recovers by reloading; a second failure surfaces as an error
    }
  };
}

// The routes file registers it by passing a dynamic-import loader.
export const registerSpacePage = (loader: PageLoader) =>
  lazyRetry(loader, "StudioVirtualSpacePage");`,
        explain: t(
          "공간을 쓰지 않는 사용자는 공간 페이지 청크를 받지 않습니다. 불러오기가 실패하면 lazyRetry가 페이지를 한 번 새로고침해 새 청크를 받습니다.",
          "Users who never open the studio do not download the studio page chunk. When loading fails, lazyRetry reloads the page once to fetch a fresh chunk.",
        ),
        source: "apps/web/src/app/routes/groups/creator-route-pages.ts",
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("정리에서 게임을 파괴", "Destroying the game in cleanup"),
        language: "ts",
        code: `// 캔버스를 마운트하고, 정리 함수를 돌려주어 떠날 때 게임을 파괴한다(단순화).
export function mountCanvasScene(mount: HTMLElement): () => void {
  let game: { destroy: (removeCanvas: boolean) => void } | null = null;
  let cancelled = false;
  void (async () => {
    const Phaser = await import("phaser");
    if (cancelled) return;
    game = new Phaser.Game({ parent: mount, type: Phaser.AUTO });
  })();
  return () => {
    cancelled = true;
    game?.destroy(true);
    mount.remove();
  };
}`,
        codeEn: `// Mounts the canvas and returns a cleanup that destroys the game on exit (simplified).
export function mountCanvasScene(mount: HTMLElement): () => void {
  let game: { destroy: (removeCanvas: boolean) => void } | null = null;
  let cancelled = false;
  void (async () => {
    const Phaser = await import("phaser");
    if (cancelled) return;
    game = new Phaser.Game({ parent: mount, type: Phaser.AUTO });
  })();
  return () => {
    cancelled = true;
    game?.destroy(true);
    mount.remove();
  };
}`,
        explain: t(
          "페이지가 언마운트되면 effect 정리가 게임을 파괴하고 마운트 요소를 제거해, 장면과 텍스처가 메모리에 남지 않습니다.",
          "When the page unmounts, the effect cleanup destroys the game and removes the mount element, so the scene and its textures do not linger in memory.",
        ),
        source: `${V}/StudioVirtualSpacePhaserCanvas.tsx`,
        verify: "types",
      },
    ],
    links: [
      { title: "Phaser docs", url: "https://docs.phaser.io/", kind: "docs", note: t("무대 엔진의 공식 문서", "Official docs of the stage engine") },
      { title: "React · lazy", url: "https://react.dev/reference/react/lazy", kind: "docs", note: t("라우트 지연 로딩의 바탕", "Basis of route-level lazy loading") },
      { title: "MDN · import()", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import", kind: "docs", note: t("동적 import의 동작", "How dynamic import works") },
      { title: "MDN · Page Visibility API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API", kind: "docs", note: t("탭 가시성과 연결 생존성", "Tab visibility and connection liveness") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "Phaser 무대는 공간에 들어갈 때만 받습니다. 공간 페이지는 라우트 지연 로딩이고, 캔버스가 마운트될 때 Phaser를 동적으로 불러와 장면을 preload와 create로 세웁니다. 준비 상태는 loading·ready·error로 셸에 콜백되고, 나갈 때는 게임을 파괴합니다. 3D 무대는 2026-10-21 제거됐습니다.",
        "The Phaser stage is fetched only when you enter the studio. The studio page is route-lazy-loaded, and when the canvas mounts it loads Phaser dynamically and builds the scene in preload and create. Readiness is called back to the shell as loading, ready or error, and leaving destroys the game. The 3D stages were removed on 2026-10-21.",
      ),
      analogy: t(
        "손님이 올 때만 무대를 세우는 극장입니다. 안내 데스크(셸)가 자리를 잡고 무대(캔버스)를 세우면 공연이 시작되고, 손님이 나가면 무대를 철거합니다.",
        "A theatre that builds its stage only when guests arrive. Once the front desk (the shell) takes its place and the stage (the canvas) is built, the show starts, and when the guests leave the stage is struck.",
      ),
      questions: [
        {
          question: t("무대가 처음 로딩에 들어가나요?", "Is the stage part of the first load?"),
          answer: t(
            "아니요. 공간 페이지는 라우트 지연 로딩이고 Phaser 엔진도 캔버스가 마운트될 때 동적으로 불러옵니다. 공간을 쓰지 않는 사용자는 둘 다 받지 않습니다.",
            "No. The studio page is route-lazy-loaded and the Phaser engine is also loaded dynamically when the canvas mounts. Users who never open the studio download neither.",
          ),
        },
        {
          question: t("티켓은 어디에 저장되나요?", "Where is the ticket stored?"),
          answer: t(
            "저장되지 않습니다. 티켓은 협업 전송 층이 메모리에만 두고 저장소·URL·로그에 남기지 않습니다. 캔버스는 티켓을 받지 않습니다.",
            "It is not stored. The collaboration transport layer keeps tickets in memory only, never in storage, URLs or logs. The canvas never receives a ticket.",
          ),
        },
        {
          question: t("연결이 끊기면 사용자는 무엇을 보나요?", "What does the user see when the connection drops?"),
          answer: t(
            "엔진이 실패하면 상태가 error로 바뀌어 다시 시도 동선이 보이고, 불러오기가 8초를 넘기면 느린 연결 안내가 뜹니다. 프레즌스 연결이 끊기면 셸이 재연결 상태를 따로 표기합니다.",
            "When the engine fails, the status changes to error and a retry path appears, and loading past eight seconds shows a slow-connection notice. When the presence connection drops, the shell marks the reconnecting state separately.",
          ),
        },
      ],
      pitfall: t(
        "Godot 임베드 단계를 현행처럼 말하지 마세요. 임베드 8단계와 브리지 ping은 2026-10-21 무대 제거와 함께 사라졌고, 지금 엔진 상태는 loading·ready·error 세 값뿐입니다.",
        "Do not describe the Godot embed phases as current. The eight embed phases and the bridge ping disappeared with the stage removal on 2026-10-21, and the engine status now has only three values: loading, ready and error.",
      ),
    },
    technologies: ["Phaser", "React", "TypeScript", "Vite"],
    facts: [
      { value: "8초", label: t("느린 불러오기 안내 기준(STUDIO_SLOW_LOAD_NOTICE_MS 8_000, 설계값)", "Slow-load notice threshold (STUDIO_SLOW_LOAD_NOTICE_MS 8_000, design value)"), source: `${V}/studio-virtual-space-phaser-canvas-boot-progress.ts` },
      { value: "3", label: t("엔진 상태 값 수(loading·ready·error)", "Engine status values (loading, ready, error)"), source: `${V}/studio-virtual-space-engine-events.ts` },
      { value: "\"ToonStudioVirtualStudio\"", label: t("Phaser 장면 키", "Phaser scene key"), source: `${V}/StudioVirtualSpacePhaserCanvas.tsx` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "renderer-quality-tier-adaptive",
    category: "virtual-space",
    name: "Virtual Studio · Render quality",
    title: t("렌더 품질은 웹 코드가 다섯 등급으로 조절합니다", "Web code adapts render quality across five tiers"),
    status: "live",
    tagline: t(
      "품질 등급·해상도·렌더러 선택은 웹의 품질 모듈이 정하고, 캔버스가 매 프레임 적용합니다.",
      "Quality tiers, resolution and renderer choice are decided by the web quality modules, and the canvas applies them every frame.",
    ),
    background: [
      t(
        "가상 스튜디오의 그림 품질은 웹 코드가 정합니다. 품질 모듈이 다섯 등급(ultra·high·balanced·battery·accessibility)의 프로필을 갖고, 기기 환경과 프레임 속도에 따라 등급을 고르고 오르내립니다. 식당에 비유하면 주방(캔버스)이 요리의 완성도를 책임지되, 레시피와 불 세기 기준은 본사(웹 코드)가 정해 둔 구조입니다.",
        "The picture quality of the virtual studio is decided by web code. A quality module holds profiles for five tiers (ultra, high, balanced, battery, accessibility) and picks and moves the tier by device environment and frame rate. In restaurant terms, the kitchen (the canvas) is responsible for the finished dish, while the recipes and flame standards are set by head office (the web code).",
      ),
      t(
        "자동 등급은 화면 폭과 기기 메모리, 코어 수, 모션 감소 설정으로 처음 정해집니다. 그 뒤 적응 컨트롤러가 매 프레임 표본을 모아, 평활 프레임 속도가 낮은 상태가 3초 이어지면 한 등급 낮추고 높은 상태가 10초 이어지면 한 등급 올리는 히스테리시스로 흔들림을 막습니다. 등급마다 해상도 상한(dprCap), 입자 비율, 동시 NPC 수, 목표 프레임이 다릅니다.",
        "The automatic tier is first chosen from viewport width, device memory, core count and the reduced-motion setting. After that an adaptive controller samples every frame and applies hysteresis: three seconds of low smoothed frame rate steps one tier down, and ten seconds of high frame rate steps one tier up, which prevents flapping. Each tier has its own resolution cap (dprCap), particle ratio, concurrent NPC count and target frame rate.",
      ),
      t(
        "렌더러 선택도 웹 코드의 몫입니다. 하드웨어 WebGL이 가능하면 WebGL로 그리고, 소프트웨어 WebGL(가속 없는 렌더러)이거나 WebGL 자체가 안 되면 Canvas로 폴백합니다. 캔버스는 적용된 등급과 렌더러 종류를 문서 요소의 데이터 속성에 표기해, 어떤 판정이 내려졌는지 화면 밖에서도 확인할 수 있게 합니다.",
        "Renderer choice also belongs to web code. When hardware WebGL is available it draws with WebGL, and when WebGL is software-only (an unaccelerated renderer) or unavailable at all it falls back to Canvas. The canvas writes the applied tier and renderer kind into data attributes on the document element, so the decision can be checked from outside the screen.",
      ),
      t(
        "정직한 경계도 있습니다. 이 카드의 수치는 품질 모듈의 프로필 표에서 직접 확인한 설계값이고, 실제 기기에서의 체감 프레임은 기기마다 달라 수치로 단정하지 않습니다. 텍스처 해상도 적응은 별도 LOD 모듈이 맡아 이 카드의 등급 판정과는 층이 다르고, 문서 렌더링 같은 다른 표면의 품질 엔진과는 무관합니다.",
        "There is an honest boundary. The figures in this card are design values read directly from the quality module's profile table, and perceived frame rates on real devices vary by device, so they are not stated as numbers. Texture resolution adaptation belongs to a separate LOD module on a different layer from this card's tier decisions, and quality engines of other surfaces such as document rendering are unrelated.",
      ),
    ],
    keyPoints: [
      t("품질은 다섯 등급 프로필로 정해집니다", "Quality is set by five tier profiles"),
      t("적응 컨트롤러가 프레임 속도로 등급을 오르내립니다", "An adaptive controller moves tiers by frame rate"),
      t("소프트웨어 WebGL이면 Canvas로 폴백합니다", "Software WebGL falls back to Canvas"),
    ],
    diagram: {
      id: "renderer-quality-tier-adaptive-diagram",
      kind: "layers",
      title: t("품질 판정은 웹 코드의 층", "The layers of web-side quality decisions"),
      caption: t(
        "위층은 자동 판정과 적응, 아래층은 캔버스가 적용하는 렌더링입니다.",
        "The upper layers judge and adapt; the lower layer is the rendering the canvas applies.",
      ),
      alt: t(
        "위에서 아래로 품질 프로필, 자동 등급 판정, 적응 컨트롤러, 렌더러 선택, Phaser 렌더링 층이 쌓여 있습니다. 웹 코드가 위 네 층의 판정을 소유하고, 캔버스는 그 판정을 매 프레임 적용합니다.",
        "From top to bottom the layers are quality profiles, automatic tier choice, the adaptive controller, renderer choice and Phaser rendering. Web code owns the decisions of the top four layers, and the canvas applies them every frame.",
      ),
      layers: [
        { id: "profiles", label: t("품질 프로필 5등급", "Five quality profiles"), sub: t("ultra · high · balanced · battery · accessibility", "ultra · high · balanced · battery · accessibility"), tone: "local" },
        { id: "auto", label: t("자동 등급 판정", "Automatic tier choice"), sub: t("화면 폭·메모리·코어 수·모션 감소", "Viewport, memory, cores, reduced motion"), tone: "local" },
        { id: "adaptive", label: t("적응 컨트롤러", "Adaptive controller"), sub: t("저하 3초 강등 · 상승 10초 승급", "Down after 3 s low, up after 10 s high"), tone: "warn" },
        { id: "renderer", label: t("렌더러 선택", "Renderer choice"), sub: t("하드웨어 WebGL만 WebGL, 아니면 Canvas", "WebGL only for hardware WebGL, else Canvas"), tone: "local" },
        { id: "engine", label: t("Phaser 렌더링", "Phaser rendering"), sub: t("등급의 해상도 상한과 입자 비율 적용", "Applies the tier's resolution cap and particle ratio"), tone: "neutral", chips: ["Phaser"] },
      ],
      brackets: [
        { label: t("웹 코드가 소유하는 판정", "Decisions owned by web code"), layerIds: ["profiles", "auto", "adaptive", "renderer"] },
      ],
    },
    usage: [
      {
        feature: t("공간 화면 · 품질 적용", "Spatial screen · applying quality"),
        role: t(
          "캔버스가 품질 모듈의 프로필로 초기 등급을 정하고, 매 프레임 적응 컨트롤러의 판정을 적용하며 현재 등급을 데이터 속성에 표기합니다.",
          "The canvas sets the initial tier from the quality module's profiles, applies the adaptive controller's decisions every frame, and writes the current tier into a data attribute.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx`, `${V}/studio-virtual-space-quality.ts`],
        route: "/studio/space",
      },
      {
        feature: t("렌더러 판정", "Renderer decision"),
        role: t(
          "WebGL 가용성과 소프트웨어 렌더러 여부를 검사해 WebGL과 Canvas 중 하나를 고르고, 판정 이유를 함께 남깁니다.",
          "It probes WebGL availability and whether the renderer is software, chooses WebGL or Canvas, and records the reason.",
        ),
        paths: [`${V}/studio-virtual-space-renderer.ts`],
      },
      {
        feature: t("사용자 품질 프리셋", "User quality presets"),
        role: t(
          "설정에서 고른 프리셋(auto 포함)이 자동 판정의 시작점이 되고, 접근성 등급은 모션 감소 설정과 함께 동작합니다.",
          "The preset chosen in settings (including auto) is the starting point of the automatic decision, and the accessibility tier works with the reduced-motion setting.",
        ),
        paths: [`${V}/studio-virtual-space-experience-preference.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("품질 등급 다섯 종의 프로필", "Profiles of the five quality tiers"),
        language: "ts",
        code: `// 품질 등급은 다섯 종의 프로필 표로 정해진다(단순화).
type QualityProfile = { tier: string; dprCap: number; targetFps: number; maxActiveNpcs: number };

export const PROFILES: Record<string, QualityProfile> = {
  ultra: { tier: "ultra", dprCap: 2, targetFps: 60, maxActiveNpcs: 10 },
  balanced: { tier: "balanced", dprCap: 1.5, targetFps: 45, maxActiveNpcs: 6 },
  accessibility: { tier: "accessibility", dprCap: 1, targetFps: 30, maxActiveNpcs: 2 },
};`,
        codeEn: `// Quality tiers are set by a table of five profiles (simplified).
type QualityProfile = { tier: string; dprCap: number; targetFps: number; maxActiveNpcs: number };

export const PROFILES: Record<string, QualityProfile> = {
  ultra: { tier: "ultra", dprCap: 2, targetFps: 60, maxActiveNpcs: 10 },
  balanced: { tier: "balanced", dprCap: 1.5, targetFps: 45, maxActiveNpcs: 6 },
  accessibility: { tier: "accessibility", dprCap: 1, targetFps: 30, maxActiveNpcs: 2 },
};`,
        explain: t(
          "등급마다 해상도 상한과 목표 프레임, 동시 NPC 수가 다릅니다. 자동 판정과 적응 컨트롤러는 이 표 안에서만 등급을 고릅니다.",
          "Each tier has its own resolution cap, target frame rate and concurrent NPC count. The automatic choice and the adaptive controller only pick tiers inside this table.",
        ),
        source: `${V}/studio-virtual-space-quality.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("소프트웨어 WebGL이면 Canvas로", "Canvas when WebGL is software"),
        language: "ts",
        code: `// 하드웨어 WebGL만 WebGL로 그리고, 아니면 Canvas로 폴백한다(단순화).
type RendererKind = "webgl" | "canvas";

type WebGLProbe = { available: boolean; software: boolean };

export function rendererDecision(probe: WebGLProbe): RendererKind {
  if (!probe.available || probe.software) return "canvas";
  return "webgl";
}`,
        codeEn: `// Only hardware WebGL draws with WebGL; anything else falls back to Canvas (simplified).
type RendererKind = "webgl" | "canvas";

type WebGLProbe = { available: boolean; software: boolean };

export function rendererDecision(probe: WebGLProbe): RendererKind {
  if (!probe.available || probe.software) return "canvas";
  return "webgl";
}`,
        explain: t(
          "가속 없는 소프트웨어 WebGL은 느려서, 그렇게 판정되면 Canvas로 그립니다. 판정 결과와 이유는 캔버스가 데이터 속성에 남깁니다.",
          "Unaccelerated software WebGL is slow, so that verdict draws with Canvas. The canvas records the decision and its reason in data attributes.",
        ),
        source: `${V}/studio-virtual-space-renderer.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Phaser docs", url: "https://docs.phaser.io/", kind: "docs", note: t("무대 엔진의 공식 문서", "Official docs of the stage engine") },
      { title: "MDN · WebGL API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API", kind: "docs", note: t("하드웨어 렌더러의 바탕", "Basis of the hardware renderer") },
      { title: "MDN · matchMedia", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia", kind: "docs", note: t("모션 감소 같은 환경 감지", "Detecting settings such as reduced motion") },
    ],
    chapterIds: ["performance", "virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "렌더 품질은 웹 코드가 소유합니다. 품질 모듈이 다섯 등급의 프로필을 갖고, 자동 판정이 기기 환경으로 시작 등급을 정하면 적응 컨트롤러가 프레임 속도를 보며 등급을 오르내립니다. 소프트웨어 WebGL 환경에서는 Canvas로 폴백합니다.",
        "Render quality belongs to web code. A quality module holds profiles for five tiers, the automatic choice sets the starting tier from the device environment, and an adaptive controller moves the tier by frame rate. Software WebGL environments fall back to Canvas.",
      ),
      analogy: t(
        "주방이 요리 완성도를 책임지되, 레시피와 불 세기 기준은 본사(웹 코드)가 정해 둔 식당과 같습니다. 기기가 느려지면 기준표대로 불을 낮춥니다.",
        "It is a restaurant where the kitchen owns the finished dish but head office (the web code) sets the recipes and flame standards. When a device is slow, the flame is lowered by the table.",
      ),
      questions: [
        {
          question: t("기기가 느리면 화질은 누가 낮추나요?", "Who lowers quality on a slow device?"),
          answer: t(
            "웹의 적응 컨트롤러입니다. 평활 프레임 속도가 낮은 상태가 3초 이어지면 한 등급 낮추고, 여유가 10초 이어지면 한 등급 올립니다.",
            "The web adaptive controller. Three seconds of low smoothed frame rate steps one tier down, and ten seconds of headroom steps one tier up.",
          ),
        },
        {
          question: t("등급은 몇 가지인가요?", "How many tiers are there?"),
          answer: t(
            "다섯 가지입니다. ultra·high·balanced·battery·accessibility이고, 등급마다 해상도 상한과 목표 프레임, 동시 NPC 수가 다릅니다.",
            "Five: ultra, high, balanced, battery and accessibility, each with its own resolution cap, target frame rate and concurrent NPC count.",
          ),
        },
        {
          question: t("WebGL이 안 되는 기기에서는 어떻게 되나요?", "What happens on a device without WebGL?"),
          answer: t(
            "렌더러 판정이 Canvas로 폴백합니다. 하드웨어 WebGL만 WebGL로 그리고, 소프트웨어 WebGL이거나 WebGL 자체가 없으면 Canvas를 씁니다.",
            "The renderer decision falls back to Canvas. Only hardware WebGL draws with WebGL; software WebGL or no WebGL at all uses Canvas.",
          ),
        },
      ],
      pitfall: t(
        "품질이 무대 내부의 일이라 웹에서 확인할 수 없다고 말하지 마세요. 등급 프로필과 적응 수치, 렌더러 판정은 전부 웹 저장소의 모듈에 있고 수치로 확인할 수 있습니다.",
        "Do not say quality happens inside the stage and cannot be checked from the web side. The tier profiles, adaptation figures and renderer decision all live in web repository modules and can be verified as numbers.",
      ),
    },
    technologies: ["Phaser", "React", "TypeScript"],
    facts: [
      { value: "5등급", label: t("품질 프로필 등급 수(ultra·high·balanced·battery·accessibility)", "Quality profile tiers (ultra, high, balanced, battery, accessibility)"), source: `${V}/studio-virtual-space-quality.ts` },
      { value: "3초 · 10초", label: t("적응 강등·승급 지속 기준(설계값)", "Adaptive step-down and step-up durations (design values)"), source: `${V}/studio-virtual-space-quality.ts` },
      { value: "2", label: t("ultra 등급 해상도 상한(dprCap)", "Resolution cap of the ultra tier (dprCap)"), source: `${V}/studio-virtual-space-quality.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "tiled-world-data-model",
    category: "virtual-space",
    name: "Virtual Studio · World data",
    title: t("서버가 확정하는 월드 매니페스트와 Tiled 월드 데이터", "The server-confirmed world manifest and Tiled world data"),
    status: "live",
    tagline: t(
      "월드는 Tiled 맵과 매니페스트 데이터로 적어 서버가 확정하고, Phaser 타일 런타임이 그립니다.",
      "The world is written as a Tiled map and manifest data, confirmed by the server, and drawn by the Phaser tile runtime.",
    ),
    background: [
      t(
        "가상 스튜디오의 공간은 코드 곳곳에 흩어져 있지 않고 데이터로 표현됩니다. 지금 캔버스가 소비하는 것은 월드 매니페스트입니다. 방, 소품, 충돌 영역, 상호작용, 포털, 스폰, NPC까지가 하나의 매니페스트 안에 들어갑니다. 기본 월드는 Tiled로 만든 맵(default-world.json)을 어댑터가 매니페스트로 바꾼 것이고, 서버 발행본이 있으면 그것이 우선합니다. 배경은 3D 모델 파일이 아니라 배경 주소와 에셋 키로 참조합니다.",
        "The virtual studio's space is not scattered through the code; it is expressed as data. What the canvas now consumes is the world manifest. Rooms, props, colliders, interactions, portals, spawns and NPCs all fit inside one manifest. The default world is a Tiled map (default-world.json) that an adapter turns into a manifest, and a server-published revision wins when one exists. Backgrounds are referenced by a background URL and asset key, not by a 3D model file.",
      ),
      t(
        "검증은 zod 스키마와 웹 검증기가 나누어 맡고 상한이 분명합니다. 공유 스키마에서 배열마다 상한은 4,096개이고, 웹 검증기는 엔티티 총량 4,096개와 월드 치수 10,000 같은 상한을 더합니다. 편집 초안은 읽어 온 발행 리비전을 함께 보관하고, 발행할 때 그 리비전을 기대값으로 보내 어긋나면 충돌(409)로 거절돼 패널이 재조회 동선을 제시합니다.",
        "Validation is shared by a zod schema and the web validator, with clear caps. In the shared schema each array caps at 4,096, and the web validator adds caps such as 4,096 total entities and a world dimension of 10,000. An editing draft keeps the published revision it was read from, and publishing sends that revision as the expected value, so a mismatch is rejected as a conflict (409) and the panel offers a reload path.",
      ),
      t(
        "서버 발행 월드 쪽에는 월드 매니페스트 계약이 살아 있습니다. 매니페스트는 방·충돌·스폰 같은 공간 정보를 담고, 발행 때는 JSON 바이트 기준 2MiB 상한과 구조·의미 검증을 거치며, 발행 기록은 리비전과 콘텐츠 해시를 남깁니다. 웹의 검증기는 여기에 엔티티 총량 4,096개 같은 상한을 더해 한 번 더 확인합니다. 어떤 무대든 서버가 월드를 확정한다는 원칙은 그대로입니다.",
        "On the server-published side, the world manifest contract lives on. The manifest holds spatial information such as rooms, colliders and spawns, and publishing passes a 2 MiB cap measured in JSON bytes plus structure and meaning checks, leaving a revision and a content hash in the record. The web validator adds caps such as 4,096 total entities and checks once more. Whatever the stage, the principle that the server confirms the world is unchanged.",
      ),
      t(
        "편집 동선도 웹 안에 있습니다. Tiled JSON 어댑터가 맵의 오브젝트 레이어를 매니페스트로 바꾸고, 타일 런타임이 8타일 청크 단위로 보이는 부분만 갱신합니다. 공간을 바꾸는 정식 동선은 저작 패널에서 매니페스트를 편집해 초안으로 저장하고, 발행하면 서버가 새 리비전으로 확정하는 것입니다.",
        "The editing path also lives in the web code. A Tiled JSON adapter turns the map's object layers into a manifest, and the tile runtime updates only the visible parts in chunks of eight tiles. The supported way to change a space is to edit the manifest in the authoring panel, save it as a draft, and publish it so the server confirms a new revision.",
      ),
    ],
    keyPoints: [
      t("캔버스는 월드 매니페스트를 소비합니다", "The canvas consumes the world manifest"),
      t("상한은 배열·총량 모두 4,096 단위", "Caps are 4,096 per array and in total"),
      t("발행 매니페스트는 2MiB 상한과 해시 기록", "The published manifest has a 2 MiB cap and a hash record"),
    ],
    diagram: {
      id: "tiled-world-data-model-diagram",
      kind: "graph",
      title: t("매니페스트가 캔버스에 닿기까지", "How the manifest reaches the canvas"),
      caption: t(
        "매니페스트는 검증과 저장을 거쳐 캔버스가 소비하고, 발행 월드는 서버가 리비전으로 확정합니다.",
        "The manifest passes validation and storage before the canvas consumes it, and published worlds are confirmed by the server with revisions.",
      ),
      alt: t(
        "기본 Tiled 월드가 매니페스트가 되어 스키마 검증을 거친 뒤 Phaser 타일 런타임이 소비합니다. 검증에 실패하면 기본 매니페스트를 씁니다. 한편 월드 매니페스트는 서버 발행으로 리비전과 해시가 확정됩니다.",
        "The default Tiled world becomes a manifest, passes schema validation and is consumed by the Phaser tile runtime. A validation failure uses the default manifest. Meanwhile the world manifest is confirmed by server publication with a revision and a hash.",
      ),
      nodes: [
        { id: "catalog", label: t("기본 월드 (Tiled)", "Default world (Tiled)"), sub: t("default-world.json", "default-world.json"), tone: "neutral", shape: "cylinder", at: [0, 0] },
        { id: "layout", label: t("저장 초안·발행본", "Draft and publication"), sub: t("작품별 매니페스트와 revision", "Per-work manifest and revision"), tone: "local", at: [1, 0] },
        { id: "check", label: t("스키마 검증", "Schema check"), sub: t("구조와 상한", "Shape and caps"), tone: "warn", shape: "diamond", at: [2, 0] },
        { id: "definition", label: t("월드 매니페스트", "World manifest"), sub: t("방·소품·충돌·NPC", "Rooms, props, colliders, NPCs"), tone: "good", at: [3, 0] },
        { id: "stage", label: t("Phaser 타일 런타임", "Phaser tile runtime"), sub: t("매니페스트의 소비자", "Consumer of the manifest"), tone: "local", at: [4, 0] },
        { id: "notice", label: t("타일 청크", "Tile chunks"), sub: t("보이는 8타일 단위 갱신", "Updates in visible 8-tile chunks"), tone: "local", at: [5, 0] },
        { id: "fallback", label: t("기본 매니페스트", "Default manifest"), sub: t("검증 실패 시 대체", "Used when checks fail"), tone: "warn", at: [2, 1] },
        { id: "publish", label: t("서버 발행", "Server publish"), sub: t("매니페스트·해시 확정", "Manifest and hash confirmed"), tone: "good", at: [3, 1] },
      ],
      edges: [
        { from: "catalog", to: "layout", label: t("우선순위", "priority") },
        { from: "layout", to: "check", label: t("검증", "validate") },
        { from: "check", to: "definition", label: t("통과", "pass") },
        { from: "check", to: "fallback", label: t("실패", "fail"), style: "dashed" },
        { from: "definition", to: "stage", label: t("소비", "consume") },
        { from: "stage", to: "notice", label: t("갱신", "update") },
        { from: "definition", to: "publish", label: t("발행본은 서버 확정", "server-confirmed"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("월드 매니페스트와 기본 월드", "World manifest and the default world"),
        role: t(
          "월드 매니페스트 타입과 기본값을 정의하고, Tiled 맵을 매니페스트로 바꾸는 로더가 발행본·빌트인·기본값 순으로 월드를 정합니다.",
          "It defines the world manifest type and defaults, and the loader that turns a Tiled map into a manifest picks the world in the order: publication, built-in, default.",
        ),
        paths: [`${V}/studio-virtual-space-world-manifest.ts`, `${V}/studio-virtual-space-world-loader.ts`],
      },
      {
        feature: t("월드 저작 패널", "World authoring panel"),
        role: t(
          "저작 패널에서 방·소품·충돌·NPC를 편집해 초안으로 저장하고, 발행 충돌이면 재조회 동선을 보여 줍니다.",
          "The authoring panel edits rooms, props, colliders and NPCs and saves a draft, showing a reload path on a publish conflict.",
        ),
        paths: [`${V}/StudioVirtualSpaceWorldAuthoringPanel.tsx`, `${V}/StudioVirtualSpacePage.tsx`],
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
        title: t("공유 스키마의 배열 상한 4,096", "The shared schema's 4,096 array caps"),
        language: "ts",
        code: `// 공유 스키마의 배열 상한은 4,096개 단위다(단순화).
import { z } from "zod";

export const WorldManifestShape = z.object({
  rooms: z.array(z.unknown()).min(1).max(4096),
  props: z.array(z.unknown()).max(4096),
  npcs: z.array(z.unknown()).max(4096),
});

export const STUDIO_WORLD_MAX_ENTITIES = 4_096;`,
        codeEn: `// The shared schema caps each array at 4,096 (simplified).
import { z } from "zod";

export const WorldManifestShape = z.object({
  rooms: z.array(z.unknown()).min(1).max(4096),
  props: z.array(z.unknown()).max(4096),
  npcs: z.array(z.unknown()).max(4096),
});

export const STUDIO_WORLD_MAX_ENTITIES = 4_096;`,
        explain: t(
          "배열마다 4,096개까지 허용하고, 웹 검증기는 전체 엔티티 총량도 같은 4,096개로 한 번 더 막습니다. 상한을 넘는 월드는 캔버스가 아니라 검증 단계에서 거절됩니다.",
          "Each array allows up to 4,096 entries, and the web validator caps total entities at the same 4,096 once more. An over-cap world is rejected at validation, not by the canvas.",
        ),
        source: "packages/studio-project-model/src/graph/world-publication.ts",
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
          "실제 검사는 공유 스키마의 검증(superRefine) 안에서 돕니다. 문자 수가 아니라 인코딩된 바이트로 재기 때문에 한글처럼 멀티바이트 문자가 많은 월드도 같은 기준으로 판정합니다.",
          "The real check runs inside the shared schema validation (superRefine). It measures encoded bytes rather than character count, so worlds rich in multibyte characters such as Korean are judged by the same standard.",
        ),
        source: "packages/studio-project-model/src/graph/world-publication.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "Tiled documentation", url: "https://doc.mapeditor.org/en/stable/", kind: "docs", note: t("기본 월드를 만드는 편집기", "The editor the default world is made with") },
      { title: "Zod", url: "https://zod.dev/", kind: "docs", note: t("정의와 매니페스트의 검증 스키마", "The validation schema for definitions and manifests") },
      { title: "MDN · JSON", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON", kind: "docs", note: t("정의와 카탈로그의 직렬화 형식", "The serialization format of definitions and the catalog") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "월드는 데이터로 적습니다. Tiled 맵에서 온 월드 매니페스트는 방·소품·NPC 배열마다 4,096개 상한을 zod 스키마로 검증받고, 발행은 기대 리비전을 확인하는 CAS로 동시 편집을 막습니다. 서버 발행 월드의 매니페스트는 2MiB 상한과 해시 기록을 거칩니다.",
        "The world is written as data. The world manifest that comes from a Tiled map is validated by a zod schema with a 4,096 cap on each array of rooms, props and NPCs, and publishing guards against concurrent edits with a CAS check of the expected revision. The server-published world manifest passes a 2 MiB cap and a hash record.",
      ),
      analogy: t(
        "건축 도면과 인허가의 관계입니다. 도면(매니페스트)은 양식과 상한을 지켜야 접수되고, 접수 번호(revision)가 찍힌 도면만 공사 현장(캔버스)에 전달됩니다.",
        "It is like architectural plans and their permit. Plans (the manifest) are accepted only in the right form and within caps, and only a plan stamped with a filing number (revision) reaches the construction site (the canvas).",
      ),
      questions: [
        {
          question: t("지금 월드는 무엇으로 편집하나요?", "What edits a world now?"),
          answer: t(
            "저작 패널에서 월드 매니페스트를 편집해 초안으로 저장하고 발행합니다. 저장본이 없으면 Tiled로 만든 기본 월드를 어댑터가 매니페스트로 바꿔 씁니다.",
            "You edit the world manifest in the authoring panel, save it as a draft and publish it. Without a saved world, the adapter turns the Tiled-made default world into a manifest.",
          ),
        },
        {
          question: t("동시에 편집하면 어떻게 되나요?", "What happens with concurrent edits?"),
          answer: t(
            "발행은 읽어 온 리비전을 기대값으로 보내고, 서버 값과 어긋나면 충돌(409)로 거절됩니다. 패널은 그 경우 재조회 동선을 제시합니다.",
            "A publish sends the revision it read as the expected value, and a mismatch with the server value is rejected as a conflict (409). The panel then offers a reload path.",
          ),
        },
        {
          question: t("Tiled로 만든 월드는 이제 못 쓰나요?", "Can Tiled-made worlds no longer be used?"),
          answer: t(
            "아니요. 기본 월드 자체가 Tiled 맵이고, 어댑터가 오브젝트 레이어를 매니페스트로 바꿉니다. 타일맵 상수는 발행 스키마와 웹 검증기에 계약으로 살아 있습니다.",
            "No. The default world itself is a Tiled map, and the adapter turns its object layers into a manifest. Tilemap caps live on as contracts in the publication schema and the web validator.",
          ),
        },
      ],
      pitfall: t(
        "'Godot 공간 정의 v1을 무대가 소비한다'고 현행처럼 말하지 마세요. 그 정의와 카탈로그는 2026-10-21 무대 제거와 함께 사라졌습니다. 지금 말할 수 있는 것은 월드 매니페스트의 4,096 상한과 발행 리비전, 2MiB 상한과 해시입니다.",
        "Do not say the stage consumes a Godot space definition v1 as if that were current. That definition and its catalog disappeared with the stage removal on 2026-10-21. What can be stated now is the world manifest's 4,096 caps and publication revisions, and the 2 MiB cap and hash.",
      ),
    },
    technologies: ["Phaser", "Tiled", "Zod", "TypeScript"],
    facts: [
      { value: "4,096개", label: t("공유 스키마의 배열별 상한(rooms·props·npcs max)", "Per-array caps of the shared schema (rooms, props, npcs max)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "2 MiB", label: t("월드 매니페스트 크기 상한(JSON 바이트, 설계값)", "World manifest size cap (JSON bytes, design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "4,096개", label: t("월드 엔티티 총량 상한(STUDIO_WORLD_MAX_ENTITIES, 설계값)", "Total world entity cap (STUDIO_WORLD_MAX_ENTITIES, design value)"), source: `${V}/studio-virtual-space-world-manifest.ts` },
      { value: "8", label: t("타일 청크 한 변의 타일 수(STUDIO_TILE_CHUNK_SIZE, 설계값)", "Tiles per tile-chunk side (STUDIO_TILE_CHUNK_SIZE, design value)"), source: `${V}/studio-virtual-space-tile-chunks.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
