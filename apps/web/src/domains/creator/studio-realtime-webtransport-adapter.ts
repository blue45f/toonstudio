import {
  createStudioCloudflareRealtimeAdapterFactory,
  resolveStudioCloudflareRealtimeOrigin,
} from "./studio-realtime-provider-cloudflare-adapter";
import {
  StudioRealtimeProviderFallbackRequiredError,
  type StudioRealtimeProviderAdapterFactory,
} from "./studio-realtime-provider-runtime";
import {
  createStudioWebTransportSocketFactory,
  type StudioWebTransportFactory,
} from "./studio-realtime-webtransport-socket";

/**
 * WebTransport 우선 · WebSocket 폴백의 실시간 어댑터 합성.
 *
 * 선택 구조(능력 감지 → 서버 수용 → 폴백):
 * 1. 클라이언트 감지: `WebTransport` API가 없으면 팩토리 `create()`가 즉시
 *    `StudioRealtimeProviderFallbackRequiredError`를 던지고, 세션은 다음
 *    제공자(기존 WebSocket 어댑터)로 같은 시도 안에서 넘어간다.
 * 2. 서버 수용: WebTransport 세션 수립(`ready`)이나 그 위의 welcome
 *    핸드셰이크가 실패하면 Cloudflare 어댑터의 기존 실패 경로가 세션을 닫고,
 *    런타임이 같은 시도에서 다음 제공자를 시도한다. 즉 서버가 WebTransport를
 *    받지 못하는 동안에는 WebSocket과 결과적으로 동일하게 동작한다.
 * 3. 기본 비활성: WebTransport 엔드포인트가 설정된 경우에만 체인 앞에 놓인다.
 *    현행 서버(Cloudflare Workers/Durable Objects)는 WebTransport를 종단할 수
 *    없어(서버 계약 대기), 운영 기본값은 WebSocket 단일 체인 그대로다.
 *
 * providerId·티켓·와이어 프로토콜은 WebSocket 어댑터와 동일하게 유지한다 —
 * 전송만 QUIC으로 바뀌고 방 의미는 바뀌지 않는다.
 */

export function studioWebTransportClientSupported(): boolean {
  if (typeof globalThis === "undefined") return false;
  if (!("WebTransport" in globalThis)) return false;
  const secureContext = (globalThis as { isSecureContext?: unknown })
    .isSecureContext;
  return secureContext !== false;
}

/** WebTransport 엔드포인트도 실시간 origin과 같은 엄격한 https origin만 허용한다. */
export function resolveStudioWebTransportEndpoint(
  value: string | null | undefined,
): string | null {
  return resolveStudioCloudflareRealtimeOrigin(value);
}

export interface StudioWebTransportRealtimeAdapterFactoryOptions {
  readonly providerId: string;
  readonly realtimeOrigin: string;
  /** https origin. 방 경로는 WebSocket 방 URL의 경로를 그대로 옮긴다. */
  readonly webTransportEndpoint: string;
  readonly datagramCursorLane?: boolean;
  readonly createTransport?: StudioWebTransportFactory;
  readonly clientSupported?: () => boolean;
}

export function createStudioWebTransportRealtimeAdapterFactory(
  options: StudioWebTransportRealtimeAdapterFactoryOptions,
): StudioRealtimeProviderAdapterFactory {
  const inner = createStudioCloudflareRealtimeAdapterFactory({
    providerId: options.providerId,
    realtimeOrigin: options.realtimeOrigin,
    createWebSocket: createStudioWebTransportSocketFactory({
      endpoint: options.webTransportEndpoint,
      datagramCursorLane: options.datagramCursorLane ?? false,
      createTransport: options.createTransport,
    }),
  });
  const clientSupported =
    options.clientSupported ?? studioWebTransportClientSupported;
  return Object.freeze({
    descriptor: inner.descriptor,
    create: () => {
      if (!clientSupported()) {
        throw new StudioRealtimeProviderFallbackRequiredError(
          options.providerId,
        );
      }
      return inner.create();
    },
  });
}

export interface StudioRealtimeAdapterFactoriesOptions {
  readonly providerId: string;
  readonly realtimeOrigin: string;
  /** 설정된 경우에만 WebTransport 어댑터가 체인 앞에 놓인다. */
  readonly webTransportEndpoint?: string;
  readonly datagramCursorLane?: boolean;
  readonly createTransport?: StudioWebTransportFactory;
  readonly clientSupported?: () => boolean;
}

/**
 * 세션의 제공자 체인을 만든다: [WebTransport(설정 시), WebSocket(항상)].
 * WebTransport가 빠진 체인은 기존 구성과 완전히 동일하다.
 */
export function createStudioRealtimeAdapterFactories(
  options: StudioRealtimeAdapterFactoriesOptions,
): StudioRealtimeProviderAdapterFactory[] {
  const factories: StudioRealtimeProviderAdapterFactory[] = [];
  if (options.webTransportEndpoint) {
    factories.push(
      createStudioWebTransportRealtimeAdapterFactory({
        providerId: options.providerId,
        realtimeOrigin: options.realtimeOrigin,
        webTransportEndpoint: options.webTransportEndpoint,
        datagramCursorLane: options.datagramCursorLane,
        createTransport: options.createTransport,
        clientSupported: options.clientSupported,
      }),
    );
  }
  factories.push(
    createStudioCloudflareRealtimeAdapterFactory({
      providerId: options.providerId,
      realtimeOrigin: options.realtimeOrigin,
    }),
  );
  return factories;
}
