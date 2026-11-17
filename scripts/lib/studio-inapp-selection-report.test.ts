import { describe, expect, it } from "vitest";

import { PROFILES, ROUTES } from "../verify-studio-inapp-browser.mts";

import { buildStudioInAppReport, createStudioInAppCatalog, selectStudioInAppCases, studioInAppResultLine,
  type StudioInAppCase, type StudioInAppSelection } from "./studio-inapp-selection-report.mts";

const catalog = createStudioInAppCatalog(PROFILES, ROUTES);
const selectedEnv = {
  TOONSPECTRUM_INAPP_VERIFY_PROFILES: "kakaotalk-android-360",
  TOONSPECTRUM_INAPP_VERIFY_ROUTES: "editor",
};
const passed = (item: StudioInAppCase) => ({ ...item, ok: true, hardFailures: [] });
const caseAt = (selection: StudioInAppSelection, index = 0): StudioInAppCase => {
  const item = selection.planned[index];
  if (!item) throw new Error("테스트가 요구한 계획 case가 없습니다.");
  return item;
};

describe("원래 인앱 검사 범위의 명시적 선택", () => {
  it("필터가 없으면 기존 세 profile과 38개 eligible case 및 원래 순서를 유지한다", () => {
    const selection = selectStudioInAppCases(catalog);
    expect(selection.scope).toBe("full");
    expect(catalog.profiles).toEqual(["kakaotalk-android-360", "instagram-ios-390", "naver-android-412"]);
    expect(selection.planned).toHaveLength(38);
    expect(selection.totalEligible).toBe(38);
    expect(selection.excludedByFilter).toBe(0);
    expect(catalog.excludedByProfile).toBe(4);
    expect(selection.planned[0]).toEqual({ profile: "kakaotalk-android-360", route: "home" });
    expect(selection.planned.at(-1)).toEqual({ profile: "naver-android-412", route: "invalid" });
  });

  it("명시한 한 case만 계획하며 원래 eligible 38개 중 제외한 37개를 기록한다", () => {
    expect(selectStudioInAppCases(catalog, selectedEnv)).toEqual({
      scope: "selected", planned: [{ profile: "kakaotalk-android-360", route: "editor" }],
      totalEligible: 38, excludedByFilter: 37,
    });
  });

  it("한 축만 선택하면 원래 profile 제약을 유지하고 입력 순서와 무관하게 catalog 순서로 실행한다", () => {
    expect(selectStudioInAppCases(catalog, { TOONSPECTRUM_INAPP_VERIFY_PROFILES: "instagram-ios-390" }).planned).toHaveLength(12);
    const selection = selectStudioInAppCases(catalog, { TOONSPECTRUM_INAPP_VERIFY_ROUTES: "editor,home" });
    expect(selection.planned).toHaveLength(6);
    expect(selection.planned.slice(0, 2)).toEqual([
      { profile: "kakaotalk-android-360", route: "home" }, { profile: "kakaotalk-android-360", route: "editor" },
    ]);
    expect(selectStudioInAppCases(catalog, { TOONSPECTRUM_INAPP_VERIFY_ROUTES: "companion-workspace-session" }).planned)
      .toEqual([{ profile: "kakaotalk-android-360", route: "companion-workspace-session" }]);
  });

  it.each(["", " ", ",editor", "editor,", "editor,editor", "unknown", "*"])(
    "빈 값·알 수 없는 값·중복 route는 전체 실행으로 복구하지 않고 거부한다: %j", value => {
      expect(() => selectStudioInAppCases(catalog, { ...selectedEnv, TOONSPECTRUM_INAPP_VERIFY_ROUTES: value })).toThrow();
    },
  );
  it.each(["", " ", "unknown", "kakaotalk-android-360,kakaotalk-android-360"])("잘못된 profile을 거부한다: %j", value => {
    expect(() => selectStudioInAppCases(catalog, { ...selectedEnv, TOONSPECTRUM_INAPP_VERIFY_PROFILES: value })).toThrow();
  });
  it("명시적으로 요청한 부적격 쌍은 다른 eligible 쌍이 있어도 조용히 제외하지 않는다", () => {
    expect(() => selectStudioInAppCases(catalog, { TOONSPECTRUM_INAPP_VERIFY_PROFILES: "kakaotalk-android-360,instagram-ios-390",
      TOONSPECTRUM_INAPP_VERIFY_ROUTES: "home,companion-workspace-session" })).toThrow(/부적격/u);
    expect(() => selectStudioInAppCases(createStudioInAppCatalog([{ id: "profile" }], [{ id: "route", profiles: [] }]))).toThrow(/0개/u);
  });
});

