/**
 * 원고 → 스토리월드 초안 "제안" 추출기.
 *
 * 원고 텍스트에서 확정할 수 있는 신호만 뽑는다.
 * - 장면 경계: 장면/씬/컷 번호, S#3, `* * *` 같은 구분선, 빈 줄 반복, 마크다운 헤딩, 회차 제목.
 * - 등장인물·장소: 등록된 이름·별칭의 글자 일치만(조사 허용). 같은 이름이 둘 이상 등록되어 있으면
 *   자동으로 정하지 않고 후보로 남긴다.
 * - 시간 단서: "다음 날", "그날 밤", "3년 전" 같은 명시 표현을 문자열 그대로 모은다.
 *
 * 하지 않는 것: 사실·전제·지식·감정 같은 의미 필드를 추정해 채우는 일, 장소 이름을 형태소로
 * 추측하는 일, 시간 표현을 숫자 시간 값으로 바꾸는 일. 이런 칸은 비워 두고 "미입력"으로 센다.
 * 이 파일은 네트워크·저장소를 쓰지 않는 순수 함수다. 같은 입력이면 항상 같은 결과가 나온다.
 *
 * 크기: 입력 글자 수에 선형이다(글자 수 × 등록된 이름 수). 긴 원고에서 메인 스레드를 오래
 * 막지 않도록 줄 묶음·장면 묶음 단위로 작업을 끊는 제너레이터 구조이며, 비동기 실행기는 묶음 사이에
 * 제어권을 돌려준다. 동기 실행기와 비동기 실행기는 같은 제너레이터를 쓰므로 결과가 같다.
 */

export const MANUSCRIPT_MAX_CHARS = 1_000_000;
export const MANUSCRIPT_MAX_SCENES = 1_000;
export const MANUSCRIPT_MAX_SURFACES = 600;
export const MANUSCRIPT_EXCERPT_LENGTH = 240;
export const MANUSCRIPT_MAX_TIME_CUES = 8;
/** 연속 빈 줄이 이만큼 이상이면 장면 경계로 본다. */
export const MANUSCRIPT_BLANK_RUN = 2;
const LINES_PER_CHUNK = 4_000;
const SCENES_PER_CHUNK = 24;

export interface ManuscriptNameEntry {
  readonly kind: "character" | "location";
  /** 등록부 안에서 유일한 열쇠(인물과 장소의 id가 같아도 겹치지 않게 종류를 붙인다). */
  readonly id: string;
  /** 문서에 쓰이는 실제 값: 인물이면 인물 id, 장소이면 장소 이름. */
  readonly refId: string;
  readonly name: string;
  readonly aliases: readonly string[];
}

export type ManuscriptBoundaryKind = "start" | "scene-number" | "separator" | "blank-lines" | "heading" | "manual";

export interface ManuscriptBoundary {
  /** 장면이 시작하는 글자 위치(UTF-16 코드 유닛). */
  readonly offset: number;
  readonly kind: ManuscriptBoundaryKind;
  /** 경계를 만든 표지 줄 원문. 없으면 빈 문자열. */
  readonly marker: string;
  /** 1부터 세는 줄 번호. */
  readonly line: number;
  /** 표지 줄에서 읽은 제목. 없으면 undefined(제목을 지어내지 않는다). */
  readonly title?: string;
  /** 회차 제목 줄에서 읽은 회차 번호. */
  readonly episodeNumber?: number;
}

export interface ManuscriptCharacterMatch {
  /** 가장 먼저 나온 표기. */
  readonly surface: string;
  readonly count: number;
  /** 길이 1이면 확정, 2 이상이면 같은 이름이 여러 명 등록된 동명이인이라 자동 배정하지 않는다. */
  readonly candidateIds: readonly string[];
}

export interface ManuscriptLocationMatch {
  readonly entryId: string;
  readonly surface: string;
  readonly count: number;
}

