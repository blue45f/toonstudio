// @vitest-environment jsdom

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUDIT_MANIFEST_PATH,
  AUDIT_MEASURED_AT,
  AUDIT_ROOT_RUNTIME_DEP_COUNT,
  AUDIT_SCANNED_DIRECTORY,
  AUDIT_SCANNED_FILE_COUNT,
  AUDIT_SCOPE_KIND,
  DEPENDENCY_AUDIT_CATEGORIES,
  DEPENDENCY_CUTOVER_WAVES,
  DEPENDENCY_OVERLAP_GROUPS,
  MEASURED_DEPENDENCY_AUDIT_CATALOG,
  RUST_CORE_WASM_ARTIFACT_PATH,
  RUST_CORE_WASM_MEASURED_BYTES,
  StudioDependencyWasm64AuditPanel,
  UNMEASURED_AUDIT_BOUNDARIES,
  evaluateDependencyCutoverPlan,
  exportDependencyAuditJson,
  exportDependencyAuditMarkdown,
  getDependencyAuditEntry,
  type DependencyAuditCategory,
  type DependencyCutoverWave,
} from "./index";

afterEach(cleanup);

const REPO_ROOT = path.resolve(process.cwd());
const MODULE_DIR = path.join(REPO_ROOT, "apps/web/src/domains/creator/dependency-wasm64-auditor");

function readModuleFile(fileName: string): string {
  return readFileSync(path.join(MODULE_DIR, fileName), "utf8");
}

function countLines(content: string): number {
  return content.split(/\r?\n/u).length;
}

describe("1. 실제 저장소 정본 정합성 검증", () => {
  it("카탈로그 24종 전원이 루트 package.json dependencies에 실존하며 선언 버전이 1:1 일치한다", () => {
    const rootPkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      readonly dependencies: Record<string, string>;
    };
    expect(MEASURED_DEPENDENCY_AUDIT_CATALOG).toHaveLength(24);
    for (const entry of MEASURED_DEPENDENCY_AUDIT_CATALOG) {
      expect(rootPkg.dependencies[entry.packageName]).toBe(entry.version);
    }
  });

  it("루트 package.json 런타임 의존성 총개수가 실측 상수(106종)와 일치한다", () => {
    const rootPkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      readonly dependencies: Record<string, string>;
    };
    expect(Object.keys(rootPkg.dependencies).length).toBe(AUDIT_ROOT_RUNTIME_DEP_COUNT);
  });

  it("저장소에 포함된 studio-wasm64-drawing-core.wasm 크기가 화면 상수와 일치한다", () => {
    const wasmAbs = path.join(REPO_ROOT, RUST_CORE_WASM_ARTIFACT_PATH);
    expect(existsSync(wasmAbs)).toBe(true);
    expect(statSync(wasmAbs).size).toBe(RUST_CORE_WASM_MEASURED_BYTES);
  });

  it("대응 Rust 크레이트(studio-wasm64-drawing-core · studio-engine-vello)가 저장소에 실존한다", () => {
    expect(existsSync(path.join(REPO_ROOT, "crates/studio-wasm64-drawing-core/Cargo.toml"))).toBe(true);
    expect(existsSync(path.join(REPO_ROOT, "crates/studio-engine-vello/Cargo.toml"))).toBe(true);
  });

  it("카탈로그 모든 패키지의 sampleImportPaths가 저장소에 실존하는 파일이다", () => {
    for (const entry of MEASURED_DEPENDENCY_AUDIT_CATALOG) {
      expect(entry.sampleImportPaths.length).toBeGreaterThan(0);
      for (const relPath of entry.sampleImportPaths) {
        expect(existsSync(path.join(REPO_ROOT, relPath)), `missing sample path: ${relPath}`).toBe(true);
      }
    }
  });

  it("정적 실측 범위 메타데이터와 미실측 런타임 경계를 정직하게 분리해 기록한다", () => {
    const plan = evaluateDependencyCutoverPlan();
    expect(plan.auditScopeKind).toBe(AUDIT_SCOPE_KIND);
    expect(plan.auditScopeKind).toBe("repo-static-import-audit-2026-11-25");
    expect(plan.measuredAt).toBe(AUDIT_MEASURED_AT);
    expect(plan.manifestPath).toBe(AUDIT_MANIFEST_PATH);
    expect(plan.scannedDirectory).toBe(AUDIT_SCANNED_DIRECTORY);
    expect(plan.scannedSourceFileCount).toBe(AUDIT_SCANNED_FILE_COUNT);
    expect(plan.unmeasuredBoundaries).toHaveLength(UNMEASURED_AUDIT_BOUNDARIES.length);
    expect(plan).toMatchObject({ catalogProvenance: "curated-snapshot", currentImportScanVerified: false });
    expect(plan.unmeasuredBoundaries.some((b) => b.verificationCommand.includes("bundle:visualize"))).toBe(true);
  });
});

