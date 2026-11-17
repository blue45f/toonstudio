// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPublishingCommandCenter } from "../StudioPublishingCommandCenter";

const DUMMY_PIXEL_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const mockSessionState = vi.hoisted(() => ({
  user: null as {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly role: string;
  } | null,
}));

const mockCreateWork = vi.hoisted(() => vi.fn());
const mockGetSharedDocument = vi.hoisted(() => vi.fn());
const mockGetSharedDocumentMeta = vi.hoisted(() => vi.fn());
const mockUpdateSharedDocument = vi.hoisted(() => vi.fn());

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({
    data: mockSessionState.user ? { user: mockSessionState.user } : null,
  }),
}));

vi.mock("@/platform/creator-client", () => ({
  createWork: (...args: unknown[]) => mockCreateWork(...args),
  getChallenge: vi.fn(),
  getSeries: vi.fn(),
}));

vi.mock("../studio-shared-document-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../studio-shared-document-client")>();
  return {
    ...actual,
    getStudioSharedDocument: (...args: unknown[]) => mockGetSharedDocument(...args),
    getStudioSharedDocumentMeta: (...args: unknown[]) => mockGetSharedDocumentMeta(...args),
    updateStudioSharedDocument: (...args: unknown[]) => mockUpdateSharedDocument(...args),
  };
});

vi.mock("../studio-upload-image-safety", () => ({
  assertStudioUploadSourceBatch: () => undefined,
  inspectStudioUploadSourceImage: async () => ({
    width: 800,
    height: 1200,
    format: "png" as const,
  }),
  selectStudioUploadDecodedPixelLimit: () => 16_000_000,
}));

vi.mock("../studio-image-utils", () => ({
  downscaleImageFile: async () => ({
    src: DUMMY_PIXEL_DATA_URL,
    width: 800,
    height: 1200,
  }),
}));

vi.mock("../studio-publication-cover", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../studio-publication-cover")>();
  return {
    ...actual,
    createStudioPublicationCoverDataUrl: async () => DUMMY_PIXEL_DATA_URL,
  };
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockSessionState.user = null;
  mockCreateWork.mockReset();
  mockGetSharedDocument.mockReset();
  mockGetSharedDocumentMeta.mockReset();
  mockUpdateSharedDocument.mockReset();
});

