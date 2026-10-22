// @vitest-environment jsdom

/**
 * 면 모델링 훅의 확정(apply) 생애주기: 패널의 실행 큐가 하는 일(편집 함수를 한 번 부르고, 던진 예외는 작업 기록에만
 * 남기고, 끝나면 busy 를 내림)을 시험에서 그대로 흉내 내어, 화면이 알리는 문장이 실제로 일어난 일과 맞는지 본다.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccFaceModeling } from "./useStudioHybridDccFaceModeling";

import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";

/** 확정 단계에서 던질 오류. null 이면 실제 확정을 그대로 부른다. */
const forced: { error: unknown } = { error: null };
vi.mock("./studio-hybrid-dcc-face-modeling-workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-hybrid-dcc-face-modeling-workspace")>();
  return {
    ...actual,
    commitStudioHybridDccFaceModeling: (...args: Parameters<typeof actual.commitStudioHybridDccFaceModeling>) => {
      if (forced.error) throw forced.error;
      return actual.commitStudioHybridDccFaceModeling(...args);
    },
  };
});

beforeEach(() => {
  forced.error = null;
});
afterEach(cleanup);

interface PanelState {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: StudioHybridDccComponentSelection;
  readonly busy: boolean;
}

function faceSelection(workspace: StudioHybridDccWorkspace, faceId: number): StudioHybridDccComponentSelection {
  const selection = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids: [faceId],
    activeId: faceId,
    source: workspaceComponentSelectionSource(workspace)!,
  });
  if (!selection.ok) throw new Error("selection");
  return selection.value;
}

function setup() {
  const workspace = workspaceAddUnitCube(createStudioHybridDccWorkspace("face-modeling-apply"), "cube");
  const selection = faceSelection(workspace, 3);
  const requests: { label: string; edit: StudioHybridDccWorkspaceEdit }[] = [];
  const run = (label: string, edit: StudioHybridDccWorkspaceEdit) => {
    requests.push({ label, edit });
  };
  const view = renderHook(
    (state: PanelState) => useStudioHybridDccFaceModeling(
      { workspace: state.workspace, componentSelection: state.selection, editingDisabled: state.busy, onSelectAsset: () => undefined },
      run,
    ),
    { initialProps: { workspace, selection, busy: false } as PanelState },
  );
  act(() => view.result.current.setOpen(true));
  act(() => view.result.current.setText("0.3"));
  const idle: PanelState = { workspace, selection, busy: false };
  return { view, requests, idle, workspace, selection };
}

/** 패널의 `run`: 편집 함수를 한 번 부르고 던진 예외는 삼킨다. busy 는 호출하는 쪽이 올리고 내린다. */
function runLikePanel(edit: StudioHybridDccWorkspaceEdit, state: PanelState) {
  try {
    return edit(state.workspace, state.selection);
  } catch {
    return null;
  }
}

describe("면 모델링 훅: 확정이 동기로 실패하는 경우", () => {
  it("문서 명령 크기 한도를 넘으면 메시가 너무 크다고 알리고, 미리보기와 입력을 남겨 다시 시도하게 한다", () => {
    const { view, requests, idle } = setup();
    expect(view.result.current.canApply).toBe(true);
    forced.error = Object.assign(new Error("Command JSON exceeds its configured byte budget."), { code: "PAYLOAD_TOO_LARGE" });
    act(() => view.result.current.apply());
    expect(requests).toHaveLength(1);
    // 패널은 같은 묶음 안에서 busy 를 올렸다 내리므로 화면은 busy 를 한 번도 보지 못한다.
    act(() => { runLikePanel(requests[0]!.edit, idle); });
    const model = view.result.current;
    expect(model.committing).toBe(false);
    expect(model.engaged).toBe(true);
    expect(model.text).toBe("0.3");
    expect(model.notice).toContain("메시가 너무 커서");
    expect(model.notice).toContain("다시 시도");
    expect(model.notice).not.toContain("적용을 요청");
    expect(model.canApply).toBe(true);
    // 실패한 요청이 "확정 중" 상태로 남아 있지 않다: 다른 작업이 busy 가 되어도 확정 중으로 보이지 않는다.
    view.rerender({ ...idle, busy: true });
    expect(view.result.current.committing).toBe(false);
    expect(view.result.current.hint).toContain("다른 편집이 끝나면");
    view.rerender(idle);
    // 원인을 고쳐 다시 누르면 같은 입력으로 적용된다.
    forced.error = null;
    act(() => view.result.current.apply());
    expect(requests).toHaveLength(2);
    expect(view.result.current.notice).toContain("적용하는 중");
  });

  it("그 밖의 예외는 일반 실패 안내와 다음 행동을 알리고 예외는 패널로 다시 던진다", () => {
    const { view, requests, idle } = setup();
    forced.error = new Error("boom");
    act(() => view.result.current.apply());
    let thrown: unknown = null;
    act(() => {
      try {
        requests[0]!.edit(idle.workspace, idle.selection);
      } catch (error) {
        thrown = error;
      }
    });
    expect(thrown).toBe(forced.error);
    expect(view.result.current.notice).toContain("적용하지 못했어요");
    expect(view.result.current.notice).toContain("작업 기록");
    expect(view.result.current.engaged).toBe(true);
  });

  it("확정 단계에서 계획이 거부되면(선택이 어긋남) 이유 코드에 맞는 문장을 알린다", () => {
    const { view, requests, workspace } = setup();
    act(() => view.result.current.apply());
    // 편집 함수가 받은 선택이 비어 있는 경우(그 사이 선택이 풀림).
    act(() => {
      try {
        requests[0]!.edit(workspace, createStudioHybridDccComponentSelection());
      } catch {
        // 패널이 삼키는 예외.
      }
    });
    expect(view.result.current.notice).toContain("면을 하나 이상 선택");
    expect(view.result.current.canApply).toBe(true);
  });
});

