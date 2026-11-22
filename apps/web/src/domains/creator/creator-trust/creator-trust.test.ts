import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  deriveOfflineSyncIdempotencyKey,
  verifyOfflineSyncQueueMultideviceConvergence,
  type OfflineSyncQueueEntry,
} from "../live/studio-offline-sync-queue-merger";
import {
  ANTI_AI_SHIELD_MIN_PSNR_DB,
  analyzeOnDeviceStrokeHabits,
  applyAntiAiStyleShield,
  buildCreatorProvenanceManifest,
  compareVectorClocks,
  computeRgbaPsnrDb,
  computeSha256Hex,
  detectAntiAiStyleShield,
  exportEpisodeTranscriptHtml,
  exportEpisodeTranscriptJson,
  extractStrokeSamplesFromPages,
  extractWebtoonCutInputsFromPages,
  generateEpisodeAccessibilityBundle,
  generateWebtoonCutAltText,
  incrementVectorClock,
  mergeVectorClocks,
  verifyCreatorProvenanceManifest,
  verifyOfflineMultideviceSync,
  type DeviceOfflineSession,
  type OnDeviceStrokePoint,
  type OnDeviceStrokeSample,
  type RgbaImageSurface,
  type VectorClock,
} from "./index";

function createSyntheticWebtoonSurface(width: number, height: number): RgbaImageSurface {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const isLine = (x % 17 === 0 && y > 8) || (y % 21 === 0 && x > 6);
      if (isLine) {
        data[idx] = 24;
        data[idx + 1] = 28;
        data[idx + 2] = 36;
      } else {
        data[idx] = Math.min(240, 120 + Math.floor((x / width) * 100));
        data[idx + 1] = Math.min(235, 100 + Math.floor((y / height) * 110));
        data[idx + 2] = Math.min(230, 130 + ((x + y) % 35));
      }
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

function createJitteredStroke(
  strokeId: string,
  tremorAmplitudePx: number,
  pressure = 0.52,
  colorHex = "#2a4d8f",
): OnDeviceStrokeSample {
  const points: OnDeviceStrokePoint[] = [];
  for (let i = 0; i < 48; i += 1) {
    const x = i * 5;
    const baseY = 60 + Math.sin(i * 0.12) * 8;
    const jitter = i % 2 === 0 ? tremorAmplitudePx : -tremorAmplitudePx;
    points.push({
      x,
      y: baseY + jitter,
      pressure,
      tMs: 10_000 + i * 16,
    });
  }
  return {
    strokeId,
    brushId: "g-pen-pro",
    brushCategory: "pen",
    colorHex,
    startedAtMs: 10_000,
    endedAtMs: 10_800,
    cutId: "cut-01",
    points,
  };
}

describe("anti-ai-style-shield · SHA-256 · PSNR ≥ 38 dB · C2PA 온디바이스 증명서", () => {
  it("순수 TypeScript SHA-256 구현이 Node crypto FIPS 180-4 결과와 비트 단위로 일치한다", () => {
    const samples = [
      "",
      "abc",
      "ToonStudio 창작자 저작권 보호 매니페스트 2026-11-22",
      "x".repeat(256),
    ];
    for (const sample of samples) {
      const expected = createHash("sha256").update(sample, "utf8").digest("hex");
      expect(computeSha256Hex(sample)).toBe(expected);
    }
  });

  it("subtle·balanced·strong 전 프리셋에서 PSNR ≥ 38 dB, 결정성, 알파 보존, 블라인드 워터마크 검출을 만족한다", () => {
    const original = createSyntheticWebtoonSurface(64, 64);

    const subtle = applyAntiAiStyleShield(original, {
      seed: "creator-secret-seed-01",
      strength: "subtle",
      workId: "work-01",
      creatorId: "artist-kim",
    });
    const balanced = applyAntiAiStyleShield(original, {
      seed: "creator-secret-seed-01",
      strength: "balanced",
      workId: "work-01",
      creatorId: "artist-kim",
    });
    const balancedRepeat = applyAntiAiStyleShield(original, {
      seed: "creator-secret-seed-01",
      strength: "balanced",
      workId: "work-01",
      creatorId: "artist-kim",
    });
    const strong = applyAntiAiStyleShield(original, {
      seed: "creator-secret-seed-01",
      strength: "strong",
      workId: "work-01",
      creatorId: "artist-kim",
    });
    const otherSeed = applyAntiAiStyleShield(original, {
      seed: "different-seed-99",
      strength: "balanced",
      workId: "work-01",
      creatorId: "artist-kim",
    });

    // PSNR ≥ 38 dB 불변식 및 프리셋 단조 계층
    expect(subtle.metrics.psnrDb).toBeGreaterThanOrEqual(43.0);
    expect(balanced.metrics.psnrDb).toBeGreaterThanOrEqual(40.0);
    expect(strong.metrics.psnrDb).toBeGreaterThanOrEqual(ANTI_AI_SHIELD_MIN_PSNR_DB);
    expect(subtle.metrics.psnrDb).toBeGreaterThan(balanced.metrics.psnrDb);
    expect(balanced.metrics.psnrDb).toBeGreaterThan(strong.metrics.psnrDb);

    // 고주파 섭동 에너지 단조 증가
    expect(subtle.metrics.highFrequencyPerturbationEnergy).toBeGreaterThan(0);
    expect(balanced.metrics.highFrequencyPerturbationEnergy).toBeGreaterThan(
      subtle.metrics.highFrequencyPerturbationEnergy,
    );
    expect(strong.metrics.highFrequencyPerturbationEnergy).toBeGreaterThan(
      balanced.metrics.highFrequencyPerturbationEnergy,
    );

    // 결정성(동일 시드 → 비트 단위 동일) 및 시드 차별성
    expect(balanced.protectedContentSha256).toBe(balancedRepeat.protectedContentSha256);
    expect(balanced.protectedContentSha256).not.toBe(original.data.toString());
    expect(balanced.protectedContentSha256).not.toBe(otherSeed.protectedContentSha256);

    // 알파 채널 100% 보존
    for (let i = 3; i < original.data.length; i += 4) {
      expect(strong.protectedSurface.data[i]).toBe(original.data[i]);
    }

    // 워터마크 블라인드 검출: 적용본은 검출, 원본 및 타 시드는 미검출
    expect(balanced.detectionSelfCheck.detected).toBe(true);
    expect(strong.detectionSelfCheck.detected).toBe(true);
    const onOriginal = detectAntiAiStyleShield(original, {
      seed: "creator-secret-seed-01",
      strength: "balanced",
      workId: "work-01",
      creatorId: "artist-kim",
    });
    const withWrongSeed = detectAntiAiStyleShield(balanced.protectedSurface, {
      seed: "wrong-seed",
      strength: "balanced",
      workId: "work-01",
      creatorId: "artist-kim",
    });
    expect(onOriginal.detected).toBe(false);
    expect(withWrongSeed.detected).toBe(false);
  });

  it("극단적 포화 단색 표면에서도 PSNR 가드가 38 dB 하한을 보장한다", () => {
    const flatWhite: RgbaImageSurface = {
      width: 32,
      height: 32,
      data: new Uint8ClampedArray(32 * 32 * 4).fill(255),
    };
    const shielded = applyAntiAiStyleShield(flatWhite, {
      seed: "flat-edge-test",
      strength: "strong",
    });
    const remeasured = computeRgbaPsnrDb(flatWhite, shielded.protectedSurface);
    expect(shielded.metrics.psnrDb).toBeGreaterThanOrEqual(ANTI_AI_SHIELD_MIN_PSNR_DB);
    expect(remeasured.psnrDb).toBeGreaterThanOrEqual(ANTI_AI_SHIELD_MIN_PSNR_DB);
  });

  it("C2PA 스타일 온디바이스 증명서가 정상 원고를 통과시키고 1바이트 원고 변조 및 메타데이터 변조를 탐지한다", () => {
    const surface = createSyntheticWebtoonSurface(32, 32);
    const shielded = applyAntiAiStyleShield(surface, {
      seed: "ep05-proof-seed",
      strength: "balanced",
      workId: "webtoon-aurora",
    });

    const manifest = buildCreatorProvenanceManifest({
      workId: "webtoon-aurora",
      episodeLabel: "EP05",
      creatorDisplayName: "한서연 작가",
      creatorHandle: "@seoyeon_draws",
      rightsBomSummary: {
        totalAssets: 8,
        uniqueAssets: 5,
        clearedForCommercialUse: true,
        prohibitedCount: 0,
        unknownCount: 0,
        rightsManifestDigestSha256: computeSha256Hex("rights-bom-v1"),
      },
      contentBytes: shielded.protectedSurface.data,
      styleShieldResult: shielded,
      issuedAtIso: "2026-11-22T05:00:00.000Z",
    });

    // 1. 정상 검증 통과
    const ok = verifyCreatorProvenanceManifest(manifest, shielded.protectedSurface.data);
    expect(ok.valid).toBe(true);
    expect(ok.status).toBe("verified");
    expect(ok.claimIntegrityValid).toBe(true);
    expect(ok.contentHashMatched).toBe(true);

    // 2. 원고 1바이트 변조 감지
    const tamperedPixels = new Uint8ClampedArray(shielded.protectedSurface.data);
    tamperedPixels[0] = (tamperedPixels[0] + 1) % 256;
    const pixelTampered = verifyCreatorProvenanceManifest(manifest, tamperedPixels);
    expect(pixelTampered.valid).toBe(false);
    expect(pixelTampered.status).toBe("content-tampered");
    expect(pixelTampered.claimIntegrityValid).toBe(true);
    expect(pixelTampered.contentHashMatched).toBe(false);

    // 3. 메타데이터(작가/AI 정책) 변조 감지
    const tamperedManifest = {
      ...manifest,
      toolchain: {
        ...manifest.toolchain,
        aiTrainingPolicy: "permitted-with-license" as const,
      },
    };
    const metaTampered = verifyCreatorProvenanceManifest(
      tamperedManifest,
      shielded.protectedSurface.data,
    );
    expect(metaTampered.valid).toBe(false);
    expect(metaTampered.status).toBe("manifest-tampered");
    expect(metaTampered.claimIntegrityValid).toBe(false);

    // 4. 스키마 손상 거부
    const invalidSchema = verifyCreatorProvenanceManifest({ schema: "bad" });
    expect(invalidSchema.valid).toBe(false);
    expect(invalidSchema.status).toBe("invalid-schema");
  });
});

describe("webtoon-cut-alt-text · WCAG 2.2 AA 120~240자 화면 해설 및 JSON/HTML 내보내기", () => {
  it("풍부한 컷·간결한 컷·장문 컷 모두 한국어와 영어에서 120~240자 권장 범위와 결정성을 충족한다", () => {
    const richCut = {
      cutId: "ep05-cut-03",
      cutIndex: 3,
      panelRole: "action" as const,
      sceneSetting: {
        location: "빗속 아파트 옥상",
        timeOfDay: "늦은 밤",
        weather: "폭우",
        cameraShot: "low-angle" as const,
      },
      characters: [
        {
          name: "서연",
          position: "left" as const,
          emotion: "다급함",
          expression: "눈을 크게 뜬",
          action: "난간을 향해 손을 뻗는다",
        },
      ],
      dialogues: [
        {
          speaker: "서연",
          text: "기다려, 혼자 내려가면 위험해!",
          bubbleStyle: "shout" as const,
        },
      ],
      soundEffects: [
        { text: "우르릉", intensity: "loud" as const, meaning: "천둥 소리" },
      ],
    };

    const sparseCut = {
      cutId: "ep05-cut-04",
      cutIndex: 4,
      sceneSetting: { location: "고요한 복도" },
    };

    const verboseCut = {
      cutId: "ep05-cut-05",
      cutIndex: 5,
      panelRole: "dialogue" as const,
      sceneSetting: {
        location: "햇살이 비치는 편집부 회의실",
        timeOfDay: "오전",
        cameraShot: "wide" as const,
      },
      characters: [
        { name: "민준", position: "left" as const, emotion: "진지함", action: "원고 콘티를 펼쳐 보인다" },
        { name: "지아", position: "right" as const, emotion: "미소", action: "펜으로 컷 순서를 표시한다" },
      ],
      dialogues: [
        {
          speaker: "민준",
          text: "이번 회차 엔딩은 대사를 줄이고 시선 전환으로 긴장감을 끌어올리는 편이 훨씬 설득력 있을 것 같아요.",
          bubbleStyle: "speech" as const,
        },
        {
          speaker: "지아",
          text: "동의해요. 대신 마지막 컷에 미세한 빗방울 효과음을 넣어 여운을 남깁시다.",
          bubbleStyle: "speech" as const,
        },
      ],
      soundEffects: [
        { text: "사각사각", intensity: "subtle" as const, meaning: "콘티에 메모하는 소리" },
      ],
    };

    for (const locale of ["ko", "en"] as const) {
      for (const cut of [richCut, sparseCut, verboseCut]) {
        const first = generateWebtoonCutAltText(cut, { locale });
        const second = generateWebtoonCutAltText(cut, { locale });
        expect(first.altText).toBe(second.altText);
        expect(first.altText.length).toBeGreaterThanOrEqual(120);
        expect(first.altText.length).toBeLessThanOrEqual(240);
        expect(first.wcagCompliance.passed).toBe(true);
        expect(first.wcagCompliance.withinRecommendedRange).toBe(true);
        expect(first.ariaAttributes.role).toBe("img");
        expect(first.ariaAttributes["aria-describedby"]).toBe(first.longDescElementId);
      }
    }
  });

  it("JSON/HTML 상세 대본 내보내기가 시맨틱 마크업과 XSS 이스케이프를 보장하고 페이지 요소 추출과 연동된다", () => {
    const extracted = extractWebtoonCutInputsFromPages([
      {
        id: "page-xss",
        elements: [
          { id: "b1", type: "bubble", variant: "shout", text: '<script>alert("xss")</script> 멈춰!', y: 10 },
          { id: "s1", type: "text", text: "콰앙", stroke: "#000000", y: 50 },
        ],
      },
    ]);
    const bundle = generateEpisodeAccessibilityBundle({
      workId: "work-a11y",
      episodeTitle: "제5화 <폭풍 전야>",
      locale: "ko",
      cuts: extracted,
    });

    const json = exportEpisodeTranscriptJson(bundle);
    const parsed = JSON.parse(json) as { totalCuts: number; standard: string };
    expect(parsed.totalCuts).toBe(1);
    expect(parsed.standard).toBe("WCAG 2.2 AA");

    const html = exportEpisodeTranscriptHtml(bundle);
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('<article role="region"');
    expect(html).toContain("<figure role=\"img\"");
    expect(html).toContain("<details open>");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("ondevice-stroke-habit-analyzer · 프라이버시(네트워크 0건) · 손떨림 보정 단조성", () => {
  it("외부 네트워크 요청 0건 프라이버시를 보장하고 선 떨림 증가에 따라 지수·보정 권장값이 단조 증가한다", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const amplitudes = [0, 0.35, 1.1, 2.6, 5.2];
    const reports = amplitudes.map((amp, idx) =>
      analyzeOnDeviceStrokeHabits({
        sessionId: `mono-${idx}`,
        strokes: [createJitteredStroke(`s-${idx}`, amp)],
      }),
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();

    for (let i = 0; i < reports.length; i += 1) {
      expect(reports[i].privacyGuarantee).toEqual({
        networkRequestsSent: 0,
        storageScope: "on-device-memory-only",
        telemetryExported: false,
        piiCollected: false,
      });
      if (i > 0) {
        expect(reports[i].jitterProfile.jitterIndex).toBeGreaterThan(
          reports[i - 1].jitterProfile.jitterIndex,
        );
        expect(reports[i].jitterProfile.recommendedStabilizationLevel).toBeGreaterThanOrEqual(
          reports[i - 1].jitterProfile.recommendedStabilizationLevel,
        );
        expect(
          reports[i].jitterProfile.recommendedStabilizationWindowPx,
        ).toBeGreaterThanOrEqual(
          reports[i - 1].jitterProfile.recommendedStabilizationWindowPx,
        );
      }
    }
    expect(reports[0].jitterProfile.stabilityTier).toBe("steady");
    expect(reports[4].jitterProfile.stabilityTier).toBe("high-tremor");
  });

  it("필압 성향·주력 브러시·색온도 편향·마감 페이스를 정확히 분석하고 스튜디오 페이지 요소와 연동된다", () => {
    const heavyWarmStrokes: OnDeviceStrokeSample[] = [
      createJitteredStroke("w1", 0.4, 0.84, "#e85d35"),
      createJitteredStroke("w2", 0.5, 0.88, "#f08a24"),
      createJitteredStroke("w3", 0.45, 0.81, "#d94e28"),
    ];
    const report = analyzeOnDeviceStrokeHabits({
      sessionId: "deadline-tight",
      strokes: heavyWarmStrokes,
      nowMs: 10_000 + 60 * 60_000,
      sessionDeadlineMs: 10_000 + 90 * 60_000,
      targetCutCount: 20,
      completedCutCount: 1,
    });

    expect(report.pressureProfile.touchStyle).toBe("heavy-handed");
    expect(report.pressureProfile.recommendedPressureGamma).toBeGreaterThan(1);
    expect(report.brushAndColorProfile.primaryBrushId).toBe("g-pen-pro");
    expect(report.brushAndColorProfile.colorTemperature.temperatureBias).toBe("warm");
    expect(report.paceProfile.paceStatus).toBe("at-risk");
    expect(report.workRhythmSuggestionsKo.length).toBeGreaterThanOrEqual(3);

    const extracted = extractStrokeSamplesFromPages([
      {
        id: "page-draw-1",
        elements: [
          {
            id: "draw-1",
            type: "draw",
            brush: "pencil-2b",
            stroke: "#246bce",
            points: [0, 0, 10, 2, 20, 0, 30, 3, 40, 1],
            pressures: [0.2, 0.25, 0.3, 0.28, 0.22],
          },
        ],
      },
    ]);
    const extractedReport = analyzeOnDeviceStrokeHabits({ strokes: extracted });
    expect(extractedReport.pressureProfile.touchStyle).toBe("feather-touch");
    expect(extractedReport.brushAndColorProfile.primaryBrushId).toBe("pencil-2b");
    expect(extractedReport.brushAndColorProfile.colorTemperature.temperatureBias).toBe("cool");
  });
});

describe("offline-multidevice-sync-verifier · CRDT·벡터 클록 무손실 수렴 불변식", () => {
  it("벡터 클록 부분 순서와 결합 반격자 법칙(교환·멱등)을 만족한다", () => {
    const base: VectorClock = { pc: 1, tablet: 1 };
    const pcNext = incrementVectorClock(base, "pc");
    const tabletNext = incrementVectorClock(base, "tablet");
    const joinedA = mergeVectorClocks(pcNext, tabletNext);
    const joinedB = mergeVectorClocks(tabletNext, pcNext);

    expect(compareVectorClocks(base, pcNext)).toBe("before");
    expect(compareVectorClocks(pcNext, base)).toBe("after");
    expect(compareVectorClocks(pcNext, tabletNext)).toBe("concurrent");
    expect(compareVectorClocks(joinedA, joinedB)).toBe("equal");
    expect(compareVectorClocks(mergeVectorClocks(joinedA, joinedA), joinedA)).toBe("equal");
  });

  it("PC·태블릿·모바일 오프라인 동시 편집·충돌·삭제 경합에서 6종 순열 및 중복 재전송 100% 무손실 수렴을 검증한다", () => {
    const baseClock: VectorClock = { "pc-studio": 1, "tablet-ipad": 1, "mobile-sub": 1 };
    const pc1 = incrementVectorClock(baseClock, "pc-studio");
    const pc2 = incrementVectorClock(pc1, "pc-studio");
    const pc3 = incrementVectorClock(pc2, "pc-studio");

    const tab1 = incrementVectorClock(baseClock, "tablet-ipad");
    const tab2 = incrementVectorClock(tab1, "tablet-ipad");
    const tab3 = incrementVectorClock(tab2, "tablet-ipad");

    const mob1 = incrementVectorClock(baseClock, "mobile-sub");

    const sessions: readonly DeviceOfflineSession[] = [
      {
        deviceId: "pc-studio",
        deviceKind: "desktop",
        operations: [
          {
            opId: "op-pc-stroke-base",
            deviceId: "pc-studio",
            deviceKind: "desktop",
            cutId: "cut-01",
            kind: "stroke-add",
            strokeId: "stroke-temp-draft",
            vectorClock: baseClock,
            lamportClock: 1,
            wallClockMs: 1_000,
          },
          {
            opId: "op-pc-remove-draft",
            deviceId: "pc-studio",
            deviceKind: "desktop",
            cutId: "cut-01",
            kind: "stroke-remove",
            strokeId: "stroke-temp-draft",
            observedAddOpIds: ["op-pc-stroke-base"],
            vectorClock: pc1,
            lamportClock: 2,
            wallClockMs: 1_100,
          },
          {
            opId: "op-pc-stroke-ink",
            deviceId: "pc-studio",
            deviceKind: "desktop",
            cutId: "cut-01",
            kind: "stroke-add",
            strokeId: "stroke-pc-ink-01",
            vectorClock: pc2,
            lamportClock: 3,
            wallClockMs: 1_200,
          },
          {
            opId: "op-pc-dialogue",
            deviceId: "pc-studio",
            deviceKind: "desktop",
            cutId: "cut-01",
            kind: "field-set",
            field: "dialogue",
            value: "PC에서 수정한 대사",
            vectorClock: pc3,
            lamportClock: 4,
            wallClockMs: 1_300,
          },
        ],
      },
      {
        deviceId: "tablet-ipad",
        deviceKind: "tablet",
        operations: [
          {
            opId: "op-tab-stroke-shade",
            deviceId: "tablet-ipad",
            deviceKind: "tablet",
            cutId: "cut-01",
            kind: "stroke-add",
            strokeId: "stroke-tablet-shade-01",
            vectorClock: tab1,
            lamportClock: 2,
            wallClockMs: 1_150,
          },
          {
            opId: "op-tab-dialogue",
            deviceId: "tablet-ipad",
            deviceKind: "tablet",
            cutId: "cut-01",
            kind: "field-set",
            field: "dialogue",
            value: "태블릿에서 동시에 수정한 대사",
            vectorClock: tab2,
            lamportClock: 4,
            wallClockMs: 1_250,
          },
          {
            opId: "op-tab-cut2-stroke",
            deviceId: "tablet-ipad",
            deviceKind: "tablet",
            cutId: "cut-02",
            kind: "stroke-add",
            strokeId: "stroke-tablet-cut02",
            vectorClock: tab3,
            lamportClock: 5,
            wallClockMs: 1_400,
          },
        ],
      },
      {
        deviceId: "mobile-sub",
        deviceKind: "mobile",
        operations: [
          {
            opId: "op-mob-del-cut2",
            deviceId: "mobile-sub",
            deviceKind: "mobile",
            cutId: "cut-02",
            kind: "cut-delete",
            vectorClock: mob1,
            lamportClock: 3,
            wallClockMs: 1_350,
          },
        ],
      },
    ];

    const report = verifyOfflineMultideviceSync(sessions);
    expect(report.passed).toBe(true);
    expect(report.permutationCount).toBe(6);
    expect(report.invariants).toEqual({
      allPermutationsConverged: true,
      idempotentUnderDuplicateReplay: true,
      zeroUnremovedStrokeLoss: true,
      vectorClockMonotonic: true,
      allConcurrentConflictsPreserved: true,
    });
    expect(report.missingExpectedStrokeIds).toEqual([]);

    // cut-01: 인과 제거된 임시 획은 제거, PC·태블릿 동시 추가 획은 모두 무손실 유지
    const cut1 = report.convergedState.cuts["cut-01"];
    expect(cut1?.liveStrokeIds).toEqual(["stroke-pc-ink-01", "stroke-tablet-shade-01"]);

    // 동시 대사 충돌: 결정적 승자 선택 + 패배 값 무손실 보존
    expect(report.convergedState.fieldConflicts).toHaveLength(1);
    expect(report.convergedState.fieldConflicts[0]?.preservedSupersededValues).toHaveLength(1);

    // cut-02: 동시 삭제 vs 태블릿 동시 스트로크 추가 → 작업물 보존 + 삭제 충돌 기록
    const cut2 = report.convergedState.cuts["cut-02"];
    expect(cut2?.deleted).toBe(false);
    expect(cut2?.liveStrokeIds).toEqual(["stroke-tablet-cut02"]);
    expect(report.convergedState.deleteEditConflicts).toHaveLength(1);
  });

  it("studio-offline-sync-queue-merger 연결 헬퍼가 다중 기기 큐 항목의 수렴을 검증한다", () => {
    const entries: readonly OfflineSyncQueueEntry[] = [
      {
        opId: "q-pc-1",
        idempotencyKey: deriveOfflineSyncIdempotencyKey({
          surface: "episode",
          cutId: "cut-01",
          kind: "patch",
          causalSequence: 1,
          actorId: "desktop-main",
          patch: { title: "PC 제목", balloons: 2 },
        }),
        surface: "episode",
        cutId: "cut-01",
        kind: "patch",
        causalSequence: 1,
        patch: { title: "PC 제목", balloons: 2 },
        actorId: "desktop-main",
        createdAtMs: 1_000,
      },
      {
        opId: "q-tab-1",
        idempotencyKey: deriveOfflineSyncIdempotencyKey({
          surface: "episode",
          cutId: "cut-01",
          kind: "patch",
          causalSequence: 1,
          actorId: "tablet-pen",
          patch: { title: "태블릿 제목", sfx: "두근" },
        }),
        surface: "episode",
        cutId: "cut-01",
        kind: "patch",
        causalSequence: 1,
        patch: { title: "태블릿 제목", sfx: "두근" },
        actorId: "tablet-pen",
        createdAtMs: 1_050,
      },
    ];

    const verification = verifyOfflineSyncQueueMultideviceConvergence(entries);
    expect(verification.passed).toBe(true);
    expect(verification.deviceIds).toEqual(["desktop-main", "tablet-pen"]);
    expect(verification.convergedState.fieldConflicts).toHaveLength(1);
    expect(verification.convergedState.cuts["episode::cut-01"]?.fields.sfx).toBe("두근");
  });
});
