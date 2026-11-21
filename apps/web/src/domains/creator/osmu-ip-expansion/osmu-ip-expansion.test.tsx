// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  ANIMATION_LAYER_ORDER,
  SAMPLE_ANIMATION_CUTS,
  STANDARD_ANIMATION_FPS,
  VISEME_SHAPES,
  buildAnimationProductionPacket,
  extractLipSyncVisemesFromKorean,
  formatFrameTimecode,
} from "./osmu-animation-pipeline-engine";
import {
  SAMPLE_DRAMA_PITCH_INPUT,
  SAMPLE_WEBTOON_EPISODE,
  WEBNOVEL_PLATFORM_SPECS,
  adaptWebnovelToWebtoonOutline,
  adaptWebtoonToWebnovel,
  buildDramaPitchPackage,
} from "./osmu-webnovel-drama-engine";
import { StudioOsmuIpExpansionPanel } from "./StudioOsmuIpExpansionPanel";

import { createProductionDemoProject } from "../production-hub/production-demo";
import { EpisodeStageHandoffSection } from "../production-hub/EpisodeStageHandoffSection";
import { useI18n } from "@/shared/lib/i18n";

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("1. 웹툰 → 웹소설 산문 각색 엔진 (카카오페이지 · 문피아 · 네이버시리즈 규격)", () => {
  it("01. 카카오페이지 규격 1화 산문 초안이 4,500~5,500자 목표 범위와 챕터·엔딩 훅을 충족한다", () => {
    const result = adaptWebtoonToWebnovel(SAMPLE_WEBTOON_EPISODE);
    expect(result.chapterTitle).toBe("제1화. 멈춘 시계탑의 첫 번째 계약");
    expect(result.charCountWithSpaces).toBeGreaterThanOrEqual(4500);
    expect(result.charCountWithSpaces).toBeLessThanOrEqual(5500);
    expect(result.meetsPlatformRange).toBe(true);
    expect(result.openingHook).toContain("구 서울역 낡은 시계탑 옥상");
    expect(result.endingHook.length).toBeGreaterThan(20);
    expect(result.readingTimeMinutes).toBeGreaterThanOrEqual(5);
  });

  it("02. 문피아·네이버시리즈 플랫폼별 챕터 표기 및 권장 글자 수 규격을 정확히 적용한다", () => {
    const munpia = adaptWebtoonToWebnovel({ ...SAMPLE_WEBTOON_EPISODE, platform: "munpia" });
    const naver = adaptWebtoonToWebnovel({ ...SAMPLE_WEBTOON_EPISODE, platform: "naver-series" });
    expect(munpia.chapterTitle).toBe("[1화] 멈춘 시계탑의 첫 번째 계약");
    expect(naver.chapterTitle).toBe("1화. 멈춘 시계탑의 첫 번째 계약");
    expect(munpia.charCountWithSpaces).toBeGreaterThanOrEqual(WEBNOVEL_PLATFORM_SPECS.munpia.targetMinChars);
    expect(munpia.charCountWithSpaces).toBeLessThanOrEqual(WEBNOVEL_PLATFORM_SPECS.munpia.targetMaxChars);
    expect(naver.charCountWithSpaces).toBeGreaterThanOrEqual(WEBNOVEL_PLATFORM_SPECS["naver-series"].targetMinChars);
    expect(naver.charCountWithSpaces).toBeLessThanOrEqual(WEBNOVEL_PLATFORM_SPECS["naver-series"].targetMaxChars);
  });

  it("03. 원본 웹툰의 모든 컷과 화자 대사를 누락 없이 인용 부호와 어조로 정렬한다", () => {
    const result = adaptWebtoonToWebnovel(SAMPLE_WEBTOON_EPISODE);
    const totalExpectedDialogues = SAMPLE_WEBTOON_EPISODE.cuts.reduce(
      (sum, cut) => sum + cut.dialogues.length,
      0,
    );
    expect(result.preservedCutCount).toBe(SAMPLE_WEBTOON_EPISODE.cuts.length);
    expect(result.preservedDialogueCount).toBe(totalExpectedDialogues);
    expect(result.speakerDialogueAlignment).toHaveLength(totalExpectedDialogues);
    for (const cut of SAMPLE_WEBTOON_EPISODE.cuts) {
      for (const dlg of cut.dialogues) {
        expect(result.fullProse).toContain(`“${dlg.line}”`);
        expect(result.speakerDialogueAlignment.some((a) => a.speaker === dlg.speaker && a.originalLine === dlg.line)).toBe(true);
      }
    }
  });

  it("04. 1인칭 시점과 3인칭 제한 시점 전환 시 올바른 주어와 한글 조사(은/는, 이/가)를 사용한다", () => {
    const firstPerson = adaptWebtoonToWebnovel({ ...SAMPLE_WEBTOON_EPISODE, pov: "first-person" });
    const thirdPerson = adaptWebtoonToWebnovel({
      ...SAMPLE_WEBTOON_EPISODE,
      pov: "third-person-limited",
      protagonistName: "박지훈",
    });
    expect(firstPerson.openingHook).toContain("나는");
    expect(thirdPerson.openingHook).toContain("박지훈은");
    expect(thirdPerson.fullProse).toContain("서진우가");
    expect(thirdPerson.fullProse).toContain("한서연이");
  });

  it("05. 결정론적 재현성(동일 입력 → 바이트 단위 동일 출력)과 Markdown 내보내기를 보장한다", () => {
    const runA = adaptWebtoonToWebnovel(SAMPLE_WEBTOON_EPISODE);
    const runB = adaptWebtoonToWebnovel(SAMPLE_WEBTOON_EPISODE);
    expect(runA.fullProse).toBe(runB.fullProse);
    expect(runA.markdownExport).toBe(runB.markdownExport);
    expect(runA.markdownExport).toContain("# 시간의 대장간 — 제1화. 멈춘 시계탑의 첫 번째 계약");
    expect(runA.markdownExport).toContain("보존 검증");
  });

  it("06. 컷이 비어 있는 입력에서도 예외 없이 안전한 빈 초안 결과를 반환한다", () => {
    const emptyResult = adaptWebtoonToWebnovel({ ...SAMPLE_WEBTOON_EPISODE, cuts: [] });
    expect(emptyResult.preservedCutCount).toBe(0);
    expect(emptyResult.preservedDialogueCount).toBe(0);
    expect(emptyResult.meetsPlatformRange).toBe(false);
    expect(emptyResult.paragraphs).toHaveLength(0);
  });
});

