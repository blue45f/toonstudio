/**
 * 온디바이스 상시 크리에이티브 코파일럿 & 증분 작가 메모리 RAG 엔진.
 *
 * - 작가의 이전 회차 컷, 캐릭터 설정·말투, 스크롤 호흡(페이싱), 배색·광원 규칙을
 *   로컬 메모리에 증분 인덱싱한다(클라우드 토큰 0회, 서버 비용 ₩0).
 * - 작업 단계(storyboard → lineart → flatting → lighting → lettering → publish)에 맞춰
 *   하이브리드 BM25 + 256차원 밀집 코사인 유사도로 과거 컷 선례를 검색하고,
 *   작가 자신의 이전 회차·컷 출처(provenance citation)가 붙은 구체적 제안을 반환한다.
 * - 선택적으로 Chrome 내장 AI(`window.ai`) 또는 로컬 WebLLM 어댑터를 연결해
 *   근거 기반 보조 문구를 보강하며, 미지원 시 100% 결정론적 로컬 RAG로 폴백한다.
 */

export type CreatorWorkflowStage =
  | "storyboard" | "lineart" | "flatting" | "lighting" | "lettering" | "publish";
export type CopilotLocale = "ko" | "en";
export type CopilotSuggestionCategory =
  | "continuity" | "pacing" | "palette" | "dialogue-tone"
  | "lineart" | "lighting" | "lettering" | "publish-check";
export type MemoryRecordKind = "episode-cut" | "character-sheet" | "color-rule";
export type CopilotProviderKind = "local-hybrid-rag" | "chrome-builtin-ai" | "webllm-local";

export const CREATIVE_EMBEDDING_DIM = 256;
export const WORKFLOW_STAGE_ORDER: readonly CreatorWorkflowStage[] = [
  "storyboard", "lineart", "flatting", "lighting", "lettering", "publish",
];

export interface EpisodeCutMemory {
  readonly memoryId: string; readonly episodeNumber: number; readonly episodeTitle: string;
  readonly cutNumber: number; readonly stage: CreatorWorkflowStage; readonly summary: string;
  readonly characters: readonly string[];
  readonly dialogueSample?: string; readonly dialogueTone?: string;
  readonly pacingBeats?: number; readonly panelHeightPx?: number;
  readonly lightingMood?: string; readonly paletteTokens?: readonly string[];
  readonly lineWeightNote?: string; readonly tags?: readonly string[];
  readonly recordedAtIso: string;
}

export interface CharacterMemorySheet {
  readonly characterId: string; readonly name: string; readonly traits: readonly string[];
  readonly speechStyle: string; readonly signaturePaletteTokens: readonly string[];
  readonly lineWeightRule?: string; readonly firstSeenEpisode: number;
}

export interface ColoringRuleMemory {
  readonly ruleId: string; readonly title: string; readonly stage: CreatorWorkflowStage;
  readonly mood: string; readonly paletteTokens: readonly string[];
  readonly guidance: string; readonly sourceEpisodeNumber: number;
}

export interface IndexEpisodeInput {
  readonly episodeNumber: number; readonly episodeTitle: string;
  readonly cuts: readonly EpisodeCutMemory[];
  readonly characters?: readonly CharacterMemorySheet[];
  readonly colorRules?: readonly ColoringRuleMemory[];
}

export interface ProvenanceCitation {
  readonly memoryId: string; readonly kind: MemoryRecordKind;
  readonly episodeNumber: number; readonly episodeTitle: string; readonly cutNumber?: number;
  readonly excerpt: string;
  readonly bm25Score: number; readonly cosineScore: number; readonly hybridScore: number;
}

export interface CopilotSuggestion {
  readonly id: string; readonly stage: CreatorWorkflowStage;
  readonly category: CopilotSuggestionCategory;
  readonly headline: string; readonly actionableNote: string;
  readonly confidence: number; readonly citations: readonly ProvenanceCitation[];
}

export interface CopilotAdviceRequest {
  readonly stage: CreatorWorkflowStage; readonly query: string;
  readonly activeCharacters?: readonly string[];
  readonly currentPacingBeats?: number; readonly currentPaletteTokens?: readonly string[];
  readonly locale?: CopilotLocale; readonly maxSuggestions?: number; readonly useLocalLlm?: boolean;
}

export interface LocalOnDeviceLlmAdapter {
  readonly providerName: "chrome-builtin-ai" | "webllm-local";
  isAvailable(): Promise<boolean> | boolean;
  generateGroundedNote(prompt: string): Promise<string>;
}

export interface CopilotAdviceResponse {
  readonly stage: CreatorWorkflowStage; readonly nextStage: CreatorWorkflowStage | null;
  readonly locale: CopilotLocale; readonly provider: CopilotProviderKind;
  readonly suggestions: readonly CopilotSuggestion[];
  readonly retrievedCitations: readonly ProvenanceCitation[];
  readonly llmRefinementNote: string | null;
  readonly retrievalLatencyMs: number;
  readonly cloudTokensUsed: 0; readonly estimatedServerCostKrw: 0;
}

