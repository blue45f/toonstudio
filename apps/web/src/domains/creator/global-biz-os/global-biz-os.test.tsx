// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProductionSampleJourneyGuide } from "../production-hub/ProductionSampleJourneyGuide";

import { StudioGlobalBizOsPanel } from "./StudioGlobalBizOsPanel";
import {
  DEFAULT_WEBNOVEL_SAMPLE,
  FANDOM_LICENSE_TIERS,
  FANDOM_LICENSE_TIER_LIST,
  OMNIBUS_VIRTUAL_STUDIO_EVENT,
  buildOmnibusVirtualStudioPreset,
  createFandomLicenseLedgerEntry,
  directNovelToStoryboard,
  dispatchOmnibusStudioPreset,
  exportFandomLedgerCsv,
  rebalanceFandomSplitShares,
  validateFandomSplitInvariant,
  type OmnibusVirtualStudioPresetPayload,
} from "./fandom-ip-storyboard-omnibus-engine";
import {
  CURRENCY_LIST,
  DEFAULT_CROSS_BORDER_INPUT,
  DEFAULT_STUDIO_BEP_INPUT,
  STUDIO_BEP_PRESETS,
  TAX_JURISDICTION_LIST,
  TAX_LEGAL_REVIEW_NOTICE_KO,
  calculateCrossBorderSettlement,
  exportCrossBorderStatementCsv,
  exportCrossBorderStatementJson,
  formatCurrencyAmount,
  simulateStudioBep,
  type TaxJurisdictionCode,
} from "./studio-bep-crossborder-tax-engine";

afterEach(() => cleanup());

describe("스튜디오 제작 원가 · 회차별 손익분기(BEP) 시뮬레이터", () => {
  it("기본 스튜디오 입력으로 회차당 원가·BEP 도달 회차·회수율·순이익률을 정확히 산출한다", () => {
    const result = simulateStudioBep(DEFAULT_STUDIO_BEP_INPUT);
    // 650k + 70*14k(980k) + 70*12k(840k) + 420k + 240k + 520k = 3,650,000 + 고정비 350,000 = 4,000,000
    expect(result.costPerEpisodeKrw).toBe(4_000_000);
    expect(result.costPerCutKrw).toBe(Math.round(4_000_000 / 70));
    expect(result.paidReadersPerEpisode).toBe(6_970);
    expect(result.grossRevenuePerEpisodeKrw).toBe(9_409_500);
    expect(result.studioRsPerEpisodeKrw).toBe(4_704_750);
    expect(result.bepEpisode).toBe(15);
    expect(result.exactBepEpisode).toBe(14.2);
    expect(result.cumulativeRecoveryRatePercent).toBeGreaterThan(110);
    expect(result.expectedNetMarginPercent).toBeGreaterThan(10);
    expect(result.mgRecoupmentStatus).toBe("recouped");
  });

  it("컷당 단가 공정은 회차당 컷 수와 인원 수에 비례해 원가가 변동한다", () => {
    const base = simulateStudioBep(DEFAULT_STUDIO_BEP_INPUT);
    const expanded = simulateStudioBep({
      ...DEFAULT_STUDIO_BEP_INPUT,
      cutsPerEpisode: 100,
    });
    // 컷 수 +30컷 × (선화 14,000 + 채색 12,000) = +780,000원
    expect(expanded.costPerEpisodeKrw - base.costPerEpisodeKrw).toBe(780_000);
  });

  it("MG 선인세 미회수 상태와 순수 RS 모드를 구분한다", () => {
    const unrecouped = simulateStudioBep({
      ...DEFAULT_STUDIO_BEP_INPUT,
      platformMgPerEpisodeKrw: 6_000_000,
      mgRecoupmentEnabled: true,
    });
    expect(unrecouped.mgRecoupmentStatus).toBe("unrecouped");
    expect(unrecouped.effectiveStudioRevenuePerEpisodeKrw).toBe(6_000_000);

    const pureRs = simulateStudioBep({
      ...DEFAULT_STUDIO_BEP_INPUT,
      mgRecoupmentEnabled: false,
    });
    expect(pureRs.mgRecoupmentStatus).toBe("no-mg");
    expect(pureRs.effectiveStudioRevenuePerEpisodeKrw).toBe(pureRs.studioRsPerEpisodeKrw);
  });

  it("회차별 스케줄에서 BEP 도달 회차 직전은 적자, 도달 회차부터 흑자로 전환된다", () => {
    const result = simulateStudioBep(DEFAULT_STUDIO_BEP_INPUT);
    expect(result.bepEpisode).not.toBeNull();
    const bepIdx = (result.bepEpisode ?? 1) - 1;
    expect(result.episodeSchedule[bepIdx - 1]?.cumulativeNetProfitKrw).toBeLessThan(0);
    expect(result.episodeSchedule[bepIdx]?.cumulativeNetProfitKrw).toBeGreaterThanOrEqual(0);
  });

  it("회차당 원가가 수익을 초과하면 BEP 미도달(null)과 개선 안내를 반환한다", () => {
    const deficit = simulateStudioBep({
      ...DEFAULT_STUDIO_BEP_INPUT,
      platformMgPerEpisodeKrw: 1_000_000,
      avgReadersPerEpisode: 10_000,
      paidConversionRatePercent: 2,
    });
    expect(deficit.bepEpisode).toBeNull();
    expect(deficit.exactBepEpisode).toBeNull();
    expect(deficit.totalNetProfitKrw).toBeLessThan(0);
    expect(deficit.diagnosisKo).toContain("도달하지 못합니다");
  });

  it("초기 선투자비가 0원이고 회차 수익이 원가 이상이면 1화에 즉시 BEP에 도달한다", () => {
    const immediate = simulateStudioBep({
      ...DEFAULT_STUDIO_BEP_INPUT,
      initialSetupCostKrw: 0,
    });
    expect(immediate.bepEpisode).toBe(1);
    expect(immediate.exactBepEpisode).toBe(1);
  });

  it("내장 스튜디오 프리셋 3종 모두 결정론적으로 유효한 손익 결과를 계산한다", () => {
    expect(STUDIO_BEP_PRESETS).toHaveLength(3);
    for (const preset of STUDIO_BEP_PRESETS) {
      const first = simulateStudioBep(preset.input);
      const second = simulateStudioBep(preset.input);
      expect(first).toEqual(second);
      expect(first.costPerEpisodeKrw).toBeGreaterThan(0);
      expect(first.episodeSchedule).toHaveLength(preset.input.plannedEpisodes);
    }
  });
});

