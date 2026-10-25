import { describe, expect, it } from "vitest";

import {
  applyEdgeAwareChromaKey,
  buildBubbleTailGeometry,
  buildFiveLangDialogueSheetRows,
  classifyImportedPsdLayer,
  computeLinkedBubbleClusters,
  groupCutsIntoWebtoonStrips,
  relinkOrphanedBubblesByLevenshtein,
  resolveBubbleStrokeWidth,
  resolveWebtoonSpeakerVisuals,
  rotateEffectBy15Degrees,
  snapBubbleToOverlapPrevious,
  type KaistoryBubbleGeometrySpec,
} from "./kaistory-design-engine";

describe("kaistory-design-engine", () => {
  it("웹툰 앞 페이지 합침(⬆ 웹툰: 앞 페이지에 합침)에 따라 세로 스트립을 병합한다", () => {
    const strips = groupCutsIntoWebtoonStrips([
      {
        cutId: "cut-1",
        pageNumber: 1,
        cutOrder: 1,
        pageX: 0,
        pageY: 0,
        pageWidth: 1000,
        pageHeight: 800,
        webtoonX: 0,
        webtoonY: 0,
        webtoonWidth: 800,
        webtoonHeight: 900,
        mergeIntoPreviousWebtoonPage: false,
        frameStrokeWidth: 4,
      },
      {
        cutId: "cut-2",
        pageNumber: 2,
        cutOrder: 1,
        pageX: 0,
        pageY: 0,
        pageWidth: 1000,
        pageHeight: 800,
        webtoonX: 0,
        webtoonY: 900,
        webtoonWidth: 800,
        webtoonHeight: 1100,
        mergeIntoPreviousWebtoonPage: true,
        frameStrokeWidth: 4,
      },
    ]);
    expect(strips).toHaveLength(1);
    expect(strips[0]?.cutIds).toEqual(["cut-1", "cut-2"]);
    expect(strips[0]?.totalWebtoonHeight).toBe(2000);
  });

  it("말풍선 이진 탐색 꼬리 교차점·생각원·번개 꼬리 및 자동 테두리 두께를 계산한다", () => {
    expect(resolveBubbleStrokeWidth(0, 4)).toBe(3.4);
    expect(resolveBubbleStrokeWidth(5, 4)).toBe(5);

    const baseBubble: KaistoryBubbleGeometrySpec = {
      id: "b1",
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      shape: "ellipse",
      cornerRatio: 0.3,
      polySides: 0,
      strokeWidth: 0,
      tailProfile: "thought",
      tailTipX: 200,
      tailTipY: 280,
      tailSpreadPx: 24,
      tailCurveOffset: 16,
      thoughtDotCount: 4,
      thoughtDotShrink: 0.75,
      clipToFrame: false,
      mangaHidden: false,
    };

    const thoughtGeom = buildBubbleTailGeometry(baseBubble);
    expect(thoughtGeom.profile).toBe("thought");
    expect(thoughtGeom.thoughtDots).toHaveLength(4);
    expect(thoughtGeom.rootY).toBeGreaterThan(215);
    expect(thoughtGeom.rootY).toBeLessThan(225);

    const zigzagGeom = buildBubbleTailGeometry({
      ...baseBubble,
      tailProfile: "zigzag",
    });
    expect(zigzagGeom.polygonPoints).toHaveLength(5);
    expect(rotateEffectBy15Degrees(350, 1)).toBe(5);
  });

  it("이웃 말풍선 연결 클러스터(Union-Find)와 앞 말풍선 겹침 스냅을 계산한다", () => {
    const first = { id: "b1", x: 100, y: 100, width: 160, height: 100, linkGroup: "g1" };
    const second = { id: "b2", x: 300, y: 110, width: 160, height: 100, linkGroup: "g1" };
    const snapped = snapBubbleToOverlapPrevious(first, second, 14);
    expect(snapped.x).toBe(246);

    const clusters = computeLinkedBubbleClusters([
      first,
      { ...second, x: snapped.x, y: snapped.y },
      { id: "b3", x: 600, y: 400, width: 120, height: 80, linkGroup: "g1" },
    ]);
    expect(clusters).toEqual([["b1", "b2"], ["b3"]]);
  });

  it("웹툰 화자 표시 3모드(이름표·채움색·테두리색)와 명도 대비를 정확히 계산한다", () => {
    const badgeMode = resolveWebtoonSpeakerVisuals({
      speakerName: "민준",
      characterColorHex: "#1E293B",
      projectMode: "name",
    });
    expect(badgeMode.showSpeakerBadge).toBe(true);
    expect(badgeMode.badgeTextHex).toBe("#ffffff");

    const colorMode = resolveWebtoonSpeakerVisuals({
      speakerName: "민준",
      characterColorHex: "#FF6B6B",
      projectMode: "color",
      characterOverride: "stroke_only",
    });
    expect(colorMode.showSpeakerBadge).toBe(false);
    expect(colorMode.bubbleFillHex).toBe("#ffffff");
    expect(colorMode.bubbleStrokeHex).toBe("#FF6B6B");
  });

  it("크로마키 바깥쪽만(edgeOnly) Flood-Fill로 캐릭터 내부 흰색을 보존하고 외곽 배경만 투명화한다", () => {
    // 3x3 이미지: 테두리는 흰색(255,255,255), (1,1)을 둘러싼 십자 벽이 검정(0,0,0)은 아니지만
    // 5x5 이미지로 내부 흰색 픽셀(2,2)을 검은 테두리(1..3, 1..3)로 감싸서 테스트한다.
    const width = 5;
    const height = 5;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const isBlackRing =
          x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2);
        const val = isBlackRing ? 0 : 255;
        rgba[idx] = val;
        rgba[idx + 1] = val;
        rgba[idx + 2] = val;
        rgba[idx + 3] = 255;
      }
    }

    const result = applyEdgeAwareChromaKey({
      width,
      height,
      rgba,
      tolerance: 0.15,
      edgeOnly: true,
    });

    // 외곽 흰색 테두리(16픽셀)만 투명화되고 정중앙(2,2) 내부 흰색 픽셀은 불투명(255)으로 남는다!
    expect(result.clearedPixelCount).toBe(16);
    const centerAlpha = result.outputRgba[(2 * width + 2) * 4 + 3];
    expect(centerAlpha).toBe(255);
    const cornerAlpha = result.outputRgba[3];
    expect(cornerAlpha).toBe(0);
  });

  it("끊어진 kontiRef를 Levenshtein 유사도(>= 0.8)로 자동 재연결하고 PSD 레이어 분류 및 5언어 시트를 생성한다", () => {
    const relinked = relinkOrphanedBubblesByLevenshtein({
      bubbles: [
        {
          bubbleId: "b-1",
          currentKontiRef: "deleted-id",
          koText: "뉴턴의 운동 제2법칙을 확인해 볼까?",
        },
      ],
      contiDialogues: [
        {
          id: "conti-d-99",
          speakerName: "지수",
          kind: "dialogue",
          deliveryMode: "normal",
          text: "뉴턴의 운동 제2법칙을 확인해 볼까요?",
          translations: {
            en: "Shall we check Newton's second law of motion?",
            ja: "ニュートンの運動第2法則を確認してみようか？",
            zh: "我们来看看牛顿第二运动定律吧？",
            ru: "Проверим второй закон Ньютона?",
          },
        },
      ],
    });

    expect(relinked[0]?.status).toBe("relinked");
    expect(relinked[0]?.linkedDialogueId).toBe("conti-d-99");
    expect(relinked[0]?.restoredTranslations.en).toContain("Newton");

    expect(
      classifyImportedPsdLayer({
        layerName: "컷 테두리",
        layerWidth: 800,
        layerHeight: 1200,
        panelWidth: 800,
        panelHeight: 1200,
      }),
    ).toBe("frame_border");

    expect(
      classifyImportedPsdLayer({
        layerName: "레이어 1",
        layerWidth: 400,
        layerHeight: 600,
        panelWidth: 800,
        panelHeight: 1000,
      }),
    ).toBe("character");

    const rows = buildFiveLangDialogueSheetRows([
      {
        pageNumber: 1,
        dialogues: [
          {
            id: "d1",
            speakerName: "지수",
            kind: "dialogue",
            deliveryMode: "normal",
            text: "안녕!",
            translations: { en: "Hello!", ja: "こんにちは！", zh: "你好！", ru: "Привет!" },
          },
        ],
      },
    ]);
    expect(rows[0]).toEqual({
      pageNumber: 1,
      order: 1,
      speaker: "지수",
      kind: "dialogue",
      KO: "안녕!",
      EN: "Hello!",
      JA: "こんにちは！",
      ZH: "你好！",
      RU: "Привет!",
    });
  });
});
