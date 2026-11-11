// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { reviewProductionFixture } from "../review-production/studio-review-production-test-fixture";
import type { StudioReviewExportProgress, StudioReviewExportReason } from "./studio-review-export";
import { StudioReviewExport } from "./StudioReviewExport";

const f = vi.hoisted(() => ({ prepare: vi.fn(), download: vi.fn() }));
vi.mock("./StudioReviewDelivery", () => ({ StudioReviewDelivery: () => null }));
vi.mock("./studio-review-export", () => ({
  prepareStudioReviewExport: f.prepare,
  StudioReviewExportError: class StudioReviewExportError extends Error {
    constructor(readonly reason: StudioReviewExportReason) {
      super(reason);
    }
  },
}));
vi.mock("../export/studio-export", () => ({ downloadBlob: f.download }));

const approved = (previewCount = 2) => {
  const value = reviewProductionFixture().verified;
  const blobRefs = Array.from({ length: previewCount }, (_, ordinal) => ({
    ordinal,
    role: "preview" as const,
    sha256: `${ordinal}`.repeat(64).slice(0, 64),
  }));
  return {
    ...value,
    review: {
      ...value.review,
      status: "approved" as const,
      decidedAt: "2026-09-21T09:00:00.000Z",
    },
    revision: {
      ...value.revision,
      blobRefs,
    },
  };
};

