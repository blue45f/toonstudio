// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioUploadPublish } from "../StudioUploadPublish";

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
  downscaleDataUrl: async () => DUMMY_PIXEL_DATA_URL,
}));

vi.mock("../publish/publish-auto-fit", () => ({
  applyPublishAutoFitToPages: async <T,>(pages: readonly T[]) => [...pages],
}));

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

describe("StudioUploadPublish persistence status & action lock alignment", () => {
  it("비로그인 초기 진입 시 empty 상태와 비활성 저장·게시 버튼을 표시하고 게스트 입력 시 guest-unsaved로 전환한다", () => {
    render(
      <MemoryRouter initialEntries={["/studio/upload"]}>
        <StudioUploadPublish />
      </MemoryRouter>,
    );

    const summary = screen.getByTestId("studio-publish-persistence-summary");
    const dock = screen.getByTestId("studio-publish-persistence-dock");
    const draftButton = screen.getByRole("button", { name: "임시저장" }) as HTMLButtonElement;
    const publishButton = screen.getByRole("button", { name: "게시하기" }) as HTMLButtonElement;

    expect(summary.getAttribute("data-persistence-status")).toBe("empty");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");
    expect(dock.getAttribute("data-persistence-status")).toBe("empty");
    expect(draftButton.disabled).toBe(true);
    expect(publishButton.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("작품 제목"), {
      target: { value: "게스트 업로드 제목" },
    });

    expect(summary.getAttribute("data-persistence-status")).toBe("guest-unsaved");
    expect(dock.getAttribute("data-persistence-status")).toBe("guest-unsaved");
    expect(draftButton.disabled).toBe(true);
    expect(publishButton.disabled).toBe(true);
  });

  it("로그인 공동 문서 수정 시 saved → unsaved-changes → save-failed → saved(최신 revision) 순으로 서버 지속성을 표시한다", async () => {
    mockSessionState.user = {
      id: "editor-user-1",
      name: "편집자",
      email: "editor@toonstudio.test",
      role: "user",
    };
    const sharedMeta = {
      workId: "shared-upload-1",
      role: "editor" as const,
      status: "active" as const,
      capabilities: { view: true, edit: true },
      access: "edit" as const,
      revision: 2,
      crdtServerSequence: "0",
      updatedAt: "2026-11-17T00:00:00.000Z",
    };
    mockGetSharedDocument.mockResolvedValueOnce({
      ...sharedMeta,
      document: {
        format: "upload",
        title: "공동 업로드 원고",
        description: "",
        tags: [],
        pages: [DUMMY_PIXEL_DATA_URL],
        seriesId: null,
        challengeId: null,
        titleId: null,
        doc: {
          format: "upload",
          pageMeta: [{ width: 800, height: 1200, name: "page-1.png" }],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/studio/upload?id=shared-upload-1"]}>
        <StudioUploadPublish workId="shared-upload-1" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("saved");
    });
    expect(screen.getByTestId("studio-publish-persistence-summary").textContent).toContain(
      "버전 #2까지 저장됨",
    );

    fireEvent.change(screen.getByPlaceholderText("작품 제목"), {
      target: { value: "공동 업로드 원고 수정" },
    });
    expect(
      screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
    ).toBe("unsaved-changes");

    mockGetSharedDocumentMeta.mockResolvedValueOnce(sharedMeta);
    mockUpdateSharedDocument.mockRejectedValueOnce(new Error("네트워크 일시 실패"));
    fireEvent.click(screen.getByRole("button", { name: "공동 변경사항 저장" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("save-failed");
    });

    mockGetSharedDocumentMeta.mockResolvedValueOnce(sharedMeta);
    mockUpdateSharedDocument.mockResolvedValueOnce({
      workId: "shared-upload-1",
      revision: 3,
      updatedAt: "2026-11-17T00:02:00.000Z",
    });
    fireEvent.click(screen.getByRole("button", { name: "공동 변경사항 저장" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("saved");
    });
    expect(screen.getByTestId("studio-publish-persistence-summary").textContent).toContain(
      "버전 #3까지 저장됨",
    );
  });
});