describe("글로벌 크로스보더 다통화 정산 · 7개국 원천징수 세무 계산기", () => {
  it("7개국(KR 3.3%, US/JP/VN/TH/ID/PH 10%) 조세조약 원천징수 세율을 정확히 적용한다", () => {
    const expectedRates: Record<TaxJurisdictionCode, number> = {
      KR: 3.3,
      US: 10,
      JP: 10,
      VN: 10,
      TH: 10,
      ID: 10,
      PH: 10,
    };
    const statement = calculateCrossBorderSettlement({
      settlementPeriod: "2026-10",
      studioName: "테스트 스튜디오",
      payoutCurrency: "KRW",
      transferFeeRatePercent: 0,
      lines: TAX_JURISDICTION_LIST.map((rule) => ({
        id: `all-${rule.code}`,
        platformLabel: `${rule.countryKo} 플랫폼`,
        jurisdiction: rule.code,
        sourceCurrency: "KRW",
        grossAmountSource: 10_000_000,
        treatyDocumentSubmitted: true,
      })),
    });

    expect(statement.lines).toHaveLength(7);
    for (const line of statement.lines) {
      expect(line.withholdingRatePercent).toBe(expectedRates[line.jurisdiction]);
      expect(line.withholdingTaxKrw).toBe(Math.round(10_000_000 * (expectedRates[line.jurisdiction] / 100)));
    }
  });

  it("해외 조세조약 서류 미제출 시 법정 원천징수 세율(US 30%, JP 20.42%)을 적용한다", () => {
    const statement = calculateCrossBorderSettlement({
      settlementPeriod: "2026-10",
      studioName: "테스트 스튜디오",
      payoutCurrency: "KRW",
      transferFeeRatePercent: 0,
      lines: [
        {
          id: "us-no-w8",
          platformLabel: "US 플랫폼",
          jurisdiction: "US",
          sourceCurrency: "USD",
          grossAmountSource: 1_000,
          treatyDocumentSubmitted: false,
        },
        {
          id: "jp-no-cor",
          platformLabel: "JP 플랫폼",
          jurisdiction: "JP",
          sourceCurrency: "JPY",
          grossAmountSource: 100_000,
          treatyDocumentSubmitted: false,
        },
      ],
    });
    expect(statement.lines[0]?.withholdingRatePercent).toBe(30);
    expect(statement.lines[1]?.withholdingRatePercent).toBe(20.42);
  });

  it("7개 통화(KRW/USD/JPY/VND/THB/IDR/PHP) 기준 환율과 사용자 지정 환율 오버라이드를 반영한다", () => {
    expect(CURRENCY_LIST.map((c) => c.code)).toEqual(["KRW", "USD", "JPY", "VND", "THB", "IDR", "PHP"]);
    const custom = calculateCrossBorderSettlement({
      settlementPeriod: "2026-10",
      studioName: "환율 테스트",
      payoutCurrency: "USD",
      transferFeeRatePercent: 1,
      customFxToKrw: { USD: 1400 },
      lines: [
        {
          id: "u1",
          platformLabel: "US",
          jurisdiction: "US",
          sourceCurrency: "USD",
          grossAmountSource: 10_000,
          treatyDocumentSubmitted: true,
        },
      ],
    });
    expect(custom.lines[0]?.grossKrw).toBe(14_000_000);
    expect(custom.lines[0]?.withholdingTaxKrw).toBe(1_400_000);
    expect(custom.payoutFxToKrw).toBe(1400);
    expect(custom.totalNetInPayoutCurrency).toBe(8910);
  });

  it("통화별 기호와 소수 자릿수 규칙에 따라 금액을 포맷한다", () => {
    expect(formatCurrencyAmount(1250000, "KRW")).toBe("₩1,250,000");
    expect(formatCurrencyAmount(1234.5, "USD")).toBe("$1,234.50");
    expect(formatCurrencyAmount(820000, "JPY")).toBe("¥820,000");
    expect(formatCurrencyAmount(50000, "VND")).toBe("₫50,000");
    expect(formatCurrencyAmount(1200.25, "THB")).toBe("฿1,200.25");
    expect(formatCurrencyAmount(900000, "IDR")).toBe("Rp900,000");
    expect(formatCurrencyAmount(3450.5, "PHP")).toBe("₱3,450.50");
  });

  it("외국납부세액공제 검토 대상은 KR 국내 원천징수를 제외하고 해외 세액만 합산한다", () => {
    const statement = calculateCrossBorderSettlement(DEFAULT_CROSS_BORDER_INPUT);
    const krTax = statement.lines.find((l) => l.jurisdiction === "KR")?.withholdingTaxKrw ?? 0;
    expect(krTax).toBeGreaterThan(0);
    expect(statement.totalForeignTaxCreditEligibleKrw).toBe(statement.totalWithholdingTaxKrw - krTax);
  });

  it("JSON 정산 명세서에 스키마 버전과 세무 법적 최종 확인 안내가 반드시 포함된다", () => {
    const statement = calculateCrossBorderSettlement(DEFAULT_CROSS_BORDER_INPUT);
    const jsonText = exportCrossBorderStatementJson(statement);
    const parsed = JSON.parse(jsonText) as {
      schema: string;
      legalNoticeKo: string;
      summary: { totalNetKrw: number };
      lines: unknown[];
    };
    expect(parsed.schema).toBe("toonstudio.crossborder-tax-statement.v1");
    expect(parsed.legalNoticeKo).toBe(TAX_LEGAL_REVIEW_NOTICE_KO);
    expect(parsed.summary.totalNetKrw).toBe(statement.totalNetKrw);
    expect(parsed.lines).toHaveLength(statement.lines.length);
  });

  it("CSV 정산 명세서가 헤더·개별 국가 행·합계 행을 RFC-4180 형식으로 출력한다", () => {
    const statement = calculateCrossBorderSettlement({
      ...DEFAULT_CROSS_BORDER_INPUT,
      studioName: '스튜디오 "밤,우편"',
    });
    const csv = exportCrossBorderStatementCsv(statement);
    const rows = csv.split("\n");
    expect(rows).toHaveLength(statement.lines.length + 2);
    expect(rows[0]).toContain("원천징수율(%)");
    expect(rows[1]).toContain('"스튜디오 ""밤,우편"""');
    expect(rows[rows.length - 1]).toContain("합계");
  });
});

