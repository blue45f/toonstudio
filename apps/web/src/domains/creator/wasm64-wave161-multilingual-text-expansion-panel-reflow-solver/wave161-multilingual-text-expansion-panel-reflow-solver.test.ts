import { describe, expect, it } from "vitest";
import {
  LOCALE_TYPOGRAPHY_PROFILES,
  SUPPORTED_LOCALIZATION_LOCALES,
  auditEpisodeMultilingualReflowMatrix,
  computeEffectiveLineHeightPx,
  computeReflowManifestFingerprint,
  createSampleMultilingualReflowScenario,
  estimateLocalizedBalloonBox,
  isThaiCombiningMark,
  measureCharAdvancePx,
  renderMultilingualReflowAuditSvg,
  runMultilingualPanelReflowSolver,
  segmentThaiClusters,
  sha256ReflowHex,
  solveMultilingualPanelReflow,
  summarizeMultilingualReflowKo,
  wrapLocalizedText,
  type ProtectedFocalZone,
  type TextBlockSpec,
  type WebtoonPanelSpec,
} from "./index";

function makeBaseBlock(overrides?: Partial<TextBlockSpec>): TextBlockSpec {
  return {
    blockId: "blk-1",
    kind: "speech",
    baselineRect: { x: 40, y: 40, width: 220, height: 110 },
    baselineFontPx: 17,
    baselineText: "오늘 밤 마감 전까지 원고를 끝내야 해.",
    localizedTexts: {
      ko: "오늘 밤 마감 전까지 원고를 끝내야 해.",
      en: "We have to finish this manuscript before tonight's deadline hits.",
      ja: "今夜の締め切りまでに原稿を仕上げないと。",
      "zh-Hant": "今晚截稿前必須畫完原稿。",
      th: "เราต้องปั่นต้นฉบับให้เสร็จทันก่อนเส้นตายคืนนี้นะ",
      id: "Kita harus menyelesaikan seluruh naskah ini sebelum tenggat waktu malam ini.",
    },
    ...overrides,
  };
}

function makePanel(
  panelId: string,
  baselineHeightPx: number,
  protectedZones: readonly ProtectedFocalZone[],
  textBlocks: readonly TextBlockSpec[],
  extra?: Partial<WebtoonPanelSpec>,
): WebtoonPanelSpec {
  return {
    panelId,
    panelIndex: 0,
    widthPx: 800,
    baselineHeightPx,
    baselineGutterAfterPx: 56,
    protectedZones,
    textBlocks,
    ...extra,
  };
}

