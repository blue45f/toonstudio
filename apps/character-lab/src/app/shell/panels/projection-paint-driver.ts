/**
 * 투영 페인트(베타) 드로잉 드라이버. `paint/paint-bridge`의 `createPointerPaintDriver`(UV 원형 스탬프, CPU)와 같은 `PointerPaintDriver` 인터페이스를 구현해
 * `ViewportPane`이 스트로크마다 둘 중 하나를 고르게 한다 — 엔진이 투영 포트(`projectionPaint()`)를 주면(베타를 켜고 능력이 되면) 투영, 아니면 기존 CPU 경로.
 * 단, 지우개(`toolMode === "eraser"`) 또는 좌우 대칭 그리기(`symmetry === true`)가 켜진 스트로크는 항상 정밀 UV CPU 경로로 처리한다.
 */
import { PAINT_TILE_SIZE } from "../../../contracts";
import { bodyPaintPickOptions, createPointerPaintDriver } from "../../../paint/paint-bridge";
import { MAX_BRUSH_RADIUS_PX, MIN_BRUSH_RADIUS_PX, compositePixelLinear, dabMask, tileExtent } from "../../../paint/paint-layer";
import { pressureBrush } from "../../../paint/paint-pressure";
import { PROJECTION_FALLBACK_SCREEN_NDC, overlayHasPaint, premultipliedPixel, unpremultiplyPixel } from "../../../render/projection-paint";
import { parseHex, srgbToLinear } from "../../../shared/color";

import type { BrushSettings, PaintLayer, PaintSublayerIndex, PaintUndoTile, PaintUndoToken, PartRole } from "../../../contracts";
import type { PaintLayerUploader, PointerPaintDriver, PointerPaintPorts, PointerSample } from "../../../paint/paint-bridge";
import type { PaintPressureMode } from "../../../paint/paint-pressure";
import type { PaintSession } from "../../../paint/paint-session";
import type { ProjectionBrushBitmap, ProjectionOverlay, ProjectionPaintPort } from "../../../render/projection-paint";

/** 포인터 이동 한 번에 보간하는 스탬프 상한(스탬프마다 RTT 렌더 패스가 든다) */
export const MAX_STAMPS_PER_MOVE = 16;
/** 브러시 비트맵 한 변(px) 하한·상한. 상한을 넘는 브러시는 확대 샘플링된다. */
export const PROJECTION_BITMAP_MIN = 8;
export const PROJECTION_BITMAP_MAX = 64;

export interface ProjectionPaintPorts {
  /** 지금 쓸 수 있는 투영 포트(없으면 null → CPU 경로) */
  readonly projection: () => ProjectionPaintPort | null;
  readonly upload: PaintLayerUploader;
  /** 스트로크 종료 시 토큰 1개(`dispatch({ type: "paint/stroke", undoToken })`) */
  readonly commit: (token: PaintUndoToken) => void;
  /** 한글 안내·오류(null이면 지움). 비동기 반영 중 거절·실패를 화면에 알린다. */
  readonly notify?: (messageKo: string | null) => void;
}

// ---------------------------------------------------------------- 브러시 비트맵

/** 세션 브러시와 강도(불투명도 × 압력)에서 premultiplied sRGB RGBA8 비트맵을 만든다(행 0 = 위). */
export function brushBitmapFor(brush: BrushSettings, pressure: number): ProjectionBrushBitmap {
  const radius = Math.min(MAX_BRUSH_RADIUS_PX, Math.max(MIN_BRUSH_RADIUS_PX, brush.radiusPx));
  const size = Math.min(PROJECTION_BITMAP_MAX, Math.max(PROJECTION_BITMAP_MIN, Math.ceil(2 * radius) + 2));
  const color = parseHex(brush.color);
  if (!color) throw new Error(`브러시 색 "${brush.color}"은 #rrggbb 형식이어야 합니다.`);
  const strength = Math.min(1, Math.max(0, brush.opacity)) * Math.min(1, Math.max(0, pressure));
  const bitmapRadius = (size - 2) / 2;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2);
      const mask = dabMask(distance, bitmapRadius, brush.hardness);
      const pixel = premultipliedPixel(color, mask, strength);
      rgba.set(pixel, (y * size + x) * 4);
    }
  }
  return { size, rgba, key: `${size}|${brush.color}|${brush.hardness.toFixed(3)}|${strength.toFixed(3)}` };
}

// ---------------------------------------------------------------- overlay 합성

const SRGB_TO_LINEAR = (() => {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbToLinear(i / 255);
  return lut;
})();

