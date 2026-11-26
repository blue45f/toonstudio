// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_NATIVE_SCENE_OVERLAY_CANVAS_MARKER,
  createStudioNativeSceneOverlayProvider,
} from "./studio-native-scene-overlay-provider";

function createFake2dContext() {
  const calls: Array<readonly [string, ...unknown[]]> = [];
  const context = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    setTransform: vi.fn((...args: unknown[]) => calls.push(["setTransform", ...args])),
    clearRect: vi.fn((...args: unknown[]) => calls.push(["clearRect", ...args])),
    save: vi.fn(() => calls.push(["save"])),
    restore: vi.fn(() => calls.push(["restore"])),
    scale: vi.fn((...args: unknown[]) => calls.push(["scale", ...args])),
    translate: vi.fn((...args: unknown[]) => calls.push(["translate", ...args])),
    rotate: vi.fn((...args: unknown[]) => calls.push(["rotate", ...args])),
    beginPath: vi.fn(() => calls.push(["beginPath"])),
    rect: vi.fn((...args: unknown[]) => calls.push(["rect", ...args])),
    ellipse: vi.fn((...args: unknown[]) => calls.push(["ellipse", ...args])),
    moveTo: vi.fn((...args: unknown[]) => calls.push(["moveTo", ...args])),
    lineTo: vi.fn((...args: unknown[]) => calls.push(["lineTo", ...args])),
    closePath: vi.fn(() => calls.push(["closePath"])),
    fill: vi.fn(() => calls.push(["fill", context.fillStyle, context.globalAlpha])),
    stroke: vi.fn(() =>
      calls.push(["stroke", context.strokeStyle, context.lineWidth, context.globalAlpha]),
    ),
  };
  return {
    calls,
    context: context as unknown as CanvasRenderingContext2D,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Studio native Canvas 2D scene overlay provider", () => {
  it("전용 투명 캔버스를 생성하고 DPR 리사이즈·documentTransform·비스케일링 스트로크·멱등 destroy를 보장한다", async () => {
    const fake = createFake2dContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((kind: string) =>
        kind === "2d" ? fake.context : null) as typeof HTMLCanvasElement.prototype.getContext,
    );

    const provider = await createStudioNativeSceneOverlayProvider({
      width: 720,
      height: 1_280,
      dpr: 2,
      ownerDocument: document,
    });

    expect(provider.canvas.dataset.studioSceneOverlay).toBe(
      STUDIO_NATIVE_SCENE_OVERLAY_CANVAS_MARKER,
    );
    expect(provider.canvas.dataset.studioSceneInputAuthority).toBe("inactive");
    expect(provider.canvas.style.background).toBe("transparent");
    expect(provider.canvas.style.pointerEvents).toBe("none");
    expect(provider.canvas.width).toBe(1_440);
    expect(provider.canvas.height).toBe(2_560);
    expect(provider.receipt).toEqual({
      providerId: "studio-native-canvas2d",
      selectedRenderer: "canvas2d",
      attemptedRenderer: "canvas2d",
      activeRenderer: "canvas2d",
      attemptCount: 1,
      failureIsolation: "fail-closed",
      surface: {
        ownership: "exclusive-dedicated-overlay",
        contextSharing: "forbidden",
        background: "transparent",
      },
    });

    provider.upsertSelectableOverlay({
      documentId: "box-1",
      zIndex: 0,
      stroke: { color: 0x2563eb, alpha: 0.95, width: 3 },
      shape: {
        kind: "rect",
        bounds: { x: 10, y: 20, width: 100, height: 50 },
      },
    });

    provider.resize({
      width: 900,
      height: 1_600,
      dpr: 2,
      documentTransform: {
        scaleX: -2,
        scaleY: 2,
        offsetX: 320,
        offsetY: 48,
        rotation: 90,
      },
    });
    expect(provider.canvas.width).toBe(1_800);
    expect(provider.canvas.height).toBe(3_200);
    expect(provider.canvas.style.width).toBe("900px");
    expect(provider.canvas.style.height).toBe("1600px");

    provider.render();
    expect(fake.calls).toContainEqual(["translate", 320, 48]);
    expect(fake.calls).toContainEqual(["rotate", Math.PI / 2]);
    expect(fake.calls).toContainEqual(["scale", -2, 2]);
    // 비스케일링 스트로크: width 3 / scale 2 = 1.5
    expect(fake.calls).toContainEqual(["stroke", "rgba(37, 99, 235, 0.95)", 1.5, 1]);

    document.body.append(provider.canvas);
    provider.destroy();
    provider.destroy();
    expect(provider.destroyed).toBe(true);
    expect(provider.canvas.isConnected).toBe(false);
    expect(provider.canvas.width).toBe(0);
    expect(provider.canvas.height).toBe(0);
    expect(() => provider.render()).toThrow(/destroyed/u);
  });

  it("rect·ellipse·polygon 오버레이의 결정적 정렬, 방어적 복제, 최상위 hitTest를 처리한다", async () => {
    const fake = createFake2dContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      ((kind: string) =>
        kind === "2d" ? fake.context : null) as typeof HTMLCanvasElement.prototype.getContext,
    );

    const provider = await createStudioNativeSceneOverlayProvider({
      width: 200,
      height: 200,
      dpr: 1,
      ownerDocument: document,
    });

    const mutablePoints = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    provider.upsertSelectableOverlay({
      documentId: "rect",
      zIndex: 0,
      shape: { kind: "rect", bounds: { x: 0, y: 0, width: 100, height: 100 } },
    });
    const ellipseId = provider.upsertSelectableOverlay({
      documentId: "ellipse",
      zIndex: 1,
      shape: { kind: "ellipse", bounds: { x: 0, y: 0, width: 100, height: 100 } },
    });
    provider.upsertSelectableOverlay({
      documentId: "polygon",
      zIndex: 2,
      shape: { kind: "polygon", points: mutablePoints },
    });
    mutablePoints[0]!.x = 99_999;

    expect(provider.documentIdForLabel(ellipseId.label)).toBe("ellipse");
    expect(provider.hitTest({ x: 50, y: 40 })?.documentId).toBe("polygon");

    provider.upsertSelectableOverlay({
      documentId: "polygon",
      zIndex: 2,
      selectable: false,
      shape: { kind: "polygon", points: mutablePoints },
    });
    expect(provider.hitTest({ x: 50, y: 40 })?.documentId).toBe("ellipse");

    provider.upsertSelectableOverlay({
      documentId: "ellipse",
      zIndex: 1,
      visible: false,
      shape: { kind: "ellipse", bounds: { x: 0, y: 0, width: 100, height: 100 } },
    });
    expect(provider.hitTest({ x: 50, y: 40 })?.documentId).toBe("rect");
    expect(provider.hitTest({ x: Number.NaN, y: 10 })).toBeNull();
    expect(provider.removeSelectableOverlay("ellipse")).toBe(true);
    expect(provider.removeSelectableOverlay("ellipse")).toBe(false);
    expect(provider.documentIdForLabel(ellipseId.label)).toBeNull();

    provider.render();
    expect(fake.calls.some(([command]) => command === "rect")).toBe(true);
    expect(fake.calls.some(([command]) => command === "moveTo")).toBe(true);
    provider.destroy();
  });

  it("잘못된 뷰포트나 2D 컨텍스트 부재 시 fail-closed로 실패한다", async () => {
    await expect(
      createStudioNativeSceneOverlayProvider({
        width: 0,
        height: 100,
        dpr: 1,
        ownerDocument: document,
      }),
    ).rejects.toThrow(/finite positive/u);

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(
      createStudioNativeSceneOverlayProvider({
        width: 100,
        height: 100,
        dpr: 1,
        ownerDocument: document,
      }),
    ).rejects.toThrow(/2D canvas context is unavailable/u);
  });

  it("라이브 선택 오버레이 호스트와 네이티브 프로바이더는 pixi.js와 konva에 의존하지 않는다", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const providerSource = readFileSync(
      path.resolve(dir, "studio-native-scene-overlay-provider.ts"),
      "utf8",
    );
    const hostSource = readFileSync(
      path.resolve(dir, "../StudioPixiSceneOverlayHost.tsx"),
      "utf8",
    );

    expect(providerSource).not.toMatch(/from\s+["']pixi\.js["']|import\(\s*["']pixi\.js["']\s*\)/u);
    expect(providerSource).not.toMatch(/\bkonva\b/iu);
    expect(hostSource).not.toContain("studio-pixi-scene-provider");
    expect(hostSource).not.toMatch(/from\s+["']pixi\.js["']|import\(\s*["']pixi\.js["']\s*\)/u);
    expect(hostSource).toContain('import(\n          "./render/studio-native-scene-overlay-provider"\n        )');
  });
});
