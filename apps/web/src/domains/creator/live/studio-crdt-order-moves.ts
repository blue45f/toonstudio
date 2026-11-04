export interface StudioCrdtOrderMove { id: string; beforeId: string | null }

function uniqueIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Produces a minimum-cardinality move set for unique IDs by retaining one LIS/LCS. Moves are
 * emitted tail-to-head, matching the CRDT's `move(id, beforeId)` primitive.
 */
export function planStudioCrdtOrderMoves(
  currentIds: readonly string[],
  desiredIds: readonly string[]
): StudioCrdtOrderMove[] {
  const current = uniqueIds(currentIds);
  const desired = uniqueIds(desiredIds);
  const desiredPosition = new Map(desired.map((id, index) => [id, index]));
  const common = current.filter((id) => desiredPosition.has(id));
  const positions = common.map((id) => desiredPosition.get(id)!);
  const tails: number[] = [];
  const tailIndices: number[] = [];
  const previousIndices = Array<number>(positions.length).fill(-1);
  for (let index = 0; index < positions.length; index += 1) {
    const value = positions[index]!;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (tails[middle]! < value) low = middle + 1;
      else high = middle;
    }
    tails[low] = value;
    previousIndices[index] = low > 0 ? tailIndices[low - 1]! : -1;
    tailIndices[low] = index;
  }
  const retained = new Set<string>();
  let retainedIndex = tailIndices[tails.length - 1] ?? -1;
  while (retainedIndex >= 0) {
    retained.add(common[retainedIndex]!);
    retainedIndex = previousIndices[retainedIndex]!;
  }

  const moves: StudioCrdtOrderMove[] = [];
  let beforeId: string | null = null;
  for (let index = desired.length - 1; index >= 0; index -= 1) {
    const id = desired[index]!;
    if (!retained.has(id)) moves.push({ id, beforeId });
    beforeId = id;
  }
  return moves;
}