describe("2. 카탈로그 불변식 및 중복 의존성군 구조", () => {
  it("카탈로그 24종은 중복 없는 고유 패키지명으로 구성된다", () => {
    const names = MEASURED_DEPENDENCY_AUDIT_CATALOG.map((e) => e.packageName);
    expect(new Set(names).size).toBe(24);
  });

  it("모든 항목의 prod + test 임포트 합이 importFileCount와 일치하고 1 이상이다", () => {
    for (const entry of MEASURED_DEPENDENCY_AUDIT_CATALOG) {
      expect(entry.prodImportFileCount + entry.testImportFileCount).toBe(entry.importFileCount);
      expect(entry.importFileCount).toBeGreaterThanOrEqual(1);
      expect(entry.prodImportFileCount).toBeGreaterThanOrEqual(1);
      expect(entry.measuredAt).toBe("2026-11-25");
    }
  });

  it("2D 렌더러 5중첩 중복군이 konva·react-konva·pixi.js·phaser·paper·canvaskit-wasm 6종으로 매핑된다", () => {
    const members = MEASURED_DEPENDENCY_AUDIT_CATALOG.filter((e) => e.overlapGroupId === "2d-renderer-5-overlap").map(
      (e) => e.packageName,
    );
    expect(members).toEqual(["konva", "react-konva", "pixi.js", "phaser", "paper", "canvaskit-wasm"]);
  });

  it("색공간 4중첩 중복군이 spectral.js·colormix·colorjs.io·culori 4종으로 매핑된다", () => {
    const members = MEASURED_DEPENDENCY_AUDIT_CATALOG.filter((e) => e.overlapGroupId === "color-space-4-overlap").map(
      (e) => e.packageName,
    );
    expect(members).toEqual(["spectral.js", "colormix", "colorjs.io", "culori"]);
  });

  it("곡선·스트로크 5중첩 중복군이 perfect-freehand·lazy-brush·simplify-js·fit-curve·bezier-js 5종으로 매핑된다", () => {
    const members = MEASURED_DEPENDENCY_AUDIT_CATALOG.filter((e) => e.overlapGroupId === "curve-stroke-5-overlap").map(
      (e) => e.packageName,
    );
    expect(members).toEqual(["perfect-freehand", "lazy-brush", "simplify-js", "fit-curve", "bezier-js"]);
  });

  it("7개 중복 의존성군이 전체 24종 패키지를 누락·중복 없이 분할한다", () => {
    const groupIds = new Set(DEPENDENCY_OVERLAP_GROUPS.map((g) => g.id));
    let total = 0;
    for (const gid of groupIds) {
      const count = MEASURED_DEPENDENCY_AUDIT_CATALOG.filter((e) => e.overlapGroupId === gid).length;
      expect(count).toBeGreaterThanOrEqual(1);
      total += count;
    }
    expect(total).toBe(24);
  });

  it("getDependencyAuditEntry는 등록 패키지를 조회하고 미등록 이름은 undefined를 반환한다", () => {
    const konva = getDependencyAuditEntry("konva");
    expect(konva?.importFileCount).toBe(122);
    expect(konva?.prodImportFileCount).toBe(87);
    expect(getDependencyAuditEntry("three")?.importFileCount).toBe(653);
    expect(getDependencyAuditEntry("non-existent-pkg")).toBeUndefined();
  });
});

