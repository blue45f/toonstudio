// @vitest-environment jsdom

/**
 * 면 모델링 작업대(훅 + 화면): 실제 작업공간·실제 커널을 그대로 쓰고 패널의 실행기만 흉내 낸다.
 * 거리 입력/핸들/키보드/Esc/그리기 패드가 미리보기와 확정(되돌리기 한 단위)에 어떻게 이어지는지 본다.
 */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { StudioHybridDccFaceModelingTools } from "./StudioHybridDccFaceModelingTools";
import { useStudioHybridDccFaceModeling, type StudioHybridDccFaceModelingHost } from "./useStudioHybridDccFaceModeling";

import type { StudioHybridDccWorkspaceEdit } from "./studio-hybrid-dcc-face-modeling-workspace";
import type { StudioHybridDccViewportProps } from "./StudioHybridDccViewportCore";

const TOP = 3;

function cubeWorkspace(): StudioHybridDccWorkspace {
  return workspaceAddUnitCube(createStudioHybridDccWorkspace("face-modeling-ui"), "cube");
}

function selectionOf(
  workspace: StudioHybridDccWorkspace,
  ids: readonly number[],
  mode: "face" | "object" = "face",
): StudioHybridDccComponentSelection {
  if (mode === "object") return createStudioHybridDccComponentSelection();
  const source = workspaceComponentSelectionSource(workspace);
  if (!source) throw new Error("no active mesh");
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode,
    operation: "replace",
    ids,
    activeId: ids.at(-1),
    source,
  });
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(" · "));
  return result.value;
}

/** 하네스가 밖(시험 본문)으로 내보내는 최신 상태. 속성을 직접 바꾸지 않고 메서드로만 갱신한다. */
class Latest {
  workspace: StudioHybridDccWorkspace;
  selection: StudioHybridDccComponentSelection;
  readonly runs: string[] = [];
  constructor(workspace: StudioHybridDccWorkspace, selection: StudioHybridDccComponentSelection) {
    this.workspace = workspace;
    this.selection = selection;
  }
  report(workspace: StudioHybridDccWorkspace, selection: StudioHybridDccComponentSelection) {
    this.workspace = workspace;
    this.selection = selection;
  }
  ran(label: string) {
    this.runs.push(label);
  }
}

interface HarnessOptions {
  readonly selectedFaces?: readonly number[];
  readonly selectionMode?: "face" | "object";
  readonly readOnly?: boolean;
  readonly sculpt?: boolean;
  /** 패널처럼 실행이 끝날 때까지 편집을 잠그는 비동기 실행기. */
  readonly asyncRun?: boolean;
  /** 실행이 끝나도 문서를 바꾸지 못한 경우(패널은 실패를 기록에만 남긴다). */
  readonly failRun?: boolean;
}

function Harness({ latest, options }: { readonly latest: Latest; readonly options: HarnessOptions }) {
  const [workspace, setWorkspace] = useState(() => latest.workspace);
  const [selection, setSelection] = useState(() => latest.selection);
  const [busy, setBusy] = useState(false);
  const run: StudioHybridDccFaceModelingHost["onRunWorkspaceEdit"] = options.readOnly
    ? undefined
    : (label: string, edit: StudioHybridDccWorkspaceEdit) => {
      latest.ran(label);
      const result = edit(workspace, selection);
      const finish = () => {
        if (!options.failRun) {
          setWorkspace(result.workspace);
          if (result.selection) setSelection(result.selection);
        }
        setBusy(false);
      };
      if (options.asyncRun) {
        setBusy(true);
        queueMicrotask(() => queueMicrotask(() => act(finish)));
      } else {
        finish();
      }
    };
  const props: StudioHybridDccViewportProps = {
    workspace,
    componentSelection: selection,
    editingDisabled: busy,
    onSelectAsset: () => undefined,
    ...(options.sculpt ? { onSculptStroke: () => undefined } : {}),
  };
  const model = useStudioHybridDccFaceModeling(props, run);
  useEffect(() => {
    latest.report(workspace, selection);
  });
  const shown = model.viewportProps.workspace.session.state.geometry.records.cube!;
  return (
    <div>
      <div
        data-testid="viewport"
        data-mesh-hash={shown.meshHash}
        data-faces={shown.mesh.faces.length}
        data-editing-disabled={String(model.viewportProps.editingDisabled ?? false)}
        data-selected={model.viewportProps.componentSelection?.elementIds.join(",") ?? ""}
      />
      <button type="button" onClick={() => setSelection(selectionOf(workspace, [0]))}>다른 면 선택</button>
      <StudioHybridDccFaceModelingTools model={model} />
    </div>
  );
}

