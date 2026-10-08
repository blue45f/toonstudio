import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 4 "함께 작업하기".
 * 사실의 정본은 오픈소스 지도(yjs-automerge·socket-io 행)·ADR-0025·docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md·
 * docs/studio/realtime-production-activation-20260921.md·deploy/cloudflare-realtime/README.md 이다.
 * 운영에서 켜져 있는지(TURN 키·Durable Objects 활성 범위·인증된 방 입장·WAN 수용)는 코드로 알 수 없으므로 단정하지 않는다. 기준일 2026-10-08.
 */

const LIVE = "apps/web/src/domains/creator/live";
const OFFLINE = "apps/web/src/domains/creator/offline-branch";
const REALTIME = "deploy/cloudflare-realtime";

export const LIBRARY_AREA_COLLAB_REALTIME: LibraryGuideArea = {
  id: "collab-realtime",
  number: 4,
  title: t("함께 작업하기", "Working together"),
  question: t("동시 편집과 실시간 연결은 무엇으로 맞추나?", "What keeps concurrent editing and realtime links in step?"),
  oneLine: t(
    "'실시간'을 하나로 묶지 않고, 문서·접속 상태·통화 신호·영상마다 통로와 주인을 따로 둡니다.",
    "'Realtime' is not one thing: documents, presence, call signals and video each get their own channel and owner.",
  ),
  easy: t(
    "공유 사무실과 같습니다. 공동 문서는 공유 벽에 붙이는 포스트잇(Yjs)이고, 출입 확인과 메시지는 안내 데스크(서버), 누가 와 있는지는 방 관리인(Durable Objects)이 봅니다. 통화는 책상끼리 직접 건네는 쪽지(WebRTC)입니다.",
    "It is like a shared office. The shared document is sticky notes on a common wall (Yjs), entry checks and messages go through the front desk (the server), and a room manager (Durable Objects) watches who is in. Calls are notes passed directly between desks (WebRTC).",
  ),
  designWhy: [
    {
      title: t("'실시간' 하나로 묶지 않고 주인을 나눈다", "Split 'realtime' into separately owned channels"),
      body: t(
        "문서 변경·접속 상태·통화 신호·영상 음성은 서로 다른 시스템입니다. 데이터마다 권위를 하나씩 두고, 거리나 방 모양보다 실제 수신자 범위와 권한을 우선합니다.",
        "Document changes, presence, call signals and video are different systems. Each kind of data gets one authority, and the real recipient scope and permissions take priority over distance or room shape.",
      ),
    },
    {
      title: t("CRDT는 권한을 모르므로 서버가 먼저", "A CRDT ignores permissions, so the server goes first"),
      body: t(
        "Yjs는 병합이 같은 결과로 모이게만 보장하고 누가 써도 되는지는 모릅니다. 서버가 권한·속도·불변식을 먼저 검사한 변경만 저장하고 전달하며, 큰 비트맵은 CRDT 밖에 따로 둡니다.",
        "Yjs only guarantees that merges converge, not who may write. The server stores and relays only changes that pass its checks on rights, rate and invariants, and big bitmaps stay outside the CRDT.",
      ),
    },
    {
      title: t("큰 미디어는 서버를 거치지 않는다", "Big media skips the server"),
      body: t(
        "영상·음성·채팅은 브라우저끼리 직접(P2P) 보내고 서버는 통로를 여는 신호만 중계합니다. 유료 TURN·SFU 없이 공개 STUN으로 시작해 미디어 중계 비용을 들이지 않았습니다.",
        "Video, voice and chat travel directly between browsers (P2P) and the server relays only the signals that open the channel. Starting with public STUN and no paid TURN or SFU avoided adding media relay cost.",
      ),
    },
    {
      title: t("작은 방은 풀메시, 큰 모임은 다른 길", "Full mesh for small rooms, another path for big ones"),
      body: t(
        "지금 허들은 공개 STUN을 쓰는 작은 풀메시입니다. 소규모 성공이 큰 회의나 방송 품질을 증명하지 않으므로, 큰 회의·방송은 현재 범위가 아니며 SFU 구성과 운영 용량 검증이 필요하다고 설계 문서가 적었습니다.",
        "Today's huddle is a small full mesh on public STUN. Small-scale success does not prove large-meeting or broadcast quality, so the design document says large meetings and broadcasts are out of scope and need an SFU setup and capacity checks.",
      ),
    },
  ],
  diagram: {
    id: "collab-realtime-diagram",
    kind: "layers",
    title: t("함께 작업할 때 오가는 다섯 통로", "Five channels used when working together"),
    caption: t(
      "작품이 남는 길(문서·서버)과 지나가는 길(접속 상태·통화)을 나누고, 통로마다 맡은 라이브러리가 다릅니다.",
      "The paths where work is kept (document, server) are separated from the paths where things pass (presence, calls), and each channel has its own library.",
    ),
    alt: t(
      "위에서 아래로 다섯 통로입니다. 첫째는 Yjs와 Automerge가 편집을 합치는 문서 층이고, 둘째는 Socket.IO가 입장 티켓으로 문서와 잠금을 나르는 서버 통로입니다. 셋째는 Cloudflare Durable Objects가 접속 상태와 화면 공유 신호를 조정하는 방 조정자, 넷째는 WebRTC가 브라우저끼리 채팅과 통화를 직접 주고받는 직통 통로입니다. 마지막은 직접 연결이 막힐 때 쓰는 STUN과 TURN입니다. 위 두 통로는 작품이 남는 길이고 아래 세 통로는 일시적인 신호와 미디어입니다.",
      "Five channels from top to bottom. First is the document layer where Yjs and Automerge merge edits; second is the server channel where Socket.IO carries documents and locks using an entry ticket. Third is the room coordinator where Cloudflare Durable Objects handles presence and screen-share signals, and fourth is the direct channel where WebRTC passes chat and calls between browsers. Last are STUN and TURN, used when a direct link is blocked. The top two channels are where work is kept, and the bottom three carry transient signals and media.",
    ),
    layers: [
      {
        id: "document",
        label: t("문서 층 (CRDT)", "Document layer (CRDT)"),
        sub: t("편집을 합치고, 오프라인 변경은 제안으로 모읍니다", "Merges edits; offline changes are gathered as proposals"),
        tone: "good",
        chips: ["Yjs", "Automerge"],
      },
      {
        id: "server",
        label: t("서버 통로 (WebSocket)", "Server channel (WebSocket)"),
        sub: t("티켓으로 입장해 문서·잠금·채팅을 나릅니다", "Entered with a ticket; carries documents, locks and chat"),
        tone: "server",
        chips: ["Socket.IO", "NestJS", "PostgreSQL"],
      },
      {
        id: "coordinator",
        label: t("방 조정자 (엣지·선택형)", "Room coordinator (edge, optional)"),
        sub: t("방마다 객체 하나가 접속 상태·커서·신호를 조정", "One object per room coordinates presence, cursors and signals"),
        tone: "edge",
        chips: ["Durable Objects"],
      },
      {
        id: "direct",
        label: t("직통 통로 (브라우저끼리)", "Direct channel (browser to browser)"),
        sub: t("허들 채팅·통화를 서버 없이 직접 주고받습니다", "Huddle chat and calls pass directly, without the server"),
        tone: "local",
        chips: ["WebRTC", "DataChannel"],
      },
      {
        id: "relay",
        label: t("연결 도우미", "Connection helpers"),
        sub: t("막힐 때 STUN·TURN. 운영 키는 별도 확인", "STUN and TURN when blocked; production keys are checked separately"),
        tone: "external",
        chips: ["STUN", "Cloudflare TURN", "coturn"],
      },
    ],
    brackets: [
      { label: t("작품이 남는 길", "Where work is kept"), layerIds: ["document", "server"] },
      { label: t("지나가는 신호·영상", "Transient signals and media"), layerIds: ["coordinator", "direct", "relay"] },
    ],
  },
  libraries: [
    {
      id: "yjs",
      name: "Yjs",
      kind: "library",
      package: "yjs",
      oneLine: t("여러 사람이 같은 장면을 동시에 고쳐도 하나로 합쳐 주는 공동 편집 기술(CRDT)", "Collaborative-editing technology (a CRDT) that merges simultaneous edits into one"),
      usedFor: t(
        "획·레이어 순서·삭제 기록을 Yjs 문서에 담아 동시에 그려도 같은 결과로 모이게 하고, 서버가 검사를 통과시킨 변경만 저장·전달합니다.",
        "Keeps strokes, layer order and deletion records in a Yjs document so simultaneous drawing converges, and the server stores and relays only changes that pass its checks.",
      ),
      why: t(
        "오프라인 편집 뒤 재접속, 중복 도착, 순서 뒤바뀜에도 병합 규칙만으로 같은 결과가 나와 그림 편집에 맞다고 보았습니다. ADR-0025가 Yjs를 정본으로 정했습니다.",
        "Merge rules alone give the same result after offline edits, duplicate delivery and reordering, which suits drawing. ADR-0025 fixes Yjs as the canonical copy.",
      ),
      alternatives: t(
        "OT(서버가 편집을 한 줄로 세움)나 쓰는 동안 나머지를 막는 잠금과 견준 결정 기록은 찾지 못했습니다. 짧은 편집 잠금은 같은 레이어를 동시에 만지지 않도록 함께 씁니다.",
        "We found no decision record comparing it with OT, where a server lines up every edit, or with locks that block others while one person writes. Short edit locks are still used so two people do not touch one layer at once.",
      ),
      cost: t(
        "CRDT는 누가 쓰는지 모릅니다. 서버가 권한·속도·불변식을 검사해야 하고, 큰 비트맵은 맞지 않아 따로 저장합니다. 기록이 쌓이면 압축과 스키마 이전이 운영 과제입니다.",
        "A CRDT does not know who is writing, so the server must check rights, rate and invariants; big bitmaps do not fit and are stored separately. Compaction and schema migration remain operational work as records pile up.",
      ),
      paths: [
        `${LIVE}/studio-crdt-document-host.ts`,
        `${LIVE}/studio-crdt-document.ts`,
        "apps/api/src/modules/creator/studio-crdt.service.ts",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "yjs-automerge",
      atlasIds: ["yjs-crdt-document", "crdt-lock-revision"],
    },
    {
      id: "automerge",
      name: "Automerge",
      kind: "library",
      package: "@automerge/automerge",
      oneLine: t("오프라인에서 한 변경을 '제안 기록'으로 모아 두는 선택형 도구", "An optional tool that gathers offline changes into a 'proposal journal'"),
      usedFor: t(
        "연결이 끊긴 동안의 변경을 Worker에서 브랜치(제안 기록)로 모아 둡니다. 정본은 여전히 Yjs 문서입니다.",
        "Gathers changes made while offline into a branch (a proposal journal) in a Worker. The canonical copy is still the Yjs document.",
      ),
      why: t(
        "정본을 Yjs 하나로 두고, Automerge는 오프라인 제안 기록으로만 허용했습니다. 두 CRDT가 같은 문서의 정본을 다투지 않게 역할을 나눈 결정입니다(ADR-0025).",
        "Yjs stays the single canonical copy and Automerge is admitted only as an offline proposal journal. The decision gives the two CRDTs separate roles so they never contest one document (ADR-0025).",
      ),
      cost: t(
        "정본이 아닌 선택형이라 환경변수로 켭니다. 운영 빌드는 VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH를 켠 설정(.env.production)이고, 실제 사용 정도는 이 페이지가 확인하지 못했습니다.",
        "It is optional rather than canonical and is enabled by an environment variable. The production build sets VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH on (.env.production); how much it is actually used was not checked here.",
      ),
      paths: [
        `${OFFLINE}/studio-offline-branch-automerge.ts`,
        `${OFFLINE}/studio-offline-branch.worker.ts`,
        `${OFFLINE}/studio-offline-branch-feature.ts`,
      ],
      license: "MIT",
      status: "live",
      mapRowId: "yjs-automerge",
    },
    {
      id: "socket-io",
      name: "Socket.IO",
      kind: "library",
      package: "socket.io",
      oneLine: t("스튜디오 실시간 협업의 서버 통로가 되는 WebSocket 연결 라이브러리", "The WebSocket library that forms the server channel of studio realtime collaboration"),
      usedFor: t(
        "작업실 입장·문서 동기화·잠금·채팅의 서버 경로입니다. 로그인 쿠키 대신 60초짜리 입장 전용 티켓으로 들어갑니다.",
        "The server path for entering the workroom, document sync, locks and chat. Entry uses a 60-second admission-only ticket instead of the login cookie.",
      ),
      why: t(
        "NestJS 게이트웨이와 브라우저 클라이언트가 같은 라이브러리로 이어지고, 서버를 여러 대로 늘릴 때를 위한 PostgreSQL 어댑터도 있습니다. 문서·잠금·권한 확인을 서버가 쥐는 경로로 둡니다.",
        "A NestJS gateway and the browser client connect with the same library, and a PostgreSQL adapter exists for scaling to several servers. It keeps documents, locks and permission checks on a server-held path.",
      ),
      alternatives: t(
        "접속 상태·화면 공유 신호는 가능하면 Cloudflare Durable Objects가 맡고, 통화 신호와 채팅은 브라우저 직통 통로로 갑니다. WebTransport는 코드만 준비한 후보입니다.",
        "Presence and screen-share signals go to Cloudflare Durable Objects when possible, and call signals and chat use the direct browser channel. WebTransport is only a candidate prepared in code.",
      ),
      cost: t(
        "운영에서는 장기 연결 origin이 있을 때만 소켓을 만듭니다(.env.production에 설정). 무료 core-api는 한 대·메모리 어댑터이고 PostgreSQL 어댑터는 선택형 studio-live 서비스에 있습니다.",
        "In production the socket is created only when a long-running origin is set (in .env.production). The free core-api runs one server with the memory adapter, and the PostgreSQL adapter is configured on the optional studio-live service.",
      ),
      paths: [
        "apps/api/src/modules/creator/studio-live.gateway.ts",
        `${LIVE}/studio-live-socket-connection-factory.ts`,
        "apps/api/src/realtime/studio-postgres-io.adapter.ts",
      ],
      license: "MIT",
      status: "configured",
      mapRowId: "socket-io",
      atlasIds: ["socket-io-room-tickets"],
    },
    {
      id: "webrtc",
      name: "WebRTC",
      kind: "format",
      oneLine: t("브라우저끼리 직접 영상·음성·데이터를 주고받는 웹 표준", "A web standard that lets browsers exchange video, voice and data directly"),
      usedFor: t(
        "허들(근처 대화)의 채팅·통화를 브라우저끼리 직통 통로(studio-direct-v1)로 보냅니다. 서버는 통로를 여는 신호와 화면 공유 신호만 중계합니다.",
        "Sends huddle (nearby conversation) chat and calls between browsers over a direct channel (studio-direct-v1). The server relays only the signals that open the channel and screen-share signals.",
      ),
      why: t(
        "유료 TURN·SFU를 두지 않고 브라우저끼리 직접 연결(P2P)하는 것을 기본 정책으로 삼았습니다. 직접 연결된 영상·음성은 서버를 거치지 않아 미디어 중계 비용이 없습니다(사이트·신호 비용은 별도).",
        "The default policy is direct browser-to-browser (P2P) links with no paid TURN or SFU. Direct video and voice never pass through the server, so no media relay cost is added (hosting and signaling cost remain).",
      ),
      alternatives: t(
        "SFU는 큰 회의에 유리하지만 서버가 영상을 받아야 해서 두지 않았습니다. 대신 풀메시의 한계를 정원 사다리로 다룹니다(도감 카드).",
        "An SFU suits big meetings but needs the server to receive video, so none was set up. Instead the full-mesh limit is handled with a capacity ladder (atlas cards).",
      ),
      cost: t(
        "엄격한 NAT에서는 직통이 막힐 수 있어 모든 네트워크에서의 연결을 보장하지 않습니다. 실제 기기·WAN 검증은 별도이며 소규모 P2P의 성공이 방송 품질을 증명하지 않습니다.",
        "A strict NAT can block a direct link, so connection on every network is not guaranteed. Real-device and WAN checks are separate, and small-scale P2P success does not prove broadcast quality.",
      ),
      paths: [
        `${LIVE}/huddle/studio-p2p-huddle-controller.ts`,
        `${LIVE}/studio-live-direct-port.ts`,
        "docs/technology/toonstudio-webrtc-realtime-media-2026-09-25.md",
      ],
      license: "Web standard",
      status: "experimental",
      atlasIds: ["webrtc-three-plane-signaling", "webrtc-datachannel-direct-lane", "webrtc-mesh-limits"],
    },
    {
      id: "durable-objects",
      name: "Cloudflare Durable Objects",
      kind: "service",
      oneLine: t("방 하나에 관리인 한 명(객체 하나)을 붙여 주는 Cloudflare 서비스", "A Cloudflare service that gives each room one manager (one object)"),
      usedFor: t(
        "접속 상태·커서·댓글 알림·화면 공유 신호를 방 단위 객체 하나가 순서대로 조정합니다. 그림 문서와 권한은 맡지 않습니다.",
        "One object per room coordinates presence, cursors, comment notices and screen-share signals in order. It owns no drawing document or permissions.",
      ),
      why: t(
        "한 방의 요청을 객체 하나가 차례로 처리해 순서를 맞추는 잠금이 줄고, 조용한 방은 메모리에서 내려가 유휴 비용이 줄어듭니다. 채널마다 번호를 매겨 놓친 이벤트만 다시 받습니다.",
        "One object handles a room's requests in turn, so less locking is needed to keep order, and a quiet room unloads from memory to cut idle cost. Each channel is numbered so only missed events are replayed.",
      ),
      cost: t(
        "선택형 배포 구성(scaffold)이라 운영에서 어디까지 켜져 있는지는 코드로 알 수 없습니다. 방당 연결 64 같은 숫자는 설정값이지 부하 시험 결과가 아닙니다.",
        "It is an optional deployment scaffold, so how far it is switched on in production cannot be known from code. Numbers such as 64 connections per room are settings, not load-test results.",
      ),
      paths: [
        `${REALTIME}/src/room.ts`,
        `${REALTIME}/wrangler.jsonc`,
        `${REALTIME}/README.md`,
      ],
      license: "Service terms",
      status: "configured",
      atlasIds: ["durable-objects-realtime"],
    },
    {
      id: "cloudflare-turn",
      name: "Cloudflare Realtime TURN",
      kind: "service",
      oneLine: t("직접 연결이 막힌 네트워크에서 대화를 대신 전달해 주는 중계 서비스", "A relay service that carries a conversation when a direct connection is blocked"),
      usedFor: t(
        "허들·직통 통로는 실시간 Worker가 받아 온 Cloudflare TURN 단기 자격증명(유효 4시간)을 쓰고, 없으면 STUN 전용으로 바로 시작합니다.",
        "The huddle and direct channel use short-lived Cloudflare TURN credentials (valid 4 hours) fetched by the realtime Worker, and start STUN-only when none exist.",
      ),
      why: t(
        "키를 브라우저에 고정하면 누구나 쓸 수 있어 서버가 짧은 수명으로 즉석 발급합니다. Cloudflare TURN은 키만 등록하면 쓸 수 있어 자체 TURN 서버를 운영하지 않아도 됩니다.",
        "A key fixed in the browser could be used by anyone, so the server issues short-lived credentials on demand. Cloudflare TURN works once a key is registered, with no TURN server of our own to run.",
      ),
      alternatives: t(
        "화면 공유는 API가 coturn 방식(HMAC-SHA1) 자격을 발급하며, coturn은 직접 운영하는 대안으로 선택형 배포 구성입니다.",
        "For screen sharing the API issues coturn-style (HMAC-SHA1) credentials, and coturn is the self-run alternative, shipped as an optional deployment scaffold.",
      ),
      cost: t(
        "운영 TURN 키 등록과 엄격한 NAT에서 중계가 통과한 검증은 확인하지 못했습니다. 2026-09-21 운영 문서는 STUN 전용 P2P가 구성된 정책이고 유료 TURN·SFU는 없다고 적었습니다.",
        "Production TURN key registration and relay success through a strict NAT were not confirmed. An operations note of 2026-09-21 records STUN-only P2P as the configured policy with no paid TURN or SFU.",
      ),
      paths: [
        `${REALTIME}/src/turn.ts`,
        `${LIVE}/studio-ice-configuration.ts`,
        "docs/studio/realtime-production-activation-20260921.md",
      ],
      license: "Service terms",
      status: "configured",
      atlasIds: ["webrtc-ice-turn-paths"],
    },
  ],
  pitfall: t(
    "'실시간'은 하나가 아닙니다. 문서·접속 상태·통화 신호·영상은 통로와 주인이 각각 따로입니다. Durable Objects와 TURN은 선택형 구성이라, 운영에서 켜져 있는지와 인증된 방 입장·WAN 수용은 이 페이지가 단정하지 않습니다.",
    "'Realtime' is not one thing: documents, presence, call signals and video each have their own channel and owner. Durable Objects and TURN are optional setups, so whether they are on in production, and authenticated room entry and WAN capacity, are not asserted here.",
  ),
  status: "configured",
  atlasIds: [
    "yjs-crdt-document",
    "socket-io-room-tickets",
    "crdt-lock-revision",
    "durable-objects-realtime",
    "webrtc-three-plane-signaling",
    "webrtc-datachannel-direct-lane",
    "webrtc-ice-turn-paths",
  ],
  chapterIds: ["collaborative-crdt-boundary", "webrtc-media-authority", "turn-credential-issuance"],
  glossaryIds: ["crdt", "yjs", "socket-io", "webrtc", "durable-objects", "turn", "ice", "signaling", "presence", "lock-lease-fencing"],
};