describe("Wave 161: 6개국어 조판 프로파일 및 문자 체계 규칙", () => {
  it("6개 지원 로케일 프로파일이 모두 정의되고 기대 확장 순서를 따른다", () => {
    expect(SUPPORTED_LOCALIZATION_LOCALES).toEqual(["ko", "en", "ja", "zh-Hant", "th", "id"]);
    for (const loc of SUPPORTED_LOCALIZATION_LOCALES) {
      expect(LOCALE_TYPOGRAPHY_PROFILES[loc].charExpansionFactor).toBeGreaterThan(0);
    }
    expect(LOCALE_TYPOGRAPHY_PROFILES["zh-Hant"].charExpansionFactor).toBeLessThan(
      LOCALE_TYPOGRAPHY_PROFILES.ko.charExpansionFactor,
    );
    expect(LOCALE_TYPOGRAPHY_PROFILES.id.charExpansionFactor).toBeGreaterThan(
      LOCALE_TYPOGRAPHY_PROFILES.en.charExpansionFactor,
    );
    expect(LOCALE_TYPOGRAPHY_PROFILES.en.charExpansionFactor).toBeGreaterThan(
      LOCALE_TYPOGRAPHY_PROFILES.th.charExpansionFactor,
    );
  });

  it("태국어는 성조·결합 모음 헤드룸 배수가 >= 1.22이며 동일 줄 수에서 한국어보다 행간이 엄격히 높다", () => {
    const th = LOCALE_TYPOGRAPHY_PROFILES.th;
    const ko = LOCALE_TYPOGRAPHY_PROFILES.ko;
    expect(th.diacriticHeadroomMultiplier).toBeGreaterThanOrEqual(1.22);
    const thLineH = computeEffectiveLineHeightPx(16, th);
    const koLineH = computeEffectiveLineHeightPx(16, ko);
    expect(thLineH).toBeGreaterThan(koLineH * 1.22);
    expect(thLineH * 3).toBeGreaterThan(koLineH * 3);
  });

  it("태국어 결합 모음·성조는 수평 폭 0이며 줄바꿈 시 행두로 분리되지 않는다", () => {
    expect(isThaiCombiningMark("\u0E49")).toBe(true);
    expect(isThaiCombiningMark("\u0E35")).toBe(true);
    expect(isThaiCombiningMark("ก")).toBe(false);
    expect(measureCharAdvancePx("\u0E49", 16, LOCALE_TYPOGRAPHY_PROFILES.th)).toBe(0);

    const sample = "ไม่ต้องห่วงนะฉันจะส่งต้นฉบับให้ทัน";
    const clusters = segmentThaiClusters(sample);
    expect(clusters.every((c) => !isThaiCombiningMark(c[0] ?? ""))).toBe(true);

    const lines = wrapLocalizedText(sample, 82, 16, LOCALE_TYPOGRAPHY_PROFILES.th);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(isThaiCombiningMark(line[0] ?? "")).toBe(false);
  });

  it("모든 6개국어 추정 결과가 각 언어의 minReadabilityFontPx 하한을 지킨다", () => {
    const tightBlock = makeBaseBlock({
      baselineRect: { x: 40, y: 40, width: 160, height: 74 },
      baselineFontPx: 14,
      localizedTexts: {
        en: "This extremely dense English dialogue must expand the balloon instead of shrinking past legibility limits.",
        id: "Dialog bahasa Indonesia yang sangat panjang ini wajib memperluas balon kata daripada mengecilkan huruf secara berlebihan.",
        th: "บทสนทนาภาษาไทยที่ยาวมากนี้จะต้องขยายกรอบคำพูดแทนที่จะย่อตัวอักษรจนอ่านไม่ออกเด็ดขาด",
        ja: "とても長い日本語のセリフでも最小可読フォントサイズを下回らずに吹き出しを拡張する必要があります。",
        "zh-Hant": "即使是非常長的繁體中文台詞，也必須維持最小可讀字級並適度擴張氣泡框。",
      },
    });
    for (const locale of SUPPORTED_LOCALIZATION_LOCALES) {
      const est = estimateLocalizedBalloonBox(tightBlock, locale, { panelWidthPx: 800 });
      expect(est.resolvedFontPx).toBeGreaterThanOrEqual(LOCALE_TYPOGRAPHY_PROFILES[locale].minReadabilityFontPx);
    }
  });

  it("CJK 격자 줄바꿈은 한국어·일본어·번체에서 닫는 문장부호의 행두 고립을 피한다", () => {
    const linesKo = wrapLocalizedText("지금 당장 옥상으로 올라와!", 105, 16, LOCALE_TYPOGRAPHY_PROFILES.ko);
    for (const line of linesKo) expect(line.startsWith("!")).toBe(false);
    const linesJa = wrapLocalizedText("今すぐ屋上へ来て、原稿を確認して。", 105, 16, LOCALE_TYPOGRAPHY_PROFILES.ja);
    for (const line of linesJa) {
      expect(line.startsWith("。")).toBe(false);
      expect(line.startsWith("、")).toBe(false);
    }
  });

  it("번역 텍스트가 누락된 로케일은 charExpansionFactor 기반 결정론적 합성을 사용한다", () => {
    const partialBlock = makeBaseBlock({ localizedTexts: { ko: "잠깐만 기다려 줘!" } });
    const estId = estimateLocalizedBalloonBox(partialBlock, "id", { panelWidthPx: 800 });
    const estZh = estimateLocalizedBalloonBox(partialBlock, "zh-Hant", { panelWidthPx: 800 });
    expect(estId.usedSyntheticProjection).toBe(true);
    expect(estZh.usedSyntheticProjection).toBe(true);
    expect(estId.localizedCharCount).toBeGreaterThan(estZh.localizedCharCount);
  });
});

