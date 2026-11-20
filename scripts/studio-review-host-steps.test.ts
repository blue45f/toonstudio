import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareFilterMenuWorkspace } from "./lib/studio-filter-menu-workspace";
import { openStudioLayerNavigator } from "./lib/studio-shell-interactions";
import { openStudioProjectCenter } from "./lib/studio-verifier-entry-points";
import { openStudioReviewHost, requestStudioReviewHostCapture, STUDIO_REVIEW_HOST_TITLE } from "./studio-review-host-steps";

import type { Locator, Page } from "playwright";

vi.mock("./lib/studio-filter-menu-workspace", () => ({ prepareFilterMenuWorkspace: vi.fn() }));
vi.mock("./lib/studio-shell-interactions", () => ({ openStudioLayerNavigator: vi.fn() }));
vi.mock("./lib/studio-verifier-entry-points", () => ({ openStudioProjectCenter: vi.fn() }));

function fixture({ clarity = true, onboarding = false, betaGate = false } = {}) {
  const calls: string[] = [];
  const state = { onboarding, betaGate, panel: "closed" };
  const heading = {
    waitFor: async (options: { timeout: number }) => {
      expect(options.timeout).toBe(60_000); calls.push("document-heading");
    },
  };
  const onboardingHeading = {
    isVisible: async () => state.onboarding,
    waitFor: async (options: { state: string }) => {
      expect(options.state).toBe("hidden"); expect(state.onboarding).toBe(false); calls.push("onboarding-hidden");
    },
  };
  const dismissOnboarding = {
    first() { return this; },
    click: async () => { state.onboarding = false; calls.push("dismiss-onboarding"); },
  };
  const dismissBeta = {
    isVisible: async () => state.betaGate,
    click: async () => { state.betaGate = false; calls.push("dismiss-beta"); },
  };
  const layoutMenu = {
    first() { return this; }, isVisible: async () => clarity,
    click: async () => { calls.push("retired-layout-menu"); },
  };
  const page = {
    goto: async (url: string, options: { waitUntil: string }) => {
      expect(url).toBe("http://127.0.0.1:5173/studio?id=review-work");
      expect(options.waitUntil).toBe("domcontentloaded"); calls.push("navigate");
    },
    getByRole: (role: string, options: { name: string | RegExp; exact?: boolean }) => {
      if (role === "heading" && options.name === STUDIO_REVIEW_HOST_TITLE) return heading;
      if (role === "heading" && options.name === "나에게 맞는 작업 환경 만들기") return onboardingHeading;
      if (role === "button" && options.name === "나중에 설정") return dismissOnboarding;
      if (role === "button" && options.name === "나중에 보기") return dismissBeta;
      if (role === "button" && options.name instanceof RegExp && options.name.test("화면과 도움말")) {
        return { click: async () => { calls.push("workspace-category"); } };
      }
      throw new Error(`현재 제품에 없는 진입점: ${role} ${String(options.name)}`);
    },
    locator: (selector: string) => {
      expect(selector).toBe('[data-studio-clarity-more-trigger="true"]:visible'); return layoutMenu;
    },
  } as unknown as Page;
  vi.mocked(prepareFilterMenuWorkspace).mockImplementation(async (actualPage) => {
    expect(actualPage).toBe(page); calls.push("prepare-menu");
    if (clarity) state.panel = "commands";
    return clarity;
  });
  vi.mocked(openStudioLayerNavigator).mockImplementation(async (actualPage) => {
    expect(actualPage).toBe(page); expect(state.panel).toBe("commands");
    state.panel = "layers"; calls.push("layers");
  });
  return { page, calls, state, heading };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("실제 인증 원고의 현재 프로젝트·레이어 도구 진입", () => {
  const origin = new URL("http://127.0.0.1:5173");

  it("폐기된 화면 전환 버튼 없이 현재 프로젝트 메뉴와 레이어·속성을 준비한다", async () => {
    const f = fixture();
    await openStudioReviewHost(f.page, origin, "review-work");
    expect(f.calls).toEqual(["navigate", "document-heading", "prepare-menu", "layers"]);
    expect(f.state.panel).toBe("layers");
  });

  it("실제 원고 제목을 확인하고 기존 온보딩·베타 안내를 닫은 뒤 도구를 연다", async () => {
    const f = fixture({ onboarding: true, betaGate: true });
    await openStudioReviewHost(f.page, origin, "review-work");
    expect(f.calls).toEqual(["navigate", "document-heading", "dismiss-onboarding", "onboarding-hidden", "dismiss-beta", "prepare-menu", "layers"]);
    expect(f.state).toMatchObject({ onboarding: false, betaGate: false, panel: "layers" });
  });

  it("독립 작업 화면에는 Clarity 전환을 요구하지 않는다", async () => {
    const f = fixture({ clarity: false });
    await openStudioReviewHost(f.page, origin, "review-work");
    expect(f.calls).toEqual(["navigate", "document-heading", "prepare-menu"]);
    expect(prepareFilterMenuWorkspace).toHaveBeenCalledExactlyOnceWith(f.page);
    expect(f.state.panel).toBe("closed");
    expect(openStudioLayerNavigator).not.toHaveBeenCalled();
  });

  it("다른 원고이거나 제목 준비가 실패하면 도구 검증으로 진행하지 않는다", async () => {
    const f = fixture(); const failure = new Error("요청한 원고의 제목이 나타나지 않았습니다.");
    vi.spyOn(f.heading, "waitFor").mockRejectedValue(failure);
    await expect(openStudioReviewHost(f.page, origin, "review-work")).rejects.toBe(failure);
    expect(prepareFilterMenuWorkspace).not.toHaveBeenCalled();
  });

  it.each(["project", "layers"])("%s 도구 준비 실패를 숨기지 않는다", async (phase) => {
    const f = fixture(); const failure = new Error("현재 도구 준비 실패");
    vi.mocked(phase === "project" ? prepareFilterMenuWorkspace : openStudioLayerNavigator).mockRejectedValue(failure);
    await expect(openStudioReviewHost(f.page, origin, "review-work")).rejects.toBe(failure);
    if (phase === "project") expect(openStudioLayerNavigator).not.toHaveBeenCalled();
  });
});

function captureFixture() {
  const calls: string[] = [];
  const state = { projectOpen: false, captureRequested: false, sourceSaved: false };
  const receipt = {
    waitFor: async (options: { timeout: number }) => {
      expect(options.timeout).toBe(60_000);
      expect(state.sourceSaved).toBe(true);
      calls.push("fixed-capture-ready");
    },
  };
  const page = {
    getByRole: (role: string, options: { name: string; exact: boolean }) => {
      expect(role).toBe("button"); expect(options.exact).toBe(true);
      if (options.name === "저장된 원고로 검수본 만들기") return {
        click: async () => {
          expect(state.projectOpen).toBe(true); state.captureRequested = true; calls.push("request-capture");
        },
      };
      if (options.name === "저장 후 다시 확인") return {
        click: async () => {
          expect(state.captureRequested).toBe(true); state.sourceSaved = true; calls.push("save-source");
        },
      };
      throw new Error(`현재 제품에 없는 진입점: ${role} ${options.name}`);
    },
    getByText: (text: string, options: { exact: boolean }) => {
      expect(text).toBe("고정 검수본이 준비됐어요."); expect(options.exact).toBe(true); return receipt;
    },
  } as unknown as Page;
  vi.mocked(openStudioProjectCenter).mockImplementation(async (actualPage) => {
    expect(actualPage).toBe(page); state.projectOpen = true; calls.push("project-center");
    return {} as Locator;
  });
  return { page, calls, receipt };
}

describe("현재 프로젝트 메뉴를 통한 실제 검수 캡처 요청", () => {
  it("프로젝트 창을 연 뒤 저장된 원고 캡처와 저장 완료 증거를 순서대로 확인한다", async () => {
    const f = captureFixture();
    await requestStudioReviewHostCapture(f.page);
    expect(f.calls).toEqual(["project-center", "request-capture", "save-source", "fixed-capture-ready"]);
    expect(openStudioProjectCenter).toHaveBeenCalledExactlyOnceWith(f.page);
  });

  it("프로젝트 진입 실패가 있으면 캡처나 원고 저장을 요청하지 않는다", async () => {
    const f = captureFixture(); const failure = new Error("프로젝트 창이 열리지 않았습니다.");
    vi.mocked(openStudioProjectCenter).mockRejectedValue(failure);
    await expect(requestStudioReviewHostCapture(f.page)).rejects.toBe(failure);
    expect(f.calls).toEqual([]);
  });

  it("원고를 저장해도 고정 검수본의 준비 증거가 없으면 실패한다", async () => {
    const f = captureFixture(); const failure = new Error("고정 검수본 준비 증거가 없습니다.");
    vi.spyOn(f.receipt, "waitFor").mockRejectedValue(failure);
    await expect(requestStudioReviewHostCapture(f.page)).rejects.toBe(failure);
    expect(f.calls).toEqual(["project-center", "request-capture", "save-source"]);
  });
});
