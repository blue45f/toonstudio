import { describe, expect, it } from "vitest";

import {
  GEO_REGION_CODES,
  REQUIRED_OVERRIDE_COVERAGE_RATIO,
  canonicalizeGeoManifestJson,
  compileRegionalDeliveryManifest,
  computeBoundingBoxCoverageRatio,
  computeUnionBoundingBoxCoverageRatio,
  diffRegionalDeliveryManifests,
  escapeComplianceSvgXml,
  evaluateRegionalComplianceMatrix,
  evaluateRightsBomForRegion,
  renderComplianceCoverageMatrixSvg,
  scanPanelTextForPiiAndTrademarks,
  sha256GeoManifestHex,
  summarizeGeoComplianceAuditKo,
  verifyRegionalDeliveryManifestIntegrity,
  type ComplianceBoundingBox,
  type ComplianceCategory,
  type GeoRegionCode,
  type GeoVariantOverrideLayer,
  type GeoVariantRemediationType,
  type MasterEpisodeDocument,
  type MasterEpisodePanel,
  type PanelComplianceAnnotation,
  type PanelTextItem,
  type RegionalDeliveryManifest,
  type RightsBomAssetEntry,
} from "./index";

function makeOverride(
  overrideId: string,
  panelId: string,
  targetRegions: readonly GeoRegionCode[],
  remediationType: GeoVariantRemediationType,
  bbox: ComplianceBoundingBox,
  approvedByReviewer = true,
): GeoVariantOverrideLayer {
  return {
    overrideId,
    panelId,
    targetRegions,
    remediationType,
    bbox,
    approvedByReviewer,
    nonDestructiveToMaster: true,
    reviewerId: approvedByReviewer ? "rev-kim" : undefined,
    approvedAtIso: approvedByReviewer ? "2026-11-28T03:00:00Z" : undefined,
  };
}

function makeAnn(
  annotationId: string,
  panelId: string,
  category: ComplianceCategory,
  severityScore: number,
  bbox: ComplianceBoundingBox,
  description: string,
): PanelComplianceAnnotation {
  return { annotationId, panelId, category, severityScore, bbox, description };
}

function makeText(
  textId: string,
  panelId: string,
  text: string,
  bbox: ComplianceBoundingBox = { x: 0, y: 0, width: 220, height: 48 },
  extras?: Pick<PanelTextItem, "markedAsParodyOrSynthetic" | "allowedParodyTokens">,
): PanelTextItem {
  return { textId, panelId, text, bbox, ...extras };
}

function makeStandardPanels(count: number): MasterEpisodePanel[] {
  const panels: MasterEpisodePanel[] = [];
  for (let i = 1; i <= count; i += 1) {
    const num = String(i).padStart(2, "0");
    const panelId = `panel-${num}`;
    panels.push({
      panelId,
      sequenceIndex: i,
      title: `${i}컷 장면`,
      width: 800,
      height: 1200,
      baseLayers: [
        { layerId: `${panelId}-bg`, panelId, role: "background", label: "배경", contentDigest: `bg-${num}`, zIndex: 1, assetIds: ["prop-seoul-alley-3d"] },
        { layerId: `${panelId}-line`, panelId, role: "lineart", label: "선화", contentDigest: `line-${num}`, zIndex: 2, assetIds: ["brush-ink-pro"] },
        { layerId: `${panelId}-color`, panelId, role: "flat-color", label: "채색", contentDigest: `color-${num}`, zIndex: 3 },
        { layerId: `${panelId}-sfx`, panelId, role: "dialogue-sfx", label: "대사·효과음", contentDigest: `sfx-${num}`, zIndex: 4, assetIds: ["font-global-sans"] },
      ],
    });
  }
  return panels;
}

function makeGlobalCleanBom(): RightsBomAssetEntry[] {
  return [
    { assetId: "font-global-sans", kind: "font", displayName: "스튜디오 글로벌 고딕", allowedTerritories: ["GLOBAL"], commercialSerializationAllowed: true, expiresOnIso: "2028-12-31" },
    { assetId: "prop-seoul-alley-3d", kind: "3d-prop", displayName: "서울 골목 3D 배경 키트", allowedTerritories: ["GLOBAL"], commercialSerializationAllowed: true, expiresOnIso: "2027-06-30" },
    { assetId: "brush-ink-pro", kind: "brush-texture", displayName: "만년필 먹선 브러시", allowedTerritories: ["KR", "JP", "US", "EU", "MENA"], commercialSerializationAllowed: true },
    { assetId: "audio-rain-loop", kind: "audio-cue", displayName: "빗소리 앰비언스", allowedTerritories: ["GLOBAL"], commercialSerializationAllowed: true },
  ];
}