describe("2. 웹소설 → 웹툰 콘티 추출 & 양방향 무손실 왕복 변환", () => {
  it("07. 웹툰 → 웹소설 → 웹툰 양방향 왕복 변환 시 모든 화자와 원문 대사를 무손실 추출한다", () => {
    const novel = adaptWebtoonToWebnovel(SAMPLE_WEBTOON_EPISODE);
    const outline = adaptWebnovelToWebtoonOutline(novel.fullProse);

    expect(outline.episodeTitle).toContain("멈춘 시계탑의 첫 번째 계약");
    expect(outline.scenes.length).toBeGreaterThanOrEqual(3);
    expect(outline.dialogueBlocks.length).toBeGreaterThanOrEqual(novel.preservedDialogueCount);
    expect(outline.narrationBlocks.length).toBeGreaterThan(0);

    for (const aligned of novel.speakerDialogueAlignment) {
      expect(
        outline.dialogueBlocks.some(
          (block) => block.speaker === aligned.speaker && block.text === aligned.originalLine,
        ),
      ).toBe(true);
    }

    const extractedNames = outline.characterCards.map((c) => c.name);
    expect(extractedNames).toEqual(expect.arrayContaining(["서진우", "한서연", "강태오"]));
    expect(outline.roundTripCoverage.preservedTextRatioPercent).toBeGreaterThanOrEqual(95);
  });

  it("08. 씬별 배분 컷 수 합계가 totalAllocatedCuts와 일치하고 컷 번호 구간이 연속된다", () => {
    const novel = adaptWebtoonToWebnovel(SAMPLE_WEBTOON_EPISODE);
    const outline = adaptWebnovelToWebtoonOutline(novel.fullProse, { targetCutsPerEpisode: 60 });

    const sumCuts = outline.scenes.reduce((sum, scene) => sum + scene.allocatedCutCount, 0);
    expect(sumCuts).toBe(outline.totalAllocatedCuts);
    expect(outline.totalAllocatedCuts).toBe(60);

    let expectedStart = 1;
    for (const scene of outline.scenes) {
      expect(scene.cutStart).toBe(expectedStart);
      expect(scene.cutEnd).toBe(scene.cutStart + scene.allocatedCutCount - 1);
      expectedStart = scene.cutEnd + 1;
    }
  });

  it("09. 대본형 콜론(화자: 대사)과 꺾쇠(「...」) 등 다양한 웹소설 인용 포맷을 파싱한다", () => {
    const customNovel = [
      "2화. 붉은 모루의 진실",
      "차가운 안개가 지하 계단을 타고 흘러내렸다.",
      "김도현: 「여기까지가 우리가 허락된 시간이다.」",
      "이수아가 낮게 대답했다.",
      "“물러설 생각 없어요. 끝까지 확인할 겁니다.”",
      "***",
      "거대한 철문이 쾅 소리를 내며 닫혔다.",
    ].join("\n");

    const outline = adaptWebnovelToWebtoonOutline(customNovel);
    expect(outline.episodeTitle).toBe("2화. 붉은 모루의 진실");
    expect(outline.scenes).toHaveLength(2);
    expect(outline.dialogueBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ speaker: "김도현", text: "여기까지가 우리가 허락된 시간이다." }),
        expect.objectContaining({ speaker: "이수아", text: "물러설 생각 없어요. 끝까지 확인할 겁니다." }),
      ]),
    );
    expect(outline.narrationBlocks.length).toBeGreaterThanOrEqual(2);
    expect(outline.characterCards.map((c) => c.name)).toEqual(
      expect.arrayContaining(["김도현", "이수아"]),
    );
  });

  it("10. 구분자가 없는 일반 산문 웹소설도 문단 밀도에 따라 자동으로 다중 씬과 콘티 패널로 분할한다", () => {
    const plainNovel = [
      "지하철 막차가 끊긴 서울역 광장에 굵은 빗줄기가 쏟아졌다.",
      "민재가 우산을 접으며 말했다.",
      "“저기 시계탑 불빛 보여?”",
      "유진이 고개를 들며 물었다.",
      "“십 년째 꺼져 있던 곳인데 왜 오늘 켜졌지?”",
      "시계 문자판이 삐걱거리며 거꾸로 회전하기 시작했다.",
      "둘의 손목시계 초침이 동시에 멈춰 섰다.",
      "민재가 숨을 삼키며 속삭였다.",
      "“우리 지금 어제로 끌려가고 있어.”",
    ].join("\n");

    const outline = adaptWebnovelToWebtoonOutline(plainNovel);
    expect(outline.scenes.length).toBeGreaterThanOrEqual(2);
    expect(outline.scenes.every((s) => s.panels.every((p) => p.scrollBeatHeightPx >= 1000))).toBe(true);
    expect(outline.markdownExport).toContain("# 웹소설 → 웹툰 콘티 시트");
  });

  it("11. 공백뿐인 웹소설 텍스트 입력 시 예외 없이 빈 콘티 시트를 반환한다", () => {
    const empty = adaptWebnovelToWebtoonOutline("   \n\n  ");
    expect(empty.scenes).toHaveLength(0);
    expect(empty.totalAllocatedCuts).toBe(0);
    expect(empty.characterCards).toHaveLength(0);
  });
});

