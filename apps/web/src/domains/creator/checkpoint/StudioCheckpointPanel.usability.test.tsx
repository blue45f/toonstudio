// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CHECKPOINT_LIMIT, type StudioCheckpoint } from "../studio-checkpoints";
import { parseStudioProjectFile, type StudioProjectFile } from "../studio-project-file";
import { diffStudioProjectRevisions } from "../studio-revision-diff";
import type { StudioServerRevisionComparison } from "../studio-server-revision-comparison";
import {
  StudioCheckpointPanel,
  type StudioCheckpointPanelProps,
  type StudioServerRevisionSummary,
} from "../StudioCheckpointPanel";

const getWorkRevisionComparisonMock = vi.fn();
const runStudioRevisionComparisonMock = vi.fn();

vi.mock("@/platform/creator-client", () => ({
  getWorkRevisionComparison: (...args: unknown[]) => getWorkRevisionComparisonMock(...args),
}));

vi.mock("../studio-revision-compare-worker-client", () => ({
  runStudioRevisionComparison: (...args: unknown[]) => runStudioRevisionComparisonMock(...args),
}));

function syntheticProject(title: string, dialogue = "합성 테스트 대사"): StudioProjectFile {
  return parseStudioProjectFile({
    version: 2,
    title,
    pagesList: [
      {
        id: "page-1",
        name: "1컷 오프닝",
        elements: [{ id: "el-1", type: "text", text: dialogue, x: 12 }],
        bg: "#ffffff",
        bgGrad: null,
        canvasH: 1800,
      },
      {
        id: "page-2",
        name: "2컷 전개",
        elements: [],
        bg: "#ffffff",
        bgGrad: null,
        canvasH: 1800,
      },
    ],
  });
}

function syntheticCheckpoint(
  id: string,
  name: string,
  createdAt: string,
  pageCount = 2,
): StudioCheckpoint {
  return {
    id,
    name,
    createdAt,
    payload: {
      version: 2,
      title: "합성 원고",
      pagesList: Array.from({ length: pageCount }, (_, index) => ({
        id: `page-${index + 1}`,
        elements: [],
      })),
    },
  };
}

function buildSyntheticComparison(
  baseRevision: number,
  targetRevision: number,
  localProject: StudioProjectFile,
  targetTitle = "이전 서버 원고",
): StudioServerRevisionComparison {
  const baseProject = syntheticProject("현재 서버 기준", "기준 대사");
  const targetProject = syntheticProject(targetTitle, "이전 대사");
  return {
    targetRevision,
    baseRevision,
    localToTarget: diffStudioProjectRevisions(localProject, targetProject),
    serverToLocal: diffStudioProjectRevisions(baseProject, localProject),
    publicationImpact: { statusChange: null, changedRelations: [] },
    pageLabels: { "page-1": "1컷 오프닝", "page-2": "2컷 전개" },
  };
}