describe("3. 전환 플래너 엔진 (Wave 1~4 · 카테고리 · Safari 가드)", () => {
  it("인수 없이 호출 시 Wave 1 · 전체 카테고리 · Safari WASM32 폴백 활성 기본값으로 평가된다", () => {
    const plan = evaluateDependencyCutoverPlan();
    expect(plan.targetWave).toBe(1);
    expect(plan.categoryFilter).toBe("all");
    expect(plan.maintainSafariWasm32Fallback).toBe(true);
    expect(plan.safariCompatibilityMode).toBe("dual-wasm64-wasm32-safe");
    expect(plan.metrics.totalCatalogPackages).toBe(24);
    expect(plan.metrics.totalAuditedPackages).toBe(24);
  });

  it("Wave 1 → 2 → 3 → 4로 진행할수록 제거·통합 수, 중복군 해소율, Rust·WASM64 커버리지가 단조 증가한다", () => {
    const plans = DEPENDENCY_CUTOVER_WAVES.map((w) => evaluateDependencyCutoverPlan({ targetWave: w.wave }));
    for (let i = 1; i < plans.length; i += 1) {
      const prev = plans[i - 1]!;
      const curr = plans[i]!;
      expect(curr.metrics.removableOrConsolidatableCount).toBeGreaterThan(prev.metrics.removableOrConsolidatableCount);
      expect(curr.metrics.overlapResolutionPct).toBeGreaterThan(prev.metrics.overlapResolutionPct);
      expect(curr.metrics.rustWasm64CoveragePct).toBeGreaterThan(prev.metrics.rustWasm64CoveragePct);
    }
  });

  it("Wave 4 완료 시 중복군 해소율 100%, Rust·WASM64 커버리지 100%, 후속 패키지 0건에 도달한다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 4 });
    expect(plan.metrics.overlapResolutionPct).toBe(100);
    expect(plan.metrics.rustWasm64CoveragePct).toBe(100);
    expect(plan.metrics.deferredPackageCount).toBe(0);
    expect(plan.metrics.resolvedOverlapGroupCount).toBe(plan.metrics.overlapGroupCount);
    expect(plan.metrics.replaceWithRustWasm64Count).toBe(17);
    expect(plan.metrics.consolidateSingleLibCount).toBe(2);
    expect(plan.metrics.lazyIsolateChunkCount).toBe(3);
    expect(plan.metrics.keepPlatformCoreCount).toBe(2);
  });

  it("Wave 1 완료 시 색공간 4중첩이 100% 해소되고 culori 단일 코어만 남는다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 1 });
    const colorGroup = plan.overlapGroups.find((g) => g.groupId === "color-space-4-overlap");
    expect(colorGroup?.isFullyResolved).toBe(true);
    expect(colorGroup?.resolutionPct).toBe(100);
    expect(colorGroup?.removableOrConsolidatableCount).toBe(3);
  });

  it("Wave 2 완료 시 곡선·스트로크 5중첩, 절차적 브러시 2중첩, 2D 공간·불리언 2중첩이 모두 100% 해소된다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 2 });
    for (const gid of ["curve-stroke-5-overlap", "procedural-brush-sketch-2-overlap", "spatial-boolean-2-overlap"] as const) {
      const group = plan.overlapGroups.find((g) => g.groupId === gid);
      expect(group?.isFullyResolved, `expected ${gid} resolved at Wave 2`).toBe(true);
      expect(group?.resolutionPct).toBe(100);
    }
  });

  it("Wave 3 완료 시 3D·CAD 엔진 4중첩과 래스터 필터·비전 중첩이 모두 100% 해소된다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 3 });
    const cad = plan.overlapGroups.find((g) => g.groupId === "3d-cad-4-overlap");
    const vision = plan.overlapGroups.find((g) => g.groupId === "raster-filter-vision-overlap");
    expect(cad?.isFullyResolved).toBe(true);
    expect(vision?.isFullyResolved).toBe(true);
    const renderer2d = plan.overlapGroups.find((g) => g.groupId === "2d-renderer-5-overlap");
    expect(renderer2d?.isFullyResolved).toBe(false);
  });

  it("5개 카테고리 필터 각각이 해당 카테고리 패키지만 정확히 반환하고 합계가 24종이다", () => {
    let sum = 0;
    const expectedCounts: Record<DependencyAuditCategory, number> = {
      "2d-canvas-renderer": 8,
      "stroke-geometry": 7,
      "color-physics": 4,
      "3d-cad-engine": 4,
      "image-vision": 1,
    };
    for (const meta of DEPENDENCY_AUDIT_CATEGORIES) {
      const plan = evaluateDependencyCutoverPlan({ targetWave: 4, categoryFilter: meta.id });
      expect(plan.entries).toHaveLength(expectedCounts[meta.id]);
      expect(plan.entries.every((e) => e.category === meta.id)).toBe(true);
      sum += plan.entries.length;
    }
    expect(sum).toBe(24);
  });

  it("모든 웨이브·카테고리 조합에서 activeWaveEntries + deferredEntries === entries가 성립한다", () => {
    const waves: readonly DependencyCutoverWave[] = [1, 2, 3, 4];
    for (const wave of waves) {
      for (const cat of ["all", ...DEPENDENCY_AUDIT_CATEGORIES.map((c) => c.id)] as const) {
        const plan = evaluateDependencyCutoverPlan({ targetWave: wave, categoryFilter: cat });
        expect(plan.activeWaveEntries.length + plan.deferredEntries.length).toBe(plan.entries.length);
        expect(plan.metrics.activeWavePackageCount).toBe(plan.activeWaveEntries.length);
        expect(plan.metrics.deferredPackageCount).toBe(plan.deferredEntries.length);
      }
    }
  });

  it("Safari WASM32 폴백 유지 시 dual-wasm64-wasm32-safe 모드와 4GiB 폴백 상한을 반환한다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 2, maintainSafariWasm32Fallback: true });
    expect(plan.safariCompatibilityMode).toBe("dual-wasm64-wasm32-safe");
    expect(plan.safariMaxLinearMemoryGiB).toBe(4);
    expect(plan.wasm64PrimaryMemoryGiB).toBe(16);
    expect(plan.safariCompatibilityWarningKo).toBeNull();
    expect(plan.safariCompatibilityWarningEn).toBeNull();
    expect(plan.checklist.every((step) => step.safariFallbackDirectiveKo.includes("wasm32"))).toBe(true);
  });

  it("Safari WASM32 폴백 해제 시 wasm64-primary-only 모드와 경고 메시지·체크리스트 경고를 생성한다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 2, maintainSafariWasm32Fallback: false });
    expect(plan.safariCompatibilityMode).toBe("wasm64-primary-only");
    expect(plan.safariMaxLinearMemoryGiB).toBe(0);
    expect(plan.safariCompatibilityWarningKo).toContain("Safari");
    expect(plan.safariCompatibilityWarningEn).toContain("Safari");
    expect(plan.checklist.every((step) => step.safariFallbackDirectiveKo.includes("비활성"))).toBe(true);
  });

  it("waveBreakdown 4단계 누적 지표가 Wave 4 최종 지표와 정확히 일치한다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 4 });
    expect(plan.waveBreakdown).toHaveLength(4);
    const last = plan.waveBreakdown[3]!;
    expect(last.cumulativeAddressedCount).toBe(24);
    expect(last.cumulativeRemovableCount).toBe(plan.metrics.removableOrConsolidatableCount);
    expect(last.cumulativeOverlapResolutionPct).toBe(100);
    expect(last.cumulativeRustCoveragePct).toBe(100);
  });
});