function setup(options: HarnessOptions = {}) {
  const workspace = cubeWorkspace();
  const selection = selectionOf(workspace, options.selectedFaces ?? [TOP], options.selectionMode ?? "face");
  const latest = new Latest(workspace, selection);
  render(<Harness latest={latest} options={options} />);
  return {
    latest,
    originalHash: workspace.session.state.geometry.records.cube!.meshHash,
    originalUndoDepth: workspace.session.undoStack.length,
  };
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u }));
  return screen.getByRole("region", { name: "면 모델링 작업대" });
}

function viewport() {
  return screen.getByTestId("viewport");
}

function chooseTool(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

function distanceField(): HTMLInputElement {
  return screen.getByRole("textbox", { name: "거리 (m)" });
}

function type(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

function rect(element: Element, box: { left: number; top: number; width: number; height: number }) {
  element.getBoundingClientRect = () => ({
    ...box,
    right: box.left + box.width,
    bottom: box.top + box.height,
    x: box.left,
    y: box.top,
    toJSON: () => ({}),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("면 모델링 작업대: 접힘·도구·상태 이름", () => {
  it("처음에는 접혀 있어 알림·핸들·입력칸이 없고 뷰포트는 원본을 그대로 그린다", () => {
    const { originalHash } = setup();
    const toggle = screen.getByRole("button", { name: /^면 모델링 · 밀기\/당기기/u });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(viewport().getAttribute("data-editing-disabled")).toBe("false");
  });

  it("열면 도구 이름·상태·거리칸·단위·부호 규칙·핸들 범위를 접근 가능한 이름으로 보여 준다", () => {
    setup();
    const section = open();
    expect(within(section).getByRole("button", { name: /^면 모델링 · / }).getAttribute("aria-expanded")).toBe("true");
    const radios = within(section).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual(["push-pull", "inset", "offset", "draw"]);
    expect(screen.getByRole("radio", { name: "밀기/당기기" })).toHaveProperty("checked", true);
    for (const name of ["안쪽 테두리", "오프셋", "면 그리기"]) {
      expect(screen.getByRole("radio", { name })).toHaveProperty("checked", false);
    }
    const state = section.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!;
    expect(state.textContent).toContain("도구 밀기/당기기");
    expect(state.textContent).toContain("선택한 면 1개");
    expect(state.textContent).toContain("상태 대기");
    expect(state.getAttribute("data-state")).toBe("idle");

    const field = distanceField();
    expect(field.value).toBe("");
    expect(field.getAttribute("aria-invalid")).toBeNull();
    expect(section.textContent).toContain("양수는 바깥쪽(법선 방향)으로 밀고, 음수는 안쪽으로 당깁니다.");
    expect(section.textContent).toContain("허용 범위");
    expect(section.textContent).toContain("단위를 생략하면 m입니다. 예: 0.25 · 25cm · 250mm");
    expect(section.textContent).toContain("Esc로 취소");
    const slider = screen.getByRole("slider", { name: "거리 핸들" });
    // 윗면을 아래로 끝까지 당기면 마주 보는 면과 만나므로 한 변(1 m)보다 조금 덜 당길 수 있다.
    expect(Number(slider.getAttribute("aria-valuemin"))).toBeGreaterThan(-1);
    expect(Number(slider.getAttribute("aria-valuemin"))).toBeLessThan(-0.99);
    expect(Number(slider.getAttribute("aria-valuemax"))).toBeGreaterThan(1);
    expect(slider.getAttribute("aria-valuenow")).toBe("0");
    expect(slider.getAttribute("aria-valuetext")).toBe("0 m");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "취소" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("안쪽 테두리·오프셋은 음수 불가를 안내하고 오프셋만 방향 선택이 있다", () => {
    setup();
    const section = open();
    chooseTool("안쪽 테두리");
    expect(section.textContent).toContain("0보다 큰 값만 입력할 수 있습니다. 음수는 쓸 수 없습니다.");
    expect(screen.queryByRole("radio", { name: "바깥쪽" })).toBeNull();
    chooseTool("오프셋");
    expect(screen.getByRole("radio", { name: "안쪽" })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "바깥쪽" })).toHaveProperty("checked", false);
    expect(screen.getByRole("slider", { name: "거리 핸들" }).getAttribute("aria-valuemin")).toBe("0");
  });
});

describe("면 모델링 작업대: 거리 입력과 미리보기", () => {
  it("거리를 입력하면 뷰포트에만 결과가 보이고 문서·되돌리기 기록은 그대로다", () => {
    const { latest, originalHash, originalUndoDepth } = setup();
    open();
    type(distanceField(), "25cm");

    expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);
    expect(viewport().getAttribute("data-editing-disabled")).toBe("true");
    expect(latest.workspace.session.state.geometry.records.cube!.meshHash).toBe(originalHash);
    expect(latest.workspace.session.undoStack).toHaveLength(originalUndoDepth);
    expect(latest.runs).toEqual([]);
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("previewing");
    expect(screen.getByRole("status").textContent).toMatch(/^면 6개 → 6개 · 방식: 기존 옆면 늘이기$/u);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("button", { name: "취소" }).getAttribute("aria-disabled")).toBeNull();
  });

  it("Enter로 확정하면 되돌리기 한 번에 원래 메시로 돌아가고 미리보기는 사라진다", () => {
    const { latest, originalHash, originalUndoDepth } = setup();
    open();
    const field = distanceField();
    type(field, "0.3");
    const previewHash = viewport().getAttribute("data-mesh-hash");
    fireEvent.keyDown(field, { key: "Enter" });

    expect(latest.runs).toEqual(["면 밀기/당기기"]);
    expect(latest.workspace.session.undoStack).toHaveLength(originalUndoDepth + 1);
    expect(latest.workspace.session.state.geometry.records.cube!.meshHash).toBe(previewHash);
    expect(viewport().getAttribute("data-mesh-hash")).toBe(previewHash);
    expect(viewport().getAttribute("data-editing-disabled")).toBe("false");
    expect(distanceField().value).toBe("");
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("idle");
    expect(screen.getByRole("status").textContent).toContain("적용했어요");
    // 확정한 결과 위에서 선택은 새 메시 기준 면 선택으로 이어진다.
    expect(viewport().getAttribute("data-selected")).not.toBe("");

    const undone = workspaceUndo(latest.workspace);
    expect(undone.session.state.geometry.records.cube!.meshHash).toBe(originalHash);
  });

  it("적용 버튼으로도 확정하고 확정 뒤 포커스는 거리칸으로 돌아온다", () => {
    const { latest } = setup();
    open();
    type(distanceField(), "0.2");
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(latest.runs).toEqual(["면 밀기/당기기"]);
    expect(document.activeElement).toBe(distanceField());
  });

  it("Esc는 대화상자의 닫기보다 먼저 받아 미리보기만 취소한다(미리보기가 없으면 건드리지 않는다)", () => {
    const { originalHash } = setup();
    open();
    const dialogEscape = vi.fn();
    document.addEventListener("keydown", dialogEscape, true);
    try {
      // 미리보기가 없을 때: 그대로 통과해 대화상자가 처리할 수 있다.
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(dialogEscape).toHaveBeenCalledTimes(1);

      type(distanceField(), "0.4");
      expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);
      dialogEscape.mockClear();
      const notCancelled = fireEvent.keyDown(document.body, { key: "Escape" });
      expect(notCancelled).toBe(false);
      expect(dialogEscape).not.toHaveBeenCalled();
      expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
      expect(viewport().getAttribute("data-editing-disabled")).toBe("false");
      expect(distanceField().value).toBe("");
      expect(screen.getByRole("status").textContent).toContain("미리보기를 취소했어요");

      // 취소한 뒤에는 다시 통과한다.
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(dialogEscape).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", dialogEscape, true);
    }
  });

  it("조합 입력 중의 Esc는 가로채지 않는다", () => {
    setup();
    open();
    type(distanceField(), "0.4");
    const dialogEscape = vi.fn();
    document.addEventListener("keydown", dialogEscape, true);
    try {
      fireEvent.keyDown(document.body, { key: "Escape", isComposing: true });
      expect(dialogEscape).toHaveBeenCalledTimes(1);
      expect(distanceField().value).toBe("0.4");
    } finally {
      document.removeEventListener("keydown", dialogEscape, true);
    }
  });

  it("작업대 밖의 더 안쪽 대화상자·팝오버·입력칸에서 온 Esc는 가로채지 않아 그쪽이 먼저 받는다", () => {
    const { originalHash } = setup();
    open();
    type(distanceField(), "0.4");
    const previewHash = viewport().getAttribute("data-mesh-hash");
    expect(previewHash).not.toBe(originalHash);

    const innerDialog = document.createElement("div");
    innerDialog.setAttribute("role", "dialog");
    const dialogButton = document.createElement("button");
    innerDialog.append(dialogButton);
    const popover = document.createElement("div");
    popover.setAttribute("data-studio-escape-scope", "true");
    const popoverButton = document.createElement("button");
    popover.append(popoverButton);
    const outsideInput = document.createElement("input");
    // 알림 대화상자와 aria-modal 층(포털로 뜨는 확인창)도 Esc 의 주인이다.
    const alertDialog = document.createElement("div");
    alertDialog.setAttribute("role", "alertdialog");
    const alertButton = document.createElement("button");
    alertDialog.append(alertButton);
    const modalLayer = document.createElement("div");
    modalLayer.setAttribute("aria-modal", "true");
    const modalButton = document.createElement("button");
    modalLayer.append(modalButton);
    document.body.append(innerDialog, popover, outsideInput, alertDialog, modalLayer);
    try {
      for (const source of [dialogButton, popoverButton, outsideInput, alertButton, modalButton]) {
        const notIntercepted = fireEvent.keyDown(source, { key: "Escape" });
        expect(notIntercepted).toBe(true);
        expect(viewport().getAttribute("data-mesh-hash")).toBe(previewHash);
        expect(distanceField().value).toBe("0.4");
      }
    } finally {
      innerDialog.remove();
      popover.remove();
      outsideInput.remove();
      alertDialog.remove();
      modalLayer.remove();
    }
  });

  it("작업대 안이거나 작업대를 품은 대화상자 안(입력칸 제외)에서 온 Esc는 미리보기를 취소한다", () => {
    const { originalHash } = setup();
    open();
    // 작업대를 품은 바깥 대화상자 안에 작업대 밖 입력칸과 버튼을 둔다.
    const host = viewport().parentElement!;
    host.setAttribute("role", "dialog");
    const outsideInput = document.createElement("input");
    host.append(outsideInput);
    try {
      type(distanceField(), "0.4");
      expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);

      // 대화상자 안의 입력칸은 값 되돌리기 몫이라 양보한다.
      expect(fireEvent.keyDown(outsideInput, { key: "Escape" })).toBe(true);
      expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);

      // 같은 대화상자 안의 버튼은 작업대를 품은 층이므로 미리보기만 취소한다.
      expect(fireEvent.keyDown(screen.getByRole("button", { name: "다른 면 선택" }), { key: "Escape" })).toBe(false);
      expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);

      // 작업대 안의 입력칸에서 온 Esc도 미리보기를 취소한다.
      type(distanceField(), "0.3");
      expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);
      expect(fireEvent.keyDown(distanceField(), { key: "Escape" })).toBe(false);
      expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    } finally {
      outsideInput.remove();
      host.removeAttribute("role");
    }
  });

  it("이미 다른 곳에서 처리(preventDefault)한 Esc는 건드리지 않는다", () => {
    const { originalHash } = setup();
    // 같은 창 캡처 단계에서는 먼저 등록된 리스너가 먼저 돈다. 작업대가 열려 Esc 를 받기 전에 등록해 "먼저 처리한 쪽"을 흉내 낸다.
    const handled = (event: KeyboardEvent) => event.preventDefault();
    window.addEventListener("keydown", handled, true);
    open();
    type(distanceField(), "0.4");
    const previewHash = viewport().getAttribute("data-mesh-hash");
    expect(previewHash).not.toBe(originalHash);
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(viewport().getAttribute("data-mesh-hash")).toBe(previewHash);
      expect(distanceField().value).toBe("0.4");
    } finally {
      window.removeEventListener("keydown", handled, true);
    }
  });

  it("취소 버튼은 입력과 미리보기를 지우고 원본·기록을 그대로 둔다", () => {
    const { originalHash, latest, originalUndoDepth } = setup();
    open();
    type(distanceField(), "0.4");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(distanceField().value).toBe("");
    expect(latest.runs).toEqual([]);
    expect(latest.workspace.session.undoStack).toHaveLength(originalUndoDepth);
  });

  it("접으면 미리보기가 닫히고 Esc도 더는 가로채지 않으며 다시 열면 빈 입력이다", () => {
    const { originalHash } = setup();
    open();
    type(distanceField(), "0.4");
    fireEvent.click(screen.getByRole("button", { name: /^면 모델링 · / }));
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(screen.queryByRole("slider")).toBeNull();

    const dialogEscape = vi.fn();
    document.addEventListener("keydown", dialogEscape, true);
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(dialogEscape).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", dialogEscape, true);
    }
    open();
    expect(distanceField().value).toBe("");
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
  });

  it("선택이 바뀌면 열려 있던 미리보기를 취소했다고 알린다", () => {
    const { originalHash } = setup();
    open();
    type(distanceField(), "0.4");
    fireEvent.click(screen.getByRole("button", { name: "다른 면 선택" }));
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(distanceField().value).toBe("");
    expect(screen.getByRole("status").textContent).toContain("선택이나 오브젝트가 바뀌어 미리보기를 취소했어요");
  });

  it("도구를 바꾸면 입력과 미리보기가 초기화된다", () => {
    const { originalHash } = setup();
    open();
    type(distanceField(), "0.4");
    chooseTool("안쪽 테두리");
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(distanceField().value).toBe("");
  });

  it("실행이 끝나기 전에는 적용을 한 번만 받고 편집은 잠긴 채 미리보기를 유지한다", async () => {
    const { latest } = setup({ asyncRun: true });
    open();
    const field = distanceField();
    type(field, "0.3");
    const previewHash = viewport().getAttribute("data-mesh-hash");
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(latest.runs).toEqual(["면 밀기/당기기"]);
    expect(viewport().getAttribute("data-mesh-hash")).toBe(previewHash);
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("committing");
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("idle");
    expect(latest.workspace.session.state.geometry.records.cube!.meshHash).toBe(previewHash);
  });
});