describe("Wave 161: 단어 줄바꿈 및 말풍선 박스 확장 추정기", () => {
  it("영어 장문 대사가 단어 경계를 유지해 잘림 없이 줄바꿈된다", () => {
    const est = estimateLocalizedBalloonBox(makeBaseBlock(), "en", { panelWidthPx: 800 });
    expect(est.wrappedLines.length).toBeGreaterThanOrEqual(2);
    expect(est.requiredInnerWidthPx).toBeLessThanOrEqual(est.requiredOuterWidthPx);
    expect(est.wrappedLines.join(" ")).toContain("manuscript");
    expect(est.wrappedLines.join(" ")).toContain("deadline");
  });

  it("인도네시아어 초장문 복합어도 수평 잘림 없이 하이픈 분할된다", () => {
    const block = makeBaseBlock({
      baselineRect: { x: 40, y: 40, width: 150, height: 100 },
      localizedTexts: { id: "Kita harus mempertanggungjawabkan ketidaksempurnaan pengorganisasian ini." },
    });
    const est = estimateLocalizedBalloonBox(block, "id", { panelWidthPx: 800 });
    expect(est.wrappedLines.length).toBeGreaterThanOrEqual(3);
    expect(est.requiredInnerWidthPx).toBeLessThanOrEqual(est.requiredOuterWidthPx);
  });

  it("중국어 번체(zh-Hant)는 한국어 대비 높이가 매끄럽게 축소된다(<= ko)", () => {
    const block = makeBaseBlock({
      baselineRect: { x: 40, y: 40, width: 210, height: 120 },
      baselineText: "이번 회차 마지막 컷만큼은 절대 타협하지 않겠어.",
      localizedTexts: { ko: "이번 회차 마지막 컷만큼은 절대 타협하지 않겠어.", "zh-Hant": "這回最後一格，絕不妥協。" },
    });
    const koEst = estimateLocalizedBalloonBox(block, "ko", { panelWidthPx: 800 });
    const zhEst = estimateLocalizedBalloonBox(block, "zh-Hant", { panelWidthPx: 800 });
    expect(zhEst.requiredOuterHeightPx).toBeLessThanOrEqual(koEst.requiredOuterHeightPx);
  });

  it("여유 있는 짧은 텍스트는 기준 크기와 폰트를 유지하며 fits를 반환한다", () => {
    const block = makeBaseBlock({
      baselineRect: { x: 40, y: 40, width: 240, height: 110 },
      baselineText: "괜찮아.",
      localizedTexts: { en: "It's fine." },
    });
    const est = estimateLocalizedBalloonBox(block, "en", { panelWidthPx: 800 });
    expect(est.overflowStatus).toBe("fits");
    expect(est.resolvedFontPx).toBe(17);
  });

  it("미세한 초과는 minReadabilityFontPx 위에서 font-adjusted로 우선 수용한다", () => {
    const block = makeBaseBlock({
      baselineRect: { x: 40, y: 40, width: 200, height: 88 },
      baselineFontPx: 18,
      baselineText: "지금 바로 출발해야 해.",
      localizedTexts: { en: "We really need to leave right now without delay." },
    });
    const est = estimateLocalizedBalloonBox(block, "en", { panelWidthPx: 800, panelBaselineHeightPx: 600 });
    expect(est.overflowStatus).toBe("font-adjusted");
    expect(est.resolvedFontPx).toBeLessThan(18);
    expect(est.resolvedFontPx).toBeGreaterThanOrEqual(LOCALE_TYPOGRAPHY_PROFILES.en.minReadabilityFontPx);
  });

  it("큰 텍스트 확장은 가독성 하한 미만으로 폰트를 줄이기 전에 balloon-expanded로 전환한다", () => {
    const block = makeBaseBlock({
      baselineRect: { x: 40, y: 40, width: 185, height: 84 },
      baselineFontPx: 14,
      localizedTexts: {
        id: "Kita harus segera menyelesaikan seluruh halaman naskah dan pewarnaan akhir episode ini sebelum matahari terbit besok pagi!",
      },
    });
    const est = estimateLocalizedBalloonBox(block, "id", { panelWidthPx: 800, panelBaselineHeightPx: 640 });
    expect(est.overflowStatus).toBe("balloon-expanded");
    expect(est.resolvedFontPx).toBeGreaterThanOrEqual(LOCALE_TYPOGRAPHY_PROFILES.id.minReadabilityFontPx);
    expect(est.requiredOuterHeightPx).toBeGreaterThan(block.baselineRect.height);
  });

  it("컷 하단 경계를 넘기는 확장은 panel-reflow-required를 반환한다", () => {
    const block = makeBaseBlock({
      baselineRect: { x: 40, y: 460, width: 210, height: 100 },
      localizedTexts: {
        id: "Jangan khawatir, kita pasti akan menuntaskan seluruh ilustrasi dan latar belakang episode penting ini sebelum matahari terbit!",
      },
    });
    const est = estimateLocalizedBalloonBox(block, "id", { panelWidthPx: 800, panelBaselineHeightPx: 580 });
    expect(est.overflowStatus).toBe("panel-reflow-required");
  });

  it("명시적 줄바꿈과 효과음(sfx)·내레이션 패딩이 결정론적으로 동작한다", () => {
    const sfxBlock = makeBaseBlock({
      blockId: "sfx-1",
      kind: "sfx",
      baselineRect: { x: 20, y: 20, width: 160, height: 80 },
      baselineFontPx: 20,
      baselineText: "쾅!\n우르릉!",
      localizedTexts: { en: "BOOM!\nRUMBLE!" },
    });
    const est1 = estimateLocalizedBalloonBox(sfxBlock, "en", { panelWidthPx: 800 });
    const est2 = estimateLocalizedBalloonBox(sfxBlock, "en", { panelWidthPx: 800 });
    expect(est1.lineCount).toBeGreaterThanOrEqual(2);
    expect(est1).toEqual(est2);
  });
});