describe("4. ADR Markdown 및 JSON 내보내기", () => {
  it("한글 ADR Markdown이 실측 범위, 24종 매트릭스, 체크리스트, 미실측 분리를 포함한다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 4 });
    const md = exportDependencyAuditMarkdown(plan, "ko");
    expect(md).toContain("# ADR 초안:");
    expect(md).toContain("repo-static-import-audit-2026-11-25");
    expect(md).toContain("`konva`");
    expect(md).toContain("`canvaskit-wasm`");
    expect(md).toContain("`@techstark/opencv-js`");
    expect(md).toContain("## 2. 단계별 실행 체크리스트");
    expect(md).toContain("## 3. 미실측 항목 분리");
    expect(md).not.toContain("> [!WARNING]");
  });

  it("영문 ADR Markdown이 영문 표·체크리스트·Unmeasured Scope를 생성한다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 2 });
    const md = exportDependencyAuditMarkdown(plan, "en");
    expect(md).toContain("# ADR Draft:");
    expect(md).toContain("## 1. Dependency Planning Matrix");
    expect(md).toContain("## 2. Wave Execution Checklist");
    expect(md).toContain("## 3. Unmeasured Runtime Scope");
  });

  it("Safari WASM32 폴백을 끈 계획의 Markdown에는 WARNING 콜아웃이 삽입된다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 1, maintainSafariWasm32Fallback: false });
    const mdKo = exportDependencyAuditMarkdown(plan, "ko");
    const mdEn = exportDependencyAuditMarkdown(plan, "en");
    expect(mdKo).toContain("> [!WARNING]");
    expect(mdEn).toContain("> [!WARNING]");
  });

  it("exportDependencyAuditJson은 유효한 JSON을 반환하며 파싱 결과가 원본 계획과 일치한다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 3, categoryFilter: "2d-canvas-renderer" });
    const raw = exportDependencyAuditJson(plan);
    const parsed = JSON.parse(raw) as ReturnType<typeof evaluateDependencyCutoverPlan>;
    expect(parsed.auditScopeKind).toBe(AUDIT_SCOPE_KIND);
    expect(parsed.targetWave).toBe(3);
    expect(parsed.entries).toHaveLength(8);
    expect(parsed.metrics.overlapResolutionPct).toBe(plan.metrics.overlapResolutionPct);
  });

  it("카테고리 필터링된 계획의 Markdown에는 타 카테고리 패키지가 섞이지 않는다", () => {
    const plan = evaluateDependencyCutoverPlan({ targetWave: 4, categoryFilter: "color-physics" });
    const md = exportDependencyAuditMarkdown(plan, "ko");
    expect(md).toContain("`spectral.js`");
    expect(md).toContain("`culori`");
    expect(md).not.toContain("`konva`");
    expect(md).not.toContain("`three`");
  });
});