function makeMultiRegionScenarioEpisode(
  extraOverrides: readonly GeoVariantOverrideLayer[] = [],
): MasterEpisodeDocument {
  const panels = makeStandardPanels(10);
  panels[0] = {
    ...panels[0],
    title: "빗속 검격 충돌",
    complianceAnnotations: [
      makeAnn("ann-gore-01", "panel-01", "gore-blood", 60, { x: 100, y: 200, width: 200, height: 150 }, "칼날 부근 선혈 비산 연출"),
    ],
  };
  panels[1] = {
    ...panels[1],
    title: "심야 포장마차 대화",
    complianceAnnotations: [
      makeAnn("ann-alcohol-02", "panel-02", "alcohol-tobacco", 55, { x: 300, y: 400, width: 160, height: 120 }, "소주병 및 술잔 클로즈업"),
    ],
  };
  panels[2] = {
    ...panels[2],
    title: "도심 사거리 간판",
    textItems: [makeText("txt-sign-03", "panel-03", "STARBUCKS 24H COFFEE", { x: 50, y: 80, width: 240, height: 90 })],
  };

  return {
    episodeId: "ep-092",
    seriesId: "series-neon-rain",
    title: "92화: 빗속의 약속",
    masterRevision: 4,
    panels,
    variantOverrides: [
      makeOverride("ovr-brand-swap-all", "panel-03", [...GEO_REGION_CODES], "parody-signage-swap", { x: 40, y: 70, width: 260, height: 110 }),
      ...extraOverrides,
    ],
  };
}

