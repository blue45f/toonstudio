export interface WorkspaceDiffLine { kind: "same" | "added" | "removed"; text: string }
export interface WorkspaceDiff { lines: WorkspaceDiffLine[]; added: number; removed: number; omitted: number; coarse: boolean }

/** 긴 원문은 공통 앞뒤를 보존하고 변경 구간만 제한된 메모리로 대조한다. */
export function compareWorkspaceText(before: string, after: string): WorkspaceDiff {
  const left = before ? before.split("\n") : [];
  const right = after ? after.split("\n") : [];
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;
  const a = left.slice(prefix, left.length - suffix);
  const b = right.slice(prefix, right.length - suffix);
  const lines: WorkspaceDiffLine[] = [];
  let total = 0; let added = 0; let removed = 0;
  const append = (kind: WorkspaceDiffLine["kind"], text: string) => {
    total += 1;
    if (kind === "added") added += 1;
    if (kind === "removed") removed += 1;
    if (lines.length < 400) lines.push({ kind, text });
  };
  for (let index = 0; index < prefix; index += 1) append("same", left[index]);
  const coarse = a.length * b.length > 160_000;
  if (coarse) {
    for (const text of a) append("removed", text);
    for (const text of b) append("added", text);
  } else {
    const width = b.length + 1;
    const lengths = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        lengths[i * width + j] = a[i] === b[j]
          ? 1 + lengths[(i + 1) * width + j + 1]
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
      }
    }
    let i = 0; let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { append("same", a[i]); i += 1; j += 1; }
      else if (i < a.length && (j === b.length || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) { append("removed", a[i]); i += 1; }
      else { append("added", b[j]); j += 1; }
    }
  }
  for (let index = left.length - suffix; index < left.length; index += 1) append("same", left[index]);
  return {
    lines, added, removed, omitted: Math.max(0, total - 400), coarse,
  };
}
