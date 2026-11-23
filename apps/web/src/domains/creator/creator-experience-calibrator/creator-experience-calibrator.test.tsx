// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioCreatorCalibratorPanel,
  type StudioCreatorCalibratorSnapshot,
} from "./StudioCreatorCalibratorPanel";
import {
  DEFAULT_DEMO_WEBTOON_PALETTE,
  DEMO_WORKFLOW_SNAPSHOTS,
  applyCalibratedPressure,
  auditPaletteGamutAndCvd,
  buildFourWayColorProofBundle,
  calibratePersonalPenProfile,
  computeDeltaE2000,
  createDemoCalibrationStrokes,
  createDemoWebtoonColorProofBuffer,
  detectWorkflowPhaseAndNextActions,
  simulateDeviceColorProof,
  type ColorProofBufferInput,
  type WorkflowPhaseId,
} from "./device-gamut-and-pressure-calibrator";
import {
  analyzeMobileReaderScrollPacing,
  compareAllReaderViewports,
  compareAllVoiceLocales,
  createDemoWebtoonEpisodePacingData,
  simulateMultilingualVoicePacing,
  type MobileReaderEpisodeInput,
  type MultilingualDialogueBeat,
} from "./reader-scroll-and-voice-pacing";

afterEach(cleanup);

