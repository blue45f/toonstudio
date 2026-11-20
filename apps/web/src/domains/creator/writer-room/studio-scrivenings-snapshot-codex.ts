/**
 * Scrivener / Novelcrafter형 스크리브닝 연속 대본 스트림, 비파괴 씬 스냅샷 단어 Diff
 * 및 실시간 Codex 별칭 자동 탐지(Aho-Corasick 다중 패턴 오토마톤) 엔진.
 *
 * - 여러 씬 카드를 파일 경계 구분자만 남긴 단일 연속 텍스트로 투영·편집하고,
 *   변경된 씬 본문만 원본 카드에 원자 반영한다.
 * - 대본 대수술 전 읽기 전용 스냅샷을 박제하고 LCS 기반 단어/어절 단위 Diff 비교 및
 *   복원 직전 자동 백업 롤백을 제공한다.
 * - 특수 마크다운 링크 문법 없이 타이핑만으로 캐릭터·지명·설정 별칭을 O(N) 단일 패스로 감지하며
 *   폐기·격리 설정 언급 시 즉시 경고를 발생시킨다.
 */

export interface ScriptSceneCard {
  readonly id: string;
  readonly episodeId: string;
  readonly title: string;
  readonly body: string;
  readonly cutNotes: string;
  readonly orderIndex: number;
}

export interface ScriveningsSectionRange {
  readonly sceneId: string;
  readonly title: string;
  readonly headerStart: number;
  readonly bodyStart: number;
  readonly bodyEnd: number;
}

export interface ScriveningsCompositeDocument {
  readonly text: string;
  readonly ranges: readonly ScriveningsSectionRange[];
}

export interface ScriveningsApplyResult {
  readonly ok: boolean;
  readonly scenes: readonly ScriptSceneCard[];
  readonly changedSceneIds: readonly string[];
  readonly errorKo: string | null;
}

export interface SceneSplitMergeUndoPayload {
  readonly previousScenes: readonly ScriptSceneCard[];
  readonly nextScenes: readonly ScriptSceneCard[];
  readonly affectedSceneIds: readonly string[];
}

export interface SceneSnapshotRecord {
  readonly snapshotId: string;
  readonly sceneId: string;
  readonly label: string;
  readonly capturedAtIso: string;
  readonly title: string;
  readonly body: string;
  readonly cutNotes: string;
  readonly contentHash: string;
}

export interface WordDiffChunk {
  readonly op: "equal" | "insert" | "delete";
  readonly text: string;
}

export interface WordDiffReport {
  readonly chunks: readonly WordDiffChunk[];
  readonly addedTokens: number;
  readonly removedTokens: number;
  readonly unchangedTokens: number;
  readonly unchangedRatio: number;
}

export type CodexEntityKind = "character" | "location" | "lore" | "item";
export type CodexEntityStatus =
  | "confirmed"
  | "speculative"
  | "deprecated"
  | "quarantined";

export interface CodexEntityEntry {
  readonly id: string;
  readonly kind: CodexEntityKind;
  readonly canonical: string;
  readonly aliases: readonly string[];
  readonly status: CodexEntityStatus;
  readonly summary: string;
  readonly voiceTone?: string;
  readonly paletteOklch?: readonly string[];
  readonly lastSeenEpisode?: string;
}

export interface CodexHoverMatch {
  readonly entityId: string;
  readonly kind: CodexEntityKind;
  readonly status: CodexEntityStatus;
  readonly canonical: string;
  readonly matchedSurface: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly severity: "info" | "warning";
  readonly warningKo: string | null;
  readonly summary: string;
  readonly voiceTone?: string;
  readonly paletteOklch?: readonly string[];
  readonly lastSeenEpisode?: string;
}

const SCENE_DELIMITER_PREFIX = "=== [SCENE:";
const SCENE_DELIMITER_PATTERN = /^=== \[SCENE:([^\]]+)\]\s*(.*?)\s*===$/u;

function deterministicHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + ((h1 >>> 11) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
}

function formatDelimiter(scene: Pick<ScriptSceneCard, "id" | "title">): string {
  const safeTitle = scene.title.replace(/[\r\n]/gu, " ").trim() || "제목 없음";
  return `${SCENE_DELIMITER_PREFIX}${scene.id}] ${safeTitle} ===`;
}

