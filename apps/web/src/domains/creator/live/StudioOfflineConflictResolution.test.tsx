// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import { StudioOfflineConflictResolution } from "../offline-branch/StudioOfflineConflictResolution";
import type { StudioOfflineBranchConflictDetail, StudioOfflineBranchResolveInput } from "../offline-branch/studio-offline-branch-runtime";

const initialLang = useI18n.getState().lang;
beforeEach(() => { useI18n.setState({ lang: "ko" }); });
afterEach(() => { cleanup(); useI18n.setState({ lang: initialLang }); });
function detail(overrides: Partial<StudioOfflineBranchConflictDetail> = {}): StudioOfflineBranchConflictDetail {
  return { operationId: "private-operation-a", pageId: "private-page-a", pageName: "2페이지", targetId: "private-target-a", targetType: "stroke", action: "upsert", code: "target-changed", message: "internal diagnostic", canonicalFingerprint: "fp1:1111111111111111", canKeepCanonical: true, canReapplyLocal: true, disabledReason: null, ...overrides };
}
function deferred() {
  let finish: () => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  return { promise, finish, fail };
}

describe("오프라인 변경의 사용자 선택", () => {
  it("페이지와 변경 의도를 설명하고 내부 식별자 대신 선택 의미를 보여 준다", () => {
    render(<StudioOfflineConflictResolution conflicts={[detail()]} resolve={async () => undefined} />);
    expect(screen.getByRole("heading", { name: "변경 1 · 2페이지 · 선 · 추가·수정" })).toBeTruthy();
    expect(screen.getByText("다른 작업으로 공유본의 대상이 변경됐습니다.")).toBeTruthy();
    expect(screen.getByText(/원본은 복구 기록에 남깁니다/)).toBeTruthy();
    expect(screen.queryByText("private-operation-a")).toBeNull();
    expect(screen.queryByText("internal diagnostic")).toBeNull();
  });

  it("현재 검토한 정본 지문으로 선택을 한 번만 저장하고 완료 뒤 목록에 포커스를 둔다", async () => {
    const pending = deferred();
    const resolve = vi.fn<(input: StudioOfflineBranchResolveInput) => Promise<void>>(() => pending.promise);
    const view = render(<StudioOfflineConflictResolution conflicts={[detail()]} resolve={resolve} />);
    const button = screen.getByRole("button", { name: "내 변경 다시 적용" });
    act(() => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith({ operationId: "private-operation-a", action: "reapply-local", expectedCanonicalFingerprint: "fp1:1111111111111111" });
    expect(screen.getByText("선택 저장 중…")).toBeTruthy();
    await act(async () => { pending.finish(); await pending.promise; });
    expect(screen.getByText(/서버 승인 여부는 동기화 상태에서 확인/)).toBeTruthy();
    expect(document.activeElement).toBe(view.container.querySelector("section"));
  });

  it("선택 처리 중 마지막 카드가 사라져도 목록을 유지하고 완료가 반영된 뒤 포커스를 돌린다", async () => {
    const pending = deferred();
    const resolve = vi.fn<(input: StudioOfflineBranchResolveInput) => Promise<void>>(() => pending.promise);
    const view = render(<StudioOfflineConflictResolution conflicts={[detail()]} resolve={resolve} />);
    fireEvent.click(screen.getByRole("button", { name: "공유본 유지" }));
    view.rerender(<StudioOfflineConflictResolution conflicts={[]} resolve={resolve} />);
    expect(view.container.querySelector("section")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
    await act(async () => { pending.finish(); await pending.promise; });
    expect(screen.getByText(/공유본 유지 결정을 저장했습니다/)).toBeTruthy();
    expect(document.activeElement).toBe(view.container.querySelector("section"));
  });

  it("선택 저장 실패 때 원본 카드와 재시도 동선을 유지한다", async () => {
    const resolve = vi.fn<(input: StudioOfflineBranchResolveInput) => Promise<void>>().mockRejectedValueOnce(new Error("storage failure"));
    render(<StudioOfflineConflictResolution conflicts={[detail()]} resolve={resolve} />);
    fireEvent.click(screen.getByRole("button", { name: "공유본 유지" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("원본 변경을 유지했습니다"));
    expect(screen.getByRole("heading", { name: /변경 1/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: "공유본 유지" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("다른 원고 세대로 교체된 뒤 이전 선택 실패를 새 카드에 표시하지 않는다", async () => {
    const pending = deferred();
    const view = render(<StudioOfflineConflictResolution key="work-a:1" conflicts={[detail()]} resolve={() => pending.promise} />);
    fireEvent.click(screen.getByRole("button", { name: "공유본 유지" }));
    view.rerender(<StudioOfflineConflictResolution key="work-b:2" conflicts={[detail({ operationId: "operation-b", pageName: "새 원고" })]} resolve={async () => undefined} />);
    await act(async () => { pending.fail(new Error("previous scope")); await pending.promise.catch(() => undefined); });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: /새 원고/ })).toBeTruthy();
  });

  it("손상된 자료의 재적용을 비활성화하되 공유본 유지 선택은 보존한다", () => {
    const resolve = vi.fn<(input: StudioOfflineBranchResolveInput) => Promise<void>>();
    render(<StudioOfflineConflictResolution conflicts={[detail({ code: "payload-corrupt", canReapplyLocal: false, disabledReason: "변경 자료를 확인할 수 없습니다." })]} resolve={resolve} />);
    const reapply = screen.getByRole("button", { name: "내 변경 다시 적용" }) as HTMLButtonElement;
    expect(reapply.disabled).toBe(true);
    fireEvent.click(reapply);
    expect(resolve).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "공유본 유지" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("변경 자료를 확인할 수 없습니다.")).toBeTruthy();
  });

  it("많은 충돌은 나눠 표시하고 추가 요청으로 다음 변경을 연다", () => {
    const conflicts = Array.from({ length: 23 }, (_, index) => detail({ operationId: `operation-${index}` }));
    render(<StudioOfflineConflictResolution conflicts={conflicts} resolve={async () => undefined} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "다음 변경 더 보기" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(23);
  });

  it("구조화된 페이지와 제한 사유는 런타임의 한국어 문구 대신 활성 언어로 표시한다", () => {
    useI18n.setState({ lang: "en" });
    const resolve = async () => undefined;
    const view = render(<StudioOfflineConflictResolution conflicts={[detail({ pageName: "3페이지", pageNumber: 3, canReapplyLocal: false, disabledReasonCode: "offline", disabledReason: "공유 원고 연결 필요" })]} resolve={resolve} />);
    expect(screen.getByRole("heading", { name: /Page 3/ })).toBeTruthy();
    expect(screen.getByText("Connect to the shared manuscript before reapplying your change.")).toBeTruthy();
    expect(screen.queryByText("공유 원고 연결 필요")).toBeNull();
    view.rerender(<StudioOfflineConflictResolution conflicts={[detail({ pageName: "삭제된 페이지", pageNumber: null, canReapplyLocal: false, disabledReasonCode: "page-missing", disabledReason: "페이지 삭제됨" })]} resolve={resolve} />);
    expect(screen.getByRole("heading", { name: /Deleted page/ })).toBeTruthy();
    expect(screen.getByText("The page was deleted from the shared manuscript, so this change cannot be reapplied.")).toBeTruthy();
    expect(screen.queryByText("페이지 삭제됨")).toBeNull();
  });

  it("활성 영어 로케일에 선택과 사유를 맞춘다", () => {
    useI18n.setState({ lang: "en" });
    render(<StudioOfflineConflictResolution conflicts={[detail()]} resolve={async () => undefined} />);
    expect(screen.getByRole("button", { name: "Keep shared version" })).toBeTruthy();
    expect(screen.getByText("The target was changed in the shared version.")).toBeTruthy();
  });
});