describe("인앱 원본 결과와 불완전 실행의 JSON 판정", () => {
  it("선택한 case 성공은 SELECTED로만 표현하며 원본 결과를 변경하지 않는다", () => {
    const selection = selectStudioInAppCases(catalog, selectedEnv);
    const result = { ...passed(caseAt(selection)), metrics: { marker: "original" }, openedDetailsAudited: 2 };
    const report = buildStudioInAppReport({ catalog, selection, env: selectedEnv, results: [result], phase: "complete" });
    expect(report).toMatchObject({ kind: "toonstudio-studio-inapp-browser-v1", scope: "selected", totalEligible: 38,
      excludedByFilter: 37, selectionValid: true, complete: true, ok: true, failures: [], fatalFailure: null, notRun: [] });
    expect(report.results).toEqual([result]);
    expect(report.plannedIds).toEqual(["kakaotalk-android-360/editor"]);
    expect(studioInAppResultLine(report)).toBe("RESULT: SELECTED OK (1/1 selected; eligible 38; excluded 37)");
  });
  it("기본 전체 실행만 38개의 원래 성공을 전체 결과로 표시한다", () => {
    const selection = selectStudioInAppCases(catalog);
    const report = buildStudioInAppReport({ catalog, selection, results: selection.planned.map(passed), phase: "complete" });
    expect(report.ok).toBe(true);
    expect(studioInAppResultLine(report)).toBe("RESULT: OK (38 runs green)");
  });
  it("실패 assertion이나 불일치 ok 값은 성공으로 바꾸지 않는다", () => {
    const selection = selectStudioInAppCases(catalog, selectedEnv);
    for (const result of [{ ...passed(caseAt(selection)), ok: false }, { ...passed(caseAt(selection)), hardFailures: ["offscreen"] }]) {
      const report = buildStudioInAppReport({ catalog, selection, results: [result], phase: "complete" });
      expect(report.ok).toBe(false);
      expect(report.complete).toBe(true);
      expect(report.failures).not.toEqual([]);
      expect(report.results).toEqual([result]);
    }
  });
  it("결과 누락·다른 case·중복 결과·실행 도중 checkpoint를 통과로 처리하지 않는다", () => {
    const selection = selectStudioInAppCases(catalog, selectedEnv);
    for (const results of [[], [passed({ profile: "instagram-ios-390", route: "editor" })], [passed(caseAt(selection)), passed(caseAt(selection))]]) {
      const report = buildStudioInAppReport({ catalog, selection, results, phase: "complete" });
      expect(report.ok).toBe(false);
      expect(report.failures).not.toEqual([]);
    }
    expect(buildStudioInAppReport({ catalog, selection, results: [passed(caseAt(selection))], phase: "case" }).ok).toBe(false);
  });
  it("fatal에서 완료한 원본 결과·실패한 active case·미실행을 구분한다", () => {
    const selection = selectStudioInAppCases(catalog, { TOONSPECTRUM_INAPP_VERIFY_PROFILES: "kakaotalk-android-360",
      TOONSPECTRUM_INAPP_VERIFY_ROUTES: "home,immersive,editor" });
    const fatalFailure = { phase: "case", case: caseAt(selection, 1), name: "TimeoutError", message: "element is inert" };
    const result = passed(caseAt(selection));
    const report = buildStudioInAppReport({ catalog, selection, results: [result], phase: "case",
      activeCase: caseAt(selection, 1), fatalFailure });
    expect(report.ok).toBe(false);
    expect(report.complete).toBe(false);
    expect(report.results).toEqual([result]);
    expect(report.fatalFailure).toEqual(fatalFailure);
    expect(report.notRun).toEqual([caseAt(selection, 2)]);
    expect(report.failures).toEqual(["case: TimeoutError: element is inert"]);
  });
  it("필터 검증 실패도 선택 범위와 전체 eligible 수를 남기고 성공시키지 않는다", () => {
    const report = buildStudioInAppReport({ catalog, selection: null, env: { TOONSPECTRUM_INAPP_VERIFY_ROUTES: "" },
      results: [], phase: "selection", fatalFailure: { phase: "selection", case: null, name: "Error", message: "빈 값" } });
    expect(report).toMatchObject({ scope: "selected", selectionValid: false, planned: [], totalEligible: 38,
      excludedByFilter: 38, complete: false, ok: false, results: [] });
    expect(report.failures).toEqual(["selection: Error: 빈 값"]);
  });
});
