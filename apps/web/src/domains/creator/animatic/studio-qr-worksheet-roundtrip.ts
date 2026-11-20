/**
 * Wonder Unit Storyboarder형 종이 콘티 QR·4코너 피듀셜 워크시트 레이아웃 생성,
 * 3×3 호모그래피 원근 보정 및 컷 자동 슬라이스 왕복 엔진.
 *
 * - A4 세로 웹툰(4/6컷) 또는 A4 가로 16:9 애니매틱(6컷) 인쇄용 벡터 워크시트(SVG + 최소 벡터 PDF 1.4 바이트)와
 *   체크섬 서명된 QR 메타데이터 페이로드를 생성한다.
 * - 스마트폰 촬영본의 4코너 피듀셜 좌표로부터 정확한 8-미지수 DLT 3×3 호모그래피를 풀고,
 *   역투영 쌍선형 샘플링으로 원근을 완전히 편 뒤 각 패널을 자동 크롭·종이 배경 정규화한다.
 * - 추출된 손그림 컷은 기존 원고를 덮어쓰지 않고 각 `cutId`의 `rough-conti` 비파괴 레이어 초안으로 매칭한다.
 */

export type WorksheetLayoutPreset = "a4-webtoon-vertical" | "a4-animatic-16x9";
export type CornerFiducialId = "top-left" | "top-right" | "bottom-right" | "bottom-left";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface RectMm {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedRect {
  readonly u: number;
  readonly v: number;
  readonly width: number;
  readonly height: number;
}

export interface FiducialMarkerSpec {
  readonly id: CornerFiducialId;
  readonly centerMm: Point2D;
  readonly sizeMm: number;
  readonly normalizedCenter: Point2D;
}

export interface WorksheetPanelSlot {
  readonly slotIndex: number;
  readonly cutId: string;
  readonly shotLabel: string;
  readonly dialogueHint: string;
  readonly drawBoxMm: RectMm;
  readonly notesBoxMm: RectMm;
  readonly normalizedDrawBox: NormalizedRect;
}

export interface WorksheetQrPayload {
  readonly v: 1;
  readonly projectId: string;
  readonly episodeId: string;
  readonly pageIndex: number;
  readonly layoutPreset: WorksheetLayoutPreset;
  readonly cutIds: readonly string[];
  readonly checksum: string;
}

export interface QrStoryboardWorksheetBlueprint {
  readonly layoutPreset: WorksheetLayoutPreset;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
  readonly fiducials: readonly FiducialMarkerSpec[];
  readonly qrBoxMm: RectMm;
  readonly qrPayload: WorksheetQrPayload;
  readonly qrEncodedText: string;
  readonly slots: readonly WorksheetPanelSlot[];
  readonly printableSvg: string;
}

export interface GrayscaleImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 4;
  readonly data: Uint8ClampedArray;
}

export interface DetectedFiducialQuad {
  readonly topLeft: Point2D;
  readonly topRight: Point2D;
  readonly bottomRight: Point2D;
  readonly bottomLeft: Point2D;
}

export interface HomographySolveResult {
  readonly ok: boolean;
  readonly matrix: readonly number[];
  readonly inverseMatrix: readonly number[];
  readonly errorKo: string | null;
}

export interface SlicedWorksheetCutResult {
  readonly cutId: string;
  readonly slotIndex: number;
  readonly targetLayerName: "rough-conti";
  readonly commitMode: "non-destructive-rough-conti-layer";
  readonly width: number;
  readonly height: number;
  readonly grayscalePixels: Uint8ClampedArray;
  readonly inkCoverageRatio: number;
}

export interface WorksheetRoundtripPlan {
  readonly ok: boolean;
  readonly errorKo: string | null;
  readonly projectId: string;
  readonly episodeId: string;
  readonly pageIndex: number;
  readonly rectifiedWidth: number;
  readonly rectifiedHeight: number;
  readonly cuts: readonly SlicedWorksheetCutResult[];
}

