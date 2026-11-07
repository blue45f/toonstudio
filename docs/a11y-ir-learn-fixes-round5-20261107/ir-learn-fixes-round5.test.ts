import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const REPO_ROOT = process.cwd();

describe("Round 5 GAP-R4-01(IR) 및 GAP-R4-04(Learn) 최소 수정·회귀 검증", () => {
  it("GAP-R4-01: IrPitchPage.tsx가 발표 dialog 초기 포커스·Tab 순환·Escape/닫기 후 트리거 복귀·44px 아이콘 버튼·reduced-motion을 갖추고 800줄 이하를 유지한다", () => {
    const irPath = path.join(REPO_ROOT, "apps/web/src/domains/marketing/IrPitchPage.tsx");
    const source = fs.readFileSync(irPath, "utf8");
    const lineCount = source.split("\n").length;
    assert.ok(lineCount <= 800, `Expected IrPitchPage.tsx <= 800 lines, got ${lineCount}`);

    // 발표 모달 초기 포커스 및 트리거 복귀 훅
    assert.equal(source.includes("presentTriggerRef"), true);
    assert.equal(source.includes("closeButtonRef"), true);
    assert.equal(source.includes("openPresentation"), true);
    assert.equal(source.includes("closePresentation"), true);

    // Tab / Shift+Tab 포커스 순환 트랩 및 Escape 닫기 복귀
    assert.equal(source.includes('if (event.key === "Tab")'), true);
    assert.equal(source.includes("if (event.shiftKey)"), true);
    assert.equal(source.includes('if (event.key === "Escape") { event.preventDefault(); closePresentation(); }'), true);

    // 44px 상단 아이콘 버튼 2개 및 reduced-motion 진행 바
    assert.equal(source.includes("size-11 min-h-11 min-w-11"), true);
    assert.equal(source.includes("transition-all duration-300 motion-reduce:transition-none"), true);
  });

  it("GAP-R4-04: LearnContent.tsx가 #learn-main tabIndex={-1}·스킵 링크 초점 이동·모달 열림 중 전역 단일키 단축키 가드를 갖추고 800줄 이하를 유지한다", () => {
    const learnPath = path.join(REPO_ROOT, "apps/web/src/domains/learn/LearnContent.tsx");
    const source = fs.readFileSync(learnPath, "utf8");
    const lineCount = source.split("\n").length;
    assert.ok(lineCount <= 800, `Expected LearnContent.tsx <= 800 lines, got ${lineCount}`);

    // 스킵 링크 실제 초점 이동 및 #learn-main tabIndex={-1}
    assert.equal(source.includes('<div id="learn-main" tabIndex={-1}>'), true);
    assert.equal(source.includes('document.getElementById("learn-main")'), true);
    assert.equal(source.includes("mainEl.focus()"), true);

    // 모달 열림 중 전역 단일 문자 단축키 가드
    assert.equal(
      source.includes('target?.closest(\'[role="dialog"], [aria-modal="true"], dialog\')'),
      true,
    );
    assert.equal(
      source.includes('document.querySelector(\'[role="dialog"], [aria-modal="true"], dialog[open]\')'),
      true,
    );
  });

  it("소유 경계 검증: IrPitchPage.tsx, LearnContent.tsx, docs/a11y-ir-learn-fixes-round5-20261107/** 외 다른 파일을 수정하지 않는다", () => {
    const allowedExact = new Set([
      "apps/web/src/domains/marketing/IrPitchPage.tsx",
      "apps/web/src/domains/learn/LearnContent.tsx",
    ]);
    const allowedPrefix = "docs/a11y-ir-learn-fixes-round5-20261107/";

    const rawStatus = execFileSync("git", ["status", "--porcelain"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const changedPaths = rawStatus
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[MADRCU?!]{1,2}\s+/u, "").trim());

    const violating = changedPaths.filter(
      (p) =>
        !allowedExact.has(p) &&
        !p.startsWith(allowedPrefix) &&
        p !== "docs/a11y-ir-learn-fixes-round5-20261107",
    );
    assert.deepEqual(violating, [], `Forbidden file modifications detected: ${violating.join(", ")}`);
  });

  it("실제 브라우저 리포트(browser-round5-report.json)와 스크린샷 4종에서 6개 뷰포트 및 GAP-R4-01·GAP-R4-04 해결이 실증된다", () => {
    const reportPath = path.join(
      REPO_ROOT,
      "docs/a11y-ir-learn-fixes-round5-20261107/browser-round5-report.json",
    );
    assert.equal(fs.existsSync(reportPath), true);

    const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      verifiedDefects: {
        "GAP-R4-01": {
          verifiedFixed: boolean;
          activeInsideDialogOnOpen: boolean;
          allTabStepsInsideDialog: boolean;
          restoredToTriggerAfterEscape: boolean;
          restoredToTriggerAfterCloseButton: boolean;
          progressHasMotionReduceClass: boolean;
          fullscreenButtonSize: { width: number; height: number };
          closeButtonSize: { width: number; height: number };
        };
        "GAP-R4-04": {
          verifiedFixed: boolean;
          learnMainTabIndexAttr: string;
          activeElementIdAfterSkipEnter: string;
          shortcutsBlockedWhileDialogOpen: boolean;
          shortcutWorksWhenNoDialogOpen: boolean;
        };
      };
      viewportMatrixCount: number;
      viewportMatrix: Array<{ viewportId: string; route: string; horizontalOverflowPx: number }>;
    };

    const g1 = report.verifiedDefects["GAP-R4-01"];
    assert.equal(g1.verifiedFixed, true);
    assert.equal(g1.activeInsideDialogOnOpen, true);
    assert.equal(g1.allTabStepsInsideDialog, true);
    assert.equal(g1.restoredToTriggerAfterEscape, true);
    assert.equal(g1.restoredToTriggerAfterCloseButton, true);
    assert.equal(g1.progressHasMotionReduceClass, true);
    assert.ok(g1.fullscreenButtonSize.width >= 44 && g1.fullscreenButtonSize.height >= 44);
    assert.ok(g1.closeButtonSize.width >= 44 && g1.closeButtonSize.height >= 44);

    const g4 = report.verifiedDefects["GAP-R4-04"];
    assert.equal(g4.verifiedFixed, true);
    assert.equal(g4.learnMainTabIndexAttr, "-1");
    assert.equal(g4.activeElementIdAfterSkipEnter, "learn-main");
    assert.equal(g4.shortcutsBlockedWhileDialogOpen, true);
    assert.equal(g4.shortcutWorksWhenNoDialogOpen, true);

    assert.equal(report.viewportMatrixCount, 12);
    const viewports = new Set(report.viewportMatrix.map((m) => m.viewportId));
    for (const vp of [
      "mobile-320",
      "mobile-390",
      "tablet-768",
      "pc-1440",
      "pc-1440-zoom-200",
      "pc-1440-reduced-motion",
    ]) {
      assert.equal(viewports.has(vp), true, `Missing viewport ${vp}`);
    }
    for (const entry of report.viewportMatrix) {
      assert.equal(
        entry.horizontalOverflowPx,
        0,
        `Unexpected horizontal overflow on ${entry.route} @ ${entry.viewportId}`,
      );
    }

    for (const shot of [
      "fix-gap-r4-01-ir-dialog-focus-trap.png",
      "fix-gap-r4-01-ir-mobile-320.png",
      "fix-gap-r4-04-learn-skip-and-shortcut-guard.png",
      "fix-gap-r4-04-learn-zoom-200.png",
    ]) {
      const shotPath = path.join(
        REPO_ROOT,
        "docs/a11y-ir-learn-fixes-round5-20261107/screenshots",
        shot,
      );
      assert.equal(fs.existsSync(shotPath), true, `Missing screenshot ${shot}`);
      assert.ok(fs.statSync(shotPath).size > 1000, `Empty screenshot ${shot}`);
    }
  });
});
