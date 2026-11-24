/**
 * 팀 화풍 · 커스텀 브러시 · 노코드 WGSL 셰이더 팩(`.tspack.json`) 델타 비교 ·
 * 충돌 안전 불러오기 플래너 · 변조 시뮬레이션 · 직렬화 · 인메모리 레지스트리 엔진.
 *
 * - 외부 네트워크 호출(0바이트) 및 브라우저 Web Storage를 일절 사용하지 않는다.
 */

import {
  auditRightsBom,
  buildSignedPackBrushEntry,
  buildSignedWgslShaderRecipe,
  canonicalizeJsonValue,
  computePackBrushFingerprintSha256,
  computeSectionDigests,
  computeSha256Hex,
  createSignedTeamStylePack,
  isPlainRecord,
  serializeCanonicalJson,
  validatePackWgslSource,
  verifyTeamStylePackIntegrity,
} from "./pack-crypto";
import {
  DEFAULT_STUDIO_EXISTING_PRESETS,
  TEAM_STYLE_PACK_TEMPLATE_META,
  buildTeamStylePackTemplateInputs,
} from "./pack-templates";
import {
  MAX_TSPACK_JSON_BYTES,
  PACK_SECTION_KEYS,
  ROYALTY_TOTAL_BPS,
  TSPACK_FORMAT_ID,
  TSPACK_SCHEMA_VERSION,
  type ExistingStudioPresetIndex,
  type ImportBlockingIssue,
  type ImportPlannedActionKind,
  type ImportPlannedItem,
  type OklchPaletteSwatch,
  type PackRightsBom,
  type PaletteRoleDiffEntry,
  type PaletteSwatchRole,
  type RightsCompatibilityAssessment,
  type SignedTeamStylePack,
  type TamperSimulationTarget,
  type TeamStylePackDiff,
  type TeamStylePackImportOptions,
  type TeamStylePackImportPlan,
  type TeamStylePackIntegrityReport,
  type TeamStylePackTemplateId,
  type TsPackParseResult,
} from "./types";

const PALETTE_ROLES: readonly PaletteSwatchRole[] = ["base", "midtone", "shadow", "highlight", "accent"];
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

// ============================================================================
// 1. 팩 델타 비교 (`diffTeamStylePacks`)
// ============================================================================

function oklchDeltaE100(a: OklchPaletteSwatch | undefined, b: OklchPaletteSwatch | undefined): number {
  if (!a || !b) return 100;
  const radA = (a.H * Math.PI) / 180;
  const radB = (b.H * Math.PI) / 180;
  const dL = a.L - b.L;
  const dA = a.C * Math.cos(radA) - b.C * Math.cos(radB);
  const dB = a.C * Math.sin(radA) - b.C * Math.sin(radB);
  return round3(Math.sqrt(dL * dL + dA * dA + dB * dB) * 100);
}