describe("Wave 161: 얼굴 비가림(0px²) 및 말풍선 비겹침(0px²) 리플로우 솔버", () => {
  it("인도네시아어(+38%) 확장 말풍선이 캐릭터 얼굴 옆에서 재배치되어 faceOcclusionAreaPx === 0을 유지한다", () => {
    const panel = makePanel(
      "p-face-id",
      540,
      [{ zoneId: "face-main", label: "캐릭터 얼굴", kind: "face", rect: { x: 260, y: 120, width: 240, height: 220 } }],
      [
        makeBaseBlock({
          blockId: "b-id-expand",
          baselineRect: { x: 40, y: 60, width: 205, height: 110 },
          localizedTexts: {
            id: "Kita harus menyelesaikan seluruh naskah dan pewarnaan halaman ini sebelum tenggat waktu tengah malam tiba!",
          },
        }),
      ],
    );
    const res = solveMultilingualPanelReflow("ep-face-id", [panel], "id");
    expect(res.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.totalBalloonOverlapAreaPx).toBe(0);
    expect(res.panels[0]?.blocks[0]?.faceOcclusionAreaPx).toBe(0);
    expect(res.verdict).toBe("PASS");
  });

  it("영어(+32%) 확장 말풍선이 눈 보호 영역 위에서 확장 시 컷 연장 또는 이동으로 얼굴을 가리지 않는다", () => {
    const panel = makePanel(
      "p-eyes-en",
      460,
      [{ zoneId: "eyes-band", label: "눈 클로즈업", kind: "eyes", rect: { x: 100, y: 150, width: 600, height: 140 } }],
      [
        makeBaseBlock({
          blockId: "b-en-above",
          baselineRect: { x: 120, y: 24, width: 240, height: 112 },
          localizedTexts: {
            en: "I will never let this chance slip away after everything we sacrificed to reach this rooftop studio tonight!",
          },
        }),
      ],
    );
    const res = solveMultilingualPanelReflow("ep-eyes-en", [panel], "en");
    expect(res.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.totalBalloonOverlapAreaPx).toBe(0);
    expect(res.verdict).toBe("PASS");
  });

  it("세로로 쌓인 두 말풍선이 동시에 확장되어도 서로 겹치지 않는다(balloonOverlapAreaPx === 0)", () => {
    const panel = makePanel(
      "p-stack",
      500,
      [{ zoneId: "face-right", label: "우측 얼굴", kind: "face", rect: { x: 460, y: 120, width: 240, height: 220 } }],
      [
        makeBaseBlock({
          blockId: "b-top",
          priority: 0,
          baselineRect: { x: 40, y: 40, width: 240, height: 100 },
          localizedTexts: { id: "Apakah kamu benar-benar yakin seluruh berkas naskah sudah tersimpan dengan aman di perangkat lokal?" },
        }),
        makeBaseBlock({
          blockId: "b-bottom",
          priority: 1,
          baselineRect: { x: 40, y: 164, width: 240, height: 100 },
          localizedTexts: { id: "Tentu saja, cadangan otomatis sudah aktif dan kita bisa langsung melanjutkan tahap penyelesaian akhir." },
        }),
      ],
    );
    const res = solveMultilingualPanelReflow("ep-stack", [panel], "id");
    expect(res.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.totalBalloonOverlapAreaPx).toBe(0);
    expect(res.overflowUnresolvedCount).toBe(0);
    expect(res.verdict).toBe("PASS");
  });

  it("중앙 얼굴 보호 영역이 있는 3말풍선 고밀도 컷도 가림·겹침 0px²로 해를 찾는다", () => {
    const panel = makePanel(
      "p-dense-3",
      620,
      [{ zoneId: "center-face", label: "중앙 인물", kind: "face", rect: { x: 290, y: 200, width: 220, height: 210 } }],
      [
        makeBaseBlock({
          blockId: "b-1",
          baselineRect: { x: 30, y: 30, width: 230, height: 110 },
          localizedTexts: { en: "Check the light direction on the rooftop window before we ink the shadows." },
        }),
        makeBaseBlock({
          blockId: "b-2",
          baselineRect: { x: 530, y: 30, width: 230, height: 110 },
          localizedTexts: { en: "Already matched the twilight angle across panels one through three!" },
        }),
        makeBaseBlock({
          blockId: "b-3",
          baselineRect: { x: 260, y: 450, width: 280, height: 118 },
          localizedTexts: { en: "Then let's finalize the speech bubbles and run the six-language layout check right now." },
        }),
      ],
    );
    const res = solveMultilingualPanelReflow("ep-dense-3", [panel], "en");
    expect(res.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.totalBalloonOverlapAreaPx).toBe(0);
    expect(res.overflowUnresolvedCount).toBe(0);
    expect(res.exportReady).toBe(true);
  });

  it("복수 보호 영역(얼굴 + 눈 + 액션 초점)을 동시에 모두 보호한다", () => {
    const panel = makePanel(
      "p-multi-zone",
      600,
      [
        { zoneId: "z1", label: "얼굴", kind: "face", rect: { x: 100, y: 150, width: 170, height: 170 } },
        { zoneId: "z2", label: "눈", kind: "eyes", rect: { x: 520, y: 160, width: 180, height: 110 } },
        { zoneId: "z3", label: "액션 초점", kind: "action-focal", rect: { x: 300, y: 280, width: 180, height: 160 } },
      ],
      [
        makeBaseBlock({
          blockId: "b-multi",
          baselineRect: { x: 290, y: 36, width: 210, height: 100 },
          localizedTexts: { th: "ระวังด้านซ้ายและด้านขวาให้ดีนะ ฉากนี้มีจุดโฟกัสสำคัญอยู่พร้อมกันถึงสามจุดเลยทีเดียว!" },
        }),
      ],
    );
    const res = solveMultilingualPanelReflow("ep-multi-zone", [panel], "th");
    expect(res.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.totalBalloonOverlapAreaPx).toBe(0);
  });

  it("수평 여백이 충분하면 컷 높이를 늘리지 않고 수평 이동만으로 해결한다", () => {
    const panel = makePanel(
      "p-horiz",
      420,
      [{ zoneId: "z-left", label: "좌측 얼굴", kind: "face", rect: { x: 250, y: 40, width: 160, height: 220 } }],
      [
        makeBaseBlock({
          blockId: "b-horiz",
          baselineRect: { x: 42, y: 50, width: 200, height: 110 },
          localizedTexts: { en: "Move right into the open canvas sky area cleanly without stretching the panel." },
        }),
      ],
    );
    const res = solveMultilingualPanelReflow("ep-horiz", [panel], "en");
    expect(res.panels[0]?.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.panels[0]?.resolvedHeightPx).toBe(panel.baselineHeightPx);
  });

  it("가로 전체를 보호 영역이 가로막으면 컷 높이를 아래로 확장(panel-extended-below)해 수용한다", () => {
    const panel = makePanel(
      "p-extend",
      420,
      [{ zoneId: "z-wide", label: "가로 파노라마 인물", kind: "face", rect: { x: 30, y: 130, width: 740, height: 150 } }],
      [
        makeBaseBlock({
          blockId: "b-below",
          baselineRect: { x: 180, y: 296, width: 250, height: 100 },
          localizedTexts: {
            id: "Kita harus memperpanjang tinggi panel ke bawah agar seluruh kalimat terjemahan bahasa Indonesia ini terbaca dengan nyaman tanpa menutupi wajah karakter utama!",
          },
        }),
      ],
    );
    const res = solveMultilingualPanelReflow("ep-extend", [panel], "id", { maxPanelHeightScale: 1.65 });
    expect(res.panels[0]?.resolvedHeightPx).toBeGreaterThan(panel.baselineHeightPx);
    expect(res.panels[0]?.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.panels[0]?.blocks[0]?.placementStrategy).toBe("panel-extended-below");
    expect(res.verdict).toBe("PASS");
  });

  it("축소 허용 모드(allowPanelContraction)에서는 중국어 번체 컷 높이가 보호 영역을 침범하지 않고 부드럽게 줄어든다", () => {
    const panel = makePanel(
      "p-contract",
      500,
      [{ zoneId: "z-top", label: "상단 얼굴", kind: "face", rect: { x: 280, y: 80, width: 200, height: 180 } }],
      [
        makeBaseBlock({
          blockId: "b-short-zh",
          baselineRect: { x: 40, y: 280, width: 240, height: 150 },
          localizedTexts: { "zh-Hant": "走吧。" },
        }),
      ],
      { allowVerticalContraction: true },
    );
    const res = solveMultilingualPanelReflow("ep-contract", [panel], "zh-Hant", {
      allowPanelContraction: true,
      minPanelHeightScale: 0.8,
    });
    expect(res.panels[0]?.resolvedHeightPx).toBeLessThan(panel.baselineHeightPx);
    expect(res.panels[0]?.resolvedHeightPx).toBeGreaterThanOrEqual(400);
    expect(res.panels[0]?.totalFaceOcclusionAreaPx).toBe(0);
  });
});