describe("3. 웹드라마 · OTT 영상화 피칭 & 제작 패키저", () => {
  it("12. 1-Page 기획서(로그라인·타겟 시청층·차별점 3건+·포지셔닝)를 완전 생성한다", () => {
    const pitch = buildDramaPitchPackage(SAMPLE_DRAMA_PITCH_INPUT);
    expect(pitch.onePageProposal.title).toBe("시간의 대장간");
    expect(pitch.onePageProposal.platformLabelKo).toContain("넷플릭스");
    expect(pitch.onePageProposal.episodeCount).toBe(12);
    expect(pitch.onePageProposal.runtimePerEpisodeMin).toBe(52);
    expect(pitch.onePageProposal.logline).toContain("서진우");
    expect(pitch.onePageProposal.differentiators.length).toBeGreaterThanOrEqual(3);
    expect(pitch.onePageProposal.targetAudience.platformFitReason.length).toBeGreaterThan(15);
  });

  it("13. OTT 12부작 시즌 아크는 1~12화 4막 구조와 상승 텐션 곡선을 생성한다", () => {
    const pitch = buildDramaPitchPackage({ ...SAMPLE_DRAMA_PITCH_INPUT, format: "ott-12ep" });
    expect(pitch.seasonArc).toHaveLength(12);
    expect(pitch.seasonArc[0]?.actNumber).toBe(1);
    expect(pitch.seasonArc[11]?.actNumber).toBe(4);
    expect(pitch.seasonArc[11]?.tensionScore).toBeGreaterThan(pitch.seasonArc[0]?.tensionScore ?? 0);
    expect(pitch.seasonArc.every((ep) => ep.cliffhangerHook.length > 10)).toBe(true);
  });

  it("14. 숏폼 50부작 전환 시 정확히 50화(회당 2분) 시즌 아크와 숏폼 예산 규모를 산출한다", () => {
    const pitch = buildDramaPitchPackage({
      ...SAMPLE_DRAMA_PITCH_INPUT,
      targetPlatform: "shortform-drama",
      format: "shortform-50ep",
      budgetTier: "low",
    });
    expect(pitch.onePageProposal.episodeCount).toBe(50);
    expect(pitch.onePageProposal.runtimePerEpisodeMin).toBe(2);
    expect(pitch.seasonArc).toHaveLength(50);
    expect(pitch.seasonArc[49]?.episodeNumber).toBe(50);
    expect(pitch.budgetSummary.perEpisodeMillionKrw).toBe(18);
    expect(pitch.budgetSummary.totalSeasonMillionKrw).toBe(900);
  });

  it("15. 씬별 로케이션 티어·VFX 난이도(HERO_CG 등)를 점수화하고 예산 티어 적합성을 판정한다", () => {
    const lowTierPitch = buildDramaPitchPackage({ ...SAMPLE_DRAMA_PITCH_INPUT, budgetTier: "low" });
    const tentpolePitch = buildDramaPitchPackage({ ...SAMPLE_DRAMA_PITCH_INPUT, budgetTier: "tentpole" });

    const gwanghwamun = lowTierPitch.sceneProductionMatrix.find((s) => s.sceneId === "S03");
    expect(gwanghwamun?.vfxDifficulty).toBe("HERO_CG");
    expect(gwanghwamun?.locationTier).toBe("대형 특수 로케이션");
    expect(gwanghwamun?.recommendedBudgetTier).toBe("tentpole");
    expect(lowTierPitch.budgetSummary.tierFitAssessment).toBe("예산 상향 권고");
    expect(tentpolePitch.budgetSummary.tierFitAssessment).toBe("적정");
    expect(
      tentpolePitch.budgetSummary.vfxBudgetSharePercent +
        tentpolePitch.budgetSummary.locationBudgetSharePercent +
        tentpolePitch.budgetSummary.castAndCrewSharePercent,
    ).toBe(100);
  });

  it("16. 주조연 캐스팅 프로필 시트의 분량 비중 총합이 정확히 100%이고 오디션 프롬프트를 포함한다", () => {
    const pitch = buildDramaPitchPackage(SAMPLE_DRAMA_PITCH_INPUT);
    expect(pitch.castingProfiles).toHaveLength(SAMPLE_DRAMA_PITCH_INPUT.characters.length);
    const totalShare = pitch.castingProfiles.reduce((sum, p) => sum + p.screenTimeSharePercent, 0);
    expect(totalShare).toBe(100);
    expect(pitch.castingProfiles[0]?.roleLabelKo).toContain("주연");
    expect(pitch.castingProfiles.every((p) => p.auditionSidePrompt.includes("[오디션 지정 씬]"))).toBe(true);
  });

  it("17. JSON 및 Markdown 내보내기가 파싱 가능하고 모든 핵심 섹션을 포함한다", () => {
    const pitch = buildDramaPitchPackage(SAMPLE_DRAMA_PITCH_INPUT);
    const parsed = JSON.parse(pitch.jsonExport) as {
      onePageProposal: { title: string };
      seasonArc: unknown[];
      sceneProductionMatrix: unknown[];
      castingProfiles: unknown[];
    };
    expect(parsed.onePageProposal.title).toBe("시간의 대장간");
    expect(parsed.seasonArc).toHaveLength(12);
    expect(parsed.sceneProductionMatrix).toHaveLength(3);
    expect(parsed.castingProfiles).toHaveLength(3);
    expect(pitch.markdownExport).toContain("## 1. 1-Page 기획서");
    expect(pitch.markdownExport).toContain("## 4. 주조연 캐스팅 프로필 시트");
  });
});

