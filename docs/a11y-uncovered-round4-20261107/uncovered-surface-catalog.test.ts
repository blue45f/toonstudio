import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildRound4InventoryReport,
  classifyRouteForRound4Audit,
  EXISTING_VERIFIED_BASE_ROUTES,
  ROUND4_DEFECT_FINDINGS,
  ROUND4_UNCOVERED_SURFACES,
  verifyRound4OwnershipBoundary,
} from "./uncovered-surface-catalog.ts";

describe("Round 4 미검증 표면 접근성 감사 카탈로그 및 경계 검증", () => {
  it("전페이지 인벤토리 441개와 기존 브라우저 매트릭스 31건을 누락 없이 분류한다", async () => {
    const report = await buildRound4InventoryReport(process.cwd());
    assert.equal(report.totalConcreteRoutes, 441);
    assert.equal(report.existingBrowserMatrixCheckCount, 31);
    assert.equal(report.classifiedRoutes.length, 441);

    const sum = Object.values(report.countsByDisposition).reduce((a, b) => a + b, 0);
    assert.equal(sum, 441);
    assert.equal(
      report.countsByDisposition["existing-verified"],
      EXISTING_VERIFIED_BASE_ROUTES.length,
    );
    assert.equal(report.countsByDisposition["selected-uncovered-12"], 12);
    assert.ok(report.countsByDisposition["excluded-active-owner"] > 0);
    assert.ok(report.countsByDisposition["duplicate-or-alias"] > 0);
    assert.ok(report.countsByDisposition["auth-gated"] > 0);
    assert.ok(report.countsByDisposition["realdata-required"] > 0);
    assert.ok(report.countsByDisposition["unimplemented-fallback"] > 0);
  });

  it("기능군별 대표 미검증 표면 12개가 서로 다른 기능군에 속하고 제외 범위와 충돌하지 않는다", () => {
    assert.equal(ROUND4_UNCOVERED_SURFACES.length, 12);
    const groups = new Set(ROUND4_UNCOVERED_SURFACES.map((s) => s.functionalGroup));
    const routes = new Set(ROUND4_UNCOVERED_SURFACES.map((s) => s.route));
    assert.equal(groups.size, 12);
    assert.equal(routes.size, 12);

    // 기존 검증 베이스 경로와 중복 없음
    for (const base of EXISTING_VERIFIED_BASE_ROUTES) {
      assert.equal(routes.has(base), false);
    }

    // 드로잉 / 홈 / 일정 / 탐색 / Character(PackagePanel) / 메시지함 / ServiceStatus 제외 확인
    const forbiddenSelectedRoutes = [
      "/",
      "/home",
      "/discover",
      "/explore",
      "/search",
      "/calendar",
      "/schedule",
      "/studio/canvas",
      "/studio/character",
      "/messages",
      "/status",
    ];
    for (const forbidden of forbiddenSelectedRoutes) {
      assert.equal(routes.has(forbidden), false);
      assert.notEqual(
        classifyRouteForRound4Audit(forbidden).disposition,
        "selected-uncovered-12",
      );
    }

    // 모든 선정 표면의 원본 소스 파일이 실제로 존재하며 PackagePanel / PackageDetail을 포함하지 않음
    for (const surface of ROUND4_UNCOVERED_SURFACES) {
      assert.ok(surface.sourceFiles.length > 0);
      for (const relFile of surface.sourceFiles) {
        assert.equal(relFile.includes("PackagePanel"), false);
        assert.equal(relFile.includes("package-panel"), false);
        assert.equal(relFile.includes("PackageDetail"), false);
        assert.equal(fs.existsSync(path.join(process.cwd(), relFile)), true);
      }
    }
  });

  it("단순 라우트 중복과 로그인·실데이터 필요·미구현 경로를 별도 구분한다", () => {
    assert.equal(classifyRouteForRound4Audit("/marketplace").disposition, "duplicate-or-alias");
    assert.equal(classifyRouteForRound4Audit("/marketplace").canonicalRoute, "/market");
    assert.equal(classifyRouteForRound4Audit("/fortune/today").disposition, "duplicate-or-alias");
    assert.equal(classifyRouteForRound4Audit("/fortune/today").canonicalRoute, "/fortune");
    assert.equal(
      classifyRouteForRound4Audit("/learn/lessons/background-scene").disposition,
      "duplicate-or-alias",
    );

    assert.equal(classifyRouteForRound4Audit("/admin/members").disposition, "auth-gated");
    assert.equal(classifyRouteForRound4Audit("/creator/revenue").disposition, "auth-gated");
    assert.equal(classifyRouteForRound4Audit("/reviews").disposition, "realdata-required");
    assert.equal(classifyRouteForRound4Audit("/community/cafes").disposition, "realdata-required");
    assert.equal(
      classifyRouteForRound4Audit("/auth/visual-audit").disposition,
      "unimplemented-fallback",
    );
  });

  it("보고된 결함(GAP-R4-01~05)의 수정 필요 파일과 소스 근거가 실제로 일치한다", () => {
    assert.equal(ROUND4_DEFECT_FINDINGS.length, 5);

    for (const finding of ROUND4_DEFECT_FINDINGS) {
      assert.ok(finding.reproductionSteps.length >= 2);
      assert.ok(finding.targetFilesToFix.length > 0);
      for (const targetFile of finding.targetFilesToFix) {
        assert.equal(targetFile.includes("PackagePanel"), false);
        assert.equal(targetFile.includes("package-panel"), false);
        assert.equal(targetFile.includes("PackageDetail"), false);
        const abs = path.join(process.cwd(), targetFile);
        assert.equal(fs.existsSync(abs), true);
      }
    }

    // GAP-R4-01: IrPitchPage 발표 모드 dialog 및 40px 버튼 확인
    const irSource = fs.readFileSync(
      path.join(process.cwd(), "apps/web/src/domains/marketing/IrPitchPage.tsx"),
      "utf8",
    );
    assert.equal(irSource.includes('role="dialog" aria-modal="true"'), true);
    assert.equal(irSource.includes('bi("IR 발표 모드"'), true);

    // GAP-R4-02: FortuneShareModal 및 FortunePage 탭/성별 토글 확인
    const fortuneSource = fs.readFileSync(
      path.join(process.cwd(), "apps/web/src/domains/fortune/FortunePage.tsx"),
      "utf8",
    );
    assert.equal(fortuneSource.includes('role="tablist"'), true);
    assert.equal(fortuneSource.includes('aria-label={tx("운세 종류")}'), true);

    // GAP-R4-03: pricing-page.tsx bg-accent text-white 및 summary 마커 숨김 확인
    const pricingSource = fs.readFileSync(
      path.join(process.cwd(), "apps/web/src/app/routes/pricing-page.tsx"),
      "utf8",
    );
    assert.equal(
      pricingSource.includes("bg-accent px-3 py-1 text-xs font-bold text-white"),
      true,
    );
    assert.equal(pricingSource.includes("[&::-webkit-details-marker]:hidden"), true);

    // GAP-R4-04: LearnContent.tsx #learn-main 스킵 타깃 확인
    const learnSource = fs.readFileSync(
      path.join(process.cwd(), "apps/web/src/domains/learn/LearnContent.tsx"),
      "utf8",
    );
    assert.equal(learnSource.includes('href="#learn-main"'), true);
    assert.equal(learnSource.includes('<div id="learn-main">'), true);
  });

  it("오직 docs/a11y-uncovered-round4-20261107/** 경로만 소유하고 타 파일을 수정하지 않는다", () => {
    const boundary = verifyRound4OwnershipBoundary(process.cwd());
    assert.deepEqual(boundary.violatingPaths, []);
    assert.equal(boundary.ok, true);
  });

  it("실제 브라우저 리포트(browser-round4-report.json)와 결함 재현 스크린샷 5종이 모두 존재하고 GAP-R4-01~05가 재현된다", () => {
    const reportPath = path.join(
      process.cwd(),
      "docs/a11y-uncovered-round4-20261107/browser-round4-report.json",
    );
    assert.equal(fs.existsSync(reportPath), true);
    const browserReport = JSON.parse(fs.readFileSync(reportPath, "utf8")) as {
      selectedUncoveredSurfaceCount: number;
      viewportMatrixCheckCount: number;
      defectReproductions: Record<string, { reproduced: boolean }>;
      viewportMatrix: Array<{ viewportId: string; route: string }>;
    };

    assert.equal(browserReport.selectedUncoveredSurfaceCount, 12);
    assert.ok(browserReport.viewportMatrixCheckCount >= 40);

    const viewportIds = new Set(browserReport.viewportMatrix.map((entry) => entry.viewportId));
    for (const expectedVp of [
      "mobile-320",
      "mobile-390",
      "tablet-768",
      "pc-1440",
      "pc-1440-zoom-200",
      "pc-1440-reduced-motion",
    ]) {
      assert.equal(viewportIds.has(expectedVp), true, `Missing viewport ${expectedVp}`);
    }

    for (const gapId of ["GAP-R4-01", "GAP-R4-02", "GAP-R4-03", "GAP-R4-04", "GAP-R4-05"]) {
      assert.equal(
        browserReport.defectReproductions[gapId]?.reproduced,
        true,
        `Expected ${gapId} to be reproduced in real browser`,
      );
    }

    const expectedScreenshots = [
      "gap-r4-01-ir-presentation-dialog.png",
      "gap-r4-02-fortune-tablist-and-controls.png",
      "gap-r4-03-pricing-contrast-and-faq.png",
      "gap-r4-04-learn-lesson-skip-target.png",
      "gap-r4-05-mobile-320-market-chips.png",
    ];
    for (const fileName of expectedScreenshots) {
      const shotPath = path.join(
        process.cwd(),
        "docs/a11y-uncovered-round4-20261107/screenshots",
        fileName,
      );
      assert.equal(fs.existsSync(shotPath), true, `Missing screenshot ${fileName}`);
      assert.ok(fs.statSync(shotPath).size > 1000, `Empty screenshot ${fileName}`);
    }
  });
});

