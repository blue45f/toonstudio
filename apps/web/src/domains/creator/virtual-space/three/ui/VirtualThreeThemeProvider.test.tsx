// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { virtualThreeThemeStorageKey, writeVirtualThreeThemeChoice, type VirtualThreeThemeStorage } from "../themes/virtual-three-theme-store";
import { VirtualThreeThemeProvider } from "./VirtualThreeThemeProvider";
import { useVirtualThreeThemeContext, type VirtualThreeThemeContextValue } from "./virtual-three-theme-context";

afterEach(cleanup);

function storageFixture() {
  const values = new Map<string, string>();
  let blocked = false;
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      if (blocked) throw new Error("quota exceeded");
      values.set(key, value);
    }),
  } satisfies VirtualThreeThemeStorage;
  return { storage, values, block: (value: boolean) => { blocked = value; } };
}
function Probe({ capture }: { readonly capture: (value: VirtualThreeThemeContextValue) => void }) {
  const value = useVirtualThreeThemeContext();
  useEffect(() => { capture(value); }, [capture, value]);
  return null;
}

function setup(scope = "space/alpha", fixture = storageFixture()) {
  let latest: VirtualThreeThemeContextValue | null = null;
  const capture = (value: VirtualThreeThemeContextValue) => { latest = value; };
  const acquire = () => fixture.storage;
  const owner = (spaceScopeId: string, mode: string) => <VirtualThreeThemeProvider spaceScopeId={spaceScopeId} acquireStorage={acquire}>
    <span>{mode}</span><Probe capture={capture} />
  </VirtualThreeThemeProvider>;
  const view = render(owner(scope, "3d"));
  return {
    ...fixture,
    current: () => { if (!latest) throw new Error("provider 상태가 없습니다."); return latest; },
    rerender: (nextScope = scope, mode = "3d") => view.rerender(owner(nextScope, mode)),
  };
}

