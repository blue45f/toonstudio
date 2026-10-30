// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBg3dSceneGlbExportPanel } from "./StudioBg3dSceneGlbExportPanel";
import type { StudioBg3dSceneGlbExportPorts, StudioBg3dSceneGlbExportResult } from "./studio-bg3d-scene-glb-ports";

afterEach(cleanup);
const success: StudioBg3dSceneGlbExportResult = { ok: true, fileName: "복도.glb", byteSize: 23456,
  contentHash: `sha256:${"a".repeat(64)}`, exportedNodeCount: 5, hiddenNodeCount: 2 };
function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, finish(value: T) { if (!resolve) throw Error("대기 요청 필요"); resolve(value); } };
}
function saveButton(): HTMLButtonElement { return screen.getByRole("button", { name: "현재 표시 장면 GLB 저장" }); }
describe("실제 장면 GLB 저장 패널", () => {
  it.each([
    { disabled: true }, { sceneGlbExportUnavailableReason: "원본 모델을 준비 중입니다." }, { onExportCurrentSceneGlb: undefined },
  ] satisfies readonly (StudioBg3dSceneGlbExportPorts & { disabled?: boolean })[])("준비되지 않은 포트는 실행하지 않는다: %o", (patch) => {
    const save = vi.fn<NonNullable<StudioBg3dSceneGlbExportPorts["onExportCurrentSceneGlb"]>>().mockResolvedValue(success);
    render(<StudioBg3dSceneGlbExportPanel onExportCurrentSceneGlb={save} {...patch} />);
    expect(saveButton().disabled).toBe(true); fireEvent.click(saveButton()); expect(save).not.toHaveBeenCalled();
  });
  it("화면 범위를 설명하고 사용자가 입력한 파일 이름으로 한 번 저장한다", async () => {
    const save = vi.fn<NonNullable<StudioBg3dSceneGlbExportPorts["onExportCurrentSceneGlb"]>>().mockResolvedValue(success);
    render(<StudioBg3dSceneGlbExportPanel onExportCurrentSceneGlb={save} />);
    expect(screen.getByText(/숨긴 오브젝트는 제외합니다/)).toBeDefined();
    fireEvent.change(screen.getByRole("textbox", { name: "장면 파일 이름" }), { target: { value: "학원 복도" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("복도.glb"));
    expect(save).toHaveBeenCalledTimes(1); expect(save.mock.calls[0][0].name).toBe("학원 복도");
    expect(save.mock.calls[0][0].signal.aborted).toBe(false);
    expect(screen.getByRole("status").textContent).toContain("5개 오브젝트");
    expect(screen.getByRole("status").textContent).toContain("숨긴 오브젝트 2개 제외");
  });
  it("비협조적인 비동기 처리도 끝날 때까지 중복 저장을 막고 취소 signal을 전달한다", async () => {
    const gate = deferred<StudioBg3dSceneGlbExportResult>();
    const save = vi.fn<NonNullable<StudioBg3dSceneGlbExportPorts["onExportCurrentSceneGlb"]>>().mockReturnValue(gate.promise);
    render(<StudioBg3dSceneGlbExportPanel onExportCurrentSceneGlb={save} />);
    const button = saveButton(); fireEvent.click(button); fireEvent.click(button);
    expect(save).toHaveBeenCalledTimes(1); expect(button.disabled).toBe(true);
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "GLB 저장 취소" }));
    expect(save.mock.calls[0][0].signal.aborted).toBe(true);
    expect(button.disabled).toBe(true);
    await act(async () => gate.finish({ ok: false, code: "aborted", messageKo: "장면 GLB 저장을 취소했습니다." }));
    expect(screen.getByRole("alert").textContent).toContain("취소했습니다"); expect(saveButton().disabled).toBe(false);
  });
  it.each([false, true])("실패 또는 예외 뒤 명시적 재시도를 허용한다: exception=%s", async (exception) => {
    const save = vi.fn<NonNullable<StudioBg3dSceneGlbExportPorts["onExportCurrentSceneGlb"]>>();
    if (exception) save.mockRejectedValueOnce(new Error("fixture"));
    else save.mockResolvedValueOnce({ ok: false, code: "asset-invalid", messageKo: "모델 원본이 변경됐습니다." });
    save.mockResolvedValueOnce(success);
    render(<StudioBg3dSceneGlbExportPanel onExportCurrentSceneGlb={save} />); fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    fireEvent.click(saveButton()); await waitFor(() => expect(screen.getByRole("status").textContent).toContain("복도.glb"));
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("상위 화면이 사라지면 pending 요청을 취소하고 늦은 성공을 화면에 적용하지 않는다", async () => {
    const gate = deferred<StudioBg3dSceneGlbExportResult>();
    const save = vi.fn<NonNullable<StudioBg3dSceneGlbExportPorts["onExportCurrentSceneGlb"]>>().mockReturnValue(gate.promise);
    const mounted = render(<StudioBg3dSceneGlbExportPanel onExportCurrentSceneGlb={save} />); fireEvent.click(saveButton());
    mounted.unmount(); expect(save.mock.calls[0][0].signal.aborted).toBe(true);
    await act(async () => gate.finish(success)); expect(screen.queryByRole("status")).toBeNull();
  });
});