describe("Wave 92 — 지역별 심의 정책 매트릭스 및 기하 덮개 불변식", () => {
  it("1. 동일 회차(혈흔60+주류55+상표교체)가 KR-15+는 통과하고 KR-12+/US-T/MENA-G는 fail-closed 차단된다", () => {
    const report = evaluateRegionalComplianceMatrix(makeMultiRegionScenarioEpisode(), [
      "KR-15+",
      "KR-12+",
      "US-T",
      "MENA-G",
    ]);

    expect(report.byRegion["KR-15+"]?.exportAllowed).toBe(true);
    expect(report.byRegion["KR-15+"]?.resolvedByVariantCount).toBe(1);
    expect(report.byRegion["KR-15+"]?.warningFindings.length).toBe(2);
    expect(report.byRegion["KR-12+"]?.exportAllowed).toBe(false);
    expect(report.byRegion["KR-12+"]?.blockingFindings.length).toBe(2);
    expect(report.byRegion["US-T"]?.exportAllowed).toBe(false);
    expect(report.byRegion["US-T"]?.blockingFindings.length).toBe(2);
    expect(report.byRegion["MENA-G"]?.exportAllowed).toBe(false);
    expect(report.byRegion["MENA-G"]?.blockingFindings.length).toBe(2);
    expect(report.overallAllRegionsAllowed).toBe(false);
  });

  it("2. 승인된 비파괴 변형 레이어를 추가하면 KR-12+/US-T/MENA-G 차단이 모두 해소된다", () => {
    const episode = makeMultiRegionScenarioEpisode([
      makeOverride("ovr-gore-ink", "panel-01", ["KR-12+", "US-T", "MENA-G"], "recolor-dark-ink", { x: 100, y: 200, width: 200, height: 150 }),
      makeOverride("ovr-alcohol-cover", "panel-02", ["KR-12+", "US-T", "MENA-G"], "luminance-glow-cover", { x: 295, y: 395, width: 170, height: 130 }),
    ]);

    const report = evaluateRegionalComplianceMatrix(episode, ["KR-15+", "KR-12+", "US-T", "MENA-G"]);
    expect(report.overallAllRegionsAllowed).toBe(true);
    expect(report.totalBlockingCount).toBe(0);
    expect(report.byRegion["MENA-G"]?.resolvedByVariantCount).toBe(3);
    expect(report.byRegion["KR-12+"]?.resolvedByVariantCount).toBe(3);
  });

  it("3. JP-ALL·EU-12+·MENA-G 의상 노출 및 문화 문양 임계치를 권역별로 정확히 구분한다", () => {
    const panels = makeStandardPanels(2);
    panels[0] = {
      ...panels[0],
      complianceAnnotations: [
        makeAnn("ann-wardrobe", "panel-01", "wardrobe-exposure", 45, { x: 10, y: 10, width: 100, height: 100 }, "해변 장면 의상 노출"),
        makeAnn("ann-cultural", "panel-01", "cultural-symbol", 45, { x: 200, y: 10, width: 80, height: 80 }, "민감 문양 깃발"),
      ],
    };
    const doc: MasterEpisodeDocument = {
      episodeId: "ep-culture",
      seriesId: "s-1",
      title: "문화·의상 검증",
      masterRevision: 1,
      panels,
      variantOverrides: [],
    };

    const report = evaluateRegionalComplianceMatrix(doc, ["JP-ALL", "EU-12+", "MENA-G"]);
    expect(report.byRegion["JP-ALL"]?.exportAllowed).toBe(true);
    expect(report.byRegion["EU-12+"]?.blockingFindings.map((f) => f.category)).toEqual(["cultural-symbol"]);
    expect(report.byRegion["MENA-G"]?.blockingFindings.map((f) => f.category)).toEqual([
      "wardrobe-exposure",
      "cultural-symbol",
    ]);
  });

  it("4. 지적 영역의 70%만 덮는 변형 레이어는 fail-closed로 차단된다", () => {
    const episode = makeMultiRegionScenarioEpisode([
      makeOverride("ovr-gore-partial-70", "panel-01", ["KR-12+"], "recolor-dark-ink", { x: 100, y: 200, width: 140, height: 150 }),
    ]);

    const report = evaluateRegionalComplianceMatrix(episode, ["KR-12+"]);
    const goreFinding = report.byRegion["KR-12+"]?.blockingFindings.find((f) => f.category === "gore-blood");
    expect(goreFinding?.failureReason).toBe("insufficient-bbox-coverage");
    expect(goreFinding?.coverageRatio).toBeCloseTo(0.7, 5);
    expect(goreFinding?.requiredCoverageRatio).toBe(REQUIRED_OVERRIDE_COVERAGE_RATIO);
  });

  it("5. 어긋난 마스크(60%)는 차단되지만 두 개의 승인 오버라이드가 합집합 100%를 덮으면 통과한다", () => {
    const target = { x: 100, y: 200, width: 200, height: 100 };
    expect(computeBoundingBoxCoverageRatio(target, { x: 180, y: 200, width: 200, height: 100 })).toBeCloseTo(0.6, 5);
    expect(
      computeUnionBoundingBoxCoverageRatio(target, [
        { x: 100, y: 200, width: 110, height: 100 },
        { x: 200, y: 200, width: 100, height: 100 },
      ]),
    ).toBeCloseTo(1.0, 5);

    const episode = makeMultiRegionScenarioEpisode([
      makeOverride("ovr-gore-left", "panel-01", ["US-T"], "recolor-dark-ink", { x: 100, y: 200, width: 105, height: 150 }),
      makeOverride("ovr-gore-right", "panel-01", ["US-T"], "recolor-dark-ink", { x: 200, y: 200, width: 100, height: 150 }),
    ]);
    const goreResolved = evaluateRegionalComplianceMatrix(episode, ["US-T"]).byRegion["US-T"]?.resolvedFindings.find(
      (f) => f.category === "gore-blood",
    );
    expect(goreResolved?.coverageRatio).toBe(1);
    expect(goreResolved?.appliedOverrideIds).toEqual(["ovr-gore-left", "ovr-gore-right"]);
  });

  it("6. 100% 덮더라도 검토자 미승인 초안(approvedByReviewer: false)은 차단되고 매니페스트에서 제외된다", () => {
    const episode = makeMultiRegionScenarioEpisode([
      makeOverride("ovr-gore-unapproved", "panel-01", ["KR-12+"], "recolor-dark-ink", { x: 100, y: 200, width: 200, height: 150 }, false),
    ]);

    const goreFinding = evaluateRegionalComplianceMatrix(episode, ["KR-12+"]).byRegion["KR-12+"]?.blockingFindings.find(
      (f) => f.category === "gore-blood",
    );
    expect(goreFinding?.failureReason).toBe("unapproved-override");
    expect(goreFinding?.unapprovedOverrideIds).toEqual(["ovr-gore-unapproved"]);

    const manifest = compileRegionalDeliveryManifest(episode, "KR-12+", makeGlobalCleanBom(), {
      releaseDateIso: "2026-11-28",
    });
    expect(manifest.exportDecision).toBe("BLOCKED");
    expect(manifest.variantOverrideLayerIds).not.toContain("ovr-gore-unapproved");
  });

  it("7. 허용되지 않은 보정 방식, 비파괴 위반, 0면적 bbox는 각각 정확한 사유로 fail-closed 차단된다", () => {
    const panels = makeStandardPanels(3);
    panels[0] = { ...panels[0], complianceAnnotations: [makeAnn("ann-pii", "panel-01", "pii-contact-identifier", 95, { x: 10, y: 10, width: 100, height: 40 }, "연락처 노출")] };
    panels[1] = { ...panels[1], complianceAnnotations: [makeAnn("ann-gore-destr", "panel-02", "gore-blood", 90, { x: 10, y: 10, width: 100, height: 100 }, "혈흔")] };
    panels[2] = { ...panels[2], complianceAnnotations: [makeAnn("ann-bad-bbox", "panel-03", "gore-blood", 90, { x: 10, y: 10, width: 0, height: 100 }, "잘못된 좌표")] };

    const destructiveOverride = {
      ...makeOverride("ovr-destructive", "panel-02", ["KR-15+"], "recolor-dark-ink", { x: 10, y: 10, width: 100, height: 100 }),
      nonDestructiveToMaster: false,
    } as unknown as GeoVariantOverrideLayer;

    const doc: MasterEpisodeDocument = {
      episodeId: "ep-edge",
      seriesId: "s-edge",
      title: "경계 조건 테스트",
      masterRevision: 1,
      panels,
      variantOverrides: [
        makeOverride("ovr-wrong-kind", "panel-01", ["KR-15+"], "recolor-dark-ink", { x: 10, y: 10, width: 100, height: 40 }),
        destructiveOverride,
      ],
    };

    const reasons = evaluateRegionalComplianceMatrix(doc, ["KR-15+"]).byRegion["KR-15+"]?.blockingFindings.map(
      (f) => f.failureReason,
    );
    expect(reasons).toEqual(["disallowed-remediation-type", "non-destructive-violation", "invalid-bbox"]);
  });
});

