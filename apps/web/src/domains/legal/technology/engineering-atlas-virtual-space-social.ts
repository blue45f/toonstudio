import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 4: 프레즌스·보간 · 근접(구역) 판정 · 근접 영상 정원 · 채팅/리액션/NPC.
 * 3D 무대 제거(2026-10-21) 뒤 현행 웹 구현 기준으로 다시 썼다.
 * 경로·수치는 현행 코드에서 직접 확인한 값만 쓴다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const L = "apps/web/src/domains/creator/live";

export const VIRTUAL_SPACE_SOCIAL_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "presence-sync-peer-interpolation",
    category: "virtual-space",
    name: "Presence sync",
    title: t("프레즌스는 셸이 주고받고, 표본 재생 규칙은 셸 코드에 남았습니다", "The shell exchanges presence, and the sample-playback rules stay in shell code"),
    status: "live",
    tagline: t(
      "위치 패킷은 셸이 직접 연결과 릴레이로 주고받고, 무대 안 아바타 표시는 Phaser 캔버스가 맡습니다.",
      "The shell exchanges position packets directly or by relay, and the Phaser canvas draws the avatars on stage.",
    ),
    background: [
      t(
        "공간 클라이언트는 웹 캔버스(Phaser)가 맡고, 상대 아바타를 그리는 시각 계층도 웹 코드에 있습니다. 보내는 간격과 하트비트, 패킷 크기 상한, 순서 규칙은 프로토콜 모듈에 있고, 받은 위치 표본을 늦춰 재생하는 보간 타임라인도 셸 코드에 있습니다. 캔버스는 보간된 위치로 아바타를 그립니다.",
        "The space client is a web canvas (Phaser), and the visual layer that draws other avatars also lives in web code. The send interval, heartbeat, packet size cap and ordering rules live in the protocol module, and the interpolation timeline that replays received position samples late also stays in shell code. The canvas draws avatars at the interpolated positions.",
      ),
      t(
        "보내기: 90ms 틱마다 내 자세가 바뀌었는지 보고, 바뀌었거나 하트비트 시간이 되면 toonstudio-space-v1 패킷(1,024바이트 이하)을 보냅니다. 변화가 없어도 2.5초마다 생존 신호를 보냅니다. 패킷마다 단조 증가 시퀀스 번호를 붙이는데, 시계를 바닥값으로 삼고 sessionStorage에 저장해 새로고침 뒤에도 거꾸로 가지 않습니다. 받기: 보낸 사람별 마지막 번호보다 큰 패킷만 받고, 월드 범위(worldScope)가 다르면 버리며, 10초 동안 소식이 없으면 사라진 것으로 봅니다.",
        "Sending: every 90 ms tick it checks whether my pose changed, and if it did, or the heartbeat is due, it sends a toonstudio-space-v1 packet (at most 1,024 bytes). Even when nothing changes, a liveness signal goes out every 2.5 seconds. Each packet carries a monotonically increasing sequence number, seeded from the clock and kept in sessionStorage so it never runs backwards after a reload. Receiving: only packets with a number above the sender's last one are accepted, packets from a different world scope are dropped, and 10 seconds of silence means the peer is gone.",
      ),
      t(
        "받은 표본은 곧바로 쓰지 않습니다. 이쪽 도착 시각을 기준으로 100ms 과거를 재생하며 두 표본 사이를 이어 그립니다(양옆 표본이 있으면 Catmull-Rom 곡선, 아니면 직선). 소식이 끊기면 마지막 속도로 최대 250ms만 더 가다 멈추고, 260px 넘게 튀거나 1.5초 넘게 끊기면 보간 없이 그 자리로 옮깁니다. 상대 브라우저의 시계는 믿지 않습니다.",
        "Received samples are not used right away. Playback runs 100 ms in the past, by this side's arrival time, drawing between two samples (a Catmull-Rom curve when neighbours exist on both sides, otherwise a straight line). If updates stop, it carries on at the last speed for at most 250 ms and then halts, and a jump over 260 px or a gap over 1.5 s snaps straight to the new spot. The other browser's clock is never trusted.",
      ),
      t(
        "전송 경로는 직접 연결이 기본이고, 직접 연결이 성립하지 않은 상대에게는 소켓 릴레이로 폴백해 프레즌스 레인이 죽지 않게 합니다. ICE는 기본적으로 Cloudflare STUN 전용이라 기본 구성에는 TURN 중계가 없습니다. 위치처럼 짧고 잦은 정보를 서버에 쌓지 않으려는 선택이며, 대가로 상대가 늘면 직접 연결 수도 늘어 정원이 작습니다.",
        "The transport prefers direct connections, and for a peer whose direct connection cannot be established it falls back to a socket relay so the presence lane does not die. ICE is Cloudflare STUN only by default, so the default configuration has no TURN relay. This keeps short, frequent data like positions off a server, at the price that more people mean more direct connections and a small capacity.",
      ),
    ],
    keyPoints: [
      t("90ms 틱마다 변화만, 변화가 없어도 2.5초 하트비트", "Changes every 90 ms tick, plus a 2.5 s heartbeat"),
      t("단조 증가 시퀀스가 낡은 패킷을 걸러냅니다", "A monotonic sequence filters out stale packets"),
      t("받은 표본은 100ms 늦춰 재생하고 250ms까지만 외삽", "Samples replay 100 ms late, extrapolated at most 250 ms"),
    ],
    diagram: {
      id: "presence-sync-peer-interpolation-diagram",
      kind: "sequence",
      title: t("내 움직임이 상대에게 닿기까지", "How my movement reaches the other side"),
      caption: t(
        "변화만 보내고, 받는 쪽이 도착 시각 기준으로 늦춰서 표본 사이를 이어 씁니다.",
        "Only changes are sent, and the receiver replays samples late, by arrival time.",
      ),
      alt: t(
        "내 셸이 90ms 틱마다 자세가 바뀌었는지 보고 바뀌면 시퀀스 번호가 붙은 패킷을 직접 포트로 보냅니다. 직접 연결이 없는 상대에게는 소켓 릴레이로 갑니다. 상대 셸은 낡은 패킷과 다른 월드의 패킷을 버리고 표본을 보간 타임라인에 넣습니다. 타임라인은 100ms 과거를 재생해 두 점 사이를 이어 쓰고, 소식이 끊기면 최대 250ms만 연장합니다. 보간된 위치로 아바타를 그리는 일은 Phaser 캔버스가 맡습니다.",
        "My shell checks every 90 ms tick whether the pose changed and, if so, sends a sequence-numbered packet over the direct port, or by socket relay for a peer with no direct connection. The other shell drops stale packets and packets from another world, then feeds samples into the interpolation timeline. The timeline replays 100 ms in the past, drawing between two points, and extends for at most 250 ms if updates stop. The Phaser canvas draws the avatars at the interpolated positions.",
      ),
      actors: [
        { id: "me", label: t("내 셸", "My shell"), sub: t("프레즌스 · 90ms 틱", "Presence, 90 ms tick"), tone: "local" },
        { id: "port", label: t("직접 포트", "Direct port"), sub: t("릴레이 폴백 포함", "With relay fallback"), tone: "edge" },
        { id: "peer", label: t("상대 셸", "Their shell"), sub: t("수신 검사", "Receive checks"), tone: "local" },
        { id: "line", label: t("보간 타임라인", "Timeline"), sub: t("표본 24개까지", "Up to 24 samples"), tone: "good" },
      ],
      messages: [
        { from: "me", to: "me", label: t("틱: 자세가 바뀌었나?", "Tick: did my pose change?"), note: t("바뀌면 dirty 표시", "Marks it dirty if so") },
        { from: "me", to: "port", label: t("presence 패킷 + 시퀀스", "Presence packet + sequence"), note: t("1,024바이트 이하", "At most 1,024 bytes") },
        { from: "port", to: "peer", label: t("직접 또는 릴레이로 전달", "Direct or relayed delivery"), style: "dashed" },
        { from: "peer", to: "peer", label: t("시퀀스·월드 범위 검사", "Check sequence and scope"), note: t("낡은 것·다른 월드는 버림", "Stale or foreign ones dropped") },
        { from: "peer", to: "line", label: t("표본 넣기 (도착 시각)", "Push a sample (arrival time)") },
        { from: "line", to: "line", label: t("100ms 과거를 재생", "Replay 100 ms back"), note: t("두 점 사이를 곡선으로 이음", "Curve between two points") },
        { from: "line", to: "peer", label: t("이번 프레임 위치", "Position for this frame"), style: "dashed", note: t("끊기면 최대 250ms만 연장", "Extends at most 250 ms") },
        { from: "peer", to: "peer", label: t("10초 무소식이면 제거", "Remove after 10 s of silence") },
      ],
    },
    usage: [
      {
        feature: t("프레즌스 송수신 계약", "Presence send and receive contract"),
        role: t(
          "내 자세를 90ms 틱마다 검사해 변할 때와 하트비트 시간에 패킷을 보내고, 받은 패킷은 시퀀스와 월드 범위를 통과한 것만 반영합니다.",
          "My pose is checked every 90 ms tick and a packet is sent on change and at heartbeat time; received packets are reflected only after passing the sequence and world-scope checks.",
        ),
        paths: [`${V}/studio-virtual-space-presence.ts`, `${V}/studio-virtual-space-presence-protocol.ts`],
      },
      {
        feature: t("피어 보간 타임라인", "Peer interpolation timeline"),
        role: t(
          "도착 시각 기준 100ms 지연 재생, Catmull-Rom 보간, 250ms 외삽 상한, 순간이동 스냅으로 표본 사이를 이어 씁니다.",
          "Links samples using 100 ms delayed replay by arrival time, Catmull-Rom interpolation, a 250 ms extrapolation cap and teleport snapping.",
        ),
        paths: [`${V}/studio-virtual-space-presentation.ts#StudioPeerTimeline`],
      },
      {
        feature: t("직접 포트와 릴레이 폴백", "Direct port and relay fallback"),
        role: t(
          "프레즌스는 RTC 직접 포트(studio-direct-v1, 패킷 상한 64 KiB) 위에서 오가고, 메시가 성립하지 않은 상대에게는 소켓 릴레이로 폴백합니다.",
          "Presence travels over the RTC direct port (studio-direct-v1, a 64 KiB packet cap), with a socket-relay fallback for peers whose mesh cannot be established.",
        ),
        paths: [`${L}/studio-live-direct-port.ts`, `${L}/studio-live-p2p-overlay-transport.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("변화가 있을 때와 하트비트 때만 보내기", "Send only on change and at heartbeat time"),
        language: "ts",
        code: `// 변화가 있을 때(dirty)만 보내고, 변화가 없어도 2.5초마다 하트비트를 보낸다(presence 의 단순화).
export class PresenceSender {
  private seq = Date.now() * 1000; // 시계를 바닥값으로 삼아 새로고침 뒤에도 거꾸로 가지 않게
  private dirty = true;
  private lastSent = 0;
  constructor(private send: (packet: string) => void, private heartbeatMs = 2500, private maxBytes = 1024) {}
  markDirty(): void { this.dirty = true; }
  tick(now: number, state: object): void { // 약 90ms 간격으로 호출
    if (!this.dirty && now - this.lastSent < this.heartbeatMs) return;
    const packet = JSON.stringify({ wire: "toonstudio-space-v1", kind: "presence", sequence: ++this.seq, at: now, state });
    if (new TextEncoder().encode(packet).length > this.maxBytes) return; // 크기 상한을 넘으면 보내지 않는다
    this.send(packet);
    this.dirty = false;
    this.lastSent = now;
  }
}`,
        codeEn: `// Send only when something changed (dirty), plus a heartbeat every 2.5 s even if nothing changed (simplified from presence).
export class PresenceSender {
  private seq = Date.now() * 1000; // seeded from the clock so it never runs backwards after a reload
  private dirty = true;
  private lastSent = 0;
  constructor(private send: (packet: string) => void, private heartbeatMs = 2500, private maxBytes = 1024) {}
  markDirty(): void { this.dirty = true; }
  tick(now: number, state: object): void { // called roughly every 90 ms
    if (!this.dirty && now - this.lastSent < this.heartbeatMs) return;
    const packet = JSON.stringify({ wire: "toonstudio-space-v1", kind: "presence", sequence: ++this.seq, at: now, state });
    if (new TextEncoder().encode(packet).length > this.maxBytes) return; // never send past the size cap
    this.send(packet);
    this.dirty = false;
    this.lastSent = now;
  }
}`,
        explain: t(
          "움직임이 없을 때는 아무것도 보내지 않아 대역폭을 아끼고, 하트비트로 '아직 있음'만 알립니다. 받는 쪽은 10초 동안 소식이 없으면 이 사람을 지웁니다.",
          "When nothing moves nothing is sent, saving bandwidth, and the heartbeat only says 'still here'. The receiver removes the person after 10 seconds without news.",
        ),
        source: `${V}/studio-virtual-space-presence.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("100ms 늦춰 재생하고 끊기면 250ms만 연장", "Replay 100 ms late and extend for only 250 ms"),
        language: "ts",
        code: `// 도착 시각 기준으로 100ms 과거를 재생한다. 끊기면 250ms 만 속도를 이어 가고, 크게 튀면 스냅한다(단순화).
type Sample = { at: number; x: number; y: number };
const DELAY = 100;
const EXTRAPOLATE = 250;

export class PeerTimeline {
  private samples: Sample[] = [];
  push(s: Sample): void {
    const last = this.samples.at(-1);
    if (last && s.at <= last.at) return; // 낡은 표본은 버린다
    if (last && Math.hypot(s.x - last.x, s.y - last.y) > 260) this.samples = []; // 순간이동은 스냅
    this.samples.push(s);
    if (this.samples.length > 24) this.samples.shift();
  }
  sample(now: number): { x: number; y: number } | null {
    const at = now - DELAY;
    const last = this.samples.at(-1);
    if (!last) return null;
    const i = this.samples.findIndex((s) => s.at >= at);
    if (i > 0) { // 두 표본 사이를 잇는다(원본은 양옆이 있으면 Catmull-Rom 곡선)
      const a = this.samples[i - 1]!, b = this.samples[i]!;
      const k = (at - a.at) / (b.at - a.at);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    const prev = this.samples.at(-2);
    if (i === 0 || !prev) return { x: this.samples[0]!.x, y: this.samples[0]!.y };
    const over = Math.min(EXTRAPOLATE, at - last.at), dt = Math.max(16, last.at - prev.at);
    return { x: last.x + ((last.x - prev.x) / dt) * over, y: last.y + ((last.y - prev.y) / dt) * over };
  }
}`,
        codeEn: `// Replay 100 ms in the past by arrival time; extend speed for only 250 ms on a gap; snap on a big jump (simplified).
type Sample = { at: number; x: number; y: number };
const DELAY = 100;
const EXTRAPOLATE = 250;

export class PeerTimeline {
  private samples: Sample[] = [];
  push(s: Sample): void {
    const last = this.samples.at(-1);
    if (last && s.at <= last.at) return; // drop stale samples
    if (last && Math.hypot(s.x - last.x, s.y - last.y) > 260) this.samples = []; // snap on teleport
    this.samples.push(s);
    if (this.samples.length > 24) this.samples.shift();
  }
  sample(now: number): { x: number; y: number } | null {
    const at = now - DELAY;
    const last = this.samples.at(-1);
    if (!last) return null;
    const i = this.samples.findIndex((s) => s.at >= at);
    if (i > 0) { // link two samples (the original uses a Catmull-Rom curve when both neighbours exist)
      const a = this.samples[i - 1]!, b = this.samples[i]!;
      const k = (at - a.at) / (b.at - a.at);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    const prev = this.samples.at(-2);
    if (i === 0 || !prev) return { x: this.samples[0]!.x, y: this.samples[0]!.y };
    const over = Math.min(EXTRAPOLATE, at - last.at), dt = Math.max(16, last.at - prev.at);
    return { x: last.x + ((last.x - prev.x) / dt) * over, y: last.y + ((last.y - prev.y) / dt) * over };
  }
}`,
        explain: t(
          "일부러 100ms 늦게 재생하면 패킷이 조금 늦게 와도 '앞뒤 두 점'이 이미 있어서 끊기지 않습니다. 원본은 시퀀스 번호로 순서를 따지고 1.5초 넘게 끊겨도 스냅하며, 이 단순판은 곡선 보간과 그 규칙을 생략했습니다.",
          "Playing 100 ms late means that even if a packet is slightly late the 'two surrounding points' already exist, so there is no stutter. The original also orders by sequence number and snaps after a gap over 1.5 s; this version omits the curve interpolation and that rule.",
        ),
        source: `${V}/studio-virtual-space-presentation.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Gabriel Gambetta · Entity Interpolation", url: "https://www.gabrielgambetta.com/entity-interpolation.html", kind: "article", note: t("과거 두 점 사이를 그리는 기법", "Drawing between two past points") },
      { title: "MDN · RTCDataChannel", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel", kind: "docs", note: t("브라우저 간 직접 데이터 전송", "Direct browser-to-browser data") },
      { title: "Wikipedia · Centripetal Catmull–Rom spline", url: "https://en.wikipedia.org/wiki/Centripetal_Catmull%E2%80%93Rom_spline", kind: "article", note: t("모서리를 둥글게 잇는 곡선", "A curve that rounds the corners") },
      { title: "MDN · Window.sessionStorage", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage", kind: "docs", note: t("시퀀스를 새로고침 뒤에도 유지", "Keeping the sequence across reloads") },
    ],
    chapterIds: ["virtual-studio-world-authority", "webrtc-media-authority"],
    talk: {
      pitch: t(
        "프레즌스는 웹 셸이 맡습니다. 90ms마다 변화가 있을 때만 위치 패킷을 보내고, 변화가 없어도 2.5초마다 생존 신호를 보냅니다. 받는 쪽은 패킷 번호로 낡은 것을 거르고, 표본을 100ms 늦춰 재생해 사이를 이어 씁니다. 직접 연결이 안 되는 상대에게는 소켓 릴레이로 폴백하고, 상대 아바타 표시는 Phaser 캔버스가 맡습니다.",
        "Presence belongs to the web shell. A position packet is sent every 90 ms only when something changed, plus a liveness signal every 2.5 seconds. The receiver filters stale packets by number and replays samples 100 ms late, linking the gaps. A peer with no direct connection falls back to a socket relay, and the Phaser canvas draws the peer avatars.",
      ),
      analogy: t(
        "영화 필름처럼 몇 장의 사진만 받아도 사이를 이어 붙여 움직임으로 보여 주는 방식입니다. 일부러 조금 늦게 틀어서, 중간에 사진 한 장이 늦게 와도 끊기지 않게 합니다.",
        "It works like film: even a few photos are enough, because the gaps are joined into motion. It deliberately plays a little late so one late photo does not cause a stutter.",
      ),
      questions: [
        {
          question: t("상대 아바타는 누가 그리나요?", "Who draws the peer avatars?"),
          answer: t(
            "현행 그대로 Phaser 캔버스가 그립니다. 프레즌스 송수신과 표본 보간 규칙은 셸 코드에 있고, 캔버스가 보간된 위치로 상대 아바타를 표시합니다.",
            "The Phaser canvas draws them, as current code. Presence exchange and the sample interpolation rules live in shell code, and the canvas displays peer avatars at the interpolated positions.",
          ),
        },
        {
          question: t("직접 연결이 안 되면 프레즌스도 끊기나요?", "Does presence die when a direct connection fails?"),
          answer: t(
            "아니요. 직접 연결이 성립하지 않은 상대의 프레즌스 레인은 소켓 릴레이로 폴백합니다. ICE는 기본 STUN 전용이라 기본 구성에는 TURN 중계가 없습니다.",
            "No. The presence lane of a peer whose direct connection cannot be established falls back to a socket relay. ICE is STUN only by default, so the default configuration has no TURN relay.",
          ),
        },
        {
          question: t("패킷 순서가 뒤바뀌면요?", "What if packets arrive out of order?"),
          answer: t(
            "보낸 사람별 마지막 번호보다 작거나 같은 패킷은 버립니다. 새로고침해도 번호가 거꾸로 가지 않게 시계 바닥값과 sessionStorage를 씁니다.",
            "A packet whose number is not above the sender's last one is dropped. A clock seed and sessionStorage keep the number from running backwards after a reload.",
          ),
        },
      ],
      pitfall: t(
        "90ms·100ms·250ms는 셸 프레즌스 계약의 설계값입니다. 캔버스 내부 렌더링의 세부 수치로 말하지 마세요. 네트워크별 체감 측정은 이 카드에서 확인하지 못했습니다.",
        "The 90 ms, 100 ms and 250 ms figures are design values of the shell presence contract. Do not present them as internal rendering figures of the canvas. Per-network perception was not measured here.",
      ),
    },
    technologies: ["RTCDataChannel", "WebRTC", "Phaser"],
    facts: [
      { value: "90ms / 2.5초 / 10초", label: t("송신 틱 / 하트비트 / 무소식 만료(설계값)", "Send tick / heartbeat / silence expiry (design values)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "1,024바이트", label: t("프레즌스 패킷 크기 상한(설계값)", "Presence packet size cap (design value)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "100ms / 250ms", label: t("보간 지연 / 외삽 상한(설계값)", "Interpolation delay / extrapolation cap (design values)"), source: `${V}/studio-virtual-space-presentation.ts` },
      { value: "260px · 1.5초", label: t("순간이동으로 보는 점프 거리 · 끊김 시간(설계값)", "Jump distance and gap treated as a teleport (design values)"), source: `${V}/studio-virtual-space-presentation.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "proximity-hysteresis-160-220",
    category: "virtual-space",
    name: "Proximity hysteresis",
    title: t("근접 판정은 160px 인사·220px 작별의 히스테리시스 상태기가 맡는다", "A hysteresis state machine greets at 160 px and parts at 220 px"),
    status: "live",
    tagline: t(
      "들어올 때 160px, 나갈 때 220px — 기준을 나눈 상태기가 경계에서 반응이 번쩍이는 것을 막습니다.",
      "Enter at 160 px, leave at 220 px — split thresholds stop the reaction from flickering at the boundary.",
    ),
    background: [
      t(
        "가까워지면 반응하고 멀어지면 그만두는 규칙에서 거리 기준을 하나만 쓰면, 경계선에 선 사람이 한 걸음 흔들릴 때마다 반응이 번쩍거립니다. 에어컨이 켜지는 온도와 꺼지는 온도를 다르게 두듯 들어올 때와 나갈 때 기준을 나누는 발상이 히스테리시스이고, 이 규칙은 현행 웹 코드에도 그대로 살아 있습니다.",
        "If a react-when-near rule uses a single distance, someone standing on the boundary makes the reaction flash on every step. Splitting the enter and leave thresholds, like an air conditioner that turns on and off at different temperatures, is the idea of hysteresis, and that rule is alive in the current web code.",
      ),
      t(
        "이 규칙은 현행 웹 코드에 그대로 있습니다. 순수 모듈의 근접 상태기가 동료마다 인사했는지를 기억하고, 거리가 160px 안으로 들어오면 인사를, 220px 밖으로 나가면 작별을 판정합니다. 채팅 범위 200px은 그 사이에 있어, 인사가 닿는 범위와 대화 범위가 어긋나지 않습니다.",
        "The rule lives in the current web code as it is. A pure module's proximity state machine remembers whether each peer was greeted, greeting when the distance comes within 160 px and saying farewell when it passes 220 px. The chat range of 200 px sits between them, so the greeting range and the conversation range never drift apart.",
      ),
      t(
        "구역 판정은 엔진 이벤트 모듈이 맡습니다. 월드 매니페스트의 방 사각형 안에 점이 들어갔는지를 보고, 구역이 바뀔 때만 콜백(onZoneChange)을 부릅니다. 오피스 공간은 존 타입 10종으로 표면과 음향을 정하고, 방 분류는 모델 방 14개와 이동 목적지 8종으로 나뉩니다.",
        "Zone judgement belongs to the engine-events module. It checks whether a point falls inside the room rectangles of the world manifest and calls its callback (onZoneChange) only when the zone changes. Office spaces use ten zone types for surfaces and acoustics, and rooms split into 14 model rooms and 8 destination kinds.",
      ),
      t(
        "셸도 거리를 직접 계산합니다. 프레즌스 모듈이 자기 위치와 동료 위치로 근접 미디어(허들)의 진입과 유지를 정하고, 근접 상태기가 돌려준 인사·작별 이벤트로 채팅과 말풍선을 엽니다. 판정은 웹 모듈이 맡아, 셸과 캔버스가 서로 다른 근접 결론을 내는 일이 없습니다.",
        "The shell also computes distance directly. The presence module decides entry into and staying in proximity media (huddles) from its own and peers' positions, and opens chat and bubbles from the greet and farewell events the state machine returns. Judgement lives in web modules, so the shell and the canvas never reach different proximity conclusions.",
      ),
    ],
    keyPoints: [
      t("160px 인사 · 220px 작별 · 200px 채팅의 히스테리시스", "Hysteresis: greet at 160 px, farewell at 220 px, chat at 200 px"),
      t("구역 판정은 엔진 이벤트의 방 사각형 포함 검사", "Zone judgement is rectangle inclusion in engine events"),
      t("셸도 프레즌스 거리로 근접 미디어를 직접 정합니다", "The shell also judges proximity media from presence distance"),
    ],
    diagram: {
      id: "proximity-hysteresis-160-220-diagram",
      kind: "graph",
      title: t("근접 판정에서 화면 동선까지", "From proximity judgement to screen flows"),
      caption: t(
        "판정은 순수 모듈에서 한 번 일어나고, 결과로 채팅·말풍선·근접 미디어가 열립니다.",
        "Judgement happens once in a pure module, and chat, bubbles and proximity media open from the result.",
      ),
      alt: t(
        "아바타가 Phaser 캔버스 안을 이동하면 근접 상태기가 160px 인사·220px 작별로 인사와 작별을 판정하고, 엔진 이벤트가 방 사각형으로 구역을 판정합니다. 결과로 셸은 말풍선과 근접 미디어 동선을 엽니다.",
        "As an avatar moves inside the Phaser canvas, the proximity state machine judges greetings at 160 px and farewells at 220 px, and engine events judge zones by room rectangles. From the results, the shell opens bubble and proximity-media flows.",
      ),
      nodes: [
        { id: "avatar", label: t("아바타 이동", "Avatar moves"), sub: t("Phaser 캔버스 안", "Inside the Phaser canvas"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "zone", label: t("근접·구역 판정", "Proximity check"), sub: t("160/220px · 방 사각형", "160/220 px, room rectangles"), tone: "local", at: [1, 0] },
        { id: "bridge", label: t("이벤트 콜백", "Event callback"), sub: t("인사·작별·구역 변경", "Greet, farewell, zone change"), tone: "edge", at: [2, 0] },
        { id: "shell", label: t("웹 셸", "Web shell"), sub: t("동선 열기", "Opens flows"), tone: "local", at: [3, 0] },
        { id: "panel", label: t("화상·말풍선", "Video and bubbles"), sub: t("근접 미디어·채팅", "Proximity media, chat"), tone: "good", shape: "pill", at: [4, 0] },
      ],
      edges: [
        { from: "avatar", to: "zone", label: t("이동", "move") },
        { from: "zone", to: "bridge", label: t("판정", "judge") },
        { from: "bridge", to: "shell", label: t("이벤트", "event") },
        { from: "shell", to: "panel", label: t("열기", "open") },
      ],
    },
    usage: [
      {
        feature: t("근접 상태기 · 인사와 작별", "Proximity state machine · greetings and farewells"),
        role: t(
          "동료별 인사 상태를 기억하는 상태기가 160px 진입·220px 이탈로 인사와 작별을 판정하고, 채팅 범위 200px을 함께 정합니다.",
          "A state machine that remembers each peer's greeted state judges greetings at 160 px entry and farewells at 220 px exit, and sets the 200 px chat range with them.",
        ),
        paths: [`${V}/studio-virtual-space-proximity.ts`],
      },
      {
        feature: t("구역 판정 · 방 사각형과 오피스 존", "Zone judgement · room rectangles and office zones"),
        role: t(
          "엔진 이벤트의 구역 추적기가 방 사각형 포함 여부로 구역 변경을 알리고, 오피스 존 모듈이 점이 속한 존(가장 좁은 존 우선)을 정합니다.",
          "The engine-events zone tracker reports zone changes by room-rectangle inclusion, and the office-zones module decides the zone at a point, with the narrowest zone winning.",
        ),
        paths: [`${V}/studio-virtual-space-engine-events.ts`, `${V}/studio-virtual-space-office-zones.ts`],
      },
      {
        feature: t("근접 결과로 열리는 동선", "Flows opened by proximity results"),
        role: t(
          "프레즌스 모듈의 근접 미디어 상태가 허들 진입·유지를 정하고, 근접 인원이 있으면 말풍선 대화 표시가 켜집니다.",
          "The presence module's proximity-media state decides huddle entry and staying, and nearby people turn on the bubble-chat indicator.",
        ),
        paths: [`${V}/hud/space-proximity-media.ts`, `${V}/studio-virtual-space-presence.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("점이 속한 존 찾기 — 가장 좁은 존 우선", "Finding the zone at a point — narrowest zone wins"),
        language: "ts",
        code: `// 점이 속한 오피스 존을 정한다 — 겹치면 가장 좁은 존이 우선한다(office-zones의 단순화).
export interface OfficeZone { id: string; rect: { x: number; y: number; width: number; height: number } }

const area = (zone: OfficeZone): number => zone.rect.width * zone.rect.height;

export function zoneAtPoint(zones: readonly OfficeZone[], x: number, y: number): OfficeZone | null {
  let best: OfficeZone | null = null;
  for (const zone of zones) {
    const r = zone.rect;
    const inside = x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
    if (inside && (best === null || area(zone) < area(best))) best = zone; // 가장 좁은 존 우선
  }
  return best; // 어느 존에도 없으면 null
}`,
        codeEn: `// Decide the office zone at a point — the narrowest zone wins on overlap (simplified from office-zones).
export interface OfficeZone { id: string; rect: { x: number; y: number; width: number; height: number } }

const area = (zone: OfficeZone): number => zone.rect.width * zone.rect.height;

export function zoneAtPoint(zones: readonly OfficeZone[], x: number, y: number): OfficeZone | null {
  let best: OfficeZone | null = null;
  for (const zone of zones) {
    const r = zone.rect;
    const inside = x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
    if (inside && (best === null || area(zone) < area(best))) best = zone; // narrowest zone wins
  }
  return best; // in no zone, null
}`,
        explain: t(
          "구역 판정은 선언된 사각형 포함 여부입니다. 존이 겹치면 가장 좁은 존이 이기므로, 큰 라운지 안의 작은 회의 코너가 먼저 잡힙니다.",
          "Zone judgement is inclusion in a declared rectangle. When zones overlap, the narrowest wins, so a small meeting corner inside a large lounge is picked first.",
        ),
        source: `${V}/studio-virtual-space-office-zones.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("인사 160px · 작별 220px의 상태 전이", "State transitions: greet at 160 px, farewell at 220 px"),
        language: "ts",
        code: `// 근접 상태기의 인사·작별 판정(단순화).
export const GREET_DISTANCE = 160;
export const FAREWELL_DISTANCE = 220;
export const CHAT_DISTANCE = 200;

export interface ProximityPeerState { greeted: boolean }
export type ProximityEvent = "greet" | "farewell" | null;

export function updateProximity(state: ProximityPeerState, distance: number): ProximityEvent {
  if (!state.greeted && distance <= GREET_DISTANCE) { state.greeted = true; return "greet"; }
  if (state.greeted && distance > FAREWELL_DISTANCE) { state.greeted = false; return "farewell"; }
  return null; // 160~220px 사이에서는 상태가 유지된다 — 경계에서 번쩍이지 않는다
}`,
        codeEn: `// Greet and farewell judgement of the proximity state machine (simplified).
export const GREET_DISTANCE = 160;
export const FAREWELL_DISTANCE = 220;
export const CHAT_DISTANCE = 200;

export interface ProximityPeerState { greeted: boolean }
export type ProximityEvent = "greet" | "farewell" | null;

export function updateProximity(state: ProximityPeerState, distance: number): ProximityEvent {
  if (!state.greeted && distance <= GREET_DISTANCE) { state.greeted = true; return "greet"; }
  if (state.greeted && distance > FAREWELL_DISTANCE) { state.greeted = false; return "farewell"; }
  return null; // between 160 and 220 px the state holds — no flickering at the boundary
}`,
        explain: t(
          "들어올 때와 나갈 때 기준이 달라, 경계에 선 동료가 한 걸음 흔들려도 인사와 작별이 번갈아 뜨지 않습니다. 채팅 범위 200px은 두 기준 사이에 있습니다.",
          "Because the enter and leave thresholds differ, a peer wobbling at the boundary does not make greetings and farewells alternate. The 200 px chat range sits between the two thresholds.",
        ),
        source: `${V}/studio-virtual-space-proximity.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Wikipedia · Hysteresis", url: "https://en.wikipedia.org/wiki/Hysteresis", kind: "article", note: t("히스테리시스의 일반 개념", "The general concept of hysteresis") },
      { title: "Wikipedia · Schmitt trigger", url: "https://en.wikipedia.org/wiki/Schmitt_trigger", kind: "article", note: t("켜는 기준과 끄는 기준을 나눈 회로", "A circuit with separate on and off thresholds") },
      { title: "Phaser · Documentation", url: "https://docs.phaser.io/", kind: "docs", note: t("무대 엔진의 공식 문서", "Official docs of the stage engine") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "근접 판정은 px 단위 히스테리시스가 현행입니다. 동료가 160px 안으로 들어오면 인사하고, 220px 밖으로 나가야 작별합니다. 기준이 갈려 있어 경계에서 반응이 번쩍이지 않습니다. 구역은 엔진 이벤트가 방 사각형으로 판정하고, 셸도 프레즌스 거리로 근접 미디어를 직접 정합니다.",
        "Proximity judgement is pixel hysteresis, and it is current. A peer coming within 160 px is greeted, and only leaves after passing 220 px. Because the thresholds are split, reactions do not flicker at the boundary. Zones are judged by engine events with room rectangles, and the shell also decides proximity media directly from presence distance.",
      ),
      analogy: t(
        "에어컨과 같습니다. 켜지는 온도와 꺼지는 온도를 다르게 두듯, 인사 거리와 작별 거리를 다르게 둬서 경계에서 스위치가 떨지 않게 합니다.",
        "It is like an air conditioner. Just as the on and off temperatures differ, the greeting and farewell distances differ, so the switch does not chatter at the boundary.",
      ),
      questions: [
        {
          question: t("160/220px 규칙은 지금도 도나요?", "Does the 160/220 px rule still run?"),
          answer: t(
            "네, 현행으로 돕니다. 근접 상태기가 동료마다 인사 상태를 기억하고, 160px 진입에서 인사를, 220px 이탈에서 작별을 돌려줍니다.",
            "Yes, it runs as current code. The proximity state machine remembers each peer's greeted state and returns a greeting at 160 px entry and a farewell at 220 px exit.",
          ),
        },
        {
          question: t("구역 판정은 어떻게 하나요?", "How are zones judged?"),
          answer: t(
            "엔진 이벤트의 구역 추적기가 월드 매니페스트의 방 사각형 포함 여부로 판정하고, 바뀔 때만 onZoneChange 콜백을 부릅니다. 오피스 공간은 존 타입 10종으로 표면과 음향을 정합니다.",
            "The engine-events zone tracker judges by inclusion in the world manifest's room rectangles and calls its onZoneChange callback only on change. Office spaces use ten zone types for surfaces and acoustics.",
          ),
        },
        {
          question: t("셸이 거리를 재서 한 번 더 확인하나요?", "Does the shell re-measure distance to double-check?"),
          answer: t(
            "셸도 거리를 직접 계산합니다. 프레즌스 모듈이 근접 미디어의 진입(168px)과 유지(216px) 기준을 자기 위치와 동료 위치로 정합니다. 다만 인사·작별 판정은 근접 상태기 한곳이 맡아 결론이 갈리지 않습니다.",
            "The shell computes distance directly too. The presence module decides proximity-media entry (168 px) and staying (216 px) from its own and peers' positions. Greeting and farewell judgement, though, belongs to the single proximity state machine, so conclusions cannot diverge.",
          ),
        },
      ],
      pitfall: t(
        "클래식 px 수치가 제거됐다고 말하지 마세요. 160/220px 히스테리시스는 현행 근접 상태기의 상수입니다. 반대로 삭제된 공간 정의의 구역 5종·24개 같은 수치를 현행처럼 말하지 마세요.",
        "Do not say the classic pixel figures were removed. The 160/220 px hysteresis values are constants of the current proximity state machine. Conversely, do not present the removed space definition's figures, such as five zone kinds and 24 zones, as current.",
      ),
    },
    technologies: ["Phaser", "Hysteresis", "TypeScript"],
    facts: [
      { value: "160px · 220px", label: t("인사 진입 · 작별 이탈 거리", "Greeting entry and farewell exit distances"), source: `${V}/studio-virtual-space-proximity.ts` },
      { value: "200px", label: t("근접 채팅 범위", "Proximity chat range"), source: `${V}/studio-virtual-space-proximity.ts` },
      { value: "10종", label: t("오피스 존 타입 수", "Office zone types"), source: `${V}/studio-virtual-space-office-zones.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "proximity-video-capacity-chain",
    category: "virtual-space",
    name: "Proximity video",
    title: t("가까워지면 거리 히스테리시스로 근접 영상이 붙는 구조와 정원", "Proximity video that attaches by distance hysteresis, and its capacity"),
    status: "configured",
    tagline: t(
      "화상 조건은 구역이 아니라 거리 히스테리시스(진입 168px·유지 216px)이고, 허들 원격 상한은 3명, 방 연결 상한은 64입니다.",
      "Video needs distance hysteresis (enter at 168 px, hold at 216 px), not a zone; the huddle remote cap is 3 and a room allows 64 connections.",
    ),
    background: [
      t(
        "가까이 가면 영상이 붙는 근접 영상은 HUD가 담당합니다. 트리거는 구역이 아니라 거리 히스테리시스입니다. 표준 모드에서는 168px 안으로 들어오면 붙고 216px 밖으로 나가야 떨어지며, 조용한 모드에서는 80px·112px로 좁아지고 꺼짐 모드에서는 붙지 않습니다. 장치 권한은 동의 컴포넌트를 거친 뒤에만 요청하므로, 가까워진 것만으로 카메라는 켜지지 않습니다.",
        "Proximity video that attaches as you walk close is handled by the HUD. The trigger is distance hysteresis, not a zone. In standard mode it attaches within 168 px and detaches only past 216 px; quiet mode narrows that to 80 px and 112 px, and off mode never attaches. Device permission is requested only after a consent component, so merely walking close never turns the camera on.",
      ),
      t(
        "화상 연결은 웹 셸이 소유합니다. 허들 컨트롤러가 RTCPeerConnection과 미디어를 관리하고, 신호는 화면 신호 채널로 오갑니다. ICE는 기본적으로 STUN 전용 구성이지만, 운영자가 coturn 환경변수 3종을 모두 유효하게 넣으면 TURN이 붙습니다. 연결이 끊기면 컨트롤러가 4초 가드와 최대 3회의 재시도로 ICE를 다시 붙이고, 음성만 재시도하는 경로도 있습니다.",
        "The video connection is owned by the web shell. The huddle controller manages the RTCPeerConnection and media, and signals travel over the screen-signaling channel. ICE is STUN-only by default, but a TURN server joins when the operator sets all three coturn environment variables validly. When a connection drops, the controller re-attaches ICE with a 4-second guard and up to three retries, with a voice-only retry path as well.",
      ),
      t(
        "P2P가 막힌 네트워크에서는 화상이 릴레이로 이어지지 않습니다. 패널은 그 상태를 '폴백'으로 정직하게 표기하고, 공간 프레즌스와 채팅은 WebSocket 보장 경로로 계속 동작합니다. 미디어 릴레이가 없다는 한계를 숨기지 않는 것이 이 설계의 일부입니다. 복구는 재시도로만 합니다.",
        "On a network where peer-to-peer is blocked, video is not carried by a relay. The panel honestly labels that state as a fallback, and space presence and chat keep working over the guaranteed WebSocket path. Not hiding the absence of a media relay is part of this design, and recovery is by retry only.",
      ),
      t(
        "'몇 명까지?'는 층마다 다릅니다. 실시간 방 하나의 연결 상한은 64이고, 직접 메시의 원격 기본 상한은 8명(나 포함 9명), 근접 영상의 원격 상한은 3명(나 포함 4명)입니다. 근접 상한은 허들 프로토콜 상수와 같은 값으로 묶여 있어 두 층이 어긋나지 않습니다. 층을 섞어 가장 큰 수를 정원으로 말하면 안 되고, 실제 화상 동선은 가장 안쪽 층이 정합니다.",
        "'How many people?' differs per layer. One realtime room allows 64 connections, the direct mesh defaults to 8 remote peers (9 with you), and proximity video caps at 3 remote peers (4 with you). The proximity cap is bound to the same value as the huddle protocol constant, so the two layers never drift apart. Mixing layers and quoting the largest number as capacity is wrong; the innermost layer decides the actual video flow.",
      ),
    ],
    keyPoints: [
      t("조건은 회의 구역이 아니라 거리 히스테리시스 168/216px", "The condition is distance hysteresis, 168/216 px, not a meeting zone"),
      t("화상은 셸이 소유하고 ICE는 기본 STUN 전용(운영자 TURN 가능)", "The shell owns video; ICE is STUN only by default, operator TURN possible"),
      t("근접·허들 원격 상한 3명, 실시간 방 연결 상한은 64", "Proximity and huddle remote cap is 3; a realtime room allows 64"),
    ],
    diagram: {
      id: "proximity-video-capacity-chain-diagram",
      kind: "layers",
      title: t("화상 정원의 층과 시작 조건", "The layers of video capacity and the start condition"),
      caption: t(
        "위에서 아래로 갈수록 숫자가 작아지고, 가장 안쪽 층이 실제 화상 동선입니다.",
        "Numbers shrink from top to bottom, and the innermost layer is the actual video flow.",
      ),
      alt: t(
        "정원은 층으로 쌓여 있습니다. 실시간 방 연결 상한 64, 직접 메시 원격 8명(나 포함 9명), 허들 영상 원격 3명(나 포함 4명), 근접 영상 원격 3명 순으로 좁아집니다. 그 아래에 시작 조건이 있습니다. 거리 히스테리시스(진입 168px·유지 216px)를 지나고 사용자가 동의해야 카메라와 마이크를 요청합니다.",
        "Capacity is layered: a realtime room allows 64 connections, the direct mesh 8 remote peers (9 with you), huddle video 3 remote peers (4 with you), and proximity video 3 remote peers. Below are the start conditions: distance hysteresis (enter at 168 px, hold at 216 px) must be passed and the user must consent before camera and microphone are requested.",
      ),
      layers: [
        { id: "room", label: t("실시간 방 64 연결", "Realtime room: 64 connections"), sub: t("방당 연결 상한(Worker 설정)", "Per-room connection cap (Worker settings)"), tone: "neutral" },
        { id: "mesh", label: t("직접 메시 원격 8명 (나 포함 9명)", "Direct mesh: 8 remote (9 with you)"), sub: t("프레즌스·채팅 패킷이 오가는 메시", "The mesh carrying presence and chat packets"), tone: "edge", chips: ["RTCDataChannel"] },
        { id: "huddle", label: t("허들 영상 원격 3명 (나 포함 4명)", "Huddle video: 3 remote (4 with you)"), sub: t("허들 프로토콜의 원격 상한", "The huddle protocol remote cap"), tone: "good", chips: ["WebRTC"] },
        { id: "meeting", label: t("근접 영상 원격 3명 (나 포함 4명)", "Proximity video: 3 remote (4 with you)"), sub: t("거리 히스테리시스로 붙는 실제 화상 동선", "The actual video flow attached by distance hysteresis"), tone: "local", chips: ["WebRTC"] },
        { id: "zone", label: t("시작 조건", "Start conditions"), sub: t("거리 히스테리시스 168/216px + 사용자 동의", "Distance hysteresis 168/216 px plus user consent"), tone: "warn" },
      ],
      brackets: [
        { label: t("정원: 층마다 다른 수", "Capacity: a number per layer"), layerIds: ["room", "mesh", "huddle", "meeting"] },
        { label: t("시작 조건", "Start conditions"), layerIds: ["zone"] },
      ],
    },
    usage: [
      {
        feature: t("근접 영상 패널과 미디어 상태", "Proximity video panel and media state"),
        role: t(
          "거리 히스테리시스가 근접 대상을 정하면 HUD 패널이 영상을 붙이고, 동의 컴포넌트를 거친 뒤에만 장치를 요청합니다. 경로는 P2P인지 폴백인지 패널에 표기됩니다.",
          "Once distance hysteresis scopes the proximity peers, the HUD panel attaches video, and devices are requested only after the consent component. The panel labels whether the route is peer-to-peer or fallback.",
        ),
        paths: [`${V}/hud/SpaceProximityVideo.tsx`, `${V}/hud/space-proximity-media.ts`, `${V}/hud/use-space-proximity-media.ts`],
      },
      {
        feature: t("허들 P2P 컨트롤러와 프로토콜", "Huddle P2P controller and protocol"),
        role: t(
          "기존 허들 화상의 원격 상한은 프로토콜 상수 3명으로 고정되어 있고, 컨트롤러가 이 상한을 넘기지 않습니다.",
          "The existing huddle video remote cap is fixed at 3 by a protocol constant, and the controller never exceeds it.",
        ),
        paths: [`${L}/huddle/studio-p2p-huddle-controller.ts`, `${L}/huddle/studio-p2p-huddle-protocol.ts`],
      },
      {
        feature: t("직접 메시 전송", "Direct mesh transport"),
        role: t(
          "프레즌스·채팅 패킷이 오가는 직접 연결 메시의 기본 상한은 원격 8명(나 포함 9명)이고, 메시가 안 되는 상대는 릴레이로 폴백합니다.",
          "The default cap of the direct mesh carrying presence and chat packets is 8 remote peers (9 with you), and peers without a mesh fall back to relay.",
        ),
        paths: [`${L}/studio-live-p2p-overlay-transport.ts`],
      },
      {
        feature: t("실시간 방 상한 설정", "Realtime room cap settings"),
        role: t(
          "Worker 설정에서 방당 연결 상한은 64, 재생 보관(retention)은 15분, 재생 이벤트 상한은 2,048건으로 선언되어 있습니다.",
          "The Worker settings declare a per-room connection cap of 64, event retention of 15 minutes and a replay event cap of 2,048.",
        ),
        paths: [`deploy/cloudflare-realtime/wrangler.jsonc`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("근접 대상 거르기 — 진입 168px · 유지 216px", "Scoping proximity peers — enter at 168 px, hold at 216 px"),
        language: "ts",
        code: `// 근접 대상은 진입 반경과 유지 반경으로 거른다(space-proximity-media의 단순화).
export const ENTER_RADIUS = 168;
export const HOLD_RADIUS = 216;

export interface ProximityPeer { id: string; distance: number; attached: boolean }

export function scopePeers(peers: readonly ProximityPeer[]): ProximityPeer[] {
  return peers.filter((peer) => (peer.attached ? peer.distance <= HOLD_RADIUS : peer.distance <= ENTER_RADIUS));
}`,
        codeEn: `// Proximity peers are scoped by an enter radius and a hold radius (simplified from space-proximity-media).
export const ENTER_RADIUS = 168;
export const HOLD_RADIUS = 216;

export interface ProximityPeer { id: string; distance: number; attached: boolean }

export function scopePeers(peers: readonly ProximityPeer[]): ProximityPeer[] {
  return peers.filter((peer) => (peer.attached ? peer.distance <= HOLD_RADIUS : peer.distance <= ENTER_RADIUS));
}`,
        explain: t(
          "붙어 있는 상대에게는 유지 반경을, 아직 아닌 상대에게는 진입 반경을 적용합니다. 기준이 갈려 있어 경계에서 영상이 붙었다 떨어졌다 하지 않습니다.",
          "Attached peers get the hold radius and the others get the enter radius. Because the thresholds are split, video does not attach and detach repeatedly at the boundary.",
        ),
        source: `${V}/hud/space-proximity-media.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("ICE 서버는 STUN 하나로 고정", "ICE servers fixed to a single STUN"),
        language: "ts",
        code: `// TURN은 비용 리스크로 쓰지 않는다. ICE 구성은 Cloudflare STUN 하나로 고정한다(ICE 구성의 단순화).
export const STUN_URL = "stun:stun.cloudflare.com:3478";
const STUN_ONLY: readonly RTCIceServer[] = Object.freeze([Object.freeze({ urls: [STUN_URL] })]);

export function getIceServers(): RTCIceServer[] {
  // 호출부가 반환값을 바꿔도 공유 상수가 오염되지 않게 매번 복사해서 돌려준다.
  return STUN_ONLY.map((server) => ({ urls: [...(server.urls as string[])] }));
}`,
        codeEn: `// TURN is not used because of cost risk. The ICE configuration is fixed to one Cloudflare STUN server (simplified from the ICE configuration).
export const STUN_URL = "stun:stun.cloudflare.com:3478";
const STUN_ONLY: readonly RTCIceServer[] = Object.freeze([Object.freeze({ urls: [STUN_URL] })]);

export function getIceServers(): RTCIceServer[] {
  // Return a fresh copy each time so a caller mutating the result cannot pollute the shared constant.
  return STUN_ONLY.map((server) => ({ urls: [...(server.urls as string[])] }));
}`,
        explain: t(
          "직접 연결이 뚫리지 않는 환경에서는 화상이 성립하지 않습니다. 그 한계는 패널의 폴백 표기로 드러내고, 프레즌스·채팅은 WebSocket 경로로 이어집니다. 운영자가 coturn 환경변수 3종을 모두 유효하게 설정하면 TURN 서버가 구성에 붙습니다.",
          "Where a direct connection cannot be established, video does not connect. That limit is surfaced by the panel's fallback label, while presence and chat continue over the WebSocket path. If the operator sets all three coturn environment variables validly, a TURN server joins the configuration.",
        ),
        source: `${L}/studio-ice-configuration.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · WebRTC API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API", kind: "docs", note: t("P2P 영상통화의 바탕", "The basis of P2P video calls") },
      { title: "W3C · WebRTC 1.0", url: "https://www.w3.org/TR/webrtc/", kind: "spec", note: t("표준 명세", "The standard specification") },
      { title: "MDN · MediaDevices.getUserMedia", url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia", kind: "docs", note: t("카메라·마이크 권한 요청", "Requesting camera and microphone") },
      { title: "BlogGeek.me · Multiparty video alternatives", url: "https://bloggeek.me/webrtc-multiparty-video-alternatives/", kind: "article", note: t("메시와 SFU 비교", "Mesh versus SFU") },
    ],
    chapterIds: ["webrtc-media-authority", "virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "근접 화상의 조건은 거리 히스테리시스입니다. 표준 모드에서 168px 안으로 들어오면 붙고 216px 밖으로 나가야 떨어집니다. 동의한 뒤에만 카메라를 요청하고, ICE는 기본 STUN 전용(운영자 설정 시 TURN 가능)이라 P2P가 막히면 화상은 이어지지 않고 그 상태가 패널에 정직하게 표시됩니다. 정원은 층마다 달라서 방 연결 64, 메시 원격 8명, 근접·허들 원격 3명입니다.",
        "The condition for proximity video is distance hysteresis. In standard mode it attaches within 168 px and detaches only past 216 px. The camera is requested only after consent, and ICE is STUN only by default (TURN possible with operator settings), so when peer-to-peer is blocked the video does not connect and that state is shown honestly on the panel. Capacity differs per layer: 64 room connections, 8 mesh remote peers, and 3 proximity and huddle remote peers.",
      ),
      analogy: t(
        "복도에서 가까워지면 자연스럽게 대화가 붙는 것과 같습니다. 스쳐 지나가는 거리에서는 붙지 않고, 곁에 머무는 거리에서 붙으며, 충분히 멀어져야 떨어집니다.",
        "It is like a conversation that starts naturally as you draw close in a corridor. It does not start at passing distance, starts at the distance where you linger beside someone, and ends only when you move far enough away.",
      ),
      questions: [
        {
          question: t("최대 몇 명까지 가능한가요?", "What is the maximum number of people?"),
          answer: t(
            "동선마다 다릅니다. 근접 영상과 허들 화상은 원격 3명(나 포함 4명)이 상한입니다. 방 연결 상한 64는 화상 정원이 아닙니다.",
            "It depends on the flow. Proximity video and huddle video cap at 3 remote peers (4 with you). The room connection cap of 64 is not a video capacity.",
          ),
        },
        {
          question: t("카메라는 언제 켜지나요?", "When does the camera turn on?"),
          answer: t(
            "근접 대상이 되고 동의 컴포넌트에서 허용한 뒤에만 요청합니다. 가까워진 것만으로, 공간에 들어간 것만으로 요청하지 않습니다.",
            "Only after you become a proximity peer and allow it in the consent component. Merely walking close, or entering the studio, never asks for it.",
          ),
        },
        {
          question: t("P2P가 막힌 네트워크에서는요?", "What about networks where peer-to-peer is blocked?"),
          answer: t(
            "화상은 이어지지 않고 패널이 폴백 상태를 표시합니다. 기본 구성이 STUN 전용인 한계이며, 운영자가 coturn을 설정하면 TURN으로 우회할 수 있습니다. 프레즌스와 채팅은 WebSocket 보장 경로로 계속 동작합니다.",
            "Video does not connect and the panel shows the fallback state. That is the limit of the STUN-only default configuration, and an operator who sets up coturn can route around it with TURN. Presence and chat keep working over the guaranteed WebSocket path.",
          ),
        },
      ],
      pitfall: t(
        "'24명 지원'이나 회의 구역 세션 같은 삭제된 동선의 수치를 말하지 마세요. 모든 수치는 설계·설정값이고, 네트워크 환경별 연결 성공률과 영상 품질은 확인하지 못했습니다.",
        "Do not quote figures of removed flows, such as '24 people supported' or the meeting-zone session. Every figure is a design or settings value, and connection success rates and video quality across network conditions were not verified.",
      ),
    },
    technologies: ["WebRTC", "TypeScript", "Cloudflare STUN"],
    facts: [
      { value: "3명", label: t("허들 영상 원격 참가자 상한(나 포함 4명)", "Huddle video remote-peer cap (4 including you)"), source: `${L}/huddle/studio-p2p-huddle-protocol.ts` },
      { value: "64", label: t("실시간 방당 연결 상한(Worker 설정값)", "Per-room realtime connection cap (Worker setting)"), source: `deploy/cloudflare-realtime/wrangler.jsonc` },
      { value: "8명", label: t("직접 메시 원격 기본 상한(나 포함 9명, 설계값)", "Default direct-mesh remote cap (9 including you, design value)"), source: `${L}/studio-live-p2p-overlay-transport.ts` },
      { value: "168px · 216px", label: t("근접 영상 진입 · 유지 반경(표준 모드)", "Proximity video enter and hold radii (standard mode)"), source: `${V}/hud/space-proximity-media.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "chat-reactions-npc-greetings",
    category: "virtual-space",
    name: "Nearby chat",
    title: t("채팅 규칙은 셸 코드가 정하고, NPC는 거리와 쿨다운으로 인사한다", "Chat rules live in shell code, and NPCs greet by distance and cooldown"),
    status: "live",
    tagline: t(
      "말풍선 채팅은 셸에서 보내 캔버스에 뜨고, NPC는 130px 안에서 90초 쿨다운으로 인사합니다.",
      "Bubble chat is sent from the shell and shown on the canvas, and NPCs greet within 130 px on a 90-second cooldown.",
    ),
    background: [
      t(
        "공간에서는 영상 없이도 가볍게 소통할 수 있어야 합니다. 말풍선 채팅의 규칙은 셸의 채팅 도메인 로직이 정합니다. 범위는 '근처'와 '방 전체' 두 가지이고, 근처 범위는 200px로 정의되어 있습니다. 문장은 140자 안으로 다듬고 기본 금칙어 어간은 보내기 전과 받을 때 두 번 가립니다. 말풍선은 4초에 글자당 40ms를 더해 최대 10초 보이고, 로그는 최근 100개까지만 보관합니다.",
        "In the studio you should be able to communicate lightly without video. The rules of bubble chat are set by the shell's chat domain logic: the scope is either nearby or the whole room, and the nearby range is defined as 200 px. Text is trimmed to 140 characters and basic profanity stems are masked twice, before sending and on receipt. A bubble shows for 4 seconds plus 40 ms per character, up to 10 seconds, and the log keeps only the latest 100 messages.",
      ),
      t(
        "표시 경계는 셸과 캔버스로 나뉩니다. 셸의 채팅 패널에서 보낸 말풍선은 프레즌스 패킷으로 Phaser 캔버스에 표시되고(입력 상한 140자), 채팅 기록은 HUD 패널의 DOM 로그에 쌓입니다. 이모트 선택기는 카탈로그 전 17종을 노출하고, 단축키가 있는 것은 11종입니다. 리액션 패킷은 연타를 막으려고 같은 사용자는 250ms에 한 번만 보내고, 이모트마다 표시 시간이 정해져 있습니다(카탈로그 17종, 1.8~4초).",
        "The display boundary splits between shell and canvas. A bubble sent from the shell's chat panel is shown on the Phaser canvas as a presence packet (input capped at 140 characters), and the chat record accumulates in the HUD panel's DOM log. The emote picker exposes all 17 catalog emotes, 11 of which carry shortcuts. Reaction packets are sent by a given user at most once per 250 ms to stop mashing, and each emote has its own display time (17 in the catalog, 1.8 to 4 seconds).",
      ),
      t(
        "NPC 인사는 근접 모듈이 거리와 쿨다운으로 만듭니다. 사용자가 NPC 130px 안에 들어오면 인사하고, 인사한 NPC는 90초 쿨다운이 돌아야 다시 인사합니다. 상주 NPC 정의는 6종이고, 매니페스트 NPC 8종에 확장 6종을 더해 14종이 공간에 설 수 있으며, 캐스트 데이터는 손으로 그린 NPC 스킨 8종을 제공합니다.",
        "NPC greetings are made by the proximity module from distance and cooldown. When a user comes within 130 px of an NPC it greets, and a greeted NPC waits out a 90-second cooldown before greeting again. There are 6 resident NPC definitions, and 8 manifest NPCs plus 6 extended ones make 14 that can stand in the space, while the cast data provides 8 hand-drawn NPC skins.",
      ),
      t(
        "입력 폭주는 보내는 쪽 쓰로틀과 받는 쪽 만료(TTL)의 이중 방어가 흔합니다. 입력 중 표시는 3.5초 안에 갱신이 없으면 스스로 사라집니다. 한계: NPC가 인사 문구를 고르는 세부 방식은 이 카드에서 확인하지 않았습니다. 욕설 마스킹은 '최소 집합'이라고 코드가 밝히고 있어 완전한 필터가 아닙니다.",
        "Input floods are commonly handled by a double defence: a sender-side throttle and a receiver-side expiry (TTL). The typing indicator disappears by itself if not refreshed within 3.5 seconds. Limits: how an NPC picks its greeting line in detail was not verified in this card. The code itself calls the profanity masking a minimum set, so it is not a complete filter.",
      ),
    ],
    keyPoints: [
      t("'근처' 채팅 범위는 채팅 로직이 200px로 정의합니다", "'Nearby' chat range is defined as 200 px by the chat logic"),
      t("리액션은 250ms 쓰로틀, 이모트 카탈로그는 17종", "Reactions throttle at 250 ms; the emote catalog has 17"),
      t("NPC 인사는 반경 130px · 쿨다운 90초로 근접 모듈이 만듭니다", "NPC greetings come from the proximity module: 130 px radius, 90 s cooldown"),
    ],
    diagram: {
      id: "chat-reactions-npc-greetings-diagram",
      kind: "graph",
      title: t("말풍선·이모트·NPC의 흐름", "The flow of bubbles, emotes and NPCs"),
      caption: t(
        "셸이 규칙으로 다듬어 캔버스에 표시하고, NPC는 근접 모듈의 인사를 캔버스에 띄웁니다.",
        "The shell tidies by rule and shows on the canvas, and NPCs surface proximity-module greetings on the canvas.",
      ),
      alt: t(
        "채팅이나 이모트를 입력하면 셸의 채팅 로직이 140자 정리와 욕설 가림, 250ms 쓰로틀을 적용한 뒤 프레즌스 패킷으로 캔버스에 보냅니다. 캔버스는 말풍선과 이모트를 표시하고, 기록은 셸의 HUD 로그에도 쌓입니다. NPC는 130px 안에 들어온 사용자에게 90초 쿨다운으로 인사합니다.",
        "Typing a chat or an emote passes through the shell chat logic's 140-character trimming, profanity masking and a 250 ms throttle before going to the canvas as a presence packet. The canvas shows bubbles and emotes, and the record also accumulates in the shell's HUD log. NPCs greet users who come within 130 px, on a 90-second cooldown.",
      ),
      nodes: [
        { id: "send", label: t("보내기", "Send"), sub: t("셸 채팅 폼·이모트 바", "Shell chat form and emote bar"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "tidy", label: t("정리·가리기", "Tidy and mask"), sub: t("140자 · 욕설 · 250ms", "140 chars, profanity, 250 ms"), tone: "local", at: [1, 0] },
        { id: "bridge", label: t("프레즌스 패킷", "Presence packet"), sub: t("셸 → 캔버스", "Shell to canvas"), tone: "edge", shape: "cylinder", at: [2, 0] },
        { id: "show", label: t("말풍선·이모트 표시", "Bubbles and emotes"), sub: t("캔버스 안 · 셸 기록", "On canvas, logged in shell"), tone: "good", at: [3, 0] },
        { id: "npc", label: t("NPC 인사", "NPC greeting"), sub: t("반경 130px · 쿨다운 90초", "130 px radius, 90 s cooldown"), tone: "local", at: [2, 1] },
      ],
      edges: [
        { from: "send", to: "tidy", label: t("입력", "input") },
        { from: "tidy", to: "bridge", label: t("패킷", "packet") },
        { from: "bridge", to: "show", label: t("표시", "show") },
        { from: "npc", to: "show", label: t("인사", "greet"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("말풍선 채팅 로직", "Bubble chat logic"),
        role: t(
          "범위 판정·로그 누적(최근 100개)·말풍선 표시 시간·타이핑 만료·기본 금칙 마스킹을 순수 로직으로 다루고, 전송·수신은 프레즌스 컨트롤러가 맡습니다.",
          "Scope judgement, log accumulation (the latest 100), bubble display time, typing expiry and basic profanity masking are handled as pure logic, while sending and receiving belong to the presence controller.",
        ),
        paths: [`${V}/studio-virtual-space-chat.ts`, `${V}/studio-virtual-space-presence.ts#sendChat`],
      },
      {
        feature: t("이모트 카탈로그와 이모트 선택기", "Emote catalog and the emote picker"),
        role: t(
          "카탈로그 전 17종을 이모트 선택기에 노출하고(단축키 보유 11종), 고른 이모트는 프레즌스 리액션으로 캔버스에 실행합니다.",
          "All 17 catalog emotes are exposed in the emote picker (11 carry shortcuts), and a picked emote plays on the canvas as a presence reaction.",
        ),
        paths: [`${V}/studio-virtual-space-emote-catalog.ts`, `${V}/hud/SpaceEmotePicker.tsx`],
      },
      {
        feature: t("NPC 캐스트와 인사 규칙", "NPC cast and greeting rules"),
        role: t(
          "캐스트 데이터가 NPC 스킨 8종을 제공하고, NPC 모듈이 상주 정의 6종과 인사 반경 130px·쿨다운 90초를 정합니다. 매니페스트 NPC는 8종에 확장 6종을 더합니다.",
          "The cast data provides 8 NPC skins, and the NPC module sets 6 resident definitions and the 130 px greeting radius with a 90-second cooldown. Manifest NPCs add 6 extended ones to 8 base ones.",
        ),
        paths: [`${V}/studio-virtual-space-npc-cast.ts`, `${V}/studio-virtual-space-npc.ts`, `${V}/studio-virtual-space-world-manifest.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("받는 쪽 검사: 순서와 거리", "Receiver check: order and distance"),
        language: "ts",
        code: `// "근처" 채팅은 보낸 사람과의 거리로 거르고, 같은 사용자의 패킷은 번호가 커질 때만 받는다(presence 의 단순화).
const NEARBY_PX = 200;
type ChatPacket = { sequence: number; scope: "nearby" | "all"; text: string };
const lastSequence = new Map<string, number>();

export function acceptChat(sender: string, packet: ChatPacket, distancePx: number | null): boolean {
  if (packet.sequence <= (lastSequence.get(sender) ?? -1)) return false; // 낡은 패킷·중복은 버린다
  lastSequence.set(sender, packet.sequence);
  if (packet.scope === "all") return true;
  return distancePx !== null && distancePx <= NEARBY_PX; // 위치를 모르면 판정할 수 없어 버린다
}`,
        codeEn: `// Filter "nearby" chat by distance to the sender and accept a user's packets only as their number grows (simplified from presence).
const NEARBY_PX = 200;
type ChatPacket = { sequence: number; scope: "nearby" | "all"; text: string };
const lastSequence = new Map<string, number>();

export function acceptChat(sender: string, packet: ChatPacket, distancePx: number | null): boolean {
  if (packet.sequence <= (lastSequence.get(sender) ?? -1)) return false; // drop stale packets and duplicates
  lastSequence.set(sender, packet.sequence);
  if (packet.scope === "all") return true;
  return distancePx !== null && distancePx <= NEARBY_PX; // without a position it cannot judge, so drop it
}`,
        explain: t(
          "서버가 걸러 주지 않으니 거르는 일은 받는 쪽 몫입니다. 순서 검사를 먼저 하고, 그다음에 범위가 nearby일 때만 거리를 봅니다. 위치를 아직 모르는 사람의 근처 채팅은 버립니다.",
          "With no server filtering, filtering is the receiver's job. The order check comes first, and only then is distance examined for the nearby scope. Nearby chat from someone whose position is not yet known is dropped.",
        ),
        source: `${V}/studio-virtual-space-presence.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("연타를 막는 리액션 게이트", "A reaction gate that stops mashing"),
        language: "ts",
        code: `// 같은 사용자의 리액션 패킷은 250ms 안에 한 번만 통과시킨다(프로토콜 상수의 단순화).
const THROTTLE_MS = 250;
export class ReactionGate {
  private last = Number.NEGATIVE_INFINITY;
  tryPass(now: number): boolean {
    if (now - this.last < THROTTLE_MS) return false; // 너무 일러서 버린다
    this.last = now;
    return true;
  }
}`,
        codeEn: `// Let a given user's reaction packet through at most once per 250 ms (simplified from the protocol constants).
const THROTTLE_MS = 250;
export class ReactionGate {
  private last = Number.NEGATIVE_INFINITY;
  tryPass(now: number): boolean {
    if (now - this.last < THROTTLE_MS) return false; // too soon, drop it
    this.last = now;
    return true;
  }
}`,
        explain: t(
          "마지막으로 보낸 시각만 기억하면 되는 가장 단순한 쓰로틀입니다. 받는 쪽의 표시 만료 시간과 짝을 이루어, 보내는 쪽이 폭주해도 화면이 이모트로 가득 차지 않습니다.",
          "The simplest throttle needs only the last send time. Paired with the receiver's display expiry, even a flooding sender cannot fill the screen with emotes.",
        ),
        source: `${V}/studio-virtual-space-presence-protocol.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · RTCDataChannel", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel", kind: "docs", note: t("패킷이 오가는 길", "The path the packets travel") },
      { title: "CSS-Tricks · Debouncing and Throttling Explained", url: "https://css-tricks.com/debouncing-throttling-explained-examples/", kind: "article", note: t("연타를 다루는 두 방법", "Two ways to handle rapid input") },
      { title: "Phaser · Documentation", url: "https://docs.phaser.io/", kind: "docs", note: t("NPC와 말풍선이 표시되는 캔버스 엔진 문서", "Docs of the canvas engine where NPCs and bubbles show") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "가벼운 소통의 규칙은 셸 코드에 있고 표시는 캔버스와 나뉩니다. 말풍선 채팅은 근처(채팅 로직이 200px로 정의)나 방 전체로 보내고, 문장은 140자로 다듬어 금칙어를 두 번 가립니다. 이모트는 카탈로그 17종에 250ms 쓰로틀이 있고, 선택기에서 골라 캔버스에 실행합니다. NPC는 근접 모듈이 거리 130px와 쿨다운 90초로 인사를 겁니다.",
        "The rules of light communication live in shell code, and display is split with the canvas. Bubble chat goes nearby (defined as 200 px by the chat logic) or to the whole room, with text trimmed to 140 characters and profanity masked twice. Emotes have a catalog of 17 with a 250 ms throttle, picked in the picker and played on the canvas. NPCs greet through the proximity module, at a distance of 130 px with a 90-second cooldown.",
      ),
      analogy: t(
        "복도에서 옆 사람에게만 들리게 말하는 것과 방 전체에 외치는 것의 차이입니다. 그리고 안내 데스크 직원은 대본을 들고, 손님이 가까이 오면 인사하되 방금 인사한 손님에게는 잠시 쉬었다가 다시 인사합니다.",
        "It is the difference between speaking so only the person next to you hears and shouting to the whole room. And the information-desk staff carry a script: they greet a guest who comes close, but rest a while before greeting the same guest again.",
      ),
      questions: [
        {
          question: t("NPC는 가까이 가면 인사하나요?", "Do NPCs greet you when you approach?"),
          answer: t(
            "네. 근접 모듈이 NPC마다 마지막 인사 시각을 기억하고, 130px 안에 들어온 사용자에게 인사합니다. 같은 NPC는 90초 쿨다운이 지나야 다시 인사합니다.",
            "Yes. The proximity module remembers each NPC's last greeting time and greets a user who comes within 130 px. The same NPC greets again only after a 90-second cooldown.",
          ),
        },
        {
          question: t("욕설 필터가 있나요?", "Is there a profanity filter?"),
          answer: t(
            "기본 금칙어 마스킹이 보내기 전과 받을 때 두 번 적용되지만, 최소 집합이라고 코드가 밝히므로 완전한 필터는 아닙니다.",
            "A basic banned-word mask is applied twice, before sending and on receipt, but the code calls it a minimum set, so it is not a complete filter.",
          ),
        },
        {
          question: t("근처 채팅은 서버가 거르나요?", "Does the server filter nearby chat?"),
          answer: t(
            "아니요. 받는 쪽이 순서와 거리를 검사해 거릅니다. 그래서 수신 쪽 검증이 필수입니다.",
            "No. The receiver checks order and distance and filters. That is why receiver-side validation is essential.",
          ),
        },
      ],
      pitfall: t(
        "NPC 인사 수치가 제거됐다고 말하지 마세요. 반경 130px와 쿨다운 90초는 현행 NPC 모듈의 상수입니다. 채팅의 '보안'을 보장한다고도 말하지 마세요. 서버에 저장하지 않는 것과 같은 방 사람에게 전달되는 것은 다릅니다.",
        "Do not say the NPC greeting figures were removed. The 130 px radius and 90-second cooldown are constants of the current NPC module. Do not claim chat 'security' either: not being stored on a server differs from being delivered to people in the room.",
      ),
    },
    technologies: ["RTCDataChannel", "Phaser", "TypeScript"],
    facts: [
      { value: "200px", label: t("'근처' 채팅 범위(채팅 로직의 정의값)", "'Nearby' chat range (defined by the chat logic)"), source: `${V}/studio-virtual-space-chat.ts` },
      { value: "250ms", label: t("리액션 패킷 송신 간격 하한(설계값)", "Minimum send interval for reaction packets (design value)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "17종", label: t("이모트 종류(표시 시간은 이모트마다 1.8~4초)", "Number of emotes (display time 1.8 to 4 s per emote)"), source: `${V}/studio-virtual-space-emote-catalog.ts` },
      { value: "130px · 90초", label: t("NPC 인사 반경 · 인사 쿨다운", "NPC greeting radius and greeting cooldown"), source: `${V}/studio-virtual-space-npc.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
