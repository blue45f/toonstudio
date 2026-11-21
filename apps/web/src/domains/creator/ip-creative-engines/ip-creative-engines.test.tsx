// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeEpisodeTensionCurve,
  auditReadabilityForDarkAndCvd,
  buildCutReuseBankIndex,
  buildSpoilerFreeRecap,
  computeContrastRatio,
  createCanvasInsertPayload,
  relativeLuminance,
  searchCutReuseBank,
  simulateColorVision,
  toOklchCss,
  validateBranchingStoryGraph,
} from "./a11y-reuse-tension-engine";
import {
  buildShortformTrailerPlan,
  formatTimecodeSec,
  generateAudioCueSheet,
  localizeWebtoonDialogue,
  packageLocalLoraDataset,
  runCopyrightCleanroomAudit,
  type TargetLocale,
} from "./audio-localize-cleanroom-engine";
import {
  DEFAULT_AUDIO_SCRIPT_LINES,
  DEFAULT_BRANCHING_GRAPH,
  DEFAULT_CLEANROOM_ASSETS,
  DEFAULT_CUT_REUSE_BANK,
  DEFAULT_LOCALIZE_INPUT,
  DEFAULT_LORA_SAMPLES,
  DEFAULT_READABILITY_LAYERS,
  DEFAULT_STORY_BIBLE,
  DEFAULT_TENSION_CUTS,
  DEFAULT_TRAILER_CANDIDATES,
} from "./ip-creative-presets";
import { StudioIpCreativeEnginesPanel } from "./StudioIpCreativeEnginesPanel";
import { StudioWorkspaceMiniApps } from "../virtual-space/StudioWorkspaceMiniApps";

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: null }),
  getAuthUserId: () => null,
}));

vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    kvGet: async () => null,
    kvSet: async () => undefined,
  }),
  resetFailedStudioLocalDatabaseOwnership: async () => true,
}));

afterEach(() => {
  cleanup();
});