export function compositeOverlayTiles(layer: PaintLayer, overlay: ProjectionOverlay): PaintUndoToken | null {
  if (overlay.part !== layer.part) throw new Error(`투영 결과 부위(${overlay.part})가 레이어 부위(${layer.part})와 다릅니다.`);
  if (overlay.width !== layer.width || overlay.height !== layer.height) {
    throw new Error(`투영 결과 크기 ${overlay.width}×${overlay.height}가 레이어 ${layer.width}×${layer.height}와 다릅니다(스트로크 중 레이어 크기가 바뀌었습니다).`);
  }
  if (!overlayHasPaint(overlay)) return null;
  const tilesX = Math.ceil(layer.width / PAINT_TILE_SIZE);
  const tilesY = Math.ceil(layer.height / PAINT_TILE_SIZE);
  const tiles: PaintUndoTile[] = [];
  for (let ty = 0; ty < tilesY; ty += 1) {
    for (let tx = 0; tx < tilesX; tx += 1) {
      const { x, y, w, h } = tileExtent(layer, tx, ty);
      const data = new Uint8ClampedArray(w * h * 4);
      let painted = false;
      for (let row = 0; row < h; row += 1) {
        const start = ((y + row) * layer.width + x) * 4;
        data.set(layer.rgba.subarray(start, start + w * 4), row * w * 4);
        for (let col = 0; col < w; col += 1) {
          const index = start + col * 4;
          const alpha = overlay.rgba[index + 3] ?? 0;
          if (alpha === 0) continue;
          const straight = unpremultiplyPixel(overlay.rgba[index] ?? 0, overlay.rgba[index + 1] ?? 0, overlay.rgba[index + 2] ?? 0, alpha);
          if (!straight) continue;
          const src: readonly [number, number, number] = [SRGB_TO_LINEAR[Math.round(straight.rgb[0])] ?? 0, SRGB_TO_LINEAR[Math.round(straight.rgb[1])] ?? 0, SRGB_TO_LINEAR[Math.round(straight.rgb[2])] ?? 0];
          compositePixelLinear(data, (row * w + col) * 4, src, straight.alpha);
          painted = true;
        }
      }
      if (painted) tiles.push({ x, y, data });
    }
  }
  return tiles.length === 0 ? null : { part: layer.part, tiles, tileSize: PAINT_TILE_SIZE };
}

// ---------------------------------------------------------------- 투영 스트로크 드라이버

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류";
}

