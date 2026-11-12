// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioBrushLabPage } from "./StudioBrushLabPage";

vi.mock("./StudioBrushIntegratedWorkbench", () => ({
  StudioBrushIntegratedWorkbench: ({ scope }: { scope: string }) => (
    <div data-testid="brush-integrated-workbench">{scope}</div>
  ),
}));
vi.mock("./StudioBrushProductCataloguePanel", () => ({
  StudioBrushProductCataloguePanel: () => <div data-testid="brush-catalogue-panel" />,
}));
vi.mock("../drawing/StudioTextureToneLab", () => ({
  StudioTextureToneLab: () => <div data-testid="texture-tone-lab" />,
}));

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

function renderBrushLab(entry = "/studio/brush-lab") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <StudioBrushLabPage />
    </MemoryRouter>,
  );
}

describe("StudioBrushLabPage — REA 습식 안료 & 스타일러스 커브 워크벤치", () => {
  it("벤치마크 배지와 기본 커널·스타일러스 곡선 상태를 표시한다", () => {
    renderBrushLab();
    const bar = screen.getByTestId("brush-lab-rea-wetmix-wgsl-bar");
    expect(bar.textContent).toContain("Procreate Brush Studio · Clip Studio .sut · Krita .kpp · Rebelle 7 Wet Mix");

    expect(screen.getByTestId("brush-lab-rea-kernel-dual-tip-multiply").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("brush-lab-rea-curve-scurve-soft-ink").getAttribute("aria-pressed")).toBe("true");

    const status = screen.getByTestId("brush-lab-rea-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("dual-tip-multiply");
    expect(status.textContent).toContain("scurve-soft-ink");
  });

  it("커널 모드와 스타일러스 곡선을 전환하면 aria-pressed 와 실시간 상태가 갱신된다", () => {
    renderBrushLab();

    fireEvent.click(screen.getByTestId("brush-lab-rea-kernel-rebelle-wet-pigment"));
    expect(screen.getByTestId("brush-lab-rea-kernel-rebelle-wet-pigment").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("brush-lab-rea-kernel-dual-tip-multiply").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("brush-lab-rea-status").textContent).toContain("rebelle-wet-pigment");

    fireEvent.click(screen.getByTestId("brush-lab-rea-kernel-gpen-velocity-taper"));
    expect(screen.getByTestId("brush-lab-rea-kernel-gpen-velocity-taper").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("brush-lab-rea-status").textContent).toContain("gpen-velocity-taper");

    fireEvent.click(screen.getByTestId("brush-lab-rea-curve-linear-precision"));
    expect(screen.getByTestId("brush-lab-rea-curve-linear-precision").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("brush-lab-rea-curve-scurve-soft-ink").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("brush-lab-rea-status").textContent).toContain("linear-precision");

    fireEvent.click(screen.getByTestId("brush-lab-rea-curve-heavy-chisel-tilt"));
    expect(screen.getByTestId("brush-lab-rea-curve-heavy-chisel-tilt").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("brush-lab-rea-status").textContent).toContain("heavy-chisel-tilt");
  });

  it("Wave 37/38 플래그십 레시피 전환 및 원고 캔버스 빠른 선반 원클릭 고정 배치가 동작한다", async () => {
    renderBrushLab();
    expect(screen.getByTestId("brush-lab-wave37-metrics").textContent).toContain("csp-real-gpen-aa");
    fireEvent.click(screen.getByTestId("brush-lab-wave37-recipe-calligraphy-barrel-twist-nib"));
    expect(
      screen.getByTestId("brush-lab-wave37-recipe-calligraphy-barrel-twist-nib").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("brush-lab-wave37-metrics").textContent).toContain("calligraphy-barrel-twist-nib");

    fireEvent.click(screen.getByTestId("brush-lab-pin-favorites-btn"));
    const pinnedStatus = await screen.findByTestId("brush-lab-pin-favorites-status");
    expect(pinnedStatus.textContent).toContain("6종 고정 완료");
  });

  it("en 로케일에서는 한글이 전혀 포함되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    renderBrushLab();
    const bar = screen.getByTestId("brush-lab-rea-wetmix-wgsl-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("brush-lab-rea-status").textContent).toContain("Kernel:");

    const wave37Panel = screen.getByTestId("brush-lab-wave37-stroke-refinement-panel");
    expect(wave37Panel.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("brush-lab-wave37-metrics").textContent).toContain("Recipe:");
  });
});
