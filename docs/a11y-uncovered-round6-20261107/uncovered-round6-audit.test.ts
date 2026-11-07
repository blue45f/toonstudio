import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";

import { ROUND6_SELECTED_SURFACES } from "./round6-surface-catalog.ts";

const REPO_ROOT = process.cwd();
const ROUND6_DIR = path.join(REPO_ROOT, "docs/a11y-uncovered-round6-20261107");
const CLASSIFICATION_PATH = path.join(ROUND6_DIR, "route-classification-round6.json");
const BROWSER_REPORT_PATH = path.join(ROUND6_DIR, "browser-round6-report.json");
const README_PATH = path.join(ROUND6_DIR, "README.md");

const FORBIDDEN_ROUTE_PREFIXES = [
  "/fortune",
  "/pricing",
  "/billing",
  "/membership",
  "/memberships",
  "/my",
  "/my-space",
  "/read/spatial",
  "/spatial-reader",
  "/timelapse",
  "/timelapses",
  "/play",
  "/help",
  "/market",
  "/marketplace",
  "/inbox",
  "/messages",
  "/status",
  "/ops/status",
  "/character",
  "/brush",
  "/brushes",
  "/studio/drawing",
  "/studio/canvas",
  "/studio/anchor-lab",
  "/discover",
  "/works",
  "/series",
  "/episodes",
  "/authors",
  "/tags",
];

