// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import type { ArtistStyleDnaProfile } from "../auto-style-dna-pipeline/auto-style-dna-library";
import { importCustomBrushFromTsBrushJson } from "../brush-custom-lab/brush-custom-lab-engine";
import { validateGeneratedWgsl } from "../nocode-shader-grid/nocode-wgsl-shader-builder";

import {
  DEFAULT_STUDIO_EXISTING_PRESETS,
  PACK_TEMPLATE_IDS,
  ROYALTY_TOTAL_BPS,
  StudioStyleShaderPackExchangePanel,
  TSBRUSH_COMPAT_FORMAT_ID,
  TSPACK_FORMAT_ID,
  TSPACK_SCHEMA_VERSION,
  TeamStylePackRegistry,
  buildTeamStylePackTemplateInputs,
  computeSha256Hex,
  createSignedTeamStylePack,
  diffTeamStylePacks,
  getBuiltInTeamStylePack,
  getBuiltInTeamStylePacks,
  parseTeamStylePackJson,
  planTeamStylePackImport,
  serializeCanonicalJson,
  serializeTeamStylePackJson,
  simulateTeamStylePackTamper,
  validatePackWgslSource,
  verifyTeamStylePackIntegrity,
  type SignedTeamStylePack,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  useI18n.setState({ lang: "ko" });
});