export interface CopilotMemoryStats {
  readonly totalIndexedDocs: number; readonly episodeCount: number;
  readonly cutCount: number; readonly characterCount: number; readonly colorRuleCount: number;
  readonly vocabularySize: number; readonly avgDocLength: number;
}

export interface CopilotMemorySnapshot {
  readonly schemaVersion: "toonstudio.copilot-memory.v1";
  readonly cuts: readonly EpisodeCutMemory[];
  readonly characters: readonly CharacterMemorySheet[];
  readonly colorRules: readonly ColoringRuleMemory[];
}

export interface OnDeviceCreativeCopilotOptions {
  readonly localLlmAdapter?: LocalOnDeviceLlmAdapter;
  readonly bm25K1?: number; readonly bm25B?: number;
}

interface IndexedMemoryDoc {
  readonly docId: string; readonly kind: MemoryRecordKind;
  readonly episodeNumber: number; readonly episodeTitle: string; readonly cutNumber?: number;
  readonly stage: CreatorWorkflowStage | "all";
  readonly characters: readonly string[]; readonly excerpt: string;
  readonly termFreq: Map<string, number>; readonly docLength: number;
  readonly vector: Float32Array;
}

const STOPWORDS = new Set<string>([
  "the", "and", "for", "with", "that", "this", "from", "into", "about",
  "그", "이", "저", "및", "등", "컷", "장면", "에서", "으로", "하고", "하는",
]);

const CONCEPT_ANCHORS: readonly (readonly [number, readonly string[]])[] = [
  [0, ["콘티", "호흡", "스크롤", "여백", "클리프행어", "연출", "storyboard", "pacing", "scroll"]],
  [1, ["선화", "펜선", "강약", "외곽선", "필압", "잉크", "lineart", "ink", "weight", "contour"]],
  [2, ["밑색", "배색", "명도", "채도", "팔레트", "톤", "flatting", "palette", "value", "color"]],
  [3, ["역광", "광원", "림라이트", "그림자", "노을", "야경", "조명", "lighting", "backlight", "rim"]],
  [4, ["대사", "말풍선", "말투", "식자", "효과음", "폰트", "lettering", "dialogue", "bubble", "tone"]],
  [5, ["연재", "검수", "출고", "해상도", "라이선스", "판권", "publish", "export", "license", "rights"]],
  [6, ["긴장", "대치", "격투", "추격", "충격", "액션", "tension", "action", "conflict", "chase"]],
  [7, ["감정", "회상", "눈물", "미소", "침묵", "위로", "emotion", "flashback", "quiet", "warm"]],
];

const STAGE_LABELS_KO: Readonly<Record<CreatorWorkflowStage, string>> = {
  storyboard: "콘티", lineart: "선화", flatting: "밑색",
  lighting: "광원·명암", lettering: "식자·말풍선", publish: "출고 검수",
};

const STAGE_GATES_KO: Readonly<Record<CreatorWorkflowStage, readonly [CopilotSuggestionCategory, string, string]>> = {
  storyboard: ["pacing", "콘티 → 선화 전환 전 컷 호흡 점검", "클라이맥스 직전 컷에 세로 여백을 충분히 두고, 다음 컷 시선 진입점이 말풍선과 겹치지 않게 배치하세요."],
  lineart: ["lineart", "선화 → 밑색 전환 전 닫힌 외곽선 확인", "자동 채우기 누수를 막기 위해 인물 외곽선 틈새를 닫고, 전경·배경 선 굵기 차이를 1.4배 이상 유지하세요."],
  flatting: ["palette", "밑색 → 광원 단계 전 명도 분리 점검", "흑백 미리보기에서 인물과 배경 명도 차가 20% 이상 벌어지도록 밑색 덩어리를 분리하세요."],
  lighting: ["lighting", "광원 → 식자 단계 전 하이라이트 시선 집중", "인물 얼굴과 대사 동선에 가장 높은 명도 대비를 두고, 배경 채도는 한 단계 낮춰 시선을 묶으세요."],
  lettering: ["lettering", "식자 → 출고 전 모바일 가독성 확인", "모바일 360px 축소 뷰에서 대사 폰트가 뭉개지지 않도록 말풍선 안쪽 여백을 최소 12% 확보하세요."],
  publish: ["publish-check", "연재 출고 전 라이선스·해상도 최종 점검", "사용 폰트·3D 배경 상업 라이선스 원장과 세로 슬라이스 해상도(가로 1600px 이상)를 출고 전 확정하세요."],
};

