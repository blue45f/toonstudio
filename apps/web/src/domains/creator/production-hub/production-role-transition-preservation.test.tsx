// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";

import { StudioReviewPanel } from "../studio-shell/StudioReviewPanel";
import { ProductionGrandAtelierCollabHub } from "./ProductionGrandAtelierCollabHub";
import { ProductionReviewWorkspace } from "./ProductionReviewWorkspace";
import type { ProductionClientCommand, ProductionProjectRecord } from "./production-api";
import { createProductionDemoProject } from "./production-demo";
import { describeSharedCanvasRevalidationNotice } from "./production-role-transition-model";
import { useProductionProjectSession } from "./use-production-project-session";

const sessionMocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  revision: 1,
  actor: "user-editor" as string | null,
  listeners: new Set<() => void>(),
}));

vi.mock("./production-api", () => ({
  getProductionProject: sessionMocks.load,
  executeProductionCommand: sessionMocks.save,
  recoverProductionCommand: (
    projectId: string,
    request: { expectedRevision: number; command: unknown; mutationId: string },
  ) => sessionMocks.save(projectId, request.expectedRevision, request.command, request.mutationId),
}));

vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthSessionRevision: () => sessionMocks.revision,
  getAuthSession: () => (sessionMocks.actor ? { user: { id: sessionMocks.actor } } : null),
  listeners: sessionMocks.listeners,
}));

vi.mock("@/platform/api", () => ({
  httpStatus: (error: { status?: number }) => error?.status,
  getApiErrorMessage: async (error: Error, fallback: string) => error.message || fallback,
}));

const EDITOR_ACCESS = {
  view: true,
  comment: true,
  edit: true,
  manage: false,
  owner: false,
  role: "editor" as const,
};

const COMMENTER_ACCESS = {
  view: true,
  comment: true,
  edit: false,
  manage: false,
  owner: false,
  role: "commenter" as const,
};

const VIEWER_ACCESS = {
  view: true,
  comment: false,
  edit: false,
  manage: false,
  owner: false,
  role: "viewer" as const,
};

const demoAdapter = {
  create: () => createProductionDemoProject(),
  reduce: (current: ProductionProjectRecord["aggregate"]) => ({
    ...current,
    revision: current.revision + 1,
  }),
};

