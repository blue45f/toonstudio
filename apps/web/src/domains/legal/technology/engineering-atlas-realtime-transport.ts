import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · realtime 카테고리 중 전송 계층 실험 카드(WebTransport).
 * 주 파일(engineering-atlas-realtime.ts)이 다른 묶음과 함께 배열에 합친다.
 * 모든 값은 2026-10-07 기준으로 코드·설정을 직접 열어 확인했고, 표준 성숙도는 MDN·W3C·IETF 원문에서 확인했다.
 */
const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const CREATOR = "apps/web/src/domains/creator";
const LIVE = `${CREATOR}/live`;

export const ENGINEERING_ATLAS_REALTIME_TRANSPORT: readonly EngineeringAtlasEntry[] = [
  {
    id: "webtransport-experiment",
    category: "realtime",
    name: "WebTransport",
    title: t("WebSocket 다음 후보로 코드만 준비해 둔 WebTransport", "WebTransport, built as WebSocket's next candidate but not switched on"),
    status: "experimental",
    tagline: t(
      "커서 같은 가벼운 신호를 막힘 없이 보낼 전송을 만들어 두었지만, 서버 종단이 없어 꺼져 있습니다.",
      "A transport for light signals like cursors is built, but with no server termination it stays off.",
    ),
    background: [
      t(
        "WebSocket은 한 줄로 이어진 전화선과 같습니다. 중간에 말 한마디가 늦으면 뒤에 오는 말이 전부 함께 기다립니다. WebTransport는 한 도로에 여러 차선을 내 주는 기술입니다. 꼭 순서대로 도착해야 하는 소식은 등기우편 차선(신뢰 스트림)으로, 빠르게 지나가면 그만인 소식은 엽서 차선(데이터그램)으로 보냅니다. 마우스 커서 위치는 최신 값만 의미가 있어서 중간 값 몇 개가 사라져도 괜찮은 엽서 쪽에 어울립니다.",
        "A WebSocket is like a single telephone line: if one word is late, everything behind it waits. WebTransport gives the road several lanes. News that must arrive in order goes by registered mail (a reliable stream), and news that is fine to lose goes by postcard (a datagram). A mouse cursor's position only matters in its latest value, so losing a few in-between ones is fine, which suits the postcard lane.",
      ),
      t(
        "브라우저가 주로 HTTP/3(QUIC) 연결 하나를 열고 그 위에 스트림과 데이터그램을 만듭니다. ToonStudio의 소켓 코드는 기존 WebSocket 어댑터가 요구하는 소켓 계약을 그대로 구현해, 티켓·welcome 핸드셰이크·재개 같은 프로토콜은 바꾸지 않고 전송만 바꿉니다. 스트림에는 메시지 경계가 없어 4바이트 길이를 앞에 붙인 JSON을 보내고, 데이터그램은 접속 상태 채널의 커서 발행 프레임에만 쓸 수 있으며 전송 중 1개와 대기 중 최신 1개만 남깁니다.",
        "The browser opens one connection, mainly over HTTP/3 (QUIC), and creates streams and datagrams on it. ToonStudio's socket code implements exactly the socket contract the existing WebSocket adapter expects, so the protocol (ticket, welcome handshake, resume) stays unchanged and only the transport swaps. Streams have no message boundaries, so JSON is sent with a 4-byte length in front, and datagrams may carry only cursor publish frames of the presence channel, keeping one in flight and the latest one waiting.",
      ),
      t(
        "대안은 지금 쓰는 WebSocket(TCP, 서버 지원이 넓음)과 WebRTC 데이터 채널(비신뢰 모드가 가능하지만 연결 수립이 무겁고 서버가 받기에도 번거로움)입니다. WebTransport의 브라우저 API는 W3C 후보 권고안(2026-07-30 스냅샷)이고, MDN은 2026년 3월부터 최신 기기와 브라우저에서 동작하는 'Baseline 2026 Newly available'로 표시하되 일부 기능은 지원 수준이 다르다고 덧붙입니다. 서버 쪽 HTTP/3 규격은 아직 IETF 인터넷 초안(draft-ietf-webtrans-http3-16, 작업반 최종 검토 단계)이며 RFC가 아닙니다. 이 세 가지는 외부 문서 기준이며 2026-10-08에 W3C·MDN·IETF 문서를 열어 확인한 내용이라 이후 바뀔 수 있습니다.",
        "Alternatives are the WebSocket now in use (TCP, widely supported by servers) and WebRTC data channels (which can run unreliably, but are heavy to set up and awkward for a server to terminate). The browser API of WebTransport is a W3C Candidate Recommendation (snapshot of 30 July 2026), and MDN labels it 'Baseline 2026 Newly available', working across the latest devices and browsers since March 2026, while adding that some parts differ in support. The HTTP/3 mapping on the server side is still an IETF Internet-Draft (draft-ietf-webtrans-http3-16, in working-group last call) and not an RFC. These three statements follow external documents, checked by opening the W3C, MDN and IETF pages on 2026-10-08, and may change later.",
      ),
      t(
        "지금 운영에서는 켜져 있지 않고, 코드를 바꾸지 않고는 켤 수도 없습니다. 엔드포인트 옵션은 어댑터와 목적별 라우팅 팩토리에만 있고, 실제 호출부는 실시간 origin과 공급자 ID만 넘기며 환경 변수나 설정 경로가 없습니다. 어댑터 주석은 현재 서버(Cloudflare Workers·Durable Objects)가 WebTransport를 종단할 수 없다고 적습니다. Cloudflare 공식 문서를 검색했지만 지원 안내는 찾지 못했고, 서버 계약 문서도 저장소에 없습니다. 검증은 가짜 전송을 끼운 단위 테스트 15건이며, 지연 시간 이득은 측정한 적 없는 가설입니다.",
        "It is neither switched on in production today nor able to be switched on without changing code. The endpoint option exists only in the adapter and the purpose-routing factory, the real caller passes only the realtime origin and provider ID, and there is no environment variable or settings path. The adapter's comment records that the current server (Cloudflare Workers and Durable Objects) cannot terminate WebTransport. A search of the official Cloudflare documentation found no support guidance, and no server contract document exists in the repository. Verification is 15 unit tests with a fake transport, and any latency gain is an unmeasured hypothesis.",
      ),
    ],
    keyPoints: [
      t("WebSocket과 같은 소켓 계약을 구현해 전송만 바꾸는 설계입니다", "It implements the WebSocket socket contract so only the transport swaps"),
      t("중요한 메시지는 길이 접두 스트림, 커서만 데이터그램(옵션)", "Important messages use a length-prefixed stream; only cursors may use datagrams"),
      t("서버 종단과 켜는 배선이 없어 운영에서는 꺼져 있습니다", "With no server termination or wiring, it is off in production"),
      t("지연 시간 이득은 측정한 적 없는 가설입니다", "The latency gain is an unmeasured hypothesis"),
    ],
    diagram: {
      id: "webtransport-experiment-diagram",
      kind: "graph",
      title: t("WebTransport가 앞에 놓이는 조건과 폴백", "When WebTransport goes first, and the fallback"),
      caption: t(
        "엔드포인트가 있을 때만 WebTransport를 먼저 시도하고, 아니면 지금처럼 WebSocket으로 갑니다. 앞쪽 길은 현재 꺼져 있습니다.",
        "WebTransport is tried first only when an endpoint exists; otherwise it is WebSocket as today. The front path is off right now.",
      ),
      alt: t(
        "실시간 메시지는 제공자 체인으로 들어갑니다. 엔드포인트가 설정되면 WebTransport가 앞에 놓이고 신뢰 스트림과 옵션인 커서 데이터그램으로 QUIC 서버에 닿지만, 서버 종단이 없어 현재는 꺼져 있습니다. 체인의 맨 뒤에는 항상 WebSocket이 있어 지금은 Durable Objects가 이 길로 메시지를 받습니다.",
        "Realtime messages enter a provider chain. When an endpoint is configured, WebTransport goes first and reaches a QUIC server through a reliable stream and an optional cursor datagram, but with no server termination it is off today. WebSocket is always last in the chain, and Durable Objects receives messages that way today.",
      ),
      nodes: [
        { id: "msg", label: t("실시간 메시지", "Realtime message"), sub: t("접속 상태·커서·신호", "Presence, cursors, signals"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "chain", label: t("제공자 체인", "Provider chain"), sub: t("위에서부터 차례로 시도", "Tried in order, top first"), tone: "local", at: [1, 0] },
        { id: "wt", label: t("WebTransport", "WebTransport"), sub: t("엔드포인트가 있어야 앞에 놓임", "First only with an endpoint"), tone: "warn", at: [2, 0] },
        { id: "stream", label: t("신뢰 스트림", "Reliable stream"), sub: t("길이 접두 + JSON", "Length prefix + JSON"), tone: "neutral", at: [3, 0] },
        { id: "datagram", label: t("데이터그램", "Datagram"), sub: t("커서 좌표만 · 옵션", "Cursor only, optional"), tone: "warn", at: [3, 1] },
        { id: "server", label: t("QUIC 서버", "QUIC server"), sub: t("종단 없음 · 계약 대기", "None yet; contract pending"), tone: "warn", at: [4, 0] },
        { id: "ws", label: t("WebSocket", "WebSocket"), sub: t("항상 체인 맨 뒤", "Always last in the chain"), tone: "good", at: [1, 1] },
        { id: "do", label: t("Durable Objects", "Durable Objects"), sub: t("지금 실제로 받는 곳", "What serves today"), tone: "edge", at: [1, 2] },
      ],
      edges: [
        { from: "msg", to: "chain", label: t("발행", "Publish") },
        { from: "chain", to: "wt", style: "dashed", label: t("설정 시", "If set") },
        { from: "wt", to: "stream", label: t("기본", "Default") },
        { from: "wt", to: "datagram", style: "dashed", label: t("옵션", "Option") },
        { from: "stream", to: "server", label: t("QUIC", "QUIC") },
        { from: "datagram", to: "server", style: "dashed", label: t("유실 허용", "Lossy") },
        { from: "chain", to: "ws", label: t("항상", "Always") },
        { from: "ws", to: "do", label: t("wss", "wss") },
      ],
      groups: [
        { id: "off", label: t("현재 꺼짐", "Off today"), tone: "warn", nodeIds: ["wt", "stream", "datagram", "server"] },
      ],
    },
    usage: [
      {
        feature: t("공동 작업실 · 실시간 전송 교체 준비", "Shared workroom · preparing a realtime transport swap"),
        role: t(
          "기존 Cloudflare 실시간 어댑터가 요구하는 소켓 계약을 WebTransport로 구현해 두었습니다. 엔드포인트가 주어지면 제공자 체인 맨 앞에 놓이지만, 지금은 엔드포인트를 넘기는 설정 경로가 없어 켜지지 않습니다.",
          "The socket contract that the existing Cloudflare realtime adapter requires is implemented over WebTransport. With an endpoint it would go first in the provider chain, but there is no settings path that passes one, so it does not switch on.",
        ),
        paths: [
          `${CREATOR}/studio-realtime-webtransport-socket.ts#StudioWebTransportSocket`,
          `${CREATOR}/studio-realtime-webtransport-adapter.ts#createStudioRealtimeAdapterFactories`,
        ],
      },
      {
        feature: t("공동 작업실 · 커서 좌표 전송 (옵션 레인)", "Shared workroom · cursor delivery (optional lane)"),
        role: t(
          "접속 상태 채널의 커서 발행 프레임만 데이터그램 후보로 분류하고, 전송 중 1개와 대기 중 최신 1개만 남깁니다. 옵션을 켜지 않으면 모든 프레임이 신뢰 스트림으로 갑니다.",
          "Only cursor publish frames of the presence channel are classed as datagram candidates, and just one in flight and the latest one waiting are kept. Unless the option is on, every frame goes over the reliable stream.",
        ),
        paths: [`${CREATOR}/studio-realtime-webtransport-socket.ts#isStudioRealtimeVolatileFrame`],
      },
      {
        feature: t("공동 작업실 · 지원하지 않을 때의 폴백", "Shared workroom · fallback when unsupported"),
        role: t(
          "브라우저에 WebTransport가 없으면 어댑터 팩토리가 곧바로 '폴백 필요' 오류를 던져 같은 시도 안에서 다음 제공자(WebSocket)로 넘어갑니다. 세션 수립이나 welcome 핸드셰이크가 실패해도 같은 길을 탑니다.",
          "Without WebTransport in the browser, the adapter factory throws a 'fallback required' error at once and the same attempt moves on to the next provider (WebSocket). A failed session setup or welcome handshake takes the same path.",
        ),
        paths: [
          `${CREATOR}/studio-realtime-webtransport-adapter.ts#studioWebTransportClientSupported`,
          `${CREATOR}/studio-realtime-provider-runtime.ts#StudioRealtimeProviderFallbackRequiredError`,
        ],
      },
      {
        feature: t("공동 작업실 · 목적별 라우팅의 옵션 자리", "Shared workroom · the option slot in purpose-based routing"),
        role: t(
          "목적별 라우팅 팩토리의 옵션에 webTransportEndpoint 필드가 있지만, 운영 호출부는 실시간 origin과 공급자 ID만 넘깁니다.",
          "The purpose-routing factory has a webTransportEndpoint option field, but the production caller passes only the realtime origin and the provider ID.",
        ),
        paths: [
          `${LIVE}/studio-live-purpose-routed-transport.ts#createStudioCloudflarePurposeRoutedLiveTransportFactory`,
          `${LIVE}/studio-live-socket-connection-factory.ts#applyStudioRealtimePurposeRouting`,
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("스트림에 메시지 경계 만들기 (길이 접두)", "Building message boundaries on a stream (length prefix)"),
        language: "ts",
        code: `const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 스트림은 바이트의 흐름이라 메시지 경계가 없다: 앞에 4바이트 길이를 붙여 보낸다.
export function frame(message: unknown): Uint8Array {
  const payload = encoder.encode(JSON.stringify(message));
  const out = new Uint8Array(4 + payload.byteLength);
  new DataView(out.buffer).setUint32(0, payload.byteLength, false); // big-endian
  out.set(payload, 4);
  return out;
}

// 쪼개져 도착하는 조각을 이어 붙이고, 완성된 메시지만 꺼낸다.
export function createReader(onMessage: (message: unknown) => void): (chunk: Uint8Array) => void {
  let buffer = new Uint8Array(0);
  return (chunk) => {
    const merged = new Uint8Array(buffer.byteLength + chunk.byteLength);
    merged.set(buffer, 0);
    merged.set(chunk, buffer.byteLength);
    buffer = merged;
    while (buffer.byteLength >= 4) {
      const length = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0, false);
      if (buffer.byteLength < 4 + length) return; // 아직 덜 왔다
      onMessage(JSON.parse(decoder.decode(buffer.subarray(4, 4 + length))));
      buffer = buffer.subarray(4 + length);
    }
  };
}`,
        codeEn: `const encoder = new TextEncoder();
const decoder = new TextDecoder();

// A stream is a flow of bytes with no message boundaries: send a 4-byte length in front.
export function frame(message: unknown): Uint8Array {
  const payload = encoder.encode(JSON.stringify(message));
  const out = new Uint8Array(4 + payload.byteLength);
  new DataView(out.buffer).setUint32(0, payload.byteLength, false); // big-endian
  out.set(payload, 4);
  return out;
}

// Join the chunks that arrive in pieces and take out only completed messages.
export function createReader(onMessage: (message: unknown) => void): (chunk: Uint8Array) => void {
  let buffer = new Uint8Array(0);
  return (chunk) => {
    const merged = new Uint8Array(buffer.byteLength + chunk.byteLength);
    merged.set(buffer, 0);
    merged.set(chunk, buffer.byteLength);
    buffer = merged;
    while (buffer.byteLength >= 4) {
      const length = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0, false);
      if (buffer.byteLength < 4 + length) return; // the rest has not arrived yet
      onMessage(JSON.parse(decoder.decode(buffer.subarray(4, 4 + length))));
      buffer = buffer.subarray(4 + length);
    }
  };
}`,
        explain: t(
          "WebSocket은 메시지 경계를 알아서 지켜 주지만 스트림은 바이트만 흘려보냅니다. 그래서 길이를 앞에 붙이고, 받는 쪽은 조각이 모자라면 기다립니다. 실제 소켓은 같은 방식에 더해 길이가 32MiB를 넘으면 읽기를 멈추는 가드를 두고, 연결 하나에 양방향 스트림 하나를 씁니다.",
          "A WebSocket keeps message boundaries for you, but a stream only passes bytes along. So a length goes in front and the receiver waits when a piece is missing. The real socket does the same and adds a guard that stops reading when a length exceeds 32 MiB, using one bidirectional stream per connection.",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("커서는 최신 값만: 전송 중 1개 + 대기 최신 1개", "Cursors keep only the latest: one in flight plus one waiting"),
        language: "ts",
        code: `export function createCursorLane(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  maxBytes: number,
  sendReliable: (bytes: Uint8Array) => void,
): (bytes: Uint8Array) => void {
  let inFlight = false;
  let pending: Uint8Array | null = null;

  const write = (bytes: Uint8Array): void => {
    inFlight = true;
    writer
      .write(bytes)
      .catch(() => undefined) // 유실은 허용한다: 다음 커서가 대신한다
      .finally(() => {
        inFlight = false;
        const next = pending;
        pending = null;
        if (next) write(next);
      });
  };

  return (bytes) => {
    if (bytes.byteLength > maxBytes) return sendReliable(bytes); // 데이터그램에 못 들어가면 신뢰 스트림으로
    if (inFlight) pending = bytes; // 중간 값은 버리고 최신 하나만 남긴다
    else write(bytes);
  };
}`,
        codeEn: `export function createCursorLane(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  maxBytes: number,
  sendReliable: (bytes: Uint8Array) => void,
): (bytes: Uint8Array) => void {
  let inFlight = false;
  let pending: Uint8Array | null = null;

  const write = (bytes: Uint8Array): void => {
    inFlight = true;
    writer
      .write(bytes)
      .catch(() => undefined) // losing one is fine: the next cursor replaces it
      .finally(() => {
        inFlight = false;
        const next = pending;
        pending = null;
        if (next) write(next);
      });
  };

  return (bytes) => {
    if (bytes.byteLength > maxBytes) return sendReliable(bytes); // too big for a datagram: use the reliable stream
    if (inFlight) pending = bytes; // drop in-between values and keep only the latest
    else write(bytes);
  };
}`,
        explain: t(
          "정체되었을 때 낡은 커서가 줄을 서서 늦게 도착하는 것보다, 중간 값을 버리고 최신 값만 보내는 편이 커서에는 맞습니다. 실제 코드는 협상된 최대 데이터그램 크기와 16KiB 중 작은 값을 상한으로 삼고, 이 레인은 datagramCursorLane 옵션을 켤 때만 열립니다.",
          "When things back up, it suits a cursor better to drop in-between values and send only the latest than to let old cursors queue and arrive late. The real code uses the smaller of the negotiated maximum datagram size and 16 KiB as the cap, and this lane opens only when the datagramCursorLane option is on.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · WebTransport API", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API", kind: "docs", note: t("지원 현황(Baseline)과 사용법", "Support status (Baseline) and usage") },
      { title: "W3C · WebTransport", url: "https://www.w3.org/TR/webtransport/", kind: "spec", note: t("브라우저 API 명세(후보 권고안)", "The browser API specification (Candidate Recommendation)") },
      { title: "IETF · WebTransport over HTTP/3 (Internet-Draft)", url: "https://datatracker.ietf.org/doc/draft-ietf-webtrans-http3/", kind: "spec", note: t("서버 쪽 규격: 아직 RFC가 아닌 초안", "The server-side protocol: still a draft, not yet an RFC") },
      { title: "IETF RFC 9000 · QUIC", url: "https://www.rfc-editor.org/rfc/rfc9000", kind: "spec" },
      { title: "IETF RFC 9221 · QUIC Datagram Extension", url: "https://www.rfc-editor.org/rfc/rfc9221", kind: "spec", note: t("데이터그램이 유실될 수 있는 이유", "Why datagrams may be lost") },
      { title: "Cloudflare · Durable Objects WebSockets", url: "https://developers.cloudflare.com/durable-objects/best-practices/websockets/", kind: "docs", note: t("지금 서버가 받는 방식(WebSocket)", "How the server receives today (WebSocket)") },
    ],
    chapterIds: ["webtransport-transport", "nextgen-web-experiments"],
    talk: {
      pitch: t(
        "WebSocket은 한 줄짜리 전화선이라 앞의 말이 늦으면 뒤의 말이 모두 기다립니다. WebTransport는 순서를 지키는 차선과 유실을 허용하는 엽서 차선을 함께 주는 차세대 전송입니다. ToonStudio는 기존 소켓 계약을 그대로 구현한 클라이언트 코드를 미리 만들어 두었고, 지원하지 않으면 곧바로 WebSocket으로 갑니다. 다만 서버 종단과 켜는 설정이 없어 운영에서는 꺼져 있고, 속도 이득도 측정한 적이 없습니다. 이 카드는 준비된 실험입니다.",
        "A WebSocket is a single telephone line, so when an early word is late everything behind it waits. WebTransport is a next-generation transport that gives both an ordered lane and a postcard lane that tolerates loss. ToonStudio has built client code that implements the existing socket contract, and without support it falls back to WebSocket at once. But with no server termination and no way to switch it on, it is off in production, and its speed gain has never been measured. This card is a prepared experiment.",
      ),
      analogy: t(
        "한 줄짜리 전화선과 여러 차선 도로의 차이입니다. 등기우편 차선은 순서와 도착을 지키고, 엽서 차선은 빠르지만 잃어버려도 됩니다. 마우스 커서 위치는 엽서로 충분합니다.",
        "It is the difference between a single telephone line and a multi-lane road. The registered-mail lane keeps order and delivery, and the postcard lane is fast but may lose a card. A mouse cursor's position is fine by postcard.",
      ),
      questions: [
        {
          question: t("그래서 WebSocket보다 빨라지나요?", "So is it faster than WebSocket?"),
          answer: t(
            "이론상 한 패킷이 늦어도 다른 스트림이 막히지 않고 커서는 유실을 허용해 지연의 꼬리가 줄 수 있습니다. 하지만 이 저장소에서 측정한 적이 없고, 지금은 켜지지도 않습니다.",
            "In theory, one late packet does not block other streams and cursors tolerate loss, so the tail of the latency could shrink. But it has never been measured in this repository, and it is not switched on today.",
          ),
        },
        {
          question: t("왜 지금 켜지 않나요?", "Why is it not switched on now?"),
          answer: t(
            "서버가 필요합니다. 코드 주석은 지금의 Cloudflare Workers·Durable Objects가 WebTransport를 종단할 수 없다고 적고, 공식 문서에서도 지원 안내를 찾지 못했습니다. 클라이언트에도 엔드포인트를 넘기는 설정 경로가 없습니다.",
            "A server is needed. A code comment says today's Cloudflare Workers and Durable Objects cannot terminate WebTransport, and no support guidance was found in the official documentation. The client also has no settings path that passes an endpoint.",
          ),
        },
        {
          question: t("브라우저가 지원하지 않으면요?", "What if the browser does not support it?"),
          answer: t(
            "소켓 팩토리를 만드는 시점에 지원 여부를 감지해 곧바로 WebSocket으로 넘어가고, 세션 수립이 실패해도 같은 시도 안에서 다음 제공자로 넘어갑니다.",
            "Support is detected when the socket factory is created and it moves straight on to WebSocket; a failed session setup also moves to the next provider within the same attempt.",
          ),
        },
      ],
      pitfall: t(
        "'WebSocket을 곧 대체한다'거나 '더 빠르다'고 말하지 마세요. 운영 경로는 WebSocket뿐이고, 켜는 설정 경로도 서버 종단도 없습니다. 제작 스토리 챕터 34의 상태 라벨 '설정 필요'를 설정만 바꾸면 켜진다는 뜻으로 읽지 마세요. 켜려면 호출부 코드 변경과 서버 개발이 필요합니다. 표준 성숙도도 함께 말하세요. 브라우저 API는 후보 권고안, 서버 쪽 규격은 아직 초안입니다.",
        "Do not say it will soon replace WebSocket or that it is faster. The only production path is WebSocket, and there is neither a settings path to switch it on nor a server termination. Do not read the status label 'Setup required' in story chapter 34 as 'it turns on by changing settings': switching it on needs a code change at the call site and server development. Mention the maturity of the standards too: the browser API is a Candidate Recommendation and the server-side protocol is still a draft.",
      ),
    },
    technologies: ["WebTransport", "HTTP/3 (QUIC)", "WebSocket", "datagram", "capability detection"],
    facts: [
      { value: "4 B", label: t("스트림 프레임 앞의 길이 접두", "Length prefix in front of a stream frame"), source: `${CREATOR}/studio-realtime-webtransport-socket.ts` },
      { value: "16 KiB", label: t("데이터그램 하나의 크기 상한", "Size cap of one datagram"), source: `${CREATOR}/studio-realtime-webtransport-socket.ts` },
      { value: "32 MiB", label: t("스트림 프레임 위생 가드", "Stream-frame sanity guard"), source: `${CREATOR}/studio-realtime-webtransport-socket.ts` },
      { value: "15", label: t("가짜 전송으로 검증하는 단위 테스트 수", "Unit tests run with a fake transport"), source: `${CREATOR}/studio-realtime-webtransport-adapter.test.ts` },
    ],
    reviewedAt: "2026-10-07",
  },
];