const FIDUCIAL_MARGIN_MM = 12;
const FIDUCIAL_SIZE_MM = 8;

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function payloadChecksum(input: Omit<WorksheetQrPayload, "checksum">): string {
  const canonical = `${input.v}|${input.projectId}|${input.episodeId}|${input.pageIndex}|${input.layoutPreset}|${input.cutIds.join(",")}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function encodeWorksheetQrPayload(
  input: Omit<WorksheetQrPayload, "v" | "checksum">,
): { readonly payload: WorksheetQrPayload; readonly encoded: string } {
  const base = {
    v: 1 as const,
    projectId: input.projectId.trim(),
    episodeId: input.episodeId.trim(),
    pageIndex: Math.max(0, Math.trunc(input.pageIndex)),
    layoutPreset: input.layoutPreset,
    cutIds: Object.freeze(input.cutIds.map((id) => id.trim()).filter(Boolean)),
  };
  const payload: WorksheetQrPayload = Object.freeze({ ...base, checksum: payloadChecksum(base) });
  return Object.freeze({ payload, encoded: `TSWS1:${JSON.stringify(payload)}` });
}

export function decodeWorksheetQrPayload(
  encodedText: string,
): { readonly ok: true; readonly payload: WorksheetQrPayload } | { readonly ok: false; readonly errorKo: string } {
  const trimmed = encodedText.trim();
  if (!trimmed.startsWith("TSWS1:")) {
    return { ok: false, errorKo: "ToonStudio 워크시트 QR 접두사가 아닙니다." };
  }
  try {
    const parsed = JSON.parse(trimmed.slice(6)) as Partial<WorksheetQrPayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.projectId !== "string" ||
      typeof parsed.episodeId !== "string" ||
      typeof parsed.pageIndex !== "number" ||
      (parsed.layoutPreset !== "a4-webtoon-vertical" && parsed.layoutPreset !== "a4-animatic-16x9") ||
      !Array.isArray(parsed.cutIds) ||
      typeof parsed.checksum !== "string"
    ) {
      return { ok: false, errorKo: "워크시트 QR 메타데이터 구조가 유효하지 않습니다." };
    }
    const expected = payloadChecksum({
      v: 1,
      projectId: parsed.projectId,
      episodeId: parsed.episodeId,
      pageIndex: parsed.pageIndex,
      layoutPreset: parsed.layoutPreset,
      cutIds: parsed.cutIds,
    });
    if (expected !== parsed.checksum) {
      return { ok: false, errorKo: "워크시트 QR 체크섬이 일치하지 않아 손상된 코드로 판정했습니다." };
    }
    return {
      ok: true,
      payload: Object.freeze({
        v: 1,
        projectId: parsed.projectId,
        episodeId: parsed.episodeId,
        pageIndex: parsed.pageIndex,
        layoutPreset: parsed.layoutPreset,
        cutIds: Object.freeze([...parsed.cutIds]),
        checksum: parsed.checksum,
      }),
    };
  } catch {
    return { ok: false, errorKo: "워크시트 QR JSON 본문을 해독할 수 없습니다." };
  }
}

/** 종이 콘티용 QR·4코너 피듀셜 워크시트 레이아웃 및 인쇄용 벡터 SVG를 생성한다. */
export function generateQrStoryboardWorksheetLayout(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly pageIndex: number;
  readonly layoutPreset: WorksheetLayoutPreset;
  readonly cuts: readonly { readonly cutId: string; readonly shotLabel?: string; readonly dialogueHint?: string }[];
}): QrStoryboardWorksheetBlueprint {
  const isVertical = input.layoutPreset === "a4-webtoon-vertical";
  const pageWidthMm = isVertical ? 210 : 297;
  const pageHeightMm = isVertical ? 297 : 210;
  const activeCuts = input.cuts.slice(0, 6);

  const makeFid = (id: CornerFiducialId, x: number, y: number): FiducialMarkerSpec =>
    Object.freeze({
      id,
      centerMm: { x, y },
      sizeMm: FIDUCIAL_SIZE_MM,
      normalizedCenter: { x: round3(x / pageWidthMm), y: round3(y / pageHeightMm) },
    });

  const fiducials: readonly FiducialMarkerSpec[] = Object.freeze([
    makeFid("top-left", FIDUCIAL_MARGIN_MM, FIDUCIAL_MARGIN_MM),
    makeFid("top-right", pageWidthMm - FIDUCIAL_MARGIN_MM, FIDUCIAL_MARGIN_MM),
    makeFid("bottom-right", pageWidthMm - FIDUCIAL_MARGIN_MM, pageHeightMm - FIDUCIAL_MARGIN_MM),
    makeFid("bottom-left", FIDUCIAL_MARGIN_MM, pageHeightMm - FIDUCIAL_MARGIN_MM),
  ]);

  const qrBoxMm: RectMm = Object.freeze({ x: pageWidthMm - 42, y: 10, width: 22, height: 22 });
  const { payload: qrPayload, encoded: qrEncodedText } = encodeWorksheetQrPayload({
    projectId: input.projectId,
    episodeId: input.episodeId,
    pageIndex: input.pageIndex,
    layoutPreset: input.layoutPreset,
    cutIds: activeCuts.map((c) => c.cutId),
  });

  const cols = isVertical ? 2 : 3;
  const rows = isVertical ? Math.max(2, Math.ceil(Math.max(1, activeCuts.length) / 2)) : 2;
  const contentLeft = 20;
  const contentTop = 36;
  const cellW = (pageWidthMm - 40 - 8 * (cols - 1)) / cols;
  const cellH = (pageHeightMm - 54 - 8 * (rows - 1)) / rows;

  const slots: WorksheetPanelSlot[] = activeCuts.map((cut, slotIndex) => {
    const cellX = contentLeft + (slotIndex % cols) * (cellW + 8);
    const cellY = contentTop + Math.floor(slotIndex / cols) * (cellH + 8);
    const drawH = isVertical ? cellH * 0.78 : Math.min(cellH * 0.72, (cellW * 9) / 16);
    const drawBoxMm: RectMm = Object.freeze({
      x: round3(cellX),
      y: round3(cellY),
      width: round3(cellW),
      height: round3(drawH),
    });
    const notesBoxMm: RectMm = Object.freeze({
      x: round3(cellX),
      y: round3(cellY + drawH + 2),
      width: round3(cellW),
      height: round3(Math.max(8, cellH - drawH - 2)),
    });
    const normalizedDrawBox: NormalizedRect = Object.freeze({
      u: round3(drawBoxMm.x / pageWidthMm),
      v: round3(drawBoxMm.y / pageHeightMm),
      width: round3(drawBoxMm.width / pageWidthMm),
      height: round3(drawBoxMm.height / pageHeightMm),
    });
    return Object.freeze({
      slotIndex,
      cutId: cut.cutId,
      shotLabel: cut.shotLabel?.trim() || `CUT ${slotIndex + 1}`,
      dialogueHint: (cut.dialogueHint ?? "").trim(),
      drawBoxMm,
      notesBoxMm,
      normalizedDrawBox,
    });
  });

  const inkToken = "oklch(0.18 0.01 260)";
  const guideToken = "oklch(0.68 0.01 260)";
  const paperToken = "oklch(0.99 0 0)";
  const svgLines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidthMm} ${pageHeightMm}" width="${pageWidthMm}mm" height="${pageHeightMm}mm">`,
    `  <rect x="0" y="0" width="${pageWidthMm}" height="${pageHeightMm}" fill="${paperToken}" />`,
  ];
  for (const fid of fiducials) {
    const half = fid.sizeMm / 2;
    svgLines.push(
      `  <rect data-fiducial="${fid.id}" x="${round3(fid.centerMm.x - half)}" y="${round3(fid.centerMm.y - half)}" width="${fid.sizeMm}" height="${fid.sizeMm}" fill="${inkToken}" />`,
    );
  }
  svgLines.push(
    `  <rect data-qr-box="true" x="${qrBoxMm.x}" y="${qrBoxMm.y}" width="${qrBoxMm.width}" height="${qrBoxMm.height}" fill="none" stroke="${inkToken}" stroke-width="0.6" />`,
    `  <text x="24" y="22" font-size="4.2" fill="${inkToken}">${escapeXml(input.projectId)} / ${escapeXml(input.episodeId)} / P.${input.pageIndex + 1}</text>`,
  );
  for (const slot of slots) {
    svgLines.push(
      `  <rect data-cut-id="${escapeXml(slot.cutId)}" x="${slot.drawBoxMm.x}" y="${slot.drawBoxMm.y}" width="${slot.drawBoxMm.width}" height="${slot.drawBoxMm.height}" fill="none" stroke="${inkToken}" stroke-width="0.5" />`,
      `  <rect x="${slot.notesBoxMm.x}" y="${slot.notesBoxMm.y}" width="${slot.notesBoxMm.width}" height="${slot.notesBoxMm.height}" fill="none" stroke="${guideToken}" stroke-width="0.3" />`,
      `  <text x="${round3(slot.notesBoxMm.x + 1.5)}" y="${round3(slot.notesBoxMm.y + 4)}" font-size="3" fill="${inkToken}">${escapeXml(slot.shotLabel)}</text>`,
    );
  }
  svgLines.push("</svg>");

  return Object.freeze({
    layoutPreset: input.layoutPreset,
    pageWidthMm,
    pageHeightMm,
    fiducials,
    qrBoxMm,
    qrPayload,
    qrEncodedText,
    slots: Object.freeze(slots),
    printableSvg: svgLines.join("\n"),
  });
}