describe("Round 6 미점검 Secondary 화면 접근성 독립 감사 검증", () => {
  it("1. Round 4의 115개 secondary 후보 전수를 누락 없이 분류하고, 제외 도메인·기검증 화면을 침범하지 않는 12개 서로 다른 화면을 선정한다", () => {
    assert.equal(
      ROUND6_SELECTED_SURFACES.length,
      12,
      "선정된 Round 6 대표 화면은 12개여야 합니다 (8~12개 범위).",
    );

    const uniqueRoutes = new Set(ROUND6_SELECTED_SURFACES.map((s) => s.route));
    const uniqueComponents = new Set(ROUND6_SELECTED_SURFACES.map((s) => s.componentName));
    const uniqueSourceFiles = new Set(ROUND6_SELECTED_SURFACES.map((s) => s.sourceFile));
    assert.equal(uniqueRoutes.size, 12);
    assert.equal(uniqueComponents.size, 12);
    assert.equal(uniqueSourceFiles.size, 12);

    for (const surface of ROUND6_SELECTED_SURFACES) {
      for (const prefix of FORBIDDEN_ROUTE_PREFIXES) {
        assert.equal(
          surface.route === prefix || surface.route.startsWith(`${prefix}/`),
          false,
          `제외 대상 라우트가 선정 목록에 포함되었습니다: ${surface.route} (prefix: ${prefix})`,
        );
      }
      assert.equal(
        surface.sourceFile.includes("/catalog/") || surface.sourceFile.includes("/shared/"),
        false,
        `카탈로그 또는 공유 UI 파일이 포함되었습니다: ${surface.sourceFile}`,
      );
      assert.equal(
        fs.existsSync(path.join(REPO_ROOT, surface.sourceFile)),
        true,
        `실제 소스 파일이 존재해야 합니다: ${surface.sourceFile}`,
      );
    }

    const classification = JSON.parse(fs.readFileSync(CLASSIFICATION_PATH, "utf8"));
    assert.equal(classification.totalRound4SecondaryCandidates, 115);
    assert.equal(classification.selectedRound6SurfaceCount, 12);
    assert.equal(classification.classifiedSecondaryRoutes.length, 115);

    // 빈 데이터 및 인증 불가 화면은 검증 완료(VERIFIED_IN_ROUND6_REAL_BROWSER)로 표시하지 않고 엄격히 구분해야 함
    const authRoutes = classification.classifiedSecondaryRoutes.filter(
      (r: { round6Disposition: string }) => r.round6Disposition === "auth-gated-wall",
    );
    const apiEmptyRoutes = classification.classifiedSecondaryRoutes.filter(
      (r: { round6Disposition: string }) =>
        r.round6Disposition === "api-or-token-dependent-empty-or-error",
    );
    assert.equal(authRoutes.length >= 15, true);
    assert.equal(apiEmptyRoutes.length >= 10, true);
    for (const item of [...authRoutes, ...apiEmptyRoutes]) {
      assert.notEqual(item.verificationStatus, "VERIFIED_IN_ROUND6_REAL_BROWSER");
    }
  });

  it("2. 실브라우저 리포트(browser-round6-report.json)에서 12개 화면 × 6개 뷰포트(320/390/768/1440/200%/reduced-motion = 72건)와 GAP-R6-01~05 재현, 비검증 경계 분리가 입증된다", () => {
    assert.equal(fs.existsSync(BROWSER_REPORT_PATH), true);
    const report = JSON.parse(fs.readFileSync(BROWSER_REPORT_PATH, "utf8"));
    assert.equal(report.selectedSurfaceCount, 12);
    assert.equal(report.viewportCount, 6);
    assert.equal(report.totalViewportChecks, 72);
    assert.equal(report.viewportMatrix.length, 72);

    // 72건 모두 가로 스크롤 오버플로 0px 확인
    for (const entry of report.viewportMatrix) {
      assert.equal(
        entry.horizontalOverflowPx,
        0,
        `${entry.route} @ ${entry.viewportId} 가로 오버플로 발생: ${entry.horizontalOverflowPx}px`,
      );
    }

    // GAP-R6-01 ~ GAP-R6-05 실제 재현 확인
    assert.equal(report.reproducedDefects.length, 5);
    for (const defect of report.reproducedDefects) {
      assert.equal(
        defect.reproduced,
        true,
        `${defect.id} 결함이 실브라우저에서 재현되어야 합니다.`,
      );
    }

    // 인증 장벽 및 빈 데이터/API 의존 화면은 verifiedComplete: false로 구분됨을 확인
    assert.equal(report.authAndEmptyBoundaryProbes.length >= 4, true);
    for (const probe of report.authAndEmptyBoundaryProbes) {
      assert.equal(probe.verifiedComplete, false);
      assert.equal(probe.disposition, "NOT_VERIFIED_AUTH_OR_EMPTY_BOUNDARY");
    }

    // 스크린샷 5종 존재 확인
    for (const file of [
      "gap-r6-01-cuts-trace-contrast-and-chips.png",
      "gap-r6-02-pdf-workbench-targets-and-groups.png",
      "gap-r6-03-taste-and-templates-filters.png",
      "gap-r6-04-toolchain-hiring-promo-controls.png",
      "gap-r6-05-sitemap-design-research-320.png",
    ]) {
      const p = path.join(ROUND6_DIR, "screenshots", file);
      assert.equal(fs.existsSync(p), true, `스크린샷 누락: ${file}`);
      assert.equal(fs.statSync(p).size > 1000, true, `스크린샷 크기 비정상: ${file}`);
    }
  });

  it("3. README.md가 상대 경로 링크만 사용하고, docs/a11y-uncovered-round6-20261107/** 외 제품 소스는 일절 수정하지 않으며, 모든 텍스트 파일이 800줄 이하이다", () => {
    assert.equal(fs.existsSync(README_PATH), true);
    const readme = fs.readFileSync(README_PATH, "utf8");
    assert.equal(
      readme.includes("file://") || readme.includes("/home/antigravity/"),
      false,
      "README.md에 절대 경로(file:// 또는 /home/antigravity/)가 포함되면 안 됩니다.",
    );

    for (const file of [
      "README.md",
      "round6-surface-catalog.ts",
      "route-classification-round6.json",
      "verify-uncovered-round6-browser.mjs",
      "browser-round6-report.json",
      "uncovered-round6-audit.test.ts",
    ]) {
      const content = fs.readFileSync(path.join(ROUND6_DIR, file), "utf8");
      const lines = content.split("\n").length;
      assert.equal(lines <= 800, true, `${file} 줄 수가 800줄을 초과했습니다: ${lines}`);
    }

    // git status로 제품 소스 무변경 검증
    const statusOut = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    ).trim();
    const changedPaths = statusOut
      ? statusOut
          .split("\n")
          .map((line) => line.slice(3).trim())
          .filter(Boolean)
      : [];
    for (const p of changedPaths) {
      assert.equal(
        p.startsWith("docs/a11y-uncovered-round6-20261107/"),
        true,
        `허용되지 않은 외부 파일 변경 감지: ${p}`,
      );
    }
  });
});