/**
 * 선택한 씬 카드 목록을 하나의 연속 편집 스트림(Scrivenings)으로 투영한다.
 */
export function buildScriveningsCompositeStream(
  scenes: readonly ScriptSceneCard[],
): ScriveningsCompositeDocument {
  const sorted = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const chunks: string[] = [];
  const ranges: ScriveningsSectionRange[] = [];
  let cursor = 0;

  sorted.forEach((scene, index) => {
    if (index > 0) {
      chunks.push("\n\n");
      cursor += 2;
    }
    const headerStart = cursor;
    const header = formatDelimiter(scene);
    chunks.push(header, "\n");
    cursor += header.length + 1;
    const bodyStart = cursor;
    chunks.push(scene.body);
    cursor += scene.body.length;
    const bodyEnd = cursor;
    ranges.push(
      Object.freeze({
        sceneId: scene.id,
        title: scene.title,
        headerStart,
        bodyStart,
        bodyEnd,
      }),
    );
  });

  return Object.freeze({
    text: chunks.join(""),
    ranges: Object.freeze(ranges),
  });
}

/**
 * 연속 스트림에서 수정된 텍스트를 파싱해 변경된 씬만 원본 구조에 원자적으로 반영한다.
 */
export function applyScriveningsCompositeEdit(
  originalScenes: readonly ScriptSceneCard[],
  editedCompositeText: string,
): ScriveningsApplyResult {
  const lines = editedCompositeText.split("\n");
  const parsedBodies = new Map<string, { readonly title: string; readonly lines: string[] }>();
  let activeSceneId: string | null = null;

  const orderedIds: string[] = [];
  for (const line of lines) {
    const match = SCENE_DELIMITER_PATTERN.exec(line);
    if (match) {
      const id = (match[1] ?? "").trim();
      const title = (match[2] ?? "").trim();
      if (!id || parsedBodies.has(id)) {
        return Object.freeze({
          ok: false,
          scenes: originalScenes,
          changedSceneIds: Object.freeze([]),
          errorKo: "씬 경계 구분자가 중복되었거나 손상되어 변경을 반영할 수 없습니다.",
        });
      }
      parsedBodies.set(id, { title, lines: [] });
      orderedIds.push(id);
      activeSceneId = id;
      continue;
    }
    if (activeSceneId === null) {
      if (line.trim().length > 0) {
        return Object.freeze({
          ok: false,
          scenes: originalScenes,
          changedSceneIds: Object.freeze([]),
          errorKo: "첫 번째 씬 구분자 위에 작성된 텍스트는 어느 씬에 속하는지 판별할 수 없습니다.",
        });
      }
      continue;
    }
    parsedBodies.get(activeSceneId)?.lines.push(line);
  }

  for (const orig of originalScenes) {
    if (!parsedBodies.has(orig.id)) {
      return Object.freeze({
        ok: false,
        scenes: originalScenes,
        changedSceneIds: Object.freeze([]),
        errorKo: `원본 씬 구분자(${orig.id})가 유실되어 안전하게 적용을 취소했습니다.`,
      });
    }
  }

  const lastParsedId = orderedIds[orderedIds.length - 1] ?? null;
  const changedSceneIds: string[] = [];
  const nextScenes = originalScenes.map((scene) => {
    const bucket = parsedBodies.get(scene.id)!;
    // buildScriveningsCompositeStream은 인접 씬 사이에 "\n\n"을 넣으므로 마지막 씬을 제외한 끝 빈 줄 1개만 제거한다.
    const rawLines = [...bucket.lines];
    if (scene.id !== lastParsedId && rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
      rawLines.pop();
    }
    const nextBody = rawLines.join("\n");
    const nextTitle = bucket.title || scene.title;
    if (nextBody === scene.body && nextTitle === scene.title) {
      return scene;
    }
    changedSceneIds.push(scene.id);
    return Object.freeze({
      ...scene,
      title: nextTitle,
      body: nextBody,
    });
  });

  return Object.freeze({
    ok: true,
    scenes: Object.freeze(nextScenes),
    changedSceneIds: Object.freeze(changedSceneIds),
    errorKo: null,
  });
}

