/**
 * 규격 슬라이스 내보내기 공용 헬퍼 — studio-export-presets.ts와 studio-export-preset-resume.ts 간
 * 순환 의존성 제거용 리프 모듈.
 */
import {
  applyAntiAiNoisePattern,
  generateWatermarkTilePositions,
  shouldDrawWatermark,
  watermarkPlacement,
  type WatermarkSettings,
} from "../studio-watermark";

export type ExportFormat = "png" | "jpg" | "webp";

export interface StripSlice {
  index: number;
  y: number;
  height: number;
}

/** 가상 스트립(규격 폭 기준) 안에서 페이지 하나가 차지하는 세로 구간. */
export interface PresetPageLayout {
  /** 스트립 안 시작 y(타깃 px). */
  y: number;
  /** 규격 폭으로 리샘플된 페이지 높이(px). */
  height: number;
  /** 캡처 원본 폭(px) — drawImage 소스 좌표 환산용. */
  sourceWidth: number;
  /** 캡처 원본 높이(px). */
  sourceHeight: number;
}

/** 슬라이스 캔버스에 그릴 페이지 조각 — 원본(src)·슬라이스(dest) 좌표 쌍. */
export interface SliceDrawOp {
  pageIndex: number;
  /** 원본 페이지 캔버스 안 시작 y(px). */
  srcY: number;
  /** 원본에서 가져올 높이(px). */
  srcHeight: number;
  /** 슬라이스 캔버스 안 시작 y(px). */
  destY: number;
  /** 슬라이스에 그릴 높이(px). */
  destHeight: number;
}

/**
 * 슬라이스 하나와 겹치는 페이지 구간들을 그리기 좌표로 변환(순수).
 * 원본 좌표는 리샘플 비율(sourceHeight/height)로 환산하며 소수를 허용한다
 * (drawImage가 서브픽셀 보간). 겹치지 않는 페이지는 결과에서 빠진다.
 */
export function planSliceDrawOps(slice: StripSlice, pages: PresetPageLayout[]): SliceDrawOp[] {
  const ops: SliceDrawOp[] = [];
  const sliceTop = slice.y;
  const sliceBottom = slice.y + slice.height;
  pages.forEach((page, pageIndex) => {
    const top = Math.max(sliceTop, page.y);
    const bottom = Math.min(sliceBottom, page.y + page.height);
    if (bottom <= top) return;
    const ratio = page.sourceHeight / page.height;
    ops.push({
      pageIndex,
      srcY: (top - page.y) * ratio,
      srcHeight: (bottom - top) * ratio,
      destY: top - sliceTop,
      destHeight: bottom - top,
    });
  });
  return ops;
}

/** 규격 슬라이스 파일명 — `<제목>-<프리셋id>.<확장자>`, 여러 장이면 `-1of3` 접미사. */
export function presetSliceFileName(
  title: string,
  presetId: string,
  format: ExportFormat,
  part: { index: number; total: number }
): string {
  const suffix = part.total > 1 ? `-${part.index + 1}of${part.total}` : "";
  return `${title.trim() || "toonstudio-webtoon"}-${presetId}${suffix}.${format}`;
}

/**
 * StudioPage 내보내기 경로와 같은 규칙의 워터마크 합성(어두운 외곽선 + 흰 채움).
 * PDF 내보내기(studio-pdf-export)도 페이지 단위 서명에 이 함수를 재사용한다.
 */
export function drawWatermarkOnSlice(canvas: HTMLCanvasElement, settings: WatermarkSettings): void {
  if (!shouldDrawWatermark(settings)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 1. Anti-AI Protection Noise Pattern (CSP 3.1/4.0)
  if (settings.antiAiNoiseEnabled) {
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyAntiAiNoisePattern(
        imgData.data,
        canvas.width,
        canvas.height,
        settings.antiAiNoiseIntensity ?? 35,
      );
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Ignore if canvas is tainted by external resources
    }
  }

  // 2. Text Watermark (Single or Repeat Tiling)
  const text = settings.text.trim();
  if (text.length === 0) return;

  const placement = watermarkPlacement(canvas.width, canvas.height, settings);
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, settings.opacity));
  if (settings.blendMode && settings.blendMode !== "normal") {
    ctx.globalCompositeOperation = settings.blendMode;
  }
  ctx.font = `700 ${placement.fontPx}px "Pretendard", system-ui, sans-serif`;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.5, placement.fontPx * 0.09);

  if (settings.repeatTile) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tiles = generateWatermarkTilePositions(
      canvas.width,
      canvas.height,
      settings.tileSpacing ?? 180,
    );
    for (const tile of tiles) {
      ctx.save();
      ctx.translate(tile.x, tile.y);
      ctx.rotate((-25 * Math.PI) / 180);
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  } else {
    ctx.textAlign = placement.textAlign;
    ctx.textBaseline = placement.textBaseline;
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.strokeText(text, placement.x, placement.y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, placement.x, placement.y);
  }
  ctx.restore();
}
