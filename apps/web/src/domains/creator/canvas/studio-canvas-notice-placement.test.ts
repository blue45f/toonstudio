// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { observeStudioCanvasNoticePlacement } from "./studio-canvas-notice-placement";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  document.body.innerHTML = `<div id="host"><div id="rail" style="display:contents">
    <div data-studio-selection-command-lane="true"></div><button>적용 · 실행취소 1회</button>
    </div><div data-studio-floating-controls><div id="band"><button>팀원 커서 숨기기</button></div></div></div>`;
  const host = document.querySelector<HTMLDivElement>("#host");
  const rail = document.querySelector<HTMLDivElement>("#rail");
  const band = document.querySelector<HTMLDivElement>("#band");
  const lane = document.querySelector<HTMLDivElement>("[data-studio-selection-command-lane]");
  if (!host || !rail || !band || !lane) throw new Error("안내 배치 fixture가 없습니다.");
  vi.spyOn(host, "getBoundingClientRect").mockReturnValue(new DOMRect(358, 196, 900, 700));
  vi.spyOn(lane, "getBoundingClientRect").mockReturnValue(new DOMRect(358, 196, 900, 51));
  const bandBox = vi.spyOn(band, "getBoundingClientRect").mockReturnValue(new DOMRect(358, 255, 900, 52));
  const callbacks: Array<() => void> = [];
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) { callbacks.push(() => callback([], this)); }
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = disconnect;
  });
  return { host, rail, band, lane, bandBox, callbacks, disconnect };
}

describe("캔버스 안내와 협업 도구의 클릭 영역", () => {
  it("데스크톱 안내를 협업 band 아래에 두고 선택 명령과 캔버스 흐름을 바꾸지 않는다", () => {
    const f = fixture();
    const before = f.host.getBoundingClientRect();
    const cleanup = observeStudioCanvasNoticePlacement(f.rail, false);
    expect(f.rail.style.getPropertyValue("--studio-canvas-notice-top")).toBe("119px");
    expect(f.rail.style.top).toBe("");
    expect(f.rail.style.display).toBe("contents");
    expect(f.lane.getAttribute("style")).toBeNull();
    expect(f.host.getBoundingClientRect()).toEqual(before);

    f.bandBox.mockReturnValue(new DOMRect(358, 255, 900, 124));
    f.callbacks.forEach(callback => callback());
    expect(f.rail.style.getPropertyValue("--studio-canvas-notice-top")).toBe("191px");
    cleanup?.();
    expect(f.disconnect).toHaveBeenCalled();
    expect(f.rail.style.getPropertyValue("--studio-canvas-notice-top")).toBe("");
  });

  it("모바일 안내도 기존 top 계약으로 같은 실제 band 높이를 따른다", () => {
    const f = fixture();
    const cleanup = observeStudioCanvasNoticePlacement(f.rail, true);
    expect(f.rail.style.top).toBe("119px");
    f.bandBox.mockReturnValue(new DOMRect(358, 196, 900, 0));
    f.callbacks.forEach(callback => callback());
    expect(f.rail.style.top).toBe("72px");
    cleanup?.();
  });

  it("협업 도구가 아직 없으면 예약된 CSS 위치를 제거하지 않는다", () => {
    const f = fixture();
    f.band.parentElement?.remove();
    f.rail.style.top = "8rem";
    expect(observeStudioCanvasNoticePlacement(f.rail, true)).toBeUndefined();
    expect(f.rail.style.top).toBe("8rem");
  });
});
