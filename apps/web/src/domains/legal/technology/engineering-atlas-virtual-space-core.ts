import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 1: 전체 지도 · Phaser 수명주기 · 렌더러/품질 · Tiled 월드 데이터.
 * 경로·수치는 2026-10-07 기준 코드에서 직접 확인한 값이다.
 */

const V = "apps/web/src/domains/creator/virtual-space";

export const VIRTUAL_SPACE_CORE_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "virtual-studio-architecture-overview",
    category: "virtual-space",
    name: "Virtual Studio",
    title: t("걸어 다니며 만나는 협업 공간의 전체 지도", "The whole map of a space you walk through to collaborate"),
    status: "live",
    tagline: t(
      "팀원이 2D 방을 걸어 다니며 만나는 공간을 여섯 층으로 나눠 만들었습니다.",
      "A 2D room your team walks through, built as six separate layers.",
    ),
    background: [
      t(
        "가상 스튜디오는 팀원의 아바타가 2D 지도 위를 걸어 다니다 가까워지면 인사하고 대화하는 협업 공간입니다. 게임 속 마을처럼 보이지만 규칙이 하나 다릅니다. 지도는 건물 관리실(서버)이 확정한 한 장의 설계도이고, 각자의 브라우저는 그 사본을 받아 그림으로 그릴 뿐입니다. 문 앞에 서는 것은 '그 기능으로 가는 길을 안내받는다'는 뜻이지 권한을 받는다는 뜻이 아닙니다.",
        "The virtual studio is a collaboration space where teammates' avatars walk around a 2D map, greet each other when they get close and talk. It looks like a game town, but one rule differs: the map is a single blueprint confirmed by the building office (the server), and each browser only receives a copy and draws it. Standing at a door means being shown the way to a feature, not being granted permission to use it.",
      ),
      t(
        "구조는 여섯 층입니다. 월드 데이터(방·벽·문·타일), 서버 권위(관리자가 발행하면 버전과 해시를 기록), 브라우저 projection(받은 월드를 다시 검증한 읽기 전용 사본), Phaser 장면(걷기·충돌·카메라·다른 사람 그리기), 근접 규칙(거리로 인사·채팅·영상 연결 결정), 영상·채팅(사람과 직접 만나는 층)입니다. 위층은 아래층의 결정을 읽기만 하고 되돌려 쓰지 않습니다.",
        "There are six layers: world data (rooms, walls, doors, tiles); server authority (a publish records a revision and a hash); the browser projection (a re-verified, read-only copy); the Phaser scene (walking, collisions, camera, drawing other people); proximity rules (distance decides greetings, chat and video links); and video and chat, where people actually meet. Upper layers only read decisions from the layers below and never write back.",
      ),
      t(
        "왜 이렇게 나눴을까요? Phaser 장면 안에 업무 규칙과 권한까지 넣으면 목록 화면과 공간 화면이 서로 다른 진실을 갖게 되고, 하나의 거대한 화면 코드가 네트워크와 얽힙니다. 그래서 규칙은 Phaser 에 의존하지 않는 순수 모듈로 빼고(이 디렉터리 모듈의 대부분이 그렇습니다) Phaser 에는 '그리고 움직이는 일'만 맡겼습니다. 순수 모듈은 브라우저 없이 테스트할 수 있다는 장점도 있습니다.",
        "Why split it this way? Putting work rules and permissions inside the Phaser scene would give the list view and the spatial view different truths and tangle one giant screen with networking. So rules live in pure modules that do not depend on Phaser (most modules in this directory), and Phaser only draws and moves things. Pure modules can also be tested without a browser.",
      ),
      t(
        "이 카드는 지도입니다. 실시간 통신(Socket.IO·Durable Objects·WebRTC) 자체는 협업·WebRTC 카테고리 카드가 다룹니다. 또한 영상은 사용자가 직접 켜야 하고 정원이 작아서 대규모 행사장을 대신하지는 않습니다. 각 층의 자세한 이야기는 이어지는 카드로 연결됩니다.",
        "This card is the map. The realtime transports themselves (Socket.IO, Durable Objects, WebRTC) are covered by the collaboration and WebRTC cards. Video must be switched on by each user and has a small capacity, so it does not replace a large event venue. The following cards go deeper into each layer.",
      ),
    ],
    keyPoints: [
      t("진실은 서버, 브라우저는 투영", "The server owns the truth; the browser projects it"),
      t("Phaser는 그림, 규칙은 순수 모듈", "Phaser draws; rules are pure modules"),
      t("공간은 권한이 아니라 안내판", "Space is a signpost, not a permission"),
      t("영상은 옵트인이고 정원이 작음", "Video is opt-in with a small capacity"),
    ],
    diagram: {
      id: "virtual-studio-architecture-overview-diagram",
      kind: "layers",
      title: t("가상 스튜디오의 여섯 층", "The six layers of the virtual studio"),
      caption: t(
        "아래층이 진실을 갖고, 위층은 그것을 읽어서 보여 주기만 합니다.",
        "Lower layers own the truth; upper layers only read it and show it.",
      ),
      alt: t(
        "여섯 층이 위에서 아래로 쌓여 있습니다. 위부터 영상·채팅, 근접 규칙, Phaser 장면, 브라우저 projection, 서버 권위, 월드 데이터입니다. 위의 네 층은 사용자 브라우저 안에서 보여 주는 쪽이고, 아래 두 층이 원본을 갖습니다.",
        "Six layers are stacked from top to bottom: video and chat, proximity rules, the Phaser scene, the browser projection, server authority and world data. The top four live inside the user's browser and show things; the bottom two own the source.",
      ),
      layers: [
        { id: "people", label: t("영상·채팅", "Video and chat"), sub: t("사람과 직접 만나는 층 · 영상은 사용자가 켬", "Where people meet · video is user-enabled"), tone: "local", chips: ["WebRTC", "RTCDataChannel"] },
        { id: "rules", label: t("근접 규칙", "Proximity rules"), sub: t("거리 → 인사·채팅·영상 연결 (순수 모듈)", "Distance → greeting, chat, video link (pure modules)"), tone: "local" },
        { id: "scene", label: t("Phaser 장면", "Phaser scene"), sub: t("걷기·충돌·카메라·다른 사람 보간", "Walking, collisions, camera, peer interpolation"), tone: "local", chips: ["Phaser", "Canvas2D", "WebGL2"] },
        { id: "projection", label: t("브라우저 projection", "Browser projection"), sub: t("받은 월드를 해시로 다시 검증 · 읽기 전용", "Re-verified by hash · read-only"), tone: "local" },
        { id: "authority", label: t("서버 권위", "Server authority"), sub: t("발행(CAS)·권한·예약·가구 저장", "Publish (CAS), permissions, bookings, furniture"), tone: "server", chips: ["NestJS", "Supabase PostgreSQL"] },
        { id: "world", label: t("월드 데이터", "World data"), sub: t("방·벽·문·스폰·타일 (매니페스트, Tiled 형식)", "Rooms, walls, doors, spawns, tiles (manifest, Tiled format)"), tone: "neutral", chips: ["Tiled", "Zod"] },
      ],
      brackets: [
        { label: t("브라우저 안 (보여 주는 쪽)", "In the browser (shows)"), layerIds: ["people", "rules", "scene", "projection"] },
        { label: t("서버·저장소 (원본)", "Server and storage (source)"), layerIds: ["authority", "world"] },
      ],
    },
    usage: [
      {
        feature: t("협업 스튜디오 · 공간 화면", "Collaboration studio · spatial screen"),
        role: t(
          "페이지가 월드를 정하고(서버 발행본이 우선, 없으면 내장 캠퍼스·장소 월드, 월드 편집 모드에서는 기본 Tiled 월드가 바탕) Phaser 캔버스·프레즌스·근접 영상·패널을 한 화면에 조립합니다.",
          "The page picks the world (a server publication first, otherwise the built-in campus or place world, with the default Tiled world as the base in world-edit mode) and assembles the Phaser canvas, presence, proximity video and panels on one screen.",
        ),
        paths: [`${V}/StudioVirtualSpacePage.tsx`, `${V}/StudioVirtualSpacePageRoot.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("Phaser 장면", "Phaser scene"),
        role: t(
          "걷기·충돌·카메라·다른 사람 아바타·NPC를 그리고, 사용자의 위치를 페이지로 올려 보냅니다.",
          "Draws walking, collisions, the camera, other avatars and NPCs, and reports the user's position up to the page.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx`],
      },
      {
        feature: t("월드 발행 서버", "World publishing server"),
        role: t(
          "관리자가 발행한 월드를 서버가 리비전·해시와 함께 보관하고, 브라우저는 그 사본만 받아 씁니다.",
          "The server stores the world a manager publishes with a revision and a hash; browsers only consume that copy.",
        ),
        paths: [
          "apps/api/src/modules/studio-project-graph/studio-world-publication.repository.ts",
          "packages/studio-project-model/src/graph/world-publication.ts",
        ],
      },
      {
        feature: t("근접 영상·채팅", "Proximity video and chat"),
        role: t(
          "거리 규칙이 연결 대상을 고르고, 위치·채팅 패킷은 브라우저끼리 직접 오갑니다.",
          "Distance rules pick whom to connect, and position and chat packets travel directly between browsers.",
        ),
        paths: [`${V}/hud/space-proximity-media.ts`, `${V}/studio-virtual-space-presence.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("어떤 월드를 그릴지 정하는 우선순위", "Which world to draw, in priority order"),
        language: "ts",
        code: `// 어떤 월드를 그릴지 정하는 우선순위(StudioVirtualSpacePage 의 단순화)
type World = { id: string; source: "published" | "builtin" | "default" };

export async function pickWorld(
  published: World | null,
  builtin: World | null,
  loadDefault: () => Promise<World>,
): Promise<World> {
  if (published) return published; // 서버가 확정해 검증을 마친 발행본이 최우선
  if (builtin) return builtin; // 그다음은 내장 장소(편집 모드가 아니면 항상 있음)
  return loadDefault(); // 편집 모드에서는 기본 Tiled 월드가 바탕(실패하면 코드 안 기본값)
}`,
        codeEn: `// Priority order for choosing which world to draw (simplified from StudioVirtualSpacePage)
type World = { id: string; source: "published" | "builtin" | "default" };

export async function pickWorld(
  published: World | null,
  builtin: World | null,
  loadDefault: () => Promise<World>,
): Promise<World> {
  if (published) return published; // the server-confirmed, verified copy wins
  if (builtin) return builtin; // then a built-in place (always present outside edit mode)
  return loadDefault(); // in edit mode the default Tiled world is the base (code default on failure)
}`,
        explain: t(
          "서버가 확정한 발행본이 있으면 항상 그것을 쓰고, 없을 때만 내장 장소를 씁니다. 기본 Tiled 월드는 월드 편집 모드에서 바탕으로 불러옵니다. 브라우저가 월드를 스스로 정하지 않는다는 점이 핵심입니다.",
          "When a server-confirmed publication exists it always wins; only without one does the page use a built-in place, and the default Tiled world is loaded as the base in world-edit mode. The point is that the browser never decides the world on its own.",
        ),
        source: `${V}/StudioVirtualSpacePage.tsx`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("공유 기능을 켜도 되는지: 실패하면 닫는다", "May shared features turn on? Fail closed"),
        language: "ts",
        code: `// 프레즌스·영상 같은 공유 기능은 월드 검증이 끝났을 때만 켠다(fail-closed, 단순화).
type PublicationView = {
  enabled: boolean; // 이 화면이 발행 월드를 쓰는 화면인가
  viewVerified: boolean; // 서버에서 읽고 해시까지 검증했는가
  hasPublishedWorld: boolean; // 서버에 발행본이 있는가
  adopted: boolean; // 그 발행본을 실제로 채택했는가
};

export const sharedWorldAllowed = (s: PublicationView): boolean =>
  !s.enabled || (s.viewVerified && (s.adopted || !s.hasPublishedWorld));`,
        codeEn: `// Shared features such as presence and video turn on only after the world is verified (fail-closed, simplified).
type PublicationView = {
  enabled: boolean; // does this screen use a published world at all
  viewVerified: boolean; // read from the server and hash-verified
  hasPublishedWorld: boolean; // a publication exists on the server
  adopted: boolean; // that publication was actually adopted
};

export const sharedWorldAllowed = (s: PublicationView): boolean =>
  !s.enabled || (s.viewVerified && (s.adopted || !s.hasPublishedWorld));`,
        explain: t(
          "발행본이 있는데 채택하지 못했다면(검증 실패 등) 공유 기능을 켜지 않습니다. 서로 다른 월드를 보고 있는 사람끼리 만나는 상황을 막기 위한 닫는 쪽 기본값입니다.",
          "If a publication exists but could not be adopted (for example verification failed), shared features stay off. This closed default prevents people who see different worlds from meeting each other.",
        ),
        source: `${V}/StudioVirtualSpacePage.tsx`,
        verify: "types",
      },
    ],
    links: [
      { title: "Phaser · Scenes", url: "https://docs.phaser.io/phaser/concepts/scenes", kind: "docs", note: t("장면(Scene)의 수명주기 개념", "The scene lifecycle concept") },
      { title: "Tiled · JSON map format", url: "https://doc.mapeditor.org/en/stable/reference/json-map-format/", kind: "spec", note: t("월드 데이터 형식", "The world data format") },
      { title: "MDN · WebRTC API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API", kind: "docs", note: t("근접 영상·직접 패킷의 바탕", "Basis of proximity video and direct packets") },
      { title: "Zod", url: "https://zod.dev/", kind: "docs", note: t("웹·서버가 함께 쓰는 월드 스키마", "The world schema shared by web and server") },
    ],
    chapterIds: ["virtual-studio-world-authority", "architecture"],
    talk: {
      pitch: t(
        "가상 스튜디오는 팀원이 2D 방을 걸어 다니다 가까워지면 인사하고 대화하는 공간입니다. 구조는 여섯 층이고 핵심 규칙은 하나입니다. 진실은 서버가 갖고 브라우저는 그 사본을 그릴 뿐이라는 것입니다. 그래서 공간이 새로운 권한 시스템이 되지 않고, 목록 화면과 공간 화면이 같은 진실을 봅니다.",
        "The virtual studio is a place where teammates walk through a 2D room and greet and talk to each other when they get close. It has six layers and one core rule: the server owns the truth and the browser only draws a copy. That keeps space from becoming a new permission system, and the list view and spatial view see the same truth.",
      ),
      analogy: t(
        "게임 속 마을처럼 보이지만 실제로는 관리실이 설계도를 쥐고 있는 사무실 건물입니다. 아바타는 설계도 사본을 보고 걷고, 문 앞의 안내판은 가야 할 곳을 알려 줄 뿐 출입은 해당 부서가 따로 확인합니다.",
        "It looks like a game town but works like an office building whose management office holds the blueprint. Avatars walk by a copy of the blueprint, and a sign at a door only points the way; the department behind it checks entry separately.",
      ),
      questions: [
        {
          question: t("Gather 같은 서비스와 무엇이 다른가요?", "How is it different from services like Gather?"),
          answer: t(
            "비교 대상의 내부 구현은 확인하지 못했습니다. 우리 쪽 특징은 공간이 권한을 갖지 않고 기존 프로젝트·권한 위에 얹힌 화면이라는 점입니다. 비교 메모는 docs/studio/virtual-studio-benchmark-20260920.md 에 있습니다.",
            "I could not verify how those services are built internally. What is specific to us is that space holds no permissions and is just another screen on top of existing projects and permissions. The comparison notes are in docs/studio/virtual-studio-benchmark-20260920.md.",
          ),
        },
        {
          question: t("몇 명까지 함께 들어올 수 있나요?", "How many people can be there together?"),
          answer: t(
            "코드 상수는 24명이지만 검증된 수용량은 아닙니다. 영상은 원격 3명(나 포함 4명)까지이고 직접 메시 연결은 8명에서 막힙니다. 자세한 사다리는 '근접 영상과 정원 체인' 카드를 보세요.",
            "The code constant says 24, but that is not a verified capacity. Video is limited to 3 remote peers (4 with you) and the direct mesh stops at 8. See the proximity video and capacity chain card for the ladder.",
          ),
        },
        {
          question: t("움직임이 서버를 거치나요?", "Does movement go through the server?"),
          answer: t(
            "위치와 채팅 패킷은 브라우저끼리 직접 보냅니다. 서버는 입장 허가와 상대 찾기를 맡습니다. 자세한 흐름은 프레즌스 카드에 있습니다.",
            "Position and chat packets go straight between browsers. The server handles admission and peer discovery. The presence card has the detailed flow.",
          ),
        },
      ],
      pitfall: t(
        "'인사 160/220px' 같은 값은 코드에 있지만 화면에 연결되지 않은 설계 상수입니다(근접 히스테리시스 카드). 화면에 연결된 값만 말하세요. 또한 운영 DB 에 실제 발행된 월드가 있는지는 이 카드에서 확인하지 못했습니다.",
        "Values like the 160/220 px greeting radii exist in code but are design constants that are not wired to the screen (see the proximity hysteresis card). Quote only wired values. Whether any world has actually been published in the production database was not checked for this card.",
      ),
    },
    technologies: ["Phaser 3", "Tiled", "WebRTC", "Zod", "NestJS", "Supabase PostgreSQL"],
    facts: [
      { value: "^3.90.0", label: t("Phaser 의존성 버전 범위(설치된 버전 3.90.0)", "Phaser dependency range (installed 3.90.0)"), source: "package.json" },
      { value: "2 MiB", label: t("월드 매니페스트 크기 상한(설계값)", "World manifest size cap (design value)"), source: "packages/studio-project-model/src/graph/world-publication.ts" },
      { value: "15초", label: t("발행 읽기 권한(lease)의 유효 시간(설계값)", "Lifetime of the publication read lease (design value)"), source: `${V}/world-publication/studio-world-publication-client.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "phaser-lazy-scene-lifecycle",
    category: "virtual-space",
    name: "Phaser",
    title: t("필요할 때만 불러오는 게임 엔진과 장면의 수명", "A game engine loaded on demand, and the life of its scene"),
    status: "live",
    tagline: t(
      "공간에 들어갈 때 Phaser 를 받아 Game 을 만들고, 나갈 때 깨끗이 지웁니다.",
      "Phaser is fetched when you enter the studio, and cleaned up completely when you leave.",
    ),
    background: [
      t(
        "Phaser 는 2D 게임을 그리는 자바스크립트 엔진입니다. 라이브러리가 커서 공간을 쓰지 않는 사용자까지 받게 하면 낭비입니다. 극장에 비유하면 손님이 입장할 때만 무대 조명을 켜고, 나가면 끄는 방식입니다. 그래서 공간 화면에 들어갈 때 엔진을 내려받고, 나갈 때는 캔버스와 텍스처까지 정리합니다.",
        "Phaser is a JavaScript engine for drawing 2D games. The library is large, so making users who never open the studio download it would be wasteful. Think of a theatre that switches on the stage lights only when guests enter and turns them off when they leave. So the engine is downloaded when you enter the spatial screen and everything, including the canvas and textures, is cleaned up when you leave.",
      ),
      t(
        "순서는 이렇습니다. 공간 페이지 자체를 라우트 지연 로딩으로 받고, 캔버스가 마운트되면 `await import(\"phaser\")` 로 엔진을 받습니다. 받는 사이 사용자가 떠났다면 취소 표시(cancelled)를 보고 그 자리에서 멈춥니다. 도착하면 렌더러를 정해 `new Phaser.Game(...)` 을 만들고, 장면(Scene)이 preload(에셋 받기) → create(물건 배치) → update(매 프레임)를 돕니다. 언마운트 때는 `game.destroy(true)` 로 풉니다.",
        "The order is: the spatial page itself is lazy-loaded by the router; once the canvas mounts, `await import(\"phaser\")` fetches the engine; if the user left meanwhile, a cancelled flag stops the work on the spot. When the engine arrives, a renderer is chosen and `new Phaser.Game(...)` is created, and the scene runs preload (fetch assets), create (place objects) and update (every frame). On unmount `game.destroy(true)` releases it all.",
      ),
      t(
        "멈추는 경우도 대비합니다. 부팅 감시기가 25초 예산을 재고(Phaser 는 숨긴 탭에서 멈추므로 그 시간은 빼 줍니다), 넘으면 '다시 시도' 화면을 보여 줍니다. 대안인 정적 import 는 단순하지만 첫 용량이 커지고, 엔진을 앱 전역에 두면 정리를 놓칠 때 GPU 메모리가 새기 쉽습니다. 아트 스타일이나 테마 같은 입력이 바뀌면 Game 을 지우고 새로 만드는 구조라서 정리 코드가 특히 중요합니다.",
        "Stalls are handled too. A boot watchdog measures a 25-second budget (excluding time in a hidden tab, because Phaser pauses there) and shows a retry screen when it runs out. A static import is simpler but enlarges the first download, and keeping the engine app-wide makes GPU memory leaks easy when cleanup is missed. Because the game is destroyed and rebuilt when inputs such as the art style or theme change, the cleanup code matters a lot.",
      ),
      t(
        "정직한 한계가 하나 있습니다. 스프라이트 크로스페이드 모듈에 `import Phaser from \"phaser\"` 정적 import 가 남아 있습니다(사용처는 모두 타입 위치). tsconfig 의 verbatimModuleSyntax 때문에 이 import 는 지워지지 않아, 동적 import 만으로 Phaser 가 별도 청크가 된다고 단정할 수 없습니다. 실제 프로덕션 청크 크기는 확인하지 못했습니다.",
        "There is one honest limitation. The sprite crossfade module still has a static `import Phaser from \"phaser\"` (every use is in a type position). Because of verbatimModuleSyntax in tsconfig this import is not erased, so the dynamic import alone cannot be assumed to make Phaser a separate chunk. The real production chunk sizes were not checked.",
      ),
    ],
    keyPoints: [
      t("공간에 들어갈 때 엔진을 받고 나갈 때 지웁니다", "Fetch the engine on entry, destroy it on exit"),
      t("25초 안에 못 뜨면 실패 화면과 재시도", "No boot within 25 s shows a failure and retry"),
      t("정적 import 1건이 남아 분리는 단정 못 함", "One static import remains, so chunk split is unproven"),
    ],
    diagram: {
      id: "phaser-lazy-scene-lifecycle-diagram",
      kind: "sequence",
      title: t("입장부터 퇴장까지 Phaser 장면의 한살이", "Life of the Phaser scene from entry to exit"),
      caption: t(
        "엔진은 입장할 때 받고, 늦으면 감시기가 알리고, 나갈 때 모두 지웁니다.",
        "The engine arrives on entry, a watchdog reports slow boots, and everything is destroyed on exit.",
      ),
      alt: t(
        "사용자가 공간에 입장하면 React 페이지가 부팅 감시를 시작하고 Phaser 를 동적으로 불러옵니다. 엔진이 도착하면 렌더러를 정해 Game 을 만들고 장면이 준비되면 감시를 풉니다. 느리면 25초 뒤 실패 화면을 띄우고, 나갈 때는 game.destroy 로 모두 정리합니다.",
        "When the user enters, the React page starts the boot watchdog and dynamically loads Phaser. After the engine arrives a renderer is chosen, the Game is created and the watchdog is released once the scene is ready. If boot is slow a failure screen appears after 25 seconds, and on exit game.destroy cleans everything up.",
      ),
      actors: [
        { id: "user", label: t("사용자", "User"), tone: "local" },
        { id: "page", label: t("React 페이지", "React page"), sub: t("마운트 효과", "Mount effect"), tone: "local" },
        { id: "engine", label: t("Phaser", "Phaser"), sub: t("import → Game → Scene", "import → Game → Scene"), tone: "local" },
        { id: "guard", label: t("부팅 감시", "Boot watchdog"), sub: t("25초 예산", "25 s budget"), tone: "warn" },
      ],
      messages: [
        { from: "user", to: "page", label: t("공간에 입장", "Enter the studio"), note: t("라우트 청크를 먼저 받음", "The route chunk loads first") },
        { from: "page", to: "guard", label: t("감시 시작", "Start the watchdog"), note: t("숨긴 탭의 시간은 예산에서 뺌", "Hidden-tab time is excluded") },
        { from: "page", to: "engine", label: t("await import(\"phaser\")", "await import(\"phaser\")"), note: t("의도: 입장할 때만 받는다", "Intent: fetch only on entry") },
        { from: "engine", to: "page", label: t("엔진 도착", "Engine arrives"), style: "dashed", note: t("이미 나갔다면 여기서 중단", "Stops here if the user already left") },
        { from: "page", to: "engine", label: t("렌더러 판정 후 new Game()", "Pick renderer, then new Game()"), note: t("WebGL 또는 Canvas", "WebGL or Canvas") },
        { from: "engine", to: "engine", label: t("preload → create → update", "preload → create → update") },
        { from: "engine", to: "page", label: t("장면 준비 완료", "Scene ready"), style: "dashed", note: t("감시 해제 · 로딩 표시 끔", "Watchdog released, loader hidden") },
        { from: "guard", to: "page", label: t("느리면: 25초 뒤 실패 처리", "If slow: fail after 25 s"), style: "dashed", note: t("'다시 시도' 버튼 표시", "Shows a retry button") },
        { from: "user", to: "page", label: t("공간에서 나가기", "Leave the studio") },
        { from: "page", to: "engine", label: t("game.destroy(true)", "game.destroy(true)"), note: t("캔버스·텍스처까지 해제", "Frees the canvas and textures") },
      ],
    },
    usage: [
      {
        feature: t("협업 스튜디오 · 공간 입장", "Collaboration studio · entering the studio"),
        role: t(
          "마운트 뒤 `import(\"phaser\")` 로 엔진을 받고 Game 을 만들며, 취소 표시로 늦게 도착한 엔진을 버립니다. 부팅 단계는 data-boot-stage 로 노출됩니다.",
          "After mount it fetches the engine with `import(\"phaser\")` and builds the Game, dropping a late engine via a cancelled flag. Boot stages are exposed as data-boot-stage.",
        ),
        paths: [`${V}/StudioVirtualSpacePhaserCanvas.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("부팅 실패 안내와 다시 시도", "Boot failure notice and retry"),
        role: t(
          "25초 안에 장면이 준비되지 않으면 실패 화면과 '다시 시도' 버튼을 보여 주고, 눌렀을 때 Game 을 처음부터 다시 만듭니다.",
          "If the scene is not ready within 25 seconds it shows a failure screen with a retry button that rebuilds the Game from scratch.",
        ),
        paths: [`${V}/experience/studio-visible-boot-deadline.ts`, `${V}/StudioVirtualSpacePhaserCanvas.lifecycle.test.tsx`],
      },
      {
        feature: t("라우트 지연 로딩", "Route-level lazy loading"),
        role: t(
          "공간 페이지 자체도 라우트에 들어갈 때 받으며, 실패하면 재시도하는 lazyRetry 로 감쌉니다.",
          "The spatial page itself is fetched on route entry, wrapped in lazyRetry which retries on failure.",
        ),
        paths: ["apps/web/src/app/routes/groups/creator-route-pages.ts"],
        route: "/studio/space",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("취소할 수 있는 지연 로더", "A lazy loader that can be cancelled"),
        language: "ts",
        code: `// 엔진은 필요한 순간에만 받고, 그 사이 나갔다면 결과를 버린다.
type Engine = { start(parent: HTMLElement): { destroy(): void } };

export function mountLazily(parent: HTMLElement, load: () => Promise<Engine>): () => void {
  let cancelled = false;
  let game: { destroy(): void } | null = null;
  void load().then((engine) => {
    if (cancelled || !parent.isConnected) return; // 이미 나갔으면 만들지 않는다
    game = engine.start(parent);
  });
  return () => { // 정리 함수: 언마운트 때 호출
    cancelled = true;
    game?.destroy();
  };
}
// 사용: mountLazily(host, () => import("./engine").then((m) => m.default))`,
        codeEn: `// Fetch the engine only when needed, and drop the result if the user left meanwhile.
type Engine = { start(parent: HTMLElement): { destroy(): void } };

export function mountLazily(parent: HTMLElement, load: () => Promise<Engine>): () => void {
  let cancelled = false;
  let game: { destroy(): void } | null = null;
  void load().then((engine) => {
    if (cancelled || !parent.isConnected) return; // do not build if the user already left
    game = engine.start(parent);
  });
  return () => { // cleanup: call on unmount
    cancelled = true;
    game?.destroy();
  };
}
// usage: mountLazily(host, () => import("./engine").then((m) => m.default))`,
        explain: t(
          "비동기로 받는 동안 화면이 사라질 수 있으니 '취소됨' 표시를 두고, 도착한 뒤에 확인합니다. 정리 함수가 Game 까지 파괴해야 누수가 없습니다.",
          "The screen can disappear while an async download is in flight, so keep a cancelled flag and check it on arrival. The cleanup function must also destroy the game to avoid leaks.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("숨긴 탭은 예산에서 빼는 부팅 감시기", "A boot watchdog that excludes hidden-tab time"),
        language: "ts",
        code: `// 보이는 동안만 남은 예산을 센다(studio-visible-boot-deadline 의 단순화).
type Page = { hidden: boolean; addEventListener(type: "visibilitychange", listener: () => void): void };

export function visibleDeadline(page: Page, onTimeout: () => void, budgetMs = 25_000): () => void {
  let remaining = budgetMs;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    clearTimeout(timer);
    if (startedAt) remaining -= performance.now() - startedAt; // 보이던 만큼 예산을 깎고
    startedAt = 0;
    if (page.hidden) return; // 숨긴 동안에는 시계를 멈춘다
    startedAt = performance.now();
    timer = setTimeout(onTimeout, Math.max(0, remaining));
  };
  page.addEventListener("visibilitychange", update);
  update();
  return () => clearTimeout(timer); // 장면이 준비되면 해제
}`,
        codeEn: `// Counts the remaining budget only while visible (simplified from studio-visible-boot-deadline).
type Page = { hidden: boolean; addEventListener(type: "visibilitychange", listener: () => void): void };

export function visibleDeadline(page: Page, onTimeout: () => void, budgetMs = 25_000): () => void {
  let remaining = budgetMs;
  let startedAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    clearTimeout(timer);
    if (startedAt) remaining -= performance.now() - startedAt; // subtract the time it was visible
    startedAt = 0;
    if (page.hidden) return; // pause the clock while hidden
    startedAt = performance.now();
    timer = setTimeout(onTimeout, Math.max(0, remaining));
  };
  page.addEventListener("visibilitychange", update);
  update();
  return () => clearTimeout(timer); // release once the scene is ready
}`,
        explain: t(
          "탭을 숨긴 채 기다린 시간 때문에 '부팅 실패'로 오판하지 않도록, 보이는 시간만 예산에서 차감합니다. 장면이 준비되면 반환된 함수로 감시를 끕니다.",
          "So that time spent in a hidden tab is not mistaken for a boot failure, only visible time is deducted from the budget. Call the returned function to stop watching once the scene is ready.",
        ),
        source: `${V}/experience/studio-visible-boot-deadline.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Phaser · Scenes", url: "https://docs.phaser.io/phaser/concepts/scenes", kind: "docs", note: t("preload/create/update 흐름", "The preload/create/update flow") },
      { title: "Phaser · Game API", url: "https://docs.phaser.io/api-documentation/class/game", kind: "docs", note: t("Game 설정과 destroy", "Game config and destroy") },
      { title: "MDN · import()", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import", kind: "docs", note: t("동적 import 의 동작", "How dynamic import works") },
      { title: "MDN · Page Visibility API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API", kind: "docs", note: t("숨긴 탭 감지", "Detecting a hidden tab") },
      { title: "TypeScript · verbatimModuleSyntax", url: "https://www.typescriptlang.org/tsconfig/#verbatimModuleSyntax", kind: "docs", note: t("정적 import 가 지워지지 않는 이유", "Why a static import is not erased") },
    ],
    chapterIds: ["virtual-studio-world-authority", "performance"],
    talk: {
      pitch: t(
        "가상 스튜디오 화면은 Phaser 라는 2D 게임 엔진이 그립니다. 엔진이 크기 때문에 공간에 들어갈 때 받고, 나갈 때는 캔버스와 텍스처까지 정리합니다. 25초 안에 뜨지 않으면 실패 화면과 다시 시도 버튼을 보여 줍니다. 다만 코드에 정적 import 가 한 곳 남아 있어서 별도 청크로 완전히 분리됐다고는 말하지 않습니다.",
        "The virtual studio screen is drawn by Phaser, a 2D game engine. Because the engine is large it is fetched on entry, and the canvas and textures are cleaned up on exit. If it has not come up within 25 seconds a failure screen with a retry button appears. One static import remains in the code, so I do not claim a fully separate chunk.",
      ),
      analogy: t(
        "손님이 올 때만 무대 조명을 켜고 가면 끄는 극장입니다. 조명이 켜지는 데 너무 오래 걸리면 안내원이 '다시 시도해 볼까요?' 하고 묻습니다.",
        "A theatre that lights the stage only when guests arrive and switches it off when they leave. If the lights take too long, the usher asks whether to try again.",
      ),
      questions: [
        {
          question: t("Phaser 가 처음 로딩에 들어가나요?", "Is Phaser part of the first load?"),
          answer: t(
            "라우트 단위로는 공간 페이지에 들어갈 때만 받습니다. 다만 Phaser 가 별도 청크로 쪼개졌는지는 프로덕션 번들로 확인하지 못했고, 정적 import 가 한 곳 남아 있습니다.",
            "At route level it is fetched only when you enter the studio page. Whether Phaser became its own chunk was not verified on a production bundle, and one static import remains.",
          ),
        },
        {
          question: t("탭을 숨기면 어떻게 되나요?", "What happens if the tab is hidden?"),
          answer: t(
            "Phaser 는 숨긴 탭에서 멈추므로, 그 시간은 25초 부팅 예산에서 빼 줍니다. 복귀 뒤 남은 예산만 쓰는 것을 테스트로 확인합니다.",
            "Phaser pauses in a hidden tab, so that time is subtracted from the 25-second boot budget. A test confirms that only the remaining budget is used after returning.",
          ),
        },
        {
          question: t("부팅이 실패하면 사용자는 무엇을 보나요?", "What does the user see if boot fails?"),
          answer: t(
            "'공간을 불러오지 못했습니다' 안내와 다시 시도 버튼이 보이고, 실패 이유는 data-engine-error 속성에 남습니다. 버튼을 누르면 Game 을 처음부터 다시 만듭니다.",
            "A notice that the studio could not load appears with a retry button, and the reason is kept in the data-engine-error attribute. The button rebuilds the Game from scratch.",
          ),
        },
      ],
      pitfall: t(
        "'Phaser 는 입장할 때만 불러온다'는 문장은 구조의 의도입니다. 정적 import 1건 때문에 실제 청크 분리는 확인하지 못했으니 '지연 로딩을 의도한 구조'라고 말하세요. 기존 발표 슬라이드의 같은 문장도 이 점에서 단정입니다.",
        "'Phaser is loaded only on entry' describes the intent. Because of one static import the real chunk split was not verified, so say 'a structure designed for lazy loading'. The same sentence in the existing deck slide is stated more firmly than the code supports.",
      ),
    },
    technologies: ["Phaser 3", "TypeScript", "Vite"],
    facts: [
      { value: "25초", label: t("부팅 감시 예산(숨긴 탭 시간 제외, 설계값)", "Boot watchdog budget (hidden-tab time excluded, design value)"), source: `${V}/experience/studio-visible-boot-deadline.ts` },
      { value: "15초 · 병렬 6", label: t("에셋 로더 타임아웃 · 동시 다운로드 수", "Asset loader timeout and parallel downloads"), source: `${V}/StudioVirtualSpacePhaserCanvas.tsx` },
      { value: "60fps 고정 스텝", label: t("Arcade 물리 설정(fixedStep)", "Arcade physics setting (fixedStep)"), source: `${V}/StudioVirtualSpacePhaserCanvas.tsx` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "renderer-quality-tier-adaptive",
    category: "virtual-space",
    name: "Adaptive quality",
    title: t("기기에 맞춰 스스로 고르는 렌더러와 품질 5단계", "A renderer and five quality tiers that pick themselves"),
    status: "live",
    tagline: t(
      "GPU 가 없으면 Canvas 로, 프레임이 떨어지면 품질을 낮췄다가 여유가 생기면 올립니다.",
      "No GPU means Canvas; slow frames lower the quality and spare time raises it again.",
    ),
    background: [
      t(
        "같은 가상 스튜디오도 노트북, 휴대폰, 원격 데스크톱에서 느끼는 속도가 다릅니다. 식당이 손님이 몰리면 메뉴를 줄이고 한가해지면 다시 늘리는 것처럼, 화면 품질을 기기와 현재 프레임 속도에 맞춰 단계적으로 조절합니다. 그림을 그리는 방식 자체(WebGL 또는 Canvas)도 기기에 맞게 고릅니다.",
        "The same virtual studio feels different on a laptop, a phone and a remote desktop. Like a restaurant that trims the menu when it is crowded and restores it when it is quiet, the screen quality is adjusted step by step to the device and the current frame rate. Even the drawing method itself (WebGL or Canvas) is chosen per device.",
      ),
      t(
        "순서는 네 단계입니다. ① 환경을 읽습니다(모션 감소 설정, 메모리, CPU 코어 수, 화면 폭). ② 사용자가 'auto' 를 골랐다면 환경으로 5등급 중 하나를 정합니다. ③ WebGL 컨텍스트를 한 번 만들어 렌더러 이름까지 확인하고, 하드웨어면 WebGL, SwiftShader 같은 소프트웨어 구현이거나 WebGL 이 없으면 Canvas 를 씁니다. ④ 실행 중에는(auto 일 때) 프레임 시간의 이동평균을 재서 목표보다 느린 상태가 3초 이어지면 한 단계 낮추고, 여유가 10초 이어지면 한 단계 올립니다.",
        "There are four steps. 1) Read the environment (reduced-motion setting, memory, CPU cores, viewport width). 2) If the user chose 'auto', the environment picks one of five tiers. 3) Create a WebGL context once and check even the renderer name: hardware means WebGL, while a software implementation such as SwiftShader or no WebGL at all means Canvas. 4) While running (in auto mode), a moving average of frame time is tracked; three seconds of running below target lowers the tier by one and ten seconds of spare room raises it by one.",
      ),
      t(
        "왜 이렇게 했을까요? 'WebGL 이 된다'만 보면 GPU 없는 환경의 소프트웨어 WebGL 도 통과해 오히려 가장 느린 경로가 기본이 됩니다. 이 장면은 스프라이트 위주 2D 라서 Canvas 가 더 싸다는 판단이 코드 주석에 있습니다(측정값은 저장소에서 확인하지 못했습니다). 내릴 때와 올릴 때 기준과 시간을 다르게 둔 것은 한 프레임 느렸다고 화질이 깜빡이지 않게 하는 히스테리시스입니다. 렌더 해상도(DPR)는 등급 상한과 400만 화소 상한 중 작은 쪽을 씁니다.",
        "Why this way? Looking only at 'WebGL works' lets software WebGL on GPU-less machines pass, making the slowest path the default. A code comment judges that Canvas is cheaper for this sprite-based 2D scene (no measurement was found in the repository). Using different thresholds and durations for going down and up is hysteresis, so quality does not flicker after one slow frame. The render resolution (DPR) is the smaller of the tier cap and a 4-million-pixel cap.",
      ),
      t(
        "한계도 있습니다. 등급 프로필 필드 중 `maxAnimatedDecorations` 는 정의만 있고 읽는 곳을 찾지 못했습니다(타운 프로그램의 같은 이름 필드는 별개입니다). 모든 숫자는 설계값이며 기기별 실측 결과는 저장소에서 확인하지 못했습니다.",
        "There are limits. Among the tier profile fields, `maxAnimatedDecorations` is defined but no reader was found (the same-named field in the town program is separate). Every number is a design value, and per-device measurements were not found in the repository.",
      ),
    ],
    keyPoints: [
      t("GPU 가 없으면 자동으로 Canvas 로 내려갑니다", "Without a GPU it falls back to Canvas automatically"),
      t("품질 5등급을 프레임 속도로 자동 조절합니다", "Five quality tiers adapt to the frame rate"),
      t("내리는 데 3초, 올리는 데 10초가 걸립니다", "Down takes 3 s; up takes 10 s"),
    ],
    diagram: {
      id: "renderer-quality-tier-adaptive-diagram",
      kind: "layers",
      title: t("렌더러 판정과 품질 5등급 사다리", "Renderer decision and the five-tier quality ladder"),
      caption: t(
        "먼저 렌더러를 정하고, 그 위에서 품질 등급이 프레임 속도에 따라 오르내립니다.",
        "The renderer is chosen first; the quality tier then moves up and down with the frame rate.",
      ),
      alt: t(
        "맨 위에서 렌더러를 정합니다. 하드웨어 WebGL 이면 WebGL, 소프트웨어이거나 WebGL 이 없으면 Canvas 입니다. 그 아래로 품질 5등급이 ultra 에서 accessibility 까지 내려가며, 프레임이 3초 느리면 한 단계 아래로, 10초 여유가 있으면 한 단계 위로 움직입니다.",
        "At the top the renderer is chosen: hardware WebGL gives WebGL, software or missing WebGL gives Canvas. Below it five quality tiers run from ultra to accessibility; three slow seconds move one tier down and ten spare seconds move one tier up.",
      ),
      layers: [
        { id: "renderer", label: t("렌더러 판정", "Renderer decision"), sub: t("하드웨어 WebGL이면 WebGL, 소프트웨어·불가면 Canvas", "Hardware WebGL → WebGL; software or none → Canvas"), tone: "neutral", chips: ["WebGL2", "Canvas2D"] },
        { id: "ultra", label: t("ultra · 목표 60fps", "ultra · target 60 fps"), sub: t("DPR 2 · NPC 10 · 시야 760 · 조명·날씨 켬", "DPR 2 · NPC 10 · view 760 · lights and weather on"), tone: "local" },
        { id: "high", label: t("high · 목표 55fps", "high · target 55 fps"), sub: t("DPR 1.75 · NPC 8 · 시야 650", "DPR 1.75 · NPC 8 · view 650"), tone: "local" },
        { id: "balanced", label: t("balanced · 목표 45fps", "balanced · target 45 fps"), sub: t("DPR 1.5 · NPC 6 · 시야 520", "DPR 1.5 · NPC 6 · view 520"), tone: "local" },
        { id: "battery", label: t("battery · 목표 30fps", "battery · target 30 fps"), sub: t("DPR 1.15 · NPC 4 · 시야 390 · 조명·날씨 끔", "DPR 1.15 · NPC 4 · view 390 · lights and weather off"), tone: "local" },
        { id: "access", label: t("accessibility · 목표 30fps", "accessibility · target 30 fps"), sub: t("DPR 1 · NPC 2 · 시야 340 · 파티클 0", "DPR 1 · NPC 2 · view 340 · no particles"), tone: "local" },
      ],
      brackets: [
        { label: t("3초 느리면 ↓ · 10초 여유면 ↑", "3 s slow ↓ · 10 s spare ↑"), layerIds: ["ultra", "high", "balanced", "battery", "access"] },
      ],
    },
    usage: [
      {
        feature: t("공간 화면 · 렌더러 자동 선택", "Spatial screen · automatic renderer choice"),
        role: t(
          "Game 을 만들기 직전에 WebGL 프로브 결과로 WebGL/Canvas 를 정하고, 판정 근거를 data 속성에 남깁니다.",
          "Just before creating the Game, the WebGL probe decides WebGL or Canvas, and the reason is recorded in data attributes.",
        ),
        paths: [`${V}/studio-virtual-space-renderer.ts`, `${V}/StudioVirtualSpacePhaserCanvas.tsx`],
        route: "/studio/space",
      },
      {
        feature: t("공간 화면 · 품질 자동 조절", "Spatial screen · automatic quality control"),
        role: t(
          "프레임 시간을 재서 등급을 올리고 내리며, 등급이 해상도 상한·NPC 수·시야 반경·조명·날씨·파티클을 바꿉니다.",
          "Frame time is measured to raise and lower the tier, and the tier changes the resolution cap, NPC count, view radius, lights, weather and particles.",
        ),
        paths: [`${V}/studio-virtual-space-quality.ts`, `${V}/StudioVirtualSpacePhaserCanvas.tsx`],
      },
      {
        feature: t("공간 설정 · 품질 선택", "Space settings · quality choice"),
        role: t(
          "사용자는 auto 외에 5개 등급을 직접 고를 수 있고 선택은 브라우저에 기억됩니다. 모션 감소 설정이면 accessibility 로 고정됩니다.",
          "Users can pick any of the five tiers besides auto, and the choice is remembered in the browser. A reduced-motion setting pins the tier to accessibility.",
        ),
        paths: [`${V}/StudioVirtualSpaceExperiencePanel.tsx`, `${V}/studio-virtual-space-experience-preference.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("WebGL 프로브로 렌더러 고르기", "Choosing the renderer with a WebGL probe"),
        language: "ts",
        code: `// WebGL 컨텍스트를 한 번 만들어 보고, 소프트웨어 구현이면 Canvas 로 내려간다(단순화).
type Probe = { supported: boolean; software: boolean };
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software\\s*rasterizer|basic\\s*render/i;

export function probeWebGL(): Probe {
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return { supported: false, software: false };
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext(); // 컨텍스트 수 제한을 먹지 않게 반납
  return { supported: true, software: SOFTWARE.test(name) };
}

export const pickRenderer = (p: Probe): "webgl" | "canvas" =>
  p.supported && !p.software ? "webgl" : "canvas";`,
        codeEn: `// Create a WebGL context once; if it is a software implementation, fall back to Canvas (simplified).
type Probe = { supported: boolean; software: boolean };
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software\\s*rasterizer|basic\\s*render/i;

export function probeWebGL(): Probe {
  const gl = document.createElement("canvas").getContext("webgl");
  if (!gl) return { supported: false, software: false };
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext(); // hand the context back so it does not use up the limit
  return { supported: true, software: SOFTWARE.test(name) };
}

export const pickRenderer = (p: Probe): "webgl" | "canvas" =>
  p.supported && !p.software ? "webgl" : "canvas";`,
        explain: t(
          "'WebGL 이 되는가'와 '그것이 소프트웨어 구현인가'를 따로 봅니다. 렌더러 이름 문자열로 SwiftShader 같은 구현을 가려내고, 프로브용 컨텍스트는 바로 돌려줍니다.",
          "It asks separately whether WebGL works and whether it is a software implementation. The renderer name string reveals implementations like SwiftShader, and the probe context is returned immediately.",
        ),
        source: `${V}/studio-virtual-space-renderer.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("3초 느리면 내리고 10초 여유면 올리는 조절기", "A controller that lowers after 3 s and raises after 10 s"),
        language: "ts",
        code: `// 프레임 시간 이동평균으로 등급을 오르내린다(studio-virtual-space-quality 의 단순화).
const TIERS = ["accessibility", "battery", "balanced", "high", "ultra"] as const;
const TARGET_FPS = { accessibility: 30, battery: 30, balanced: 45, high: 55, ultra: 60 } as const;

export class AdaptiveTier {
  private slowMs = 0;
  private fastMs = 0;
  private frameMs = 16.67;
  constructor(public index = 2) {}
  sample(deltaMs: number): (typeof TIERS)[number] {
    const dt = Math.min(250, Math.max(1, deltaMs));
    this.frameMs += (dt - this.frameMs) * 0.08; // 지수 이동평균
    const fps = 1000 / this.frameMs;
    const goal = TARGET_FPS[TIERS[this.index]!];
    if (fps < goal - 8) { this.slowMs += dt; this.fastMs = 0; }
    else if (fps > goal + 5) { this.fastMs += dt; this.slowMs = 0; }
    else { this.slowMs = Math.max(0, this.slowMs - dt * 0.5); this.fastMs = Math.max(0, this.fastMs - dt * 0.25); }
    if (this.slowMs >= 3000 && this.index > 0) { this.index -= 1; this.slowMs = 0; }
    else if (this.fastMs >= 10000 && this.index < TIERS.length - 1) { this.index += 1; this.fastMs = 0; }
    return TIERS[this.index]!;
  }
}`,
        codeEn: `// Move the tier up and down using a moving average of frame time (simplified from studio-virtual-space-quality).
const TIERS = ["accessibility", "battery", "balanced", "high", "ultra"] as const;
const TARGET_FPS = { accessibility: 30, battery: 30, balanced: 45, high: 55, ultra: 60 } as const;

export class AdaptiveTier {
  private slowMs = 0;
  private fastMs = 0;
  private frameMs = 16.67;
  constructor(public index = 2) {}
  sample(deltaMs: number): (typeof TIERS)[number] {
    const dt = Math.min(250, Math.max(1, deltaMs));
    this.frameMs += (dt - this.frameMs) * 0.08; // exponential moving average
    const fps = 1000 / this.frameMs;
    const goal = TARGET_FPS[TIERS[this.index]!];
    if (fps < goal - 8) { this.slowMs += dt; this.fastMs = 0; }
    else if (fps > goal + 5) { this.fastMs += dt; this.slowMs = 0; }
    else { this.slowMs = Math.max(0, this.slowMs - dt * 0.5); this.fastMs = Math.max(0, this.fastMs - dt * 0.25); }
    if (this.slowMs >= 3000 && this.index > 0) { this.index -= 1; this.slowMs = 0; }
    else if (this.fastMs >= 10000 && this.index < TIERS.length - 1) { this.index += 1; this.fastMs = 0; }
    return TIERS[this.index]!;
  }
}`,
        explain: t(
          "목표보다 8fps 넘게 느린 시간이 3초 쌓이면 한 칸 내리고, 5fps 넘게 여유로운 시간이 10초 쌓이면 한 칸 올립니다. 중간 구간에서는 누적 시간을 천천히 깎아 순간적인 흔들림에 반응하지 않습니다.",
          "When time more than 8 fps below target adds up to 3 seconds it steps down; when time more than 5 fps above target adds up to 10 seconds it steps up. In between, the accumulated time decays slowly so brief wobbles are ignored.",
        ),
        source: `${V}/studio-virtual-space-quality.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · WebGL API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API", kind: "docs", note: t("WebGL 개요", "WebGL overview") },
      { title: "MDN · WEBGL_debug_renderer_info", url: "https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_debug_renderer_info", kind: "docs", note: t("렌더러 이름을 읽는 확장", "The extension that exposes the renderer name") },
      { title: "MDN · devicePixelRatio", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio", kind: "docs", note: t("DPR 이 무엇인지", "What DPR is") },
      { title: "MDN · prefers-reduced-motion", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion", kind: "docs", note: t("모션 감소 설정", "The reduced-motion setting") },
      { title: "MDN · Navigator.deviceMemory", url: "https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory", kind: "docs", note: t("기기 메모리 힌트", "Device memory hint") },
    ],
    chapterIds: ["performance", "virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "같은 가상 스튜디오를 노트북과 휴대폰, 원격 데스크톱에서 모두 쓸 수 있게 두 가지를 자동으로 합니다. 하나는 그리는 방식을 고르는 것으로, 진짜 GPU 가 있으면 WebGL, 없으면 Canvas 를 씁니다. 다른 하나는 품질 5등급을 프레임 속도에 맞춰 올리고 내리는 것입니다. 3초 느리면 내리고 10초 여유로우면 올려서 화질이 깜빡이지 않게 했습니다.",
        "To make the same studio usable on laptops, phones and remote desktops, two things happen automatically. One picks the drawing method: WebGL when a real GPU exists, otherwise Canvas. The other moves five quality tiers up and down with the frame rate: down after 3 slow seconds, up after 10 spare seconds, so quality does not flicker.",
      ),
      analogy: t(
        "식당이 손님이 몰리면 메뉴를 줄이고 한가해지면 다시 늘리는 것과 같습니다. 잠깐 몰렸다고 바로 메뉴판을 바꾸지 않고 한참 지켜본 뒤에 바꾸는 신중한 가게입니다.",
        "It is like a restaurant that trims its menu when crowded and restores it when quiet, but cautiously: it does not swap the menu for a brief rush and waits to see.",
      ),
      questions: [
        {
          question: t("왜 소프트웨어 WebGL 이면 Canvas 인가요?", "Why use Canvas when WebGL is software-only?"),
          answer: t(
            "'WebGL 이 된다'는 신호만으로는 GPU 없는 환경의 소프트웨어 구현도 통과해 가장 느린 경로가 기본이 됩니다. 코드 주석은 스프라이트 위주 2D 라서 Canvas 가 더 싸다고 설명하지만, 실제 속도 차이 측정값은 저장소에서 확인하지 못했습니다.",
            "'WebGL works' alone lets software implementations on GPU-less machines through, making the slowest path the default. A code comment says Canvas is cheaper for this sprite-based 2D scene, but no measured speed difference was found in the repository.",
          ),
        },
        {
          question: t("등급 숫자는 실측인가요?", "Are the tier numbers measured?"),
          answer: t(
            "아니요, 코드 상수(설계값)입니다. 목표 FPS, DPR 상한, NPC 수, 시야 반경은 모두 설계값이며 기기별 측정 결과는 확인하지 못했습니다.",
            "No, they are code constants (design values). Target FPS, DPR caps, NPC counts and view radii are all design values and per-device measurements were not found.",
          ),
        },
        {
          question: t("사용자가 직접 고정할 수 있나요?", "Can users pin a tier themselves?"),
          answer: t(
            "네. 설정에서 auto 와 5개 등급을 고를 수 있습니다. 운영체제의 모션 감소를 켠 환경은 accessibility 로 고정됩니다.",
            "Yes. The settings offer auto plus the five tiers. Environments with the operating system's reduced-motion setting are pinned to accessibility.",
          ),
        },
      ],
      pitfall: t(
        "수치(DPR 상한, NPC 수, 시야 반경, 목표 FPS)는 모두 설계값입니다. '60fps 보장'처럼 말하지 마세요. 등급 프로필의 maxAnimatedDecorations 는 읽는 곳을 찾지 못했습니다.",
        "Every figure (DPR cap, NPC count, view radius, target FPS) is a design value. Do not say 'guaranteed 60 fps'. The maxAnimatedDecorations field of the tier profile has no reader that was found.",
      ),
    },
    technologies: ["Phaser 3", "WebGL2", "Canvas2D"],
    facts: [
      { value: "5단계", label: t("품질 등급 수(accessibility → ultra)", "Number of quality tiers (accessibility to ultra)"), source: `${V}/studio-virtual-space-quality.ts` },
      { value: "3초 / 10초", label: t("등급을 내리는 / 올리는 지속 시간(설계값)", "Duration to lower / raise a tier (design value)"), source: `${V}/studio-virtual-space-quality.ts` },
      { value: "400만 화소", label: t("렌더 해상도 상한(DPR 계산, 설계값)", "Render resolution cap used in the DPR calculation (design value)"), source: `${V}/studio-virtual-space-presentation.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "tiled-world-data-model",
    category: "virtual-space",
    name: "Tiled JSON",
    title: t("방·벽·문을 데이터로 적은 월드 설계도", "A world blueprint that writes rooms, walls and doors as data"),
    status: "live",
    tagline: t(
      "월드를 매니페스트 데이터로 적고 Tiled JSON 으로 읽으며, 보이는 타일만 청크로 만듭니다.",
      "The world is data in a manifest, read as Tiled JSON, and only visible tiles become chunks.",
    ),
    background: [
      t(
        "가상 스튜디오의 방, 벽, 문, 시작 지점은 코드 곳곳에 흩어져 있지 않고 '월드 매니페스트'라는 하나의 데이터로 표현됩니다. 건축 도면을 그리는 일(데이터)과 건물을 짓는 일(코드)을 나눈 셈입니다. 이 데이터는 오픈소스 맵 에디터 Tiled 의 JSON 형식으로 읽고 내보낼 수 있고, 기본 월드 파일은 `default-world.json` 입니다. 캠퍼스·장소 같은 내장 월드는 코드가 같은 모양의 매니페스트를 만듭니다.",
        "The studio's rooms, walls, doors and starting points are not scattered through the code; they are expressed as one piece of data called a world manifest. It splits drawing the architectural plan (data) from constructing the building (code). This data can be read and exported in the JSON format of the open-source map editor Tiled, and the default world file is `default-world.json`. Built-in worlds such as the campus and places have manifests of the same shape built by code.",
      ),
      t(
        "읽는 순서는 이렇습니다. Tiled 어댑터가 이름이 정해진 객체 레이어(rooms, colliders, props, interactions, portals, spawns, npcs, acoustic-zones 등)를 월드 매니페스트로 바꾸고, 타일 레이어는 GID(타일 번호)와 Wang set 을 해석합니다. GID 의 위쪽 비트는 가로·세로·대각선 뒤집기 표시라서 같은 그림을 뒤집어 반복 무늬를 숨길 수 있습니다. 검증은 두 층입니다. 불러온 JSON 의 모양(구조)을 먼저 보고, 충돌·스폰·구역이 말이 되는지(의미)는 웹의 검증기가 봅니다. 서버에 발행하는 월드에는 서버와 웹이 함께 쓰는 zod 스키마 검사가 더해지고, 기본 Tiled 파일이 검증에 실패하면 코드 안의 기본 월드로 내려갑니다.",
        "Reading works like this. A Tiled adapter turns named object layers (rooms, colliders, props, interactions, portals, spawns, npcs, acoustic-zones and so on) into a world manifest, and interprets tile layers through GIDs (tile numbers) and Wang sets. The high bits of a GID mark horizontal, vertical and diagonal flips, so the same picture can be flipped to hide repetition. Validation has two layers: the shape of the loaded JSON (structure) is checked first, and the web's validator checks that collisions, spawns and zones make sense (meaning). Worlds published to the server additionally pass a zod schema shared by server and web, and if the default Tiled file fails validation the page falls back to the default world in code.",
      ),
      t(
        "큰 월드는 화면에 보이는 부분만 객체로 만들어야 가볍습니다. 그래서 타일을 8×8칸 청크로 나누고 카메라 영역과 한 청크 여유만 만들며, 청크 범위가 바뀔 때만 다시 계산합니다. 중요한 규칙은 타일이 '보이는 것'일 뿐이라는 점입니다. 걸을 수 있는지는 별도의 충돌 사각형(world.colliders)이 정하므로, 그림이 바뀌어도 걸을 수 있는 곳은 바뀌지 않습니다.",
        "A large world stays light only if just the visible part becomes objects. So tiles are cut into 8×8-cell chunks, only the camera area plus one chunk of margin is built, and it is recomputed only when the chunk range changes. The important rule is that tiles are only what you see: where you can walk is decided by separate collision rectangles (world.colliders), so changing the art does not change where you can walk.",
      ),
      t(
        "정직한 한계: 기본 월드 JSON 은 Tiled 에디터로 그린 파일이 아니라 스크립트(generate-virtual-studio-default-world.mts)가 코드의 기본 매니페스트를 Tiled 형식으로 내보낸 것이고, 타일 레이어 없이 배경 이미지 위에 객체 레이어만 둡니다. 이 JSON 을 불러오는 경로는 월드 편집 모드에서 발행본이 없을 때뿐이고, 평소에는 내장 월드나 서버 발행본을 씁니다. 타일 청크를 실제로 쓰는 쪽은 캠퍼스·장소 월드의 tilemap 입니다. Tiled 에디터와 직접 연동하는 화면은 확인하지 못했습니다.",
        "Honest limits: the default world JSON is not a file drawn in the Tiled editor; a script (generate-virtual-studio-default-world.mts) exports the default manifest from code into Tiled format, with only object layers over a background image and no tile layer. The only path that loads this JSON is world-edit mode with no publication; normally the built-in worlds or the server publication are used. The tile chunks are actually used by the tilemap of the campus and place worlds. A screen that integrates directly with the Tiled editor was not found.",
      ),
    ],
    keyPoints: [
      t("방·벽·문은 하나의 매니페스트 데이터입니다", "Rooms, walls and doors are one manifest of data"),
      t("구조·의미 2층 검증, 실패하면 기본 월드", "Two-layer validation; failure falls back to the default"),
      t("타일은 보이는 것, 충돌은 별도 권위", "Tiles are visuals; collisions are a separate authority"),
    ],
    diagram: {
      id: "tiled-world-data-model-diagram",
      kind: "graph",
      title: t("Tiled JSON 이 화면의 타일이 되기까지", "From Tiled JSON to tiles on screen"),
      caption: t(
        "JSON 을 매니페스트로 바꿔 검증하고, 보이는 청크만 만들되 충돌은 따로 지킵니다.",
        "The JSON becomes a verified manifest, only visible chunks are built, and collisions are kept separately.",
      ),
      alt: t(
        "Tiled JSON 을 어댑터가 읽어 변환하고 두 층으로 검증합니다. 통과하면 월드 매니페스트가 되고 실패하면 기본 월드로 내려갑니다. 매니페스트에서 보이는 8×8 청크만 Phaser 타일 층으로 만들며, 충돌 사각형은 렌더와 별개로 걸을 수 있는 곳을 정합니다.",
        "An adapter reads and converts the Tiled JSON, then validates it in two layers. A pass becomes the world manifest and a failure falls back to the default world. Only visible 8×8 chunks of the manifest become Phaser tile layers, while collision rectangles decide where one can walk independently of rendering.",
      ),
      nodes: [
        { id: "tiled", label: t("Tiled JSON", "Tiled JSON"), sub: t("default-world.json", "default-world.json"), tone: "neutral", shape: "cylinder", at: [0, 0] },
        { id: "adapter", label: t("Tiled 어댑터", "Tiled adapter"), sub: t("레이어·GID → 매니페스트", "Layers, GIDs → manifest"), tone: "local", at: [1, 0] },
        { id: "check", label: t("2층 검증", "Two-layer check"), sub: t("구조 + 의미", "Shape + meaning"), tone: "warn", shape: "diamond", at: [2, 0] },
        { id: "manifest", label: t("월드 매니페스트", "World manifest"), sub: t("방·충돌·스폰·타일맵", "Rooms, colliders, spawns, tilemap"), tone: "good", at: [3, 0] },
        { id: "chunks", label: t("8×8 청크", "8×8 chunks"), sub: t("화면 + 1청크만", "Screen plus one chunk"), tone: "local", at: [4, 0] },
        { id: "layers", label: t("Phaser 타일 층", "Phaser tile layers"), sub: t("청크 단위 생성·삭제", "Built and removed per chunk"), tone: "local", at: [5, 0] },
        { id: "fallback", label: t("기본 월드", "Default world"), sub: t("검증 실패 시 대체", "Used when checks fail"), tone: "warn", at: [2, 1] },
        { id: "colliders", label: t("충돌 사각형", "Collision rects"), sub: t("걸을 수 있는 곳의 권위", "Authority on walkable space"), tone: "good", at: [3, 1] },
      ],
      edges: [
        { from: "tiled", to: "adapter", label: t("읽기", "read") },
        { from: "adapter", to: "check", label: t("변환", "convert") },
        { from: "check", to: "manifest", label: t("통과", "pass") },
        { from: "check", to: "fallback", label: t("실패", "fail"), style: "dashed" },
        { from: "manifest", to: "chunks", label: t("뷰포트", "viewport") },
        { from: "chunks", to: "layers", label: t("마운트", "mount") },
        { from: "manifest", to: "colliders", label: t("충돌은 별도", "kept apart"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("월드 편집 모드 · 기본 월드 불러오기", "World-edit mode · loading the default world"),
        role: t(
          "월드 편집 모드에서 서버 발행본이 없으면 기본 Tiled 월드를 받아 편집의 바탕 매니페스트로 바꾸고, 검증에 실패하면 코드 안의 기본 월드를 씁니다.",
          "In world-edit mode with no server publication it fetches the default Tiled world, converts it to the base manifest for editing, and uses the code default if validation fails.",
        ),
        paths: [
          `${V}/studio-virtual-space-world-loader.ts`,
          `${V}/studio-virtual-space-tiled-adapter.ts`,
          "apps/web/public/assets/virtual-studio/world/default-world.json",
        ],
      },
      {
        feature: t("타일 월드 · 청크 렌더", "Tile worlds · chunked rendering"),
        role: t(
          "카메라 영역에 필요한 8×8 청크만 만들고 사라진 청크는 지우며, 필요한 타일셋 텍스처도 청크 단위로 불러옵니다.",
          "Builds only the 8×8 chunks the camera needs, removes chunks that leave, and loads the needed tileset textures per chunk.",
        ),
        paths: [`${V}/studio-virtual-space-tile-chunks.ts`, `${V}/studio-virtual-space-tile-runtime.ts`],
      },
      {
        feature: t("월드 검증(웹·서버 공용)", "World validation (shared by web and server)"),
        role: t(
          "서버와 웹이 같은 zod 스키마로 구조·크기를 확인하고, 웹이 충돌·스폰 같은 의미를 한 번 더 확인합니다.",
          "Server and web check structure and size with the same zod schema, and the web checks meaning such as collisions and spawns once more.",
        ),
        paths: [
          `${V}/studio-virtual-space-world-manifest.ts#validateStudioWorldManifest`,
          "packages/studio-project-model/src/graph/world-tilemap.ts",
        ],
      },
      {
        feature: t("기본 월드 생성 스크립트", "Default world generator script"),
        role: t(
          "코드의 기본 매니페스트를 Tiled 형식 JSON 으로 내보내 기본 월드 파일을 만듭니다.",
          "Exports the default manifest in code to Tiled-format JSON to produce the default world file.",
        ),
        paths: ["scripts/generate-virtual-studio-default-world.mts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("Tiled 타일 번호의 뒤집기 비트 읽기", "Reading the flip bits of a Tiled tile ID"),
        language: "ts",
        code: `// Tiled 타일 번호(GID)의 위쪽 비트는 뒤집기 표시이고, 아래 28비트가 실제 타일 번호다.
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x0fffffff;

export function decodeGid(raw: number) {
  return {
    gid: (raw & GID_MASK) >>> 0,
    flipX: (raw & FLIP_H) !== 0,
    flipY: (raw & FLIP_V) !== 0,
    diagonal: (raw & FLIP_D) !== 0,
  };
}`,
        codeEn: `// The high bits of a Tiled tile ID (GID) are flip flags; the low 28 bits are the real tile number.
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const GID_MASK = 0x0fffffff;

export function decodeGid(raw: number) {
  return {
    gid: (raw & GID_MASK) >>> 0,
    flipX: (raw & FLIP_H) !== 0,
    flipY: (raw & FLIP_V) !== 0,
    diagonal: (raw & FLIP_D) !== 0,
  };
}`,
        explain: t(
          "같은 타일 그림을 뒤집어 쓰면 반복 무늬가 덜 티 납니다. 번호를 그대로 쓰면 뒤집기 비트 때문에 엉뚱한 타일이 되므로, 마스크로 걷어 내고 표시만 따로 읽습니다.",
          "Flipping the same tile picture makes repetition less obvious. Using the raw number would pick a wrong tile because of the flip bits, so the mask strips them and the flags are read separately.",
        ),
        source: "packages/studio-project-model/src/graph/world-tilemap.ts",
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("보이는 청크만 고르기", "Choosing only the visible chunks"),
        language: "ts",
        code: `// 카메라 영역에 한 청크(8×8칸) 여유를 더한 범위의 청크 키만 만든다(단순화).
const CHUNK = 8;
type View = { x: number; y: number; width: number; height: number };

export function visibleChunks(view: View, tile: number, cols: number, rows: number): string[] {
  const left = view.x / tile;
  const top = view.y / tile;
  const minX = Math.max(0, Math.floor(left / CHUNK) - 1);
  const minY = Math.max(0, Math.floor(top / CHUNK) - 1);
  const maxX = Math.min(Math.ceil(cols / CHUNK) - 1, Math.ceil((left + view.width / tile) / CHUNK));
  const maxY = Math.min(Math.ceil(rows / CHUNK) - 1, Math.ceil((top + view.height / tile) / CHUNK));
  const keys: string[] = [];
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) keys.push(\`\${cx}:\${cy}\`);
  }
  return keys; // 범위 문자열이 그대로면 다시 계산하지 않는다
}`,
        codeEn: `// Build only the chunk keys inside the camera area plus one chunk (8×8 cells) of margin (simplified).
const CHUNK = 8;
type View = { x: number; y: number; width: number; height: number };

export function visibleChunks(view: View, tile: number, cols: number, rows: number): string[] {
  const left = view.x / tile;
  const top = view.y / tile;
  const minX = Math.max(0, Math.floor(left / CHUNK) - 1);
  const minY = Math.max(0, Math.floor(top / CHUNK) - 1);
  const maxX = Math.min(Math.ceil(cols / CHUNK) - 1, Math.ceil((left + view.width / tile) / CHUNK));
  const maxY = Math.min(Math.ceil(rows / CHUNK) - 1, Math.ceil((top + view.height / tile) / CHUNK));
  const keys: string[] = [];
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) keys.push(\`\${cx}:\${cy}\`);
  }
  return keys; // if the range string is unchanged, nothing is recomputed
}`,
        explain: t(
          "화면 좌표를 칸 단위로 바꾸고 8칸씩 묶어 청크 번호 범위를 구합니다. 가장자리에서 빈 칸이 보이지 않도록 한 청크를 더 만들고, 월드 밖은 잘라 냅니다.",
          "Screen coordinates become cell units grouped by 8 into a chunk range. One extra chunk avoids blank edges while moving, and anything outside the world is clipped.",
        ),
        source: `${V}/studio-virtual-space-tile-chunks.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Tiled · JSON map format", url: "https://doc.mapeditor.org/en/stable/reference/json-map-format/", kind: "spec", note: t("레이어·객체·타일셋의 형식", "Format of layers, objects and tilesets") },
      { title: "Tiled · Global tile IDs", url: "https://doc.mapeditor.org/en/stable/reference/global-tile-ids/", kind: "spec", note: t("GID 와 뒤집기 비트", "GIDs and flip bits") },
      { title: "Tiled map editor", url: "https://www.mapeditor.org/", kind: "docs", note: t("오픈소스 맵 에디터", "The open-source map editor") },
      { title: "Zod", url: "https://zod.dev/", kind: "docs", note: t("구조 검증 스키마", "The schema validation library") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "방과 벽과 문은 '월드 매니페스트'라는 데이터로 표현하고, Tiled 라는 맵 에디터의 JSON 형식으로 읽고 내보낼 수 있습니다. 불러올 때 구조와 의미를 두 겹으로 검증하고, 실패하면 안전한 기본 월드로 내려갑니다. 큰 월드도 화면에 보이는 8×8 청크만 만들기 때문에 가볍습니다. 타일은 보이는 그림일 뿐이고 걸을 수 있는지는 별도의 충돌 사각형이 정합니다.",
        "Rooms, walls and doors are expressed as data called a world manifest, which can be read and exported in the JSON format of the Tiled map editor. On load it is validated in two layers, structure and meaning, and a failure falls back to a safe default world. Even a big world stays light because only the visible 8×8 chunks are built. Tiles are just pictures; separate collision rectangles decide where you can walk.",
      ),
      analogy: t(
        "건축 도면과 시공의 관계입니다. 도면(JSON)만 바꾸면 방이 바뀌고, 시공팀(Phaser)은 눈앞의 구역만 짓습니다.",
        "It is like an architectural plan and its construction. Change the plan (JSON) and the rooms change, while the builders (Phaser) construct only the section in front of them.",
      ),
      questions: [
        {
          question: t("Tiled 에디터로 월드를 만드나요?", "Do you build worlds in the Tiled editor?"),
          answer: t(
            "어댑터는 Tiled JSON 형식을 읽습니다. 하지만 기본 월드 파일은 에디터 산출물이 아니라 스크립트가 코드의 기본 매니페스트를 내보낸 것입니다. 에디터와 직접 연동하는 제품 화면은 확인하지 못했습니다.",
            "The adapter reads the Tiled JSON format. The default world file, however, is not editor output; a script exports it from the default manifest in code. A product screen that integrates with the editor directly was not found.",
          ),
        },
        {
          question: t("청크가 충돌도 바꾸나요?", "Do chunks change collisions too?"),
          answer: t(
            "아니요. 청크는 보이는 타일만 다룹니다. 충돌과 상호작용의 권위는 월드 매니페스트의 충돌 사각형입니다.",
            "No. Chunks handle only visible tiles. Collision and interaction authority sits in the manifest's collision rectangles.",
          ),
        },
        {
          question: t("월드 파일이 망가지면요?", "What if the world file is broken?"),
          answer: t(
            "내려받기 실패, 형식 오류, 검증 실패는 모두 코드 안의 기본 월드로 대체됩니다. 월드 편집 모드는 빈 화면 대신 기본 공간으로 시작합니다.",
            "Download failure, bad format and failed validation all fall back to the default world in code, so world-edit mode starts from the default space instead of a blank screen.",
          ),
        },
      ],
      pitfall: t(
        "'Tiled 로 만든 월드'라고 단정하지 마세요. 기본 월드 JSON 은 스크립트가 만든 Tiled 형식 파일이고 타일 레이어가 없으며, 평소 플레이는 내장 월드나 발행본을 쓰고 이 JSON 은 편집 모드의 바탕입니다. 청크 렌더는 tilemap 이 있는 캠퍼스·장소 월드에서 쓰입니다.",
        "Do not assert 'a world made with Tiled'. The default world JSON is a Tiled-format file produced by a script and has no tile layer; normal play uses built-in worlds or a publication, and this JSON is the base for edit mode. Chunked rendering is used by campus and place worlds that carry a tilemap.",
      ),
    },
    technologies: ["Tiled", "Zod", "Phaser 3"],
    facts: [
      { value: "8×8칸", label: t("타일 청크 크기", "Tile chunk size"), source: `${V}/studio-virtual-space-tile-chunks.ts` },
      { value: "0x0fffffff", label: t("GID 마스크(아래 28비트가 타일 번호)", "GID mask (the low 28 bits are the tile number)"), source: "packages/studio-project-model/src/graph/world-tilemap.ts" },
      { value: "131,072칸", label: t("타일맵 셀 수 상한(설계값)", "Tilemap cell cap (design value)"), source: "packages/studio-project-model/src/graph/world-tilemap.ts" },
      { value: "640×480 (2px)", label: t("기본 월드 JSON 의 칸 수와 칸 크기", "Cell count and cell size of the default world JSON"), source: "apps/web/public/assets/virtual-studio/world/default-world.json" },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
