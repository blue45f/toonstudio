// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioActiveBrushSummary } from "../StudioActiveBrushSummary";

afterEach(cleanup);

const commonProps = {
  color: "#111111",
  opacity: 0.94,
  stabilizer: 6,
  stabilizerMode: "adaptive" as const,
  strokeWidth: 26,
};

describe("StudioActiveBrushSummary", () => {
  it("renders exact core runtime semantics without loading the full catalogue", () => {
    render(
      <StudioActiveBrushSummary
        {...commonProps}
        brushId="pen"
        brushName="펜(매끈)"
      />
    );

    const summary = screen.getByText("펜(매끈)").closest("[data-studio-active-brush-summary]");
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("ready");
    expect(summary?.getAttribute("aria-busy")).toBeNull();
    expect(summary?.getAttribute("data-studio-brush-runtime-id")).toBe("pen");
    expect(summary?.getAttribute("data-studio-brush-runtime-engine")).toBe("causal-ink");
    expect(summary?.getAttribute("data-studio-brush-runtime-tip")).toBe("round");
    expect(summary?.getAttribute("data-studio-brush-runtime-texture")).toBe("none");
    expect(summary?.getAttribute("data-studio-brush-runtime-dynamics")).toBe("causal-pressure");
    expect(summary?.getAttribute("data-studio-brush-semantic-source")).toBe("runtime-contract");
    expect(screen.getByText("펜·잉크 · 원형 촉")).toBeTruthy();
    expect(screen.getByText("매끈 · 필압 추종")).toBeTruthy();
  });

  it("uses the true angled-ribbon tip instead of a preview-style fallback", () => {
    render(
      <StudioActiveBrushSummary
        {...commonProps}
        brushId="brush"
        brushName="브러시"
      />
    );

    const summary = screen.getByText("브러시").closest("[data-studio-active-brush-summary]");
    expect(summary?.getAttribute("data-studio-brush-runtime-engine")).toBe("angled-ribbon");
    expect(summary?.getAttribute("data-studio-brush-runtime-tip")).toBe("angled-ribbon");
    expect(summary?.getAttribute("data-studio-brush-runtime-dynamics")).toBe("ribbon-pressure");
    expect(screen.getByText(/방향성 리본 촉/u)).toBeTruthy();
    expect(screen.getByText("매끈 · 리본 필압")).toBeTruthy();
    expect(screen.queryByText(/브러시 · 원형 촉/u)).toBeNull();
  });

  it("uses an honest loading state before resolving deferred pro metadata", async () => {
    render(
      <StudioActiveBrushSummary
        {...commonProps}
        brushId="heart-stamp"
        brushName="하트 도장"
      />
    );

    const summary = screen.getByText("하트 도장").closest("[data-studio-active-brush-summary]");
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("loading");
    expect(summary?.getAttribute("aria-busy")).toBe("true");
    expect(summary?.getAttribute("data-studio-brush-semantic-source")).toBe("preview-fallback");
    expect(screen.getByText("프로 브러시 · 정보 불러오는 중")).toBeTruthy();
    expect(screen.queryByText(/사용자 · 원형 촉/u)).toBeNull();

    await act(() => vi.dynamicImportSettled());
    expect(await screen.findByText("질감 · 소프트 입자 촉")).toBeTruthy();
    expect(screen.getByText("알파 질감 · 다중 매핑")).toBeTruthy();
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("loaded");
    expect(summary?.getAttribute("aria-busy")).toBeNull();
    expect(summary?.getAttribute("data-studio-brush-runtime-id")).toBe("ink-particle");
    expect(summary?.getAttribute("data-studio-brush-runtime-engine")).toBe("dynamic-dabs");
    expect(summary?.getAttribute("data-studio-brush-runtime-tip")).toBe("soft-particle");
    expect(summary?.getAttribute("data-studio-brush-runtime-texture")).toBe("custom-alpha-capable");
    expect(summary?.getAttribute("data-studio-brush-runtime-dynamics")).toBe("mapped-dabs");
    expect(summary?.getAttribute("data-studio-brush-semantic-source")).toBe("runtime-contract");
  });

  it("resolves deferred V6 preset name and media/tip metadata instead of falling back to user round tip", async () => {
    render(
      <StudioActiveBrushSummary
        {...commonProps}
        brushId="v6:rebelle-capillary-wash"
        brushName="v6:rebelle-capillary-wash"
      />
    );

    const summary = document.querySelector("[data-studio-active-brush-summary]");
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("loading");
    expect(screen.queryByText(/사용자 · 원형 촉/u)).toBeNull();

    await act(() => vi.dynamicImportSettled());
    expect(await screen.findByText(/모세관 꽃양배추 수채 워시/u)).toBeTruthy();
    expect(summary?.getAttribute("data-studio-brush-metadata-state")).toBe("loaded");
    expect(summary?.textContent).toContain("수채·수묵");
  });
});
