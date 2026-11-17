import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  auditStudioInAppClosedDetails,
  createStudioInAppPreviewApiDiagnostics,
  dismissStudioInAppFirstRunSurfaces,
  installStudioInAppFirstRunState,
  installStudioInAppGuestBoundary,
  selectStudioInAppInactiveBrush,
} from "./studio-inapp-sweep-harness.mts";

import type { Locator, Page, Route } from "playwright";

function firstRunPage(options: {
  quickStart?: boolean;
  mobileHint?: boolean;
  readinessError?: Error;
  keepQuickStart?: boolean;
} = {}) {
  const events: string[] = [];
  let quickStartVisible = options.quickStart ?? false;
  let mobileHintVisible = options.mobileHint ?? false;
  const quickStartDismiss = {
    click: vi.fn(async () => {
      events.push("dismiss-quick-start");
      if (!options.keepQuickStart) quickStartVisible = false;
    }),
  };
  const quickStart = {
    isVisible: vi.fn(async () => {
      events.push("inspect-quick-start");
      return quickStartVisible;
    }),
    locator: vi.fn((selector: string) => {
      expect(selector).toBe('[data-studio-quickstart-dismiss="true"]');
      return quickStartDismiss;
    }),
    waitFor: vi.fn(async () => {
      events.push("quick-start-hidden");
      if (quickStartVisible) throw new Error("quick start remained visible");
    }),
  };
  const mobileHint = {
    isVisible: vi.fn(async () => {
      events.push("inspect-mobile-hint");
      return mobileHintVisible;
    }),
    click: vi.fn(async () => {
      events.push("dismiss-mobile-hint");
      mobileHintVisible = false;
    }),
    waitFor: vi.fn(async () => {
      events.push("mobile-hint-hidden");
      if (mobileHintVisible) throw new Error("mobile hint remained visible");
    }),
  };
  const dock = {
    waitFor: vi.fn(async () => {
      events.push("dock-ready");
      if (options.readinessError) throw options.readinessError;
    }),
  };
  const coach = {
    getByRole: vi.fn((role: string, name: unknown) => {
      expect(role).toBe("button");
      expect(name).toEqual({ name: "안내 닫기", exact: true });
      return mobileHint;
    }),
  };
  const page = {
    locator: vi.fn((selector: string) => {
      if (selector === '[data-studio-mobile-editing-dock="true"]') return dock;
      if (selector === '[data-studio-creative-starter="true"]') return quickStart;
      if (selector === '[data-studio-canvas-transient="coach"]') return coach;
      throw new Error(`unexpected selector: ${selector}`);
    }),
    waitForTimeout: vi.fn(),
    route: vi.fn(),
  };
  return {
    page: page as unknown as Page,
    events,
    dock,
    quickStart,
    quickStartDismiss,
    mobileHint,
    waitForTimeout: page.waitForTimeout,
    route: page.route,
  };
}

interface BrushState {
  id: string;
  active: boolean;
  visible: boolean;
}