function diffFlatRecordFields(
  baseObj: Record<string, unknown>,
  targetObj: Record<string, unknown>,
): readonly string[] {
  const keys = new Set([...Object.keys(baseObj), ...Object.keys(targetObj)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (serializeCanonicalJson(baseObj[key]) !== serializeCanonicalJson(targetObj[key])) {
      changed.push(key);
    }
  }
  return Object.freeze(changed.sort());
}

/** 두 서명된 팀 팩의 Style DNA · 브러시 · WGSL 셰이더 · Rights BOM 차이를 정밀 산출한다. */
export function diffTeamStylePacks(
  basePack: SignedTeamStylePack,
  targetPack: SignedTeamStylePack,
): TeamStylePackDiff {
  const baseDigests = computeSectionDigests(basePack);
  const targetDigests = computeSectionDigests(targetPack);
  const changedSections = PACK_SECTION_KEYS.filter((k) => baseDigests[k] !== targetDigests[k]);
  const identical =
    basePack.manifest.packSealSha256 === targetPack.manifest.packSealSha256 && changedSections.length === 0;

  const paletteRoleDiffs: PaletteRoleDiffEntry[] = PALETTE_ROLES.map((role) => {
    const bSwatch = basePack.styleDna.dominantPalette.find((s) => s.role === role);
    const tSwatch = targetPack.styleDna.dominantPalette.find((s) => s.role === role);
    return Object.freeze({
      role,
      baseCssOklch: bSwatch?.cssOklch ?? null,
      targetCssOklch: tSwatch?.cssOklch ?? null,
      deltaE: oklchDeltaE100(bSwatch, tSwatch),
    });
  });
  const paletteMeanDeltaE = round3(
    paletteRoleDiffs.reduce((sum, item) => sum + item.deltaE, 0) / Math.max(1, paletteRoleDiffs.length),
  );

  const baseBrushes = new Map(basePack.brushes.map((b) => [b.recipe.id, b]));
  const targetBrushes = new Map(targetPack.brushes.map((b) => [b.recipe.id, b]));
  const brushAddedIds: string[] = [];
  const brushRemovedIds: string[] = [];
  const brushModified: { readonly id: string; readonly nameKo: string; readonly changedFields: readonly string[] }[] = [];
  const brushUnchangedIds: string[] = [];

  for (const [id, tEntry] of targetBrushes) {
    const bEntry = baseBrushes.get(id);
    if (!bEntry) {
      brushAddedIds.push(id);
    } else if (bEntry.fingerprintSha256 === tEntry.fingerprintSha256) {
      brushUnchangedIds.push(id);
    } else {
      brushModified.push(
        Object.freeze({
          id,
          nameKo: tEntry.recipe.nameKo,
          changedFields: diffFlatRecordFields(
            bEntry.recipe as unknown as Record<string, unknown>,
            tEntry.recipe as unknown as Record<string, unknown>,
          ),
        }),
      );
    }
  }
  for (const id of baseBrushes.keys()) {
    if (!targetBrushes.has(id)) brushRemovedIds.push(id);
  }

  const baseShaders = new Map(basePack.shaders.map((s) => [s.id, s]));
  const targetShaders = new Map(targetPack.shaders.map((s) => [s.id, s]));
  const shaderAddedIds: string[] = [];
  const shaderRemovedIds: string[] = [];
  const shaderModified: {
    readonly id: string;
    readonly nameKo: string;
    readonly wgslChanged: boolean;
    readonly stageChanged: boolean;
    readonly uniformFieldsChanged: readonly string[];
  }[] = [];
  const shaderUnchangedIds: string[] = [];

  for (const [id, tShader] of targetShaders) {
    const bShader = baseShaders.get(id);
    if (!bShader) {
      shaderAddedIds.push(id);
    } else if (serializeCanonicalJson(bShader) === serializeCanonicalJson(tShader)) {
      shaderUnchangedIds.push(id);
    } else {
      shaderModified.push(
        Object.freeze({
          id,
          nameKo: tShader.nameKo,
          wgslChanged: bShader.wgslSha256 !== tShader.wgslSha256,
          stageChanged: bShader.stage !== tShader.stage,
          uniformFieldsChanged: diffFlatRecordFields(
            bShader.uniforms as unknown as Record<string, unknown>,
            tShader.uniforms as unknown as Record<string, unknown>,
          ),
        }),
      );
    }
  }
  for (const id of baseShaders.keys()) {
    if (!targetShaders.has(id)) shaderRemovedIds.push(id);
  }

  const baseProv = new Map(basePack.rightsBom.provenance.map((p) => [p.assetId, p]));
  const targetProv = new Map(targetPack.rightsBom.provenance.map((p) => [p.assetId, p]));
  const provenanceAddedIds: string[] = [];
  const provenanceRemovedIds: string[] = [];
  const provenanceModifiedIds: string[] = [];
  for (const [id, tp] of targetProv) {
    const bp = baseProv.get(id);
    if (!bp) provenanceAddedIds.push(id);
    else if (serializeCanonicalJson(bp) !== serializeCanonicalJson(tp)) provenanceModifiedIds.push(id);
  }
  for (const id of baseProv.keys()) {
    if (!targetProv.has(id)) provenanceRemovedIds.push(id);
  }

  const summaryKo = identical
    ? "두 팀 팩의 5개 섹션과 SHA-256 봉인이 완전히 일치합니다."
    : `변경 섹션 ${changedSections.length}건 · 팔레트 ΔE ${paletteMeanDeltaE} · 브러시 +${brushAddedIds.length}/-${brushRemovedIds.length}/~${brushModified.length} · 셰이더 +${shaderAddedIds.length}/-${shaderRemovedIds.length}/~${shaderModified.length}`;
  const summaryEn = identical
    ? "Both packs have identical content and SHA-256 seal across all 5 sections."
    : `${changedSections.length} sections changed · Palette ΔE ${paletteMeanDeltaE} · Brushes +${brushAddedIds.length}/-${brushRemovedIds.length}/~${brushModified.length} · Shaders +${shaderAddedIds.length}/-${shaderRemovedIds.length}/~${shaderModified.length}`;

  return Object.freeze({
    basePackId: basePack.metadata.packId,
    targetPackId: targetPack.metadata.packId,
    baseVersion: basePack.metadata.version,
    targetVersion: targetPack.metadata.version,
    identical,
    changedSections: Object.freeze(changedSections),
    styleDna: Object.freeze({
      changed: baseDigests.styleDna !== targetDigests.styleDna,
      lineMeanPxDelta: round3(targetPack.styleDna.linework.meanPx - basePack.styleDna.linework.meanPx),
      shadowKelvinDelta: Math.round(
        targetPack.styleDna.shadowTemperature.estimatedKelvin - basePack.styleDna.shadowTemperature.estimatedKelvin,
      ),
      toneStepsDelta:
        targetPack.styleDna.contrast.detectedToneSteps - basePack.styleDna.contrast.detectedToneSteps,
      screentoneDensityDelta: round3(
        targetPack.styleDna.screentone.coverageRatio - basePack.styleDna.screentone.coverageRatio,
      ),
      screentonePatternChanged:
        basePack.styleDna.screentone.patternKind !== targetPack.styleDna.screentone.patternKind,
      paletteMeanDeltaE,
      paletteRoleDiffs: Object.freeze(paletteRoleDiffs),
    }),
    brushes: Object.freeze({
      changed: baseDigests.brushes !== targetDigests.brushes,
      addedIds: Object.freeze(brushAddedIds),
      removedIds: Object.freeze(brushRemovedIds),
      modified: Object.freeze(brushModified),
      unchangedIds: Object.freeze(brushUnchangedIds),
    }),
    shaders: Object.freeze({
      changed: baseDigests.shaders !== targetDigests.shaders,
      addedIds: Object.freeze(shaderAddedIds),
      removedIds: Object.freeze(shaderRemovedIds),
      modified: Object.freeze(shaderModified),
      unchangedIds: Object.freeze(shaderUnchangedIds),
    }),
    rightsBom: Object.freeze({
      changed: baseDigests.rightsBom !== targetDigests.rightsBom,
      licenseTierChanged: basePack.rightsBom.licenseTier !== targetPack.rightsBom.licenseTier,
      baseLicenseTier: basePack.rightsBom.licenseTier,
      targetLicenseTier: targetPack.rightsBom.licenseTier,
      commercialAllowedChanged:
        basePack.rightsBom.commercialUseAllowed !== targetPack.rightsBom.commercialUseAllowed,
      royaltySplitChanged:
        serializeCanonicalJson(basePack.rightsBom.royaltySplits) !==
        serializeCanonicalJson(targetPack.rightsBom.royaltySplits),
      provenanceAddedIds: Object.freeze(provenanceAddedIds),
      provenanceRemovedIds: Object.freeze(provenanceRemovedIds),
      provenanceModifiedIds: Object.freeze(provenanceModifiedIds),
    }),
    summaryKo,
    summaryEn,
  });
}

// ============================================================================
// 2. 충돌 안전 병합 · 불러오기 플래너 (`planTeamStylePackImport`)
// ============================================================================

function allocateForkedId(sourceId: string, existingSet: ReadonlySet<string>, suffix: string): string {
  const baseCandidate = `${sourceId}--${suffix}`;
  if (!existingSet.has(baseCandidate)) return baseCandidate;
  let seq = 2;
  while (existingSet.has(`${baseCandidate}-${seq}`)) seq += 1;
  return `${baseCandidate}-${seq}`;
}

function assessRightsCompatibility(
  rightsBom: PackRightsBom,
  options: TeamStylePackImportOptions,
  royaltyTotalBps: number,
): { readonly assessment: RightsCompatibilityAssessment; readonly issues: readonly ImportBlockingIssue[] } {
  const issues: ImportBlockingIssue[] = [];
  const needsCommercial =
    options.targetUsageMode === "commercial-publication" || options.requireCommercialLicense === true;
  const unclearedIds = rightsBom.provenance.filter((p) => !p.commercialCleared).map((p) => p.assetId);

  if (royaltyTotalBps !== ROYALTY_TOTAL_BPS) {
    issues.push(
      Object.freeze({
        code: "ROYALTY_SPLIT_INVALID",
        messageKo: `로열티 합계가 10,000 bps가 아닙니다(현재 ${royaltyTotalBps} bps).`,
        messageEn: `Royalty split sum must equal 10,000 bps (got ${royaltyTotalBps} bps).`,
      }),
    );
  }
  if (needsCommercial) {
    const isCommercialTier =
      rightsBom.licenseTier === "commercial-team" || rightsBom.licenseTier === "commercial-enterprise";
    if (!rightsBom.commercialUseAllowed || !isCommercialTier) {
      issues.push(
        Object.freeze({
          code: "COMMERCIAL_LICENSE_INCOMPATIBLE",
          messageKo: `현재 팩 라이선스(${rightsBom.licenseTier})는 상업 연재에 사용할 수 없습니다.`,
          messageEn: `Pack license tier (${rightsBom.licenseTier}) is not cleared for commercial publication.`,
        }),
      );
    }
    if (unclearedIds.length > 0) {
      issues.push(
        Object.freeze({
          code: "THIRD_PARTY_PROVENANCE_UNCLEARED",
          messageKo: `상업 권리가 미확보된 외부 출처 항목이 포함되어 있습니다: ${unclearedIds.join(", ")}`,
          messageEn: `Third-party provenance entries lack commercial clearance: ${unclearedIds.join(", ")}`,
        }),
      );
    }
  } else if (
    options.targetUsageMode === "editorial-noncommercial" &&
    rightsBom.licenseTier === "internal-draft-only"
  ) {
    issues.push(
      Object.freeze({
        code: "INTERNAL_DRAFT_NOT_PUBLISHABLE",
        messageKo: "내부 검수 전용(internal-draft-only) 팩은 외부 에디토리얼에 발행할 수 없습니다.",
        messageEn: "Internal draft packs cannot be published in editorial mode.",
      }),
    );
  }

  const compatible = issues.length === 0;
  const assessment: RightsCompatibilityAssessment = Object.freeze({
    compatible,
    targetUsageMode: options.targetUsageMode,
    licenseTier: rightsBom.licenseTier,
    commercialUseAllowed: rightsBom.commercialUseAllowed,
    unclearedProvenanceIds: Object.freeze(unclearedIds),
    royaltyTotalBps,
    summaryKo: compatible
      ? `권리 BOM 호환 확인 완료 (${rightsBom.licenseTier} · 로열티 ${royaltyTotalBps} bps)`
      : issues[0]?.messageKo ?? "권리 BOM 호환성 검증에 실패했습니다.",
    summaryEn: compatible
      ? `Rights BOM compatible (${rightsBom.licenseTier} · ${royaltyTotalBps} bps)`
      : issues[0]?.messageEn ?? "Rights BOM compatibility check failed.",
  });

  return Object.freeze({ assessment, issues: Object.freeze(issues) });
}

/** 기존 스튜디오 프리셋과의 ID 충돌을 탐지하고 전략별 병합 계획과 Rights BOM 상업 라이선스 호환성을 검증한다. */
export function planTeamStylePackImport(
  pack: SignedTeamStylePack,
  options: TeamStylePackImportOptions,
): TeamStylePackImportPlan {
  const integrity = verifyTeamStylePackIntegrity(pack);
  const blockingIssues: ImportBlockingIssue[] = [];
  const warnings: string[] = [];

  if (!integrity.valid) {
    blockingIssues.push(
      Object.freeze({
        code: "INTEGRITY_FAILED",
        messageKo: `서명 무결성 검증 실패로 불러오기가 차단되었습니다 (${integrity.summaryKo}).`,
        messageEn: `Import blocked by failed signature verification (${integrity.summaryEn}).`,
      }),
    );
  }

  const rightsEval = assessRightsCompatibility(pack.rightsBom, options, integrity.rightsTotalBps);
  blockingIssues.push(...rightsEval.issues);

  const safeVersionSlug = pack.metadata.version.replace(/[^a-zA-Z0-9._-]+/gu, "-");
  const forkSuffix =
    options.forkSuffix?.trim() || `v${safeVersionSlug}-${pack.manifest.packSealSha256.slice(0, 6)}`;

  const existingDnaSet = new Set(options.existingPresets.styleDnaSeriesIds);
  const existingBrushSet = new Set(options.existingPresets.brushIds);
  const existingShaderSet = new Set(options.existingPresets.shaderIds);
  const items: ImportPlannedItem[] = [];

  const planAsset = (
    domain: ImportPlannedItem["domain"],
    sourceId: string,
    labelKo: string,
    labelEn: string,
    existingSet: ReadonlySet<string>,
  ): void => {
    const collided = existingSet.has(sourceId);
    const action: ImportPlannedActionKind = collided ? options.conflictStrategy : "install-new";
    const resolvedId =
      collided && options.conflictStrategy === "fork-versioned"
        ? allocateForkedId(sourceId, existingSet, forkSuffix)
        : sourceId;
    items.push(Object.freeze({ domain, sourceId, labelKo, labelEn, collided, action, resolvedId }));
  };

  planAsset("style-dna", pack.styleDna.seriesId, pack.styleDna.seriesTitle, pack.styleDna.seriesTitle, existingDnaSet);
  for (const brush of pack.brushes) {
    planAsset("brush", brush.recipe.id, brush.recipe.nameKo, brush.recipe.nameEn, existingBrushSet);
  }
  for (const shader of pack.shaders) {
    planAsset("shader", shader.id, shader.nameKo, shader.nameEn, existingShaderSet);
  }

  let collisions = 0;
  let installNew = 0;
  let keepLocal = 0;
  let overwrite = 0;
  let forkVersioned = 0;
  for (const item of items) {
    if (item.collided) collisions += 1;
    if (item.action === "install-new") installNew += 1;
    else if (item.action === "keep-local") keepLocal += 1;
    else if (item.action === "overwrite") overwrite += 1;
    else forkVersioned += 1;
  }

  if (overwrite > 0) {
    warnings.push(`덮어쓰기 모드: 기존 스튜디오 프리셋 ${overwrite}건을 새 팀 팩 항목으로 교체합니다.`);
  }
  if (!pack.rightsBom.redistributionAllowed) {
    warnings.push("외부 재배포가 제한된 팩입니다. 팀 내부 작업 공간에서만 사용하세요.");
  }

  return Object.freeze({
    packId: pack.metadata.packId,
    packSealSha256: pack.manifest.packSealSha256,
    strategy: options.conflictStrategy,
    canApply: blockingIssues.length === 0,
    integrity,
    rightsCompatibility: rightsEval.assessment,
    blockingIssues: Object.freeze(blockingIssues),
    warnings: Object.freeze(warnings),
    items: Object.freeze(items),
    counts: Object.freeze({
      total: items.length,
      collisions,
      installNew,
      keepLocal,
      overwrite,
      forkVersioned,
    }),
  });
}

// ============================================================================
// 3. 변조 시뮬레이션 · 직렬화/파싱 · 내장 템플릿 · 인메모리 레지스트리
// ============================================================================

/** 테스트 및 실시간 진단 UI용 1비트 수준 변조 시뮬레이션(매니페스트 재서명 없이 본문만 미세 변조). */
export function simulateTeamStylePackTamper(
  pack: SignedTeamStylePack,
  target: TamperSimulationTarget,
): SignedTeamStylePack {
  if (target === "palette") {
    const nextPalette = pack.styleDna.dominantPalette.map((swatch, idx) =>
      idx === 0 ? Object.freeze({ ...swatch, L: Number((swatch.L + 0.001).toFixed(4)) }) : swatch,
    );
    return Object.freeze({
      ...pack,
      styleDna: Object.freeze({ ...pack.styleDna, dominantPalette: Object.freeze(nextPalette) }),
    });
  }
  if (target === "brush") {
    const nextBrushes = pack.brushes.map((entry, idx) =>
      idx === 0
        ? Object.freeze({
            ...entry,
            recipe: Object.freeze({
              ...entry.recipe,
              primaryColor: Object.freeze({ ...entry.recipe.primaryColor, r: entry.recipe.primaryColor.r ^ 1 }),
            }),
          })
        : entry,
    );
    return Object.freeze({ ...pack, brushes: Object.freeze(nextBrushes) });
  }
  if (target === "wgsl") {
    const nextShaders = pack.shaders.map((shader, idx) =>
      idx === 0 ? Object.freeze({ ...shader, wgslSource: `${shader.wgslSource}// tampered-1bit\n` }) : shader,
    );
    return Object.freeze({ ...pack, shaders: Object.freeze(nextShaders) });
  }
  const nextSplits = pack.rightsBom.royaltySplits.map((split, idx) =>
    idx === 0 ? Object.freeze({ ...split, shareBps: split.shareBps - 1 }) : split,
  );
  return Object.freeze({
    ...pack,
    rightsBom: Object.freeze({
      ...pack.rightsBom,
      commercialUseAllowed: !pack.rightsBom.commercialUseAllowed,
      royaltySplits: Object.freeze(nextSplits),
    }),
  });
}

export function serializeTeamStylePackJson(pack: SignedTeamStylePack): {
  readonly json: string;
  readonly fileName: string;
  readonly byteLength: number;
} {
  const json = `${JSON.stringify(pack, null, 2)}\n`;
  const slug = pack.metadata.slug.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 48);
  const fileName = `${slug || "team-style-pack"}-v${pack.metadata.version}.tspack.json`;
  return Object.freeze({ json, fileName, byteLength: new TextEncoder().encode(json).byteLength });
}

