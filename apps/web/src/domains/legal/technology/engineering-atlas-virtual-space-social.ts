import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 4: 프레즌스·보간 · 근접(구역) 판정 · 근접 영상 정원 · 채팅/리액션/NPC.
 * 웹(Phaser) 공간 클라이언트 제거와 Godot 무대 교체 이후의 현행 구조로 개편했다.
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
      "위치 패킷은 셸이 직접 연결과 릴레이로 주고받고, 무대 안 아바타 표시는 Godot가 맡습니다.",
      "The shell exchanges position packets directly or by relay, and Godot draws the avatars on stage.",
    ),
    background: [
      t(
        "공간 클라이언트가 Godot 무대로 교체되면서, 웹 캔버스에서 상대 아바타를 직접 그리던 시각 계층은 제거됐습니다. 남은 것은 웹 셸의 프레즌스 계약입니다. 보내는 간격과 하트비트, 패킷 크기 상한, 순서 규칙은 프로토콜 모듈에 있고, 받은 위치 표본을 늦춰 재생하는 보간 타임라인도 셸 코드로 남아 있습니다. 무대 안에서 아바타를 그리는 일은 Godot가 맡습니다.",
        "When the space client was replaced by the Godot stage, the visual layer that drew other avatars directly on a web canvas was removed. What remains is the web shell's presence contract: the send interval, heartbeat, packet size cap and ordering rules live in the protocol module, and the interpolation timeline that replays received position samples late also stays in shell code. Drawing avatars inside the stage is Godot's job.",
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
        "전송 경로는 직접 연결이 기본이고, 직접 연결이 성립하지 않은 상대에게는 소켓 릴레이로 폴백해 프레즌스 레인이 죽지 않게 합니다. ICE는 Cloudflare STUN 전용이라 TURN 중계는 없습니다. 위치처럼 짧고 잦은 정보를 서버에 쌓지 않으려는 선택이며, 대가로 상대가 늘면 직접 연결 수도 늘어 정원이 작습니다.",
        "The transport prefers direct connections, and for a peer whose direct connection cannot be established it falls back to a socket relay so the presence lane does not die. ICE is Cloudflare STUN only, so there is no TURN relay. This keeps short, frequent data like positions off a server, at the price that more people mean more direct connections and a small capacity.",
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
        "내 셸이 90ms 틱마다 자세가 바뀌었는지 보고 바뀌면 시퀀스 번호가 붙은 패킷을 직접 포트로 보냅니다. 직접 연결이 없는 상대에게는 소켓 릴레이로 갑니다. 상대 셸은 낡은 패킷과 다른 월드의 패킷을 버리고 표본을 보간 타임라인에 넣습니다. 타임라인은 100ms 과거를 재생해 두 점 사이를 이어 쓰고, 소식이 끊기면 최대 250ms만 연장합니다. 무대 안 아바타 표시는 Godot가 맡습니다.",
        "My shell checks every 90 ms tick whether the pose changed and, if so, sends a sequence-numbered packet over the direct port, or by socket relay for a peer with no direct connection. The other shell drops stale packets and packets from another world, then feeds samples into the interpolation timeline. The timeline replays 100 ms in the past, drawing between two points, and extends for at most 250 ms if updates stop. Godot draws the avatars inside the stage.",
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
        "프레즌스는 웹 셸이 맡습니다. 90ms마다 변화가 있을 때만 위치 패킷을 보내고, 변화가 없어도 2.5초마다 생존 신호를 보냅니다. 받는 쪽은 패킷 번호로 낡은 것을 거르고, 표본을 100ms 늦춰 재생해 사이를 이어 씁니다. 직접 연결이 안 되는 상대에게는 소켓 릴레이로 폴백하고, 무대 안 아바타 표시는 Godot가 맡습니다.",
        "Presence belongs to the web shell. A position packet is sent every 90 ms only when something changed, plus a liveness signal every 2.5 seconds. The receiver filters stale packets by number and replays samples 100 ms late, linking the gaps. A peer with no direct connection falls back to a socket relay, and Godot draws the avatars inside the stage.",
      ),
      analogy: t(
        "영화 필름처럼 몇 장의 사진만 받아도 사이를 이어 붙여 움직임으로 보여 주는 방식입니다. 일부러 조금 늦게 틀어서, 중간에 사진 한 장이 늦게 와도 끊기지 않게 합니다.",
        "It works like film: even a few photos are enough, because the gaps are joined into motion. It deliberately plays a little late so one late photo does not cause a stutter.",
      ),
      questions: [
        {
          question: t("Phaser가 그리던 상대 아바타는 어떻게 됐나요?", "What happened to the avatars the Phaser canvas drew?"),
          answer: t(
            "웹 캔버스의 피어 시각 계층은 Godot 무대 교체와 함께 제거됐습니다. 셸에는 프레즌스 송수신과 표본 보간 규칙이 남았고, 무대 안 표시는 Godot가 맡습니다.",
            "The web canvas peer-visual layer was removed with the move to the Godot stage. The shell keeps presence exchange and the sample interpolation rules, and Godot handles the in-stage drawing.",
          ),
        },
        {
          question: t("직접 연결이 안 되면 프레즌스도 끊기나요?", "Does presence die when a direct connection fails?"),
          answer: t(
            "아니요. 직접 연결이 성립하지 않은 상대의 프레즌스 레인은 소켓 릴레이로 폴백합니다. ICE는 STUN 전용이라 TURN 중계는 없습니다.",
            "No. The presence lane of a peer whose direct connection cannot be established falls back to a socket relay. ICE is STUN only, so there is no TURN relay.",
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
        "90ms·100ms·250ms는 셸 프레즌스 계약의 설계값입니다. Godot 무대 내부의 보간 수치로 말하지 마세요. 무대 내부 렌더링 세부와 네트워크별 체감 측정은 이 카드에서 확인하지 못했습니다.",
        "The 90 ms, 100 ms and 250 ms figures are design values of the shell presence contract. Do not present them as interpolation figures inside the Godot stage. The stage's internal rendering details and per-network perception were not verified here.",
      ),
    },
    technologies: ["RTCDataChannel", "WebRTC", "Godot"],
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
    title: t("구역 판정은 Godot 무대가 하고, 셸은 결과만 받아 동선을 엽니다", "Godot judges zones, and the shell only receives the result to open flows"),
    status: "live",
    tagline: t(
      "클래식 px 히스테리시스는 제거됐고, 지금 근접을 정하는 것은 Godot 무대의 구역 판정입니다.",
      "The classic pixel hysteresis is gone; proximity is now decided by zone judgement in the Godot stage.",
    ),
    background: [
      t(
        "가까워지면 반응하고 멀어지면 그만두는 규칙에서 거리 기준을 하나만 쓰면, 경계선에 선 사람이 한 걸음 흔들릴 때마다 반응이 번쩍거립니다. 에어컨이 켜지는 온도와 꺼지는 온도를 다르게 두듯 들어올 때와 나갈 때 기준을 나누는 발상이 히스테리시스입니다. 이 개념 자체는 지금도 유효하지만, 그것을 구현하던 웹 클라이언트의 거리 규칙은 사라졌습니다.",
        "If a react-when-near rule uses a single distance, someone standing on the boundary makes the reaction flash on every step. Splitting the enter and leave thresholds, like an air conditioner that turns on and off at different temperatures, is the idea of hysteresis. The concept is still valid, but the web client's distance rules that implemented it are gone.",
      ),
      t(
        "클래식 클라이언트에는 160px에 인사하고 220px에 작별하는 식의 px 단위 근접 규칙과 그 테스트, 서클·트리거 모듈이 있었습니다. Phaser 공간이 제거되면서 이 모듈들도 함께 삭제됐습니다. 그래서 그 수치들은 이제 현행 동작이 아니라, 교체 전에 코드에 있던 설계 상수의 기록일 뿐입니다. 이 카드의 사실(facts)에도 싣지 않습니다.",
        "The classic client had pixel-based proximity rules, such as greeting at 160 px and farewell at 220 px, with their tests and circle and trigger modules. When the Phaser space was removed, those modules were deleted with it. So those figures are no longer current behavior, only a record of design constants that existed before the replacement, and they are not carried in this card's facts.",
      ),
      t(
        "현행 근접 판정은 Godot 무대가 소유합니다. 공간 정의는 구역을 사각형(rect)과 종류로 선언합니다. 종류는 회의(meeting)·발표(presentation)·집중(focus)·라운지(lounge)·열린 공간(open) 다섯 가지이고, 공간 하나에 구역은 최대 24개까지 선언할 수 있습니다. 무대는 구역이 바뀌면 점유자 목록과 함께 셸에 통지하고(onZoneChanged), 근처 인원 수가 바뀌면 그 크기를 따로 알립니다(onProximityChanged).",
        "Proximity judgement now belongs to the Godot stage. A space definition declares zones as rectangles with a kind: meeting, presentation, focus, lounge or open, up to 24 zones per space. When a zone changes, the stage notifies the shell with the occupant list (onZoneChanged), and when the nearby headcount changes it reports the size separately (onProximityChanged).",
      ),
      t(
        "셸은 거리를 다시 재지 않습니다. 통지받은 구역 결과로만 동선을 엽니다. 내가 회의 종류 구역에 상대와 함께 있으면 회의 화상 패널이 준비 상태가 되고, 근처 인원이 2명 이상이면 말풍선 대화 중임을 표시합니다. 판정 권한이 무대 하나에만 있어, 셸과 무대가 서로 다른 근접 결론을 내는 일이 없습니다.",
        "The shell never re-measures distance. It opens flows only from the zone results it is told: if I am in a meeting-kind zone together with a partner, the meeting video panel becomes ready, and if two or more people are nearby, it shows that a bubble conversation is on. With judgement authority in the stage alone, the shell and the stage cannot reach different proximity conclusions.",
      ),
    ],
    keyPoints: [
      t("클래식 px 규칙은 제거됐고 현행 수치가 아닙니다", "The classic pixel rules are removed, not current figures"),
      t("구역·근접 판정은 Godot 무대, 셸은 통지만 받습니다", "Godot judges zones; the shell only gets notified"),
      t("회의 구역 동행이 화상을, 근접 인원이 말풍선을 엽니다", "Sharing a meeting zone opens video; nearby people open chat"),
    ],
    diagram: {
      id: "proximity-hysteresis-160-220-diagram",
      kind: "graph",
      title: t("구역 판정에서 셸 동선까지", "From zone judgement to shell flows"),
      caption: t(
        "판정은 무대에서 한 번만 일어나고, 셸은 결과를 받아 화면 동선만 엽니다.",
        "Judgement happens once, on stage, and the shell opens screen flows from the result.",
      ),
      alt: t(
        "아바타가 Godot 무대 안을 이동하면 무대가 공간 정의의 구역 사각형으로 현재 구역과 근접 인원을 판정합니다. 결과는 브리지 통지로 웹 셸에 전달되고, 셸은 회의 구역 동행이면 화상 패널을, 근접 인원이 있으면 말풍선 표시를 엽니다. 셸이 거리를 다시 계산하는 단계는 없습니다.",
        "As an avatar moves inside the Godot stage, the stage judges the current zone and nearby headcount against the zone rectangles of the space definition. The result travels to the web shell as a bridge notification, and the shell opens the video panel when a meeting zone is shared, or the bubble indicator when people are nearby. There is no step where the shell recomputes distance.",
      ),
      nodes: [
        { id: "avatar", label: t("아바타 이동", "Avatar moves"), sub: t("Godot 무대 안", "Inside the Godot stage"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "zone", label: t("구역 판정", "Zone judgement"), sub: t("정의의 구역 사각형", "Zone rectangles of the definition"), tone: "local", at: [1, 0] },
        { id: "bridge", label: t("브리지 통지", "Bridge notice"), sub: t("구역·근접 변경", "Zone and proximity changes"), tone: "edge", at: [2, 0] },
        { id: "shell", label: t("웹 셸", "Web shell"), sub: t("결과만 수신", "Receives results only"), tone: "warn", at: [3, 0] },
        { id: "panel", label: t("화상·말풍선", "Video and bubbles"), sub: t("동선 열기", "Flows open"), tone: "good", shape: "pill", at: [4, 0] },
      ],
      edges: [
        { from: "avatar", to: "zone", label: t("이동", "move") },
        { from: "zone", to: "bridge", label: t("변경 시", "on change") },
        { from: "bridge", to: "shell", label: t("통지", "notify") },
        { from: "shell", to: "panel", label: t("열기", "open") },
      ],
    },
    usage: [
      {
        feature: t("공간 정의의 구역 스키마", "Zone schema of the space definition"),
        role: t(
          "구역 종류 다섯 가지와 사각형, 공간당 구역 최대 24개를 셸 측 공간 정의 스키마가 검증합니다. 무대는 이 정의의 소비자입니다.",
          "The shell-side space definition schema validates the five zone kinds, their rectangles and a maximum of 24 zones per space. The stage consumes this definition.",
        ),
        paths: [`${V}/studio-godot-space.ts`],
      },
      {
        feature: t("무대→셸 구역·근접 통지", "Stage-to-shell zone and proximity notices"),
        role: t(
          "구역 변경 통지는 점유자·이름·발표자를 실어 오고, 근접 통지는 근처 인원 수를 실어 옵니다. 셸 임베드가 이를 받아 상태로 둡니다.",
          "A zone-change notice carries occupants, names and the presenter, and a proximity notice carries the nearby headcount. The shell embed receives them as state.",
        ),
        paths: [`${V}/studio-godot-space-embed-support.ts`, `${V}/StudioGodotSpaceEmbed.tsx`],
      },
      {
        feature: t("구역 결과로 열리는 동선", "Flows opened by zone results"),
        role: t(
          "내가 회의 구역에 상대와 함께 있는지가 회의 화상 세션의 시작 조건이 되고, 근접 인원 2명 이상이 말풍선 대화 표시의 조건이 됩니다.",
          "Whether I share a meeting zone with a partner becomes the start condition of the meeting video session, and two or more nearby people become the condition for the bubble-chat indicator.",
        ),
        paths: [`${V}/studio-godot-meeting-session.ts`, `${V}/StudioGodotSpaceEmbed.tsx`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("구역 사각형으로 현재 구역 판정하기", "Judging the current zone by rectangle"),
        language: "ts",
        code: `// 공간 정의의 구역 사각형(rect)으로 점이 어느 구역에 있는지 정한다(공간 정의 스키마의 단순화).
type ZoneKind = "meeting" | "presentation" | "focus" | "lounge" | "open";
type Zone = { id: string; kind: ZoneKind; rect: [number, number, number, number] }; // [x, y, 너비, 높이]

export function zoneAt(zones: readonly Zone[], x: number, y: number): Zone | null {
  for (const zone of zones) {
    const [zx, zy, w, h] = zone.rect;
    if (x >= zx && x < zx + w && y >= zy && y < zy + h) return zone;
  }
  return null; // 어느 구역에도 없으면 null — 셸은 이 결과를 통지로만 받는다
}`,
        codeEn: `// Decide which zone a point is in, using the zone rectangles of a space definition (simplified from the definition schema).
type ZoneKind = "meeting" | "presentation" | "focus" | "lounge" | "open";
type Zone = { id: string; kind: ZoneKind; rect: [number, number, number, number] }; // [x, y, width, height]

export function zoneAt(zones: readonly Zone[], x: number, y: number): Zone | null {
  for (const zone of zones) {
    const [zx, zy, w, h] = zone.rect;
    if (x >= zx && x < zx + w && y >= zy && y < zy + h) return zone;
  }
  return null; // in no zone, null — the shell receives this result only as a notice
}`,
        explain: t(
          "판정은 거리가 아니라 선언된 사각형 포함 여부입니다. 셸은 이 계산을 다시 하지 않고, 무대가 통지한 구역 결과를 받아 동선만 엽니다.",
          "Judgement is rectangle inclusion in a declared zone, not distance. The shell does not redo this computation; it receives the zone result from the stage and only opens flows.",
        ),
        source: `${V}/studio-godot-space.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("구역 통지를 셸 상태로 바꾸기", "Turning a zone notice into shell state"),
        language: "ts",
        code: `// 무대의 구역 변경 통지(JSON)를 셸이 쓰는 형태로 거른다(임베드 보조 모듈의 단순화).
export type ZoneInfo = { selfZoneId: string; occupants: readonly string[] };

export function parseZoneNotice(json: string): ZoneInfo | null {
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.selfZoneId !== "string") return null;
    const zones = Array.isArray(record.zones) ? record.zones : [];
    const self = zones.find((z) => typeof z === "object" && z !== null && (z as { zoneId?: unknown }).zoneId === record.selfZoneId) as { occupants?: unknown } | undefined;
    const occupants = Array.isArray(self?.occupants) ? self.occupants.filter((o): o is string => typeof o === "string") : [];
    return { selfZoneId: record.selfZoneId, occupants };
  } catch { return null; } // 형식이 다르면 통지를 버린다
}`,
        codeEn: `// Filter a stage zone-change notice (JSON) into the shape the shell uses (simplified from the embed support module).
export type ZoneInfo = { selfZoneId: string; occupants: readonly string[] };

export function parseZoneNotice(json: string): ZoneInfo | null {
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.selfZoneId !== "string") return null;
    const zones = Array.isArray(record.zones) ? record.zones : [];
    const self = zones.find((z) => typeof z === "object" && z !== null && (z as { zoneId?: unknown }).zoneId === record.selfZoneId) as { occupants?: unknown } | undefined;
    const occupants = Array.isArray(self?.occupants) ? self.occupants.filter((o): o is string => typeof o === "string") : [];
    return { selfZoneId: record.selfZoneId, occupants };
  } catch { return null; } // a malformed notice is dropped
}`,
        explain: t(
          "셸은 무대가 보낸 JSON을 믿고 쓰지 않고, 필요한 필드만 골라 자기 상태로 바꿉니다. 판정은 무대가 끝냈고, 셸의 일은 검증과 표시뿐입니다.",
          "The shell does not trust the stage's JSON blindly; it picks only the fields it needs into its own state. Judgement is finished on stage, and the shell's job is validation and display.",
        ),
        source: `${V}/studio-godot-space-embed-support.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "Wikipedia · Hysteresis", url: "https://en.wikipedia.org/wiki/Hysteresis", kind: "article", note: t("히스테리시스의 일반 개념", "The general concept of hysteresis") },
      { title: "Wikipedia · Schmitt trigger", url: "https://en.wikipedia.org/wiki/Schmitt_trigger", kind: "article", note: t("켜는 기준과 끄는 기준을 나눈 회로", "A circuit with separate on and off thresholds") },
      { title: "Godot Engine · Documentation", url: "https://docs.godotengine.org/en/stable/", kind: "docs", note: t("무대 엔진의 공식 문서", "Official docs of the stage engine") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "근접 판정의 주인이 바뀌었습니다. 예전 웹 클라이언트의 px 단위 히스테리시스 규칙은 Phaser 공간과 함께 제거됐고, 지금은 Godot 무대가 공간 정의의 구역 사각형으로 현재 구역과 근접 인원을 판정해 셸에 통지합니다. 셸은 거리를 다시 재지 않고, 회의 구역에 함께 있으면 화상 패널을 열고 근처 인원이 있으면 말풍선 표시를 켭니다.",
        "The owner of proximity judgement changed. The old web client's pixel hysteresis rules were removed with the Phaser space, and now the Godot stage judges the current zone and nearby headcount against the zone rectangles of the space definition and notifies the shell. The shell never re-measures distance: sharing a meeting zone opens the video panel, and nearby people turn on the bubble indicator.",
      ),
      analogy: t(
        "건물의 방과 같습니다. 옆 사람과의 거리를 자로 재는 대신, 같은 회의실에 들어와 있는지가 동선을 정합니다. 방 배치는 공간 정의가, 출입 확인은 무대가 합니다.",
        "It is like rooms in a building. Instead of measuring the distance to the next person with a ruler, sharing a meeting room decides the flow. The definition lays out the rooms, and the stage checks who entered.",
      ),
      questions: [
        {
          question: t("160/220px 규칙은 지금도 도나요?", "Does the 160/220 px rule still run?"),
          answer: t(
            "아니요. 그 규칙과 테스트, 관련 모듈은 클래식 클라이언트 제거와 함께 삭제됐습니다. 현행 판정은 무대의 구역 판정이며, 셸 저장소에서 확인되는 px 임계값은 없습니다.",
            "No. That rule, its tests and the related modules were deleted with the classic client. Current judgement is zone-based on stage, and no pixel threshold for it is found in the shell repository.",
          ),
        },
        {
          question: t("구역은 몇 종류인가요?", "How many zone kinds are there?"),
          answer: t(
            "다섯 종류입니다. 회의(meeting)·발표(presentation)·집중(focus)·라운지(lounge)·열린 공간(open)이고, 공간 하나에 구역은 최대 24개까지 선언할 수 있습니다.",
            "Five kinds: meeting, presentation, focus, lounge and open, and a space can declare up to 24 zones.",
          ),
        },
        {
          question: t("셸이 거리를 재서 한 번 더 확인하나요?", "Does the shell re-measure distance to double-check?"),
          answer: t(
            "아니요. 셸은 무대의 구역·근접 통지를 검증해 상태로만 둡니다. 판정 권한이 하나라 셸과 무대의 결론이 갈릴 수 없습니다.",
            "No. The shell validates the stage's zone and proximity notices and keeps them as state. With a single judgement authority, the shell and the stage cannot disagree.",
          ),
        },
      ],
      pitfall: t(
        "클래식 px 수치(160/220 등)를 현행 동작으로 말하지 마세요. 그 구현은 삭제됐고 이 카드의 사실에도 없습니다. 무대 내부의 세부 판정 방식은 셸 코드만으로 확인되지 않으므로, 확인된 범위(구역 스키마와 통지 계약)까지만 말하세요.",
        "Do not present the classic pixel figures (such as 160/220) as current behavior. That implementation was deleted and is not in this card's facts. The stage's internal judgement details cannot be verified from shell code alone, so speak only to what is verified: the zone schema and the notice contract.",
      ),
    },
    technologies: ["Godot", "Hysteresis", "TypeScript"],
    facts: [
      { value: "5종", label: t("구역 종류(meeting·presentation·focus·lounge·open)", "Zone kinds (meeting, presentation, focus, lounge, open)"), source: `${V}/studio-godot-space.ts` },
      { value: "24개", label: t("공간 정의당 구역 수 상한(스키마)", "Max zones per space definition (schema)"), source: `${V}/studio-godot-space.ts` },
      { value: "64개", label: t("공간 정의당 소품(props) 수 상한(스키마)", "Max props per space definition (schema)"), source: `${V}/studio-godot-space.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "proximity-video-capacity-chain",
    category: "virtual-space",
    name: "Proximity video",
    title: t("회의 구역에 함께 들어가면 셸 패널에서 화상이 붙는 구조와 정원", "Video that attaches in the shell panel when you share a meeting zone, and its capacity"),
    status: "configured",
    tagline: t(
      "화상 조건은 px 거리가 아니라 회의 구역 동행이고, 허들 원격 상한은 3명, 방 연결 상한은 64입니다.",
      "Video needs a shared meeting zone, not pixel distance; the huddle remote cap is 3 and a room allows 64 connections.",
    ),
    background: [
      t(
        "가까이 가면 영상이 붙던 클래식 근접 영상은 HUD 모듈과 함께 제거됐습니다. 지금의 동선은 구역입니다. Godot 무대가 회의 구역 진입을 판정해 셸에 알리면, 나와 상대가 같은 회의 구역에 있을 때 셸의 회의 패널이 준비 상태가 됩니다. 시작 버튼을 눌러야 카메라와 마이크 권한을 요청하므로, 구역에 들어간 것만으로 카메라는 켜지지 않습니다.",
        "The classic proximity video that attached as you walked close was removed with its HUD modules. The current trigger is a zone. When the Godot stage judges meeting-zone entry and tells the shell, the shell's meeting panel becomes ready once you and a partner share a meeting zone. Camera and microphone permission is requested only when the start button is pressed, so entering a zone alone never turns the camera on.",
      ),
      t(
        "화상 연결은 웹 셸이 소유합니다. 회의 세션 모듈이 RTCPeerConnection과 미디어를 관리하고, 신호는 Godot 브리지를 거쳐 Worker의 화면 신호 채널로 오갑니다. ICE는 서버 정책이 주입한 STUN 전용 팩토리로만 만듭니다. TURN은 비용 발생 리스크 때문에 쓰지 않으며, 협상 시작 후 25초 안에 ICE가 연결되지 않으면 폴백 상태로 수렴합니다.",
        "The video connection is owned by the web shell. The meeting session module manages the RTCPeerConnection and media, and signals travel through the Godot bridge to the Worker's screen-signaling channel. ICE connections are made only by the STUN-only factory injected by server policy. TURN is not used because of cost risk, and if ICE has not connected within 25 seconds of negotiation starting, the session settles into the fallback state.",
      ),
      t(
        "P2P가 막힌 네트워크에서는 화상이 릴레이로 이어지지 않습니다. 패널은 그 상태를 '폴백'으로 정직하게 표기하고, 공간 프레즌스와 채팅은 WebSocket 보장 경로로 계속 동작합니다. 미디어 릴레이가 없다는 한계를 숨기지 않는 것이 이 설계의 일부입니다. 복구는 재시도로만 합니다.",
        "On a network where peer-to-peer is blocked, video is not carried by a relay. The panel honestly labels that state as a fallback, and space presence and chat keep working over the guaranteed WebSocket path. Not hiding the absence of a media relay is part of this design, and recovery is by retry only.",
      ),
      t(
        "'몇 명까지?'는 층마다 다릅니다. 실시간 방 하나의 연결 상한은 64이고, 직접 메시의 원격 기본 상한은 8명(나 포함 9명), 허들 화상의 원격 상한은 3명(나 포함 4명)이며, 회의 구역 세션 자체는 상대 1명과의 연결을 다룹니다. 층을 섞어 가장 큰 수를 정원으로 말하면 안 되고, 실제 화상 동선은 가장 안쪽 층이 정합니다.",
        "'How many people?' differs per layer. One realtime room allows 64 connections, the direct mesh defaults to 8 remote peers (9 with you), huddle video caps at 3 remote peers (4 with you), and the meeting-zone session itself handles a connection with one partner. Mixing layers and quoting the largest number as capacity is wrong; the innermost layer decides the actual video flow.",
      ),
    ],
    keyPoints: [
      t("조건은 px 거리가 아니라 회의 구역에 함께 있는 것", "The condition is sharing a meeting zone, not pixel distance"),
      t("화상은 셸이 소유하고 ICE는 STUN 전용, TURN 없음", "The shell owns video; ICE is STUN only, with no TURN"),
      t("허들 원격 상한 3명, 실시간 방 연결 상한은 64", "Huddle remote cap is 3; a realtime room allows 64"),
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
        "정원은 층으로 쌓여 있습니다. 실시간 방 연결 상한 64, 직접 메시 원격 8명(나 포함 9명), 허들 영상 원격 3명(나 포함 4명), 회의 구역 세션 상대 1명 순으로 좁아집니다. 그 아래에 시작 조건이 있습니다. Godot 무대가 회의 구역 동행을 판정해 알리고, 사용자가 시작 버튼을 눌러야 카메라와 마이크를 요청합니다.",
        "Capacity is layered: a realtime room allows 64 connections, the direct mesh 8 remote peers (9 with you), huddle video 3 remote peers (4 with you), and the meeting-zone session one partner. Below are the start conditions: the Godot stage judges and reports a shared meeting zone, and camera and microphone are requested only when the user presses start.",
      ),
      layers: [
        { id: "room", label: t("실시간 방 64 연결", "Realtime room: 64 connections"), sub: t("방당 연결 상한(Worker 설정)", "Per-room connection cap (Worker settings)"), tone: "neutral" },
        { id: "mesh", label: t("직접 메시 원격 8명 (나 포함 9명)", "Direct mesh: 8 remote (9 with you)"), sub: t("프레즌스·채팅 패킷이 오가는 메시", "The mesh carrying presence and chat packets"), tone: "edge", chips: ["RTCDataChannel"] },
        { id: "huddle", label: t("허들 영상 원격 3명 (나 포함 4명)", "Huddle video: 3 remote (4 with you)"), sub: t("허들 프로토콜의 원격 상한", "The huddle protocol remote cap"), tone: "good", chips: ["WebRTC"] },
        { id: "meeting", label: t("회의 구역 세션 상대 1명", "Meeting-zone session: 1 partner"), sub: t("셸 패널이 다루는 실제 화상 동선", "The actual video flow the shell panel handles"), tone: "local", chips: ["STUN only"] },
        { id: "zone", label: t("시작 조건", "Start conditions"), sub: t("무대의 회의 구역 판정 + 사용자 시작 버튼", "Stage meeting-zone judgement plus the user's start button"), tone: "warn" },
      ],
      brackets: [
        { label: t("정원: 층마다 다른 수", "Capacity: a number per layer"), layerIds: ["room", "mesh", "huddle", "meeting"] },
        { label: t("시작 조건", "Start conditions"), layerIds: ["zone"] },
      ],
    },
    usage: [
      {
        feature: t("회의 구역 화상 패널과 세션", "Meeting-zone video panel and session"),
        role: t(
          "구역 동행이 준비 상태를 만들고, 셸 세션이 RTC 연결·미디어·연결 경로 상태를 관리합니다. 경로는 P2P인지 폴백인지 패널에 표기됩니다.",
          "Sharing a zone creates the ready state, and the shell session manages the RTC connection, media and route state. The panel labels whether the route is peer-to-peer or fallback.",
        ),
        paths: [`${V}/StudioGodotMeetingPanel.tsx`, `${V}/studio-godot-meeting-session.ts`],
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
        title: t("둘 다 회의 구역에 있을 때만 시작 가능", "Startable only when both are in the meeting zone"),
        language: "ts",
        code: `// 회의 화상은 나와 상대가 모두 회의 구역에 있을 때만 준비 상태가 된다(회의 세션의 단순화).
export type MeetingRoute = "idle" | "ready" | "connecting" | "p2p" | "relay-fallback";
type Context = { selfInMeeting: boolean; peerInMeeting: boolean; peerClientId: string | null };

export function meetingRoute(ctx: Context, started: boolean): MeetingRoute {
  if (!ctx.selfInMeeting || !ctx.peerInMeeting || !ctx.peerClientId) return "idle"; // 혼자거나 구역 밖이면 시작할 수 없다
  if (!started) return "ready"; // 시작 버튼을 눌러야 카메라·마이크를 요청한다
  return "connecting";
}`,
        codeEn: `// Meeting video becomes ready only when both you and your partner are in the meeting zone (simplified from the meeting session).
export type MeetingRoute = "idle" | "ready" | "connecting" | "p2p" | "relay-fallback";
type Context = { selfInMeeting: boolean; peerInMeeting: boolean; peerClientId: string | null };

export function meetingRoute(ctx: Context, started: boolean): MeetingRoute {
  if (!ctx.selfInMeeting || !ctx.peerInMeeting || !ctx.peerClientId) return "idle"; // alone or outside the zone, it cannot start
  if (!started) return "ready"; // camera and microphone are asked only after pressing start
  return "connecting";
}`,
        explain: t(
          "구역 판정은 무대가 끝내서 알려 주고, 셸은 그 결과와 사용자의 시작 의사만으로 상태를 정합니다. 거리를 재는 단계는 없습니다.",
          "Zone judgement is finished on stage and reported; the shell decides state only from that result and the user's start intent. There is no distance-measuring step.",
        ),
        source: `${V}/studio-godot-meeting-session.ts`,
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
          "직접 연결이 뚫리지 않는 환경에서는 화상이 성립하지 않습니다. 그 한계는 패널의 폴백 표기로 드러내고, 프레즌스·채팅은 WebSocket 경로로 이어집니다.",
          "Where a direct connection cannot be established, video does not connect. That limit is surfaced by the panel's fallback label, while presence and chat continue over the WebSocket path.",
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
        "근접 화상의 조건이 바뀌었습니다. px 거리가 아니라 Godot 무대가 판정하는 회의 구역 동행이 조건이고, 화상은 웹 셸 패널이 소유합니다. 시작 버튼을 눌러야 카메라를 요청하고, ICE는 STUN 전용이라 P2P가 막히면 화상은 이어지지 않고 그 상태가 패널에 정직하게 표시됩니다. 정원은 층마다 달라서 방 연결 64, 메시 원격 8명, 허들 원격 3명, 회의 세션은 상대 1명입니다.",
        "The condition for proximity video changed. It is not pixel distance but sharing a meeting zone, as judged by the Godot stage, and the video itself is owned by the web shell panel. The camera is requested only after pressing start, ICE is STUN only, so when peer-to-peer is blocked the video does not connect and that state is shown honestly on the panel. Capacity differs per layer: 64 room connections, 8 mesh remote peers, 3 huddle remote peers, and one partner in the meeting session.",
      ),
      analogy: t(
        "회의실에 함께 들어가 앉아야 회의가 시작되는 것과 같습니다. 복도에서 가까이 스친다고 회의가 열리지는 않고, 회의실 문을 여는 것은 사용자의 시작 버튼입니다.",
        "It is like a meeting that starts only when you enter the meeting room together and sit down. Passing close in a corridor does not open a meeting, and the door is the user's start button.",
      ),
      questions: [
        {
          question: t("최대 몇 명까지 가능한가요?", "What is the maximum number of people?"),
          answer: t(
            "동선마다 다릅니다. 회의 구역 세션은 상대 1명과의 연결이고, 허들 화상은 원격 3명(나 포함 4명)이 상한입니다. 방 연결 상한 64는 화상 정원이 아닙니다.",
            "It depends on the flow. The meeting-zone session connects with one partner, and huddle video caps at 3 remote peers (4 with you). The room connection cap of 64 is not a video capacity.",
          ),
        },
        {
          question: t("카메라는 언제 켜지나요?", "When does the camera turn on?"),
          answer: t(
            "회의 구역에 함께 있어 준비 상태가 된 뒤, 시작 버튼을 누른 뒤에만 요청합니다. 공간이나 구역에 들어간 것만으로 요청하지 않습니다.",
            "Only after you are together in the meeting zone in the ready state and press start. Merely entering the studio or the zone never asks for it.",
          ),
        },
        {
          question: t("P2P가 막힌 네트워크에서는요?", "What about networks where peer-to-peer is blocked?"),
          answer: t(
            "화상은 이어지지 않고 패널이 폴백 상태를 표시합니다. TURN을 쓰지 않기로 한 결정의 한계이며, 프레즌스와 채팅은 WebSocket 보장 경로로 계속 동작합니다.",
            "Video does not connect and the panel shows the fallback state. That is the limit of the decision not to use TURN, while presence and chat keep working over the guaranteed WebSocket path.",
          ),
        },
      ],
      pitfall: t(
        "클래식 근접 영상의 px 수치나 '24명 지원'을 말하지 마세요. 그 구현은 제거됐습니다. 모든 수치는 설계·설정값이고, 네트워크 환경별 연결 성공률과 영상 품질은 확인하지 못했습니다.",
        "Do not quote the classic proximity video pixel figures or '24 people supported'. That implementation was removed. Every figure is a design or settings value, and connection success rates and video quality across network conditions were not verified.",
      ),
    },
    technologies: ["WebRTC", "Godot", "Cloudflare STUN"],
    facts: [
      { value: "3명", label: t("허들 영상 원격 참가자 상한(나 포함 4명)", "Huddle video remote-peer cap (4 including you)"), source: `${L}/huddle/studio-p2p-huddle-protocol.ts` },
      { value: "64", label: t("실시간 방당 연결 상한(Worker 설정값)", "Per-room realtime connection cap (Worker setting)"), source: `deploy/cloudflare-realtime/wrangler.jsonc` },
      { value: "8명", label: t("직접 메시 원격 기본 상한(나 포함 9명, 설계값)", "Default direct-mesh remote cap (9 including you, design value)"), source: `${L}/studio-live-p2p-overlay-transport.ts` },
      { value: "25초", label: t("회의 화상 ICE 연결 마감(협상 시작 후, 설계값)", "Meeting video ICE connect deadline after negotiation starts (design value)"), source: `${V}/studio-godot-meeting-session.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "chat-reactions-npc-greetings",
    category: "virtual-space",
    name: "Nearby chat",
    title: t("채팅 규칙은 셸 코드가 정하고, 말풍선과 NPC 표시는 무대 안에서", "Chat rules live in shell code; bubbles and NPCs show inside the stage"),
    status: "live",
    tagline: t(
      "말풍선 채팅은 셸에서 보내고 무대에 뜨며, NPC는 무대 안 캐릭터와 캐스트 데이터로 움직입니다.",
      "Bubble chat is sent from the shell and shown on stage, and NPCs move as in-stage characters with cast data.",
    ),
    background: [
      t(
        "공간에서는 영상 없이도 가볍게 소통할 수 있어야 합니다. 말풍선 채팅의 규칙은 셸의 채팅 도메인 로직이 정합니다. 범위는 '근처'와 '방 전체' 두 가지이고, 근처 범위는 200px로 정의되어 있습니다. 문장은 140자 안으로 다듬고 기본 금칙어 어간은 보내기 전과 받을 때 두 번 가립니다. 말풍선은 4초에 글자당 40ms를 더해 최대 10초 보이고, 로그는 최근 100개까지만 보관합니다.",
        "In the studio you should be able to communicate lightly without video. The rules of bubble chat are set by the shell's chat domain logic: the scope is either nearby or the whole room, and the nearby range is defined as 200 px. Text is trimmed to 140 characters and basic profanity stems are masked twice, before sending and on receipt. A bubble shows for 4 seconds plus 40 ms per character, up to 10 seconds, and the log keeps only the latest 100 messages.",
      ),
      t(
        "표시 경계는 셸과 무대로 나뉩니다. 셸 임베드의 채팅 폼에서 보낸 말풍선은 브리지를 통해 무대에 표시되고, 무대에서 온 말풍선과 이모트 통지는 셸의 채팅 기록에 쌓입니다. 이모트 바는 셸에 있고, 고른 이모트는 무대로 보내 실행합니다. 리액션 패킷은 연타를 막으려고 같은 사용자는 250ms에 한 번만 보내고, 이모트마다 표시 시간이 정해져 있습니다(카탈로그 17종, 1.8~4초).",
        "The display boundary splits between shell and stage. A bubble sent from the shell embed's chat form is shown on stage through the bridge, and bubble and emote notices coming from the stage accumulate in the shell's chat log. The emote bar lives in the shell, and a picked emote is sent to the stage to play. Reaction packets are sent by a given user at most once per 250 ms to stop mashing, and each emote has its own display time (17 in the catalog, 1.8 to 4 seconds).",
      ),
      t(
        "NPC는 이제 무대 안 캐릭터입니다. 클래식 클라이언트에서 거리와 쿨다운으로 인사를 만들던 NPC·이벤트 모듈은 제거됐습니다. 지금 NPC의 재료는 두 곳에 있습니다. 공간 정의는 NPC를 최대 6명까지 선언하고, 각 NPC는 이동 지점(2~16개)과 대사(최대 12개)를 가질 수 있습니다. 캐스트 데이터는 손으로 그린 NPC 스킨 8종을 제공합니다. 셸은 NPC 인사 거리나 쿨다운을 계산하지 않습니다.",
        "NPCs are now characters inside the stage. The NPC and event modules that produced greetings from distance and cooldowns in the classic client were removed. The material for NPCs now lives in two places: a space definition can declare up to 6 NPCs, each with waypoints (2 to 16) and lines (up to 12), and the cast data provides 8 hand-drawn NPC skins. The shell computes no NPC greeting distance or cooldown.",
      ),
      t(
        "입력 폭주는 보내는 쪽 쓰로틀과 받는 쪽 만료(TTL)의 이중 방어가 흔합니다. 입력 중 표시는 3.5초 안에 갱신이 없으면 스스로 사라집니다. 한계: 무대 내부에서 NPC가 언제 어떤 대사를 띄우는지의 세부 타이밍은 셸 코드에서 확인되지 않습니다. 욕설 마스킹은 '최소 집합'이라고 코드가 밝히고 있어 완전한 필터가 아닙니다.",
        "Input floods are commonly handled by a double defence: a sender-side throttle and a receiver-side expiry (TTL). The typing indicator disappears by itself if not refreshed within 3.5 seconds. Limits: the detailed timing of when an NPC shows which line inside the stage is not verified in shell code. The code itself calls the profanity masking a minimum set, so it is not a complete filter.",
      ),
    ],
    keyPoints: [
      t("'근처' 채팅 범위는 채팅 로직이 200px로 정의합니다", "'Nearby' chat range is defined as 200 px by the chat logic"),
      t("리액션은 250ms 쓰로틀, 이모트 카탈로그는 17종", "Reactions throttle at 250 ms; the emote catalog has 17"),
      t("NPC 재료는 공간 정의(최대 6명)와 캐스트 8종입니다", "NPC material is the definition (up to 6) and 8 cast skins"),
    ],
    diagram: {
      id: "chat-reactions-npc-greetings-diagram",
      kind: "graph",
      title: t("말풍선·이모트·NPC의 흐름", "The flow of bubbles, emotes and NPCs"),
      caption: t(
        "셸이 규칙으로 다듬어 무대에 표시하고, NPC는 무대 안 캐릭터로 따로 움직입니다.",
        "The shell tidies by rule and shows on stage, and NPCs move separately as in-stage characters.",
      ),
      alt: t(
        "채팅이나 이모트를 입력하면 셸의 채팅 로직이 140자 정리와 욕설 가림, 250ms 쓰로틀을 적용한 뒤 브리지로 무대에 보냅니다. 무대는 말풍선과 이모트를 표시하고, 그 통지는 셸의 채팅 기록에도 쌓입니다. NPC는 공간 정의의 대사와 이동 지점을 재료로 무대 안에서 따로 움직이며, 셸이 거리로 인사를 만들지 않습니다.",
        "Typing a chat or an emote passes through the shell chat logic's 140-character trimming, profanity masking and a 250 ms throttle before going to the stage over the bridge. The stage shows bubbles and emotes, and its notices also accumulate in the shell's chat log. NPCs move separately inside the stage from the lines and waypoints of the space definition, and the shell does not create greetings from distance.",
      ),
      nodes: [
        { id: "send", label: t("보내기", "Send"), sub: t("셸 채팅 폼·이모트 바", "Shell chat form and emote bar"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "tidy", label: t("정리·가리기", "Tidy and mask"), sub: t("140자 · 욕설 · 250ms", "140 chars, profanity, 250 ms"), tone: "local", at: [1, 0] },
        { id: "bridge", label: t("브리지", "Bridge"), sub: t("셸 ↔ 무대", "Shell to stage"), tone: "edge", shape: "cylinder", at: [2, 0] },
        { id: "show", label: t("말풍선·이모트 표시", "Bubbles and emotes"), sub: t("무대 안 · 셸 기록", "On stage, logged in shell"), tone: "good", at: [3, 0] },
        { id: "npc", label: t("NPC 캐릭터", "NPC characters"), sub: t("정의의 대사·이동 지점", "Lines and waypoints from the definition"), tone: "local", at: [2, 1] },
      ],
      edges: [
        { from: "send", to: "tidy", label: t("입력", "input") },
        { from: "tidy", to: "bridge", label: t("패킷", "packet") },
        { from: "bridge", to: "show", label: t("표시", "show") },
        { from: "npc", to: "show", label: t("무대 안", "on stage"), style: "dashed" },
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
        feature: t("이모트 카탈로그와 셸 이모트 바", "Emote catalog and the shell emote bar"),
        role: t(
          "카탈로그 17종 중 단축키가 있는 10종을 셸 이모트 바 버튼으로 노출하고, 고른 이모트는 브리지로 무대에 보내 실행합니다.",
          "Of the 17 catalog emotes, the 10 with shortcuts are exposed as buttons on the shell emote bar, and a picked emote is sent over the bridge to play on stage.",
        ),
        paths: [`${V}/studio-virtual-space-emote-catalog.ts`, `${V}/studio-godot-space-embed-support.ts`],
      },
      {
        feature: t("NPC 캐스트와 공간 정의", "NPC cast and space definitions"),
        role: t(
          "캐스트 데이터가 NPC 스킨 8종을 제공하고, 공간 정의는 NPC의 이름·이동 지점·대사를 선언합니다. 무대 안 캐릭터의 재료입니다.",
          "The cast data provides 8 NPC skins, and a space definition declares each NPC's name, waypoints and lines: the material for the in-stage characters.",
        ),
        paths: [`${V}/studio-virtual-space-npc-cast.ts`, `${V}/studio-godot-space.ts`],
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
      { title: "Godot Engine · Documentation", url: "https://docs.godotengine.org/en/stable/", kind: "docs", note: t("NPC가 움직이는 무대 엔진 문서", "Docs of the stage engine the NPCs move in") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "가벼운 소통의 규칙은 셸 코드에 있고 표시는 무대와 나뉩니다. 말풍선 채팅은 근처(채팅 로직이 200px로 정의)나 방 전체로 보내고, 문장은 140자로 다듬어 금칙어를 두 번 가립니다. 이모트는 카탈로그 17종에 250ms 쓰로틀이 있고, 셸 이모트 바에서 골라 무대에 실행합니다. NPC는 거리 규칙이 아니라 공간 정의의 대사와 이동 지점, 캐스트 스킨으로 무대 안에서 움직이는 캐릭터입니다.",
        "The rules of light communication live in shell code, and display is split with the stage. Bubble chat goes nearby (defined as 200 px by the chat logic) or to the whole room, with text trimmed to 140 characters and profanity masked twice. Emotes have a catalog of 17 with a 250 ms throttle, picked on the shell emote bar and played on stage. NPCs are not a distance rule: they are characters moving inside the stage from the lines and waypoints of a space definition and the cast skins.",
      ),
      analogy: t(
        "복도에서 옆 사람에게만 들리게 말하는 것과 방 전체에 외치는 것의 차이입니다. 그리고 안내 데스크 직원은 규칙표가 아니라 대본과 동선을 들고 무대 위를 움직입니다.",
        "It is the difference between speaking so only the person next to you hears and shouting to the whole room. And the information-desk staff move on stage with a script and a route, not a rule sheet.",
      ),
      questions: [
        {
          question: t("NPC는 가까이 가면 인사하나요?", "Do NPCs greet you when you approach?"),
          answer: t(
            "클래식 클라이언트의 거리·쿨다운 인사 규칙은 제거됐습니다. 지금 NPC는 공간 정의가 선언한 대사와 이동 지점을 가진 무대 안 캐릭터이고, 셸은 인사 거리를 계산하지 않습니다. 무대 내부 타이밍은 셸 코드에서 확인되지 않습니다.",
            "The classic client's distance-and-cooldown greeting rule was removed. NPCs are now in-stage characters with the lines and waypoints a space definition declares, and the shell computes no greeting distance. The stage's internal timing is not verified in shell code.",
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
        "클래식 NPC 인사 수치(반경·쿨다운)를 현행으로 말하지 마세요. 그 모듈은 삭제됐습니다. 채팅의 '보안'을 보장한다고도 말하지 마세요. 서버에 저장하지 않는 것과 같은 방 사람에게 전달되는 것은 다릅니다.",
        "Do not present the classic NPC greeting figures (radius and cooldown) as current. Those modules were deleted. Do not claim chat 'security' either: not being stored on a server differs from being delivered to people in the room.",
      ),
    },
    technologies: ["RTCDataChannel", "Godot", "TypeScript"],
    facts: [
      { value: "200px", label: t("'근처' 채팅 범위(채팅 로직의 정의값)", "'Nearby' chat range (defined by the chat logic)"), source: `${V}/studio-virtual-space-chat.ts` },
      { value: "250ms", label: t("리액션 패킷 송신 간격 하한(설계값)", "Minimum send interval for reaction packets (design value)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "17종", label: t("이모트 종류(표시 시간은 이모트마다 1.8~4초)", "Number of emotes (display time 1.8 to 4 s per emote)"), source: `${V}/studio-virtual-space-emote-catalog.ts` },
      { value: "6명 · 12개", label: t("공간 정의 NPC 수 상한 · NPC당 대사 상한(스키마)", "Max NPCs per space definition and max lines per NPC (schema)"), source: `${V}/studio-godot-space.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
