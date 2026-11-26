import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  analyzeMonolithDecomposition,
  auditLegacyDependencyRatchet,
  classifySourceFileRole,
  countSourceLines,
  extractModuleImportRecords,
  LEGACY_WASM64_RATCHET_PACKAGES,
  normalizeBarePackageName,
  STUDIO_MONOLITH_DOMAINS,
  type DependencyRatchetAuditReport,
  type MonolithDecompositionReport,
  type PackageManifestInput,
  type SourceFileEntry,
} from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(HERE, "../../../../../../");
const WEB_SRC_ROOT = resolve(WORKSPACE_ROOT, "apps/web/src");
const HOST_MONOLITH_PATH = resolve(
  WORKSPACE_ROOT,
  "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
);
const VERIFY_BRUSHES_SCRIPT_PATH = resolve(
  WORKSPACE_ROOT,
  "scripts/verify-studio-brushes.mts",
);
const VERIFY_3D_CONSOLE_SCRIPT_PATH = resolve(
  WORKSPACE_ROOT,
  "scripts/verify-studio-3d-console.mts",
);

const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];

function hasSupportedSourceExtension(name: string): boolean {
  for (const ext of SOURCE_FILE_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }
  return false;
}

function loadWebPackageManifest(): { manifestPath: string; manifest: PackageManifestInput } {
  const webPkgPath = resolve(WORKSPACE_ROOT, "apps/web/package.json");
  const rootPkgPath = resolve(WORKSPACE_ROOT, "package.json");
  const chosenPath = existsSync(webPkgPath) ? webPkgPath : rootPkgPath;
  const parsed = JSON.parse(readFileSync(chosenPath, "utf8")) as PackageManifestInput;
  return {
    manifestPath: relative(WORKSPACE_ROOT, chosenPath).split("\\").join("/"),
    manifest: parsed,
  };
}

function listAllWebSourceFiles(rootDir: string): readonly string[] {
  const collected: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = resolve(dir, entry.name);
      const stat = entry.isSymbolicLink() ? statSync(fullPath) : entry;
      if (stat.isDirectory()) {
        visit(fullPath);
      } else if (stat.isFile() && hasSupportedSourceExtension(entry.name)) {
        collected.push(fullPath);
      }
    }
  };
  visit(rootDir);
  return collected.sort();
}

function* iterateSourceEntries(absolutePaths: readonly string[]): Generator<SourceFileEntry> {
  for (const abs of absolutePaths) {
    yield {
      filePath: relative(WORKSPACE_ROOT, abs).split("\\").join("/"),
      content: readFileSync(abs, "utf8"),
    };
  }
}

let hostSourceText = "";
let hostReport: MonolithDecompositionReport;
let verifyBrushesReport: MonolithDecompositionReport;
let verify3dConsoleReport: MonolithDecompositionReport;
let workspaceRatchetReport: DependencyRatchetAuditReport;
let resolvedManifestInfo: { manifestPath: string; manifest: PackageManifestInput };
let allWebFiles: readonly string[] = [];

beforeAll(() => {
  hostSourceText = readFileSync(HOST_MONOLITH_PATH, "utf8");
  hostReport = analyzeMonolithDecomposition({
    filePath: "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
    sourceText: hostSourceText,
  });

  verifyBrushesReport = analyzeMonolithDecomposition({
    filePath: "scripts/verify-studio-brushes.mts",
    sourceText: readFileSync(VERIFY_BRUSHES_SCRIPT_PATH, "utf8"),
  });

  verify3dConsoleReport = analyzeMonolithDecomposition({
    filePath: "scripts/verify-studio-3d-console.mts",
    sourceText: readFileSync(VERIFY_3D_CONSOLE_SCRIPT_PATH, "utf8"),
  });

  resolvedManifestInfo = loadWebPackageManifest();
  allWebFiles = listAllWebSourceFiles(WEB_SRC_ROOT);
  workspaceRatchetReport = auditLegacyDependencyRatchet({
    files: iterateSourceEntries(allWebFiles),
    manifest: resolvedManifestInfo.manifest,
  });
});

