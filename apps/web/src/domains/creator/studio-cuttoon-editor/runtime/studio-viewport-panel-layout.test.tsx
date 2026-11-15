// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT, type StudioDrawingPaletteLayout } from "../../brush/studio-drawing-palettes";
import { defaultStudioAppSettings } from "../../studio-app-settings";
import { createStudioWorkspaceDefaultState } from "../../studio-workspaces";
import { StudioDrawingClarityProvider, type StudioDrawingClaritySession } from "../StudioDrawingClarity";
import { useStudioDrawingClarity } from "../StudioDrawingClarityContext";
import {
  normalizeStudioViewportPanelMemoryState,
  resolveStudioViewportMaxLeftPanelWidth,
  resolveStudioViewportMaxRightPanelWidth,
  resolveStudioViewportPanelBucket,
  seedCompactViewportPanelSnapshot,
  type StudioViewportPanelMemoryState,
} from "./studio-viewport-panel-layout";
import { useStudioViewportPanelMemory } from "./useStudioViewportPanelMemory";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function createMemoryRepo(initial: StudioViewportPanelMemoryState | null = null) {
  let saved: StudioViewportPanelMemoryState | null = initial;
  return {
    get current() {
      return saved;
    },
    loadViewportPanelMemory: vi.fn(async () => saved ?? { version: 1 as const, compact: null, large: null }),
    saveViewportPanelMemory: vi.fn(async (next: StudioViewportPanelMemoryState) => {
      saved = normalizeStudioViewportPanelMemoryState(next);
    }),
  };
}

function ViewportMemoryHarness({
  viewportWidth,
  initialRightWidth = 320,
  repo,
}: {
  readonly viewportWidth: number;
  readonly initialRightWidth?: number;
  readonly repo: ReturnType<typeof createMemoryRepo>;
}) {
  const maxRight = resolveStudioViewportMaxRightPanelWidth(viewportWidth);
  const maxLeft = resolveStudioViewportMaxLeftPanelWidth(viewportWidth);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(236);
  const [rightWidth, setRightWidth] = useState(initialRightWidth);
  const [palettes, setPalettes] = useState<StudioDrawingPaletteLayout>(DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT);

  const boundedLeft = Math.min(maxLeft, Math.max(176, leftWidth));
  const boundedRight = Math.min(maxRight, Math.max(240, rightWidth));
  const maxRightRef = useRef(maxRight);
  const maxLeftRef = useRef(maxLeft);
  maxRightRef.current = maxRight;
  maxLeftRef.current = maxLeft;

  const leftSetRef = useRef((w: number) => setLeftWidth(Math.min(maxLeftRef.current, Math.max(176, w))));
  const rightSetRef = useRef((w: number) => setRightWidth(Math.min(maxRightRef.current, Math.max(240, w))));
  const acquireUiPreferences = useRef(() => Promise.resolve(repo)).current;

  const memory = useStudioViewportPanelMemory({
    viewportWidth,
    ownerScope: "guest",
    initialDesktop: {
      leftPanelOpen: true,
      rightPanelOpen: true,
      leftPanelWidth: 236,
      rightPanelWidth: initialRightWidth,
    },
    initialDrawingPalettes: DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
    leftPanelOpen: leftOpen,
    rightPanelOpen: rightOpen,
    leftPanelWidth: boundedLeft,
    rightPanelWidth: boundedRight,
    leftDragging: false,
    rightDragging: false,
    drawingPaletteDragging: false,
    drawingPaletteLayout: palettes,
    setLeftPanelOpenWithOverride: setLeftOpen,
    setRightPanelOpenWithOverride: setRightOpen,
    leftResizeSetWidthRef: leftSetRef,
    rightResizeSetWidthRef: rightSetRef,
    setDrawingPaletteLayout: setPalettes,
    acquireUiPreferences,
  });

  return (
    <div>
      <output data-testid="bucket">{memory.bucket}</output>
      <output data-testid="right-open">{String(rightOpen)}</output>
      <output data-testid="right-width">{boundedRight}</output>
      <output data-testid="subtools-collapsed">{String(palettes.collapsed["sub-tools"])}</output>
      <output data-testid="authored-right-open">{String(memory.authoredDesktop.rightPanelOpen)}</output>
      <output data-testid="authored-right-width">{memory.authoredDesktop.rightPanelWidth}</output>
      <output data-testid="authored-subtools-collapsed">
        {String(memory.authoredDrawingPalettes.collapsed["sub-tools"])}
      </output>
      <button type="button" onClick={() => setRightOpen(false)}>우측 접기</button>
      <button type="button" onClick={() => rightSetRef.current(240)}>우측 240</button>
      <button type="button" onClick={() => rightSetRef.current(720)}>우측 최대</button>
      <button
        type="button"
        onClick={() =>
          setPalettes((prev) => ({
            ...prev,
            collapsed: { ...prev.collapsed, "sub-tools": true },
          }))
        }
      >
        서브도구 접기
      </button>
    </div>
  );
}

