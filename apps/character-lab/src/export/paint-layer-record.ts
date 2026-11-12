/**
 * 페인트 레이어 및 다중 서브레이어 ↔ 레시피 `paint.layers[]` · `paint.sublayers[]` 레코드(PNG base64).
 * Buffer 없이 btoa/atob(Node 22·브라우저 공통)를 쓴다.
 * 구버전/외부 도구가 기록한 `data:image/png;base64,` 접두사·MIME 개행·URL-safe base64는 정규화해 안전하게 복구하며,
 * 빈 base64·비정상 치수(> 4096px)·해상도 불일치는 명시 코드(`paint-layer-*` / `paint-sublayer-*`)로 거부한다.
 */
import { failVisible } from "../contracts";

import { decodePng, encodePng } from "./png-encoder";

import type {
  LabFailure,
  PaintLayer,
  PaintLayerRecord,
  PaintPartSublayerState,
  PaintSublayerIndex,
  PaintSublayerPartRecord,
  PaintSublayerSlotRecord,
  PaintSublayerSlotState,
} from "../contracts";

const CHUNK = 0x8000;
export const MAX_PAINT_RECORD_DIMENSION = 4096;

const DATA_PNG_BASE64_PREFIX = /^data:image\/png;base64,/iu;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * 구버전 `data:image/png;base64,` 접두사·MIME 줄바꿈·URL-safe(`-`/`_`)·누락 패딩을 정규화해 바이트로 디코드한다.
 * 빈 문자열이나 base64 알파벳 밖 문자는 즉시 예외를 던진다.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const withoutPrefix = base64.trim().replace(DATA_PNG_BASE64_PREFIX, "");
  const compact = withoutPrefix.replace(/[\r\n\t ]+/gu, "").replace(/-/gu, "+").replace(/_/gu, "/");
  if (compact.length === 0) {
    throw new Error("페인트 PNG base64 문자열이 비어 있습니다.");
  }
  const mod = compact.length % 4;
  if (mod === 1) {
    throw new Error("페인트 PNG base64 길이가 올바르지 않습니다.");
  }
  const padded = mod === 0 ? compact : `${compact}${"=".repeat(4 - mod)}`;
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function encodePaintLayerRecord(layer: PaintLayer): Promise<PaintLayerRecord> {
  const png = await encodePng({ width: layer.width, height: layer.height, rgba: layer.rgba }, { filter: "adaptive" });
  return { part: layer.part, width: layer.width, height: layer.height, pngBase64: bytesToBase64(png) };
}

export type DecodePaintLayerResult = { readonly ok: true; readonly layer: PaintLayer } | { readonly ok: false; readonly failure: LabFailure };

export async function decodePaintLayerRecord(record: PaintLayerRecord, now?: number): Promise<DecodePaintLayerResult> {
  if (
    record.width <= 0 ||
    record.height <= 0 ||
    record.width > MAX_PAINT_RECORD_DIMENSION ||
    record.height > MAX_PAINT_RECORD_DIMENSION
  ) {
    return {
      ok: false,
      failure: failVisible(
        "paint-layer-size",
        `페인트 레이어(${record.part}) 레코드 크기(${record.width}×${record.height})가 허용 범위(1~${MAX_PAINT_RECORD_DIMENSION}px)를 벗어났습니다.`,
        undefined,
        now,
      ),
    };
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(record.pngBase64);
  } catch (error) {
    return { ok: false, failure: failVisible("paint-layer-base64", `페인트 레이어(${record.part})의 base64가 올바르지 않습니다.`, error, now) };
  }
  let decoded: Awaited<ReturnType<typeof decodePng>>;
  try {
    decoded = await decodePng(bytes);
  } catch (error) {
    return { ok: false, failure: failVisible("paint-layer-png", `페인트 레이어(${record.part})의 PNG를 디코드할 수 없습니다.`, error, now) };
  }
  if (decoded.width !== record.width || decoded.height !== record.height) {
    return {
      ok: false,
      failure: failVisible(
        "paint-layer-size",
        `페인트 레이어(${record.part}) PNG 크기 ${decoded.width}×${decoded.height}가 레코드 ${record.width}×${record.height}와 다릅니다.`,
        undefined,
        now,
      ),
    };
  }
  return { ok: true, layer: { part: record.part, width: decoded.width, height: decoded.height, rgba: decoded.rgba, revision: 0 } };
}