describe("Wave 161: 컷 높이·거터 재분배 및 세로 스크롤 좌표 정합성", () => {
  it("모든 컷의 세로 좌표(yStartPx, yEndPx, gutterAfterPx)가 엄격히 단조 증가한다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    for (const locale of SUPPORTED_LOCALIZATION_LOCALES) {
      const res = solveMultilingualPanelReflow(scenario.episodeId, scenario.panels, locale);
      expect(res.monotonicCoordinatesValid).toBe(true);
      for (let i = 0; i < res.panels.length; i += 1) {
        const cur = res.panels[i];
        expect(cur && cur.yEndPx > cur.yStartPx).toBe(true);
        if (i > 0) {
          const prev = res.panels[i - 1];
          expect(cur?.yStartPx).toBe((prev?.yEndPx ?? 0) + (prev?.gutterAfterPx ?? 0));
        }
      }
    }
  });

  it("컷 사이 거터는 절대 minGutterPx 미만으로 줄어들지 않고 maxGutterPx를 초과하지 않는다", () => {
    const scenario = createSampleMultilingualReflowScenario({ constraints: { minGutterPx: 36, maxGutterPx: 140 } });
    const res = solveMultilingualPanelReflow(scenario.episodeId, scenario.panels, "id", scenario.constraints);
    expect(res.minResolvedGutterPx).toBeGreaterThanOrEqual(36);
    for (let i = 0; i < res.panels.length - 1; i += 1) {
      const g = res.panels[i]?.gutterAfterPx ?? 0;
      expect(g).toBeGreaterThanOrEqual(36);
      expect(g).toBeLessThanOrEqual(140);
    }
  });

  it("전체 스크롤 높이 증감량이 개별 컷 높이 증감 + 거터 증감 합계와 정확히 일치한다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    for (const locale of SUPPORTED_LOCALIZATION_LOCALES) {
      const res = solveMultilingualPanelReflow(scenario.episodeId, scenario.panels, locale);
      expect(res.totalHeightDeltaPx).toBe(res.sumPanelHeightDeltasPx + res.sumGutterDeltasPx);
      expect(res.resolvedTotalScrollHeightPx - res.baselineTotalScrollHeightPx).toBe(res.totalHeightDeltaPx);
    }
  });

  it("비례 거터 재조정으로 정상 확장(+35%) 시 호흡 편차(pacingDriftRatio)를 낮게 유지한다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const resId = solveMultilingualPanelReflow(scenario.episodeId, scenario.panels, "id");
    expect(resId.pacingDriftRatio).toBeLessThan(0.2);
  });

  it("마지막 컷의 기준 거터가 0이면 불필요한 하단 여백을 추가하지 않는다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const res = solveMultilingualPanelReflow(scenario.episodeId, scenario.panels, "en");
    const last = res.panels[res.panels.length - 1];
    expect(last?.baselineGutterAfterPx).toBe(0);
    expect(last?.gutterAfterPx).toBe(0);
  });

  it("한국어 원본(ko) 자체 리플로우는 높이 변화 0% 및 PASS를 유지한다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const resKo = solveMultilingualPanelReflow(scenario.episodeId, scenario.panels, "ko");
    expect(resKo.heightGrowthPercent).toBe(0);
    expect(resKo.totalHeightDeltaPx).toBe(0);
    expect(resKo.totalFaceOcclusionAreaPx).toBe(0);
    expect(resKo.verdict).toBe("PASS");
  });
});