describe("면 모델링 작업대: 적용 실패", () => {
  it("실행이 끝났는데 문서가 바뀌지 않았으면 적용하지 못했다고 알리고 미리보기를 남겨 다시 시도하게 한다", async () => {
    const { latest, originalHash } = setup({ asyncRun: true, failRun: true });
    open();
    const field = distanceField();
    type(field, "0.3");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("committing");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("status").textContent).toContain("적용하지 못했어요");
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("previewing");
    expect(latest.workspace.session.state.geometry.records.cube!.meshHash).toBe(originalHash);
    expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBeNull();
    // 같은 미리보기를 그대로 다시 적용할 수 있다.
    fireEvent.keyDown(field, { key: "Enter" });
    expect(latest.runs).toEqual(["면 밀기/당기기", "면 밀기/당기기"]);
  });
});

describe("면 모델링 작업대: 범위 검증 메시지", () => {
  it("읽을 수 없는 식은 경고로 알리고 입력칸이 오류 상태와 안내에 연결된다", () => {
    const { originalHash } = setup();
    open();
    const field = distanceField();
    type(field, "abc");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("거리를 읽을 수 없습니다");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")!.split(" ")).toContain(alert.id);
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBe("true");
    type(field, "0.1");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(field.getAttribute("aria-invalid")).toBeNull();
  });

  it("안쪽 테두리에 음수를 넣으면 음수 불가 경고가 뜨고 미리보기는 없다", () => {
    const { originalHash } = setup();
    open();
    chooseTool("안쪽 테두리");
    type(distanceField(), "-0.1");
    expect(screen.getByRole("alert").textContent).toContain("음수 거리를 쓸 수 없습니다");
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
  });

  it("허용 범위를 넘은 값은 최대값을 말해 주고, 0은 오류가 아닌 안내만 낸다", () => {
    setup();
    const section = open();
    chooseTool("안쪽 테두리");
    type(distanceField(), "5");
    expect(screen.getByRole("alert").textContent).toMatch(/최대 0\.\d+ m까지 입력할 수 있습니다/u);
    type(distanceField(), "0");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(section.textContent).toContain("거리가 0이라 바뀌는 것이 없습니다.");
  });

  it("밀기/당기기에서 너무 깊은 당기기는 한계 깊이를 알린다", () => {
    setup();
    open();
    type(distanceField(), "-5");
    expect(screen.getByRole("alert").textContent).toMatch(/너무 깊이 당겼습니다\. 최대 [0-9.]+ m까지 당길 수 있습니다/u);
  });

  it("같은 평면 이웃이 없는 면의 바깥쪽 오프셋은 이유를 알리고 안쪽으로 돌아갈 수 있다", () => {
    const { originalHash } = setup();
    open();
    chooseTool("오프셋");
    fireEvent.click(screen.getByRole("radio", { name: "바깥쪽" }));
    expect(screen.getByRole("status").textContent).toContain("바깥쪽 오프셋은 같은 평면의 이웃 면이 있어야 합니다");
    expect(distanceField().disabled).toBe(true);
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    // 방향 선택은 열려 있어서 안쪽으로 되돌리면 다시 쓸 수 있다.
    fireEvent.click(screen.getByRole("radio", { name: "안쪽" }));
    expect(distanceField().disabled).toBe(false);
    type(distanceField(), "0.1");
    expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);
  });
});