describe("Item 23: 역할이 바뀐 사용자가 이미 열어둔 편집·검수 화면 보존 및 권한 규칙 유지", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    useI18n.setState({ lang: "ko" });
    sessionMocks.actor = "user-editor";
    sessionMocks.revision = 1;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("useProductionProjectSession: 편집 중 403 발생 시 열람(view) 권한이 남아 있으면 화면을 폐기하지 않고 강등된 권한과 다음 가능한 행동을 즉시 반영하며, 열람 권한마저 회수되면 즉시 폐기한다", async () => {
    const baseAggregate = { ...createProductionDemoProject(), projectId: "project-role-23", revision: 3 };
    sessionMocks.load.mockResolvedValueOnce({ aggregate: baseAggregate, access: EDITOR_ACCESS });

    const { result } = renderHook(() =>
      useProductionProjectSession("project-role-23", "user-editor", demoAdapter, { authReady: true }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.access.edit).toBe(true);
    expect(result.current.roleTransition).toBeNull();

    // 서버에서 editor -> commenter로 강등된 상태에서 편집 전용 명령 실행 시 403 반환
    sessionMocks.save.mockRejectedValueOnce(Object.assign(new Error("편집 권한이 없습니다."), { status: 403 }));
    sessionMocks.load.mockResolvedValueOnce({ aggregate: baseAggregate, access: COMMENTER_ACCESS });

    const editCommand: ProductionClientCommand = { type: "upsert-task", task: baseAggregate.tasks[0]! };
    await act(async () => {
      await expect(result.current.executeStrict(editCommand, "저장")).rejects.toThrow(/검수·댓글 참여자/);
    });

    // 열람 권한(view: true)이 유지되므로 프로젝트 화면이 에러로 언마운트되지 않고 강등 권한이 즉시 적용된다.
    expect(result.current.aggregate?.projectId).toBe("project-role-23");
    expect(result.current.error).toBeNull();
    expect(result.current.access.edit).toBe(false);
    expect(result.current.access.comment).toBe(true);
    expect(result.current.roleTransition?.previousRoleKo).toBe("편집 참여자");
    expect(result.current.roleTransition?.currentRoleKo).toBe("검수·댓글 참여자");
    expect(result.current.notice).toContain("컷 위치 질문·코멘트 작성은 계속할 수 있습니다");

    // 포커스 refresh()로 viewer로 추가 강등되어도 변경 역할·다음 행동이 갱신된다.
    sessionMocks.load.mockResolvedValueOnce({ aggregate: baseAggregate, access: VIEWER_ACCESS });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.access.comment).toBe(false);
    expect(result.current.access.view).toBe(true);
    expect(result.current.roleTransition?.currentRoleKo).toBe("열람 전용 참여자");

    // 이제 viewer에서는 변경 명령 자체가 기존 RBAC 규칙대로 즉시 거부된다.
    await act(async () => {
      await expect(result.current.executeStrict(editCommand, "저장")).rejects.toThrow(/프로젝트 변경 권한이 없/);
    });

    // 열람 권한 자체(view: false 또는 403)가 회수되면 즉시 프로젝트 데이터를 폐기(fail-closed)한다.
    sessionMocks.load.mockRejectedValueOnce(Object.assign(new Error("접근 권한 회수"), { status: 403 }));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.aggregate).toBeNull();
    expect(result.current.access.view).toBe(false);
  });

  it("ProductionGrandAtelierCollabHub: 작성 중인 핀 피드백·재제출 메모가 있는 상태에서 직무 전환 시 변경 역할·다음 행동을 알리고 RBAC 잠금 및 초안 복사를 지원한다", async () => {
    const clipboardSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboardSpy } });

    render(
      <MemoryRouter initialEntries={["/production"]}>
        <ProductionGrandAtelierCollabHub />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정 요청" }));
    const resubmitInput = screen.getByLabelText("협업 허브 재제출 메모") as HTMLInputElement;
    const pinInput = screen.getByLabelText("선택 좌표 핀 피드백 입력") as HTMLTextAreaElement;

    fireEvent.change(resubmitInput, { target: { value: "1컷 역광 외곽선 수정 완료 요약" } });
    fireEvent.change(pinInput, { target: { value: "말풍선 꼬리 방향 재확인 필요" } });

    // 편집자·PD 전환: 재제출 입력은 잠기지만 핀 댓글은 활성 유지
    fireEvent.click(screen.getByTestId("collab-role-editor-pd"));
    const bannerAfterPd = screen.getByTestId("collab-hub-role-transition-banner");
    expect(bannerAfterPd.textContent).toContain("총괄 작가 → 편집자 · 담당 PD");
    expect(bannerAfterPd.textContent).toContain("좌표 핀 댓글 작성");
    expect(resubmitInput.disabled).toBe(true);
    expect(resubmitInput.value).toBe("1컷 역광 외곽선 수정 완료 요약");
    expect(pinInput.disabled).toBe(false);
    expect(pinInput.value).toBe("말풍선 꼬리 방향 재확인 필요");

    // 외부 열람자 전환: 핀 댓글도 잠기지만 두 작성 내용은 모두 보존되고 1클릭 복사가 가능
    fireEvent.click(screen.getByTestId("collab-role-external-viewer"));
    const bannerAfterViewer = screen.getByTestId("collab-hub-role-transition-banner");
    expect(bannerAfterViewer.textContent).toContain("편집자 · 담당 PD → 외부 열람자");
    expect(bannerAfterViewer.textContent).toContain("남은 작성 내용 복사");
    expect(pinInput.disabled).toBe(true);
    expect(pinInput.value).toBe("말풍선 꼬리 방향 재확인 필요");
    expect(resubmitInput.value).toBe("1컷 역광 외곽선 수정 완료 요약");

    fireEvent.click(screen.getByTestId("collab-hub-copy-preserved-draft"));
    await waitFor(() => expect(clipboardSpy).toHaveBeenCalledTimes(1));
    expect(clipboardSpy.mock.calls[0]?.[0]).toContain("말풍선 꼬리 방향 재확인 필요");
    expect(clipboardSpy.mock.calls[0]?.[0]).toContain("1컷 역광 외곽선 수정 완료 요약");
  });

  it("StudioReviewPanel & ProductionReviewWorkspace: 역할이 바뀌어도 입력 중인 초안을 지우지 않고 역할 변경 배너와 초안 복사를 제공한다", async () => {
    const clipboardSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: clipboardSpy } });

    render(<StudioReviewPanel projectId="project-role-studio-23" locale="ko" />);
    const studioBody = screen.getByLabelText("검토 내용") as HTMLTextAreaElement;
    fireEvent.change(studioBody, { target: { value: "2컷 배경 투시선 보정 메모" } });

    fireEvent.click(screen.getByTestId("review-role-viewer"));
    expect(studioBody.disabled).toBe(true);
    expect(studioBody.value).toBe("2컷 배경 투시선 보정 메모");
    const studioBanner = screen.getByTestId("studio-review-role-transition-banner");
    expect(studioBanner.textContent).toContain("원고 편집자 → 열람 전용 게스트");
    fireEvent.click(screen.getByTestId("studio-review-copy-preserved-draft"));
    await waitFor(() => expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining("2컷 배경 투시선 보정 메모")));

    cleanup();

    const aggregate = createProductionDemoProject();
    const { rerender } = render(
      <MemoryRouter>
        <ProductionReviewWorkspace
          aggregate={aggregate}
          execute={vi.fn(async () => undefined)}
          canEdit={true}
          roleLens="producer"
        />
      </MemoryRouter>,
    );
    const questionBox = screen.getByLabelText("검수 질문") as HTMLTextAreaElement;
    fireEvent.change(questionBox, { target: { value: "cut-12-001 톤 밀도 확인 질문 초안" } });

    rerender(
      <MemoryRouter>
        <ProductionReviewWorkspace
          aggregate={aggregate}
          execute={vi.fn(async () => undefined)}
          canEdit={false}
          roleLens="art"
        />
      </MemoryRouter>,
    );

    expect(questionBox.disabled).toBe(true);
    expect(questionBox.value).toBe("cut-12-001 톤 밀도 확인 질문 초안");
    const prodBanner = screen.getByTestId("production-role-transition-banner");
    expect(prodBanner.textContent).toContain("PD·편집자 → 그림 작가");
    fireEvent.click(screen.getByTestId("production-copy-preserved-draft"));
    await waitFor(() =>
      expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining("cut-12-001 톤 밀도 확인 질문 초안")),
    );
  });

  it("describeSharedCanvasRevalidationNotice: 공동 캔버스 포커스 재검증 시 역할 변화가 없으면 중복 알림을 생략하고, 강등·승격 시 정확한 다음 행동을 안내한다", () => {
    expect(
      describeSharedCanvasRevalidationNotice(
        { role: "commenter", access: "comment" },
        { role: "commenter", access: "comment" },
        true,
      ),
    ).toBeNull();

    const toCommenter = describeSharedCanvasRevalidationNotice(
      { role: "editor", access: "edit" },
      { role: "commenter", access: "comment" },
      true,
    );
    expect(toCommenter).toContain("검토 전용 권한으로 변경되었습니다");
    expect(toCommenter).toContain("댓글 핀과 답글");
    expect(toCommenter).toContain("JSON·이미지로 내보내 보존");

    const toViewer = describeSharedCanvasRevalidationNotice(
      { role: "editor", access: "edit" },
      { role: "viewer", access: "view" },
      false,
    );
    expect(toViewer).toContain("팀 편집 권한이 회수되었습니다");
    expect(toViewer).toContain("JSON·이미지로 내보낼 수 있지만 서버에는 저장할 수 없어요");

    const toEditor = describeSharedCanvasRevalidationNotice(
      { role: "commenter", access: "comment" },
      { role: "editor", access: "edit" },
      true,
    );
    expect(toEditor).toContain("공동 편집 권한으로 변경되었습니다");
  });
});
