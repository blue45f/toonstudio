import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_DISTRIBUTION_SCOPES,
  LICENSE_TIERS,
  RIGHTS_BOM_ASSET_CATEGORIES,
  applySafeReplacementsAndReaudit,
  auditEpisodeRightsBomClearance,
  canonicalizeRightsBomJson,
  compileRequiredAttributionCreditsKo,
  computeRightsBomCertificateSha256Hex,
  computeTagJaccardSimilarity,
  escapeRightsBomXml,
  parseIsoDateToUtcDayNumber,
  recommendSafeAssetReplacements,
  renderRightsBomClearanceSvg,
  resolveEffectiveAllowedScopes,
  sha256RightsBomUtf8Hex,
  summarizeRightsBomClearanceKo,
  type CommercialDistributionScope,
  type RightsBomAssetEntry,
  type SafeCatalogAssetEntry,
  type StudioEpisodeRightsBomProject,
} from "./index";

const ALL_FIVE_SCOPES: readonly CommercialDistributionScope[] = [
  "webtoon-serial",
  "print-book",
  "video-drama-adaptation",
  "physical-merch",
  "global-translation",
];

function makeAsset(overrides: Partial<RightsBomAssetEntry> = {}): RightsBomAssetEntry {
  return {
    assetId: "asset-bg-seoul-rooftop",
    nameKo: "서울 야경 옥상 3D 배경",
    category: "3d-background",
    vendor: "아틀리에3D",
    licenseTier: "commercial-full",
    allowedScopes: ALL_FIVE_SCOPES,
    seatLimit: 5,
    activeTeamSeatsUsed: 3,
    expiresOnIso: "2027-12-31",
    attributionRequired: false,
    attributionIncludedInCredits: false,
    tags: ["현대", "야경", "옥상", "도시"],
    usedInCutIds: ["C01", "C05"],
    ...overrides,
  };
}

function makeProject(
  overrides: Partial<StudioEpisodeRightsBomProject> = {},
): StudioEpisodeRightsBomProject {
  return {
    episodeId: "EP-042",
    projectTitleKo: "새벽의 경계선",
    releaseDateIso: "2026-11-28",
    requestedScopes: ["webtoon-serial", "print-book", "global-translation"],
    assets: [makeAsset()],
    ...overrides,
  };
}

function makeCatalogAsset(
  overrides: Partial<SafeCatalogAssetEntry> = {},
): SafeCatalogAssetEntry {
  return {
    assetId: "safe-bg-seoul-night-pro",
    nameKo: "서울 야경 옥상 프로 에디션",
    category: "3d-background",
    vendor: "툰스튜디오 검증 카탈로그",
    licenseTier: "commercial-full",
    allowedScopes: ALL_FIVE_SCOPES,
    seatLimit: 10,
    existingSeatsInUse: 0,
    expiresOnIso: "2028-12-31",
    attributionRequired: false,
    commercialClearanceVerified: true,
    tags: ["현대", "야경", "옥상", "네온"],
    ...overrides,
  };
}

