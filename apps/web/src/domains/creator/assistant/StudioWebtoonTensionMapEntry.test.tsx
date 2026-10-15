// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioWebtoonTensionMapEntry } from "./StudioWebtoonTensionMapEntry";

import type { StudioWebtoonTensionMapTabProps } from "./StudioWebtoonTensionMapTab";

const request = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./studio-webtoon-tension-map-loader", () => ({
  studioWebtoonTensionMapLoader: request,
}));

const mounted = vi.fn();

/** 실제 탭 대신 쓰는 가짜 본문 — 마운트 횟수와 입력 유지를 관찰한다. */
function FakeTab(props: StudioWebtoonTensionMapTabProps) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    mounted();
  }, []);
  return (
    <section aria-label="fake tension tab">
      <input aria-label="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <span data-testid="panel-count">{props.panels.length}</span>
    </section>
  );
}
const loadedModule = { StudioWebtoonTensionMapTab: FakeTab };

function deferred() {
  let resolve!: (value: typeof loadedModule) => void;
  const promise = new Promise<typeof loadedModule>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  request.load.mockReset();
  mounted.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioWebtoonTensionMapEntry — intent-only loading", () => {
  it("requests nothing and draws nothing while the tab has never been active", () => {
    const { container } = render(
      <StrictMode>
        <StudioWebtoonTensionMapEntry active={false} panels={[]} />
      </StrictMode>,
    );
    expect(request.load).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
    expect(mounted).not.toHaveBeenCalled();
  });

  it("shows a polite loading status on first activation, then the tab with the props forwarded", async () => {
    const pending = deferred();
    request.load.mockReturnValue(pending.promise);
    const { rerender } = render(<StudioWebtoonTensionMapEntry active={false} panels={[]} />);
    rerender(<StudioWebtoonTensionMapEntry active panels={[{ id: "f", topY: 0, bottomY: 10, heightPx: 10, dialogueCount: 0 }]} />);

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("텐션 맵을 여는 중");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(request.load).toHaveBeenCalledTimes(1);

    pending.resolve(loadedModule);
    expect((await screen.findByTestId("panel-count")).textContent).toBe("1");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shares one request across rerenders while it is loading", async () => {
    const pending = deferred();
    request.load.mockReturnValue(pending.promise);
    const { rerender } = render(<StudioWebtoonTensionMapEntry active panels={[]} />);
    rerender(<StudioWebtoonTensionMapEntry active panels={[]} />);
    rerender(<StudioWebtoonTensionMapEntry active panels={[]} />);
    expect(request.load).toHaveBeenCalledTimes(1);
    pending.resolve(loadedModule);
    await screen.findByLabelText("fake tension tab");
  });
});

describe("StudioWebtoonTensionMapEntry — failure and retry", () => {
  it("shows an alert and keeps the rest of the page alive, then retries with the same loader", async () => {
    request.load.mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValueOnce(loadedModule);
    render(
      <>
        <canvas data-testid="canvas" />
        <StudioWebtoonTensionMapEntry active panels={[]} />
      </>,
    );
    const canvas = screen.getByTestId("canvas");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("텐션 맵을 불러오지 못했어요");
    expect(alert.textContent).toContain("캔버스는 그대로 유지돼요");
    expect(screen.getByTestId("canvas")).toBe(canvas);

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByLabelText("fake tension tab");
    expect(request.load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows loading again while a retry is in flight", async () => {
    const second = deferred();
    request.load.mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(second.promise);
    render(<StudioWebtoonTensionMapEntry active panels={[]} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("텐션 맵을 여는 중…")).toBeTruthy();
    second.resolve(loadedModule);
    await screen.findByLabelText("fake tension tab");
  });
});

describe("StudioWebtoonTensionMapEntry — keeps state across tab switches", () => {
  it("hides the loaded tab instead of unmounting it, so typed input survives", async () => {
    request.load.mockResolvedValue(loadedModule);
    const { rerender, container } = render(<StudioWebtoonTensionMapEntry active panels={[]} />);
    fireEvent.change(await screen.findByLabelText("draft"), { target: { value: "작업 중인 대본" } });

    rerender(<StudioWebtoonTensionMapEntry active={false} panels={[]} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.hidden).toBe(true);
    // 숨김 상태는 접근성 트리에서 빠진다(ByRole 은 접근 불가능한 요소를 거른다)
    expect(screen.queryByRole("textbox", { name: "draft" })).toBeNull();

    rerender(<StudioWebtoonTensionMapEntry active panels={[]} />);
    expect((screen.getByRole("textbox", { name: "draft" }) as HTMLInputElement).value).toBe("작업 중인 대본");
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(request.load).toHaveBeenCalledTimes(1);
  });

  it("does not request again after it has loaded once", async () => {
    request.load.mockResolvedValue(loadedModule);
    const { rerender } = render(<StudioWebtoonTensionMapEntry active panels={[]} />);
    await screen.findByLabelText("fake tension tab");
    rerender(<StudioWebtoonTensionMapEntry active={false} panels={[]} />);
    rerender(<StudioWebtoonTensionMapEntry active panels={[]} />);
    expect(request.load).toHaveBeenCalledTimes(1);
  });

  it("ignores a late result after the tab was deactivated before it arrived", async () => {
    const pending = deferred();
    request.load.mockReturnValue(pending.promise);
    const { rerender, container } = render(<StudioWebtoonTensionMapEntry active panels={[]} />);
    rerender(<StudioWebtoonTensionMapEntry active={false} panels={[]} />);
    pending.resolve(loadedModule);
    await Promise.resolve();
    await Promise.resolve();
    // 비활성 상태에서 도착한 결과는 반영하지 않고(요청 취소), 다시 활성화하면 새로 요청해 그린다
    expect(container.firstChild).toBeNull();
    request.load.mockResolvedValue(loadedModule);
    rerender(<StudioWebtoonTensionMapEntry active panels={[]} />);
    await screen.findByLabelText("fake tension tab");
  });
});