describe("Team Style & WGSL Shader Pack Engine — SHA-256 · 변조 탐지 · 델타 비교 · 충돌 안전 불러오기", () => {
  it("순수 TypeScript FIPS 180-4 SHA-256이 Node crypto SHA-256과 비트 단위로 일치하고 정규화 JSON이 키 순서에 독립적이다", () => {
    const samples = [
      "",
      "abc",
      "로맨스 판타지 수채 셀 팩 · ToonStudio .tspack.json",
      "a".repeat(256),
      JSON.stringify({ z: 1, a: [true, -0, 3.14159265] }),
    ];
    for (const sample of samples) {
      const expected = createHash("sha256").update(sample, "utf8").digest("hex");
      expect(computeSha256Hex(sample)).toBe(expected);
    }

    const canonA = serializeCanonicalJson({ b: 2, a: { d: -0, c: 0.842 }, extra: undefined });
    const canonB = serializeCanonicalJson({ a: { c: 0.842, d: 0 }, b: 2 });
    expect(canonA).toBe(canonB);
    expect(computeSha256Hex(canonA)).toBe(computeSha256Hex(canonB));
  });

  it("3종 사전 구축 스튜디오 팀 팩이 외부 네트워크 호출 0건으로 서명·무결성·WGSL·권리 BOM(10,000 bps)을 통과한다", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const packs = getBuiltInTeamStylePacks();

    expect(PACK_TEMPLATE_IDS).toHaveLength(3);
    for (const id of PACK_TEMPLATE_IDS) {
      const pack = packs[id];
      expect(pack.format).toBe(TSPACK_FORMAT_ID);
      expect(pack.schemaVersion).toBe(TSPACK_SCHEMA_VERSION);
      expect(pack.manifest.packSealSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(pack.brushes.length).toBeGreaterThanOrEqual(2);
      expect(pack.shaders.length).toBeGreaterThanOrEqual(2);

      for (const brush of pack.brushes) {
        expect(brush.format).toBe(TSBRUSH_COMPAT_FORMAT_ID);
        expect(brush.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/u);
      }
      for (const shader of pack.shaders) {
        expect(shader.validation.valid).toBe(true);
        expect(shader.wgslSha256).toBe(computeSha256Hex(shader.wgslSource));
      }

      const report = verifyTeamStylePackIntegrity(pack);
      expect(report.valid).toBe(true);
      expect(report.mismatchedSections).toEqual([]);
      expect(report.manifestRootMatched).toBe(true);
      expect(report.packSealMatched).toBe(true);
      expect(report.rightsTotalBps).toBe(ROYALTY_TOTAL_BPS);
      expect(report.brushDigestMismatches).toEqual([]);
      expect(report.shaderDigestMismatches).toEqual([]);
      expect(report.shaderValidationErrors).toEqual([]);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("팔레트·브러시·WGSL 코드·라이선스·메타데이터의 1비트 변조 시 정확한 불일치 섹션과 하위 자산 진단을 반환한다", () => {
    const clean = getBuiltInTeamStylePack("romance-fantasy-watercolor-cel");

    // 1) 팔레트 1비트 수준 변조 -> styleDna 불일치
    const tamperedPalette = simulateTeamStylePackTamper(clean, "palette");
    const paletteReport = verifyTeamStylePackIntegrity(tamperedPalette);
    expect(paletteReport.valid).toBe(false);
    expect(paletteReport.mismatchedSections).toEqual(["styleDna"]);
    expect(paletteReport.manifestRootMatched).toBe(false);
    expect(paletteReport.packSealMatched).toBe(false);

    // 2) 브러시 1비트 변조 (XOR 1 on RGB channel) -> brushes 불일치 + 브러시 ID 특정
    const tamperedBrush = simulateTeamStylePackTamper(clean, "brush");
    const brushReport = verifyTeamStylePackIntegrity(tamperedBrush);
    expect(brushReport.valid).toBe(false);
    expect(brushReport.mismatchedSections).toEqual(["brushes"]);
    expect(brushReport.brushDigestMismatches).toHaveLength(1);
    expect(brushReport.brushDigestMismatches[0]?.id).toBe(clean.brushes[0]?.recipe.id);

    // 3) WGSL 1문자 변조 -> shaders 불일치 + 셰이더 ID 특정
    const tamperedWgsl = simulateTeamStylePackTamper(clean, "wgsl");
    const wgslReport = verifyTeamStylePackIntegrity(tamperedWgsl);
    expect(wgslReport.valid).toBe(false);
    expect(wgslReport.mismatchedSections).toEqual(["shaders"]);
    expect(wgslReport.shaderDigestMismatches).toHaveLength(1);
    expect(wgslReport.shaderDigestMismatches[0]?.id).toBe(clean.shaders[0]?.id);

    // 4) 라이선스/로열티 1 bps 변조 -> rightsBom 불일치 + 9,999 bps 진단
    const tamperedLicense = simulateTeamStylePackTamper(clean, "license");
    const licenseReport = verifyTeamStylePackIntegrity(tamperedLicense);
    expect(licenseReport.valid).toBe(false);
    expect(licenseReport.mismatchedSections).toEqual(["rightsBom"]);
    expect(licenseReport.rightsTotalBps).toBe(ROYALTY_TOTAL_BPS - 1);
    expect(licenseReport.rightsIssues.length).toBeGreaterThan(0);

    // 5) 메타데이터 변조 -> metadata 불일치
    const tamperedMeta: SignedTeamStylePack = {
      ...clean,
      metadata: { ...clean.metadata, version: "2.4.1" },
    };
    const metaReport = verifyTeamStylePackIntegrity(tamperedMeta);
    expect(metaReport.valid).toBe(false);
    expect(metaReport.mismatchedSections).toEqual(["metadata"]);
  });

  it("잘못된 로열티 합계(≠10,000 bps) 또는 문법 오류가 있는 WGSL 소스로 신규 서명 팩 생성을 차단한다", () => {
    const baseInput = buildTeamStylePackTemplateInputs(computeSha256Hex)["romance-fantasy-watercolor-cel"];

    expect(() =>
      createSignedTeamStylePack({
        ...baseInput,
        rightsBom: {
          ...baseInput.rightsBom,
          royaltySplits: [
            { handle: "@solo", displayName: "단독", role: "lead-artist", shareBps: 9000 },
          ],
        },
      }),
    ).toThrow(/Rights BOM validation failed/u);

    expect(() =>
      createSignedTeamStylePack({
        ...baseInput,
        shaders: [
          {
            ...baseInput.shaders[0]!,
            wgslSource: "fn broken( { return NaN; }",
          },
        ],
      }),
    ).toThrow(/Invalid WGSL shader/u);

    const invalidCheck = validatePackWgslSource("@compute fn bad() {}", "compute");
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.errors.length).toBeGreaterThan(0);
  });

  it("diffTeamStylePacks가 동일 팩, 버전 수정 팩, 이종 장르 팩의 DNA·브러시·셰이더·BOM 델타를 정확히 계산한다", () => {
    const rofan = getBuiltInTeamStylePack("romance-fantasy-watercolor-cel");
    const noir = getBuiltInTeamStylePack("action-noir-ink");

    const sameDiff = diffTeamStylePacks(rofan, rofan);
    expect(sameDiff.identical).toBe(true);
    expect(sameDiff.changedSections).toEqual([]);
    expect(sameDiff.styleDna.paletteMeanDeltaE).toBe(0);

    const crossDiff = diffTeamStylePacks(rofan, noir);
    expect(crossDiff.identical).toBe(false);
    expect(crossDiff.changedSections).toEqual(["metadata", "styleDna", "brushes", "shaders", "rightsBom"]);
    expect(crossDiff.styleDna.lineMeanPxDelta).toBeGreaterThan(1);
    expect(crossDiff.styleDna.shadowKelvinDelta).toBeGreaterThan(3000);
    expect(crossDiff.styleDna.paletteMeanDeltaE).toBeGreaterThan(20);
    expect(crossDiff.brushes.addedIds).toHaveLength(2);
    expect(crossDiff.brushes.removedIds).toHaveLength(2);
    expect(crossDiff.shaders.addedIds).toHaveLength(2);
    expect(crossDiff.rightsBom.licenseTierChanged).toBe(true);

    // 단일 브러시·셰이더 파라미터 수정 시 modified 필드 목록을 정확히 추출
    const baseInput = buildTeamStylePackTemplateInputs(computeSha256Hex)["romance-fantasy-watercolor-cel"];
    const updatedRofan = createSignedTeamStylePack({
      ...baseInput,
      metadata: { ...baseInput.metadata, version: "2.5.0" },
      brushes: baseInput.brushes.map((b, idx) => (idx === 0 ? { ...b, radiusPx: 11 } : b)),
      shaders: baseInput.shaders.map((s, idx) =>
        idx === 0 ? { ...s, uniforms: { ...s.uniforms, rimStrength: 0.9 } } : s,
      ),
    });
    const patchDiff = diffTeamStylePacks(rofan, updatedRofan);
    expect(patchDiff.brushes.modified).toHaveLength(1);
    expect(patchDiff.brushes.modified[0]?.changedFields).toEqual(["radiusPx"]);
    expect(patchDiff.shaders.modified).toHaveLength(1);
    expect(patchDiff.shaders.modified[0]?.uniformFieldsChanged).toEqual(["rimStrength"]);
    expect(patchDiff.shaders.modified[0]?.wgslChanged).toBe(false);
  });

  it("planTeamStylePackImport가 ID 충돌 전략(keep-local/overwrite/fork-versioned)과 Rights BOM 상업 라이선스 호환성을 정확히 판정한다", () => {
    const rofan = getBuiltInTeamStylePack("romance-fantasy-watercolor-cel");
    const atelierEditorial = getBuiltInTeamStylePack("slice-of-life-pastel-atelier");

    // 1) 충돌 해결 전략 3종 (상업 연재 + 상업 팀 팩)
    const forkPlan = planTeamStylePackImport(rofan, {
      existingPresets: DEFAULT_STUDIO_EXISTING_PRESETS,
      conflictStrategy: "fork-versioned",
      targetUsageMode: "commercial-publication",
    });
    expect(forkPlan.canApply).toBe(true);
    expect(forkPlan.counts.collisions).toBe(3); // series-rofan-chateau + brush-rofan-gpen-silk + shader-rofan-watercolor-rim
    expect(forkPlan.counts.forkVersioned).toBe(3);
    expect(forkPlan.counts.installNew).toBe(2);
    const forkedBrush = forkPlan.items.find((i) => i.sourceId === "brush-rofan-gpen-silk");
    expect(forkedBrush?.action).toBe("fork-versioned");
    expect(forkedBrush?.resolvedId).toContain("brush-rofan-gpen-silk--v2.4.0-");

    const keepPlan = planTeamStylePackImport(rofan, {
      existingPresets: DEFAULT_STUDIO_EXISTING_PRESETS,
      conflictStrategy: "keep-local",
      targetUsageMode: "commercial-publication",
    });
    expect(keepPlan.counts.keepLocal).toBe(3);
    expect(keepPlan.counts.installNew).toBe(2);

    const overwritePlan = planTeamStylePackImport(rofan, {
      existingPresets: DEFAULT_STUDIO_EXISTING_PRESETS,
      conflictStrategy: "overwrite",
      targetUsageMode: "commercial-publication",
    });
    expect(overwritePlan.counts.overwrite).toBe(3);
    expect(overwritePlan.warnings.some((w) => w.includes("덮어쓰기"))).toBe(true);

    // 2) 비상업 에디토리얼 팩을 상업 연재에 불러오기 시도 -> Rights BOM 차단
    const blockedCommercial = planTeamStylePackImport(atelierEditorial, {
      existingPresets: DEFAULT_STUDIO_EXISTING_PRESETS,
      conflictStrategy: "fork-versioned",
      targetUsageMode: "commercial-publication",
    });
    expect(blockedCommercial.canApply).toBe(false);
    expect(blockedCommercial.rightsCompatibility.compatible).toBe(false);
    expect(blockedCommercial.blockingIssues.map((i) => i.code)).toContain("COMMERCIAL_LICENSE_INCOMPATIBLE");
    expect(blockedCommercial.blockingIssues.map((i) => i.code)).toContain("THIRD_PARTY_PROVENANCE_UNCLEARED");

    // 3) 같은 비상업 에디토리얼 팩을 비상업·편집 모드로 불러오면 통과
    const allowedEditorial = planTeamStylePackImport(atelierEditorial, {
      existingPresets: DEFAULT_STUDIO_EXISTING_PRESETS,
      conflictStrategy: "fork-versioned",
      targetUsageMode: "editorial-noncommercial",
    });
    expect(allowedEditorial.canApply).toBe(true);
    expect(allowedEditorial.rightsCompatibility.compatible).toBe(true);

    // 4) 변조된 팩은 어떤 전략/모드에서도 차단
    const tampered = simulateTeamStylePackTamper(rofan, "wgsl");
    const blockedTamper = planTeamStylePackImport(tampered, {
      existingPresets: DEFAULT_STUDIO_EXISTING_PRESETS,
      conflictStrategy: "fork-versioned",
      targetUsageMode: "internal-review",
    });
    expect(blockedTamper.canApply).toBe(false);
    expect(blockedTamper.blockingIssues.map((i) => i.code)).toContain("INTEGRITY_FAILED");
  });

  it(".tspack.json 직렬화/파싱 왕복과 TeamStylePackRegistry 인메모리 등록·거부를 검증한다", () => {
    const noir = getBuiltInTeamStylePack("action-noir-ink");
    const exported = serializeTeamStylePackJson(noir);
    expect(exported.fileName).toBe("action-noir-ink-v3.1.0.tspack.json");
    expect(exported.byteLength).toBeGreaterThan(1000);

    const parsed = parseTeamStylePackJson(exported.json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.integrity.valid).toBe(true);
      expect(parsed.pack.manifest.packSealSha256).toBe(noir.manifest.packSealSha256);
    }

    expect(parseTeamStylePackJson("{broken").ok).toBe(false);
    expect(parseTeamStylePackJson(JSON.stringify({ format: "other" })).ok).toBe(false);

    const registry = new TeamStylePackRegistry();
    expect(registry.size).toBe(0);
    registry.register(noir);
    expect(registry.size).toBe(1);
    expect(registry.has(noir.metadata.packId)).toBe(true);
    expect(registry.toExistingPresetIndex().shaderIds).toContain("shader-noir-halftone-compute");

    expect(() => registry.register(simulateTeamStylePackTamper(noir, "brush"))).toThrow(
      /Refusing to register invalid team style pack/u,
    );
  });

  it("auto-style-dna-pipeline · brush-custom-lab(.tsbrush.json) · nocode-shader-grid(WGSL)와 스키마 및 해시가 100% 상호 호환된다", () => {
    const packs = getBuiltInTeamStylePacks();
    for (const id of PACK_TEMPLATE_IDS) {
      const pack = packs[id];
      const dnaProfile: ArtistStyleDnaProfile = pack.styleDna;
      expect(dnaProfile.seriesId).toBe(pack.styleDna.seriesId);
      expect(dnaProfile.dominantPalette.length).toBeGreaterThanOrEqual(5);

      for (const brushEntry of pack.brushes) {
        const imported = importCustomBrushFromTsBrushJson(JSON.stringify(brushEntry));
        expect(imported.ok, `${id}/${brushEntry.recipe.id} .tsbrush.json 호환`).toBe(true);
        if (imported.ok) {
          expect(imported.fingerprintSha256).toBe(brushEntry.fingerprintSha256);
        }
      }

      for (const shader of pack.shaders) {
        const externalCheck = validateGeneratedWgsl(shader.wgslSource, shader.stage);
        expect(externalCheck.valid, `${id}/${shader.id} WGSL 호환`).toBe(true);
      }
    }
  });
});

describe("StudioStyleShaderPackExchangePanel — props 없는 단독 렌더 · 상호작용 · Calm Atelier 위생 계약", () => {
  it("props 없이 단독 렌더되며 템플릿 전환·1비트 변조 시뮬레이션·델타 비교·충돌 전략·JSON 복사/내보내기·KO/EN 전환이 동작한다", () => {
    const { rerender } = render(<StudioStyleShaderPackExchangePanel />);

    const root = document.querySelector<HTMLElement>('[data-style-shader-pack-exchange="true"]');
    expect(root).toBeTruthy();
    expect(root?.getAttribute("data-pack-integrity-valid")).toBe("true");
    expect(root?.getAttribute("data-pack-seal-sha256")).toMatch(/^[0-9a-f]{64}$/u);
    expect(screen.getByTestId("integrity-status-banner").getAttribute("role")).toBe("status");

    // 1) WGSL 1비트 변조 시뮬레이션 -> shaders 섹션 불일치 & 적용 버튼 비활성화
    fireEvent.click(screen.getByTestId("tamper-btn-wgsl"));
    expect(root?.getAttribute("data-pack-integrity-valid")).toBe("false");
    expect(screen.getByTestId("integrity-status-banner").getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("section-diag-shaders").getAttribute("data-section-matched")).toBe("false");
    expect((screen.getByTestId("apply-import-btn") as HTMLButtonElement).disabled).toBe(true);

    // 2) 원본 봉인 복원 -> 통과 및 적용 버튼 활성화
    fireEvent.click(screen.getByTestId("tamper-reset-btn"));
    expect(root?.getAttribute("data-pack-integrity-valid")).toBe("true");
    expect(screen.getByTestId("section-diag-shaders").getAttribute("data-section-matched")).toBe("true");
    expect((screen.getByTestId("apply-import-btn") as HTMLButtonElement).disabled).toBe(false);

    // 3) 비상업 에디토리얼 팩으로 전환 -> 상업 연재 모드에서 Rights BOM 차단 -> 비상업·편집 모드에서 허용
    fireEvent.click(screen.getByTestId("pack-template-slice-of-life-pastel-atelier"));
    expect(root?.getAttribute("data-pack-id")).toBe("pack-slice-of-life-pastel-atelier");
    expect((screen.getByTestId("apply-import-btn") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("usage-btn-editorial-noncommercial"));
    expect((screen.getByTestId("apply-import-btn") as HTMLButtonElement).disabled).toBe(false);

    // 4) 충돌 해결 전략 전환 및 불러오기 적용
    fireEvent.click(screen.getByTestId("strategy-btn-keep-local"));
    expect(screen.getByTestId("strategy-btn-keep-local").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("apply-import-btn"));
    expect(screen.getByTestId("registered-pack-count").textContent).toContain("1");

    // 5) 팩 비교 대상 전환 -> 델타 요약 갱신
    fireEvent.change(screen.getByTestId("diff-compare-select"), {
      target: { value: "romance-fantasy-watercolor-cel" },
    });
    expect(screen.getByTestId("pack-diff-summary").textContent).toContain("ΔE");

    // 6) JSON 복사 · 내보내기 · 변조 JSON 입력 검증
    fireEvent.click(screen.getByTestId("copy-json-btn"));
    expect(screen.getByTestId("pack-io-notice").getAttribute("role")).toBe("status");
    fireEvent.click(screen.getByTestId("export-pack-btn"));
    const textarea = screen.getByTestId("tspack-json-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain(TSPACK_FORMAT_ID);

    const mutatedText = textarea.value.replace('"version": "1.8.0"', '"version": "1.8.9"');
    fireEvent.change(textarea, { target: { value: mutatedText } });
    fireEvent.click(screen.getByTestId("verify-json-btn"));
    expect(screen.getByTestId("pack-io-notice").getAttribute("role")).toBe("alert");

    // 7) 영문 로케일 전환 검증
    useI18n.setState({ lang: "en" });
    rerender(<StudioStyleShaderPackExchangePanel />);
    expect(screen.getByRole("region", { name: "Team Style & WGSL Shader Pack Exchange" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export .tspack.json" })).toBeTruthy();
  });

  it("Calm Atelier 토큰·0 원시색상·transition-all/Sparkles 금지·KV 금지·store 필드 금지·800줄 이하 계약을 충족한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/style-shader-pack-exchange");
    const files = [
      "types.ts",
      "pack-crypto.ts",
      "pack-templates.ts",
      "style-shader-pack-engine.ts",
      "StudioStyleShaderPackExchangePanel.tsx",
      "index.ts",
      "style-shader-pack-exchange.test.tsx",
    ] as const;

    for (const file of files) {
      const src = readFileSync(resolve(dir, file), "utf8");
      expect(src.split("\n").length, `${file} <= 800줄`).toBeLessThanOrEqual(800);
      if (file !== "style-shader-pack-exchange.test.tsx") {
        expect(src, `${file} Web Storage 금지`).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
        expect(src, `${file} private Map store 필드 금지`).not.toMatch(/private\s+(?:readonly\s+)?store\b/u);
        expect(src.match(/#[0-9a-fA-F]{3,8}\b/gu), `${file} 원시 hex 금지`).toBeNull();
        expect(src.match(/\brgba?\s*\(/gu), `${file} 원시 rgb/rgba 금지`).toBeNull();
        expect(src.match(/\bhsla?\s*\(/gu), `${file} 원시 hsl/hsla 금지`).toBeNull();
      }
    }

    const panelSrc = readFileSync(resolve(dir, "StudioStyleShaderPackExchangePanel.tsx"), "utf8");
    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).not.toMatch(/<Sparkles\b/u);
    expect(panelSrc).not.toMatch(/\bfont-black\b|text-\[(?:9px|10px|11px|0\.6rem|0\.625rem)\]/u);
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
  });
});