beforeEach(() => {
  f.prepare.mockReset();
  f.download.mockReset();
  persistSession({ user: { id: "actor" }, token: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  persistSession(null);
});

describe("approved review export action", () => {
  it("starts only on an explicit click, requests one original ZIP download, and shows next steps", async () => {
    const blob = new Blob(["zip"]);
    f.prepare.mockResolvedValue({ blob, fileName: "approved.zip" });
    render(<StudioReviewExport verified={approved()} />);
    expect(f.prepare).not.toHaveBeenCalled();

    const saveButton = screen.getByRole("button", { name: "승인 검수본 ZIP 저장" });
    expect(saveButton.className).toContain("min-h-11");
    fireEvent.click(saveButton);

    await screen.findByText("브라우저에 승인된 검수본의 ZIP 다운로드를 요청했어요.");
    expect(screen.getByText(/브라우저 다운로드 목록에서 ZIP 파일을 열어 보세요/u)).toBeTruthy();
    expect(f.prepare.mock.calls[0]![0]).toEqual(approved().subject);
    expect(f.download).toHaveBeenCalledExactlyOnceWith(blob, "approved.zip");
  });

  it("does not offer a download for a review awaiting a decision", () => {
    render(<StudioReviewExport verified={reviewProductionFixture().verified} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(f.prepare).not.toHaveBeenCalled();
  });

  it.each(["cancel", "account", "renew", "unmount"])(
    "drops a late archive after %s without another request",
    async (action) => {
      let resolve!: (value: unknown) => void;
      f.prepare.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const view = render(<StudioReviewExport verified={approved()} />);
      const saveButton = screen.getByRole("button", { name: "승인 검수본 ZIP 저장" });
      fireEvent.click(saveButton);
      await waitFor(() => expect(f.prepare).toHaveBeenCalledOnce());
      const options = f.prepare.mock.calls[0]![1];

      if (action === "cancel") {
        const cancelButton = screen.getByRole("button", { name: "취소" });
        expect(cancelButton.className).toContain("min-h-11");
        fireEvent.click(cancelButton);
        expect(screen.getByText("파일 준비를 취소했어요.")).toBeTruthy();
        expect(screen.getByText(/승인 기록은 그대로 유지되며 내려받은 파일은 없습니다/u)).toBeTruthy();
        expect(document.activeElement).toBe(saveButton);
      } else if (action === "unmount") {
        view.unmount();
      } else {
        act(() =>
          persistSession({
            user: { id: action === "account" ? "other" : "actor" },
            token: null,
          }),
        );
      }

      expect(options.signal.aborted).toBe(true);
      expect(options.isCurrent()).toBe(false);
      await act(async () => {
        resolve({ blob: new Blob(["stale"]), fileName: "stale.zip" });
      });
      expect(f.download).not.toHaveBeenCalled();
      expect(f.prepare).toHaveBeenCalledOnce();
    },
  );

  it("explains why start is disabled when signed out or offline and links aria-describedby", async () => {
    persistSession(null);
    const signedOutView = render(<StudioReviewExport verified={approved()} />);
    const signedOutSave = screen.getByRole("button", {
      name: "승인 검수본 ZIP 저장",
    }) as HTMLButtonElement;
    expect(signedOutSave.disabled).toBe(true);
    const signedOutReasonId = signedOutSave.getAttribute("aria-describedby");
    expect(signedOutReasonId).toBeTruthy();
    const signedOutAlert = screen.getByRole("alert");
    expect(signedOutAlert.id).toBe(signedOutReasonId);
    expect(signedOutAlert.textContent).toContain("로그인한 계정으로 승인본 저장 권한을 다시 확인");
    expect(signedOutAlert.textContent).toContain("검토 기록 새로 확인");
    signedOutView.unmount();

    persistSession({ user: { id: "actor" }, token: null });
    let online = true;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    let reject!: (error: unknown) => void;
    f.prepare
      .mockImplementationOnce(
        (_subject, options) =>
          new Promise((_resolve, done) => {
            reject = done;
            options.signal.addEventListener(
              "abort",
              () => done(new DOMException("aborted", "AbortError")),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce({ blob: new Blob(["zip"]), fileName: "reconnected.zip" });

    render(<StudioReviewExport verified={approved()} />);
    const save = screen.getByRole("button", { name: "승인 검수본 ZIP 저장" });
    fireEvent.click(save);
    await waitFor(() => expect(f.prepare).toHaveBeenCalledOnce());
    const options = f.prepare.mock.calls[0]![1];

    online = false;
    act(() => globalThis.dispatchEvent(new Event("offline")));
    expect(options.signal.aborted).toBe(true);
    const offlineAlert = await screen.findByRole("alert");
    expect(offlineAlert.textContent).toContain("연결이 복구되기 전에는");
    expect(offlineAlert.textContent).toContain("자동으로 활성화됩니다");
    expect((save as HTMLButtonElement).disabled).toBe(true);
    expect(save.getAttribute("aria-describedby")).toBe(offlineAlert.id);
    await act(async () => {
      reject(new DOMException("aborted", "AbortError"));
    });
    expect(f.download).not.toHaveBeenCalled();

    online = true;
    act(() => globalThis.dispatchEvent(new Event("online")));
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);
    await screen.findByText("브라우저에 승인된 검수본의 ZIP 다운로드를 요청했어요.");
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(f.download).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), "reconnected.zip");
  });

  it("displays all 4 preparation stages distinctly and distinguishes integrity vs authority error follow-ups", async () => {
    let reportProgress!: (progress: StudioReviewExportProgress) => void;
    let failAttempt!: (error: unknown) => void;
    f.prepare.mockImplementationOnce((_subject, options) => {
      reportProgress = options.onProgress;
      return new Promise((_resolve, reject) => {
        failAttempt = reject;
      });
    });

    const { StudioReviewExportError: MockExportError } = await import("./studio-review-export");
    render(<StudioReviewExport verified={approved(3)} />);
    expect(screen.getByText(/승인 시점 원본 이미지 3장/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "승인 검수본 ZIP 저장" }));
    await waitFor(() => expect(f.prepare).toHaveBeenCalledOnce());
    expect(screen.getByText(/1\/4단계 · 승인과 접근 권한 확인 중/u)).toBeTruthy();

    act(() => reportProgress({ phase: "images", completed: 2, total: 3 }));
    expect(screen.getByText(/2\/4단계 · 이미지 확인 중 \(2\/3\)/u)).toBeTruthy();

    act(() => reportProgress({ phase: "archive", completed: 0, total: 3 }));
    expect(screen.getByText(/3\/4단계 · 원본 이미지 묶음을 준비 중/u)).toBeTruthy();

    act(() => reportProgress({ phase: "checking", completed: 3, total: 3 }));
    expect(screen.getByText(/4\/4단계 · 다운로드 직전 승인·파일 목록 최종 확인 중/u)).toBeTruthy();

    await act(async () => {
      failAttempt(new MockExportError("integrity"));
    });
    expect(
      screen.getByText("저장된 이미지의 내용이나 전체 목록을 확인하지 못했어요. 파일을 저장하지 않았습니다."),
    ).toBeTruthy();
    expect(screen.getByText(/불완전한 파일은 내려받지 않도록 차단했습니다/u)).toBeTruthy();

    f.prepare.mockRejectedValueOnce(new Error("private server detail"));
    fireEvent.click(screen.getByRole("button", { name: "승인 검수본 ZIP 저장" }));
    await screen.findByText(
      "현재 승인과 접근 권한을 확인하지 못했어요. 검토 기록을 새로 확인한 뒤 다시 시도해 주세요.",
    );
    expect(screen.getByText(/위쪽의 ‘검토 기록 새로 확인’ 버튼을 눌러/u)).toBeTruthy();
    expect(screen.queryByText("private server detail")).toBeNull();
    expect(f.download).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "승인 검수본 ZIP 저장" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe("approved source preflight", () => {
  it("places plain-language contents and exclusions before technical IDs and SHA-256 hashes without starting an export", () => {
    const value = approved(2);
    render(<StudioReviewExport verified={value} />);
    const details = screen.getByText("전달 기준·포함 범위 확인").closest("details")!;
    details.open = true;

    const contentsBlock = details.querySelector('[data-review-export-summary="contents"]')!;
    const identifiersBlock = details.querySelector('[data-review-export-summary="identifiers"]')!;
    expect(contentsBlock).toBeTruthy();
    expect(identifiersBlock).toBeTruthy();
    expect(
      contentsBlock.compareDocumentPosition(identifiersBlock) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    expect(contentsBlock.textContent).toContain("플랫폼 규격 변환 없음");
    expect(contentsBlock.textContent).toContain("편집 가능한 작업 원본·검토 의견·팀원 명단·서명 URL은 포함하지 않습니다");
    expect(contentsBlock.textContent).toContain("수신자의 인수 확인이 아닙니다");
    expect(identifiersBlock.textContent).toContain(value.subject.revisionId);
    expect(identifiersBlock.textContent).toContain(value.subject.rootGraphHash);
    expect(f.prepare).not.toHaveBeenCalled();
    expect(f.download).not.toHaveBeenCalled();
  });
});