function brushLibrary(onClick?: (brush: BrushState, brushes: BrushState[]) => void) {
  const brushes: BrushState[] = [
    { id: "active-pen", active: true, visible: true },
    { id: "hidden-pen", active: false, visible: false },
    { id: "next-pen", active: false, visible: true },
    { id: "other-pen", active: false, visible: true },
  ];
  const inspected: string[] = [];
  const clicked: string[] = [];
  // Resolvers deliberately remain live, like Playwright locators. A :not([aria-pressed])
  // locator changes its target after selection, and a positional locator changes on reorder.
  const locator = (resolve: () => BrushState[]): Locator => ({
    count: async () => resolve().length,
    nth: (index: number) => locator(() => resolve().slice(index, index + 1)),
    isVisible: async () => resolve()[0]?.visible ?? false,
    getAttribute: async (name: string) => {
      const brush = resolve()[0];
      if (!brush) throw new Error("brush not found");
      inspected.push(`${brush.id}:${name}`);
      if (name === "data-studio-brush-select") return brush.id;
      if (name === "aria-pressed") return String(brush.active);
      throw new Error(`unexpected attribute: ${name}`);
    },
    click: async () => {
      const brush = resolve()[0];
      if (!brush) throw new Error("brush not found");
      clicked.push(brush.id);
      if (onClick) onClick(brush, brushes);
      else for (const item of brushes) item.active = item === brush;
    },
  }) as unknown as Locator;
  const library = {
    locator: (selector: string) => {
      if (selector === 'button[data-studio-brush-select]:not([aria-pressed="true"])') {
        return locator(() => brushes.filter((brush) => !brush.active));
      }
      const match = /^button\[data-studio-brush-select=(.+)\]$/u.exec(selector);
      if (!match) throw new Error(`unexpected selector: ${selector}`);
      const id: unknown = JSON.parse(match[1]);
      return locator(() => brushes.filter((brush) => brush.id === id));
    },
  } as unknown as Locator;
  const interaction = {
    click: vi.fn(async (selected: Locator) => { await selected.click(); }),
    settle: vi.fn(async () => undefined),
  };
  return { library, interaction, brushes, inspected, clicked };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("인앱 details 검사에서 동일한 대상과 원래 닫힘 상태 보존", () => {
  function fixture(ignore?: "open" | "close", inaccessibleAncestor?: readonly [string, string]) {
    const entries = [
      { id: "first", open: false, hasSelect: true, visible: true },
      { id: "second", open: false, hasSelect: true, visible: true },
      { id: "already-open", open: true, hasSelect: true, visible: true },
      { id: "hidden", open: false, hasSelect: true, visible: false },
      { id: "no-select", open: false, hasSelect: false, visible: true },
    ];
    const summaries = new Map(entries.map(entry => [entry.id,
      JSDOM.fragment("<section><details><summary>설정</summary></details></section>").querySelector("summary")!,
    ]));
    const firstAncestor = summaries.get("first")!.parentElement!.parentElement!;
    if (inaccessibleAncestor) firstAncestor.setAttribute(...inaccessibleAncestor);
    const clicked: string[] = [];
    const details = (resolve: () => typeof entries): Locator => ({
      count: async () => resolve().length,
      nth: (index: number) => details(() => resolve().slice(index, index + 1)),
      getAttribute: async () => resolve()[0].open ? "" : null,
      locator: (selector: string) => {
        if (selector === "select") return { count: async () => Number(resolve()[0].hasSelect) } as Locator;
        if (selector !== ":scope > summary") throw new Error(`unexpected selector: ${selector}`);
        return {
          isVisible: async () => resolve()[0].visible,
          evaluate: async <T>(evaluate: (element: HTMLElement) => T): Promise<T> => evaluate(summaries.get(resolve()[0].id)!),
          click: async () => {
            const entry = resolve()[0];
            if (summaries.get(entry.id)!.closest("[inert]")) throw new Error("element is inert");
            clicked.push(entry.id);
            if (ignore === (entry.open ? "close" : "open")) return;
            entry.open = !entry.open;
          },
        } as Locator;
      },
    }) as unknown as Locator;
    // 실제 Playwright처럼 재평가한다. :not([open])에 의존하면 클릭 뒤 다른 대상을 가리킨다.
    const page = { locator: (selector: string) => details(() => selector.includes(":not([open])")
      ? entries.filter(entry => !entry.open && entry.hasSelect) : entries) } as unknown as Page;
    return { page, entries, clicked, firstAncestor };
  }

  it("각각 열린 상태로 감사하고 같은 summary를 두 번 눌러 모두 원래 상태로 복구한다", async () => {
    const { page, entries, clicked } = fixture();
    const observed: string[][] = [];
    const count = await auditStudioInAppClosedDetails(page, async () => { observed.push(entries.filter(entry => entry.open).map(entry => entry.id)); });
    expect(count).toBe(2);
    expect(clicked).toEqual(["first", "first", "second", "second"]);
    expect(observed).toEqual([["first", "already-open"], ["second", "already-open"]]);
    expect(entries.map(entry => entry.open)).toEqual([false, false, true, false, false]);
  });
  it("검사 실패를 전파하며 열린 details부터 닫는다", async () => {
    const { page, entries, clicked } = fixture();
    await expect(auditStudioInAppClosedDetails(page, async () => { throw new Error("offscreen control"); })).rejects.toThrow("offscreen control");
    expect(clicked).toEqual(["first", "first"]);
    expect(entries[0].open).toBe(false);
  });
  it.each([["inert", ""], ["hidden", ""], ["aria-hidden", "true"]] as const)(
    "%s 조상이 있는 닫힌 시트는 제외하고 활성 details는 열고 감사하고 닫는다", async (attribute, value) => {
      const { page, entries, clicked } = fixture(undefined, [attribute, value]);
      const inspected = vi.fn(async () => undefined);
      expect(await auditStudioInAppClosedDetails(page, inspected)).toBe(1);
      expect(inspected).toHaveBeenCalledTimes(1);
      expect(clicked).toEqual(["second", "second"]);
      expect(entries.map(entry => entry.open)).toEqual([false, false, true, false, false]);
    },
  );
  it("시트가 활성화되면 이전 inert 자손도 다시 열고 감사하며 aria-hidden=false는 제외하지 않는다", async () => {
    const { page, clicked, firstAncestor } = fixture(undefined, ["inert", ""]);
    expect(await auditStudioInAppClosedDetails(page, async () => undefined)).toBe(1);
    firstAncestor.removeAttribute("inert");
    firstAncestor.setAttribute("aria-hidden", "false");
    clicked.length = 0;
    expect(await auditStudioInAppClosedDetails(page, async () => undefined)).toBe(2);
    expect(clicked).toEqual(["first", "first", "second", "second"]);
  });
  it.each(["open", "close"] as const)("summary의 %s 동작이 실패하면 통과하지 않는다", async (ignore) => {
    const { page } = fixture(ignore);
    await expect(auditStudioInAppClosedDetails(page, async () => undefined)).rejects.toThrow(/열리지|복구되지/u);
  });
});

describe("in-app first-run dismissal", () => {
  it("checks readiness before either surface and adds no waits when both are absent", async () => {
    const state = firstRunPage();
    await dismissStudioInAppFirstRunSurfaces(state.page);
    expect(state.events).toEqual(["dock-ready", "inspect-quick-start", "inspect-mobile-hint"]);
    expect(state.dock.waitFor).toHaveBeenCalledWith({ state: "visible", timeout: 25_000 });
    expect(state.quickStartDismiss.click).not.toHaveBeenCalled();
    expect(state.mobileHint.click).not.toHaveBeenCalled();
    expect(state.quickStart.waitFor).not.toHaveBeenCalled();
    expect(state.mobileHint.waitFor).not.toHaveBeenCalled();
    expect(state.waitForTimeout).not.toHaveBeenCalled();
    expect(state.route).not.toHaveBeenCalled();
  });

  it("never inspects or dismisses a surface before readiness succeeds", async () => {
    const state = firstRunPage({ quickStart: true, mobileHint: true, readinessError: new Error("not ready") });
    await expect(dismissStudioInAppFirstRunSurfaces(state.page)).rejects.toThrow("not ready");
    expect(state.events).toEqual(["dock-ready"]);
    expect(state.quickStart.isVisible).not.toHaveBeenCalled();
    expect(state.mobileHint.isVisible).not.toHaveBeenCalled();
  });

  it.each([
    { quickStart: true, mobileHint: false },
    { quickStart: false, mobileHint: true },
    { quickStart: true, mobileHint: true },
  ])("dismisses only the visible first-run controls: %j", async (options) => {
    const state = firstRunPage(options);
    await dismissStudioInAppFirstRunSurfaces(state.page);
    expect(state.quickStartDismiss.click).toHaveBeenCalledTimes(Number(options.quickStart));
    expect(state.mobileHint.click).toHaveBeenCalledTimes(Number(options.mobileHint));
    if (options.quickStart) {
      expect(state.quickStartDismiss.click).toHaveBeenCalledWith({ timeout: 1_000 });
      expect(state.quickStart.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 1_000 });
    }
    if (options.mobileHint) {
      expect(state.mobileHint.click).toHaveBeenCalledWith({ timeout: 1_000 });
      expect(state.mobileHint.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 1_000 });
    }
    expect(state.events[0]).toBe("dock-ready");
    expect(state.waitForTimeout).not.toHaveBeenCalled();
  });

  it("fails if the visible first-run panel does not dismiss", async () => {
    const state = firstRunPage({ quickStart: true, keepQuickStart: true });
    await expect(dismissStudioInAppFirstRunSurfaces(state.page)).rejects.toThrow("quick start remained visible");
    expect(state.quickStart.waitFor).toHaveBeenCalledWith({ state: "hidden", timeout: 1_000 });
  });

  it("still uses the visible fallback when private-mode storage rejects initialization", async () => {
    const setItem = vi.fn(() => { throw new Error("storage denied"); });
    vi.stubGlobal("window", { localStorage: { setItem } });
    const state = firstRunPage({ quickStart: true, mobileHint: true });
    Object.assign(state.page, {
      addInitScript: async (script: unknown) => {
        if (typeof script === "function") script();
      },
    });
    await installStudioInAppFirstRunState(state.page);
    expect(setItem).toHaveBeenCalled();
    await dismissStudioInAppFirstRunSurfaces(state.page);
    expect(state.quickStartDismiss.click).toHaveBeenCalledOnce();
    expect(state.mobileHint.click).toHaveBeenCalledOnce();
  });

  it("keeps the guest boundary limited to auth GET and never fabricates health readiness", async () => {
    const handlers: { pattern: string; handler: (route: Route) => Promise<void> }[] = [];
    const page = {
      route: async (pattern: string, handler: (route: Route) => Promise<void>) => {
        handlers.push({ pattern, handler });
      },
    } as unknown as Page;
    await installStudioInAppGuestBoundary(page);
    expect(handlers.map(({ pattern }) => pattern)).toEqual(["**/api/auth/session"]);
    const fulfill = vi.fn();
    const fallback = vi.fn();
    await handlers[0].handler({ request: () => ({ method: () => "GET" }), fulfill, fallback } as unknown as Route);
    expect(fulfill).toHaveBeenCalledWith({
      body: JSON.stringify({ authenticated: false, user: null }),
      contentType: "application/json; charset=utf-8",
      status: 200,
    });
    fulfill.mockClear();
    await handlers[0].handler({ request: () => ({ method: () => "POST" }), fulfill, fallback } as unknown as Route);
    expect(fulfill).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
  });
});

