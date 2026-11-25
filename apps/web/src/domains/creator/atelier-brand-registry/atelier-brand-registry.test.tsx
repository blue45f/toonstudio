// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_EXTERNAL_REFERENCE_SCOPES,
  BRAND_ARCHITECTURE_LAYERS,
  BRAND_AUDIT_SAMPLE_PROBES,
  BRAND_REGISTRY_BASELINE_COMMIT,
  BRAND_REGISTRY_MEASURED_AT,
  BRAND_REGISTRY_SCHEMA_VERSION,
  EXTERNAL_NAME_DETECTION_RULES,
  LEGACY_PATH_MIGRATION_ENTRIES,
  MIGRATION_PHASES,
  REPOSITORY_SCAN_ROOTS,
  REPOSITORY_SCAN_SUMMARY,
  StudioAtelierBrandRegistryPanel,
  TOONSTUDIO_PROPRIETARY_BRANDS,
  auditNamingBatch,
  auditProprietaryBrandNaming,
  exportBrandGovernanceMarkdown,
  exportBrandRegistryJson,
  filterMigrationEntries,
  formatOklch,
  getBrandsByLayer,
  getProprietaryBrand,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  tokenizeNamingInput,
  type ProprietaryBrandId,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("고정 기준 스냅샷 범위", () => {
  it("내보내기는 기준 커밋의 고정 자료이며 실시간 스캔·파일 변경·저장을 수행하지 않는다", () => {
    const { payload } = exportBrandRegistryJson();
    expect(payload).toMatchObject({
      baselineCommitShort: BRAND_REGISTRY_BASELINE_COMMIT,
      executionScope: {
        kind: "fixed-baseline-preview", liveFilesystemScan: false,
        filesystemMutation: false, persistence: "none",
      },
    });
    expect(exportBrandGovernanceMarkdown()).toContain("고정 스냅샷");
    expect(exportBrandGovernanceMarkdown()).toContain("실시간 저장소 스캔이나 파일 변경을 실행하지 않습니다");
  });

  it("화면에서 입력 문자열 검사와 기준 자료를 구분하고 임시 입력 보관을 안내한다", () => {
    render(<StudioAtelierBrandRegistryPanel />);
    expect(screen.getByTestId("brand-registry-scope").textContent).toContain("고정 스냅샷");
    expect(screen.getByTestId("brand-registry-scope").textContent).toContain(BRAND_REGISTRY_BASELINE_COMMIT);
    expect(screen.getByTestId("brand-registry-scope").textContent).toContain("패널을 닫기 전");
  });
});

const FORBIDDEN_EXTERNAL_TOKENS = EXTERNAL_NAME_DETECTION_RULES
  .filter((r) => r.severity === "block")
  .map((r) => r.tokens[0]);

