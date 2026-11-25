import type { LayerAuditDocumentInput, StudioLayerInput } from "./assistant-handoff-engine";

export const MAX_HANDOFF_LAYERS = 256;
export const MAX_HANDOFF_ALLOCATIONS = 64;

export function assertLayerInputs(layers: readonly StudioLayerInput[]): void {
  if (layers.length > MAX_HANDOFF_LAYERS) throw new RangeError("레이어 상한은 256개입니다.");
  const ids = new Set<string>();
  for (const layer of layers) {
    if (!layer.id.trim() || layer.id.length > 256 || ids.has(layer.id)) throw new RangeError("레이어 ID는 비어 있지 않은 고유 문자열이어야 합니다.");
    ids.add(layer.id);
    if (layer.name.length > 1024) throw new RangeError("레이어 이름은 1024자 이하여야 합니다.");
    if (layer.opacityPct !== undefined && (!Number.isFinite(layer.opacityPct) || layer.opacityPct < 0 || layer.opacityPct > 100)) throw new RangeError("불투명도는 0~100 범위의 유한한 수여야 합니다.");
  }
}

export function assertHandoffDocument(document: LayerAuditDocumentInput): void {
  assertLayerInputs(document.layers);
  if (!Number.isFinite(document.dpi) || document.dpi <= 0 || document.dpi > 2400) throw new RangeError("DPI는 0 초과 2400 이하의 유한한 수여야 합니다.");
  if (document.expectedDpi !== undefined && document.expectedDpi !== 300 && document.expectedDpi !== 350) throw new RangeError("예제 기준 DPI는 300 또는 350이어야 합니다.");
}

/** 외부 결과를 직렬화할 때 NaN→null 변환과 과도한 크기·순환 구조를 먼저 차단한다. */
export function assertExportSnapshot(value: unknown): void {
  let nodes = 0;
  const ancestors = new WeakSet<object>();
  function visit(item: unknown, depth: number): void {
    nodes += 1;
    if (nodes > 100000 || depth > 20) throw new RangeError("내보내기 스냅샷의 크기·깊이 상한을 넘었습니다.");
    if (typeof item === "number" && !Number.isFinite(item)) throw new RangeError("내보내기 수치는 유한해야 합니다.");
    if (typeof item === "string" && item.length > 65536) throw new RangeError("내보내기 문자열 상한을 넘었습니다.");
    if (!item || typeof item !== "object") return;
    if (ancestors.has(item)) throw new RangeError("순환 스냅샷은 내보낼 수 없습니다.");
    ancestors.add(item);
    const values = Array.isArray(item) ? item : Object.values(item);
    if (values.length > 4096) throw new RangeError("내보내기 목록 상한을 넘었습니다.");
    for (const child of values) visit(child, depth + 1);
    ancestors.delete(item);
  }
  visit(value, 0);
}

export function uniqueHandoffId(base: string, ids: ReadonlySet<string>): string {
  let candidate = base;
  let sequence = 2;
  while (ids.has(candidate)) { candidate = `${base}-${sequence}`; sequence += 1; }
  return candidate;
}
