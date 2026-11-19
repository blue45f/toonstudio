// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { CharacterShaperSavedVariants } from "./CharacterShaperSavedVariants";

afterEach(cleanup);

function setup() {
  const host = {
    activeModelId: "first", status: "ready", libraryEntries: [{ id: "other", name: "레인저" }],
    savedFullStates: { 달리기: { modelId: "other" }, 원본없음: { modelId: "missing" } },
    loadModelFromLibraryEntry: vi.fn(), handleLoadFullLocal: vi.fn<() => Promise<boolean>>(),
  };
  const close = vi.fn();
  function Source({ overrides = {} }: { overrides?: Record<string, unknown> }) {
    const [model, setModel] = useState({ activeModelId: "first", status: "ready" });
    return <CharacterShaperSavedVariants h={{ ...host, ...model, ...overrides,
      loadModelFromLibraryEntry: (entry: { id: string }) => {
        host.loadModelFromLibraryEntry(entry);
        setModel({ activeModelId: entry.id, status: "loading" });
      },
    }} disabled={false} onRestore={close} />;
  }
  const view = render(<Source />);
  const select = screen.getByRole("combobox");
  fireEvent.change(select, { target: { value: "달리기" } });
  return { host, close, rerender: (overrides: Record<string, unknown>) => view.rerender(<Source overrides={overrides} />) };
}

it("등록된 원본을 로드하고 실제 저작 문서가 준비된 뒤 변형 적용이 끝나야 닫는다", async () => {
  const { host, close, rerender } = setup();
  const absent = screen.getByRole("option", { name: /원본없음/ }) as HTMLOptionElement;
  expect(absent.disabled).toBe(true);
  expect(host.loadModelFromLibraryEntry).toHaveBeenCalledWith(host.libraryEntries[0]);
  rerender({ activeModelId: "other", status: "loading" });
  rerender({ activeModelId: "other", status: "ready", vrmCreativeReadOnly: true });
  expect(host.handleLoadFullLocal).not.toHaveBeenCalled();
  let complete!: (ok: boolean) => void;
  host.handleLoadFullLocal.mockReturnValue(new Promise<boolean>(resolve => { complete = resolve; }));
  rerender({ activeModelId: "other", status: "ready" });
  expect(host.handleLoadFullLocal).toHaveBeenCalledWith("달리기");
  expect(close).not.toHaveBeenCalled();
  await act(async () => complete(true));
  expect(close).toHaveBeenCalledTimes(1);
});

it("원본 로드 또는 적용 실패는 다른 인물에 덮어쓰지 않고 실패 이유를 표시한다", async () => {
  const { host, close, rerender } = setup();
  rerender({ activeModelId: "other", status: "error" });
  expect(screen.getByRole("alert").textContent).toContain("원본");
  expect(host.handleLoadFullLocal).not.toHaveBeenCalled();
  rerender({ activeModelId: "other", status: "ready" });
  host.handleLoadFullLocal.mockResolvedValue(false);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "달리기" } });
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("다시 선택"));
  expect(close).not.toHaveBeenCalled();
});
