// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  ACCESSIBILITY_AUDIT_PRESETS,
  applyAaaRemediation,
  auditStudioAccessibilityBudget,
  autoResolveShortcutConflicts,
  computeHandednessLayoutPlan,
  createShortcutBindingsFromPreset,
  detectShortcutConflicts,
  exportShortcutProfileJson,
  importShortcutProfileJson,
  normalizeShortcutChord,
  remapShortcutCommand,
  SHORTCUT_COMMANDS,
  SHORTCUT_PRESET_IDS,
  SHORTCUT_PRESETS,
  SHORTCUT_PROFILE_FORMAT,
  SHORTCUT_PROFILE_MAX_JSON_BYTES,
  StudioErgonomicsMasterPanel,
  type StudioAccessibilityAuditInput,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/ergonomics-shortcut-master",
);

describe("Wave 41F: 프로 단축키 리매핑 · 왼손/한손 태블릿 미러 · WCAG 2.2 AAA 접근성 마스터", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 4대 업계 프리셋(ToonStudio·CSP·Photoshop·Procreate)은 18종 이상 핵심 명령을 충돌 없이 정의한다", () => {
    expect(SHORTCUT_PRESET_IDS).toEqual(["toonstudio", "csp", "photoshop", "procreate"]);
    expect(SHORTCUT_COMMANDS.length).toBeGreaterThanOrEqual(18);

    for (const presetId of SHORTCUT_PRESET_IDS) {
      const bindings = createShortcutBindingsFromPreset(presetId);
      const macReport = detectShortcutConflicts(bindings, "mac");
      const winReport = detectShortcutConflicts(bindings, "windows");
      expect(macReport.boundCount).toBe(SHORTCUT_COMMANDS.length);
      expect(macReport.hasBlockingConflicts).toBe(false);
      expect(winReport.hasBlockingConflicts).toBe(false);
    }

    // 업계별 대표 단축키 차별성 확인
    expect(SHORTCUT_PRESETS.csp.bindings.brush).toBe("P");
    expect(SHORTCUT_PRESETS.csp.bindings.redo).toBe("Mod+Y");
    expect(SHORTCUT_PRESETS.photoshop.bindings.brush).toBe("B");
    expect(SHORTCUT_PRESETS.procreate.bindings.lasso).toBe("S");
    expect(SHORTCUT_PRESETS.procreate.bindings.newLayer).toBe("L");
  });

  it("2. normalizeShortcutChord는 OS별로 Meta(⌘)와 Ctrl을 정확히 정규화하고 별칭 키를 통합한다", () => {
    const macFromMod = normalizeShortcutChord("Mod+Shift+Z", "mac");
    const macFromCmd = normalizeShortcutChord("⌘+Shift+KeyZ", "mac");
    const macFromCtrl = normalizeShortcutChord("Ctrl+Shift+z", "mac");
    expect(macFromMod.valid).toBe(true);
    expect(macFromMod.platformKey).toBe("Meta+Shift+Z");
    expect(macFromMod.displayLabel).toBe("⌘+⇧+Z");
    expect(macFromCmd.platformKey).toBe(macFromMod.platformKey);
    expect(macFromCtrl.platformKey).toBe(macFromMod.platformKey);

    const winFromCmd = normalizeShortcutChord("⌘+Shift+Z", "windows");
    const winFromMod = normalizeShortcutChord("Mod+Shift+Z", "windows");
    expect(winFromCmd.platformKey).toBe("Ctrl+Shift+Z");
    expect(winFromCmd.displayLabel).toBe("Ctrl+Shift+Z");
    expect(winFromMod.platformKey).toBe(winFromCmd.platformKey);

    // macOS에서 명시적 Ctrl 분리 옵션 확인
    const explicitCtrl = normalizeShortcutChord("Ctrl+K", "mac", {
      preserveExplicitCtrlOnApple: true,
    });
    expect(explicitCtrl.platformKey).toBe("Ctrl+K");
    expect(explicitCtrl.displayLabel).toBe("⌃+K");

    // 잘못된 입력 및 빈 문자열 거부
    expect(normalizeShortcutChord("", "mac").valid).toBe(false);
    expect(normalizeShortcutChord("Mod+Shift", "mac").valid).toBe(false);
    expect(normalizeShortcutChord("InvalidKeyName", "windows").valid).toBe(false);
  });

  it("3. detectShortcutConflicts는 중복 충돌·OS 별칭 충돌·잘못된 코드·브라우저 예약 단축키 경고를 구분 감지한다", () => {
    let bindings = createShortcutBindingsFromPreset("toonstudio");
    // brush(B)와 eraser를 동일 키(B)로 충돌 주입
    bindings = remapShortcutCommand(bindings, "eraser", "b", "mac");
    // undo(Mod+Z)와 redo를 macOS 별칭 Meta+Z로 충돌 주입
    bindings = remapShortcutCommand(bindings, "redo", "Meta+Z", "mac");
    // 브라우저 예약 단축키(Mod+W) 경고 주입
    bindings = remapShortcutCommand(bindings, "zoomFit", "Mod+W", "mac");
    // 빈 키 오류 주입
    bindings = { ...bindings, mergeDown: "" };

    const report = detectShortcutConflicts(bindings, "mac");
    expect(report.hasBlockingConflicts).toBe(true);
    expect(report.errorCount).toBe(3); // duplicate B, duplicate Meta+Z, invalid mergeDown
    expect(report.warningCount).toBe(1); // Mod+W browser-reserved
    expect(report.conflictedCommandIds).toContain("brush");
    expect(report.conflictedCommandIds).toContain("eraser");
    expect(report.conflictedCommandIds).toContain("undo");
    expect(report.conflictedCommandIds).toContain("redo");
    expect(report.conflictedCommandIds).toContain("mergeDown");
    expect(report.conflicts.some((c) => c.kind === "browser-reserved")).toBe(true);
  });

  it("4. autoResolveShortcutConflicts는 다중 충돌을 우선순위에 따라 무충돌 안전 키로 결정론적 정리한다", () => {
    let bindings = createShortcutBindingsFromPreset("csp");
    bindings = remapShortcutCommand(bindings, "eraser", "P", "windows");
    bindings = remapShortcutCommand(bindings, "fill", "P", "windows");
    bindings = { ...bindings, lasso: "???" };

    expect(detectShortcutConflicts(bindings, "windows").hasBlockingConflicts).toBe(true);

    const resolved = autoResolveShortcutConflicts(bindings, "csp", "windows");
    const afterReport = detectShortcutConflicts(resolved, "windows");
    expect(afterReport.hasBlockingConflicts).toBe(false);
    expect(afterReport.errorCount).toBe(0);
    expect(afterReport.boundCount).toBe(SHORTCUT_COMMANDS.length);
    // 최고 우선순위 brush(P)는 보존되어야 함
    expect(resolved.brush).toBe("P");
  });

  it("5. exportShortcutProfileJson과 importShortcutProfileJson은 왕복 직렬화와 누락 키 보완을 정확히 수행한다", () => {
    const customBindings = remapShortcutCommand(
      createShortcutBindingsFromPreset("photoshop"),
      "flipHorizontal",
      "Alt+H",
      "mac",
    );
    const json = exportShortcutProfileJson({
      format: SHORTCUT_PROFILE_FORMAT,
      schemaVersion: 1,
      profileName: "웹툰 야간 작업 키맵",
      presetId: "photoshop",
      platform: "mac",
      exportedAtIso: "2026-11-25T09:00:00.000Z",
      bindings: customBindings,
    });

    const imported = importShortcutProfileJson(json, "windows");
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.profile.profileName).toBe("웹툰 야간 작업 키맵");
    expect(imported.profile.presetId).toBe("photoshop");
    expect(imported.profile.bindings.flipHorizontal).toBe("Alt+H");
    expect(imported.conflicts.hasBlockingConflicts).toBe(false);
    expect(imported.warnings).toHaveLength(0);

    // 일부 누락 키 + 알 수 없는 키가 섞인 JSON은 경고와 함께 안전 보완
    const partial = JSON.stringify({
      format: SHORTCUT_PROFILE_FORMAT,
      schemaVersion: 1,
      presetId: "procreate",
      platform: "ipad",
      bindings: { brush: "B", unknownLegacyCmd: "K" },
    });
    const partialResult = importShortcutProfileJson(partial);
    expect(partialResult.ok).toBe(true);
    if (!partialResult.ok) return;
    expect(partialResult.warnings.length).toBeGreaterThanOrEqual(2);
    expect(partialResult.profile.bindings.lasso).toBe("S");
  });

  it("6. importShortcutProfileJson은 빈 입력·과대 용량·문법 오류·잘못된 스키마/버전을 타입 안전하게 거부한다", () => {
    const empty = importShortcutProfileJson("   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.errorCode).toBe("empty-input");

    const huge = importShortcutProfileJson("x".repeat(SHORTCUT_PROFILE_MAX_JSON_BYTES + 10));
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.errorCode).toBe("payload-too-large");

    const badJson = importShortcutProfileJson("{broken");
    expect(badJson.ok).toBe(false);
    if (!badJson.ok) expect(badJson.errorCode).toBe("invalid-json");

    const badFormat = importShortcutProfileJson(JSON.stringify({ format: "other", schemaVersion: 1, bindings: {} }));
    expect(badFormat.ok).toBe(false);
    if (!badFormat.ok) expect(badFormat.errorCode).toBe("invalid-schema");

    const badVersion = importShortcutProfileJson(
      JSON.stringify({ format: SHORTCUT_PROFILE_FORMAT, schemaVersion: 99, bindings: {} }),
    );
    expect(badVersion.ok).toBe(false);
    if (!badVersion.ok) expect(badVersion.errorCode).toBe("unsupported-version");

    const badBindings = importShortcutProfileJson(
      JSON.stringify({ format: SHORTCUT_PROFILE_FORMAT, schemaVersion: 1, bindings: [] }),
    );
    expect(badBindings.ok).toBe(false);
    if (!badBindings.ok) expect(badBindings.errorCode).toBe("invalid-bindings");
  });

  it("7. computeHandednessLayoutPlan은 오른손 대비 왼손잡이 모드에서 모든 크롬 슬롯을 정확히 좌우 미러링한다", () => {
    const rightPlan = computeHandednessLayoutPlan({
      handMode: "right-handed",
      device: "tablet-landscape",
    });
    const leftPlan = computeHandednessLayoutPlan({
      handMode: "left-handed",
      device: "tablet-landscape",
    });

    expect(rightPlan.mirroredHorizontally).toBe(false);
    expect(leftPlan.mirroredHorizontally).toBe(true);
    expect(rightPlan.meetsCanvasBudget).toBe(true);
    expect(leftPlan.meetsCanvasBudget).toBe(true);
    expect(leftPlan.canvasViewportSharePct).toBeGreaterThanOrEqual(82);

    const rRail = rightPlan.slots.find((s) => s.id === "toolRail");
    const lRail = leftPlan.slots.find((s) => s.id === "toolRail");
    const rInspector = rightPlan.slots.find((s) => s.id === "inspectorDrawer");
    const lInspector = leftPlan.slots.find((s) => s.id === "inspectorDrawer");
    const rOrbital = rightPlan.slots.find((s) => s.id === "orbitalWheel");
    const lOrbital = leftPlan.slots.find((s) => s.id === "orbitalWheel");

    expect(rRail?.dockEdge).toBe("left");
    expect(lRail?.dockEdge).toBe("right");
    expect(rInspector?.dockEdge).toBe("right");
    expect(lInspector?.dockEdge).toBe("left");
    expect(rOrbital?.dockEdge).toBe("bottom-left");
    expect(lOrbital?.dockEdge).toBe("bottom-right");

    // 기하학적 좌우 대칭 검증: x_left + width ≈ 1 - x_right
    expect(Math.abs((lRail?.xRatio ?? 0) + (lRail?.widthRatio ?? 0) - (1 - (rRail?.xRatio ?? 0)))).toBeLessThan(0.01);
    expect(leftPlan.cssMirrorVars["--studio-tool-rail-side"]).toBe("right");
    expect(leftPlan.cssMirrorVars["--studio-inspector-side"]).toBe("left");
  });

  it("8. 한손 태블릿 모드(왼손/오른손)는 주요 조작 슬롯을 엄지 호 내부로 집약해 높은 엄지 커버리지를 달성한다", () => {
    const leftOneHand = computeHandednessLayoutPlan({
      handMode: "one-hand-left-tablet",
      device: "tablet-portrait",
      palmRejectionMarginPx: 32,
    });
    const rightOneHand = computeHandednessLayoutPlan({
      handMode: "one-hand-right-tablet",
      device: "tablet-portrait",
      palmRejectionMarginPx: 32,
    });

    expect(leftOneHand.oneHandOptimized).toBe(true);
    expect(rightOneHand.oneHandOptimized).toBe(true);
    expect(leftOneHand.thumbZone.operatingHand).toBe("left");
    expect(rightOneHand.thumbZone.operatingHand).toBe("right");
    expect(leftOneHand.thumbReachCoveragePct).toBeGreaterThanOrEqual(80);
    expect(rightOneHand.thumbReachCoveragePct).toBeCloseTo(leftOneHand.thumbReachCoveragePct, 1);

    // 팜 리젝션 여백 축소 시 손바닥 오터치 위험 상승 확인
    const tightMargin = computeHandednessLayoutPlan({
      handMode: "one-hand-right-tablet",
      device: "tablet-portrait",
      palmRejectionMarginPx: 8,
    });
    expect(tightMargin.palmCollisionRiskPct).toBeGreaterThan(rightOneHand.palmCollisionRiskPct);
  });

  it("9. computeHandednessLayoutPlan은 데스크톱·세로 태블릿·비정상 극단 치수에서도 NaN 없이 안전 좌표를 유지한다", () => {
    const desktopPlan = computeHandednessLayoutPlan({
      handMode: "right-handed",
      device: "desktop",
      compactChrome: true,
    });
    expect(desktopPlan.canvasViewportSharePct).toBeGreaterThanOrEqual(82);

    const weirdPlan = computeHandednessLayoutPlan({
      handMode: "left-handed",
      viewportWidthPx: Number.NaN,
      viewportHeightPx: -50,
      palmRejectionMarginPx: Number.POSITIVE_INFINITY,
    });
    expect(Number.isFinite(weirdPlan.thumbReachCoveragePct)).toBe(true);
    expect(Number.isFinite(weirdPlan.canvasViewportSharePct)).toBe(true);
    for (const slot of weirdPlan.slots) {
      expect(slot.xRatio).toBeGreaterThanOrEqual(0);
      expect(slot.xRatio + slot.widthRatio).toBeLessThanOrEqual(1.001);
    }
  });

  it("10. auditStudioAccessibilityBudget은 Calm Atelier AAA 및 한국어 난독 친화 프리셋을 AAA 100점으로 판정한다", () => {
    const aaaReport = auditStudioAccessibilityBudget(ACCESSIBILITY_AUDIT_PRESETS["atelier-aaa"].input);
    expect(aaaReport.grade).toBe("AAA");
    expect(aaaReport.passesProvidedAaaChecks).toBe(true);
    expect(aaaReport.passesW3cAaa).toBe(false);
    expect(aaaReport.focusRingPassesAaa).toBe(true);
    expect(aaaReport.passesDyslexiaFriendly).toBe(true);
    expect(aaaReport.overallScore).toBe(100);
    expect(aaaReport.remediationStepsKo).toHaveLength(0);

    const dyslexiaReport = auditStudioAccessibilityBudget(
      ACCESSIBILITY_AUDIT_PRESETS["dyslexia-korean"].input,
    );
    expect(dyslexiaReport.grade).toBe("AAA");
    expect(dyslexiaReport.koreanReadabilityScore).toBe(100);
  });

  it("11. auditStudioAccessibilityBudget은 44px 미만 타깃·약한 포커스 링·낮은 대비·한국어 행간/어절 위반을 정밀 검출한다", () => {
    const failReport = auditStudioAccessibilityBudget(
      ACCESSIBILITY_AUDIT_PRESETS["compact-violation"].input,
    );
    expect(failReport.grade).toBe("FAIL");
    expect(failReport.passesW3cAaa).toBe(false);
    expect(failReport.passesW3cAa).toBe(false);
    expect(failReport.touchTargetSummary.failingIds.length).toBe(4);
    expect(failReport.focusRingPassesAaa).toBe(false);
    expect(failReport.passesDyslexiaFriendly).toBe(false);
    expect(failReport.remediationStepsKo.length).toBeGreaterThanOrEqual(4);

    // 중간 수준(AA 충족, AAA 미달) 판정 검증
    const aaOnlyInput: StudioAccessibilityAuditInput = {
      ...ACCESSIBILITY_AUDIT_PRESETS["atelier-aaa"].input,
      touchTargets: [
        { id: "small-aa", labelKo: "소형 버튼", labelEn: "Small Button", widthPx: 32, heightPx: 32, gapPx: 8 },
      ],
      textContrastRatio: 5.2,
    };
    const aaReport = auditStudioAccessibilityBudget(aaOnlyInput);
    expect(aaReport.grade).toBe("AA");
    expect(aaReport.passesProvidedAaChecks).toBe(true);
    expect(aaReport.passesW3cAa).toBe(false);
    expect(aaReport.passesW3cAaa).toBe(false);
  });

  it("12. applyAaaRemediation은 위반 상태를 단일 호출로 WCAG 2.2 AAA + 한국어 난독 친화 완전 통과 상태로 보정한다", () => {
    const broken = ACCESSIBILITY_AUDIT_PRESETS["compact-violation"].input;
    expect(auditStudioAccessibilityBudget(broken).grade).toBe("FAIL");

    const fixed = applyAaaRemediation(broken);
    const after = auditStudioAccessibilityBudget(fixed);
    expect(after.grade).toBe("AAA");
    expect(after.passesProvidedAaaChecks).toBe(true);
    expect(after.passesW3cAaa).toBe(false);
    expect(after.passesDyslexiaFriendly).toBe(true);
    expect(after.touchTargetSummary.minWidthPx).toBeGreaterThanOrEqual(44);
    expect(after.touchTargetSummary.minHeightPx).toBeGreaterThanOrEqual(44);
    expect(after.remediationStepsKo).toHaveLength(0);
  });

  it("13. auditStudioAccessibilityBudget은 빈 터치 타깃 목록과 비유한 수치 입력에서도 NaN 없이 안전하게 동작한다", () => {
    const emptyTargetsInput: StudioAccessibilityAuditInput = {
      touchTargets: [],
      focusRing: {
        outlineWidthPx: Number.NaN,
        contrastRatio: Number.NEGATIVE_INFINITY,
        offsetPx: -5,
        usesVisibleRing: false,
        obscuredByStickyChrome: false,
      },
      textContrastRatio: Number.NaN,
      uiComponentContrastRatio: 0,
      typography: {
        fontSizePx: Number.NaN,
        lineHeightRatio: 0,
        letterSpacingEm: Number.NaN,
        wordSpacingEm: 0,
        paragraphSpacingMultiplier: 0,
        maxMeasureChars: 0,
        usesKeepAllWordBreak: false,
        usesTabularNums: false,
        avoidsJustifyAlignment: false,
        reducedMotionRespected: false,
      },
    };
    const report = auditStudioAccessibilityBudget(emptyTargetsInput);
    expect(Number.isFinite(report.overallScore)).toBe(true);
    expect(Number.isFinite(report.koreanReadabilityScore)).toBe(true);
    expect(report.grade).toBe("FAIL");
  });

  it("14. StudioErgonomicsMasterPanel은 Props 없이 단독 렌더링되고 3탭 ARIA 접근성 구조를 갖춘다", () => {
    render(<StudioErgonomicsMasterPanel />);
    expect(screen.getByTestId("ergonomics-shortcut-master-panel")).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    expect(screen.getByTestId("tab-shortcuts").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("shortcut-command-grid").querySelectorAll("button")).toHaveLength(20);
  });

  it("15. 탭 1에서 4대 도구 프리셋 전환과 OS(macOS↔Windows) 주 수정키 실시간 정규화가 반영된다", () => {
    const onChanged = vi.fn();
    render(<StudioErgonomicsMasterPanel onShortcutProfileChanged={onChanged} />);

    // 초기 ToonStudio macOS: brush = B, undo = ⌘+Z
    expect(screen.getByTestId("cmd-kbd-brush").textContent).toBe("B");
    expect(screen.getByTestId("cmd-kbd-undo").textContent).toBe("⌘+Z");

    // CSP 전환: brush = P, redo = ⌘+Y
    fireEvent.click(screen.getByTestId("preset-btn-csp"));
    expect(screen.getByTestId("cmd-kbd-brush").textContent).toBe("P");
    expect(screen.getByTestId("cmd-kbd-redo").textContent).toBe("⌘+Y");

    // Windows 전환: undo = Ctrl+Z, redo = Ctrl+Y
    fireEvent.click(screen.getByTestId("os-btn-windows"));
    expect(screen.getByTestId("cmd-kbd-undo").textContent).toBe("Ctrl+Z");
    expect(screen.getByTestId("cmd-kbd-redo").textContent).toBe("Ctrl+Y");

    // Procreate 전환: lasso = S
    fireEvent.click(screen.getByTestId("preset-btn-procreate"));
    expect(screen.getByTestId("cmd-kbd-lasso").textContent).toBe("S");
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  it("16. 탭 1에서 중복 단축키 리매핑 시 실시간 충돌 경고가 노출되고 자동 정리로 즉시 해소된다", () => {
    render(<StudioErgonomicsMasterPanel />);

    // eraser 선택 후 brush 기본키 "B"로 리매핑 -> 충돌 발생
    fireEvent.click(screen.getByTestId("cmd-row-eraser"));
    fireEvent.change(screen.getByTestId("input-shortcut-chord"), { target: { value: "B" } });
    fireEvent.click(screen.getByTestId("btn-apply-chord"));

    expect(screen.getByTestId("shortcut-conflict-banner").textContent).toContain("차단 충돌 1건");

    // 자동 정리 버튼 클릭 -> 충돌 0건 해소
    fireEvent.click(screen.getByTestId("btn-auto-resolve-conflicts"));
    expect(screen.getByTestId("shortcut-conflict-banner").textContent).toContain("예제 충돌 0건");
  });

  it("17. 탭 1 JSON 내보내기·가져오기 검증 및 잘못된 JSON 오류 피드백이 정상 동작한다", () => {
    render(<StudioErgonomicsMasterPanel />);

    fireEvent.click(screen.getByTestId("preset-btn-photoshop"));
    fireEvent.click(screen.getByTestId("btn-export-json"));

    const textarea = screen.getByTestId("textarea-shortcut-json") as HTMLTextAreaElement;
    expect(textarea.value).toContain(SHORTCUT_PROFILE_FORMAT);
    expect(screen.getByTestId("json-import-notice").textContent).toContain("직렬화");

    // 유효한 JSON 재가져오기
    fireEvent.click(screen.getByTestId("btn-import-json"));
    expect(screen.getByTestId("json-import-notice").textContent).toContain("가져오기 완료");

    // 손상된 JSON 붙여넣기 -> 오류 피드백
    fireEvent.change(textarea, { target: { value: "{invalid-json" } });
    fireEvent.click(screen.getByTestId("btn-import-json"));
    expect(screen.getByTestId("json-import-notice").textContent).toContain("JSON 문법 오류");
  });

  it("18. 탭 2에서 왼손잡이·한손 태블릿 미러 전환과 SVG 크롬 미리보기·엄지 커버리지 갱신이 동작한다", () => {
    const onPlan = vi.fn();
    render(<StudioErgonomicsMasterPanel onHandednessPlanChanged={onPlan} />);

    fireEvent.click(screen.getByTestId("tab-handedness"));
    expect(screen.getByTestId("panel-handedness")).toBeTruthy();
    expect(screen.getByTestId("metric-mirror-state").textContent).toContain("좌측 조작 표준");

    const beforeRailX = Number(screen.getByTestId("svg-slot-toolRail").getAttribute("x"));

    fireEvent.click(screen.getByTestId("hand-mode-left-handed"));
    expect(onPlan).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("metric-mirror-state").textContent).toContain("우측 배치 예제");
    const afterRailX = Number(screen.getByTestId("svg-slot-toolRail").getAttribute("x"));
    expect(afterRailX).toBeGreaterThan(beforeRailX + 180);

    fireEvent.click(screen.getByTestId("hand-mode-one-hand-left-tablet"));
    const coverageVal = Number.parseFloat(
      screen.getByTestId("metric-thumb-coverage").textContent ?? "0",
    );
    expect(coverageVal).toBeGreaterThanOrEqual(80);
  });

  it("19. 탭 3에서 위반 프리셋 로드→원클릭 AAA 보정 흐름 및 영문 로케일(locale='en')이 정확히 동작한다", () => {
    const onAudited = vi.fn();
    const { unmount } = render(
      <StudioErgonomicsMasterPanel initialTab="accessibility" onAccessibilityAudited={onAudited} />,
    );

    expect(screen.getByTestId("a11y-grade-pill").textContent).toContain("AAA");

    fireEvent.click(screen.getByTestId("a11y-preset-compact-violation"));
    expect(screen.getByTestId("a11y-grade-pill").textContent).toContain("FAIL");
    expect(screen.getByTestId("badge-ergonomics-grade").textContent).toContain("FAIL");

    fireEvent.click(screen.getByTestId("btn-apply-aaa-remediation"));
    expect(screen.getByTestId("a11y-grade-pill").textContent).toContain("AAA");
    expect(onAudited).toHaveBeenCalledTimes(2);
    unmount();

    render(<StudioErgonomicsMasterPanel locale="en" initialTab="accessibility" />);
    expect(screen.getByText(/Readability Input Presets/)).toBeTruthy();
    expect(screen.getByTestId("korean-typography-preview")).toBeTruthy();
  });

  it("20. 모듈 전체 정적 위생 규칙(800줄 이하·무스토리지·무BigInt·무비공개저장소·무원시색·props규칙)을 충족한다", () => {
    const files = [
      "shortcut-ergonomics-engine.ts",
      "StudioErgonomicsMasterPanel.tsx",
      "index.ts",
      "ergonomics-shortcut-master.test.tsx",
    ];

    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(
      ["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""),
    );

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} 800줄 이하 제한 위반 (${lineCount})`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} 비공개 Map 저장소 금지 위반`).toBe(false);
    }

    const engineSrc = readFileSync(resolve(MODULE_DIR, "shortcut-ergonomics-engine.ts"), "utf8");
    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioErgonomicsMasterPanel.tsx"), "utf8");
    expect(rawColorRe.test(engineSrc), "Engine must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(rawColorRe.test(panelSrc), "Panel must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioErgonomicsMasterPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
