import { describe, expect, it } from "vitest";

import {
  buildEpub3GuidedViewPackage,
  computePairwiseReadingPrecedence,
  computeRectOverlapArea,
  DEFAULT_SYNTH_SAMPLE_RATE_HZ,
  deriveDeterministicEpubUuidUrn,
  escapeXmlEntities,
  HORIZONTAL_TIE_DEAD_ZONE_PX,
  MAX_ABS_DC_OFFSET,
  MAX_GUIDED_VIEW_MAGNIFICATION,
  MAX_HAPTIC_PULSE_DURATION_MS,
  MAX_PEAK_LINEAR_MINUS_3DBFS,
  MIN_GUIDED_VIEW_MAGNIFICATION,
  resolveBalloonReadingOrderNudges,
  STUDIO_PAPER_SUBSTRATES,
  STUDIO_STYLUS_NIBS,
  synthesizeStylusPaperFrame,
  validateBalloonReadingOrderDag,
  type ProtectedFaceBox,
  type SpeechBalloonNode,
} from "./index";

describe("stylus-paper-acoustic-haptic-synth (무에셋 지면 마찰 음향 및 미세 햅틱 합성기)", () => {
  it("속도가 0이거나 필압이 0일 때 완전 무음(RMS === 0)과 빈 햅틱 펄스를 보장한다", () => {
    const zeroSpeed = synthesizeStylusPaperFrame({
      substrate: "dakjongi-hanji",
      nib: "g-pen-steel",
      speedPxPerSec: 0,
      pressure: 0.85,
      tiltDeg: 22,
      durationMs: 60,
    });

    expect(zeroSpeed.pcm48k.length).toBe((DEFAULT_SYNTH_SAMPLE_RATE_HZ * 60) / 1_000);
    expect(zeroSpeed.telemetry.rmsLinear).toBe(0);
    expect(zeroSpeed.telemetry.peakLinear).toBe(0);
    expect(zeroSpeed.telemetry.meanDcOffset).toBe(0);
    expect(zeroSpeed.telemetry.stickSlipImpulseCount).toBe(0);
    expect(zeroSpeed.hapticPulses).toHaveLength(0);
    expect(zeroSpeed.pcm48k.every((sample) => sample === 0)).toBe(true);

    const zeroPressure = synthesizeStylusPaperFrame({
      substrate: "cold-press-300g",
      nib: "pencil-4b",
      speedPxPerSec: 650,
      pressure: 0,
      tiltDeg: 35,
      durationMs: 40,
    });
    expect(zeroPressure.telemetry.rmsLinear).toBe(0);
    expect(zeroPressure.hapticPulses).toHaveLength(0);
  });

  it("4종 원고지 × 4종 펜촉 전체 16조합에서 무직류 편향(|mean| < 0.005)과 -3dBFS 피크 상한(<= 0.707)을 지킨다", () => {
    for (const substrate of STUDIO_PAPER_SUBSTRATES) {
      for (const nib of STUDIO_STYLUS_NIBS) {
        const frame = synthesizeStylusPaperFrame({
          substrate,
          nib,
          speedPxPerSec: 3_600,
          pressure: 1,
          tiltDeg: 14,
          durationMs: 75,
          seed: 0x2700_cafe,
        });

        expect(frame.pcm48k).toBeInstanceOf(Float32Array);
        expect(frame.telemetry.sampleRateHz).toBe(48_000);
        expect(frame.telemetry.rmsLinear).toBeGreaterThan(0);

        let sum = 0;
        let maxAbs = 0;
        for (let i = 0; i < frame.pcm48k.length; i += 1) {
          const s = frame.pcm48k[i] ?? 0;
          sum += s;
          const abs = Math.abs(s);
          if (abs > maxAbs) maxAbs = abs;
        }
        const empiricalMean = sum / frame.pcm48k.length;

        expect(Math.abs(empiricalMean)).toBeLessThan(MAX_ABS_DC_OFFSET);
        expect(Math.abs(frame.telemetry.meanDcOffset)).toBeLessThan(MAX_ABS_DC_OFFSET);
        expect(maxAbs).toBeLessThanOrEqual(MAX_PEAK_LINEAR_MINUS_3DBFS);
        expect(frame.telemetry.peakLinear).toBeLessThanOrEqual(MAX_PEAK_LINEAR_MINUS_3DBFS);
      }
    }
  });

  it("전통 닥종이 한지(dakjongi-hanji)와 매끄러운 셀 필름(cel-film)의 거칠기 RMS 및 주파수 중심을 뚜렷이 구분한다", () => {
    const hanjiFrame = synthesizeStylusPaperFrame({
      substrate: "dakjongi-hanji",
      nib: "g-pen-steel",
      speedPxPerSec: 920,
      pressure: 0.78,
      tiltDeg: 18,
      durationMs: 120,
      seed: 42_027,
    });

    const celFilmFrame = synthesizeStylusPaperFrame({
      substrate: "cel-film",
      nib: "g-pen-steel",
      speedPxPerSec: 920,
      pressure: 0.78,
      tiltDeg: 18,
      durationMs: 120,
      seed: 42_027,
    });

    // 섬유질 요철이 풍부한 닥종이 한지는 매끄러운 셀 필름보다 RMS 마찰 에너지와 스틱-슬립 횟수가 크다.
    expect(hanjiFrame.telemetry.rmsLinear).toBeGreaterThan(celFilmFrame.telemetry.rmsLinear * 2.2);
    expect(hanjiFrame.telemetry.stickSlipImpulseCount).toBeGreaterThan(
      celFilmFrame.telemetry.stickSlipImpulseCount * 3,
    );
    // 셀 필름은 저역 섬유 마찰이 적고 고역 공진이 우세해 스펙트럼 중심 주파수가 더 높게 형성된다.
    expect(celFilmFrame.telemetry.spectralCentroidHz).toBeGreaterThan(
      hanjiFrame.telemetry.spectralCentroidHz,
    );
  });

  it("결정론적 시드 재현성을 보장하며 펜촉 강성·기울기에 따라 스펙트럼과 햅틱 날카로움이 달라진다", () => {
    const runA = synthesizeStylusPaperFrame({
      substrate: "kent-250g",
      nib: "maru-nib",
      speedPxPerSec: 780,
      pressure: 0.7,
      tiltDeg: 10,
      durationMs: 60,
      seed: 991_177,
    });
    const runB = synthesizeStylusPaperFrame({
      substrate: "kent-250g",
      nib: "maru-nib",
      speedPxPerSec: 780,
      pressure: 0.7,
      tiltDeg: 10,
      durationMs: 60,
      seed: 991_177,
    });
    expect(Array.from(runA.pcm48k)).toEqual(Array.from(runB.pcm48k));
    expect(runA.hapticPulses).toEqual(runB.hapticPulses);

    const sumiBristle = synthesizeStylusPaperFrame({
      substrate: "kent-250g",
      nib: "sumi-bristle",
      speedPxPerSec: 780,
      pressure: 0.7,
      tiltDeg: 65,
      durationMs: 60,
      seed: 991_177,
    });
    expect(runA.telemetry.spectralCentroidHz).toBeGreaterThan(
      sumiBristle.telemetry.spectralCentroidHz,
    );
    expect(runA.hapticPulses[0]?.sharpness ?? 0).toBeGreaterThan(
      sumiBristle.hapticPulses[0]?.sharpness ?? 0,
    );
  });

  it("미세 햅틱 펄스 지속 시간을 12ms 이하로 제한하고 prefersReducedMotion 활성화 시 햅틱을 완전히 억제한다", () => {
    const activeHaptics = synthesizeStylusPaperFrame({
      substrate: "cold-press-300g",
      nib: "g-pen-steel",
      speedPxPerSec: 1_100,
      pressure: 0.82,
      tiltDeg: 20,
      durationMs: 100,
      seed: 7_727,
      prefersReducedMotion: false,
    });

    expect(activeHaptics.hapticPulses.length).toBeGreaterThan(0);
    expect(activeHaptics.telemetry.hapticSuppressedByReducedMotion).toBe(false);
    for (const pulse of activeHaptics.hapticPulses) {
      expect(pulse.durationMs).toBeGreaterThan(0);
      expect(pulse.durationMs).toBeLessThanOrEqual(MAX_HAPTIC_PULSE_DURATION_MS);
      expect(pulse.intensity).toBeGreaterThan(0);
      expect(pulse.intensity).toBeLessThanOrEqual(1);
      expect(pulse.sharpness).toBeGreaterThan(0);
      expect(pulse.sharpness).toBeLessThanOrEqual(1);
    }

    const reducedMotion = synthesizeStylusPaperFrame({
      substrate: "cold-press-300g",
      nib: "g-pen-steel",
      speedPxPerSec: 1_100,
      pressure: 0.82,
      tiltDeg: 20,
      durationMs: 100,
      seed: 7_727,
      prefersReducedMotion: true,
    });

    expect(reducedMotion.hapticPulses).toHaveLength(0);
    expect(reducedMotion.telemetry.hapticSuppressedByReducedMotion).toBe(true);
    // 동작 줄이기 모드에서도 청각 피드백 파형 자체는 동일하게 유지된다.
    expect(Array.from(reducedMotion.pcm48k)).toEqual(Array.from(activeHaptics.pcm48k));
  });
});

