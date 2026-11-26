/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { Script } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = readFileSync(new NodeUrl("../../public/offline-draw/bootstrap.js", import.meta.url), "utf8");

function start({ online = true, reload = vi.fn() } = {}) {
  new Script(source).runInNewContext({
    document, window, navigator: { onLine: online }, HTMLScriptElement,
    location: { pathname: location.pathname, search: location.search, reload },
    MutationObserver, setTimeout, clearTimeout, requestIdleCallback: vi.fn(),
  });
  return reload;
}

function failScript(src: string, type = "module"): void {
  const script = document.createElement("script");
  script.type = type;
  script.setAttribute("src", src);
  document.head.append(script);
  script.dispatchEvent(new Event("error"));
  script.remove();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", vi.fn());
  history.replaceState(null, "", "/studio/character");
  sessionStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(async () => {
  let root = document.getElementById("root");
  if (!root) {
    root = document.createElement("div"); root.id = "root"; document.body.append(root);
  }
  root.append(document.createElement("main"));
  await Promise.resolve();
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("늦은 Studio 시작과 긴급 복구 안내", () => {
  it("정상 작업면이 늦게 나타나면 터치를 가리던 긴급 안내를 제거한다", async () => {
    start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.getElementById("toon-local-recovery")).not.toBeNull();
    document.getElementById("root")?.append(document.createElement("main"));
    await Promise.resolve();
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });

  it("이미 정상 시작했으면 긴급 안내 타이머가 남지 않는다", async () => {
    document.getElementById("root")?.append(document.createElement("main"));
    start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });

  it("타이머 전에 시작한 작업면에는 안내가 나타나지 않는다", async () => {
    start();
    await vi.advanceTimersByTimeAsync(9_000);
    document.getElementById("root")?.append(document.createElement("main"));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });

  it("프리렌더 중인 숨은 문서에서는 활성화 전까지 긴급 안내를 만들지 않는다", async () => {
    Object.defineProperty(document, "prerendering", { configurable: true, value: true });
    try {
      start();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(document.getElementById("toon-local-recovery")).toBeNull();
      Object.defineProperty(document, "prerendering", { configurable: true, value: false });
      document.dispatchEvent(new Event("prerenderingchange"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(document.getElementById("toon-local-recovery")).not.toBeNull();
    } finally {
      delete (document as { prerendering?: boolean }).prerendering;
    }
  });

  it("Studio 외부 경로에는 복구 안내를 만들지 않는다", async () => {
    history.replaceState(null, "", "/");
    start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(document.getElementById("toon-local-recovery")).toBeNull();
  });

  it("진입 모듈 실패는 같은 주소와 빌드에서 한 번만 다시 열고 반복 실패에는 긴급 안내를 표시한다", async () => {
    history.replaceState(null, "", "/studio/lift3d?subject=prop");
    const reload = start();
    failScript("/assets/index-buildA.js");
    failScript("/assets/index-buildA.js");
    expect(reload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.getElementById("toon-local-recovery")).not.toBeNull();
  });

  it("다른 주소나 빌드에서 실패하면 이전 시도의 기록에 묶이지 않는다", () => {
    sessionStorage.setItem("toonstudio:entry-boot-reload", JSON.stringify([
      "/studio/character", "", "/assets/index-buildA.js",
    ]));
    history.replaceState(null, "", "/studio/lift3d");
    const reload = start();
    failScript("/assets/index-buildA.js");
    failScript("/assets/index-buildB.js");
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("다른 청크나 classic script가 실패해도 다시 열지 않고 렌더 뒤에는 문서를 보호한다", async () => {
    const reload = start();
    failScript("/assets/StudioLift3dPage-build.js");
    failScript("/assets/index-build.js", "text/javascript");
    failScript("https://another.example/assets/index-build.js");
    expect(reload).not.toHaveBeenCalled();
    document.getElementById("root")?.append(document.createElement("main"));
    await Promise.resolve();
    failScript("/assets/index-build.js");
    expect(reload).not.toHaveBeenCalled();
  });

  it("오프라인에서는 자동으로 다시 열지 않고 긴급 안내를 유지한다", async () => {
    const reload = start({ online: false });
    failScript("/assets/index-build.js");
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.getElementById("toon-local-recovery")).not.toBeNull();
  });
});