describe("in-app brush selection transition", () => {
  it("skips the active and hidden brushes, then checks the clicked brush after selection and reorder", async () => {
    const state = brushLibrary((selected, brushes) => {
      for (const brush of brushes) brush.active = brush === selected;
      brushes.reverse();
    });
    await selectStudioInAppInactiveBrush(state.library, state.interaction);
    expect(state.clicked).toEqual(["next-pen"]);
    expect(state.inspected.filter((entry) => entry.endsWith(":aria-pressed")))
      .toEqual(["next-pen:aria-pressed", "next-pen:aria-pressed"]);
    expect(state.interaction.settle).toHaveBeenCalledOnce();
  });

  it("waits for the supplied settle callback before checking selection", async () => {
    const state = brushLibrary(() => undefined);
    state.interaction.settle.mockImplementation(async () => {
      for (const brush of state.brushes) brush.active = brush.id === "next-pen";
    });
    await selectStudioInAppInactiveBrush(state.library, state.interaction);
    expect(state.clicked).toEqual(["next-pen"]);
  });

  it.each([true, false])("닫힌 목록을 다시 연 뒤에도 같은 브러시의 실제 선택 상태를 검증한다: %s", async (selected) => {
    let restore: BrushState[] = [];
    const state = brushLibrary((clicked, brushes) => {
      for (const brush of brushes) brush.active = selected && brush === clicked;
      restore = brushes.splice(0);
    });
    const prepareVerification = vi.fn(async () => { state.brushes.push(...restore); });
    const result = selectStudioInAppInactiveBrush(state.library, { ...state.interaction, prepareVerification });
    if (selected) await result;
    else await expect(result).rejects.toThrow("selected brush did not become active");
    expect(prepareVerification).toHaveBeenCalledOnce();
    expect(state.clicked).toEqual(["next-pen"]);
  });

  it.each(["unchanged", "wrong-brush"])("fails when a click leaves selection %s", async (result) => {
    const state = brushLibrary((_selected, brushes) => {
      if (result === "wrong-brush") for (const brush of brushes) brush.active = brush.id === "other-pen";
    });
    await expect(selectStudioInAppInactiveBrush(state.library, state.interaction))
      .rejects.toThrow("selected brush did not become active");
    expect(state.clicked).toEqual(["next-pen"]);
  });

  it.each(["all-active", "all-hidden", "empty"])("fails without clicking when candidates are %s", async (kind) => {
    const state = brushLibrary();
    if (kind === "empty") state.brushes.length = 0;
    else for (const brush of state.brushes) {
      if (kind === "all-active") brush.active = true;
      else brush.visible = false;
    }
    await expect(selectStudioInAppInactiveBrush(state.library, state.interaction))
      .rejects.toThrow("a visible non-active brush is required");
    expect(state.interaction.click).not.toHaveBeenCalled();
    expect(state.interaction.settle).not.toHaveBeenCalled();
  });

  it("preserves click failures instead of reporting a transition", async () => {
    const state = brushLibrary();
    state.interaction.click.mockRejectedValue(new Error("control click failed; hit-test=overlay"));
    await expect(selectStudioInAppInactiveBrush(state.library, state.interaction))
      .rejects.toThrow("control click failed; hit-test=overlay");
    expect(state.interaction.settle).not.toHaveBeenCalled();
  });
});


