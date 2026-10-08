import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · realtime 카테고리 중 WebRTC 카드 묶음(시그널링·정원 사다리·ICE/TURN).
 * 주 파일(engineering-atlas-realtime.ts)이 다른 묶음과 함께 배열에 합친다.
 * 모든 값은 2026-10-07 기준으로 코드·설정을 직접 열어 확인한 것이다.
 */
const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const LIVE = "apps/web/src/domains/creator/live";
const HUDDLE = `${LIVE}/huddle`;

export const ENGINEERING_ATLAS_REALTIME_WEBRTC: readonly EngineeringAtlasEntry[] = [
  // ───────────────────────────── 1. 세 겹 시그널링 ─────────────────────────────
  {
    id: "webrtc-three-plane-signaling",
    category: "realtime",
    name: "WebRTC signaling",
    title: t("WebRTC 통화 신호를 세 겹으로 나눈 구조", "WebRTC call setup split across three layers"),
    status: "experimental",
    tagline: t(
      "서버는 첫 만남만 소개하고, 통화 설정은 브라우저끼리 직통 통로로 주고받습니다.",
      "The server only makes the first introduction; call setup then travels over a direct browser-to-browser channel.",
    ),
    background: [
      t(
        "웹 브라우저끼리 영상·음성을 직접 주고받는 표준이 WebRTC입니다. 그런데 통화를 걸기 전에 '나는 이런 방식으로 말할 수 있어요'라는 쪽지(SDP)와 '이 주소로 찾아오세요'라는 길 안내(ICE 후보)를 서로 건네야 하고, 이 쪽지 전달을 시그널링이라 부릅니다. 전화에 비유하면 통화는 두 사람이 직접 하지만, 상대 번호를 알려 주는 안내 데스크는 따로 필요한 셈입니다.",
        "WebRTC is the web standard that lets browsers exchange video and voice directly. Before a call starts, though, each side must hand the other a note about how it can talk (SDP) and directions for reaching it (ICE candidates); delivering those notes is called signaling. Think of a phone call: the two people talk directly, but someone still has to hand over the number.",
      ),
      t(
        "표준은 쪽지를 무엇으로 나를지 정하지 않습니다. ToonStudio는 세 겹으로 나눴습니다. 첫째, 서버 경로(Socket.IO 또는 Cloudflare Durable Objects의 WebSocket)는 입장 확인, 접속 상태, 화면 공유 신호와 직통 데이터 통로를 처음 여는 SDP/ICE만 나릅니다. 둘째, 그 신호로 상대마다 직통 데이터 통로('studio-live-p2p')가 열립니다. 셋째, P2P 채팅·통화(허들)의 SDP/ICE와 채팅은 이 통로의 'studio-direct-v1' 직접 레인으로만 오가고, 음성·영상은 상대마다 따로 만든 두 번째 연결(RTP)이 나릅니다.",
        "The standard does not say how to carry those notes, so ToonStudio uses three layers. First, a server path (a Socket.IO or Cloudflare Durable Objects WebSocket) carries only admission, presence, screen-share signals and the SDP/ICE that opens the first direct data channel. Second, that signal opens a direct data channel ('studio-live-p2p') per peer. Third, the huddle's call SDP/ICE and chat travel only on that channel's 'studio-direct-v1' direct lane, while voice and video flow over a second, separate connection (RTP) per peer.",
      ),
      t(
        "가장 단순한 대안은 모든 신호를 서버 WebSocket으로 중계하는 방식입니다. 하지만 채팅 본문과 통화 설정이 서버를 지나면 서버 부담과 개인정보 부담이 함께 커집니다. 직접 레인은 막히거나 밀려도 서버로 되돌아가는 폴백을 일부러 두지 않아 '서버로 새지 않는다'는 약속을 코드로 지킵니다. 그 대가로 서버 경로가 끊기면 허들을 종료하고 카메라·마이크를 해제합니다.",
        "The simplest alternative is to relay every signal through a server WebSocket, but then chat text and call setup pass through the server, raising both load and privacy burden. The direct lane deliberately has no fallback to the server, even when blocked or congested, so 'it never leaks to the server' is enforced in code. The price: when the server path drops, the huddle ends and the camera and microphone are released.",
      ),
      t(
        "검증 범위는 정직하게 말해야 합니다. 단위 테스트와 로컬 Chromium 두 컨텍스트 시험까지이며, 서로 다른 네트워크(WAN)·제한 NAT·실기기 통화는 아직 검증하지 않았습니다. 또한 직통 데이터 통로를 여는 신호가 Durable Objects의 화면 공유 접근 규칙에 막혀 Socket.IO로 되돌아갈 수 있다는 점은 코드 독해로 본 잠재 한계이며, 실제로 실행해 확인한 사실이 아닙니다.",
        "Be honest about the evidence. It covers unit tests and a local Chromium test with two browser contexts; calls across different networks (WAN), restrictive NATs and real devices have not been verified. Reading the code also suggests the signal that opens the data channel may be rejected by the Durable Objects screen-share access rules and fall back to Socket.IO; this is a potential limit found by code reading, not something confirmed by running it.",
      ),
    ],
    keyPoints: [
      t("서버는 입장·접속 상태·직통 통로를 여는 첫 신호만 나릅니다", "The server carries only admission, presence and the first signal that opens a direct channel"),
      t("통화용 SDP/ICE와 채팅은 직접 레인으로만 오갑니다", "Call SDP/ICE and chat travel only on the direct lane"),
      t("직접 레인은 막혀도 서버로 되돌아가지 않습니다", "The direct lane never falls back to the server"),
      t("음성·영상은 상대마다 따로 만든 두 번째 연결로 흐릅니다", "Voice and video use a second connection per peer"),
    ],
    diagram: {
      id: "webrtc-three-plane-signaling-diagram",
      kind: "sequence",
      title: t("통화가 시작되기까지 신호가 지나는 길", "The path call setup signals take"),
      caption: t(
        "서버를 지나는 것은 첫 연결 신호뿐이고, 통화 설정과 채팅은 열린 직통 통로로 갑니다.",
        "Only the first connection signal passes the server; call setup and chat use the open direct channel.",
      ),
      alt: t(
        "브라우저 A가 서버 경로로 입장하면 서버가 B에게 알리고, 두 브라우저는 서버 경로로 데이터 통로용 offer와 answer를 주고받아 직통 데이터 통로를 엽니다. 그 뒤 통화용 SDP/ICE와 채팅은 이 통로의 직접 레인으로만 오가고, 음성과 영상은 따로 만든 두 번째 연결로 흐릅니다.",
        "Browser A joins over the server path and the server tells B. The two browsers exchange offer and answer for a data channel over that path and open a direct data channel. After that, call SDP/ICE and chat travel only on its direct lane, while voice and video flow over a separate second connection.",
      ),
      actors: [
        { id: "a", label: t("브라우저 A", "Browser A"), tone: "local" },
        { id: "server", label: t("서버 경로", "Server path"), sub: t("Socket.IO · Durable Objects", "Socket.IO or Durable Objects"), tone: "edge" },
        { id: "b", label: t("브라우저 B", "Browser B"), tone: "local" },
      ],
      messages: [
        { from: "a", to: "server", label: t("입장 · 접속 상태 알림", "Join and presence"), note: t("① 서버 경로", "1. Server path") },
        { from: "server", to: "b", label: t("A가 왔다고 전달", "Tell B that A arrived"), style: "dashed" },
        { from: "a", to: "server", label: t("데이터 통로용 offer·ICE", "Offer and ICE for data channel"), note: t("공유 id p2p-mesh-v1", "reserved share id p2p-mesh-v1") },
        { from: "server", to: "b", label: t("offer·ICE 전달", "Relay offer and ICE"), style: "dashed" },
        { from: "b", to: "server", label: t("answer·ICE 회신", "Answer and ICE back") },
        { from: "a", to: "b", label: t("직통 데이터 통로 열림", "Direct data channel opens"), note: t("② studio-live-p2p · 서버 없음", "2. studio-live-p2p, no server") },
        { from: "a", to: "b", label: t("통화용 SDP/ICE · 채팅", "Call SDP/ICE and chat"), note: t("③ studio-direct-v1 직접 레인", "3. studio-direct-v1 direct lane") },
        { from: "b", to: "a", label: t("answer·ICE (직접 레인)", "Answer and ICE (direct lane)"), style: "dashed" },
        { from: "a", to: "b", label: t("음성·영상 RTP", "Voice and video (RTP)"), note: t("두 번째 연결 · 원격 최대 3명", "second connection, up to 3 remote") },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · P2P 채팅·통화(허들)", "Shared workroom · P2P chat and calls (huddle)"),
        role: t(
          "상태·채팅·통화용 SDP/ICE를 직접 레인으로만 보내고, 음성·영상은 상대마다 만든 별도 연결로 흘립니다. 카메라·마이크는 사용자가 켤 때만 요청합니다.",
          "Sends state, chat and call SDP/ICE only on the direct lane and streams voice and video over a separate connection per peer. Camera and microphone are requested only when the user turns them on.",
        ),
        paths: [`${HUDDLE}/studio-p2p-huddle-controller.ts`, `${HUDDLE}/StudioP2pHuddleLauncher.tsx`],
        route: "/studio",
      },
      {
        feature: t("공동 작업실 · 직통 데이터 통로", "Shared workroom · direct data channel"),
        role: t(
          "서버 경로로 받은 offer/answer/ICE로 상대마다 'studio-live-p2p' 통로를 열고, 직접 레인과 일회성 메시지(커서·하트비트·채팅) 전달을 맡습니다.",
          "Opens a 'studio-live-p2p' channel per peer from the offer/answer/ICE received over the server path, and provides the direct lane plus one-shot messages (cursor, heartbeat, chat).",
        ),
        paths: [`${LIVE}/studio-live-p2p-overlay-transport.ts`, `${LIVE}/studio-live-direct-port.ts`],
      },
      {
        feature: t("공동 작업실 · 서버 경로 선택", "Shared workroom · server-path routing"),
        role: t(
          "접속 상태와 화면 공유 신호는 Durable Objects가 준비됐을 때 그쪽으로, 아니면 같은 메시지를 Socket.IO로 보냅니다. 직통 데이터 통로는 이 전송 위에 얹힙니다.",
          "Sends presence and screen-share signals through Durable Objects when it is ready and the same message through Socket.IO otherwise. The direct-channel overlay is layered on top of this transport.",
        ),
        paths: [`${LIVE}/studio-live-purpose-routed-transport.ts#workloadForLegacyKind`, `${LIVE}/studio-live-socket-transport.ts#createStudioServerLiveTransportFactory`],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("열린 데이터 통로로 두 번째 연결 협상하기", "Negotiate a second connection over an open data channel"),
        language: "ts",
        code: `type Signal =
  | { kind: "sdp"; description: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

// 이미 열린 데이터 통로를 '시그널링 통로'로 재사용해 미디어 연결을 협상한다.
export function wireSignaling(channel: RTCDataChannel, media: RTCPeerConnection): void {
  const send = (signal: Signal): void => channel.send(JSON.stringify(signal));
  const sendDescription = (): void => {
    const local = media.localDescription;
    if (local) send({ kind: "sdp", description: { type: local.type, sdp: local.sdp } });
  };
  media.onicecandidate = ({ candidate }) => {
    if (candidate) send({ kind: "ice", candidate: candidate.toJSON() }); // 길 안내(ICE 후보)
  };
  media.onnegotiationneeded = async () => {
    await media.setLocalDescription(); // 쪽지(offer)를 만든다
    sendDescription();
  };
  channel.onmessage = async ({ data }) => {
    const signal = JSON.parse(String(data)) as Signal; // 실서비스는 크기·모양을 엄격히 검증한다
    if (signal.kind === "ice") return media.addIceCandidate(signal.candidate);
    await media.setRemoteDescription(signal.description);
    if (signal.description.type === "offer") {
      await media.setLocalDescription(); // 답장(answer)
      sendDescription();
    }
  };
}`,
        codeEn: `type Signal =
  | { kind: "sdp"; description: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

// Reuse an already-open data channel as the signaling channel to negotiate the media connection.
export function wireSignaling(channel: RTCDataChannel, media: RTCPeerConnection): void {
  const send = (signal: Signal): void => channel.send(JSON.stringify(signal));
  const sendDescription = (): void => {
    const local = media.localDescription;
    if (local) send({ kind: "sdp", description: { type: local.type, sdp: local.sdp } });
  };
  media.onicecandidate = ({ candidate }) => {
    if (candidate) send({ kind: "ice", candidate: candidate.toJSON() }); // directions (ICE candidate)
  };
  media.onnegotiationneeded = async () => {
    await media.setLocalDescription(); // create the note (offer)
    sendDescription();
  };
  channel.onmessage = async ({ data }) => {
    const signal = JSON.parse(String(data)) as Signal; // production validates size and shape strictly
    if (signal.kind === "ice") return media.addIceCandidate(signal.candidate);
    await media.setRemoteDescription(signal.description);
    if (signal.description.type === "offer") {
      await media.setLocalDescription(); // reply (answer)
      sendDescription();
    }
  };
}`,
        explain: t(
          "이미 열린 데이터 통로로 SDP/ICE를 주고받아 두 번째 연결(미디어)을 협상합니다. 서비스 코드는 여기에 에폭(세션 구분), 크기 검증, 양쪽이 동시에 offer를 낼 때의 충돌(glare) 처리를 더합니다.",
          "Negotiates a second (media) connection by exchanging SDP/ICE over an already-open data channel. The service code adds epochs (session separation), size validation and glare handling for the case where both sides offer at once.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · Signaling and video calling", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling", kind: "docs", note: t("시그널링은 어떤 통로로 해도 된다는 점을 설명", "Explains that any channel can carry signaling") },
      { title: "W3C · WebRTC 1.0", url: "https://www.w3.org/TR/webrtc/", kind: "spec" },
      { title: "IETF RFC 9429 · JSEP", url: "https://www.rfc-editor.org/rfc/rfc9429", kind: "spec", note: t("SDP offer/answer 규칙(RFC 8829를 대체)", "Offer/answer rules (replaces RFC 8829)") },
      { title: "IETF RFC 8831 · WebRTC data channels", url: "https://www.rfc-editor.org/rfc/rfc8831", kind: "spec" },
      { title: "webrtc.org · Getting started with peer connections", url: "https://webrtc.org/getting-started/peer-connections", kind: "guide" },
      { title: "MDN · Perfect negotiation", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation", kind: "docs", note: t("동시에 offer를 낼 때의 표준 해법", "The standard fix when both sides offer at once") },
    ],
    chapterIds: ["webrtc-media-authority"],
    talk: {
      pitch: t(
        "ToonStudio의 P2P 채팅·통화는 서버를 중계소가 아니라 소개소로 씁니다. 서버는 누가 방에 들어왔는지 알리고, 브라우저 사이에 직통 데이터 통로를 처음 여는 신호만 전달합니다. 통로가 열리면 통화 설정 쪽지와 채팅은 그 통로로만 오가고, 음성과 영상은 상대마다 따로 만든 두 번째 연결로 흐릅니다. 다만 아직 로컬 시험 단계라 서로 다른 네트워크에서의 통화는 검증하지 않았습니다.",
        "ToonStudio's P2P chat and calls use the server as an introducer, not a relay. The server announces who entered the room and carries only the signal that first opens a direct data channel between browsers. Once it is open, call-setup notes and chat travel only over that channel, and voice and video flow over a second connection per peer. It is still at the local-test stage, so calls across different networks have not been verified.",
      ),
      analogy: t(
        "중매인이 두 사람을 소개해 주고 나면, 둘은 서로의 직통 번호로 통화 약속을 잡습니다. 중매인은 그 뒤의 대화를 듣지 않습니다.",
        "A matchmaker introduces two people, and they then arrange their call on each other's direct numbers. The matchmaker does not listen in afterwards.",
      ),
      questions: [
        {
          question: t("서버가 채팅이나 통화 내용을 볼 수 있나요?", "Can the server see chat or call content?"),
          answer: t(
            "채팅 본문과 통화용 SDP/ICE는 서버를 지나지 않고 직접 레인으로만 갑니다. 브라우저 검증 스크립트도 서버 경로 패킷에 채팅 본문이 없음을 확인합니다. 다만 직통 데이터 통로를 처음 여는 SDP/ICE는 서버를 지나므로, 두 가지를 섞어 말하지 않습니다.",
            "Chat text and call SDP/ICE never pass the server and use only the direct lane; the browser verification script also checks that server-path packets contain no chat text. The SDP/ICE that first opens the data channel does pass the server, so do not blur the two.",
          ),
        },
        {
          question: t("서버가 죽으면 통화는 어떻게 되나요?", "What happens to a call if the server dies?"),
          answer: t(
            "현재 정책은 서버 경로가 끊기면 허들을 종료하고 카메라·마이크를 해제합니다. 이미 열린 직통 연결이 살아남는지는 실험으로 확인하지 않았습니다.",
            "By current policy, when the server path drops the huddle ends and the camera and microphone are released. Whether an already-open direct connection would survive has not been tested.",
          ),
        },
        {
          question: t("시그널링은 Socket.IO인가요, Durable Objects인가요?", "Is signaling Socket.IO or Durable Objects?"),
          answer: t(
            "둘 다 서버 경로입니다. 문서·잠금·채팅은 Socket.IO가 맡고, 접속 상태와 화면 공유 신호는 가능하면 Durable Objects로 보내다가 준비되지 않았거나 거부되면 같은 메시지를 Socket.IO로 되돌립니다.",
            "Both are the server path. Socket.IO owns documents, locks and chat; presence and screen-share signals go through Durable Objects when possible and the same message returns to Socket.IO when it is not ready or is rejected.",
          ),
        },
      ],
      pitfall: t(
        "'Socket.IO가 WebRTC 시그널링을 한다'고만 말하면 부정확합니다. 통화용 SDP/ICE는 직접 레인, 서버 경로는 입장·접속 상태·화면 공유 신호·데이터 통로 시작 신호입니다(옛 음성 작업실의 신호 중계 코드는 운영 설정에서 꺼져 있습니다). 코드 독해로 본 잠재 한계(미실증): 데이터 통로 시작 신호가 Durable Objects에서 거부돼 Socket.IO로 우회될 수 있고, 그 우회를 통합 테스트로 확인하지 못했습니다. 로컬 Chromium의 성공을 인터넷 환경의 성공으로 말하지 마세요.",
        "Saying only 'Socket.IO does the WebRTC signaling' is inaccurate: call SDP/ICE use the direct lane, while the server path carries admission, presence, screen-share signals and the data-channel start signal (the signal-relay code of the older voice workroom is switched off in the production settings). A potential limit seen by code reading (unverified): the data-channel start signal may be rejected by Durable Objects and detour through Socket.IO, and no integration test confirms that detour. Do not present local Chromium success as success on the internet.",
      ),
    },
    technologies: ["WebRTC", "RTCPeerConnection", "RTCDataChannel", "SDP", "ICE", "Socket.IO", "Durable Objects"],
    facts: [
      { value: "3", label: t("허들 원격 참가자 상한", "Huddle remote-peer cap"), source: `${HUDDLE}/studio-p2p-huddle-protocol.ts` },
      { value: "8", label: t("직통 데이터 통로 최대 피어", "Max peers on the data-channel mesh"), source: `${LIVE}/studio-live-p2p-overlay-transport.ts` },
      { value: "64 KiB", label: t("직접 레인 프레임 상한", "Direct-lane frame cap"), source: `${LIVE}/studio-live-direct-port.ts` },
    ],
    reviewedAt: "2026-10-07",
  },

  // ───────────────────────────── 2. 풀메시 한계와 정원 사다리 ─────────────────────────────
  {
    id: "webrtc-mesh-limits",
    category: "realtime",
    name: "Full mesh",
    title: t("풀메시의 한계와 정원 사다리", "Full-mesh limits and the capacity ladder"),
    status: "experimental",
    tagline: t(
      "서로 직접 연결하면 서버가 필요 없지만, 인원이 늘면 연결이 제곱으로 늘어 층마다 상한을 둡니다.",
      "Connecting everyone directly needs no media server, but links grow quadratically, so each layer has its own cap.",
    ),
    background: [
      t(
        "풀메시는 모임의 모든 사람이 서로 한 명씩 직접 전화를 거는 방식입니다. 4명이면 통화 선이 6개이고, 각자는 3명에게 같은 말을 따로따로 해야 합니다. 서버가 한 번만 받아 나눠 주는 방식(SFU)과 달리 서버 비용이 들지 않지만, 사람이 늘수록 서버보다 먼저 각자의 인터넷 업로드와 컴퓨터가 버티지 못합니다.",
        "A full mesh is like everyone at a gathering phoning everyone else one-to-one. With 4 people there are 6 lines, and each person must say the same thing separately to 3 others. Unlike a design where a server receives once and fans out (an SFU), it costs no media server, but as people join, each person's upload and computer give out before any server does.",
      ),
      t(
        "n명이 서로 연결하면 연결은 n(n-1)/2개이고, 한 사람이 내보내는 영상은 (n-1)배가 됩니다. 4명은 6쌍·업로드 3배, 8명은 28쌍·7배, 9명은 36쌍·8배입니다. 그래서 ToonStudio는 '정원'이라는 한 단어 대신 층마다 다른 숫자를 둡니다. 허들 음성·영상은 원격 3명, 화면 공유 시청자는 4명, 직통 데이터 통로는 원격 8명, 문서 협업 방은 30명, 실시간 서버(Durable Objects)의 방 하나는 연결 64개입니다.",
        "With n people the number of links is n(n-1)/2, and each person sends (n-1) times the video. 4 people mean 6 pairs and 3x upload, 8 people 28 pairs and 7x, 9 people 36 pairs and 8x. So ToonStudio uses a different number per layer instead of one word, capacity: 3 remote peers for huddle voice and video, 4 viewers for screen sharing, 8 remote peers for the direct data-channel mesh, 30 people in a document room, and 64 connections in one Durable Objects room.",
      ),
      t(
        "이 숫자들은 서로 다른 이유로 정해진 설정값입니다. 미디어 메시와 화면 공유는 업로드·인코딩 비용, 데이터 메시는 연결 수립 비용, 서버 쪽 상한은 무료 인프라 안에서 안전하게 거절하기 위한 안전선입니다. 코드 주석도 '이 크기를 넘는 풀메시는 서버 팬아웃 한 번보다 비싸다'고 판단합니다. 모두 부하 시험으로 보증한 수용량이 아닙니다.",
        "These numbers are settings chosen for different reasons. Media mesh and screen sharing are limited by upload and encoding cost, the data mesh by connection setup cost, and the server limits are safety lines for refusing safely inside free infrastructure. A code comment judges the same way: a full mesh above that size costs more than one server fan-out. None of them is a capacity proven by load testing.",
      ),
      t(
        "더 큰 회의나 방송에는 서버가 영상을 한 번 받아 나눠 주는 SFU 같은 구조가 필요합니다. 저장소에는 구현이 없고 기술 문서도 '큰 회의·방송은 현재 범위 아님'으로 적었습니다. 가상 스튜디오의 명목 정원 24명은 위치·이모트 신호가 직통 레인으로만 가므로, 코드상 실제로는 원격 8명까지만 닿는 것으로 읽힙니다(실기기 검증 없음).",
        "Larger meetings or broadcasts need a structure like an SFU, where a server receives video once and fans it out. The repository has no implementation, and the technical document lists large meetings and broadcast as out of scope for now. The virtual studio's nominal cap of 24 sends position and emote signals only over the direct lane, so by the code it reads as reaching just 8 remote peers (no real-device verification).",
      ),
    ],
    keyPoints: [
      t("연결 수는 n(n-1)/2, 업로드는 (n-1)배로 늘어납니다", "Links grow as n(n-1)/2 and upload as (n-1) times"),
      t("허들 3명·화면 공유 4명·데이터 메시 8명은 서로 다른 상한", "Huddle 3, screen share 4 and data mesh 8 are separate caps"),
      t("문서 방 30명·서버 방 64연결은 다른 층의 안전선입니다", "Document room 30 and server room 64 are other layers' safety lines"),
      t("모두 설정값이며 부하 시험으로 보증한 수용량이 아닙니다", "All are settings, not load-tested capacity"),
    ],
    diagram: {
      id: "webrtc-mesh-limits-diagram",
      kind: "layers",
      title: t("같은 '정원'이라도 층마다 숫자가 다릅니다", "One word, capacity, but a different number per layer"),
      caption: t(
        "위쪽 넷은 브라우저끼리의 직접 연결 비용, 아래쪽 둘은 서버 경로의 안전선입니다.",
        "The top four are direct browser-to-browser cost limits; the bottom two are server-path safety lines.",
      ),
      alt: t(
        "허들 음성·영상 원격 3명, 화면 공유 시청자 4명, 직통 데이터 통로 원격 8명, 가상 스튜디오 명목 정원 24명, 문서 협업 방 30명, 실시간 서버 방 연결 64개의 순서로 쌓인 한도 사다리입니다. 앞의 네 층은 브라우저 직접 연결, 뒤의 두 층은 서버 경로의 상한입니다.",
        "A ladder of limits: huddle voice and video 3 remote peers, screen-share viewers 4, direct data-channel mesh 8 remote peers, virtual studio nominal cap 24, document room 30 and realtime server room 64 connections. The first four are direct browser connections and the last two are server-path limits.",
      ),
      layers: [
        { id: "huddle-media", label: t("허들 음성·영상", "Huddle voice and video"), sub: t("원격 3명(본인 포함 4명) · 연결 6쌍", "3 remote peers (4 with you) · 6 pairs"), tone: "local", chips: ["RTP", "RTCPeerConnection"] },
        { id: "screen-viewers", label: t("화면 공유 시청자", "Screen-share viewers"), sub: t("호스트 한 명이 동시에 4명까지 승인", "One host approves up to 4 at a time"), tone: "local", chips: ["getDisplayMedia"] },
        { id: "data-mesh", label: t("직통 데이터 통로", "Direct data-channel mesh"), sub: t("원격 8명(본인 포함 9명) · 36쌍 · 초과 피어는 링크 없음", "8 remote peers (9 with you) · 36 pairs · extra peers get no link"), tone: "local", chips: ["RTCDataChannel"] },
        { id: "virtual-space", label: t("가상 스튜디오 명목 정원", "Virtual studio nominal cap"), sub: t("24명(원격 23명) · 직통 레인으로는 8명까지만 닿음", "24 people (23 remote) · the direct lane reaches only 8"), tone: "warn" },
        { id: "doc-room", label: t("문서 협업 방", "Document collaboration room"), sub: t("작품 하나의 Socket.IO 참가자 30명", "30 participants in one work's Socket.IO room"), tone: "server", chips: ["Socket.IO"] },
        { id: "do-room", label: t("실시간 서버 방", "Realtime server room"), sub: t("Durable Objects 방 하나의 WebSocket 연결 64개", "64 WebSocket connections in one Durable Objects room"), tone: "edge", chips: ["Durable Objects"] },
      ],
      brackets: [
        { label: t("브라우저끼리 직접(P2P)", "Browser to browser (P2P)"), layerIds: ["huddle-media", "screen-viewers", "data-mesh", "virtual-space"] },
        { label: t("서버 경로의 안전선", "Server-path safety lines"), layerIds: ["doc-room", "do-room"] },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · P2P 채팅·통화(허들)", "Shared workroom · P2P chat and calls (huddle)"),
        role: t("원격 참가자를 3명까지만 받아 음성·영상 연결을 만듭니다.", "Accepts at most 3 remote participants when creating voice and video links."),
        paths: [`${HUDDLE}/studio-p2p-huddle-protocol.ts#HUDDLE_MAX_REMOTE_PEERS`, `${HUDDLE}/studio-p2p-huddle-controller.ts#receiveState`],
        route: "/studio",
      },
      {
        feature: t("공동 작업실 · 직통 데이터 통로", "Shared workroom · direct data channel"),
        role: t("원격 피어가 8명이 되면 새 링크를 만들지 않습니다. 초과 피어가 있으면 일회성 메시지는 전원이 같은 패킷을 보도록 서버 경로로 보냅니다.", "Creates no new link once 8 remote peers exist; with extra peers present, one-shot messages go over the server path so everyone sees the same packet."),
        paths: [`${LIVE}/studio-live-p2p-overlay-transport.ts#STUDIO_LIVE_P2P_MAX_PEERS`],
      },
      {
        feature: t("공동 작업실 · 화면 공유", "Shared workroom · screen sharing"),
        role: t("호스트가 시청자를 4명까지만 승인하고, 정원이 차면 새 요청을 자동으로 거절합니다.", "The host approves at most 4 viewers and automatically rejects new requests once full."),
        paths: ["apps/web/src/domains/creator/studio-screen-share.ts#STUDIO_SCREEN_SHARE_MAX_VIEWERS"],
      },
      {
        feature: t("공동 작업실 · 서버 쪽 상한", "Shared workroom · server-side limits"),
        role: t("문서 방은 새 참가자가 30명을 넘으면 거절하고, 실시간 서버 방은 연결이 64개면 503으로 거절합니다.", "A document room refuses new arrivals beyond 30, and a realtime server room answers 503 at 64 connections."),
        paths: [
          "apps/api/src/modules/creator/studio-live-gateway-constants.ts#STUDIO_LIVE_ROOM_MAX_PARTICIPANTS",
          "deploy/cloudflare-realtime/wrangler.jsonc",
          "apps/web/src/domains/creator/virtual-space/studio-virtual-space-model.ts#STUDIO_VIRTUAL_SPACE_MAX_PARTICIPANTS",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("풀메시 비용 계산", "Counting full-mesh cost"),
        language: "ts",
        code: `// n명이 서로 직접 연결하는 풀메시의 비용을 센다.
export function meshCost(people: number, kbpsPerStream: number) {
  const others = people - 1;
  return {
    connectionsPerPerson: others,
    totalConnections: (people * others) / 2, // n(n-1)/2
    uplinkKbps: others * kbpsPerStream, // 상대마다 따로 인코딩해 보낸다
  };
}

// 스트림 하나를 400kbps라고 '가정'하면(실측값이 아니다)
console.log(meshCost(4, 400)); // 연결 6쌍, 업로드 1200kbps
console.log(meshCost(9, 400)); // 연결 36쌍, 업로드 3200kbps`,
        codeEn: `// Count the cost of a full mesh where n people connect to each other directly.
export function meshCost(people: number, kbpsPerStream: number) {
  const others = people - 1;
  return {
    connectionsPerPerson: others,
    totalConnections: (people * others) / 2, // n(n-1)/2
    uplinkKbps: others * kbpsPerStream, // each peer gets its own encoded copy
  };
}

// Assume one stream is 400 kbps (an assumption, not a measurement)
console.log(meshCost(4, 400)); // 6 pairs, 1200 kbps upload
console.log(meshCost(9, 400)); // 36 pairs, 3200 kbps upload`,
        explain: t(
          "연결 수와 업로드가 인원에 따라 어떻게 커지는지 계산합니다. 400kbps는 설명을 위한 가정이며 저장소의 측정값이 아닙니다.",
          "Computes how links and upload grow with headcount. The 400 kbps figure is an illustrative assumption, not a measurement from this repository.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · WebRTC connectivity", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity", kind: "docs", note: t("P2P 연결 방식과 비용 개요", "Overview of P2P connection styles and cost") },
      { title: "IETF RFC 7667 · RTP topologies", url: "https://www.rfc-editor.org/rfc/rfc7667", kind: "spec", note: t("메시·SFU 같은 구성의 차이", "How mesh and SFU-style topologies differ") },
      { title: "Cloudflare · Durable Objects limits", url: "https://developers.cloudflare.com/durable-objects/platform/limits/", kind: "docs" },
      { title: "Socket.IO · Rooms", url: "https://socket.io/docs/v4/rooms/", kind: "docs" },
    ],
    chapterIds: ["webrtc-media-authority", "virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "서버 없이 서로 직접 연결하면 서버 비용이 들지 않지만, 4명이면 연결이 6쌍, 9명이면 36쌍으로 빠르게 늘어납니다. 그래서 허들 음성·영상은 원격 3명, 직통 데이터 통로는 원격 8명, 화면 공유는 시청자 4명으로 막아 두었습니다. 문서 방 30명과 실시간 서버의 64연결은 이것과 다른 층의 안전선입니다. 모두 설정 상수이고 부하 시험으로 보증한 수용량은 아닙니다.",
        "Connecting directly without a media server costs no server, but links grow fast: 6 pairs for 4 people, 36 for 9. So huddle voice and video are capped at 3 remote peers, the direct data-channel mesh at 8, and screen sharing at 4 viewers. The 30-person document room and the server's 64 connections are safety lines of other layers. All are settings, not load-tested capacity.",
      ),
      analogy: t(
        "회식 자리에서 모든 사람이 모든 사람과 따로 통화한다고 상상해 보세요. 4명이면 괜찮지만 9명이면 통화 선이 36개입니다. 그럴 땐 사회자가 한 번 듣고 마이크로 다시 전해 주는 방식(SFU)이 필요해집니다.",
        "Imagine everyone at a dinner calling everyone else separately. With 4 people it is fine; with 9 there are 36 lines. Then you need a host who listens once and repeats it over a microphone, which is what an SFU does.",
      ),
      questions: [
        {
          question: t("그럼 64명이 같이 그릴 수 있나요?", "So can 64 people draw together?"),
          answer: t(
            "아니요. 64는 실시간 서버(Durable Objects)가 방 하나에서 받는 WebSocket 연결 상한입니다. 문서 협업 방은 30명, 음성·영상은 원격 3명, 직통 데이터 통로는 원격 8명입니다. 서로 다른 층의 숫자입니다.",
            "No. 64 is the WebSocket connection limit of one Durable Objects room. The document room allows 30, voice and video 3 remote peers, and the direct data-channel mesh 8 remote peers. They are numbers from different layers.",
          ),
        },
        {
          question: t("더 큰 회의가 필요하면 어떻게 하나요?", "What if we need a bigger meeting?"),
          answer: t(
            "서버가 영상을 한 번 받아 나눠 주는 SFU 같은 구조가 필요합니다. 현재 저장소에는 구현이 없고, 기술 문서도 큰 회의·방송은 현재 범위가 아니라고 적었습니다.",
            "A structure like an SFU, where a server receives video once and fans it out, is needed. The repository has no implementation, and the technical document says large meetings and broadcast are out of scope for now.",
          ),
        },
        {
          question: t("이 숫자는 부하 시험 결과인가요?", "Are these numbers load-test results?"),
          answer: t(
            "아닙니다. 코드 상수와 배포 설정값입니다. 메시 상한은 연결 비용을 보고 정한 안전선이고, 서버 상한은 무료 인프라 안에서 안전하게 거절하기 위한 값입니다.",
            "No. They are code constants and deployment settings. Mesh caps are safety lines chosen from connection cost, and server caps exist to refuse safely inside free infrastructure.",
          ),
        },
      ],
      pitfall: t(
        "3·4·8·24·30·64를 한꺼번에 '정원'이라고 부르지 마세요. 어느 층의 숫자인지 함께 말해야 합니다. 대역폭 예시는 일반적인 가정이며 저장소 측정값이 아닙니다. 가상 스튜디오 24명이 직통 레인 기준으로는 8명까지만 닿는다는 설명은 코드 독해이며 실기기 검증은 없습니다.",
        "Do not call 3, 4, 8, 24, 30 and 64 'the capacity' in one breath; say which layer each belongs to. The bandwidth example is a generic assumption, not a measurement from this repository. That the virtual studio's 24 reaches only 8 over the direct lane comes from code reading, with no real-device verification.",
      ),
    },
    technologies: ["WebRTC", "RTCDataChannel", "Socket.IO", "Durable Objects", "SFU"],
    facts: [
      { value: "3", label: t("허들 원격 참가자 상한", "Huddle remote-peer cap"), source: `${HUDDLE}/studio-p2p-huddle-protocol.ts` },
      { value: "8", label: t("직통 데이터 통로 최대 피어", "Max peers on the data-channel mesh"), source: `${LIVE}/studio-live-p2p-overlay-transport.ts` },
      { value: "4", label: t("화면 공유 동시 시청자", "Concurrent screen-share viewers"), source: "apps/web/src/domains/creator/studio-screen-share.ts" },
      { value: "30", label: t("문서 협업 방 참가자 상한", "Document room participant cap"), source: "apps/api/src/modules/creator/studio-live-gateway-constants.ts" },
      { value: "64", label: t("실시간 서버 방당 연결 상한", "Realtime server connections per room"), source: "deploy/cloudflare-realtime/wrangler.jsonc" },
    ],
    reviewedAt: "2026-10-07",
  },

  // ───────────────────────────── 3. ICE · STUN · TURN 세 갈래 ─────────────────────────────
  {
    id: "webrtc-ice-turn-paths",
    category: "realtime",
    name: "ICE · STUN · TURN",
    title: t("직접 연결이 막힐 때를 위한 ICE 서버 세 갈래", "Three routes for ICE servers when a direct path is blocked"),
    status: "configured",
    tagline: t(
      "직접 연결이 막히는 네트워크를 위해 STUN·TURN 정보를 단기 자격증명으로 받습니다.",
      "Short-lived STUN and TURN credentials are fetched for networks where a direct connection is blocked.",
    ),
    background: [
      t(
        "집이나 회사 네트워크의 문(NAT·방화벽)이 잠겨 있으면 두 컴퓨터가 바로 만나지 못합니다. STUN은 '밖에서 보면 당신 주소가 이거예요'라고 알려 주는 안내 데스크이고, TURN은 직접 만날 수 없을 때 모든 대화를 대신 전달해 주는 우체국입니다. 우체국은 편리하지만 전달한 우편물(대역폭)만큼 비용이 듭니다.",
        "When the doors of a home or office network (NAT, firewall) are locked, two computers cannot meet directly. STUN is an information desk that tells you what your address looks like from outside; TURN is a post office that carries everything when a direct meeting is impossible. The post office is convenient but costs in proportion to the mail (bandwidth) it carries.",
      ),
      t(
        "ToonStudio는 ICE 서버 정보를 세 갈래로 받습니다. 첫째, 허들·직통 데이터 통로는 브라우저의 공유 캐시가 실시간 Worker의 POST /v1/turn/credentials에서 Cloudflare TURN 단기 자격증명(유효 4시간)을 받고, 없으면 STUN 전용으로 바로 시작합니다. 둘째, 화면 공유는 Nest API의 GET /creator/works/:id/screen-share/ice가 coturn 방식(HMAC-SHA1) 자격증명(기본 900초)을 발급합니다. 셋째, 로컬 모드는 ICE 서버 없이 같은 브라우저 안에서만 동작합니다.",
        "ToonStudio gets ICE server information three ways. First, the huddle and direct data channel use a shared browser cache that fetches Cloudflare TURN short-lived credentials (valid 4 hours) from the realtime Worker's POST /v1/turn/credentials, and starts STUN-only without them. Second, screen sharing gets coturn-style (HMAC-SHA1) credentials, 900 seconds by default, from the Nest API's GET /creator/works/:id/screen-share/ice. Third, local mode uses no ICE servers and works only inside one browser.",
      ),
      t(
        "열쇠를 브라우저에 고정해 두면 누구나 가져다 쓸 수 있어, 서버가 짧은 수명으로 즉석 발급합니다. 캐시는 동기 함수라서 TURN 발급이 늦거나 실패해도 연결 시작을 막지 않고 STUN 전용으로 넘어갑니다. Cloudflare TURN은 키만 등록하면 쓸 수 있어 자체 서버 운영이 필요 없고, coturn은 직접 운영하는 대안으로 선택형 배포 구성(scaffold)입니다.",
        "A key fixed in the browser could be used by anyone, so the server issues short-lived credentials on demand. The cache is a synchronous function, so a slow or failed TURN issuance never blocks starting a connection and it falls back to STUN-only. Cloudflare TURN works once a key is registered, with no server to run, while coturn is the self-run alternative, shipped as an optional deployment scaffold.",
      ),
      t(
        "운영 TURN 키가 등록됐는지는 코드로 알 수 없습니다. 2026-09-21 운영 문서는 STUN 전용 직접 P2P가 구성된 미디어 정책이고 유료 TURN·SFU는 마련하지 않았다고 적어, 그 시점에는 중계가 없던 것으로 읽힙니다. 제한된 NAT에서 중계가 실제로 통과한 검증도 없습니다. 코드 독해로 본 잠재 한계(미실증)도 있습니다. 허들은 연결을 만들 때 범위(scope) 없이 캐시를 읽으므로, 탭을 4시간 넘게 열어 두면 새 연결이 STUN 전용 구성으로 만들어질 수 있고 기존 연결에는 갱신이 적용되지 않습니다.",
        "Whether a production TURN key is registered cannot be known from the code. An operations note dated 2026-09-21 records that STUN-only direct P2P is the configured media policy and that no paid TURN or SFU is provisioned, so at that point there appears to have been no relay. No relayed connection has been verified through a restrictive NAT either. There is also a potential limit seen by code reading (unverified): the huddle reads the cache without a scope when it creates a connection, so a tab left open beyond 4 hours may create new connections with a STUN-only configuration, and existing connections receive no refresh.",
      ),
    ],
    keyPoints: [
      t("허들·데이터 통로: Worker가 발급하는 Cloudflare TURN(4시간)", "Huddle and data channel: Cloudflare TURN issued by the Worker (4 hours)"),
      t("화면 공유: API가 발급하는 coturn 방식 자격(기본 900초)", "Screen share: coturn-style credentials issued by the API (900 s default)"),
      t("캐시는 동기 폴백이라 TURN이 늦어도 연결을 막지 않습니다", "A synchronous cache fallback never blocks connecting"),
      t("운영 키 등록과 릴레이 통과 검증은 확인하지 못했습니다", "Production key registration and relay verification are unconfirmed"),
    ],
    diagram: {
      id: "webrtc-ice-turn-paths-diagram",
      kind: "sequence",
      title: t("TURN 자격증명이 발급되는 두 갈래", "Two ways TURN credentials get issued"),
      caption: t(
        "위쪽은 허들·데이터 통로용 Cloudflare 발급, 아래쪽은 화면 공유용 coturn 방식 발급입니다.",
        "The top half is Cloudflare issuance for the huddle and data channel; the bottom is coturn-style issuance for screen sharing.",
      ),
      alt: t(
        "브라우저가 API에서 짧은 티켓을 받아 실시간 Worker에 제시하면 Worker가 Cloudflare TURN에서 4시간짜리 자격을 받아 정책으로 돌려줍니다. 화면 공유에서는 API가 공유 비밀로 HMAC-SHA1 자격을 서명해 주고, 브라우저가 이를 들고 coturn에 접속하면 coturn이 같은 비밀로 다시 계산해 확인합니다.",
        "The browser gets a short ticket from the API and shows it to the realtime Worker, which obtains a 4-hour credential from Cloudflare TURN and returns it as a policy. For screen sharing, the API signs an HMAC-SHA1 credential with a shared secret, and when the browser connects to coturn with it, coturn recomputes it with the same secret to verify.",
      ),
      actors: [
        { id: "browser", label: t("브라우저", "Browser"), sub: t("ICE 캐시(메모리)", "ICE cache (memory)"), tone: "local" },
        { id: "api", label: t("Nest API", "Nest API"), sub: t("티켓·단기 자격 발급", "Tickets and credentials"), tone: "server" },
        { id: "worker", label: t("실시간 Worker", "Realtime Worker"), sub: t("Cloudflare Workers", "Cloudflare Workers"), tone: "edge" },
        { id: "cloudflare", label: t("Cloudflare TURN", "Cloudflare TURN"), tone: "external" },
        { id: "coturn", label: t("coturn", "coturn"), sub: t("선택형 자체 TURN 서버", "Optional self-run server"), tone: "external" },
      ],
      messages: [
        { from: "browser", to: "api", label: t("presence 티켓 요청", "Request presence ticket"), note: t("POST /studio-realtime/tickets", "POST /studio-realtime/tickets") },
        { from: "api", to: "browser", label: t("단기 티켓(최대 2분)", "Short ticket (max 2 min)"), style: "dashed" },
        { from: "browser", to: "worker", label: t("TURN 자격 요청 + 티켓", "Ask for TURN credentials"), note: t("POST /v1/turn/credentials", "POST /v1/turn/credentials") },
        { from: "worker", to: "worker", label: t("티켓·Origin·범위 검증", "Check ticket, origin, scope") },
        { from: "worker", to: "cloudflare", label: t("단기 자격 발급(4시간)", "Issue credentials (4 h)"), note: t("API 토큰은 Worker secret", "API token stays a Worker secret") },
        { from: "cloudflare", to: "worker", label: t("단기 자격", "Short-lived credentials"), style: "dashed" },
        { from: "worker", to: "browser", label: t("정책: TURN 또는 STUN 전용", "Policy: TURN or STUN-only"), style: "dashed", note: t("키가 없으면 STUN 전용", "STUN-only when no key") },
        { from: "browser", to: "api", label: t("화면 공유용 ICE 요청", "Request screen-share ICE"), note: t("GET …/screen-share/ice", "GET …/screen-share/ice") },
        { from: "api", to: "api", label: t("공유 비밀로 HMAC-SHA1 서명", "Sign with HMAC-SHA1") },
        { from: "api", to: "browser", label: t("정책(기본 900초)", "Policy (900 s default)"), style: "dashed" },
        { from: "browser", to: "coturn", label: t("중계 요청(임시 계정)", "Relay request (temp account)"), note: t("username = 만료시각:식별자", "username = expiry:identity") },
        { from: "coturn", to: "coturn", label: t("같은 비밀로 다시 계산해 확인", "Recompute with the same secret"), note: t("계정 DB가 필요 없음", "No account database needed") },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · P2P 채팅·통화(허들)", "Shared workroom · P2P chat and calls (huddle)"),
        role: t(
          "연결을 만들 때 공유 ICE 캐시에서 ICE 서버를 읽습니다. Worker가 발급한 TURN이 캐시에 있으면 포함하고, 없으면 STUN 전용으로 만듭니다.",
          "Reads ICE servers from the shared cache when creating a connection: includes Worker-issued TURN when cached and builds a STUN-only configuration otherwise.",
        ),
        paths: [`${LIVE}/studio-ice-configuration.ts`, `${HUDDLE}/studio-p2p-huddle-protocol.ts#huddleRtcConfiguration`],
        route: "/studio",
      },
      {
        feature: t("실시간 Worker · TURN 자격 발급", "Realtime Worker · TURN credential issuance"),
        role: t(
          "실시간 티켓을 검증한 뒤 Cloudflare TURN 키로 4시간짜리 자격을 발급합니다. 키가 없거나 차단 스위치가 켜져 있으면 발급을 흉내 내지 않고 STUN 전용 정책을 돌려줍니다.",
          "After verifying the realtime ticket, issues 4-hour credentials with a Cloudflare TURN key. Without a key, or with the kill switch on, it returns an honest STUN-only policy instead of faking issuance.",
        ),
        paths: ["deploy/cloudflare-realtime/src/turn.ts"],
      },
      {
        feature: t("공동 작업실 · 화면 공유", "Shared workroom · screen sharing"),
        role: t(
          "화면 공유를 시작하거나 시청할 때만 API에서 단기 자격을 받고, 만료 전에 미리 갱신해 이미 열린 연결에 setConfiguration으로 적용합니다.",
          "Fetches short-lived credentials from the API only when sharing or watching starts, refreshes them before expiry and applies them to open connections with setConfiguration.",
        ),
        paths: [
          "apps/api/src/modules/creator/studio-voice-ice-policy.service.ts",
          "apps/web/src/domains/creator/studio-voice-ice-policy.ts",
          "apps/web/src/domains/creator/studio-screen-ice-policy.ts",
        ],
      },
      {
        feature: t("선택 배포 · 자체 TURN 서버(coturn)", "Optional deployment · self-run TURN (coturn)"),
        role: t(
          "임시 계정 인증, 사설망 대역 차단, 사용량 한도를 갖춘 coturn 배포 구성입니다. 선택형 구성이며 운영 사용 여부는 확인하지 못했습니다.",
          "A coturn deployment with temporary-account auth, private-range blocking and quotas. It is optional and whether it is used in production is unconfirmed.",
        ),
        paths: ["deploy/coturn/README.md", "deploy/coturn/turnserver.conf.template"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("coturn 방식 단기 자격증명 만들기", "Making a coturn-style short-lived credential"),
        language: "ts",
        code: `// 서버에서만 실행한다. 공유 비밀은 환경변수·시크릿 저장소에서 읽는다.
export async function turnRestCredential(sharedSecret: string, identity: string, ttlSeconds = 900) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = expiresAt + ":" + identity; // 만료 시각이 앞에 온다
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sharedSecret),
    { name: "HMAC", hash: "SHA-1" }, // coturn use-auth-secret 규칙
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
  return { username, credential: btoa(String.fromCharCode(...mac)) };
}

// 클라이언트: 만료 전에 받은 새 자격을 열려 있는 연결에 그대로 적용한다.
export function refreshIce(pc: RTCPeerConnection, iceServers: RTCIceServer[]): void {
  pc.setConfiguration({ ...pc.getConfiguration(), iceServers });
}`,
        codeEn: `// Run on the server only. Read the shared secret from the environment or a secret store.
export async function turnRestCredential(sharedSecret: string, identity: string, ttlSeconds = 900) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = expiresAt + ":" + identity; // the expiry time comes first
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sharedSecret),
    { name: "HMAC", hash: "SHA-1" }, // the coturn use-auth-secret rule
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(username)));
  return { username, credential: btoa(String.fromCharCode(...mac)) };
}

// Client: apply the refreshed credentials to the open connection before expiry.
export function refreshIce(pc: RTCPeerConnection, iceServers: RTCIceServer[]): void {
  pc.setConfiguration({ ...pc.getConfiguration(), iceServers });
}`,
        explain: t(
          "username 앞에 만료 시각을 두고, 공유 비밀로 HMAC-SHA1 서명을 만든 것이 credential입니다. coturn은 같은 비밀로 다시 계산해 확인하므로 계정 DB가 필요 없습니다. 실제 서비스는 식별자를 HMAC-SHA256으로 가린 값을 씁니다.",
          "The username starts with an expiry time and the credential is an HMAC-SHA1 signature made with the shared secret. coturn recomputes it with the same secret, so no account database is needed. The real service uses an identity masked with HMAC-SHA256.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("연결을 막지 않는 동기 ICE 캐시", "A synchronous ICE cache that never blocks connecting"),
        language: "ts",
        code: `const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
type Issued = { servers: RTCIceServer[]; ttlSeconds: number } | null;

export function createIceCache(issue: () => Promise<Issued>) {
  let servers: RTCIceServer[] = [];
  let expiresAt = 0;
  let refreshAfter = 0;
  const refresh = async (now: number): Promise<void> => {
    const issued = await issue().catch(() => null); // 실패해도 던지지 않는다
    if (!issued) return;
    servers = issued.servers;
    expiresAt = now + issued.ttlSeconds * 1000;
    refreshAfter = now + issued.ttlSeconds * 800; // 수명 80% 지점에 미리 갱신
  };
  return (now = Date.now()): RTCIceServer[] => {
    if (expiresAt <= now) { void refresh(now); return STUN_ONLY; } // 동기: 기다리지 않는다
    if (refreshAfter <= now) void refresh(now);
    return servers;
  };
}`,
        codeEn: `const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
type Issued = { servers: RTCIceServer[]; ttlSeconds: number } | null;

export function createIceCache(issue: () => Promise<Issued>) {
  let servers: RTCIceServer[] = [];
  let expiresAt = 0;
  let refreshAfter = 0;
  const refresh = async (now: number): Promise<void> => {
    const issued = await issue().catch(() => null); // never throws on failure
    if (!issued) return;
    servers = issued.servers;
    expiresAt = now + issued.ttlSeconds * 1000;
    refreshAfter = now + issued.ttlSeconds * 800; // refresh early, at 80% of the lifetime
  };
  return (now = Date.now()): RTCIceServer[] => {
    if (expiresAt <= now) { void refresh(now); return STUN_ONLY; } // synchronous: never waits
    if (refreshAfter <= now) void refresh(now);
    return servers;
  };
}`,
        explain: t(
          "신선한 캐시가 있으면 그것을, 없으면 STUN 전용을 즉시 돌려주고 뒤에서 갱신합니다. 실제 모듈은 실패 후 30초 백오프, 범위(scope)별 캐시, 요청 중복 제거를 더합니다. 위 설명의 잠재 한계는 호출부가 범위를 넘기지 않아 갱신이 시작되지 않을 수 있다는 점입니다(코드 독해, 미실증).",
          "Returns a fresh cache if there is one, otherwise STUN-only immediately, and refreshes in the background. The real module adds a 30-second backoff after failure, per-scope caching and request de-duplication. The potential limit noted above is that callers pass no scope, so a refresh may never start (code reading, unverified).",
        ),
        source: `${LIVE}/studio-ice-configuration.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · WebRTC connectivity", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity", kind: "docs", note: t("ICE·STUN·TURN을 그림으로 설명", "ICE, STUN and TURN explained with diagrams") },
      { title: "IETF RFC 8445 · ICE", url: "https://www.rfc-editor.org/rfc/rfc8445", kind: "spec" },
      { title: "IETF RFC 8489 · STUN", url: "https://www.rfc-editor.org/rfc/rfc8489", kind: "spec" },
      { title: "IETF RFC 8656 · TURN", url: "https://www.rfc-editor.org/rfc/rfc8656", kind: "spec", note: t("RFC 5766을 대체한 최신 TURN 표준", "Current TURN standard replacing RFC 5766") },
      { title: "Cloudflare Realtime · TURN service", url: "https://developers.cloudflare.com/realtime/turn/", kind: "docs" },
      { title: "coturn · GitHub", url: "https://github.com/coturn/coturn", kind: "repo" },
    ],
    chapterIds: ["turn-credential-issuance", "webrtc-media-authority"],
    talk: {
      pitch: t(
        "WebRTC는 먼저 직접 연결을 시도하고, 막히면 중계 서버(TURN)를 씁니다. ToonStudio는 중계 서버에 들어가는 열쇠를 브라우저에 고정해 두지 않고 서버가 몇 시간 또는 몇 분짜리로 즉석 발급합니다. 허들은 Cloudflare TURN 4시간, 화면 공유는 coturn 방식 900초입니다. 키를 등록하기 전에는 STUN만으로 동작하며, 운영에서 실제 중계가 통과한 검증은 아직 없습니다.",
        "WebRTC first tries a direct connection and uses a relay server (TURN) when blocked. ToonStudio never fixes the relay key in the browser; the server issues it on demand for hours or minutes. The huddle uses Cloudflare TURN for 4 hours and screen sharing uses a coturn-style credential for 900 seconds. Before a key is registered it runs on STUN alone, and no relayed connection has been verified in production.",
      ),
      analogy: t(
        "STUN은 '밖에서 보면 당신 집 주소가 이거예요'라고 알려 주는 안내 데스크, TURN은 직접 만날 수 없을 때 우편물을 대신 전달하는 우체국입니다. 열쇠는 몇 시간 뒤 만료되는 일회용 출입증과 같습니다.",
        "STUN is an information desk saying what your address looks like from outside; TURN is a post office that carries the mail when you cannot meet directly. The key is like a one-day pass that expires after a few hours.",
      ),
      questions: [
        {
          question: t("TURN을 붙였나요?", "Have you added TURN?"),
          answer: t(
            "발급 코드와 정책 응답까지 구현했습니다. 운영 키가 등록됐는지는 코드로 확인할 수 없고 챕터 40은 미등록으로 기록합니다. 키가 없으면 STUN 전용으로 동작하며, 제한된 NAT에서 중계가 통과한 검증은 없습니다.",
            "The issuance code and policy response are implemented. Whether a production key is registered cannot be confirmed from the code, and chapter 40 records it as unregistered. Without a key it runs STUN-only, and no relay has been verified through a restrictive NAT.",
          ),
        },
        {
          question: t("TURN을 쓰면 비용이 드나요?", "Does TURN cost money?"),
          answer: t(
            "중계한 트래픽만큼 대역폭 비용이 듭니다. 직접 연결이 실패한 연결에만 쓰입니다. 요금은 바뀔 수 있으니 Cloudflare 공식 요금 문서를 확인하세요.",
            "It costs bandwidth for the traffic it relays and is used only for connections where a direct path fails. Prices can change, so check Cloudflare's official pricing page.",
          ),
        },
        {
          question: t("열쇠가 유출되면요?", "What if a key leaks?"),
          answer: t(
            "Cloudflare 경로는 4시간, 화면 공유 경로는 기본 900초 뒤에 만료됩니다. 발급도 세션과 작품 권한을 확인한 뒤에만 이뤄지며, 공급자 API 토큰은 브라우저에 나가지 않고 Worker secret으로만 보관합니다.",
            "Cloudflare credentials expire after 4 hours and screen-share credentials after 900 seconds by default. Issuance happens only after session and work permissions are checked, and the provider API token never reaches the browser; it stays a Worker secret.",
          ),
        },
      ],
      pitfall: t(
        "'TURN을 도입했다'고 말하지 마세요. 코드는 완성됐고 운영 키 등록과 중계 통과 검증은 미확인입니다. 코드 독해로 본 잠재 한계(미실증): ① 4시간 넘게 연 탭에서 새 연결이 STUN 전용으로 만들어질 수 있음 ② Cloudflare 문서의 발급 방식과 코드가 부르는 주소의 응답 모양이 다를 수 있어 키 등록 직후 실응답 확인이 필요함. 또 화면의 'TURN 중계는 사용하지 않습니다' 문구는 이 구성보다 낡은 표현입니다.",
        "Do not say 'we adopted TURN'. The code is complete, while production key registration and relay verification are unconfirmed. Potential limits seen by code reading (unverified): 1) in a tab open longer than 4 hours, new connections may be built STUN-only; 2) the response shape of the address the code calls may differ from the issuance method in Cloudflare's current docs, so a real response must be checked right after a key is registered. The on-screen sentence 'TURN relay is not used' is also older than this setup.",
      ),
    },
    technologies: ["WebRTC", "ICE", "STUN", "TURN", "Cloudflare Realtime TURN", "coturn", "HMAC"],
    facts: [
      { value: "4h", label: t("Worker가 발급하는 Cloudflare TURN 자격 수명", "Lifetime of Worker-issued Cloudflare TURN credentials"), source: "deploy/cloudflare-realtime/src/turn.ts" },
      { value: "900s", label: t("화면 공유 자격의 기본 수명(300~86,400초)", "Default screen-share credential lifetime (300 to 86,400 s)"), source: "apps/api/src/modules/creator/studio-voice-ice-policy.service.ts" },
      { value: "30s", label: t("ICE 캐시 발급 실패 뒤 재시도 대기", "ICE cache wait before retrying after a failure"), source: `${LIVE}/studio-ice-configuration.ts` },
    ],
    reviewedAt: "2026-10-07",
  },
];
