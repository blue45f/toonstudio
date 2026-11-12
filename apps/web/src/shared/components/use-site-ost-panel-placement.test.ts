// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { claimSiteOstPanelPlacement } from "./use-site-ost-panel-placement";

const releaseClaims: Array<() => void> = [];
afterEach(() => {
  for (const release of releaseClaims.splice(0)) release();
  document.body.replaceChildren();
  document.documentElement.style.removeProperty("--service-status-overlay-clearance");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(docked = false) {
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  let bannerHeight = 154.5;
  const callbacks: ResizeObserverCallback[] = [];
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const banner = document.createElement("div");
  banner.setAttribute("data-service-degraded-banner", "degraded");
  const panel = document.createElement("div");
  const dock = docked ? document.createElement("div") : null;
  document.body.append(banner, panel);
  if (dock) document.body.append(dock);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this === banner) return new DOMRect(0, 0, 390, bannerHeight);
    if (this === panel) return new DOMRect(12, 46.40625, 358, 639.59375);
    return new DOMRect(300, 20, 44, 44);
  });
  releaseClaims.push(claimSiteOstPanelPlacement(panel, dock));
  return {
    panel, banner, disconnect,
    resizeBanner(height: number) {
      bannerHeight = height;
      for (const callback of callbacks) callback([], {} as ResizeObserver);
    },
  };
}

describe("모바일 OST 패널의 실제 배너·뷰포트 점유 영역", () => {
  it("떠 있는 패널은 실제 inline 배너 하단 위로 커지지 않고 접기·펼치기 크기를 다시 잰다", () => {
    const { panel, resizeBanner } = setup();
    expect(panel.style.maxHeight).toBe("519px");
    expect(panel.style.top).toBe("");
    resizeBanner(240);
    expect(panel.style.maxHeight).toBe("434px");
    resizeBanner(96);
    expect(panel.style.maxHeight).toBe("578px");
  });

  it("도크 패널은 실제 배너 하단 뒤에 열리고 남은 화면 안에서만 높이를 쓴다", () => {
    const { panel, resizeBanner } = setup(true);
    expect(panel.style.top).toBe("167px");
    expect(panel.style.maxHeight).toBe("665px");
    resizeBanner(240);
    expect(panel.style.top).toBe("252px");
    expect(panel.style.maxHeight).toBe("580px");
  });

  it("기존 하단 고정 알림 clearance도 유지하며 넓은 화면과 해제 때 원래 스타일로 돌아간다", () => {
    const { panel, disconnect } = setup();
    document.documentElement.style.setProperty("--service-status-overlay-clearance", "156px");
    window.dispatchEvent(new Event("resize"));
    expect(panel.style.maxHeight).toBe("509px");
    vi.stubGlobal("innerWidth", 1024);
    window.dispatchEvent(new Event("resize"));
    expect(panel.style.maxHeight).toBe("");
    releaseClaims.pop()?.();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(panel.style.top).toBe("");
    expect(panel.style.maxHeight).toBe("");
  });
});
