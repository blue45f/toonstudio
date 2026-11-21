import { describe, expect, it } from "vitest";

import {
  applyHomographyPoint,
  computeHomographyMatrix,
  decodeWorksheetQrPayload,
  encodeWorksheetQrPayload,
  generateQrStoryboardWorksheetLayout,
  normalizePaperLineArt,
  rectifyAndSliceWorksheetImage,
  renderWorksheetVectorPdfBytes,
  type GrayscaleImageBuffer,
  type Point2D,
} from "./studio-qr-worksheet-roundtrip";

describe("studio-qr-worksheet-roundtrip", () => {
  it("워크시트 QR 페이로드의 체크섬 서명 인코딩·디코딩과 변조 탐지가 정확하다", () => {
    const encoded = encodeWorksheetQrPayload({
      projectId: "proj-starlight",
      episodeId: "ep-01",
      pageIndex: 2,
      layoutPreset: "a4-webtoon-vertical",
      cutIds: ["cut-01", "cut-02", "cut-03", "cut-04"],
    });
    expect(encoded.encoded.startsWith("TSWS1:")).toBe(true);

    const decoded = decodeWorksheetQrPayload(encoded.encoded);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.payload.cutIds).toEqual(["cut-01", "cut-02", "cut-03", "cut-04"]);
    }

    const tampered = encoded.encoded.replace("cut-04", "cut-99");
    const failed = decodeWorksheetQrPayload(tampered);
    expect(failed.ok).toBe(false);
  });

  it("A4 세로 웹툰 및 가로 16:9 워크시트 SVG와 유효한 PDF 1.4 벡터 바이트를 생성한다", () => {
    const bp = generateQrStoryboardWorksheetLayout({
      projectId: "proj-starlight",
      episodeId: "ep-01",
      pageIndex: 0,
      layoutPreset: "a4-animatic-16x9",
      cuts: [
        { cutId: "cut-01", shotLabel: "S1-01 광장", dialogueHint: "여기서 기다렸다." },
        { cutId: "cut-02", shotLabel: "S1-02 클로즈업" },
        { cutId: "cut-03", shotLabel: "S1-03 역광" },
      ],
    });

    expect(bp.pageWidthMm).toBe(297);
    expect(bp.pageHeightMm).toBe(210);
    expect(bp.fiducials).toHaveLength(4);
    expect(bp.slots).toHaveLength(3);
    expect(bp.printableSvg).toContain('data-fiducial="top-left"');
    expect(bp.printableSvg).toContain('data-cut-id="cut-01"');

    const pdfBytes = renderWorksheetVectorPdfBytes(bp);
    const pdfText = new TextDecoder().decode(pdfBytes);
    expect(pdfText.startsWith("%PDF-1.4")).toBe(true);
    expect(pdfText).toContain("/MediaBox");
    expect(pdfText.trim().endsWith("%%EOF")).toBe(true);
  });

  it("3×3 사영 호모그래피 솔버가 기울어진 사변형 4점을 정확히 역투영하고 퇴화 사변형을 거부한다", () => {
    const src: readonly [Point2D, Point2D, Point2D, Point2D] = [
      { x: 40, y: 30 },
      { x: 360, y: 55 },
      { x: 390, y: 290 },
      { x: 15, y: 265 },
    ];
    const dst: readonly [Point2D, Point2D, Point2D, Point2D] = [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ];

    const solved = computeHomographyMatrix(src, dst);
    expect(solved.ok).toBe(true);
    for (let i = 0; i < 4; i += 1) {
      const mapped = applyHomographyPoint(solved.matrix, src[i]!);
      expect(mapped.x).toBeCloseTo(dst[i]!.x, 3);
      expect(mapped.y).toBeCloseTo(dst[i]!.y, 3);
      const restored = applyHomographyPoint(solved.inverseMatrix, mapped);
      expect(restored.x).toBeCloseTo(src[i]!.x, 3);
      expect(restored.y).toBeCloseTo(src[i]!.y, 3);
    }

    // 일직선상 4점(면적 0)은 오류로 안전 거부
    const degenerate = computeHomographyMatrix(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
      dst,
    );
    expect(degenerate.ok).toBe(false);
  });

  it("원근 왜곡된 촬영 이미지에서 컷별 손그림 선화를 자동 보정·슬라이스해 비파괴 초안으로 매칭한다", () => {
    const bp = generateQrStoryboardWorksheetLayout({
      projectId: "proj-roundtrip",
      episodeId: "ep-02",
      pageIndex: 0,
      layoutPreset: "a4-webtoon-vertical",
      cuts: [
        { cutId: "cut-a" },
        { cutId: "cut-b" },
      ],
    });

    // 정본 평면(210x297 픽셀)에 cut-a에만 진한 연필 십자선을 그리고, cut-b는 빈 종이로 둔 뒤
    // 사영 변환(원근 기울임)을 적용한 가상 스마트폰 촬영본을 합성한다.
    const canonW = 210;
    const canonH = 297;
    const canon = new Uint8ClampedArray(canonW * canonH).fill(222); // 약간 어두운 종이 배경
    const slotA = bp.slots[0]!;
    const aCx = Math.floor((slotA.normalizedDrawBox.u + slotA.normalizedDrawBox.width * 0.5) * canonW);
    const aCy = Math.floor((slotA.normalizedDrawBox.v + slotA.normalizedDrawBox.height * 0.5) * canonH);
    for (let dy = -12; dy <= 12; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        canon[(aCy + dy) * canonW + (aCx + dx)] = 35;
        canon[(aCy + dx) * canonW + (aCx + dy)] = 35;
      }
    }

    const canonQuad: readonly [Point2D, Point2D, Point2D, Point2D] = [
      { x: bp.fiducials[0]!.centerMm.x, y: bp.fiducials[0]!.centerMm.y },
      { x: bp.fiducials[1]!.centerMm.x, y: bp.fiducials[1]!.centerMm.y },
      { x: bp.fiducials[2]!.centerMm.x, y: bp.fiducials[2]!.centerMm.y },
      { x: bp.fiducials[3]!.centerMm.x, y: bp.fiducials[3]!.centerMm.y },
    ];
    const photoQuad: readonly [Point2D, Point2D, Point2D, Point2D] = [
      { x: 26, y: 20 },
      { x: 230, y: 30 },
      { x: 245, y: 315 },
      { x: 14, y: 305 },
    ];
    const forward = computeHomographyMatrix(canonQuad, photoQuad);
    expect(forward.ok).toBe(true);

    const photoW = 260;
    const photoH = 340;
    const photoData = new Uint8ClampedArray(photoW * photoH).fill(222);
    for (let py = 0; py < photoH; py += 1) {
      for (let px = 0; px < photoW; px += 1) {
        const cPt = applyHomographyPoint(forward.inverseMatrix, { x: px, y: py });
        const cx = Math.round(cPt.x);
        const cy = Math.round(cPt.y);
        if (cx >= 0 && cy >= 0 && cx < canonW && cy < canonH) {
          photoData[py * photoW + px] = canon[cy * canonW + cx]!;
        }
      }
    }
    const photo: GrayscaleImageBuffer = {
      width: photoW,
      height: photoH,
      channels: 1,
      data: photoData,
    };

    const plan = rectifyAndSliceWorksheetImage({
      photo,
      detectedQuad: {
        topLeft: photoQuad[0],
        topRight: photoQuad[1],
        bottomRight: photoQuad[2],
        bottomLeft: photoQuad[3],
      },
      blueprint: bp,
      rectifiedWidth: 210,
    });

    expect(plan.ok).toBe(true);
    expect(plan.cuts).toHaveLength(2);
    expect(plan.cuts[0]?.cutId).toBe("cut-a");
    expect(plan.cuts[0]?.targetLayerName).toBe("rough-conti");
    expect(plan.cuts[0]?.commitMode).toBe("non-destructive-rough-conti-layer");
    // cut-a에는 연필선이 검출되고 빈 cut-b에는 선화가 거의 없어야 한다.
    expect(plan.cuts[0]!.inkCoverageRatio).toBeGreaterThan(0.015);
    expect(plan.cuts[1]!.inkCoverageRatio).toBeLessThan(0.005);

    const samplePaper = new Uint8ClampedArray([215, 220, 218, 221, 30, 219, 220, 218]);
    const cleaned = normalizePaperLineArt(samplePaper);
    expect(cleaned.normalized[0]).toBe(255);
    expect(cleaned.normalized[4]).toBeLessThan(80);
  });
});
