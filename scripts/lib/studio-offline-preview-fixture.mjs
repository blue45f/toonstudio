import { randomUUID } from "node:crypto";

const CAPABILITIES_PATH = "/api/health/capabilities";
const SESSION_PATH = "/api/auth/session";
const TICKET_PATH = "/api/studio-realtime/tickets";
const FIXTURE_PATHS = new Set([CAPABILITIES_PATH, SESSION_PATH, TICKET_PATH]);
const RECEIPT_HEADER = "x-toonstudio-offline-preview-receipt";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

/** 로컬 편집만 검증하는 소유한 preview에 서버 부재를 명시한다. */
export function studioOfflinePreviewCapabilities(now = new Date()) {
  return {
    status: "degraded",
    incidentId: "inc_studio_offline_preview",
    retryAfterSeconds: 30,
    checkedAt: now.toISOString(),
    edgeOriginAuth: "disabled",
    capabilities: {
      publicCatalog: "available",
      authSession: "available",
      communityRead: "unavailable",
      communityWrite: "unavailable",
      marketplaceRead: "unavailable",
      studioLocalEditing: "available",
      studioProjectRead: "unavailable",
      studioCloudSave: "unavailable",
      realtimeCollaboration: "unavailable",
      publishing: "unavailable",
      serverAi: "degraded",
    },
  };
}

function ownedPreviewOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Offline API fixture에는 직접 시작한 loopback preview origin이 필요합니다.");
  }
  return url.origin;
}

function offlinePreviewReply(pathname, method) {
  if (pathname === CAPABILITIES_PATH && method === "GET") return { status: 200, body: studioOfflinePreviewCapabilities() };
  if (pathname === SESSION_PATH && method === "GET") return { status: 200, body: { authenticated: false, user: null } };
  // 협업 성공이나 허위 ticket을 만들지 않고 실제 비로그인 HTTP 계약을 검증한다.
  if (pathname === TICKET_PATH && method === "POST") return { status: 401, body: { statusCode: 401, message: "Unauthorized" } };
  return null;
}

/** SW 제어 후 browser route를 우회하는 요청에도 소유한 preview의 같은 계약을 제공한다. */
export function createStudioOfflinePreviewServerFixture(ownedOrigin) {
  const origin = ownedPreviewOrigin(ownedOrigin);
  if (!origin) throw new Error("HTTP fixture에는 직접 시작한 loopback preview origin이 필요합니다.");
  const host = new URL(origin).host;
  /** @type {Map<string, { url: string, method: string, status: number, request?: import('playwright').Request }>} */
  const receipts = new Map();
  /** @type {import('vite').Connect.NextHandleFunction} */
  const middleware = (request, response, next) => {
    const url = new URL(request.url ?? "/", origin);
    if (request.headers.host !== host || url.origin !== origin || url.search) return next();
    const method = request.method ?? "GET";
    const reply = offlinePreviewReply(url.pathname, method);
    if (!reply) return next();
    const receiptId = randomUUID();
    receipts.set(receiptId, { url: url.href, method, status: reply.status });
    response.statusCode = reply.status;
    response.setHeader("Content-Type", JSON_CONTENT_TYPE);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader(RECEIPT_HEADER, receiptId);
    request.resume();
    response.end(JSON.stringify(reply.body));
  };
  /** @type {import('vite').Plugin} */
  const plugin = {
    name: "studio-offline-preview-api-fixture",
    configurePreviewServer(server) {
      // Vite의 /api proxy보다 먼저 응답해야 SW·브라우저의 요청 소유자와 무관하게 동작한다.
      server.middlewares.use(middleware);
    },
  };
  return {
    origin,
    plugin,
    middleware,
    /** @param {import('playwright').Response} response */
    claimResponse(response) {
      const headers = response.headers();
      const receiptId = headers[RECEIPT_HEADER];
      const receipt = receipts.get(receiptId);
      const request = response.request();
      if (!receipt || receipt.url !== response.url() || receipt.method !== request.method()
        || receipt.status !== response.status() || headers["cache-control"] !== "no-store"
        || headers["content-type"] !== JSON_CONTENT_TYPE || (receipt.request && receipt.request !== request)) return null;
      // 같은 URL의 별도 요청이 이전 401 receipt를 재사용해 허용되지 않도록 identity를 묶는다.
      receipt.request = request;
      return { receiptId, status: receipt.status };
    },
  };
}

