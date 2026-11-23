// @vitest-environment jsdom

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublishSpecAutoOptimizeSection } from "../publish/PublishSpecAutoOptimizeSection";
import {
  DEFAULT_SCROLL_DWELL_SAMPLES,
  GLOBAL_20_LOCALIZATION_LOCALES,
  GLOBAL_OST_PREMIERE_SPRITE_PATHS,
  STUDIO_AUDIO_OST_WORKSHOP_PATH,
  StudioGlobalOstPremiereHub,
  analyzeScrollDwellHeatmap,
  buildPremiereTheaterSession,
  buildRealtimeRenderMirrorState,
  buildStealthWatermarkSignature,
  evaluateErgonomicBurnoutCoach,
  generateHumanCraftCertificate,
  planGlobalSfxRepaint,
  resolveCharacterBibleMentions,
  resolveDynamicOstLayerMix,
  type CutEmotionTag,
} from "./index";

afterEach(() => {
  cleanup();
});

describe("@캐릭터 바이블 일관성 멘션 & 실시간 렌더 미러 엔진", () => {
  it("4종 컬러 스프라이트 자산이 public/assets/studio/vibrant-sprites/에 실존한다", () => {
    const publicDir = resolve(process.cwd(), "apps/web/public");
    const fallbackPublicDir = resolve(process.cwd(), "public");
    const baseDir = existsSync(publicDir) ? publicDir : fallbackPublicDir;

    for (const spritePath of Object.values(GLOBAL_OST_PREMIERE_SPRITE_PATHS)) {
      const fullPath = resolve(baseDir, spritePath.replace(/^\//, ""));
      expect(existsSync(fullPath), `missing sprite asset: ${fullPath}`).toBe(true);
    }
  });

  it("대본 속 @캐릭터명(한국어 조사·영문 별칭 포함)을 파싱하고 이메일은 무시하며 바이블 속성을 고정한다", () => {
    const res = resolveCharacterBibleMentions(
      "문의 author@toonstudio.cloud 제외. @유진이 @세라의 손을 잡고 @Kai와 대치한다. @신규엑스트라 등장.",
      { renderInfluence: 40, mirrorMode: "split-side-by-side" },
    );

    expect(res.uniqueEntries.map((entry) => entry.mentionHandle)).toEqual(["유진", "세라", "카이"]);
    expect(res.unresolvedHandles).toEqual(["신규엑스트라"]);
    expect(res.mentions).toHaveLength(3);

    const yujin = res.uniqueEntries[0];
    expect(yujin?.vrmAssetId).toBe("vrm-hero-yujin-v2");
    expect(yujin?.hairColorKo).toContain("인디고");
    expect(yujin?.outfitSummaryKo).toContain("트렌치코트");
    expect(yujin?.signaturePalette.length).toBeGreaterThanOrEqual(3);
    expect(yujin?.proportionLock.headToBodyRatio).toBe(7.4);

    expect(res.compiledPrompt).toContain("vrm=vrm-hero-yujin-v2");
    expect(res.compiledPrompt).toContain("렌더 영향도=40%");
    expect(res.warningsKo.some((w) => w.includes("@신규엑스트라"))).toBe(true);
  });

  it("Vizcom 렌더 영향도 슬라이더(0~100)와 Krea 좌/우 미러 상태를 정확히 계산한다", () => {
    const strict = buildRealtimeRenderMirrorState({
      renderInfluence: 20,
      mirrorMode: "split-side-by-side",
      lockedCharacterCount: 2,
    });
    expect(strict.stageId).toBe("sketch-strict");
    expect(strict.sketchPreservationPercent + strict.aiFinishWeightPercent).toBe(100);
    expect(strict.sketchPreservationPercent).toBe(80);

    const expressive = buildRealtimeRenderMirrorState({
      renderInfluence: 86,
      mirrorMode: "slider-wipe",
      splitRatioPercent: 64,
      lockedCharacterCount: 3,
    });
    expect(expressive.stageId).toBe("finish-expressive");
    expect(expressive.splitRatioPercent).toBe(64);
    expect(expressive.estimatedFrameLatencyMs).toBeGreaterThan(strict.estimatedFrameLatencyMs);
  });
});

describe("글로벌 20개국 원클릭 SFX 리페인팅 & 로컬라이징 계획기", () => {
  it("정확히 20개국 로케일을 지원하며 일본어 세로쓰기·아랍어 RTL 미러링·스페인어 말풍선 확장·손글씨 인페인팅을 산출한다", () => {
    expect(GLOBAL_20_LOCALIZATION_LOCALES).toHaveLength(20);

    const batch = planGlobalSfxRepaint({
      canvasWidthPx: 800,
      targetLocales: ["ko-KR", "en-US", "ja-JP", "ar-SA", "es-ES", "he-IL", "zh-TW"],
    });

    expect(batch.supportedCountryCount).toBe(20);
    expect(batch.plans).toHaveLength(7);

    const ko = batch.plans.find((p) => p.locale.code === "ko-KR")!;
    const ja = batch.plans.find((p) => p.locale.code === "ja-JP")!;
    const ar = batch.plans.find((p) => p.locale.code === "ar-SA")!;
    const es = batch.plans.find((p) => p.locale.code === "es-ES")!;
    const he = batch.plans.find((p) => p.locale.code === "he-IL")!;

    expect(ko.totalInpaintAreaPx2).toBe(0);
    expect(ko.estimatedRepaintSeconds).toBe(0);

    expect(ja.verticalTypeset).toBe(true);
    expect(ja.locale.writingMode).toBe("vertical-rl");
    const jaDialogue = ja.items.find((item) => item.kind === "dialogue")!;
    expect(jaDialogue.adjustedBubbleBoundsPx.height).toBeGreaterThan(
      jaDialogue.adjustedBubbleBoundsPx.width,
    );

    expect(ar.rtlMirrored).toBe(true);
    expect(ar.locale.direction).toBe("rtl");
    expect(he.rtlMirrored).toBe(true);
    const arDialogue = ar.items.find((item) => item.kind === "dialogue")!;
    const esDialogue = es.items.find((item) => item.kind === "dialogue")!;
    expect(arDialogue.adjustedBubbleBoundsPx.x).not.toBe(esDialogue.adjustedBubbleBoundsPx.x);
    expect(es.bubbleWidthScalePercent).toBeGreaterThanOrEqual(125);

    const arSfxImpact = ar.items.find((item) => item.sourceId === "sfx-1")!;
    expect(arSfxImpact.inpaintMaskPx).not.toBeNull();
    expect(arSfxImpact.inpaintAreaPx2).toBeGreaterThan(0);
    expect(arSfxImpact.requiresManualArtCheck).toBe(true);
  });
});

describe("웹 OST 자동 크로스페이드 · 라이브 시사회 극장 · 독자 스크롤 히트맵", () => {
  it("5대 컷 감정 태그별 악기 볼륨 프로필과 스크롤 경계 크로스페이드 및 /studio/assets/audio 링크를 생성한다", () => {
    const emotions: readonly CutEmotionTag[] = ["calm", "tension", "climax", "romance", "comedy"];
    const mixes = emotions.map((emotion) =>
      resolveDynamicOstLayerMix(0.5, { emotionOverride: emotion }),
    );

    for (const mix of mixes) {
      expect(mix.audioWorkshopHref.startsWith(STUDIO_AUDIO_OST_WORKSHOP_PATH)).toBe(true);
      expect(mix.layers.piano).toBeGreaterThanOrEqual(0);
      expect(mix.layers.piano).toBeLessThanOrEqual(100);
    }

    const calm = mixes[0]!;
    const climax = mixes[2]!;
    expect(climax.layers.percussion).toBeGreaterThan(calm.layers.percussion);
    expect(climax.layers.strings).toBeGreaterThan(calm.layers.strings);

    // 0.46(tension 시작) 직전 0.42에서 romance -> tension 크로스페이드 검증
    const transitioning = resolveDynamicOstLayerMix(0.42);
    expect(transitioning.isCrossfading).toBe(true);
    expect(transitioning.crossfadeRatio).toBeGreaterThan(0);
    expect(transitioning.crossfadeRatio).toBeLessThan(1);
    expect(transitioning.audioWorkshopHref).toContain("/studio/assets/audio");
  });

  it("라이브 연재 시사회 극장 세션과 1컷 팬아트 리믹스 수익 분배 합계 100%를 보장한다", () => {
    const session = buildPremiereTheaterSession({
      episodeTitle: "제15화 · 폭풍의 문",
      concurrentViewers: 2450,
      featuredCutIndex: 33,
      originalAuthorSharePercent: 60,
      remixCreatorSharePercent: 30,
    });

    expect(session.sessionId).toMatch(/^PREMIERE-[0-9A-F]{8}$/);
    expect(session.danmakuQueue.length).toBeGreaterThanOrEqual(3);
    expect(session.commentaryMarkers.length).toBeGreaterThanOrEqual(2);
    expect(session.audioWorkshopHref).toContain("/studio/assets/audio");
    expect(session.remixChallengeSplit.totalPercentCheck).toBe(100);
    expect(
      session.remixChallengeSplit.originalAuthorSharePercent +
        session.remixChallengeSplit.remixCreatorSharePercent +
        session.remixChallengeSplit.platformInfraSharePercent,
    ).toBe(100);
  });

  it("독자 스크롤 체류 히트맵이 피크 컷과 이탈 주의 컷을 자동 진단한다", () => {
    const report = analyzeScrollDwellHeatmap(DEFAULT_SCROLL_DWELL_SAMPLES);
    expect(report.cuts).toHaveLength(DEFAULT_SCROLL_DWELL_SAMPLES.length);
    expect(report.peakCutIndex).toBe(47);
    expect(report.dropAlertCuts.map((c) => c.sample.cutIndex)).toContain(24);
    expect(report.averageDwellSeconds).toBeGreaterThan(4);
    expect(report.summaryKo).toContain("24컷");
  });
});

describe("인간 작화 증명서 · 포렌식 워터마크 · 작가 손목/마감 건강 페이스 코치", () => {
  it("손그림·3D·AI 비중이 항상 100%로 투명 집계되고 등급과 증명서 ID가 결정론적으로 생성된다", () => {
    const pure = generateHumanCraftCertificate({
      episodeTitle: "1화",
      creatorName: "김작가",
      handDrawnStrokeCount: 6200,
      handDrawnMinutes: 300,
      scene3dMinutes: 60,
      aiAssistMinutes: 0,
    });
    expect(pure.gradeId).toBe("pure-handcraft");
    expect(pure.handDrawnPercent + pure.scene3dPercent + pure.aiAssistPercent).toBe(100);
    expect(pure.aiAssistPercent).toBe(0);
    expect(pure.certificateId).toMatch(/^HCERT-[0-9A-F]{4}-[0-9A-F]{4}$/);

    const evenThirds = generateHumanCraftCertificate({
      episodeTitle: "균등 분할 테스트",
      creatorName: "이작가",
      handDrawnStrokeCount: 1200,
      handDrawnMinutes: 100,
      scene3dMinutes: 100,
      aiAssistMinutes: 100,
    });
    expect(
      evenThirds.handDrawnPercent + evenThirds.scene3dPercent + evenThirds.aiAssistPercent,
    ).toBe(100);
    expect(evenThirds.gradeId).toBe("assisted-production");
  });

  it("비가시적 포렌식 워터마크는 수신자·세션별 고유 해시를 결정론적으로 생성한다", () => {
    const wmA = buildStealthWatermarkSignature({
      workId: "work-01",
      episodeNumber: 12,
      recipientLabel: "외주 스튜디오 A",
      sessionId: "sess-100",
      purpose: "outsource-handoff",
    });
    const wmB = buildStealthWatermarkSignature({
      workId: "work-01",
      episodeNumber: 12,
      recipientLabel: "외주 스튜디오 B",
      sessionId: "sess-100",
      purpose: "outsource-handoff",
    });

    expect(wmA.watermarkCode).toMatch(/^TSWM-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(wmA.watermarkCode).not.toBe(wmB.watermarkCode);
    expect(wmA.imperceptibleDeltaE).toBeLessThan(1);
  });

  it("건강 페이스 코치가 연속 작화 분·필압 경직도에 따라 90초 스트레칭과 왼손 단축키 전환을 안내한다", () => {
    const steady = evaluateErgonomicBurnoutCoach({
      continuousDrawingMinutes: 20,
      stylusPressureStiffness: 22,
      dailyHoursWorked: 2,
      leftHandShortcutActive: true,
    });
    expect(steady.riskLevel).toBe("steady");
    expect(steady.recommendedBreakSeconds).toBe(0);
    expect(steady.suggestLeftHandSwitch).toBe(false);

    const urgent = evaluateErgonomicBurnoutCoach({
      continuousDrawingMinutes: 85,
      stylusPressureStiffness: 82,
      dailyHoursWorked: 8.5,
      leftHandShortcutActive: false,
      deadlineHoursRemaining: 6,
    });
    expect(urgent.riskLevel).toBe("break-now");
    expect(urgent.recommendedBreakSeconds).toBe(90);
    expect(urgent.suggestLeftHandSwitch).toBe(true);
    const totalStretchSec = urgent.stretchRoutine90s.reduce(
      (sum, step) => sum + step.durationSec,
      0,
    );
    expect(totalStretchSec).toBe(90);
  });
});

describe("StudioGlobalOstPremiereHub 3탭 UI 및 PublishSpecAutoOptimizeSection 실연결", () => {
  it("3개 탭 전환·/studio/assets/audio 컬러 CTA·20개국 일괄 선택·OST 감정 전환·작화 증명·건강 코치가 동작한다", () => {
    render(<StudioGlobalOstPremiereHub episodeTitle="테스트 회차 12화" />);

    const headerCta = screen.getByTestId("gop-header-ost-workshop-cta") as HTMLAnchorElement;
    expect(headerCta.getAttribute("href")).toBe("/studio/assets/audio");

    // 탭 1: @캐릭터·글로벌 SFX
    expect(screen.getByTestId("gop-tab-panel-character-sfx")).toBeTruthy();
    expect(within(screen.getByTestId("gop-locked-character-list")).getByText(/@유진/)).toBeTruthy();

    fireEvent.click(screen.getByTestId("gop-select-all-20-locales"));
    expect(screen.getByTestId("gop-status-notice").textContent).toContain("20개국 전체");

    // 탭 2: 웹 OST 싱크·시사회·히트맵
    fireEvent.click(screen.getByRole("tab", { name: /웹 OST 싱크·시사회·히트맵/ }));
    expect(screen.getByTestId("gop-tab-panel-ost-premiere")).toBeTruthy();
    const panelCta = screen.getByTestId("gop-ost-panel-cta") as HTMLAnchorElement;
    expect(panelCta.getAttribute("href")).toContain("/studio/assets/audio");

    fireEvent.click(screen.getByRole("button", { name: /클라이맥스 · 격돌/ }));
    expect(screen.getByTestId("gop-ost-layer-meters").textContent).toContain("96%");
    expect(screen.getByTestId("gop-remix-split-card").textContent).toContain("합계 100%");
    expect(screen.getByTestId("gop-dwell-heatmap-card").textContent).toContain("이탈 주의");

    // 탭 3: 인간 작화 증명·건강 코치
    fireEvent.click(screen.getByRole("tab", { name: /인간 작화 증명·건강 코치/ }));
    expect(screen.getByTestId("gop-tab-panel-trust-health")).toBeTruthy();
    expect(screen.getByTestId("gop-craft-cert-id").textContent).toMatch(/HCERT-/);
    expect(screen.getByTestId("gop-watermark-code").textContent).toMatch(/TSWM-/);

    fireEvent.click(screen.getByTestId("gop-lefthand-toggle"));
    expect(screen.getByTestId("gop-status-notice").textContent).toContain("왼손 단축키");
    expect(screen.getByTestId("gop-stretch-routine-90s").textContent).toContain("30초");
  });

  it("PublishSpecAutoOptimizeSection의 접힘 details를 열면 StudioGlobalOstPremiereHub가 안전하게 마운트된다", () => {
    render(
      <PublishSpecAutoOptimizeSection
        canvasWidth={800}
        canvasHeight={2000}
        exportScale={1}
        exportFormat="jpg"
        exportPresetId={null}
        exportTitle="검증용 웹툰 1화"
        pageCount={1}
        busy={false}
        canExport={true}
        pageIndices={[0]}
        capturePages={async () => ({ pages: [], indices: [], rangeLabel: "1페이지" })}
      />,
    );

    const disclosure = screen.getByTestId(
      "publish-global-ost-premiere-details",
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-global-ost-premiere-hub")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));
    expect(screen.getByTestId("studio-global-ost-premiere-hub")).toBeTruthy();
  });
});