describe("인앱 정적 프리뷰 API 진단 경계", () => {
  const origin = "http://127.0.0.1:5291";
  const missingApi = "Failed to load resource: the server responded with a status of 502 (Bad Gateway)";
  it.each(["/api/health/ready", "/api/health/capabilities", "/api/studio-realtime/tickets"])(
    "정확한 격리 프리뷰 502 %s를 성공 API와 구분해 기록한다", (path) => {
      const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
      expect(diagnostics.recordConsole(missingApi, origin + path)).toBe(true);
      expect(diagnostics.unavailable).toEqual([`${missingApi} @ ${origin}${path}`]);
    },
  );
  it.each([undefined, "https://www.toonstudio.cloud", "http://localhost:5291", "http://127.0.0.1", "invalid"])(
    "격리 프리뷰가 아닌 %s에는 환경 예외를 적용하지 않는다", (url) => {
      const diagnostics = createStudioInAppPreviewApiDiagnostics(url);
      expect(diagnostics.recordConsole(missingApi, `${origin}/api/health/capabilities`)).toBe(false);
      diagnostics.recordResponse(502, `${origin}/api/creator/role-workspaces/global`, "GET");
      expect(diagnostics.recordConsole(missingApi, `${origin}/api/creator/role-workspaces/global`)).toBe(false);
      expect(diagnostics.unavailable).toEqual([]);
    },
  );
  it.each([401, 403, 404, 500, 503])("상태 %i와 API 권한 오류는 계속 실패한다", (status) => {
    const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
    expect(diagnostics.recordConsole(missingApi.replace("502 (Bad Gateway)", `${status} (Error)`),
      `${origin}/api/health/capabilities`)).toBe(false);
  });
  it("직무 기본값 조회는 실제 같은 오리진 GET 502 응답이 있을 때만 분리한다", () => {
    const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
    const path = `${origin}/api/creator/role-workspaces/global`;
    expect(diagnostics.recordConsole(missingApi, path)).toBe(false);
    diagnostics.recordResponse(502, path, "PUT");
    diagnostics.recordResponse(500, path, "GET");
    expect(diagnostics.recordConsole(missingApi, path)).toBe(false);
    diagnostics.recordResponse(502, path, "GET");
    expect(diagnostics.recordConsole(missingApi, path)).toBe(true);
    expect(diagnostics.unavailable).toEqual([`${missingApi} @ ${path}`]);
    // 이전 GET 실패를 근거로 이후 PUT 쓰기 실패까지 제외하지 않는다.
    diagnostics.recordResponse(502, path, "PUT");
    expect(diagnostics.recordConsole(missingApi, path)).toBe(false);
    diagnostics.recordResponse(502, path, "GET");
    diagnostics.recordResponse(502, path, "PUT");
    expect(diagnostics.recordConsole(missingApi, path)).toBe(false);
  });
  it.each(["/api/creator/works/save", "/api/creator/role-workspaces/global?write=1", "/api/health/capabilities?probe=1", "/assets/editor.js"])(
    "문서 쓰기와 다른 경로 %s의 502는 계속 실패한다", (path) => {
      const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
      diagnostics.recordResponse(502, origin + path, "GET");
      expect(diagnostics.recordConsole(missingApi, origin + path)).toBe(false);
      expect(diagnostics.unavailable).toEqual([]);
    },
  );
  it("다른 로컬 서비스와 외부 API의 동일 경로는 계속 실패한다", () => {
    const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
    for (const foreign of ["http://127.0.0.1:5292", "https://www.toonstudio.cloud"]) {
      diagnostics.recordResponse(502, `${foreign}/api/creator/role-workspaces/global`, "GET");
      expect(diagnostics.recordConsole(missingApi, `${foreign}/api/creator/role-workspaces/global`)).toBe(false);
      expect(diagnostics.recordConsole(missingApi, `${foreign}/api/health/capabilities`)).toBe(false);
    }
  });
});