describe("작은 화면과 큰 화면의 도구·작업 패널 독립 복원", () => {
  it("뷰포트 버킷과 우측·좌측 패널 안전 최대 폭을 구분한다", () => {
    expect(resolveStudioViewportPanelBucket(1_440)).toBe("large");
    expect(resolveStudioViewportPanelBucket(1_280)).toBe("large");
    expect(resolveStudioViewportPanelBucket(1_279)).toBe("compact");
    expect(resolveStudioViewportPanelBucket(1_040)).toBe("compact");

    expect(resolveStudioViewportMaxRightPanelWidth(1_440)).toBe(720);
    expect(resolveStudioViewportMaxRightPanelWidth(1_040)).toBe(374);
    expect(resolveStudioViewportMaxRightPanelWidth(820)).toBe(295);
    expect(resolveStudioViewportMaxLeftPanelWidth(1_040)).toBe(249);

    const seeded = seedCompactViewportPanelSnapshot(
      {
        desktop: { leftPanelOpen: true, rightPanelOpen: true, leftPanelWidth: 320, rightPanelWidth: 720 },
        drawingPalettes: DEFAULT_STUDIO_DRAWING_PALETTE_LAYOUT,
      },
      1_040,
    );
    expect(seeded.desktop.rightPanelWidth).toBe(374);
    expect(seeded.desktop.leftPanelWidth).toBe(249);
  });

  it("작은 화면에서 접거나 폭을 바꿔도 큰 화면 복귀 시 큰 화면 폭·열림이 보존되고 다시 작은 화면으로 가면 작은 화면 상태가 복원된다", async () => {
    const repo = createMemoryRepo();
    const view = render(<ViewportMemoryHarness viewportWidth={1_440} initialRightWidth={520} repo={repo} />);

    expect(screen.getByTestId("bucket").textContent).toBe("large");
    expect(screen.getByTestId("right-width").textContent).toBe("520");

    // 1040px 작은 화면으로 축소하면 520px이 안전 상한(374px)으로 클램프된다.
    view.rerender(<ViewportMemoryHarness viewportWidth={1_040} initialRightWidth={520} repo={repo} />);
    expect(screen.getByTestId("bucket").textContent).toBe("compact");
    expect(screen.getByTestId("right-width").textContent).toBe("374");

    // 작은 화면에서 폭을 240px로 줄이고 접고 서브도구 팔레트까지 접는다.
    fireEvent.click(screen.getByRole("button", { name: "우측 240" }));
    fireEvent.click(screen.getByRole("button", { name: "우측 접기" }));
    fireEvent.click(screen.getByRole("button", { name: "서브도구 접기" }));
    expect(screen.getByTestId("right-open").textContent).toBe("false");
    expect(screen.getByTestId("right-width").textContent).toBe("240");
    expect(screen.getByTestId("subtools-collapsed").textContent).toBe("true");
    // 큰 화면 저장용 authored 스냅샷은 오염되지 않아야 한다.
    expect(screen.getByTestId("authored-right-open").textContent).toBe("true");
    expect(screen.getByTestId("authored-right-width").textContent).toBe("520");
    expect(screen.getByTestId("authored-subtools-collapsed").textContent).toBe("false");

    // 1440px 큰 화면으로 복귀하면 큰 화면 상태(열림, 520px, 서브도구 펼침)가 그대로 복원된다.
    view.rerender(<ViewportMemoryHarness viewportWidth={1_440} initialRightWidth={520} repo={repo} />);
    expect(screen.getByTestId("right-open").textContent).toBe("true");
    expect(screen.getByTestId("right-width").textContent).toBe("520");
    expect(screen.getByTestId("subtools-collapsed").textContent).toBe("false");

    // 다시 1040px 작은 화면으로 가면 작은 화면의 접힘·240px·서브도구 접힘이 독립 복원된다.
    view.rerender(<ViewportMemoryHarness viewportWidth={1_040} initialRightWidth={520} repo={repo} />);
    expect(screen.getByTestId("right-open").textContent).toBe("false");
    expect(screen.getByTestId("right-width").textContent).toBe("240");
    expect(screen.getByTestId("subtools-collapsed").textContent).toBe("true");

    await waitFor(() => expect(repo.saveViewportPanelMemory).toHaveBeenCalled());
  });

  it("작은 화면에서 넓힌 폭이 큰 화면 캔버스를 잠식하지 않으며 새로고침 시 작은 화면 메모리도 SQLite에서 복원한다", async () => {
    const repo = createMemoryRepo();
    const first = render(<ViewportMemoryHarness viewportWidth={1_040} initialRightWidth={320} repo={repo} />);

    fireEvent.click(screen.getByRole("button", { name: "우측 최대" }));
    expect(screen.getByTestId("right-width").textContent).toBe("374");
    await waitFor(() => expect(repo.current?.compact?.desktop.rightPanelWidth).toBe(374));

    // 큰 화면으로 전환 시 374px이 전이되지 않고 큰 화면 기본 폭(320px)이 유지된다.
    first.rerender(<ViewportMemoryHarness viewportWidth={1_440} initialRightWidth={320} repo={repo} />);
    expect(screen.getByTestId("right-width").textContent).toBe("320");
    first.unmount();

    // 1040px 작은 화면에서 새로 마운트(새로고침)하면 저장된 작은 화면 폭(374px)이 복원된다.
    render(<ViewportMemoryHarness viewportWidth={1_040} initialRightWidth={320} repo={repo} />);
    await waitFor(() => expect(screen.getByTestId("right-width").textContent).toBe("374"));
  });

  it("간단한 그리기(StudioDrawingClarity) 서랍 열림도 작은 화면과 큰 화면에서 독립 유지된다", () => {
    let compactMatches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query === "(max-width: 1279px)" ? compactMatches : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }));

    const state = createStudioWorkspaceDefaultState(null);
    const session: StudioDrawingClaritySession = {
      currentWorkspaceOwnerScope: "guest",
      isMobile: false,
      canvasOnlyMode: false,
      mobileImmersive: false,
      workspaceState: state,
      workMode: "all",
      uiDensityMode: "simple",
      appSettings: defaultStudioAppSettings(),
      location: { pathname: "/studio/canvas", search: "", hash: "", key: "k", state: null },
      studioDrawingClarityBaseline: { ownerScope: "guest", source: "default", state },
      studioMenubarContentHandlers: { setStudioUiDensity: vi.fn() },
    };
    function ClarityProbe() {
      const clarity = useStudioDrawingClarity();
      if (!clarity) return null;
      return (
        <div>
          <output data-testid="clarity-panel">{clarity.panel ?? "none"}</output>
          <button type="button" onClick={(e) => clarity.open("layers", e.currentTarget)}>레이어 토글</button>
          <button type="button" onClick={(e) => clarity.open("brush", e.currentTarget)}>브러시 토글</button>
        </div>
      );
    }

    render(
      <StudioDrawingClarityProvider session={session}>
        <ClarityProbe />
      </StudioDrawingClarityProvider>,
    );

    // 큰 화면: 서랍 닫힘 상태 유지 -> 작은 화면 전환 후 레이어 서랍 열기
    expect(screen.getByTestId("clarity-panel").textContent).toBe("none");
    act(() => {
      compactMatches = true;
      listeners.forEach((cb) => cb());
    });
    fireEvent.click(screen.getByRole("button", { name: "레이어 토글" }));
    expect(screen.getByTestId("clarity-panel").textContent).toBe("layers");

    // 큰 화면 복귀 시 작은 화면에서 연 서랍이 큰 화면을 잠식하지 않고 닫힘 유지
    act(() => {
      compactMatches = false;
      listeners.forEach((cb) => cb());
    });
    expect(screen.getByTestId("clarity-panel").textContent).toBe("none");

    // 다시 작은 화면 전환 시 레이어 서랍 복원
    act(() => {
      compactMatches = true;
      listeners.forEach((cb) => cb());
    });
    expect(screen.getByTestId("clarity-panel").textContent).toBe("layers");
  });
});