describe("Wave 144 — Rights BOM 2차 저작물 상업 라이선스 감사 & 안전 대체 어셋 매칭 엔진", () => {
  it("1. FIPS 180-4 SHA-256 표준 벡터와 한글 UTF-8 해시를 정확히 계산한다", () => {
    expect(sha256RightsBomUtf8Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256RightsBomUtf8Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const ko = sha256RightsBomUtf8Hex("툰스튜디오 권리 클리어런스");
    expect(ko).toMatch(/^[0-9a-f]{64}$/);
    expect(ko).toBe(sha256RightsBomUtf8Hex("툰스튜디오 권리 클리어런스"));
  });

  it("2. 키 순서가 달라도 정규 JSON 직렬화와 증명서 SHA-256 지문이 동일하다", () => {
    const a = { z: 1, a: { second: true, first: "웹툰" } };
    const b = { a: { first: "웹툰", second: true }, z: 1 };
    expect(canonicalizeRightsBomJson(a)).toBe(canonicalizeRightsBomJson(b));
    expect(computeRightsBomCertificateSha256Hex(a)).toBe(computeRightsBomCertificateSha256Hex(b));
  });

  it("3. ISO 날짜 파서가 윤년을 허용하고 존재하지 않는 달력 날짜를 거부한다", () => {
    const leap = parseIsoDateToUtcDayNumber("2024-02-29");
    const next = parseIsoDateToUtcDayNumber("2024-03-01");
    expect((next ?? 0) - (leap ?? 0)).toBe(1);
    expect(parseIsoDateToUtcDayNumber("2026-02-29")).toBeNull();
    expect(parseIsoDateToUtcDayNumber("2026-13-01")).toBeNull();
    expect(parseIsoDateToUtcDayNumber("2026/11/28")).toBeNull();
  });

  it("4. 태그 자카드 유사도가 대소문자·공백·중복을 정규화해 정확히 계산된다", () => {
    const res = computeTagJaccardSimilarity(
      ["  Cyberpunk ", "Night", "neon", "night"],
      ["cyberpunk", "NEON", "rain"],
    );
    expect(res).toEqual({ jaccardSimilarity: 0.5, sharedTags: ["cyberpunk", "neon"], unionTagCount: 4 });
  });

  it("5. 양쪽 태그가 모두 비어 있으면 자카드 유사도 0을 반환한다", () => {
    expect(computeTagJaccardSimilarity([], ["   "])).toEqual({ jaccardSimilarity: 0, sharedTags: [], unionTagCount: 0 });
  });

  it("6. commercial-webtoon-only 등급은 2차 범위가 과다 기재돼도 웹툰 연재로만 제한한다", () => {
    expect(
      resolveEffectiveAllowedScopes("commercial-webtoon-only", ["webtoon-serial", "print-book", "physical-merch"]),
    ).toEqual(["webtoon-serial"]);
  });

  it("7. 6종 어셋 카테고리, 5대 상업 배포 범위, 7종 라이선스 등급 계약을 모두 노출한다", () => {
    expect(RIGHTS_BOM_ASSET_CATEGORIES).toHaveLength(6);
    expect(COMMERCIAL_DISTRIBUTION_SCOPES).toHaveLength(5);
    expect(LICENSE_TIERS).toHaveLength(7);
  });

  it("8. 모든 상업 권리·좌석·유효기간 조건을 충족하면 출고가 승인된다", () => {
    const res = auditEpisodeRightsBomClearance(makeProject());
    expect(res.exportCleared).toBe(true);
    expect(res.blockerCount).toBe(0);
    expect(res.warningCount).toBe(0);
    expect(res.clearedAssetCount).toBe(1);
    expect(res.clearanceCertificateId).toMatch(/^CERT-[0-9A-F]{12}$/);
    expect(res.clearanceCertificateSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("9. 외부 BOM 어셋이 없는 순수 오리지널 원고는 요청 범위가 있으면 통과한다", () => {
    const res = auditEpisodeRightsBomClearance(makeProject({ assets: [] }));
    expect(res.exportCleared).toBe(true);
    expect(res.totalAssetCount).toBe(0);
    expect(res.blockerCount).toBe(0);
  });

  it("10. [규칙 1a] 비상업 개인용(non-commercial-personal) 어셋은 즉시 차단한다", () => {
    const res = auditEpisodeRightsBomClearance(
      makeProject({
        requestedScopes: ["webtoon-serial"],
        assets: [makeAsset({ assetId: "brush-personal", nameKo: "개인 학습용 펜 브러시", category: "brush-pack", licenseTier: "non-commercial-personal", allowedScopes: ["webtoon-serial"] })],
      }),
    );
    expect(res.exportCleared).toBe(false);
    expect(res.blockerCount).toBe(1);
    expect(res.violations[0]?.code).toBe("non-commercial-license-blocker");
    expect(res.assetAudits[0]?.scopeMatrix["webtoon-serial"]).toBe("requested-blocked");
  });

  it("11. [규칙 1b] CC BY-NC 4.0 어셋이 상업 출고에 포함되면 즉시 차단한다", () => {
    const res = auditEpisodeRightsBomClearance(
      makeProject({
        requestedScopes: ["webtoon-serial"],
        assets: [makeAsset({ assetId: "sfx-nc", category: "audio-sfx", licenseTier: "cc-by-nc-4.0", allowedScopes: ["webtoon-serial"], attributionRequired: true, attributionIncludedInCredits: true })],
      }),
    );
    expect(res.exportCleared).toBe(false);
    expect(res.violations.some((v) => v.code === "non-commercial-license-blocker")).toBe(true);
  });

  it("12. [규칙 2] 웹툰 연재 전용 어셋은 연재 단독 출고는 통과하나 단행본·굿즈·영상화 추가 시 차단한다", () => {
    const webtoonOnly = makeAsset({ assetId: "bg-webtoon-only", nameKo: "학원 복도 배경 (연재 전용)", licenseTier: "commercial-webtoon-only", allowedScopes: ["webtoon-serial"] });
    expect(auditEpisodeRightsBomClearance(makeProject({ requestedScopes: ["webtoon-serial"], assets: [webtoonOnly] })).exportCleared).toBe(true);

    const derivative = auditEpisodeRightsBomClearance(
      makeProject({ requestedScopes: ["webtoon-serial", "print-book", "video-drama-adaptation", "physical-merch"], assets: [webtoonOnly] }),
    );
    expect(derivative.exportCleared).toBe(false);
    const v = derivative.violations.find((item) => item.code === "derivative-scope-not-covered");
    expect(v?.missingScopes).toEqual(["print-book", "video-drama-adaptation", "physical-merch"]);
    expect(derivative.assetAudits[0]?.scopeMatrix["webtoon-serial"]).toBe("requested-cleared");
    expect(derivative.assetAudits[0]?.scopeMatrix["print-book"]).toBe("requested-blocked");
  });

  it("13. [규칙 3a] 출고 기준일이 라이선스 만료일을 경과하면 차단한다", () => {
    const res = auditEpisodeRightsBomClearance(makeProject({ releaseDateIso: "2026-11-28", assets: [makeAsset({ expiresOnIso: "2026-11-27" })] }));
    expect(res.exportCleared).toBe(false);
    expect(res.violations[0]?.code).toBe("license-expired");
    expect(res.violations[0]?.daysUntilExpiry).toBe(-1);
  });

  it("14. [규칙 3b] 만료일이 30일 이내(D-0 ~ D-30)로 임박하면 warning만 발생하고 출고는 허용한다", () => {
    const d0 = auditEpisodeRightsBomClearance(makeProject({ releaseDateIso: "2026-11-28", assets: [makeAsset({ expiresOnIso: "2026-11-28" })] }));
    expect(d0.exportCleared).toBe(true);
    expect(d0.warningCount).toBe(1);
    expect(d0.violations[0]?.code).toBe("license-expiring-soon");
    expect(d0.violations[0]?.daysUntilExpiry).toBe(0);

    const d30 = auditEpisodeRightsBomClearance(makeProject({ releaseDateIso: "2026-11-28", assets: [makeAsset({ expiresOnIso: "2026-12-28" })] }));
    expect(d30.exportCleared).toBe(true);
    expect(d30.warningCount).toBe(1);
    expect(d30.violations[0]?.daysUntilExpiry).toBe(30);
  });

  it("15. [규칙 3c] 만료일까지 31일 이상 남아 있으면 경고 없이 통과한다", () => {
    const d31 = auditEpisodeRightsBomClearance(makeProject({ releaseDateIso: "2026-11-28", assets: [makeAsset({ expiresOnIso: "2026-12-29" })] }));
    expect(d31.exportCleared).toBe(true);
    expect(d31.warningCount).toBe(0);
    expect(d31.clearedAssetCount).toBe(1);
  });

  it("16. [규칙 3d] 만료일 또는 출고 기준일 형식이 손상되면 fail-closed로 차단한다", () => {
    const badExpiry = auditEpisodeRightsBomClearance(makeProject({ assets: [makeAsset({ expiresOnIso: "2026-02-30" })] }));
    expect(badExpiry.exportCleared).toBe(false);
    expect(badExpiry.violations[0]?.code).toBe("license-expired");

    const badRelease = auditEpisodeRightsBomClearance(makeProject({ releaseDateIso: "invalid-date", assets: [makeAsset({ expiresOnIso: undefined })] }));
    expect(badRelease.releaseDateValid).toBe(false);
    expect(badRelease.exportCleared).toBe(false);
  });

  it("17. [규칙 4] 팀 사용 좌석이 계약 좌석 한도를 초과하면 차단하고 동일 좌석은 통과한다", () => {
    expect(auditEpisodeRightsBomClearance(makeProject({ assets: [makeAsset({ seatLimit: 4, activeTeamSeatsUsed: 4 })] })).exportCleared).toBe(true);
    const over = auditEpisodeRightsBomClearance(makeProject({ assets: [makeAsset({ seatLimit: 2, activeTeamSeatsUsed: 5 })] }));
    expect(over.exportCleared).toBe(false);
    expect(over.violations[0]?.code).toBe("seat-capacity-exceeded");
    expect(over.violations[0]?.seatOverflowCount).toBe(3);
  });

  it("18. [규칙 5] 저작자 표기 필수(또는 CC BY 4.0) 어셋의 크레딧 누락 시 차단한다", () => {
    const base = makeAsset({ assetId: "font-ccby", nameKo: "손글씨 효과음 서체", category: "font-typeface", licenseTier: "cc-by-4.0", attributionRequired: true, attributionIncludedInCredits: false });
    const missing = auditEpisodeRightsBomClearance(makeProject({ assets: [base] }));
    expect(missing.exportCleared).toBe(false);
    expect(missing.violations[0]?.code).toBe("missing-attribution-credit");
    expect(missing.assetAudits[0]?.suggestedCreditLineKo).toContain("손글씨 효과음 서체");
    expect(auditEpisodeRightsBomClearance(makeProject({ assets: [{ ...base, attributionIncludedInCredits: true }] })).exportCleared).toBe(true);
  });

  it("19. [규칙 6] 보도·편집 전용(editorial-only) 어셋의 상업 출고를 차단한다", () => {
    const res = auditEpisodeRightsBomClearance(
      makeProject({
        requestedScopes: ["webtoon-serial", "physical-merch"],
        assets: [makeAsset({ assetId: "prop-brand-car", category: "prop-model", licenseTier: "editorial-only", allowedScopes: ["webtoon-serial", "physical-merch"] })],
      }),
    );
    expect(res.exportCleared).toBe(false);
    expect(res.violations[0]?.code).toBe("editorial-only-in-commercial");
  });

  it("20. 요청 배포 범위가 비어 있으면 fail-closed로 출고를 보류한다", () => {
    expect(auditEpisodeRightsBomClearance(makeProject({ requestedScopes: [] })).exportCleared).toBe(false);
  });

  it("21. 단일 어셋에 5가지 위반이 겹치면 누락 없이 모두 보고한다", () => {
    const res = auditEpisodeRightsBomClearance(
      makeProject({
        releaseDateIso: "2026-11-28",
        requestedScopes: ["webtoon-serial", "print-book"],
        assets: [makeAsset({ licenseTier: "cc-by-nc-4.0", allowedScopes: ["webtoon-serial"], seatLimit: 1, activeTeamSeatsUsed: 4, expiresOnIso: "2026-10-01", attributionRequired: true, attributionIncludedInCredits: false })],
      }),
    );
    expect(res.violations.map((v) => v.code).sort()).toEqual([
      "derivative-scope-not-covered",
      "license-expired",
      "missing-attribution-credit",
      "non-commercial-license-blocker",
      "seat-capacity-exceeded",
    ]);
    expect(res.blockerCount).toBe(5);
  });

  it("22. 음수 또는 NaN 좌석 수 입력은 fail-closed로 seat-capacity-exceeded를 발생시킨다", () => {
    const res = auditEpisodeRightsBomClearance(makeProject({ assets: [makeAsset({ seatLimit: Number.NaN, activeTeamSeatsUsed: 2 })] }));
    expect(res.exportCleared).toBe(false);
    expect(res.violations[0]?.code).toBe("seat-capacity-exceeded");
  });

  it("23. compileRequiredAttributionCreditsKo가 CC BY 및 표기 필수 크레딧을 결정론적 생성한다", () => {
    const compiled = compileRequiredAttributionCreditsKo([
      makeAsset({ assetId: "a-tone", nameKo: "종이 질감 스크린톤", category: "texture-screentone", vendor: "톤공방", licenseTier: "cc-by-4.0", attributionRequired: true, attributionIncludedInCredits: false, usedInCutIds: ["C09", "C02"] }),
      makeAsset({ assetId: "a-font", nameKo: "배달 손글씨체", category: "font-typeface", vendor: "서체연구소", attributionRequired: true, attributionIncludedInCredits: true, usedInCutIds: ["C01"] }),
      makeAsset({ assetId: "a-no-credit", category: "brush-pack", attributionRequired: false }),
    ]);
    expect(compiled.entries).toHaveLength(2);
    expect(compiled.missingCreditAssetIds).toEqual(["a-tone"]);
    expect(compiled.formattedBlockKo).toContain("사용 컷: C02, C09");
    expect(compiled.formattedBlockKo).toContain("배달 손글씨체");
  });

  it("24. attributionTemplateKo 사용자 지정 문구가 우선 적용되고 대상이 없으면 안내 문구를 반환한다", () => {
    const custom = compileRequiredAttributionCreditsKo([makeAsset({ attributionRequired: true, attributionTemplateKo: "3D 배경 협찬: 아틀리에" })]);
    expect(custom.creditLinesKo).toEqual(["3D 배경 협찬: 아틀리에"]);
    const empty = compileRequiredAttributionCreditsKo([makeAsset({ attributionRequired: false })]);
    expect(empty.formattedBlockKo).toBe("필수 저작자 표기 대상 어셋이 없습니다.");
  });

  it("25. 6종 어셋 카테고리가 모두 포함된 스튜디오 에피소드 감사가 정확히 집계된다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({
        assets: [
          makeAsset({ assetId: "c1", category: "brush-pack" }),
          makeAsset({ assetId: "c2", category: "3d-background" }),
          makeAsset({ assetId: "c3", category: "texture-screentone" }),
          makeAsset({ assetId: "c4", category: "font-typeface" }),
          makeAsset({ assetId: "c5", category: "prop-model" }),
          makeAsset({ assetId: "c6", category: "audio-sfx", expiresOnIso: "2026-12-10" }),
        ],
      }),
    );
    expect(audit.totalAssetCount).toBe(6);
    expect(audit.clearedAssetCount).toBe(5);
    expect(audit.warningAssetCount).toBe(1);
    expect(audit.exportCleared).toBe(true);
  });

  it("26. 태그 자카드 유사도가 가장 높은 동일 카테고리 상업 안전 대체 어셋을 선택한다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({ assets: [makeAsset({ assetId: "blocked-bg", licenseTier: "non-commercial-personal", tags: ["현대", "야경", "옥상", "네온"] })] }),
    );
    const plan = recommendSafeAssetReplacements(audit, [
      makeCatalogAsset({ assetId: "safe-low", tags: ["현대", "낮", "공원"] }),
      makeCatalogAsset({ assetId: "safe-best", tags: ["현대", "야경", "옥상", "네온", "비"] }),
      makeCatalogAsset({ assetId: "safe-mid", tags: ["현대", "야경", "골목"] }),
    ]);
    expect(plan.recommendations[0]?.bestMatch?.candidate.assetId).toBe("safe-best");
    expect(plan.recommendations[0]?.bestMatch?.jaccardSimilarity).toBe(0.8);
    expect(plan.recommendations[0]?.alternatives.map((a) => a.candidate.assetId)).toEqual(["safe-best", "safe-mid", "safe-low"]);
  });

  it("27. 카테고리·범위·만료·좌석·비상업·미검증 부적격 후보는 카탈로그에서 엄격히 제외한다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({
        releaseDateIso: "2026-11-28",
        requestedScopes: ["webtoon-serial", "print-book", "physical-merch"],
        assets: [makeAsset({ assetId: "blocked-prop", category: "prop-model", licenseTier: "editorial-only", activeTeamSeatsUsed: 4, tags: ["카페", "머그컵"] })],
      }),
    );
    const plan = recommendSafeAssetReplacements(audit, [
      makeCatalogAsset({ assetId: "wrong-cat", category: "brush-pack", tags: ["카페", "머그컵"] }),
      makeCatalogAsset({ assetId: "no-merch", category: "prop-model", allowedScopes: ["webtoon-serial", "print-book"] }),
      makeCatalogAsset({ assetId: "expired", category: "prop-model", expiresOnIso: "2026-11-20" }),
      makeCatalogAsset({ assetId: "few-seats", category: "prop-model", seatLimit: 3 }),
      makeCatalogAsset({ assetId: "unverified", category: "prop-model", commercialClearanceVerified: false }),
      makeCatalogAsset({ assetId: "nc-tier", category: "prop-model", licenseTier: "cc-by-nc-4.0" }),
      makeCatalogAsset({ assetId: "valid-prop", category: "prop-model", seatLimit: 6, tags: ["카페"] }),
    ]);
    expect(plan.recommendations[0]?.alternatives).toHaveLength(1);
    expect(plan.recommendations[0]?.bestMatch?.candidate.assetId).toBe("valid-prop");
  });

  it("28. 기존 사용 좌석(existingSeatsInUse)을 합산해 여유 좌석이 부족한 후보를 제외한다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({ assets: [makeAsset({ assetId: "seat-overflow", seatLimit: 2, activeTeamSeatsUsed: 4, tags: ["도시"] })] }),
    );
    const plan = recommendSafeAssetReplacements(audit, [
      makeCatalogAsset({ assetId: "full-pool", seatLimit: 10, existingSeatsInUse: 7, tags: ["도시"] }),
      makeCatalogAsset({ assetId: "roomy-pool", seatLimit: 10, existingSeatsInUse: 5, tags: ["도시"] }),
    ]);
    expect(plan.recommendations[0]?.bestMatch?.candidate.assetId).toBe("roomy-pool");
    expect(plan.recommendations[0]?.bestMatch?.projectedSeatsUsed).toBe(9);
    expect(plan.recommendations[0]?.bestMatch?.spareSeatsAfterSwap).toBe(1);
  });

  it("29. 자카드 동점 시 만료 안정성·무표기·여유 좌석·assetId 순으로 결정론적 우선순위를 정한다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({ releaseDateIso: "2026-11-28", assets: [makeAsset({ assetId: "blocked-tie", licenseTier: "non-commercial-personal", tags: ["판타지", "성"] })] }),
    );
    const plan = recommendSafeAssetReplacements(audit, [
      makeCatalogAsset({ assetId: "z-expiring", expiresOnIso: "2026-12-10", tags: ["판타지", "성"] }),
      makeCatalogAsset({ assetId: "b-ccby", licenseTier: "cc-by-4.0", attributionRequired: true, expiresOnIso: "2028-01-01", tags: ["판타지", "성"] }),
      makeCatalogAsset({ assetId: "a-clean", attributionRequired: false, expiresOnIso: undefined, seatLimit: 8, tags: ["판타지", "성"] }),
    ]);
    expect(plan.recommendations[0]?.alternatives.map((c) => c.candidate.assetId)).toEqual(["a-clean", "b-ccby", "z-expiring"]);
  });

  it("30. excludeExpiringSoonCandidates 옵션으로 30일 이내 만료 후보를 제외할 수 있다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({ releaseDateIso: "2026-11-28", assets: [makeAsset({ assetId: "blocked-a", licenseTier: "non-commercial-personal", tags: ["옥상"] })] }),
    );
    const plan = recommendSafeAssetReplacements(
      audit,
      [makeCatalogAsset({ assetId: "soon-expiry", expiresOnIso: "2026-12-15", tags: ["옥상"] })],
      { excludeExpiringSoonCandidates: true },
    );
    expect(plan.matchedCount).toBe(0);
    expect(plan.unmatchedCount).toBe(1);
  });

  it("31. applySafeReplacementsAndReaudit가 모든 차단을 해소하고 재감사에서 exportCleared=true를 입증한다", () => {
    const project = makeProject({
      releaseDateIso: "2026-11-28",
      requestedScopes: ALL_FIVE_SCOPES,
      assets: [
        makeAsset({ assetId: "old-nc-brush", nameKo: "개인용 수채화 브러시", category: "brush-pack", licenseTier: "non-commercial-personal", allowedScopes: ["webtoon-serial"], tags: ["수채화", "배경", "구름"], usedInCutIds: ["C02", "C08"] }),
        makeAsset({ assetId: "old-webtoon-bg", nameKo: "연재 전용 교실 3D", category: "3d-background", licenseTier: "commercial-webtoon-only", allowedScopes: ["webtoon-serial"], seatLimit: 2, activeTeamSeatsUsed: 4, expiresOnIso: "2026-10-01", tags: ["학원", "교실", "창문"], usedInCutIds: ["C01"] }),
        makeAsset({ assetId: "old-ccby-font", nameKo: "오픈 효과음 폰트", category: "font-typeface", licenseTier: "cc-by-4.0", allowedScopes: ALL_FIVE_SCOPES, attributionRequired: true, attributionIncludedInCredits: false, tags: ["효과음", "굵은서체"], usedInCutIds: ["C03"] }),
      ],
    });
    const outcome = applySafeReplacementsAndReaudit(project, [
      makeCatalogAsset({ assetId: "safe-brush-watercolor", nameKo: "프로 수채화 구름 브러시 팩", category: "brush-pack", tags: ["수채화", "구름", "하늘"] }),
      makeCatalogAsset({ assetId: "safe-bg-classroom-ent", nameKo: "기업형 학원 교실 3D 세트", category: "3d-background", licenseTier: "custom-enterprise", seatLimit: 12, expiresOnIso: "2029-12-31", tags: ["학원", "교실", "창문", "햇빛"] }),
    ]);
    expect(outcome.initialAudit.exportCleared).toBe(false);
    expect(outcome.appliedSwaps).toHaveLength(2);
    expect(outcome.autoCreditedAssetIds).toEqual(["old-ccby-font"]);
    expect(outcome.unresolvedBlockedAssetIds).toEqual([]);
    expect(outcome.reAudit.blockerCount).toBe(0);
    expect(outcome.reAudit.exportCleared).toBe(true);
    expect(outcome.clearedAfterReaudit).toBe(true);
    expect(project.assets[0]?.assetId).toBe("old-nc-brush");
    expect(outcome.updatedProject.assets[0]?.usedInCutIds).toEqual(["C02", "C08"]);
  });

  it("32. 대체 후보가 전혀 없으면 재감사에서도 fail-closed(clearedAfterReaudit=false)를 유지한다", () => {
    const outcome = applySafeReplacementsAndReaudit(
      makeProject({ assets: [makeAsset({ assetId: "unreplaceable-sfx", category: "audio-sfx", licenseTier: "editorial-only" })] }),
      [],
    );
    expect(outcome.clearedAfterReaudit).toBe(false);
    expect(outcome.reAudit.exportCleared).toBe(false);
    expect(outcome.unresolvedBlockedAssetIds).toEqual(["unreplaceable-sfx"]);
    expect(outcome.replacementPlan.allBlockersResolvable).toBe(false);
  });

  it("33. 어셋·요청 범위·태그 순서를 섞어도 SHA-256 클리어런스 증명서 지문이 완전히 동일하다", () => {
    const a1 = makeAsset({ assetId: "a1", tags: ["현대", "야경"], usedInCutIds: ["C01", "C05"] });
    const b2 = makeAsset({ assetId: "b2", category: "font-typeface", nameKo: "제목 서체", tags: ["고딕", "제목"] });
    const first = auditEpisodeRightsBomClearance(
      makeProject({ requestedScopes: ["webtoon-serial", "print-book", "physical-merch"], assets: [a1, b2] }),
    );
    const second = auditEpisodeRightsBomClearance(
      makeProject({
        requestedScopes: ["physical-merch", "webtoon-serial", "print-book"],
        assets: [
          { ...b2, tags: ["제목", "고딕"] },
          { ...a1, tags: ["야경", "현대"], usedInCutIds: ["C05", "C01"] },
        ],
      }),
    );
    expect(first.clearanceCertificateSha256Hex).toBe(second.clearanceCertificateSha256Hex);
  });

  it("34. 배포 범위나 좌석 수 등 단 한 항목만 바뀌어도 SHA-256 증명서 지문이 달라진다", () => {
    const base = auditEpisodeRightsBomClearance(makeProject({ requestedScopes: ["webtoon-serial"] }));
    const expanded = auditEpisodeRightsBomClearance(makeProject({ requestedScopes: ["webtoon-serial", "physical-merch"] }));
    expect(base.clearanceCertificateSha256Hex).not.toBe(expanded.clearanceCertificateSha256Hex);
  });

  it("35. renderRightsBomClearanceSvg가 순수 oklch 색상만 사용하고 원시 색상을 전혀 포함하지 않는다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({
        requestedScopes: ALL_FIVE_SCOPES,
        assets: [
          makeAsset({ assetId: "ok-1" }),
          makeAsset({ assetId: "blocked-1", licenseTier: "commercial-webtoon-only", allowedScopes: ["webtoon-serial"], tags: ["현대", "야경", "옥상"] }),
        ],
      }),
    );
    const svg = renderRightsBomClearanceSvg(audit, {
      replacementPlan: recommendSafeAssetReplacements(audit, [makeCatalogAsset()]),
    });
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).toContain(audit.clearanceCertificateId);
    expect(svg).toContain(audit.clearanceCertificateSha256Hex);
    expect(svg).toContain("<polygon ");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("36. SVG 렌더러가 XSS 페이로드와 XML 특수문자를 완전히 이스케이프한다", () => {
    const payload = `<script>alert("xss")</script> & 'danger'`;
    expect(escapeRightsBomXml(payload)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;danger&apos;",
    );
    const audit = auditEpisodeRightsBomClearance(
      makeProject({
        projectTitleKo: `테스트 ${payload}`,
        assets: [makeAsset({ nameKo: `어셋 ${payload}`, vendor: `벤더 ${payload}` })],
      }),
    );
    const svg = renderRightsBomClearanceSvg(audit, { width: Number.NaN });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("NaN");
  });

  it("37. summarizeRightsBomClearanceKo가 한국어 PD 검수 보고서에 차단·대체·크레딧·증명서를 모두 기록한다", () => {
    const audit = auditEpisodeRightsBomClearance(
      makeProject({
        requestedScopes: ["webtoon-serial", "print-book"],
        assets: [
          makeAsset({ assetId: "blocked-bg", nameKo: "비상업 테스트 배경", licenseTier: "non-commercial-personal", allowedScopes: ["webtoon-serial"], tags: ["현대", "야경", "옥상"], usedInCutIds: ["C04"] }),
          makeAsset({ assetId: "soon-font", nameKo: "만료 임박 타이틀 서체", category: "font-typeface", licenseTier: "cc-by-4.0", allowedScopes: ["webtoon-serial", "print-book"], expiresOnIso: "2026-12-10", attributionRequired: true, attributionIncludedInCredits: true }),
        ],
      }),
    );
    const report = summarizeRightsBomClearanceKo(audit, {
      replacementPlan: recommendSafeAssetReplacements(audit, [makeCatalogAsset()]),
    });
    expect(report).toContain("[Rights BOM 출고 감사 보고서]");
    expect(report).toContain("출고 차단");
    expect(report).toContain("비상업 테스트 배경");
    expect(report).toContain("만료 임박 타이틀 서체");
    expect(report).toContain("서울 야경 옥상 프로 에디션");
    expect(report).toContain("[사용 어셋 저작자 표기]");
    expect(report).toContain(audit.clearanceCertificateSha256Hex);
  });

  it("38. autoIncludeAttributionCredits=false 설정 시 CC-BY 표기 누락 어셋은 자동 승인되지 않고 차단된다", () => {
    const outcome = applySafeReplacementsAndReaudit(
      makeProject({
        assets: [makeAsset({ assetId: "ccby-no-auto", category: "font-typeface", licenseTier: "cc-by-4.0", attributionRequired: true, attributionIncludedInCredits: false })],
      }),
      [],
      { autoIncludeAttributionCredits: false },
    );
    expect(outcome.clearedAfterReaudit).toBe(false);
    expect(outcome.reAudit.violations[0]?.code).toBe("missing-attribution-credit");
  });
});
