// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AI_TEAMMATE_ROSTER,
  CAMERA_ANGLE_OPTIONS,
  PALETTE_MOOD_OPTIONS,
  PIPELINE_ROLE_ORDER,
  SKETCH_STROKE_HINTS,
  SMART_STUDIO_ASSET_CATALOG,
  StudioAiTeammateAndAssetSearchHub,
  TEAM_SCALE_PRESETS,
  assembleAiTeammateSquad,
  recommendContextualAssetsForCut,
  searchStudioAssetsSmart,
  toggleHumanRoleAssignment,
  type CameraAngleFilter,
  type CreatorPipelineRoleId,
  type CreatorTeamScaleId,
  type PaletteMoodId,
  type SketchStrokeHint,
} from "./index";

const REPO_ROOT = process.cwd();
const WEB_PUBLIC_ROOT = resolve(REPO_ROOT, "apps/web/public");
const MODULE_DIR = resolve(REPO_ROOT, "apps/web/src/domains/creator/ai-teammate-and-search");
const CREATOR_DIR = resolve(REPO_ROOT, "apps/web/src/domains/creator");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("1. 6인 AI 보조작가 로스터 & 4대 규모 빈 공정 자동 보충 엔진", () => {
  it("6인 전담 AI 보조작가 페르소나와 실제 컬러 스프라이트 파일이 모두 존재한다", () => {
    expect(AI_TEAMMATE_ROSTER).toHaveLength(6);
    expect(AI_TEAMMATE_ROSTER.map((item) => item.personaName)).toEqual([
      "콘티·연출 파트너",
      "선화 클린업 어시",
      "밑색·명암 채색 어시",
      "3D 배경·소품 어시",
      "식자·SFX·번역 어시",
      "마감·권리 BOM 프로듀서",
    ]);

    for (const teammate of AI_TEAMMATE_ROSTER) {
      expect(teammate.spritePath).toMatch(/^\/assets\/studio\/vibrant-sprites\/.+\.webp$/u);
      const diskPath = resolve(WEB_PUBLIC_ROOT, teammate.spritePath.replace(/^\//u, ""));
      expect(existsSync(diskPath), `스프라이트 파일 누락: ${teammate.spritePath}`).toBe(true);
    }
  });

  it.each<[CreatorTeamScaleId, number, number]>([
    ["solo", 1, 5],
    ["small", 2, 4],
    ["production", 4, 2],
    ["enterprise", 5, 1],
  ])(
    "%s 규모 기본 프리셋은 사람 %i공정을 제외한 빈 %i공정에만 AI 팀원을 자동 투입한다",
    (scale, expectedHumanCount, expectedAiCount) => {
      const plan = assembleAiTeammateSquad({ teamScale: scale });

      expect(plan.humanCoverageCount).toBe(expectedHumanCount);
      expect(plan.aiCoverageCount).toBe(expectedAiCount);
      expect(plan.coveragePercent).toBe(100);
      expect(plan.deployedTeammates).toHaveLength(expectedAiCount);
      expect(plan.standbyTeammates).toHaveLength(expectedHumanCount);
      expect(plan.totalQueueTaskCount).toBe(expectedAiCount * 3);
      expect(plan.totalEstimatedHoursSaved).toBeGreaterThan(0);

      const humanSet = new Set(plan.humanRoles);
      for (const deployed of plan.deployedTeammates) {
        expect(humanSet.has(deployed.roleId)).toBe(false);
        expect(deployed.deployed).toBe(true);
        expect(deployed.coverageOwner).toBe("ai");
        expect(deployed.queue.length).toBeGreaterThan(0);
        expect(deployed.estimatedHoursSaved).toBeGreaterThan(0);
      }

      for (const standby of plan.standbyTeammates) {
        expect(humanSet.has(standby.roleId)).toBe(true);
        expect(standby.deployed).toBe(false);
        expect(standby.coverageOwner).toBe("human");
        expect(standby.queue).toHaveLength(0);
        expect(standby.estimatedHoursSaved).toBe(0);
      }
    },
  );

  it("사람 담당 공정이 비어 있으면 6명 전원 투입되고, 전 공정 사람 담당이면 AI 0명 대기한다", () => {
    const allAiPlan = assembleAiTeammateSquad({
      teamScale: "solo",
      humanRoles: [],
    });
    expect(allAiPlan.aiCoverageCount).toBe(6);
    expect(allAiPlan.humanCoverageCount).toBe(0);
    expect(allAiPlan.vacantRoles).toEqual(PIPELINE_ROLE_ORDER);

    const allHumanPlan = assembleAiTeammateSquad({
      teamScale: "enterprise",
      humanRoles: PIPELINE_ROLE_ORDER,
    });
    expect(allHumanPlan.aiCoverageCount).toBe(0);
    expect(allHumanPlan.humanCoverageCount).toBe(6);
    expect(allHumanPlan.totalEstimatedHoursSaved).toBe(0);
    expect(allHumanPlan.headlineSummary).toContain("AI 대기 모드");
  });

  it("공정 토글과 승인 모드(auto-draft vs review-first) 오버라이드 및 컷 수 스케일링이 정확히 동작한다", () => {
    const toggledOn = toggleHumanRoleAssignment(["storyboard"], "lineart");
    expect(toggledOn).toEqual(["storyboard", "lineart"]);
    const toggledOff = toggleHumanRoleAssignment(toggledOn, "storyboard");
    expect(toggledOff).toEqual(["lineart"]);

    const customPlan = assembleAiTeammateSquad({
      teamScale: "small",
      humanRoles: ["storyboard", "lineart"],
      approvalModeOverrides: {
        coloring: "review-first",
        "bom-producer": "auto-draft",
      },
      episodeCuts: 120,
    });

    const coloringSlot = customPlan.deployedTeammates.find((s) => s.roleId === "coloring");
    const bomSlot = customPlan.deployedTeammates.find((s) => s.roleId === "bom-producer");
    expect(coloringSlot?.approvalMode).toBe("review-first");
    expect(bomSlot?.approvalMode).toBe("auto-draft");
    expect(coloringSlot?.estimatedHoursSaved).toBe(15);
    expect(TEAM_SCALE_PRESETS).toHaveLength(4);
  });
});

describe("2. 차세대 5대 복합 소재 검색 커널 & 현재 컷 맥락 자동 추천", () => {
  it("카탈로그의 모든 스프라이트 파일이 실제 public 경로에 존재한다", () => {
    expect(SMART_STUDIO_ASSET_CATALOG.length).toBeGreaterThanOrEqual(16);
    for (const asset of SMART_STUDIO_ASSET_CATALOG) {
      const diskPath = resolve(WEB_PUBLIC_ROOT, asset.spritePath.replace(/^\//u, ""));
      expect(existsSync(diskPath), `소재 스프라이트 누락: ${asset.spritePath}`).toBe(true);
    }
  });

  it("① 자연어 + 감정/상황 시맨틱 검색이 고백씬과 액션 속도선을 정확히 상위에 배치한다", () => {
    const confession = searchStudioAssetsSmart({
      query: "비 오는 밤 옥상 고백씬",
      commercialSafeOnly: true,
    });
    expect(confession.hits.length).toBeGreaterThanOrEqual(3);
    expect(confession.hits[0]?.asset.id).toBe("asset-rainy-rooftop-3d");
    expect(confession.hits[0]?.matchReasons.some((r) => r.includes("시맨틱 일치"))).toBe(true);
    expect(confession.recommendedBundles.some((b) => b.bundleId === "bundle-rainy-confession")).toBe(true);

    const action = searchStudioAssetsSmart({
      query: "액션 속도선",
      commercialSafeOnly: true,
    });
    expect(action.hits.length).toBeGreaterThanOrEqual(3);
    expect(action.hits[0]?.asset.id).toBe("asset-action-speedline-burst");
    expect(action.recommendedBundles.some((b) => b.bundleId === "bundle-action-impact")).toBe(true);
  });

  it.each<SketchStrokeHint>([
    "arc",
    "burst",
    "grid",
    "vertical",
    "perspective",
    "silhouette",
  ])("② 3획 낙서 실루엣 매칭(%s) 필터가 일치하는 소재만 반환한다", (hint) => {
    expect(SKETCH_STROKE_HINTS).toHaveLength(6);
    const result = searchStudioAssetsSmart({ sketchStrokeHint: hint });
    expect(result.hits.length).toBeGreaterThan(0);
    for (const hit of result.hits) {
      expect(hit.asset.sketchStrokeHints).toContain(hint);
    }
  });

  it.each<PaletteMoodId>([
    "warm-sunset",
    "cool-night",
    "pastel-romance",
    "noir-ink",
    "botanical-day",
  ])("③ 현재 캔버스 색감 무드(%s) 필터가 일치하는 소재만 반환한다", (mood) => {
    expect(PALETTE_MOOD_OPTIONS).toHaveLength(5);
    const result = searchStudioAssetsSmart({ paletteMood: mood });
    expect(result.hits.length).toBeGreaterThan(0);
    for (const hit of result.hits) {
      expect(hit.asset.paletteMoods).toContain(mood);
    }
  });

  it.each<CameraAngleFilter>([
    "eye-level",
    "high-angle",
    "low-angle",
    "bird-eye",
    "dutch",
  ])("④ 카메라 앵글/투시(%s) 필터가 일치하는 소재만 반환한다", (angle) => {
    expect(CAMERA_ANGLE_OPTIONS).toHaveLength(5);
    const result = searchStudioAssetsSmart({ cameraAngle: angle });
    expect(result.hits.length).toBeGreaterThan(0);
    for (const hit of result.hits) {
      expect(hit.asset.cameraAngles).toContain(angle);
    }
  });

  it("⑤ 원클릭 상업 출고 안전(Rights BOM) 필터가 비상업·출처표기 소재를 차단하고 차단 건수를 보고한다", () => {
    const allResults = searchStudioAssetsSmart({ commercialSafeOnly: false });
    const safeResults = searchStudioAssetsSmart({ commercialSafeOnly: true });

    expect(allResults.hits.length).toBeGreaterThan(safeResults.hits.length);
    expect(safeResults.blockedByRightsBomCount).toBe(
      allResults.hits.length - safeResults.hits.length,
    );
    expect(safeResults.blockedByRightsBomCount).toBeGreaterThanOrEqual(2);
    for (const hit of safeResults.hits) {
      expect(hit.asset.rightsBom.commercialSafe).toBe(true);
    }
  });

  it("5대 복합 필터 교집합과 현재 컷 맥락 기반 자동 추천(recommendContextualAssetsForCut)이 동작한다", () => {
    const combined = searchStudioAssetsSmart({
      query: "비 오는 밤 옥상 고백씬",
      sketchStrokeHint: "perspective",
      paletteMood: "cool-night",
      cameraAngle: "high-angle",
      commercialSafeOnly: true,
    });
    expect(combined.activeFilterCount).toBe(5);
    expect(combined.hits.length).toBeGreaterThanOrEqual(1);
    expect(combined.hits[0]?.asset.id).toBe("asset-rainy-rooftop-3d");
    for (const hit of combined.hits) {
      expect(hit.asset.sketchStrokeHints).toContain("perspective");
      expect(hit.asset.paletteMoods).toContain("cool-night");
      expect(hit.asset.cameraAngles).toContain("high-angle");
      expect(hit.asset.rightsBom.commercialSafe).toBe(true);
    }

    const cutRec = recommendContextualAssetsForCut({
      sceneText: "비 오는 밤 옥상에서 첫 고백하는 장면",
      commercialSafeOnly: true,
    });
    expect(cutRec.inferredPaletteMood).toBe("cool-night");
    expect(cutRec.inferredSketchHint).toBe("perspective");
    expect(cutRec.hits.length).toBeGreaterThan(0);
    expect(cutRec.recommendedBundles.length).toBeGreaterThan(0);

    const actionCutRec = recommendContextualAssetsForCut({
      sceneText: "검기 충돌과 액션 속도선 폭발",
      commercialSafeOnly: true,
    });
    expect(actionCutRec.inferredPaletteMood).toBe("noir-ink");
    expect(actionCutRec.inferredCameraAngle).toBe("dutch");
    expect(actionCutRec.inferredSketchHint).toBe("burst");
    expect(actionCutRec.hits[0]?.asset.bundleId).toBe("bundle-action-impact");
  });
});

describe("3. StudioAiTeammateAndAssetSearchHub UI 인터랙션 & 접근성·계약 검증", () => {
  it("규모 선택과 사람 담당 공정 토글에 따라 빈 자리에 AI 팀원 카드가 즉시 합류·퇴장한다", () => {
    const onAssignQueue = vi.fn();
    render(<StudioAiTeammateAndAssetSearchHub onAssignTeammateQueue={onAssignQueue} />);

    // 기본 1인 작가(solo): 콘티만 사람, 나머지 5공정 AI 투입
    const grid = screen.getByTestId("deployed-ai-teammates-grid");
    expect(grid.querySelectorAll("[data-teammate-role]")).toHaveLength(5);

    // 7~8인 프로덕션으로 전환 -> AI 2명 투입
    fireEvent.click(screen.getByRole("button", { name: /7~8인 · 7~8인 프로덕션/u }));
    expect(
      screen.getByTestId("deployed-ai-teammates-grid").querySelectorAll("[data-teammate-role]"),
    ).toHaveLength(2);

    // '3D 배경·소품' 사람 담당 해제 -> 3D 배경·소품 어시 자동 합류(3명)
    const roleGroup = screen.getByRole("group", { name: "사람 담당 공정 선택" });
    fireEvent.click(within(roleGroup).getByRole("button", { name: /3D 배경·소품/u }));
    const updatedGrid = screen.getByTestId("deployed-ai-teammates-grid");
    expect(updatedGrid.querySelectorAll("[data-teammate-role]")).toHaveLength(3);
    expect(within(updatedGrid).getByText("3D 배경·소품 어시")).toBeTruthy();

    // 승인 모드 전환 및 작업 큐 실행 콜백 검증
    const bgCard = updatedGrid.querySelector("[data-teammate-role='bg3d']");
    expect(bgCard).not.toBeNull();
    fireEvent.click(within(bgCard as HTMLElement).getByRole("button", { name: /전환/u }));
    fireEvent.click(within(bgCard as HTMLElement).getByRole("button", { name: "작업 큐 실행" }));
    expect(onAssignQueue).toHaveBeenCalledTimes(1);
    expect(onAssignQueue.mock.calls[0]?.[0]?.roleId).toBe<CreatorPipelineRoleId>("bg3d");
  });

  it("스마트 소재 검색 탭에서 5대 복합 필터·즉시 삽입·세트 번들 일괄 삽입이 동작한다", () => {
    const onInsertAsset = vi.fn();
    const onApplyBundle = vi.fn();
    render(
      <StudioAiTeammateAndAssetSearchHub
        onInsertAsset={onInsertAsset}
        onApplyBundle={onApplyBundle}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /스마트 소재 검색/u }));

    const searchBox = screen.getByRole("searchbox", {
      name: "자연어·감정·상황 스마트 소재 검색",
    });
    fireEvent.change(searchBox, { target: { value: "비 오는 밤 옥상 고백씬" } });

    const sketchGroup = screen.getByRole("group", { name: "실루엣 획 힌트 필터" });
    const moodGroup = screen.getByRole("group", { name: "색감 무드 필터" });
    const angleGroup = screen.getByRole("group", { name: "카메라 앵글 필터" });

    expect(within(sketchGroup).getAllByRole("button")).toHaveLength(6);
    expect(within(moodGroup).getAllByRole("button")).toHaveLength(5);
    expect(within(angleGroup).getAllByRole("button")).toHaveLength(5);

    fireEvent.click(within(sketchGroup).getByRole("button", { name: "원근 투시" }));
    fireEvent.click(within(moodGroup).getByRole("button", { name: "쿨 나이트" }));
    fireEvent.click(within(angleGroup).getByRole("button", { name: "하이앵글" }));

    const resultsGrid = screen.getByTestId("smart-asset-search-results");
    expect(within(resultsGrid).getByText("비 오는 밤 옥상 난간 3D 무대")).toBeTruthy();

    fireEvent.click(
      within(resultsGrid).getByRole("button", {
        name: "비 오는 밤 옥상 난간 3D 무대 캔버스에 즉시 삽입",
      }),
    );
    expect(onInsertAsset).toHaveBeenCalledTimes(1);
    expect(onInsertAsset.mock.calls[0]?.[0]?.id).toBe("asset-rainy-rooftop-3d");

    fireEvent.click(
      screen.getByRole("button", {
        name: "비 오는 밤 고백씬 연출 세트 세트 일괄 삽입",
      }),
    );
    expect(onApplyBundle).toHaveBeenCalledTimes(1);
    expect(onApplyBundle.mock.calls[0]?.[0]?.bundleId).toBe("bundle-rainy-confession");

    // 상업 안전 BOM 토글 해제 및 필터 초기화 검증
    const bomToggle = screen.getByRole("button", { name: "상업 안전 BOM만" });
    expect(bomToggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(bomToggle);
    expect(bomToggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "초기화" }));
    expect(bomToggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("CSS 접근성 계약(44px·keep-all·tabular-nums·reduced-motion), 저장소 무호출, 파일 줄 수(<=600), 마운트 연결 계약을 만족한다", () => {
    const cssSource = readFileSync(
      resolve(MODULE_DIR, "ai-teammate-and-search.css"),
      "utf8",
    );
    expect(cssSource).toContain("min-height: 2.75rem");
    expect(cssSource).toContain("min-width: 2.75rem");
    expect(cssSource).toContain("word-break: keep-all");
    expect(cssSource).toContain("font-variant-numeric: tabular-nums");
    expect(cssSource).toContain("@media (prefers-reduced-motion: reduce)");

    for (const file of [
      "ai-teammate-roster-engine.ts",
      "visual-asset-smart-search-catalog.ts",
      "visual-asset-smart-search-engine.ts",
      "SmartAssetSearchTabPanel.tsx",
      "StudioAiTeammateAndAssetSearchHub.tsx",
      "ai-teammate-and-search.css",
      "index.ts",
    ]) {
      const src = readFileSync(resolve(MODULE_DIR, file), "utf8");
      const lineCount = src.split("\n").length;
      expect(lineCount, `${file} 줄 수 초과(${lineCount} > 600)`).toBeLessThanOrEqual(600);
      expect(src).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    }

    const hostSource = readFileSync(
      resolve(CREATOR_DIR, "StudioUnifiedAssetToolPopoverContentDirectDrag.tsx"),
      "utf8",
    );
    expect(hostSource).toContain('from "./ai-teammate-and-search"');
    expect(hostSource).toContain("<StudioAiTeammateAndAssetSearchHub");
  });
});