export function splitSceneAtOffset(
  scenes: readonly ScriptSceneCard[],
  sceneId: string,
  cursorOffset: number,
  newSceneId: string,
  newSceneTitle: string,
): SceneSplitMergeUndoPayload {
  const sorted = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const idx = sorted.findIndex((s) => s.id === sceneId);
  if (idx < 0) {
    throw new Error(`분할할 씬을 찾지 못했습니다: ${sceneId}`);
  }
  const target = sorted[idx]!;
  const safeOffset = Math.max(0, Math.min(target.body.length, Math.trunc(cursorOffset)));
  const firstBody = target.body.slice(0, safeOffset).trimEnd();
  const secondBody = target.body.slice(safeOffset).trimStart();

  const updatedFirst: ScriptSceneCard = Object.freeze({
    ...target,
    body: firstBody,
  });
  const createdSecond: ScriptSceneCard = Object.freeze({
    id: newSceneId,
    episodeId: target.episodeId,
    title: newSceneTitle.trim() || `${target.title} (분할)`,
    body: secondBody,
    cutNotes: "",
    orderIndex: target.orderIndex + 1,
  });

  const combined = [...sorted.slice(0, idx), updatedFirst, createdSecond, ...sorted.slice(idx + 1)].map(
    (s, orderIndex) => Object.freeze({ ...s, orderIndex }),
  );

  return Object.freeze({
    previousScenes: Object.freeze(sorted),
    nextScenes: Object.freeze(combined),
    affectedSceneIds: Object.freeze([target.id, newSceneId]),
  });
}

export function mergeAdjacentScenes(
  scenes: readonly ScriptSceneCard[],
  firstSceneId: string,
  secondSceneId: string,
): SceneSplitMergeUndoPayload {
  const sorted = [...scenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const idxA = sorted.findIndex((s) => s.id === firstSceneId);
  const idxB = sorted.findIndex((s) => s.id === secondSceneId);
  if (idxA < 0 || idxB < 0 || idxB !== idxA + 1) {
    throw new Error("인접한 두 씬만 병합할 수 있습니다.");
  }
  const first = sorted[idxA]!;
  const second = sorted[idxB]!;
  const mergedBody = [first.body, second.body].filter((p) => p.length > 0).join("\n\n");
  const mergedNotes = [first.cutNotes, second.cutNotes].filter((p) => p.trim().length > 0).join("\n");
  const merged: ScriptSceneCard = Object.freeze({
    ...first,
    body: mergedBody,
    cutNotes: mergedNotes,
  });

  const next = [...sorted.slice(0, idxA), merged, ...sorted.slice(idxB + 1)].map((s, orderIndex) =>
    Object.freeze({ ...s, orderIndex }),
  );

  return Object.freeze({
    previousScenes: Object.freeze(sorted),
    nextScenes: Object.freeze(next),
    affectedSceneIds: Object.freeze([first.id, second.id]),
  });
}

/**
 * 읽기 전용 비파괴 씬 스냅샷을 생성한다.
 */
export function createSceneSnapshot(
  scene: ScriptSceneCard,
  label: string,
  capturedAtIso: string,
): SceneSnapshotRecord {
  const contentHash = deterministicHash(`${scene.title}\u0000${scene.body}\u0000${scene.cutNotes}`);
  const snapshotId = `snap-${scene.id}-${contentHash.slice(0, 8)}`;
  return Object.freeze({
    snapshotId,
    sceneId: scene.id,
    label: label.trim() || "개고 전 스냅샷",
    capturedAtIso: Number.isNaN(Date.parse(capturedAtIso))
      ? capturedAtIso
      : new Date(capturedAtIso).toISOString(),
    title: scene.title,
    body: scene.body,
    cutNotes: scene.cutNotes,
    contentHash,
  });
}

function tokenizePreservingWhitespace(text: string): string[] {
  if (!text) return [];
  return text.match(/\S+|\s+/gu) ?? [];
}

/**
 * LCS 기반 단어/어절 단위 인라인 Diff를 계산한다.
 */
export function computeWordDiff(beforeText: string, afterText: string): WordDiffReport {
  const a = tokenizePreservingWhitespace(beforeText);
  const b = tokenizePreservingWhitespace(afterText);
  const n = a.length;
  const m = b.length;

  // 초대형 본문에서 O(N*M) 메모리 폭발을 막기 위해 공통 접두/접미를 먼저 제거한다.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    a[n - 1 - suffix] === b[m - 1 - suffix]
  ) {
    suffix += 1;
  }

  const midA = a.slice(prefix, n - suffix);
  const midB = b.slice(prefix, m - suffix);
  const rawOps: WordDiffChunk[] = [];

  for (let i = 0; i < prefix; i += 1) {
    rawOps.push({ op: "equal", text: a[i]! });
  }

  if (midA.length * midB.length <= 250_000) {
    const rows = midA.length + 1;
    const cols = midB.length + 1;
    const dp = new Int32Array(rows * cols);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        if (midA[i] === midB[j]) {
          dp[i * cols + j] = (dp[(i + 1) * cols + (j + 1)] ?? 0) + 1;
        } else {
          const down = dp[(i + 1) * cols + j] ?? 0;
          const right = dp[i * cols + (j + 1)] ?? 0;
          dp[i * cols + j] = down >= right ? down : right;
        }
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        rawOps.push({ op: "equal", text: midA[i]! });
        i += 1;
        j += 1;
      } else if ((dp[(i + 1) * cols + j] ?? 0) >= (dp[i * cols + (j + 1)] ?? 0)) {
        rawOps.push({ op: "delete", text: midA[i]! });
        i += 1;
      } else {
        rawOps.push({ op: "insert", text: midB[j]! });
        j += 1;
      }
    }
    while (i < midA.length) {
      rawOps.push({ op: "delete", text: midA[i]! });
      i += 1;
    }
    while (j < midB.length) {
      rawOps.push({ op: "insert", text: midB[j]! });
      j += 1;
    }
  } else {
    for (const tok of midA) rawOps.push({ op: "delete", text: tok });
    for (const tok of midB) rawOps.push({ op: "insert", text: tok });
  }

  for (let k = n - suffix; k < n; k += 1) {
    rawOps.push({ op: "equal", text: a[k]! });
  }

  let addedTokens = 0;
  let removedTokens = 0;
  let unchangedTokens = 0;
  const merged: WordDiffChunk[] = [];
  for (const op of rawOps) {
    if (op.text.trim().length > 0) {
      if (op.op === "insert") addedTokens += 1;
      else if (op.op === "delete") removedTokens += 1;
      else unchangedTokens += 1;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.op === op.op) {
      merged[merged.length - 1] = { op: prev.op, text: prev.text + op.text };
    } else {
      merged.push(op);
    }
  }

  const totalNonSpace = addedTokens + removedTokens + unchangedTokens;
  const unchangedRatio =
    totalNonSpace === 0 ? 1 : Math.round((unchangedTokens / totalNonSpace) * 1000) / 1000;

  return Object.freeze({
    chunks: Object.freeze(merged.map((c) => Object.freeze(c))),
    addedTokens,
    removedTokens,
    unchangedTokens,
    unchangedRatio,
  });
}