describe("Wave 92 — 개인정보(PII) 및 상표 자동 스캐너", () => {
  it("8. 한국·미국·국제 전화번호와 이메일 주소를 결정론적으로 탐지한다", () => {
    const res = scanPanelTextForPiiAndTrademarks([
      makeText("t-1", "panel-01", "긴급 연락 010-1234-5678 또는 +1-555-0199, 사무실 02-3456-7890"),
      makeText("t-2", "panel-02", "제보 메일: tip.desk@seoul-studio.kr"),
    ]);
    expect(res.piiCount).toBe(4);
    expect(res.findings.map((f) => f.matchedValue)).toEqual([
      "010-1234-5678",
      "+1-555-0199",
      "02-3456-7890",
      "tip.desk@seoul-studio.kr",
    ]);
  });

  it("9. 한국 차량번호판(12가 3456 / 123가 4567 / 서울 54허 9876)을 탐지하고 일반 숫자는 오탐하지 않는다", () => {
    const res = scanPanelTextForPiiAndTrademarks([
      makeText("t-plate", "panel-01", "용의 차량 12가 3456, 뒤따른 차 123가 4567, 택시 서울 54허 9876"),
      makeText("t-safe-num", "panel-02", "제12화 3456원 특가 · 2026년 1128일 기록"),
    ]);
    expect(res.findings.length).toBe(3);
    expect(res.findings.every((f) => f.detectionKind === "korean-license-plate")).toBe(true);
  });

  it("10. 기본 및 사용자 지정 상표명은 탐지하고 패러디 철자는 안전하게 통과시킨다", () => {
    const res = scanPanelTextForPiiAndTrademarks(
      [
        makeText("t-real", "panel-01", "스타벅스 옆 HyperNovaX 스토어에서 Nike 운동화 구매"),
        makeText("t-parody", "panel-02", "WcDonald's 버거와 Starbuxx 커피, Kola-Z 음료"),
      ],
      ["HyperNovaX"],
    );
    expect(res.trademarkCount).toBe(3);
    expect(res.findings.map((f) => f.matchedValue)).toEqual(["스타벅스", "HyperNovaX", "Nike"]);
  });

  it("11. markedAsParodyOrSynthetic 및 allowedParodyTokens 지정 텍스트는 건너뛴다", () => {
    const res = scanPanelTextForPiiAndTrademarks([
      makeText("t-synth", "panel-01", "가상 번호 010-0000-0000 / fake@example.com", undefined, { markedAsParodyOrSynthetic: true }),
      makeText("t-token", "panel-02", "Apple 사과 농장 직판", undefined, { allowedParodyTokens: ["apple"] }),
    ]);
    expect(res.findings.length).toBe(0);
    expect(res.ignoredSyntheticCount).toBe(1);
  });

  it("12. +82 국제 전화번호처럼 여러 패턴이 겹치는 경우 중복 탐지 없이 1건만 기록한다", () => {
    const res = scanPanelTextForPiiAndTrademarks([
      makeText("t-kr-intl", "panel-01", "국제 대표번호 +82-10-9876-5432"),
    ]);
    expect(res.findings.length).toBe(1);
    expect(res.findings[0].matchedValue).toBe("+82-10-9876-5432");
  });

  it("13. 자동 텍스트 스캔 결과가 전 권역 매트릭스에 차단 항목으로 반영되고 가상 치환 레이어로 해제된다", () => {
    const panels = makeStandardPanels(1);
    panels[0] = { ...panels[0], textItems: [makeText("t-phone", "panel-01", "연락처 010-5555-7777", { x: 20, y: 30, width: 180, height: 40 })] };
    const blockedDoc: MasterEpisodeDocument = {
      episodeId: "ep-pii",
      seriesId: "s-pii",
      title: "PII 자동 차단",
      masterRevision: 1,
      panels,
      variantOverrides: [],
    };
    expect(evaluateRegionalComplianceMatrix(blockedDoc, GEO_REGION_CODES).regions.every((r) => !r.exportAllowed)).toBe(true);

    const fixedDoc: MasterEpisodeDocument = {
      ...blockedDoc,
      variantOverrides: [
        makeOverride("ovr-pii-synth", "panel-01", [...GEO_REGION_CODES], "pii-synthetic-placeholder", { x: 20, y: 30, width: 180, height: 40 }),
      ],
    };
    const fixed = evaluateRegionalComplianceMatrix(fixedDoc, GEO_REGION_CODES);
    expect(fixed.overallAllRegionsAllowed).toBe(true);
    expect(fixed.totalResolvedByVariantCount).toBe(GEO_REGION_CODES.length);
  });
});

