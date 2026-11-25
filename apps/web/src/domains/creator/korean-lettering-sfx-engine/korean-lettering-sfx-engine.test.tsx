// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  BALLOON_SHAPE_IDS,
  BALLOON_SHAPE_SPECS,
  buildBalloonSvgGeometry,
  countVisibleGlyphs,
  DEFAULT_BALLOON_PRESETS,
  DEFAULT_SFX_PRESETS,
  detectSfxScript,
  estimateBalloonReadingTimeSec,
  evaluateInscribedWidthFactor,
  generateSfxVectorEnvelope,
  measureOpticalTextWidthEm,
  SFX_ENVELOPE_IDS,
  StudioKoreanLetteringSfxPanel,
  tokenizeKoreanEojeol,
  typesetKoreanBalloon,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/korean-lettering-sfx-engine",
);

describe("Wave 41B: 한국어 어절 광학 말풍선 자동 조판 · 세로쓰기 · 5종 감정 의성어(SFX) 벡터 타이포 엔진", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 타원형(oval) 내접 폭 곡선 sqrt(1-y²)는 중심(y=0)에서 최대이고 상하로 대칭 수렴한다", () => {
    const center = evaluateInscribedWidthFactor("oval", 0);
    const upper = evaluateInscribedWidthFactor("oval", -0.6);
    const lower = evaluateInscribedWidthFactor("oval", 0.6);
    const edge = evaluateInscribedWidthFactor("oval", 0.8);

    expect(center).toBe(1);
    expect(upper).toBeCloseTo(0.8, 2);
    expect(lower).toBe(upper);
    expect(edge).toBeCloseTo(0.6, 2);
    expect(center).toBeGreaterThan(upper);
    expect(upper).toBeGreaterThan(edge);
  });

  it("2. 타원형 말풍선 다이아몬드 조판은 중앙 행이 가장 넓고 상하 행이 부드럽게 좁아지며 어절(keep-all)을 보존한다", () => {
    const dialogue = "오늘 밤 옥상에서 비 그치기 전에 반드시 이 사건의 진실을 밝혀내야만 해.";
    const result = typesetKoreanBalloon(dialogue, {
      shape: "oval",
      balloonWidthPx: 252,
      fontSizePx: 16,
    });

    expect(result.cssWordBreak).toBe("keep-all");
    expect(result.eojeolPreserved).toBe(true);
    expect(result.lines.length).toBeGreaterThanOrEqual(3);

    const midIdx = Math.floor(result.lines.length / 2);
    const midLine = result.lines[midIdx];
    const firstLine = result.lines[0];
    const lastLine = result.lines[result.lines.length - 1];

    expect(midLine).toBeDefined();
    expect(firstLine).toBeDefined();
    expect(lastLine).toBeDefined();
    expect(midLine?.inscribedWidthFactor ?? 0).toBeGreaterThan(firstLine?.inscribedWidthFactor ?? 1);
    expect(midLine?.inscribedWidthFactor ?? 0).toBeGreaterThan(lastLine?.inscribedWidthFactor ?? 1);
    expect(midLine?.opticalWidthEm ?? 0).toBeGreaterThanOrEqual((firstLine?.opticalWidthEm ?? 0) - 0.5);
    expect(midLine?.opticalWidthEm ?? 0).toBeGreaterThanOrEqual((lastLine?.opticalWidthEm ?? 0) - 0.5);
    expect(result.diamondBalanceScore).toBeGreaterThanOrEqual(70);

    // 모든 어절이 원문과 완전히 일치하는지 검증
    const rejoined = result.lines.map((line) => line.text).join(" ");
    expect(rejoined).toBe(dialogue);
  });

  it("3. 5종 말풍선(oval·burst·whisper·thought·caption)은 각기 고유한 내접 곡선·패딩·SVG 외곽선을 생성한다", () => {
    const sample = "지금 당장 저 문 너머로 뛰어가야 해, 시간이 거의 남지 않았어!";
    const outlines = new Set<string>();

    for (const shape of BALLOON_SHAPE_IDS) {
      const res = typesetKoreanBalloon(sample, { shape, balloonWidthPx: 260, fontSizePx: 16 });
      expect(res.shape).toBe(shape);
      expect(res.innerPaddingRatio).toBe(BALLOON_SHAPE_SPECS[shape].innerPaddingRatio);
      expect(res.balloonOutlinePath.startsWith("M ")).toBe(true);
      expect(res.balloonOutlinePath.endsWith("Z")).toBe(true);
      expect(res.inscribedCurveGuides).toHaveLength(5);
      outlines.add(res.balloonOutlinePath);

      if (shape === "thought") {
        expect(res.thoughtDots).toHaveLength(3);
        expect(res.tailPath).toBe("");
      } else if (shape === "caption") {
        expect(res.tailPath).toBe("");
        expect(res.thoughtDots).toHaveLength(0);
        // 사각 나레이션은 상하 폭이 거의 균일해야 한다
        expect(evaluateInscribedWidthFactor("caption", 0.7)).toBeGreaterThan(0.95);
      } else {
        expect(res.tailPath.startsWith("M ")).toBe(true);
      }
    }

    // oval과 whisper는 타원 기하를 공유하고(dashedOutline 차이), burst/thought/caption은 별도 경로
    expect(outlines.size).toBeGreaterThanOrEqual(4);
    expect(BALLOON_SHAPE_SPECS.whisper.dashedOutline).toBe(true);
    expect(BALLOON_SHAPE_SPECS.oval.dashedOutline).toBe(false);
  });

  it("4. 외톨이 1글자 행(orphan/widow) 방지 로직은 마지막·첫 줄에 1글자 어절이 고립되지 않도록 자동 재균형한다", () => {
    const trickyDialogues = [
      "오늘 밤 옥상에서 만나기로 약속했잖아 너",
      "왜 아무 말도 하지 않고 그냥 돌아선 거야 응?",
      "어제부터 우리가 기다려온 순간이 드디어 온 것 같아 끝",
    ];

    for (const dialogue of trickyDialogues) {
      const result = typesetKoreanBalloon(dialogue, {
        shape: "oval",
        balloonWidthPx: 224,
        fontSizePx: 16,
        preventOrphans: true,
      });

      expect(result.orphanLineCount).toBe(0);
      for (const line of result.lines) {
        expect(line.isOrphan).toBe(false);
        if (result.lines.length >= 2) {
          expect(countVisibleGlyphs(line.text)).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("5. 광학 중심 보정(-1.5% ~ -3%)과 금칙 문장부호 직전 어절 결합이 정확하게 동작한다", () => {
    const tokens = tokenizeKoreanEojeol("잠깐만 ! 정말로 갈 거야 … ?");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.eojeols).toEqual(["잠깐만!", "정말로", "갈", "거야…?"]);

    const ovalRes = typesetKoreanBalloon("광학 중심 보정 확인", { shape: "oval", balloonHeightPx: 200 });
    expect(ovalRes.opticalCenterOffsetRatio).toBe(-0.03);
    expect(ovalRes.opticalCenterYPx).toBe(94); // 200 * (0.5 - 0.03) = 94

    const captionRes = typesetKoreanBalloon("나레이션 광학 중심", { shape: "caption", balloonHeightPx: 200 });
    expect(captionRes.opticalCenterOffsetRatio).toBe(-0.015);
    expect(captionRes.opticalCenterYPx).toBe(97); // 200 * (0.5 - 0.015) = 97
  });

  it("6. 일본어/고전 세로쓰기(vertical-rl)는 우→좌 열 배치, 세로 문장부호 치환, 세로중가로(!!/?!)를 계산한다", () => {
    const verticalRes = typesetKoreanBalloon("「그 검을 뽑는 순간… 모든 인연이 바뀐다!!」", {
      shape: "oval",
      writingMode: "vertical-rl",
      balloonWidthPx: 210,
      fontSizePx: 16,
    });

    expect(verticalRes.writingMode).toBe("vertical-rl");
    expect(verticalRes.verticalColumns.length).toBeGreaterThanOrEqual(2);

    // 우→좌 진행: 0열 x 좌표가 1열 x 좌표보다 커야 한다
    const col0 = verticalRes.verticalColumns[0];
    const col1 = verticalRes.verticalColumns[1];
    expect(col0).toBeDefined();
    expect(col1).toBeDefined();
    expect(col0?.xPx ?? 0).toBeGreaterThan(col1?.xPx ?? 999);

    const allGlyphs = verticalRes.verticalColumns.flatMap((c) => c.glyphs);
    const openQuote = allGlyphs.find((g) => g.sourceChar === "「");
    const closeQuote = allGlyphs.find((g) => g.sourceChar === "」");
    const ellipsis = allGlyphs.find((g) => g.sourceChar === "…");
    const doubleBang = allGlyphs.find((g) => g.sourceChar === "!!");

    expect(openQuote?.displayChar).toBe("﹁");
    expect(closeQuote?.displayChar).toBe("﹂");
    expect(ellipsis?.displayChar).toBe("︙");
    expect(doubleBang?.tateChuYoko).toBe(true);
  });

  it("7. 독자 가독 시간(초) 산출은 대사 길이에 단조 증가하고 폭발형·독백형 속도와 다국어를 구분한다", () => {
    const empty = estimateBalloonReadingTimeSec("   ", "oval");
    expect(empty.readingTimeSec).toBe(0);
    expect(empty.visibleGlyphCount).toBe(0);

    const shortOval = estimateBalloonReadingTimeSec("잠깐만!", "oval");
    const longOval = estimateBalloonReadingTimeSec(
      "오늘 밤 옥상에서 만나기로 했던 약속, 혹시 아직도 기억하고 있는 거야? 비가 오기 전에 꼭 답해줘.",
      "oval",
    );
    expect(shortOval.readingTimeSec).toBeGreaterThanOrEqual(0.45);
    expect(longOval.readingTimeSec).toBeGreaterThan(shortOval.readingTimeSec * 2);
    expect(longOval.recommendedCutHoldSec).toBeGreaterThan(longOval.readingTimeSec);

    const burstRead = estimateBalloonReadingTimeSec("지금 당장 피해! 무너진다!", "burst");
    const thoughtRead = estimateBalloonReadingTimeSec("지금 당장 피해! 무너진다!", "thought");
    expect(burstRead.readingTimeSec).toBeLessThan(thoughtRead.readingTimeSec);

    const enRead = estimateBalloonReadingTimeSec("Watch out! The bridge is collapsing!", "oval");
    expect(enRead.readingTimeSec).toBeGreaterThan(1.0);
  });

  it("8. 빈 문자열·명시적 줄바꿈·초장문 무공백 예외 입력에서도 결정론적으로 동작하며 NaN이 발생하지 않는다", () => {
    const emptyRes = typesetKoreanBalloon("   ");
    expect(emptyRes.lines).toHaveLength(0);
    expect(emptyRes.orphanLineCount).toBe(0);
    expect(Number.isFinite(emptyRes.balloonHeightPx)).toBe(true);

    const multiline = typesetKoreanBalloon("첫 번째 문단 대사입니다.\n두 번째 문단 대사입니다.");
    expect(multiline.lines.length).toBeGreaterThanOrEqual(2);

    const megaToken = "가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허";
    const splitRes = typesetKoreanBalloon(megaToken, { balloonWidthPx: 200, fontSizePx: 16 });
    expect(splitRes.eojeolPreserved).toBe(false);
    expect(splitRes.lines.length).toBeGreaterThanOrEqual(2);

    const geomNoTail = buildBalloonSvgGeometry("oval", 240, 160, "none");
    expect(geomNoTail.tailPath).toBe("");
    expect(measureOpticalTextWidthEm("한글AB!")).toBeGreaterThan(3);
  });

  it("9. 5종 SFX 파라메트릭 벡터 엔벨로프는 모두 고유한 글자 아크·기울기·원근 테이퍼·SVG 경로를 생성한다", () => {
    const signatures = new Set<string>();

    for (const envelopeId of SFX_ENVELOPE_IDS) {
      const res = generateSfxVectorEnvelope("콰광!", { envelopeId });
      expect(res.envelopeId).toBe(envelopeId);
      expect(res.glyphs).toHaveLength(3);
      expect(res.envelopeUpperCurvePath.startsWith("M ")).toBe(true);
      expect(res.envelopeLowerCurvePath.startsWith("M ")).toBe(true);
      expect(res.envelopeClosedPath.endsWith("Z")).toBe(true);
      expect(res.accentPaths.length).toBeGreaterThan(0);

      const sig = res.glyphs
        .map((g) => `${g.x},${g.y},${g.arcAngleDeg},${g.shearXDeg},${g.scaleY}`)
        .join("|");
      signatures.add(sig);
    }

    expect(signatures.size).toBe(5);
  });

  it("10. 한국어·영어·일본어 의성어(콰광!·두근·스윽·번쩍·CRACK!·ドドン!)의 스크립트 판별과 유니코드 분해가 정확하다", () => {
    expect(detectSfxScript("콰광!")).toBe("ko");
    expect(detectSfxScript("CRACK!")).toBe("en");
    expect(detectSfxScript("ドドン!")).toBe("ja");
    expect(detectSfxScript("콰광CRACK!")).toBe("mixed");

    const crack = generateSfxVectorEnvelope("CRACK!", { envelopeId: "impact-burst" });
    expect(crack.script).toBe("en");
    expect(crack.glyphs.map((g) => g.char)).toEqual(["C", "R", "A", "C", "K", "!"]);
    expect(crack.glyphs[5]?.isExclamation).toBe(true);

    const dodon = generateSfxVectorEnvelope("ドドン!", { envelopeId: "comic-zoom" });
    expect(dodon.script).toBe("ja");
    expect(dodon.glyphs).toHaveLength(4);
  });

  it("11. 충격 폭발(impact-burst)은 볼록 아크 중앙 상승·방사 충격파 12가닥·굵은 이중 외곽선을 생성한다", () => {
    const res = generateSfxVectorEnvelope("콰과광!", { envelopeId: "impact-burst" });
    const first = res.glyphs[0];
    const mid = res.glyphs[1];
    const last = res.glyphs[res.glyphs.length - 1];

    expect(first).toBeDefined();
    expect(mid).toBeDefined();
    expect(last).toBeDefined();
    // SVG 좌표계에서 중앙이 위로 솟구치므로 y값이 양 끝보다 작다
    expect(mid?.y ?? 999).toBeLessThan(first?.y ?? 0);
    expect(res.accentPaths).toHaveLength(12);
    expect(res.outerStrokeWidthPx).toBeGreaterThan(res.innerStrokeWidthPx);
  });

  it("12. 금속 참격(metallic-slash)은 날카로운 전방 기울기(|shear| >= 18°)와 대각선 칼끝 테이퍼를 생성한다", () => {
    const res = generateSfxVectorEnvelope("스으윽!", { envelopeId: "metallic-slash" });
    const first = res.glyphs[0];
    const last = res.glyphs[res.glyphs.length - 1];

    expect(res.maxAbsShearDeg).toBeGreaterThanOrEqual(18);
    expect(first?.shearXDeg ?? 0).toBeLessThan(-18);
    // 좌하단→우상단 베기 궤적: 마지막 글자 y가 첫 글자보다 위(작음)
    expect(last?.y ?? 999).toBeLessThan(first?.y ?? 0);
    // 음수 기본 테이퍼(-0.48)로 칼끝이 날카롭게 좁아진다
    expect(last?.scaleY ?? 2).toBeLessThan(first?.scaleY ?? 0);
  });

  it("13. 원근 돌진 줌(comic-zoom)은 taperAmount 부호에 따라 좌→우 단조 원근 배율과 4점 워프 쿼드를 생성한다", () => {
    const zoomIn = generateSfxVectorEnvelope("번쩍!!", {
      envelopeId: "comic-zoom",
      taperAmount: 0.65,
    });
    expect(zoomIn.glyphs[zoomIn.glyphs.length - 1]?.scaleX ?? 0).toBeGreaterThan(zoomIn.glyphs[0]?.scaleX ?? 9);

    const zoomOut = generateSfxVectorEnvelope("번쩍!!", {
      envelopeId: "comic-zoom",
      taperAmount: -0.6,
    });
    expect(zoomOut.glyphs[0]?.scaleX ?? 0).toBeGreaterThan(zoomOut.glyphs[zoomOut.glyphs.length - 1]?.scaleX ?? 9);

    for (const g of zoomIn.glyphs) {
      expect(g.warpedQuad.topRight.x).toBeGreaterThan(g.warpedQuad.topLeft.x - 10);
      expect(g.warpedQuad.bottomLeft.y).toBeGreaterThan(g.warpedQuad.topLeft.y);
      expect(g.svgTransform).toContain("translate(");
      expect(g.svgTransform).toContain("skewX(");
      expect(g.svgTransform).toContain("scale(");
    }
  });

  it("14. 전율 속삭임(tremble-whisper)은 시드 결정론적 미세 떨림을, 부드러운 두근(soft-heartbeat)은 교대 맥박 펄스를 생성한다", () => {
    const runA = generateSfxVectorEnvelope("부들부들", { envelopeId: "tremble-whisper", seed: 77 });
    const runB = generateSfxVectorEnvelope("부들부들", { envelopeId: "tremble-whisper", seed: 77 });
    const runC = generateSfxVectorEnvelope("부들부들", { envelopeId: "tremble-whisper", seed: 99 });

    expect(runA).toEqual(runB);
    expect(runA.glyphs[0]?.jitterOffsetY).not.toBe(runC.glyphs[0]?.jitterOffsetY);

    const heart = generateSfxVectorEnvelope("두근두근", { envelopeId: "soft-heartbeat" });
    expect(heart.accentPaths).toHaveLength(4);
    expect(heart.glyphs[0]?.scaleY ?? 0).toBeGreaterThan(heart.glyphs[1]?.scaleY ?? 9);
    expect(heart.glyphs[2]?.scaleY ?? 0).toBeGreaterThan(heart.glyphs[3]?.scaleY ?? 9);
  });

  it("15. 이중 외곽선 SVG 경로(outerPath·innerPath·shadowPath)와 독립 SVG 마크업이 유효하며 원시 색상이 0건이다", () => {
    const res = generateSfxVectorEnvelope("콰광!", {
      envelopeId: "impact-burst",
      outerStrokeWidthPx: 11,
      innerStrokeWidthPx: 4,
    });

    for (const g of res.glyphs) {
      expect(g.glyphBoxPath.startsWith("M ")).toBe(true);
      expect(g.doubleStroke.outerPath.startsWith("M ")).toBe(true);
      expect(g.doubleStroke.innerPath.startsWith("M ")).toBe(true);
      expect(g.doubleStroke.shadowPath.startsWith("M ")).toBe(true);
      expect(g.doubleStroke.outerStrokeWidthPx).toBe(11);
      expect(g.doubleStroke.innerStrokeWidthPx).toBe(4);
    }

    expect(res.combinedOuterStrokePath.split("Z").length - 1).toBe(res.glyphs.length);
    expect(res.combinedInnerStrokePath.split("Z").length - 1).toBe(res.glyphs.length);
    expect(res.standaloneSvgMarkup.startsWith("<svg ")).toBe(true);
    expect(res.standaloneSvgMarkup).toContain("paint-order=\"stroke fill\"");
    expect(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/.test(res.standaloneSvgMarkup)).toBe(false);
  });

  it("16. 파라메트릭 옵션(arcIntensity·shearMultiplier·taperAmount·outerStrokeWidthPx) 변경이 즉시 지오메트리에 반영된다", () => {
    const flat = generateSfxVectorEnvelope("번쩍", {
      envelopeId: "impact-burst",
      arcIntensity: 0,
      shearMultiplier: 0,
      outerStrokeWidthPx: 3,
    });
    const dramatic = generateSfxVectorEnvelope("번쩍", {
      envelopeId: "impact-burst",
      arcIntensity: 0.9,
      shearMultiplier: 1.5,
      outerStrokeWidthPx: 12,
    });

    expect(flat.maxAbsShearDeg).toBe(0);
    expect(dramatic.maxAbsShearDeg).toBeGreaterThan(15);
    expect(dramatic.outerStrokeWidthPx).toBe(12);
    expect(dramatic.glyphs[0]?.y).not.toBe(flat.glyphs[0]?.y);
    expect(DEFAULT_BALLOON_PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(DEFAULT_SFX_PRESETS.length).toBeGreaterThanOrEqual(5);
  });

  it("17. StudioKoreanLetteringSfxPanel은 Props 없이 단독 렌더링되고 탭 1 광학 말풍선 SVG 프리뷰와 KPI를 표시한다", () => {
    render(<StudioKoreanLetteringSfxPanel />);

    expect(screen.getByTestId("korean-lettering-sfx-panel")).toBeTruthy();
    expect(screen.getByTestId("tab-balloon-typeset").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("balloon-svg-preview")).toBeTruthy();
    expect(screen.getByTestId("balloon-horizontal-lines")).toBeTruthy();
    expect(screen.getByTestId("kpi-orphan-status").textContent).toContain("0행");
    expect(screen.getByTestId("kpi-reading-time").textContent).toContain("s");
  });

  it("18. 탭 1 말풍선 5종 전환·세로쓰기(vertical-rl) 토글·대사 편집·너비 슬라이더·적용 콜백이 정상 동작한다", () => {
    const onBalloon = vi.fn();
    render(<StudioKoreanLetteringSfxPanel onBalloonTypeset={onBalloon} />);

    fireEvent.click(screen.getByTestId("balloon-shape-burst"));
    fireEvent.click(screen.getByTestId("balloon-shape-thought"));
    fireEvent.click(screen.getByTestId("writing-mode-vertical-rl"));

    expect(screen.getByTestId("balloon-vertical-columns")).toBeTruthy();
    expect(screen.getByTestId("balloon-columns-breakdown")).toBeTruthy();

    fireEvent.click(screen.getByTestId("writing-mode-horizontal-tb"));
    fireEvent.change(screen.getByTestId("balloon-dialogue-input"), {
      target: { value: "지금 바로 옥상으로 올라와! 시간이 없어." },
    });
    fireEvent.change(screen.getByTestId("balloon-width-slider"), { target: { value: "220" } });
    expect(screen.getByTestId("balloon-width-readout").textContent).toContain("220px");

    fireEvent.click(screen.getByTestId("btn-toggle-optical-guides"));
    expect(screen.queryByTestId("balloon-optical-guides")).toBeNull();

    fireEvent.click(screen.getByTestId("btn-apply-balloon-layout"));
    expect(screen.getByTestId("balloon-apply-status")).toBeTruthy();
    expect(onBalloon).toHaveBeenCalled();
  });

  it("19. 탭 2 감정 의성어(SFX) 프리셋·5종 엔벨로프·파라메트릭 슬라이더·워프 쿼드 토글·확정 콜백이 동작한다", () => {
    const onSfx = vi.fn();
    render(<StudioKoreanLetteringSfxPanel onSfxGenerated={onSfx} />);

    fireEvent.click(screen.getByTestId("tab-sfx-vector"));
    expect(screen.getByTestId("panel-sfx-vector")).toBeTruthy();
    expect(screen.getByTestId("sfx-svg-preview")).toBeTruthy();

    fireEvent.click(screen.getByTestId("sfx-preset-en-crack"));
    expect(screen.getByTestId("sfx-script-badge").textContent).toContain("영문");
    expect(screen.getByTestId("sfx-glyph-telemetry").children).toHaveLength(6);

    fireEvent.click(screen.getByTestId("sfx-envelope-metallic-slash"));
    fireEvent.change(screen.getByTestId("sfx-text-input"), { target: { value: "번쩍!" } });
    fireEvent.change(screen.getByTestId("sfx-taper-slider"), { target: { value: "60" } });
    fireEvent.change(screen.getByTestId("sfx-stroke-slider"), { target: { value: "12" } });

    expect(screen.getByTestId("sfx-taper-readout").textContent).toBe("60%");
    expect(screen.getByTestId("sfx-stroke-readout").textContent).toBe("12px");

    fireEvent.click(screen.getByTestId("btn-toggle-quad-guides"));
    expect(screen.getByTestId("sfx-quad-0")).toBeTruthy();

    fireEvent.click(screen.getByTestId("btn-generate-sfx-layer"));
    expect(screen.getByTestId("sfx-commit-status").textContent).toContain("벡터 경로");
    expect(onSfx).toHaveBeenCalled();
  });

  it("20. 영문 로케일(locale='en') 지원 및 모듈 5개 파일의 정적 위생·구조 규칙을 100% 통과한다", () => {
    render(<StudioKoreanLetteringSfxPanel initialTab="sfx-vector" locale="en" />);
    expect(screen.getByTestId("sfx-script-badge").textContent).toContain("Korean (KO)");
    expect(screen.getByTestId("btn-generate-sfx-layer").textContent).toContain("Commit SFX Vector Layer");

    const files = [
      "korean-balloon-typesetter.ts",
      "sfx-vector-path-generator.ts",
      "StudioKoreanLetteringSfxPanel.tsx",
      "index.ts",
      "korean-lettering-sfx-engine.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(content.split("\n").length, `${file} 800줄 제한 위반`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} 0x...n BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} 비공개 Map store 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioKoreanLetteringSfxPanel.tsx"), "utf8");
    expect(rawColorRe.test(panelSrc), "UI 패널은 원시 hex/rgb/hsl 색상을 포함할 수 없다").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioKoreanLetteringSfxPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
