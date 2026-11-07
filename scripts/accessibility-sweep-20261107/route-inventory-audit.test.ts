// @vitest-environment node
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditAccessibilityContracts,
  auditSitewideRouteInventory,
  classifyRouteDomain,
  isOwnedAuditPath,
  OWNED_PATH_PREFIXES,
  verifyReadOnlySourceBoundary,
} from "./route-inventory-audit";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

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

  it("앱 구현 전체 READ-ONLY 경계를 유지하며 허용 경로 외부의 변경이 0건이다", () => {
    const boundary = verifyReadOnlySourceBoundary(REPO_ROOT);
    expect(boundary.violatingPaths).toEqual([]);
    expect(boundary.ok).toBe(true);
  });

  it("현재 라우트 전체(선언 314건, 구체 확장 441건, 와일드카드 위임 5건)를 누락 없이 인벤토리화한다", async () => {
    const report = await auditSitewideRouteInventory(REPO_ROOT);

    expect(report.counts.appRouteDeclarations).toBe(314);
    expect(report.counts.expandedRoutes).toBe(441);
    expect(report.counts.wildcardExclusions).toBe(5);
    expect(report.counts.studioRegistrationsAndAliases).toBe(55);
    expect(report.counts.studioManifestRoutes).toBeGreaterThanOrEqual(45);
    expect(report.counts.adminRoutesAndAliases).toBeGreaterThanOrEqual(15);
    expect(report.counts.learningRoutes).toBe(60);

    expect(report.allExpandedRoutes).toHaveLength(441);
    expect(new Set(report.allExpandedRoutes).size).toBe(441);

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

  it("키보드 Tab/Escape·포커스 복귀·aria-label·200% 확대·reduced-motion 정적 계약을 검증하고 결함 후보를 재현한다", () => {
    const findings = auditAccessibilityContracts(REPO_ROOT);
    expect(findings.length).toBeGreaterThanOrEqual(5);

    const byId = new Map(findings.map((item) => [item.id, item]));
    expect(byId.get("GAP-A11Y-01")?.reproduced).toBe(true);
    expect(byId.get("GAP-A11Y-02")?.reproduced).toBe(true);
    expect(byId.get("GAP-A11Y-03")?.reproduced).toBe(true);
    expect(byId.get("GAP-A11Y-04")?.reproduced).toBe(true);
    expect(byId.get("GAP-A11Y-05")?.reproduced).toBe(true);
  });
});