describe("4. 애니메이션 24fps X-Sheet · 2.5D 패럴랙스 · 립싱크 음소 · 분업 패킷", () => {
  it("18. 5개 분리 레이어(BG/MID/CHAR/FX/SPEECH)가 원경→전경 Z-depth와 패럴랙스 배율 순으로 정렬된다", () => {
    const packet = buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS);
    const firstCut = packet.cuts[0];
    expect(firstCut.parallaxPlan.layers.map((l) => l.kind)).toEqual([...ANIMATION_LAYER_ORDER]);
    for (let i = 1; i < firstCut.parallaxPlan.layers.length; i += 1) {
      const prev = firstCut.parallaxPlan.layers[i - 1];
      const curr = firstCut.parallaxPlan.layers[i];
      expect(curr.zDepthMeters).toBeGreaterThan(prev.zDepthMeters);
      expect(curr.parallaxMultiplier).toBeGreaterThan(prev.parallaxMultiplier);
    }
  });

  it("19. 2.5D 패럴랙스 카메라 이동 시 전경 레이어 변위가 중경·원경보다 항상 크다", () => {
    const packet = buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS);
    const truckCut = packet.cuts[0]; // TRUCK_PARALLAX
    const bg = truckCut.parallaxPlan.layers.find((l) => l.kind === "BG");
    const mid = truckCut.parallaxPlan.layers.find((l) => l.kind === "MID");
    const char = truckCut.parallaxPlan.layers.find((l) => l.kind === "CHAR");
    const fx = truckCut.parallaxPlan.layers.find((l) => l.kind === "FX");
    expect(Math.abs(fx?.endOffsetPx.x ?? 0)).toBeGreaterThan(Math.abs(char?.endOffsetPx.x ?? 0));
    expect(Math.abs(char?.endOffsetPx.x ?? 0)).toBeGreaterThan(Math.abs(mid?.endOffsetPx.x ?? 0));
    expect(Math.abs(mid?.endOffsetPx.x ?? 0)).toBeGreaterThan(Math.abs(bg?.endOffsetPx.x ?? 0));
  });

  it("20. 24fps X-Sheet 프레임 총합·연속 프레임 번호·총 러닝타임(초/MM:SS:FF)이 정확히 일치한다", () => {
    const packet = buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS, { fps: STANDARD_ANIMATION_FPS });
    // 3.0s(72f) + 2.5s(60f) + 2.0s(48f) = 180f = 7.5s = 00:07:12
    expect(packet.fps).toBe(24);
    expect(packet.totalFrames).toBe(180);
    expect(packet.totalDurationSec).toBe(7.5);
    expect(packet.formattedTimecode).toBe("00:07:12");
    expect(formatFrameTimecode(72, 24)).toBe("00:03:00");

    let expectedStart = 1;
    let totalXSheetRows = 0;
    for (const cut of packet.cuts) {
      expect(cut.startFrame).toBe(expectedStart);
      expect(cut.endFrame).toBe(expectedStart + cut.durationFrames - 1);
      expect(cut.xSheetRows).toHaveLength(cut.durationFrames);
      expect(cut.xSheetRows[0]?.globalFrame).toBe(cut.startFrame);
      expect(cut.xSheetRows[cut.xSheetRows.length - 1]?.globalFrame).toBe(cut.endFrame);
      expectedStart = cut.endFrame + 1;
      totalXSheetRows += cut.xSheetRows.length;
    }
    expect(totalXSheetRows).toBe(packet.totalFrames);
  });

  it("21. 한국어 음절 모음 분해로 A/I/U/E/O/Closed 립싱크 타이밍을 정확히 매핑하고 발화 말미를 닫는다", () => {
    const keys = extractLipSyncVisemesFromKorean({
      speaker: "서진우",
      text: "가기구게고.",
      startFrame: 1,
      fps: 24,
      framesPerSyllable: 3,
    });
    expect(keys.map((k) => k.viseme)).toEqual(["A", "I", "U", "E", "O", "Closed"]);
    for (const key of keys) {
      expect(VISEME_SHAPES).toContain(key.viseme);
    }
    // 구두점 없는 발화에도 마지막 Closed 종결 프레임이 자동 추가된다.
    const noPunct = extractLipSyncVisemesFromKorean({
      speaker: "한서연",
      text: "가자",
      startFrame: 10,
      fps: 24,
      framesPerSyllable: 2,
    });
    expect(noPunct[noPunct.length - 1]?.viseme).toBe("Closed");
    expect(noPunct[0]?.startFrame).toBe(10);
  });

  it("22. 1코마(풀애니) → 2코마(TV표준) → 3코마(리미티드) 전환 시 원화·동화·채색 매수가 단조 감소한다", () => {
    const full1s = buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS, { komaStyle: "1s" });
    const std2s = buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS, { komaStyle: "2s" });
    const lim3s = buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS, { komaStyle: "3s" });

    const total1s = full1s.departmentSummary.totalKeyDrawings + full1s.departmentSummary.totalInBetweens;
    const total2s = std2s.departmentSummary.totalKeyDrawings + std2s.departmentSummary.totalInBetweens;
    const total3s = lim3s.departmentSummary.totalKeyDrawings + lim3s.departmentSummary.totalInBetweens;
    expect(total1s).toBeGreaterThan(total2s);
    expect(total2s).toBeGreaterThan(total3s);
    expect(full1s.departmentSummary.totalPaintCels).toBeGreaterThan(lim3s.departmentSummary.totalPaintCels);
  });

  it("23. 애니메이션 제작 패킷 JSON·Markdown 내보내기가 총 프레임·분업 집계를 정확히 수록한다", () => {
    const packet = buildAnimationProductionPacket(SAMPLE_ANIMATION_CUTS, {
      format: "shortform-movingtoon",
      aspectRatio: "9:16",
    });
    const parsed = JSON.parse(packet.jsonExport) as {
      totalFrames: number;
      aspectRatio: string;
      cuts: unknown[];
    };
    expect(parsed.totalFrames).toBe(180);
    expect(parsed.aspectRatio).toBe("9:16");
    expect(parsed.cuts).toHaveLength(3);
    expect(packet.markdownExport).toContain("00:07:12");
    expect(packet.markdownExport).toContain("C001");
  });
});