describe("면 모델링 작업대: 키보드와 핸들", () => {
  it("거리칸에서 ↑↓는 한 단계, Shift는 세밀, PageUp은 크게 움직인다", () => {
    setup();
    open();
    const field = distanceField();
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.value).toBe("0.02");
    fireEvent.keyDown(field, { key: "ArrowUp" });
    expect(field.value).toBe("0.04");
    fireEvent.keyDown(field, { key: "ArrowUp", shiftKey: true });
    expect(field.value).toBe("0.042");
    fireEvent.keyDown(field, { key: "PageUp" });
    expect(field.value).toBe("0.242");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.value).toBe("0.182");
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("previewing");
  });

  it("밀기/당기기는 0 아래로 내리면 당기기가 되고 안쪽 테두리는 0에서 멈춘다", () => {
    setup();
    open();
    const field = distanceField();
    fireEvent.keyDown(field, { key: "ArrowDown" });
    expect(field.value).toBe("-0.02");
    expect(screen.queryByRole("alert")).toBeNull();
    chooseTool("안쪽 테두리");
    const inset = distanceField();
    fireEvent.keyDown(inset, { key: "ArrowDown" });
    expect(inset.value).toBe("0");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.keyDown(inset, { key: "ArrowUp" });
    expect(inset.value).toBe("0.02");
  });

  it("핸들은 방향키·Home/End로 움직이고 값은 aria-valuenow/valuetext로 읽힌다", () => {
    setup();
    open();
    const slider = screen.getByRole("slider", { name: "거리 핸들" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuenow")).toBe("0.02");
    expect(slider.getAttribute("aria-valuetext")).toBe("0.02 m");
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider.getAttribute("aria-valuenow")).toBe("-0.02");
    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider.getAttribute("aria-valuenow")).toBe(slider.getAttribute("aria-valuemin"));
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider.getAttribute("aria-valuenow")).toBe(slider.getAttribute("aria-valuemax"));
    expect(screen.queryByRole("alert")).toBeNull();
    // 끝값도 커널이 받아 주므로 미리보기가 실제로 그려진다.
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("previewing");
    expect(screen.getByRole("status").textContent).toContain("면 ");
  });

  it("핸들에서 Enter를 누르면 확정한다", () => {
    const { latest } = setup();
    open();
    const slider = screen.getByRole("slider", { name: "거리 핸들" });
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "Enter" });
    expect(latest.runs).toEqual(["면 밀기/당기기"]);
  });

  it("포인터로 끌면 값이 따라 바뀌고 미리보기가 실시간으로 갱신되며 놓아도 값은 남는다", () => {
    setup();
    open();
    const slider = screen.getByRole("slider", { name: "거리 핸들" });
    rect(slider, { left: 0, top: 0, width: 200, height: 44 });
    fireEvent.pointerDown(slider, { button: 0, clientX: 100, pointerId: 1 });
    expect(slider.getAttribute("data-dragging")).toBe("true");
    const first = viewport().getAttribute("data-mesh-hash");
    const firstValue = Number(slider.getAttribute("aria-valuenow"));
    fireEvent.pointerMove(slider, { clientX: 160, pointerId: 1 });
    const second = viewport().getAttribute("data-mesh-hash");
    const secondValue = Number(slider.getAttribute("aria-valuenow"));
    expect(secondValue).toBeGreaterThan(firstValue);
    expect(second).not.toBe(first);
    fireEvent.pointerUp(slider, { clientX: 160, pointerId: 1 });
    expect(slider.getAttribute("data-dragging")).toBe("false");
    expect(Number(slider.getAttribute("aria-valuenow"))).toBe(secondValue);
    expect(viewport().getAttribute("data-mesh-hash")).toBe(second);
    expect(distanceField().value).toBe(String(secondValue));
  });

  it("끌다가 Esc를 누르면 값과 미리보기가 모두 취소되고 끌기도 끝난다", () => {
    const { originalHash } = setup();
    open();
    const slider = screen.getByRole("slider", { name: "거리 핸들" });
    rect(slider, { left: 0, top: 0, width: 200, height: 44 });
    fireEvent.pointerDown(slider, { button: 0, clientX: 150, pointerId: 1 });
    expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(slider.getAttribute("data-dragging")).toBe("false");
    expect(distanceField().value).toBe("");
  });

  it("끌기가 중단(pointercancel)되면 끌기만 끝나고 입력값은 유지된다", () => {
    setup();
    open();
    const slider = screen.getByRole("slider", { name: "거리 핸들" });
    rect(slider, { left: 0, top: 0, width: 200, height: 44 });
    fireEvent.pointerDown(slider, { button: 0, clientX: 150, pointerId: 1 });
    const value = distanceField().value;
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(slider.getAttribute("data-dragging")).toBe("false");
    expect(distanceField().value).toBe(value);
  });

  it("주 버튼이 아닌 포인터는 끌기를 시작하지 않는다", () => {
    setup();
    open();
    const slider = screen.getByRole("slider", { name: "거리 핸들" });
    rect(slider, { left: 0, top: 0, width: 200, height: 44 });
    fireEvent.pointerDown(slider, { button: 2, clientX: 150, pointerId: 1 });
    expect(slider.getAttribute("data-dragging")).toBe("false");
    expect(distanceField().value).toBe("");
  });
});

