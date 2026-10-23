// @vitest-environment jsdom

import { readFileSync } from "node:fs";

import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioBg3dGlbTexturePaintMount } from "./StudioBg3dGlbTexturePaintMount";
import {
  replaceStudioBg3dPrimitiveTexturePaint,
  resolveStudioBg3dPrimitivePaintBlock,
  useStudioBg3dPrimitivePaintHost,
  type StudioBg3dPrimitivePaintHostBag,
} from "./useStudioBg3dPrimitivePaintHost";

import type { BgPrimitive } from "../studio-background-3d-primitives";
import type { StudioBg3dTexturePaint } from "./studio-bg3d-scene-document-types";

afterEach(cleanup);

// 도형(프리미티브) 표면 그리기 연결(2026-10-23): 호스트 훅의 계약(핸들러는 그리기 모드이고 그릴 수 있을 때만, 획은 선택 도형의
// texturePaint 로만)과 마운트·편집기·장면 그래프 배선을 고정한다.

function box(id: string, extra: Partial<BgPrimitive> = {}): BgPrimitive {
  return { id, kind: "box", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c9a876", ...extra };
}

const PAINT: StudioBg3dTexturePaint = {
  version: 1,
  strokes: [{ color: "#111827", size: 0.04, opacity: 1, points: [[0.1, 0.1]] }],
};

/** 실제 상태를 가진 호스트(편집기의 setPrimitives 대역). */
function useHarness(initial: readonly BgPrimitive[], selectedId: string | null, busy = false) {
  const [primitives, setPrimitives] = useState<BgPrimitive[]>([...initial]);
  const bag = useStudioBg3dPrimitivePaintHost({
    primitive: primitives.find((primitive) => primitive.id === selectedId) ?? null,
    setPrimitives,
    busy,
  });
  return { primitives, bag };
}

const uvEvent = (u: number, v: number) => ({ uv: { x: u, y: v } });

describe("useStudioBg3dPrimitivePaintHost", () => {
  it("그리기 모드가 꺼져 있으면 핸들러가 없다(기존 선택·스냅·회전 동선 그대로)", () => {
    const { result } = renderHook(() => useHarness([box("a")], "a"));
    expect(result.current.bag.paintActive).toBe(false);
    expect(result.current.bag.handlePrimitiveTexturePaintPointer).toBeUndefined();
  });

  it("켜고 도형 위에서 누르고 끌고 떼면 획 하나가 그 도형의 texturePaint 로 들어간다", () => {
    const { result } = renderHook(() => useHarness([box("a"), box("b")], "a"));
    act(() => result.current.bag.onPaintActiveChange(true));
    const handle = result.current.bag.handlePrimitiveTexturePaintPointer!;
    expect(typeof handle).toBe("function");
    act(() => {
      handle("a", uvEvent(0.2, 0.2), "down");
      handle("a", uvEvent(0.3, 0.25), "move");
      handle("a", uvEvent(0.4, 0.3), "move");
      handle("a", uvEvent(0.4, 0.3), "up");
    });
    const [a, b] = result.current.primitives;
    expect(a?.texturePaint?.strokes).toHaveLength(1);
    expect(a?.texturePaint?.strokes[0]?.points.length).toBeGreaterThanOrEqual(3);
    expect(a?.texturePaint?.strokes[0]?.color).toBe(result.current.bag.brush.color);
    expect(b).not.toHaveProperty("texturePaint");
  });

  it("선택하지 않은 도형에서 온 포인터와 UV 가 없는 교차는 무시한다", () => {
    const { result } = renderHook(() => useHarness([box("a"), box("b")], "a"));
    act(() => result.current.bag.onPaintActiveChange(true));
    const handle = result.current.bag.handlePrimitiveTexturePaintPointer!;
    act(() => {
      handle("b", uvEvent(0.2, 0.2), "down");
      handle("b", uvEvent(0.2, 0.2), "up");
      handle("a", {}, "down");
      handle("a", {}, "up");
    });
    expect(result.current.primitives.some((primitive) => primitive.texturePaint)).toBe(false);
  });

  it("잠긴·숨긴 도형이나 다른 작업 중에는 그릴 수 없고 이유를 알려 준다", () => {
    expect(resolveStudioBg3dPrimitivePaintBlock(box("a", { locked: true }), false)).toBe("locked");
    expect(resolveStudioBg3dPrimitivePaintBlock(box("a", { visible: false }), false)).toBe("hidden");
    expect(resolveStudioBg3dPrimitivePaintBlock(box("a"), true)).toBe("busy");
    expect(resolveStudioBg3dPrimitivePaintBlock(box("a"), false)).toBeNull();
    const { result } = renderHook(() => useHarness([box("a", { locked: true })], "a"));
    act(() => result.current.bag.onPaintActiveChange(true));
    expect(result.current.bag.blockedBy).toBe("locked");
    expect(result.current.bag.handlePrimitiveTexturePaintPointer).toBeUndefined();
  });

  it("패널의 쓰기 통로: 획을 바꾸거나(null 이면) 키째 지우고, 값이 같으면 배열을 바꾸지 않는다", () => {
    const { result } = renderHook(() => useHarness([box("a", { texturePaint: PAINT })], "a"));
    act(() => result.current.bag.onPaintChange("a", null));
    expect(result.current.primitives[0]).not.toHaveProperty("texturePaint");
    const before = [box("a", { texturePaint: PAINT })];
    expect(replaceStudioBg3dPrimitiveTexturePaint(before, "a", (current) => current)).toBe(before);
    expect(replaceStudioBg3dPrimitiveTexturePaint(before, "missing", () => null)).toBe(before);
  });
});

describe("표면 그리기 마운트", () => {
  function bagWith(primitive: BgPrimitive | null, extra: Partial<StudioBg3dPrimitivePaintHostBag> = {}): StudioBg3dPrimitivePaintHostBag {
    return {
      primitive,
      paintActive: false,
      onPaintActiveChange: () => undefined,
      brush: { color: "#e11d48", size: 0.04, opacity: 1 },
      onBrushChange: () => undefined,
      onPaintChange: () => undefined,
      blockedBy: null,
      handlePrimitiveTexturePaintPointer: undefined,
      ...extra,
    };
  }

  it("선택한 도형이 있으면 도형 탭에서 표면 그리기 패널을 보여 주고, 없으면 아무것도 그리지 않는다", () => {
    const { rerender, container } = render(
      <StudioBg3dGlbTexturePaintMount h={{ primitiveTexturePaint: bagWith(box("a")), hideOnTab: (tab) => tab !== "shapes" }} />,
    );
    const section = screen.getByRole("region", { name: "도형 표면 그리기" });
    expect(section.hidden).toBe(false);
    expect(screen.getByRole("button", { name: /표면에 직접 그리기/u })).toBeTruthy();
    // 다른 탭에서는 숨긴다(다른 섹션과 같은 hideOnTab 계약).
    rerender(<StudioBg3dGlbTexturePaintMount h={{ primitiveTexturePaint: bagWith(box("a")), hideOnTab: () => true }} />);
    expect(screen.getByRole("region", { name: "도형 표면 그리기", hidden: true }).hidden).toBe(true);
    rerender(<StudioBg3dGlbTexturePaintMount h={{ primitiveTexturePaint: bagWith(null), hideOnTab: () => false }} />);
    expect(container.textContent).toBe("");
  });

  it("그릴 수 없는 이유를 패널 안내로 보여 주고 버튼을 잠근다", () => {
    render(<StudioBg3dGlbTexturePaintMount h={{ primitiveTexturePaint: bagWith(box("a"), { blockedBy: "locked" }) }} />);
    expect(screen.getByText(/잠긴 도형에는 그릴 수 없어요/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: /표면에 직접 그리기/u }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("편집기·장면 그래프 배선(5파일 밖)", () => {
  const read = (file: string) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");

  it("편집기 훅이 도형 표면 그리기 호스트를 만들고 장면 그래프가 읽기 전에 핸들러를 싣는다", () => {
    const editor = read("useStudioBg3dEditor.ts");
    const hostAt = editor.indexOf("useStudioBg3dPrimitivePaintHost({");
    expect(hostAt).toBeGreaterThan(0);
    expect(editor).toContain("primitive: h.selectedPrimitive ?? null");
    expect(editor).toContain("h.primitiveTexturePaint = primitiveTexturePaint;");
    expect(editor).toContain("h.handlePrimitiveTexturePaintPointer = primitiveTexturePaint.handlePrimitiveTexturePaintPointer;");
    expect(hostAt).toBeLessThan(editor.indexOf("bindStudioBg3dEditorSceneGraph(h);"));
  });

  it("장면 그래프는 핸들러가 함수일 때만 도형 메시에 잇고, 그리는 동안 궤도 회전을 멈춘다", () => {
    const graph = read("StudioBg3dEditorSceneGraph.tsx");
    expect(graph).toContain('typeof h.handlePrimitiveTexturePaintPointer === "function"');
    const primitiveMesh = graph.slice(graph.indexOf("<BgPrimitiveMesh"), graph.indexOf("</BgPrimitiveMesh>"));
    expect(primitiveMesh).toContain("onPaintPointer={");
    expect(graph).toContain(
      'enableRotate={typeof h.handlePrimitiveTexturePaintPointer !== "function" && typeof h.handleModelTexturePaintPointer !== "function"}',
    );
  });
});
