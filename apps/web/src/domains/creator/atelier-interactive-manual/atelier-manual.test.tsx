// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EXTERNAL_NAME_DETECTION_RULES, auditProprietaryBrandNaming } from "../atelier-brand-registry";

import {
  ATELIER_MANUAL_BRAND_NAME,
  ATELIER_MANUAL_SCHEMA_VERSION,
  ATELIER_MANUAL_UPDATED_AT,
  EVERYDAY_QUICK_SEARCH_CHIPS,
  LEARNING_LEVEL_ROADMAP,
  MANUAL_WORK_CONTEXT_SPECS,
  STUDIO_COMPLETE_FEATURE_GUIDES,
  STUDIO_JOURNEY_SUBWAY_STATIONS,
  StudioAtelierManualOsPanel,
  computeMasteryProgress,
  exportInteractiveManualJson,
  formatOklch,
  getGuidesForStation,
  getManualGuideById,
  getRelatedHiddenGuides,
  isVioletSlopHue,
  recommendNextGuideForContext,
  sanitizeNonVioletHue,
  searchManualGuides,
  type ManualWorkContext,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const MANDATORY_HIDDEN_GEM_IDS = [
  "guide-pchip-pressure-16k",
  "guide-atelier-solid-cutaway-gdt",
  "guide-watercolor-backrun-capillary",
  "guide-hlc-crdt-offline-merge",
  "guide-c2pa-human-merkle",
  "guide-rights-bom-gate",
  "guide-color-vision-readability",
  "guide-reader-phone-pip-390",
  "guide-handedness-mirror-0px",
] as const;

function assertZeroVioletAndRawColors(svgMarkup: string): void {
  expect(svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(svgMarkup).not.toMatch(/\brgba?\s*\(/iu);
  expect(svgMarkup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of svgMarkup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 5단계 학습 로드맵 · 7단계 노선도 · 20종 전수 카탈로그 스키마 검증", () => {
  it("LEARNING_LEVEL_ROADMAP이 입문자→프로 5단계를 순서대로 정의한다", () => {
    expect(LEARNING_LEVEL_ROADMAP).toHaveLength(5);
    expect(LEARNING_LEVEL_ROADMAP.map((l) => l.level)).toEqual([1, 2, 3, 4, 5]);
    expect(LEARNING_LEVEL_ROADMAP.map((l) => l.code)).toEqual(["Lv.1", "Lv.2", "Lv.3", "Lv.4", "Lv.5"]);
    expect(LEARNING_LEVEL_ROADMAP[0].titleKo).toContain("첫 5분");
    expect(LEARNING_LEVEL_ROADMAP[1].titleKo).toContain("웹툰 1컷");
    expect(LEARNING_LEVEL_ROADMAP[2].titleKo).toContain("3D");
    expect(LEARNING_LEVEL_ROADMAP[3].titleKo).toContain("온디바이스 AI");
    expect(LEARNING_LEVEL_ROADMAP[4].titleKo).toContain("출고");
  });

  it("STUDIO_JOURNEY_SUBWAY_STATIONS가 7단계 제작 여정을 빠짐없이 정의하고 모든 역이 2종 이상 가이드를 가진다", () => {
    expect(STUDIO_JOURNEY_SUBWAY_STATIONS).toHaveLength(7);
    expect(STUDIO_JOURNEY_SUBWAY_STATIONS.map((s) => s.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    let totalAcrossStations = 0;
    for (const station of STUDIO_JOURNEY_SUBWAY_STATIONS) {
      const guides = getGuidesForStation(station.id);
      expect(guides.length).toBeGreaterThanOrEqual(2);
      totalAcrossStations += guides.length;
    }
    expect(totalAcrossStations).toBe(20);
  });

  it("STUDIO_COMPLETE_FEATURE_GUIDES가 정확히 20종이며 5단계 모두 균형 있게 커버한다", () => {
    expect(STUDIO_COMPLETE_FEATURE_GUIDES).toHaveLength(20);
    expect(new Set(STUDIO_COMPLETE_FEATURE_GUIDES.map((g) => g.id)).size).toBe(20);
    for (const lv of [1, 2, 3, 4, 5] as const) {
      const count = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.level === lv).length;
      expect(count).toBe(4);
    }
  });

  it("20종 가이드 전부가 필수 스키마(요약·사용시점·3~4단계·단축키·실수·팁·딥링크·연관숨은기능)를 충족한다", () => {
    for (const guide of STUDIO_COMPLETE_FEATURE_GUIDES) {
      expect(guide.titleKo.length).toBeGreaterThan(4);
      expect(guide.titleEn.length).toBeGreaterThan(4);
      expect(guide.plainOneLineKo.length).toBeGreaterThan(10);
      expect(guide.plainOneLineEn.length).toBeGreaterThan(10);
      expect(guide.whenToUseKo.length).toBeGreaterThan(10);
      expect(guide.whenToUseEn.length).toBeGreaterThan(10);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.steps.length).toBeLessThanOrEqual(4);
      expect(guide.shortcut.trim().length).toBeGreaterThan(0);
      expect(guide.commonMistakeKo.length).toBeGreaterThan(10);
      expect(guide.proTipKo.length).toBeGreaterThan(10);
      expect(guide.quickTooltipKo.length).toBeGreaterThan(10);
      expect(guide.studioHref.startsWith("/studio")).toBe(true);
      expect(guide.everydayIntents.length).toBeGreaterThanOrEqual(5);
      expect(guide.relatedHiddenIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("빈도 분류가 daily(6) + weekly(5) + hidden-gem(9) = 20종으로 구성된다", () => {
    const daily = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.frequency === "daily");
    const weekly = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.frequency === "weekly");
    const hidden = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.frequency === "hidden-gem");
    expect(daily).toHaveLength(6);
    expect(weekly).toHaveLength(5);
    expect(hidden).toHaveLength(9);
    expect(daily.length + weekly.length + hidden.length).toBe(20);
  });

  it("필수 숨은 고수 기능 9종이 모두 hidden-gem 뱃지로 등록되어 있다", () => {
    for (const id of MANDATORY_HIDDEN_GEM_IDS) {
      const guide = getManualGuideById(id);
      expect(guide).toBeDefined();
      expect(guide?.frequency).toBe("hidden-gem");
    }
    expect(getManualGuideById("guide-pchip-pressure-16k")?.titleKo).toContain("16K PCHIP");
    expect(getManualGuideById("guide-atelier-solid-cutaway-gdt")?.titleKo).toContain("GD&T");
    expect(getManualGuideById("guide-watercolor-backrun-capillary")?.titleKo).toContain("백런");
    expect(getManualGuideById("guide-hlc-crdt-offline-merge")?.titleKo).toContain("HLC CRDT");
    expect(getManualGuideById("guide-c2pa-human-merkle")?.titleKo).toContain("C2PA");
    expect(getManualGuideById("guide-rights-bom-gate")?.titleKo).toContain("Rights BOM");
    expect(getManualGuideById("guide-color-vision-readability")?.titleKo).toContain("색각");
    expect(getManualGuideById("guide-reader-phone-pip-390")?.titleKo).toContain("390px");
    expect(getManualGuideById("guide-handedness-mirror-0px")?.titleKo).toContain("0px 미러");
  });

  it("모든 가이드의 relatedHiddenIds가 자기 자신이 아닌 실존 hidden-gem만 참조한다", () => {
    for (const guide of STUDIO_COMPLETE_FEATURE_GUIDES) {
      const related = getRelatedHiddenGuides(guide.id);
      expect(related.length).toBe(guide.relatedHiddenIds.length);
      for (const rel of related) {
        expect(rel.frequency).toBe("hidden-gem");
        expect(rel.id).not.toBe(guide.id);
      }
    }
    expect(getRelatedHiddenGuides("non-existent-id")).toEqual([]);
  });

  it("바이올렛(265~325°) 배제 헬퍼와 모든 노선·레벨 OKLCH 색상이 0% 바이올렛 계약을 지킨다", () => {
    expect(isVioletSlopHue(265)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(325)).toBe(true);
    expect(isVioletSlopHue(224)).toBe(false);
    expect(isVioletSlopHue(48)).toBe(false);
    for (let h = 265; h <= 325; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
    expect(formatOklch({ l: 0.54, c: 0.14, h: 290 }, 0.5)).toBe("oklch(0.54 0.14 224 / 0.50)");
    for (const st of STUDIO_JOURNEY_SUBWAY_STATIONS) expect(isVioletSlopHue(st.accentOklch.h)).toBe(false);
    for (const lv of LEARNING_LEVEL_ROADMAP) expect(isVioletSlopHue(lv.accentOklch.h)).toBe(false);
  });

  it("메타데이터 상수와 빠른 일상어 검색 칩 7종이 유효하다", () => {
    expect(ATELIER_MANUAL_BRAND_NAME).toBe("AtelierGuide");
    expect(ATELIER_MANUAL_SCHEMA_VERSION).toBe("toonstudio.atelier-guide.manual-os.v1");
    expect(ATELIER_MANUAL_UPDATED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(EVERYDAY_QUICK_SEARCH_CHIPS.length).toBe(7);
    expect(MANUAL_WORK_CONTEXT_SPECS.length).toBe(7);
  });
});

describe("2. 일상어 의도 검색기(searchManualGuides) 검증", () => {
  it("빈 검색어는 전체 20종을 레벨 순으로 반환한다", () => {
    const hits = searchManualGuides("   ");
    expect(hits).toHaveLength(20);
    expect(hits[0].matchedBy).toBe("catalog");
    expect(hits[0].guide.level).toBe(1);
    expect(hits[19].guide.level).toBe(5);
  });

  it("'손이 떨려요'·'손목 아파요' 일상어 검색이 첫 선 긋기 및 16K PCHIP 필압 가이드를 상위에 올린다", () => {
    const tremorHits = searchManualGuides("손이 떨려요");
    expect(tremorHits[0].guide.id).toBe("guide-first-canvas-ink");
    expect(tremorHits[0].matchedBy).toBe("everyday-intent");

    const wristHits = searchManualGuides("손목 아파요");
    expect(wristHits[0].guide.id).toBe("guide-pchip-pressure-16k");
  });

  it("'왼손잡이'·'폰에서 글자' 일상어 검색이 0px 미러와 390px 독자 폰뷰 PiP를 정확히 찾는다", () => {
    expect(searchManualGuides("왼손잡이")[0].guide.id).toBe("guide-handedness-mirror-0px");
    expect(searchManualGuides("폰에서 어떻게 보여")[0].guide.id).toBe("guide-reader-phone-pip-390");
    expect(searchManualGuides("글자 안 보일까 봐")[0].guide.id).toBe("guide-reader-phone-pip-390");
  });

  it("'수채화 테두리'·'벽 가림 단면'·'적록 색약' 검색이 숨은 프로 기능을 최상단으로 매칭한다", () => {
    expect(searchManualGuides("백런")[0].guide.id).toBe("guide-watercolor-backrun-capillary");
    expect(searchManualGuides("벽 가림 단면")[0].guide.id).toBe("guide-atelier-solid-cutaway-gdt");
    expect(searchManualGuides("적록 색약")[0].guide.id).toBe("guide-color-vision-readability");
  });

  it("'와이파이 끊김'·'저작권 괜찮을까'·'AI 아니라고 증명' 검색이 Lv.5 숨은 기능 3종을 정확히 찾는다", () => {
    expect(searchManualGuides("와이파이 끊김")[0].guide.id).toBe("guide-hlc-crdt-offline-merge");
    expect(searchManualGuides("저작권 괜찮을까")[0].guide.id).toBe("guide-rights-bom-gate");
    expect(searchManualGuides("ai 아니라고 증명")[0].guide.id).toBe("guide-c2pa-human-merkle");
  });

  it("단축키 직접 검색(Ctrl+Shift+B, Alt+Shift+H, K)은 shortcut 매치로 최고 점수를 부여한다", () => {
    const bom = searchManualGuides("Ctrl+Shift+B");
    expect(bom[0].guide.id).toBe("guide-rights-bom-gate");
    expect(bom[0].matchedBy).toBe("shortcut");

    const mirror = searchManualGuides("Alt+Shift+H");
    expect(mirror[0].guide.id).toBe("guide-handedness-mirror-0px");
    expect(mirror[0].matchedBy).toBe("shortcut");

    const split = searchManualGuides("K");
    expect(split[0].guide.id).toBe("guide-panel-frame-split");
    expect(split[0].matchedBy).toBe("shortcut");
  });

  it("레벨·빈도·지하철역·카테고리 복합 필터와 영문 검색이 정확히 교집합으로 동작한다", () => {
    const lv5Hidden = searchManualGuides("", { level: 5, frequency: "hidden-gem" });
    expect(lv5Hidden).toHaveLength(3);
    expect(lv5Hidden.every((h) => h.guide.level === 5 && h.guide.frequency === "hidden-gem")).toBe(true);

    const s6Qa = searchManualGuides("", { stationId: "station-6-qa", category: "qa-accessibility" });
    expect(s6Qa).toHaveLength(3);

    const enHit = searchManualGuides("watercolor backrun");
    expect(enHit[0].guide.id).toBe("guide-watercolor-backrun-capillary");
  });

  it("일치 항목이 없는 검색어에는 빈 배열을 안전하게 반환한다", () => {
    expect(searchManualGuides("zzzz-nonexistent-query-9999")).toEqual([]);
  });
});

describe("3. 작업 컨텍스트 기반 다음 추천 코치(recommendNextGuideForContext) 검증", () => {
  it("7개 작업 컨텍스트 전부가 각 상황에 맞는 주 추천·숨은 추천·5초 툴팁을 반환한다", () => {
    for (const spec of MANUAL_WORK_CONTEXT_SPECS) {
      const rec = recommendNextGuideForContext({ currentContext: spec.id });
      expect(rec.context).toBe(spec.id);
      expect(rec.primaryGuide).toBeDefined();
      expect(rec.hiddenGemGuide.frequency).toBe("hidden-gem");
      expect(rec.tooltip5sKo.length).toBeGreaterThan(10);
      expect(rec.tooltip5sEn.length).toBeGreaterThan(10);
      expect(rec.allContextCleared).toBe(false);
    }
  });

  it("이미 실습 완료한 가이드는 건너뛰고 해당 컨텍스트의 다음 미완료 가이드를 추천한다", () => {
    const first = recommendNextGuideForContext({ currentContext: "first-open", completedGuideIds: [] });
    expect(first.primaryGuide.id).toBe("guide-first-canvas-ink");

    const second = recommendNextGuideForContext({
      currentContext: "first-open",
      completedGuideIds: ["guide-first-canvas-ink"],
    });
    expect(second.primaryGuide.id).toBe("guide-layer-clipping-basics");
  });

  it("preferHiddenGem=true 옵션을 주면 숨은 고수 기능을 최우선 추천으로 승격한다", () => {
    const rec = recommendNextGuideForContext({ currentContext: "scene-3d", preferHiddenGem: true });
    expect(rec.primaryGuide.frequency).toBe("hidden-gem");
    expect(rec.primaryGuide.id).toBe("guide-atelier-solid-cutaway-gdt");
    expect(rec.hiddenGemGuide.id).not.toBe(rec.primaryGuide.id);
  });

  it("현재 컨텍스트의 주·숨은 기능을 모두 완료하면 allContextCleared=true로 다음 단계를 안내한다", () => {
    const rec = recommendNextGuideForContext({
      currentContext: "first-open",
      completedGuideIds: [
        "guide-first-canvas-ink",
        "guide-layer-clipping-basics",
        "guide-pchip-pressure-16k",
        "guide-handedness-mirror-0px",
      ],
    });
    expect(rec.allContextCleared).toBe(true);
    expect(rec.primaryGuide.level).toBeGreaterThanOrEqual(2);
  });

  it("20종 전부를 완료한 그랜드마스터 상태에서도 오류 없이 복습 추천을 반환한다", () => {
    const allIds = STUDIO_COMPLETE_FEATURE_GUIDES.map((g) => g.id);
    const rec = recommendNextGuideForContext({ currentContext: "team-export", completedGuideIds: allIds });
    expect(rec.allContextCleared).toBe(true);
    expect(rec.primaryGuide).toBeDefined();
    expect(rec.hiddenGemGuide).toBeDefined();
  });

  it("알 수 없는 컨텍스트 입력 시 first-open으로 안전 폴백한다", () => {
    const rec = recommendNextGuideForContext({ currentContext: "invalid-ctx" as ManualWorkContext });
    expect(rec.context).toBe("first-open");
    expect(rec.primaryGuide.id).toBe("guide-first-canvas-ink");
  });
});

describe("4. 학습 진도·배지 계산기(computeMasteryProgress) & JSON 내보내기 검증", () => {
  it("빈 완료 목록은 0/20(0%), 입문 견습생 랭크, 배지 0개로 초기화된다", () => {
    const p = computeMasteryProgress([]);
    expect(p.completedCount).toBe(0);
    expect(p.totalGuides).toBe(20);
    expect(p.overallPercent).toBe(0);
    expect(p.hiddenGemCompleted).toBe(0);
    expect(p.hiddenGemTotal).toBe(9);
    expect(p.currentRank.rankId).toBe("novice");
    expect(p.unlockedBadges).toHaveLength(0);
  });

  it("중복 ID와 미등록 ID를 정화하여 정확한 완료 수만 집계한다", () => {
    const p = computeMasteryProgress([
      "guide-first-canvas-ink",
      "guide-first-canvas-ink",
      "unknown-guide-id",
      "guide-pchip-pressure-16k",
    ]);
    expect(p.completedCount).toBe(2);
    expect(p.overallPercent).toBe(10);
    expect(p.hiddenGemCompleted).toBe(1);
    expect(p.validCompletedIds).toEqual(["guide-first-canvas-ink", "guide-pchip-pressure-16k"]);
    expect(p.unlockedBadges.map((b) => b.id)).toContain("badge-first-stroke");
  });

  it("Lv.1 4종을 모두 완료하면 Lv.1 완주 배지와 웹툰 1컷 완주자 랭크가 해금된다", () => {
    const lv1Ids = STUDIO_COMPLETE_FEATURE_GUIDES.filter((g) => g.level === 1).map((g) => g.id);
    const p = computeMasteryProgress(lv1Ids);
    expect(p.byLevel[0].isCleared).toBe(true);
    expect(p.byLevel[0].percent).toBe(100);
    expect(p.currentRank.rankId).toBe("cut-finisher");
    expect(p.unlockedBadges.map((b) => b.id)).toContain("badge-lv1-clear");
  });

  it("숨은 기능 3종 이상 완료 시 숨은 기능 탐험가 배지를, 9종 전부 완료 시 숨은 기능 9종 정복 배지를 지급한다", () => {
    const p3 = computeMasteryProgress(MANDATORY_HIDDEN_GEM_IDS.slice(0, 3));
    expect(p3.unlockedBadges.map((b) => b.id)).toContain("badge-hidden-scout");
    expect(p3.unlockedBadges.map((b) => b.id)).not.toContain("badge-hidden-master");

    const p9 = computeMasteryProgress([...MANDATORY_HIDDEN_GEM_IDS]);
    expect(p9.hiddenGemPercent).toBe(100);
    expect(p9.unlockedBadges.map((b) => b.id)).toContain("badge-hidden-master");
    expect(p9.currentRank.rankId).toBe("spatial-builder");
  });

  it("20종 전부를 완료하면 100%, 그랜드마스터 랭크, 5개 레벨 완주 + 숨은 기능 + 전수 정복 배지를 모두 해금한다", () => {
    const p = computeMasteryProgress(STUDIO_COMPLETE_FEATURE_GUIDES.map((g) => g.id));
    expect(p.overallPercent).toBe(100);
    expect(p.currentRank.rankId).toBe("grandmaster");
    expect(p.byLevel.every((l) => l.isCleared)).toBe(true);
    const badgeIds = p.unlockedBadges.map((b) => b.id);
    expect(badgeIds).toEqual(
      expect.arrayContaining([
        "badge-first-stroke", "badge-lv1-clear", "badge-lv2-clear", "badge-lv3-clear",
        "badge-lv4-clear", "badge-lv5-clear", "badge-hidden-scout", "badge-hidden-master", "badge-complete-20",
      ]),
    );
  });

  it("exportInteractiveManualJson이 유효한 JSON 스키마·진도·추천·필터 결과를 생성한다", () => {
    const bundle = exportInteractiveManualJson({
      completedGuideIds: ["guide-first-canvas-ink", "guide-rights-bom-gate"],
      currentContext: "team-export",
      filters: { frequency: "hidden-gem" },
    });
    const parsed = JSON.parse(bundle.json) as typeof bundle.payload;
    expect(parsed.schemaVersion).toBe(ATELIER_MANUAL_SCHEMA_VERSION);
    expect(parsed.brandName).toBe("AtelierGuide");
    expect(parsed.totalLevels).toBe(5);
    expect(parsed.totalStations).toBe(7);
    expect(parsed.totalGuides).toBe(20);
    expect(parsed.hiddenGemCount).toBe(9);
    expect(parsed.progress.completedCount).toBe(2);
    expect(parsed.filteredGuideIds).toHaveLength(9);
    expect(parsed.contextRecommendation.context).toBe("team-export");
  });
});

describe("5. UI 제어판(StudioAtelierManualOsPanel) 인터랙션 · 필터 · 체크박스 · 복사 검증", () => {
  it("props 없이 기본 렌더링 시 7역 노선도 SVG, 5단계 탭, 컨텍스트 코치, 20종 가이드 전부가 표시된다", () => {
    render(<StudioAtelierManualOsPanel />);
    expect(screen.getByTestId("atelier-manual-os-panel")).toBeTruthy();
    expect(screen.getByTestId("atelier-subway-map-svg").getAttribute("data-violet-free")).toBe("true");
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(20);
    expect(screen.getByTestId("mastery-overall-readout").textContent).toContain("0/20 (0%)");
    expect(screen.getByTestId("mastery-hidden-readout").textContent).toContain("0/9 (0%)");
  });

  it("7단계 지하철 노선도 역 클릭 시 즉시 필터되고 해당 역의 첫 따라하기가 자동으로 펼쳐진다", () => {
    render(<StudioAtelierManualOsPanel />);
    fireEvent.click(screen.getByTestId("subway-station-station-7-ship"));
    expect(screen.getByTestId("atelier-subway-map-svg").getAttribute("data-active-station-id")).toBe("station-7-ship");
    expect(screen.getByTestId("active-station-summary").textContent).toContain("S7");
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(4);
    expect(screen.getByTestId("guide-details-guide-atelier-stage-webcodecs-4k")).toBeTruthy();

    fireEvent.click(screen.getByTestId("subway-station-all"));
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(20);
  });

  it("5단계 학습 로드맵 탭 클릭 시 해당 레벨 4종으로 필터되고 레벨 목표 배너가 표시된다", () => {
    render(<StudioAtelierManualOsPanel />);
    fireEvent.click(screen.getByTestId("level-tab-3"));
    expect(screen.getByTestId("active-level-banner").textContent).toContain("Lv.3");
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(4);
    expect(screen.getByTestId("guide-details-guide-atelier-cast-pose")).toBeTruthy();

    fireEvent.click(screen.getByTestId("level-tab-all"));
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(20);
  });

  it("빈도 필터(숨은 고수 기능) 클릭 시 숨은 기능 9종만 필터링되어 표시된다", () => {
    render(<StudioAtelierManualOsPanel />);
    fireEvent.click(screen.getByTestId("freq-filter-hidden-gem"));
    const cards = screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']");
    expect(cards).toHaveLength(9);
    for (const card of cards) {
      expect(card.getAttribute("data-frequency")).toBe("hidden-gem");
    }
  });

  it("일상어 검색 입력 및 빠른 일상어 칩 클릭과 빈 결과 복구가 정상 동작한다", () => {
    render(<StudioAtelierManualOsPanel />);
    fireEvent.click(screen.getByTestId("quick-chip-1")); // "왼손잡이"
    expect((screen.getByTestId("manual-search-input") as HTMLInputElement).value).toBe("왼손잡이");
    expect(screen.getByTestId("guide-card-guide-handedness-mirror-0px")).toBeTruthy();

    fireEvent.change(screen.getByTestId("manual-search-input"), { target: { value: "없는기능검색어999" } });
    expect(screen.getByTestId("manual-empty-state")).toBeTruthy();

    fireEvent.click(screen.getByTestId("manual-empty-reset-btn"));
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(20);
  });

  it("작업 컨텍스트 코치 전환 및 `?` 5초 툴팁 토글과 숨은 기능 점프가 동작한다", () => {
    const onSelectGuide = vi.fn();
    render(<StudioAtelierManualOsPanel onSelectGuide={onSelectGuide} />);

    fireEvent.click(screen.getByTestId("work-context-qa-check"));
    expect(screen.getByTestId("coach-primary-title").textContent).toContain("작화 붕괴");
    expect(screen.getByTestId("tooltip-5s-preview")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tooltip-5s-toggle-btn"));
    expect(screen.queryByTestId("tooltip-5s-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("coach-open-hidden-btn"));
    expect(onSelectGuide).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("guide-details-guide-color-vision-readability")).toBeTruthy();
  });

  it("기능 카드 펼침 시 3~4단계 따라하기·자주 하는 실수·프로 팁·딥링크·연관 숨은 기능 이동이 동작한다", () => {
    render(<StudioAtelierManualOsPanel />);
    expect(screen.getByTestId("guide-details-guide-first-canvas-ink")).toBeTruthy();
    expect(screen.getByTestId("guide-studio-link-guide-first-canvas-ink").getAttribute("href")).toBe(
      "/studio/new?preset=webtoon-scroll&tool=ink-pen",
    );

    fireEvent.click(screen.getByTestId("related-hidden-guide-first-canvas-ink-guide-pchip-pressure-16k"));
    expect(screen.getByTestId("guide-details-guide-pchip-pressure-16k")).toBeTruthy();
    expect(screen.getByTestId("guide-details-guide-pchip-pressure-16k").textContent).toContain("PCHIP");
  });

  it("실습 체크박스 토글 시 진도율·숨은 기능 카운터·배지·onToggleCompleted 콜백이 즉시 갱신된다", () => {
    const onToggleCompleted = vi.fn();
    render(<StudioAtelierManualOsPanel onToggleCompleted={onToggleCompleted} />);

    fireEvent.click(screen.getByTestId("guide-complete-checkbox-guide-first-canvas-ink"));
    fireEvent.click(screen.getByTestId("guide-complete-checkbox-guide-pchip-pressure-16k"));
    expect(onToggleCompleted).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("mastery-overall-readout").textContent).toContain("2/20 (10%)");
    expect(screen.getByTestId("mastery-hidden-readout").textContent).toContain("1/9 (11%)");
    expect(screen.getByTestId("unlocked-badge-badge-first-stroke")).toBeTruthy();

    // 체크 해제
    fireEvent.click(screen.getByTestId("guide-complete-checkbox-guide-pchip-pressure-16k"));
    expect(screen.getByTestId("mastery-overall-readout").textContent).toContain("1/20 (5%)");
  });

  it("외부 내보내기가 실패해도 JSON 미리보기와 오류 안내를 제공한다", async () => {
    const onExportJson = vi.fn().mockRejectedValue(new Error("destination unavailable"));
    render(<StudioAtelierManualOsPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("manual-copy-json-btn"));
    await waitFor(() => expect(screen.getByTestId("manual-status-message").textContent).toContain("외부 내보내기에 실패했습니다."));
  });

  it("JSON 복사 버튼이 클립보드 쓰기·미리보기 표시·onExportJson을 실행하고 초기화 버튼이 상태를 복구한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onExportJson = vi.fn();

    render(<StudioAtelierManualOsPanel initialCompletedGuideIds={["guide-first-canvas-ink"]} onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("manual-copy-json-btn"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("manual-json-preview").textContent).toContain(ATELIER_MANUAL_SCHEMA_VERSION);

    fireEvent.click(screen.getByTestId("freq-filter-hidden-gem"));
    fireEvent.click(screen.getByTestId("manual-reset-btn"));
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(20);
    expect(screen.getByTestId("mastery-overall-readout").textContent).toContain("1/20 (5%)");
  });

  it("영문 로케일(locale='en')과 사용자 className 및 초기 필터 props가 정상 반영된다", () => {
    render(
      <StudioAtelierManualOsPanel
        locale="en"
        initialLevel={4}
        className="custom-manual-host"
      />,
    );
    const panel = screen.getByTestId("atelier-manual-os-panel");
    expect(panel.className).toContain("custom-manual-host");
    expect(panel.textContent).toContain("Built-In Interactive Manual OS");
    expect(screen.getByTestId("manual-guide-list").querySelectorAll("li[data-testid^='guide-card-']")).toHaveLength(4);
  });
});

describe("6. 엄격 하네스 · 디자인 계약 · 100% 고유 브랜드 청정 자가 검증", () => {
  it("소유 파일 4종만 존재하며 줄 수 상한(engine<=740, panel<=680, index<=80, test<=740)을 지킨다", () => {
    const dir = path.resolve(import.meta.dirname);
    const expectedFiles = [
      "StudioAtelierManualOsPanel.tsx",
      "atelier-manual-engine.ts",
      "atelier-manual.test.tsx",
      "index.ts",
    ];
    const actualFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f)).sort();
    expect(actualFiles).toEqual(expectedFiles);

    const lineCaps: Readonly<Record<string, number>> = {
      "atelier-manual-engine.ts": 740,
      "StudioAtelierManualOsPanel.tsx": 680,
      "index.ts": 80,
      "atelier-manual.test.tsx": 740,
    };
    for (const file of expectedFiles) {
      const lines = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(lineCaps[file]);
    }
  });

  it("금지 패턴 0건(Web Storage·raw 색·transition-all·Sparkles·= {}·번역투) 및 필수 Calm 클래스를 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const prodFiles = ["atelier-manual-engine.ts", "StudioAtelierManualOsPanel.tsx", "index.ts"];
    for (const file of prodFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("가능하게 합니다");
      expect(src).not.toContain("직관적인 경험을 제공");
      expect(src).not.toContain("원활한 워크플로우를 보장");
    }

    const panelSrc = readFileSync(path.join(dir, "StudioAtelierManualOsPanel.tsx"), "utf8");
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).not.toContain("Sparkles");
    expect(panelSrc).not.toMatch(/Props\s*=\s*\{\}/u);
    expect(panelSrc).not.toMatch(/\)\s*=\s*\{\}/u);
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });

  it("디렉터리·파일·export 심볼·20종 가이드 및 전체 프로덕션 소스에 외부 브랜드명 혼입이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    expect(auditProprietaryBrandNaming(path.basename(dir)).verdict).toBe("clean");
    for (const file of readdirSync(dir)) {
      expect(auditProprietaryBrandNaming(file).verdict).toBe("clean");
    }

    const forbiddenTokens = EXTERNAL_NAME_DETECTION_RULES.flatMap((rule) => rule.tokens);
    const forbiddenRe = new RegExp(`\\b(?:${forbiddenTokens.join("|")})\\b`, "iu");
    for (const file of ["atelier-manual-engine.ts", "StudioAtelierManualOsPanel.tsx", "index.ts"]) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(forbiddenRe);
      for (const m of src.matchAll(/export\s+(?:const|function|type|interface)\s+([A-Za-z0-9_]+)/gu)) {
        expect(auditProprietaryBrandNaming(m[1]).verdict).toBe("clean");
      }
    }

    for (const guide of STUDIO_COMPLETE_FEATURE_GUIDES) {
      expect(auditProprietaryBrandNaming(`${guide.titleKo} ${guide.titleEn} ${guide.atelierSuite}`, { context: "ui-label" }).verdict).toBe("clean");
    }
  });

  it("렌더링된 모든 버튼이 min-h-11(44px) 터치 타깃을 만족하고 모든 SVG가 0% 바이올렛·0 raw 색을 지킨다", () => {
    const { container } = render(<StudioAtelierManualOsPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(25);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    for (const svg of svgs) {
      assertZeroVioletAndRawColors(svg.outerHTML);
    }
  });
});