describe("면 모델링 작업대: 면 그리기", () => {
  function openDraw() {
    const result = setup();
    open();
    chooseTool("면 그리기");
    const svg = screen.getByRole("img", { name: /^면 그리기 패드/u });
    // 뷰박스(1.2 m 정사각형)와 같은 비율의 600px 정사각형: 중심(300, 300)이 면 중심이다.
    rect(svg, { left: 0, top: 0, width: 600, height: 600 });
    return { ...result, svg };
  }
  const SQUARE_CLICKS: readonly (readonly [number, number])[] = [[200, 200], [400, 200], [400, 400], [200, 400]];

  it("패드를 눌러 찍은 점이 격자에 붙어 목록에 쌓이고 3개 미만이면 안내만 한다", () => {
    const { svg } = openDraw();
    expect(screen.getByRole("list", { name: "찍은 점 목록" })).toBeTruthy();
    fireEvent.click(svg, { clientX: 203, clientY: 198 });
    fireEvent.click(svg, { clientX: 401, clientY: 202 });
    const items = within(screen.getByRole("list", { name: "찍은 점 목록" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "점 1: u -0.2 · v 0.2 m",
      "점 2: u 0.2 · v 0.2 m",
    ]);
    expect(screen.getByText("점을 3개 이상 찍어야 도형이 닫힙니다.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector("[data-studio-hybrid-dcc-face-modeling-state]")!.getAttribute("data-state")).toBe("previewing");
  });

  it("점 4개가 닫힌 볼록 도형이면 면이 나뉘는 미리보기가 보이고 확정은 되돌리기 한 단위다", () => {
    const { svg, latest, originalHash, originalUndoDepth } = openDraw();
    for (const [x, y] of SQUARE_CLICKS) fireEvent.click(svg, { clientX: x, clientY: y });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(viewport().getAttribute("data-mesh-hash")).not.toBe(originalHash);
    expect(Number(viewport().getAttribute("data-faces"))).toBeGreaterThan(6);
    expect(screen.getByRole("status").textContent).toMatch(/^면 6개 → \d+개$/u);

    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(latest.runs).toEqual(["면 그리기"]);
    expect(latest.workspace.session.undoStack).toHaveLength(originalUndoDepth + 1);
    expect(workspaceUndo(latest.workspace).session.state.geometry.records.cube!.meshHash).toBe(originalHash);
    expect(screen.getByRole("list", { name: "찍은 점 목록" }).children).toHaveLength(0);
  });

  it("마지막 점 지우기와 Esc(전체 취소)", () => {
    const { svg, originalHash } = openDraw();
    for (const [x, y] of SQUARE_CLICKS) fireEvent.click(svg, { clientX: x, clientY: y });
    fireEvent.click(screen.getByRole("button", { name: "마지막 점 지우기" }));
    expect(within(screen.getByRole("list", { name: "찍은 점 목록" })).getAllByRole("listitem")).toHaveLength(3);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.getByRole("list", { name: "찍은 점 목록" }).children).toHaveLength(0);
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
  });

  it("서로 교차하는 순서는 이유를 알리고 문제가 된 점을 표시하며 미리보기는 없다", () => {
    const { svg, originalHash } = openDraw();
    for (const [x, y] of [[200, 200], [400, 400], [400, 200], [200, 400]] as const) {
      fireEvent.click(svg, { clientX: x, clientY: y });
    }
    expect(screen.getByRole("alert").textContent).toContain("서로 교차하거나 닿습니다");
    expect(viewport().getAttribute("data-mesh-hash")).toBe(originalHash);
    expect(screen.getByRole("button", { name: "적용" }).getAttribute("aria-disabled")).toBe("true");
    const flagged = within(screen.getByRole("list", { name: "찍은 점 목록" })).getAllByRole("listitem")
      .filter((item) => item.className.includes("text-bad"));
    expect(flagged.length).toBeGreaterThan(0);
  });

  it("면 가장자리에 닿거나 밖에 있는 점은 거부한다(면 안쪽만 가능)", () => {
    const { svg } = openDraw();
    // 가장자리 바로 위(±0.5 m)와 밖에 놓인 삼각형.
    for (const [x, y] of [[0, 300], [600, 300], [300, 0]] as const) fireEvent.click(svg, { clientX: x, clientY: y });
    expect(screen.getByRole("alert").textContent).toMatch(/면 안쪽에 있어야 합니다|면 밖/u);
  });

  it("오목한 도형은 볼록만 가능하다고 알린다", () => {
    const { svg } = openDraw();
    for (const [x, y] of [[200, 200], [400, 200], [300, 260], [400, 400], [200, 400]] as const) {
      fireEvent.click(svg, { clientX: x, clientY: y });
    }
    expect(screen.getByRole("alert").textContent).toContain("오목합니다");
  });

  it("좌표 입력칸으로도 점을 찍고(Enter) 읽을 수 없는 값은 경고한다", () => {
    openDraw();
    const u = screen.getByRole("textbox", { name: "가로 u (m)" });
    const v = screen.getByRole("textbox", { name: "세로 v (m)" });
    type(u, "x");
    type(v, "0.1");
    fireEvent.keyDown(v, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("좌표를 읽을 수 없습니다");
    expect(u.getAttribute("aria-invalid")).toBe("true");
    for (const [uu, vv] of [["-0.2", "-0.2"], ["20cm", "-0.2"], ["0.2", "0.2"], ["-0.2", "0.2"]] as const) {
      type(u, uu);
      type(v, vv);
      fireEvent.keyDown(v, { key: "Enter" });
    }
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(screen.getByRole("list", { name: "찍은 점 목록" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("status").textContent).toMatch(/^면 6개 → \d+개$/u);
  });

  it("면 하나만 선택되어야 하며 여러 면이면 이유를 알리고 패드는 비활성이다", () => {
    setup({ selectedFaces: [TOP, 0] });
    open();
    chooseTool("면 그리기");
    expect(screen.getByRole("status").textContent).toContain("이 도구는 면 하나에만 쓸 수 있습니다");
    expect(screen.queryByRole("img", { name: /^면 그리기 패드/u })).toBeNull();
  });
});

describe("면 모델링 작업대: 쓸 수 없는 상태", () => {
  it("면이 선택되지 않았으면 면 모드로 면을 고르라고 안내하고 입력칸을 막는다", () => {
    setup({ selectionMode: "object" });
    open();
    expect(screen.getByRole("status").textContent).toContain("면을 하나 이상 선택하세요");
    expect(distanceField().disabled).toBe(true);
    expect(screen.getByRole("slider", { name: "거리 핸들" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("읽기 전용 화면과 조형 모드에서는 쓸 수 없다고 알린다", () => {
    setup({ readOnly: true });
    open();
    expect(screen.getByRole("status").textContent).toContain("읽기 전용이라 면 모델링을 적용할 수 없습니다");
    cleanup();
    setup({ sculpt: true });
    open();
    expect(screen.getByRole("status").textContent).toContain("조형 모드에서는 면 모델링을 쓸 수 없습니다");
  });
});
