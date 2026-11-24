// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTEXTUAL_TROUBLESHOOTING_FAQS,
  CREATOR_ROLE_MANUALS,
  DIFFERENTIATOR_SHOWCASE_CARDS,
  ManualProgressTracker,
  STUDIO_FEATURE_AXES,
  STUDIO_SHORTCUT_CHEATSHEET,
  StudioFeatureAtlasPanel,
  computeOverallManualProgress,
  computeRoleManualProgress,
  extractHangulChoseong,
  getAllStudioFeatures,
  getAtlasCatalogSummary,
  getDifferentiatorById,
  getFeatureAxisById,
  getRoleManualById,
  getTroubleshootingFaqsForContext,
  searchAtlasAndShortcuts,
  type AtlasRoutePath,
} from "./index";

const MODULE_DIR = path.resolve(__dirname);
const WEB_PUBLIC_DIR = path.resolve(MODULE_DIR, "../../../../public");

afterEach(() => {
  cleanup();
});

describe("툰스튜디오 7대 기능 축 및 8대 차별화 쇼케이스 카탈로그", () => {
  it("소개 항목마다 독립 예제·기존 화면 안내를 구분하고 미측정 시간·성능·법적 보증을 주장하지 않는다", () => {
    const entries = [...getAllStudioFeatures(), ...DIFFERENTIATOR_SHOWCASE_CARDS];
    for (const entry of entries) {
      expect(["standalone-example", "screen-guide"]).toContain(entry.scope);
    }
    expect(getAllStudioFeatures().find((entry) => entry.id === "feat-vrm-hair-transplant")?.scope).toBe("standalone-example");
    expect(getAllStudioFeatures().find((entry) => entry.id === "feat-rights-bom-receipt")?.scope).toBe("screen-guide");
    const claims = JSON.stringify([STUDIO_FEATURE_AXES, DIFFERENTIATOR_SHOWCASE_CARDS, CREATOR_ROLE_MANUALS]);
    expect(claims).not.toMatch(/1초 만에|5분 안에|분쟁 위험을 원천 차단|240Hz 펜 입력|현재 구현 기준/u);
    expect(claims).toContain("점검 기록은 법적 이용 허가나 분쟁 예방 보증이 아닙니다");
  });

  it("7대 기능 축이 순서 1~7로 완비되고 모든 세부 기능과 WebP 미리보기 파일이 실제 존재한다", () => {
    expect(STUDIO_FEATURE_AXES).toHaveLength(7);
    expect(STUDIO_FEATURE_AXES.map((axis) => axis.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const axisIds = new Set(STUDIO_FEATURE_AXES.map((axis) => axis.id));
    expect(axisIds.size).toBe(7);

    const allFeatures = getAllStudioFeatures();
    const featureIds = new Set(allFeatures.map((feature) => feature.id));
    expect(allFeatures.length).toBeGreaterThanOrEqual(28);
    expect(featureIds.size).toBe(allFeatures.length);

    for (const axis of STUDIO_FEATURE_AXES) {
      expect(axis.features.length).toBeGreaterThanOrEqual(4);
      expect(axis.previewImageSrc.startsWith("/assets/atelier/")).toBe(true);
      expect(axis.previewImageSrc.endsWith(".webp")).toBe(true);
      const diskPath = path.join(WEB_PUBLIC_DIR, axis.previewImageSrc.replace(/^\//, ""));
      expect(existsSync(diskPath), `missing asset ${axis.previewImageSrc}`).toBe(true);
    }
  });

  it("8대 차별화 기술·주변기기 카드가 필수 5개 라우트와 3대 WebP 자산군을 모두 실제 파일로 연결한다", () => {
    expect(DIFFERENTIATOR_SHOWCASE_CARDS).toHaveLength(8);
    expect(DIFFERENTIATOR_SHOWCASE_CARDS.map((card) => card.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);

    const cardIds = new Set(DIFFERENTIATOR_SHOWCASE_CARDS.map((card) => card.id));
    expect(cardIds.size).toBe(8);

    const cardRoutes = new Set(DIFFERENTIATOR_SHOWCASE_CARDS.map((card) => card.route));
    const requiredRoutes: readonly AtlasRoutePath[] = [
      "/studio/canvas",
      "/studio/character",
      "/studio/space",
      "/compare/studio",
      "/tech",
    ];
    for (const requiredRoute of requiredRoutes) {
      expect(cardRoutes.has(requiredRoute), `missing route ${requiredRoute}`).toBe(true);
    }

    const imagePaths = DIFFERENTIATOR_SHOWCASE_CARDS.map((card) => card.imageSrc);
    expect(imagePaths.some((src) => src.startsWith("/assets/atelier/media/"))).toBe(true);
    expect(imagePaths.some((src) => src.startsWith("/assets/atelier/spaces/"))).toBe(true);
    expect(imagePaths.some((src) => src.startsWith("/assets/atelier/onboarding/"))).toBe(true);

    for (const card of DIFFERENTIATOR_SHOWCASE_CARDS) {
      expect(card.imageSrc.endsWith(".webp")).toBe(true);
      expect(card.specHighlightsKo).toHaveLength(3);
      expect(getFeatureAxisById(card.axisId)).toBeDefined();
      const diskPath = path.join(WEB_PUBLIC_DIR, card.imageSrc.replace(/^\//, ""));
      expect(existsSync(diskPath), `missing showcase webp ${card.imageSrc}`).toBe(true);
    }
  });

  it("카탈로그 조회 헬퍼와 요약 통계가 실제 등록 수량과 정확히 일치한다", () => {
    const summary = getAtlasCatalogSummary();
    expect(summary.axisCount).toBe(7);
    expect(summary.differentiatorCount).toBe(8);
    expect(summary.featureCount).toBe(getAllStudioFeatures().length);
    expect(summary.shortcutCount).toBe(STUDIO_SHORTCUT_CHEATSHEET.length);
    expect(summary.routes).toContain("/studio/canvas");
    expect(summary.routes).toContain("/studio/character");
    expect(summary.routes).toContain("/studio/space");
    expect(summary.routes).toContain("/compare/studio");
    expect(summary.routes).toContain("/tech");

    expect(getFeatureAxisById("peripherals-multidevice")?.order).toBe(4);
    expect(getDifferentiatorById("diff-kubelka-munk-webnn")?.route).toBe("/tech");
  });
});

describe("4대 창작자 역할별 10분 실습 매뉴얼 및 메모리 진행률 엔진", () => {
  it("4대 창작자 역할 매뉴얼이 각각 정확히 10분·5단계와 실존 WebP 프리뷰를 갖춘다", () => {
    expect(CREATOR_ROLE_MANUALS).toHaveLength(4);
    expect(CREATOR_ROLE_MANUALS.map((m) => m.roleId)).toEqual([
      "beginner-first-4cut",
      "webtoon-assistant",
      "director-3d-character-bg",
      "series-pd",
    ]);

    for (const manual of CREATOR_ROLE_MANUALS) {
      expect(manual.totalMinutes).toBe(10);
      expect(manual.steps).toHaveLength(5);
      const sumMinutes = manual.steps.reduce((acc, step) => acc + step.durationMinutes, 0);
      expect(sumMinutes).toBe(10);
      expect(manual.steps.map((step) => step.order)).toEqual([1, 2, 3, 4, 5]);
      const diskPath = path.join(WEB_PUBLIC_DIR, manual.previewImageSrc.replace(/^\//, ""));
      expect(existsSync(diskPath), `missing role preview ${manual.previewImageSrc}`).toBe(true);
    }
  });

  it("순수 진행률 계산 함수가 완료율·남은 시간·다음 단계·잘못된 단계 ID 무시를 정확히 처리한다", () => {
    const beginner = getRoleManualById("beginner-first-4cut");
    expect(beginner).toBeDefined();

    const empty = computeRoleManualProgress("beginner-first-4cut", []);
    expect(empty.completionPct).toBe(0);
    expect(empty.remainingMinutes).toBe(10);
    expect(empty.isAllDone).toBe(false);
    expect(empty.nextStep?.id).toBe("beg-1-canvas-gpen");

    const partial = computeRoleManualProgress("beginner-first-4cut", [
      "beg-1-canvas-gpen",
      "beg-3-close-gap-fill",
      "non-existent-step-id",
    ]);
    expect(partial.completedCount).toBe(2);
    expect(partial.completionPct).toBe(40);
    expect(partial.completedMinutes).toBe(4);
    expect(partial.remainingMinutes).toBe(6);
    expect(partial.nextStep?.id).toBe("beg-2-pose-guide");

    const allDone = computeRoleManualProgress(
      "beginner-first-4cut",
      beginner!.steps.map((step) => step.id),
    );
    expect(allDone.completionPct).toBe(100);
    expect(allDone.remainingMinutes).toBe(0);
    expect(allDone.isAllDone).toBe(true);
    expect(allDone.nextStep).toBeNull();
  });

  it("ManualProgressTracker가 순수 메모리에서 역할별 토글·격리·초기화·전체 집계를 정확히 추적한다", () => {
    const tracker = new ManualProgressTracker();
    expect(tracker.getOverallProgress().completedSteps).toBe(0);
    expect(tracker.getOverallProgress().totalSteps).toBe(20);

    const afterOne = tracker.toggleStep("webtoon-assistant", "ast-1-webhid-profile");
    expect(afterOne.completedCount).toBe(1);
    expect(afterOne.completionPct).toBe(20);
    expect(tracker.getRoleProgress("series-pd").completedCount).toBe(0);

    const toggledOff = tracker.toggleStep("webtoon-assistant", "ast-1-webhid-profile");
    expect(toggledOff.completedCount).toBe(0);

    const pdManual = getRoleManualById("series-pd")!;
    for (const step of pdManual.steps) {
      tracker.setStepCompleted("series-pd", step.id, true);
    }
    const overall = tracker.getOverallProgress();
    expect(overall.completedRoles).toBe(1);
    expect(overall.completedSteps).toBe(5);
    expect(overall.completionPct).toBe(25);

    tracker.resetRole("series-pd");
    expect(tracker.getRoleProgress("series-pd").completedCount).toBe(0);

    tracker.setStepCompleted("director-3d-character-bg", "dir-2-hair-transplant", true);
    tracker.resetAll();
    expect(tracker.getOverallProgress().completedSteps).toBe(0);

    const computedOverall = computeOverallManualProgress({
      "beginner-first-4cut": ["beg-1-canvas-gpen"],
    });
    expect(computedOverall.completedSteps).toBe(1);
    expect(computedOverall.completionPct).toBe(5);
  });
});

describe("한국어 · 초성 · 단축키 통합 검색기 및 맥락별 FAQ", () => {
  it("일상 한국어 키워드로 차별화 카드·세부 기능·FAQ를 통합 검색한다", () => {
    const foley = searchAtlasAndShortcuts("마찰음");
    expect(foley.totalCount).toBeGreaterThan(0);
    expect(foley.differentiators.some((c) => c.id === "diff-physical-foley-drawing")).toBe(true);
    expect(foley.features.some((f) => f.id === "feat-physical-foley")).toBe(true);

    const hair = searchAtlasAndShortcuts("헤어 이식");
    expect(hair.differentiators.some((c) => c.id === "diff-vrm-hair-72pose")).toBe(true);
    expect(hair.faqs.some((f) => f.id === "faq-vrm-hair-mismatch")).toBe(true);

    const bom = searchAtlasAndShortcuts("권리 BOM");
    expect(bom.differentiators.some((c) => c.id === "diff-rights-bom-4k-export")).toBe(true);
    expect(bom.faqs.some((f) => f.id === "faq-rights-bom-blocked")).toBe(true);
  });

  it("한글 초성 검색으로 말풍선(ㅁㅍㅅ)과 손떨림(ㅅㄸ)을 찾는다", () => {
    expect(extractHangulChoseong("말풍선")).toBe("ㅁㅍㅅ");
    expect(extractHangulChoseong("손떨림 보정")).toBe("ㅅㄸㄹㅂㅈ");

    const balloonRes = searchAtlasAndShortcuts("ㅁㅍㅅ");
    expect(balloonRes.features.some((f) => f.id === "feat-balloon-voice-sfx")).toBe(true);
    expect(balloonRes.shortcuts.some((s) => s.keys === "T")).toBe(true);

    const stabRes = searchAtlasAndShortcuts("ㅅㄸ");
    expect(stabRes.features.some((f) => f.id === "feat-stabilizer-kalman")).toBe(true);
  });

  it("단축키 문자열과 빈 검색어·미일치 검색어를 안정적으로 처리한다", () => {
    const shiftT = searchAtlasAndShortcuts("Shift+T");
    expect(shiftT.shortcuts.some((s) => s.keys === "Shift+T")).toBe(true);

    const altC = searchAtlasAndShortcuts("alt+c");
    expect(altC.shortcuts.some((s) => s.keys === "Alt+C")).toBe(true);
    expect(altC.features.some((f) => f.shortcuts.includes("Alt+C"))).toBe(true);

    const empty = searchAtlasAndShortcuts("   ");
    expect(empty.totalCount).toBe(0);

    const miss = searchAtlasAndShortcuts("존재하지않는기능키워드xyz");
    expect(miss.totalCount).toBe(0);
  });

  it("맥락별 빠른 문제 해결 FAQ가 4대 역할을 모두 포괄하고 필터링된다", () => {
    expect(CONTEXTUAL_TROUBLESHOOTING_FAQS.length).toBeGreaterThanOrEqual(8);
    for (const manual of CREATOR_ROLE_MANUALS) {
      const faqs = getTroubleshootingFaqsForContext({ roleId: manual.roleId });
      expect(faqs.length, `no FAQ for role ${manual.roleId}`).toBeGreaterThanOrEqual(2);
    }

    const peripheralFaqs = getTroubleshootingFaqsForContext({
      axisId: "peripherals-multidevice",
    });
    expect(peripheralFaqs.some((faq) => faq.id === "faq-webhid-lefthand")).toBe(true);
  });
});

describe("StudioFeatureAtlasPanel 단독 렌더링 및 인터랙티브 UX", () => {
  it("독립 예제·기존 화면·소개 이미지의 범위를 표시하고 수동 체크를 실제 작업 완료와 구분한다", () => {
    render(createElement(StudioFeatureAtlasPanel));
    expect(screen.getByTestId("atlas-scope-notice").textContent).toContain("이미지는 소개용 삽화");
    expect(screen.getByTestId("atlas-scope-diff-vrm-hair-72pose").textContent).toContain("독립 예제 안내");
    expect(screen.getByTestId("atlas-scope-diff-local-first-open-compare").textContent).toContain("기존 화면 안내");
    expect(screen.getByTestId("studio-feature-atlas-panel").textContent).not.toContain("실제 구현된");
    fireEvent.click(screen.getByTestId("atlas-tab-manual"));
    expect(screen.getByTestId("atlas-manual-scope-notice").textContent).toContain("실제 원고 작업·저장 결과를 검사하지 않으며");
    fireEvent.click(screen.getByTestId("atlas-step-checkbox-beg-1-canvas-gpen"));
    expect(screen.getByTestId("atlas-manual-progress-text").textContent).toContain("직접 체크한 진행률");
    expect(screen.getByText("직접 체크함")).toBeTruthy();
  });

  it("비동기 이동 알림은 대기 중 중복 호출을 막고 실패 후 재시도와 알림 응답만 표시한다", async () => {
    const onNavigate = vi.fn()
      .mockRejectedValueOnce(new Error("화면 연결 실패"))
      .mockResolvedValueOnce(undefined);
    render(createElement(StudioFeatureAtlasPanel, { onNavigate }));
    const link = screen.getByTestId("atlas-diff-link-diff-vrm-hair-72pose");
    fireEvent.click(link);
    expect(link.getAttribute("href")).toBe("/studio/character");
    expect(link.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("이동 요청 처리 중이에요.")).toBeTruthy();
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("이동 요청에 실패"));
    expect(link.getAttribute("aria-busy")).toBe("false");
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("이동 알림을 전달했어요"));
    expect(screen.getByRole("status").textContent).toContain("실제 화면 전환 결과는 이동한 화면에서 확인");
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("동기 이동 콜백 오류도 성공으로 표시하지 않고 다시 누를 수 있다", () => {
    const onNavigate = vi.fn().mockImplementationOnce(() => { throw new Error("라우터 오류"); });
    render(createElement(StudioFeatureAtlasPanel, { onNavigate }));
    const link = screen.getByTestId("atlas-diff-link-diff-vrm-hair-72pose");
    fireEvent.click(link);
    expect(screen.getByRole("alert").textContent).toContain("이동 요청에 실패");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Props 없이 단독 렌더되어 8대 차별화 기술 카드와 실제 WebP 썸네일·라우트 링크를 표시한다", () => {
    render(createElement(StudioFeatureAtlasPanel));

    expect(screen.getByTestId("studio-feature-atlas-panel")).toBeTruthy();
    expect(screen.getByTestId("atlas-showcase-section")).toBeTruthy();

    for (const card of DIFFERENTIATOR_SHOWCASE_CARDS) {
      expect(screen.getByTestId(`atlas-diff-card-${card.id}`)).toBeTruthy();
      const link = screen.getByTestId(`atlas-diff-link-${card.id}`);
      expect(link.getAttribute("href")).toBe(card.route);
    }

    const images = screen.getAllByRole("img");
    expect(images.length).toBe(8);
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src.startsWith("/assets/atelier/")).toBe(true);
      expect(src.endsWith(".webp")).toBe(true);
    }
  });

  it("onNavigate 콜백이 전달되면 라우트 링크 클릭 시 대상 경로를 위임한다", () => {
    const onNavigate = vi.fn();
    render(createElement(StudioFeatureAtlasPanel, { onNavigate }));

    fireEvent.click(screen.getByTestId("atlas-diff-link-diff-vrm-hair-72pose"));
    expect(onNavigate).toHaveBeenCalledWith("/studio/character");
  });

  it("7대 기능 축 탭에서 특정 기능 축 필터와 전체 축 보기를 전환할 수 있다", () => {
    render(createElement(StudioFeatureAtlasPanel));

    fireEvent.click(screen.getByTestId("atlas-tab-atlas"));
    expect(screen.getByTestId("atlas-axes-section")).toBeTruthy();
    expect(screen.getByTestId("atlas-axis-block-drawing-2d-foley")).toBeTruthy();
    expect(screen.getByTestId("atlas-axis-block-rights-bom-export")).toBeTruthy();

    fireEvent.click(screen.getByTestId("atlas-axis-filter-peripherals-multidevice"));
    expect(screen.getByTestId("atlas-axis-block-peripherals-multidevice")).toBeTruthy();
    expect(screen.queryByTestId("atlas-axis-block-drawing-2d-foley")).toBeNull();

    fireEvent.click(screen.getByTestId("atlas-axis-filter-all"));
    expect(screen.getByTestId("atlas-axis-block-drawing-2d-foley")).toBeTruthy();
  });

  it("역할별 10분 실습 매뉴얼에서 단계 체크·역할 전환·진행률 갱신·초기화가 즉시 동작한다", () => {
    render(createElement(StudioFeatureAtlasPanel));

    fireEvent.click(screen.getByTestId("atlas-tab-manual"));
    expect(screen.getByTestId("atlas-manual-progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByTestId("atlas-manual-remaining-min").textContent).toContain("10분");

    fireEvent.click(screen.getByTestId("atlas-step-checkbox-beg-1-canvas-gpen"));
    fireEvent.click(screen.getByTestId("atlas-step-checkbox-beg-2-pose-guide"));
    expect(screen.getByTestId("atlas-manual-progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByTestId("atlas-manual-remaining-min").textContent).toContain("6분");

    // 다른 역할로 전환하면 별도 진행률이 표시된다
    fireEvent.click(screen.getByTestId("atlas-role-btn-series-pd"));
    expect(screen.getByTestId("atlas-manual-progressbar").getAttribute("aria-valuenow")).toBe("0");
    fireEvent.click(screen.getByTestId("atlas-step-checkbox-pd-4-rights-bom-audit"));
    expect(screen.getByTestId("atlas-manual-progressbar").getAttribute("aria-valuenow")).toBe("20");

    // 초기화 버튼 클릭 시 0%로 돌아간다
    fireEvent.click(screen.getByTestId("atlas-manual-reset-btn"));
    expect(screen.getByTestId("atlas-manual-progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("통합 검색창·바로 찾기 칩과 단축키 치트시트 분류 필터가 정상 동작한다", () => {
    render(createElement(StudioFeatureAtlasPanel));

    fireEvent.click(screen.getByTestId("atlas-quick-chip-WebHID"));
    expect(screen.getByTestId("atlas-search-results")).toBeTruthy();
    expect(screen.getByText(/왼손 컨트롤러 브라우저 직결/u)).toBeTruthy();

    fireEvent.click(screen.getByTestId("atlas-search-clear-btn"));
    expect(screen.queryByTestId("atlas-search-results")).toBeNull();

    const searchInput = screen.getByTestId("atlas-unified-search-input");
    fireEvent.change(searchInput, { target: { value: "Shift+T" } });
    expect(screen.getByTestId("atlas-search-results")).toBeTruthy();
    expect(screen.getByText("크기 · 회전 바꾸기")).toBeTruthy();

    fireEvent.click(screen.getByTestId("atlas-search-clear-btn"));
    fireEvent.click(screen.getByTestId("atlas-tab-shortcuts"));
    expect(screen.getByTestId("atlas-shortcuts-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("atlas-shortcut-cat-collab-flow"));
    expect(screen.getByTestId("atlas-shortcut-card-sc-comment-pin")).toBeTruthy();
    expect(screen.queryByTestId("atlas-shortcut-card-sc-pen")).toBeNull();
  });
});

describe("정적 코드 위생 · 토큰 · 용량 · 번역투 규약 감사", () => {
  it("모든 프로덕션 파일이 800줄 이하이고 원시 색상·브라우저 스토리지·private store·BigInt·번역투를 포함하지 않는다", () => {
    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/u;
    const browserStorageRegex = new RegExp(
      `\\b(?:${["local", "Storage"].join("")}|${["session", "Storage"].join("")})\\b`,
      "u",
    );
    const privateStoreFieldRegex = /\bprivate\s+(?:readonly\s+)?store\b/u;
    const bigIntLiteralRegex = /\b\d+n\b/u;
    const translationeseRegex = /하는 것을 가능하게|직관적인 경험을 제공|원활한 워크플로우를 보장/u;

    const allModuleFiles = readdirSync(MODULE_DIR).filter(
      (name) => name.endsWith(".ts") || name.endsWith(".tsx"),
    );
    expect(allModuleFiles.length).toBeGreaterThanOrEqual(6);

    for (const fileName of allModuleFiles) {
      const fullPath = path.join(MODULE_DIR, fileName);
      const source = readFileSync(fullPath, "utf8");
      const lineCount = source.split("\n").length;

      expect(lineCount, `${fileName} exceeds 800 lines (${lineCount})`).toBeLessThanOrEqual(800);
      if (fileName.endsWith(".test.ts")) continue;
      expect(rawColorRegex.test(source), `${fileName} has raw color literal`).toBe(false);
      expect(browserStorageRegex.test(source), `${fileName} references browser storage`).toBe(false);
      expect(privateStoreFieldRegex.test(source), `${fileName} uses forbidden private store field`).toBe(false);
      expect(bigIntLiteralRegex.test(source), `${fileName} uses BigInt literal`).toBe(false);
      expect(translationeseRegex.test(source), `${fileName} contains translationese`).toBe(false);
    }
  });
});