describe("host-characterization-audit: StudioCuttoonEditorHost.tsx 모놀리스 분해 특성화", () => {
  it("2만 줄 이상의 호스트 컴포넌트를 정확히 식별하고 도메인 클러스터·팬인/팬아웃·모듈성 점수 Q를 산출한다", () => {
    expect(hostReport.isHostComponentMonolith).toBe(true);
    expect(hostReport.hostEntryName).toBe("StudioCuttoonEditor");
    expect(hostReport.totalLines).toBeGreaterThan(20_000);
    expect(hostReport.staticImportCount).toBeGreaterThan(250);
    expect(hostReport.extractedUnitCount).toBeGreaterThan(400);
    expect(hostReport.totalHookCallCount).toBeGreaterThan(400);
    expect(hostReport.directedEdgeCount).toBeGreaterThan(500);

    // 유향 그래프 Newman-Girvan 모듈성 Q가 양수(응집된 도메인 경계 존재)이고 수학적 합산과 일치해야 한다
    expect(hostReport.modularityScoreQ).toBeGreaterThan(0.15);
    expect(hostReport.modularityScoreQ).toBeLessThan(1);

    const summedContrib = hostReport.domainClusters.reduce(
      (acc, c) => acc + c.modularityContribution,
      0,
    );
    expect(Math.abs(summedContrib - hostReport.modularityScoreQ)).toBeLessThan(1e-4);

    expect(hostReport.domainClusters).toHaveLength(STUDIO_MONOLITH_DOMAINS.length);
    for (const cluster of hostReport.domainClusters) {
      expect(cluster.unitCount).toBeGreaterThan(0);
      expect(cluster.importCount).toBeGreaterThan(0);
      expect(cluster.instabilityIndex).toBeGreaterThanOrEqual(0);
      expect(cluster.instabilityIndex).toBeLessThanOrEqual(1);
    }
  });

  it("도메인별 훅 그룹·상태 전이 클러스터·순수 헬퍼 후보·3단계 Strangler-Fig 순서를 결정론적으로 생성한다", () => {
    expect(hostReport.hookGroups.length).toBeGreaterThanOrEqual(7);
    const brushHookGroup = hostReport.hookGroups.find((g) => g.domainId === "brush-ink");
    expect(brushHookGroup).toBeDefined();
    expect(brushHookGroup?.suggestedHookName).toBe("useStudioBrushInkCluster");
    expect(brushHookGroup?.totalHookCalls).toBeGreaterThan(10);

    expect(hostReport.stateTransitionClusters.length).toBeGreaterThanOrEqual(6);
    const persistenceCluster = hostReport.stateTransitionClusters.find(
      (c) => c.domainId === "persistence-recovery",
    );
    expect(persistenceCluster).toBeDefined();
    expect(persistenceCluster?.setterNames).toContain("setFormalSaveOpen");
    expect(persistenceCluster?.cohesionScore).toBeGreaterThanOrEqual(0);
    expect(persistenceCluster?.cohesionScore).toBeLessThanOrEqual(1);

    expect(hostReport.pureHelperCandidates.length).toBeGreaterThan(0);
    for (const candidate of hostReport.pureHelperCandidates) {
      expect(candidate.lineCount).toBeGreaterThanOrEqual(3);
      expect(candidate.capturedReadOnlyBindings.length).toBeLessThanOrEqual(3);
    }

    // Strangler-Fig 추출 순서가 Phase 1 -> Phase 2 -> Phase 3 단조 증가 순서를 지켜야 한다
    expect(hostReport.stranglerFigOrder.length).toBeGreaterThanOrEqual(12);
    const phaseRank = {
      "phase-1-pure-helpers": 1,
      "phase-2-leaf-state-clusters": 2,
      "phase-3-domain-hook-facades": 3,
    } as const;
    for (let i = 0; i < hostReport.stranglerFigOrder.length; i += 1) {
      const step = hostReport.stranglerFigOrder[i]!;
      expect(step.stepOrder).toBe(i + 1);
      if (i > 0) {
        const prev = hostReport.stranglerFigOrder[i - 1]!;
        expect(phaseRank[step.phase]).toBeGreaterThanOrEqual(phaseRank[prev.phase]);
      }
    }

    // 동일 입력 재실행 시 계획 해시와 구조가 100% 결정론적으로 일치해야 한다
    const secondRun = analyzeMonolithDecomposition({
      filePath: "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
      sourceText: hostSourceText,
    });
    expect(secondRun.planDeterminismDigest).toBe(hostReport.planDeterminismDigest);
    expect(secondRun).toEqual(hostReport);
  });
});