const STAGE_GATES_EN: Readonly<Record<CreatorWorkflowStage, readonly [CopilotSuggestionCategory, string, string]>> = {
  storyboard: ["pacing", "Verify vertical scroll pacing before lineart", "Leave breathing whitespace before climax beats and keep bubble placement clear of focal gaze lines."],
  lineart: ["lineart", "Close silhouette gaps before flatting", "Seal exterior contour gaps to prevent fill leaks and maintain at least 1.4x foreground-to-background stroke separation."],
  flatting: ["palette", "Check grayscale value separation before lighting", "Verify >=20% luminance separation between foreground characters and background planes in grayscale preview."],
  lighting: ["lighting", "Focus highlight contrast before lettering", "Keep peak contrast on faces and key props while muting background saturation to hold reading flow."],
  lettering: ["lettering", "Verify 360px mobile bubble legibility before publish", "Maintain >=12% inner padding inside speech bubbles so dialogue stays crisp on narrow phone viewports."],
  publish: ["publish-check", "Run final Rights BOM & slice resolution preflight", "Confirm commercial license clearance for all fonts/3D assets and verify vertical slice export width before publishing."],
};

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 한/영 웹툰 텍스트에서 단어 토큰과 한글 2-gram 서브워드를 추출한다.
 */
export function tokenizeCreativeText(text: string): string[] {
  const rawWords = text.toLowerCase().trim().match(/[가-힣a-z0-9]+/g);
  if (!rawWords) return [];
  const tokens: string[] = [];
  for (const word of rawWords) {
    if (!word || STOPWORDS.has(word)) continue;
    tokens.push(word);
    if (/^[가-힣]+$/.test(word) && word.length >= 3) {
      for (let c = 0; c < word.length - 1; c += 1) {
        const bigram = word.slice(c, c + 2);
        if (!STOPWORDS.has(bigram)) tokens.push(bigram);
      }
    }
  }
  return tokens;
}

/**
 * 웹툰 제작 도메인 개념 앵커와 결정론적 해시 투영으로 256차원 정규화 벡터를 생성한다.
 */
export function embedCreativeText256(text: string): Float32Array {
  const vec = new Float32Array(CREATIVE_EMBEDDING_DIM);
  const tokens = tokenizeCreativeText(text);
  if (tokens.length === 0) return vec;

  for (const tok of tokens) {
    const h1 = fnv1a32(tok);
    const h2 = fnv1a32(`${tok}#2`);
    vec[h1 % CREATIVE_EMBEDDING_DIM] += (h1 & 1) === 0 ? 1.0 : -1.0;
    vec[h2 % CREATIVE_EMBEDDING_DIM] += (h2 & 1) === 0 ? 0.55 : -0.55;
    for (const [bucket, keywords] of CONCEPT_ANCHORS) {
      if (keywords.some((kw) => tok === kw || tok.indexOf(kw) !== -1)) {
        vec[bucket * 4] += 1.8;
        vec[bucket * 4 + 1] += 1.2;
      }
    }
  }

  let normSq = 0;
  for (let i = 0; i < vec.length; i += 1) normSq += vec[i] * vec[i];
  if (normSq > 0) {
    const inv = 1 / Math.sqrt(normSq);
    for (let i = 0; i < vec.length; i += 1) vec[i] *= inv;
  }
  return vec;
}

export function cosineSimilarity256(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i += 1) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

function getNextWorkflowStage(stage: CreatorWorkflowStage): CreatorWorkflowStage | null {
  const idx = WORKFLOW_STAGE_ORDER.indexOf(stage);
  return idx >= 0 && idx < WORKFLOW_STAGE_ORDER.length - 1 ? WORKFLOW_STAGE_ORDER[idx + 1] : null;
}

interface ChromeAiLanguageModelFactory {
  capabilities?: () => Promise<{ readonly available?: string }>;
  create?: (options?: { readonly systemPrompt?: string }) => Promise<{
    prompt: (text: string) => Promise<string>;
    destroy?: () => void;
  }>;
}

interface ChromeWindowAiShape {
  readonly ai?: { readonly languageModel?: ChromeAiLanguageModelFactory };
}

/**
 * 브라우저 내장 Chrome AI(`window.ai.languageModel`)가 있을 때만 로컬 실행하는 선택적 어댑터를 만든다.
 */