describe("Wave 161: 극단 확장(+80% 이상) 상한 캡 및 우아한 진단 경고", () => {
  const extremePanel = makePanel(
    "cut-extreme",
    340,
    [{ zoneId: "hero-face-ext", label: "주인공 클로즈업", kind: "face", rect: { x: 24, y: 24, width: 752, height: 176 } }],
    [
      makeBaseBlock({
        blockId: "balloon-extreme",
        baselineRect: { x: 50, y: 210, width: 220, height: 108 },
        baselineFontPx: 17,
        baselineText: "오늘 밤 마감 전까지 반드시 끝내자!",
        localizedTexts: {
          id: "Kita benar-benar harus menyelesaikan seluruh penyuntingan, pewarnaan latar, penyesuaian tipografi enam bahasa, pemeriksaan hak cipta aset, dan verifikasi tata letak vertikal sebelum matahari terbit esok pagi tanpa melewatkan satu pun detail penting pada panel penutup bab klimaks ini, termasuk seluruh catatan kaki redaksi dan penyesuaian efek suara lokal!",
        },
      }),
    ],
  );

  it("maxPanelHeightScale 상한에 걸리면 컷 높이가 상한에서 정확히 멈춘다", () => {
    const res = solveMultilingualPanelReflow("ep-ext", [extremePanel], "id", { maxPanelHeightScale: 1.15 });
    expect(res.panels[0]?.resolvedHeightPx).toBeLessThanOrEqual(Math.round(340 * 1.15));
    expect(res.panels[0]?.heightCapReached).toBe(true);
  });

  it("상한 초과 극단 확장 시 조용히 자르지 않고 overflowUnresolvedCount > 0 및 한글 경고를 발행한다", () => {
    const res = solveMultilingualPanelReflow("ep-ext", [extremePanel], "id", { maxPanelHeightScale: 1.15 });
    expect(res.overflowUnresolvedCount).toBeGreaterThan(0);
    expect(res.exportReady).toBe(false);
    expect(res.verdict).toBe("WARN");
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain("cut-extreme");
    expect(res.panels[0]?.blocks[0]?.placementStrategy).toBe("capped-overflow");
  });

  it("극단 확장으로 상한에 걸려도 보호 얼굴 영역은 절대 가리지 않는다(faceOcclusionAreaPx === 0)", () => {
    const res = solveMultilingualPanelReflow("ep-ext", [extremePanel], "id", { maxPanelHeightScale: 1.15 });
    expect(res.totalFaceOcclusionAreaPx).toBe(0);
    expect(res.panels[0]?.blocks[0]?.faceOcclusionAreaPx).toBe(0);
  });

  it("극단 확장 상한 상황에서도 말풍선 비겹침과 좌표 단조성을 유지한다", () => {
    const res = solveMultilingualPanelReflow("ep-ext", [extremePanel], "id", { maxPanelHeightScale: 1.15 });
    expect(res.totalBalloonOverlapAreaPx).toBe(0);
    expect(res.monotonicCoordinatesValid).toBe(true);
  });
});

