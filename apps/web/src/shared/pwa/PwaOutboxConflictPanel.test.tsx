// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PwaOutboxConflictPanel } from "./PwaOutboxConflictPanel";
import {
  getBrowserPwaOfflineOutbox,
  PwaOutboxConflictError,
} from "./pwa-offline-outbox";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  translateBilingualValueForActiveLocale: (_scope: string, ko: unknown) => ko,
  useBilingualI18nRevision: () => undefined,
}));

async function seedConflictedItem(
  label: string,
  localPayload: Record<string, unknown> = { text: "내 대사", localMemo: "컷 4 수정" },
  remotePayload: Record<string, unknown> = { text: "원격 대사", remoteTag: "편집 검수" },
): Promise<string> {
  const outbox = getBrowserPwaOfflineOutbox();
  const item = outbox.enqueue("note", label, localPayload);
  await outbox.syncAll(async () => {
    throw new PwaOutboxConflictError(Date.now(), "원격 사본", remotePayload);
  });
  return item.id;
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("PwaOutboxConflictPanel", () => {
  it("닫혀 있으면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <PwaOutboxConflictPanel open={false} onClose={() => undefined} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("충돌이 없으면 빈 상태를 보여준다", () => {
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    expect(screen.getByRole("dialog").textContent).toContain("확인할 충돌이 없어요");
  });

  it("충돌 항목과 차이 비교 요약, 3지선다 버튼(내 버전 유지·병합해서 저장·원격 버전 사용)을 표시한다", async () => {
    const id = await seedConflictedItem("에피소드 3 메모");
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    expect(screen.getByText("에피소드 3 메모")).toBeTruthy();
    expect(screen.getByRole("button", { name: "내 버전 유지" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "병합해서 저장" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "원격 버전 사용" })).toBeTruthy();

    const diffBox = screen.getByTestId(`pwa-conflict-diff-${id}`);
    expect(diffBox.textContent).toContain("내 버전만 1건");
    expect(diffBox.textContent).toContain("원격만 1건");
    expect(diffBox.textContent).toContain("동시 변경 1건");
  });

  it("내 버전 유지를 선택하면 항목이 다시 큐로 돌아간다", async () => {
    const id = await seedConflictedItem("에피소드 3 메모");
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "내 버전 유지" }));
    const after = getBrowserPwaOfflineOutbox()
      .list()
      .find((entry) => entry.id === id);
    expect(after?.status).toBe("queued");
    expect(screen.queryByText("에피소드 3 메모")).toBeNull();
  });

  it("병합해서 저장을 선택하면 양쪽 비충돌 필드를 합치고 충돌 메타데이터를 보존해 큐로 복귀시킨다", async () => {
    const id = await seedConflictedItem("에피소드 4 콘티 메모");
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "병합해서 저장" }));

    const after = getBrowserPwaOfflineOutbox()
      .list()
      .find((entry) => entry.id === id);
    expect(after?.status).toBe("queued");
    expect(after?.payload).toEqual({
      text: "내 대사",
      localMemo: "컷 4 수정",
      remoteTag: "편집 검수",
    });
    expect(after?.mergeResolution?.strategy).toBe("merge");
    expect(after?.mergeResolution?.remoteOnlyKeys).toEqual(["remoteTag"]);
    expect(screen.getByRole("status").textContent).toContain("병합");
  });

  it("원격 버전 사용을 선택하면 항목이 삭제된다", async () => {
    const id = await seedConflictedItem("에피소드 3 메모");
    render(<PwaOutboxConflictPanel open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "원격 버전 사용" }));
    expect(
      getBrowserPwaOfflineOutbox().list().find((entry) => entry.id === id),
    ).toBeUndefined();
  });

  it("Escape 키로 닫힌다", () => {
    const onClose = vi.fn();
    render(<PwaOutboxConflictPanel open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