export function createChromeBuiltinAiAdapter(hostObject?: unknown): LocalOnDeviceLlmAdapter {
  const resolveFactory = (): ChromeAiLanguageModelFactory | undefined => {
    const target = (hostObject ?? (typeof window !== "undefined" ? (window as unknown) : undefined)) as
      | ChromeWindowAiShape
      | undefined;
    return target?.ai?.languageModel;
  };

  return {
    providerName: "chrome-builtin-ai",
    async isAvailable(): Promise<boolean> {
      const factory = resolveFactory();
      if (!factory || typeof factory.create !== "function") return false;
      if (typeof factory.capabilities === "function") {
        const caps = await factory.capabilities();
        return caps.available === "readily" || caps.available === "after-download";
      }
      return true;
    },
    async generateGroundedNote(prompt: string): Promise<string> {
      const factory = resolveFactory();
      if (!factory || typeof factory.create !== "function") {
        throw new Error("Chrome Built-in AI languageModel을 사용할 수 없습니다.");
      }
      const session = await factory.create({
        systemPrompt: "웹툰 작가의 과거 회차 기록을 근거로 2문장 이내의 간결한 한국어 작업 메모를 작성하세요.",
      });
      try {
        return (await session.prompt(prompt)).trim();
      } finally {
        session.destroy?.();
      }
    },
  };
}

export class OnDeviceCreativeCopilot {
  private readonly cuts = new Map<string, EpisodeCutMemory>();
  private readonly characters = new Map<string, CharacterMemorySheet>();
  private readonly colorRules = new Map<string, ColoringRuleMemory>();
  private readonly docs = new Map<string, IndexedMemoryDoc>();
  private readonly docFreq = new Map<string, number>();
  private totalDocTokens = 0;

  private readonly localLlmAdapter?: LocalOnDeviceLlmAdapter;
  private readonly bm25K1: number;
  private readonly bm25B: number;

  constructor(options: OnDeviceCreativeCopilotOptions = {}) {
    this.localLlmAdapter = options.localLlmAdapter;
    this.bm25K1 = options.bm25K1 ?? 1.5;
    this.bm25B = options.bm25B ?? 0.75;
  }

  indexEpisode(input: IndexEpisodeInput): CopilotMemoryStats {
    for (const cut of input.cuts) this.indexCutMemory(cut);
    for (const char of input.characters ?? []) this.upsertCharacterSheet(char);
    for (const rule of input.colorRules ?? []) this.upsertColorRule(rule);
    return this.getMemoryStats();
  }

  indexCutMemory(memory: EpisodeCutMemory): void {
    this.cuts.set(memory.memoryId, memory);
    const searchable = [
      `${memory.episodeNumber}화 ${memory.cutNumber}컷 ${memory.episodeTitle}`,
      STAGE_LABELS_KO[memory.stage], memory.stage, memory.summary,
      memory.characters.join(" "), memory.dialogueSample ?? "", memory.dialogueTone ?? "",
      memory.lightingMood ?? "", memory.lineWeightNote ?? "",
      (memory.paletteTokens ?? []).join(" "), (memory.tags ?? []).join(" "),
    ].join(" ");

    this.upsertIndexedDoc({
      docId: `cut:${memory.memoryId}`, kind: "episode-cut",
      episodeNumber: memory.episodeNumber, episodeTitle: memory.episodeTitle, cutNumber: memory.cutNumber,
      stage: memory.stage, characters: memory.characters, excerpt: memory.summary, searchableText: searchable,
    });
  }

  upsertCharacterSheet(sheet: CharacterMemorySheet): void {
    this.characters.set(sheet.characterId, sheet);
    const searchable = [
      sheet.name, sheet.traits.join(" "), sheet.speechStyle,
      sheet.signaturePaletteTokens.join(" "), sheet.lineWeightRule ?? "",
      `${sheet.firstSeenEpisode}화 캐릭터 설정 말투`,
    ].join(" ");

    this.upsertIndexedDoc({
      docId: `char:${sheet.characterId}`, kind: "character-sheet",
      episodeNumber: sheet.firstSeenEpisode, episodeTitle: `캐릭터 시트 · ${sheet.name}`,
      stage: "all", characters: [sheet.name],
      excerpt: `${sheet.name}: ${sheet.speechStyle} (${sheet.traits.join(", ")})`,
      searchableText: searchable,
    });
  }

  upsertColorRule(rule: ColoringRuleMemory): void {
    this.colorRules.set(rule.ruleId, rule);
    const searchable = [
      rule.title, STAGE_LABELS_KO[rule.stage], rule.stage, rule.mood,
      rule.paletteTokens.join(" "), rule.guidance, `${rule.sourceEpisodeNumber}화 배색 규칙`,
    ].join(" ");

    this.upsertIndexedDoc({
      docId: `color:${rule.ruleId}`, kind: "color-rule",
      episodeNumber: rule.sourceEpisodeNumber, episodeTitle: `배색 규칙 · ${rule.title}`,
      stage: rule.stage, characters: [], excerpt: `${rule.title}: ${rule.guidance}`,
      searchableText: searchable,
    });
  }

