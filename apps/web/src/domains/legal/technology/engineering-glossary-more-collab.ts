import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 협업 · 연결. 브라우저끼리 만나고 함께 고치는 데 쓰는 말들. */
export const GLOSSARY_MORE_COLLAB: readonly GlossaryTerm[] = [
  {
    id: "signaling",
    category: "collab",
    term: t("시그널링", "Signaling"),
    definition: t(
      "통화를 걸기 전에 ‘나는 이런 방식으로 말할 수 있고, 이 주소로 찾아오세요’라는 쪽지를 상대에게 전달하는 절차입니다.",
      "The step before a call where each side hands the other a note: ‘here is how I can talk, and here is where to reach me’.",
    ),
    analogy: t(
      "통화는 두 사람이 직접 하지만, 상대 번호를 알려 주는 안내 데스크는 따로 필요합니다. 그 안내 데스크가 시그널링입니다.",
      "The call itself runs directly between two people, but someone at an information desk must pass along the number first. That desk is signaling.",
    ),
    inToonstudio: t(
      "세 겹으로 나눴습니다. 서버 경로(Socket.IO 또는 Durable Objects WebSocket)는 입장 확인·접속 상태·화면 공유 신호와 직통 통로를 처음 여는 신호만 나르고, 그 뒤 허들의 SDP/ICE 와 채팅은 브라우저끼리 연 직통 데이터 통로(‘studio-direct-v1’ 레인)로만 오갑니다. 직접 레인은 서버로 되돌아가는 폴백을 일부러 두지 않았습니다.",
      "It is split in three layers. The server path (Socket.IO or the Durable Objects WebSocket) carries only admission, presence, screen-share signals and the first signal that opens the direct channel; after that the huddle's SDP/ICE and chat travel only over the browser-to-browser data channel (the ‘studio-direct-v1’ lane). The direct lane deliberately has no fallback to the server.",
    ),
    chapters: ["webrtc-media-authority", "webrtc-standard"],
    atlasIds: ["webrtc-three-plane-signaling"],
  },
  {
    id: "sdp",
    category: "collab",
    term: t("SDP (세션 설명)", "SDP (Session Description)"),
    definition: t(
      "WebRTC 에서 ‘내가 쓸 수 있는 코덱·방식’을 적어 상대와 맞춰 보는 쪽지입니다. 제안(offer)과 응답(answer) 한 쌍으로 오갑니다.",
      "The note in WebRTC listing the codecs and options a side can use, exchanged as an offer and an answer so both agree.",
    ),
    analogy: t(
      "식당 예약 전화와 같습니다. ‘4명, 창가, 금연석 가능해요’(offer)라고 하면 ‘그 조건이면 됩니다’(answer)라고 답합니다.",
      "Like a restaurant reservation call: ‘party of four, window seat, non-smoking is fine’ (offer) and ‘that works’ (answer).",
    ),
    inToonstudio: t(
      "화면 공유에서 호스트는 시청자를 한 명씩 승인한 뒤에만 그 시청자 전용 RTCPeerConnection 과 offer 를 만듭니다. SDP/ICE 신호는 승인된 쌍에 한해 직통 데이터 통로(‘screen-signal-v2’)로 먼저 보내고 안 되면 서버 경로로 보냅니다(studio-screen-share.ts). 영상은 서버를 거치지 않고 시청자별로 직접 흐릅니다.",
      "In screen sharing the host creates a viewer-specific RTCPeerConnection and offer only after approving that viewer. SDP/ICE signals go first over the direct data channel (‘screen-signal-v2’) for approved pairs and over the server path if that fails (studio-screen-share.ts). The video itself flows directly to each viewer, not through the server.",
    ),
    chapters: ["webrtc-media-authority", "webrtc-standard"],
    atlasIds: ["screen-share-signaling", "webrtc-three-plane-signaling"],
  },
  {
    id: "ice",
    category: "collab",
    term: t("ICE (연결 후보 탐색)", "ICE (connectivity establishment)"),
    definition: t(
      "서로 다른 네트워크에 있는 두 브라우저가 가능한 연결 길을 여러 개 모아 시험해 보고 가장 좋은 길을 고르는 절차입니다.",
      "The procedure by which two browsers on different networks collect possible connection routes, test them and pick the best one.",
    ),
    analogy: t(
      "약속 장소로 가는 길을 지도 앱으로 여러 개 띄워 보고 막히지 않는 길을 고르는 것과 같습니다.",
      "Like opening several routes in a map app and picking the one that is not jammed.",
    ),
    inToonstudio: t(
      "ICE 서버는 공유 모듈의 Cloudflare STUN 하나로 통일했습니다. 허들·직통 통로·화면 공유 정책이 모두 같은 값을 읽고, 중계(TURN) 자격 발급 경로는 2026-10-11 결정으로 제거했습니다(studio-ice-configuration.ts, studio-voice-ice-policy.service.ts).",
      "ICE servers are unified to the single Cloudflare STUN in the shared module. Huddles, the direct channel and the screen-share policy all read the same value, and the relay (TURN) credential-issuance paths were removed by the 2026-10-11 decision (studio-ice-configuration.ts, studio-voice-ice-policy.service.ts).",
    ),
    chapters: ["webrtc-media-authority", "turn-credential-issuance"],
    atlasIds: ["webrtc-ice-turn-paths"],
  },
  {
    id: "stun",
    category: "collab",
    term: t("STUN", "STUN"),
    definition: t(
      "‘밖에서 보면 당신의 주소는 이거예요’를 알려 주는 안내 서버입니다. 대화 내용은 지나가지 않고 내 공인 주소만 알려 줍니다.",
      "A helper server that tells you ‘seen from outside, your address is this’. No conversation passes through it, only your public address.",
    ),
    analogy: t(
      "아파트 안에서는 내 집 호수만 알 뿐 건물 주소를 모릅니다. STUN 은 밖에서 우편물이 어디로 오는지 알려 주는 우체국 직원입니다.",
      "Inside an apartment you know your door number but not the street address; STUN is the postal clerk who tells you where mail from outside arrives.",
    ),
    inToonstudio: t(
      "유일한 ICE 서버가 이 STUN 입니다. 공유 모듈(studio-ice-configuration.ts)이 stun:stun.cloudflare.com:3478 하나만 고정해 두고, 화면 공유 정책의 기본값도 같은 주소입니다(studio-voice-ice-policy.service.ts). 자격이 필요 없어 연결 시작이 발급 대기에 막히지 않습니다.",
      "This STUN is the only ICE server. The shared module (studio-ice-configuration.ts) pins the single stun:stun.cloudflare.com:3478, and the screen-share policy defaults to the same address (studio-voice-ice-policy.service.ts). No credential is needed, so connection setup never waits on issuance.",
    ),
    chapters: ["turn-credential-issuance", "webrtc-standard"],
    atlasIds: ["webrtc-ice-turn-paths"],
  },
  {
    id: "turn",
    category: "collab",
    term: t("TURN (중계 서버)", "TURN (relay server)"),
    definition: t(
      "두 브라우저가 직접 만날 수 없을 때 모든 대화를 대신 전달해 주는 중계 서버입니다. 편하지만 전달한 양만큼 비용이 듭니다.",
      "A relay server that carries all traffic when two browsers cannot reach each other directly. Handy, but it costs in proportion to what it carries.",
    ),
    analogy: t(
      "직접 만나기 어려울 때 우편물을 대신 전달해 주는 우체국입니다. 편리한 대신 우편물이 쌓이는 만큼 요금이 붙습니다.",
      "A post office that forwards mail when meeting in person is impossible: convenient, but billed by the volume it forwards.",
    ),
    inToonstudio: t(
      "쓰지 않습니다. 중계 대역폭 비용이 사용량에 따라 발생하는 리스크를 이유로 2026-10-11에 TURN 서버를 두지 않기로 결정하고, Worker 의 Cloudflare TURN 발급과 API 의 coturn 자격 발급을 모두 제거했습니다. 직접 연결이 막힌 환경에서는 미디어가 이어지지 않고, 공간 프레즌스만 소켓 릴레이로 폴백합니다.",
      "Not used. Because relay bandwidth cost grows with usage, on 2026-10-11 it was decided to run no TURN server at all, and both the Worker's Cloudflare TURN issuance and the API's coturn credential issuance were removed. Where a direct connection is blocked, media does not connect, and only spatial presence falls back to the socket relay.",
    ),
    chapters: ["turn-credential-issuance", "webrtc-media-authority"],
    atlasIds: ["webrtc-ice-turn-paths"],
  },
  {
    id: "dtls-srtp",
    category: "collab",
    term: t("DTLS · SRTP (통화 암호화)", "DTLS · SRTP (call encryption)"),
    definition: t(
      "WebRTC 통화를 암호화하는 기본 장치입니다. 데이터 통로와 키 교환은 DTLS 가, 음성·영상 전송은 SRTP 가 맡습니다.",
      "The built-in encryption of WebRTC calls: DTLS secures the data channel and key exchange, SRTP protects voice and video.",
    ),
    analogy: t(
      "통화 중에 자동으로 잠기는 봉투와 같습니다. 보내는 사람이 따로 봉하지 않아도 브라우저가 매번 새 열쇠로 봉합니다.",
      "Like an envelope that seals itself during every call: the sender never seals it by hand, the browser does with a fresh key each time.",
    ),
    inToonstudio: t(
      "개념 설명입니다. 이 암호화는 브라우저의 WebRTC 구현에 들어 있어서, 툰스튜디오 코드는 DTLS·SRTP 를 직접 다루지 않고 저장소에서도 관련 설정 코드를 찾지 못했습니다. 코드가 책임지는 것은 ‘누구와 연결해도 되는가’(승인·권한)이고, 통로 암호화는 표준과 브라우저에 맡깁니다.",
      "Concept explanation. This encryption lives inside the browser's WebRTC stack, so ToonStudio code does not handle DTLS or SRTP directly, and no related configuration was found in the repository. What the code owns is who may connect (approval and permissions); channel encryption is left to the standard and the browser.",
    ),
    chapters: ["webrtc-standard", "webrtc-media-authority"],
  },
  {
    id: "data-channel-sctp",
    category: "collab",
    term: t("DataChannel (SCTP)", "DataChannel (SCTP)"),
    definition: t(
      "두 브라우저 사이에 뚫어 둔 직통 파이프입니다. 서버를 거치지 않고 글자나 데이터 조각을 바로 보내며, 전송 규칙은 SCTP 가 맡습니다.",
      "A direct pipe between two browsers for sending text or data chunks without a server; its delivery rules come from SCTP.",
    ),
    analogy: t(
      "택배의 ‘순서대로 반드시 도착’ 옵션과 ‘늦으면 버려도 됨’ 옵션 중에서 고르는 것과 같습니다. 문서 변경은 앞의 것이, 커서 위치는 뒤의 것이 어울립니다.",
      "Like choosing a courier option: ‘in order, must arrive’ or ‘fine to drop if late’. Document edits suit the first, cursor positions the second.",
    ),
    inToonstudio: t(
      "상대마다 ‘studio-live-p2p’ 통로 하나를 옵션 없이(순서 보장·완전 신뢰) 열고, 그 위에 규칙이 다른 레인을 얹습니다. 직접 레인(studio-direct-v1)은 프레임 64KiB 이하·보내기 대기 128KiB 초과 시 포기, 피어 패브릭(studio-peer-fabric-v2)은 control·realtime·bulk 세 등급입니다. 손실을 허용하는 커서 전용 레인은 아직 없습니다.",
      "One ‘studio-live-p2p’ channel per peer is opened with no options (ordered, fully reliable) and lanes with different rules sit on top. The direct lane (studio-direct-v1) caps frames at 64 KiB and gives up when the send backlog passes 128 KiB; the peer fabric (studio-peer-fabric-v2) has control, realtime and bulk classes. There is no lossy lane dedicated to cursors yet.",
    ),
    chapters: ["webrtc-media-authority", "webrtc-standard"],
    atlasIds: ["webrtc-datachannel-direct-lane"],
  },
  {
    id: "mesh-vs-sfu",
    category: "collab",
    term: t("풀메시 vs SFU", "Full mesh vs SFU"),
    definition: t(
      "풀메시는 참가자 모두가 서로 직접 연결하는 방식, SFU 는 서버가 영상을 한 번만 받아 나눠 주는 방식입니다.",
      "In a full mesh every participant connects directly to every other; with an SFU a server receives each stream once and fans it out.",
    ),
    analogy: t(
      "모두가 서로에게 개별 전화를 거는 모임과, 한 명이 방송실에서 전체에게 틀어 주는 모임의 차이입니다. 4명이면 통화선 6개, 8명이면 28개가 됩니다.",
      "A party where everyone phones everyone separately versus one speaker broadcasting from a booth. Four people need 6 lines, eight need 28.",
    ),
    inToonstudio: t(
      "풀메시만 구현했고 SFU 는 저장소에 없습니다. 연결이 n(n-1)/2개로 늘어 층마다 다른 상한을 둡니다: 허들 원격 3명, 화면 공유 시청자 4명, 직통 데이터 통로 8명, 문서 협업 방 30명, 실시간 서버 방 연결 64개. 모두 설정값이지 부하 시험으로 보증한 수용량이 아닙니다.",
      "Only a full mesh is implemented; there is no SFU in the repository. Because links grow as n(n-1)/2, each layer has its own cap: 3 remote huddle peers, 4 screen-share viewers, 8 data-channel peers, 30 in a document room and 64 connections per realtime-server room. These are configured limits, not load-tested capacity.",
    ),
    chapters: ["webrtc-media-authority", "spatial-collaboration-products"],
    atlasIds: ["webrtc-mesh-limits"],
  },
  {
    id: "socket-io",
    category: "collab",
    term: t("Socket.IO (실시간 연결)", "Socket.IO (realtime connection)"),
    definition: t(
      "서버와 브라우저가 오래 열어 둔 양방향 연결로 메시지를 주고받게 해 주는 라이브러리입니다. 끊기면 다시 붙는 기능이 들어 있습니다.",
      "A library that keeps a long-lived two-way connection between server and browser for messages, with automatic reconnection built in.",
    ),
    analogy: t(
      "한 번 걸어 두면 끊기지 않는 인터폰과 같습니다. 대신 인터폰에 들어갈 때마다 출입증을 확인하지 않으면 아무나 말을 걸 수 있습니다.",
      "Like an intercom that stays open once connected; but without checking a pass each time someone joins, anyone could speak into it.",
    ),
    inToonstudio: t(
      "로그인 쿠키는 소켓에 싣지 않고 60초짜리 입장권(JWT)으로 바꿔 냅니다(signStudioLiveAdmissionTicket, STUDIO_LIVE_AUTH_TICKET_TTL_MS = 60,000). 입장 뒤에도 15초마다 권한을 다시 확인하고, 한 계정은 연결 8개·작업실은 참가자 30명까지입니다. 여러 서버로 늘릴 때는 STUDIO_LIVE_CLUSTER_ADAPTER 를 memory 에서 postgres 로 바꿔 쓰도록 준비돼 있습니다.",
      "The login cookie is not put on the socket; it is exchanged for a 60-second admission ticket (JWT) (signStudioLiveAdmissionTicket, STUDIO_LIVE_AUTH_TICKET_TTL_MS = 60,000). Permissions are rechecked every 15 seconds after joining, with 8 connections per account and 30 participants per room. To scale beyond one server, STUDIO_LIVE_CLUSTER_ADAPTER can switch from memory to postgres.",
    ),
    chapters: ["collaborative-crdt-boundary", "authentication"],
    atlasIds: ["socket-io-room-tickets"],
  },
  {
    id: "durable-objects",
    category: "collab",
    term: t("Durable Objects", "Durable Objects"),
    definition: t(
      "Cloudflare 가 방 하나에 ‘관리인’ 객체 하나를 붙여 주는 서비스입니다. 관리인은 단일 스레드로 그 방의 일을 한곳에서 처리해 순서를 매기기 쉽습니다.",
      "A Cloudflare service that attaches one ‘caretaker’ object to each room. It runs single-threaded and handles that room's work in one place, which makes ordering easy to enforce.",
    ),
    analogy: t(
      "방마다 안내원이 한 명씩 서 있는 도서관과 같습니다. 안내원이 한곳에서 차례를 챙기니 새치기를 막기 쉽고, 사람이 없으면 안내원도 쉽니다.",
      "A library with one attendant per reading room: the attendant keeps the queue in one place so cutting in is easy to prevent, and rests when the room is empty.",
    ),
    inToonstudio: t(
      "접속 상태·댓글 신호·화면 공유 신호 세 채널을 방 객체가 번호를 매겨 SQLite 에 기록하고, 놓친 이벤트는 번호 이후만 다시 받습니다(방당 연결 64·계정당 4·이벤트 보존 15분, deploy/cloudflare-realtime/wrangler.jsonc). 그림 문서와 권한의 권위는 NestJS·PostgreSQL 에 남습니다. 상태는 ‘설정됨’이며 운영 활성 여부는 코드로 확인하지 못했습니다.",
      "A room object numbers the presence, comment and screen-share channels, records them in SQLite and replays only events after a given number (64 connections per room, 4 per account, 15-minute retention in deploy/cloudflare-realtime/wrangler.jsonc). Drawing documents and permissions stay authoritative in NestJS and PostgreSQL. Status is ‘configured’; production activation could not be confirmed from code.",
    ),
    chapters: ["collaborative-crdt-boundary", "webrtc-media-authority"],
    atlasIds: ["durable-objects-realtime"],
  },
  {
    id: "yjs",
    category: "collab",
    term: t("Yjs", "Yjs"),
    definition: t(
      "CRDT 를 실제로 구현한 자바스크립트 라이브러리입니다. 문서 하나(Y.Doc)에 여러 사람의 편집을 기록 조각으로 쌓아 어떤 순서로 합쳐도 같은 결과가 나옵니다.",
      "A JavaScript library implementing CRDTs. Edits from many people pile up as record pieces in one document (Y.Doc) and merge to the same result in any order.",
    ),
    analogy: t(
      "공유 벽에 각자 포스트잇을 붙이는 것과 같습니다. 붙이는 순서가 달라도 결국 같은 벽이 됩니다.",
      "Like everyone sticking notes on a shared wall: whatever the order, the wall ends up the same.",
    ),
    inToonstudio: t(
      "yjs ^13.6.31 로, 한 Y.Doc 에 획·합성 순서·페이지·레이어 묶음·삭제 기록을 나눠 담습니다(studio-crdt-document-strokes.ts 등). 삭제는 지우는 대신 삭제 기록을 남기는 방식입니다. CRDT 는 권한을 모르므로 서버가 병합 전에 편집 권한과 불변식을 검사합니다. 상태는 ‘실험’입니다.",
      "With yjs ^13.6.31, one Y.Doc holds strokes, compositing order, pages, layer groups and deletion records (studio-crdt-document-strokes.ts and siblings). Deletes leave a deletion record instead of erasing. A CRDT knows nothing about permissions, so the server checks edit rights and invariants before merging. Status: experimental.",
    ),
    chapters: ["collaborative-crdt-boundary", "crdt-semantic-scope"],
    atlasIds: ["yjs-crdt-document"],
  },
  {
    id: "presence",
    category: "collab",
    term: t("프레즌스 (접속 상태 · 커서)", "Presence (who is here, cursors)"),
    definition: t(
      "지금 누가 방에 있고 어디를 보고 있는지를 실시간으로 알려 주는 부가 정보입니다. 문서 내용 자체와는 다른 ‘가벼운’ 데이터입니다.",
      "Lightweight live information about who is in the room and where they are looking, separate from the document content itself.",
    ),
    analogy: t(
      "회의실 문 앞의 ‘사용 중’ 램프와 같습니다. 램프는 방 안의 문서가 아니라 사람의 존재만 알려 주고, 꺼져도 문서는 그대로입니다.",
      "Like the ‘in use’ lamp outside a meeting room: it signals people, not the documents inside, and the documents stay put when it goes dark.",
    ),
    inToonstudio: t(
      "Durable Objects 실시간 서버가 ‘presence’ 채널(댓글·화면 공유 신호와 별도)로 접속 상태를 나르고, 브라우저는 원격 커서를 studio-live-remote-cursor-store.ts 에 모아 화면에 그립니다. 커서처럼 최신 값만 중요한 데이터는 문서(CRDT)에 넣지 않고 따로 다룹니다.",
      "The Durable Objects realtime server carries presence on its own ‘presence’ channel (apart from comments and screen-share signals), and the browser gathers remote cursors in studio-live-remote-cursor-store.ts and draws them. Data where only the latest value matters, like cursors, is kept out of the document (CRDT).",
    ),
    chapters: ["collaborative-crdt-boundary", "virtual-studio-world-authority"],
    atlasIds: ["durable-objects-realtime"],
  },
  {
    id: "lock-lease-fencing",
    category: "collab",
    term: t("임대 잠금과 펜싱 번호", "Lease lock and fencing number"),
    definition: t(
      "같은 레이어를 두 사람이 동시에 고치지 않게 ‘기한이 있는 사용 중 표시’를 걸고, 번호를 붙여 늦게 온 옛 소식이 지금을 뒤집지 못하게 합니다.",
      "A time-limited ‘in use’ mark keeps two people off the same layer, and a number on each change stops late, stale news from overturning the present.",
    ),
    analogy: t(
      "은행 창구의 번호표와 같습니다. 번호가 있으면 늦게 도착한 옛 안내가 뒤늦게 와도 지금 순서를 바꾸지 못합니다.",
      "Like a bank queue ticket: with numbers, an outdated announcement arriving late cannot reshuffle the current order.",
    ),
    inToonstudio: t(
      "락은 기본 15초(5~30초)면 만료되는 임대이며 쓰는 동안 갱신합니다. 작품마다 revision 번호를 DB 가 1씩 올리고, 서버는 작품별 PostgreSQL advisory lock 안에서 한 번에 하나만 판정하며 시각은 DB 시계를 씁니다. 브라우저는 낡은 번호의 이벤트를 무시합니다. 작품당 락은 200개가 상한입니다. 문서 병합은 CRDT 가, ‘누가 만지는가’는 락이 맡습니다.",
      "A lock is a lease that expires after 15 seconds by default (5 to 30) and is renewed while in use. The database bumps a per-work revision by 1, the server judges one request at a time inside a per-work PostgreSQL advisory lock using the database clock, and browsers ignore events with stale numbers. Locks are capped at 200 per work. The CRDT merges documents; the lock decides who is touching what.",
    ),
    chapters: ["collaborative-crdt-boundary", "crdt-semantic-scope"],
    atlasIds: ["crdt-lock-revision"],
  },
  {
    id: "webtransport",
    category: "collab",
    term: t("WebTransport", "WebTransport"),
    definition: t(
      "QUIC 위에서 여러 통로를 동시에 열고 일부만 늦어도 나머지는 막히지 않게 하는 차세대 실시간 전송 API입니다. WebSocket 의 후보입니다.",
      "A next-generation realtime transport API over QUIC that opens many streams at once so a delay in one does not block the rest. A candidate successor to WebSocket.",
    ),
    analogy: t(
      "외길 도로(WebSocket)에서 여러 차선 고속도로로 바꾸는 것과 같습니다. 한 차선이 막혀도 다른 차선은 흐릅니다. 단, 톨게이트(서버)가 새 도로를 받아 줘야 합니다.",
      "Like swapping a single-lane road (WebSocket) for a multi-lane highway: a jam in one lane leaves the others moving. But the toll gate (the server) must accept the new road.",
    ),
    inToonstudio: t(
      "클라이언트 어댑터(studio-realtime-webtransport-adapter.ts)가 있지만 기본은 꺼져 있습니다. WebTransport 엔드포인트를 설정할 때만 체인 앞에 놓이고, 지금 서버(Cloudflare Workers/Durable Objects)가 이를 종단하지 못해 운영 기본값은 WebSocket 하나입니다. 실패하면 같은 시도에서 WebSocket 으로 넘어갑니다. ‘설정 한 줄로 켠다’는 말은 사실이 아닙니다.",
      "A client adapter exists (studio-realtime-webtransport-adapter.ts) but is off by default. It joins the chain only when a WebTransport endpoint is configured, and because the current server (Cloudflare Workers/Durable Objects) cannot terminate it, production defaults to WebSocket alone. On failure it falls through to WebSocket in the same attempt. ‘Switch on with one line of config’ would not be true.",
    ),
    chapters: ["webtransport-transport", "collaborative-crdt-boundary"],
    atlasIds: ["webtransport-experiment"],
  },
];