describe("Wave 161: 6개국어 매트릭스 동시 감사", () => {
  it("6개국어를 동시에 감사하고 모든 로케일 결과를 resultsByLocale에 채운다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const audit = auditEpisodeMultilingualReflowMatrix(scenario.episodeId, scenario.panels);
    expect(audit.localesAudited).toHaveLength(6);
    expect(audit.rankedEntries).toHaveLength(6);
    for (const loc of SUPPORTED_LOCALIZATION_LOCALES) expect(audit.resultsByLocale[loc]).toBeDefined();
  });

  it("확장 스트레스 순위에서 인도네시아어/영어가 상위권이고 중국어 번체가 최소 확장으로 분류된다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const audit = auditEpisodeMultilingualReflowMatrix(scenario.episodeId, scenario.panels);
    const top2 = audit.rankedEntries.slice(0, 2).map((e) => e.locale);
    expect(top2.some((loc) => loc === "id" || loc === "en")).toBe(true);
    expect(["zh-Hant", "ko"]).toContain(audit.mostCompactLocale);
    expect(audit.rankedEntries[0]?.stressRank).toBe(1);
    expect(audit.rankedEntries[5]?.stressRank).toBe(6);
  });

  it("동일 입력에 대해 반복 호출 시 완전히 동일한 매트릭스 결과를 결정론적으로 반환한다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const first = auditEpisodeMultilingualReflowMatrix(scenario.episodeId, scenario.panels);
    const second = auditEpisodeMultilingualReflowMatrix(scenario.episodeId, scenario.panels);
    expect(first).toEqual(second);
  });

  it("6개 언어 중 한 언어라도 미해소 오버플로우가 생기면 overallVerdict가 WARN으로 전파된다", () => {
    const warnPanel = makePanel(
      "cut-warn-id",
      340,
      [{ zoneId: "wide-face", label: "얼굴", kind: "face", rect: { x: 24, y: 24, width: 752, height: 186 } }],
      [
        makeBaseBlock({
          blockId: "extreme-only-id",
          baselineRect: { x: 40, y: 220, width: 210, height: 96 },
          localizedTexts: {
            ko: "짧은 대사.",
            en: "Short line.",
            ja: "短い台詞。",
            "zh-Hant": "短台詞。",
            th: "สั้นๆ",
            id: "Kalimat bahasa Indonesia yang sangat panjang sekali sampai jauh melampaui kapasitas ekspansi maksimum panel ini sehingga sistem wajib menandai peringatan resmi bagi editor sebelum penerbitan global dilakukan tanpa kecuali sedikit pun!",
          },
        }),
      ],
    );
    const audit = auditEpisodeMultilingualReflowMatrix("ep-warn-one", [warnPanel], {
      constraints: { maxPanelHeightScale: 1.1 },
    });
    expect(audit.overallVerdict).toBe("WARN");
    expect(audit.allLocalesExportReady).toBe(false);
    expect(audit.worstCaseLocale).toBe("id");
  });
});