/**
 * @param {{ route: import('playwright').BrowserContext['route'],
 *   on: (event: 'response', listener: (response: import('playwright').Response) => void) => unknown }} context
 * @param {string} ownedOrigin 직접 시작한 서버만 전달한다. 외부 서버는 빈 문자열로 실제 API를 사용한다.
 * @param {ReturnType<typeof createStudioOfflinePreviewServerFixture> | null} [serverFixture]
 * @returns {Promise<{ mode: string, responses: { url: string, method: string, status: number, transport?: string, receiptId?: string }[],
 *   unexpectedResponses: { url: string, method: string, status: number, expectedStatus?: number }[],
 *   isExpectedConsole: (text: string, url: string) => boolean }>}
 */
export async function installStudioOfflinePreviewFixture(context, ownedOrigin, serverFixture = null) {
  const origin = ownedPreviewOrigin(ownedOrigin);
  if (serverFixture && serverFixture.origin !== origin) throw new Error("HTTP fixture와 관찰할 preview origin이 다릅니다.");
  /** @type {{ url: string, method: string, status: number, transport?: string, receiptId?: string }[]} */
  const responses = [];
  const unexpectedResponses = [];
  /** @type {WeakMap<import('playwright').Request, number>} */
  const fulfilledRequests = new WeakMap();
  /** @type {Set<string>} */
  const observedGuestDenials = new Set();
  const result = {
    mode: origin ? "owned-preview-offline-api-fixture" : "live-api",
    responses,
    unexpectedResponses,
    isExpectedConsole(text, url) {
      // console에는 request identity가 없으므로 실제 응답 검증이 최종 실패 기준이다.
      // 동일 URL의 다른 메서드·상태는 이 console 문구와 무관하게 실패 배열에 남는다.
      return /^Failed to load resource: the server responded with a status of 401 \(Unauthorized\)$/u.test(text)
        && observedGuestDenials.has(url)
        && !unexpectedResponses.some((response) => response.url === url);
    },
  };
  context.on("response", (response) => {
    const status = response.status();
    if (!FIXTURE_PATHS.has(new URL(response.url()).pathname)) return;
    const request = response.request();
    const receipt = serverFixture?.claimResponse(response);
    const expectedStatus = fulfilledRequests.get(request) ?? receipt?.status;
    if (receipt) responses.push({ url: response.url(), method: request.method(), status, transport: "http", receiptId: receipt.receiptId });
    if (status < 400) return;
    if (expectedStatus === status) {
      if (status === 401 && request.method() === "POST") observedGuestDenials.add(response.url());
    } else {
      unexpectedResponses.push({ url: response.url(), method: request.method(), status, expectedStatus });
    }
  });
  if (!origin) return result;
  await context.route((url) => url.origin === origin && !url.search
    && FIXTURE_PATHS.has(url.pathname), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const reply = offlinePreviewReply(url.pathname, method);
    if (!reply) return route.fallback();
    const { body, status } = reply;
    // fulfill이 완료되기 전에 response 이벤트가 올 수 있으므로 호출 직전에 identity를 등록한다.
    fulfilledRequests.set(request, status);
    try {
      await route.fulfill({
        status,
        contentType: JSON_CONTENT_TYPE,
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify(body),
      });
      responses.push({ url: request.url(), method, status });
    } catch (error) {
      fulfilledRequests.delete(request);
      throw error;
    }
  });
  return result;
}