describe("5. StudioDependencyWasm64AuditPanel UI 인터랙션 및 순수 시맨틱 SVG", () => {
  it("클립보드를 사용할 수 없으면 복사 성공 표시 대신 미리보기로 안내한다", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    try {
      render(<StudioDependencyWasm64AuditPanel locale="en" />);
      fireEvent.click(screen.getByTestId("dep-audit-copy-btn"));
      await waitFor(() => expect(screen.getByTestId("dep-audit-copy-status").textContent).toContain("Copy from the preview"));
      expect(screen.getByTestId("dep-audit-export-preview").textContent).toContain("# ADR Draft:");
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("props 없이 단독 렌더해도 24종 매트릭스·실측 배지·순수 시맨틱 SVG를 정상 표시한다", () => {
    render(<StudioDependencyWasm64AuditPanel />);
    expect(screen.getByTestId("dependency-wasm64-audit-panel")).toBeTruthy();
    expect(screen.getByTestId("dep-audit-scope-badge").textContent).toBe("repo-static-import-audit-2026-11-25");
    expect(screen.getByTestId("dep-audit-wasm-size-badge").textContent).toContain("47.91 KiB");
    expect(screen.getByTestId("dep-audit-convergence-svg").getAttribute("role")).toBe("img");
    expect(screen.getAllByTestId(/^dep-audit-row-/u)).toHaveLength(24);
  });

  it("initialWave · initialCategory · locale='en' · className props가 초기 렌더에 정확히 반영된다", () => {
    render(
      <StudioDependencyWasm64AuditPanel
        initialWave={3}
        initialCategory="3d-cad-engine"
        locale="en"
        className="custom-audit-surface"
      />,
    );
    const root = screen.getByTestId("dependency-wasm64-audit-panel");
    expect(root.className).toContain("custom-audit-surface");
    expect(root.textContent).toContain("Runtime Dependency Audit");
    expect(screen.getByTestId("dep-audit-wave-3").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("dep-audit-cat-3d-cad-engine").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByTestId(/^dep-audit-row-/u)).toHaveLength(4);
  });

  it("Wave 1→4 전환 버튼 클릭 시 KPI·SVG 속성이 즉시 갱신되고 onPlanChange 콜백이 호출된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioDependencyWasm64AuditPanel onPlanChange={onPlanChange} />);
    expect(screen.getByTestId("dep-audit-kpi-overlap").textContent).toBe("36%");
    expect(screen.getByTestId("dep-audit-convergence-svg").getAttribute("data-target-wave")).toBe("1");

    fireEvent.click(screen.getByTestId("dep-audit-wave-4"));
    expect(screen.getByTestId("dep-audit-kpi-overlap").textContent).toBe("100%");
    expect(screen.getByTestId("dep-audit-kpi-rust-coverage").textContent).toBe("100%");
    expect(screen.getByTestId("dep-audit-convergence-svg").getAttribute("data-target-wave")).toBe("4");
    expect(onPlanChange).toHaveBeenLastCalledWith(expect.objectContaining({ targetWave: 4 }));
  });

  it("카테고리 필터 클릭 시 매트릭스 행 수가 해당 카테고리 패키지 수로 즉시 필터링된다", () => {
    render(<StudioDependencyWasm64AuditPanel />);
    fireEvent.click(screen.getByTestId("dep-audit-cat-stroke-geometry"));
    expect(screen.getAllByTestId(/^dep-audit-row-/u)).toHaveLength(7);
    expect(screen.getByTestId("dep-audit-row-bezier-js")).toBeTruthy();

    fireEvent.click(screen.getByTestId("dep-audit-cat-image-vision"));
    expect(screen.getAllByTestId(/^dep-audit-row-/u)).toHaveLength(1);
    expect(screen.getByTestId("dep-audit-row-@techstark/opencv-js")).toBeTruthy();
  });

  it("중복군 카드 클릭 시 해당 중복군 패키지가 강조되고 강조 해제 버튼으로 복귀한다", () => {
    render(<StudioDependencyWasm64AuditPanel />);
    fireEvent.click(screen.getByTestId("dep-audit-overlap-color-space-4-overlap"));
    expect(screen.getByTestId("dep-audit-row-spectral.js").getAttribute("data-highlighted")).toBe("true");
    expect(screen.getByTestId("dep-audit-row-culori").getAttribute("data-highlighted")).toBe("true");
    expect(screen.getByTestId("dep-audit-row-konva").getAttribute("data-highlighted")).toBe("false");

    fireEvent.click(screen.getByTestId("dep-audit-clear-highlight"));
    expect(screen.getByTestId("dep-audit-row-spectral.js").getAttribute("data-highlighted")).toBe("false");
  });

  it("Safari WASM32 폴백 스위치 토글 시 경고 배너와 SVG 모드가 즉시 반응한다", () => {
    render(<StudioDependencyWasm64AuditPanel />);
    const toggle = screen.getByTestId("dep-audit-safari-switch");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByTestId("dep-audit-safari-warning")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("dep-audit-safari-warning")).toBeTruthy();
    expect(screen.getByTestId("dep-audit-convergence-svg").getAttribute("data-safari-mode")).toBe("wasm64-primary-only");
  });

  it("ADR Markdown/JSON/닫기 탭 전환 및 복사 버튼이 onExportMarkdown을 호출하고 상태를 표시한다", async () => {
    const onExportMarkdown = vi.fn();
    render(<StudioDependencyWasm64AuditPanel onExportMarkdown={onExportMarkdown} />);
    expect(screen.getByTestId("dep-audit-export-preview").textContent).toContain("# ADR 초안:");

    fireEvent.click(screen.getByTestId("dep-audit-copy-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("dep-audit-copy-status")).toBeTruthy();
    });
    expect(onExportMarkdown).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("dep-audit-tab-json"));
    expect(screen.getByTestId("dep-audit-export-preview").textContent).toContain('"auditScopeKind"');

    fireEvent.click(screen.getByTestId("dep-audit-tab-hidden"));
    expect(screen.queryByTestId("dep-audit-export-preview")).toBeNull();
  });
});

