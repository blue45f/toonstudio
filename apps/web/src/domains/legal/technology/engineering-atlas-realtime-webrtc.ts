import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · realtime 카테고리 중 WebRTC 카드 묶음(시그널링·정원 사다리·ICE/STUN).
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
        "'Socket.IO가 WebRTC 시그널링을 한다'고만 말하면 부정확합니다. 통화용 SDP/ICE는 직접 레인, 서버 경로는 입장·접속 상태·화면 공유 신호·데이터 통로 시작 신호입니다(옛 음성 작업실의 신호 중계 코드는 운영 설정에서 꺼져 있습니다). 코드 독해로 본 잠재 한계(미실증): 데이터 통로 시작 신호가 Durable Objects에서 거부돼 Socket.IO로 우회될 수 있고, 그 우회를 통합 테스트로 확인하지 못했습니다. 로컬 Chromium의 성공을 인터넷 환경의 성공으로 말하지 마세요. 실험으로 표시한 이유: 코드는 제품 경로에 연결돼 있지만(허들 런처가 기본으로 마운트됨) 실기기·NAT 환경별 검증이 끝나지 않았기 때문입니다.",
        "Saying only 'Socket.IO does the WebRTC signaling' is inaccurate: call SDP/ICE use the direct lane, while the server path carries admission, presence, screen-share signals and the data-channel start signal (the signal-relay code of the older voice workroom is switched off in the production settings). A potential limit seen by code reading (unverified): the data-channel start signal may be rejected by Durable Objects and detour through Socket.IO, and no integration test confirms that detour. Do not present local Chromium success as success on the internet. Why it is marked experimental: the code is wired into the product path (the huddle launcher mounts by default), but real-device and per-NAT verification is not finished.",
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
        "풀메시는 모임의 모든 사람이 서로 한 명씩 직접 전화를 거는 방식입니다. 4명이면 통화 선이 6개이고, 각자는 3명에게 같은 말을 따로따로 해야 합니다. 서버가 한 번만 받아 나눠 주는 방식(SFU)과 달리 미디어 중계 비용이 없지만(사이트·신호 비용은 별도), 사람이 늘수록 서버보다 먼저 각자의 인터넷 업로드와 컴퓨터가 버티지 못합니다.",
        "A full mesh is like everyone at a gathering phoning everyone else one-to-one. With 4 people there are 6 lines, and each person must say the same thing separately to 3 others. Unlike a design where a server receives once and fans out (an SFU), it needs no media relay cost (site and signalling costs are separate), but as people join, each person's upload and computer give out before any server does.",
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
        "서버 없이 서로 직접 연결하면 미디어 중계 비용이 없지만, 4명이면 연결이 6쌍, 9명이면 36쌍으로 빠르게 늘어납니다. 그래서 허들 음성·영상은 원격 3명, 직통 데이터 통로는 원격 8명, 화면 공유는 시청자 4명으로 막아 두었습니다. 문서 방 30명과 실시간 서버의 64연결은 이것과 다른 층의 안전선입니다. 모두 설정 상수이고 부하 시험으로 보증한 수용량은 아닙니다.",
        "Connecting directly without a media server avoids relay cost, but links grow fast: 6 pairs for 4 people, 36 for 9. So huddle voice and video are capped at 3 remote peers, the direct data-channel mesh at 8, and screen sharing at 4 viewers. The 30-person document room and the server's 64 connections are safety lines of other layers. All are settings, not load-tested capacity.",
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
        "3·4·8·24·30·64를 한꺼번에 '정원'이라고 부르지 마세요. 어느 층의 숫자인지 함께 말해야 합니다. 대역폭 예시는 일반적인 가정이며 저장소 측정값이 아닙니다. 가상 스튜디오 24명이 직통 레인 기준으로는 원격 8명까지만 닿는다는 설명은 코드 독해이며 실기기 검증은 없습니다. 실험으로 표시한 이유: 코드는 제품 경로에 연결돼 있지만(허들 런처가 기본으로 마운트됨) 실기기·NAT 환경별 검증이 끝나지 않았기 때문입니다.",
        "Do not call 3, 4, 8, 24, 30 and 64 'the capacity' in one breath; say which layer each belongs to. The bandwidth example is a generic assumption, not a measurement from this repository. That the virtual studio's 24 reaches only 8 remote peers over the direct lane comes from code reading, with no real-device verification. Why it is marked experimental: the code is wired into the product path (the huddle launcher mounts by default), but real-device and per-NAT verification is not finished.",
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

  // ───────────────────────────── 3. ICE · STUN 전용 구성과 릴레이 폴백 ─────────────────────────────
  {
    id: "webrtc-ice-turn-paths",
    category: "realtime",
    name: "ICE · STUN 전용",
    title: t("TURN 없이 간다 — Cloudflare STUN 하나로 고정하고, 막히면 소켓 릴레이로 잇는다", "No TURN — one Cloudflare STUN for everything, and a socket relay when direct paths are blocked"),
    status: "configured",
    tagline: t(
      "모든 실시간 레인이 같은 Cloudflare STUN 주소를 씁니다. 중계 서버(TURN)는 비용 리스크로 쓰지 않기로 했습니다.",
      "Every realtime lane uses the same Cloudflare STUN address. Relay servers (TURN) are deliberately not used because of their cost risk.",
    ),
    background: [
      t(
        "집이나 회사 네트워크의 문(NAT·방화벽)이 잠겨 있으면 두 컴퓨터가 바로 만나지 못합니다. STUN은 '밖에서 보면 당신 주소가 이거예요'라고 알려 주는 안내 데스크이고, TURN은 직접 만날 수 없을 때 모든 대화를 대신 전달해 주는 우체국입니다. 우체국은 편리하지만 전달한 우편물(대역폭)만큼 비용이 듭니다. ToonStudio는 2026-10-11에 이 우체국을 쓰지 않기로 결정했습니다.",
        "When the doors of a home or office network (NAT, firewall) are locked, two computers cannot meet directly. STUN is an information desk that tells you what your address looks like from outside; TURN is a post office that carries everything when a direct meeting is impossible. The post office is convenient but costs in proportion to the mail (bandwidth) it carries. On 2026-10-11 ToonStudio decided not to use that post office.",
      ),
      t(
        "현재 ICE 구성은 한 곳에서만 나옵니다. 브라우저의 공유 모듈(studio-ice-configuration.ts)이 Cloudflare STUN(stun:stun.cloudflare.com:3478) 하나를 돌려주고, 허들·직통 데이터 통로·시그널링 전송이 전부 그 구성을 읽습니다. 화면 공유와 음성의 ICE 정책은 Nest API가 STUN 전용으로 반환하고, 별도 주소를 설정하지 않으면 기본값이 같은 Cloudflare 주소입니다. 로컬 모드는 ICE 서버 없이 같은 브라우저 안에서만 동작합니다.",
        "ICE configuration now comes from exactly one place. The shared browser module (studio-ice-configuration.ts) returns a single Cloudflare STUN (stun:stun.cloudflare.com:3478), and the huddle, the direct data lane and the signaling transport all read that configuration. Screen-share and voice ICE policies are returned STUN-only by the Nest API, defaulting to the same Cloudflare address when nothing else is configured. Local mode uses no ICE servers and works only inside one browser.",
      ),
      t(
        "원래는 중계 발급 코드가 있었습니다. 실시간 Worker의 POST /v1/turn/credentials가 Cloudflare TURN 단기 자격(4시간)을, API가 coturn 방식 자격(기본 900초)을 발급했고, 브라우저는 받은 자격을 메모리 캐시에 뒀습니다. 비용 결정 이후 이 발급 경로는 웹 캐시·Worker 엔드포인트·API 정책에서 모두 제거했고, 관련 환경변수와 secret 선언도 정리했습니다. 지금 코드 어디에도 TURN 자격을 만들거나 받는 곳은 없습니다.",
        "Relay issuance code used to exist: the realtime Worker's POST /v1/turn/credentials issued Cloudflare TURN short-lived credentials (4 hours), the API issued coturn-style credentials (900 seconds by default), and the browser cached what it received in memory. After the cost decision, those issuance paths were removed from the web cache, the Worker endpoint and the API policy, and the related environment variables and secret declarations were cleaned up. Nothing in the current code creates or fetches TURN credentials anywhere.",
      ),
      t(
        "STUN만으로는 대칭 NAT나 UDP가 막힌 네트워크에서 직접 연결이 열리지 않습니다. 그 환경에서 음성·화면 같은 미디어는 실패합니다 — 중계가 없으니 어쩔 수 없는 한계입니다. 대신 아바타 프레즌스의 직통 데이터 패킷은 ICE 실패가 감지되면 Socket.IO 릴레이(direct:relay)로 같은 상대에게 배달되도록 폴백을 구현해, 입장·이동·퇴장이 이어지게 했습니다. 서로 다른 네트워크에서 이 폴백이 실제로 동작하는지 브라우저 실측은 아직 하지 못했습니다(미측정).",
        "With STUN alone, a direct connection cannot open through a symmetric NAT or a UDP-blocked network. Voice and screen media fail in that environment — with no relay, that limit stands. Instead, the avatar presence lane's direct data packets fall back to a Socket.IO relay (direct:relay) addressed to the same peer once an ICE failure is detected, so joining, moving and leaving keep working. Whether that fallback behaves in real browsers across different networks has not been measured yet (unmeasured).",
      ),
    ],
    keyPoints: [
      t("전 레인 공통: Cloudflare STUN(stun.cloudflare.com:3478) 단일 구성", "All lanes share one Cloudflare STUN (stun.cloudflare.com:3478)"),
      t("TURN 발급 경로는 2026-10-11 결정으로 제거(웹 캐시·Worker 엔드포인트·API 자격 발급)", "TURN issuance paths were removed by the 2026-10-11 decision (web cache, Worker endpoint, API issuance)"),
      t("프레즌스 직통 패킷은 ICE 실패 시 소켓 릴레이로 폴백합니다", "Presence direct packets fall back to the socket relay on ICE failure"),
      t("음성·화면 미디어는 직접 연결이 막히면 실패합니다 — 중계가 없습니다", "Voice and screen media fail when a direct path is blocked — there is no relay for them"),
    ],
    diagram: {
      id: "webrtc-ice-turn-paths-diagram",
      kind: "sequence",
      title: t("STUN으로 직접 연결을 시도하고, 실패하면 프레즌스만 릴레이로", "Try direct with STUN; on failure, relay presence only"),
      caption: t(
        "위쪽은 평소의 직접 연결, 아래쪽은 ICE 실패 뒤 프레즌스 패킷이 게이트웨이를 거쳐 배달되는 폴백입니다.",
        "The top half is the normal direct connection; the bottom is the fallback where presence packets travel through the gateway after an ICE failure.",
      ),
      alt: t(
        "브라우저가 Cloudflare STUN으로 자기 공인 주소를 확인해 상대와 직접 연결을 시도합니다. 연결이 열리면 미디어와 데이터 채널은 서버를 거치지 않습니다. ICE 실패가 감지되면, 그 상대에게 가는 프레즌스 직통 패킷만 Nest API 게이트웨이의 대상 지정 릴레이(studio:direct:relay)를 거쳐 배달됩니다. 미디어는 릴레이 대상이 아닙니다.",
        "The browser checks its public address through Cloudflare STUN and tries a direct connection to the peer. When it opens, media and data channels never pass through a server. Once an ICE failure is detected, only that peer's presence direct packets are delivered through the Nest API gateway's targeted relay (studio:direct:relay). Media is never relayed.",
      ),
      actors: [
        { id: "browser", label: t("브라우저", "Browser"), sub: t("공유 ICE 구성", "Shared ICE configuration"), tone: "local" },
        { id: "stun", label: t("Cloudflare STUN", "Cloudflare STUN"), sub: t("stun.cloudflare.com:3478", "stun.cloudflare.com:3478"), tone: "external" },
        { id: "peer", label: t("상대 브라우저", "Peer browser"), tone: "local" },
        { id: "api", label: t("Nest API", "Nest API"), sub: t("게이트웨이 릴레이", "Gateway relay"), tone: "server" },
      ],
      messages: [
        { from: "browser", to: "stun", label: t("공인 주소 확인", "Discover public address"), note: t("ICE 후보 수집", "ICE candidate gathering") },
        { from: "browser", to: "peer", label: t("직접 연결 시도(P2P)", "Try a direct connection (P2P)") },
        { from: "peer", to: "browser", label: t("열리면 미디어·데이터는 서버를 거치지 않음", "When open, media and data bypass servers"), style: "dashed" },
        { from: "browser", to: "browser", label: t("ICE 실패 감지(failed·disconnected)", "ICE failure detected (failed, disconnected)") },
        { from: "browser", to: "api", label: t("직통 패킷 릴레이 요청", "Ask to relay a direct packet"), note: t("studio:direct:relay", "studio:direct:relay") },
        { from: "api", to: "peer", label: t("대상 지정 배달(프레즌스만)", "Targeted delivery (presence only)"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · P2P 채팅·통화(허들)와 직통 데이터 통로", "Shared workroom · P2P chat and calls (huddle) and the direct data lane"),
        role: t(
          "연결을 만들 때 공유 ICE 모듈에서 Cloudflare STUN 단일 구성을 읽습니다. 발급받거나 캐시하는 자격은 없습니다.",
          "Reads the single Cloudflare STUN configuration from the shared ICE module when creating a connection. There are no credentials to fetch or cache.",
        ),
        paths: [`${LIVE}/studio-ice-configuration.ts`, `${HUDDLE}/studio-p2p-huddle-protocol.ts#huddleRtcConfiguration`],
        route: "/studio",
      },
      {
        feature: t("공동 작업실 · 화면 공유와 음성의 ICE 정책", "Shared workroom · screen-share and voice ICE policy"),
        role: t(
          "API가 STUN 전용 정책을 반환합니다. STUDIO_VOICE_STUN_URLS로 주소를 바꿀 수 있고, 설정이 없으면 Cloudflare STUN이 기본값입니다. TURN 환경변수는 더 이상 읽지 않습니다.",
          "The API returns a STUN-only policy. STUDIO_VOICE_STUN_URLS can override the address; with no setting, Cloudflare STUN is the default. The TURN environment variables are no longer read.",
        ),
        paths: [
          "apps/api/src/modules/creator/studio-voice-ice-policy.service.ts",
          "apps/web/src/domains/creator/studio-voice-ice-policy.ts",
        ],
      },
      {
        feature: t("가상 스튜디오 · 프레즌스 릴레이 폴백", "Virtual studio · presence relay fallback"),
        role: t(
          "직통 데이터 채널이 ICE 실패로 닫히면, 그 피어에게 가는 공간 프레즌스 패킷만 오버레이가 direct:relay 봉투로 바꿔 1차 전송에 태우고 게이트웨이가 대상에게 배달합니다. 채널이 다시 열리면 폴백은 해제됩니다.",
          "When a direct data channel dies from an ICE failure, the overlay rewraps only that peer's spatial-presence packets as direct:relay envelopes on the primary transport and the gateway delivers them to the target. The fallback stands down when a channel opens again.",
        ),
        paths: [
          `${LIVE}/studio-live-p2p-overlay-transport.ts`,
          "apps/api/src/modules/creator/studio-live-gateway-handlers-voice.ts",
        ],
      },
      {
        feature: t("실시간 Worker · TURN 발급 엔드포인트 제거", "Realtime Worker · TURN issuance endpoint removed"),
        role: t(
          "POST /v1/turn/credentials 라우트와 발급 모듈, REALTIME_TURN_* 환경 선언을 제거했습니다. Worker는 시그널링과 프레즌스 중계만 담당하고 ICE 자격은 다루지 않습니다.",
          "The POST /v1/turn/credentials route, its issuance module and the REALTIME_TURN_* environment declarations were removed. The Worker only handles signaling and presence relaying; it has no ICE credential role.",
        ),
        paths: ["deploy/cloudflare-realtime/src/index.ts", "deploy/cloudflare-realtime/wrangler.jsonc"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("STUN 전용 ICE 구성의 단일 출처", "The single source of the STUN-only ICE configuration"),
        language: "ts",
        code: `// 모든 실시간 레인이 읽는 ICE 구성. TURN 자격을 받는 코드는 결정에 따라 제거했다.
export const STUDIO_ICE_STUN_URL = "stun:stun.cloudflare.com:3478";

export function getStudioIceServers(): RTCIceServer[] {
  // 호출부가 반환값을 바꿔도 공유 상수가 오염되지 않게 매번 새 배열로 복사한다.
  return [{ urls: [STUDIO_ICE_STUN_URL] }];
}`,
        codeEn: `// The ICE configuration every realtime lane reads. Credential fetching was removed by decision.
export const STUDIO_ICE_STUN_URL = "stun:stun.cloudflare.com:3478";

export function getStudioIceServers(): RTCIceServer[] {
  // Copy on every call so a caller mutating the result cannot poison the shared constant.
  return [{ urls: [STUDIO_ICE_STUN_URL] }];
}`,
        explain: t(
          "한때는 Worker에서 TURN 자격을 받아 캐시하는 모듈이었지만, 지금은 동기·정적 구성이라 연결 시작이 어떤 발급 요청에도 막히지 않습니다. STUN 주소가 하나뿐이라 레인마다 구성이 갈릴 일도 없습니다.",
          "This module once cached TURN credentials fetched from the Worker; now it is a synchronous, static configuration, so starting a connection never waits on any issuance request. With a single STUN address, lanes cannot drift apart either.",
        ),
        source: `${LIVE}/studio-ice-configuration.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("ICE 실패에서만 열리는 릴레이 폴백 판단", "The relay fallback gate that opens only on ICE failure"),
        language: "ts",
        code: `// 직통 레인 전송: 메시가 살아 있으면 채널로만, ICE가 실패한 피어만 릴레이로.
function sendDirect(peer: PeerLink, packet: string): boolean {
  if (meshReady(peer)) {
    if (peer.channel.bufferedAmount > MAX_BUFFERED) return false; // 백프레셔여도 릴레이로 새지 않는다
    return peer.channel.send(packet);
  }
  if (!relayEligible.has(peer.sessionId)) return false; // 실패 전에는 fail-closed
  return primary.send(relayEnvelope(peer.sessionId, packet)); // kind: "direct:relay"
}

// 발동 조건은 연결 상태 변화다. 채널이 다시 열리면 적격은 해제된다.
// connection.onconnectionstatechange: "failed" | "disconnected" -> relayEligible.add(id)
// channel.onopen: relayEligible.delete(id)`,
        codeEn: `// Direct-lane send: a live mesh uses the channel only; only ICE-failed peers relay.
function sendDirect(peer: PeerLink, packet: string): boolean {
  if (meshReady(peer)) {
    if (peer.channel.bufferedAmount > MAX_BUFFERED) return false; // never leaks to the relay under backpressure
    return peer.channel.send(packet);
  }
  if (!relayEligible.has(peer.sessionId)) return false; // fail-closed before any failure
  return primary.send(relayEnvelope(peer.sessionId, packet)); // kind: "direct:relay"
}

// The trigger is the connection state change; eligibility clears when a channel reopens.
// connection.onconnectionstatechange: "failed" | "disconnected" -> relayEligible.add(id)
// channel.onopen: relayEligible.delete(id)`,
        explain: t(
          "수신 측은 발신자가 프레즌스로 알려진 참가자인지, 패킷의 workId가 자기 방과 같은지를 다시 검증하고 메시 수신과 같은 3초 예산(180개·512KB)을 적용합니다. 폴백 봉투는 룸에 올라가지 않고 직통 리스너에게만 배달됩니다.",
          "The receiving side re-checks that the sender is a presence-known participant and that the packet's work id matches its own room, and applies the same 3-second budget as the mesh path (180 packets, 512 KB). Fallback envelopes never surface to the room; they are delivered only to direct-lane listeners.",
        ),
        source: `${LIVE}/studio-live-p2p-overlay-transport.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · WebRTC connectivity", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity", kind: "docs", note: t("ICE·STUN·TURN을 그림으로 설명", "ICE, STUN and TURN explained with diagrams") },
      { title: "IETF RFC 8445 · ICE", url: "https://www.rfc-editor.org/rfc/rfc8445", kind: "spec" },
      { title: "IETF RFC 8489 · STUN", url: "https://www.rfc-editor.org/rfc/rfc8489", kind: "spec" },
    ],
    chapterIds: ["turn-credential-issuance", "webrtc-media-authority"],
    talk: {
      pitch: t(
        "WebRTC 연결은 Cloudflare STUN 하나로만 구성합니다. 중계 서버(TURN)는 중계한 트래픽만큼 비용이 드는 구조라 쓰지 않기로 결정했고, 발급하던 코드도 제거했습니다. 직접 연결이 막히는 네트워크에서는 음성·화면이 실패하지만, 아바타 프레즌스만큼은 ICE 실패를 감지해 소켓 릴레이로 이어지게 만들었습니다.",
        "WebRTC connections are configured with a single Cloudflare STUN. Relay servers (TURN) charge for the traffic they carry, so we decided not to use one and removed the issuance code as well. In networks where a direct path is blocked, voice and screen fail, but avatar presence detects the ICE failure and continues over a socket relay.",
      ),
      analogy: t(
        "STUN은 '밖에서 보면 당신 집 주소가 이거예요'라고 알려 주는 안내 데스크입니다. 우체국(TURN)은 비용 때문에 계약하지 않았고, 대신 급한 쪽지(프레즌스 위치)만 기존 배달망(소켓)으로 보냅니다. 무거운 짐(영상·음성)은 직접 만나야만 주고받을 수 있습니다.",
        "STUN is an information desk saying what your address looks like from outside. We did not contract the post office (TURN) because of cost; instead, only the urgent notes (presence positions) ride the existing delivery network (sockets). Heavy luggage (video and voice) can only change hands in a direct meeting.",
      ),
      questions: [
        {
          question: t("TURN을 붙였나요?", "Have you added TURN?"),
          answer: t(
            "아니요. 한때 발급 코드를 구현했지만 2026-10-11에 비용 리스크로 쓰지 않기로 결정하고 제거했습니다. 지금 코드 어디에도 TURN 자격 발급 경로는 없습니다.",
            "No. Issuance code existed for a while, but on 2026-10-11 we decided not to use TURN because of its cost risk and removed it. No TURN credential issuance path remains anywhere in the code.",
          ),
        },
        {
          question: t("직접 연결이 막힌 네트워크에서는 전부 안 되나요?", "Does everything fail in a network that blocks direct paths?"),
          answer: t(
            "음성·화면 미디어는 실패합니다. 아바타의 입장·이동·퇴장 같은 공간 프레즌스는 ICE 실패가 감지되면 소켓 릴레이로 이어집니다. 단, 서로 다른 네트워크의 실제 브라우저에서 이 폴백을 실측한 기록은 아직 없습니다.",
            "Voice and screen media fail. Spatial presence — an avatar joining, moving and leaving — continues over the socket relay once an ICE failure is detected. There is no record yet of measuring this fallback in real browsers across different networks.",
          ),
        },
        {
          question: t("왜 STUN은 Cloudflare인가요?", "Why is the STUN Cloudflare's?"),
          answer: t(
            "실시간 Worker와 같은 공급자로 맞췄고 비용이 들지 않습니다. 주소는 stun.cloudflare.com:3478 하나이며, 모든 레인이 공유 모듈에서 같은 값을 읽습니다.",
            "It keeps one provider with the realtime Worker and costs nothing. The address is a single stun.cloudflare.com:3478, and every lane reads the same value from the shared module.",
          ),
        },
      ],
      pitfall: t(
        "'TURN을 도입했다'거나 '직접 연결이 막히면 중계로 이어진다'고 말하지 마세요. TURN은 결정으로 제거됐고, 릴레이 폴백은 프레즌스 직통 패킷 전용입니다. 미디어까지 이어지는 것처럼 말하면 과장입니다. 서로 다른 네트워크에서의 실측은 아직 없습니다.",
        "Do not say 'we adopted TURN' or 'a blocked direct path falls back to a relay'. TURN was removed by decision, and the relay fallback covers presence direct packets only. Presenting it as if media also continues would be an overstatement. Cross-network behavior has not been measured yet.",
      ),
    },
    technologies: ["WebRTC", "ICE", "STUN", "Cloudflare STUN", "Socket.IO"],
    facts: [
      { value: "3478", label: t("Cloudflare STUN 포트(stun.cloudflare.com)", "Cloudflare STUN port (stun.cloudflare.com)"), source: `${LIVE}/studio-ice-configuration.ts` },
      { value: "64KB", label: t("직통 패킷 1개의 크기 상한(릴레이 배달도 동일)", "Size cap of one direct packet (same on the relay)"), source: `${LIVE}/studio-live-direct-port.ts` },
      { value: "1200/60s", label: t("게이트웨이 릴레이 레이트리밋(연결당)", "Gateway relay rate limit (per connection)"), source: "apps/api/src/modules/creator/studio-live-gateway-handlers-voice.ts" },
    ],
    reviewedAt: "2026-10-11",
  },
];