function makeSolidBuffer(r: number, g: number, b: number, width = 8, height = 8): ColorProofBufferInput {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

describe("4분할 디바이스 색역 · 색각이상(ΔE2000) 교정 캘리브레이터", () => {
  it("CIE ΔE2000 및 Display-P3 · Android OLED · CMYK FOGRA39 · 색각이상 3종 RGBA 변환을 정확히 수행한다", () => {
    expect(computeDeltaE2000(128, 128, 128, 128, 128, 128)).toBe(0);
    expect(computeDeltaE2000(220, 60, 50, 50, 190, 60)).toBeGreaterThan(35);

    // 무채색 중립 회색은 색각이상 3종 행렬에서 불변 유지 (ΔE < 1.2)
    const neutralGray = makeSolidBuffer(140, 140, 140);
    for (const target of ["cvd-protanopia", "cvd-deuteranopia", "cvd-tritanopia"] as const) {
      const res = simulateDeviceColorProof(neutralGray, target);
      expect(res.meanDeltaE2000).toBeLessThan(1.2);
    }

    // 선명한 적색 vs 녹색은 제1·제2색각이상에서 큰 색차 변화를 보이며, 청-황은 제3색각이상에서 변환된다
    const pureRed = makeSolidBuffer(225, 42, 42);
    const pureBlue = makeSolidBuffer(32, 76, 238);
    expect(simulateDeviceColorProof(pureRed, "cvd-protanopia").meanDeltaE2000).toBeGreaterThan(20);
    expect(simulateDeviceColorProof(pureRed, "cvd-deuteranopia").meanDeltaE2000).toBeGreaterThan(18);
    expect(simulateDeviceColorProof(pureBlue, "cvd-tritanopia").meanDeltaE2000).toBeGreaterThan(15);

    // 4분할 번들 검증: 형광 네온이 포함된 데모 버퍼에서 CMYK 색역 이탈 픽셀과 TAC <= 300% 검출
    const demo = createDemoWebtoonColorProofBuffer(48, 32);
    const bundle = buildFourWayColorProofBundle(demo, "deuteranopia");
    expect(bundle.iphoneDisplayP3.rgba.length).toBe(48 * 32 * 4);
    expect(bundle.androidOledVivid.meanDeltaE2000).toBeGreaterThan(bundle.iphoneDisplayP3.meanDeltaE2000);
    expect(bundle.printCmykFogra39.outOfGamutPixelCount).toBeGreaterThan(100);
    expect(bundle.printCmykFogra39.outOfGamutRatio01).toBeGreaterThan(0.15);
    expect(bundle.printCmykFogra39.maxInkCoveragePct).toBeGreaterThan(0);
    expect(bundle.printCmykFogra39.maxInkCoveragePct).toBeLessThanOrEqual(300);

    // 인쇄 안전 무채·저채도 버퍼는 CMYK 이탈률 0%
    const printSafe = makeSolidBuffer(196, 178, 162);
    const safeCmyk = simulateDeviceColorProof(printSafe, "print-cmyk-fogra39");
    expect(safeCmyk.outOfGamutRatio01).toBe(0);

    // 이탈 강조 오버레이 옵션 적용 시 픽셀 버퍼가 경고 강조로 분기됨
    const highlighted = simulateDeviceColorProof(demo, "print-cmyk-fogra39", { highlightOutOfGamut: true });
    let diffBytes = 0;
    for (let i = 0; i < highlighted.rgba.length; i += 4) {
      if (highlighted.rgba[i] !== bundle.printCmykFogra39.rgba[i]) diffBytes += 1;
    }
    expect(diffBytes).toBeGreaterThan(100);
  });

  it("팔레트 감사기가 CMYK 이탈 네온 스와치와 색각이상 혼동 쌍을 정량 탐지한다", () => {
    const audit = auditPaletteGamutAndCvd(DEFAULT_DEMO_WEBTOON_PALETTE);
    expect(audit.swatches).toHaveLength(DEFAULT_DEMO_WEBTOON_PALETTE.length);
    const neonCyan = audit.swatches.find((s) => s.swatchId === "neon-cyan-fx");
    const heroSkin = audit.swatches.find((s) => s.swatchId === "skin-base");
    expect(neonCyan?.cmykOutOfGamut).toBe(true);
    expect(neonCyan?.cmykDeltaE2000 ?? 0).toBeGreaterThan(8);
    expect(heroSkin?.cmykOutOfGamut).toBe(false);
    expect(audit.cmykOutOfGamutCount).toBeGreaterThanOrEqual(2);

    // 적-녹 혼동 가능성이 높은 유사 명도 2색 추가 시 색각 혼동 쌍 검출 확인
    const confusableAudit = auditPaletteGamutAndCvd([
      { id: "r-mid", labelKo: "적색", labelEn: "Mid Red", r: 176, g: 102, b: 64 },
      { id: "g-mid", labelKo: "녹색", labelEn: "Mid Green", r: 118, g: 132, b: 64 },
    ]);
    expect(confusableAudit.cvdCollisionCount).toBeGreaterThanOrEqual(1);
    expect(confusableAudit.cvdConfusablePairs.some((p) => p.mode === "deuteranopia")).toBe(true);
  });
});

describe("100% 온디바이스 필압·손떨림 자동 보정 및 5단계 컨텍스트 퀵런처", () => {
  it("가벼운 손힘·손떨림 vs 강한 손힘·속필 작가별 최적 감마(0.55..1.65)와 안정화 윈도우(0..18px)를 서버 전송 0B로 보정한다", () => {
    const lightShaky = calibratePersonalPenProfile(createDemoCalibrationStrokes("light-shaky"));
    const balanced = calibratePersonalPenProfile(createDemoCalibrationStrokes("balanced-steady"));
    const heavyFast = calibratePersonalPenProfile(createDemoCalibrationStrokes("heavy-fast"));

    for (const profile of [lightShaky, balanced, heavyFast]) {
      expect(profile.networkTransmissionBytes).toBe(0);
      expect(profile.storagePersistence).toBe("in-memory-only");
      expect(profile.optimalPressureGamma).toBeGreaterThanOrEqual(0.55);
      expect(profile.optimalPressureGamma).toBeLessThanOrEqual(1.65);
      expect(profile.stabilizationWindowPx).toBeGreaterThanOrEqual(0);
      expect(profile.stabilizationWindowPx).toBeLessThanOrEqual(18);
      expect(profile.curvePreviewPoints).toHaveLength(5);
    }

    // 가벼운 손힘은 감마 < 0.85로 감도 증폭, 강한 손힘은 감마 > 1.18로 완충
    expect(lightShaky.handArchetype).toBe("light-touch");
    expect(lightShaky.optimalPressureGamma).toBeLessThan(0.85);
    expect(applyCalibratedPressure(0.3, lightShaky.optimalPressureGamma)).toBeGreaterThan(0.35);

    expect(heavyFast.handArchetype).toBe("heavy-press");
    expect(heavyFast.optimalPressureGamma).toBeGreaterThan(1.18);
    expect(applyCalibratedPressure(0.5, heavyFast.optimalPressureGamma)).toBeLessThan(0.45);

    expect(balanced.handArchetype).toBe("balanced");
    expect(balanced.optimalPressureGamma).toBeGreaterThan(0.85);
    expect(balanced.optimalPressureGamma).toBeLessThan(1.18);

    // 손떨림 스트로크는 안정화 윈도우가 확연히 크게 산출됨
    expect(lightShaky.tremorLevel).toBe("shaky");
    expect(lightShaky.stabilizationWindowPx).toBeGreaterThanOrEqual(10);
    expect(balanced.stabilizationWindowPx).toBeLessThan(4);
    expect(heavyFast.endTaperRatio01).toBeGreaterThan(balanced.endTaperRatio01);

    // 표본 부족(<3) 시 NaN 없이 안전 중립값 반환
    const sparse = calibratePersonalPenProfile([{ x: 10, y: 10, pressure: 0.4, timestampMs: 0 }]);
    expect(sparse.optimalPressureGamma).toBe(1.0);
    expect(sparse.stabilizationWindowPx).toBe(4);
  });

  it("5단계 작업 상태(스케치·선화·채색·식자·마감)를 감지하고 방해 없는 핵심 다음 도구 3개만 제안한다", () => {
    const phases: readonly WorkflowPhaseId[] = ["sketch", "lineart", "coloring", "lettering", "finishing"];
    let prevCompletion = 0;
    for (const expected of phases) {
      const result = detectWorkflowPhaseAndNextActions(DEMO_WORKFLOW_SNAPSHOTS[expected]);
      expect(result.phase).toBe(expected);
      expect(result.nextActions).toHaveLength(3);
      expect(result.nextActions.map((a) => a.priority)).toEqual([1, 2, 3]);
      expect(new Set(result.nextActions.map((a) => a.targetToolId)).size).toBe(3);
      expect(result.completionRatio01).toBeGreaterThan(prevCompletion);
      prevCompletion = result.completionRatio01;
    }
  });
});

describe("360px/390px/768px 독자 스크롤 템포 및 KO/EN/JA/TH 다국어 보이스 호흡 프리뷰", () => {
  it("360px/390px/768px 뷰포트별 말풍선 실측 폰트·클리프행어 정적 여백·시선 흐름 점수를 정확히 계산한다", () => {
    const { scrollEpisode } = createDemoWebtoonEpisodePacingData();
    const all = compareAllReaderViewports(scrollEpisode);

    // 22px 원고 말풍선은 360px에서 9.9px(<10.5px 불가독)로 축소되지만 768px에서는 21.1px로 쾌적
    expect(all["android-360"].minRenderedFontPx).toBeCloseTo(9.9, 1);
    expect(all["android-360"].unreadableBubbleCount).toBe(1);
    expect(all["iphone-390"].minRenderedFontPx).toBeGreaterThan(all["android-360"].minRenderedFontPx);
    expect(all["tablet-768"].unreadableBubbleCount).toBe(0);
    expect(all["android-360"].cliffhangerPauses[0]?.status).toBe("optimal");
    expect(all["android-360"].eyeFlowScore0To100).toBeGreaterThanOrEqual(0);
    expect(all["android-360"].eyeFlowScore0To100).toBeLessThanOrEqual(100);

    // 클리프행어 직전 여백을 90px로 좁히고 시선 점프를 극대화하면 abrupt-cliffhanger 경고 및 점수 하락
    const brokenEpisode: MobileReaderEpisodeInput = {
      canvasWidthPx: 800,
      panels: [
        { id: "p1", labelKo: "1컷", labelEn: "Cut 1", heightPx: 600, gutterAfterPx: 80, focalPointX01: 0.1, isCliffhangerBefore: true, bubbles: [{ id: "t1", text: "짧은 대사", sourceFontSizePx: 18, boxWidthPx: 160, boxHeightPx: 70, anchorX01: 0.15 }] },
        { id: "p2", labelKo: "2컷", labelEn: "Cut 2", heightPx: 700, gutterAfterPx: 40, focalPointX01: 0.92, bubbles: [{ id: "t2", text: "반전!", sourceFontSizePx: 28, boxWidthPx: 180, boxHeightPx: 80, anchorX01: 0.88 }] },
      ],
    };
    const brokenReport = analyzeMobileReaderScrollPacing(brokenEpisode, "android-360");
    expect(brokenReport.cliffhangerPauses[0]?.status).toBe("too-abrupt");
    expect(brokenReport.advisories.some((a) => a.code === "abrupt-cliffhanger")).toBe(true);
    expect(brokenReport.advisories.some((a) => a.code === "eye-whiplash")).toBe(true);
    expect(brokenReport.eyeFlowScore0To100).toBeLessThan(all["android-360"].eyeFlowScore0To100);
  });

  it("KO/EN/JA/TH 4개국어 발화 시간·감정 템포·JA 세로쓰기 열 넘침·TH 결합 성조·컷당 호흡 경고를 검출한다", () => {
    const { dialogueBeats } = createDemoWebtoonEpisodePacingData();
    const byLocale = compareAllVoiceLocales(dialogueBeats);

    expect(byLocale.ko.totalDurationSec).toBeGreaterThan(3);
    expect(byLocale.ko.beatResults[0]?.unitKind).toBe("syllable");
    expect(byLocale.en.beatResults[0]?.unitKind).toBe("word");
    expect(byLocale.ja.beatResults[0]?.unitKind).toBe("mora");
    expect(byLocale.th.beatResults[0]?.unitKind).toBe("cluster");

    // EN 장문 번역 확장 말풍선(b1)은 넘침 위험 검출
    expect(byLocale.en.beatResults[0]?.overflowRisk).toBe("overflow");
    expect(byLocale.en.warnings.some((w) => w.code === "bubble-overflow")).toBe(true);

    // JA 세로쓰기 열 수 계산 및 TH 결합 성조 마크 감지 확인
    expect(byLocale.ja.maxJaVerticalColumns).toBeGreaterThanOrEqual(2);
    expect(byLocale.ja.beatResults[0]?.writingMode).toBe("vertical");
    expect(byLocale.th.beatResults.reduce((acc, b) => acc + b.thaiCombiningMarkCount, 0)).toBeGreaterThan(8);

    // 감정별 발화 속도: 동일 대사에서 urgent가 whisper보다 짧게 발화됨
    const sampleText = { ko: "지금 당장 문 밖으로 나가야만 모두 살 수 있어." };
    const urgentRes = simulateMultilingualVoicePacing(
      [{ panelId: "c1", bubbleId: "u1", speaker: "A", emotion: "urgent", boxWidthPx: 260, boxHeightPx: 140, fontSizePx: 16, texts: sampleText }],
      "ko",
    );
    const whisperRes = simulateMultilingualVoicePacing(
      [{ panelId: "c1", bubbleId: "w1", speaker: "A", emotion: "whisper", boxWidthPx: 260, boxHeightPx: 140, fontSizePx: 16, texts: sampleText }],
      "ko",
    );
    expect(urgentRes.totalDurationSec).toBeLessThan(whisperRes.totalDurationSec);

    // 한 컷 과다 독백 + 좁은 JA 세로쓰기 말풍선 동시 스트레스 테스트
    const denseBeats: readonly MultilingualDialogueBeat[] = [
      {
        panelId: "cut-overload",
        bubbleId: "ja-narrow",
        speaker: "S1",
        emotion: "narration",
        boxWidthPx: 90,
        boxHeightPx: 110,
        fontSizePx: 18,
        texts: {
          ja: "この部屋に隠された古い設計図と暗号の鍵をすべて解読しなければ、明日の朝までに誰も塔から脱出することはできないんだ。",
          ko: "이 방에 숨겨진 오래된 설계도와 암호 열쇠를 모두 해독하지 못하면 내일 아침까지 아무도 탑을 빠져나갈 수 없어. 지금 당장 기록실을 수색해야 해.",
        },
      },
    ];
    const jaStress = simulateMultilingualVoicePacing(denseBeats, "ja");
    expect(jaStress.warnings.some((w) => w.code === "ja-vertical-columns-wide")).toBe(true);
    expect(jaStress.warnings.some((w) => w.code === "speech-overload")).toBe(true);
  });
});

describe("StudioCreatorCalibratorPanel 3탭 UI · KO/EN · Calm Atelier 위생 계약", () => {
  it("무-props 마운트 및 3개 탭(색역 교정·온디바이스 필압/퀵런처·360px 스크롤/보이스) 상호작용이 동작한다", () => {
    const snapshots: StudioCreatorCalibratorSnapshot[] = [];
    const onCalibratorChange = vi.fn((snap: StudioCreatorCalibratorSnapshot) => { snapshots.push(snap); });

    render(<StudioCreatorCalibratorPanel locale="ko" onCalibratorChange={onCalibratorChange} />);

    // 탭 1: 4분할 색역 교정 카드 4개 + 색각이상 전환
    expect(screen.getByTestId("proof-card-p3")).toBeTruthy();
    expect(screen.getByTestId("proof-card-oled")).toBeTruthy();
    expect(screen.getByTestId("proof-card-cmyk")).toBeTruthy();
    expect(screen.getByTestId("proof-card-cvd")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /제3색각/i }));
    fireEvent.click(screen.getByRole("button", { name: /색역 이탈 픽셀 강조/i }));
    expect(snapshots.at(-1)?.cvdMode).toBe("tritanopia");
    expect(snapshots.at(-1)?.highlightOutOfGamut).toBe(true);

    // 탭 2: 온디바이스 필압 보정(0B) & 작업 5단계 퀵런처(핵심 3도구)
    fireEvent.click(screen.getByRole("tab", { name: /온디바이스 필압 맞춤/i }));
    expect(screen.getByTestId("pen-network-badge").textContent).toContain("전송 0B");
    const lightGammaText = screen.getByTestId("pen-gamma-value").textContent ?? "";
    fireEvent.click(screen.getByRole("button", { name: /강한 손힘/i }));
    const heavyGammaText = screen.getByTestId("pen-gamma-value").textContent ?? "";
    expect(heavyGammaText).not.toBe(lightGammaText);
    fireEvent.click(screen.getByRole("button", { name: /테스트 획 추가 측정/i }));
    expect(screen.getByTestId("pen-network-badge").textContent).toContain("36점");

    fireEvent.click(screen.getByRole("button", { name: "채색" }));
    expect(screen.getByTestId("detected-phase-label").textContent).toContain("3단계 · 채색");
    const launcherBtns = screen.getByTestId("quick-launcher-actions").querySelectorAll("button");
    expect(launcherBtns).toHaveLength(3);

    // 탭 3: 360px 독자 스크롤 · 4개국어 보이스 호흡
    fireEvent.click(screen.getByRole("tab", { name: /360px 독자 스크롤/i }));
    const font360 = Number.parseFloat(screen.getByTestId("scroll-min-font").textContent ?? "0");
    fireEvent.click(screen.getByRole("button", { name: /768px 태블릿/i }));
    const font768 = Number.parseFloat(screen.getByTestId("scroll-min-font").textContent ?? "0");
    expect(font768).toBeGreaterThan(font360);

    fireEvent.click(screen.getByRole("button", { name: /일본어 세로/i }));
    expect(Number.parseInt(screen.getByTestId("voice-ja-columns").textContent ?? "0", 10)).toBeGreaterThanOrEqual(2);

    // 영문 모드(locale="en")에서 전 탭 한글 0자 검증
    cleanup();
    const { container } = render(<StudioCreatorCalibratorPanel locale="en" />);
    expect(container.textContent ?? "").not.toMatch(/[가-힣]/u);
    fireEvent.click(screen.getByRole("tab", { name: /On-Device Pen/i }));
    expect(container.textContent ?? "").not.toMatch(/[가-힣]/u);
    fireEvent.click(screen.getByRole("tab", { name: /360px Scroll/i }));
    expect(container.textContent ?? "").not.toMatch(/[가-힣]/u);

    // 무-props 기본 마운트 검증
    cleanup();
    render(<StudioCreatorCalibratorPanel />);
    expect(screen.getByTestId("studio-creator-calibrator-panel")).toBeTruthy();
  });

  it("소유 폴더의 배럴 금지·줄 수 상한·Calm Atelier 토큰·원시색상/영속저장소 금지 계약을 전수 충족한다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/creator-experience-calibrator");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);

    const eng1 = readFileSync(resolve(dir, "device-gamut-and-pressure-calibrator.ts"), "utf8");
    const eng2 = readFileSync(resolve(dir, "reader-scroll-and-voice-pacing.ts"), "utf8");
    const panel = readFileSync(resolve(dir, "StudioCreatorCalibratorPanel.tsx"), "utf8");
    const testSrc = readFileSync(resolve(dir, "creator-experience-calibrator.test.tsx"), "utf8");

    expect(eng1.split("\n").length).toBeLessThanOrEqual(680);
    expect(eng2.split("\n").length).toBeLessThanOrEqual(680);
    expect(panel.split("\n").length).toBeLessThanOrEqual(460);
    expect(testSrc.split("\n").length).toBeLessThanOrEqual(750);

    const forbiddenStorageRegex = new RegExp(`\\b${"local"}${"Storage"}\\b`);
    const hexRegex = new RegExp(`#[0-9a-fA-F]{3,8}\\b`);
    const rgbRegex = new RegExp(`\\b${"rgb"}a?\\s*\\(`, "i");
    const hslRegex = new RegExp(`\\b${"hsl"}a?\\s*\\(`, "i");

    for (const src of [eng1, eng2, panel]) {
      expect(src).not.toMatch(forbiddenStorageRegex);
      expect(src).not.toMatch(hexRegex);
      expect(src).not.toMatch(rgbRegex);
      expect(src).not.toMatch(hslRegex);
    }

    expect(panel).not.toMatch(
      /\b(?:bg|text|border)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/,
    );
    expect(panel).not.toContain("transition-all");
    expect(panel).toContain("[word-break:keep-all]");
    expect(panel).toContain("tabular-nums");
  });
});