describe("5. OSMU IP 확장 관제실 UI 3탭 렌더링 · 인터랙션 · 지연 로딩 마운트", () => {
  it("24. 초기 렌더 시 한글 UI, ₩0 결정론적 배지, 4개 KPI, 3개 탭이 표시된다", () => {
    render(<StudioOsmuIpExpansionPanel projectId="proj-demo-1" />);
    expect(screen.getByTestId("studio-osmu-ip-expansion-panel")).toBeTruthy();
    expect(screen.getByTestId("osmu-zero-cost-badge").textContent).toContain("₩0");
    expect(screen.getByTestId("osmu-tab-webnovel").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("osmu-tab-drama").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("osmu-tab-anime").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("osmu-kpi-anime-runtime").textContent).toContain("180f");
  });

  it("25. 탭 1에서 플랫폼(문피아) 전환, Markdown 미리보기, 웹소설→웹툰 콘티 역추출 인터랙션이 동작한다", () => {
    render(<StudioOsmuIpExpansionPanel />);
    fireEvent.click(screen.getByTestId("osmu-novel-platform-munpia"));
    expect(screen.getByTestId("osmu-novel-chapter-title").textContent).toContain("[1화]");

    fireEvent.click(screen.getByTestId("osmu-novel-md-toggle"));
    expect(screen.getByTestId("osmu-novel-export-box").textContent).toContain("문피아");

    fireEvent.click(screen.getByTestId("osmu-novel-roundtrip-btn"));
    expect(screen.getByTestId("osmu-novel-to-webtoon-view")).toBeTruthy();
    expect(screen.getByTestId("osmu-reverse-character-cards").textContent).toContain("서진우");
    expect(screen.getByTestId("osmu-status-banner").textContent).toContain("동기화했습니다");
  });

  it("26. 탭 1 웹소설 원문 텍스트를 수정하면 콘티 씬과 캐릭터 카드가 즉시 재계산된다", () => {
    render(<StudioOsmuIpExpansionPanel />);
    fireEvent.click(screen.getByTestId("osmu-direction-to-webtoon"));
    const textarea = screen.getByTestId("osmu-reverse-novel-textarea");
    fireEvent.change(textarea, {
      target: {
        value: "1화. 새벽 대장간\n최유나가 말했다.\n“이번엔 내가 불씨를 지킬게.”\n***\n문이 열렸다.",
      },
    });
    expect(screen.getByTestId("osmu-reverse-character-cards").textContent).toContain("최유나");
    expect(screen.getByTestId("osmu-reverse-scene-list").textContent).toContain("Scene 2");
  });

  it("27. 탭 2(웹드라마·OTT)에서 50부작 숏폼·저예산 티어 전환과 JSON 내보내기가 동작한다", () => {
    render(<StudioOsmuIpExpansionPanel />);
    fireEvent.click(screen.getByTestId("osmu-tab-drama"));
    expect(screen.getByTestId("osmu-drama-panel")).toBeTruthy();

    fireEvent.click(screen.getByTestId("osmu-drama-format-shortform-50ep"));
    fireEvent.click(screen.getByTestId("osmu-drama-tier-low"));
    expect(screen.getByTestId("osmu-drama-episode-badge").textContent).toContain("50부작");
    expect(screen.getByTestId("osmu-drama-tier-fit").textContent).toContain("예산 상향 권고");

    fireEvent.click(screen.getByTestId("osmu-drama-export-json-btn"));
    expect(screen.getByTestId("osmu-drama-export-box").textContent).toContain('"episodeCount": 50');
  });

  it("28. 탭 3(애니메이션 24fps)에서 1코마 전환·컷 선택·X-Sheet/립싱크/Markdown 내보내기가 동작한다", () => {
    render(<StudioOsmuIpExpansionPanel />);
    fireEvent.click(screen.getByTestId("osmu-tab-anime"));
    expect(screen.getByTestId("osmu-anime-panel")).toBeTruthy();

    const keyCount2s = screen.getByTestId("osmu-anime-key-count").textContent;
    fireEvent.click(screen.getByTestId("osmu-anime-koma-1s"));
    const keyCount1s = screen.getByTestId("osmu-anime-key-count").textContent;
    expect(keyCount1s).not.toBe(keyCount2s);

    fireEvent.click(screen.getByTestId("osmu-anime-cut-C002"));
    expect(screen.getByTestId("osmu-anime-parallax-card").textContent).toContain("한서연");
    expect(screen.getByTestId("osmu-anime-lipsync-strip").textContent).toContain("Closed");
    expect(screen.getByTestId("osmu-anime-xsheet-table").textContent).toContain("DOLLY_IN");

    fireEvent.click(screen.getByTestId("osmu-anime-export-md-btn"));
    expect(screen.getByTestId("osmu-anime-export-box").textContent).toContain("24fps");
  });

  it("29. 복사 버튼 클릭 시 상태 알림 배너로 결과를 안내한다", () => {
    render(<StudioOsmuIpExpansionPanel />);
    fireEvent.click(screen.getByTestId("osmu-novel-copy-md"));
    expect(screen.getByTestId("osmu-status-banner").textContent).toContain("웹소설 1화 원고 Markdown");
  });

  it("30. EpisodeStageHandoffSection 접이식 패널은 닫힘 시 미마운트이고 열면 lazyRetry로 OSMU 관제실을 마운트한다", async () => {
    const aggregate = createProductionDemoProject();
    const episodeId = aggregate.episodes[0]?.episodeId ?? "episode-1";

    render(
      <MemoryRouter>
        <EpisodeStageHandoffSection
          aggregate={aggregate}
          episodeId={episodeId}
          targetStage="storyboard"
        />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("studio-osmu-ip-expansion-disclosure") as HTMLDetailsElement;
    expect(disclosure).toBeTruthy();
    expect(screen.queryByTestId("studio-osmu-ip-expansion-panel")).toBeNull();

    act(() => {
      disclosure.open = true;
      fireEvent(disclosure, new Event("toggle"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("studio-osmu-ip-expansion-panel")).toBeTruthy();
    });
  });
});