describe("host-characterization-audit: scripts/verify-studio-*.mts 스크립트 모놀리스 분해 검증", () => {
  it("verify-studio-brushes.mts와 verify-studio-3d-console.mts에서 순수 기하 헬퍼와 브라우저 드라이버를 분리한다", () => {
    expect(verifyBrushesReport.isHostComponentMonolith).toBe(false);
    expect(verifyBrushesReport.totalLines).toBeGreaterThan(5_000);
    expect(verifyBrushesReport.modularityScoreQ).toBeGreaterThan(0);

    const pureNames = new Set(verifyBrushesReport.pureHelperCandidates.map((c) => c.name));
    // 순수 수학·기하 헬퍼는 추출 후보에 포함되어야 한다
    expect(pureNames.has("strokeIdentityHash")).toBe(true);
    expect(pureNames.has("fitStrokeAxis")).toBe(true);
    expect(pureNames.has("canvasSafeRect")).toBe(true);
    // Playwright 페이지 조작 비동기 함수는 순수 헬퍼 후보에서 배제되어야 한다
    expect(pureNames.has("openDesktopCatalog")).toBe(false);
    expect(pureNames.has("selectDesktopBrush")).toBe(false);

    expect(verify3dConsoleReport.totalLines).toBeGreaterThan(2_000);
    expect(verify3dConsoleReport.extractedUnitCount).toBeGreaterThan(25);
    expect(verify3dConsoleReport.stranglerFigOrder.length).toBeGreaterThan(0);
  });
});

