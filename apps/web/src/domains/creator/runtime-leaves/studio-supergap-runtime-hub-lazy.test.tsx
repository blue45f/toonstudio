// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { StudioSupergapRuntimeHubLazyHost } from "./studio-supergap-runtime-hub-lazy";
import { closeStudioSupergapRuntimeHub, openStudioSupergapRuntimeHub } from "./studio-supergap-runtime-hub-lazy-bridge";

vi.mock("../studio-supergap-runtime-hub", () => new Promise(() => {}));

afterEach(() => {
  cleanup();
  closeStudioSupergapRuntimeHub();
});

it("로딩 상태를 표시하고 키보드로 닫을 때 실제 호출 위치로 돌아간다", () => {
  render(<>
    <button type="button" onClick={(event) => openStudioSupergapRuntimeHub(event.currentTarget)}>엔진 상태</button>
    <button type="button">펜 설정</button>
    <StudioSupergapRuntimeHubLazyHost />
  </>);
  const launcher = screen.getByRole("button", { name: "엔진 상태" });
  const outside = screen.getByRole("button", { name: "펜 설정" });
  expect(screen.queryByRole("status")).toBeNull();
  launcher.focus();
  fireEvent.click(launcher);
  const panel = screen.getByRole("group", { name: "편집기 엔진 상태" });
  expect(document.activeElement).toBe(panel);
  expect(screen.getByRole("status").textContent).toBe("엔진 상태를 불러오는 중…");

  outside.focus();
  fireEvent.keyDown(outside, { key: "Escape" });
  expect(screen.getByRole("group", { name: "편집기 엔진 상태" })).toBe(panel);
  expect(document.activeElement).toBe(outside);

  panel.focus();
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByRole("status")).toBeNull();
  expect(document.activeElement).toBe(launcher);
});

it("도구 메뉴가 새 DOM으로 이동하면 닫을 때 현재 호출 버튼으로 돌아간다", () => {
  function MovableLauncher() {
    const launcher = useRef<HTMLButtonElement>(null);
    const [generation, setGeneration] = useState(0);
    return <>
      <button key={generation} ref={launcher} type="button" onClick={() => openStudioSupergapRuntimeHub(() => launcher.current)}>엔진 상태</button>
      <button type="button" onClick={() => setGeneration(1)}>메뉴 재배치</button>
      <StudioSupergapRuntimeHubLazyHost />
    </>;
  }

  render(<MovableLauncher />);
  const previous = screen.getByRole("button", { name: "엔진 상태" });
  fireEvent.click(previous);
  const panel = screen.getByRole("group", { name: "편집기 엔진 상태" });
  expect(document.activeElement).toBe(panel);
  fireEvent.click(screen.getByRole("button", { name: "메뉴 재배치" }));
  const current = screen.getByRole("button", { name: "엔진 상태" });
  expect(previous.isConnected).toBe(false);
  expect(current).not.toBe(previous);
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(document.activeElement).toBe(current);
});

it("엔진 화면을 불러오지 못해도 원고를 유지하고 명시적으로 다시 시도한다", async () => {
  const loadDrawer = vi.fn()
    .mockRejectedValueOnce(new Error("Engine chunk request failed"))
    .mockResolvedValueOnce({
      default: ({ onClose }: { readonly onClose: () => void }) => (
        <button type="button" onClick={onClose}>엔진 상태 닫기</button>
      ),
    });
  render(<>
    <button type="button" onClick={(event) => openStudioSupergapRuntimeHub(event.currentTarget)}>엔진 상태</button>
    <textarea aria-label="원고 메모" />
    <StudioSupergapRuntimeHubLazyHost loadDrawer={loadDrawer} />
  </>, { onCaughtError: () => undefined });
  const launcher = screen.getByRole("button", { name: "엔진 상태" });
  const manuscript = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "원고 메모" });
  fireEvent.input(manuscript, { target: { value: "저장 전 수정" } });
  expect(loadDrawer).not.toHaveBeenCalled();

  fireEvent.click(launcher);
  const failure = await screen.findByRole("alert");
  expect(failure.textContent).toContain("엔진 상태를 불러오지 못했습니다");
  expect(screen.getByRole("textbox", { name: "원고 메모" })).toBe(manuscript);
  expect(manuscript.value).toBe("저장 전 수정");
  expect(loadDrawer).toHaveBeenCalledTimes(1);

  const retry = screen.getByRole("button", { name: "다시 시도" });
  retry.focus();
  fireEvent.click(retry);
  const panel = screen.getByRole("group", { name: "편집기 엔진 상태" });
  expect(document.activeElement).toBe(panel);
  const close = await screen.findByRole("button", { name: "엔진 상태 닫기" });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(loadDrawer).toHaveBeenCalledTimes(2);

  close.focus();
  fireEvent.click(close);
  expect(screen.queryByRole("group", { name: "편집기 엔진 상태" })).toBeNull();
  expect(document.activeElement).toBe(launcher);
  expect(screen.getByRole("textbox", { name: "원고 메모" })).toBe(manuscript);
  expect(manuscript.value).toBe("저장 전 수정");
});
