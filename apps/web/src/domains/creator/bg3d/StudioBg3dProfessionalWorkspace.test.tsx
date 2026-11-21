// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveStudioRoute } from "../studio-router/studio-route-manifest";

import { STUDIO_BG3D_HERO_V1_ENTRIES } from "./studio-bg3d-hero-v1-catalog-entries";
import { StudioBg3dProfessionalWorkspace } from "./StudioBg3dProfessionalWorkspace";
import {
  DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
  STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LEGACY_STORAGE_KEY,
  normalizeStudioBg3dProfessionalWorkspaceLayout,
  readStudioBg3dProfessionalWorkspaceLayout,
  setStudioBg3dWorkspacePanelWidth,
  studioBg3dProfessionalWorkspaceStorageKey,
} from "./studio-bg3d-professional-workspace-layout";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Studio BG3D professional workspace layout", () => {
  it("normalizes corrupt values and migrates v1 widths", () => {
    expect(normalizeStudioBg3dProfessionalWorkspaceLayout(null)).toEqual(
      DEFAULT_STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LAYOUT,
    );
    expect(normalizeStudioBg3dProfessionalWorkspaceLayout({
      version: 1,
      outlinerWidth: 9999,
      inspectorWidth: -50,
    })).toEqual({
      version: 2,
      outlinerWidth: 420,
      inspectorWidth: 320,
      outlinerVisible: true,
      inspectorVisible: true,
      dockOrder: "outliner-viewport-inspector",
      preset: "custom",
    });
  });

  it("restores legacy settings into a project-scoped v2 workspace", () => {
    window.localStorage.setItem(
      STUDIO_BG3D_PROFESSIONAL_WORKSPACE_LEGACY_STORAGE_KEY,
      JSON.stringify({ version: 1, outlinerWidth: 312, inspectorWidth: 448 }),
    );
    const restored = readStudioBg3dProfessionalWorkspaceLayout(
      window.localStorage,
      "project-a",
    );
    expect(restored).toMatchObject({
      version: 2,
      outlinerWidth: 312,
      inspectorWidth: 448,
      preset: "custom",
    });
    expect(setStudioBg3dWorkspacePanelWidth(restored, "outliner", 100)).toMatchObject({
      outlinerWidth: 240,
      inspectorWidth: 448,
      preset: "custom",
    });
  });

  it("supports keyboard resize, dock controls, presets, and scoped persistence", async () => {
    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <StudioBg3dProfessionalWorkspace
          scopeKey="project-a:scene-1"
          outliner={<div>장면 계층</div>}
          viewport={<main>뷰포트</main>}
          inspector={<aside>속성</aside>}
        />
      </MemoryRouter>,
    );

    const outlinerSeparator = screen.getByRole("separator", { name: "장면 계층 패널 너비" });
    const inspectorSeparator = screen.getByRole("separator", { name: "속성 패널 너비" });
    expect(outlinerSeparator.getAttribute("aria-valuenow")).toBe("280");
    expect(inspectorSeparator.getAttribute("aria-valuenow")).toBe("360");

    fireEvent.keyDown(outlinerSeparator, { key: "ArrowRight" });
    fireEvent.keyDown(inspectorSeparator, { key: "ArrowLeft", shiftKey: true });
    expect(outlinerSeparator.getAttribute("aria-valuenow")).toBe("296");
    expect(inspectorSeparator.getAttribute("aria-valuenow")).toBe("392");

    fireEvent.click(screen.getByRole("button", { name: "좌우 바꾸기" }));
    fireEvent.click(screen.getByRole("button", { name: "계층" }));
    expect(screen.queryByRole("separator", { name: "장면 계층 패널 너비" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "캐릭터" }));
    expect(screen.getByRole("button", { name: "캐릭터" }).getAttribute("aria-pressed")).toBe("true");
    expect(
      screen.getByRole("separator", { name: "장면 계층 패널 너비" }).getAttribute("aria-valuenow"),
    ).toBe("260");
    expect(
      screen.getByRole("separator", { name: "속성 패널 너비" }).getAttribute("aria-valuenow"),
    ).toBe("440");

    await waitFor(() => {
      const serialized = window.localStorage.getItem(
        studioBg3dProfessionalWorkspaceStorageKey("project-a:scene-1"),
      );
      expect(serialized).not.toBeNull();
      expect(JSON.parse(serialized ?? "null")).toMatchObject({
        version: 2,
        preset: "character",
        outlinerWidth: 260,
        inspectorWidth: 440,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "집중" }));
    expect(screen.queryByRole("separator")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "기본 배치" }));
    expect(screen.getAllByRole("separator")).toHaveLength(2);

    const shelfToggle = screen.getByRole("button", { name: "에셋 쉘프" });
    expect(shelfToggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("studio-bg3d-asset-shelf")).toBeNull();

    fireEvent.click(shelfToggle);
    expect(shelfToggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-bg3d-asset-shelf")).toBeTruthy();

    fireEvent.click(shelfToggle);
    expect(shelfToggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("studio-bg3d-asset-shelf")).toBeNull();

    fireEvent.click(shelfToggle);
    expect(shelfToggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("studio-bg3d-asset-shelf")).toBeTruthy();

    const dccBar = screen.getByTestId("studio-bg3d-dcc-mode-bar");
    expect(within(dccBar).getByRole("link", { name: "스컬프트" }).getAttribute("href"))
      .toBe("/studio/3d/dcc/sculpt");
    const companionHref = within(dccBar).getByRole("link", { name: "보조기기 컴패니언" }).getAttribute("href");
    if (!companionHref) throw new Error("컴패니언 이동 주소가 없습니다.");
    const companionUrl = new URL(companionHref, "https://toonstudio.test");
    expect(resolveStudioRoute({ pathname: companionUrl.pathname, search: companionUrl.search }))
      .toMatchObject({ kind: "companion", surface: "workspace" });

    const shelf = screen.getByTestId("studio-bg3d-asset-shelf");
    expect(within(shelf).queryByRole("button", { name: /Split-Wipe/u })).toBeNull();
    expect(within(shelf).getByTestId("studio-bg3d-bake-to-panel-cta").tagName).toBe("BUTTON");
    expect(within(shelf).getByTestId("studio-bg3d-bake-to-panel-cta").textContent)
      .toContain("현재 컷에 바로 굽기");

    // 4단계 모드가 실제 상태 전환 버튼으로 동작하고, 에셋 카드는 페이지 이동 없이 현재 씬에 즉시 배치된다.
    const classroomCard = within(shelf).getByTestId("studio-bg3d-shelf-item-room-classroom");
    expect(classroomCard.tagName).toBe("BUTTON");
    expect(classroomCard.textContent).toContain("씬에 배치");
    fireEvent.click(classroomCard);
    expect(classroomCard.getAttribute("aria-pressed")).toBe("true");
    expect(classroomCard.textContent).toContain("배치됨");
    expect(within(shelf).getByTestId("studio-bg3d-asset-shelf-status").textContent).toContain("학교 교실·복도 모듈");

    fireEvent.click(within(shelf).getByTestId("studio-bg3d-stage-step-ink"));
    expect(within(shelf).getByTestId("studio-bg3d-stage-step-ink").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-bg3d-professional-viewport='true']")?.getAttribute("data-bg3d-live-ink-mode")).toBe("split-wipe");

    expect(screen.getByRole("link", { name: "새 웹툰 시작하기" }).getAttribute("href"))
      .toBe("/studio/new?template=webtoon&from=bg3d-cut");

    fireEvent.click(screen.getByRole("button", { name: "캐릭터·포즈" }));
    expect(screen.getByText("기본 체형 더미·포즈 릭")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "쉘프 접기" }));
    expect(screen.queryByTestId("studio-bg3d-asset-shelf")).toBeNull();
  });

  it("supports Live Ink split-wipe preview controls and non-destructive manuscript cut baking with Rights BOM provenance", () => {
    const bakedLayers: unknown[] = [];
    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <StudioBg3dProfessionalWorkspace
          scopeKey="project-a:scene-ink"
          outliner={<div>장면 계층</div>}
          viewport={<main data-testid="bg3d-main-viewport">뷰포트</main>}
          inspector={<aside>속성</aside>}
          targetDocumentId="doc-ep-1"
          targetCutIndex={2}
          captureSnapshot={{
            sceneId: "classroom-01",
            cameraId: "cam-hero",
            stage: "live-ink",
            widthPx: 1600,
            heightPx: 2400,
            inkPassRef: "blob:ink-pass-1",
            shadedPassRef: "blob:shaded-pass-1",
            inkLineWeightPx: 1.8,
            assetIds: ["asset-classroom", "asset-desk", "asset-classroom"],
            capturedAt: "2026-11-20T03:00:00.000Z",
          }}
          onBakeToManuscriptCut={(layer) => bakedLayers.push(layer)}
        />
      </MemoryRouter>,
    );

    const viewportHost = document.querySelector("[data-bg3d-professional-viewport='true']");
    expect(viewportHost?.getAttribute("data-bg3d-live-ink-mode")).toBe("shaded-3d");

    fireEvent.click(screen.getByRole("button", { name: "선화 분할 비교" }));
    expect(viewportHost?.getAttribute("data-bg3d-live-ink-mode")).toBe("split-wipe");
    expect(screen.getByTestId("studio-bg3d-split-wipe-readout").textContent).toBe("50%");

    fireEvent.change(screen.getByLabelText("선화 분할 비교 비율"), { target: { value: "65" } });
    expect(screen.getByTestId("studio-bg3d-split-wipe-readout").textContent).toBe("65%");
    expect(viewportHost?.getAttribute("data-bg3d-split-wipe-ratio")).toBe("0.65");

    fireEvent.click(screen.getByTestId("studio-bg3d-bake-to-cut"));
    expect(bakedLayers).toHaveLength(1);
    expect(bakedLayers[0]).toMatchObject({
      targetDocumentId: "doc-ep-1",
      targetCutIndex: 2,
      nonDestructive: true,
      previewMode: "split-wipe",
      splitWipeRatio: 0.65,
      rightsBomAssetIds: ["asset-classroom", "asset-desk"],
    });
    expect(screen.getByTestId("studio-bg3d-bake-status").textContent).toContain("컷 #3");
    expect(screen.getByTestId("studio-bg3d-bake-status").textContent).toContain("출처 소재 2건");
  });

  it("auto-selects hero-v1 mobile GLB with savings badge and wires collapsed wall cutaway toggle to live evaluation", async () => {
    const onSelectHeroAsset = vi.fn();
    const onWallCutawayChange = vi.fn();

    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <StudioBg3dProfessionalWorkspace
          scopeKey="project-a:hero-cutaway"
          outliner={<div>장면 계층</div>}
          viewport={<main>뷰포트</main>}
          inspector={<aside>속성</aside>}
          heroViewportWidthPx={390}
          heroCamera={{ position: [0, 3.6, 6] as const, target: [0, 1.2, 0] as const }}
          onSelectHeroAsset={onSelectHeroAsset}
          onWallCutawayChange={onWallCutawayChange}
        />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("bg3d-wall-cutaway-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(disclosure.getAttribute("data-bg3d-delivery-tier")).toBe("mobile");
    expect(disclosure.getAttribute("data-bg3d-delivery-url")).toBe(
      "/assets/3d/environments/hero-v1/kr_modern_apartment_living-mobile.glb",
    );
    const aptEntry = STUDIO_BG3D_HERO_V1_ENTRIES.find((e) => e.slug === "kr_modern_apartment_living")!;
    const cafeEntry = STUDIO_BG3D_HERO_V1_ENTRIES.find((e) => e.slug === "kr_atelier_cafe_interior")!;
    const expectedCafeSavedBytes = cafeEntry.desktopAsset.byteSize - cafeEntry.mobileAsset.byteSize;
    const expectedCafeSavedPercent = Math.round((expectedCafeSavedBytes / cafeEntry.desktopAsset.byteSize) * 1000) / 10;

    expect(Number(disclosure.getAttribute("data-bg3d-saved-bytes"))).toBe(
      aptEntry.desktopAsset.byteSize - aptEntry.mobileAsset.byteSize,
    );
    expect(screen.getByTestId("bg3d-hero-delivery-badge").textContent).toContain("모바일 경량");
    expect(screen.getByTestId("bg3d-hero-delivery-badge").textContent).toContain("절감");
    expect(screen.queryByTestId("studio-bg3d-wall-cutaway-toggle")).toBeNull();

    fireEvent.click(screen.getByTestId("bg3d-wall-cutaway-summary"));
    const cutawayToggle = await screen.findByTestId("studio-bg3d-wall-cutaway-toggle");
    expect(disclosure.open).toBe(true);
    expect(within(cutawayToggle).getByRole("switch", { name: /카메라 앞벽 자동 투명화/u })).toBeTruthy();

    fireEvent.click(screen.getByTestId("bg3d-hero-scene-kr_atelier_cafe_interior"));
    expect(onSelectHeroAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "mobile",
        savedBytes: expectedCafeSavedBytes,
        savedPercent: expectedCafeSavedPercent,
        asset: expect.objectContaining({
          id: "ts-bg3d-hero-v1-kr_atelier_cafe_interior-mobile",
          url: "/assets/3d/environments/hero-v1/kr_atelier_cafe_interior-mobile.glb",
        }),
      }),
    );

    fireEvent.click(within(cutawayToggle).getByRole("button", { name: /남벽 숨김 중/u }));
    expect(onWallCutawayChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cutawayCapable: true,
        config: expect.objectContaining({ lockedVisibleWalls: ["south"] }),
        evaluation: expect.objectContaining({
          visibleWalls: expect.arrayContaining(["south"]),
        }),
      }),
    );
  });

  it("wires SplitWipeOverlay, X ground snap, 180-degree lock, radial pie menu, template pose transfer, LT style builder, and light switchboard", async () => {
    const onGroundSnap = vi.fn();
    const onSelectReverseShot = vi.fn();
    const onTransferTemplatePose = vi.fn();

    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <StudioBg3dProfessionalWorkspace
          scopeKey="project-a:pro-staging"
          outliner={<div>장면 계층</div>}
          viewport={<main data-testid="bg3d-pro-viewport">뷰포트</main>}
          inspector={<aside>속성</aside>}
          onGroundSnap={onGroundSnap}
          onSelectReverseShot={onSelectReverseShot}
          onTransferTemplatePose={onTransferTemplatePose}
        />
      </MemoryRouter>,
    );

    // 1. 단축키 X 지면 접지 실동작 확인
    fireEvent.keyDown(window, { key: "x" });
    expect(onGroundSnap).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("studio-bg3d-bake-status").textContent).toContain("지면 접지");

    // 2. 선화 분할 비교 시 Lazy StudioSplitWipeOverlay 마운트 및 비율 동기화 확인
    fireEvent.click(screen.getByRole("button", { name: "선화 분할 비교" }));
    const splitWipe = await screen.findByRole("slider", { name: /3D 음영과 라이브 선화 비교 분할선/u });
    expect(splitWipe.getAttribute("aria-valuenow")).toBe("50");
    fireEvent.keyDown(splitWipe, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByTestId("studio-bg3d-split-wipe-readout").textContent).toBe("60%");

    // 3. 3D 방사형 파이 메뉴 (Q / 버튼) 열기
    fireEvent.click(screen.getByTestId("studio-bg3d-radial-pie-btn"));
    expect(await screen.findByTestId("studio-3d-radial-pie-menu")).toBeTruthy();

    // 4. 연출·조명 도구 드로어(180도 리버스샷, 포즈 전이, 손그림 LT, 광원 스위치보드)
    fireEvent.click(screen.getByTestId("studio-bg3d-pro-staging-btn"));
    const drawer = await screen.findByTestId("studio-bg3d-pro-staging-drawer");
    expect(drawer).toBeTruthy();

    fireEvent.click(within(drawer).getByTestId("bg3d-pro-shot-shot-ots-b-to-a"));
    expect(onSelectReverseShot).toHaveBeenCalledWith(
      expect.objectContaining({ id: "shot-ots-b-to-a", halfPlaneSide: 1 }),
    );

    fireEvent.click(within(drawer).getByTestId("bg3d-pro-pose-tpl-dialogue-confront"));
    expect(onTransferTemplatePose).toHaveBeenCalledWith(
      expect.objectContaining({
        preservedAppearanceKeys: expect.arrayContaining(["characterId", "hairPresetId", "outfitSlots"]),
        transferredChannels: expect.arrayContaining(["pose", "expression", "lookAt"]),
      }),
    );
    expect(within(drawer).getByTestId("bg3d-pro-lt-readout").textContent).toContain("스트로크");

    const chandelierToggle = within(drawer).getByTestId("bg3d-pro-light-group-grp-chandelier");
    expect(chandelierToggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(chandelierToggle);
    expect(chandelierToggle.getAttribute("aria-pressed")).toBe("false");
  });
});
