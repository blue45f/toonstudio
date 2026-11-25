// @vitest-environment jsdom

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  ATELIER_TOTAL_BAKED_WEBP_COUNT,
  ATELIER_TOTAL_EXPERT_ENGINE_COUNT,
  CRAFT_STATION_CATALOG,
  CRAFT_WORKFLOW_STAGES,
  StudioAtelierCraftLauncherPanel,
  collectAllLauncherAtelierAssetPaths,
  computeCraftCatalogCounts,
  createInitialPinState,
  extractKoreanChoseong,
  filterCraftStations,
  getCraftStageById,
  getCraftStationById,
  isChoseongQuery,
  isCraftStationPinned,
  orderStationsWithPins,
  recommendNextCraftStations,
  searchCraftStations,
  togglePinnedCraftStation,
  type CraftRouteHref,
  type CraftStationId,
  type CraftWorkflowStageId,
} from "./index";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_PUBLIC_DIR = resolve(MODULE_DIR, "../../../../public");

describe("Wave 43D: 아틀리에 프로 도구 퀵 런처 (Atelier Craft Quick-Jump Showcase)", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 8대 창작 워크플로우 스테이션 카탈로그가 필수 8개 라우트·핵심 기능 3종·5대 단계를 모두 포함한다", () => {
    expect(CRAFT_STATION_CATALOG).toHaveLength(8);
    expect(CRAFT_WORKFLOW_STAGES).toHaveLength(5);

    const expectedRoutes: readonly CraftRouteHref[] = [
      "/studio/canvas",
      "/studio/character",
      "/studio/bg3d",
      "/studio/space",
      "/studio/comic",
      "/tech",
      "/compare/studio",
      "/production",
    ];
    expect(CRAFT_STATION_CATALOG.map((station) => station.href)).toEqual(expectedRoutes);

    const uniqueIds = new Set(CRAFT_STATION_CATALOG.map((station) => station.id));
    expect(uniqueIds.size).toBe(8);

    const coveredStages = new Set(CRAFT_STATION_CATALOG.map((station) => station.stageId));
    expect(coveredStages).toEqual(new Set(["conti", "drawing", "3d", "collab", "delivery"]));

    for (const station of CRAFT_STATION_CATALOG) {
      expect(station.highlightsKo).toHaveLength(3);
      expect(station.highlightsEn).toHaveLength(3);
      expect(station.shortcutHint.startsWith("Alt+")).toBe(true);
      expect(station.scope).toBe("catalog-reference");
      expect(station.routeMeaningKo).not.toBe("");
      expect(station).not.toHaveProperty("estimatedStartSeconds");
    }
  });

  it("2. 40종+ 전문가 엔진 합계 및 46종 사전 베이크 아틀리에 WebP 상수를 유지한다", () => {
    expect(ATELIER_TOTAL_EXPERT_ENGINE_COUNT).toBeGreaterThanOrEqual(40);
    expect(ATELIER_TOTAL_BAKED_WEBP_COUNT).toBe(46);
  });

  it("3. 모든 스테이션 WebP 경로가 studio-craft/cinema-ergo 하위에 속하며 디스크에 실존한다(CI sparse-checkout 안전)", () => {
    const assetPaths = collectAllLauncherAtelierAssetPaths();
    expect(assetPaths).toHaveLength(16);

    const allowedPrefixRe = /^\/assets\/atelier\/(studio-craft|cinema-ergo)\/[a-z0-9-]+\.webp$/u;
    for (const assetPath of assetPaths) {
      expect(allowedPrefixRe.test(assetPath), `허용되지 않은 에셋 경로: ${assetPath}`).toBe(true);
    }

    const catalogSrc = readFileSync(resolve(MODULE_DIR, "atelier-craft-catalog.ts"), "utf8");
    const literalPaths = catalogSrc.match(/\/assets\/atelier\/[a-z0-9/-]+\.webp/gu) ?? [];
    expect(new Set(literalPaths).size).toBe(16);

    const atelierRootDir = resolve(WEB_PUBLIC_DIR, "assets/atelier");
    if (existsSync(atelierRootDir)) {
      for (const webPath of new Set([...assetPaths, ...literalPaths])) {
        const diskPath = resolve(WEB_PUBLIC_DIR, webPath.replace(/^\//u, ""));
        expect(existsSync(diskPath), `디스크 누락 WebP: ${webPath}`).toBe(true);
        expect(statSync(diskPath).size).toBeGreaterThan(1024);
      }
    }
  });

  it("4. getCraftStageById와 getCraftStationById는 유효 ID를 조회하고 미등록 ID에는 예외를 던진다", () => {
    expect(getCraftStageById("conti").labelKo).toBe("콘티");
    expect(getCraftStationById("bg3d-solar-lighting").href).toBe("/studio/bg3d");
    expect(() => getCraftStageById("unknown" as CraftWorkflowStageId)).toThrow();
    expect(() => getCraftStationById("unknown" as CraftStationId)).toThrow();
  });

  it("5. filterCraftStations는 전체·5대 작업 단계·핀 필터 및 보조 단계 포함 옵션을 순수하게 처리한다", () => {
    const all = filterCraftStations(CRAFT_STATION_CATALOG, "all");
    expect(all).toHaveLength(8);
    expect(all).not.toBe(CRAFT_STATION_CATALOG);

    expect(filterCraftStations(CRAFT_STATION_CATALOG, "conti").map((s) => s.id)).toEqual([
      "webtoon-cut-lettering-cinema",
    ]);
    expect(filterCraftStations(CRAFT_STATION_CATALOG, "drawing").map((s) => s.id)).toEqual([
      "drawing-physical-ink",
      "color-script-p3",
    ]);
    expect(filterCraftStations(CRAFT_STATION_CATALOG, "3d").map((s) => s.id)).toEqual([
      "character-3d-hair",
      "bg3d-solar-lighting",
    ]);
    expect(filterCraftStations(CRAFT_STATION_CATALOG, "collab").map((s) => s.id)).toEqual([
      "virtual-studio-collab",
    ]);
    expect(filterCraftStations(CRAFT_STATION_CATALOG, "delivery").map((s) => s.id)).toEqual([
      "movingtoon-reels-delivery",
      "offline-resilience-settlement",
    ]);

    const contiWithSecondary = filterCraftStations(CRAFT_STATION_CATALOG, "conti", {
      includeSecondary: true,
    });
    expect(contiWithSecondary[0]?.id).toBe("webtoon-cut-lettering-cinema");
    expect(contiWithSecondary.length).toBeGreaterThan(1);

    const pinnedOnly = filterCraftStations(CRAFT_STATION_CATALOG, "pinned", {
      pinnedIds: ["color-script-p3", "bg3d-solar-lighting"],
    });
    expect(pinnedOnly.map((s) => s.id)).toEqual(["bg3d-solar-lighting", "color-script-p3"]);
  });

  it("6. extractKoreanChoseong과 isChoseongQuery는 한글 음절·자모·영숫자를 정확히 정규화한다", () => {
    expect(extractKoreanChoseong("드로잉·물리잉크")).toBe("ㄷㄹㅇㅁㄹㅇㅋ");
    expect(extractKoreanChoseong("3D 배경·태양광")).toBe("3dㅂㄱㅌㅇㄱ");
    expect(extractKoreanChoseong("컬러 스크립트·P3")).toBe("ㅋㄹㅅㅋㄹㅌp3");

    expect(isChoseongQuery("ㄷㄹㅇ")).toBe(true);
    expect(isChoseongQuery("ㄱㅅ ㅅㅌㄷㅇ")).toBe(true);
    expect(isChoseongQuery("드로잉")).toBe(false);
    expect(isChoseongQuery("P3")).toBe(false);
    expect(isChoseongQuery("   ")).toBe(false);
  });

  it("7. searchCraftStations는 한글 키워드로 관련 스테이션을 최상단에 랭킹한다", () => {
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "물리잉크")[0]?.id).toBe(
      "drawing-physical-ink",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "태양광")[0]?.id).toBe(
      "bg3d-solar-lighting",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "말풍선")[0]?.id).toBe(
      "webtoon-cut-lettering-cinema",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "정산")[0]?.id).toBe(
      "offline-resilience-settlement",
    );
  });

  it("8. searchCraftStations는 한글 초성 유사 검색(ㄷㄹㅇ·ㅌㅇㄱ·ㅋㄹ·ㅇㅍㄹㅇ·ㄱㅅㅅㅌㄷㅇ)을 정확히 찾는다", () => {
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "ㄷㄹㅇ")[0]?.id).toBe(
      "drawing-physical-ink",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "ㅌㅇㄱ")[0]?.id).toBe(
      "bg3d-solar-lighting",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "ㅋㄹ")[0]?.id).toBe("color-script-p3");
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "ㅇㅍㄹㅇ")[0]?.id).toBe(
      "offline-resilience-settlement",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "ㄱㅅㅅㅌㄷㅇ")[0]?.id).toBe(
      "virtual-studio-collab",
    );
  });

  it("9. searchCraftStations는 영문 키워드·라우트·단축키·축약 유사어(mvt)를 지원한다", () => {
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "bg3d")[0]?.id).toBe("bg3d-solar-lighting");
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "P3")[0]?.id).toBe("color-script-p3");
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "CRDT")[0]?.id).toBe(
      "offline-resilience-settlement",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "/studio/space")[0]?.id).toBe(
      "virtual-studio-collab",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "Alt+5")[0]?.id).toBe(
      "webtoon-cut-lettering-cinema",
    );
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "mvt")[0]?.id).toBe(
      "movingtoon-reels-delivery",
    );
  });

  it("10. searchCraftStations는 다중 토큰 AND 검색, 빈 쿼리 전체 반환, 무일치 빈 배열을 보장한다", () => {
    const multi = searchCraftStations(CRAFT_STATION_CATALOG, "3D 태양광");
    expect(multi.map((s) => s.id)).toEqual(["bg3d-solar-lighting"]);

    expect(searchCraftStations(CRAFT_STATION_CATALOG, "   ")).toHaveLength(8);
    expect(searchCraftStations(CRAFT_STATION_CATALOG, "존재하지않는키워드xyz")).toEqual([]);
  });

  it("11. recommendNextCraftStations는 5대 작업 단계별 다음 추천 스테이션과 자연스러운 한글 사유를 반환한다", () => {
    const stages: readonly CraftWorkflowStageId[] = [
      "conti",
      "3d",
      "drawing",
      "collab",
      "delivery",
    ];
    for (const stage of stages) {
      const items = recommendNextCraftStations(stage);
      expect(items).toHaveLength(3);
      for (const item of items) {
        expect(item.reasonKo.length).toBeGreaterThan(10);
        expect(item.reasonEn.length).toBeGreaterThan(10);
      }
    }

    const fromConti = recommendNextCraftStations("conti", {
      activeStationId: "bg3d-solar-lighting",
    });
    expect(fromConti.some((item) => item.station.id === "bg3d-solar-lighting")).toBe(false);
    expect(fromConti[0]?.station.id).toBe("character-3d-hair");
  });

  it("12. recommendNextCraftStations는 동일 우선순위 내 핀 고정 스테이션을 우선 추천한다", () => {
    const baseline = recommendNextCraftStations("conti", { limit: 2 });
    expect(baseline.map((i) => i.station.id)).toEqual([
      "bg3d-solar-lighting",
      "character-3d-hair",
    ]);

    const withPin = recommendNextCraftStations("conti", {
      pinnedIds: ["character-3d-hair"],
      limit: 2,
    });
    expect(withPin.map((i) => i.station.id)).toEqual([
      "character-3d-hair",
      "bg3d-solar-lighting",
    ]);
  });

  it("13. createInitialPinState와 togglePinnedCraftStation은 순수 불변 상태로 핀 추가·해제를 수행한다", () => {
    const initial = createInitialPinState([
      "drawing-physical-ink",
      "drawing-physical-ink",
      "color-script-p3",
    ]);
    expect(initial.pinnedIds).toEqual(["drawing-physical-ink", "color-script-p3"]);
    expect(initial.lastAction).toBe("init");

    const frozenCopy = [...initial.pinnedIds];
    const added = togglePinnedCraftStation(initial, "bg3d-solar-lighting");
    expect(initial.pinnedIds).toEqual(frozenCopy);
    expect(added.pinnedIds).toEqual([
      "drawing-physical-ink",
      "color-script-p3",
      "bg3d-solar-lighting",
    ]);
    expect(added.lastAction).toBe("pinned");
    expect(isCraftStationPinned(added, "bg3d-solar-lighting")).toBe(true);

    const removed = togglePinnedCraftStation(added, "color-script-p3");
    expect(removed.pinnedIds).toEqual(["drawing-physical-ink", "bg3d-solar-lighting"]);
    expect(removed.lastAction).toBe("unpinned");
    expect(isCraftStationPinned(removed, "color-script-p3")).toBe(false);
  });

  it("14. togglePinnedCraftStation은 최대 핀 한도 도달 시 limit-reached를 반환하고 기존 핀을 보존한다", () => {
    let state = createInitialPinState(["drawing-physical-ink", "character-3d-hair"], 2);
    state = togglePinnedCraftStation(state, "bg3d-solar-lighting");
    expect(state.lastAction).toBe("limit-reached");
    expect(state.pinnedIds).toEqual(["drawing-physical-ink", "character-3d-hair"]);
    expect(state.lastToggledId).toBe("bg3d-solar-lighting");
  });

  it("15. orderStationsWithPins와 computeCraftCatalogCounts는 핀 우선 정렬과 단계 합계 8을 보장한다", () => {
    const ordered = orderStationsWithPins(CRAFT_STATION_CATALOG, [
      "offline-resilience-settlement",
      "color-script-p3",
    ]);
    expect(ordered[0]?.id).toBe("offline-resilience-settlement");
    expect(ordered[1]?.id).toBe("color-script-p3");
    expect(ordered[2]?.id).toBe("drawing-physical-ink");

    const counts = computeCraftCatalogCounts(CRAFT_STATION_CATALOG, [
      "color-script-p3",
      "bg3d-solar-lighting",
    ]);
    expect(counts.all).toBe(8);
    expect(counts.pinned).toBe(2);
    expect(counts.conti + counts.drawing + counts["3d"] + counts.collab + counts.delivery).toBe(8);
  });

  it("16. StudioAtelierCraftLauncherPanel은 Props 없이 단독 렌더링되며 8개 카드와 실존 WebP 이미지를 표시한다", () => {
    render(<StudioAtelierCraftLauncherPanel />);
    expect(screen.getByTestId("atelier-craft-launcher-panel")).toBeTruthy();
    expect(screen.getByTestId("craft-launcher-summary-counts").textContent).toContain("8대 스테이션");
    expect(screen.getByTestId("craft-launcher-summary-counts").textContent).toContain("46종");

    for (const station of CRAFT_STATION_CATALOG) {
      expect(screen.getByTestId(`craft-station-card-${station.id}`)).toBeTruthy();
      const img = screen.getByTestId(`craft-station-thumb-${station.id}`) as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(station.thumbnailSrc);
    }
  });

  it("17. 상단 단계 필터 탭 클릭 시 해당 작업 단계 카드만 노출되고 aria-selected가 전환된다", () => {
    render(<StudioAtelierCraftLauncherPanel />);

    fireEvent.click(screen.getByTestId("craft-stage-tab-3d"));
    expect(screen.getByTestId("craft-stage-tab-3d").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("craft-stage-tab-all").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("craft-station-card-character-3d-hair")).toBeTruthy();
    expect(screen.getByTestId("craft-station-card-bg3d-solar-lighting")).toBeTruthy();
    expect(screen.queryByTestId("craft-station-card-drawing-physical-ink")).toBeNull();

    fireEvent.click(screen.getByTestId("craft-stage-tab-all"));
    expect(screen.getByTestId("craft-station-card-drawing-physical-ink")).toBeTruthy();
  });

  it("18. 검색바에서 한글 초성(ㄷㄹㅇ) 및 영문(bg3d) 입력과 검색어 지우기 버튼이 즉시 동작한다", () => {
    render(<StudioAtelierCraftLauncherPanel />);
    const input = screen.getByTestId("craft-launcher-search-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "ㄷㄹㅇ" } });
    expect(screen.getByTestId("craft-station-card-drawing-physical-ink")).toBeTruthy();
    expect(screen.queryByTestId("craft-station-card-bg3d-solar-lighting")).toBeNull();

    fireEvent.change(input, { target: { value: "bg3d" } });
    expect(screen.getByTestId("craft-station-card-bg3d-solar-lighting")).toBeTruthy();
    expect(screen.queryByTestId("craft-station-card-drawing-physical-ink")).toBeNull();

    fireEvent.click(screen.getByTestId("craft-launcher-search-clear"));
    expect(input.value).toBe("");
    expect(screen.getByTestId("craft-station-card-drawing-physical-ink")).toBeTruthy();
  });

  it("19. 검색 결과 0건일 때 빈 상태 안내와 필터·검색 초기화 버튼으로 8대 카드를 복구한다", () => {
    render(<StudioAtelierCraftLauncherPanel />);
    const input = screen.getByTestId("craft-launcher-search-input");

    fireEvent.change(input, { target: { value: "매칭없는검색어999" } });
    expect(screen.getByTestId("craft-launcher-empty")).toBeTruthy();

    fireEvent.click(screen.getByTestId("craft-launcher-reset-btn"));
    expect(screen.queryByTestId("craft-launcher-empty")).toBeNull();
    expect(screen.getByTestId("craft-station-card-offline-resilience-settlement")).toBeTruthy();
  });

  it("20. 카드 클릭 시 onSelectStation 콜백이 호출되고 하단 라우트 프리뷰·보조 WebP가 갱신된다", () => {
    const onSelect = vi.fn();
    render(<StudioAtelierCraftLauncherPanel onSelectStation={onSelect} />);

    fireEvent.click(screen.getByTestId("craft-station-select-webtoon-cut-lettering-cinema"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({
      id: "webtoon-cut-lettering-cinema",
      href: "/studio/comic",
    });
    expect(screen.getByTestId("craft-preview-href").textContent).toBe("/studio/comic");
    expect(screen.getByTestId("craft-preview-title").textContent).toBe("웹툰 컷·식자·시네마");
    expect(
      screen.getByTestId("craft-preview-secondary-img").getAttribute("src"),
    ).toBe("/assets/atelier/cinema-ergo/cinema-lens-golden.webp");
  });

  it("21. 즐겨찾기 핀 토글, 핀 탭 필터링, 최대 핀 한도 알림이 불변 상태로 동작한다", () => {
    const onPinnedChange = vi.fn();
    render(
      <StudioAtelierCraftLauncherPanel
        maxPinned={2}
        onPinnedChange={onPinnedChange}
      />,
    );

    const pinColorBtn = screen.getByTestId("craft-station-pin-color-script-p3");
    expect(pinColorBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(pinColorBtn);
    expect(pinColorBtn.getAttribute("aria-pressed")).toBe("true");
    expect(onPinnedChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pinnedIds: ["color-script-p3"],
        lastAction: "pinned",
      }),
    );

    fireEvent.click(screen.getByTestId("craft-station-pin-bg3d-solar-lighting"));
    fireEvent.click(screen.getByTestId("craft-station-pin-virtual-studio-collab"));
    expect(screen.getByTestId("craft-launcher-status").textContent).toContain("최대 2개");

    fireEvent.click(screen.getByTestId("craft-stage-tab-pinned"));
    expect(screen.getByTestId("craft-station-card-color-script-p3")).toBeTruthy();
    expect(screen.getByTestId("craft-station-card-bg3d-solar-lighting")).toBeTruthy();
    expect(screen.queryByTestId("craft-station-card-virtual-studio-collab")).toBeNull();
  });

  it("22. 다음 단계 추천 버튼·키보드 단축키(Alt+3)·열기 CTA(onLaunchStation)가 정상 연동된다", () => {
    const onSelect = vi.fn();
    const onLaunch = vi.fn();
    render(
      <StudioAtelierCraftLauncherPanel
        initialCurrentWorkflowStage="conti"
        onSelectStation={onSelect}
        onLaunchStation={onLaunch}
      />,
    );

    fireEvent.click(screen.getByTestId("craft-recommend-btn-bg3d-solar-lighting"));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "bg3d-solar-lighting", href: "/studio/bg3d" }),
    );

    fireEvent.keyDown(screen.getByTestId("atelier-craft-launcher-panel"), {
      key: "8",
      altKey: true,
    });
    expect(screen.getByTestId("craft-preview-href").textContent).toBe("/production");

    fireEvent.click(screen.getByTestId("craft-preview-launch-link"));
    expect(onLaunch).toHaveBeenCalledTimes(1);
    expect(onLaunch.mock.calls[0]?.[0]).toMatchObject({
      id: "offline-resilience-settlement",
      href: "/production",
    });
  });

  it("23. 영문 로케일(locale='en')에서 제목·탭·추천·실행 CTA가 영문으로 전환된다", () => {
    render(<StudioAtelierCraftLauncherPanel locale="en" />);
    expect(screen.getByTestId("atelier-craft-launcher-panel").textContent).toContain(
      "Atelier Craft Quick-Jump Launcher",
    );
    expect(screen.getByTestId("craft-stage-tab-all").textContent).toContain("All");
    expect(screen.getByTestId("craft-preview-launch-link").textContent).toContain(
      "Open related page: Drawing · Physical Ink",
    );
  });

  it("24. 모듈 파일 정적 위생 자가 검증(<=800줄·무스토리지·원시색0건·전역전환0건·props={} 0건·번역투0건)", () => {
    const files = [
      "atelier-craft-launcher-engine.ts",
      "atelier-craft-catalog.ts",
      "launcher-input-contract.ts",
      "use-launcher-notification.ts",
      "launcher-boundaries.test.tsx",
      "StudioAtelierCraftLauncherPanel.tsx",
      "index.ts",
      "atelier-craft-launcher.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const transitionAllRe = new RegExp(["transition", "-all\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));
    const defaultEmptyPropsRe = new RegExp(
      ["StudioAtelierCraftLauncherPanelProps\\s*", "=\\s*\\{\\s*\\}"].join(""),
    );
    const translationeseRe = new RegExp(
      [
        "하는 것을 가능하게",
        "|직관적인 경험을 제공",
        "|원활한 워크플로우를 보장",
      ].join(""),
    );

    for (const file of files) {
      const src = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(src.split("\n").length, `${file} 800줄 상한 초과`).toBeLessThanOrEqual(800);
      expect(storageRe.test(src), `${file} Web Storage 사용 금지 위반`).toBe(false);
      expect(transitionAllRe.test(src), `${file} 전역 transition 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioAtelierCraftLauncherPanel.tsx"), "utf8");
    const engineSrc = readFileSync(resolve(MODULE_DIR, "atelier-craft-launcher-engine.ts"), "utf8");

    expect(rawColorRe.test(panelSrc), "패널 내 원시 #hex/rgb/hsl 색상 0건 위반").toBe(false);
    expect(rawColorRe.test(engineSrc), "엔진 내 원시 #hex/rgb/hsl 색상 0건 위반").toBe(false);
    expect(defaultEmptyPropsRe.test(panelSrc), "props = {} 기본 대입 금지 위반").toBe(false);
    expect(translationeseRe.test(panelSrc), "패널 번역투 문구 검출").toBe(false);
    expect(translationeseRe.test(engineSrc), "엔진 번역투 문구 검출").toBe(false);

    expect(panelSrc.includes("outline-1 -outline-offset-1 outline-black/10")).toBe(true);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
  });
});
