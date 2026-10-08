import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · realtime 카테고리 중 WebRTC 연결 협상 카드(완벽한 협상 패턴).
 * 주 파일(engineering-atlas-realtime.ts)이 다른 묶음과 함께 배열에 합친다.
 * 모든 값은 2026-10-07 기준으로 허들 컨트롤러 코드와 테스트를 직접 열어 확인했다.
 */
const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const LIVE = "apps/web/src/domains/creator/live";
const HUDDLE = `${LIVE}/huddle`;

export const ENGINEERING_ATLAS_REALTIME_NEGOTIATION: readonly EngineeringAtlasEntry[] = [
  {
    id: "webrtc-perfect-negotiation",
    category: "realtime",
    name: "Perfect negotiation",
    title: t("동시에 전화를 걸어도 한쪽이 양보하는 WebRTC 협상", "WebRTC negotiation where one side yields when both call at once"),
    status: "experimental",
    tagline: t(
      "양쪽이 동시에 연결을 제안해도 sessionId 비교만으로 한쪽이 양보해 서버 중재 없이 풉니다.",
      "When both sides propose a connection at once, comparing session IDs makes one yield, with no server arbitration.",
    ),
    background: [
      t(
        "WebRTC로 두 브라우저가 연결하려면 한쪽이 '나는 이런 소리와 영상을 보낼 수 있다'는 제안서(오퍼)를 보내고, 상대가 답안(앤서)으로 응답해야 합니다. 문제는 두 사람이 거의 동시에 제안서를 보내는 경우입니다. 서로 동시에 전화를 걸면 둘 다 통화 중 신호만 듣는 것과 같아서, 아무 규칙이 없으면 연결이 멈춥니다. 그래서 '번호가 큰 사람이 끊고 받는다'처럼 미리 정해 둔 규칙으로 충돌을 푸는 방식이 필요합니다.",
        "To connect two browsers over WebRTC, one side sends a proposal (an offer) saying what sound and video it can send, and the other replies with an answer. The trouble comes when both send a proposal at nearly the same time. It is like two people dialing each other at once and both hearing a busy tone: with no rule, the connection stalls. So a rule agreed in advance is needed, such as 'the person with the larger number hangs up and answers'.",
      ),
      t(
        "ToonStudio 허들은 상대마다 연결 하나를 만들고 오디오·비디오 송수신 칸을 미리 둡니다. 브라우저가 협상이 필요하다고 알리면(negotiationneeded) 오퍼를 만들어 직통 레인으로 보냅니다. 오퍼를 받았는데 내 오퍼가 진행 중이면 충돌입니다. 두 쪽의 sessionId를 비교해 작은 쪽은 상대 오퍼를 무시하고, 큰 쪽은 자기 오퍼를 포기하고 상대 것을 받아 답합니다. 같은 두 값으로 비교하니 서버 없이도 양쪽이 같은 결론에 이릅니다.",
        "ToonStudio's huddle creates one connection per peer with audio and video send/receive slots ready. When the browser signals that negotiation is needed (negotiationneeded), it creates an offer and sends it over the direct lane. Receiving an offer while one's own is in progress is a collision. By comparing the two session IDs, the smaller side ignores the other's offer and the larger side gives up its own, accepts the other's and answers. Because both compare the same two values, they reach the same conclusion without any server.",
      ),
      t(
        "세부 규칙도 있습니다. 링크마다 신호를 한 줄로 세워 한 번에 하나씩 처리하고, 상대 설명이 오기 전에 도착한 ICE 후보는 최대 64개까지 보관했다가 적용하며, 무시한 오퍼에 딸린 후보는 버립니다. 통화 허용 범위 밖에서 온 신호는 최대 96개까지 보류하고, 상대가 다시 들어오면 바뀌는 epoch 값으로 옛 세션의 신호를 걸러냅니다. 연결이 failed나 disconnected가 되면 4초 이상 간격으로 최대 3번 ICE를 재시작합니다.",
        "There are detailed rules too. Signals are queued per link and handled one at a time; ICE candidates that arrive before the peer's description are kept, up to 64, and applied afterwards, while candidates tied to an ignored offer are dropped. Signals from outside the allowed call scope are held, up to 96, and signals from an older session are filtered out by an epoch value that changes when the peer rejoins. When a connection becomes failed or disconnected, ICE is restarted up to 3 times, at least 4 seconds apart.",
      ),
      t(
        "대안은 '나중에 들어온 사람이 항상 오퍼를 낸다' 같은 고정 역할인데, 조정이 필요하고 통화 도중 카메라·화면 공유를 더해 다시 협상할 때 쉽게 어긋납니다. 이 방식은 W3C 명세와 MDN이 소개하는 패턴과 같은 구조로, 양쪽이 같은 코드를 실행합니다. 한계도 있습니다. 코드 주석이 설명하는 예외 규칙(상대 링크가 늦게 생긴 경우 같은 오퍼를 다시 보냄)을 검증한 단위 테스트는 가짜 연결을 쓴 1건뿐이고, 브라우저 두 개가 동시에 오퍼를 내는 충돌 시험은 확인하지 못했습니다.",
        "An alternative is fixed roles, such as 'whoever joins later always makes the offer', but it needs coordination and easily breaks when a camera or screen share is added mid-call and negotiation happens again. This approach has the same structure as the pattern shown in the W3C specification and MDN, with both sides running the same code. It has limits too. The only unit test for the exception rule explained in a code comment (re-sending the same offer when the peer's link was created late) uses a fake connection, and a collision test with two real browsers offering at once was not found.",
      ),
    ],
    keyPoints: [
      t("동시에 제안해도 sessionId 비교로 한쪽이 양보합니다", "Even when both propose, comparing session IDs makes one side yield"),
      t("양쪽이 같은 코드를 실행하며 서버의 중재가 필요 없습니다", "Both sides run the same code; no server arbitration is needed"),
      t("신호는 링크마다 한 줄로 처리하고 ICE 후보는 64개까지 보관합니다", "Signals run one at a time per link; up to 64 ICE candidates wait"),
      t("끊기면 4초 이상 간격으로 최대 3번 ICE를 재시작합니다", "On failure, ICE restarts up to 3 times, 4 seconds apart"),
    ],
    diagram: {
      id: "webrtc-perfect-negotiation-diagram",
      kind: "sequence",
      title: t("두 참가자가 동시에 오퍼를 낼 때", "When both peers make an offer at once"),
      caption: t(
        "작은 sessionId 쪽이 상대 오퍼를 무시하고, 큰 쪽이 자기 오퍼를 되돌린 채 앤서를 보내 충돌이 풀립니다.",
        "The side with the smaller session ID ignores the other's offer, and the larger side rolls back its own and sends an answer, resolving the collision.",
      ),
      alt: t(
        "참가자 A와 B가 같은 순간 오퍼를 만들어 서로 보냅니다. sessionId가 작은 A는 충돌을 감지하고 B의 오퍼를 무시합니다. 큰 B는 충돌을 감지하고 양보해 A의 오퍼를 받아들이며 자기 오퍼는 자동으로 되돌려지고 앤서를 보냅니다. A가 앤서를 적용하면 협상이 끝나고 두 쪽은 ICE 후보를 주고받으며, 연결이 끊기면 A가 ICE를 재시작합니다.",
        "Peers A and B make offers at the same moment and send them to each other. A, with the smaller session ID, detects the collision and ignores B's offer. B, with the larger ID, detects it, yields and accepts A's offer, its own offer is rolled back automatically, and it sends an answer. When A applies the answer, negotiation is done and the two exchange ICE candidates; if the connection drops, A restarts ICE.",
      ),
      actors: [
        { id: "a", label: t("참가자 A", "Peer A"), sub: t("작은 sessionId · 양보 안 함", "Smaller ID, does not yield"), tone: "local" },
        { id: "b", label: t("참가자 B", "Peer B"), sub: t("큰 sessionId · 양보함", "Larger ID, yields"), tone: "local" },
      ],
      messages: [
        { from: "a", to: "a", label: t("오퍼 만들기 시작", "Start making an offer"), note: t("makingOffer = true", "makingOffer = true") },
        { from: "b", to: "b", label: t("B도 같은 순간 시작", "B starts at the same moment"), note: t("서로 상대 오퍼를 아직 모름", "Neither has seen the other's offer") },
        { from: "a", to: "b", label: t("A의 오퍼(SDP) 전송", "A sends its offer (SDP)") },
        { from: "b", to: "a", label: t("B의 오퍼(SDP) 전송", "B sends its offer (SDP)") },
        { from: "a", to: "a", label: t("충돌 → B의 오퍼 무시", "Collision: ignore B's offer"), note: t("ignoreOffer = 작은 ID && 충돌", "ignoreOffer = smaller ID && collision") },
        { from: "b", to: "b", label: t("충돌 → 양보하고 수락", "Collision: yield and accept"), note: t("setRemoteDescription이 내 오퍼를 되돌림", "setRemoteDescription rolls my offer back") },
        { from: "b", to: "a", label: t("B의 앤서(SDP) 전송", "B sends its answer (SDP)"), style: "dashed" },
        { from: "a", to: "a", label: t("앤서 적용 → stable", "Apply the answer: stable"), note: t("이후 변경은 새 협상", "Later changes renegotiate") },
        { from: "a", to: "b", label: t("ICE 후보 전달", "Pass ICE candidates"), style: "dashed", note: t("설명 전 도착분은 최대 64개 보관", "Early ones wait, up to 64") },
        { from: "b", to: "a", label: t("ICE 후보 전달", "Pass ICE candidates"), style: "dashed" },
        { from: "a", to: "a", label: t("끊기면 ICE 재시작", "On failure, restart ICE"), note: t("4초 이상 간격 · 최대 3번", "At least 4 s apart, up to 3 times") },
      ],
    },
    usage: [
      {
        feature: t("허들 통화 · 연결 협상", "Huddle calls · connection negotiation"),
        role: t(
          "상대마다 오디오·비디오 송수신 칸이 있는 연결을 만들고 negotiationneeded에서 오퍼를 보냅니다. 충돌하면 sessionId가 작은 쪽이 상대 오퍼를 버리고, 큰 쪽이 자기 오퍼를 되돌리며 앤서합니다.",
          "Creates a connection per peer with audio and video send/receive slots and sends an offer on negotiationneeded. On a collision the side with the smaller sessionId drops the other's offer, and the larger side lets its own offer be rolled back and answers.",
        ),
        paths: [`${HUDDLE}/studio-p2p-huddle-controller.ts#ensureLink`, `${HUDDLE}/studio-p2p-huddle-controller.ts#enqueueSignal`],
      },
      {
        feature: t("허들 통화 · 신호 대기열과 보류", "Huddle calls · signal queue and holding"),
        role: t(
          "링크마다 신호를 한 줄로 처리하고, 원격 설명 전에 온 ICE 후보를 최대 64개 보관합니다. 통화 허용 범위 밖의 신호는 최대 96개까지 보류했다가 범위가 열리면 흘려 보냅니다.",
          "Handles signals one at a time per link and keeps up to 64 ICE candidates that arrive before the remote description. Signals from outside the allowed call scope are held, up to 96, and released when the scope opens.",
        ),
        paths: [`${HUDDLE}/studio-p2p-huddle-controller.ts#deferSignal`, `${HUDDLE}/studio-p2p-huddle-controller.ts#flushDeferredSignals`],
      },
      {
        feature: t("허들 통화 · 끊김 복구", "Huddle calls · recovering from drops"),
        role: t(
          "연결이 failed나 disconnected가 되면 4초 이상 간격으로 최대 3번 ICE를 재시작하고, 연결되면 횟수를 처음부터 셉니다. 3번을 넘기면 안내 문구를 띄웁니다.",
          "When a connection becomes failed or disconnected, restarts ICE up to 3 times at least 4 seconds apart and counts from zero again once connected. After the third failure it shows a notice.",
        ),
        paths: [`${HUDDLE}/studio-p2p-huddle-controller.ts#restartLinkIce`],
      },
      {
        feature: t("허들 통화 · 신호 형식과 검증", "Huddle calls · signal format and validation"),
        role: t(
          "오퍼·앤서·ICE 후보를 epoch와 함께 JSON 패킷으로 직통 레인에 싣고, 받을 때 크기(SDP 32,000자, 후보 4,096자)와 형식을 검사해 규격 밖 패킷을 버립니다.",
          "Carries offers, answers and ICE candidates with an epoch as JSON packets on the direct lane and, on receipt, checks size (SDP 32,000 characters, candidate 4,096) and shape, discarding out-of-spec packets.",
        ),
        paths: [`${HUDDLE}/studio-p2p-huddle-protocol.ts#parseHuddlePacket`],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("충돌을 푸는 핵심 규칙", "The core rule that resolves a collision"),
        language: "ts",
        code: `// 두 참가자가 같은 두 값을 비교하므로 서버 없이도 서로 반대 역할을 갖는다.
export const isPolite = (selfSessionId: string, peerSessionId: string): boolean => selfSessionId > peerSessionId;

interface NegotiationState {
  polite: boolean;
  makingOffer: boolean; // onnegotiationneeded 에서 오퍼를 만드는 동안 true
}

// 받은 설명을 어떻게 다룰지 정하는 핵심 규칙 (MDN·W3C 의 '완벽한 협상' 패턴을 줄인 것)
export async function handleDescription(
  pc: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
  state: NegotiationState,
): Promise<"ignored" | "applied"> {
  const collision = description.type === "offer" && (state.makingOffer || pc.signalingState !== "stable");
  if (!state.polite && collision) return "ignored"; // 양보하지 않는 쪽은 충돌한 오퍼를 버린다
  await pc.setRemoteDescription(description); // 양보하는 쪽은 자기 오퍼가 자동으로 되돌려진다
  if (description.type === "offer") await pc.setLocalDescription(); // 브라우저가 앤서를 만든다
  return "applied";
}`,
        codeEn: `// Both peers compare the same two values, so they get opposite roles without any server.
export const isPolite = (selfSessionId: string, peerSessionId: string): boolean => selfSessionId > peerSessionId;

interface NegotiationState {
  polite: boolean;
  makingOffer: boolean; // true while an offer is being made in onnegotiationneeded
}

// The core rule for handling a received description (a trimmed 'perfect negotiation' pattern from MDN and W3C)
export async function handleDescription(
  pc: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
  state: NegotiationState,
): Promise<"ignored" | "applied"> {
  const collision = description.type === "offer" && (state.makingOffer || pc.signalingState !== "stable");
  if (!state.polite && collision) return "ignored"; // the side that does not yield drops the colliding offer
  await pc.setRemoteDescription(description); // the yielding side's own offer is rolled back automatically
  if (description.type === "offer") await pc.setLocalDescription(); // the browser creates the answer
  return "applied";
}`,
        explain: t(
          "충돌은 '내가 오퍼를 만드는 중이거나 아직 안정 상태가 아닐 때 상대 오퍼가 온 것'입니다. 실제 코드는 여기에 앤서를 적용하는 중에는 충돌로 보지 않는 플래그(settingAnswer), ICE 후보 대기열, 링크별 직렬 대기열을 더해 오탐과 순서 뒤섞임을 막습니다.",
          "A collision is 'the other's offer arriving while I am making an offer or am not yet in the stable state'. The real code adds a flag (settingAnswer) so applying an answer is not seen as a collision, an ICE candidate queue, and a per-link serial queue, to avoid false positives and reordering.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("끊김 복구: ICE 재시작을 제한된 횟수로", "Recovering from drops: ICE restarts with a bounded count"),
        language: "ts",
        code: `export function createIceRestarter(pc: RTCPeerConnection, now: () => number = Date.now) {
  let attempts = 0;
  let lastAt = 0;

  const restart = (): boolean => {
    if (now() - lastAt < 4_000) return false; // 너무 자주 다시 시도하지 않는다
    if (attempts >= 3) return false; // 세 번 실패하면 사용자에게 안내하고 멈춘다
    attempts += 1;
    lastAt = now();
    pc.restartIce(); // 새 ICE 자격으로 후보를 다시 모으고 negotiationneeded 가 발생한다
    return true;
  };

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "connected") {
      attempts = 0; // 연결되면 처음부터 다시 센다
      lastAt = 0;
    } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      restart();
    }
  });
  return restart;
}`,
        codeEn: `export function createIceRestarter(pc: RTCPeerConnection, now: () => number = Date.now) {
  let attempts = 0;
  let lastAt = 0;

  const restart = (): boolean => {
    if (now() - lastAt < 4_000) return false; // do not retry too often
    if (attempts >= 3) return false; // after three failures, tell the user and stop
    attempts += 1;
    lastAt = now();
    pc.restartIce(); // gather candidates again with fresh ICE credentials; negotiationneeded fires
    return true;
  };

  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "connected") {
      attempts = 0; // once connected, count from zero again
      lastAt = 0;
    } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      restart();
    }
  });
  return restart;
}`,
        explain: t(
          "restartIce()는 새 ICE 자격으로 후보를 다시 모으게 하고 곧바로 협상을 다시 일으킵니다. 실제 코드는 restartIce가 없는 브라우저에서는 createOffer({ iceRestart: true })로 대신하고, 3초마다 도는 상태 점검에서도 같은 함수를 부릅니다.",
          "restartIce() makes the connection gather candidates again with fresh ICE credentials and triggers negotiation again right away. The real code falls back to createOffer({ iceRestart: true }) in browsers without restartIce, and also calls the same function from its 3-second state check.",
        ),
        source: `${HUDDLE}/studio-p2p-huddle-controller.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · Perfect negotiation", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation", kind: "guide", note: t("polite·impolite 역할과 충돌 처리", "Polite and impolite roles and handling collisions") },
      { title: "W3C · WebRTC 1.0 · Perfect Negotiation Example", url: "https://www.w3.org/TR/webrtc/#perfect-negotiation-example", kind: "spec" },
      { title: "IETF RFC 9429 · JSEP", url: "https://www.rfc-editor.org/rfc/rfc9429", kind: "spec", note: t("오퍼·앤서·롤백의 기본 규칙", "Base rules for offer, answer and rollback") },
      { title: "MDN · negotiationneeded event", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/negotiationneeded_event", kind: "docs" },
      { title: "MDN · RTCPeerConnection.restartIce()", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce", kind: "docs" },
      { title: "Mozilla WebRTC blog · Perfect Negotiation in WebRTC", url: "https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/", kind: "article", note: t("패턴이 만들어진 이유", "Why the pattern was devised") },
    ],
    chapterIds: ["webrtc-media-authority"],
    talk: {
      pitch: t(
        "두 사람이 동시에 전화를 걸면 둘 다 통화 중 신호만 듣습니다. WebRTC 연결 협상에서도 같은 일이 생기는데, ToonStudio는 두 참가자의 sessionId를 비교해 한쪽은 양보하고 한쪽은 양보하지 않는 규칙을 양쪽 코드에 똑같이 넣어 서버 중재 없이 풉니다. 신호는 링크마다 한 줄로 처리하고, 끊기면 제한된 횟수로 다시 잡습니다. 다만 실제 브라우저 두 개가 동시에 오퍼를 내는 충돌 시험은 확인하지 못했습니다.",
        "When two people dial each other at once, both hear a busy tone. The same happens in WebRTC negotiation, and ToonStudio resolves it without server arbitration by putting the same rule in both sides' code: comparing the two session IDs, one yields and one does not. Signals are handled one at a time per link, and a dropped connection is retried a bounded number of times. A collision test with two real browsers offering at once has not been found, though.",
      ),
      analogy: t(
        "두 사람이 동시에 전화를 걸었을 때 '번호가 큰 사람이 끊고 받기'로 미리 정해 둔 것과 같습니다. 정해 준 사람이 없어도 서로의 번호만 비교하면 같은 답이 나옵니다.",
        "It is like agreeing in advance that when two people call each other at once, the one with the larger number hangs up and answers. No one has to decide for them: comparing the two numbers gives both the same answer.",
      ),
      questions: [
        {
          question: t("왜 서버가 정해 주지 않나요?", "Why does a server not decide?"),
          answer: t(
            "이 신호는 서버를 거치지 않는 직통 레인으로 오갑니다. 두 쪽이 서로의 sessionId를 이미 알고 있어, 같은 비교를 각자 해도 결과가 같습니다.",
            "These signals travel on the direct lane, not through a server. Both sides already know each other's sessionId, so each making the same comparison gives the same result.",
          ),
        },
        {
          question: t("누가 양보하나요?", "Who yields?"),
          answer: t(
            "sessionId가 큰 쪽이 양보합니다. 어느 쪽이 더 낫다는 뜻은 아니고 둘을 가르는 임의의 기준일 뿐입니다.",
            "The side with the larger sessionId yields. It does not mean either side is better; it is just an arbitrary tiebreaker.",
          ),
        },
        {
          question: t("연결이 끊기면 어떻게 되나요?", "What happens when the connection drops?"),
          answer: t(
            "4초 이상 간격으로 최대 3번 ICE를 재시작합니다. 그래도 안 되면 안내 문구를 띄웁니다. TURN 중계가 등록되지 않은 환경에서는 제한된 네트워크에서 실패할 수 있습니다(ICE 카드 참조).",
            "It restarts ICE up to 3 times, at least 4 seconds apart. If that still fails, a notice appears. Where no TURN relay is registered, it can fail on restrictive networks (see the ICE card).",
          ),
        },
      ],
      pitfall: t(
        "'완벽한'이라는 이름은 패턴 이름일 뿐 항상 성공한다는 뜻이 아닙니다. 이 저장소의 시험은 가짜 연결을 쓴 재전송 규칙 1건이고, 실제 브라우저 두 개가 동시에 오퍼를 내는 충돌 시험은 확인하지 못했습니다. 신호 처리에 실패하면 자동 복구 없이 '나간 뒤 재참여' 안내를 띄웁니다. 3번 실패 뒤 안내 문구는 '중계(TURN) 서버가 준비되지 않은 환경에서는 직접 연결만 시도합니다'로 조건부로 고쳐, ICE 캐시가 TURN을 받는 구성과 맞춰 두었습니다. 실험으로 표시한 이유: 코드는 제품 경로에 연결돼 있지만(허들 런처가 기본으로 마운트됨) 실기기·NAT 환경별 검증이 끝나지 않았기 때문입니다.",
        "Do not treat the word 'perfect' as meaning it always succeeds; it is only the pattern's name. The tests in this repository are one re-send rule with a fake connection, and a collision test with two real browsers offering at once was not found. When signal handling fails there is no automatic recovery, only a notice to leave and rejoin. The notice after three failures now reads conditionally (where no relay (TURN) server is set up, only direct links are tried), matching a setup where the ICE cache receives TURN servers. Why it is marked experimental: the code is wired into the product path (the huddle launcher mounts by default), but real-device and per-NAT verification is not finished.",
      ),
    },
    technologies: ["RTCPeerConnection", "JSEP (RFC 9429)", "SDP", "ICE restart", "perfect negotiation"],
    facts: [
      { value: "64", label: t("원격 설명 전에 보관하는 ICE 후보 상한", "ICE candidates kept before the remote description"), source: `${HUDDLE}/studio-p2p-huddle-controller.ts` },
      { value: "96", label: t("링크당 처리 대기·보류 신호 상한", "Queued or held signals per link"), source: `${HUDDLE}/studio-p2p-huddle-controller.ts` },
      { value: "3", label: t("ICE 재시작 최대 횟수", "Maximum ICE restarts"), source: `${HUDDLE}/studio-p2p-huddle-controller.ts` },
      { value: "4 s", label: t("ICE 재시작 사이 최소 간격", "Minimum gap between ICE restarts"), source: `${HUDDLE}/studio-p2p-huddle-controller.ts` },
    ],
    reviewedAt: "2026-10-07",
  },
];
