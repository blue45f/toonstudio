// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode, type ComponentProps } from "react";
import { BrowserRouter, Link } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioImportHandoffsForTests,
  peekStudioImportHandoff,
  registerStudioImportHandoff,
} from "../studio-import-handoff";
import { StudioImportHandoffEntry } from "./StudioImportHandoffEntry";
import { StudioImportHandoffHost } from "./StudioImportHandoffHost";

function props(overrides: Partial<ComponentProps<typeof StudioImportHandoffHost>> = {}) {
  return {
    brushPackImporting: false,
    collaborationDocumentLocked: false,
    interchangeImportBusy: false,
    projectArchiveBusy: false,
    psdImportBusy: false,
    workspaceReady: true,
    onImage: vi.fn(),
    onBrushPack: vi.fn(),
    onInterchange: vi.fn(),
    onProjectJson: vi.fn(),
    onPsd: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  clearStudioImportHandoffsForTests();
  window.history.replaceState(null, "", "/studio/canvas");
});

afterEach(() => {
  cleanup();
  clearStudioImportHandoffsForTests();
});

describe("StudioImportHandoffHost", () => {
  it("편집기 안에서 전달 주소를 열고 방 주소로 교체해도 현재 요청의 복구 안내를 유지한다", async () => {
    const file = new File(["{}"], "manuscript.json", { type: "application/json" });
    const handoff = registerStudioImportHandoff(file, "json");
    const result = Promise.withResolvers<"scope-changed">();
    const onProjectJson = vi.fn(() => result.promise);
    const input = props({ onProjectJson, workspaceReady: false });
    const editor = (workspaceReady: boolean) => (
      <BrowserRouter>
        <Link to={`?importHandoff=${handoff.token}`}>가져오기 전달</Link>
        <Link to="?room=fixture-room" replace>방 주소 교체</Link>
        <StudioImportHandoffEntry {...input} workspaceReady={workspaceReady} />
      </BrowserRouter>
    );
    const view = render(editor(false));
    expect(view.queryByRole("status")).toBeNull();

    fireEvent.click(view.getByRole("link", { name: "가져오기 전달" }));
    expect((await view.findByRole("status")).textContent).toContain("작업공간을 확인한 뒤 파일을 열어요");
    expect(peekStudioImportHandoff(handoff.token)?.file).toBe(file);
    expect(onProjectJson).not.toHaveBeenCalled();

    view.rerender(editor(true));
    await waitFor(() => expect(onProjectJson).toHaveBeenCalledOnce());
    expect(new URLSearchParams(window.location.search).get("importHandoff")).toBe(handoff.token);
    fireEvent.click(view.getByRole("link", { name: "방 주소 교체" }));
    await act(async () => result.resolve("scope-changed"));

    expect(window.location.search).toBe("?room=fixture-room");
    expect(view.getByRole("alert").textContent).toContain("작업공간이 바뀌어 파일을 열지 못했어요");
    expect(view.getByRole("link", { name: "파일 다시 선택" }).getAttribute("href")).toBe("/studio/import");
    expect(onProjectJson).toHaveBeenCalledOnce();
  });

  it("routes the original File into the existing project import handler exactly once", async () => {
    const file = new File(["{\"pages\":[]}"], "project.json", { type: "application/json" });
    const handoff = registerStudioImportHandoff(file, "json");
    window.history.replaceState(null, "", `/studio/canvas?importHandoff=${handoff.token}`);
    const input = props();

    const view = render(<StudioImportHandoffHost {...input} />);
    await waitFor(() => expect(input.onProjectJson).toHaveBeenCalledTimes(1));
    const event = vi.mocked(input.onProjectJson).mock.calls[0]![0];
    expect(event.currentTarget.files?.[0]).toBe(file);
    expect(window.location.search).toBe("");

    view.rerender(<StudioImportHandoffHost {...input} />);
    expect(input.onProjectJson).toHaveBeenCalledTimes(1);
  });

  it("작업공간이 준비될 때까지 원본과 주소를 유지하고 변경된 범위에서는 다시 선택하도록 안내한다", async () => {
    vi.useFakeTimers();
    try {
      const file = new File(["{}"], "manuscript.json", { type: "application/json" });
      const handoff = registerStudioImportHandoff(file, "json");
      const path = `/studio/canvas?importHandoff=${handoff.token}`;
      window.history.replaceState(null, "", path);
      const onProjectJson = vi.fn(async () => "scope-changed" as const);
      const input = props({ onProjectJson, workspaceReady: false });
      const view = render(<StudioImportHandoffHost {...input} />);

      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(onProjectJson).not.toHaveBeenCalled();
      expect(peekStudioImportHandoff(handoff.token)?.file).toBe(file);
      expect(new URLSearchParams(window.location.search).get("importHandoff")).toBe(handoff.token);
      expect(view.getByRole("status").textContent).toContain("작업공간을 확인한 뒤 파일을 열어요");

      window.history.replaceState(null, "", `${path}&room=fixture-room`);
      view.rerender(<StudioImportHandoffHost {...input} workspaceReady />);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(onProjectJson).toHaveBeenCalledOnce();
      expect(vi.mocked(input.onProjectJson).mock.calls[0]?.[0].currentTarget.files?.[0]).toBe(file);
      expect(peekStudioImportHandoff(handoff.token)).toBeNull();
      expect(window.location.search).toBe("?room=fixture-room");
      expect(view.getByRole("alert").textContent).toContain("작업공간이 바뀌어 파일을 열지 못했어요");
      expect(view.getByRole("link", { name: "파일 다시 선택" }).getAttribute("href")).toBe("/studio/import");

      view.rerender(<StudioImportHandoffHost {...input} workspaceReady />);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(onProjectJson).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("이미 예약한 콜백은 주소가 다른 파일로 바뀌면 어느 쪽도 소비하지 않는다", async () => {
    vi.useFakeTimers();
    try {
      const old = registerStudioImportHandoff(new File(["{}"], "previous.json", { type: "application/json" }), "json");
      const next = registerStudioImportHandoff(new File(["{}"], "next.json", { type: "application/json" }), "json");
      window.history.replaceState(null, "", `/studio/canvas?importHandoff=${old.token}`);
      const input = props();
      render(<StudioImportHandoffHost {...input} />);

      window.history.replaceState(null, "", `/studio/canvas?importHandoff=${next.token}`);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(input.onProjectJson).not.toHaveBeenCalled();
      expect(peekStudioImportHandoff(old.token)).toBe(old);
      expect(peekStudioImportHandoff(next.token)).toBe(next);
      expect(new URLSearchParams(window.location.search).get("importHandoff")).toBe(next.token);
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for the established PSD/import lock instead of bypassing it", async () => {
    const file = new File(["8BPS"], "layers.psd", { type: "image/vnd.adobe.photoshop" });
    const handoff = registerStudioImportHandoff(file, "psd");
    window.history.replaceState(null, "", `/studio/canvas?importHandoff=${handoff.token}`);
    const locked = props({ psdImportBusy: true });
    const view = render(<StudioImportHandoffHost {...locked} />);

    expect(locked.onPsd).not.toHaveBeenCalled();
    expect(view.getByRole("status").textContent).toContain("layers.psd");

    const ready = { ...locked, psdImportBusy: false };
    view.rerender(<StudioImportHandoffHost {...ready} />);
    await waitFor(() => expect(ready.onPsd).toHaveBeenCalledTimes(1));
  });

  it("reports a reload-expired token and removes it from the address", async () => {
    window.history.replaceState(null, "", "/studio/canvas?importHandoff=missing");
    const view = render(<StudioImportHandoffHost {...props()} />);

    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("다시 선택"));
    expect(view.getByRole("link", { name: "파일 다시 선택" }).getAttribute("href")).toBe("/studio/import");
    expect(window.location.search).toBe("");
  });

  it("가져오기를 예약한 직후 전달이 만료되면 같은 작업 주소에서 파일 재선택을 안내한다", async () => {
    vi.useFakeTimers();
    try {
      const file = new File(["{}"], "manuscript.json", { type: "application/json" });
      const handoff = registerStudioImportHandoff(file, "json");
      const path = `/studio/canvas?room=fixture-room&importHandoff=${handoff.token}&language=ko#page-2`;
      window.history.replaceState({ keep: true }, "", path);
      vi.setSystemTime(handoff.expiresAt - 1);
      const input = props({ handoffToken: handoff.token });
      const view = render(<StudioImportHandoffHost {...input} />);

      expect(peekStudioImportHandoff(handoff.token)?.file).toBe(file);
      expect(location.pathname + location.search + location.hash).toBe(path);
      expect(view.queryByRole("alert")).toBeNull();
      vi.setSystemTime(handoff.expiresAt + 1);
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });

      expect(input.onProjectJson).not.toHaveBeenCalled();
      expect(location.pathname + location.search + location.hash).toBe("/studio/canvas?room=fixture-room&language=ko#page-2");
      expect(history.state).toEqual({ keep: true });
      expect(view.getByRole("alert").textContent).toContain("가져올 파일 전달이 만료되었거나 새로고침으로 사라졌습니다");
      expect(view.getByRole("link", { name: "파일 다시 선택" }).getAttribute("href")).toBe("/studio/import");
    } finally {
      vi.useRealTimers();
    }
  });

  it("처리 중인 전달은 다시 연 편집기에서 파일 재선택 안내로 이어지고 다시 적용되지 않는다", async () => {
    const file = new File(["{}"], "manuscript.json", { type: "application/json" });
    const handoff = registerStudioImportHandoff(file, "json");
    const result = Promise.withResolvers<void>();
    const onProjectJson = vi.fn(() => result.promise);
    const input = props({ onProjectJson, handoffToken: handoff.token });
    const path = `/studio/canvas?room=fixture-room&importHandoff=${handoff.token}#page-2`;
    window.history.replaceState({ keep: true }, "", path);
    const view = render(<StudioImportHandoffHost {...input} />);

    await waitFor(() => expect(onProjectJson).toHaveBeenCalledOnce());
    expect(peekStudioImportHandoff(handoff.token)).toBeNull();
    expect(location.pathname + location.search + location.hash).toBe(path);

    view.unmount();
    await act(async () => result.resolve());
    expect(location.pathname + location.search + location.hash).toBe(path);

    const reopened = render(<StudioImportHandoffHost {...input} />);
    expect((await reopened.findByRole("alert")).textContent).toContain("다시 선택");
    expect(reopened.getByRole("link", { name: "파일 다시 선택" }).getAttribute("href")).toBe("/studio/import");
    expect(location.search + location.hash).toBe("?room=fixture-room#page-2");
    expect(history.state).toEqual({ keep: true });
    expect(onProjectJson).toHaveBeenCalledOnce();
  });

  it("preserves single-use .toonproject.zip handoffs across StrictMode double-mount and invokes onProjectArchive", async () => {
    const archiveFile = new File(["PK"], "scene.toonproject.zip", {
      type: "application/vnd.toonstudio.project+zip",
    });
    const handoff = registerStudioImportHandoff(archiveFile, "json");
    window.history.replaceState(null, "", `/studio/canvas?importHandoff=${handoff.token}`);
    const onProjectArchive = vi.fn();
    const input = props({ onProjectArchive });

    render(
      <StrictMode>
        <StudioImportHandoffHost {...input} />
      </StrictMode>,
    );

    await waitFor(() => expect(onProjectArchive).toHaveBeenCalledTimes(1));
    expect(input.onProjectJson).not.toHaveBeenCalled();
    expect(onProjectArchive.mock.calls[0]![0].currentTarget.files?.[0]).toBe(archiveFile);
    expect(window.location.search).toBe("");
  });
});
