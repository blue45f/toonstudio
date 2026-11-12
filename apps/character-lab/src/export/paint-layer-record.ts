/**
 * 페인트 레이어 및 다중 서브레이어 ↔ 레시피 `paint.layers[]` · `paint.sublayers[]` 레코드(PNG base64).
 * Buffer 없이 btoa/atob(Node 22·브라우저 공통)를 쓴다.
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

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
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