/** 워크시트 청사진을 인쇄 가능한 최소 단일 페이지 PDF 1.4 벡터 바이트로 생성한다. */
export function renderWorksheetVectorPdfBytes(blueprint: QrStoryboardWorksheetBlueprint): Uint8Array {
  const mmToPt = 72 / 25.4;
  const wPt = round3(blueprint.pageWidthMm * mmToPt);
  const hPt = round3(blueprint.pageHeightMm * mmToPt);
  const ops: string[] = ["0 0 0 RG 0 0 0 rg 0.8 w"];

  for (const fid of blueprint.fiducials) {
    const s = round3(fid.sizeMm * mmToPt);
    const x = round3((fid.centerMm.x - fid.sizeMm / 2) * mmToPt);
    const y = round3(hPt - (fid.centerMm.y + fid.sizeMm / 2) * mmToPt);
    ops.push(`${x} ${y} ${s} ${s} re f`);
  }
  ops.push(
    `${round3(blueprint.qrBoxMm.x * mmToPt)} ${round3(hPt - (blueprint.qrBoxMm.y + blueprint.qrBoxMm.height) * mmToPt)} ${round3(blueprint.qrBoxMm.width * mmToPt)} ${round3(blueprint.qrBoxMm.height * mmToPt)} re S`,
  );
  for (const slot of blueprint.slots) {
    ops.push(
      `${round3(slot.drawBoxMm.x * mmToPt)} ${round3(hPt - (slot.drawBoxMm.y + slot.drawBoxMm.height) * mmToPt)} ${round3(slot.drawBoxMm.width * mmToPt)} ${round3(slot.drawBoxMm.height * mmToPt)} re S`,
    );
  }

  const streamContent = ops.join("\n");
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] /Contents 4 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];
  const offsets: number[] = [0];
  let body = "%PDF-1.4\n";
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]!).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