export async function encodePaintSublayerPartRecord(
  state: PaintPartSublayerState,
): Promise<PaintSublayerPartRecord> {
  const encodeSlot = async (slot: PaintSublayerSlotState): Promise<PaintSublayerSlotRecord> => {
    const hasPixels = slot.rgba !== null && slot.rgba.some((b) => b !== 0);
    if (!hasPixels || !slot.rgba) {
      return { index: slot.index, visible: slot.visible, opacity: slot.opacity };
    }
    const png = await encodePng({ width: state.width, height: state.height, rgba: slot.rgba }, { filter: "adaptive" });
    return {
      index: slot.index,
      visible: slot.visible,
      opacity: slot.opacity,
      pngBase64: bytesToBase64(png),
    };
  };

  const s0 = await encodeSlot(state.slots[0]);
  const s1 = await encodeSlot(state.slots[1]);
  const s2 = await encodeSlot(state.slots[2]);
  const s3 = await encodeSlot(state.slots[3]);
  const s4 = await encodeSlot(state.slots[4]);
  const s5 = await encodeSlot(state.slots[5]);

  return {
    part: state.part,
    width: state.width,
    height: state.height,
    order: [...state.order],
    slots: [s0, s1, s2, s3, s4, s5],
  };
}

export type DecodePaintSublayerPartResult =
  | { readonly ok: true; readonly state: PaintPartSublayerState }
  | { readonly ok: false; readonly failure: LabFailure };

export async function decodePaintSublayerPartRecord(
  record: PaintSublayerPartRecord,
  now?: number,
): Promise<DecodePaintSublayerPartResult> {
  if (
    record.width <= 0 ||
    record.height <= 0 ||
    record.width > MAX_PAINT_RECORD_DIMENSION ||
    record.height > MAX_PAINT_RECORD_DIMENSION
  ) {
    return {
      ok: false,
      failure: failVisible(
        "paint-sublayer-size",
        `페인트 서브레이어(${record.part}) 레코드 크기(${record.width}×${record.height})가 허용 범위(1~${MAX_PAINT_RECORD_DIMENSION}px)를 벗어났습니다.`,
        undefined,
        now,
      ),
    };
  }
  const decodeSlot = async (
    slotRecord: PaintSublayerSlotRecord,
    expectedIndex: PaintSublayerIndex,
  ): Promise<{ readonly ok: true; readonly slot: PaintSublayerSlotState } | { readonly ok: false; readonly failure: LabFailure }> => {
    if (slotRecord.pngBase64 === undefined) {
      return {
        ok: true,
        slot: {
          index: expectedIndex,
          visible: slotRecord.visible,
          opacity: slotRecord.opacity,
          rgba: null,
        },
      };
    }
    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(slotRecord.pngBase64);
    } catch (error) {
      return {
        ok: false,
        failure: failVisible(
          "paint-sublayer-base64",
          `페인트 서브레이어(${record.part} · L${expectedIndex})의 base64가 올바르지 않습니다.`,
          error,
          now,
        ),
      };
    }
    let decoded: Awaited<ReturnType<typeof decodePng>>;
    try {
      decoded = await decodePng(bytes);
    } catch (error) {
      return {
        ok: false,
        failure: failVisible(
          "paint-sublayer-png",
          `페인트 서브레이어(${record.part} · L${expectedIndex})의 PNG를 디코드할 수 없습니다.`,
          error,
          now,
        ),
      };
    }
    if (decoded.width !== record.width || decoded.height !== record.height) {
      return {
        ok: false,
        failure: failVisible(
          "paint-sublayer-size",
          `페인트 서브레이어(${record.part} · L${expectedIndex}) PNG 크기 ${decoded.width}×${decoded.height}가 레코드 ${record.width}×${record.height}와 다릅니다.`,
          undefined,
          now,
        ),
      };
    }
    return {
      ok: true,
      slot: {
        index: expectedIndex,
        visible: slotRecord.visible,
        opacity: slotRecord.opacity,
        rgba: decoded.rgba,
      },
    };
  };

  const decodedSlots: PaintSublayerSlotState[] = [];
  for (const idx of [0, 1, 2, 3, 4, 5] as const) {
    const slotRec = record.slots[idx];
    const outcome = await decodeSlot(slotRec, idx);
    if (!outcome.ok) return outcome;
    decodedSlots.push(outcome.slot);
  }

  const [s0, s1, s2, s3, s4, s5] = decodedSlots;
  if (!s0 || !s1 || !s2 || !s3 || !s4 || !s5) {
    return {
      ok: false,
      failure: failVisible("paint-sublayer-corrupt", `페인트 서브레이어(${record.part}) 슬롯 개수가 올바르지 않습니다.`, undefined, now),
    };
  }

  return {
    ok: true,
    state: {
      part: record.part,
      width: record.width,
      height: record.height,
      order: [...record.order],
      slots: [s0, s1, s2, s3, s4, s5],
    },
  };
}