/** `.tspack.json` 원문 문자열을 스키마 검증 후 파싱하고 무결성 리포트를 함께 반환한다. */
export function parseTeamStylePackJson(rawJson: string): TsPackParseResult {
  if (typeof rawJson !== "string" || rawJson.trim().length === 0) {
    return Object.freeze({
      ok: false,
      errorCode: "INVALID_JSON",
      messageKo: "비어 있는 .tspack.json 입력입니다.",
      messageEn: "Empty .tspack.json input.",
    });
  }
  if (rawJson.length > MAX_TSPACK_JSON_BYTES) {
    return Object.freeze({
      ok: false,
      errorCode: "PAYLOAD_TOO_LARGE",
      messageKo: ".tspack.json 파일 크기가 512 KiB 제한을 초과했습니다.",
      messageEn: ".tspack.json exceeds the 512 KiB limit.",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return Object.freeze({
      ok: false,
      errorCode: "INVALID_JSON",
      messageKo: "JSON 문법이 올바르지 않아 .tspack.json을 해석할 수 없습니다.",
      messageEn: "Malformed JSON in .tspack.json payload.",
    });
  }
  if (
    !isPlainRecord(parsed) ||
    parsed.format !== TSPACK_FORMAT_ID ||
    parsed.schemaVersion !== TSPACK_SCHEMA_VERSION ||
    !isPlainRecord(parsed.metadata) ||
    !isPlainRecord(parsed.styleDna) ||
    !Array.isArray(parsed.brushes) ||
    !Array.isArray(parsed.shaders) ||
    !isPlainRecord(parsed.rightsBom) ||
    !isPlainRecord(parsed.manifest) ||
    !isPlainRecord(parsed.manifest.sectionDigests)
  ) {
    return Object.freeze({
      ok: false,
      errorCode: "INVALID_SCHEMA",
      messageKo: "필수 섹션 또는 .tspack.json 스키마 형식이 올바르지 않습니다.",
      messageEn: "Missing required sections or invalid .tspack.json schema.",
    });
  }
  const pack = parsed as unknown as SignedTeamStylePack;
  const integrity = verifyTeamStylePackIntegrity(pack);
  return Object.freeze({ ok: true, pack, integrity });
}

let cachedBuiltInPacks: Readonly<Record<TeamStylePackTemplateId, SignedTeamStylePack>> | null = null;

/** 외부 네트워크 호출 없이 결정론적으로 서명된 3종의 스튜디오 기본 팩을 반환한다. */
export function getBuiltInTeamStylePacks(): Readonly<Record<TeamStylePackTemplateId, SignedTeamStylePack>> {
  if (!cachedBuiltInPacks) {
    const inputs = buildTeamStylePackTemplateInputs(computeSha256Hex);
    cachedBuiltInPacks = Object.freeze({
      "romance-fantasy-watercolor-cel": createSignedTeamStylePack(inputs["romance-fantasy-watercolor-cel"]),
      "action-noir-ink": createSignedTeamStylePack(inputs["action-noir-ink"]),
      "slice-of-life-pastel-atelier": createSignedTeamStylePack(inputs["slice-of-life-pastel-atelier"]),
    });
  }
  return cachedBuiltInPacks;
}

export function getBuiltInTeamStylePack(id: TeamStylePackTemplateId): SignedTeamStylePack {
  return getBuiltInTeamStylePacks()[id];
}

/** Web Storage를 사용하지 않는 순수 메모리 기반 팀 팩 교환 레지스트리. */
export class TeamStylePackRegistry {
  private readonly packEntries = new Map<string, SignedTeamStylePack>();

  public constructor(initialPacks: readonly SignedTeamStylePack[] = []) {
    for (const pack of initialPacks) {
      this.register(pack);
    }
  }

  public get size(): number {
    return this.packEntries.size;
  }

  public has(packId: string): boolean {
    return this.packEntries.has(packId);
  }

  public get(packId: string): SignedTeamStylePack | undefined {
    return this.packEntries.get(packId);
  }

  public list(): readonly SignedTeamStylePack[] {
    return Object.freeze(Array.from(this.packEntries.values()));
  }

  public register(pack: SignedTeamStylePack): TeamStylePackIntegrityReport {
    const report = verifyTeamStylePackIntegrity(pack);
    if (!report.valid) {
      throw new Error(`Refusing to register invalid team style pack "${pack.metadata.packId}": ${report.summaryEn}`);
    }
    this.packEntries.set(pack.metadata.packId, pack);
    return report;
  }

  public remove(packId: string): boolean {
    return this.packEntries.delete(packId);
  }

  public toExistingPresetIndex(): ExistingStudioPresetIndex {
    const styleDnaSeriesIds = new Set<string>();
    const brushIds = new Set<string>();
    const shaderIds = new Set<string>();
    for (const pack of this.packEntries.values()) {
      styleDnaSeriesIds.add(pack.styleDna.seriesId);
      for (const b of pack.brushes) brushIds.add(b.recipe.id);
      for (const s of pack.shaders) shaderIds.add(s.id);
    }
    return Object.freeze({
      styleDnaSeriesIds: Object.freeze(Array.from(styleDnaSeriesIds)),
      brushIds: Object.freeze(Array.from(brushIds)),
      shaderIds: Object.freeze(Array.from(shaderIds)),
    });
  }
}

export {
  DEFAULT_STUDIO_EXISTING_PRESETS,
  TEAM_STYLE_PACK_TEMPLATE_META,
  auditRightsBom,
  buildSignedPackBrushEntry,
  buildSignedWgslShaderRecipe,
  canonicalizeJsonValue,
  computePackBrushFingerprintSha256,
  computeSectionDigests,
  computeSha256Hex,
  createSignedTeamStylePack,
  serializeCanonicalJson,
  validatePackWgslSource,
  verifyTeamStylePackIntegrity,
};