function assertZeroVioletAndRawColors(svgMarkup: string): void {
  expect(svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(svgMarkup).not.toMatch(/\brgba?\s*\(/iu);
  expect(svgMarkup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of svgMarkup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 10대 고유 브랜드 정본 · 5계층 아키텍처 · 탈-바이올렛 OKLCH & 실측 스캔", () => {
  it("TOONSTUDIO_PROPRIETARY_BRANDS가 10대 고유 포멀 브랜드를 순서대로 정의한다", () => {
    expect(TOONSTUDIO_PROPRIETARY_BRANDS.map((b) => b.formalName)).toEqual([
      "ToonCore",
      "SpectrumCompute",
      "InkRaster",
      "AtelierSolid",
      "AtelierCast",
      "AtelierStage",
      "PrismLight",
      "LoomSync",
      "KilnExport",
      "CalmChrome",
    ]);
    expect(TOONSTUDIO_PROPRIETARY_BRANDS.map((b) => b.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("5계층 아키텍처가 10대 고유 브랜드를 누락·중복 없이 분할 매핑한다", () => {
    expect(BRAND_ARCHITECTURE_LAYERS).toHaveLength(5);
    const mappedIds = BRAND_ARCHITECTURE_LAYERS.flatMap((layer) => getBrandsByLayer(layer.id).map((b) => b.id));
    expect(mappedIds).toHaveLength(10);
    expect(new Set(mappedIds).size).toBe(10);
  });

  it("AtelierCast가 character-lab 통합 타깃으로 지정되고 ToonCore가 WASM64 크레이트에 앵커링된다", () => {
    const cast = getProprietaryBrand("atelier-cast");
    const core = getProprietaryBrand("toon-core");
    expect(cast.formalName).toBe("AtelierCast");
    expect(cast.consolidationNoteKo).toContain("character-lab");
    expect(core.canonicalAnchorPath).toBe("crates/studio-wasm64-drawing-core");
  });

  it("getProprietaryBrand가 등록된 ID를 반환하고 미등록 ID는 ToonCore로 안전 폴백한다", () => {
    expect(getProprietaryBrand("kiln-export").formalName).toBe("KilnExport");
    expect(getProprietaryBrand("calm-chrome").formalName).toBe("CalmChrome");
    expect(getProprietaryBrand("non-existent-brand" as ProprietaryBrandId).id).toBe("toon-core");
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 270~320° 바이올렛 휴를 100% 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(292)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(196)).toBe(false);
    expect(isVioletSlopHue(242)).toBe(false);
    for (let h = 270; h <= 320; h += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(h))).toBe(false);
    }
  });

  it("formatOklch가 원시 색 없이 탈-바이올렛 OKLCH를 생성하고 모든 브랜드·계층 색상이 안전하다", () => {
    expect(formatOklch({ l: 0.54, c: 0.14, h: 196 })).toBe("oklch(0.54 0.14 196)");
    expect(formatOklch({ l: 0.54, c: 0.14, h: 288 }, 0.4)).toBe("oklch(0.54 0.14 228 / 0.40)");
    for (const b of TOONSTUDIO_PROPRIETARY_BRANDS) expect(isVioletSlopHue(b.accentOklch.h)).toBe(false);
    for (const l of BRAND_ARCHITECTURE_LAYERS) expect(isVioletSlopHue(l.accentOklch.h)).toBe(false);
  });

  it("2026-11-26 실측 저장소 스캔 요약이 3대 루트 합계와 정확히 일치한다", () => {
    expect(REPOSITORY_SCAN_SUMMARY.measuredAt).toBe("2026-11-26");
    expect(REPOSITORY_SCAN_SUMMARY.baselineCommitShort).toBe(BRAND_REGISTRY_BASELINE_COMMIT);
    expect(REPOSITORY_SCAN_ROOTS).toHaveLength(3);
    expect(REPOSITORY_SCAN_SUMMARY.totalScannedDirs).toBe(53 + 73 + 484);
    expect(REPOSITORY_SCAN_SUMMARY.totalScannedFiles).toBe(450 + 857 + 17140);
    expect(REPOSITORY_SCAN_SUMMARY.totalMatchedDirs).toBe(3 + 4 + 8);
    expect(REPOSITORY_SCAN_SUMMARY.totalMatchedFiles).toBe(10 + 50 + 252);
  });

  it("실측 전환 매트릭스의 실제 디렉터리 항목 전부가 저장소 디스크에 실존한다(허위 경로 0건)", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../../../..");
    const dirEntries = LEGACY_PATH_MIGRATION_ENTRIES.filter((e) => e.entryKind !== "file-cluster");
    expect(dirEntries.length).toBeGreaterThanOrEqual(10);
    for (const entry of dirEntries) {
      expect(existsSync(path.join(repoRoot, entry.legacyPath))).toBe(true);
    }
  });
});

describe("2. 실시간 브랜드 오염 감사기(auditProprietaryBrandNaming) 탐지 및 정본 대체안", () => {
  it("빈 문자열 및 공백 입력을 오류 없이 clean으로 처리한다", () => {
    const res = auditProprietaryBrandNaming("   ");
    expect(res.verdict).toBe("clean");
    expect(res.isBlocked).toBe(false);
    expect(res.findings).toHaveLength(0);
    expect(res.suggestedCanonicalName).toBe("");
  });

  it("고유 브랜드 정본 경로·심볼·UI 라벨을 clean으로 통과시키고 참조 브랜드를 식별한다", () => {
    const pathAudit = auditProprietaryBrandNaming("apps/web/src/domains/creator/atelier-solid-cad/StudioAtelierSolidSketchPanel.tsx");
    expect(pathAudit.verdict).toBe("clean");
    expect(pathAudit.referencedProprietaryBrandIds).toContain("atelier-solid");

    const labelAudit = auditProprietaryBrandNaming("ToonCore + PrismLight 120Hz 광학 파이프라인");
    expect(labelAudit.verdict).toBe("clean");
    expect(labelAudit.referencedProprietaryBrandIds).toEqual(expect.arrayContaining(["toon-core", "prism-light"]));
  });

  it("11대 외부 라이브러리·경쟁사 탐지 규칙 전부가 제품 경로·심볼·UI 라벨에서 즉시 차단된다", () => {
    expect(FORBIDDEN_EXTERNAL_TOKENS).toHaveLength(11);
    for (const token of FORBIDDEN_EXTERNAL_TOKENS) {
      const pathRes = auditProprietaryBrandNaming(`apps/web/src/domains/creator/${token}-engine/engine.ts`);
      expect(pathRes.verdict).toBe("blocked-external-brand");
      expect(pathRes.isBlocked).toBe(true);
      expect(pathRes.findings.some((f) => f.matchedToken === token)).toBe(true);

      const labelRes = auditProprietaryBrandNaming(`${token.toUpperCase()} 브러시 스튜디오`);
      expect(labelRes.verdict).toBe("blocked-external-brand");
    }
  });

  it("11대 차단 규칙 전부에 대해 자동 생성된 정본 대체안을 재감사하면 100% clean 통과한다", () => {
    for (const rule of EXTERNAL_NAME_DETECTION_RULES) {
      const token = rule.tokens[0];
      const probe = `apps/web/src/domains/creator/${token}-module/Studio${token[0].toUpperCase()}${token.slice(1)}Panel.tsx`;
      const first = auditProprietaryBrandNaming(probe);
      expect(first.findings.length).toBeGreaterThanOrEqual(1);
      expect(first.suggestedCanonicalName).not.toBe(probe);

      const recheck = auditProprietaryBrandNaming(first.suggestedCanonicalName);
      expect(recheck.verdict).toBe("clean");
      expect(recheck.findings).toHaveLength(0);
    }
  });

  it("PascalCase 심볼과 snake_case 크레이트명의 스타일을 유지하며 고유 브랜드로 치환한다", () => {
    const [r1, , , , , r6, , , , , r11] = FORBIDDEN_EXTERNAL_TOKENS;
    const pascal = auditProprietaryBrandNaming(`StudioBg3d${r11[0].toUpperCase()}${r11.slice(1)}ImportPanel`);
    expect(pascal.verdict).toBe("blocked-external-brand");
    expect(pascal.suggestedCanonicalName).toBe("StudioBg3dAtelierStageImportPanel");

    const snake = auditProprietaryBrandNaming(`studio_engine_${r1}`);
    expect(snake.verdict).toBe("blocked-external-brand");
    expect(snake.suggestedCanonicalName).toBe("studio_engine_spectrum_compute");

    const cad = auditProprietaryBrandNaming(`Studio${r6[0].toUpperCase()}${r6.slice(1)}CadPanel.tsx`);
    expect(cad.suggestedCanonicalName).toBe("StudioAtelierSolidCadPanel.tsx");
  });

  it("복수 외부·분산 표면 토큰이 섞인 경로에서 모든 findings를 검출하고 클린 대체안을 만든다", () => {
    const ext5 = FORBIDDEN_EXTERNAL_TOKENS[4];
    const multi = auditProprietaryBrandNaming(`apps/web/src/domains/creator/charlab-${ext5}-surpass`);
    expect(multi.verdict).toBe("blocked-external-brand");
    expect(multi.findings.map((f) => f.ruleId)).toEqual(expect.arrayContaining(["EXT-05", "CONSOL-01"]));
    const recheck = auditProprietaryBrandNaming(multi.suggestedCanonicalName);
    expect(recheck.verdict).toBe("clean");
  });

  it("부분 문자열 우연 일치를 오탐하지 않는다(AnalyticsPanel 등)", () => {
    expect(tokenizeNamingInput("AnalyticsPanel.tsx")).toEqual(["analytics", "panel", "tsx"]);
    const res = auditProprietaryBrandNaming("apps/web/src/domains/creator/analytics/AnalyticsPanel.tsx");
    expect(res.verdict).toBe("clean");
    expect(res.findings).toHaveLength(0);
  });

  it("HTTP 보안 헤더(Content-Security-Policy) 문맥은 경쟁 앱 약어로 오탐하지 않는다", () => {
    const ext5 = FORBIDDEN_EXTERNAL_TOKENS[4];
    const workerTest = auditProprietaryBrandNaming(`apps/web/src/domains/creator/studio-revision-compare-worker-${ext5}.test.ts`);
    expect(workerTest.verdict).toBe("clean");
    expect(workerTest.securityAcronymDisambiguated).toBe(true);
    expect(workerTest.findings).toHaveLength(0);
    expect(workerTest.advisoryNotesKo.length).toBeGreaterThanOrEqual(1);

    const headerLabel = auditProprietaryBrandNaming(`Content-Security-Policy (${ext5.toUpperCase()} header)`);
    expect(headerLabel.verdict).toBe("clean");
    expect(headerLabel.securityAcronymDisambiguated).toBe(true);
  });

  it("외부 제품명 없는 character-lab 분리 표면은 warn-consolidation-target으로 AtelierCast를 제안한다", () => {
    const res = auditProprietaryBrandNaming("apps/web/src/domains/creator/character-lab/CharacterLabRigPanel.tsx");
    expect(res.verdict).toBe("warn-consolidation-target");
    expect(res.isBlocked).toBe(false);
    expect(res.primaryRecommendedBrandId).toBe("atelier-cast");
    expect(res.suggestedCanonicalName).toBe("apps/web/src/domains/creator/atelier-cast/AtelierCastRigPanel.tsx");
    expect(auditProprietaryBrandNaming(res.suggestedCanonicalName).verdict).toBe("clean");
  });

  it("auditNamingBatch가 clean · allowed · warn · blocked 혼합 배치를 정확히 집계한다", () => {
    const batch = auditNamingBatch([
      "apps/web/src/domains/creator/atelier-solid-cad/index.ts",
      `/compare/studio?tool=${FORBIDDEN_EXTERNAL_TOKENS[6]}`,
      "apps/web/src/domains/creator/character-lab/index.ts",
      `apps/web/src/domains/creator/${FORBIDDEN_EXTERNAL_TOKENS[5]}-parametric-cad/index.ts`,
    ]);
    expect(batch.total).toBe(4);
    expect(batch.cleanCount).toBe(1);
    expect(batch.allowedExceptionCount).toBe(1);
    expect(batch.warnCount).toBe(1);
    expect(batch.blockedCount).toBe(1);
  });
});

describe("3. 정당한 외부 참조 예외 경계(allowed-external-reference) 정확 구분", () => {
  it("공식 /compare/studio 경로는 allowed-external-reference(official-compare-surface)로 허용된다", () => {
    const res = auditProprietaryBrandNaming(`/compare/studio?target=${FORBIDDEN_EXTERNAL_TOKENS[6]}`);
    expect(res.verdict).toBe("allowed-external-reference");
    expect(res.isAllowedException).toBe(true);
    expect(res.isBlocked).toBe(false);
    expect(res.exemptionReason).toBe("official-compare-surface");
    expect(res.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("domains/showcase 비교 페이지 및 명시 compare-surface 컨텍스트가 예외로 구분된다", () => {
    const showcase = auditProprietaryBrandNaming(`apps/web/src/domains/showcase/compare-${FORBIDDEN_EXTERNAL_TOKENS[7]}.ts`);
    expect(showcase.verdict).toBe("allowed-external-reference");
    expect(showcase.exemptionReason).toBe("official-compare-surface");

    const explicit = auditProprietaryBrandNaming(`${FORBIDDEN_EXTERNAL_TOKENS[4].toUpperCase()} vs ToonStudio 표`, { context: "compare-surface" });
    expect(explicit.verdict).toBe("allowed-external-reference");
    expect(explicit.exemptionReason).toBe("official-compare-surface");
  });

  it("Cargo.toml 및 Cargo.lock 외부 크레이트 의존성 선언이 crate-dependency-manifest 예외로 허용된다", () => {
    const manifest = auditProprietaryBrandNaming(`crates/studio-engine-${FORBIDDEN_EXTERNAL_TOKENS[0]}/Cargo.toml`);
    expect(manifest.verdict).toBe("allowed-external-reference");
    expect(manifest.exemptionReason).toBe("crate-dependency-manifest");

    const inlineDep = auditProprietaryBrandNaming(`Cargo.toml: ${FORBIDDEN_EXTERNAL_TOKENS[0]} = "0.4.1"`);
    expect(inlineDep.verdict).toBe("allowed-external-reference");
    expect(inlineDep.exemptionReason).toBe("crate-dependency-manifest");
  });

  it("crates/vendor/ 업스트림 포크 경로가 crate-dependency-manifest 격리 예외로 허용된다", () => {
    const vendor = auditProprietaryBrandNaming(`crates/vendor/${FORBIDDEN_EXTERNAL_TOKENS[0]}-hybrid/src/lib.rs`);
    expect(vendor.verdict).toBe("allowed-external-reference");
    expect(vendor.exemptionReason).toBe("crate-dependency-manifest");
    expect(vendor.isBlocked).toBe(false);
  });

  it("예외 경계 밖 자사 크레이트 소스 파일은 엄격히 blocked-external-brand로 차단된다", () => {
    const crateSrc = auditProprietaryBrandNaming(`crates/studio-engine-${FORBIDDEN_EXTERNAL_TOKENS[0]}/src/render.rs`);
    expect(crateSrc.verdict).toBe("blocked-external-brand");
    expect(crateSrc.isBlocked).toBe(true);
    expect(crateSrc.exemptionReason).toBeNull();
  });

  it("외부 포맷 코덱 파일은 기본 엄격 감사에서 차단하되 interop-codec 명시 컨텍스트 시 예외로 구분한다", () => {
    const codecPath = `packages/studio-format-gateway/src/${FORBIDDEN_EXTERNAL_TOKENS[6]}-brushset.ts`;
    expect(auditProprietaryBrandNaming(codecPath).verdict).toBe("blocked-external-brand");
    const scoped = auditProprietaryBrandNaming(codecPath, { context: "interop-codec" });
    expect(scoped.verdict).toBe("allowed-external-reference");
    expect(scoped.exemptionReason).toBe("format-interop-codec");
  });
});

describe("4. 4단계 무중단 전환 로드맵 · ADR Markdown · Registry JSON 내보내기", () => {
  it("MIGRATION_PHASES가 4단계 순서대로 정의되고 강제 이름변경 금지 안전 기준을 제공한다", () => {
    expect(MIGRATION_PHASES.map((p) => p.order)).toEqual([1, 2, 3, 4]);
    expect(MIGRATION_PHASES[0].safetyGuaranteeKo).toContain("이름 변경 없이");
    expect(ALLOWED_EXTERNAL_REFERENCE_SCOPES).toHaveLength(3);
  });

  it("filterMigrationEntries가 단계·브랜드·루트 조합 필터를 정확히 적용한다", () => {
    const all = filterMigrationEntries();
    expect(all).toHaveLength(LEGACY_PATH_MIGRATION_ENTRIES.length);

    const crateEntries = filterMigrationEntries({ rootId: "crates" });
    expect(crateEntries).toHaveLength(3);
    expect(crateEntries.every((e) => e.rootId === "crates")).toBe(true);

    const solidEntries = filterMigrationEntries({ brandId: "atelier-solid" });
    expect(solidEntries.length).toBeGreaterThanOrEqual(1);
    expect(solidEntries.every((e) => e.targetBrandId === "atelier-solid")).toBe(true);

    const phase3Spectrum = filterMigrationEntries({ phaseId: "phase-3-workspace-packages", brandId: "spectrum-compute" });
    expect(phase3Spectrum).toHaveLength(3);
  });

  it("exportBrandGovernanceMarkdown이 실측 일자, 10대 브랜드, 예외 경계, 감사 스냅샷을 포함한 ADR을 생성한다", () => {
    const sampleAudit = auditProprietaryBrandNaming(`apps/web/src/domains/creator/${FORBIDDEN_EXTERNAL_TOKENS[5]}-parametric-cad`);
    const md = exportBrandGovernanceMarkdown({ latestAudit: sampleAudit });
    expect(md).toContain(BRAND_REGISTRY_MEASURED_AT);
    expect(md).toContain(BRAND_REGISTRY_BASELINE_COMMIT);
    for (const brand of TOONSTUDIO_PROPRIETARY_BRANDS) {
      expect(md).toContain(`**${brand.formalName}**`);
    }
    expect(md).toContain("allowed-external-reference");
    expect(md).toContain("실시간 감사 스냅샷");
    expect(md).toContain(sampleAudit.suggestedCanonicalName);
  });

  it("exportBrandRegistryJson이 스키마 버전·실측 수치·10대 브랜드 정본을 유효한 JSON으로 직렬화한다", () => {
    const { payload, json } = exportBrandRegistryJson();
    expect(payload.schemaVersion).toBe(BRAND_REGISTRY_SCHEMA_VERSION);
    expect(payload.measuredAt).toBe("2026-11-26");
    expect(payload.proprietaryBrands).toHaveLength(10);
    const parsed = JSON.parse(json) as typeof payload;
    expect(parsed.scanSummary.totalScannedFiles).toBe(REPOSITORY_SCAN_SUMMARY.totalScannedFiles);
    expect(parsed.detectionRuleCount).toBe(EXTERNAL_NAME_DETECTION_RULES.length);
  });

  it("BRAND_AUDIT_SAMPLE_PROBES 4종 전부가 선언된 expectedVerdict와 일치한다", () => {
    expect(BRAND_AUDIT_SAMPLE_PROBES).toHaveLength(4);
    for (const probe of BRAND_AUDIT_SAMPLE_PROBES) {
      const res = auditProprietaryBrandNaming(probe.query, { context: probe.context });
      expect(res.verdict).toBe(probe.expectedVerdict);
    }
  });
});

describe("5. StudioAtelierBrandRegistryPanel UI · 인터랙션 · 콜백 검증", () => {
  it("props 없이 렌더 시 10대 고유 브랜드 카드, 5계층 SVG, 3대 스캔 루트, 전환 매트릭스가 모두 표시된다", () => {
    render(<StudioAtelierBrandRegistryPanel />);
    expect(screen.getByTestId("atelier-brand-registry-panel")).toBeTruthy();
    expect(screen.getByTestId("brand-architecture-svg")).toBeTruthy();
    for (const brand of TOONSTUDIO_PROPRIETARY_BRANDS) {
      expect(screen.getByTestId(`brand-card-${brand.id}`)).toBeTruthy();
    }
    for (const root of REPOSITORY_SCAN_ROOTS) {
      expect(screen.getByTestId(`scan-root-card-${root.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("migration-entries-list").querySelectorAll("li").length).toBe(LEGACY_PATH_MIGRATION_ENTRIES.length);
  });

  it("실시간 입력창에 레거시 경로를 입력하면 즉시 차단 판정·findings·대체안이 나타나고 onAuditChange가 호출된다", () => {
    const onAuditChange = vi.fn();
    render(<StudioAtelierBrandRegistryPanel onAuditChange={onAuditChange} />);
    const input = screen.getByTestId("brand-audit-input");
    fireEvent.change(input, { target: { value: `apps/web/src/domains/creator/${FORBIDDEN_EXTERNAL_TOKENS[5]}-parametric-cad/engine.ts` } });

    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("blocked-external-brand");
    expect(screen.getByTestId("brand-audit-findings-list")).toBeTruthy();
    expect(screen.getByTestId("brand-suggested-canonical").textContent).toContain("atelier-solid");
    expect(onAuditChange).toHaveBeenCalledTimes(1);
    expect(onAuditChange.mock.calls[0][0].verdict).toBe("blocked-external-brand");
  });

  it("정본 대체안 적용 버튼 클릭 시 입력창이 고유 경로로 교체되고 판정이 즉시 clean으로 전환된다", () => {
    render(<StudioAtelierBrandRegistryPanel initialQuery={`apps/web/src/domains/creator/${FORBIDDEN_EXTERNAL_TOKENS[0]}-render/panel.tsx`} />);
    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("blocked-external-brand");

    fireEvent.click(screen.getByTestId("apply-canonical-suggestion-btn"));
    expect((screen.getByTestId("brand-audit-input") as HTMLInputElement).value).toContain("spectrum-compute");
    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("clean");
  });

  it("빠른 시험 프로브 버튼 4종 클릭 시 통과·차단·/compare/studio·Cargo.toml 예외 판정이 즉시 갱신된다", () => {
    render(<StudioAtelierBrandRegistryPanel />);
    for (const probe of BRAND_AUDIT_SAMPLE_PROBES) {
      fireEvent.click(screen.getByTestId(`audit-probe-${probe.id}`));
      expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe(probe.expectedVerdict);
    }
  });

  it("문맥 버튼 전환으로 동일 입력에 대한 /compare/studio 및 Cargo.toml 예외 분류를 즉시 검증한다", () => {
    render(<StudioAtelierBrandRegistryPanel initialQuery={`${FORBIDDEN_EXTERNAL_TOKENS[0]} 렌더 엔진`} />);
    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("blocked-external-brand");

    fireEvent.click(screen.getByTestId("audit-context-compare-surface"));
    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("allowed-external-reference");

    fireEvent.click(screen.getByTestId("audit-context-crate-dependency"));
    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("allowed-external-reference");
  });

  it("브랜드 카드 클릭 시 SVG 강조 대상과 전환 매트릭스가 연동되고 필터 해제로 전체 복귀한다", () => {
    render(<StudioAtelierBrandRegistryPanel />);
    fireEvent.click(screen.getByTestId("brand-card-atelier-solid"));
    expect(screen.getByTestId("brand-architecture-svg").getAttribute("data-active-brand-id")).toBe("atelier-solid");
    expect(screen.getByTestId("migration-entries-list").querySelectorAll("li").length).toBe(1);

    fireEvent.click(screen.getByTestId("brand-clear-filter-btn"));
    expect(screen.getByTestId("migration-entries-list").querySelectorAll("li").length).toBe(LEGACY_PATH_MIGRATION_ENTRIES.length);
  });

  it("단계 필터, ADR 마크다운·JSON 복사 및 미리보기 탭 전환과 onExportJson 콜백이 정상 동작한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onExportJson = vi.fn();

    render(<StudioAtelierBrandRegistryPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("phase-filter-phase-4-rust-crates-alias"));
    expect(screen.getByTestId("migration-entries-list").querySelectorAll("li").length).toBe(3);

    fireEvent.click(screen.getByTestId("brand-copy-md-btn"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("brand-export-preview").textContent).toContain("# ADR: ToonStudio 10대 고유 브랜드");

    fireEvent.click(screen.getByTestId("brand-copy-json-btn"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("brand-export-preview").textContent).toContain(BRAND_REGISTRY_SCHEMA_VERSION);
  });

  it("영문 로케일(locale='en'), className 및 초기화 버튼이 올바르게 동작한다", () => {
    render(<StudioAtelierBrandRegistryPanel locale="en" initialQuery="ToonCore Kernel" className="custom-atelier-host" />);
    const panel = screen.getByTestId("atelier-brand-registry-panel");
    expect(panel.className).toContain("custom-atelier-host");
    expect(panel.textContent).toContain("ToonStudio Proprietary Brand Registry");

    fireEvent.click(screen.getByTestId("audit-probe-probe-blocked"));
    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("blocked-external-brand");

    fireEvent.click(screen.getByTestId("brand-reset-btn"));
    expect((screen.getByTestId("brand-audit-input") as HTMLInputElement).value).toBe("ToonCore Kernel");
    expect(screen.getByTestId("brand-audit-verdict-banner").getAttribute("data-verdict")).toBe("clean");
  });
});

describe("6. 엄격 품질·하네스 계약 및 100% 고유 브랜드 네이밍 자가 검증", () => {
  it("소유 파일 4종 존재 및 줄 수 상한(engine<=720, panel<=680, all<=800)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "atelier-brand-registry-engine.ts",
      "StudioAtelierBrandRegistryPanel.tsx",
      "index.ts",
      "atelier-brand-registry.test.tsx",
    ];
    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of required) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "atelier-brand-registry-engine.ts") expect(lines).toBeLessThanOrEqual(720);
      if (file === "StudioAtelierBrandRegistryPanel.tsx") expect(lines).toBeLessThanOrEqual(680);
    }
  });

  it("금지 패턴 0건 및 Calm Atelier 필수 접근성·타이포그래피 클래스를 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const prodFiles = ["atelier-brand-registry-engine.ts", "StudioAtelierBrandRegistryPanel.tsx", "index.ts"];
    for (const file of prodFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(/\blocalStorage\b/u);
      expect(src).not.toMatch(/\bsessionStorage\b/u);
      expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b\d+n\b/u);
      expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain("가능하게 합니다");
      expect(src).not.toContain("직관적인 경험을 제공");
      expect(src).not.toContain("원활한 워크플로우를 보장");
    }

    const panelSrc = readFileSync(path.join(dir, "StudioAtelierBrandRegistryPanel.tsx"), "utf8");
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).not.toContain("Sparkles");
    expect(panelSrc).not.toMatch(/Props\s*=\s*\{\}/u);
    expect(panelSrc).not.toMatch(/\)\s*=\s*\{\}/u);
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });

  it("디렉터리·파일·UI·배럴·심볼에 외부 제품명 혼입이 0건이고 모든 버튼(min-h-11)과 SVG(0% 바이올렛)가 안전하다", () => {
    const dir = path.resolve(import.meta.dirname);
    const dirName = path.basename(dir);
    expect(auditProprietaryBrandNaming(dirName).verdict).toBe("clean");

    for (const file of readdirSync(dir)) {
      expect(auditProprietaryBrandNaming(file).verdict).toBe("clean");
    }

    const forbiddenWordRe = new RegExp(`\\b(?:${FORBIDDEN_EXTERNAL_TOKENS.join("|")})\\b`, "iu");
    for (const cleanFile of ["StudioAtelierBrandRegistryPanel.tsx", "index.ts"]) {
      const src = readFileSync(path.join(dir, cleanFile), "utf8");
      expect(src).not.toMatch(forbiddenWordRe);
    }

    // 엔진의 모든 export 심볼명 자체도 100% 고유 네이밍이어야 한다.
    const engineSrc = readFileSync(path.join(dir, "atelier-brand-registry-engine.ts"), "utf8");
    for (const m of engineSrc.matchAll(/export\s+(?:const|function|type|interface)\s+([A-Za-z0-9_]+)/gu)) {
      expect(auditProprietaryBrandNaming(m[1]).verdict).toBe("clean");
    }

    const { container } = render(<StudioAtelierBrandRegistryPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(20);
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