describe("Wave 92 — Rights BOM 권역·상업·만료·미등록 에셋 출고 게이트", () => {
  it("14. KR 전용 폰트는 KR-15+/KR-12+는 통과하지만 JP-ALL/US-T/EU-12+/MENA-G는 fail-closed 차단한다", () => {
    const krOnlyFont: RightsBomAssetEntry[] = [
      { assetId: "font-kr-serif", kind: "font", displayName: "국내 전용 명조체", allowedTerritories: ["KR"], commercialSerializationAllowed: true },
    ];
    expect(evaluateRightsBomForRegion("KR-15+", krOnlyFont, "2026-11-28").allAssetsCleared).toBe(true);
    expect(evaluateRightsBomForRegion("KR-12+", krOnlyFont, "2026-11-28").allAssetsCleared).toBe(true);

    const overseas: readonly GeoRegionCode[] = ["JP-ALL", "US-T", "EU-12+", "MENA-G"];
    for (let i = 0; i < overseas.length; i += 1) {
      const ev = evaluateRightsBomForRegion(overseas[i], krOnlyFont, "2026-11-28");
      expect(ev.allAssetsCleared).toBe(false);
      expect(ev.blockers[0].code).toBe("TERRITORY_NOT_LICENSED");
    }
  });

  it("15. 만료된 3D 에셋 라이선스는 출고를 차단하고, 만료 당일 또는 미래 만료는 통과한다", () => {
    const prop: RightsBomAssetEntry[] = [
      { assetId: "prop-castle", kind: "3d-prop", displayName: "중세 성곽 3D", allowedTerritories: ["GLOBAL"], commercialSerializationAllowed: true, expiresOnIso: "2026-10-31" },
    ];
    const expired = evaluateRightsBomForRegion("US-T", prop, "2026-11-28");
    expect(expired.allAssetsCleared).toBe(false);
    expect(expired.blockers[0].code).toBe("LICENSE_EXPIRED");
    expect(evaluateRightsBomForRegion("US-T", prop, "2026-10-31").allAssetsCleared).toBe(true);
  });

  it("16. 비상업용(commercialSerializationAllowed: false) 브러시 텍스처는 출고를 차단한다", () => {
    const ev = evaluateRightsBomForRegion(
      "KR-15+",
      [{ assetId: "brush-personal", kind: "brush-texture", displayName: "개인 연습용 브러시", allowedTerritories: ["GLOBAL"], commercialSerializationAllowed: false }],
      "2026-11-28",
    );
    expect(ev.allAssetsCleared).toBe(false);
    expect(ev.blockers[0].code).toBe("COMMERCIAL_SERIALIZATION_PROHIBITED");
  });

  it("17. 만료일이 잘못된 형식이거나 출고 기준일이 누락되면 fail-closed로 차단한다", () => {
    const asset: RightsBomAssetEntry = {
      assetId: "audio-01",
      kind: "audio-cue",
      displayName: "효과음 팩",
      allowedTerritories: ["GLOBAL"],
      commercialSerializationAllowed: true,
      expiresOnIso: "2026-12-31",
    };
    expect(evaluateRightsBomForRegion("JP-ALL", [asset], undefined).blockers[0].code).toBe("INVALID_LICENSE_EXPIRY_DATE");
    expect(evaluateRightsBomForRegion("JP-ALL", [{ ...asset, expiresOnIso: "2026-02-30" }], "2026-11-28").blockers[0].code).toBe("INVALID_LICENSE_EXPIRY_DATE");
  });

  it("18. 마스터 레이어에서 참조하지만 Rights BOM에 누락된 에셋은 UNREGISTERED_ASSET_IN_BOM으로 차단한다", () => {
    const partialBom = makeGlobalCleanBom().filter((a) => a.assetId !== "brush-ink-pro");
    const manifest = compileRegionalDeliveryManifest(makeMultiRegionScenarioEpisode(), "KR-15+", partialBom, {
      releaseDateIso: "2026-11-28",
    });
    expect(manifest.exportDecision).toBe("BLOCKED");
    expect(manifest.rightsBomEvaluation.blockers.some((b) => b.code === "UNREGISTERED_ASSET_IN_BOM")).toBe(true);
  });

  it("19. GLOBAL 상업 유효 Rights BOM은 6개 권역 모두 통과한다", () => {
    const bom = makeGlobalCleanBom();
    for (let i = 0; i < GEO_REGION_CODES.length; i += 1) {
      const ev = evaluateRightsBomForRegion(GEO_REGION_CODES[i], bom, "2026-11-28");
      expect(ev.allAssetsCleared).toBe(true);
      expect(ev.clearedAssetIds.length).toBe(bom.length);
    }
  });
});