describe("balloon-reading-order-dag-validator (말풍선 읽기 순서 DAG 진단 및 최소 변위 보정기)", () => {
  it("쌍별 지각 선행 확률 P(A before B)의 반대칭성과 28px 수평 데드존 경합 검출을 정확히 수행한다", () => {
    const leftSlightlyLower: SpeechBalloonNode = {
      id: "b-0",
      scriptOrder: 0,
      x: 260,
      y: 118,
      width: 140,
      height: 70,
    };
    const rightSlightlyHigher: SpeechBalloonNode = {
      id: "b-1",
      scriptOrder: 1,
      x: 70,
      y: 102,
      width: 140,
      height: 70,
    };

    const ab = computePairwiseReadingPrecedence(leftSlightlyLower, rightSlightlyHigher, "ko-ltr");
    const ba = computePairwiseReadingPrecedence(rightSlightlyHigher, leftSlightlyLower, "ko-ltr");
    expect(ab.probabilityABeforeB + ba.probabilityABeforeB).toBeCloseTo(1, 5);
    expect(Math.abs(ab.deltaYPx)).toBeLessThanOrEqual(HORIZONTAL_TIE_DEAD_ZONE_PX);

    const report = validateBalloonReadingOrderDag({
      direction: "ko-ltr",
      panelWidth: 520,
      panelHeight: 420,
      balloons: [leftSlightlyLower, rightSlightlyHigher],
    });
    expect(report.matchesScriptOrder).toBe(false);
    expect(report.issues.some((i) => i.kind === "reading-order-inversion")).toBe(true);
    expect(report.issues.some((i) => i.kind === "horizontal-tie-ambiguity")).toBe(true);
  });

  it("역전·데드존 경합·얼굴 겹침이 섞인 4말풍선 ko-ltr 컷을 안전 여백 안·얼굴 침범 0으로 100% 보정한다", () => {
    const protectedFaces: readonly ProtectedFaceBox[] = [
      { id: "face-hero", x: 185, y: 175, width: 130, height: 145, characterLabel: "주인공 얼굴" },
    ];
    const scrambledCut: readonly SpeechBalloonNode[] = [
      // 대사 0번이 아래쪽·얼굴 근처에 잘못 놓임
      { id: "cut-b0", scriptOrder: 0, x: 210, y: 210, width: 130, height: 66 },
      // 대사 1번이 맨 위 오른쪽에 놓여 역전 발생
      { id: "cut-b1", scriptOrder: 1, x: 310, y: 42, width: 130, height: 66 },
      // 대사 2번이 대사 1번과 |Δy|=14px(<=28px) 데드존 + 왼쪽 X 경합
      { id: "cut-b2", scriptOrder: 2, x: 52, y: 56, width: 130, height: 66 },
      // 대사 3번이 여백 바깥으로 살짝 삐져나감
      { id: "cut-b3", scriptOrder: 3, x: 390, y: 458, width: 130, height: 68 },
    ];

    const solved = resolveBalloonReadingOrderNudges({
      direction: "ko-ltr",
      panelWidth: 520,
      panelHeight: 540,
      safeMarginPx: 18,
      balloons: scrambledCut,
      protectedFaceBoxes: protectedFaces,
    });

    expect(solved.initialReport.matchesScriptOrder).toBe(false);
    expect(solved.initialReport.faceOverlapAreaPx2).toBeGreaterThan(0);
    expect(solved.initialReport.issues.some((i) => i.kind === "reading-order-inversion")).toBe(true);
    expect(solved.initialReport.issues.some((i) => i.kind === "horizontal-tie-ambiguity")).toBe(true);

    expect(solved.resolvedReport.matchesScriptOrder).toBe(true);
    expect(solved.resolvedReport.visualOrderIds).toEqual(["cut-b0", "cut-b1", "cut-b2", "cut-b3"]);
    expect(solved.resolvedReport.issues).toHaveLength(0);
    expect(solved.faceOverlapAreaPx2).toBe(0);
    expect(solved.safeMarginSatisfied).toBe(true);

    for (const b of solved.resolvedBalloons) {
      expect(b.x).toBeGreaterThanOrEqual(18);
      expect(b.y).toBeGreaterThanOrEqual(18);
      expect(b.x + b.width).toBeLessThanOrEqual(520 - 18);
      expect(b.y + b.height).toBeLessThanOrEqual(540 - 18);
      for (const face of protectedFaces) {
        expect(computeRectOverlapArea(b, face)).toBe(0);
      }
    }
  });

  it("일본어 만화 역-Z(ja-rtl) 4말풍선 컷에서도 우→좌 대본 순서를 100% 복원하고 2인 얼굴 보호 영역을 회피한다", () => {
    const twoFaces: readonly ProtectedFaceBox[] = [
      { id: "face-right", x: 330, y: 195, width: 110, height: 130 },
      { id: "face-left", x: 95, y: 215, width: 110, height: 130 },
    ];
    // 좌→우로 잘못 배치된 대사를 일본어 우→좌(ja-rtl) 기준으로 보정
    const wrongRtlBalloons: readonly SpeechBalloonNode[] = [
      { id: "ja-0", scriptOrder: 0, x: 40, y: 50, width: 125, height: 64 },
      { id: "ja-1", scriptOrder: 1, x: 365, y: 62, width: 125, height: 64 },
      { id: "ja-2", scriptOrder: 2, x: 100, y: 240, width: 125, height: 64 },
      { id: "ja-3", scriptOrder: 3, x: 345, y: 230, width: 125, height: 64 },
    ];

    const solvedRtl = resolveBalloonReadingOrderNudges({
      direction: "ja-rtl",
      panelWidth: 540,
      panelHeight: 560,
      safeMarginPx: 16,
      balloons: wrongRtlBalloons,
      protectedFaceBoxes: twoFaces,
    });

    expect(solvedRtl.initialReport.matchesScriptOrder).toBe(false);
    expect(solvedRtl.resolvedReport.matchesScriptOrder).toBe(true);
    expect(solvedRtl.resolvedReport.visualOrderIds).toEqual(["ja-0", "ja-1", "ja-2", "ja-3"]);
    expect(solvedRtl.resolvedReport.issues).toHaveLength(0);
    expect(solvedRtl.faceOverlapAreaPx2).toBe(0);
    expect(solvedRtl.safeMarginSatisfied).toBe(true);
  });

  it("이미 올바른 en-ltr Z-스윕 말풍선 배치는 불필요한 이동 없이(totalDisplacementPx === 0) 그대로 보존한다", () => {
    const cleanBalloons: readonly SpeechBalloonNode[] = [
      { id: "en-0", scriptOrder: 0, x: 36, y: 32, width: 140, height: 60 },
      { id: "en-1", scriptOrder: 1, x: 290, y: 40, width: 140, height: 60 },
      { id: "en-2", scriptOrder: 2, x: 48, y: 210, width: 150, height: 64 },
    ];

    const result = resolveBalloonReadingOrderNudges({
      direction: "en-ltr",
      panelWidth: 500,
      panelHeight: 360,
      safeMarginPx: 16,
      balloons: cleanBalloons,
    });

    expect(result.initialReport.matchesScriptOrder).toBe(true);
    expect(result.initialReport.issues).toHaveLength(0);
    expect(result.totalDisplacementPx).toBe(0);
    expect(result.nudges.every((n) => n.dx === 0 && n.dy === 0)).toBe(true);
  });
});

