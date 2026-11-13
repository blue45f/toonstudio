// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import * as favoriteSlotsModule from "../brush/studio-competitor-favorite-slots";
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
  vi.restoreAllMocks();
  useI18n.setState({ lang: "ko" });
});

function renderBrushLab(entry = "/studio/brush-lab") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <StudioBrushLabPage />
      <RouteProbe />
    </MemoryRouter>,
  );
}

function RouteProbe() {
  const location = useLocation(), navigate = useNavigate();
  return <><output data-testid="route">{location.pathname}{location.search}{location.hash}</output><button onClick={() => navigate(-1)}>검증용 뒤로</button></>;
}

describe("StudioBrushLabPage — REA 습식 안료 & 스타일러스 커브 워크벤치", () => {
  it("벤치마크 배지와 기본 커널·스타일러스 곡선 상태를 표시한다", () => {
    renderBrushLab("/studio/brush-lab?brushTask=engine");
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
    renderBrushLab("/studio/brush-lab?brushTask=engine");

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

  it("작업별 URL은 기존 문맥과 hash를 유지하고 뒤로가기·포커스와 미저장 편집 인스턴스를 보존한다", () => {
    renderBrushLab("/studio/brush-lab?project=p1#brush");
    expect(screen.queryByRole("button", { name: /습식 안료/ })).toBeNull();
    const workbench = screen.getByTestId("brush-integrated-workbench");
    expect(workbench.closest("[hidden]")).not.toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "브러시 조절" }));
    expect(screen.getByTestId("route").textContent).toBe("/studio/brush-lab?project=p1&brushTask=edit#brush");
    expect(workbench.closest("[hidden]")).toBeNull();
    expect(document.activeElement?.textContent).toBe("브러시 조절");
    fireEvent.click(screen.getByRole("link", { name: "입력·엔진" }));
    expect(workbench.closest("[hidden]")).not.toBeNull();
    expect(screen.getByTestId("brush-lab-rea-wetmix-wgsl-bar").closest("[hidden]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "검증용 뒤로" }));
    expect(screen.getByTestId("route").textContent).toContain("brushTask=edit#brush");
    expect(screen.getByTestId("brush-integrated-workbench")).toBe(workbench);
    expect(workbench.closest("[hidden]")).toBeNull();
  });

  it("Wave 37/38 플래그십 레시피 키보드(방향키·숫자키 1~6) 전환 및 빠른 선반 고정·순서 복원이 동작한다", async () => {
    renderBrushLab();
    const firstRecipeBtn = screen.getByTestId("brush-lab-wave37-recipe-csp-real-gpen-aa");
    expect(firstRecipeBtn.tabIndex).toBe(0);
    expect(screen.getByTestId("brush-lab-wave37-recipe-csp-dual-chalk-ink-liner").tabIndex).toBe(-1);

    fireEvent.keyDown(firstRecipeBtn, { key: "ArrowRight" });
    expect(
      screen.getByTestId("brush-lab-wave37-recipe-csp-dual-chalk-ink-liner").getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.keyDown(screen.getByTestId("brush-lab-wave37-recipe-csp-dual-chalk-ink-liner"), {
      key: "3",
    });
    expect(
      screen.getByTestId("brush-lab-wave37-recipe-calligraphy-barrel-twist-nib").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("brush-lab-wave37-metrics").textContent).toContain(
      "calligraphy-barrel-twist-nib",
    );

    fireEvent.click(screen.getByTestId("brush-lab-pin-favorites-btn"));
    const pinnedStatus = await screen.findByTestId("brush-lab-pin-favorites-status");
    expect(pinnedStatus.getAttribute("role")).toBe("status");
    expect(pinnedStatus.textContent).toContain("6종 고정 완료");

    const spy = vi.spyOn(favoriteSlotsModule, "pinStudioCompetitorFavoritesToProductRepository");
    fireEvent.click(screen.getByTestId("brush-lab-restore-favorites-order-btn"));
    await screen.findByTestId("brush-lab-pin-favorites-status");
    expect(spy).toHaveBeenCalledWith(undefined, { resetCustomizations: true });
  });

  it("저장소 영속화 실패(memory-only) 시 영구 저장 완료로 가장하지 않고 role=alert 복구 안내를 표시한다", async () => {
    vi.spyOn(
      favoriteSlotsModule,
      "pinStudioCompetitorFavoritesToProductRepository",
    ).mockResolvedValueOnce({
      status: "memory-only",
      durable: false,
      pinnedCount: 6,
      collapsedDuplicateCount: 0,
      quickShelfIds: [],
      brushes: favoriteSlotsModule.buildStudioCompetitorFavoriteSlotBrushes(),
      failureCode: "storage-error",
    });

    renderBrushLab();
    fireEvent.click(screen.getByTestId("brush-lab-pin-favorites-btn"));
    const alertNode = await screen.findByTestId("brush-lab-pin-favorites-status");
    expect(alertNode.getAttribute("role")).toBe("alert");
    expect(alertNode.textContent).toContain("영구 저장하지 못하고");
  });

  it("en 로케일에서는 정상·오류 상태 모두 한글이 전혀 포함되지 않는다", async () => {
    useI18n.setState({ lang: "en" });
    vi.spyOn(
      favoriteSlotsModule,
      "pinStudioCompetitorFavoritesToProductRepository",
    ).mockResolvedValueOnce({
      status: "memory-only",
      durable: false,
      pinnedCount: 6,
      collapsedDuplicateCount: 0,
      quickShelfIds: [],
      brushes: favoriteSlotsModule.buildStudioCompetitorFavoriteSlotBrushes(),
      failureCode: "storage-error",
    });

    renderBrushLab();
    const bar = screen.getByTestId("brush-lab-rea-wetmix-wgsl-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("brush-lab-rea-status").textContent).toContain("Kernel:");

    fireEvent.click(screen.getByTestId("brush-lab-pin-favorites-btn"));
    await screen.findByTestId("brush-lab-pin-favorites-status");

    const wave37Panel = screen.getByTestId("brush-lab-wave37-stroke-refinement-panel");
    expect(wave37Panel.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByTestId("brush-lab-wave37-metrics").textContent).toContain("Recipe:");
  });
});