describe("StudioPublishingCommandCenter persistence status alignment (isolated local dummy data)", () => {
  it("비로그인 초기 진입(0페이지·수정 없음)에서 로그인 안내 바로 아래 초록 '저장됨'을 표시하지 않고 게스트 편집 시 guest-unsaved로 전환한다", () => {
    render(
      <MemoryRouter initialEntries={["/studio/publish"]}>
        <StudioPublishingCommandCenter />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/서버 저장과 게시는 로그인 후 가능합니다/u),
    ).toBeDefined();

    const summary = screen.getByTestId("studio-publish-persistence-summary");
    const dock = screen.getByTestId("studio-publish-persistence-dock");
    expect(summary.getAttribute("data-persistence-status")).toBe("empty");
    expect(summary.getAttribute("data-persistence-tone")).toBe("neutral");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");
    expect(summary.textContent).not.toContain("현재 버전까지 저장됨");
    expect(dock.getAttribute("data-persistence-status")).toBe("empty");
    expect(dock.textContent).not.toContain("현재 버전 저장됨");

    // 격리 더미 제목 입력 -> guest-unsaved 상태로 전환
    fireEvent.change(screen.getByPlaceholderText("작품 제목"), {
      target: { value: "더미 게스트 원고" },
    });

    expect(summary.getAttribute("data-persistence-status")).toBe("guest-unsaved");
    expect(summary.getAttribute("data-persistence-tone")).toBe("warning");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");
    expect(summary.textContent).toContain("로그인 전 미저장 상태");
    expect(dock.getAttribute("data-persistence-status")).toBe("guest-unsaved");
    expect(mockCreateWork).not.toHaveBeenCalled();
  });

  it("로그인 사용자의 격리 더미 편집 → 서버 저장 실패(save-failed) → 서버 저장 성공(saved) → 재편집(unsaved-changes)을 실제 지속성과 일치시킨다", async () => {
    mockSessionState.user = {
      id: "dummy-user-1",
      name: "더미 작가",
      email: "dummy@toonstudio.test",
      role: "user",
    };

    const view = render(
      <MemoryRouter initialEntries={["/studio/publish"]}>
        <StudioPublishingCommandCenter />
      </MemoryRouter>,
    );

    const summary = screen.getByTestId("studio-publish-persistence-summary");
    const dock = screen.getByTestId("studio-publish-persistence-dock");

    // 1. 로그인 상태라도 초기 0페이지·수정 없음이면 empty 상태 유지
    expect(summary.getAttribute("data-persistence-status")).toBe("empty");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");

    // 2. 격리 더미 이미지 1장 + 제목 입력 -> unsaved-changes
    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const dummyFile = new File([new Uint8Array([137, 80, 78, 71])], "dummy-page-1.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    await waitFor(() => {
      expect(screen.getAllByText("dummy-page-1.png").length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.change(screen.getByPlaceholderText("작품 제목"), {
      target: { value: "더미 인증 원고" },
    });

    expect(summary.getAttribute("data-persistence-status")).toBe("unsaved-changes");
    expect(summary.getAttribute("data-persistence-tone")).toBe("warning");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");

    // 3. 격리 더미 서버 저장 실패 -> save-failed (절대 저장됨으로 표시하지 않음)
    mockCreateWork.mockRejectedValueOnce(new Error("격리 더미 서버 저장 실패"));
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));

    await waitFor(() => {
      expect(summary.getAttribute("data-persistence-status")).toBe("save-failed");
    });
    expect(summary.getAttribute("data-persistence-tone")).toBe("danger");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");
    expect(dock.getAttribute("data-persistence-status")).toBe("save-failed");
    expect(screen.getByRole("alert").textContent).toContain("격리 더미 서버 저장 실패");

    // 4. 격리 더미 서버 저장 재시도 성공 -> 확정된 서버 저장(saved, 버전 #1)
    mockCreateWork.mockResolvedValueOnce({
      id: "dummy-work-1",
      author: { id: "dummy-user-1" },
      revision: 1,
    });
    mockGetSharedDocument.mockResolvedValueOnce({
      workId: "dummy-work-1",
      role: "owner",
      status: "active",
      capabilities: { view: true, edit: true },
      access: "edit",
      revision: 1,
      crdtServerSequence: "0",
      updatedAt: "2026-11-17T00:00:00.000Z",
      document: {
        format: "upload",
        title: "더미 인증 원고",
        description: "",
        tags: [],
        pages: [DUMMY_PIXEL_DATA_URL],
        seriesId: null,
        challengeId: null,
        titleId: null,
        doc: {
          format: "upload",
          pageMeta: [{ width: 800, height: 1200, name: "dummy-page-1.png" }],
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("saved");
    });
    const savedSummary = screen.getByTestId("studio-publish-persistence-summary");
    const savedDock = screen.getByTestId("studio-publish-persistence-dock");
    expect(savedSummary.getAttribute("data-persistence-tone")).toBe("success");
    expect(savedSummary.getAttribute("data-server-persisted")).toBe("true");
    expect(savedSummary.textContent).toContain("버전 #1까지 저장됨");
    expect(savedDock.getAttribute("data-persistence-status")).toBe("saved");
    expect(savedDock.textContent).toContain("서버 버전 #1 저장됨");

    // 5. 저장 확정 이후 다시 제목 수정 -> unsaved-changes 전환(이전 서버 저장 이력은 true 유지)
    fireEvent.change(screen.getByPlaceholderText("작품 제목"), {
      target: { value: "더미 인증 원고 수정본" },
    });
    expect(savedSummary.getAttribute("data-persistence-status")).toBe("unsaved-changes");
    expect(savedSummary.getAttribute("data-persistence-tone")).toBe("warning");
    expect(savedSummary.getAttribute("data-server-persisted")).toBe("true");
  });
});