function solveLinear8x8(matrix: number[][], rhs: number[]): number[] | null {
  const n = 8;
  const aug = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let maxAbs = Math.abs(aug[col]![col]!);
    for (let r = col + 1; r < n; r += 1) {
      const val = Math.abs(aug[r]![col]!);
      if (val > maxAbs) {
        maxAbs = val;
        pivotRow = r;
      }
    }
    if (maxAbs < 1e-10) return null;
    if (pivotRow !== col) {
      const tmp = aug[col]!;
      aug[col] = aug[pivotRow]!;
      aug[pivotRow] = tmp;
    }
    const pivotVal = aug[col]![col]!;
    for (let c = col; c <= n; c += 1) aug[col]![c] = aug[col]![c]! / pivotVal;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r]![col]!;
      if (Math.abs(factor) < 1e-14) continue;
      for (let c = col; c <= n; c += 1) aug[r]![c] = aug[r]![c]! - factor * aug[col]![c]!;
    }
  }
  return aug.map((row) => row[n]!);
}

export function invertHomography3x3(h: readonly number[]): readonly number[] | null {
  if (h.length !== 9) return null;
  const [a, b, c, d, e, f, g, h7, i] = h as [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h7) - b * (d * i - f * g) + c * (d * h7 - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  return Object.freeze([
    (e * i - f * h7) * inv, (c * h7 - b * i) * inv, (b * f - c * e) * inv,
    (f * g - d * i) * inv, (a * i - c * g) * inv, (c * d - a * f) * inv,
    (d * h7 - e * g) * inv, (b * g - a * h7) * inv, (a * e - b * d) * inv,
  ]);
}

export function applyHomographyPoint(h: readonly number[], pt: Point2D): Point2D {
  const denom = h[6]! * pt.x + h[7]! * pt.y + h[8]!;
  if (Math.abs(denom) < 1e-10) return { x: Number.NaN, y: Number.NaN };
  return { x: (h[0]! * pt.x + h[1]! * pt.y + h[2]!) / denom, y: (h[3]! * pt.x + h[4]! * pt.y + h[5]!) / denom };
}

function quadSignedArea(pts: readonly Point2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area * 0.5;
}

/** 4개 대응점 쌍(원본 -> 목표)으로부터 정확한 3×3 사영 호모그래피와 역행렬을 계산한다. */
export function computeHomographyMatrix(
  srcPoints: readonly [Point2D, Point2D, Point2D, Point2D],
  dstPoints: readonly [Point2D, Point2D, Point2D, Point2D],
): HomographySolveResult {
  if (Math.abs(quadSignedArea(srcPoints)) < 1 || Math.abs(quadSignedArea(dstPoints)) < 1) {
    return Object.freeze({
      ok: false,
      matrix: Object.freeze([]),
      inverseMatrix: Object.freeze([]),
      errorKo: "네 코너 피듀셜이 일직선상에 있거나 면적이 너무 작아 원근 보정을 풀 수 없습니다.",
    });
  }
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const s = srcPoints[i]!;
    const d = dstPoints[i]!;
    rows.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);
    rhs.push(d.x);
    rows.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);
    rhs.push(d.y);
  }
  const solution = solveLinear8x8(rows, rhs);
  const matrix = solution ? Object.freeze([...solution, 1]) : null;
  const inverseMatrix = matrix ? invertHomography3x3(matrix) : null;
  if (!matrix || !inverseMatrix) {
    return Object.freeze({
      ok: false,
      matrix: Object.freeze([]),
      inverseMatrix: Object.freeze([]),
      errorKo: "특이 행렬로 인해 호모그래피 역투영을 계산할 수 없습니다.",
    });
  }
  return Object.freeze({ ok: true, matrix, inverseMatrix, errorKo: null });
}