export interface ManuscriptSceneDraft {
  /** 장면 시작 위치로 만든 키. 경계를 편집해도 같은 위치의 장면은 같은 키를 갖는다. */
  readonly key: string;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly title: string;
  /** 제목을 표지에서 읽었는가. false면 "장면 N" 같은 기본 이름이다. */
  readonly titleFromMarker: boolean;
  readonly boundary: ManuscriptBoundaryKind;
  readonly marker: string;
  readonly episodeNumber?: number;
  readonly charCount: number;
  readonly excerpt: string;
  readonly characters: readonly ManuscriptCharacterMatch[];
  readonly locations: readonly ManuscriptLocationMatch[];
  /** 장소를 하나로 정할 수 있을 때만 값이 있다(표지 줄 우선, 아니면 본문에서 하나만 언급). */
  readonly locationEntryId?: string;
  readonly timeCues: readonly string[];
}

export interface ManuscriptWarning {
  readonly code: "too-long" | "too-many-scenes" | "empty-scene" | "short-name-skipped" | "surface-limit";
  readonly message: string;
  readonly sceneKey?: string;
}

export interface ManuscriptExtractionStats {
  readonly textLength: number;
  readonly lines: number;
  readonly surfaces: number;
  /** 이름 일치를 위해 훑은 글자 수(장면 길이 × 이름 수의 합). 선형성 점검에 쓴다. */
  readonly scannedCharacters: number;
  /** 작업을 끊은 지점 수. 비동기 실행기는 이 지점마다 제어권을 돌려준다. */
  readonly chunks: number;
}

export interface ManuscriptExtraction {
  readonly boundaries: readonly ManuscriptBoundary[];
  readonly scenes: readonly ManuscriptSceneDraft[];
  readonly warnings: readonly ManuscriptWarning[];
  readonly stats: ManuscriptExtractionStats;
}

export interface ManuscriptExtractionOptions {
  readonly maxChars?: number;
  readonly maxScenes?: number;
  readonly blankRun?: number;
  /** 이미 정한 경계로 장면을 다시 도출한다. 생략하면 원고에서 경계를 찾는다. */
  readonly boundaries?: readonly ManuscriptBoundary[];
}

// ── 줄 분류 ─────────────────────────────────────────────────────────────