describe("팬덤 2차 창작 IP 공식 라이선스 · 투명 수익 쉐어 원장", () => {
  it("3단계 공식 라이선스 티어의 기본 분배율 합계는 모두 정확히 100%다", () => {
    expect(FANDOM_LICENSE_TIER_LIST).toHaveLength(3);
    for (const tier of FANDOM_LICENSE_TIER_LIST) {
      const check = validateFandomSplitInvariant(tier.defaultShares);
      expect(check.valid).toBe(true);
      expect(check.totalPercent).toBe(100);
    }
  });

  it("4자 분배율 합계가 100%가 아니거나 음수/NaN이면 불변식 위반을 반환한다", () => {
    expect(
      validateFandomSplitInvariant({
        originalAuthorPercent: 20,
        studioPercent: 20,
        derivativeCreatorPercent: 40,
        platformPercent: 10,
      }).valid,
    ).toBe(false);
    expect(
      validateFandomSplitInvariant({
        originalAuthorPercent: 40,
        studioPercent: 30,
        derivativeCreatorPercent: 30,
        platformPercent: 10,
      }).deltaPercent,
    ).toBe(10);
    expect(
      validateFandomSplitInvariant({
        originalAuthorPercent: -5,
        studioPercent: 35,
        derivativeCreatorPercent: 60,
        platformPercent: 10,
      }).valid,
    ).toBe(false);
    expect(
      validateFandomSplitInvariant({
        originalAuthorPercent: Number.NaN,
        studioPercent: 20,
        derivativeCreatorPercent: 70,
        platformPercent: 10,
      }).valid,
    ).toBe(false);
  });

  it("rebalanceFandomSplitShares는 100% 초과 입력에서도 항상 유효한 100% 합계로 보정한다", () => {
    const fixed1 = rebalanceFandomSplitShares({
      originalAuthorPercent: 25,
      studioPercent: 15,
      derivativeCreatorPercent: 10,
      platformPercent: 10,
    });
    expect(fixed1.derivativeCreatorPercent).toBe(50);
    expect(validateFandomSplitInvariant(fixed1).valid).toBe(true);

    const fixed2 = rebalanceFandomSplitShares({
      originalAuthorPercent: 60,
      studioPercent: 50,
      derivativeCreatorPercent: 40,
      platformPercent: 20,
    });
    expect(validateFandomSplitInvariant(fixed2).valid).toBe(true);
  });

  it("분배 합계 100% 불변식 위반 시 원장 발급을 차단하고 모든 지급액을 0원으로 고정한다", () => {
    const blocked = createFandomLicenseLedgerEntry({
      workTitle: "밤의 우편배달부",
      derivativeProjectTitle: "오류 계약 테스트",
      derivativeCreatorName: "테스트 팀",
      tierId: "official-spinoff",
      unitsSold: 100,
      grossSalesKrw: 2_000_000,
      productionCostDeductionKrw: 0,
      shares: {
        originalAuthorPercent: 30,
        studioPercent: 30,
        derivativeCreatorPercent: 30,
        platformPercent: 20,
      },
      recordedDate: "2026-10-24",
    });
    expect(blocked.status).toBe("blocked-split-invariant");
    expect(blocked.payouts.totalDistributedKrw).toBe(0);
  });

  it("1단계 비상업 팬아트는 무료 등록을 승인하고 유료 판매 시도를 정책 차단한다", () => {
    const okFanart = createFandomLicenseLedgerEntry({
      workTitle: "밤의 우편배달부",
      derivativeProjectTitle: "새벽 골목 팬일러스트",
      derivativeCreatorName: "팬작가 A",
      tierId: "non-commercial-fanart",
      unitsSold: 0,
      grossSalesKrw: 0,
      productionCostDeductionKrw: 0,
      shares: FANDOM_LICENSE_TIERS["non-commercial-fanart"].defaultShares,
      recordedDate: "2026-10-24",
    });
    expect(okFanart.status).toBe("approved-non-commercial");

    const blockedSale = createFandomLicenseLedgerEntry({
      workTitle: "밤의 우편배달부",
      derivativeProjectTitle: "무단 유료 굿즈",
      derivativeCreatorName: "팬작가 B",
      tierId: "non-commercial-fanart",
      unitsSold: 10,
      grossSalesKrw: 150_000,
      productionCostDeductionKrw: 0,
      shares: FANDOM_LICENSE_TIERS["non-commercial-fanart"].defaultShares,
      recordedDate: "2026-10-24",
    });
    expect(blockedSale.status).toBe("blocked-non-commercial-policy");
    expect(blockedSale.payouts.totalDistributedKrw).toBe(0);
  });

  it("2단계 소량 굿즈가 300개 또는 500만 원을 초과하면 3단계 스핀오프 승격 안내를 반환한다", () => {
    const exceeded = createFandomLicenseLedgerEntry({
      workTitle: "밤의 우편배달부",
      derivativeProjectTitle: "대량 한정 패키지",
      derivativeCreatorName: "팀 달빛",
      tierId: "approved-small-batch-goods",
      unitsSold: 350,
      grossSalesKrw: 6_500_000,
      productionCostDeductionKrw: 1_500_000,
      shares: FANDOM_LICENSE_TIERS["approved-small-batch-goods"].defaultShares,
      recordedDate: "2026-10-24",
    });
    expect(exceeded.status).toBe("requires-spinoff-upgrade");
    expect(exceeded.payouts.totalDistributedKrw).toBe(5_000_000);
  });

  it("최대 잔여법으로 나누어떨어지지 않는 금액도 1원 오차 없이 100% 분배하고 결정론적 원장 CSV를 생성한다", () => {
    const entry = createFandomLicenseLedgerEntry({
      workTitle: "밤의 우편배달부",
      derivativeProjectTitle: "외전 단행본 1권",
      derivativeCreatorName: "윤슬 스튜디오",
      tierId: "official-spinoff",
      unitsSold: 1_001,
      grossSalesKrw: 1_000_001,
      productionCostDeductionKrw: 0,
      shares: {
        originalAuthorPercent: 33.33,
        studioPercent: 33.33,
        derivativeCreatorPercent: 23.34,
        platformPercent: 10,
      },
      recordedDate: "2026-10-24",
    });
    expect(entry.status).toBe("approved-active");
    expect(
      entry.payouts.originalAuthorKrw +
        entry.payouts.studioKrw +
        entry.payouts.derivativeCreatorKrw +
        entry.payouts.platformKrw,
    ).toBe(1_000_001);
    expect(entry.ledgerCode).toMatch(/^FIP-SPN-[0-9A-F]{6}$/u);

    const csv = exportFandomLedgerCsv([entry]);
    expect(csv).toContain("원장코드");
    expect(csv).toContain(entry.ledgerCode);
  });
});