  removeEpisode(episodeNumber: number): number {
    let removed = 0;
    const delCuts: string[] = [];
    this.cuts.forEach((cut, id) => {
      if (cut.episodeNumber === episodeNumber) delCuts.push(id);
    });
    for (const id of delCuts) {
      this.cuts.delete(id);
      if (this.deleteIndexedDoc(`cut:${id}`)) removed += 1;
    }

    const delRules: string[] = [];
    this.colorRules.forEach((rule, id) => {
      if (rule.sourceEpisodeNumber === episodeNumber) delRules.push(id);
    });
    for (const id of delRules) {
      this.colorRules.delete(id);
      if (this.deleteIndexedDoc(`color:${id}`)) removed += 1;
    }
    return removed;
  }

  getMemoryStats(): CopilotMemoryStats {
    const episodes = new Set<number>();
    this.cuts.forEach((c) => episodes.add(c.episodeNumber));
    const docCount = this.docs.size;
    return {
      totalIndexedDocs: docCount,
      episodeCount: episodes.size,
      cutCount: this.cuts.size,
      characterCount: this.characters.size,
      colorRuleCount: this.colorRules.size,
      vocabularySize: this.docFreq.size,
      avgDocLength: docCount > 0 ? Number((this.totalDocTokens / docCount).toFixed(2)) : 0,
    };
  }

  exportSnapshot(): CopilotMemorySnapshot {
    return {
      schemaVersion: "toonstudio.copilot-memory.v1",
      cuts: Array.from(this.cuts.values()),
      characters: Array.from(this.characters.values()),
      colorRules: Array.from(this.colorRules.values()),
    };
  }

  importSnapshot(snapshot: CopilotMemorySnapshot): CopilotMemoryStats {
    this.cuts.clear();
    this.characters.clear();
    this.colorRules.clear();
    this.docs.clear();
    this.docFreq.clear();
    this.totalDocTokens = 0;
    for (const cut of snapshot.cuts) this.indexCutMemory(cut);
    for (const char of snapshot.characters) this.upsertCharacterSheet(char);
    for (const rule of snapshot.colorRules) this.upsertColorRule(rule);
    return this.getMemoryStats();
  }

  /**
   * 하이브리드 BM25 + 256차원 코사인 유사도로 작가 메모리에서 상위 선례를 검색한다.
   */
  retrievePrecedents(
    query: string,
    stage: CreatorWorkflowStage,
    activeCharacters: readonly string[] = [],
    topK = 5,
  ): ProvenanceCitation[] {
    if (this.docs.size === 0) return [];
    const composedQuery = `${query} ${STAGE_LABELS_KO[stage]} ${activeCharacters.join(" ")}`;
    const queryTokens = tokenizeCreativeText(composedQuery);
    const queryVec = embedCreativeText256(composedQuery);
    const docCount = this.docs.size;
    const avgLen = Math.max(1, this.totalDocTokens / docCount);

    interface Scored {
      readonly doc: IndexedMemoryDoc; readonly rawBm25: number;
      readonly cosine: number; readonly stageBonus: number; readonly charBonus: number;
    }

    const candidates: Scored[] = [];
    let maxBm25 = 0;

    this.docs.forEach((doc) => {
      let bm25 = 0;
      const seen = new Set<string>();
      for (const term of queryTokens) {
        if (seen.has(term)) continue;
        seen.add(term);
        const tf = doc.termFreq.get(term) ?? 0;
        if (tf === 0) continue;
        const df = this.docFreq.get(term) ?? 1;
        const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
        const denom = tf + this.bm25K1 * (1 - this.bm25B + this.bm25B * (doc.docLength / avgLen));
        bm25 += idf * ((tf * (this.bm25K1 + 1)) / denom);
      }
      if (bm25 > maxBm25) maxBm25 = bm25;
      const cosine = cosineSimilarity256(queryVec, doc.vector);
      const stageBonus = doc.stage === stage ? 1 : doc.stage === "all" ? 0.55 : 0.15;
      const matches = activeCharacters.filter((ch) => doc.characters.indexOf(ch) !== -1).length;
      const charBonus = activeCharacters.length > 0 ? Math.min(1, matches / activeCharacters.length) : 0;
      candidates.push({ doc, rawBm25: bm25, cosine, stageBonus, charBonus });
    });

    const scored: ProvenanceCitation[] = candidates.map((item) => {
      const normBm25 = maxBm25 > 0 ? item.rawBm25 / maxBm25 : 0;
      const hybrid = normBm25 * 0.5 + item.cosine * 0.35 + item.stageBonus * 0.1 + item.charBonus * 0.05;
      return {
        memoryId: item.doc.docId.replace(/^(cut|char|color):/, ""),
        kind: item.doc.kind,
        episodeNumber: item.doc.episodeNumber,
        episodeTitle: item.doc.episodeTitle,
        cutNumber: item.doc.cutNumber,
        excerpt: item.doc.excerpt,
        bm25Score: Number(normBm25.toFixed(4)),
        cosineScore: Number(item.cosine.toFixed(4)),
        hybridScore: Number(hybrid.toFixed(4)),
      };
    });

    scored.sort((a, b) =>
      b.hybridScore !== a.hybridScore ? b.hybridScore - a.hybridScore : b.episodeNumber - a.episodeNumber,
    );
    return scored.slice(0, Math.max(1, topK));
  }

