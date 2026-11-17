// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

const mockLoadHandoff = vi.hoisted(() => vi.fn());
const mockRemoveHandoff = vi.hoisted(() => vi.fn());
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

vi.mock("../studio-publish-handoff", () => ({
  loadStudioPublishHandoffAsUploadPages: (...args: unknown[]) => mockLoadHandoff(...args),
  acquireStudioPublishHandoffRepository: () => ({
    remove: (...args: unknown[]) => mockRemoveHandoff(...args),
  }),
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="router-search">{location.search}</output>;
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockSessionState.user = null;
  mockLoadHandoff.mockReset();
  mockRemoveHandoff.mockReset();
  mockCreateWork.mockReset();
  mockGetSharedDocument.mockReset();
  mockGetSharedDocumentMeta.mockReset();
  mockUpdateSharedDocument.mockReset();
});

describe("StudioPublishingCommandCenter handoff lifecycle & persistence alignment", () => {
  it("만료·삭제된 ?handoff 진입 시 load-failed에서 '인계 안내 닫고 직접 올리기'로 쿼리와 오류 잠금을 해제한다", async () => {
    mockLoadHandoff.mockResolvedValueOnce(null);

    render(
      <MemoryRouter initialEntries={["/studio/publish?handoff=expired-handoff-1"]}>
        <LocationProbe />
        <StudioPublishingCommandCenter />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("load-failed");
    });
    expect(screen.getByTestId("router-search").textContent).toBe("?handoff=expired-handoff-1");

    fireEvent.click(screen.getByTestId("studio-publish-dismiss-handoff-error"));

    await waitFor(() => {
      expect(screen.getByTestId("router-search").textContent).toBe("");
    });
    const summary = screen.getByTestId("studio-publish-persistence-summary");
    expect(summary.getAttribute("data-persistence-status")).toBe("empty");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");
    expect(screen.queryByTestId("studio-publish-dismiss-handoff-error")).toBeNull();
  });

  it("만료된 ?handoff 오류 상태에서 사용자가 직접 이미지를 추가하면 오류 잠금을 풀고 guest-unsaved로 전환한다", async () => {
    mockLoadHandoff.mockResolvedValueOnce(null);

    const view = render(
      <MemoryRouter initialEntries={["/studio/publish?handoff=expired-handoff-2"]}>
        <LocationProbe />
        <StudioPublishingCommandCenter />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("load-failed");
    });

    const fileInput = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const dummyFile = new File([new Uint8Array([137, 80, 78, 71])], "fresh-upload.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [dummyFile] } });

    await waitFor(() => {
      expect(screen.getAllByText("fresh-upload.png").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId("router-search").textContent).toBe("");
    });
    const summary = screen.getByTestId("studio-publish-persistence-summary");
    expect(summary.getAttribute("data-persistence-status")).toBe("guest-unsaved");
    expect(summary.getAttribute("data-server-persisted")).toBe("false");
  });

  it("비로그인 로컬 인계본 수령 → 게스트 편집 보존 → 로그인 승계 → 기존 작품 초안 저장 시 ?handoff 정리 및 saved 전환을 보장한다", async () => {
    mockLoadHandoff.mockResolvedValueOnce({
      title: "편집기 인계 원고",
      sourceWorkId: "studio-local-doc-1",
      pages: [
        {
          src: DUMMY_PIXEL_DATA_URL,
          width: 800,
          height: 1200,
          name: "handoff-cut-1.png",
        },
      ],
    });

    const view = render(
      <MemoryRouter initialEntries={["/studio/publish?handoff=valid-handoff-1"]}>
        <LocationProbe />
        <StudioPublishingCommandCenter />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-publish-handoff-local-badge")).toBeDefined();
    });

    const guestBadge = screen.getByTestId("studio-publish-handoff-local-badge");
    expect(guestBadge.getAttribute("data-handoff-auth")).toBe("guest");
    expect(guestBadge.textContent).toContain("로컬 인계본");
    expect(
      screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
    ).toBe("guest-unsaved");

    // 게스트 상태에서 작품 설명 추가 후 로그인 -> 인계 원고·설명 재초기화 없이 보존
    fireEvent.change(screen.getByPlaceholderText(/이번 화의 내용/u), {
      target: { value: "게스트 작성 설명 유지" },
    });

    mockSessionState.user = {
      id: "dummy-user-1",
      name: "더미 작가",
      email: "dummy@toonstudio.test",
      role: "user",
    };
    view.rerender(
      <MemoryRouter initialEntries={["/studio/publish?handoff=valid-handoff-1"]}>
        <LocationProbe />
        <StudioPublishingCommandCenter />
      </MemoryRouter>,
    );

    expect((screen.getByPlaceholderText(/이번 화의 내용/u) as HTMLTextAreaElement).value).toBe(
      "게스트 작성 설명 유지",
    );
    expect(mockLoadHandoff).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("studio-publish-handoff-local-badge").getAttribute("data-handoff-auth"),
    ).toBe("authenticated");
    expect(
      screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
    ).toBe("unsaved-changes");

    // 저장 실패 시 로컬 인계본을 삭제하지 않음
    mockCreateWork.mockRejectedValueOnce(new Error("일시적 저장 오류"));
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));
    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("save-failed");
    });
    expect(mockRemoveHandoff).not.toHaveBeenCalled();

    // 저장 성공 시 로컬 인계본 삭제 및 saved 전환
    mockRemoveHandoff.mockResolvedValueOnce(undefined);
    mockCreateWork.mockResolvedValueOnce({
      id: "saved-handoff-work-1",
      author: { id: "dummy-user-1" },
      revision: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));

    await waitFor(() => {
      expect(mockRemoveHandoff).toHaveBeenCalledWith("valid-handoff-1");
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("saved");
    });
  });

  it("기존 작품 편집(?id=work-1&handoff=valid-2)에서 초안 저장 성공 시 페이지에 머물러도 ?handoff 쿼리를 즉시 제거한다", async () => {
    mockSessionState.user = {
      id: "dummy-user-1",
      name: "더미 작가",
      email: "dummy@toonstudio.test",
      role: "user",
    };
    const sharedMeta = {
      workId: "work-existing-1",
      role: "owner" as const,
      status: "active" as const,
      capabilities: { view: true, edit: true },
      access: "edit" as const,
      revision: 3,
      crdtServerSequence: "0",
      updatedAt: "2026-11-17T00:00:00.000Z",
    };
    mockGetSharedDocument.mockResolvedValueOnce({
      ...sharedMeta,
      document: {
        format: "upload",
        title: "기존 서버 원고",
        description: "",
        tags: [],
        pages: [DUMMY_PIXEL_DATA_URL],
        seriesId: null,
        challengeId: null,
        titleId: null,
        doc: {
          format: "upload",
          pageMeta: [{ width: 800, height: 1200, name: "old.png" }],
        },
      },
    });
    mockLoadHandoff.mockResolvedValueOnce({
      title: "기존 서버 원고 갱신본",
      sourceWorkId: "work-existing-1",
      pages: [
        {
          src: DUMMY_PIXEL_DATA_URL,
          width: 800,
          height: 1200,
          name: "new-handoff.png",
        },
      ],
    });
    mockGetSharedDocumentMeta.mockResolvedValueOnce(sharedMeta);
    mockUpdateSharedDocument.mockResolvedValueOnce({
      workId: "work-existing-1",
      revision: 4,
      updatedAt: "2026-11-17T00:05:00.000Z",
    });
    mockRemoveHandoff.mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter initialEntries={["/studio/publish?id=work-existing-1&handoff=valid-handoff-2"]}>
        <LocationProbe />
        <StudioPublishingCommandCenter />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("studio-publish-handoff-local-badge")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));

    await waitFor(() => {
      expect(
        screen.getByTestId("studio-publish-persistence-summary").getAttribute("data-persistence-status"),
      ).toBe("saved");
    });
    expect(mockRemoveHandoff).toHaveBeenCalledWith("valid-handoff-2");
    expect(screen.getByTestId("router-search").textContent).toBe("?id=work-existing-1");
    expect(screen.getByTestId("studio-publish-persistence-summary").textContent).toContain(
      "버전 #4까지 저장됨",
    );
  });
});