describe("Wave 161: FIPS 180-4 SHA-256 지문 및 결정론성", () => {
  it('표준 벡터 ""의 SHA-256 다이제스트가 FIPS 180-4 규격과 정확히 일치한다', () => {
    expect(sha256ReflowHex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it('표준 벡터 "abc"의 SHA-256 다이제스트가 FIPS 180-4 규격과 정확히 일치한다', () => {
    expect(sha256ReflowHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("한글·태국어·중국어·이모지 UTF-8 다바이트 문자열을 64자리 소문자 16진수로 일관 해시한다", () => {
    const sample = "웹툰 ภาษาไทย 繁體中文 🎨";
    const h1 = sha256ReflowHex(sample);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(sha256ReflowHex(sample));
  });

  it("로케일 텍스트나 컷 높이가 1px만 바뀌어도 manifestFingerprintSha256이 즉시 변한다", () => {
    const baseScenario = createSampleMultilingualReflowScenario();
    const baseOut = runMultilingualPanelReflowSolver(baseScenario);
    const firstPanel = baseScenario.panels[0];
    const firstBlock = firstPanel?.textBlocks[0];
    if (!firstPanel || !firstBlock) throw new Error("Missing sample panel");

    const textMutatedPanels: WebtoonPanelSpec[] = [
      {
        ...firstPanel,
        textBlocks: [
          { ...firstBlock, localizedTexts: { ...firstBlock.localizedTexts, en: `${firstBlock.localizedTexts.en ?? ""} Now!` } },
          ...firstPanel.textBlocks.slice(1),
        ],
      },
      ...baseScenario.panels.slice(1),
    ];
    const textAudit = auditEpisodeMultilingualReflowMatrix(baseScenario.episodeId, textMutatedPanels);
    const textFp = computeReflowManifestFingerprint(textAudit, textMutatedPanels);
    expect(textFp).not.toBe(baseOut.manifestFingerprintSha256);

    const geoMutatedPanels: WebtoonPanelSpec[] = [
      { ...firstPanel, baselineHeightPx: firstPanel.baselineHeightPx + 1 },
      ...baseScenario.panels.slice(1),
    ];
    const geoAudit = auditEpisodeMultilingualReflowMatrix(baseScenario.episodeId, geoMutatedPanels);
    const geoFp = computeReflowManifestFingerprint(geoAudit, geoMutatedPanels);
    expect(geoFp).not.toBe(baseOut.manifestFingerprintSha256);
    expect(geoFp).not.toBe(textFp);
  });
});

describe("Wave 161: 순수 OKLCH 진단 SVG, 자연스러운 한글 QA 요약 및 통합 오케스트레이터", () => {
  it("진단 SVG는 순수 oklch() 색상만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 전혀 없다", () => {
    const out = runMultilingualPanelReflowSolver(createSampleMultilingualReflowScenario());
    const svg = out.diagnosticSvg;
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\(/i);
    expect(svg).not.toMatch(/\bhsla?\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("진단 SVG는 제목과 ID의 XML 특수문자(<, >, &, \", ')를 안전하게 이스케이프한다", () => {
    const scenario = createSampleMultilingualReflowScenario({ titleKo: `에피소드 <1화> & "결심" '최종'` });
    const out = runMultilingualPanelReflowSolver(scenario);
    const svg = renderMultilingualReflowAuditSvg(scenario.titleKo, out.focusResult, out.matrixAudit);
    expect(svg).toContain("&lt;1화&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;결심&quot;");
    expect(svg).toContain("&apos;최종&apos;");
  });

  it("한글 QA 요약은 PASS/WARN/FAIL 판정과 자연스러운 한국어 문체(번역투 배제)를 유지한다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const out = runMultilingualPanelReflowSolver(scenario);
    const brief = summarizeMultilingualReflowKo(scenario.titleKo, out.matrixAudit);
    expect(brief).toMatch(/^\[(PASS|WARN|FAIL)\]/);
    expect(brief).toContain("얼굴·눈 보호 영역 가림 0건");
    expect(brief).not.toContain("하는 것을 가능하게 합니다");
    expect(brief).not.toContain("직관적인 경험을 제공합니다");
    expect(brief).not.toContain("원활한 워크플로우를 보장합니다");
  });

  it("통합 오케스트레이터가 표준 3컷·6개국어 시나리오를 오류 없이 결정론적으로 완수한다", () => {
    const scenario = createSampleMultilingualReflowScenario();
    const out1 = runMultilingualPanelReflowSolver(scenario);
    const out2 = runMultilingualPanelReflowSolver(scenario);
    expect(out1).toEqual(out2);
    expect(out1.matrixAudit.overallVerdict).toBe("PASS");
    expect(out1.matrixAudit.zeroOcclusionAllLocales).toBe(true);
    expect(out1.matrixAudit.zeroOverlapAllLocales).toBe(true);
    expect(out1.matrixAudit.allLocalesExportReady).toBe(true);
    expect(out1.manifestFingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out1.focusResult.monotonicCoordinatesValid).toBe(true);
  });

  it("오케스트레이터는 사용자 지정 focusLocale과 제약 오버라이드를 정확히 반영한다", () => {
    const scenario = createSampleMultilingualReflowScenario({
      focusLocale: "th",
      constraints: { minGutterPx: 40, maxPanelHeightScale: 1.55 },
    });
    const out = runMultilingualPanelReflowSolver(scenario);
    expect(out.focusLocale).toBe("th");
    expect(out.focusResult.targetLocale).toBe("th");
    expect(out.focusResult.minResolvedGutterPx).toBeGreaterThanOrEqual(40);
    expect(out.diagnosticSvg).toContain("태국어");
  });
});