describe("단일 공간 3D 테마 provider", () => {
  it("빈 저장소의 baseline은 자동 저장하지 않고 실제 ready 뒤 명시 저장만 허용한다", () => {
    const view = setup();
    expect(view.current().theme.kind).toBe("preserved-baseline");
    expect(view.current().requestedThemeId).toBe("creator-campus");
    expect(view.current().savedThemeId).toBeNull();
    act(() => { view.current().saveShownTheme("creator-campus"); });
    expect(view.storage.setItem).not.toHaveBeenCalled();
    act(() => { view.current().onThemePreviewChange("creator-campus", { status: "ready" }); });
    act(() => { view.current().saveShownTheme("creator-campus"); });
    expect(view.storage.setItem).toHaveBeenCalledTimes(1);
    expect(view.current().savedThemeId).toBe("creator-campus");
  });

  it("저장된 테마를 요청으로 복원하되 actual shown을 ready 전에 승격하지 않는다", () => {
    const fixture = storageFixture();
    writeVirtualThreeThemeChoice(fixture.storage, "space/alpha", "parkbotanical");
    fixture.storage.setItem.mockClear();
    const view = setup("space/alpha", fixture);
    expect(view.current().requestedThemeId).toBe("parkbotanical");
    expect(view.current().savedThemeId).toBe("parkbotanical");
    expect(view.current().shownThemeId).toBe("creator-campus");
    act(() => { view.current().saveShownTheme("parkbotanical"); });
    expect(view.storage.setItem).not.toHaveBeenCalled();
    act(() => { view.current().onThemePreviewChange("parkbotanical", { status: "ready" }); });
    expect(view.current().shownThemeId).toBe("parkbotanical");
  });

  it("stale ID와 실패는 shown을 덮지 않고 같은 ID retry는 새 revision을 만든다", () => {
    const view = setup();
    act(() => { view.current().onThemePreviewChange("creator-campus", { status: "ready" }); });
    act(() => { view.current().requestTheme("sflab"); });
    const revision = view.current().requestRevision;
    act(() => { view.current().onThemePreviewChange("parkbotanical", { status: "ready" }); });
    expect(view.current().shownThemeId).toBe("creator-campus");
    act(() => { view.current().onThemePreviewChange("sflab", { status: "error" }); });
    expect(view.current().shownThemeId).toBe("creator-campus");
    act(() => { view.current().saveShownTheme("sflab"); });
    expect(view.storage.setItem).not.toHaveBeenCalled();
    act(() => { view.current().retryTheme(); });
    expect(view.current().requestedThemeId).toBe("sflab");
    expect(view.current().requestRevision).toBe(revision + 1);
    act(() => { view.current().onThemePreviewChange("sflab", { status: "ready" }); });
    expect(view.current().shownThemeId).toBe("sflab");
    expect(view.current().savedThemeId).toBeNull();
  });

  it("화면 mode 전환은 요청과 shown을 유지하고 공간 scope 변경만 owner를 초기화한다", () => {
    const fixture = storageFixture();
    writeVirtualThreeThemeChoice(fixture.storage, "space/beta", "gothicarchive");
    fixture.storage.setItem.mockClear();
    const view = setup("space/alpha", fixture);
    act(() => { view.current().requestTheme("sflab"); });
    act(() => { view.current().onThemePreviewChange("sflab", { status: "ready" }); });
    const revision = view.current().requestRevision;
    view.rerender("space/alpha", "2d");
    view.rerender("space/alpha", "3d");
    expect(view.current().requestedThemeId).toBe("sflab");
    expect(view.current().shownThemeId).toBe("sflab");
    expect(view.current().requestRevision).toBe(revision);
    view.rerender("space/beta", "3d");
    expect(view.current().requestedThemeId).toBe("gothicarchive");
    expect(view.current().savedThemeId).toBe("gothicarchive");
    expect(view.current().shownThemeId).toBe("creator-campus");
    expect(view.current().preview.status).toBe("idle");
    expect(view.current().requestRevision).toBe(0);
    expect(view.storage.setItem).not.toHaveBeenCalled();
  });

  it("저장 실패 뒤 이전 durable 표시를 유지하고 같은 shown의 재시도 성공 뒤에만 갱신한다", () => {
    const fixture = storageFixture();
    writeVirtualThreeThemeChoice(fixture.storage, "space/alpha", "creator-campus");
    fixture.storage.setItem.mockClear();
    const view = setup("space/alpha", fixture);
    act(() => { view.current().requestTheme("cafefood"); });
    act(() => { view.current().onThemePreviewChange("cafefood", { status: "ready" }); });
    view.block(true);
    act(() => { view.current().saveShownTheme("cafefood"); });
    expect(view.current().shownThemeId).toBe("cafefood");
    expect(view.current().savedThemeId).toBe("creator-campus");
    expect(view.current().notice?.code).toBe("storage-write-failed");
    view.block(false);
    act(() => { view.current().saveShownTheme("cafefood"); });
    expect(view.current().savedThemeId).toBe("cafefood");
    expect(view.current().notice).toBeNull();
  });

  it("actual shown과 다른 ID는 ready 상태라도 저장하지 않는다", () => {
    const view = setup();
    act(() => { view.current().requestTheme("fantasyguild"); });
    act(() => { view.current().onThemePreviewChange("fantasyguild", { status: "ready" }); });
    act(() => { view.current().saveShownTheme("parkbotanical"); });
    expect(view.storage.setItem).not.toHaveBeenCalled();
    act(() => { view.current().saveShownTheme("fantasyguild"); });
    expect(view.current().savedThemeId).toBe("fantasyguild");
  });

  it("다른 탭의 durable 변경이 현재 미리보기를 덮지 않고 revert에서만 새 저장값을 요청한다", () => {
    const view = setup();
    act(() => { view.current().requestTheme("sflab"); });
    writeVirtualThreeThemeChoice(view.storage, "space/alpha", "parkbotanical");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: virtualThreeThemeStorageKey("space/alpha") })); });
    expect(view.current().savedThemeId).toBe("parkbotanical");
    expect(view.current().requestedThemeId).toBe("sflab");
    act(() => { view.current().revertTheme(); });
    expect(view.current().requestedThemeId).toBe("parkbotanical");
  });
});