function baseProps(overrides: Partial<StudioCheckpointPanelProps> = {}): StudioCheckpointPanelProps {
  return {
    open: true,
    onClose: vi.fn(),
    checkpoints: [
      syntheticCheckpoint("cp-2", "서버 r4 복원 전 (2026. 11. 11.)", "2026-11-11T05:00:00.000Z", 3),
      syntheticCheckpoint("cp-1", "1화 대사 초안", "2026-11-10T12:00:00.000Z", 2),
    ],
    error: null,
    onCreate: vi.fn(),
    onRestore: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function serverEnabledProps(
  overrides: Partial<StudioCheckpointPanelProps> = {},
): StudioCheckpointPanelProps {
  const generation = 1;
  const currentProject = syntheticProject("편집 중 원고", "수정된 대사");
  const revisions: readonly StudioServerRevisionSummary[] = [
    { revision: 4, restoredFromRevision: null, createdAt: "2026-11-11T05:30:00.000Z" },
    { revision: 3, restoredFromRevision: 1, createdAt: "2026-11-11T04:00:00.000Z" },
    { revision: 2, restoredFromRevision: null, createdAt: "2026-11-10T22:00:00.000Z" },
  ];
  return baseProps({
    serverWorkId: "synthetic-work-1",
    serverCurrentRevision: 4,
    serverRevisions: revisions,
    serverLoading: false,
    serverError: null,
    onReloadServer: vi.fn(),
    getCurrentProject: () => currentProject,
    getCurrentProjectGeneration: () => generation,
    onRestoreServer: vi.fn(async () => true),
    onNavigateServerChange: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  getWorkRevisionComparisonMock.mockReset();
  runStudioRevisionComparisonMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioCheckpointPanel · 저장 기록 이해 및 안전한 복구 선택", () => {
  it("로컬 전용 상태에서 계정 버전 비활성 사유, 보관 한도, 최신·복원 전 자동 보관·페이지 수 배지와 복원 결과 안내를 표시한다", () => {
    const fullCheckpoints = Array.from({ length: STUDIO_CHECKPOINT_LIMIT }, (_, index) =>
      syntheticCheckpoint(
        `cp-${index}`,
        index === 0 ? "서버 r3 복원 전 (자동)" : `작업 지점 ${index}`,
        "2026-11-11T05:00:00.000Z",
        index === 0 ? 4 : 2,
      ),
    );
    const props = baseProps({ checkpoints: fullCheckpoints });
    render(<StudioCheckpointPanel {...props} />);

    const statusStrip = screen.getByTestId("checkpoint-status-strip");
    expect(statusStrip.textContent).toContain(`이 기기 보관 ${STUDIO_CHECKPOINT_LIMIT}/${STUDIO_CHECKPOINT_LIMIT}개`);
    expect(statusStrip.textContent).toContain("한도 도달 · 새 저장 시 가장 오래된 기록 자동 정리");
    expect(statusStrip.textContent).toContain("계정 버전 미연결 (로그인·서버 저장 후 사용)");

    const guide = screen.getByTestId("checkpoint-mode-guide");
    expect(guide.textContent).toContain("확인 창이 먼저 열립니다");
    expect(guide.textContent).toContain("페이지는 ⌘Z 가능");

    const serverTab = screen.getByRole("tab", { name: /계정의 저장 기록/u });
    expect(serverTab.hasAttribute("disabled")).toBe(true);
    expect(serverTab.getAttribute("aria-disabled")).toBe("true");

    const list = screen.getByRole("list", { name: "저장된 그림 기록" });
    const firstRow = within(list).getAllByRole("listitem")[0];
    if (!firstRow) throw new Error("체크포인트 첫 항목 누락");
    expect(firstRow.textContent).toContain("최신 저장");
    expect(firstRow.textContent).toContain("복원 전 자동 보관");
    expect(firstRow.textContent).toContain("페이지 4개");
    expect(firstRow.textContent).toContain("복원 시 확인 창 열림 · 삭제는 영구 제거");

    // 복원/삭제 버튼은 상위 확인 경계 콜백으로 정확히 위임된다.
    fireEvent.click(within(firstRow).getByRole("button", { name: /이 시점 복원/u }));
    expect(props.onRestore).toHaveBeenCalledWith(fullCheckpoints[0]);

    const nameInput = screen.getByLabelText("기록 이름 (선택)") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /지금 상태 저장/u }));
    expect(props.onCreate).toHaveBeenCalledWith("이름 없는 저장 기록");
  });

  it("서버 연결 상태에서 기준 revision, 단계 차이, 읽기 전용 비교 안내를 보여 주고 탭 키보드 순환과 포커스 복귀를 유지한다", () => {
    const opener = document.createElement("button");
    opener.textContent = "저장 기록 열기";
    document.body.appendChild(opener);
    opener.focus();

    const props = serverEnabledProps();
    const { rerender } = render(<StudioCheckpointPanel {...props} />);

    expect(screen.getByTestId("checkpoint-status-strip").textContent).toContain("현재 서버 기준 r4");

    const localTab = screen.getByRole("tab", { name: /이 기기에 저장/u });
    const serverTab = screen.getByRole("tab", { name: /계정의 저장 기록/u });
    const collabTab = screen.getByRole("tab", { name: /협업 워크벤치/u });

    localTab.focus();
    fireEvent.keyDown(localTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(serverTab);
    expect(props.onReloadServer).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("checkpoint-mode-guide").textContent).toContain(
      "‘변경 검토’는 현재 원고를 바꾸지 않는 읽기 전용 비교",
    );
    expect(screen.getByTestId("checkpoint-mode-guide").textContent).toContain(
      "복원 확정 시 현재 편집본을 이 기기에 자동 백업",
    );

    const serverList = screen.getByRole("list", { name: "계정의 저장 기록" });
    const items = within(serverList).getAllByRole("listitem");
    const currentItem = items[0];
    const prevItem = items[1];
    const olderItem = items[2];
    if (!currentItem || !prevItem || !olderItem) throw new Error("서버 버전 목록 누락");

    expect(currentItem.textContent).toContain("현재 열려 있는 서버 기준");
    expect(within(currentItem).getByRole("button", { name: "현재 버전" }).hasAttribute("disabled")).toBe(true);
    expect(prevItem.textContent).toContain("현재 기준 대비 1단계 이전");
    expect(prevItem.textContent).toContain("r1에서 복원");
    expect(prevItem.textContent).toContain("읽기 전용 비교 후 복원 결정");
    expect(olderItem.textContent).toContain("현재 기준 대비 2단계 이전");

    fireEvent.keyDown(serverTab, { key: "End" });
    expect(document.activeElement).toBe(collabTab);
    expect(screen.getByTestId("checkpoint-mode-guide").textContent).toContain(
      "현재 원고 변경 없이 나란히 대조",
    );

    rerender(<StudioCheckpointPanel {...props} open={false} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("변경 검토 중 취소·중복 요청 정리, stale 로컬 편집 차단, 복구 잠금(닫기·탭·Esc)을 그대로 지킨다", async () => {
    let generation = 10;
    const localProject = syntheticProject("편집 중 원고", "수정된 대사");
    let resolveRestore: ((value: boolean) => void) | null = null;
    const onRestoreServer = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRestore = resolve;
        }),
    );

    let firstAttemptSignal: AbortSignal | undefined;
    getWorkRevisionComparisonMock.mockImplementationOnce(
      (_workId: string, _revision: number, signal?: AbortSignal) => {
        firstAttemptSignal = signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        });
      },
    );
    getWorkRevisionComparisonMock.mockImplementationOnce(
      (_workId: string, _revision: number, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            const abortError = new Error("Aborted");
            abortError.name = "AbortError";
            reject(abortError);
          });
        }),
    );

    const props = serverEnabledProps({
      getCurrentProject: () => localProject,
      getCurrentProjectGeneration: () => generation,
      onRestoreServer,
    });
    const { rerender } = render(<StudioCheckpointPanel {...props} />);

    // 서버 탭 진입 후 r3 비교 시작 -> Esc로 비교를 취소하면 AbortSignal이 즉시 중단되고 패널은 닫히지 않는다.
    fireEvent.click(screen.getByRole("tab", { name: /계정의 저장 기록/u }));
    const firstReviewButton = screen.getAllByRole("button", { name: "변경 검토" })[0];
    if (!firstReviewButton) throw new Error("변경 검토 버튼 누락");
    fireEvent.click(firstReviewButton);

    await waitFor(() => {
      expect(screen.getByText(/두 버전을 안전하게 비교하는 중/u)).toBeTruthy();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(firstAttemptSignal?.aborted).toBe(true);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("list", { name: "계정의 저장 기록" })).toBeTruthy();

    // 정상 비교 응답(합성 mock) 준비
    getWorkRevisionComparisonMock.mockImplementation(async (_workId: string, revision: number) => ({
      revision,
      snapshot: syntheticProject(revision === 4 ? "현재 서버 기준" : "과거 서버 r2"),
    }));
    runStudioRevisionComparisonMock.mockImplementation(async () =>
      buildSyntheticComparison(4, 2, localProject),
    );

    const secondReviewButton = screen.getAllByRole("button", { name: "변경 검토" })[1];
    if (!secondReviewButton) throw new Error("두 번째 변경 검토 버튼 누락");
    fireEvent.click(secondReviewButton);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /이 버전 복원/u })).toBeTruthy();
    });

    // 1) 비교 완료 후 로컬 세대(generation)가 바뀌면 복원을 차단하고 경고를 유지한다.
    fireEvent.click(screen.getByRole("button", { name: /이 버전 복원/u }));
    expect(screen.getByText(/정말 서버 버전 r2를 현재 버전으로 복원할까요/u)).toBeTruthy();
    generation = 11;
    fireEvent.click(screen.getByRole("button", { name: "r2 복원 확정" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("변경 검토 후 편집본이 달라졌어요");
    });
    expect(onRestoreServer).not.toHaveBeenCalled();

    // 2) 다시 비교한 뒤 실제 복원 중에는 복구 잠금 배지가 표시되고 닫기·탭 전환·Esc가 모두 잠긴다.
    fireEvent.click(screen.getByRole("button", { name: /다시 비교/u }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /이 버전 복원/u })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /이 버전 복원/u }));
    fireEvent.click(screen.getByRole("button", { name: "r2 복원 확정" }));

    await waitFor(() => {
      expect(screen.getByText(/복원 적용 중 · 안전을 위해 닫기·탭 이동 잠금/u)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "저장 기록 닫기" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("tab", { name: /이 기기에 저장/u }).hasAttribute("disabled")).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).not.toHaveBeenCalled();

    // 복원 도중 serverCurrentRevision이 갱신돼도 serverRestoreBusy 동안은 강제 리셋되지 않다가 완료 후 해제된다.
    rerender(<StudioCheckpointPanel {...props} serverCurrentRevision={5} />);
    resolveRestore?.(true);
    await waitFor(() => {
      expect(screen.queryByText(/복원 적용 중 · 안전을 위해 닫기·탭 이동 잠금/u)).toBeNull();
    });
  });
});