const SCENE_MARKER_PATTERNS: readonly RegExp[] = [
  // S#3. 거실 / 낮 · S#3 · SC.3
  /^(?:S#|SC\.?)\s*(\d{1,4})(?![\p{L}\p{N}])\s*[.):\-–—]?\s*(.*)$/iu,
  // 장면 3 · 씬 3 · 신 3 · 컷 3 · Scene 3 · CUT 3 · [장면 3] · (씬 3) · 【씬 3】
  /^[[(【<「]?\s*(?:장면|씬|신|컷|scene|cut)\s*[#.]?\s*(\d{1,4})(?![\p{L}\p{N}])\s*[\])】>」]?\s*[.):\-–—|]?\s*(.*)$/iu,
  // 3장면 · 3씬 · 3컷
  /^(\d{1,4})\s*(?:장면|씬|컷)(?![\p{L}\p{N}])\s*[.):\-–—|]?\s*(.*)$/u,
  // #3 · #3. 거실 (샵 바로 뒤 숫자, 마크다운 헤딩과 구별)
  /^[#＃]\s*(\d{1,4})(?![\p{L}\p{N}])\s*[.):\-–—]?\s*(.*)$/u,
];

const EPISODE_HEADING_PATTERNS: readonly RegExp[] = [
  /^(?:제\s*)?(\d{1,4})\s*화(?![가-힣])\s*[.):\-–—|]?\s*(.*)$/u,
  /^(?:ep|episode)\.?\s*(\d{1,4})(?![\p{L}\p{N}])\s*[.):\-–—|]?\s*(.*)$/iu,
];

const SEPARATOR_PATTERNS: readonly RegExp[] = [
  /^(?:\*\s*){3,}$/u,
  /^(?:[-–—_=~·]\s*){3,}$/u,
  /^(?:[◇◆□■○●☆★※]\s*){2,}$/u,
  /^#{3,}$/u,
];

const MARKDOWN_HEADING = /^#{1,3}\s+(\S.*)$/u;

function stripLeadingPunctuation(text: string): string {
  return text.replace(/^[\s.):\-–—|/·:]+/u, "").trim();
}

interface LineInfo {
  readonly kind: "blank" | "scene-number" | "episode" | "separator" | "heading" | "text";
  readonly title?: string;
  readonly episodeNumber?: number;
  readonly sceneNumber?: number;
}

function classifyLine(trimmed: string): LineInfo {
  if (trimmed === "") return { kind: "blank" };
  if (trimmed.length <= 120) {
    for (const pattern of SEPARATOR_PATTERNS) if (pattern.test(trimmed)) return { kind: "separator" };
    for (const pattern of SCENE_MARKER_PATTERNS) {
      const match = pattern.exec(trimmed);
      if (match) {
        const rest = stripLeadingPunctuation(match[2] ?? "");
        // 번호만 있는 표지는 표지 글자 그대로 제목으로 쓴다(번호는 원고에 명시된 값이다).
        return { kind: "scene-number", sceneNumber: Number(match[1]), title: rest || trimmed };
      }
    }
    if (trimmed.length <= 60) {
      for (const pattern of EPISODE_HEADING_PATTERNS) {
        const match = pattern.exec(trimmed);
        if (match) {
          const rest = stripLeadingPunctuation(match[2] ?? "");
          return { kind: "episode", episodeNumber: Number(match[1]), ...(rest ? { title: rest } : {}) };
        }
      }
    }
    const heading = MARKDOWN_HEADING.exec(trimmed);
    if (heading) return { kind: "heading", title: (heading[1] ?? "").trim() };
  }
  return { kind: "text" };
}

const BOUNDARY_PRIORITY: Readonly<Record<ManuscriptBoundaryKind, number>> = {
  start: 0,
  "blank-lines": 1,
  separator: 2,
  heading: 3,
  "scene-number": 4,
  manual: 5,
};

/** 아직 장면을 열지 않은 경계 신호들. 다음 본문 줄에서 하나의 경계로 합쳐진다. */
interface PendingBoundary {
  kind: ManuscriptBoundaryKind;
  marker: string;
  /** 장면 번호 표지나 마크다운 헤딩에서 읽은 장면 제목. */
  sceneTitle?: string;
  episodeNumber?: number;
  episodeTitle?: string;
  /** 표지 줄이 있으면 장면은 그 줄에서 시작한다(구분선·빈 줄은 다음 본문 줄에서 시작). */
  anchorOffset?: number;
  anchorLine?: number;
}

function mergePending(current: PendingBoundary | null, next: PendingBoundary): PendingBoundary {
  if (!current) return { ...next };
  const stronger = BOUNDARY_PRIORITY[next.kind] >= BOUNDARY_PRIORITY[current.kind] ? next : current;
  const weaker = stronger === next ? current : next;
  const sceneTitle = stronger.sceneTitle ?? weaker.sceneTitle;
  const episodeNumber = next.episodeNumber ?? current.episodeNumber;
  const episodeTitle = next.episodeTitle ?? current.episodeTitle;
  const anchorOffset = current.anchorOffset ?? next.anchorOffset;
  const anchorLine = current.anchorLine ?? next.anchorLine;
  return {
    kind: stronger.kind,
    marker: stronger.marker || weaker.marker,
    ...(sceneTitle === undefined ? {} : { sceneTitle }),
    ...(episodeNumber === undefined ? {} : { episodeNumber }),
    ...(episodeTitle === undefined ? {} : { episodeTitle }),
    ...(anchorOffset === undefined ? {} : { anchorOffset }),
    ...(anchorLine === undefined ? {} : { anchorLine }),
  };
}

// ── 경계 찾기 (제너레이터 단계) ──────────────────────────────────────────

interface BoundaryScan {
  readonly boundaries: readonly ManuscriptBoundary[];
  readonly lines: number;
}

function* scanBoundaries(
  text: string,
  blankRun: number,
): Generator<"chunk", BoundaryScan, void> {
  const boundaries: ManuscriptBoundary[] = [];
  let pending: PendingBoundary | null = null;
  let blankCount = 0;
  let offset = 0;
  let lineNumber = 0;
  let started = false;
  let currentEpisode: number | undefined;

  while (offset <= text.length) {
    const nextNewline = text.indexOf("\n", offset);
    const lineEnd = nextNewline === -1 ? text.length : nextNewline;
    const raw = text.slice(offset, lineEnd);
    const trimmed = raw.replace(/\r$/u, "").trim();
    lineNumber += 1;
    const info = classifyLine(trimmed);
    const lineStart = offset + (raw.length - raw.trimStart().length);

    if (info.kind === "blank") {
      blankCount += 1;
    } else {
      if (blankCount >= blankRun && started) {
        pending = mergePending(pending, { kind: "blank-lines", marker: "" });
      }
      blankCount = 0;
      if (info.kind === "separator") {
        pending = mergePending(pending, { kind: "separator", marker: trimmed });
      } else if (info.kind === "episode") {
        pending = mergePending(pending, {
          kind: "heading",
          marker: trimmed,
          anchorOffset: lineStart,
          anchorLine: lineNumber,
          ...(info.episodeNumber === undefined ? {} : { episodeNumber: info.episodeNumber }),
          ...(info.title === undefined ? {} : { episodeTitle: info.title }),
        });
      } else {
        if (info.kind === "scene-number" || info.kind === "heading") {
          pending = mergePending(pending, {
            kind: info.kind,
            marker: trimmed,
            anchorOffset: lineStart,
            anchorLine: lineNumber,
            ...(info.title === undefined ? {} : { sceneTitle: info.title }),
          });
        }
        // 구분선·회차 제목·빈 줄은 장면의 일부가 아니라 경계 신호다. 첫 본문 줄이나 표지 줄에서 경계를 연다.
        if (!started || pending) {
          const resolved: PendingBoundary = pending ?? { kind: "start", marker: "" };
          const kind: ManuscriptBoundaryKind = !started && (resolved.kind === "separator" || resolved.kind === "blank-lines")
            ? "start"
            : resolved.kind;
          if (resolved.episodeNumber !== undefined) currentEpisode = resolved.episodeNumber;
          const title = resolved.sceneTitle ?? (kind === "heading" ? resolved.episodeTitle : undefined);
          const episodeNumber = resolved.episodeNumber ?? currentEpisode;
          boundaries.push({
            offset: resolved.anchorOffset ?? lineStart,
            kind,
            marker: resolved.marker,
            line: resolved.anchorLine ?? lineNumber,
            ...(title === undefined ? {} : { title }),
            ...(episodeNumber === undefined ? {} : { episodeNumber }),
          });
          started = true;
          pending = null;
        }
      }
    }

    if (lineNumber % LINES_PER_CHUNK === 0) yield "chunk";
    if (nextNewline === -1) break;
    offset = nextNewline + 1;
  }
  return { boundaries, lines: lineNumber };
}

/** 원고에서 장면 경계를 찾는다. 빈 입력이면 빈 배열이다. */
export function detectManuscriptBoundaries(
  text: string,
  options: Pick<ManuscriptExtractionOptions, "blankRun"> = {},
): readonly ManuscriptBoundary[] {
  const iterator = scanBoundaries(text, options.blankRun ?? MANUSCRIPT_BLANK_RUN);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value.boundaries;
}

// ── 이름 일치 ───────────────────────────────────────────────────────────

const PARTICLES: readonly string[] = [
  "에게서", "한테서", "으로서", "으로써", "이라고", "에게는", "에서는",
  "으로", "에게", "한테", "에서", "부터", "까지", "보다", "처럼", "만큼", "조차", "마저", "이랑", "께서", "이든", "이다", "이야", "라고", "이여", "이면", "라면",
  "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "만", "로", "랑", "아", "야", "씨", "님", "군", "양", "들",
].sort((a, b) => b.length - a.length);

function isHangul(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3;
}

function isAsciiWord(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/u.test(char);
}

/** 이름 바로 뒤가 조사(들)만 이어지다 끝나는가. 한글 낱말 안쪽이면 false. */
function followedByParticlesOnly(text: string, from: number): boolean {
  let index = from;
  while (index < text.length && isHangul(text[index])) {
    const rest = text.slice(index, index + 4);
    const particle = PARTICLES.find((candidate) => rest.startsWith(candidate));
    if (!particle) return false;
    index += particle.length;
  }
  return true;
}

function acceptMatch(text: string, start: number, surface: string): boolean {
  const first = surface[0];
  const last = surface.at(-1);
  const before = start > 0 ? text[start - 1] : undefined;
  const after = text[start + surface.length];
  if (isHangul(first) && isHangul(before)) return false;
  if (isAsciiWord(first) && isAsciiWord(before)) return false;
  if (isHangul(last)) return after === undefined || !isHangul(after) || followedByParticlesOnly(text, start + surface.length);
  if (isAsciiWord(last)) return !isAsciiWord(after);
  return true;
}

interface SurfaceIndexEntry {
  readonly surface: string;
  readonly entryIds: readonly string[];
}

interface SurfaceIndex {
  readonly surfaces: readonly SurfaceIndexEntry[];
  readonly entryById: ReadonlyMap<string, ManuscriptNameEntry>;
  readonly warnings: readonly ManuscriptWarning[];
}

function buildSurfaceIndex(register: readonly ManuscriptNameEntry[]): SurfaceIndex {
  const warnings: ManuscriptWarning[] = [];
  const bySurface = new Map<string, string[]>();
  const entryById = new Map<string, ManuscriptNameEntry>();
  for (const entry of register) {
    entryById.set(entry.id, entry);
    for (const raw of [entry.name, ...entry.aliases]) {
      const surface = raw.trim();
      if (Array.from(surface).length < 2) {
        if (surface.length > 0) {
          warnings.push({ code: "short-name-skipped", message: `한 글자 이름 ‘${surface}’은(는) 다른 낱말과 겹치기 쉬워 자동 일치에서 제외했어요.` });
        }
        continue;
      }
      const ids = bySurface.get(surface) ?? [];
      if (!ids.includes(entry.id)) ids.push(entry.id);
      bySurface.set(surface, ids);
    }
  }
  let surfaces = [...bySurface.entries()].map(([surface, entryIds]) => ({ surface, entryIds }));
  surfaces.sort((a, b) => b.surface.length - a.surface.length || a.surface.localeCompare(b.surface));
  if (surfaces.length > MANUSCRIPT_MAX_SURFACES) {
    warnings.push({ code: "surface-limit", message: `등록된 이름이 ${surfaces.length}개라 앞의 ${MANUSCRIPT_MAX_SURFACES}개만 일치에 사용했어요.` });
    surfaces = surfaces.slice(0, MANUSCRIPT_MAX_SURFACES);
  }
  return { surfaces, entryById, warnings };
}

interface SceneMatches {
  readonly characters: readonly ManuscriptCharacterMatch[];
  readonly locations: readonly ManuscriptLocationMatch[];
  readonly scanned: number;
}

function matchNames(slice: string, index: SurfaceIndex): SceneMatches {
  const claimed: [number, number][] = [];
  const overlaps = (start: number, end: number) => claimed.some(([s, e]) => start < e && end > s);
  const characters = new Map<string, { surface: string; count: number; candidateIds: readonly string[]; first: number }>();
  const locations = new Map<string, { surface: string; count: number; first: number }>();
  let scanned = 0;
  for (const { surface, entryIds } of index.surfaces) {
    scanned += slice.length;
    let from = 0;
    for (;;) {
      const at = slice.indexOf(surface, from);
      if (at < 0) break;
      from = at + surface.length;
      if (overlaps(at, at + surface.length) || !acceptMatch(slice, at, surface)) continue;
      claimed.push([at, at + surface.length]);
      const kinds = new Set(entryIds.map((id) => index.entryById.get(id)?.kind));
      if (kinds.has("location") && entryIds.length === 1) {
        const entryId = entryIds[0] ?? "";
        const found = locations.get(entryId);
        if (!found) {
          locations.set(entryId, { surface, count: 1, first: at });
        } else {
          found.count += 1;
          if (at < found.first) {
            found.first = at;
            found.surface = surface;
          }
        }
      } else {
        const characterIds = entryIds.filter((id) => index.entryById.get(id)?.kind === "character");
        if (characterIds.length === 0) continue;
        const key = [...characterIds].sort().join("|");
        const found = characters.get(key);
        if (!found) {
          characters.set(key, { surface, count: 1, candidateIds: [...characterIds].sort(), first: at });
        } else {
          found.count += 1;
          if (at < found.first) {
            found.first = at;
            found.surface = surface;
          }
        }
      }
    }
  }
  return {
    characters: [...characters.values()]
      .sort((a, b) => a.first - b.first)
      .map(({ surface, count, candidateIds }) => ({ surface, count, candidateIds })),
    locations: [...locations.entries()]
      .sort((a, b) => a[1].first - b[1].first)
      .map(([entryId, { surface, count }]) => ({ entryId, surface, count })),
    scanned,
  };
}

// ── 시간 단서 ───────────────────────────────────────────────────────────

const TIME_CUE_PATTERNS: readonly RegExp[] = [
  /그\s*다음\s*날(?:\s*(?:아침|낮|저녁|밤|새벽))?/gu,
  /다음\s*날(?:\s*(?:아침|낮|저녁|밤|새벽))?/gu,
  /이튿날/gu,
  /그날\s*(?:아침|낮|저녁|밤|새벽)/gu,
  /(?:이틀|사흘|나흘|며칠|몇\s*(?:일|주|달|년))\s*(?:뒤|후|전)/gu,
  /\d{1,4}\s*(?:일|주일|주|개월|달|년|시간)\s*(?:뒤|후|전)/gu,
  /한\s*(?:달|해|주)\s*(?:뒤|후|전)/gu,
  /[[(（]\s*(?:회상|과거|플래시백|flashback)\s*[\])）]/giu,
];

function collectTimeCues(slice: string): readonly string[] {
  const found: { text: string; at: number }[] = [];
  for (const pattern of TIME_CUE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of slice.matchAll(pattern)) {
      found.push({ text: match[0].replace(/\s+/gu, " ").trim(), at: match.index });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const unique: string[] = [];
  for (const item of found) {
    if (!unique.includes(item.text)) unique.push(item.text);
    if (unique.length >= MANUSCRIPT_MAX_TIME_CUES) break;
  }
  return unique;
}

// ── 장면 도출 ───────────────────────────────────────────────────────────

/** 장면 끝에 붙은 구분선·빈 줄(다음 장면의 경계 표지)을 뺀 길이. */
function contentLength(slice: string): number {
  let end = slice.length;
  while (end > 0) {
    const lastNewline = slice.lastIndexOf("\n", end - 1);
    const kind = classifyLine(slice.slice(lastNewline + 1, end).trim()).kind;
    if (kind !== "blank" && kind !== "separator") break;
    end = lastNewline < 0 ? 0 : lastNewline;
  }
  return end;
}

/** 장면 맨 앞의 표지 줄(장면 번호·회차 제목·구분선·헤딩)과 빈 줄을 건너뛴 본문. */
function stripLeadingMarkers(slice: string): string {
  let offset = 0;
  while (offset < slice.length) {
    const nextNewline = slice.indexOf("\n", offset);
    const lineEnd = nextNewline === -1 ? slice.length : nextNewline;
    const kind = classifyLine(slice.slice(offset, lineEnd).trim()).kind;
    if (kind === "text") break;
    offset = nextNewline === -1 ? slice.length : nextNewline + 1;
  }
  return slice.slice(offset).trim();
}

function excerptOf(body: string): string {
  const flattened = body.slice(0, MANUSCRIPT_EXCERPT_LENGTH * 4).replace(/\s+/gu, " ").trim();
  const chars = Array.from(flattened);
  return chars.length <= MANUSCRIPT_EXCERPT_LENGTH ? flattened : `${chars.slice(0, MANUSCRIPT_EXCERPT_LENGTH - 1).join("")}…`;
}

function locationFromHeader(header: string, index: SurfaceIndex): string | undefined {
  if (!header) return undefined;
  const ids = new Set<string>();
  for (const { surface, entryIds } of index.surfaces) {
    if (entryIds.length !== 1) continue;
    const entryId = entryIds[0] ?? "";
    if (index.entryById.get(entryId)?.kind !== "location") continue;
    let from = 0;
    for (;;) {
      const at = header.indexOf(surface, from);
      if (at < 0) break;
      from = at + surface.length;
      if (acceptMatch(header, at, surface)) ids.add(entryId);
    }
  }
  return ids.size === 1 ? [...ids][0] : undefined;
}

function* deriveScenes(
  text: string,
  boundaries: readonly ManuscriptBoundary[],
  index: SurfaceIndex,
  maxScenes: number,
): Generator<"chunk", { scenes: ManuscriptSceneDraft[]; warnings: ManuscriptWarning[]; scanned: number }, void> {
  const scenes: ManuscriptSceneDraft[] = [];
  const warnings: ManuscriptWarning[] = [];
  let scanned = 0;
  let currentEpisode: number | undefined;
  const limit = Math.min(boundaries.length, maxScenes);
  if (boundaries.length > maxScenes) {
    warnings.push({ code: "too-many-scenes", message: `장면이 ${boundaries.length}개라 앞의 ${maxScenes}개만 가져왔어요. 원고를 나눠서 가져오세요.` });
  }
  for (let i = 0; i < limit; i += 1) {
    const boundary = boundaries[i];
    if (!boundary) continue;
    const rawEnd = i + 1 < boundaries.length ? (boundaries[i + 1]?.offset ?? text.length) : text.length;
    const rawSlice = text.slice(boundary.offset, rawEnd);
    const slice = rawSlice.slice(0, contentLength(rawSlice));
    const end = boundary.offset + slice.length;
    if (boundary.episodeNumber !== undefined) currentEpisode = boundary.episodeNumber;
    const matches = matchNames(slice, index);
    scanned += matches.scanned;
    const headerLocation = boundary.title ? locationFromHeader(boundary.title, index) : undefined;
    const locationEntryId = headerLocation ?? (matches.locations.length === 1 ? matches.locations[0]?.entryId : undefined);
    const key = `s${boundary.offset}`;
    const title = boundary.title ?? "";
    const body = stripLeadingMarkers(slice);
    if (body.length === 0) {
      warnings.push({ code: "empty-scene", sceneKey: key, message: `${i + 1}번째 장면에 본문이 없어요. 합치거나 지워도 되는지 확인해 주세요.` });
    }
    scenes.push({
      key,
      index: i,
      start: boundary.offset,
      end,
      title: title || `장면 ${i + 1}`,
      titleFromMarker: title.length > 0,
      boundary: boundary.kind,
      marker: boundary.marker,
      ...(currentEpisode === undefined ? {} : { episodeNumber: currentEpisode }),
      charCount: Array.from(slice.trim()).length,
      excerpt: excerptOf(body),
      characters: matches.characters,
      locations: matches.locations,
      ...(locationEntryId === undefined ? {} : { locationEntryId }),
      timeCues: collectTimeCues(slice),
    });
    if ((i + 1) % SCENES_PER_CHUNK === 0) yield "chunk";
  }
  return { scenes, warnings, scanned };
}

function* extractSteps(
  text: string,
  register: readonly ManuscriptNameEntry[],
  options: ManuscriptExtractionOptions,
): Generator<"chunk", ManuscriptExtraction, void> {
  const maxChars = options.maxChars ?? MANUSCRIPT_MAX_CHARS;
  const maxScenes = options.maxScenes ?? MANUSCRIPT_MAX_SCENES;
  const warnings: ManuscriptWarning[] = [];
  let source = text;
  if (source.length > maxChars) {
    warnings.push({ code: "too-long", message: `원고가 ${source.length.toLocaleString("ko-KR")}자라 앞의 ${maxChars.toLocaleString("ko-KR")}자만 처리했어요. 회차별로 나눠서 가져오세요.` });
    source = source.slice(0, maxChars);
  }
  const index = buildSurfaceIndex(register);
  warnings.push(...index.warnings);

  let chunks = 0;
  let boundaries: readonly ManuscriptBoundary[];
  let lines: number;
  if (options.boundaries) {
    boundaries = [...options.boundaries].filter((b) => b.offset >= 0 && b.offset <= source.length).sort((a, b) => a.offset - b.offset);
    lines = source.length === 0 ? 0 : source.split("\n").length;
  } else {
    const scan = scanBoundaries(source, options.blankRun ?? MANUSCRIPT_BLANK_RUN);
    let step = scan.next();
    while (!step.done) {
      chunks += 1;
      yield "chunk";
      step = scan.next();
    }
    boundaries = step.value.boundaries;
    lines = step.value.lines;
  }

  const derive = deriveScenes(source, boundaries, index, maxScenes);
  let derived = derive.next();
  while (!derived.done) {
    chunks += 1;
    yield "chunk";
    derived = derive.next();
  }
  warnings.push(...derived.value.warnings);
  return {
    boundaries,
    scenes: derived.value.scenes,
    warnings,
    stats: {
      textLength: source.length,
      lines,
      surfaces: index.surfaces.length,
      scannedCharacters: derived.value.scanned,
      chunks,
    },
  };
}

/** 동기 실행. 짧은 원고나 테스트용이다. 긴 원고는 extractManuscriptAsync를 쓴다. */
export function extractManuscript(
  text: string,
  register: readonly ManuscriptNameEntry[],
  options: ManuscriptExtractionOptions = {},
): ManuscriptExtraction {
  const iterator = extractSteps(text, register, options);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

export interface ManuscriptAsyncHooks {
  /** 묶음 사이에 제어권을 돌려주는 함수. 기본은 setTimeout 0. */
  readonly yieldToHost?: () => Promise<void>;
  readonly onProgress?: (chunksDone: number) => void;
  readonly signal?: AbortSignal;
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

/** 묶음마다 제어권을 돌려주는 실행. signal로 취소할 수 있고, 결과는 동기 실행과 같다. */
export async function extractManuscriptAsync(
  text: string,
  register: readonly ManuscriptNameEntry[],
  options: ManuscriptExtractionOptions = {},
  hooks: ManuscriptAsyncHooks = {},
): Promise<ManuscriptExtraction> {
  const yieldToHost = hooks.yieldToHost ?? defaultYield;
  const iterator = extractSteps(text, register, options);
  let done = 0;
  let step = iterator.next();
  while (!step.done) {
    done += 1;
    hooks.onProgress?.(done);
    await yieldToHost();
    if (hooks.signal?.aborted) throw new DOMException("원고 읽기를 취소했어요.", "AbortError");
    step = iterator.next();
  }
  return step.value;
}

// ── 경계 편집 ───────────────────────────────────────────────────────────

/** 장면 index를 앞 장면에 합친다(경계를 지운다). 첫 장면은 합칠 앞 장면이 없다. */
export function removeManuscriptBoundary(
  boundaries: readonly ManuscriptBoundary[],
  index: number,
): readonly ManuscriptBoundary[] {
  if (index <= 0 || index >= boundaries.length) return boundaries;
  return boundaries.filter((_, position) => position !== index);
}

/**
 * 글자 위치 offset이 속한 줄의 시작에 새 경계를 넣는다. 이미 그 위치에 경계가 있거나 첫 경계보다 앞이면
 * 바꾸지 않는다.
 */
export function addManuscriptBoundaryAt(
  text: string,
  boundaries: readonly ManuscriptBoundary[],
  offset: number,
): readonly ManuscriptBoundary[] {
  if (offset < 0 || offset > text.length) return boundaries;
  const lineStart = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const first = boundaries[0];
  if (!first || lineStart <= first.offset) return boundaries;
  if (boundaries.some((boundary) => boundary.offset === lineStart)) return boundaries;
  const line = text.slice(0, lineStart).split("\n").length;
  const inserted: ManuscriptBoundary = { offset: lineStart, kind: "manual", marker: "", line };
  return [...boundaries, inserted].sort((a, b) => a.offset - b.offset);
}

/** 장면 안의 문단(빈 줄로 나뉨) 시작 위치. "여기서 장면 나누기" 버튼 위치를 만드는 데 쓴다. */
export function manuscriptParagraphStarts(text: string, start: number, end: number, maxItems = 60): readonly number[] {
  const slice = text.slice(start, end);
  const starts: number[] = [];
  const pattern = /\n[ \t\r]*\n+[ \t]*(?=\S)/gu;
  for (const match of slice.matchAll(pattern)) {
    starts.push(start + match.index + match[0].length);
    if (starts.length >= maxItems) break;
  }
  return starts;
}
