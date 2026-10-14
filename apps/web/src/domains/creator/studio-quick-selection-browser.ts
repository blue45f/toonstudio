/** Browser orchestration for the pure Quick Selection brush engine. */
import { loadFloodFillSourceImage } from "./studio-flood-fill";
import {
  flipMagicWandRegion,
  flipNormalizedPoint,
  type MagicWandRegion,
} from "./studio-magic-wand";
import type { SelPoint } from "./studio-selection-tools";
import {
  QUICK_SELECTION_PROXY_MAX_DIM,
  type QuickSelectionSeed,
} from "./studio-quick-selection";
import { runStudioQuickSelectionWorker } from "./studio-quick-selection-worker-client";

/** 한 스트로크에서 Worker로 넘길 시드 상한 — 궤적 점을 stride로 솎아도 디스크가 겹쳐 빈틈이 없다. */
const QUICK_SELECTION_MAX_SEEDS = 256;

export interface QuickSelectionStrokeInput {
  /** 표시 좌표계 0..1 정규화 궤적 점들(브러시가 지나간 자리). */
  readonly points: readonly SelPoint[];
  /** 브러시 반경 — 요소 폭 기준 정규화(호스트의 pixelBrushRadius / frame.width). */
  readonly radiusNorm: number;
}

/**
 * 이미지 src + 브러시 궤적(표시 좌표) → MagicWandRegion(표시 좌표계).
 *
 * 큰 캔버스에서는 원본 해상도로 성장시키지 않고 긴 변 QUICK_SELECTION_PROXY_MAX_DIM 이하의
 * 프록시 위에서 Worker로 성장시킨다 — 메인 스레드가 끊기지 않고, 결과 폴리곤은 0..1 정규화라
 * 프록시 해상도와 무관하게 PixelSelection에 그대로 들어간다.
 * @param tolerance 정규화 색 거리 허용치(0..1) — quickSelectionToleranceFromSlider 로 변환해 넘긴다.
 * @param opts.flipX/flipY 대상 이미지 요소의 반전 — 매직 완드와 동일한 좌표 규약.
 */
export async function quickSelectionScanFromImage(
  src: string,
  stroke: QuickSelectionStrokeInput,
  tolerance: number,
  opts?: { maxProxyDim?: number; flipX?: boolean; flipY?: boolean },
): Promise<MagicWandRegion> {
  if (stroke.points.length === 0) throw new Error("브러시 궤적이 비어 있어요.");
  const img = await loadFloodFillSourceImage(src);
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) throw new Error("이미지 크기를 확인할 수 없습니다.");

  const maxDim = opts?.maxProxyDim ?? QUICK_SELECTION_PROXY_MAX_DIM;
  const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH));
  const proxyW = Math.max(1, Math.round(naturalW * scale));
  const proxyH = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = proxyW;
  canvas.height = proxyH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");
  ctx.imageSmoothingEnabled = false; // 다운스케일 시 색 경계가 번지지 않도록(허용 오차 매칭 안정화).
  ctx.drawImage(img, 0, 0, proxyW, proxyH);
  const { data } = ctx.getImageData(0, 0, proxyW, proxyH);

  const flipX = opts?.flipX ?? false;
  const flipY = opts?.flipY ?? false;
  const stride = Math.max(1, Math.ceil(stroke.points.length / QUICK_SELECTION_MAX_SEEDS));
  const radiusPx = Math.max(1, Math.round(stroke.radiusNorm * proxyW));
  const seeds: QuickSelectionSeed[] = [];
  for (let index = 0; index < stroke.points.length; index += stride) {
    const display = stroke.points[index]!;
    const original = flipNormalizedPoint(display, flipX, flipY);
    seeds.push({
      x: Math.min(proxyW - 1, Math.max(0, original.x * proxyW)),
      y: Math.min(proxyH - 1, Math.max(0, original.y * proxyH)),
      radius: radiusPx,
    });
  }
  // stride 솎기가 마지막 점을 버리면 궤적 끝이 선택에서 빠진다 — 항상 포함한다.
  const lastDisplay = stroke.points[stroke.points.length - 1]!;
  const lastOriginal = flipNormalizedPoint(lastDisplay, flipX, flipY);
  const lastSeed: QuickSelectionSeed = {
    x: Math.min(proxyW - 1, Math.max(0, lastOriginal.x * proxyW)),
    y: Math.min(proxyH - 1, Math.max(0, lastOriginal.y * proxyH)),
    radius: radiusPx,
  };
  if (seeds.length === 0 || seeds[seeds.length - 1] !== lastSeed) seeds.push(lastSeed);

  // 영역 성장+윤곽 추적은 프록시에서도 수만~수십만 픽셀 연산이라 Worker로 옮긴다.
  // Worker를 사용할 수 없으면 선택을 실패로 닫고 메인 스레드에서 다시 실행하지 않는다.
  const { region } = await runStudioQuickSelectionWorker(
    { data, w: proxyW, h: proxyH, seeds, tolerance },
    { executionMode: "worker" },
  );
  const displayRegion = flipMagicWandRegion(region, flipX, flipY);
  if (displayRegion.outer.length < 3) throw new Error("문지른 자리에서 선택할 영역을 찾지 못했어요.");
  return displayRegion;
}
