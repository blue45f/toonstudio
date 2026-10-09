import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { t, VIRTUAL_SPACE_REVIEWED_AT } from "./engineering-atlas-virtual-space-kit";

/**
 * virtual-space 카드 4: 프레즌스·보간 · 근접 히스테리시스 · 근접 영상 정원 · 채팅/리액션/NPC.
 * 경로·수치는 2026-10-07 기준 코드에서 직접 확인한 값이다.
 */

const V = "apps/web/src/domains/creator/virtual-space";
const L = "apps/web/src/domains/creator/live";

export const VIRTUAL_SPACE_SOCIAL_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "presence-sync-peer-interpolation",
    category: "virtual-space",
    name: "Presence sync",
    title: t("내 움직임을 직접 보내고, 받은 쪽이 매끄럽게 이어 그리기", "Sending my movement directly, and drawing others' movement smoothly"),
    status: "live",
    tagline: t(
      "위치는 브라우저끼리 직접 주고받고, 받는 쪽이 100ms 늦춰 두 점 사이를 이어 그립니다.",
      "Positions travel directly between browsers; the receiver delays 100 ms and draws between two points.",
    ),
    background: [
      t(
        "다른 사람의 아바타가 부드럽게 걸어 다니는 것처럼 보여도, 실제로 받는 것은 몇십 ms 마다 찍은 '위치 사진'뿐입니다. 영화가 정지 사진을 이어 움직임으로 보이게 하듯, 받는 쪽이 사진 사이를 이어 그려 줍니다. 보내는 쪽은 변화가 있을 때만 위치를 알리고, 변화가 없어도 2.5초마다 '나 아직 있어요' 신호를 보냅니다.",
        "Other people's avatars look like they walk smoothly, but what actually arrives is only 'position snapshots' taken every few dozen milliseconds. Like a film turning still frames into motion, the receiver draws between snapshots. The sender reports its position only when something changes, plus an 'I'm still here' signal every 2.5 seconds even when nothing changes.",
      ),
      t(
        "보내기: 90ms 틱마다 내 자세가 바뀌었는지 보고, 바뀌었거나 하트비트 시간이 되면 toonstudio-space-v1 패킷(1,024바이트 이하)을 같은 방 상대에게 직접 보냅니다. 패킷마다 단조 증가 시퀀스 번호를 붙이는데, 시계를 바닥값으로 삼고 sessionStorage 에 저장해 새로고침 뒤에도 거꾸로 가지 않습니다. 받기: 보낸 사람별 마지막 번호보다 큰 패킷만 받고, 월드 범위(worldScope)가 다르면 버리며, 10초 동안 소식이 없으면 사라진 것으로 봅니다.",
        "Sending: every 90 ms tick it checks whether my pose changed, and if it did, or the heartbeat is due, it sends a toonstudio-space-v1 packet (at most 1,024 bytes) directly to peers in the room. Each packet carries a monotonically increasing sequence number, seeded from the clock and kept in sessionStorage so it never runs backwards after a reload. Receiving: only packets with a number above the sender's last one are accepted, packets from a different world scope are dropped, and 10 seconds of silence means the peer is gone.",
      ),
      t(
        "받은 위치는 곧바로 그리지 않습니다. 이쪽 도착 시각을 기준으로 100ms 과거를 재생하며 두 표본 사이를 이어 그립니다(양옆 표본이 있으면 Catmull-Rom 곡선, 아니면 직선). 소식이 끊기면 마지막 속도로 최대 250ms 만 더 가다 멈추고, 260px 넘게 튀거나 1.5초 넘게 끊기면 보간 없이 그 자리로 옮깁니다. 상대 브라우저의 시계는 믿지 않습니다.",
        "Received positions are not drawn right away. Playback runs 100 ms in the past, by this side's arrival time, drawing between two samples (a Catmull-Rom curve when neighbours exist on both sides, otherwise a straight line). If updates stop, it carries on at the last speed for at most 250 ms and then halts, and a jump over 260 px or a gap over 1.5 s snaps straight to the new spot. The other browser's clock is never trusted.",
      ),
      t(
        "위치처럼 짧고 잦은 정보를 서버에 쌓지 않으려고 직접 연결을 씁니다(서버는 입장 허가와 상대 찾기만). 대안인 서버 릴레이는 순서와 저장이 쉽지만 비용과 지연이 늘어납니다. 대가로 상대가 늘면 직접 연결 수도 늘어서 정원이 작습니다. 데이터채널의 순서·재전송 옵션은 이 카드에서 확인하지 못했습니다.",
        "Direct connections are used so short, frequent data like positions is not piled onto a server (the server only handles admission and finding peers). A server relay makes ordering and storage easy but adds cost and delay. The price is that more people mean more direct connections, so capacity is small. The data channel's ordering and retransmission options were not verified for this card.",
      ),
    ],
    keyPoints: [
      t("90ms 틱마다 변화만, 변화가 없어도 2.5초 하트비트", "Changes every 90 ms tick, plus a 2.5 s heartbeat"),
      t("단조 증가 시퀀스가 낡은 패킷을 걸러냅니다", "A monotonic sequence filters out stale packets"),
      t("받는 쪽이 100ms 늦춰 두 점 사이를 이어 그립니다", "The receiver delays 100 ms and draws between points"),
    ],
    diagram: {
      id: "presence-sync-peer-interpolation-diagram",
      kind: "sequence",
      title: t("내 움직임이 다른 사람 화면에 매끄럽게 보이기까지", "How my movement reaches another screen smoothly"),
      caption: t(
        "변화만 직접 보내고, 받는 쪽이 도착 시각 기준으로 늦춰서 이어 그립니다.",
        "Only changes are sent directly, and the receiver replays them late, by arrival time.",
      ),
      alt: t(
        "내 브라우저가 90ms 틱마다 자세가 바뀌었는지 보고 바뀌면 시퀀스 번호가 붙은 패킷을 직접 포트로 보냅니다. 상대 브라우저는 낡은 패킷과 다른 월드의 패킷을 버리고 표본을 보간 타임라인에 넣습니다. 타임라인은 100ms 과거를 재생해 두 점 사이를 이어 그리고, 소식이 끊기면 최대 250ms 만 연장합니다.",
        "My browser checks every 90 ms tick whether the pose changed and, if so, sends a sequence-numbered packet over the direct port. The other browser drops stale packets and packets from another world, then feeds samples into the interpolation timeline. The timeline replays 100 ms in the past, drawing between two points, and extends for at most 250 ms if updates stop.",
      ),
      actors: [
        { id: "me", label: t("내 브라우저", "My browser"), sub: t("컨트롤러 · 90ms 틱", "Controller, 90 ms tick"), tone: "local" },
        { id: "port", label: t("직접 포트", "Direct port"), sub: t("RTC 데이터 채널", "RTC data channel"), tone: "edge" },
        { id: "peer", label: t("상대 브라우저", "Their browser"), sub: t("컨트롤러", "Controller"), tone: "local" },
        { id: "line", label: t("보간 타임라인", "Timeline"), sub: t("표본 24개까지", "Up to 24 samples"), tone: "good" },
      ],
      messages: [
        { from: "me", to: "me", label: t("틱: 자세가 바뀌었나?", "Tick: did my pose change?"), note: t("바뀌면 dirty 표시", "Marks it dirty if so") },
        { from: "me", to: "port", label: t("presence 패킷 + 시퀀스", "Presence packet + sequence"), note: t("1,024바이트 이하", "At most 1,024 bytes") },
        { from: "port", to: "peer", label: t("서버를 거치지 않고 전달", "Delivered without the server"), style: "dashed" },
        { from: "peer", to: "peer", label: t("시퀀스·월드 범위 검사", "Check sequence and scope"), note: t("낡은 것·다른 월드는 버림", "Stale or foreign ones dropped") },
        { from: "peer", to: "line", label: t("표본 넣기 (도착 시각)", "Push a sample (arrival time)") },
        { from: "line", to: "line", label: t("100ms 과거를 재생", "Replay 100 ms back"), note: t("두 점 사이를 곡선으로 이음", "Curve between two points") },
        { from: "line", to: "peer", label: t("이번 프레임 위치", "Position for this frame"), style: "dashed", note: t("끊기면 최대 250ms만 연장", "Extends at most 250 ms") },
        { from: "peer", to: "peer", label: t("10초 무소식이면 제거", "Remove after 10 s of silence") },
      ],
    },
    usage: [
      {
        feature: t("다른 사람 아바타의 움직임", "Movement of other people's avatars"),
        role: t(
          "내 자세를 90ms 틱마다 검사해 변할 때와 하트비트 시간에 패킷을 보내고, 받은 패킷은 시퀀스와 월드 범위를 통과한 것만 피어 목록에 반영합니다.",
          "My pose is checked every 90 ms tick and a packet is sent on change and at heartbeat time; received packets reach the peer list only after passing the sequence and world-scope checks.",
        ),
        paths: [`${V}/studio-virtual-space-presence.ts`, `${V}/studio-virtual-space-presence-protocol.ts`],
      },
      {
        feature: t("피어 보간 타임라인", "Peer interpolation timeline"),
        role: t(
          "도착 시각 기준 100ms 지연 재생, Catmull-Rom 보간, 250ms 외삽 상한, 순간이동 스냅으로 끊김 없이 그립니다.",
          "Draws without stutter using 100 ms delayed replay by arrival time, Catmull-Rom interpolation, a 250 ms extrapolation cap and teleport snapping.",
        ),
        paths: [`${V}/studio-virtual-space-presentation.ts#StudioPeerTimeline`, `${V}/studio-virtual-space-peer-visual.ts`],
      },
      {
        feature: t("직접 연결 전용 포트", "Direct-only port"),
        role: t(
          "프레즌스는 서버 릴레이나 BroadcastChannel 로 폴백하지 않는 RTC 직접 포트(studio-direct-v1) 위에서만 오갑니다. 패킷 상한은 64 KiB 입니다.",
          "Presence travels only over the RTC direct port (studio-direct-v1), which never falls back to a server relay or BroadcastChannel. The packet cap is 64 KiB.",
        ),
        paths: [`${L}/studio-live-direct-port.ts`],
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
          "일부러 100ms 늦게 그리면 패킷이 조금 늦게 와도 '앞뒤 두 점'이 이미 있어서 끊기지 않습니다. 원본은 시퀀스 번호로 순서를 따지고 1.5초 넘게 끊겨도 스냅하며, 이 단순판은 곡선 보간과 그 규칙을 생략했습니다.",
          "Drawing 100 ms late means that even if a packet is slightly late the 'two surrounding points' already exist, so there is no stutter. The original also orders by sequence number and snaps after a gap over 1.5 s; this version omits the curve interpolation and that rule.",
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
        "다른 사람의 움직임은 서버를 거치지 않고 브라우저끼리 직접 주고받습니다. 90ms 마다 변화가 있을 때만 보내고, 변화가 없어도 2.5초마다 생존 신호를 보냅니다. 받는 쪽은 패킷 번호로 낡은 것을 거르고, 100ms 늦춰서 두 점 사이를 이어 그리기 때문에 끊겨 보이지 않습니다.",
        "Other people's movement goes straight between browsers without the server. A packet is sent every 90 ms only when something changed, plus a liveness signal every 2.5 seconds. The receiver filters stale packets by number and draws between two points 100 ms late, so motion does not look choppy.",
      ),
      analogy: t(
        "영화 필름처럼 몇 장의 사진만 받아도 사이를 이어 붙여 움직임으로 보여 주는 방식입니다. 일부러 조금 늦게 틀어서, 중간에 사진 한 장이 늦게 와도 끊기지 않게 합니다.",
        "It works like film: even a few photos are enough, because the gaps are joined into motion. It deliberately plays a little late so one late photo does not cause a stutter.",
      ),
      questions: [
        {
          question: t("서버 없이 동기화되나요?", "Does it sync without a server?"),
          answer: t(
            "위치와 채팅 패킷은 RTC 직접 포트로만 오갑니다. 서버는 방 입장 허가와 상대 찾기를 맡습니다. 시그널링은 협업·WebRTC 카테고리 카드를 보세요.",
            "Position and chat packets travel only over the RTC direct port. The server handles room admission and finding peers; see the collaboration and WebRTC cards for signaling.",
          ),
        },
        {
          question: t("100ms 지연이 느껴지나요?", "Is the 100 ms delay noticeable?"),
          answer: t(
            "90ms 틱 한두 개 분량입니다. 체감 측정값은 확인하지 못했습니다.",
            "It is about one or two 90 ms ticks. A measured perceptual figure was not found.",
          ),
        },
        {
          question: t("패킷 순서가 뒤바뀌면요?", "What if packets arrive out of order?"),
          answer: t(
            "보낸 사람별 마지막 번호보다 작거나 같은 패킷은 버립니다. 새로고침해도 번호가 거꾸로 가지 않게 시계 바닥값과 sessionStorage 를 씁니다.",
            "A packet whose number is not above the sender's last one is dropped. A clock seed and sessionStorage keep the number from running backwards after a reload.",
          ),
        },
      ],
      pitfall: t(
        "데이터채널의 순서·재전송 옵션은 이 카드에서 확인하지 못했습니다. 90ms · 100ms · 250ms 같은 값은 설계값이며 네트워크별 체감 측정은 없습니다.",
        "The data channel's ordering and retransmission options were not verified here. Values such as 90 ms, 100 ms and 250 ms are design values, and there is no per-network perception measurement.",
      ),
    },
    technologies: ["RTCDataChannel", "WebRTC", "Phaser 3"],
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
    title: t("들어올 때와 나갈 때 기준을 다르게 둔 근접 규칙", "A proximity rule with different thresholds for entering and leaving"),
    status: "experimental",
    tagline: t(
      "인사 160px·작별 220px 규칙은 코드와 테스트가 있지만 화면에는 연결되지 않았습니다.",
      "The 160 px greeting and 220 px farewell rule has code and tests but is not wired to the screen.",
    ),
    background: [
      t(
        "가까워지면 인사하고 멀어지면 작별하는 규칙에서 거리 기준을 하나만 쓰면, 경계선에 선 사람이 한 걸음 앞뒤로 흔들릴 때마다 '인사!', '작별!'이 번쩍거립니다. 에어컨이 켜지는 온도와 꺼지는 온도를 다르게 두는 것처럼, 들어올 때(160px)와 나갈 때(220px) 기준을 다르게 두면 이 깜빡임이 사라집니다. 이를 히스테리시스라고 합니다.",
        "If a greet-when-near, farewell-when-far rule uses a single distance, someone standing on the boundary makes 'hello!' and 'bye!' flash on every step back and forth. Like an air conditioner that turns on and off at different temperatures, using different thresholds for entering (160 px) and leaving (220 px) removes the flicker. This is called hysteresis.",
      ),
      t(
        "코드의 규칙은 이렇습니다. 이웃이 160px 안에 처음 들어오면 인사(wave), 220px 밖으로 나가야 작별, 인사 구간에서 200px 안에 머물면 대화 힌트를 한 번 띄웁니다. 모션 감소에서는 몸짓 대신 글 말풍선만 씁니다. 순수 함수 모듈과 단위 테스트가 있습니다.",
        "The rule in code is: when a neighbour first comes within 160 px it greets (wave), it says farewell only after going beyond 220 px, and staying within 200 px in the greeting band shows a chat hint once. With reduced motion only a text bubble is used instead of a gesture. A pure-function module and unit tests exist.",
      ),
      t(
        "그런데 이 모듈(studio-virtual-space-proximity.ts)은 제품 코드에서 값을 가져다 쓰는 곳이 없습니다. 타입(StudioBilingualCopy)만 가져가는 import 가 3곳 있을 뿐입니다. 같은 계열의 proximity-circles(170px 서클·거리별 음량 곡선)와 proximity-triggers(진입·체류·이탈 이벤트) 모듈도 테스트에서만 쓰입니다. 그래서 '인사 160/220px'은 화면에서 일어나는 일의 설명이 아니라 설계 상수입니다.",
        "However, no product code uses the values of this module (studio-virtual-space-proximity.ts); only three imports take a type (StudioBilingualCopy). The sibling modules proximity-circles (a 170 px circle and distance-based volume curve) and proximity-triggers (enter, stay and exit events) are also used only by tests. So 'greeting 160/220 px' is a design constant, not a description of what happens on screen.",
      ),
      t(
        "화면에 연결된 근접 값은 따로 있습니다. 근접 영상 168/216px(기본 범위 모드, 옵트인)와 근처 대화 120/156px(+300/800ms)는 같은 히스테리시스 발상이고, NPC 인사 130px(90초 쿨다운)와 가까운 동료 알림 150px(120초 쿨다운)는 단일 반경에 쿨다운을 두는 방식이며, 근처 채팅 200px는 쿨다운 없이 받는 쪽이 거리로 거르는 수신 범위입니다. 발표에서는 연결된 값을 쓰거나, 160/220 을 '설계 기준'이라고 밝히세요.",
        "The proximity values that are wired are different ones. Proximity video at 168/216 px (default range mode, opt-in) and nearby conversation at 120/156 px (+300/800 ms) use the same hysteresis idea, NPC greeting at 130 px (90 s cooldown) and the nearby-teammate notice at 150 px (120 s cooldown) use a single radius with a cooldown, and nearby chat at 200 px is a reception range that the receiver filters by distance, with no cooldown. In a talk, use the wired values or call 160/220 a 'design baseline'.",
      ),
    ],
    keyPoints: [
      t("들어올 때(160px)와 나갈 때(220px) 기준이 다릅니다", "Different thresholds to enter (160 px) and leave (220 px)"),
      t("코드와 테스트는 있지만 화면에는 연결되지 않았습니다", "Code and tests exist but it is not wired to the screen"),
      t("연결된 값은 영상 168/216, 대화 120/156 입니다", "The wired values are 168/216 for video and 120/156 for talk"),
    ],
    diagram: {
      id: "proximity-hysteresis-160-220-diagram",
      kind: "graph",
      title: t("160/220 히스테리시스의 상태 흐름(설계)", "State flow of the 160/220 hysteresis (design)"),
      caption: t(
        "160~220px 사이에서는 상태를 바꾸지 않아 경계에서 깜빡이지 않습니다.",
        "Between 160 and 220 px nothing changes, so the boundary never flickers.",
      ),
      alt: t(
        "바깥에 있던 이웃이 160px 안으로 처음 들어오면 인사 상태가 됩니다. 160에서 220px 사이에서는 인사 상태를 그대로 유지하고, 220px 밖으로 나가면 작별 후 바깥으로 초기화됩니다. 이 흐름 전체는 설계 상수이며 화면에는 연결되지 않았습니다.",
        "A neighbour outside comes within 160 px for the first time and enters the greeted state. Between 160 and 220 px the greeted state is kept, and going beyond 220 px produces a farewell and resets to outside. The whole flow is a design constant and is not wired to the screen.",
      ),
      nodes: [
        { id: "out", label: t("바깥", "Outside"), tone: "neutral", shape: "pill", at: [0, 0] },
        { id: "enter", label: t("160px 안?", "Within 160?"), sub: t("처음 진입이면", "If first entry"), tone: "warn", shape: "diamond", at: [1, 0] },
        { id: "stay", label: t("인사한 상태", "Greeted state"), sub: t("160~220px는 유지", "Kept from 160 to 220"), tone: "local", at: [2, 0] },
        { id: "exit", label: t("220px 밖?", "Beyond 220?"), sub: t("벗어났다면", "If left"), tone: "warn", shape: "diamond", at: [3, 0] },
        { id: "bye", label: t("작별", "Farewell"), tone: "local", shape: "pill", at: [4, 0] },
      ],
      edges: [
        { from: "out", to: "enter", label: t("다가옴", "approach") },
        { from: "enter", to: "stay", label: t("예", "yes") },
        { from: "stay", to: "exit", label: t("멀어짐", "recede") },
        { from: "exit", to: "bye", label: t("예", "yes") },
        { from: "bye", to: "out", label: t("초기화", "reset"), style: "dashed" },
      ],
      groups: [
        { id: "design", label: t("설계 상수 · 화면에 미연결", "Design constants, not wired"), tone: "warn", nodeIds: ["out", "enter", "stay", "exit", "bye"] },
      ],
    },
    usage: [
      {
        feature: t("근접 반응 규칙(설계)", "Proximity reaction rule (design)"),
        role: t(
          "이웃이 160px 안에 들어오면 인사, 220px 밖으로 나가면 작별, 인사 구간에서 200px 안에 머물면 대화 힌트를 내는 순수 함수와 단위 테스트가 있습니다. 제품 코드에서 이 함수를 호출하는 곳은 찾지 못했습니다.",
          "A pure function and unit tests greet within 160 px, say farewell beyond 220 px and show a chat hint when staying within 200 px in the greeting band. No product call site for this function was found.",
        ),
        paths: [`${V}/studio-virtual-space-proximity.ts`, `${V}/studio-virtual-space-proximity.test.ts`],
      },
      {
        feature: t("근접 서클·트리거 모듈(미연결)", "Proximity circle and trigger modules (not wired)"),
        role: t(
          "170px 대화 서클과 거리별 음량 곡선, 진입·체류·이탈 이벤트 엔진이 같은 방식으로 구현·테스트되어 있지만 테스트에서만 쓰입니다.",
          "A 170 px conversation circle with a distance-based volume curve and an enter, stay and exit event engine are implemented and tested the same way, but are used only by tests.",
        ),
        paths: [`${V}/studio-virtual-space-proximity-circles.ts`, `${V}/studio-virtual-space-proximity-triggers.ts`],
      },
      {
        feature: t("실제로 연결된 근접 값", "Proximity values that are actually wired"),
        role: t(
          "근접 영상 168/216px, 근처 대화 120/156px(+300/800ms), 채팅 200px, NPC 인사 130px, 동료 알림 150px 가 화면에 연결되어 있습니다.",
          "Proximity video 168/216 px, nearby conversation 120/156 px (+300/800 ms), chat 200 px, NPC greeting 130 px and the teammate notice 150 px are wired to the screen.",
        ),
        paths: [
          `${V}/hud/space-proximity-media.ts`,
          `${V}/studio-virtual-space-acoustics.ts`,
          `${V}/studio-virtual-space-chat.ts`,
          `${V}/studio-virtual-space-npc.ts`,
          `${V}/studio-virtual-space-event-director.ts`,
        ],
        route: "/studio/space",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("들어올 때와 나갈 때 기준이 다른 인사 상태 기계", "A greeting state machine with different enter and leave thresholds"),
        language: "ts",
        code: `// 들어올 때(160px)와 나갈 때(220px)의 기준을 다르게 둔 근접 인사(proximity.ts 의 단순화, 대화 힌트는 생략).
const GREET_RADIUS = 160;
const FAREWELL_RADIUS = 220;

export type Reaction = "greet" | "farewell" | null;

export function nextGreeting(greeted: boolean, distance: number): { greeted: boolean; reaction: Reaction } {
  if (!greeted && distance <= GREET_RADIUS) return { greeted: true, reaction: "greet" };
  if (greeted && distance >= FAREWELL_RADIUS) return { greeted: false, reaction: "farewell" };
  return { greeted, reaction: null }; // 160~220px 사이에서는 상태를 바꾸지 않는다
}`,
        codeEn: `// Proximity greeting with different thresholds for entering (160 px) and leaving (220 px) (simplified from proximity.ts, chat hint omitted).
const GREET_RADIUS = 160;
const FAREWELL_RADIUS = 220;

export type Reaction = "greet" | "farewell" | null;

export function nextGreeting(greeted: boolean, distance: number): { greeted: boolean; reaction: Reaction } {
  if (!greeted && distance <= GREET_RADIUS) return { greeted: true, reaction: "greet" };
  if (greeted && distance >= FAREWELL_RADIUS) return { greeted: false, reaction: "farewell" };
  return { greeted, reaction: null }; // between 160 and 220 px the state does not change
}`,
        explain: t(
          "같은 거리 190px 라도 이미 인사한 사람은 그대로이고, 아직 인사하지 않은 사람은 인사하지 않습니다. 현재 상태가 결과를 정하기 때문에 경계에서 흔들려도 깜빡이지 않습니다.",
          "At the same 190 px, someone already greeted stays greeted and someone not yet greeted is not greeted. The current state decides the outcome, so wobbling at the boundary does not flicker.",
        ),
        source: `${V}/studio-virtual-space-proximity.ts`,
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("거리에 시간 조건을 더한 히스테리시스", "Hysteresis with a time condition added to distance"),
        language: "ts",
        code: `// 거리 기준(120/156px)에 시간 기준(300/800ms)을 더한 입장·퇴장 판정(acoustics 의 발상, 개념 예제).
const ENTER_PX = 120;
const EXIT_PX = 156;
const ENTER_MS = 300;
const EXIT_MS = 800;

export class StableProximity {
  private inside = false;
  private since: number | null = null; // 새 조건을 만족하기 시작한 시각
  update(distance: number, now: number): boolean {
    const wantInside = this.inside ? distance <= EXIT_PX : distance <= ENTER_PX; // 안에서는 넓은 기준으로 유지
    if (wantInside === this.inside) { this.since = null; return this.inside; }
    this.since ??= now;
    const needed = this.inside ? EXIT_MS : ENTER_MS; // 나가는 쪽을 더 오래 확인한다
    if (now - this.since >= needed) { this.inside = wantInside; this.since = null; }
    return this.inside;
  }
}`,
        codeEn: `// Enter/exit judgement that adds time (300/800 ms) to distance (120/156 px) (the idea of acoustics, a concept sample).
const ENTER_PX = 120;
const EXIT_PX = 156;
const ENTER_MS = 300;
const EXIT_MS = 800;

export class StableProximity {
  private inside = false;
  private since: number | null = null; // when the new condition started to hold
  update(distance: number, now: number): boolean {
    const wantInside = this.inside ? distance <= EXIT_PX : distance <= ENTER_PX; // inside, the wider threshold keeps you in
    if (wantInside === this.inside) { this.since = null; return this.inside; }
    this.since ??= now;
    const needed = this.inside ? EXIT_MS : ENTER_MS; // confirm leaving for longer
    if (now - this.since >= needed) { this.inside = wantInside; this.since = null; }
    return this.inside;
  }
}`,
        explain: t(
          "거리 기준을 둘로 나눈 것에 더해, 조건이 일정 시간 이어져야 상태가 바뀝니다. 나가는 쪽을 800ms 로 더 길게 잡아 잠깐 스치는 이탈에는 대화가 끊기지 않습니다.",
          "On top of two distance thresholds, the condition must hold for some time before the state changes. Leaving is confirmed for a longer 800 ms so a brief brush past the edge does not break a conversation.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Wikipedia · Hysteresis", url: "https://en.wikipedia.org/wiki/Hysteresis", kind: "article", note: t("히스테리시스의 일반 개념", "The general concept of hysteresis") },
      { title: "Wikipedia · Schmitt trigger", url: "https://en.wikipedia.org/wiki/Schmitt_trigger", kind: "article", note: t("켜는 기준과 끄는 기준을 나눈 회로", "A circuit with separate on and off thresholds") },
      { title: "CSS-Tricks · Debouncing and Throttling Explained", url: "https://css-tricks.com/debouncing-throttling-explained-examples/", kind: "article", note: t("시간 조건으로 흔들림 줄이기", "Reducing jitter with time conditions") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "가까워지면 인사하고 멀어지면 작별하는 규칙에서는 들어올 때와 나갈 때의 거리를 다르게 둡니다. 경계선에서 한 걸음 흔들릴 때마다 인사가 깜빡이지 않게 하는 히스테리시스입니다. 다만 솔직하게, 160/220px 규칙은 코드와 테스트로만 존재하고 화면에는 아직 연결되지 않았습니다. 화면에 연결된 같은 발상의 값은 근접 영상 168/216px 와 근처 대화 120/156px 입니다.",
        "In a rule that greets when people get close and says farewell when they move away, the distance to enter and the distance to leave differ, so hello does not flicker with every step at the boundary. To be honest, the 160/220 px rule exists only as code and tests and is not wired to the screen yet. The wired values with the same idea are 168/216 px for proximity video and 120/156 px for nearby conversation.",
      ),
      analogy: t(
        "에어컨 설정과 같습니다. 25도에서 켜지고 23도에서 꺼지게 해야 문턱 온도 근처에서 계속 켜졌다 꺼지지 않습니다.",
        "It is like an air conditioner setting: turn on at 25 degrees and off at 23, otherwise it keeps flipping near the threshold.",
      ),
      questions: [
        {
          question: t("160/220 은 실제로 도나요?", "Does 160/220 really run?"),
          answer: t(
            "아니요. 설계 상수와 순수 함수·테스트만 있고 제품 코드에서 호출하는 곳을 찾지 못했습니다. 발표에서는 '설계 기준'이라고 말하거나 연결된 값(168/216, 120/156)을 쓰세요.",
            "No. Only design constants, a pure function and tests exist, and no product call site was found. In a talk call it a design baseline or use the wired values (168/216, 120/156).",
          ),
        },
        {
          question: t("그럼 화면에서는 인사가 어떻게 일어나나요?", "So how does greeting happen on screen?"),
          answer: t(
            "NPC 는 130px 안에 들어오면 인사말을 띄우고(같은 NPC 90초 쿨다운), 가까운 동료가 150px 안에 처음 들어오면 알림 토스트가 뜹니다(120초 쿨다운). 아바타끼리 자동으로 손을 흔드는 연결은 확인하지 못했습니다.",
            "An NPC shows a greeting within 130 px (90 s cooldown per NPC), and a teammate first coming within 150 px triggers a notice toast (120 s cooldown). A link that makes avatars wave at each other automatically was not found.",
          ),
        },
        {
          question: t("히스테리시스가 왜 필요한가요?", "Why is hysteresis needed?"),
          answer: t(
            "측정값이 문턱 근처에서 흔들릴 때 상태가 계속 뒤집히는 것을 막기 위해서입니다. 켜는 기준과 끄는 기준을 나누면 흔들림이 상태 변화로 번지지 않습니다.",
            "To stop a state from flipping repeatedly when a measurement wobbles near a threshold. Separating the on and off thresholds keeps jitter from becoming state changes.",
          ),
        },
      ],
      pitfall: t(
        "160/220px 와 200px 대화 힌트를 '현재 동작'으로 말하지 마세요. 발표 덱과 세미나는 이 규칙을 '화면에는 아직 연결 전인 설계 기준'으로 적고, 테스트가 제품 코드의 호출부가 없음을 확인합니다. 연결되면 이 카드와 슬라이드 문구를 함께 고쳐야 합니다.",
        "Do not present the 160/220 px rule and the 200 px chat hint as current behavior. The deck and seminar describe this rule as a design baseline not yet wired to the screen, and tests confirm that no product code calls it. Once it is wired, this card and the slide wording must be fixed together.",
      ),
    },
    technologies: ["Hysteresis", "TypeScript"],
    facts: [
      { value: "160 / 220 / 200px", label: t("인사 진입 / 작별 이탈 / 대화 힌트 반경(설계 상수, 미연결)", "Greeting enter / farewell leave / chat-hint radius (design constants, not wired)"), source: `${V}/studio-virtual-space-proximity.ts` },
      { value: "168 / 216px", label: t("근접 영상 연결 / 해제 반경(연결됨, 설계값)", "Proximity video connect / release radius (wired, design value)"), source: `${V}/hud/space-proximity-media.ts` },
      { value: "120 / 156px", label: t("근처 대화 입장 / 퇴장 반경(연결됨, 설계값)", "Nearby conversation enter / exit radius (wired, design value)"), source: `${V}/studio-virtual-space-acoustics.ts` },
      { value: "130px · 90초", label: t("NPC 인사 반경 · 같은 NPC 쿨다운(연결됨, 설계값)", "NPC greeting radius and per-NPC cooldown (wired, design values)"), source: `${V}/studio-virtual-space-npc.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "proximity-video-capacity-chain",
    category: "virtual-space",
    name: "Proximity video",
    title: t("가까이 가면 영상이 붙는 구조와 정원의 사다리", "Video that attaches when you walk close, and the capacity ladder"),
    status: "configured",
    tagline: t(
      "동의한 사람끼리 기본 168px 안에서 영상이 붙고, 정원은 나 포함 24 → 9 → 4명 사다리입니다.",
      "Consenting people get video within the default 168 px, and capacity narrows down a ladder of 24 → 9 → 4 people including you.",
    ),
    background: [
      t(
        "가까이 다가가면 그 사람과 화면이 연결되는 기능입니다. 단, 켜는 것은 사용자의 선택입니다. 동의 버튼을 누를 때에만 카메라와 마이크 권한을 요청하고, 켜 두면 가까운 팀원과 자동으로 연결되고 멀어지면 자동으로 끊깁니다. 기본 범위 모드에서는 연결할 때 168px, 끊을 때 216px 로 기준을 달리해 경계에서 깜빡이지 않게 합니다(조용히 모드는 80/112px, 끔은 근접 연결 없음).",
        "This feature connects your screen with someone as you walk up to them, but turning it on is the user's choice. Camera and microphone permission is requested only when the consent button is pressed; once on, you connect automatically to nearby teammates and disconnect as you move away. In the default range mode it connects at 168 px and releases at 216 px so the boundary does not flicker (quiet mode uses 80/112 px, and off never connects).",
      ),
      t(
        "거리 규칙(순수 함수)이 '지금 연결할 사람'을 고릅니다. 나와 같은 비공개 구역끼리만, 자리 비움이거나 내가 차단한 사람은 빼고, 내가 집중·자리 비움이면 아무도 연결하지 않으며, 가까운 순 최대 3명입니다. 목록이 바뀔 때만 기존 허들(P2P 영상통화) 컨트롤러에 '미디어 상대 범위'로 넘깁니다. 같은 직접 연결 포트를 쓰는 다른 기능과 섞이지 않도록 메시지를 space-proximity-media-v1 채널 봉투로 감쌉니다.",
        "A distance rule (a pure function) picks whom to connect right now: only people in the same private zone as me, excluding those away or blocked, nobody at all when I am focused or away, and at most three people nearest first. Only when the list changes is it passed to the existing huddle (P2P video call) controller as the media peer scope. Messages are wrapped in a space-proximity-media-v1 channel envelope so they do not mix with other features on the same direct port.",
      ),
      t(
        "'몇 명까지?'의 답은 하나가 아닙니다. 나를 포함해 세면 공간 코드의 상수는 24명이지만, 직접 연결 메시는 원격 8명(나 포함 9명)에서 막히고(코드 주석: 이보다 큰 전원 메시는 서버 한 곳이 나눠 보내는 것보다 비싸다), 허들 영상은 원격 3명(나 포함 4명)까지입니다. 세는 단위를 나 포함으로 맞추면 24 → 9 → 4명이고, 가장 작은 수가 실제 영상 정원이며, 24는 검증된 수용량이 아닙니다.",
        "'How many people?' has more than one answer. Counting yourself, the space code constant says 24, but the direct mesh stops at 8 remote peers (9 with you; a code comment says a full mesh larger than that costs more than one server fanning out), and huddle video allows 3 remote peers (4 with you). Counted the same way, including you, the ladder is 24 → 9 → 4; the smallest number is the real video capacity, and 24 is not a verified capacity.",
      ),
      t(
        "대안인 SFU(중간 서버가 영상을 나눠 주는 방식)는 큰 방에 맞지만 서버 비용과 운영이 필요합니다. 이 기능은 기존 허들의 P2P 를 재사용하므로 소규모에 맞습니다. 허들·메시 정원 자체는 WebRTC 카테고리 카드가 다룹니다. 실제 네트워크(NAT) 환경별 연결 성공률과 영상 품질은 이 카드에서 확인하지 못했습니다.",
        "The alternative, an SFU (a middle server that distributes video), suits large rooms but needs server cost and operations. This feature reuses the existing huddle P2P, so it fits small groups. The huddle and mesh capacities themselves are covered by the WebRTC category cards. Connection success rates and video quality across real network (NAT) conditions were not verified here.",
      ),
    ],
    keyPoints: [
      t("동의 버튼을 눌러야 켜지고 그때 카메라를 요청합니다", "It starts only after consent, when the camera is requested"),
      t("기본 범위 모드: 168px 안에서 연결, 216px 밖에서 해제", "Default range mode: connect within 168 px, release beyond 216 px"),
      t("정원은 24가 아니라 가장 작은 원격 3명(나 포함 4명)입니다", "Capacity is the smallest rung, 3 remote peers (4 with you), not 24"),
    ],
    diagram: {
      id: "proximity-video-capacity-chain-diagram",
      kind: "layers",
      title: t("영상 정원 사다리와 연결 조건", "The video capacity ladder and connection conditions"),
      caption: t(
        "위에서 아래로 갈수록 숫자가 작아지고, 가장 작은 수가 실제 영상 정원입니다.",
        "Numbers shrink from top to bottom, and the smallest one is the real video capacity.",
      ),
      alt: t(
        "정원 사다리는 나를 포함해 공간 상수 24명, 직접 메시 9명(원격 8), 허들 영상 4명(원격 3) 순으로 줄어듭니다. 그 아래에 연결 조건이 두 겹 있습니다. 거리 규칙은 기본 범위 모드에서 168px 안에서 연결하고 216px 밖에서 해제하며(조용히 모드는 80/112px), 사용자 동의는 버튼을 누를 때만 카메라와 마이크를 요청합니다.",
        "Counting you, the capacity ladder narrows from the space constant of 24, to a direct mesh of 9 (8 remote), to huddle video with 4 (3 remote). Below it are two layers of connection conditions: in the default range mode the distance rule connects within 168 px and releases beyond 216 px (quiet mode uses 80/112 px), and user consent requests camera and microphone only on a button press.",
      ),
      layers: [
        { id: "space", label: t("공간 상수 24명 (나 포함)", "Space constant: 24 with you"), sub: t("프레즌스가 다루는 최대 참가자 · 검증된 수용량 아님", "Max participants presence handles · not a verified capacity"), tone: "neutral" },
        { id: "mesh", label: t("직접 메시 9명 (원격 8)", "Direct mesh: 9 (8 remote)"), sub: t("전원 연결(메시)은 원격 8명까지", "A full mesh stops at 8 remote peers"), tone: "edge", chips: ["RTCDataChannel"] },
        { id: "huddle", label: t("허들 영상 4명 (원격 3)", "Huddle video: 4 (3 remote)"), sub: t("나 포함 4명 · 실제 영상 정원", "4 with you · the real video capacity"), tone: "good", chips: ["WebRTC"] },
        { id: "distance", label: t("거리 규칙", "Distance rule"), sub: t("기본 범위 모드 168px 안에서 연결 · 216px 밖에서 해제", "Default range mode: connect within 168 px · release beyond 216 px"), tone: "local", chips: ["standard 168/216px", "quiet 80/112px"] },
        { id: "consent", label: t("사용자 동의", "User consent"), sub: t("버튼을 누를 때만 카메라·마이크 요청", "Camera and mic asked only on a button press"), tone: "warn" },
      ],
      brackets: [
        { label: t("정원: 가장 작은 수가 실제", "Capacity: the smallest is real"), layerIds: ["space", "mesh", "huddle"] },
        { label: t("연결 조건", "Connection conditions"), layerIds: ["distance", "consent"] },
      ],
    },
    usage: [
      {
        feature: t("가까이 가면 영상", "Video when you walk close"),
        role: t(
          "거리·구역·차단·활동 상태로 연결 대상을 고르고(가까운 순 최대 3명), 목록이 바뀔 때만 허들 컨트롤러에 범위를 갱신합니다.",
          "Distance, zone, block and activity state pick whom to connect (nearest first, at most 3), and the huddle controller's scope is updated only when the list changes.",
        ),
        paths: [`${V}/hud/space-proximity-media.ts`, `${V}/hud/use-space-proximity-media.ts`],
      },
      {
        feature: t("동의 대화상자와 영상 버블", "Consent dialog and video bubbles"),
        role: t(
          "사용자가 동의해야 켜지고, 영상 버블에는 거리별 투명도(음량 게인)가 적용됩니다. 팀 프로젝트 공간에서만 쓸 수 있습니다.",
          "It starts only after the user consents, and video bubbles get distance-based opacity (volume gain). It is available only in team project spaces.",
        ),
        paths: [`${V}/hud/SpaceProximityVideo.tsx`, `${V}/StudioVirtualSpacePage.tsx`],
      },
      {
        feature: t("허들 P2P 컨트롤러(재사용)", "Huddle P2P controller (reused)"),
        role: t(
          "근접 영상은 기존 허들 컨트롤러를 전용 채널 포트로 감싸 재사용하며, 원격 최대 3명을 넘기지 않습니다.",
          "Proximity video wraps the existing huddle controller with a dedicated channel port and never exceeds 3 remote peers.",
        ),
        paths: [`${L}/huddle/studio-p2p-huddle-controller.ts`, `${L}/huddle/studio-p2p-huddle-protocol.ts`],
      },
      {
        feature: t("직접 메시 전송", "Direct mesh transport"),
        role: t(
          "프레즌스·채팅 패킷이 오가는 직접 연결 메시의 기본 상한은 원격 8명(나 포함 9명)입니다.",
          "The default cap of the direct mesh that carries presence and chat packets is 8 remote peers (9 with you).",
        ),
        paths: [`${L}/studio-live-p2p-overlay-transport.ts`, `${V}/studio-virtual-space-model.ts`],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("들어올 때 168px, 유지할 때 216px로 고르기", "Picking peers at 168 px to join and 216 px to keep"),
        language: "ts",
        code: `// 기본 범위 모드에서 들어올 때(168px)와 유지할 때(216px)의 기준을 달리해, 가까운 순 최대 3명을 고른다(space-proximity-media 의 단순화).
const ENTER = 168;
const LEAVE = 216;
const LIMIT = 3;

type Peer = { id: string; distance: number; blocked: boolean; away: boolean };

export function connectedPeers(peers: readonly Peer[], previous: ReadonlySet<string>): string[] {
  return peers
    .filter((p) => !p.blocked && !p.away)
    .filter((p) => p.distance <= ENTER || (previous.has(p.id) && p.distance <= LEAVE)) // 이미 연결된 사람은 216px 까지 유지
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, LIMIT) // 원격 최대 3명(나 포함 4명)
    .map((p) => p.id);
}`,
        codeEn: `// In the default range mode, use different thresholds to join (168 px) and to stay (216 px), picking up to 3 nearest peers (simplified from space-proximity-media).
const ENTER = 168;
const LEAVE = 216;
const LIMIT = 3;

type Peer = { id: string; distance: number; blocked: boolean; away: boolean };

export function connectedPeers(peers: readonly Peer[], previous: ReadonlySet<string>): string[] {
  return peers
    .filter((p) => !p.blocked && !p.away)
    .filter((p) => p.distance <= ENTER || (previous.has(p.id) && p.distance <= LEAVE)) // already-connected people stay until 216 px
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .slice(0, LIMIT) // at most 3 remote peers (4 with you)
    .map((p) => p.id);
}`,
        explain: t(
          "새로 붙는 사람은 168px 안이어야 하지만 이미 붙은 사람은 216px 까지 유지합니다. 같은 거리라도 이전 상태에 따라 결과가 다르다는 점이 히스테리시스입니다. 원본은 비공개 구역·내 활동 상태·범위 모드도 함께 봅니다.",
          "A newcomer must be within 168 px but someone already connected stays until 216 px. The same distance giving different results depending on the previous state is the hysteresis. The original also checks private zones, my activity state and range modes.",
        ),
        source: `${V}/hud/space-proximity-media.ts`,
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("기능끼리 신호가 섞이지 않게 채널 봉투 씌우기", "Wrapping messages in a channel envelope so features do not mix"),
        language: "ts",
        code: `// 같은 직접 연결 포트를 쓰는 기능끼리 신호가 섞이지 않게 전용 채널 봉투로 감싼다(단순화).
type Port = {
  send(target: string, payload: string): boolean;
  subscribe(listener: (sender: string, payload: string) => void): () => void;
};

export function withChannel(port: Port, channel: string): Port {
  return {
    send: (target, payload) => port.send(target, JSON.stringify({ channel, payload })),
    subscribe: (listener) => port.subscribe((sender, raw) => {
      try {
        const value = JSON.parse(raw) as { channel?: string; payload?: unknown };
        if (value.channel === channel && typeof value.payload === "string") listener(sender, value.payload);
      } catch { /* 형식이 다른 메시지는 무시한다 */ }
    }),
  };
}`,
        codeEn: `// Wrap messages in a dedicated channel envelope so features sharing one direct port do not mix (simplified).
type Port = {
  send(target: string, payload: string): boolean;
  subscribe(listener: (sender: string, payload: string) => void): () => void;
};

export function withChannel(port: Port, channel: string): Port {
  return {
    send: (target, payload) => port.send(target, JSON.stringify({ channel, payload })),
    subscribe: (listener) => port.subscribe((sender, raw) => {
      try {
        const value = JSON.parse(raw) as { channel?: string; payload?: unknown };
        if (value.channel === channel && typeof value.payload === "string") listener(sender, value.payload);
      } catch { /* messages in another format are ignored */ }
    }),
  };
}`,
        explain: t(
          "프레즌스·허들·근접 영상이 같은 포트를 나눠 쓰기 때문에, 보낼 때 channel 이름표를 붙이고 받을 때 내 이름표만 꺼냅니다. 이름표가 다른 메시지는 조용히 무시합니다.",
          "Presence, huddle and proximity video share one port, so a channel label is attached on send and only matching labels are taken on receive. Messages with another label are ignored silently.",
        ),
        source: `${V}/hud/space-proximity-media.ts`,
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · WebRTC API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API", kind: "docs", note: t("P2P 영상통화의 바탕", "The basis of P2P video calls") },
      { title: "W3C · WebRTC 1.0", url: "https://www.w3.org/TR/webrtc/", kind: "spec", note: t("표준 명세", "The standard specification") },
      { title: "RFC 8825 · WebRTC Overview", url: "https://www.rfc-editor.org/rfc/rfc8825", kind: "spec", note: t("WebRTC 전체 구조", "The overall WebRTC architecture") },
      { title: "BlogGeek.me · Multiparty video alternatives", url: "https://bloggeek.me/webrtc-multiparty-video-alternatives/", kind: "article", note: t("메시와 SFU 비교", "Mesh versus SFU") },
    ],
    chapterIds: ["webrtc-media-authority", "virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "가까이 가면 화면이 붙는 기능은 사용자가 동의 버튼을 눌러야 켜집니다. 기본 범위 모드에서 168px 안에 들어온 팀원과 연결하고 216px 밖으로 나가면 끊으며, 가까운 순으로 원격 최대 3명입니다. 정원은 숫자 하나가 아니라 사다리입니다. 나를 포함해 공간 상수 24명, 직접 메시 9명, 영상 4명 중 가장 작은 수가 실제 영상 정원입니다.",
        "The feature that attaches video as you get close starts only after the user presses a consent button. In the default range mode it connects teammates within 168 px, disconnects beyond 216 px, and handles at most 3 remote peers, nearest first. Capacity is a ladder, not one number: counting you, of 24 for the space constant, 9 for the direct mesh and 4 for video, the smallest is the real video capacity.",
      ),
      analogy: t(
        "회식 자리에서 옆자리 사람들과만 이야기하는 것과 비슷합니다. 자리를 옮기면 대화 상대가 자연스럽게 바뀌지만, 한 테이블에 앉을 수 있는 인원은 정해져 있습니다.",
        "It resembles chatting only with the people next to you at a dinner. Move seats and your conversation partners change naturally, but a table seats a fixed number.",
      ),
      questions: [
        {
          question: t("최대 몇 명까지 가능한가요?", "What is the maximum number of people?"),
          answer: t(
            "영상은 원격 3명(나 포함 4명)입니다. 24는 코드 상수일 뿐 검증된 수용량이 아니고, 직접 메시는 원격 8명(나 포함 9명)에서 막힙니다.",
            "Video allows 3 remote peers (4 with you). 24 is only a code constant, not a verified capacity, and the direct mesh stops at 8 remote peers (9 with you).",
          ),
        },
        {
          question: t("카메라는 언제 켜지나요?", "When does the camera turn on?"),
          answer: t(
            "동의 버튼을 누른 뒤에만 요청합니다. 공간에 들어간 것만으로 카메라나 마이크를 요청하지 않습니다.",
            "It is requested only after the consent button is pressed. Merely entering the studio never asks for the camera or microphone.",
          ),
        },
        {
          question: t("대규모 행사는 가능한가요?", "Can it run a large event?"),
          answer: t(
            "아니요. SFU 같은 별도 구조가 필요하고 이 기능의 범위가 아닙니다. 이 기능은 가까운 소수와 이야기하는 용도입니다.",
            "No. A large event needs a separate structure such as an SFU, which is outside this feature. It is meant for talking with a few people nearby.",
          ),
        },
      ],
      pitfall: t(
        "'24명 지원'이라고 말하지 마세요. 정원 사다리의 가장 작은 값(원격 3명, 나 포함 4명)이 영상 한도입니다. 이 기능은 사용자 동의가 필요한 옵트인이며, 모든 수치는 설계값이고 네트워크 환경별 연결 성공률은 확인하지 못했습니다. 168/216px 는 기본 범위 모드 값이고 조용히 모드는 80/112px 입니다.",
        "Do not say '24 people supported'. The smallest rung of the ladder (3 remote peers, 4 with you) is the video limit. This is an opt-in feature needing user consent, every figure is a design value, and connection success rates across network conditions were not verified. 168/216 px are the default range mode values; quiet mode uses 80/112 px.",
      ),
    },
    technologies: ["WebRTC", "RTCDataChannel"],
    facts: [
      { value: "168 / 216px", label: t("근접 영상 연결 / 해제 반경(기본 범위 모드, 설계값)", "Proximity video connect / release radius (default range mode, design value)"), source: `${V}/hud/space-proximity-media.ts` },
      { value: "3명", label: t("허들 영상 원격 참가자 상한(나 포함 4명)", "Huddle video remote-peer cap (4 including you)"), source: `${L}/huddle/studio-p2p-huddle-protocol.ts` },
      { value: "8명", label: t("직접 메시 원격 기본 상한(나 포함 9명, 설계값)", "Default direct-mesh remote cap (9 including you, design value)"), source: `${L}/studio-live-p2p-overlay-transport.ts` },
      { value: "24명", label: t("공간 상수(나 포함, 검증된 수용량 아님)", "Space constant (including you, not a verified capacity)"), source: `${V}/studio-virtual-space-model.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
  {
    id: "chat-reactions-npc-greetings",
    category: "virtual-space",
    name: "Nearby chat",
    title: t("말을 걸고, 반응하고, NPC가 인사하는 가벼운 소통", "Light communication: talking, reacting and NPC greetings"),
    status: "live",
    tagline: t(
      "말풍선 채팅은 200px 안에서만 들리고, 이모트는 연타를 막고, NPC 는 130px 에서 인사합니다.",
      "Bubble chat is heard only within 200 px, emotes are throttled and NPCs greet at 130 px.",
    ),
    background: [
      t(
        "공간에서는 영상 없이도 가볍게 소통할 수 있어야 합니다. 말풍선 채팅은 '내 주변 사람에게만' 또는 '방 전체'로 보낼 수 있고, 17가지 이모트 리액션을 보낼 수 있고(11가지는 1~9·Z·F 단축키), NPC 는 가까이 가면 인사합니다. 모두 브라우저끼리 직접 주고받는 가벼운 패킷이고 서버에 저장되지 않습니다.",
        "In the studio you should be able to communicate lightly without video. Bubble chat can go to 'only people around me' or 'the whole room', 17 emote reactions can be sent (11 of them with the 1-9, Z and F shortcuts), and NPCs greet you when you get close. All of it is light packets exchanged directly between browsers and is not stored on a server.",
      ),
      t(
        "채팅은 프레즌스와 같은 직접 포트로 chat 패킷을 보냅니다. 범위가 nearby 면 받는 쪽이 보낸 사람의 마지막 위치와 내 위치의 거리를 재서 200px 밖이면 버립니다(위치를 모르면 판정할 수 없어 버립니다). 문장은 140자 안으로 다듬고 욕설 어간은 보내기 전과 받을 때 두 번 가립니다. 말풍선은 4초에 글자당 40ms 를 더해 최대 10초 보이고, 입력 중 표시는 3.5초 안에 갱신이 없으면 스스로 사라집니다.",
        "Chat sends a chat packet over the same direct port as presence. With the nearby scope, the receiver measures the distance between the sender's last position and its own and drops the packet beyond 200 px (if the position is unknown it cannot judge and drops it). Text is trimmed to 140 characters and profanity stems are masked twice, before sending and on receipt. A bubble shows for 4 seconds plus 40 ms per character, up to 10 seconds, and the typing indicator disappears by itself if not refreshed within 3.5 seconds.",
      ),
      t(
        "리액션(이모트)은 연타를 막으려고 같은 사용자의 패킷을 250ms 에 한 번만 보내고, 받는 쪽은 이모트마다 정해진 표시 시간(1.8~4초, 허용 범위는 1.2~4초)이 지나면 거둡니다. 벽에 비비는 충돌 반발 패킷도 250ms 쓰로틀입니다. NPC 는 130px 안에 들어오면 인사말을 띄우고 같은 NPC 는 90초 쿨다운이 있으며, 가까운 동료가 150px 안에 처음 들어오면 알림 토스트가 뜹니다(120초 쿨다운). 이 규칙은 이벤트 디렉터가 프레임마다 모읍니다.",
        "To stop mashing, reactions (emotes) send a given user's packet at most once per 250 ms, and the receiver removes each after the emote's own display time (1.8 to 4 seconds, within an allowed range of 1.2 to 4 seconds). The wall-rubbing rebound packet is throttled to 250 ms too. An NPC shows a greeting within 130 px with a 90-second cooldown per NPC, and a teammate first coming within 150 px triggers a notice toast (120-second cooldown). An event director collects these rules every frame.",
      ),
      t(
        "입력 폭주는 보내는 쪽 쓰로틀과 받는 쪽 만료(TTL)의 이중 방어가 흔합니다. 직접 연결이라 서버가 걸러 줄 수 없어서 수신 쪽 검증이 필수입니다. 한계: 말풍선 렌더링과 채팅 UI 의 세부는 이 카드에서 모두 확인하지는 않았습니다. 욕설 마스킹은 '최소 집합'이라고 코드가 밝히고 있어 완전한 필터가 아닙니다.",
        "Input floods are commonly handled by a double defence: a sender-side throttle and a receiver-side expiry (TTL). With direct connections no server can filter, so receiver-side validation is essential. Limits: the details of bubble rendering and the chat UI were not fully verified here. The code itself calls the profanity masking a minimum set, so it is not a complete filter.",
      ),
    ],
    keyPoints: [
      t("'근처' 채팅은 받는 쪽이 200px 거리로 거릅니다", "'Nearby' chat is filtered by the receiver at 200 px"),
      t("리액션·반발 패킷은 250ms 에 한 번만 보냅니다", "Reaction and rebound packets go once per 250 ms"),
      t("NPC 는 130px 에서 인사하고 90초 쿨다운이 있습니다", "NPCs greet at 130 px with a 90-second cooldown"),
    ],
    diagram: {
      id: "chat-reactions-npc-greetings-diagram",
      kind: "graph",
      title: t("말풍선·이모트·NPC 인사의 흐름", "The flow of bubbles, emotes and NPC greetings"),
      caption: t(
        "보내는 쪽이 다듬고 쓰로틀하면 받는 쪽이 검사해 보여 주고, NPC 인사는 이벤트 디렉터가 따로 만듭니다.",
        "The sender tidies and throttles, the receiver checks and shows, and NPC greetings come separately from the event director.",
      ),
      alt: t(
        "채팅이나 이모트를 입력하면 140자 정리, 욕설 가림, 250ms 쓰로틀을 거쳐 직접 포트로 패킷이 나갑니다. 받는 쪽은 순서와 거리를 검사해 통과한 것만 말풍선이나 이모트로 보여 주고 일정 시간 뒤 거둡니다. NPC 인사와 동료 알림은 이벤트 디렉터가 거리와 쿨다운으로 따로 만들어 같은 화면에 보여 줍니다.",
        "Typing a chat or an emote passes through 140-character trimming, profanity masking and a 250 ms throttle before the packet leaves over the direct port. The receiver checks order and distance and shows only what passes as a bubble or emote, removing it after a while. NPC greetings and teammate notices are produced separately by the event director from distance and cooldowns and shown on the same screen.",
      ),
      nodes: [
        { id: "send", label: t("보내기", "Send"), sub: t("채팅·이모트 입력", "Chat or emote input"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "tidy", label: t("정리·가리기", "Tidy and mask"), sub: t("140자 · 욕설 · 250ms", "140 chars, profanity, 250 ms"), tone: "local", at: [1, 0] },
        { id: "port", label: t("직접 포트", "Direct port"), sub: t("서버 저장 없음", "Nothing stored on a server"), tone: "edge", shape: "cylinder", at: [2, 0] },
        { id: "check", label: t("받는 쪽 검사", "Receiver check"), sub: t("순서·거리", "Order, distance"), tone: "warn", shape: "diamond", at: [3, 0] },
        { id: "show", label: t("말풍선·이모트", "Bubble and emote"), sub: t("시간이 지나면 사라짐", "Expires after a while"), tone: "good", at: [4, 0] },
        { id: "director", label: t("이벤트 디렉터", "Event director"), sub: t("NPC 130px · 동료 150px", "NPC 130 px, mate 150 px"), tone: "local", at: [3, 1] },
      ],
      edges: [
        { from: "send", to: "tidy", label: t("입력", "input") },
        { from: "tidy", to: "port", label: t("패킷", "packet") },
        { from: "port", to: "check", label: t("전달", "deliver") },
        { from: "check", to: "show", label: t("통과", "pass") },
        { from: "director", to: "show", label: t("인사·알림", "greeting"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("말풍선 채팅", "Bubble chat"),
        role: t(
          "근처/전체 범위로 채팅을 보내고, 받는 쪽이 거리로 걸러 말풍선과 로그(최근 100개)를 만듭니다. 입력 중 표시도 함께 오갑니다.",
          "Sends chat to a nearby or whole-room scope; the receiver filters by distance and builds bubbles and a log (the latest 100). A typing indicator travels too.",
        ),
        paths: [`${V}/studio-virtual-space-chat.ts`, `${V}/studio-virtual-space-presence.ts#sendChat`],
      },
      {
        feature: t("이모트 리액션", "Emote reactions"),
        role: t(
          "17종 이모트를 고르거나 단축키로 보내고, 수신 쪽 표시 시간을 이모트별로 적용합니다. 모션 감소에서는 정적인 표현을 씁니다.",
          "Sends 17 emotes by picking them or by shortcut and applies each emote's own display time on the receiving side. Reduced motion uses a static presentation.",
        ),
        paths: [`${V}/studio-virtual-space-emote-catalog.ts`, `${V}/studio-virtual-space-presence-protocol.ts`],
      },
      {
        feature: t("NPC 인사와 근접 알림", "NPC greetings and proximity notices"),
        role: t(
          "NPC 가 130px 안에서 인사말을 띄우고, 가까운 동료가 150px 안에 처음 들어오면 토스트를 띄웁니다. 이벤트 디렉터가 프레임마다 쿨다운을 관리합니다.",
          "An NPC shows a greeting within 130 px, and a toast appears when a teammate first comes within 150 px. The event director manages cooldowns every frame.",
        ),
        paths: [`${V}/studio-virtual-space-npc.ts`, `${V}/studio-virtual-space-event-director.ts`, `${V}/studio-virtual-space-world-feel.ts`],
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
          "서버가 없으니 거르는 일은 받는 쪽 몫입니다. 순서 검사를 먼저 하고, 그다음에 범위가 nearby 일 때만 거리를 봅니다. 위치를 아직 모르는 사람의 근처 채팅은 버립니다.",
          "With no server, filtering is the receiver's job. The order check comes first, and only then is distance examined for the nearby scope. Nearby chat from someone whose position is not yet known is dropped.",
        ),
        source: `${V}/studio-virtual-space-presence.ts`,
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("연타를 막는 쓰로틀", "A throttle that stops mashing"),
        language: "ts",
        code: `// 같은 사용자의 리액션은 250ms 안에 한 번만 보낸다(연타 폭주 방지, sendReaction 의 발상).
export function createThrottle(intervalMs = 250, now: () => number = () => performance.now()) {
  let last = Number.NEGATIVE_INFINITY;
  return (send: () => void): boolean => {
    const current = now();
    if (current - last < intervalMs) return false; // 너무 일러서 버린다
    last = current;
    send();
    return true;
  };
}

// 사용: const sendReaction = createThrottle(); sendReaction(() => port.send("peer", packet));`,
        codeEn: `// Send a given user's reaction at most once per 250 ms (anti-mash, the idea behind sendReaction).
export function createThrottle(intervalMs = 250, now: () => number = () => performance.now()) {
  let last = Number.NEGATIVE_INFINITY;
  return (send: () => void): boolean => {
    const current = now();
    if (current - last < intervalMs) return false; // too soon, drop it
    last = current;
    send();
    return true;
  };
}

// usage: const sendReaction = createThrottle(); sendReaction(() => port.send("peer", packet));`,
        explain: t(
          "마지막으로 보낸 시각만 기억하면 되는 가장 단순한 쓰로틀입니다. 받는 쪽의 만료 시간(TTL)과 짝을 이루어, 보내는 쪽이 폭주해도 화면이 이모트로 가득 차지 않습니다.",
          "The simplest throttle needs only the last send time. Paired with the receiver's expiry (TTL), even a flooding sender cannot fill the screen with emotes.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · RTCDataChannel", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel", kind: "docs", note: t("패킷이 오가는 길", "The path the packets travel") },
      { title: "CSS-Tricks · Debouncing and Throttling Explained", url: "https://css-tricks.com/debouncing-throttling-explained-examples/", kind: "article", note: t("연타를 다루는 두 방법", "Two ways to handle rapid input") },
      { title: "MDN · prefers-reduced-motion", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion", kind: "docs", note: t("이모트 몸짓을 줄이는 설정", "The setting that tones down emote motion") },
    ],
    chapterIds: ["virtual-studio-world-authority"],
    talk: {
      pitch: t(
        "영상 없이도 가볍게 소통하는 세 가지가 있습니다. 말풍선 채팅은 가까운 사람(200px 안)이나 방 전체로 보내고, 이모트 리액션은 고르거나 단축키로 누르며, NPC 는 가까이 가면 인사합니다. 모두 브라우저끼리 직접 오가는 가벼운 패킷이고 서버에 저장되지 않으며, 연타를 막으려고 보내는 쪽 쓰로틀과 받는 쪽 만료 시간을 함께 둡니다.",
        "There are three ways to communicate lightly without video. Bubble chat goes to people nearby (within 200 px) or to the whole room, emote reactions are picked or pressed with shortcuts, and NPCs greet you when you approach. All of it is light packets exchanged directly between browsers and is not stored on a server, with a sender-side throttle and a receiver-side expiry to stop mashing.",
      ),
      analogy: t(
        "복도에서 옆 사람에게만 들리게 말하는 것과 방 전체에 외치는 것의 차이입니다. 가까운 사람에게는 말풍선이 뜨고, 멀리 있는 사람은 듣지 못합니다.",
        "It is the difference between speaking so only the person next to you hears and shouting to the whole room. Nearby people see a bubble; people far away do not hear it.",
      ),
      questions: [
        {
          question: t("채팅이 저장되나요?", "Is the chat stored?"),
          answer: t(
            "저장하지 않습니다. 직접 포트로만 오가고, 화면의 로그는 메모리에 최근 100개만 보관해 새로고침하면 사라집니다.",
            "No. It travels only over the direct port, and the on-screen log keeps just the latest 100 in memory, which disappears on reload.",
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
            "아니요. 직접 연결이라 받는 쪽이 거리를 재서 거릅니다. 그래서 수신 쪽 검증이 필수입니다.",
            "No. Because connections are direct, the receiver measures distance and filters. That is why receiver-side validation is essential.",
          ),
        },
      ],
      pitfall: t(
        "채팅의 '보안'이나 '개인정보 보호'를 보장한다고 말하지 마세요. 서버에 저장하지 않는 것과 같은 방 사람에게 전달되는 것은 다릅니다. 말풍선 렌더링과 채팅 UI 세부는 이 카드에서 확인하지 못했습니다.",
        "Do not claim chat 'security' or 'privacy' guarantees. Not being stored on a server differs from being delivered to people in the room. The bubble rendering and chat UI details were not verified in this card.",
      ),
    },
    technologies: ["RTCDataChannel", "Phaser 3"],
    facts: [
      { value: "200px", label: t("'근처' 채팅 범위(설계값)", "'Nearby' chat range (design value)"), source: `${V}/studio-virtual-space-chat.ts` },
      { value: "250ms", label: t("리액션·반발 패킷 송신 간격 하한(설계값)", "Minimum send interval for reaction and rebound packets (design value)"), source: `${V}/studio-virtual-space-presence-protocol.ts` },
      { value: "17종", label: t("이모트 종류(표시 시간은 이모트마다 1.8~4초)", "Number of emotes (display time 1.8 to 4 s per emote)"), source: `${V}/studio-virtual-space-emote-catalog.ts` },
      { value: "130px · 90초", label: t("NPC 인사 반경 · 같은 NPC 쿨다운(설계값)", "NPC greeting radius and per-NPC cooldown (design values)"), source: `${V}/studio-virtual-space-npc.ts` },
    ],
    reviewedAt: VIRTUAL_SPACE_REVIEWED_AT,
  },
];
