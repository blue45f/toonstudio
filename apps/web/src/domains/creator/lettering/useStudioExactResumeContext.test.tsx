// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCallback, useRef, useState } from "react";

import {
  readStudioExactResumeContext,
  writeStudioExactResumeContext,
} from "../studio-exact-resume-context";
import { useStudioExactResumeContext } from "../useStudioExactResumeContext";

import type { DrawMode, Tool } from "../studio-editor-tool-model";

const PAGES = [
  { id: "page-1", elements: [{ id: "panel-1" }] },
  { id: "page-2", elements: [{ id: "bubble-2" }, { id: "caption-2" }] },
] as const;

function Harness({
  resumeRequested,
  onRestored,
  hydrated = true,
  focus = "cut:2",
  pages = PAGES,
}: {
  readonly resumeRequested: boolean;
  readonly onRestored?: (pageId: string | null) => void;
  readonly hydrated?: boolean;
  readonly focus?: string | null;
  readonly pages?: readonly { readonly id: string; readonly elements: readonly { readonly id: string }[] }[];
}) {
  const [currentPageId, setCurrentPageIdState] = useState("page-1");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("select");
  const [drawMode, setDrawMode] = useState<DrawMode>("eraser");
  const primaryToolActivatedRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const setCurrentPageId = useCallback((pageId: string) => {
    setCurrentPageIdState(pageId);
    return true;
  }, []);
  const updateViewport = useCallback(() => undefined, []);

  useStudioExactResumeContext({
    projectId: "project-1",
    documentId: "document-1",
    workspace: "comic",
    focus,
    language: "ko-KR",
    sourceVersion: "v4",
    resumeRequested,
    hydrated,
    pages,
    currentPageId,
    setCurrentPageId,
    selectedId,
    marqueeIds,
    setSelectedId,
    setMarqueeIds,
    zoom,
    setZoom,
    scrollLeft: 0,
    scrollTop: 0,
    viewportRef,
    updateViewport,
    primaryToolActivatedRef,
    tool,
    setTool,
    drawMode,
    setDrawMode,
    onRestored: (context) => onRestored?.(context.pageId),
  });

  return (
    <div>
      <button type="button" onClick={() => {
        primaryToolActivatedRef.current = true;
        setTool("draw");
        setDrawMode("eraser");
      }}>지우개 선택</button>
      <div
        ref={(node) => {
          viewportRef.current = node;
          if (!node) return;
          Object.defineProperties(node, {
            clientWidth: { configurable: true, value: 200 },
            clientHeight: { configurable: true, value: 300 },
            scrollWidth: { configurable: true, value: 1_200 },
            scrollHeight: { configurable: true, value: 2_400 },
          });
        }}
        data-testid="viewport"
      />
      <output data-testid="state">
        {JSON.stringify({ currentPageId, selectedId, marqueeIds, zoom, tool, drawMode })}
      </output>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useStudioExactResumeContext", () => {
  it("preserves the saved target throughout recovery discovery and the user's pending restore decision", async () => {
    const onRestored = vi.fn();
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1", documentId: "document-1", workspace: "comic", pageId: "page-2",
      selectedElementIds: ["bubble-2"], zoom: 1.6, scrollLeft: 120, scrollTop: 760,
    });
    const before = readStudioExactResumeContext(window.localStorage, "project-1", "document-1");
    const mounted = render(<Harness resumeRequested hydrated={false} pages={[PAGES[0]]} onRestored={onRestored} />);
    // Longer than the persistence debounce: merely mounting an empty local editor must not
    // replace a saved page-2 target while the durable candidate is still being decided.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    expect(readStudioExactResumeContext(window.localStorage, "project-1", "document-1")).toEqual(before);
    expect(onRestored).not.toHaveBeenCalled();
    mounted.rerender(<Harness resumeRequested hydrated pages={PAGES} onRestored={onRestored} />);
    await waitFor(() => expect(onRestored).toHaveBeenCalledExactlyOnceWith("page-2"));
    expect(screen.getByTestId("state").textContent).toContain('"selectedId":"bubble-2"');
    expect(screen.getByTestId("viewport").scrollTop).toBe(760);
  });

  it.each([
    { resumeRequested: false, expectedMode: "eraser" },
    { resumeRequested: true, expectedMode: "pen" },
  ])("도구 선택 뒤 원고 복구가 완료될 때 명시적 이어하기 $resumeRequested 의 도구와 페이지를 보존한다", async ({ resumeRequested, expectedMode }) => {
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1", documentId: "document-1", workspace: "comic", pageId: "page-2",
      selectedElementIds: ["bubble-2"], tool: "draw", drawMode: "pen",
    });
    const view = render(<Harness resumeRequested={resumeRequested} focus={null} hydrated={false} pages={[PAGES[0]]} />);
    await act(async () => { screen.getByRole("button", { name: "지우개 선택" }).click(); });
    view.rerender(<Harness resumeRequested={resumeRequested} focus={null} hydrated />);
    await waitFor(() => expect(JSON.parse(screen.getByTestId("state").textContent ?? "{}")).toMatchObject({
      currentPageId: "page-2", selectedId: "bubble-2", tool: "draw", drawMode: expectedMode,
    }));
    view.unmount();
    expect(readStudioExactResumeContext(window.localStorage, "project-1", "document-1")).toMatchObject({
      pageId: "page-2", selectedElementIds: ["bubble-2"], tool: "draw", drawMode: expectedMode,
    });
  });

  it("restores the page, selection, tool, zoom and viewport from the trusted latest context", async () => {
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1",
      documentId: "document-1",
      workspace: "comic",
      pageId: "page-2",
      selectedElementIds: ["bubble-2", "caption-2", "missing-element"],
      zoom: 2,
      scrollLeft: 480,
      scrollTop: 1_100,
      tool: "draw",
      drawMode: "pen",
      focus: "cut:2",
      language: "ko-KR",
      sourceVersion: "v4",
      updatedAt: "2026-09-17T10:00:00.000Z",
    });

    render(<Harness resumeRequested />);

    await waitFor(() => {
      expect(screen.getByTestId("state").textContent).toContain('"currentPageId":"page-2"');
      expect(screen.getByTestId("state").textContent).toContain('"marqueeIds":["bubble-2","caption-2"]');
      expect(screen.getByTestId("state").textContent).toContain('"zoom":2');
      expect(screen.getByTestId("state").textContent).toContain('"tool":"draw"');
      expect(screen.getByTestId("state").textContent).toContain('"drawMode":"pen"');
    });
    await waitFor(() => {
      const viewport = screen.getByTestId("viewport");
      expect(viewport.scrollLeft).toBe(480);
      expect(viewport.scrollTop).toBe(1_100);
    });
  });

  it("ignores a stale page target and replaces it with the current valid context", async () => {
    const onRestored = vi.fn();
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1",
      documentId: "document-1",
      workspace: "comic",
      pageId: "deleted-page",
      selectedElementIds: ["missing-element"],
      zoom: 3,
      scrollLeft: 800,
      scrollTop: 1_500,
      tool: "draw",
      drawMode: "pen",
      updatedAt: "2026-09-17T10:00:00.000Z",
    });

    render(<Harness resumeRequested onRestored={onRestored} />);

    await waitFor(() => {
      expect(readStudioExactResumeContext(window.localStorage, "project-1", "document-1")).toMatchObject({
        pageId: "page-1",
        selectedElementIds: [],
        zoom: 1,
        tool: "select",
        drawMode: "eraser",
      });
    }, { timeout: 2_000 });
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.getByTestId("state").textContent).toContain('"currentPageId":"page-1"');
  });

  it("persists the current context without blocking editing when no restore was requested", async () => {
    render(<Harness resumeRequested={false} />);

    await waitFor(() => {
      const context = readStudioExactResumeContext(window.localStorage, "project-1", "document-1");
      expect(context).toMatchObject({
        pageId: "page-1",
        workspace: "comic",
        zoom: 1,
        tool: "select",
        drawMode: "eraser",
        focus: "cut:2",
        language: "ko-KR",
        sourceVersion: "v4",
      });
    }, { timeout: 2_000 });
  });

  it("preserves active layer selection on bare reload of the same document and page when focus is unset", async () => {
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1",
      documentId: "document-1",
      workspace: "comic",
      pageId: "page-1",
      selectedElementIds: ["panel-1"],
      zoom: 1.4,
      scrollLeft: 0,
      scrollTop: 0,
      tool: "draw",
      drawMode: "pen",
    });

    function BareReloadHarness() {
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
      const viewportRef = useRef<HTMLDivElement>(null);
      const primaryToolActivatedRef = useRef(false);
      useStudioExactResumeContext({
        primaryToolActivatedRef,
        projectId: "project-1",
        documentId: "document-1",
        workspace: "comic",
        focus: null,
        language: "ko-KR",
        sourceVersion: null,
        resumeRequested: false,
        hydrated: true,
        pages: PAGES,
        currentPageId: "page-1",
        setCurrentPageId: () => true,
        selectedId,
        marqueeIds,
        setSelectedId,
        setMarqueeIds,
        zoom: 1,
        setZoom: () => undefined,
        scrollLeft: 0,
        scrollTop: 0,
        viewportRef,
        updateViewport: () => undefined,
        tool: "draw",
        setTool: () => undefined,
        drawMode: "pen",
        setDrawMode: () => undefined,
      });
      return <output data-testid="bare-state">{JSON.stringify({ selectedId, marqueeIds })}</output>;
    }

    render(<BareReloadHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("bare-state").textContent).toBe(
        JSON.stringify({ selectedId: "panel-1", marqueeIds: [] }),
      );
    });
  });

  it("restores page, tool, drawMode, and selection when returning to an existing document without ?resume=latest and flushes pending state on unmount", async () => {
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-1",
      documentId: "document-1",
      workspace: "comic",
      pageId: "page-2",
      selectedElementIds: ["bubble-2"],
      zoom: 1.5,
      scrollLeft: 0,
      scrollTop: 0,
      tool: "draw",
      drawMode: "eraser",
    });

    function DirectReturnHarness({ initialMode = "pen" as DrawMode }: { readonly initialMode?: DrawMode }) {
      const [currentPageId, setCurrentPageIdState] = useState("page-1");
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
      const [tool, setTool] = useState<Tool>("select");
      const [drawMode, setDrawMode] = useState<DrawMode>(initialMode);
      const viewportRef = useRef<HTMLDivElement>(null);
      const primaryToolActivatedRef = useRef(false);
      useStudioExactResumeContext({
        primaryToolActivatedRef,
        projectId: "project-1",
        documentId: "document-1",
        workspace: "comic",
        focus: null,
        language: "ko-KR",
        sourceVersion: null,
        resumeRequested: false,
        hydrated: true,
        pages: PAGES,
        currentPageId,
        setCurrentPageId: (next) => {
          setCurrentPageIdState(next);
          return true;
        },
        selectedId,
        marqueeIds,
        setSelectedId,
        setMarqueeIds,
        zoom: 1,
        setZoom: () => undefined,
        scrollLeft: 0,
        scrollTop: 0,
        viewportRef,
        updateViewport: () => undefined,
        tool,
        setTool,
        drawMode,
        setDrawMode,
      });
      return (
        <div>
          <button type="button" onClick={() => setDrawMode("lasso-fill")}>switch-lasso</button>
          <output data-testid="direct-return-state">
            {JSON.stringify({ currentPageId, selectedId, tool, drawMode })}
          </output>
        </div>
      );
    }

    const view = render(<DirectReturnHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("direct-return-state").textContent).toBe(
        JSON.stringify({
          currentPageId: "page-2",
          selectedId: "bubble-2",
          tool: "draw",
          drawMode: "eraser",
        }),
      );
    });

    // Change tool right before unmount (< 450ms debounce) and verify synchronous flush
    await act(async () => {
      screen.getByText("switch-lasso").click();
    });
    view.unmount();

    expect(readStudioExactResumeContext(window.localStorage, "project-1", "document-1")).toMatchObject({
      pageId: "page-2",
      selectedElementIds: ["bubble-2"],
      tool: "draw",
      drawMode: "lasso-fill",
    });
  });
});
