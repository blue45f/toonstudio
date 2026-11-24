// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_DERIVATIVE_ROYALTY_RULES,
  DEFAULT_EXPORT_RIGHTS_BOM_ITEMS,
  DEFAULT_LEDGER_TIMESTAMP_ISO,
  INVISIBLE_PSNR_FLOOR_DB,
  StudioRightsWatermarkGatePanel,
  TOTAL_SHARE_BPS,
  appendLedgerBlock,
  calculateDerivativeRoyaltySettlement,
  calculateKoreanTaxSettlement,
  canonicalizeJson,
  createDefaultRightsSettlementFixture,
  createDemoWebtoonWatermarkCanvas,
  createRightsSettlementLedger,
  embedAdaptiveAiWatermark,
  evaluateWatermarkAttackScenario,
  evaluateWatermarkExportPreflightGate,
  extractAdaptiveAiWatermark,
  sha256Hex,
  simulateLedgerBlockTamper,
  validateContributorSplits,
  validateDerivativeRoyaltyRule,
  verifyRightsSettlementLedger,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/;

describe("rights-settlement-watermark: C2PA 권리·자동 정산 원장 + 적응형 동적 수위 AI 워터마킹 출고 게이트", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("FIPS 180-4 SHA-256 표준 벡터와 정규화 JSON 결정론성을 검증한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(canonicalizeJson({ b: 2, a: 1, c: undefined })).toBe('{"a":1,"b":2}');
    expect(canonicalizeJson({ a: 1, b: 2 })).toBe(canonicalizeJson({ b: 2, a: 1 }));
  });

  it("6개 직무 기여 지분 합계 정확히 10,000 bps(= 100.00%)를 엄격 검증하고 오차 시 차단한다", () => {
    const fixture = createDefaultRightsSettlementFixture();
    const ok = validateContributorSplits(fixture.contributors);
    expect(ok.valid).toBe(true);
    expect(ok.totalBps).toBe(TOTAL_SHARE_BPS);
    expect(ok.deltaBps).toBe(0);
    expect(ok.roleCoverage).toEqual([
      "original-story",
      "art-lead",
      "lineart",
      "coloring",
      "background",
      "lettering",
    ]);

    // 9,999 bps 부족 거부
    const shortSplits = fixture.contributors.map((c, idx) =>
      idx === 0 ? { ...c, shareBps: c.shareBps - 1 } : c,
    );
    const shortRes = validateContributorSplits(shortSplits);
    expect(shortRes.valid).toBe(false);
    expect(shortRes.deltaBps).toBe(-1);
    expect(shortRes.issues.some((i) => i.code === "TOTAL_BPS_MISMATCH")).toBe(true);

    // 10,001 bps 초과 거부
    const overSplits = fixture.contributors.map((c, idx) =>
      idx === 0 ? { ...c, shareBps: c.shareBps + 1 } : c,
    );
    expect(validateContributorSplits(overSplits).valid).toBe(false);
    expect(() =>
      calculateKoreanTaxSettlement({
        workId: fixture.workId,
        periodLabel: "2026-11",
        grossRevenueKrw: 10_000_000,
        contributors: overSplits,
      }),
    ).toThrow(/10,000 bps/);

    // 소수점 bps 및 중복 ID 거부
    const invalidSplits = [
      { ...fixture.contributors[0]!, shareBps: 5000.5 },
      { ...fixture.contributors[0]!, shareBps: 4999.5 },
    ];
    const invalidRes = validateContributorSplits(invalidSplits);
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.issues.some((i) => i.code === "INVALID_SHARE_BPS")).toBe(true);
    expect(invalidRes.issues.some((i) => i.code === "DUPLICATE_CONTRIBUTOR_ID")).toBe(true);
  });

  it("한국 원천징수 3.3% / 사업자 부가세 10% 자동 정산과 0원 오차 배분·2차 창작 로열티 분배를 검증한다", () => {
    const fixture = createDefaultRightsSettlementFixture();

    // 1) 12,000,000원 표준 배분 (사업자 부가세 10% 별도 가산 모드)
    const stmt = calculateKoreanTaxSettlement({
      workId: fixture.workId,
      periodLabel: "2026-11",
      grossRevenueKrw: 12_000_000,
      contributors: fixture.contributors,
      vatMode: "exclusive-add-10",
    });
    expect(stmt.totalAllocatedGrossKrw).toBe(12_000_000);

    // 원작(2,500 bps = 3,000,000원, 프리랜서 3.3%): 소득세 90,000 + 지방소득세 9,000 = 99,000원 차감 -> 2,901,000원
    const storyLine = stmt.lines.find((l) => l.role === "original-story");
    expect(storyLine?.allocatedGrossKrw).toBe(3_000_000);
    expect(storyLine?.incomeTaxKrw).toBe(90_000);
    expect(storyLine?.localIncomeTaxKrw).toBe(9_000);
    expect(storyLine?.withholdingTaxTotalKrw).toBe(99_000);
    expect(storyLine?.netPayoutKrw).toBe(2_901_000);

    // 배경(1,200 bps = 1,440,000원, 사업자 10%): 부가세 +144,000원 가산 -> 1,584,000원
    const bgLine = stmt.lines.find((l) => l.role === "background");
    expect(bgLine?.allocatedGrossKrw).toBe(1_440_000);
    expect(bgLine?.vatKrw).toBe(144_000);
    expect(bgLine?.taxDirection).toBe("added-vat");
    expect(bgLine?.netPayoutKrw).toBe(1_584_000);

    // 2) 소수 원 단위 발생 금액(10,000,003원)도 최대 잔여법으로 합계 1원 오차 없이 보존
    const oddStmt = calculateKoreanTaxSettlement({
      workId: fixture.workId,
      periodLabel: "2026-11",
      grossRevenueKrw: 10_000_003,
      contributors: fixture.contributors,
      vatMode: "inclusive-extract-10",
    });
    expect(oddStmt.totalAllocatedGrossKrw).toBe(10_000_003);
    const inclusiveBg = oddStmt.lines.find((l) => l.role === "background");
    expect(inclusiveBg?.taxDirection).toBe("included-vat");
    expect((inclusiveBg?.supplyAmountKrw ?? 0) + (inclusiveBg?.vatKrw ?? 0)).toBe(inclusiveBg?.allocatedGrossKrw);

    // 3) 2차 창작 로열티 분배 (굿즈 40,000,000원 -> 원본 팀 15% = 6,000,000원 -> 6직무 자동 분배)
    const goodsRule = DEFAULT_DERIVATIVE_ROYALTY_RULES[0]!;
    expect(validateDerivativeRoyaltyRule(goodsRule).valid).toBe(true);
    const deriv = calculateDerivativeRoyaltySettlement({
      workId: fixture.workId,
      periodLabel: "2026-11",
      derivativeGrossRevenueKrw: 40_000_000,
      rule: goodsRule,
      contributors: fixture.contributors,
    });
    expect(deriv.upstreamOriginalPoolKrw).toBe(6_000_000);
    expect(deriv.derivativeCreatorPoolKrw).toBe(26_000_000);
    expect(deriv.platformFeePoolKrw).toBe(8_000_000);
    expect(deriv.upstreamOriginalPoolKrw + deriv.derivativeCreatorPoolKrw + deriv.platformFeePoolKrw).toBe(40_000_000);
    expect(deriv.upstreamTeamStatement.totalAllocatedGrossKrw).toBe(6_000_000);
  });

  it("C2PA v2.1 매니페스트·JSON-LD 스키마(로컬 구현 vs 외부 연동 명시)와 SHA-256 해시 체인 변조 감지를 검증한다", () => {
    const fixture = createDefaultRightsSettlementFixture();
    let ledger = createRightsSettlementLedger({
      workId: fixture.workId,
      episodeTitle: fixture.episodeTitle,
      contributors: fixture.contributors,
      createdAtIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
    });

    // 과장·허위 온체인 주장 금지 계약 검증
    expect(ledger.capabilityBoundary.executionMode).toBe("local-verified-hash-chain");
    expect(ledger.capabilityBoundary.onChainBroadcastExecuted).toBe(false);
    expect(ledger.capabilityBoundary.x509CaSigned).toBe(false);
    expect(ledger.smartContractJsonLd.deploymentStatus).toBe("offchain-local-schema-only");
    expect(ledger.smartContractJsonLd.onChainBroadcastExecuted).toBe(false);
    expect(ledger.manifest.specVersion).toBe("2.1");
    expect(ledger.manifest.assertions.trainingMining.data.entries["c2pa.ai_training"].use).toBe("notAllowed");

    const stmt = calculateKoreanTaxSettlement({
      workId: fixture.workId,
      periodLabel: "2026-11",
      grossRevenueKrw: 12_000_000,
      contributors: fixture.contributors,
    });
    ledger = appendLedgerBlock(ledger, {
      eventType: "settlement-payout",
      timestampIso: "2026-11-24T01:00:00Z",
      payload: { statementId: stmt.statementId, totalNetPayoutKrw: stmt.totalNetPayoutKrw },
    });
    ledger = appendLedgerBlock(ledger, {
      eventType: "watermark-seal",
      timestampIso: "2026-11-24T02:00:00Z",
      payload: { overallPsnrDb: 43.2, payloadTagHex: "a1b2" },
    });

    const verified = verifyRightsSettlementLedger(ledger);
    expect(verified.valid).toBe(true);
    expect(verified.intactHashChain).toBe(true);
    expect(verified.manifestIntact).toBe(true);
    expect(verified.splitsValid10000Bps).toBe(true);
    expect(verified.checkedBlocks).toBe(3);
    expect(verified.tamperedBlockIndices).toEqual([]);

    // 블록 #1 페이로드 변조 시 정확히 #1 변조 탐지
    const tampered = simulateLedgerBlockTamper(ledger, 1, "FORGED_NET_PAYOUT");
    const tamperedCheck = verifyRightsSettlementLedger(tampered);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.intactHashChain).toBe(false);
    expect(tamperedCheck.tamperedBlockIndices).toContain(1);
    expect(tamperedCheck.issues.some((i) => i.code === "PAYLOAD_HASH_MISMATCH")).toBe(true);

    // 매니페스트 임의 변조 탐지
    const tamperedManifest = {
      ...ledger,
      manifest: { ...ledger.manifest, episodeTitle: "위조된 회차 제목" },
    };
    const manifestCheck = verifyRightsSettlementLedger(tamperedManifest);
    expect(manifestCheck.valid).toBe(false);
    expect(manifestCheck.manifestIntact).toBe(false);
    expect(manifestCheck.issues.some((i) => i.code === "MANIFEST_CLAIM_HASH_MISMATCH")).toBe(true);
  });

  it("적응형 동적 수위 AI 워터마크가 피부 PSNR >= 38 dB·고주파 강화·블라인드 역추출 및 크롭/재압축/AI 변조 탐지를 수행한다", () => {
    const canvas = createDemoWebtoonWatermarkCanvas(128, 128);
    const embedded = embedAdaptiveAiWatermark(canvas, 128, 128, {
      authorId: "han-jiwoo",
      workId: "ts-ep042",
      timestampIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
      strength: 3,
    });

    // 1) 화질 보증: 전체 & 단색 피부 영역 모두 PSNR >= 38 dB, 피부 영역은 고주파 영역보다 더 낮은 수위 & 높은 PSNR 유지
    expect(embedded.psnrPass).toBe(true);
    expect(embedded.overallPsnrDb).toBeGreaterThanOrEqual(INVISIBLE_PSNR_FLOOR_DB);
    expect(embedded.flatRegionPsnrDb).toBeGreaterThanOrEqual(INVISIBLE_PSNR_FLOOR_DB);
    expect(embedded.flatRegionPsnrDb).toBeGreaterThan(embedded.highFreqRegionPsnrDb);

    const flatMetric = embedded.regionMetrics.find((m) => m.region === "flat-skin-cel");
    const highMetric = embedded.regionMetrics.find((m) => m.region === "high-freq-hair-bg");
    expect(flatMetric?.blockCount).toBeGreaterThan(20);
    expect(highMetric?.blockCount).toBeGreaterThan(20);
    expect(highMetric!.meanAdaptiveMargin).toBeGreaterThan(flatMetric!.meanAdaptiveMargin * 1.3);
    expect(highMetric!.meanEntropy).toBeGreaterThan(flatMetric!.meanEntropy);

    // 2) 원본 무손실 블라인드 역추출 (authorId · workId · timestamp · CRC-16)
    const clean = extractAdaptiveAiWatermark(embedded.pixels, embedded.width, embedded.height, {
      expectedAuthorId: "han-jiwoo",
      expectedWorkId: "ts-ep042",
      expectedTimestampIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
    });
    expect(clean.detected).toBe(true);
    expect(clean.crcValid).toBe(true);
    expect(clean.payloadMatchedExpected).toBe(true);
    expect(clean.extractedAuthorId).toBe("han-jiwoo");
    expect(clean.extractedWorkId).toBe("ts-ep042");
    expect(clean.extractedTimestampIso).toBe("2026-11-24T00:00:00.000Z");
    expect(clean.detectionConfidence).toBeGreaterThanOrEqual(0.85);
    expect(clean.tamperDetected).toBe(false);
    expect(clean.verdict).toBe("VERIFIED_INTACT");

    // 3) 크롭 20% (비정렬 11px 시프트) 공격 후 자동 위상 재동기화 및 페이로드 생존
    const cropReport = evaluateWatermarkAttackScenario(embedded, "crop-20pct");
    expect(cropReport.extraction.detected).toBe(true);
    expect(cropReport.extraction.crcValid).toBe(true);
    expect(cropReport.extraction.extractedAuthorId).toBe("han-jiwoo");
    expect(cropReport.extraction.extractedWorkId).toBe("ts-ep042");
    expect(cropReport.extraction.detectionConfidence).toBeGreaterThanOrEqual(0.7);

    // 4) JPEG Q70 DCT 양자화 재압축 후 페이로드 복원
    const jpegReport = evaluateWatermarkAttackScenario(embedded, "recompress-jpeg-q70");
    expect(jpegReport.extraction.detected).toBe(true);
    expect(jpegReport.extraction.crcValid).toBe(true);
    expect(jpegReport.extraction.extractedAuthorId).toBe("han-jiwoo");
    expect(jpegReport.extraction.extractedWorkId).toBe("ts-ep042");

    // 5) AI 국소 인페인팅 변조(32%) 공격 시 원본 서명 복원 + 국소 변조 블록 탐지
    const aiTamperReport = evaluateWatermarkAttackScenario(embedded, "ai-inpaint-tamper");
    expect(aiTamperReport.extraction.detected).toBe(true);
    expect(aiTamperReport.extraction.extractedAuthorId).toBe("han-jiwoo");
    expect(aiTamperReport.extraction.tamperDetected).toBe(true);
    expect(aiTamperReport.extraction.tamperedBlockRatio).toBeGreaterThanOrEqual(0.08);
    expect(aiTamperReport.extraction.verdict).toBe("TAMPER_DETECTED");
  });

  it("Rights BOM + C2PA 원장 + 적응형 워터마크 통합 출고 프리플라이트 게이트의 통과/차단을 검증한다", () => {
    const fixture = createDefaultRightsSettlementFixture();
    const ledger = createRightsSettlementLedger({
      workId: fixture.workId,
      episodeTitle: fixture.episodeTitle,
      contributors: fixture.contributors,
      createdAtIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
    });
    const ledgerOk = verifyRightsSettlementLedger(ledger);
    const canvas = createDemoWebtoonWatermarkCanvas(128, 128);
    const embedded = embedAdaptiveAiWatermark(canvas, 128, 128, {
      authorId: "han-jiwoo",
      workId: fixture.workId,
      timestampIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
      strength: 3,
    });
    const extracted = extractAdaptiveAiWatermark(embedded.pixels, 128, 128, {
      expectedAuthorId: "han-jiwoo",
      expectedWorkId: fixture.workId,
      expectedTimestampIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
    });

    // 정상 통과
    const passGate = evaluateWatermarkExportPreflightGate({
      targetChannel: "commercial-webtoon",
      nowIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
      rightsBomItems: DEFAULT_EXPORT_RIGHTS_BOM_ITEMS,
      watermarkEmbed: embedded,
      watermarkExtract: extracted,
      ledgerVerification: ledgerOk,
    });
    expect(passGate.status).toBe("PASS");
    expect(passGate.exportAllowed).toBe(true);

    // 비상업 에셋 또는 만료 에셋 포함 시 즉시 BLOCK
    const blockedBom = evaluateWatermarkExportPreflightGate({
      targetChannel: "commercial-webtoon",
      nowIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
      rightsBomItems: [
        ...DEFAULT_EXPORT_RIGHTS_BOM_ITEMS,
        {
          assetId: "asset-nc",
          assetName: "비상업 테스트 폰트",
          kind: "font",
          licenseName: "CC-BY-NC",
          commercialUseAllowed: false,
          aiTrainingAllowed: false,
          attributionRequired: true,
          attributionIncluded: true,
        },
      ],
      watermarkEmbed: embedded,
      watermarkExtract: extracted,
      ledgerVerification: ledgerOk,
    });
    expect(blockedBom.status).toBe("BLOCK");
    expect(blockedBom.exportAllowed).toBe(false);

    // 원장 변조 시 즉시 BLOCK
    const tamperedCheck = verifyRightsSettlementLedger(simulateLedgerBlockTamper(ledger, 0));
    const blockedLedger = evaluateWatermarkExportPreflightGate({
      targetChannel: "commercial-webtoon",
      nowIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
      rightsBomItems: DEFAULT_EXPORT_RIGHTS_BOM_ITEMS,
      watermarkEmbed: embedded,
      watermarkExtract: extracted,
      ledgerVerification: tamperedCheck,
    });
    expect(blockedLedger.status).toBe("BLOCK");
    expect(blockedLedger.exportAllowed).toBe(false);
  });

  it("StudioRightsWatermarkGatePanel 단독 렌더·3탭 상호작용·KO/EN·Calm Atelier 정적 위생·800줄 상한을 전수 검증한다", () => {
    const createObjectUrlSpy = vi.fn(() => "blob:rights-watermark-jsonld");
    const revokeObjectUrlSpy = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectUrlSpy, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectUrlSpy, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    // 1) Props 없이 단독 렌더
    const { container, unmount } = render(<StudioRightsWatermarkGatePanel />);
    expect(screen.getByText("C2PA 원본 권리·자동 정산 원장 & AI 워터마크 출고 게이트")).toBeTruthy();
    expect(screen.getByText(/로컬 검증 원장 · 온체인 미실행/)).toBeTruthy();
    expect(screen.getByText(/지분 합계 10,000 \/ 10,000 bps/)).toBeTruthy();
    expect(container.innerHTML).toContain("[word-break:keep-all]");
    expect(container.innerHTML).toContain("tabular-nums");
    expect(container.innerHTML).not.toContain("transition-all");

    // 2) Tab 1: 10,000 bps 불일치 입력 -> 오류 탐지 -> 복원 + JSON-LD 저장
    const storyBpsInput = screen.getByLabelText("한지우 (원작) bps") as HTMLInputElement;
    fireEvent.change(storyBpsInput, { target: { value: "2600" } });
    expect(screen.getByText(/10,100 \/ 10,000 bps/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /10,000 bps 기준 복원/ }));
    expect(screen.getByText(/지분 합계 10,000 \/ 10,000 bps/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /C2PA · JSON-LD 저장/ }));
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:rights-watermark-jsonld");

    // 3) Tab 2: 해시 체인 변조 시뮬레이션 -> 감지 -> 복구
    fireEvent.click(screen.getByRole("tab", { name: "해시 체인 무결성 감사" }));
    expect(screen.getByText(/SHA-256 해시 체인 무결성 통과/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /블록 변조 시뮬레이션/ }));
    expect(screen.getByText(/원장 변조 감지됨/)).toBeTruthy();
    expect(screen.getByText(/출고 게이트: BLOCK/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /원본 체인 복구/ }));
    expect(screen.getByText(/SHA-256 해시 체인 무결성 통과/)).toBeTruthy();

    // 4) Tab 3: 적응형 워터마크 공격 시뮬레이터 + Rights BOM 충돌 테스트
    fireEvent.click(screen.getByRole("tab", { name: "적응형 AI 워터마크 · 출고 게이트" }));
    expect(screen.getByText(/전체 비가시 화질/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "AI 국소 변조(32%)" }));
    expect(screen.getByText(/TAMPER_DETECTED/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Rights BOM 비상업 에셋 충돌 테스트/ }));
    expect(screen.getByText(/출고 게이트: BLOCK/)).toBeTruthy();
    unmount();

    // 5) EN 로케일 단독 렌더
    useI18n.setState({ lang: "en" });
    const enView = render(<StudioRightsWatermarkGatePanel initialTab="watermark" />);
    expect(screen.getByText("C2PA Rights Ledger & Adaptive AI Watermark Gate")).toBeTruthy();
    expect(screen.getByText(/Adaptive Watermark & Gate/)).toBeTruthy();
    enView.unmount();

    // 6) 소스 파일 정적 위생 & 800줄 상한 검증
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/rights-settlement-watermark");
    const files = [
      "c2pa-rights-settlement-ledger.ts",
      "adaptive-ai-watermark-gate.ts",
      "StudioRightsWatermarkGatePanel.tsx",
      "index.ts",
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(dir, file), "utf8");
      const lineCount = src.split("\n").length;
      expect(lineCount, `${file} must be <= 800 lines`).toBeLessThanOrEqual(800);
      expect(RAW_COLOR_REGEX.test(src), `${file} must not contain raw hex/rgb/hsl`).toBe(false);
      expect(FORBIDDEN_STORAGE_REGEX.test(src), `${file} must not reference browser storage`).toBe(false);
      expect(src.includes("transition-all"), `${file} must not contain transition-all`).toBe(false);
    }
  });
});