describe("epub3-guided-view-packager (EPUB 3.3 고정 레이아웃 및 가이드 뷰 패키저)", () => {
  it("결정론적 urn:uuid: 식별자와 W3C EPUB 3.3 pre-paginated content.opf XML 구조를 정확히 생성한다", () => {
    const uuid1 = deriveDeterministicEpubUuidUrn("moonlight-blade|ko|ltr");
    const uuid2 = deriveDeterministicEpubUuidUrn("moonlight-blade|ko|ltr");
    const uuidRtl = deriveDeterministicEpubUuidUrn("moonlight-blade|ja|rtl");

    expect(uuid1).toBe(uuid2);
    expect(uuid1).not.toBe(uuidRtl);
    expect(uuid1.startsWith("urn:uuid:")).toBe(true);
    expect(uuid1).toHaveLength("urn:uuid:00000000-0000-5000-8000-000000000000".length);
    expect(escapeXmlEntities('제1화 <검 & 불꽃> "시작"')).toBe(
      "제1화 &lt;검 &amp; 불꽃&gt; &quot;시작&quot;",
    );

    const bundle = buildEpub3GuidedViewPackage({
      workSlug: "moonlight-blade-ep01",
      title: "달빛 검객 <제1화 & 서막>",
      creatorName: "김작가",
      language: "ko",
      progressionDirection: "ltr",
      modifiedIsoUtc: "2026-11-26T12:00:00Z",
      pages: [
        {
          pageId: "p1",
          imageHref: "images/p001.webp",
          viewportWidthPx: 1_200,
          viewportHeightPx: 1_800,
          isCoverPage: true,
          panels: [
            { id: "c1", x: 60, y: 80, width: 1_080, height: 760, altSummaryKo: "오프닝 전경" },
            { id: "c2", x: 80, y: 920, width: 480, height: 780, altSummaryKo: "인물 클로즈업" },
          ],
        },
      ],
    });

    expect(bundle.contentOpfXml).toContain('rendition:layout="pre-paginated"');
    expect(bundle.contentOpfXml).toContain('<meta property="rendition:layout">pre-paginated</meta>');
    expect(bundle.contentOpfXml).toContain('page-progression-direction="ltr"');
    expect(bundle.contentOpfXml).toContain(`<dc:identifier id="pub-id">${bundle.packageUuidUrn}</dc:identifier>`);
    expect(bundle.contentOpfXml).toContain("달빛 검객 &lt;제1화 &amp; 서막&gt;");
    expect(bundle.contentOpfXml).toContain('properties="cover-image"');
    expect(bundle.contentOpfXml).toContain('properties="svg"');
  });

  it("ltr과 rtl 진행 방향에 맞춰 스파인 좌우 펼침면(page-spread)과 페이지 내부 컷 순서를 반전시킨다", () => {
    const sharedPages = [
      {
        pageId: "p1",
        imageHref: "images/p001.webp",
        viewportWidthPx: 1_000,
        viewportHeightPx: 1_500,
        panels: [
          { id: "left-panel", x: 50, y: 100, width: 400, height: 500 },
          { id: "right-panel", x: 550, y: 105, width: 400, height: 500 },
        ],
      },
      {
        pageId: "p2",
        imageHref: "images/p002.webp",
        viewportWidthPx: 1_000,
        viewportHeightPx: 1_500,
        panels: [{ id: "full-splash", x: 0, y: 0, width: 1_000, height: 1_500 }],
      },
    ] as const;

    const ltrPkg = buildEpub3GuidedViewPackage({
      workSlug: "dual-dir",
      title: "방향 검증",
      creatorName: "스튜디오",
      language: "ko",
      progressionDirection: "ltr",
      pages: sharedPages,
    });
    const rtlPkg = buildEpub3GuidedViewPackage({
      workSlug: "dual-dir",
      title: "방향 검증",
      creatorName: "스튜디오",
      language: "ja",
      progressionDirection: "rtl",
      pages: sharedPages,
    });

    expect(ltrPkg.contentOpfXml).toContain('page-progression-direction="ltr"');
    expect(ltrPkg.spinePages[0]?.spineProperty).toBe("rendition:page-spread-left");
    expect(ltrPkg.spinePages[1]?.spineProperty).toBe("rendition:page-spread-right");
    expect(ltrPkg.guidedViewSequence.map((r) => r.panelId)).toEqual([
      "left-panel",
      "right-panel",
      "full-splash",
    ]);

    expect(rtlPkg.contentOpfXml).toContain('page-progression-direction="rtl"');
    expect(rtlPkg.spinePages[0]?.spineProperty).toBe("rendition:page-spread-right");
    expect(rtlPkg.spinePages[1]?.spineProperty).toBe("rendition:page-spread-left");
    expect(rtlPkg.guidedViewSequence.map((r) => r.panelId)).toEqual([
      "right-panel",
      "left-panel",
      "full-splash",
    ]);
  });

  it("재련선 밖으로 넘친 컷도 뷰포트 안으로 엄격히 클램프하고 스마트 줌 배율(1.25..2.2)과 전역 ordinal을 부여한다", () => {
    const pkg = buildEpub3GuidedViewPackage({
      workSlug: "bleed-clamp-test",
      title: "가이드 뷰 클램프 테스트",
      creatorName: "툰스튜디오",
      language: "ko",
      progressionDirection: "ltr",
      pages: [
        {
          pageId: "bleed-page",
          imageHref: "images/bleed.png",
          imageMediaType: "image/png",
          viewportWidthPx: 1_400,
          viewportHeightPx: 2_000,
          panels: [
            // 페이지 바깥 음수·초과 재련선까지 뻗은 전면 컷
            { id: "bleed-splash", readingOrder: 0, x: -45, y: -30, width: 1_520, height: 1_900 },
            // 아주 작은 인서트 클로즈업 컷 (높은 스마트 줌 유도)
            { id: "tiny-inset", readingOrder: 1, x: 980, y: 1_620, width: 210, height: 220 },
          ],
        },
      ],
    });

    expect(pkg.guidedViewSequence.map((r) => r.ordinal)).toEqual([1, 2]);
    const splash = pkg.guidedViewSequence[0];
    const inset = pkg.guidedViewSequence[1];
    expect(splash).toBeDefined();
    expect(inset).toBeDefined();

    for (const region of pkg.guidedViewSequence) {
      expect(region.viewportBox.x).toBeGreaterThanOrEqual(0);
      expect(region.viewportBox.y).toBeGreaterThanOrEqual(0);
      expect(region.viewportBox.x + region.viewportBox.width).toBeLessThanOrEqual(1_400);
      expect(region.viewportBox.y + region.viewportBox.height).toBeLessThanOrEqual(2_000);
      expect(region.targetMagnification).toBeGreaterThanOrEqual(MIN_GUIDED_VIEW_MAGNIFICATION);
      expect(region.targetMagnification).toBeLessThanOrEqual(MAX_GUIDED_VIEW_MAGNIFICATION);
    }

    // 작은 인서트 컷은 전면 스플래시 컷보다 더 높은 확대 배율을 받는다.
    expect(inset?.targetMagnification ?? 0).toBeGreaterThan(splash?.targetMagnification ?? 0);
    expect(pkg.spinePages[0]?.xhtmlContent).toContain('viewBox="0 0 1400 2000"');
    expect(pkg.regionNavXhtml).toContain("#xywh=percent:");
  });
});
