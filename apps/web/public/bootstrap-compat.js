(function () {
  "use strict";

  if (typeof window === "undefined") return;

  // Zod 4 supports this pre-bootstrap for strict-CSP runtimes. Configure it before the
  // application module graph is evaluated so Zod does not probe `new Function`, which is
  // blocked by production CSP and would otherwise emit a securitypolicyviolation event.
  var zodConfig = window.__zod_globalConfig;
  if (!zodConfig || typeof zodConfig !== "object") {
    zodConfig = {};
    window.__zod_globalConfig = zodConfig;
  }
  zodConfig.jitless = true;

  // The application has a module-only entry and its Studio engine loads WASM.
  // Keep this probe ES5-parseable because browsers that fail it still need to
  // execute this file and render the upgrade message.
  var moduleProbe = document.createElement("script");
  var isSupported =
    "noModule" in moduleProbe &&
    typeof Promise !== "undefined" &&
    typeof fetch !== "undefined" &&
    typeof Symbol !== "undefined" &&
    typeof WebAssembly !== "undefined";
  if (isSupported) return;

  var state = window.__toonstudioUnsupportedBrowserFallback;
  if (!state || typeof state !== "object") {
    state = { rendered: false, readyListener: null };
    window.__toonstudioUnsupportedBrowserFallback = state;
  }

  function removeReadyListener() {
    if (
      state.readyListener &&
      typeof document.removeEventListener === "function"
    ) {
      document.removeEventListener(
        "DOMContentLoaded",
        state.readyListener,
        false
      );
    }
    state.readyListener = null;
  }

  function renderUnsupportedBrowser() {
    if (state.rendered) {
      removeReadyListener();
      return true;
    }

    var root = document.getElementById("root");
    if (!root) return false;

    var panel = document.createElement("div");
    panel.style.cssText =
      "padding:40px 20px;text-align:center;font-family:sans-serif;background:#1a1410;color:#fff;min-height:100vh";

    var heading = document.createElement("h2");
    heading.textContent = "브라우저 업데이트가 필요합니다";
    heading.style.cssText = "font-size:24px;margin-bottom:12px;color:#f59e0b";

    var message = document.createElement("p");
    message.textContent =
      "현재 사용 중인 브라우저는 최신 웹 표준을 지원하지 않아 웹사이트를 표시할 수 없습니다. Chrome, Edge, Safari 또는 Firefox 최신 버전으로 업데이트해 주세요.";
    message.style.cssText =
      "font-size:14px;color:#ccc;max-width:480px;margin:0 auto 24px";

    var link = document.createElement("a");
    link.href = "https://www.google.com/chrome/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Chrome 다운로드";
    link.style.cssText =
      "display:inline-block;padding:12px 24px;background:#f59e0b;color:#000;font-weight:bold;text-decoration:none;border-radius:12px";

    panel.appendChild(heading);
    panel.appendChild(message);
    panel.appendChild(link);

    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(panel);
    state.rendered = true;
    removeReadyListener();
    return true;
  }

  if (renderUnsupportedBrowser()) return;
  if (
    !state.readyListener &&
    typeof document.addEventListener === "function"
  ) {
    state.readyListener = function () {
      renderUnsupportedBrowser();
    };
    document.addEventListener("DOMContentLoaded", state.readyListener, false);
  }
})();

// 오프라인 새 탭에서는 앱 모듈을 읽기 전에 현재 쿠키에 해당하는 HTTP 캐시를 조회한다.
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.navigator || window.navigator.onLine !== false ||
      document.visibilityState === "hidden" || typeof AbortController !== "function") return;
  var route = /^\/studio\/work\/([A-Za-z0-9_-]+)\/canvas$/.exec(window.location.pathname);
  if (!route) return;
  function discard(reason) {
    controller.abort(reason);
    window.clearTimeout(timer);
    if (window.__toonstudioTakeOfflineOwnerResponse === take) delete window.__toonstudioTakeOfflineOwnerResponse;
  }
  function current() {
    return !events.aborted && window.navigator.onLine === false && document.visibilityState !== "hidden" &&
      window.location.pathname === route[0] && Date.now() < expiresAt && storage.getItem(scopeKey) === scope &&
      storage.getItem(versionKey) === version && storage.getItem(readerKey) === reader;
  }

  function take(href, capability, signal) {
    if (href !== url.href || capability !== reader || signal.aborted || !current()) return null;
    return ready.then(function (response) {
      if (!response || signal.aborted || !current()) return null;
      // StrictMode의 취소된 첫 읽기가 다음 effect의 응답을 소비하지 않게 한다.
      return { response: response.clone(), consume: function () {
        if (signal.aborted || !current()) return false;
        discard();
        return true;
      } };
    });
  }

  try {
    var id = route[1];
    var prefix = "toonstudio:offline-preview:";
    var scopeKey = prefix + "scope:v1";
    var versionKey = prefix + "work:v1:" + id;
    var readerKey = prefix + "reader:v1";
    var storage = window.localStorage;
    var scope = storage.getItem(scopeKey);
    var version = storage.getItem(versionKey);
    var reader = storage.getItem(readerKey);
    if (!scope || !version || !reader) return;
    var url = new URL("/api/creator/works/" + id + "/team/document/offline-owner-receipt", window.location.origin);
    url.searchParams.set("scope", scope);
    url.searchParams.set("v", version);
    var controller = new AbortController();
    var events = controller.signal;
    var ageLimit = 300000;
    var expiresAt = Date.now() + ageLimit;
    var timer = window.setTimeout(discard, ageLimit);

    var ready = fetch(url, {
      mode: "same-origin", credentials: "same-origin", redirect: "error", cache: "only-if-cached",
      signal: events, headers: { "x-studio-reader-capabilities": reader }
    }).then(function (response) {
      if (!response.ok || !current()) return null;
      return response.clone().json().then(function (data) {
        var now = Date.now();
        if (!current() || !data || !Number.isSafeInteger(data.expiresAt) ||
            data.expiresAt <= now || data.expiresAt > now + ageLimit) return null;
        expiresAt = data.expiresAt;
        window.clearTimeout(timer);
        timer = window.setTimeout(discard, expiresAt - now);
        return response;
      });
    }).catch(function () { return null; });

    window.__toonstudioTakeOfflineOwnerResponse = take;
    var options = { signal: events };
    window.addEventListener(scopeKey, discard, options);
    window.addEventListener("online", discard, options);
    window.addEventListener("pagehide", discard, options);
    window.addEventListener("popstate", discard, options);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") discard();
    }, options);
    window.addEventListener("storage", function (event) {
      if (event.key === null || event.key === scopeKey || event.key === versionKey || event.key === readerKey) discard();
    }, options);
  } catch (error) {
    // 저장소나 캐시 사용이 제한된 브라우저에서는 앱의 기존 잠금을 유지한다.
    if (controller) discard(error);
  }
})();