describe("6. 엄격 하네스·안티슬롭 정적 계약 검증", () => {
  it("소유 4개 파일 모두 800줄 이하이며 엔진 <= 750줄, 패널 <= 680줄 계약을 충족한다", () => {
    const engineLines = countLines(readModuleFile("dependency-wasm64-audit-engine.ts"));
    const panelLines = countLines(readModuleFile("StudioDependencyWasm64AuditPanel.tsx"));
    const indexLines = countLines(readModuleFile("index.ts"));
    const testLines = countLines(readModuleFile("dependency-wasm64-audit.test.tsx"));
    expect(engineLines).toBeLessThanOrEqual(750);
    expect(panelLines).toBeLessThanOrEqual(680);
    expect(indexLines).toBeLessThanOrEqual(800);
    expect(testLines).toBeLessThanOrEqual(800);
  });

  it("소스 파일에 원시 hex/rgb/hsl 색상과 바이올렛(270~320°) oklch가 0건이다", () => {
    const sources = [
      readModuleFile("dependency-wasm64-audit-engine.ts"),
      readModuleFile("StudioDependencyWasm64AuditPanel.tsx"),
      readModuleFile("index.ts"),
    ];
    for (const src of sources) {
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      const oklchMatches = src.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu);
      for (const match of oklchMatches) {
        const hue = Number(match[1]);
        expect(hue < 270 || hue > 320, `violet hue disallowed: ${hue}`).toBe(true);
      }
    }
  });

  it("소스 파일에 transition-all · Web Storage · Sparkles · '= {}' 기본 props · BigInt 리터럴 · private Map store가 0건이다", () => {
    const sources = [
      readModuleFile("dependency-wasm64-audit-engine.ts"),
      readModuleFile("StudioDependencyWasm64AuditPanel.tsx"),
      readModuleFile("index.ts"),
    ];
    for (const src of sources) {
      expect(src).not.toContain("transition-all");
      expect(src).not.toContain("localStorage");
      expect(src).not.toContain("sessionStorage");
      expect(src).not.toContain("Sparkles");
      expect(src).not.toMatch(/:\s*StudioDependencyWasm64AuditPanelProps\s*=\s*\{\s*\}/u);
      expect(src).not.toMatch(/\b0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\bprivate\s+(?:readonly\s+)?store\b/u);
    }
  });

  it("UI 패널이 min-h-11 터치 타깃, tabular-nums, keep-all, oklch/currentColor SVG 계약을 준수한다", () => {
    const panelSrc = readModuleFile("StudioDependencyWasm64AuditPanel.tsx");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("currentColor");
    expect(panelSrc).toContain("oklch(");
  });
});