export function createProjectionStrokeDriver(session: PaintSession, port: ProjectionPaintPort, ports: Pick<ProjectionPaintPorts, "upload" | "commit" | "notify">, shared: { finalizing: boolean }): PointerPaintDriver {
  let active = false;
  let touching = false;
  let dabCount = 0;
  let part: PartRole = session.getState().activePart;
  let sublayerIndex: PaintSublayerIndex = session.getState().activeSublayer;
  let last: { readonly x: number; readonly y: number } | null = null;
  let screenSize: readonly [number, number] = PROJECTION_FALLBACK_SCREEN_NDC;
  const bitmaps = new Map<string, ProjectionBrushBitmap>();
  const samples: PointerSample[] = [];
  let pressureMode: PaintPressureMode = "constant";
  let strokeBrush = session.getState().brush;
  let pickOptions: ReturnType<typeof bodyPaintPickOptions>;

  const stampAt = (x: number, y: number, pressure: number, progress?: number): boolean => {
    const mode = pressureMode === "fake" && progress === undefined ? "constant" : pressureMode;
    const brush = pressureBrush(strokeBrush, mode, pressure, progress);
    if (brush.radiusPx <= 1e-6) return false;
    const alphaPressure = pressureMode === "fake" ? 1 : pressure;
    const key = `${brush.radiusPx}|${brush.color}|${brush.hardness}|${brush.opacity}|${alphaPressure}`;
    const cached = bitmaps.get(key) ?? brushBitmapFor(brush, alphaPressure);
    if (bitmaps.size >= 128) bitmaps.clear();
    bitmaps.set(key, cached);
    port.setBrush(cached, brush.radiusPx);
    const outcome = port.stamp(x, y);
    if (!outcome.hit) return false;
    if (progress === undefined) {
      if (pressureMode === "fake") samples.push({ ndcX: x, ndcY: y, pressure });
      dabCount += 1;
    }
    screenSize = outcome.screenSizeNdc;
    return true;
  };

  const reset = (): void => {
    active = false;
    touching = false;
    dabCount = 0;
    last = null;
    bitmaps.clear();
  };

  const finalize = async (recorded: readonly PointerSample[]): Promise<void> => {
    try {
      if (pressureMode === "fake" && recorded.length > 2) {
        port.cancel();
        const layer = session.layer(part);
        const ready = pickOptions ? port.begin(part, layer.width, layer.height, pickOptions) : port.begin(part, layer.width, layer.height);
        if (!ready) throw new Error("가상 필압 경로를 재생할 투영 표면이 없습니다.");
        recorded.forEach((sample, index) => stampAt(sample.ndcX, sample.ndcY, sample.pressure, index / (recorded.length - 1)));
      }
      const overlay = await port.flush();
      if (!overlay) return;
      const targetSublayer = session.sublayer(overlay.part, sublayerIndex);
      const after = compositeOverlayTiles(targetSublayer, overlay);
      if (!after) return;
      const inverse = session.applySublayerAfterToken(overlay.part, sublayerIndex, after);
      if (!inverse) throw new Error("세션이 부위 레이어를 찾지 못했습니다.");
      ports.upload(session.layer(overlay.part));
      ports.commit(inverse);
    } catch (error) {
      port.cancel();
      ports.notify?.(`투영 페인트 결과를 레이어에 반영하지 못했습니다: ${failureText(error)}`);
    } finally {
      bitmaps.clear();
      shared.finalizing = false;
    }
  };

  return {
    get active() {
      return active;
    },
    get touching() {
      return touching;
    },
    get dabCount() {
      return dabCount;
    },
    down(sample) {
      if (active) this.up();
      if (shared.finalizing) {
        ports.notify?.("이전 투영 스트로크를 레이어에 반영하는 중입니다. 잠시 뒤 다시 칠하세요.");
        return false;
      }
      part = session.getState().activePart;
      const guard = session.canPaintActiveSublayer(part);
      if (!guard.ok) {
        ports.notify?.(guard.reasonKo);
        return false;
      }
      sublayerIndex = session.getState().activeSublayer;
      pressureMode = session.getState().pressureMode;
      strokeBrush = session.getState().brush;
      samples.length = 0;
      pickOptions = bodyPaintPickOptions(part, session.getState().bodyLineMaskEnabled);
      const layer = session.layer(part);
      const ready = pickOptions ? port.begin(part, layer.width, layer.height, pickOptions) : port.begin(part, layer.width, layer.height);
      if (!ready) {
        ports.notify?.("투영 페인트: 이 부위에 칠할 메시가 없습니다.");
        return false;
      }
      active = true;
      screenSize = PROJECTION_FALLBACK_SCREEN_NDC;
      last = { x: sample.ndcX, y: sample.ndcY };
      touching = stampAt(sample.ndcX, sample.ndcY, sample.pressure);
      return touching;
    },
    move(sample) {
      if (!active || last === null) return 0;
      const from = last;
      const distance = Math.hypot((sample.ndcX - from.x) / Math.max(screenSize[0], 1e-6), (sample.ndcY - from.y) / Math.max(screenSize[1], 1e-6));
      const step = Math.max(0.02, session.getState().brush.spacing / 2);
      const count = Math.min(MAX_STAMPS_PER_MOVE, Math.max(1, Math.ceil(distance / step - 1e-6)));
      let added = 0;
      let hitLast = false;
      for (let k = 1; k <= count; k += 1) {
        const t = k / count;
        const hit = stampAt(from.x + (sample.ndcX - from.x) * t, from.y + (sample.ndcY - from.y) * t, sample.pressure);
        if (hit) added += 1;
        hitLast = hit;
      }
      touching = hitLast;
      last = { x: sample.ndcX, y: sample.ndcY };
      return added;
    },
    up() {
      if (!active) return null;
      const painted = dabCount > 0;
      const recorded = samples.splice(0);
      reset();
      if (!painted) {
        port.cancel();
        return null;
      }
      shared.finalizing = true;
      void finalize(recorded);
      return null;
    },
    cancel() {
      if (!active) return;
      samples.length = 0;
      reset();
      port.cancel();
    },
  };
}

// ---------------------------------------------------------------- 전환 드라이버

export function createSwitchingPaintDriver(session: PaintSession, ports: PointerPaintPorts & ProjectionPaintPorts): PointerPaintDriver {
  const cpu = createPointerPaintDriver(session, {
    pick: ports.pick,
    upload: ports.upload,
    commit: ports.commit,
    ...(ports.notify ? { notify: ports.notify } : {}),
  });
  const shared = { finalizing: false };
  let current: PointerPaintDriver = cpu;

  return {
    get active() {
      return current.active;
    },
    get touching() {
      return current.touching;
    },
    get dabCount() {
      return current.dabCount;
    },
    down(sample: PointerSample) {
      if (current.active) current.up();
      if (shared.finalizing) {
        ports.notify?.("이전 투영 스트로크를 레이어에 반영하는 중입니다. 잠시 뒤 다시 칠하세요.");
        return false;
      }
      const state = session.getState();
      const port = state.toolMode === "eraser" || state.symmetry ? null : ports.projection();
      current = port ? createProjectionStrokeDriver(session, port, ports, shared) : cpu;
      return current.down(sample);
    },
    move: (sample) => current.move(sample),
    up: () => current.up(),
    cancel: () => current.cancel(),
  };
}