describe("웹소설→AI 동기화 스토리보드 디렉터 & 옴니버스 가상 스튜디오 브리지", () => {
  it("웹소설 4개 문단을 씬·컷으로 분해하고 모든 렌즈를 24mm~85mm 범위로 배정한다", () => {
    const plan = directNovelToStoryboard({
      episodeLabel: "12화",
      novelText: DEFAULT_WEBNOVEL_SAMPLE,
      directorStyle: "cinematic-drama",
    });
    expect(plan.totalCuts).toBe(4);
    expect(plan.totalScenes).toBeGreaterThanOrEqual(2);
    for (const shot of plan.shots) {
      expect(shot.lensMm).toBeGreaterThanOrEqual(24);
      expect(shot.lensMm).toBeLessThanOrEqual(85);
      expect(shot.camera3d.fovDeg).toBeGreaterThan(10);
    }
  });

  it("공간 확립(하이앵글 24mm), 대사(오버숄더), 액션(로우앵글 24~28mm), 감정(클로즈업 85mm)을 정확히 분류한다", () => {
    const plan = directNovelToStoryboard({
      episodeLabel: "12화",
      novelText: DEFAULT_WEBNOVEL_SAMPLE,
      directorStyle: "action-shonen",
    });
    expect(plan.shots[0]?.framing).toBe("high-angle");
    expect(plan.shots[0]?.lensMm).toBe(24);
    expect(plan.shots[1]?.framing).toBe("over-shoulder");
    expect(plan.shots[2]?.framing).toBe("low-angle");
    expect(plan.shots[2]?.lensMm).toBe(24);
    expect(plan.shots[3]?.framing).toBe("close-up");
    expect(plan.shots[3]?.lensMm).toBe(85);
  });

  it("조명 색온도(K)와 모든 키·필·림 컬러를 순수 OKLCH 토큰으로만 출력한다", () => {
    const plan = directNovelToStoryboard({
      episodeLabel: "12화",
      novelText: `${DEFAULT_WEBNOVEL_SAMPLE}\n\n폭발과 화염이 하늘을 갈랐다.`,
      directorStyle: "noir-thriller",
    });
    for (const shot of plan.shots) {
      expect(shot.lighting.kelvin).toBeGreaterThanOrEqual(2400);
      expect(shot.lighting.keyLightOklch).toMatch(/^oklch\(/u);
      expect(shot.lighting.fillLightOklch).toMatch(/^oklch\(/u);
      expect(shot.lighting.rimLightOklch).toMatch(/^oklch\(/u);
    }
    expect(plan.shots[4]?.lighting.kelvin).toBe(2600);
  });

  it("선택한 컷에서 옴니버스 가상 스튜디오 프리셋 페이로드를 결정론적으로 생성한다", () => {
    const plan = directNovelToStoryboard({
      episodeLabel: "12화",
      novelText: DEFAULT_WEBNOVEL_SAMPLE,
      directorStyle: "cinematic-drama",
    });
    const firstShot = plan.shots[1];
    expect(firstShot).toBeDefined();
    if (!firstShot) return;

    const preset = buildOmnibusVirtualStudioPreset({
      episodeLabel: plan.episodeLabel,
      directorStyle: plan.directorStyle,
      shot: firstShot,
      syncSequence: 1,
    });
    expect(preset.protocolVersion).toBe("toonstudio.omnibus.v1");
    expect(preset.syncChannel).toBe(OMNIBUS_VIRTUAL_STUDIO_EVENT);
    expect(preset.cameraRig.focalLengthMm).toBe(firstShot.lensMm);
    expect(preset.blockingActors.length).toBeGreaterThanOrEqual(2);
  });

  it("dispatchOmnibusStudioPreset이 window에 가상 스튜디오 동기화 CustomEvent를 발행한다", () => {
    const plan = directNovelToStoryboard({
      episodeLabel: "12화",
      novelText: DEFAULT_WEBNOVEL_SAMPLE,
      directorStyle: "cinematic-drama",
    });
    const shot = plan.shots[0];
    expect(shot).toBeDefined();
    if (!shot) return;

    const received: OmnibusVirtualStudioPresetPayload[] = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<OmnibusVirtualStudioPresetPayload>).detail);
    };
    window.addEventListener(OMNIBUS_VIRTUAL_STUDIO_EVENT, listener);
    try {
      const payload = buildOmnibusVirtualStudioPreset({
        episodeLabel: "12화",
        directorStyle: "cinematic-drama",
        shot,
        syncSequence: 7,
      });
      const result = dispatchOmnibusStudioPreset(payload);
      expect(result.dispatched).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0]?.presetId).toBe(payload.presetId);
      expect(received[0]?.syncSequence).toBe(7);
    } finally {
      window.removeEventListener(OMNIBUS_VIRTUAL_STUDIO_EVENT, listener);
    }
  });
});