/**
 * 스냅샷 복원 직전 현재 작업본을 자동 백업 스냅샷으로 보존한 뒤 비파괴 복원한다.
 */
export function restoreSceneFromSnapshot(
  currentScene: ScriptSceneCard,
  targetSnapshot: SceneSnapshotRecord,
  restoredAtIso: string,
): {
  readonly restoredScene: ScriptSceneCard;
  readonly autoBackupSnapshot: SceneSnapshotRecord;
} {
  if (currentScene.id !== targetSnapshot.sceneId) {
    throw new Error("다른 씬의 스냅샷은 복원할 수 없습니다.");
  }
  const autoBackupSnapshot = createSceneSnapshot(
    currentScene,
    "복원 직전 자동 백업",
    restoredAtIso,
  );
  const restoredScene: ScriptSceneCard = Object.freeze({
    ...currentScene,
    title: targetSnapshot.title,
    body: targetSnapshot.body,
    cutNotes: targetSnapshot.cutNotes,
  });
  return Object.freeze({ restoredScene, autoBackupSnapshot });
}

interface TrieNode {
  readonly next: Map<string, number>;
  fail: number;
  readonly outputs: { readonly surface: string; readonly entity: CodexEntityEntry }[];
}

export interface CompiledCodexMatcher {
  readonly nodes: readonly TrieNode[];
  readonly patternCount: number;
}

/**
 * Codex 사전(정본 + 별칭)을 Aho-Corasick 오토마톤으로 컴파일한다.
 */