  /**
   * 현재 작업 단계와 작가의 과거 회차 메모리를 결합해 출처가 명시된 구체적 제안을 생성한다.
   */
  async advise(request: CopilotAdviceRequest): Promise<CopilotAdviceResponse> {
    const startMs = performance.now();
    const locale: CopilotLocale = request.locale ?? "ko";
    const maxSuggestions = Math.max(1, request.maxSuggestions ?? 4);
    const activeChars = request.activeCharacters ?? [];

    const citations = this.retrievePrecedents(request.query, request.stage, activeChars, Math.max(5, maxSuggestions + 2));
    const suggestions: CopilotSuggestion[] = [];
    const primaryCutCitation = citations.find((c) => c.kind === "episode-cut");
    const primaryCut = primaryCutCitation ? this.cuts.get(primaryCutCitation.memoryId) : undefined;

    if (primaryCut && primaryCutCitation) {
      suggestions.push(this.buildStagePrecedentSuggestion(request, primaryCut, primaryCutCitation, locale));
    }
    const charSuggestion = this.buildCharacterSuggestion(request, activeChars, citations, locale);
    if (charSuggestion) suggestions.push(charSuggestion);
    const paletteSuggestion = this.buildPaletteSuggestion(request, citations, locale);
    if (paletteSuggestion) suggestions.push(paletteSuggestion);
    suggestions.push(this.buildStageChecklistSuggestion(request, primaryCut, citations.slice(0, 2), locale));

    let provider: CopilotProviderKind = "local-hybrid-rag";
    let llmRefinementNote: string | null = null;

    if (request.useLocalLlm !== false && this.localLlmAdapter) {
      try {
        if (await this.localLlmAdapter.isAvailable()) {
          const prompt = this.buildLocalLlmPrompt(request, citations.slice(0, 3), locale);
          const note = (await this.localLlmAdapter.generateGroundedNote(prompt)).trim();
          if (note.length > 0) {
            llmRefinementNote = note;
            provider = this.localLlmAdapter.providerName;
          }
        }
      } catch {
        provider = "local-hybrid-rag";
        llmRefinementNote = null;
      }
    }

    return {
      stage: request.stage,
      nextStage: getNextWorkflowStage(request.stage),
      locale,
      provider,
      suggestions: suggestions.slice(0, maxSuggestions),
      retrievedCitations: citations,
      llmRefinementNote,
      retrievalLatencyMs: Number((performance.now() - startMs).toFixed(3)),
      cloudTokensUsed: 0,
      estimatedServerCostKrw: 0,
    };
  }

  private upsertIndexedDoc(input: {
    readonly docId: string; readonly kind: MemoryRecordKind;
    readonly episodeNumber: number; readonly episodeTitle: string; readonly cutNumber?: number;
    readonly stage: CreatorWorkflowStage | "all"; readonly characters: readonly string[];
    readonly excerpt: string; readonly searchableText: string;
  }): void {
    this.deleteIndexedDoc(input.docId);
    const tokens = tokenizeCreativeText(input.searchableText);
    const termFreq = new Map<string, number>();
    for (const tok of tokens) termFreq.set(tok, (termFreq.get(tok) ?? 0) + 1);
    termFreq.forEach((_, term) => this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1));
    this.totalDocTokens += tokens.length;