describe("StudioGlobalBizOsPanel UI · 인터랙션 · 지연 로딩 · OKLCH 스타일 계약", () => {
  it("BEP 탭에서 프리셋 전환 및 컷 수 변경 시 KPI가 실시간으로 갱신된다", () => {
    render(<StudioGlobalBizOsPanel initialTab="bep" />);
    expect(screen.getByTestId("bep-cost-per-episode").textContent).toBe("₩4,000,000");

    fireEvent.click(screen.getByRole("button", { name: /1인 작가 \+ 어시 2명/u }));
    expect(screen.getByTestId("bep-cost-per-episode").textContent).not.toBe("₩4,000,000");
  });

  it("글로벌 세무·정산 탭에서 법적 안내 배지, 국가 행 추가, 통화 전환, JSON/CSV 미리보기가 동작한다", () => {
    render(<StudioGlobalBizOsPanel initialTab="tax" />);
    expect(screen.getByTestId("tax-legal-notice-badge").textContent).toContain("담당 세무사");

    const beforeRows = screen.getAllByRole("row").length;
    fireEvent.click(screen.getByTestId("tax-add-line-btn"));
    expect(screen.getAllByRole("row").length).toBe(beforeRows + 1);

    fireEvent.change(screen.getByLabelText("최종 수취 정산 통화"), { target: { value: "USD" } });
    expect(screen.getByTestId("tax-total-net").textContent).toContain("$");

    fireEvent.click(screen.getByRole("button", { name: "JSON 명세서 미리보기" }));
    expect(screen.getByTestId("tax-statement-export-preview").textContent).toContain(
      "toonstudio.crossborder-tax-statement.v1",
    );
  });

  it("팬덤 IP 수익 쉐어 탭에서 100% 불변식 위반 감지, 100% 자동 맞춤, 원장 등록이 동작한다", () => {
    render(<StudioGlobalBizOsPanel initialTab="fandom" />);
    const authorInput = screen.getByLabelText("원작자 분배율 (%)");
    fireEvent.change(authorInput, { target: { value: "40" } });
    expect(screen.getByTestId("fandom-split-invariant-badge").textContent).toContain("100%여야 합니다");

    fireEvent.click(screen.getByTestId("fandom-register-entry-btn"));
    expect(screen.getByTestId("fandom-status-banner").textContent).toContain("100%여야 합니다");

    fireEvent.click(screen.getByTestId("fandom-rebalance-btn"));
    expect(screen.getByTestId("fandom-split-invariant-badge").textContent).toContain("100% 불변식 통과");

    fireEvent.click(screen.getByTestId("fandom-register-entry-btn"));
    expect(screen.getByTestId("fandom-status-banner").textContent).toContain("등록 완료");
  });

  it("소설→스토리보드 탭에서 원클릭 가상 스튜디오 동기화가 이벤트 발행과 프리셋 미리보기를 완료한다", () => {
    const received: OmnibusVirtualStudioPresetPayload[] = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<OmnibusVirtualStudioPresetPayload>).detail);
    };
    window.addEventListener(OMNIBUS_VIRTUAL_STUDIO_EVENT, listener);
    try {
      render(<StudioGlobalBizOsPanel initialTab="storyboard" />);
      fireEvent.click(screen.getByTestId("sync-omnibus-S01-C01"));
      expect(screen.getByTestId("omnibus-sync-status").textContent).toContain("S01-C01");
      expect(screen.getByTestId("omnibus-preset-json-preview").textContent).toContain(
        "toonstudio.omnibus.v1",
      );
      expect(received).toHaveLength(1);
      expect(received[0]?.shotId).toBe("S01-C01");
    } finally {
      window.removeEventListener(OMNIBUS_VIRTUAL_STUDIO_EVENT, listener);
    }
  });

  it("ProductionSampleJourneyGuide의 접이식 패널을 열 때만 지연 로딩으로 패널이 마운트된다", async () => {
    render(
      <MemoryRouter>
        <ProductionSampleJourneyGuide location="overview" />
      </MemoryRouter>,
    );
    const disclosure = screen.getByTestId("studio-global-biz-os-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-global-biz-os-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-global-biz-os-panel")).toBeTruthy();
    });
  });

  it("global-biz-os.css가 원시 HEX·transition-all 없이 OKLCH·44px 터치 타겟·reduced-motion을 준수한다", () => {
    const cssPath = resolve(
      process.cwd(),
      "apps/web/src/domains/creator/global-biz-os/global-biz-os.css",
    );
    const css = readFileSync(cssPath, "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\(/u);
    expect(css).not.toContain("transition-all");
    expect(css).not.toMatch(/transition:\s*all\b/u);
    expect(css).toContain("oklch(");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