export function compileCodexMatcher(
  entries: readonly CodexEntityEntry[],
): CompiledCodexMatcher {
  const nodes: TrieNode[] = [{ next: new Map(), fail: 0, outputs: [] }];
  let patternCount = 0;

  const insertPattern = (rawSurface: string, entity: CodexEntityEntry): void => {
    const surface = rawSurface.trim();
    if (!surface) return;
    const normalized = surface.toLocaleLowerCase();
    let state = 0;
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i]!;
      let nextState = nodes[state]!.next.get(ch);
      if (nextState === undefined) {
        nextState = nodes.length;
        nodes.push({ next: new Map(), fail: 0, outputs: [] });
        nodes[state]!.next.set(ch, nextState);
      }
      state = nextState;
    }
    nodes[state]!.outputs.push({ surface, entity });
    patternCount += 1;
  };

  for (const entity of entries) {
    insertPattern(entity.canonical, entity);
    for (const alias of entity.aliases) {
      insertPattern(alias, entity);
    }
  }

  // BFS로 failure link 구축
  const queue: number[] = [];
  for (const child of nodes[0]!.next.values()) {
    nodes[child]!.fail = 0;
    queue.push(child);
  }
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const [ch, child] of nodes[curr]!.next.entries()) {
      queue.push(child);
      let failState = nodes[curr]!.fail;
      while (failState !== 0 && !nodes[failState]!.next.has(ch)) {
        failState = nodes[failState]!.fail;
      }
      const fallback = nodes[failState]!.next.get(ch) ?? 0;
      nodes[child]!.fail = fallback;
      for (const out of nodes[fallback]!.outputs) {
        nodes[child]!.outputs.push(out);
      }
    }
  }

  return Object.freeze({ nodes: Object.freeze(nodes), patternCount });
}

function isAsciiWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/u.test(ch);
}

/**
 * 대본 텍스트를 단일 O(N) 패스로 스캔해 특수 문법 없는 Codex 별칭 매치와 경고를 반환한다.
 */
export function scanTextForCodexMatches(
  text: string,
  matcher: CompiledCodexMatcher,
): readonly CodexHoverMatch[] {
  if (!text || matcher.patternCount === 0) return Object.freeze([]);
  const lower = text.toLocaleLowerCase();
  const candidates: CodexHoverMatch[] = [];
  let state = 0;

  for (let i = 0; i < lower.length; i += 1) {
    const ch = lower[i]!;
    while (state !== 0 && !matcher.nodes[state]!.next.has(ch)) {
      state = matcher.nodes[state]!.fail;
    }
    state = matcher.nodes[state]!.next.get(ch) ?? 0;
    const outputs = matcher.nodes[state]!.outputs;
    if (outputs.length === 0) continue;

    for (const out of outputs) {
      const len = out.surface.length;
      const start = i - len + 1;
      const end = i + 1;
      const surfaceIsAscii = /^[A-Za-z0-9_\s-]+$/u.test(out.surface);
      if (surfaceIsAscii) {
        if (isAsciiWordChar(text[start - 1]) || isAsciiWordChar(text[end])) {
          continue;
        }
      }
      const isRetired = out.entity.status === "deprecated" || out.entity.status === "quarantined";
      const warningKo =
        out.entity.status === "deprecated"
          ? `폐기된 설정 '${out.entity.canonical}'이(가) 대본에 언급되었습니다.`
          : out.entity.status === "quarantined"
            ? `격리된 설정 '${out.entity.canonical}'이(가) 대본에 언급되었습니다.`
            : null;
      candidates.push(
        Object.freeze({
          entityId: out.entity.id,
          kind: out.entity.kind,
          status: out.entity.status,
          canonical: out.entity.canonical,
          matchedSurface: text.slice(start, end),
          startOffset: start,
          endOffset: end,
          severity: isRetired ? "warning" : "info",
          warningKo,
          summary: out.entity.summary,
          voiceTone: out.entity.voiceTone,
          paletteOklch: out.entity.paletteOklch,
          lastSeenEpisode: out.entity.lastSeenEpisode,
        }),
      );
    }
  }

  // 시작 위치 오름차순, 동일 시작점이면 최장 일치 우선으로 비중첩 선택
  candidates.sort(
    (a, b) =>
      a.startOffset - b.startOffset ||
      (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset),
  );
  const resolved: CodexHoverMatch[] = [];
  let lastEnd = -1;
  for (const match of candidates) {
    if (match.startOffset >= lastEnd) {
      resolved.push(match);
      lastEnd = match.endOffset;
    }
  }
  return Object.freeze(resolved);
}
