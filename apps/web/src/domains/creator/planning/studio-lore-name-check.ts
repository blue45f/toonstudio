/**
 * 작품 고유명사 사전 + 표기 일관성 검사.
 *
 * 메커니즘 정합:
 * - 사전의 단위 항목(canonical + aliases)은 사용자 문구 용어 레지스트리
 *   (shared/language/terminology.ts)의 "정본 표기 + 별칭" 개념을 작품 스코프로
 *   옮긴 것이다. 다만 그쪽은 제품 문구, 이쪽은 작품 안 고유명사가 대상이다.
 * - finding 모양은 대사 맞춤법 검사(DialogueSpellFinding)를 따른다:
 *   구간(start·end)·찾은 표기·고치기 후보·"의심" 어조의 설명. 자동 확정은 없고
 *   후보 제시까지가 이 모듈의 일이다 — 말투 지문·연속성 검사의 공통 원칙이다.
 *
 * 사전 출처 (전부 기존 정본에서 도출, 새 입력 없음):
 * - 바이블 캐릭터: 이름 + 별칭 (연속성 엔진의 정본)
 * - 바이블 장소: 이름 (별칭 필드가 없어 표제어만)
 * - 세계관 설정 항목(studio-world-lore): 이름 + 별칭
 *
 * 검출하는 것:
 * 1. 표기 흔들림(name-variant): 사전 표면형과 한 글자 안팎으로 다른 토큰.
 *    한국어 조사가 붙은 형태("아르카디아에서")는 조사를 떼고 어간으로 판정한다.
 * 2. 정본·별칭 혼용(name-alias-mix): 한 글에서 정본과 별칭이 함께 쓰인 경우.
 *    별칭만 쓰는 건 허용 — 흔들림이 아니라 선택이다. 혼용만 알린다.
 * 3. 미등록 고유명사 후보(unregistered-name): 사전에 없는데 두 번 이상 반복되는
 *    낱말. 고유명사인지 일반 낱말인지는 기계가 확정할 수 없어 info 로만 제안하고,
 *    등록 여부는 작가가 정한다.
 *
 * 한계 (정직하게): 공백 없는 다어절 표면형("침수된 옛 도서관")은 정확한 일치와
 * 혼용 판정에만 쓰고, 흔들림 판정은 단일 토큰 표면형으로만 한다. 토큰 경계를
 * 넘는 흔들림(띄어쓰기 차이)은 이 검사가 아니라 맞춤법 검사의 영역이다.
 */
import type { StudioStoryBible } from "../studio-story-bible";
import type { StudioLoreEntryKind, StudioWorldLore } from "./studio-world-lore";

export type LoreNameSourceKind = "character" | "location" | "lore";

export interface LoreNameDictionaryEntry {
  readonly sourceKind: LoreNameSourceKind;
  readonly sourceId: string;
  /** sourceKind === "lore" 일 때만 — 등록 동선에서 종류를 보여주기 위한 값. */
  readonly loreKind: StudioLoreEntryKind | null;
  readonly canonical: string;
  readonly aliases: readonly string[];
}

export type LoreNameDictionary = readonly LoreNameDictionaryEntry[];

export function buildLoreNameDictionary(
  bible: StudioStoryBible | null,
  lore: StudioWorldLore | null,
): LoreNameDictionary {
  const entries: LoreNameDictionaryEntry[] = [];
  for (const character of bible?.characters ?? []) {
    entries.push({
      sourceKind: "character",
      sourceId: character.id,
      loreKind: null,
      canonical: character.name,
      aliases: character.aliases,
    });
  }
  for (const location of bible?.locations ?? []) {
    entries.push({
      sourceKind: "location",
      sourceId: location.id,
      loreKind: null,
      canonical: location.name,
      aliases: [],
    });
  }
  for (const entry of lore?.entries ?? []) {
    entries.push({
      sourceKind: "lore",
      sourceId: entry.id,
      loreKind: entry.kind,
      canonical: entry.name,
      aliases: entry.aliases,
    });
  }
  return Object.freeze(entries);
}