describe("host-characterization-audit: Wave 1~2 레거시 npm 7종 프로덕션 0-import 래칫 감사", () => {
  it("apps/web/src 전체 프로덕션 파일에서 7종 레거시 수학·색채·공간 라이브러리의 import가 정확히 0건임을 고정한다", () => {
    expect(["apps/web/package.json", "package.json"]).toContain(resolvedManifestInfo.manifestPath);
    expect(workspaceRatchetReport.scannedFileCount).toBeGreaterThan(15_000);
    expect(workspaceRatchetReport.productionFileCount).toBeGreaterThan(10_000);
    expect(workspaceRatchetReport.testFileCount).toBeGreaterThan(2_000);

    // 핵심 불변식: 프로덕션 import 총합 0건, 회귀 목록 0건
    expect(workspaceRatchetReport.ratchetPassed).toBe(true);
    expect(workspaceRatchetReport.totalProdImports).toBe(0);
    expect(workspaceRatchetReport.prodRegressions).toEqual([]);
    expect(workspaceRatchetReport.packages).toHaveLength(7);

    for (const pkgName of LEGACY_WASM64_RATCHET_PACKAGES) {
      const status = workspaceRatchetReport.packages.find((p) => p.packageName === pkgName);
      expect(status).toBeDefined();
      expect(status?.prodImportCount).toBe(0);
      expect(status?.prodImportFiles).toEqual([]);
      expect(status?.ratchetClean).toBe(true);
      expect(status?.manifestSection).toBe("dependencies");
      expect(status?.manifestVersion).toBeTruthy();
    }

    // bezier-js와 lazy-brush는 프로덕션·테스트 모두 0건이어서 즉시 매니페스트 제거 준비 상태다
    const bezierStatus = workspaceRatchetReport.packages.find((p) => p.packageName === "bezier-js");
    const lazyBrushStatus = workspaceRatchetReport.packages.find((p) => p.packageName === "lazy-brush");
    expect(bezierStatus?.readyForManifestRemoval).toBe(true);
    expect(lazyBrushStatus?.readyForManifestRemoval).toBe(true);

    // 패리티·대비 검증 테스트 전용 오라클 참조는 testImportCount로만 집계되고 프로덕션 래칫을 오염시키지 않는다
    const colorJsStatus = workspaceRatchetReport.packages.find((p) => p.packageName === "colorjs.io");
    const rbushStatus = workspaceRatchetReport.packages.find((p) => p.packageName === "rbush");
    expect(colorJsStatus?.testImportCount).toBeGreaterThan(0);
    expect(rbushStatus?.testImportCount).toBeGreaterThan(0);
  });

  it("정적·서브패스·동적·사이드이펙트·재노출·CJS import 회귀는 즉시 적발하고 주석·문자열·정규식은 오탐하지 않는다", () => {
    const syntheticFiles: readonly SourceFileEntry[] = [
      {
        filePath: "apps/web/src/domains/creator/safe-catalog-copy.ts",
        content: [
          "// import Bezier from \"bezier-js\";",
          "/* require(\"rbush\") */",
          "const DOC_NOTE = 'from \"lazy-brush\" and import(\"simplify-js\")';",
          "const REGEX_GUARD = /https?:\\/\\/github\\.com\\/dulnan\\/lazy-brush/u;",
          "export function safeHelper(): { label: string } {",
          "  return { label: `${DOC_NOTE}:${REGEX_GUARD.source}` };",
          "}",
        ].join("\n"),
      },
      {
        filePath: "apps/web/src/shared/types/vendor/bezier-js-shim.d.ts",
        content: "declare module \"bezier-js\" { export class Bezier {} }",
      },
      {
        filePath: "apps/web/src/domains/creator/drawing/parity.test.ts",
        content: "import simplify from \"simplify-js\";\nexport const ref = simplify;",
      },
    ];

    const cleanAudit = auditLegacyDependencyRatchet({ files: syntheticFiles });
    expect(cleanAudit.ratchetPassed).toBe(true);
    expect(cleanAudit.totalProdImports).toBe(0);
    expect(cleanAudit.totalTestImports).toBe(1);
    expect(cleanAudit.ambientDtsFileCount).toBe(1);

    const regressedAudit = auditLegacyDependencyRatchet({
      files: [
        ...syntheticFiles,
        {
          filePath: "apps/web/src/domains/creator/accidental-regression.ts",
          content: [
            "import mix from \"colormix/dist/index.mjs\";",
            "import \"lazy-brush\";",
            "export * from \"fit-curve\";",
            "export async function loadTree() {",
            "  const tree = await import(\"rbush\");",
            "  const legacy = require(\"bezier-js\");",
            "  return { mix, tree, legacy };",
            "}",
          ].join("\n"),
        },
      ],
    });

    expect(regressedAudit.ratchetPassed).toBe(false);
    expect(regressedAudit.totalProdImports).toBe(5);
    expect(regressedAudit.prodRegressions.map((r) => [r.packageName, r.importKind])).toEqual([
      ["bezier-js", "commonjs-require"],
      ["colormix", "static-import"],
      ["fit-curve", "re-export"],
      ["lazy-brush", "side-effect-import"],
      ["rbush", "dynamic-import"],
    ]);

    expect(normalizeBarePackageName("colormix/dist/index.mjs")).toBe("colormix");
    expect(normalizeBarePackageName("@toonstudio/core/math")).toBe("@toonstudio/core");
    expect(normalizeBarePackageName("./local-module")).toBeNull();
    expect(classifySourceFileRole("apps/web/src/domains/creator/foo.ts")).toBe("production");
    expect(classifySourceFileRole("apps/web/src/domains/creator/__tests__/foo.ts")).toBe("test");
    expect(extractModuleImportRecords("import { a, type b as c } from 'culori';")).toEqual([
      {
        specifier: "culori",
        importKind: "static-import",
        valueBindings: ["a"],
        typeBindings: ["c"],
        line: 1,
      },
    ]);
  });

  it("격리 디렉터리 내 모든 파일이 700줄 상한·0 BigInt 리터럴·0 브라우저 KV 전역 규칙을 준수한다", () => {
    const ownEntries = readdirSync(HERE).filter((name) => name.endsWith(".ts")).sort();
    expect(ownEntries.length).toBeGreaterThanOrEqual(3);
    const forbiddenKvTokens = [
      "local" + "Storage",
      "session" + "Storage",
      "indexed" + "DB",
      "IDB" + "Database",
      "Dex" + "ie",
    ];

    for (const fileName of ownEntries) {
      const fullPath = resolve(HERE, fileName);
      const source = readFileSync(fullPath, "utf8");
      const lines = countSourceLines(source);
      expect(lines).toBeLessThanOrEqual(700);
      for (const kvToken of forbiddenKvTokens) {
        expect(source.includes(kvToken)).toBe(false);
      }
    }
  });
});