describe("Wave 92 — 비파괴 합성기, FIPS 180-4 SHA-256, 위변조 검증 및 권역 간 차분", () => {
  it("20. 순수 ES2017 SHA-256이 NIST 표준 벡터와 일치하고 정규 JSON이 키 순서와 무관하다", () => {
    expect(sha256GeoManifestHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256GeoManifestHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256GeoManifestHex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );

    const jsonA = canonicalizeGeoManifestJson({ b: 2, a: { z: "한글", y: true } });
    const jsonB = canonicalizeGeoManifestJson({ a: { y: true, z: "한글" }, b: 2 });
    expect(jsonA).toBe(jsonB);
    expect(sha256GeoManifestHex(jsonA)).toBe(sha256GeoManifestHex(jsonB));
  });

  it("21. 10패널 단일 마스터 재사용률이 85% 이상이며 6개 권역 컴파일 후에도 마스터 원본이 0건 변경된다", () => {
    const episode = makeMultiRegionScenarioEpisode([
      makeOverride("ovr-gore-global", "panel-01", ["KR-12+", "JP-ALL", "US-T", "EU-12+", "MENA-G"], "recolor-dark-ink", { x: 100, y: 200, width: 200, height: 150 }),
      makeOverride("ovr-alcohol-global", "panel-02", ["KR-12+", "US-T", "EU-12+", "MENA-G"], "luminance-glow-cover", { x: 300, y: 400, width: 160, height: 120 }),
    ]);

    const snapshotBefore = canonicalizeGeoManifestJson(episode);
    const bom = makeGlobalCleanBom();
    for (let i = 0; i < GEO_REGION_CODES.length; i += 1) {
      const m = compileRegionalDeliveryManifest(episode, GEO_REGION_CODES[i], bom, { releaseDateIso: "2026-11-28" });
      expect(m.exportDecision).toBe("APPROVED");
      expect(m.mutatedMasterLayerCount).toBe(0);
      expect(m.totalMasterBaseLayerCount).toBe(40);
      expect(m.sharedLayerReuseRatio).toBeGreaterThanOrEqual(0.85);
    }
    expect(canonicalizeGeoManifestJson(episode)).toBe(snapshotBefore);
  });

  it("22. 심의와 Rights BOM 중 하나라도 실패하면 매니페스트 exportDecision이 BLOCKED로 닫힌다", () => {
    const episode = makeMultiRegionScenarioEpisode();
    const krOnlyBom = makeGlobalCleanBom().map((a) =>
      a.assetId === "font-global-sans" ? { ...a, allowedTerritories: ["KR"] } : a,
    );

    expect(compileRegionalDeliveryManifest(episode, "KR-15+", krOnlyBom, { releaseDateIso: "2026-11-28" }).exportDecision).toBe("APPROVED");

    const jpBlocked = compileRegionalDeliveryManifest(episode, "JP-ALL", krOnlyBom, { releaseDateIso: "2026-11-28" });
    expect(jpBlocked.exportDecision).toBe("BLOCKED");
    expect(jpBlocked.blockingReasons.some((r) => r.gate === "compliance")).toBe(true);
    expect(jpBlocked.blockingReasons.some((r) => r.gate === "rights-bom")).toBe(true);
  });

  it("23. verifyRegionalDeliveryManifestIntegrity가 정상 서명은 통과시키고 필드 위변조를 즉시 탐지한다", () => {
    const manifest = compileRegionalDeliveryManifest(makeMultiRegionScenarioEpisode(), "MENA-G", makeGlobalCleanBom(), {
      releaseDateIso: "2026-11-28",
    });
    expect(verifyRegionalDeliveryManifestIntegrity(manifest).valid).toBe(true);

    const tamperedDecision: RegionalDeliveryManifest = { ...manifest, exportDecision: "APPROVED" };
    expect(verifyRegionalDeliveryManifestIntegrity(tamperedDecision).valid).toBe(false);
    expect(verifyRegionalDeliveryManifestIntegrity(tamperedDecision).issues.length).toBeGreaterThanOrEqual(2);

    const tamperedReuse: RegionalDeliveryManifest = { ...manifest, sharedLayerReuseRatio: 0.999999 };
    expect(verifyRegionalDeliveryManifestIntegrity(tamperedReuse).valid).toBe(false);
  });

  it("24. diffRegionalDeliveryManifests가 권역 간 변경 패널과 변형 레이어 차분만 정확히 추출한다", () => {
    const episode = makeMultiRegionScenarioEpisode([
      makeOverride("ovr-mena-gore", "panel-01", ["MENA-G"], "luminance-glow-cover", { x: 100, y: 200, width: 200, height: 150 }),
      makeOverride("ovr-mena-alcohol", "panel-02", ["MENA-G"], "luminance-glow-cover", { x: 300, y: 400, width: 160, height: 120 }),
    ]);
    const bom = makeGlobalCleanBom();
    const diff = diffRegionalDeliveryManifests(
      compileRegionalDeliveryManifest(episode, "KR-15+", bom, { releaseDateIso: "2026-11-28" }),
      compileRegionalDeliveryManifest(episode, "MENA-G", bom, { releaseDateIso: "2026-11-28" }),
    );
    expect(diff.sameEpisode).toBe(true);
    expect(diff.sharedBaseLayerCount).toBe(40);
    expect(diff.unchangedPanelIds.length).toBe(8);
    expect(diff.changedPanels.map((p) => p.panelId)).toEqual(["panel-01", "panel-02"]);
    expect(diff.changedPanels[0].onlyInRegionAOverrideIds).toEqual([]);
    expect(diff.changedPanels[0].onlyInRegionBOverrideIds).toEqual(["ovr-mena-gore"]);
    expect(diff.totalDeltaOverrideCount).toBe(2);
  });

  it("25. 동일 입력에 대해 매니페스트 컴파일과 SHA-256 서명이 100% 결정론적으로 재현된다", () => {
    const episode = makeMultiRegionScenarioEpisode();
    const bom = makeGlobalCleanBom();
    const first = compileRegionalDeliveryManifest(episode, "KR-15+", bom, { releaseDateIso: "2026-11-28" });
    const second = compileRegionalDeliveryManifest(episode, "KR-15+", bom, { releaseDateIso: "2026-11-28" });
    expect(first.manifestSha256).toBe(second.manifestSha256);
    expect(canonicalizeGeoManifestJson(first)).toBe(canonicalizeGeoManifestJson(second));
  });
});