/** 사전에 든 모든 표면형(정본·별칭) — 등록 UI가 "이미 있는 이름"을 거를 때 쓴다. */
export function loreDictionarySurfaces(
  dictionary: LoreNameDictionary,
): ReadonlySet<string> {
  const surfaces = new Set<string>();
  for (const entry of dictionary) {
    surfaces.add(entry.canonical.trim());
    for (const alias of entry.aliases) surfaces.add(alias.trim());
  }
  return surfaces;
}

export type LoreNameFindingCode =
  | "name-variant"
  | "name-alias-mix"
  | "unregistered-name";

export interface LoreNameFinding {
  readonly id: string;
  readonly code: LoreNameFindingCode;
  readonly severity: "warning" | "info";
  readonly start: number;
  readonly end: number;
  readonly found: string;
  /** 정본 표기 제안. 미등록 후보처럼 제안이 없으면 null. */
  readonly suggestion: string | null;
  /** 사전 항목 id. 미등록 후보는 null. */
  readonly sourceId: string | null;
  readonly message: string;
}

export interface LoreNameCheckOptions {
  /** 미등록 후보로 올릴 최소 반복 횟수. 기본 2. */
  readonly minRepeat?: number;
  /** 미등록 후보 상한. 기본 12 — 제안이 벽이 되면 검사가 버려진다. */
  readonly maxUnregistered?: number;
  /** 끄는 규칙. 의도된 흔들림(사투리 표기 등)이 많은 작품에서 규칙 단위로 끈다. */
  readonly disabledCodes?: readonly LoreNameFindingCode[];
}

export interface LoreNameCheckSummary {
  readonly findingCount: number;
  readonly variantCount: number;
  readonly aliasMixCount: number;
  readonly unregisteredCount: number;
}

// ── 한국어 토큰 처리 ─────────────────────────────────────────────────────

/** 이름 뒤에 붙는 대표 조사·어미 — 어간 판정에서 한 번 떼어낸다. 긴 것부터. */
const PARTICLE_SUFFIXES: readonly string[] = [
  "께서", "에서", "에게", "한테", "부터", "까지", "이랑", "으로",
  "은", "는", "이", "가", "을", "를", "의", "와", "과", "로", "도", "만", "에", "랑", "조차", "마저", "님", "씨",
].sort((a, b) => b.length - a.length);

/** 흔들림이 아니라 일상 낱말이라 미등록 후보에서 뺄 최소 목록. */
const COMMON_WORDS: ReadonlySet<string> = new Set([
  "그리고", "하지만", "그러나", "그래서", "그러면", "그런데", "지금", "다시", "모두", "우리",
  "자기", "이것", "그것", "저것", "무엇", "어디", "언제", "얼마", "정말", "진짜", "너무", "아주",
  "갑자기", "천천히", "조용히", "드디어", "마침내", "결국", "한편", "또한", "또는", "혹은", "마치",
  "처럼", "대로", "만큼", "사람", "마을", "도시", "바다", "하늘", "바람", "소리", "모습", "생각",
  "마음", "시간", "장소", "이야기", "친구", "가족", "왕국", "세계", "전부", "하나", "다시",
]);

interface HangulToken {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function hangulTokens(text: string): readonly HangulToken[] {
  const tokens: HangulToken[] = [];
  const pattern = /[가-힣]+/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return tokens;
}

/** 토큰 끝의 조사를 한 번 떼어낸 어간과, 뗀 조사(제안에 되붙일 때 사용). */
function splitParticle(token: string): { readonly stem: string; readonly particle: string } {
  for (const suffix of PARTICLE_SUFFIXES) {
    if (token.length > suffix.length + 1 && token.endsWith(suffix)) {
      return { stem: token.slice(0, token.length - suffix.length), particle: suffix };
    }
  }
  return { stem: token, particle: "" };
}

function levenshtein(a: string, b: string): number {
  const ac = [...a];
  const bc = [...b];
  if (ac.length === 0) return bc.length;
  if (bc.length === 0) return ac.length;
  let prev = Array.from({ length: bc.length + 1 }, (_, i) => i);
  for (let i = 1; i <= ac.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= bc.length; j += 1) {
      curr.push(Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (ac[i - 1] === bc[j - 1] ? 0 : 1),
      ));
    }
    prev = curr;
  }
  return prev[bc.length] ?? 0;
}

