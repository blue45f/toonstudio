import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · realtime 카테고리 중 직통 데이터 통로·화면 공유·장치 권한 카드 묶음.
 * 주 파일(engineering-atlas-realtime.ts)이 다른 묶음과 함께 배열에 합친다.
 * 모든 값은 2026-10-07 기준으로 코드·설정을 직접 열어 확인한 것이다.
 */
const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const LIVE = "apps/web/src/domains/creator/live";
const HUDDLE = `${LIVE}/huddle`;

export const ENGINEERING_ATLAS_REALTIME_MEDIA: readonly EngineeringAtlasEntry[] = [
  // ───────────────────────────── 4. 직통 데이터 통로와 직접 레인 ─────────────────────────────
  {
    id: "webrtc-datachannel-direct-lane",
    category: "realtime",
    name: "RTCDataChannel",
    title: t("서버로 새지 않는 직접 레인과 피어 패브릭", "A direct lane that never leaks to the server, and the peer fabric"),
    status: "experimental",
    tagline: t(
      "브라우저 사이에 열린 데이터 통로 하나에 규칙이 다른 레인을 얹어 씁니다.",
      "One open channel between browsers carries lanes that each follow different rules.",
    ),
    background: [
      t(
        "RTCDataChannel은 두 브라우저 사이에 뚫어 둔 직통 파이프입니다. 서버를 거치지 않고 글자나 데이터 조각을 바로 보낼 수 있고, 택배로 치면 '순서대로 반드시 도착' 옵션과 '늦으면 버려도 됨' 옵션 중에서 고를 수 있습니다. 커서 위치처럼 최신 값만 중요한 데이터와 문서 변경처럼 빠지면 안 되는 데이터를 서로 다르게 다룰 수 있다는 뜻입니다.",
        "RTCDataChannel is a direct pipe drilled between two browsers. Text or chunks of data go straight across without a server, and, like a parcel service, you can choose between 'must arrive in order' and 'may be dropped if late'. That lets you treat data where only the latest value matters, like a cursor position, differently from data that must not be lost, like a document change.",
      ),
      t(
        "ToonStudio는 상대마다 'studio-live-p2p'라는 통로 하나를 옵션 없이 열어 순서 보장·완전 신뢰 모드로 쓰고, 그 위에 규칙이 다른 레인을 얹었습니다. ① 직접 레인(studio-direct-v1)은 허들의 상태·채팅·통화 신호를 상대 한 명에게 보내며, 프레임은 64KiB 이하이고 보내는 쪽 대기량이 128KiB를 넘으면 포기합니다. ② 피어 패브릭(studio-peer-fabric-v2)은 15가지 기능 이름과 control·realtime·bulk 세 등급(최대 24·16·48KiB, 수명 제한)을 둔 범용 메시지 층입니다. ③ 일회성 메시지(커서·하트비트·채팅·미리보기)는 모두에게 못 보내면 부분 전송 대신 전체를 서버 경로로 보냅니다.",
        "ToonStudio opens one channel named 'studio-live-p2p' per peer with default options, so it is ordered and fully reliable, and stacks lanes with different rules on it. 1) The direct lane (studio-direct-v1) carries the huddle's state, chat and call signals to one peer, with frames up to 64 KiB, and gives up if the sender's backlog passes 128 KiB. 2) The peer fabric (studio-peer-fabric-v2) is a general message layer with 15 named capabilities and three classes, control, realtime and bulk (up to 24, 16 and 48 KiB, with lifetime limits). 3) One-shot messages (cursor, heartbeat, chat, previews) go over the server path as a whole when they cannot reach everyone, instead of partial delivery.",
      ),
      t(
        "직접 레인에만 서버 폴백이 없는 이유는 '서버로 새지 않는다'는 약속 때문입니다. 반대로 커서처럼 방 전원이 같은 값을 봐야 하는 메시지는 일부에게만 가는 것보다 서버 경로로 모두에게 보내는 쪽이 낫다고 판단했습니다. 큰 파일은 한 번에 보내지 않고 24KiB 조각으로 나눠 한 번에 8개씩 보내며, 받는 쪽이 끝에서 SHA-256을 대조합니다(한 번에 최대 256MiB).",
        "Only the direct lane has no server fallback, because of the promise that it never leaks to the server. For messages such as a cursor that everyone in the room must see identically, sending to all over the server path beats reaching only some. Large files are not sent at once: they are split into 24 KiB chunks, sent 8 at a time, and the receiver compares a SHA-256 hash at the end (up to 256 MiB per transfer).",
      ),
      t(
        "한계도 있습니다. 통로는 순서·신뢰 모드 한 가지뿐이라 손실을 허용하는 커서 전용 레인은 없고, 대기량이 쌓이면 직접 레인은 보내기를 포기합니다. 패브릭의 15가지 기능 중 제품에 연결된 것으로 확인한 것은 화면 공유 신호와 오프라인 변경 동기화이며, 나머지의 연결 여부는 이 카드에서 확인하지 않았습니다.",
        "There are limits. The channel has only the ordered, reliable mode, so there is no lossy cursor-only lane, and the direct lane gives up sending when the backlog builds. Of the fabric's 15 capabilities, the ones confirmed to be wired into the product are screen-share signaling and offline-change sync; whether the rest are wired was not checked for this card.",
      ),
    ],
    keyPoints: [
      t("상대마다 'studio-live-p2p' 통로 하나를 순서·신뢰 모드로 엽니다", "One 'studio-live-p2p' channel per peer, ordered and reliable"),
      t("직접 레인: 64KiB 프레임, 밀리면 포기, 서버 폴백 없음", "Direct lane: 64 KiB frames, drops when backed up, no server fallback"),
      t("일회성 메시지: 전원에게 못 보내면 전체를 서버 경로로", "One-shot messages: all go over the server path if not everyone is reachable"),
      t("큰 파일: 24KiB 조각과 SHA-256 대조, 최대 256MiB", "Large files: 24 KiB chunks plus a SHA-256 check, up to 256 MiB"),
    ],
    diagram: {
      id: "webrtc-datachannel-direct-lane-diagram",
      kind: "graph",
      title: t("한 통로 위의 레인들과 서버 폴백", "Lanes on one channel, and the server fallback"),
      caption: t(
        "일회성 메시지는 전원 전달이 안 되면 서버 경로로 가지만, 직접 레인에는 서버로 가는 길이 없습니다.",
        "One-shot messages detour to the server path when not everyone is reachable, but the direct lane has no road to the server.",
      ),
      alt: t(
        "내 브라우저 안에서 일회성 메시지, 직접 레인, 피어 패브릭이 모두 하나의 직통 데이터 통로로 들어가 상대 브라우저로 전달됩니다. 큰 파일은 벌크 전송이 조각으로 나눠 패브릭 위에서 보냅니다. 일회성 메시지는 일부라도 보내지 못하면 전체를 서버 경로로 되돌리지만, 직접 레인에는 서버로 가는 연결이 없습니다.",
        "Inside my browser, one-shot messages, the direct lane and the peer fabric all enter one direct data channel that reaches the peer browser. Large files are chunked by the bulk transfer and sent over the fabric. One-shot messages go back to the server path as a whole if any peer cannot be reached, but the direct lane has no connection to the server.",
      ),
      nodes: [
        { id: "direct", label: t("직접 레인", "Direct lane"), sub: t("studio-direct-v1 · 서버 폴백 없음", "studio-direct-v1, no fallback"), tone: "good", at: [1, 0] },
        { id: "oneshot", label: t("일회성 메시지", "One-shot messages"), sub: t("커서 · 하트비트 · 채팅", "Cursor, heartbeat, chat"), tone: "local", at: [0, 1] },
        { id: "channel", label: t("직통 데이터 통로", "Direct data channel"), sub: t("studio-live-p2p · 순서·신뢰", "studio-live-p2p, ordered"), tone: "local", at: [1, 1] },
        { id: "fabric", label: t("피어 패브릭", "Peer fabric"), sub: t("studio-peer-fabric-v2", "studio-peer-fabric-v2"), tone: "local", at: [2, 1] },
        { id: "bulk", label: t("벌크 전송", "Bulk transfer"), sub: t("24KiB 조각 · SHA-256", "24 KiB chunks, SHA-256"), tone: "local", at: [3, 1] },
        { id: "server", label: t("서버 경로", "Server path"), sub: t("Socket.IO · Durable Objects", "Socket.IO or Durable Objects"), tone: "edge", at: [0, 2] },
        { id: "peer", label: t("상대 브라우저", "Peer browser"), sub: t("DTLS · SCTP", "DTLS and SCTP"), tone: "local", shape: "pill", at: [1, 2] },
      ],
      edges: [
        { from: "direct", to: "channel", label: t("상대 한 명에게", "To one peer") },
        { from: "oneshot", to: "channel", label: t("모두 열림", "All open") },
        { from: "fabric", to: "channel", label: t("등급별 메시지", "By class") },
        { from: "bulk", to: "fabric", label: t("조각으로 나눠", "In chunks") },
        { from: "channel", to: "peer", label: t("직접 전송", "Direct") },
        { from: "oneshot", to: "server", style: "dashed", label: t("전체 폴백", "Whole fallback") },
      ],
      groups: [
        { id: "mine", label: t("내 브라우저", "My browser"), tone: "local", nodeIds: ["direct", "oneshot", "channel", "fabric", "bulk"] },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · P2P 채팅·통화(허들)", "Shared workroom · P2P chat and calls (huddle)"),
        role: t(
          "상태·채팅·통화 신호를 직접 레인으로만 보냅니다. 보낼 수 없으면 false를 돌려줄 뿐 서버로 대신 보내지 않습니다.",
          "Sends state, chat and call signals only on the direct lane. When it cannot send it just returns false and never sends via the server instead.",
        ),
        paths: [`${LIVE}/studio-live-direct-port.ts`, `${LIVE}/studio-live-p2p-overlay-transport.ts`],
        route: "/studio",
      },
      {
        feature: t("공동 작업실 · 커서와 접속 상태", "Shared workroom · cursors and presence"),
        role: t(
          "커서·하트비트·채팅·제스처 미리보기를 모든 상대와 통로가 열려 있을 때만 직접 보내고, 아니면 전체를 서버 경로로 보내 전원이 같은 패킷을 봅니다.",
          "Sends cursors, heartbeats, chat and gesture previews directly only when channels to every peer are open; otherwise all go over the server path so everyone sees the same packet.",
        ),
        paths: [`${LIVE}/studio-live-p2p-overlay-transport.ts#sendEphemeral`],
      },
      {
        feature: t("공동 작업실 · 화면 공유", "Shared workroom · screen sharing"),
        role: t(
          "승인된 시청자에게 보낼 SDP/ICE를 패브릭(screen-signal-v2, control 등급, 수명 30초)으로 먼저 보내고 안 되면 서버 경로로 보냅니다.",
          "Sends the SDP/ICE for an approved viewer over the fabric first (screen-signal-v2, control class, 30-second lifetime) and over the server path if that fails.",
        ),
        paths: [`${LIVE}/studio-peer-screen-signaling-room.ts`],
      },
      {
        feature: t("공동 작업실 · 오프라인 변경 동기화", "Shared workroom · offline change sync"),
        role: t(
          "오프라인에서 만든 변경 묶음을 벌크 전송으로 조각내 상대에게 보냅니다. 받는 쪽은 SHA-256을 확인한 바이트만 가져옵니다. 오프라인 분기 사용 설정이 켜진 편집 세션에서 연결됩니다.",
          "Sends changes made offline to peers in chunks through bulk transfer; the receiver imports only bytes whose SHA-256 matches. It is wired into editing sessions where the offline-branch setting is on.",
        ),
        paths: [
          "apps/web/src/domains/creator/offline-branch/studio-offline-branch-p2p.ts",
          `${LIVE}/studio-peer-bulk-transfer.ts`,
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("서버로 새지 않는 직접 레인", "A direct lane that never leaks to the server"),
        language: "ts",
        code: `const WIRE = "studio-direct-v1";
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 128 * 1024;

type Channel = { readyState: string; bufferedAmount: number; send(data: string): void };

// 보낼 수 없으면 false 만 돌려주고, 서버로 대신 보내지 않는다.
export function sendDirect(channel: Channel | undefined, workId: string, payload: string): boolean {
  if (!channel || channel.readyState !== "open") return false;
  const packet = JSON.stringify({ wire: WIRE, workId, payload });
  if (new TextEncoder().encode(packet).byteLength > MAX_FRAME_BYTES) return false;
  if (channel.bufferedAmount > MAX_BUFFERED_BYTES) return false; // 배압: 밀리면 포기
  channel.send(packet);
  return true;
}

// 받는 쪽: 같은 작업(workId)의 같은 규격 패킷만 받는다.
export function parseDirect(value: unknown, workId: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const packet = value as { wire?: unknown; workId?: unknown; payload?: unknown };
  return packet.wire === WIRE && packet.workId === workId && typeof packet.payload === "string"
    ? packet.payload
    : null;
}`,
        codeEn: `const WIRE = "studio-direct-v1";
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_BUFFERED_BYTES = 128 * 1024;

type Channel = { readyState: string; bufferedAmount: number; send(data: string): void };

// If it cannot send, it only returns false; it never sends via the server instead.
export function sendDirect(channel: Channel | undefined, workId: string, payload: string): boolean {
  if (!channel || channel.readyState !== "open") return false;
  const packet = JSON.stringify({ wire: WIRE, workId, payload });
  if (new TextEncoder().encode(packet).byteLength > MAX_FRAME_BYTES) return false;
  if (channel.bufferedAmount > MAX_BUFFERED_BYTES) return false; // backpressure: give up when backed up
  channel.send(packet);
  return true;
}

// Receiver: accept only packets of the same format for the same work (workId).
export function parseDirect(value: unknown, workId: string): string | null {
  if (typeof value !== "object" || value === null) return null;
  const packet = value as { wire?: unknown; workId?: unknown; payload?: unknown };
  return packet.wire === WIRE && packet.workId === workId && typeof packet.payload === "string"
    ? packet.payload
    : null;
}`,
        explain: t(
          "프레임 크기와 대기량을 먼저 검사하고, 통과하지 못하면 서버로 돌리지 않고 실패를 돌려줍니다. 실제 코드는 여기에 받는 쪽 속도 제한(3초당 180개·512KiB)과 열람자 차단을 더합니다.",
          "It checks frame size and backlog first and, if either fails, returns failure rather than rerouting through the server. The real code adds a receive-rate limit (180 packets and 512 KiB per 3 seconds) and blocks viewers.",
        ),
        source: `${LIVE}/studio-live-direct-port.ts`,
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("통로 옵션: 저장소가 쓰는 설정과 쓰지 않는 설정", "Channel options: what the repo uses and what it does not"),
        language: "ts",
        code: `export function openLanes(pc: RTCPeerConnection) {
  // 저장소가 쓰는 설정: 옵션 없이 열면 순서 보장 + 완전 신뢰
  const reliable = pc.createDataChannel("control");
  // 저장소에는 없는 예: 최신 값만 중요한 커서 전용 레인(순서·재전송 포기)
  const lossy = pc.createDataChannel("cursor", { ordered: false, maxRetransmits: 0 });
  const send = (channel: RTCDataChannel, data: string, maxBuffered = 128 * 1024): boolean => {
    if (channel.readyState !== "open" || channel.bufferedAmount > maxBuffered) return false;
    channel.send(data); // 밀렸으면 보내지 않고 호출한 쪽에 실패를 알린다
    return true;
  };
  return { reliable, lossy, send };
}`,
        codeEn: `export function openLanes(pc: RTCPeerConnection) {
  // What the repo uses: opening with no options gives ordered, fully reliable delivery
  const reliable = pc.createDataChannel("control");
  // Not in the repo: a cursor-only lane where only the latest value matters (no order, no retransmit)
  const lossy = pc.createDataChannel("cursor", { ordered: false, maxRetransmits: 0 });
  const send = (channel: RTCDataChannel, data: string, maxBuffered = 128 * 1024): boolean => {
    if (channel.readyState !== "open" || channel.bufferedAmount > maxBuffered) return false;
    channel.send(data); // when backed up, do not send and report failure to the caller
    return true;
  };
  return { reliable, lossy, send };
}`,
        explain: t(
          "같은 연결 위에 신뢰 통로와 손실 허용 통로를 따로 열 수 있다는 점을 보여 줍니다. ToonStudio는 신뢰 통로 하나만 쓰며, 손실 허용 레인은 설계 선택지로만 남아 있습니다.",
          "Shows that one connection can open a reliable channel and a lossy channel separately. ToonStudio uses only the reliable one; a lossy lane remains a design option.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · RTCDataChannel", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel", kind: "docs" },
      { title: "MDN · RTCDataChannel.bufferedAmount", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount", kind: "docs", note: t("대기량을 보고 배압을 거는 기준", "The basis for applying backpressure") },
      { title: "IETF RFC 8831 · WebRTC data channels", url: "https://www.rfc-editor.org/rfc/rfc8831", kind: "spec", note: t("SCTP 위에서 순서·신뢰 옵션을 정하는 방식", "How ordering and reliability options sit on SCTP") },
      { title: "MDN · SubtleCrypto.digest", url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest", kind: "docs", note: t("벌크 전송의 SHA-256 대조에 쓰는 API", "The API behind the bulk transfer's SHA-256 check") },
    ],
    chapterIds: ["webrtc-media-authority"],
    talk: {
      pitch: t(
        "브라우저 사이에 직통 데이터 통로를 하나 열어 두고, 그 위에서 메시지마다 다른 규칙을 씁니다. 허들의 채팅과 통화 신호는 서버로 우회하지 않는 직접 레인으로만 갑니다. 커서처럼 모두가 같은 값을 봐야 하는 메시지는 전원에게 못 보내면 통째로 서버 경로로 보냅니다. 큰 파일은 조각으로 나눠 보내고 끝에서 해시를 대조합니다.",
        "One direct data channel is opened between browsers, and each kind of message follows its own rule on it. The huddle's chat and call signals use a direct lane that never detours via the server. Messages such as cursors, which everyone must see identically, go wholly over the server path when they cannot reach everyone. Large files are sent in chunks and checked by hash at the end.",
      ),
      analogy: t(
        "사무실 사이에 놓은 직통 사내 전화선 하나로 '비밀 메모용 선', '일반 안내 방송용 선'처럼 용도별 규칙을 두는 것과 같습니다. 비밀 메모용 선은 막혀도 우체국(서버)으로 돌리지 않습니다.",
        "It is like one private line between two offices with house rules per purpose: a line for confidential memos and one for general announcements. If the memo line is blocked, the memo is not rerouted through the post office (the server).",
      ),
      questions: [
        {
          question: t("직접 레인이 막히면 서버로 대신 보내나요?", "If the direct lane is blocked, does it go through the server?"),
          answer: t(
            "아니요. 직접 레인은 막히면 false를 돌려주고 호출한 쪽이 실패를 처리합니다. 서버로 돌리지 않는 것이 '서버로 새지 않는다'는 약속입니다.",
            "No. The direct lane returns false and the caller handles the failure. Not rerouting through the server is how it keeps the promise that nothing leaks to the server.",
          ),
        },
        {
          question: t("큰 파일이 중간에 깨지면요?", "What if a large file is corrupted midway?"),
          answer: t(
            "받는 쪽이 모든 조각을 모은 뒤 SHA-256을 계산해 보낸 쪽이 알린 값과 대조합니다. 다르면 실패 영수증을 보내고 데이터를 사용하지 않습니다.",
            "After collecting all chunks, the receiver computes SHA-256 and compares it with the sender's value. On a mismatch it sends a failure receipt and does not use the data.",
          ),
        },
        {
          question: t("P2P 통로는 암호화되나요?", "Is the P2P channel encrypted?"),
          answer: t(
            "WebRTC 데이터 통로는 표준상 DTLS 위에서 동작해 전송 구간이 암호화됩니다. 다만 P2P 특성상 상대에게 네트워크 주소가 보일 수 있어 참여 안내에서 먼저 알립니다.",
            "By standard, WebRTC data channels run over DTLS, so the transport is encrypted. Because it is P2P, peers can see your network address, which the join notice states up front.",
          ),
        },
      ],
      pitfall: t(
        "15가지 패브릭 기능이 모두 쓰이는 것처럼 말하지 마세요. 제품 연결을 확인한 것은 화면 공유 신호와 오프라인 변경 동기화뿐입니다. 통로는 순서·신뢰 모드 하나뿐이라 '손실 허용 레인'은 없습니다. 속도·지연 수치는 측정한 적이 없으므로 말하지 않습니다.",
        "Do not imply all 15 fabric capabilities are in use; only screen-share signaling and offline-change sync were confirmed as wired. The channel has just the ordered, reliable mode, so there is no lossy lane. No speed or latency figures have been measured, so none are quoted.",
      ),
    },
    technologies: ["RTCDataChannel", "WebRTC", "SCTP", "DTLS", "SHA-256", "backpressure"],
    facts: [
      { value: "64 KiB", label: t("직접 레인 프레임 상한", "Direct-lane frame cap"), source: `${LIVE}/studio-live-direct-port.ts` },
      { value: "128 KiB", label: t("직접 레인 보내기 대기량 상한", "Direct-lane send backlog cap"), source: `${LIVE}/studio-live-direct-port.ts` },
      { value: "15", label: t("피어 패브릭 기능 이름 수", "Number of peer-fabric capabilities"), source: `${LIVE}/studio-peer-fabric-protocol.ts` },
      { value: "256 MiB", label: t("벌크 전송 1회 최대 크기", "Maximum size of one bulk transfer"), source: `${LIVE}/studio-peer-bulk-transfer.ts` },
    ],
    reviewedAt: "2026-10-07",
  },

  // ───────────────────────────── 5. 화면 공유 ─────────────────────────────
  {
    id: "screen-share-signaling",
    category: "realtime",
    name: "Screen sharing",
    title: t("보여 주는 사람이 한 명씩 허락하는 화면 공유", "Screen sharing the host approves one viewer at a time"),
    status: "experimental",
    tagline: t(
      "시청자가 요청하고 호스트가 한 명씩 승인해야 그 사람에게만 화면이 흐릅니다.",
      "A viewer asks, the host approves each one, and only then does the screen flow to that person.",
    ),
    background: [
      t(
        "화면 공유는 내 작업 화면을 팀원에게 보여 주는 기능입니다. 방 전체에 자동으로 송출하면 편하지만 작업 중인 원고나 알림이 새 나갈 수 있어, ToonStudio는 '보고 싶은 사람이 요청하고, 보여 주는 사람이 한 명씩 허락해야' 화면이 흐르게 했습니다. 방에 보이는 '공유 중' 표시와 실제로 영상을 받는 사람을 일부러 분리한 것입니다.",
        "Screen sharing shows your working screen to teammates. Broadcasting to the whole room automatically would be convenient, but it could leak a manuscript in progress or notifications, so ToonStudio lets the screen flow only after a viewer asks and the host approves each person. The 'sharing' indicator in the room is deliberately separate from who actually receives the video.",
      ),
      t(
        "순서는 이렇습니다. 호스트가 공유를 시작하면(브라우저의 화면 선택 창, 영상만) 공유 알림이 방에 퍼집니다. 시청자가 요청하면 호스트가 시청자마다 승인하고, 승인한 뒤에만 그 시청자 전용 연결(RTCPeerConnection)과 offer를 만듭니다. 연결 설정 신호(SDP/ICE)는 승인된 쌍에 한해 직통 데이터 통로(screen-signal-v2)로 먼저 보내고 안 되면 서버 경로로 보냅니다. 영상은 서버를 거치지 않고 시청자별로 직접 흐릅니다.",
        "The order: when the host starts sharing (through the browser's screen picker, video only) an announcement spreads in the room. When a viewer asks, the host approves each viewer, and only then are that viewer's own connection (RTCPeerConnection) and offer created. Connection-setup signals (SDP/ICE) go first over the direct data channel (screen-signal-v2) for approved pairs and over the server path if that fails. The video itself never passes the server and flows directly to each viewer.",
      ),
      t(
        "서버(Durable Objects)도 같은 규칙을 한 번 더 지킵니다. 현재 공유 중인 소유자와 승인된 시청자 쌍, 저장된 연결 번호가 맞는 신호만 전달하고, 공유를 다시 시작하면 이전 승인을 물려받지 않습니다. 호스트가 시청자 수만큼 영상을 따로 보내는 구조라서 동시 시청자는 4명으로 제한합니다. 서버가 한 번 받아 나눠 주는 SFU는 규모에 유리하지만 비용과 운영이 따르며, 설계 문서는 4인을 넘는 수요가 확인될 때만 검토한다고 적었습니다.",
        "The server (Durable Objects) enforces the same rules again. It forwards only signals that match the current share owner, an approved viewer pair and a stored connection id, and a restarted share does not inherit earlier approvals. Because the host sends a separate video to each viewer, concurrent viewers are capped at 4. An SFU that receives once and fans out scales better but brings cost and operations, and the design document says to consider it only when demand beyond 4 people is confirmed.",
      ),
      t(
        "한계도 분명합니다. 시청자가 늘면 호스트의 업로드가 그만큼 늘어 4명을 넘는 시청이나 방송은 현재 범위가 아닙니다. 제한된 네트워크에서는 TURN 중계가 필요할 수 있는데 운영 TURN 키 등록 여부와 실제 중계 통과는 확인하지 못했습니다. 검증은 단위·통합 테스트 수준이며, 서로 다른 네트워크에서의 화면 공유 성공은 확인한 기록이 없습니다.",
        "The limits are clear too. More viewers mean proportionally more upload for the host, so viewing beyond 4 or broadcasting is out of scope. Restrictive networks may need a TURN relay, but whether a production TURN key is registered and whether a relay actually passes were not confirmed. Verification is at the unit and integration test level, and there is no record of screen sharing succeeding across different networks.",
      ),
    ],
    keyPoints: [
      t("시청자가 요청하고 호스트가 한 명씩 승인해야 연결됩니다", "A viewer asks and the host approves each one before any link exists"),
      t("신호는 승인된 쌍만 통과: 직통 우선, 서버가 한 번 더 검증", "Signals pass only for approved pairs: direct first, verified again by the server"),
      t("영상은 서버를 거치지 않고 시청자별로 직접 흐릅니다", "Video bypasses the server and flows directly to each viewer"),
      t("동시 시청자는 4명, 소리는 딸려 와도 즉시 멈춥니다", "At most 4 viewers; any audio track is stopped immediately"),
    ],
    diagram: {
      id: "screen-share-signaling-diagram",
      kind: "sequence",
      title: t("요청 → 승인 → 직접 연결", "Request, approve, connect directly"),
      caption: t(
        "서버 경로는 알림과 승인 상태만 다루고, 화면 영상은 승인된 시청자에게 직접 흐릅니다.",
        "The server path handles only announcements and approval state; the screen video flows directly to the approved viewer.",
      ),
      alt: t(
        "호스트가 화면을 고르고 공유를 알리면 서버 경로가 시청자에게 전달합니다. 시청자가 요청하면 호스트가 시청자별로 승인하고, 승인된 뒤에만 호스트가 그 시청자용 연결과 offer를 만들어 보냅니다. 시청자의 answer와 ICE가 돌아오면 화면 영상이 직접 흐르고, 시청을 끝내면 서버 경로를 통해 호스트에게 알려 연결을 정리합니다.",
        "The host picks a screen and announces it, and the server path passes it to the viewer. When the viewer asks, the host approves per viewer, and only then creates and sends an offer on a connection made for that viewer. Once the viewer's answer and ICE return, the video flows directly; when watching ends, the server path tells the host so the connection is cleaned up.",
      ),
      actors: [
        { id: "host", label: t("호스트", "Host"), sub: t("화면을 보여 주는 브라우저", "Browser sharing the screen"), tone: "local" },
        { id: "server", label: t("서버 경로", "Server path"), sub: t("Durable Objects · Socket.IO", "Durable Objects or Socket.IO"), tone: "edge" },
        { id: "viewer", label: t("시청자", "Viewer"), sub: t("보고 싶은 브라우저", "Browser that wants to watch"), tone: "local" },
      ],
      messages: [
        { from: "host", to: "server", label: t("공유 알림(announce)", "Announce the share"), note: t("화면 선택은 사용자 클릭 뒤 · 영상만", "after a click, video only") },
        { from: "server", to: "viewer", label: t("공유 중이라고 알림", "Tell viewer a share exists"), style: "dashed" },
        { from: "viewer", to: "server", label: t("시청 요청(request)", "Ask to watch") },
        { from: "server", to: "host", label: t("요청 전달", "Relay the request"), style: "dashed" },
        { from: "host", to: "server", label: t("시청자별 승인(approve)", "Approve this viewer"), note: t("정원 4명 · 초과는 자동 거절", "cap 4, extra requests rejected") },
        { from: "server", to: "viewer", label: t("승인 알림", "Tell viewer it is approved"), style: "dashed" },
        { from: "host", to: "host", label: t("이 시청자 전용 연결 만들기", "Create a connection for this viewer") },
        { from: "host", to: "viewer", label: t("offer (직통 우선, 안 되면 서버)", "Offer (direct first, else server)"), note: t("승인된 쌍만 통과", "approved pair only") },
        { from: "viewer", to: "host", label: t("answer · ICE", "Answer and ICE"), style: "dashed" },
        { from: "host", to: "viewer", label: t("화면 영상(RTP)", "Screen video (RTP)"), note: t("이 시청자에게만 · 서버 없음", "this viewer only, no server") },
        { from: "viewer", to: "server", label: t("시청 종료(ended)", "Stop watching") },
        { from: "server", to: "host", label: t("연결 정리 알림", "Tell host to clean up"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · 화면 공유 패널", "Shared workroom · screen-share panel"),
        role: t(
          "공유 시작, 시청 요청, 호스트 승인, 시청자별 연결 생성과 종료 정리를 맡습니다. 공유 중지 버튼과 브라우저의 '공유 중지'를 같은 정리 경로로 묶습니다.",
          "Handles starting a share, viewer requests, host approval, per-viewer connections and cleanup. The share-stop button and the browser's own stop-sharing bar share one cleanup path.",
        ),
        paths: [
          "apps/web/src/domains/creator/studio-screen-share.ts#StudioScreenShareController",
          `${LIVE}/StudioLiveCollaborationPanel.tsx`,
        ],
        route: "/studio",
      },
      {
        feature: t("공동 작업실 · 화면 공유 신호의 직통 우선 경로", "Shared workroom · direct-first path for screen-share signals"),
        role: t(
          "승인된 쌍의 offer/answer/ICE를 직통 데이터 통로(screen-signal-v2)로 먼저 보내고, 불가능하면 서버 경로로 보냅니다.",
          "Sends an approved pair's offer, answer and ICE over the direct data channel (screen-signal-v2) first, and over the server path when that is impossible.",
        ),
        paths: [`${LIVE}/studio-peer-screen-signaling-room.ts`],
      },
      {
        feature: t("실시간 Worker · 화면 공유 접근 규칙", "Realtime Worker · screen-share access rules"),
        role: t(
          "공유 소유자와 승인된 시청자 쌍, 저장된 연결 번호가 맞는 신호만 전달하고, 공유를 다시 시작하면 이전 승인을 상속하지 않습니다.",
          "Forwards only signals matching the share owner, an approved viewer pair and a stored connection id, and does not carry earlier approvals into a restarted share.",
        ),
        paths: ["deploy/cloudflare-realtime/src/room-store.ts#authorizeScreenSignal"],
      },
      {
        feature: t("작업실 서버 · Socket.IO 화면 공유 릴레이", "Workroom server · Socket.IO screen-share relay"),
        role: t(
          "Durable Objects를 쓰지 못할 때를 위한 Socket.IO 경로의 공유 알림·요청·승인·중지 처리입니다. 알림은 분당 30회로 제한합니다.",
          "Handles announce, request, approve and stop over the Socket.IO path for when Durable Objects is unavailable. Announcements are limited to 30 per minute.",
        ),
        paths: ["apps/api/src/modules/creator/studio-live-gateway-handlers-lock-screen.ts#announceScreenShare"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("시청자별 승인과 전용 연결", "Per-viewer approval and a dedicated connection"),
        language: "ts",
        code: `const MAX_VIEWERS = 4;

export class ScreenShareHost {
  private readonly viewers = new Map<string, RTCPeerConnection>();

  constructor(
    private readonly stream: MediaStream, // getDisplayMedia 로 얻은 화면(영상만)
    private readonly signal: (viewerId: string, message: object) => void, // 시그널링 통로
  ) {}

  // 시청자 한 명의 요청을 승인한다. 정원이 차면 연결을 만들지 않고 거절한다.
  async approve(viewerId: string): Promise<"approved" | "rejected"> {
    if (this.viewers.size >= MAX_VIEWERS) return "rejected";
    const pc = new RTCPeerConnection(); // 승인한 시청자 전용 연결
    this.viewers.set(viewerId, pc);
    for (const track of this.stream.getVideoTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal(viewerId, { ice: candidate.toJSON() });
    };
    await pc.setLocalDescription(await pc.createOffer());
    this.signal(viewerId, { offer: pc.localDescription?.sdp });
    return "approved";
  }
}`,
        codeEn: `const MAX_VIEWERS = 4;

export class ScreenShareHost {
  private readonly viewers = new Map<string, RTCPeerConnection>();

  constructor(
    private readonly stream: MediaStream, // the screen from getDisplayMedia (video only)
    private readonly signal: (viewerId: string, message: object) => void, // signaling channel
  ) {}

  // Approve one viewer's request. When full, create no connection and reject.
  async approve(viewerId: string): Promise<"approved" | "rejected"> {
    if (this.viewers.size >= MAX_VIEWERS) return "rejected";
    const pc = new RTCPeerConnection(); // a connection dedicated to the approved viewer
    this.viewers.set(viewerId, pc);
    for (const track of this.stream.getVideoTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.signal(viewerId, { ice: candidate.toJSON() });
    };
    await pc.setLocalDescription(await pc.createOffer());
    this.signal(viewerId, { offer: pc.localDescription?.sdp });
    return "approved";
  }
}`,
        explain: t(
          "승인한 뒤에야 그 시청자 전용 연결과 offer가 만들어집니다. 실제 코드는 승인 알림을 서버 경로로 먼저 보내고, 늦게 끝난 화면 선택은 세대 번호로 폐기하며, ICE 서버 정책을 갱신할 때 호스트만 ICE를 다시 시작합니다.",
          "The viewer's own connection and offer exist only after approval. The real code first sends the approval over the server path, discards a late screen pick by generation number, and lets only the host restart ICE when the ICE-server policy refreshes.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · MediaDevices.getDisplayMedia()", url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia", kind: "docs", note: t("사용자 선택 창과 제스처 요구", "The user picker and gesture requirement") },
      { title: "MDN · Using the Screen Capture API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture", kind: "guide" },
      { title: "W3C · Screen Capture", url: "https://www.w3.org/TR/screen-capture/", kind: "spec" },
      { title: "MDN · RTCPeerConnection.restartIce()", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce", kind: "docs", note: t("네트워크 경로를 다시 찾는 표준 방법", "The standard way to find a new network path") },
      { title: "Cloudflare · Durable Objects WebSockets", url: "https://developers.cloudflare.com/durable-objects/best-practices/websockets/", kind: "docs" },
    ],
    chapterIds: ["webrtc-media-authority"],
    talk: {
      pitch: t(
        "ToonStudio의 화면 공유는 방송이 아니라 초대입니다. 시청자가 요청하고 호스트가 한 명씩 승인해야만 그 사람을 위한 연결이 만들어지고, 영상은 서버를 거치지 않고 그 사람에게만 직접 흐릅니다. 서버는 승인된 쌍의 신호만 통과시키고, 동시에 볼 수 있는 사람은 4명까지입니다. 4명을 넘는 방송은 아직 범위가 아닙니다.",
        "Screen sharing in ToonStudio is an invitation, not a broadcast. A connection exists for a person only after they ask and the host approves them one by one, and the video flows directly and only to them, never via the server. The server passes signals for approved pairs only, and at most 4 people can watch at once. Broadcasting beyond that is not in scope yet.",
      ),
      analogy: t(
        "발표자가 노트북 화면을 모두에게 틀어 놓는 것이 아니라, 보고 싶다고 손든 사람에게 한 명씩 '이쪽으로 오세요' 하며 어깨 너머로 보여 주는 것과 같습니다.",
        "It is like a presenter not putting the laptop on the big screen for everyone, but letting each person who raised a hand come over and look over the shoulder, one at a time.",
      ),
      questions: [
        {
          question: t("화면 공유를 켜면 방 전체에 보이나요?", "If I start sharing, does the whole room see it?"),
          answer: t(
            "아니요. 방에는 '공유 중'이라는 알림만 보이고, 영상은 호스트가 승인한 시청자 연결로만 갑니다.",
            "No. The room sees only a 'sharing' notice; the video goes only over connections to viewers the host approved.",
          ),
        },
        {
          question: t("소리도 같이 공유되나요?", "Is sound shared as well?"),
          answer: t(
            "아니요. 코드는 화면을 요청할 때 소리를 요구하지 않고, 소리 트랙이 딸려 와도 즉시 멈춥니다.",
            "No. The code does not request audio when capturing the screen, and stops any audio track that comes along.",
          ),
        },
        {
          question: t("5명이 보고 싶다면요?", "What if five people want to watch?"),
          answer: t(
            "정원 4명이 차면 새 요청은 자동으로 거절됩니다. 더 큰 시청은 SFU 같은 구조가 필요한데 현재 범위가 아닙니다.",
            "Once the cap of 4 is full, new requests are rejected automatically. Larger viewing needs a structure like an SFU, which is out of scope today.",
          ),
        },
      ],
      pitfall: t(
        "서버가 화면을 중계한다고 오해하지 않게 하세요. 서버는 SDP/ICE 신호와 승인 상태만 다룹니다. 제한된 네트워크의 시청자는 TURN이 없으면 연결에 실패할 수 있고, 운영 TURN 키 등록 여부는 확인하지 못했습니다. 서로 다른 네트워크에서의 성공은 검증한 적이 없으므로 보장처럼 말하지 마세요.",
        "Do not let people think the server relays the screen; it handles only SDP/ICE signals and approval state. A viewer on a restrictive network may fail without TURN, and whether a production TURN key is registered was not confirmed. Success across different networks has never been verified, so do not present it as guaranteed.",
      ),
    },
    technologies: ["getDisplayMedia", "WebRTC", "RTCPeerConnection", "Durable Objects", "Socket.IO", "ICE restart"],
    facts: [
      { value: "4", label: t("동시 시청자 상한", "Concurrent viewer cap"), source: "apps/web/src/domains/creator/studio-screen-share.ts" },
      { value: "8", label: t("호스트가 쌓아 둘 수 있는 대기 요청", "Pending requests a host can queue"), source: "apps/web/src/domains/creator/studio-screen-share.ts" },
      { value: "30s", label: t("직통 신호 메시지의 수명", "Lifetime of a direct signal message"), source: `${LIVE}/studio-peer-screen-signaling-room.ts` },
    ],
    reviewedAt: "2026-10-07",
  },

  // ───────────────────────────── 6. 장치 권한과 메모리 전용 세션 ─────────────────────────────
  {
    id: "media-permissions-policy",
    category: "realtime",
    name: "getUserMedia",
    title: t("카메라·마이크는 누를 때만, 기록은 메모리에만", "Camera and microphone only on a click; records only in memory"),
    status: "experimental",
    tagline: t(
      "참여만으로는 카메라·마이크를 요청하지 않고, 대화 기록은 브라우저 메모리에만 둡니다.",
      "Joining never asks for the camera or microphone, and chat records stay only in browser memory.",
    ),
    background: [
      t(
        "카메라와 마이크는 가장 민감한 센서입니다. 집 현관과 같아서 초인종이 울렸다고 문을 자동으로 열면 안 되고 집주인이 직접 열어야 합니다. ToonStudio의 P2P 채팅·통화는 '참여'를 누르면 글자 채팅만 시작하고, 마이크·카메라·화면 공유는 각각의 버튼을 직접 누를 때에만 브라우저에 권한을 요청합니다.",
        "The camera and microphone are the most sensitive sensors. Like a front door, it must not open automatically because the bell rang; the owner opens it. In ToonStudio's P2P chat and calls, pressing join starts only text chat, and the microphone, camera and screen sharing ask the browser for permission only when their own buttons are pressed.",
      ),
      t(
        "원리는 네 겹입니다. ① 참여 동의는 장치를 요청하지 않습니다(컨트롤러 주석: 시작만으로는 카메라·마이크 접근을 요청하지 않음). ② 버튼 하나가 getUserMedia/getDisplayMedia 한 번에 대응합니다. ③ 권한 창에서 한참 뒤 '허용'을 눌러도, 그 사이 통화를 떠났거나 대화 범위가 바뀌었거나 권한이 회수됐다면 받은 트랙을 즉시 멈춥니다. ④ 나가기, 서버 경로 끊김, 방 전환에서는 트랙을 모두 멈추고 메시지 기록을 지웁니다.",
        "It works in four layers. 1) Consenting to join requests no device (a controller comment says starting alone never requests camera or microphone access). 2) One button maps to one getUserMedia or getDisplayMedia call. 3) If the user clicks Allow long after the prompt appeared, but the call was left, the conversation scope changed or authority was revoked meanwhile, the received tracks are stopped at once. 4) On leaving, a server-path drop or a room change, all tracks stop and the message history is cleared.",
      ),
      t(
        "대안은 입장하자마자 장치를 켜 두는 방식(편하지만 의도치 않은 송출 위험)이나 서버에 기록을 남기는 방식입니다. ToonStudio는 '동의 → 최소 기능 → 명시적 켜기'를 택했고, 대화 기록은 최대 150개를 브라우저 메모리에만 두며 서버 저장·녹화·자동 전사는 없습니다. 상대방의 화면 녹화나 캡처는 막을 수 없고 P2P라 상대에게 네트워크 주소가 보일 수 있다는 점을 참여 안내에서 먼저 밝힙니다.",
        "Alternatives are turning devices on at entry (convenient but risks unintended broadcast) or keeping records on a server. ToonStudio chose consent, then minimal features, then explicit turn-on: chat history keeps at most 150 messages only in browser memory, with no server storage, recording or automatic transcription. The join notice states up front that a peer's own screen recording cannot be prevented and that, being P2P, peers may see your network address.",
      ),
      t(
        "브라우저 정책도 한 겹입니다. 사이트 응답 헤더(Permissions-Policy)는 카메라·마이크를 같은 출처(self)에만 허용합니다. 과거에 microphone=()으로 막아 사용자가 허용해도 음성이 잡히지 않은 일이 문서에 기록돼 있어 바로잡았습니다. 아직 없는 것도 있습니다. 연결 품질 측정(getStats), 비트레이트·코덱 제어, 마이크·스피커 선택 화면은 운영 코드에 없고 연결 상태만 '직접 연결/연결 실패'로 보여 줍니다.",
        "A browser policy is one more layer. The site's Permissions-Policy response header allows the camera and microphone only for the same origin (self). The documentation records an earlier case where microphone=() blocked audio even after users allowed it, since corrected. Some things do not exist yet: connection-quality measurement (getStats), bitrate or codec control, and a microphone or speaker picker are absent from production code, and the connection state is shown only as direct or failed.",
      ),
    ],
    keyPoints: [
      t("참여는 글자 채팅만 시작하고 장치는 버튼을 눌러야 요청합니다", "Joining starts text chat only; devices are requested on a button press"),
      t("늦게 온 권한 응답은 범위·권한을 다시 확인하고 맞지 않으면 폐기", "A late permission answer is rechecked and discarded if stale"),
      t("대화 기록은 메모리 150개까지, 나가면 지우고 서버 저장은 없음", "Chat is kept in memory up to 150 messages, cleared on exit, never stored"),
      t("품질 측정·코덱 제어·장치 선택 화면은 아직 없습니다", "Quality stats, codec control and a device picker do not exist yet"),
    ],
    diagram: {
      id: "media-permissions-policy-diagram",
      kind: "graph",
      title: t("장치가 켜지기까지의 관문", "The gates before a device turns on"),
      caption: t(
        "참여에서 장치 요청까지는 사용자가 직접 지나는 관문이고, 응답이 늦거나 무효면 트랙을 즉시 멈춥니다.",
        "The user passes each gate from joining to a device request, and a late or invalid answer stops the tracks at once.",
      ),
      alt: t(
        "참여 동의 뒤에는 채팅만 시작하고, 사용자가 장치 버튼을 누르면 브라우저 권한 창이 뜹니다. 허용하면 응답이 도착했을 때 통화의 세대와 권한, 대화 범위를 다시 확인하고, 유효하면 트랙을 연결하고 무효면 즉시 멈춥니다. 거절하면 오류 안내만 보이고 장치는 켜지지 않으며, 나가거나 서버 경로가 끊기면 트랙을 멈추고 기록을 지웁니다.",
        "After consent to join only chat starts, and a click on a device button opens the browser permission prompt. If allowed, when the answer arrives the call generation, authority and conversation scope are rechecked: a valid answer attaches the track and an invalid one stops it at once. If denied, only an error message appears and no device turns on; leaving or a server-path drop stops tracks and clears the history.",
      ),
      nodes: [
        { id: "join", label: t("참여 동의", "Consent to join"), sub: t("채팅만 시작 · 장치 요청 없음", "Chat only, no device request"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "click", label: t("장치 버튼 클릭", "Press a device button"), sub: t("마이크 · 카메라 · 화면", "Mic, camera or screen"), tone: "local", at: [1, 0] },
        { id: "prompt", label: t("브라우저 권한 창", "Browser prompt"), sub: t("사용자가 허용 또는 거절", "User allows or denies"), tone: "warn", at: [2, 0] },
        { id: "check", label: t("응답 때 재확인", "Recheck on answer"), sub: t("세대·권한·범위", "Still valid?"), tone: "local", shape: "diamond", at: [3, 0] },
        { id: "attach", label: t("트랙 연결", "Attach the track"), sub: t("replaceTrack · 재협상 없음", "replaceTrack, no renegotiation"), tone: "good", at: [4, 0] },
        { id: "denied", label: t("오류 안내만 표시", "Show an error only"), sub: t("장치는 켜지지 않음", "No device turns on"), tone: "neutral", at: [2, 1] },
        { id: "drop", label: t("트랙 즉시 중지", "Stop tracks now"), sub: t("늦은 응답은 폐기", "Stale answers discarded"), tone: "warn", at: [3, 1] },
        { id: "end", label: t("나가기 · 연결 끊김", "Leave or disconnect"), sub: t("트랙 중지 · 기록 삭제", "Stop tracks, clear history"), tone: "local", shape: "pill", at: [4, 1] },
      ],
      edges: [
        { from: "join", to: "click", label: t("직접 누름", "On click") },
        { from: "click", to: "prompt" },
        { from: "prompt", to: "check", label: t("허용", "Allow") },
        { from: "check", to: "attach", label: t("유효", "Valid") },
        { from: "prompt", to: "denied", label: t("거절", "Deny") },
        { from: "check", to: "drop", label: t("무효", "Stale") },
        { from: "attach", to: "end", label: t("종료", "Exit") },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · P2P 채팅·통화(허들)", "Shared workroom · P2P chat and calls (huddle)"),
        role: t(
          "참여는 채팅만 시작하고, 마이크·카메라·화면 버튼을 누를 때만 장치를 요청합니다. 응답이 늦게 오면 통화 세대와 권한 번호를 다시 확인해 맞지 않으면 트랙을 멈춥니다.",
          "Joining starts chat only and devices are requested only when the mic, camera or screen button is pressed. A late answer is rechecked against the call generation and authority revision, and tracks are stopped if they no longer match.",
        ),
        paths: [`${HUDDLE}/studio-p2p-huddle-controller.ts#acceptCapture`, `${HUDDLE}/StudioP2pHuddleLauncher.tsx#capture`],
        route: "/studio",
      },
      {
        feature: t("가상 스튜디오 · 가까이 가면 영상", "Virtual studio · video when you come close"),
        role: t(
          "동의 카드에서 카메라+마이크, 카메라만, 마이크만, 나중에 중 하나를 고르게 하고 버튼을 누를 때만 장치를 켭니다. 권한 상태는 창을 띄우지 않고 조회합니다.",
          "A consent card offers camera and mic, camera only, mic only or not now, and devices turn on only on a button press. Permission state is read without opening any prompt.",
        ),
        paths: [
          "apps/web/src/domains/creator/virtual-space/hud/SpaceProximityVideo.tsx#SpaceProximityConsent",
          "apps/web/src/domains/creator/virtual-space/studio-virtual-space-rtc-diagnostics.ts",
        ],
        route: "/studio/space",
      },
      {
        feature: t("사이트 보안 헤더", "Site security headers"),
        role: t(
          "Permissions-Policy로 카메라·마이크를 같은 출처에만 허용하고 위치 정보와 교차 출처 격리 권한을 따로 정합니다.",
          "Permissions-Policy allows the camera and microphone only for the same origin and sets geolocation and cross-origin-isolated separately.",
        ),
        paths: ["config/http-response-headers.json"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("늦게 온 권한 응답을 폐기하는 마이크 요청", "A microphone request that discards a late answer"),
        language: "ts",
        code: `export type MicResult = MediaStream | "stale" | "denied" | "no-device" | "busy" | "error";

// 버튼을 눌렀을 때만 호출한다. isCurrent() 는 '아직 이 통화가 유효한가'를 알려 준다.
export async function askMic(isCurrent: () => boolean): Promise<MicResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (!isCurrent()) {
      stream.getTracks().forEach((track) => track.stop()); // 늦은 권한 응답은 즉시 폐기
      return "stale";
    }
    return stream;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError") return "denied";
    if (name === "NotFoundError") return "no-device";
    return name === "NotReadableError" ? "busy" : "error";
  }
}

// 권한 창을 띄우지 않고 상태만 읽는다.
export const micPermission = (): Promise<string> =>
  navigator.permissions.query({ name: "microphone" as PermissionName }).then((r) => r.state, () => "unknown");`,
        codeEn: `export type MicResult = MediaStream | "stale" | "denied" | "no-device" | "busy" | "error";

// Call only when the button is pressed. isCurrent() says whether this call is still valid.
export async function askMic(isCurrent: () => boolean): Promise<MicResult> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    if (!isCurrent()) {
      stream.getTracks().forEach((track) => track.stop()); // discard a late permission answer at once
      return "stale";
    }
    return stream;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "NotAllowedError") return "denied";
    if (name === "NotFoundError") return "no-device";
    return name === "NotReadableError" ? "busy" : "error";
  }
}

// Read the state without opening any permission prompt.
export const micPermission = (): Promise<string> =>
  navigator.permissions.query({ name: "microphone" as PermissionName }).then((r) => r.state, () => "unknown");`,
        explain: t(
          "권한 창에서 사용자가 늦게 허용하면 그 사이 통화가 끝났을 수 있습니다. 응답이 도착한 시점에 다시 유효성을 확인하고, 무효면 얻은 트랙을 즉시 멈춰 카메라·마이크 표시등이 남지 않게 합니다. 서비스 코드는 통화 세대 번호와 권한 번호로 같은 일을 합니다.",
          "A user may click Allow late, after the call has ended. Validity is checked again when the answer arrives, and stale tracks are stopped at once so no camera or mic indicator stays on. The service code does the same with a call generation number and an authority revision.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("카메라·마이크를 같은 출처에만 허용하는 응답 헤더", "A response header allowing camera and mic only for the same origin"),
        language: "text",
        code: `# 사이트 응답 헤더 (config/http-response-headers.json)
Permissions-Policy: camera=(self), microphone=(self), geolocation=(), cross-origin-isolated=(self)
# (self) = 같은 출처만 허용, () = 모두 금지`,
        codeEn: `# Site response header (config/http-response-headers.json)
Permissions-Policy: camera=(self), microphone=(self), geolocation=(), cross-origin-isolated=(self)
# (self) = same origin only, () = nobody`,
        explain: t(
          "헤더는 브라우저 권한 창과 별개의 첫 관문입니다. 예전에 microphone=()으로 두었을 때는 사용자가 허용해도 음성 캡처 자체가 막혔습니다.",
          "The header is a separate first gate in front of the browser prompt. When it once said microphone=(), voice capture was blocked even after users allowed it.",
        ),
        source: "config/http-response-headers.json",
        verify: "none",
      },
    ],
    links: [
      { title: "MDN · MediaDevices.getUserMedia()", url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia", kind: "docs" },
      { title: "MDN · Permissions-Policy header", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy", kind: "docs" },
      { title: "MDN · Permissions API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Permissions_API", kind: "docs", note: t("창을 띄우지 않고 상태만 조회", "Read state without showing a prompt") },
      { title: "W3C · Media Capture and Streams", url: "https://www.w3.org/TR/mediacapture-streams/", kind: "spec" },
    ],
    chapterIds: ["webrtc-media-authority", "virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "카메라와 마이크는 가장 민감한 권한이라 ToonStudio는 '참여'와 '켜기'를 분리했습니다. 참여하면 글자 채팅만 시작하고, 마이크·카메라·화면 공유는 각 버튼을 누를 때만 브라우저 권한을 요청합니다. 권한 창에서 늦게 허용해도 그 사이 통화를 떠났다면 받은 장치는 즉시 꺼집니다. 대화 기록은 브라우저 메모리에만 두고 나가면 지웁니다.",
        "The camera and microphone are the most sensitive permissions, so ToonStudio separates joining from turning on. Joining starts text chat only, and the mic, camera and screen sharing ask the browser for permission only when each button is pressed. If someone allows late after leaving the call, the received device is switched off at once. Chat records live only in browser memory and are cleared on exit.",
      ),
      analogy: t(
        "초인종이 울렸다고 현관문을 자동으로 열지 않고 집주인이 확인한 뒤 직접 엽니다. 손님이 이미 돌아갔다면 뒤늦게 열려던 문은 바로 잠급니다.",
        "A front door does not open on its own when the bell rings; the owner checks and opens it. If the visitor has already left, the door that was about to open is locked again straight away.",
      ),
      questions: [
        {
          question: t("서버에 대화나 영상이 저장되나요?", "Are chats or video stored on a server?"),
          answer: t(
            "허들 대화는 서버에 저장하지 않고 브라우저 메모리에 최대 150개만 둡니다. 영상·음성은 직접 연결로 흐르고 녹화 기능이 없습니다. 다만 상대방의 화면 녹화나 캡처는 막지 못합니다.",
            "Huddle chat is not stored on a server; the browser keeps at most 150 messages in memory. Voice and video flow over direct connections and there is no recording feature. A peer's own screen recording or capture cannot be prevented, though.",
          ),
        },
        {
          question: t("연결 품질 측정이나 장치 선택은 있나요?", "Is there connection-quality measurement or a device picker?"),
          answer: t(
            "아직 없습니다. 운영 코드에는 연결 통계(getStats), 비트레이트·코덱 제어, 마이크·스피커 선택 화면이 없고, 상태는 '직접 연결/연결 실패'로만 보여 줍니다.",
            "Not yet. Production code has no connection statistics (getStats), bitrate or codec control, or microphone and speaker picker, and the state shows only as direct or failed.",
          ),
        },
        {
          question: t("상대방이 내 카메라를 켤 수 있나요?", "Can a peer turn on my camera?"),
          answer: t(
            "아니요. 장치 켜기는 내 브라우저의 버튼과 권한 창에서만 일어나고, 상대는 켜짐·꺼짐 같은 상태 신호만 받습니다.",
            "No. Turning a device on happens only through my own browser's button and prompt; peers receive only status signals such as on or off.",
          ),
        },
      ],
      pitfall: t(
        "'도청이 불가능하다' 같은 표현은 쓰지 마세요. 상대방 쪽 녹화·캡처는 막지 못하고, P2P 특성상 네트워크 주소가 상대에게 보일 수 있습니다. 화면 안내 문구 '유료 중계 서버는 쓰지 않아요'는 TURN 키를 등록하면 사실과 어긋납니다(ICE 카드 참조). 전·후면 카메라 전환과 인앱 브라우저는 실기기로 검증하지 않았습니다.",
        "Do not claim eavesdropping is impossible: a peer's own recording cannot be prevented and, being P2P, peers may see your network address. The on-screen sentence 'no paid relay server is used' would stop being true once a TURN key is registered (see the ICE card). Front and rear camera switching and in-app browsers were not verified on real devices.",
      ),
    },
    technologies: ["getUserMedia", "getDisplayMedia", "Permissions-Policy", "Permissions API", "WebRTC"],
    facts: [
      { value: "150", label: t("메모리에 두는 대화 메시지 상한", "Chat messages kept in memory"), source: `${HUDDLE}/studio-p2p-huddle-protocol.ts` },
      { value: "2,000", label: t("메시지 한 건의 글자 수 상한", "Maximum characters per message"), source: `${HUDDLE}/studio-p2p-huddle-protocol.ts` },
      { value: "640×360 @15fps", label: t("카메라 요청 이상값(최대 1280×720 @24fps)", "Ideal camera request (max 1280x720 at 24 fps)"), source: `${HUDDLE}/studio-p2p-huddle-controller.ts` },
    ],
    reviewedAt: "2026-10-07",
  },
];