    this.docs.set(input.docId, {
      docId: input.docId, kind: input.kind, episodeNumber: input.episodeNumber,
      episodeTitle: input.episodeTitle, cutNumber: input.cutNumber, stage: input.stage,
      characters: input.characters, excerpt: input.excerpt, termFreq,
      docLength: tokens.length, vector: embedCreativeText256(input.searchableText),
    });
  }

  private deleteIndexedDoc(docId: string): boolean {
    const existing = this.docs.get(docId);
    if (!existing) return false;
    this.totalDocTokens = Math.max(0, this.totalDocTokens - existing.docLength);
    existing.termFreq.forEach((_, term) => {
      const next = (this.docFreq.get(term) ?? 1) - 1;
      if (next <= 0) this.docFreq.delete(term);
      else this.docFreq.set(term, next);
    });
    this.docs.delete(docId);
    return true;
  }

  private buildStagePrecedentSuggestion(
    request: CopilotAdviceRequest,
    cut: EpisodeCutMemory,
    citation: ProvenanceCitation,
    locale: CopilotLocale,
  ): CopilotSuggestion {
    const refTag =
      locale === "ko"
        ? `${cut.episodeNumber}화 ${cut.cutNumber}컷(${cut.episodeTitle})`
        : `Ep.${cut.episodeNumber} Cut ${cut.cutNumber} (${cut.episodeTitle})`;
    const confidence = Math.min(0.98, Math.max(0.56, citation.hybridScore + 0.25));

    if (request.stage === "storyboard") {
      const diff =
        request.currentPacingBeats !== undefined && cut.pacingBeats !== undefined
          ? request.currentPacingBeats - cut.pacingBeats
          : null;
      const pacingKo =
        cut.pacingBeats !== undefined && diff !== null && Math.abs(diff) >= 2
          ? `기존 호흡(${cut.pacingBeats}박, 컷 높이 ${cut.panelHeightPx ?? 1600}px)보다 ${Math.abs(diff)}박 ${diff > 0 ? "길어졌습니다. 컷 간 여백을 줄여 템포를 맞출지 확인하세요." : "빨라졌습니다. 감정 정지 컷을 1개 끼워 여운을 확보하세요."}`
          : `선례 호흡(${cut.pacingBeats ?? 4}박, 컷 높이 ${cut.panelHeightPx ?? 1600}px)을 기준으로 시선 낙하 리듬을 유지하세요.`;
      return {
        id: `precedent-storyboard-${cut.memoryId}`, stage: request.stage, category: "pacing", confidence,
        headline: locale === "ko" ? `${refTag} 스크롤 호흡 기준선 적용` : `Align scroll rhythm with ${refTag}`,
        actionableNote: locale === "ko" ? `${refTag} 기록 참조: ${pacingKo}` : `From ${refTag}: keep vertical pacing aligned with "${cut.summary}".`,
        citations: [citation],
      };
    }
    if (request.stage === "lineart") {
      return {
        id: `precedent-lineart-${cut.memoryId}`, stage: request.stage, category: "lineart", confidence,
        headline: locale === "ko" ? `${refTag} 선화 강약·실루엣 유지` : `Match line weight from ${refTag}`,
        actionableNote:
          locale === "ko"
            ? `${refTag} 선화 규칙(${cut.lineWeightNote ?? cut.summary})을 동일 강약으로 이어가세요.`
            : `Apply the ink weight rule from ${refTag}: ${cut.lineWeightNote ?? cut.summary}.`,
        citations: [citation],
      };
    }
    if (request.stage === "lighting") {
      const mood = cut.lightingMood ?? "주광·역광 대비";
      return {
        id: `precedent-lighting-${cut.memoryId}`, stage: request.stage, category: "lighting", confidence,
        headline: locale === "ko" ? `${refTag} 광원 무드(${mood}) 연결` : `Keep lighting continuity (${mood}) from ${refTag}`,
        actionableNote:
          locale === "ko"
            ? `${refTag}의 "${mood}" 광원 방향과 그림자 경도를 이어가 컷 전환 색온도 튐을 방지하세요.`
            : `Carry over "${mood}" key/rim light direction from ${refTag} to prevent temperature jumps.`,
        citations: [citation],
      };
    }
    if (request.stage === "lettering") {
      const tone = cut.dialogueTone ?? "기존 말투 유지";
      const sample = cut.dialogueSample ? ` 예: "${cut.dialogueSample}"` : "";
      return {
        id: `precedent-lettering-${cut.memoryId}`, stage: request.stage, category: "dialogue-tone", confidence,
        headline: locale === "ko" ? `${refTag} 대사 리듬(${tone}) 일치` : `Keep dialogue tone (${tone}) from ${refTag}`,
        actionableNote:
          locale === "ko"
            ? `${refTag} 대사 톤은 "${tone}"였습니다.${sample} 말풍선당 2~3줄 이내로 호흡을 끊어 가독성을 지키세요.`
            : `${refTag} used "${tone}" tone.${sample} Keep each bubble within 2-3 short lines.`,
        citations: [citation],
      };
    }
    return {
      id: `precedent-${request.stage}-${cut.memoryId}`, stage: request.stage, category: "continuity", confidence,
      headline: locale === "ko" ? `${refTag} 연속성 기준 확인` : `Cross-check continuity against ${refTag}`,
      actionableNote:
        locale === "ko"
          ? `${refTag} 기록("${cut.summary}")과 현재 ${STAGE_LABELS_KO[request.stage]} 소품·배색·동선을 대조하세요.`
          : `Cross-check props, color cues, and blocking against ${refTag}: "${cut.summary}".`,
      citations: [citation],
    };
  }

  private buildCharacterSuggestion(
    request: CopilotAdviceRequest,
    activeCharacters: readonly string[],
    citations: readonly ProvenanceCitation[],
    locale: CopilotLocale,
  ): CopilotSuggestion | null {
    let matched: CharacterMemorySheet | undefined;
    this.characters.forEach((sheet) => {
      if (!matched && (activeCharacters.indexOf(sheet.name) !== -1 || request.query.indexOf(sheet.name) !== -1)) {
        matched = sheet;
      }
    });
    if (!matched) return null;
    const sheet = matched;
    const citation = citations.find((c) => c.kind === "character-sheet" && c.memoryId === sheet.characterId) ?? {
      memoryId: sheet.characterId, kind: "character-sheet" as const, episodeNumber: sheet.firstSeenEpisode,
      episodeTitle: `캐릭터 시트 · ${sheet.name}`, excerpt: `${sheet.name}: ${sheet.speechStyle}`,
      bm25Score: 0.85, cosineScore: 0.8, hybridScore: 0.85,
    };
    const lineRule = sheet.lineWeightRule ? ` 선화: ${sheet.lineWeightRule}.` : "";
    return {
      id: `character-${sheet.characterId}-${request.stage}`,
      stage: request.stage,
      category: request.stage === "lettering" ? "dialogue-tone" : "continuity",
      headline:
        locale === "ko"
          ? `${sheet.name} 캐릭터 설정·말투 고정 (${sheet.firstSeenEpisode}화 기준)`
          : `Hold ${sheet.name} character rules (from Ep.${sheet.firstSeenEpisode})`,
      actionableNote:
        locale === "ko"
          ? `${sheet.name}의 고정 말투는 "${sheet.speechStyle}", 핵심 속성은 [${sheet.traits.join(" · ")}], 시그니처 팔레트는 [${sheet.signaturePaletteTokens.join(", ")}]입니다.${lineRule}`
          : `${sheet.name} speech: "${sheet.speechStyle}"; traits: [${sheet.traits.join(", ")}]; palette: [${sheet.signaturePaletteTokens.join(", ")}].`,
      confidence: 0.92,
      citations: [citation],
    };
  }

  private buildPaletteSuggestion(
    request: CopilotAdviceRequest,
    citations: readonly ProvenanceCitation[],
    locale: CopilotLocale,
  ): CopilotSuggestion | null {
    const colorCitation = citations.find((c) => c.kind === "color-rule");
    const rule = colorCitation ? this.colorRules.get(colorCitation.memoryId) : undefined;
    if (!rule || !colorCitation) return null;
    const driftKo =
      request.currentPaletteTokens && request.currentPaletteTokens.length > 0
        ? request.currentPaletteTokens.some((tok) => rule.paletteTokens.indexOf(tok) === -1)
          ? " 현재 컷 팔레트에 기준 외 토큰이 섞여 있으니 주조색 채도를 한 단계 눌러 통일감을 맞추세요."
          : " 현재 팔레트가 기존 기준 토큰과 일치합니다."
        : "";
    return {
      id: `palette-${rule.ruleId}-${request.stage}`,
      stage: request.stage,
      category: "palette",
      headline:
        locale === "ko"
          ? `${rule.sourceEpisodeNumber}화 배색 규칙 · ${rule.title}`
          : `Ep.${rule.sourceEpisodeNumber} palette rule: ${rule.title}`,
      actionableNote:
        locale === "ko"
          ? `${rule.guidance} 기준 토큰: [${rule.paletteTokens.join(" / ")}].${driftKo}`
          : `${rule.guidance} Anchor tokens: [${rule.paletteTokens.join(" / ")}].`,
      confidence: Math.min(0.96, Math.max(0.65, colorCitation.hybridScore + 0.25)),
      citations: [colorCitation],
    };
  }

  private buildStageChecklistSuggestion(
    request: CopilotAdviceRequest,
    primaryCut: EpisodeCutMemory | undefined,
    citations: readonly ProvenanceCitation[],
    locale: CopilotLocale,
  ): CopilotSuggestion {
    const [category, headline, baseNote] =
      locale === "ko" ? STAGE_GATES_KO[request.stage] : STAGE_GATES_EN[request.stage];
    const extraKo = primaryCut ? ` (최근 참조: ${primaryCut.episodeNumber}화 ${primaryCut.cutNumber}컷)` : "";
    return {
      id: `stage-gate-${request.stage}`, stage: request.stage, category, headline,
      actionableNote: locale === "ko" ? `${baseNote}${extraKo}` : baseNote,
      confidence: 0.88, citations,
    };
  }

  private buildLocalLlmPrompt(
    request: CopilotAdviceRequest,
    topCitations: readonly ProvenanceCitation[],
    locale: CopilotLocale,
  ): string {
    const lines = topCitations.map(
      (c) => `- [${c.episodeNumber}화${c.cutNumber !== undefined ? ` ${c.cutNumber}컷` : ""}] ${c.excerpt}`,
    );
    return [`stage=${request.stage}, locale=${locale}`, `query=${request.query}`, "citations:", ...lines].join("\n");
  }
}