describe("면 모델링 훅: 패널이 다른 작업 중일 때와 확정 중", () => {
  it("다른 작업이 busy 인 동안에는 적용을 막고 이유를 알리며, 끝나면 다시 열린다", () => {
    const { view, requests, idle } = setup();
    expect(view.result.current.canApply).toBe(true);
    view.rerender({ ...idle, busy: true });
    expect(view.result.current.committing).toBe(false);
    expect(view.result.current.canApply).toBe(false);
    expect(view.result.current.hint).toContain("다른 편집이 끝나면");
    // 패널은 busy 중의 요청을 조용히 버리므로, 훅은 요청 자체를 내지 않는다.
    act(() => view.result.current.apply());
    expect(requests).toHaveLength(0);
    expect(view.result.current.notice).not.toContain("적용");
    view.rerender(idle);
    expect(view.result.current.canApply).toBe(true);
    expect(view.result.current.hint).toBeNull();
    expect(view.result.current.engaged).toBe(true);
  });

  it("확정이 진행되는 동안에는 입력·핸들·단계 이동이 잠기고, 끝나면 적용했다고 알린다", () => {
    const { view, requests, idle } = setup();
    act(() => view.result.current.apply());
    view.rerender({ ...idle, busy: true });
    expect(view.result.current.committing).toBe(true);
    expect(view.result.current.notice).toContain("적용하는 중");
    act(() => view.result.current.setText("0.31"));
    act(() => view.result.current.setHandleValue(0.5));
    act(() => view.result.current.step(1, "normal"));
    act(() => view.result.current.beginDrag());
    expect(view.result.current.text).toBe("0.3");
    expect(view.result.current.dragging).toBe(false);
    expect(view.result.current.notice).toContain("적용하는 중");
    expect(view.result.current.canApply).toBe(false);
    // 같은 요청은 한 번만 나간다.
    act(() => view.result.current.apply());
    expect(requests).toHaveLength(1);
    // 확정이 끝나 문서가 바뀌면 입력이 닫히고 적용했다고 알린다(취소했다고 하지 않는다).
    const result = requests[0]!.edit(idle.workspace, idle.selection);
    view.rerender({ workspace: result.workspace, selection: result.selection ?? idle.selection, busy: false });
    expect(view.result.current.engaged).toBe(false);
    expect(view.result.current.text).toBe("");
    expect(view.result.current.notice).toContain("적용했어요");
    expect(view.result.current.notice).not.toContain("취소");
  });

  it("확정을 요청한 뒤 선택만 바뀌고 문서가 그대로면 적용했다고 하지 않고 취소했다고 알린다", () => {
    const { view, idle, workspace } = setup();
    act(() => view.result.current.apply());
    view.rerender({ ...idle, busy: true });
    expect(view.result.current.committing).toBe(true);
    view.rerender({ workspace, selection: faceSelection(workspace, 0), busy: false });
    expect(view.result.current.engaged).toBe(false);
    expect(view.result.current.notice).toContain("미리보기를 취소했어요");
    expect(view.result.current.notice).not.toContain("적용했어요");
  });

  it("점이 최대 개수일 때 확정 중에는 점 개수 한도 안내가 확정 중 안내를 덮어쓰지 않는다", () => {
    const { view, idle } = setup();
    act(() => view.result.current.setTool("draw"));
    for (let index = 0; index < 64; index += 1) {
      const angle = (index / 64) * Math.PI * 2;
      act(() => view.result.current.addDrawPoint([Math.cos(angle) * 0.3, Math.sin(angle) * 0.3]));
    }
    expect(view.result.current.drawPoints).toHaveLength(64);
    act(() => view.result.current.addDrawPoint([0, 0]));
    expect(view.result.current.notice).toContain("최대 64개");
    expect(view.result.current.canApply).toBe(true);
    act(() => view.result.current.apply());
    view.rerender({ ...idle, busy: true });
    expect(view.result.current.notice).toContain("적용하는 중");
    act(() => view.result.current.addDrawPoint([0, 0]));
    expect(view.result.current.notice).toContain("적용하는 중");
  });

  it("확정 중에는 면 그리기 점도 더하거나 지울 수 없다", () => {
    const { view, requests, idle } = setup();
    act(() => view.result.current.setTool("draw"));
    for (const point of [[-0.2, -0.2], [0.2, -0.2], [0, 0.2]] as const) act(() => view.result.current.addDrawPoint([point[0], point[1]]));
    expect(view.result.current.drawPoints).toHaveLength(3);
    expect(view.result.current.canApply).toBe(true);
    act(() => view.result.current.apply());
    view.rerender({ ...idle, busy: true });
    expect(requests).toHaveLength(1);
    act(() => view.result.current.addDrawPoint([0.1, 0.1]));
    act(() => view.result.current.removeLastDrawPoint());
    expect(view.result.current.drawPoints).toHaveLength(3);
  });

  it("문서가 그대로인 채 확정 요청이 끝나면 일반 실패 안내를 하고 미리보기를 남긴다", () => {
    const { view, idle } = setup();
    act(() => view.result.current.apply());
    view.rerender({ ...idle, busy: true });
    expect(view.result.current.committing).toBe(true);
    view.rerender(idle);
    expect(view.result.current.notice).toContain("적용하지 못했어요");
    expect(view.result.current.engaged).toBe(true);
    expect(view.result.current.canApply).toBe(true);
  });
});