function variantThreshold(surfaceLength: number): number {
  if (surfaceLength <= 2) return 0; // 두 글자 이름은 흔들림 판정을 하지 않는다(오탐 방지)
  if (surfaceLength <= 4) return 1;
  return 2;
}

interface Occurrence {
  readonly entry: LoreNameDictionaryEntry;
  readonly surface: string;
  readonly isCanonical: boolean;
  readonly start: number;
  readonly end: number;
}

export function checkLoreNames(
  text: string,
  dictionary: LoreNameDictionary,
  options: LoreNameCheckOptions = {},
): readonly LoreNameFinding[] {
  const disabled = new Set(options.disabledCodes ?? []);
  const findings: LoreNameFinding[] = [];
  if (!text.trim() || dictionary.length === 0) return Object.freeze(findings);

  // 표면형 색인 — 단일 토큰 판정용과 원문 직접 탐색용을 나눈다.
  const singleTokenSurfaces: Array<{ entry: LoreNameDictionaryEntry; surface: string; isCanonical: boolean }> = [];
  const allSurfaces: Array<{ entry: LoreNameDictionaryEntry; surface: string; isCanonical: boolean }> = [];
  for (const entry of dictionary) {
    const forms = [
      { surface: entry.canonical, isCanonical: true },
      ...entry.aliases.map((alias) => ({ surface: alias, isCanonical: false })),
    ];
    for (const form of forms) {
      const surface = form.surface.trim();
      if (surface.length < 2) continue;
      allSurfaces.push({ entry, surface, isCanonical: form.isCanonical });
      if (!/\s/u.test(surface)) {
        singleTokenSurfaces.push({ entry, surface, isCanonical: form.isCanonical });
      }
    }
  }
  const surfaceSet = new Set(allSurfaces.map((form) => form.surface));

  // 정확한 등장 수집 (혼용 판정용) — 원문에서 표면형을 직접 찾는다.
  const occurrences: Occurrence[] = [];
  for (const form of allSurfaces) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(form.surface, from);
      if (at < 0) break;
      occurrences.push({
        entry: form.entry,
        surface: form.surface,
        isCanonical: form.isCanonical,
        start: at,
        end: at + form.surface.length,
      });
      from = at + form.surface.length;
    }
  }

  // 1) 흔들림 — 토큰 어간이 어떤 표면형과도 정확히 같지 않으면서 가깝다.
  if (!disabled.has("name-variant")) {
    for (const token of hangulTokens(text)) {
      const { stem, particle } = splitParticle(token.text);
      if (stem.length < 3) continue;
      if (surfaceSet.has(stem) || surfaceSet.has(token.text)) continue;
      // 표면형이 토큰 안에 정확히 들어 있으면(조사·접미 결합) 흔들림이 아니다.
      if (allSurfaces.some((form) => token.text.startsWith(form.surface))) continue;
      let best: { entry: LoreNameDictionaryEntry; surface: string; distance: number } | null = null;
      for (const form of singleTokenSurfaces) {
        if ([...form.surface][0] !== [...stem][0]) continue; // 첫 음절이 다르면 남의 이름으로 본다
        const threshold = variantThreshold([...form.surface].length);
        if (threshold === 0) continue;
        const distance = levenshtein(stem, form.surface);
        if (distance > 0 && distance <= threshold && (!best || distance < best.distance)) {
          best = { entry: form.entry, surface: form.surface, distance };
        }
      }
      if (best) {
        findings.push({
          id: `name-variant:${token.start}:${token.text}`,
          code: "name-variant",
          severity: "warning",
          start: token.start,
          end: token.end,
          found: token.text,
          suggestion: best.surface + particle,
          sourceId: best.entry.sourceId,
          message: `"${token.text}" — 사전의 "${best.entry.canonical}" 표기와 비슷해요. 같은 대상이라면 정본 "${best.surface}"로 맞추는 게 좋아요.`,
        });
      }
    }
  }

  // 2) 혼용 — 같은 글에서 정본과 별칭이 함께 등장.
  //    정본 안에 포함된 별칭 등장(예: 정본 "침수된 옛 도서관" 속 별칭 "옛 도서관")은
  //    별칭을 쓴 게 아니므로 걷어낸다.
  const standaloneOccurrences = occurrences.filter((occurrence) => {
    if (occurrence.isCanonical) return true;
    return !occurrences.some(
      (other) =>
        other.isCanonical
        && other.entry.sourceId === occurrence.entry.sourceId
        && other.start <= occurrence.start
        && occurrence.end <= other.end,
    );
  });
  if (!disabled.has("name-alias-mix")) {
    const byEntry = new Map<string, Occurrence[]>();
    for (const occurrence of standaloneOccurrences) {
      const list = byEntry.get(occurrence.entry.sourceId) ?? [];
      list.push(occurrence);
      byEntry.set(occurrence.entry.sourceId, list);
    }
    for (const [sourceId, list] of byEntry) {
      const hasCanonical = list.some((occurrence) => occurrence.isCanonical);
      if (!hasCanonical) continue;
      const entry = list[0]?.entry;
      if (!entry) continue;
      for (const occurrence of list) {
        if (occurrence.isCanonical) continue;
        findings.push({
          id: `name-alias-mix:${occurrence.start}:${occurrence.surface}`,
          code: "name-alias-mix",
          severity: "info",
          start: occurrence.start,
          end: occurrence.end,
          found: occurrence.surface,
          suggestion: entry.canonical,
          sourceId,
          message: `"${occurrence.surface}"는 "${entry.canonical}"의 별칭인데, 이 글에서는 정본 "${entry.canonical}"도 함께 쓰였어요. 한 글 안에서는 하나로 통일하는 게 좋아요.`,
        });
      }
    }
  }

  // 3) 미등록 후보 — 반복되는데 사전에 없는 어간.
  if (!disabled.has("unregistered-name")) {
    const minRepeat = options.minRepeat ?? 2;
    const maxUnregistered = options.maxUnregistered ?? 12;
    const counts = new Map<string, { count: number; first: HangulToken }>();
    for (const token of hangulTokens(text)) {
      const { stem } = splitParticle(token.text);
      if ([...stem].length < 2 || [...stem].length > 6) continue;
      if (surfaceSet.has(stem) || COMMON_WORDS.has(stem)) continue;
      if (allSurfaces.some((form) => form.surface.includes(stem) || stem.includes(form.surface))) continue;
      if (findings.some((finding) => finding.code === "name-variant" && finding.found === token.text)) continue;
      const current = counts.get(stem);
      if (current) current.count += 1;
      else counts.set(stem, { count: 1, first: token });
    }
    const candidates = [...counts.entries()]
      .filter(([, value]) => value.count >= minRepeat)
      .sort((a, b) => b[1].count - a[1].count || a[1].first.start - b[1].first.start)
      .slice(0, maxUnregistered);
    for (const [stem, value] of candidates) {
      findings.push({
        id: `unregistered-name:${value.first.start}:${stem}`,
        code: "unregistered-name",
        severity: "info",
        start: value.first.start,
        end: value.first.end,
        found: stem,
        suggestion: null,
        sourceId: null,
        message: `"${stem}"이(가) 이 글에 ${value.count}번 나오는데 설정 사전에 없어요. 고유명사라면 등록해 두면 다음부터 표기 흔들림까지 검사해요.`,
      });
    }
  }

  findings.sort((a, b) => a.start - b.start || a.code.localeCompare(b.code));
  return Object.freeze(findings);
}

export function summarizeLoreNameCheck(
  findings: readonly LoreNameFinding[],
): LoreNameCheckSummary {
  return Object.freeze({
    findingCount: findings.length,
    variantCount: findings.filter((finding) => finding.code === "name-variant").length,
    aliasMixCount: findings.filter((finding) => finding.code === "name-alias-mix").length,
    unregisteredCount: findings.filter((finding) => finding.code === "unregistered-name").length,
  });
}
