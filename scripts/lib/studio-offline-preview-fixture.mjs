const CAPABILITIES_PATH = "/api/health/capabilities";
const SESSION_PATH = "/api/auth/session";
const TICKET_PATH = "/api/studio-realtime/tickets";
const FIXTURE_PATHS = new Set([CAPABILITIES_PATH, SESSION_PATH, TICKET_PATH]);

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

/**
 * @param {{ route: import('playwright').BrowserContext['route'],
 *   on: (event: 'response', listener: (response: import('playwright').Response) => void) => unknown }} context
 * @param {string} ownedOrigin 직접 시작한 서버만 전달한다. 외부 서버는 빈 문자열로 실제 API를 사용한다.
 * @returns {Promise<{ mode: string, responses: { url: string, method: string, status: number }[],
 *   unexpectedResponses: { url: string, method: string, status: number, expectedStatus?: number }[],
 *   isExpectedConsole: (text: string, url: string) => boolean }>}
 */
export async function installStudioOfflinePreviewFixture(context, ownedOrigin) {
  const origin = ownedPreviewOrigin(ownedOrigin);
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
    if (status < 400 || !FIXTURE_PATHS.has(new URL(response.url()).pathname)) return;
    const request = response.request();
    const expectedStatus = fulfilledRequests.get(request);
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
    let body;
    let status = 200;
    if (url.pathname === CAPABILITIES_PATH && method === "GET") body = studioOfflinePreviewCapabilities();
    else if (url.pathname === SESSION_PATH && method === "GET") body = { authenticated: false, user: null };
    else if (url.pathname === TICKET_PATH && method === "POST") {
      // 협업 성공이나 허위 ticket을 만들지 않고 실제 비로그인 HTTP 계약을 검증한다.
      status = 401;
      body = { statusCode: 401, message: "Unauthorized" };
    } else return route.fallback();
    // fulfill이 완료되기 전에 response 이벤트가 올 수 있으므로 호출 직전에 identity를 등록한다.
    fulfilledRequests.set(request, status);
    try {
      await route.fulfill({
        status,
        contentType: "application/json; charset=utf-8",
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
