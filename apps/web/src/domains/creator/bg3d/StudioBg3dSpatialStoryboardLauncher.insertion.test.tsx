// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseSkp } from "openskp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dInsertScenePrimitives } from "./studio-bg3d-workbench-insertion";
import type { StudioBg3dExecuteSelectionArray, StudioBg3dSelectionArraySummary } from "./studio-bg3d-selection-array";
import type { StudioBg3dReadSkpSceneSource, StudioBg3dSkpSourceReadResult, StudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";
import { extractStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { studioBg3dSkpGeometryTransform } from "./studio-bg3d-skp-scene-source";
import { createStudioBg3dSkpSceneSourceVffBytes } from "./studio-bg3d-skp-scene-source.test-fixture";
import { StudioBg3dSpatialStoryboardLauncher } from "./StudioBg3dSpatialStoryboardLauncher";

const BOX: BgPrimitive = {
  id: "generated-step", kind: "box", position: [0, 0, 0],
  rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff",
};

vi.mock("./StudioBg3dAdvancedWorkbenchHub", () => ({
  default: ({ disabled, onInsertScenePrimitives, arraySelection, onExecuteSelectionArray, skpSourceSelection, onReadSkpSceneSource }: {
    readonly disabled?: boolean;
    readonly onInsertScenePrimitives?: StudioBg3dInsertScenePrimitives;
    readonly arraySelection?: StudioBg3dSelectionArraySummary;
    readonly onExecuteSelectionArray?: StudioBg3dExecuteSelectionArray;
    readonly skpSourceSelection?: StudioBg3dSkpSourceSelection;
    readonly onReadSkpSceneSource?: StudioBg3dReadSkpSceneSource;
  }) => <>
    <button type="button" disabled={disabled} onClick={() => onInsertScenePrimitives?.([BOX], "계단 추가")}>생성한 계단 배치</button>
    <p>배열 선택 도형 {arraySelection?.selectedPrimitiveCount ?? 0}개</p>
    <button type="button" disabled={disabled} onClick={() => onExecuteSelectionArray?.({ mode: "linear", token: "*2", delta: [1, 0, 0] })}>
      선택 도형을 반복 배치
    </button>
    <output data-testid="forwarded-skp-source-scope">{skpSourceSelection?.scopeKey} · {skpSourceSelection?.modelName}</output>
    <button type="button" onClick={() => { void onReadSkpSceneSource?.(); }}>전달된 원본 정보 읽기</button>
  </>,
}));

function actualSourceResult(): StudioBg3dSkpSourceReadResult {
  const bytes = new Uint8Array(createStudioBg3dSkpSceneSourceVffBytes());
  const result = extractStudioBg3dSkpSceneManifest(parseSkp(bytes.buffer));
  if (!result.ok) throw new Error(result.detail);
  return { ok: true, value: { version: 1, status: "available", manifest: result.value, reason: null, geometryTransform: studioBg3dSkpGeometryTransform() } };
}

afterEach(cleanup);

describe("전문 작업대 지연 진입의 장면 삽입 연결", () => {
  it("작업대를 열기 전에는 도구가 없고 연 뒤 실제 삽입 명령을 전달한다", async () => {
    const insert = vi.fn<StudioBg3dInsertScenePrimitives>(() => true);
    const view = render(<StudioBg3dSpatialStoryboardLauncher onInsertScenePrimitives={insert} />);
    expect(screen.queryByRole("button", { name: "생성한 계단 배치" })).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-advanced-workbench-launcher-toggle"));
    const insertButton = await screen.findByRole("button", { name: "생성한 계단 배치" });
    fireEvent.click(insertButton);
    expect(insert).toHaveBeenCalledExactlyOnceWith([BOX], "계단 추가");

    view.rerender(<StudioBg3dSpatialStoryboardLauncher disabled onInsertScenePrimitives={insert} />);
    expect(insertButton.hasAttribute("disabled")).toBe(true);
    fireEvent.click(insertButton);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("지연 로드한 Hub에 현재 선택 요약과 배열 명령을 전달하고 이후 선택·잠금 변경도 반영한다", async () => {
    const execute = vi.fn<StudioBg3dExecuteSelectionArray>(() => ({
      ok: true, addedNodeCount: 6, copyCount: 2, selectedNodeCount: 3, normalizedToken: "*2",
    }));
    const selection: StudioBg3dSelectionArraySummary = { selectedPrimitiveCount: 3, availableNodeCount: 50, blockedReason: null };
    const view = render(<StudioBg3dSpatialStoryboardLauncher arraySelection={selection} onExecuteSelectionArray={execute} />);
    expect(screen.queryByRole("button", { name: "선택 도형을 반복 배치" })).toBeNull();
    fireEvent.click(screen.getByTestId("bg3d-advanced-workbench-launcher-toggle"));
    const arrayButton = await screen.findByRole("button", { name: "선택 도형을 반복 배치" });
    expect(screen.getByText("배열 선택 도형 3개")).toBeTruthy();
    fireEvent.click(arrayButton);
    expect(execute).toHaveBeenCalledExactlyOnceWith({ mode: "linear", token: "*2", delta: [1, 0, 0] });

    view.rerender(<StudioBg3dSpatialStoryboardLauncher disabled arraySelection={{ ...selection, selectedPrimitiveCount: 1 }} onExecuteSelectionArray={execute} />);
    expect(screen.getByText("배열 선택 도형 1개")).toBeTruthy();
    expect(arrayButton).toHaveProperty("disabled", true);
    fireEvent.click(arrayButton);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("지연 작업대가 열릴 때와 열린 뒤 모두 최신 원본 정보 scope/reader를 전달한다", async () => {
    const result = actualSourceResult();
    const first = vi.fn<StudioBg3dReadSkpSceneSource>(async () => result);
    const latest = vi.fn<StudioBg3dReadSkpSceneSource>(async () => result);
    const after = vi.fn<StudioBg3dReadSkpSceneSource>(async () => result);
    const selection: StudioBg3dSkpSourceSelection = { scopeKey: '["instance-A","storage-A"]', modelName: "모델 A", blockedReason: null };
    const view = render(<StudioBg3dSpatialStoryboardLauncher skpSourceSelection={selection} onReadSkpSceneSource={first} />);
    expect(screen.queryByRole("button", { name: "전달된 원본 정보 읽기" })).toBeNull();
    expect(first).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("bg3d-advanced-workbench-launcher-toggle"));
    const changed = { ...selection, scopeKey: '["instance-B","storage-B"]', modelName: "모델 B" };
    view.rerender(<StudioBg3dSpatialStoryboardLauncher disabled skpSourceSelection={changed} onReadSkpSceneSource={latest} />);
    fireEvent.click(await screen.findByRole("button", { name: "전달된 원본 정보 읽기" }));
    expect(screen.getByTestId("forwarded-skp-source-scope").textContent).toContain(changed.scopeKey);
    expect(screen.getByTestId("forwarded-skp-source-scope").textContent).toContain("모델 B");
    expect(latest).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "생성한 계단 배치" })).toHaveProperty("disabled", true);

    const final = { ...selection, scopeKey: '["instance-C","storage-C"]', modelName: "모델 C" };
    view.rerender(<StudioBg3dSpatialStoryboardLauncher skpSourceSelection={final} onReadSkpSceneSource={after} />);
    fireEvent.click(screen.getByRole("button", { name: "전달된 원본 정보 읽기" }));
    expect(screen.getByTestId("forwarded-skp-source-scope").textContent).toContain(final.scopeKey);
    expect(after).toHaveBeenCalledTimes(1); expect(latest).toHaveBeenCalledTimes(1);
  });
});