describe("1. 다크모드·색맹·저시력 자동 가독성 검수기", () => {
  it("네이버·카카오 야간 다크 배경 위 검정 SFX 매몰을 탐지하고 밝은 외곽선(Halo) 교정을 제안한다", () => {
    const report = auditReadabilityForDarkAndCvd(DEFAULT_READABILITY_LAYERS, "naver-kakao-dark");
    const blackSfx = report.items.find((entry) => entry.item.id === "layer-sfx-black");
    expect(blackSfx).toBeDefined();
    expect(blackSfx?.darkModeBuried).toBe(true);
    expect(blackSfx?.severity).toBe("critical");
    expect(blackSfx?.normalContrast).toBeLessThan(1.5);
    expect(blackSfx?.haloCorrection.recommended).toBe(true);
    expect(blackSfx?.haloCorrection.strokeWidthPx).toBeGreaterThanOrEqual(2.2);
    expect(blackSfx?.haloCorrection.haloColorOklch).toMatch(/^oklch\(/u);
    expect(blackSfx?.haloCorrection.projectedContrast).toBeGreaterThanOrEqual(10);
  });

  it("Protanopia·Deuteranopia·Tritanopia 색각 시뮬레이션에서 적록·청황 대비 저하를 계산한다", () => {
    const crimson = { r: 196, g: 36, b: 44 };
    const forest = { r: 24, g: 82, b: 42 };
    const simProtanFg = simulateColorVision(crimson, "protanopia");
    const simProtanBg = simulateColorVision(forest, "protanopia");
    const simDeutanFg = simulateColorVision(crimson, "deuteranopia");
    const simTritanBlue = simulateColorVision({ r: 30, g: 120, b: 230 }, "tritanopia");

    expect(simProtanFg.r).toBeLessThan(crimson.r);
    expect(computeContrastRatio(simProtanFg, simProtanBg)).toBeLessThan(2.5);
    expect(simDeutanFg.r).toBeLessThan(crimson.r);
    expect(simTritanBlue.b).not.toBe(230);
  });

  it("sRGB를 원시 HEX 없이 OKLCH 문자열과 정확한 WCAG 상대휘도로 변환한다", () => {
    const darkBg = { r: 14, g: 16, b: 21 };
    const white = { r: 255, g: 255, b: 255 };
    expect(toOklchCss(darkBg)).toMatch(/^oklch\(0\.1\d\d 0\.0\d\d \d+\)$/u);
    expect(relativeLuminance(white)).toBeCloseTo(1, 3);
    expect(computeContrastRatio(white, { r: 0, g: 0, b: 0 })).toBe(21);
  });

  it("흰 말풍선 위 짙은 먹색 대사는 모든 색각 모드에서 통과하고 불필요한 Halo를 권하지 않는다", () => {
    const report = auditReadabilityForDarkAndCvd([DEFAULT_READABILITY_LAYERS[2]], "naver-kakao-dark");
    expect(report.passCount).toBe(1);
    expect(report.overallGradeKo).toBe("AA+ 최적");
    expect(report.items[0].lowVisionPass).toBe(true);
    expect(report.items[0].haloCorrection.recommended).toBe(false);
  });

  it("14px 미만 저시력 자막을 경고/교정 대상으로 잡는다", () => {
    const report = auditReadabilityForDarkAndCvd([DEFAULT_READABILITY_LAYERS[3]], "naver-kakao-dark");
    expect(report.items[0].lowVisionPass).toBe(false);
    expect(report.items[0].severity).not.toBe("pass");
  });

  it("외곽선(Halo)을 적용하면 다크모드 매몰 상태가 해제된다", () => {
    const fixed = DEFAULT_READABILITY_LAYERS.map((layer) =>
      layer.id === "layer-sfx-black" ? { ...layer, hasOuterHalo: true, strokeWidthPx: 3.4 } : layer,
    );
    const report = auditReadabilityForDarkAndCvd(fixed, "naver-kakao-dark");
    const blackSfx = report.items.find((entry) => entry.item.id === "layer-sfx-black");
    expect(blackSfx?.darkModeBuried).toBe(false);
  });
});

describe("2. 자동 컷 재활용 뱅크 (1~100화 표정·손·소품)", () => {
  it("카테고리·감정·캐릭터·회차 토큰으로 1~100화 자산을 인덱싱한다", () => {
    const index = buildCutReuseBankIndex(DEFAULT_CUT_REUSE_BANK);
    expect(index.totalAssets).toBe(DEFAULT_CUT_REUSE_BANK.length);
    expect(index.characters).toEqual(["공용 소품", "윤채린", "한서진"]);
    expect(index.byCategory.get("expression")?.length).toBe(3);
  });

  it("한국어 키워드와 회차·카테고리 조합 검색이 정확히 필터링된다", () => {
    const index = buildCutReuseBankIndex(DEFAULT_CUT_REUSE_BANK);
    const hits = searchCutReuseBank(index, { keyword: "분노 14화", category: "expression", characterName: "한서진" });
    expect(hits).toHaveLength(1);
    expect(hits[0].asset.id).toBe("reuse-han-anger-14");
    expect(hits[0].matchedFields).toContain("회차");
  });

  it("회차 구간 필터(minEpisode~maxEpisode)를 엄격히 적용한다", () => {
    const index = buildCutReuseBankIndex(DEFAULT_CUT_REUSE_BANK);
    const lateHits = searchCutReuseBank(index, { minEpisode: 60, maxEpisode: 100 });
    expect(lateHits.every((hit) => hit.asset.episodeNumber >= 60)).toBe(true);
    expect(lateHits.length).toBe(2);
  });

  it("1초 캔버스 삽입 페이로드(반전·레이어명·절감시간·권리태그)를 생성한다", () => {
    const payload = createCanvasInsertPayload(DEFAULT_CUT_REUSE_BANK[0], {
      targetX: 512,
      targetY: 280,
      scale: 1.2,
      flipHorizontal: true,
    });
    expect(payload.payloadVersion).toBe("toonstudio.cut-reuse.v1");
    expect(payload.insertLatencyBudgetMs).toBe(1000);
    expect(payload.targetLayerName).toBe("재활용_한서진_expression_EP014");
    expect(payload.transform.scaleX).toBe(-1.2);
    expect(payload.transform.flipHorizontal).toBe(true);
    expect(payload.rightsTag).toBe("author-self-owned");
  });
});

describe("3. 무스포일러 관계도·30초 요약·연재 텐션·분기 인터랙티브 컷", () => {
  it("독자 열람 회차(14화) 이후 등장인물·관계 반전·요약 비트를 완전히 차단한다", () => {
    const recap = buildSpoilerFreeRecap(DEFAULT_STORY_BIBLE, 14, 30);
    expect(recap.spoilerLeakCount).toBe(0);
    expect(recap.visibleCharacters.map((c) => c.id)).not.toContain("char-archivist");
    expect(recap.visibleRelationships.map((r) => r.id)).toContain("rel-1");
    expect(recap.visibleRelationships.map((r) => r.id)).not.toContain("rel-2");
    expect(recap.visibleRelationships.map((r) => r.id)).not.toContain("rel-4");
    expect(recap.redactedCharacterCount).toBe(1);
    expect(recap.redactedRelationshipCount).toBe(2);
  });

  it("18화 도달 시 대체된(superseded) 구 관계(감시)를 숨기고 공조 관계로 전환한다", () => {
    const recap = buildSpoilerFreeRecap(DEFAULT_STORY_BIBLE, 18, 30);
    const relIds = recap.visibleRelationships.map((r) => r.id);
    expect(relIds).not.toContain("rel-1");
    expect(relIds).toContain("rel-2");
    expect(relIds).not.toContain("rel-4");
  });

  it("지난 화 복습 카드를 30초 읽기 예산 안에 맞춰 생성한다", () => {
    const recap = buildSpoilerFreeRecap(DEFAULT_STORY_BIBLE, 28, 30);
    expect(recap.recapCards.length).toBeGreaterThan(0);
    expect(recap.totalReadSeconds).toBeLessThanOrEqual(30);
    expect(recap.within30SecBudget).toBe(true);
  });

  it("후반 클라이맥스 배치와 설명 대사 과밀 구간(pacing drag)을 정확히 판정한다", () => {
    const analysis = analyzeEpisodeTensionCurve(DEFAULT_TENSION_CUTS);
    expect(analysis.climaxPlacementStatus).toBe("optimal");
    expect(analysis.climaxCutIndex).toBe(6);
    expect(analysis.pacingDragCutIndices).toContain(2);
    expect(analysis.endingHookScore).toBeGreaterThanOrEqual(80);
  });

  it("초반 쏠림 클라이맥스와 저긴장 평탄 구간(flatline)을 탐지한다", () => {
    const earlyFlat = analyzeEpisodeTensionCurve([
      { cutIndex: 1, labelKo: "초반 폭발", emotionIntensity: 95, actionIntensity: 92, dialogueDensity: 20, hasCliffhanger: false },
      { cutIndex: 2, labelKo: "정적1", emotionIntensity: 20, actionIntensity: 12, dialogueDensity: 25, hasCliffhanger: false },
      { cutIndex: 3, labelKo: "정적2", emotionIntensity: 22, actionIntensity: 14, dialogueDensity: 25, hasCliffhanger: false },
      { cutIndex: 4, labelKo: "정적3", emotionIntensity: 21, actionIntensity: 13, dialogueDensity: 25, hasCliffhanger: false },
      { cutIndex: 5, labelKo: "마무리", emotionIntensity: 24, actionIntensity: 15, dialogueDensity: 25, hasCliffhanger: false },
    ]);
    expect(earlyFlat.climaxPlacementStatus).toBe("too-early");
    expect(earlyFlat.flatlineStretches.length).toBeGreaterThanOrEqual(1);
    expect(earlyFlat.endingHookScore).toBeLessThan(68);
  });

  it("정상 분기 인터랙티브 컷 그래프는 모든 노드와 엔딩 도달을 검증 통과한다", () => {
    const result = validateBranchingStoryGraph(DEFAULT_BRANCHING_GRAPH);
    expect(result.isValid).toBe(true);
    expect(result.unreachableNodeIds).toEqual([]);
    expect(result.infiniteLoopPaths).toEqual([]);
    expect(result.reachableEndingIds).toEqual(["ending-truth", "ending-escape"]);
  });

  it("도달 불가 분기·무한 루프·끊긴 선택지·막다른 컷을 모두 탐지한다", () => {
    const broken = validateBranchingStoryGraph({
      startNodeId: "n1",
      nodes: [
        { id: "n1", titleKo: "시작", isEnding: false, choices: [{ id: "e1", labelKo: "진입", targetNodeId: "n2" }] },
        { id: "n2", titleKo: "루프A", isEnding: false, choices: [{ id: "e2", labelKo: "복귀", targetNodeId: "n1" }, { id: "e3", labelKo: "유령", targetNodeId: "missing" }] },
        { id: "n3", titleKo: "고립 컷", isEnding: false, choices: [] },
      ],
    });
    expect(broken.isValid).toBe(false);
    expect(broken.unreachableNodeIds).toEqual(["n3"]);
    expect(broken.infiniteLoopPaths.length).toBeGreaterThanOrEqual(1);
    expect(broken.danglingEdges).toHaveLength(1);
    expect(broken.deadEndNodeIds).toEqual(["n3"]);
  });
});

describe("4. 오디오 웹툰 큐시트 & 9:16 숏폼 모션 트레일러 디렉터", () => {
  it("대본을 화자·감정 태그·BGM 덕킹·초 단위 타임코드 성우 큐시트로 변환한다", () => {
    const sheet = generateAudioCueSheet("18화", DEFAULT_AUDIO_SCRIPT_LINES);
    expect(sheet.rows).toHaveLength(4);
    expect(sheet.rows[0].bgmDuckingDb).toBe(-6);
    expect(sheet.rows[1].bgmDuckingDb).toBe(-12);
    expect(sheet.rows[2].emotionTag).toBe("분노");
    expect(sheet.bgmTransitions).toHaveLength(2);
    expect(sheet.speakerStats.map((s) => s.speaker)).toContain("윤채린");
    expect(sheet.exportScriptText).toContain("[오디오 큐시트]");
  });

  it("분·초 단위 타임코드를 MM:SS.d 규격으로 정확히 포맷한다", () => {
    expect(formatTimecodeSec(0)).toBe("00:00.0");
    expect(formatTimecodeSec(65.4)).toBe("01:05.4");
  });

  it("9:16 숏폼 트레일러에서 스포일러 컷을 차단하고 최고 훅 컷을 2.6초 이하 오프닝으로 배치한다", () => {
    const plan = buildShortformTrailerPlan({
      episodeTitle: "18화",
      platform: "youtube-shorts",
      targetDurationSec: 18,
      candidates: DEFAULT_TRAILER_CANDIDATES,
    });
    expect(plan.canvasSpec).toEqual({ widthPx: 1080, heightPx: 1920, aspectLabel: "9:16" });
    expect(plan.excludedSpoilerCount).toBe(1);
    expect(plan.shots.some((s) => s.sourceCutId === "tr-4")).toBe(false);
    expect(plan.shots[0].sourceCutId).toBe("tr-2");
    expect(plan.shots[0].cameraMove).toBe("zoom-in-punch");
    expect(plan.shots[0].durationSec).toBeLessThanOrEqual(2.6);
  });

  it("쇼츠·릴스·틱톡 플랫폼별 UI 안전영역 여백을 다르게 계산한다", () => {
    const shorts = buildShortformTrailerPlan({ episodeTitle: "18화", platform: "youtube-shorts", candidates: DEFAULT_TRAILER_CANDIDATES });
    const reels = buildShortformTrailerPlan({ episodeTitle: "18화", platform: "instagram-reels", candidates: DEFAULT_TRAILER_CANDIDATES });
    const tiktok = buildShortformTrailerPlan({ episodeTitle: "18화", platform: "tiktok", candidates: DEFAULT_TRAILER_CANDIDATES });
    expect(tiktok.safeZoneInsetPx.bottom).toBeGreaterThan(reels.safeZoneInsetPx.bottom);
    expect(reels.safeZoneInsetPx.bottom).toBeGreaterThan(shorts.safeZoneInsetPx.bottom);
  });

  it("allowSpoilers가 true이면 스포일러 컷도 후보에 포함한다", () => {
    const plan = buildShortformTrailerPlan({
      episodeTitle: "18화",
      platform: "tiktok",
      allowSpoilers: true,
      candidates: DEFAULT_TRAILER_CANDIDATES,
    });
    expect(plan.excludedSpoilerCount).toBe(0);
    expect(plan.shots[0].sourceCutId).toBe("tr-4");
  });
});

describe("5. 다국어 문화 적응형 현지화 어시스트 (ko -> en/ja/vi/th/id)", () => {
  it("5개국어 모두 한국어 관용구와 의성어를 현지 문화 표현으로 치환한다", () => {
    const locales: readonly TargetLocale[] = ["en", "ja", "vi", "th", "id"];
    for (const locale of locales) {
      const result = localizeWebtoonDialogue({
        ...DEFAULT_LOCALIZE_INPUT,
        targetLocale: locale,
      });
      expect(result.matchedIdioms).toEqual(["두근두근", "식은 죽 먹기", "하늘이 무너져도"]);
      expect(result.localizedText).not.toContain("두근두근");
      expect(result.localizedText).not.toContain("식은 죽 먹기");
    }
  });

  it("일본어(ja) 변환 시 세로쓰기(vertical-rl)와 세로 캡슐형 말풍선으로 자동 회전 보정한다", () => {
    const ja = localizeWebtoonDialogue({ ...DEFAULT_LOCALIZE_INPUT, targetLocale: "ja" });
    expect(ja.adjustedBalloon.writingMode).toBe("vertical-rl");
    expect(ja.adjustedBalloon.heightPx).toBeGreaterThan(ja.adjustedBalloon.widthPx);
    expect(ja.adjustedBalloon.fontFamily).toContain("JP");
  });

  it("태국어(th) 변환 시 상하 성조·모음 보호를 위해 줄간격 1.64와 세로 높이를 확장한다", () => {
    const th = localizeWebtoonDialogue({ ...DEFAULT_LOCALIZE_INPUT, targetLocale: "th" });
    expect(th.adjustedBalloon.lineHeight).toBeGreaterThanOrEqual(1.64);
    expect(th.adjustedBalloon.heightPx).toBeGreaterThan(DEFAULT_LOCALIZE_INPUT.originalBalloonHeightPx);
    expect(th.adjustedBalloon.fontFamily).toContain("Thai");
  });

  it("영어·인도네시아어 변환 시 장문 폭 확장을 적용해 가로 말풍선을 넓힌다", () => {
    const en = localizeWebtoonDialogue({ ...DEFAULT_LOCALIZE_INPUT, targetLocale: "en" });
    const idRes = localizeWebtoonDialogue({ ...DEFAULT_LOCALIZE_INPUT, targetLocale: "id" });
    expect(en.adjustedBalloon.widthPx).toBeGreaterThan(DEFAULT_LOCALIZE_INPUT.originalBalloonWidthPx);
    expect(idRes.adjustedBalloon.widthPx).toBeGreaterThan(en.adjustedBalloon.widthPx);
  });

  it("미등록 일반 대사도 안전하게 초안 래핑과 안내 노트를 반환한다", () => {
    const plain = localizeWebtoonDialogue({
      sourceTextKo: "지하 문서고로 이동하자.",
      targetLocale: "vi",
      originalBalloonWidthPx: 200,
      originalBalloonHeightPx: 110,
      baseFontSizePx: 15,
    });
    expect(plain.matchedIdioms).toEqual([]);
    expect(plain.localizedText).toContain("[VI]");
  });
});

describe("6. 작가 화풍 로컬 LoRA 패키저(₩0) & 저작권 클린룸 검증기", () => {
  it("미허가·저해상도·근접중복 해시·말풍선 컷을 제외하고 ComfyUI/Kohya ₩0 매니페스트를 생성한다", () => {
    const manifest = packageLocalLoraDataset({
      styleName: "서울 누아르 화풍",
      triggerToken: "TS Seoul Noir!!",
      authorId: "author-1",
      minResolutionPx: 1024,
      samples: DEFAULT_LORA_SAMPLES,
    });
    expect(manifest.costKrw).toBe(0);
    expect(manifest.trainingRuntime).toBe("local-only-kohya-comfyui");
    expect(manifest.triggerToken).toBe("ts_seoul_noir");
    expect(manifest.acceptedSamples).toHaveLength(2);
    expect(manifest.excludedSamples.map((e) => e.reason)).toEqual([
      "duplicate-hash",
      "low-resolution",
      "unauthorized-source",
      "text-bubble-clutter",
    ]);
    expect(manifest.comfyUiLoraLoaderSpec.loraFileName).toBe("ts_seoul_noir_v1.safetensors");
    expect(JSON.parse(manifest.manifestJson).costKrw).toBe(0);
  });

  it("중복 스타일 태그를 정리해 정규화된 캡션을 생성한다", () => {
    const manifest = packageLocalLoraDataset({
      styleName: "테스트",
      triggerToken: "my_ink",
      authorId: "author-1",
      samples: [
        {
          id: "s1",
          episodeNumber: 3,
          widthPx: 1024,
          heightPx: 1024,
          perceptualHash: "0123456789abcdef",
          authorOwned: true,
          consentSigned: true,
          rawCaptionKo: "원본",
          styleTags: ["Ink", "ink", "Dramatic_Light"],
          hasTextBubble: false,
        },
      ],
    });
    expect(manifest.acceptedSamples[0].cleanedCaption).toBe("my_ink, ink, dramatic_light");
  });

  it("외부 레퍼런스 유사도 80% 이상 또는 비상업 라이선스 존재 시 클린룸 내보내기를 차단한다", () => {
    const report = runCopyrightCleanroomAudit({ cutId: "EP18-C5", assets: DEFAULT_CLEANROOM_ASSETS });
    expect(report.cleanroomPassed).toBe(false);
    expect(report.verdict).toBe("blocked");
    expect(report.blockingReasonsKo.length).toBeGreaterThanOrEqual(1);
    expect(report.certificateId).toMatch(/^CLN-BLO-[0-9A-F]{8}$/u);
  });

  it("출처 표기 누락이나 중간 유사도(65~79%)는 review-required로 분류한다", () => {
    const report = runCopyrightCleanroomAudit({
      cutId: "EP18-C6",
      assets: [
        { id: "a1", nameKo: "무료 폰트", kind: "font", license: "commercial-free-attribution", attributionProvided: false, sourceProof: "URL", similarityScore: 0 },
        { id: "a2", nameKo: "참고 포즈", kind: "reference", license: "author-original", attributionProvided: true, sourceProof: "LOG", similarityScore: 70 },
      ],
    });
    expect(report.cleanroomPassed).toBe(false);
    expect(report.verdict).toBe("review-required");
    expect(report.warningsKo).toHaveLength(2);
  });

  it("라이선스·출처·유사도가 모두 안전하면 클린룸 통과 인증서를 발급한다", () => {
    const cleanAssets = DEFAULT_CLEANROOM_ASSETS.map((asset) => ({
      ...asset,
      attributionProvided: true,
      similarityScore: Math.min(asset.similarityScore, 25),
    }));
    const report = runCopyrightCleanroomAudit({ cutId: "EP18-C5", assets: cleanAssets });
    expect(report.cleanroomPassed).toBe(true);
    expect(report.verdict).toBe("passed");
    expect(report.riskScore).toBe(0);
    expect(report.certificateId).toMatch(/^CLN-PAS-[0-9A-F]{8}$/u);
  });
});

describe("7. StudioIpCreativeEnginesPanel UI·접근성·지연 마운트 통합 검증", () => {
  it("6개 탭 전환과 다크모드 외곽선 교정·컷 재활용 삽입·분기 결함 시뮬레이션이 동작한다", () => {
    render(<StudioIpCreativeEnginesPanel projectId="proj-seoul-noir" />);
    expect(screen.getByTestId("ipce-a11y-buried").textContent).toBe("2건");

    const haloButtons = screen.getAllByRole("button", { name: "자동 밝은 외곽선 적용" });
    fireEvent.click(haloButtons[0]);
    expect(screen.getByTestId("ipce-a11y-buried").textContent).toBe("1건");
    fireEvent.click(haloButtons[1]);
    expect(screen.getByTestId("ipce-a11y-buried").textContent).toBe("0건");

    const a11yTab = screen.getByRole("tab", { name: /다크·색맹 검수/u });
    fireEvent.keyDown(a11yTab, { key: "ArrowRight" });
    expect(screen.getByTestId("ipce-panel-reuse")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "1초 캔버스 삽입 페이로드 생성" })[0]);
    expect(screen.getByTestId("ipce-reuse-payload").textContent).toContain("toonstudio.cut-reuse.v1");

    fireEvent.click(screen.getByRole("tab", { name: /관계도·텐션·분기/u }));
    expect(screen.getByTestId("ipce-branch-status").textContent).toBe("정상 연결");
    fireEvent.click(screen.getByRole("button", { name: "무한 루프·도달 불가 결함 시뮬레이션" }));
    expect(screen.getByTestId("ipce-branch-status").textContent).toBe("결함 탐지");
  });

  it("오디오/트레일러·5개국 문화 현지화·로컬 LoRA/클린룸 탭의 인터랙션이 정상 반영된다", () => {
    render(<StudioIpCreativeEnginesPanel initialTab="media" />);
    expect(screen.getByTestId("ipce-cue-total").textContent).toContain("총 ");
    expect(screen.getByTestId("ipce-trailer-meta").textContent).toContain("1080×1920");

    fireEvent.click(screen.getByRole("tab", { name: /5개국 문화 현지화/u }));
    expect(screen.getByTestId("ipce-l10n-mode").textContent).toContain("vertical-rl");
    expect(screen.getByTestId("ipce-l10n-output").textContent).toContain("ドキドキ");

    fireEvent.click(screen.getByRole("tab", { name: /로컬 LoRA·클린룸/u }));
    expect(screen.getByTestId("ipce-lora-counts").textContent).toContain("채택 2 / 제외 4");
    expect(screen.getByTestId("ipce-cleanroom-verdict").textContent).toBe("내보내기 차단");
    fireEvent.click(screen.getByRole("button", { name: "출처 표기·구도 변형 반영 후 재검증" }));
    expect(screen.getByTestId("ipce-cleanroom-verdict").textContent).toBe("클린룸 통과");
  });

  it("StudioWorkspaceMiniApps 하단 접이식 패널을 열 때 lazyRetry로 지연 마운트한다", async () => {
    render(
      <MemoryRouter initialEntries={["/?room=draw-a"]}>
        <Routes>
          <Route path="*" element={<StudioWorkspaceMiniApps projectId="work-17a" />} />
        </Routes>
      </MemoryRouter>,
    );
    const disclosure = screen.getByTestId("studio-ip-creative-engines-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-ip-creative-engines-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));
    await waitFor(() => expect(screen.getByTestId("studio-ip-creative-engines-panel")).toBeTruthy());
  });

  it("스타일시트가 원시 HEX·transition-all 금지, prefers-reduced-motion, 44px 터치 타겟을 준수한다", () => {
    const cssPath = path.resolve(process.cwd(), "apps/web/src/domains/creator/ip-creative-engines/ip-creative-engines.css");
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toContain("transition-all");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("oklch(");
  });
});