describe("인앱 격리 프리뷰 입장권 요청 취소 경계", () => {
  const origin = "http://127.0.0.1:5291";
  const url = `${origin}/api/studio-realtime/tickets`;
  it("같은 프리뷰의 POST fetch 입장권 중단만 미확인 환경 진단으로 기록한다", () => {
    const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
    expect(diagnostics.recordCancelledRequest(url, "POST", "fetch", "net::ERR_ABORTED", 502)).toBe(true);
    expect(diagnostics.unavailable).toEqual([`입장권 요청 취소: POST ${url} — net::ERR_ABORTED`]);
  });
  it.each([
    [url, "GET", "fetch", "net::ERR_ABORTED"],
    [url, "PUT", "fetch", "net::ERR_ABORTED"],
    [url, "POST", "xhr", "net::ERR_ABORTED"],
    [url, "POST", "script", "net::ERR_ABORTED"],
    [url, "POST", "fetch", "net::ERR_FAILED"],
    [url, "POST", "fetch", "net::ERR_CONNECTION_REFUSED"],
    [url + "?room=real", "POST", "fetch", "net::ERR_ABORTED"],
    [url + "/", "POST", "fetch", "net::ERR_ABORTED"],
    [`${origin}/api/creator/works/save`, "POST", "fetch", "net::ERR_ABORTED"],
    ["http://127.0.0.1:5292/api/studio-realtime/tickets", "POST", "fetch", "net::ERR_ABORTED"],
    ["https://www.toonstudio.cloud/api/studio-realtime/tickets", "POST", "fetch", "net::ERR_ABORTED"],
  ])("다른 요청 %s %s %s %s의 실패는 제외하지 않는다", (path, method, type, failure) => {
    const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
    expect(diagnostics.recordCancelledRequest(path, method, type, failure, 502)).toBe(false);
    expect(diagnostics.unavailable).toEqual([]);
  });
  it.each([undefined, 200, 401, 403, 500, 503])("실제 502 응답이 아닌 %s의 중단은 제외하지 않는다", (status) => {
    const diagnostics = createStudioInAppPreviewApiDiagnostics(origin);
    expect(diagnostics.recordCancelledRequest(url, "POST", "fetch", "net::ERR_ABORTED", status)).toBe(false);
    expect(diagnostics.unavailable).toEqual([]);
  });
  it.each([undefined, "https://www.toonstudio.cloud"])("외부 검사 %s에는 적용하지 않는다", (preview) => {
    const diagnostics = createStudioInAppPreviewApiDiagnostics(preview);
    expect(diagnostics.recordCancelledRequest(url, "POST", "fetch", "net::ERR_ABORTED", 502)).toBe(false);
    expect(diagnostics.unavailable).toEqual([]);
  });
});