function sampleGrayscaleBilinear(img: GrayscaleImageBuffer, x: number, y: number): number {
  if (x < 0 || y < 0 || x > img.width - 1 || y > img.height - 1) return 255;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(img.width - 1, x0 + 1);
  const y1 = Math.min(img.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const luma = (px: number, py: number): number => {
    const idx = (py * img.width + px) * img.channels;
    if (img.channels === 1) return img.data[idx] ?? 255;
    return 0.299 * (img.data[idx] ?? 255) + 0.587 * (img.data[idx + 1] ?? 255) + 0.114 * (img.data[idx + 2] ?? 255);
  };
  const top = luma(x0, y0) + (luma(x1, y0) - luma(x0, y0)) * fx;
  const bot = luma(x0, y1) + (luma(x1, y1) - luma(x0, y1)) * fx;
  return top + (bot - top) * fy;
}

/** 종이 배경 음영을 제거하고 연필 선화 대비를 끌어올린다(빈 종이 오탐 방지 포함). */
export function normalizePaperLineArt(pixels: Uint8ClampedArray): {
  readonly normalized: Uint8ClampedArray;
  readonly inkCoverageRatio: number;
} {
  const hist = new Uint32Array(256);
  for (let i = 0; i < pixels.length; i += 1) {
    hist[pixels[i]!] = (hist[pixels[i]!] ?? 0) + 1;
  }
  const total = Math.max(1, pixels.length);
  let acc = 0;
  let p03 = 0;
  let p90 = 255;
  let foundLow = false;
  let foundHigh = false;
  for (let v = 0; v < 256; v += 1) {
    acc += hist[v] ?? 0;
    const ratio = acc / total;
    if (!foundLow && ratio >= 0.02) {
      p03 = v;
      foundLow = true;
    }
    if (!foundHigh && ratio >= 0.88) {
      p90 = v;
      foundHigh = true;
    }
  }

  // 균일한 밝은 빈 종이(대비 폭 < 18, 밝기 >= 140)는 순백으로 정리해 잉크 오탐을 막는다.
  if (p90 - p03 < 18 && p90 >= 140) {
    return Object.freeze({
      normalized: new Uint8ClampedArray(pixels.length).fill(255),
      inkCoverageRatio: 0,
    });
  }

  const whitePoint = Math.max(120, p90);
  const blackPoint = Math.min(p03, whitePoint - 24);
  const span = Math.max(24, whitePoint - blackPoint);
  const normalized = new Uint8ClampedArray(pixels.length);
  let darkPixels = 0;
  for (let i = 0; i < pixels.length; i += 1) {
    const stretched = ((pixels[i]! - blackPoint) / span) * 255;
    const out = stretched >= 232 ? 255 : clampByte(stretched);
    normalized[i] = out;
    if (out < 165) darkPixels += 1;
  }
  return Object.freeze({
    normalized,
    inkCoverageRatio: round3(darkPixels / total),
  });
}

/** 촬영 이미지에서 4코너 호모그래피 원근 보정 후 각 컷 영역을 자동 슬라이스·정규화한다. */
export function rectifyAndSliceWorksheetImage(input: {
  readonly photo: GrayscaleImageBuffer;
  readonly detectedQuad: DetectedFiducialQuad;
  readonly blueprint: QrStoryboardWorksheetBlueprint;
  readonly rectifiedWidth?: number;
}): WorksheetRoundtripPlan {
  const rectifiedWidth = Math.max(120, Math.min(2400, Math.round(input.rectifiedWidth ?? 600)));
  const rectifiedHeight = Math.round(
    (rectifiedWidth * input.blueprint.pageHeightMm) / input.blueprint.pageWidthMm,
  );
  const fids = input.blueprint.fiducials;
  const dstQuad: readonly [Point2D, Point2D, Point2D, Point2D] = [
    { x: fids[0]!.normalizedCenter.x * rectifiedWidth, y: fids[0]!.normalizedCenter.y * rectifiedHeight },
    { x: fids[1]!.normalizedCenter.x * rectifiedWidth, y: fids[1]!.normalizedCenter.y * rectifiedHeight },
    { x: fids[2]!.normalizedCenter.x * rectifiedWidth, y: fids[2]!.normalizedCenter.y * rectifiedHeight },
    { x: fids[3]!.normalizedCenter.x * rectifiedWidth, y: fids[3]!.normalizedCenter.y * rectifiedHeight },
  ];
  const srcQuad: readonly [Point2D, Point2D, Point2D, Point2D] = [
    input.detectedQuad.topLeft,
    input.detectedQuad.topRight,
    input.detectedQuad.bottomRight,
    input.detectedQuad.bottomLeft,
  ];

  const solved = computeHomographyMatrix(srcQuad, dstQuad);
  if (!solved.ok) {
    return Object.freeze({
      ok: false,
      errorKo: solved.errorKo,
      projectId: input.blueprint.qrPayload.projectId,
      episodeId: input.blueprint.qrPayload.episodeId,
      pageIndex: input.blueprint.qrPayload.pageIndex,
      rectifiedWidth,
      rectifiedHeight,
      cuts: Object.freeze([]),
    });
  }

  const invH = solved.inverseMatrix;
  const cuts: SlicedWorksheetCutResult[] = [];
  for (const slot of input.blueprint.slots) {
    const startX = Math.max(0, Math.floor(slot.normalizedDrawBox.u * rectifiedWidth));
    const startY = Math.max(0, Math.floor(slot.normalizedDrawBox.v * rectifiedHeight));
    const cutW = Math.max(1, Math.floor(slot.normalizedDrawBox.width * rectifiedWidth));
    const cutH = Math.max(1, Math.floor(slot.normalizedDrawBox.height * rectifiedHeight));
    const rawCut = new Uint8ClampedArray(cutW * cutH);

    for (let cy = 0; cy < cutH; cy += 1) {
      for (let cx = 0; cx < cutW; cx += 1) {
        const srcPt = applyHomographyPoint(invH, { x: startX + cx, y: startY + cy });
        rawCut[cy * cutW + cx] = clampByte(sampleGrayscaleBilinear(input.photo, srcPt.x, srcPt.y));
      }
    }
    const { normalized, inkCoverageRatio } = normalizePaperLineArt(rawCut);
    cuts.push(
      Object.freeze({
        cutId: slot.cutId,
        slotIndex: slot.slotIndex,
        targetLayerName: "rough-conti",
        commitMode: "non-destructive-rough-conti-layer",
        width: cutW,
        height: cutH,
        grayscalePixels: normalized,
        inkCoverageRatio,
      }),
    );
  }

  return Object.freeze({
    ok: true,
    errorKo: null,
    projectId: input.blueprint.qrPayload.projectId,
    episodeId: input.blueprint.qrPayload.episodeId,
    pageIndex: input.blueprint.qrPayload.pageIndex,
    rectifiedWidth,
    rectifiedHeight,
    cuts: Object.freeze(cuts),
  });
}
