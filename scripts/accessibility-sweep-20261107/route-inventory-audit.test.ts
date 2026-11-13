// @vitest-environment node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  auditAccessibilityContracts,
  auditSitewideRouteInventory,
  classifyRouteDomain,
  isOwnedAuditPath,
  OWNED_PATH_PREFIXES,
  verifyReadOnlySourceBoundary,
} from "./route-inventory-audit";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const temporaryRoots: string[] = [];

function createFixtureRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "toon-a11y-regression-"));
  temporaryRoots.push(root);
  return root;
}

function writeFixture(root: string, relativePath: string, source: string): void {
  const filename = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, source);
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function commitFixture(root: string): void {
  git(root, "add", ".");
  git(root, "-c", "user.name=Audit Fixture", "-c", "user.email=fixture@example.test",
    "commit", "--quiet", "-m", "test: 접근성 경계 fixture를 기록한다");
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("전페이지 접근성 독립 회귀 테스트 — 라우트 인벤토리·경계·계약 검증", () => {
  it("독점 소유 경로 판별기가 지정된 두 디렉터리만 허용하고 앱 구현 경로를 거부한다", () => {
    expect(OWNED_PATH_PREFIXES).toEqual([
      "scripts/accessibility-sweep-20261107/",
      "docs/accessibility-sweep-20261107/",
    ]);
    expect(
      isOwnedAuditPath(
        "scripts/accessibility-sweep-20261107/route-inventory-audit.ts",
      ),
    ).toBe(true);
    expect(
      isOwnedAuditPath("docs/accessibility-sweep-20261107/README.md"),
    ).toBe(true);
    expect(isOwnedAuditPath("apps/web/src/app/App.tsx")).toBe(false);
    expect(
      isOwnedAuditPath("apps/web/src/shared/components/LanguagePicker.tsx"),
    ).toBe(false);
    expect(isOwnedAuditPath("package.json")).toBe(false);
  });

  // 감사 실행의 독점 소유 계약은 일반 PR 전체가 아닌 격리된 Git 이력에서 검증한다.
  it.each(["untracked", "unstaged", "staged", "committed"] as const)(
    "%s 변경에서 감사 소유 경로는 허용하고 앱 소스 변경은 거부한다",
    (state) => {
      const root = createFixtureRoot();
      const ownedPaths = [
        "docs/accessibility-sweep-20261107/fixture.md",
        "scripts/accessibility-sweep-20261107/fixture.ts",
      ];
      const appPath = "apps/web/src/app/Fixture.tsx";
      git(root, "init", "--quiet", "--initial-branch=main");
      writeFixture(root, "README.md", "감사 경계 fixture\n");
      if (state !== "untracked") {
        for (const filename of [...ownedPaths, appPath]) {
          writeFixture(root, filename, "기준 내용\n");
        }
      }
      commitFixture(root);
      git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
      expect(verifyReadOnlySourceBoundary(root)).toEqual({
        ok: true, ownedPaths: [], violatingPaths: [],
      });

      for (const filename of ownedPaths) {
        writeFixture(root, filename, "감사 변경\n");
      }
      const prepareState = () => {
        if (state === "staged") git(root, "add", ".");
        if (state === "committed") {
          commitFixture(root);
          expect(git(root, "status", "--porcelain=v1")).toBe("");
        }
      };
      prepareState();
      expect(verifyReadOnlySourceBoundary(root)).toEqual({
        ok: true, ownedPaths, violatingPaths: [],
      });

      writeFixture(root, appPath, "앱 변경\n");
      prepareState();
      expect(verifyReadOnlySourceBoundary(root)).toEqual({
        ok: false, ownedPaths, violatingPaths: [appPath],
      });
    },
  );

  it("현재 라우트 전체(선언 316건, 구체 확장 443건, 와일드카드 위임 5건)를 누락 없이 인벤토리화한다", async () => {
    const report = await auditSitewideRouteInventory(REPO_ROOT);

    expect(report.counts.appRouteDeclarations).toBe(316);
    expect(report.counts.expandedRoutes).toBe(443);
    expect(report.counts.wildcardExclusions).toBe(5);
    expect(report.counts.studioRegistrationsAndAliases).toBe(55);
    expect(report.counts.studioManifestRoutes).toBeGreaterThanOrEqual(45);
    expect(report.counts.adminRoutesAndAliases).toBeGreaterThanOrEqual(15);
    expect(report.counts.learningRoutes).toBe(60);

    expect(report.sourceAuthorities).toEqual(expect.arrayContaining([
      "apps/web/src/app/routes/groups/app-routes.tsx",
      "apps/web/src/domains/admin/router/admin-route-manifest.ts",
      "apps/web/src/domains/creator/studio-route-registry.ts",
      "apps/web/src/domains/creator/studio-router/studio-route-manifest.ts",
      "apps/web/src/domains/learn/LearnPage.tsx",
      "apps/web/src/domains/learn/learning-content.ts",
      "apps/web/src/domains/learn/learning-paths.ts",
    ]));
    expect(new Set(report.sourceAuthorities).size).toBe(report.sourceAuthorities.length);
    for (const source of report.sourceAuthorities) {
      expect(fs.statSync(path.join(REPO_ROOT, source)).isFile()).toBe(true);
    }

    expect(report.allExpandedRoutes).toHaveLength(443);
    expect(new Set(report.allExpandedRoutes).size).toBe(443);

    for (const route of report.allExpandedRoutes) {
      expect(route.startsWith("/")).toBe(true);
      expect(route.includes("*")).toBe(false);
      expect(route.includes("/:")).toBe(false);
    }

    const totalCategorized = report.domainBreakdown.reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(totalCategorized).toBe(report.counts.expandedRoutes);

    // 핵심 도메인 대표 라우트 포함 여부 확인
    expect(report.allExpandedRoutes).toContain("/");
    expect(report.allExpandedRoutes).toContain("/sitemap/all");
    expect(report.allExpandedRoutes).toContain("/sitemap/visual-audit");
    expect(report.allExpandedRoutes).toContain("/discover");
    expect(report.allExpandedRoutes).toContain("/community");
    expect(report.allExpandedRoutes).toContain("/market");
    expect(report.allExpandedRoutes).toContain("/learn");
    expect(report.allExpandedRoutes).toContain("/accessibility");
    expect(report.allExpandedRoutes).toContain("/settings");
    expect(report.allExpandedRoutes).toContain("/fortune");
    expect(report.allExpandedRoutes).toContain("/play");
    expect(report.allExpandedRoutes).toContain("/production");
    expect(report.allExpandedRoutes).toContain("/studio");
    expect(report.allExpandedRoutes).toContain("/studio/canvas");
    expect(report.allExpandedRoutes).toContain("/brush-lab");
    expect(report.allExpandedRoutes).toContain("/shaper");
    expect(report.allExpandedRoutes).toContain("/admin/overview");
  });

  it("라우트 도메인 분류기가 주요 공개·제작·관리 경로를 일관되게 분류한다", () => {
    expect(classifyRouteDomain("/")).toBe("home");
    expect(classifyRouteDomain("/discover")).toBe("discover");
    expect(classifyRouteDomain("/accessibility")).toBe("legal");
    expect(classifyRouteDomain("/settings")).toBe("account");
    expect(classifyRouteDomain("/studio/canvas")).toBe("studio-editor");
    expect(classifyRouteDomain("/brush-lab")).toBe("studio-3d-brush-character");
    expect(classifyRouteDomain("/admin/overview")).toBe("admin");
  });

  it("현재 소스를 변경하지 않고 정적 탐지 결과와 출처를 보고한다", () => {
    const expectedTargets = [
      ["apps/web/src/shared/components/LanguagePicker.tsx"],
      ["apps/web/src/shared/components/FloatingControls.tsx"],
      ["apps/web/src/domains/legal/AccessibilityLab.tsx"],
      [
        "apps/web/src/shared/components/appearance/AppearanceTrigger.tsx",
        "apps/web/src/shared/components/appearance/AppearanceDialog.tsx",
      ],
      [
        "apps/web/src/domains/creator/studio-chrome-ui.tsx",
        "apps/web/src/domains/creator/offline/StudioOfflinePanel.tsx",
      ],
    ];
    const readSources = () => expectedTargets.flat().map((filename) =>
      fs.readFileSync(path.join(REPO_ROOT, filename), "utf8"));
    const before = readSources();
    const findings = auditAccessibilityContracts(REPO_ROOT);

    expect(findings.map(({ id }) => id)).toEqual([
      "GAP-A11Y-01", "GAP-A11Y-02", "GAP-A11Y-03", "GAP-A11Y-04", "GAP-A11Y-05",
    ]);
    expect(findings.map(({ targetFiles }) => targetFiles)).toEqual(expectedTargets);
    expect(findings.map(({ axis }) => axis)).toEqual([
      "keyboard-escape-focus-return", "mobile-dom-focus-order",
      "zoom-200-reduced-motion-preferences", "aria-label-name-role-state",
      "studio-landmarks-skip-order",
    ]);
    expect(findings.map(({ severity }) => severity)).toEqual([
      "high", "high", "high", "medium", "medium",
    ]);
    for (const finding of findings) {
      expect(typeof finding.reproduced).toBe("boolean");
      expect(finding.wcagCriteria.length).toBeGreaterThan(0);
      expect(finding.title.length).toBeGreaterThan(0);
      expect(finding.evidenceSummary.length).toBeGreaterThan(0);
      expect(finding.targetFiles).toContain(finding.minimalPatchAnchor.split("#")[0]);
    }
    expect(readSources()).toEqual(before);
  });
});