describe("Wave 92 — 인쇄 대응 SVG 심의 매트릭스 및 한국어 프리플라이트 보고서", () => {
  it("26. SVG 매트릭스가 OK/VAR/BLK 문자 기호와 범례를 포함하고 NaN/Infinity가 0건이다", () => {
    const report = evaluateRegionalComplianceMatrix(makeMultiRegionScenarioEpisode(), [
      "KR-15+",
      "KR-12+",
      "US-T",
      "MENA-G",
    ]);
    const svg = renderComplianceCoverageMatrixSvg(report, {
      cellWidthPx: Number.NaN,
      rowHeightPx: Number.POSITIVE_INFINITY,
    });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toContain(">OK<");
    expect(svg).toContain(">VAR<");
    expect(svg).toContain(">BLK<");
    expect(svg).toContain("PASS · V1");
    expect(svg).toContain("HOLD · B2");
  });

  it("27. SVG 매트릭스가 제목·패널명의 XML 특수문자를 안전하게 이스케이프한다", () => {
    const panels = makeStandardPanels(1);
    panels[0] = { ...panels[0], title: `위험 <script>&"test"'</script>` };
    const doc: MasterEpisodeDocument = {
      episodeId: "ep-xml",
      seriesId: "s-xml",
      title: `1화 <A & B> "검증"`,
      masterRevision: 1,
      panels,
      variantOverrides: [],
    };
    const svg = renderComplianceCoverageMatrixSvg(evaluateRegionalComplianceMatrix(doc, ["KR-15+"]));
    expect(escapeComplianceSvgXml(`<a&"'>`)).toBe("&lt;a&amp;&quot;&apos;&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;A &amp; B&gt; &quot;검증&quot;");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("28. 한국어 감사 보고서가 권역 판정·BOM 누락·재사용률·조치 항목을 번역투 없이 요약한다", () => {
    const episode = makeMultiRegionScenarioEpisode();
    const krOnlyBom = makeGlobalCleanBom().map((a) =>
      a.assetId === "font-global-sans" ? { ...a, allowedTerritories: ["KR"] } : a,
    );
    const regions: readonly GeoRegionCode[] = ["KR-15+", "US-T", "MENA-G"];
    const matrix = evaluateRegionalComplianceMatrix(episode, regions);
    const manifests = regions.map((r) =>
      compileRegionalDeliveryManifest(episode, r, krOnlyBom, { releaseDateIso: "2026-11-28" }),
    );
    const summary = summarizeGeoComplianceAuditKo(matrix, manifests, { generatedDateIso: "2026-11-28" });

    expect(summary).toContain("글로벌 동시 연재 출고 사전 점검 보고서");
    expect(summary).toContain("원본 기본 레이어 수정 건수 **0건**");
    expect(summary).toContain("출고 승인");
    expect(summary).toContain("출고 차단");
    expect(summary).toContain("스튜디오 글로벌 고딕");
    expect(summary).toContain("97.6%");
    expect(summary).not.toContain("가능하게 합니다");
    expect(summary).not.toContain("원활한 워크플로우");
    expect(summary).not.toContain("직관적인 경험을 제공");
  });

  it("29. 모든 권역이 출고 승인된 경우 남은 차단 사유 없음 안내를 출력한다", () => {
    const cleanDoc: MasterEpisodeDocument = {
      episodeId: "ep-clean",
      seriesId: "s-clean",
      title: "클린 회차",
      masterRevision: 2,
      panels: makeStandardPanels(2),
      variantOverrides: [],
    };
    const regions: readonly GeoRegionCode[] = ["KR-15+", "JP-ALL", "US-T"];
    const matrix = evaluateRegionalComplianceMatrix(cleanDoc, regions);
    const manifests = regions.map((r) =>
      compileRegionalDeliveryManifest(cleanDoc, r, makeGlobalCleanBom(), { releaseDateIso: "2026-11-28" }),
    );
    const summary = summarizeGeoComplianceAuditKo(matrix, manifests);
    expect(summary).toContain("**3개 승인**, **0개 차단**");
    expect(summary).toContain("남은 차단 사유가 없습니다");
  });
});
