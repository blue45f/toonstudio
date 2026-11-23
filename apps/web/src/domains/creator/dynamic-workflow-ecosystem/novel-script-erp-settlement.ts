/**
 * 노블코믹스 IP 원천 각본 파서(Fountain · Final Draft .fdx · Scrivener MD · Notion 대본) 및
 * 제작사(CP)·어시스턴트·외부 구매 에셋 Rights BOM 정산 ERP / RFC4180 CSV 익스포터.
 */

export type ScriptSourceFormat = "auto" | "fountain" | "fdx" | "scrivener-md" | "notion-script";
export type ResolvedScriptFormat = Exclude<ScriptSourceFormat, "auto">;
export type ScriptBeatKind = "action" | "dialogue" | "narration" | "thought" | "sfx";
export type BalloonStyleKind = "normal" | "shout" | "thought" | "narration-box" | "whisper" | "sfx-floating";
export type StoryboardCameraShot = "wide-establishing" | "medium-two-shot" | "close-up-emotion" | "action-dynamic" | "detail-insert";

export interface ParsedScriptBeat {
  readonly beatId: string; readonly sceneId: string; readonly kind: ScriptBeatKind;
  readonly speaker: string | null; readonly text: string; readonly parenthetical: string | null;
}
export interface ParsedScriptScene {
  readonly sceneId: string; readonly sceneNumber: number; readonly heading: string;
  readonly location: string; readonly timeOfDay: string; readonly beats: readonly ParsedScriptBeat[];
}
export interface SpeechBalloonDraft {
  readonly balloonId: string; readonly cutId: string; readonly readingOrder: number; readonly speaker: string;
  readonly text: string; readonly balloonStyle: BalloonStyleKind; readonly charCount: number;
  readonly estimatedWidthPx: number; readonly estimatedHeightPx: number;
}
export interface StoryboardCutDraft {
  readonly cutId: string; readonly cutNumber: number; readonly sceneId: string; readonly sceneHeading: string;
  readonly cameraShot: StoryboardCameraShot; readonly visualDirection: string; readonly estimatedHeightPx: number;
  readonly speakers: readonly string[]; readonly balloons: readonly SpeechBalloonDraft[]; readonly sfxLabels: readonly string[];
}
export interface CharacterBibleEntry {
  readonly characterId: string; readonly name: string; readonly dialogueCount: number; readonly totalCharsSpoken: number;
  readonly firstAppearanceSceneId: string; readonly firstAppearanceCutId: string;
  readonly speechRegisterHint: "formal" | "casual" | "intense" | "monologue";
  readonly sampleLine: string; readonly coAppearingCharacters: readonly string[];
}
export interface ParsedNovelStoryboardResult {
  readonly detectedFormat: ResolvedScriptFormat; readonly workTitle: string;
  readonly episodeNumber: number; readonly episodeTitle: string;
  readonly scenes: readonly ParsedScriptScene[]; readonly cuts: readonly StoryboardCutDraft[];
  readonly characterBible: readonly CharacterBibleEntry[]; readonly balloons: readonly SpeechBalloonDraft[];
  readonly summary: {
    readonly sceneCount: number; readonly cutCount: number; readonly characterCount: number;
    readonly balloonCount: number; readonly sfxCount: number; readonly estimatedScrollHeightPx: number;
  };
}
export interface ParseScriptOptions {
  readonly format?: ScriptSourceFormat; readonly defaultWorkTitle?: string;
  readonly defaultEpisodeTitle?: string; readonly maxBalloonsPerCut?: number;
}

function decodeXmlEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}
function slugifyId(raw: string, fallback: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}
function extractEpisodeNumber(text: string): number {
  const m = text.match(/(?:EP\.?|제\s*)(\d+)\s*화?/i) ?? text.match(/\b(\d+)\s*화/);
  return m ? Math.max(1, Number(m[1])) : 1;
}

/** 입력 대본 텍스트에서 Fountain / Final Draft(.fdx) / Scrivener MD / Notion 포맷을 자동 판별한다. */
export function detectScriptFormat(rawText: string): ResolvedScriptFormat {
  const trimmed = rawText.trim();
  if (/<FinalDraft\b/i.test(trimmed) || /<Paragraph\s+Type=/i.test(trimmed)) return "fdx";
  if (/^(?:Title|Episode|Credit|Author):/im.test(trimmed) || /^(?:INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)/im.test(trimmed)) return "fountain";
  if (/^#{1,3}\s+/m.test(trimmed) && (/\*\*[^*]+\*\*\s*[:：]/m.test(trimmed) || /^>\s+/m.test(trimmed))) return "scrivener-md";
  if (/\[(?:장면|컷|SCENE|CALLOUT)\b/i.test(trimmed) || /^[-*]\s*[^:：\n]{1,20}\s*[:：]/m.test(trimmed)) return "notion-script";
  return /^#{1,3}\s+/m.test(trimmed) ? "scrivener-md" : "fountain";
}

function extractLocationAndTime(heading: string): { readonly location: string; readonly timeOfDay: string } {
  const cleaned = heading.replace(/^#+\s*/, "").replace(/^\[(?:장면|SCENE)[^\]]*\]\s*/i, "").replace(/^(?:INT\.\/EXT\.|INT\.|EXT\.|I\/E\.|S#\d+\.?)\s*/i, "").trim();
  const parts = cleaned.split(/\s+-\s+|\s+\/\s+/);
  return parts.length >= 2
    ? { location: parts[0].trim() || "미지정 장소", timeOfDay: parts.slice(1).join(" / ").trim() || "낮" }
    : { location: cleaned || "미지정 장소", timeOfDay: "시간 미지정" };
}

function classifyBalloonStyle(kind: ScriptBeatKind, text: string, paren: string | null): BalloonStyleKind {
  if (kind === "sfx") return "sfx-floating";
  if (kind === "narration") return "narration-box";
  if (kind === "thought") return "thought";
  const p = (paren ?? "").toLowerCase();
  if (/속삭|낮게|whisper|quiet/i.test(p)) return "whisper";
  if (/외침|소리|고함|shout|yell|scream/i.test(p) || /!{2,}|[!！]$/.test(text.trim())) return "shout";
  if (/속마음|독백|thought|v\.o\.|inner/i.test(p)) return "thought";
  return "normal";
}

function inferCameraShot(beats: readonly ParsedScriptBeat[], isFirst: boolean): StoryboardCameraShot {
  if (isFirst) return "wide-establishing";
  if (beats.some((b) => b.kind === "sfx")) return "action-dynamic";
  const speakers = new Set(beats.map((b) => b.speaker).filter((s): s is string => Boolean(s)));
  if (beats.some((b) => b.kind === "thought" || /!/.test(b.text) || /외침|충격|클로즈업/i.test(b.parenthetical ?? "")) && speakers.size <= 1) {
    return "close-up-emotion";
  }
  if (speakers.size >= 2) return "medium-two-shot";
  return beats.every((b) => b.kind === "action") ? "detail-insert" : "medium-two-shot";
}

function inferSpeechRegister(lines: readonly string[]): CharacterBibleEntry["speechRegisterHint"] {
  if (lines.length === 0) return "casual";
  const joined = lines.join(" ");
  if (/(?:요|습니다|습니까|세요|십시오|군요)[.?!]?/.test(joined)) return "formal";
  if ((joined.match(/!/g) ?? []).length >= Math.max(1, Math.ceil(lines.length * 0.5))) return "intense";
  return lines.every((l) => l.startsWith("(") || l.includes("...")) ? "monologue" : "casual";
}

interface RawParsedHeaderAndScenes {
  readonly workTitle: string; readonly episodeNumber: number; readonly episodeTitle: string; readonly scenes: readonly ParsedScriptScene[];
}

function makeScene(sceneNumber: number, heading: string, beats: readonly ParsedScriptBeat[]): ParsedScriptScene {
  const sceneId = `scene-${String(sceneNumber).padStart(2, "0")}`;
  const { location, timeOfDay } = extractLocationAndTime(heading);
  return { sceneId, sceneNumber, heading, location, timeOfDay, beats: beats.map((b) => ({ ...b, sceneId })) };
}

function parseFdxXml(rawText: string, defaultWork: string, defaultEp: string): RawParsedHeaderAndScenes {
  const titleMatch = rawText.match(/<TitlePage>[\s\S]*?<Text[^>]*>([\s\S]*?)<\/Text>/i);
  const workTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) || defaultWork : defaultWork;
  let episodeTitle = defaultEp;
  const scenes: ParsedScriptScene[] = [];
  let currentBeats: ParsedScriptBeat[] = [];
  let currentHeading = "SCENE 1 - 오프닝";
  let pendingSpeaker: string | null = null;
  let pendingParen: string | null = null;
  let beatSeq = 0;

  const flush = (): void => {
    if (currentBeats.length === 0) return;
    scenes.push(makeScene(scenes.length + 1, currentHeading, currentBeats));
    currentBeats = [];
  };

  const paraRegex = /<Paragraph\b[^>]*Type="([^"]+)"[^>]*>([\s\S]*?)<\/Paragraph>/gi;
  let match: RegExpExecArray | null = paraRegex.exec(rawText);
  while (match !== null) {
    const type = match[1].trim().toLowerCase();
    const texts: string[] = [];
    const textRegex = /<Text[^>]*>([\s\S]*?)<\/Text>/gi;
    let tMatch: RegExpExecArray | null = textRegex.exec(match[2]);
    while (tMatch !== null) { texts.push(decodeXmlEntities(tMatch[1])); tMatch = textRegex.exec(match[2]); }
    const content = texts.join(" ").replace(/\s+/g, " ").trim();

    if (content) {
      if (type === "scene heading") {
        flush(); currentHeading = content; pendingSpeaker = null; pendingParen = null;
      } else if (type === "character") {
        pendingSpeaker = content.replace(/\s*\([^)]*\)\s*$/, "").trim();
        pendingParen = content.match(/\(([^)]+)\)/)?.[1].trim() ?? null;
      } else if (type === "parenthetical") {
        pendingParen = content.replace(/^\(|\)$/g, "").trim();
      } else if (type === "dialogue") {
        beatSeq += 1;
        const isNarr = /^(?:NARRATOR|나레이션|해설)$/i.test(pendingSpeaker ?? "");
        const isThought = /v\.o\.|속마음|독백|thought/i.test(pendingParen ?? "");
        currentBeats.push({ beatId: `beat-${String(beatSeq).padStart(3, "0")}`, sceneId: "", kind: isNarr ? "narration" : isThought ? "thought" : "dialogue", speaker: isNarr ? "나레이션" : pendingSpeaker ?? "화자 미상", text: content, parenthetical: pendingParen });
        pendingParen = null;
      } else if (type === "action") {
        if (/^(?:EP\.|제\d+화)/i.test(content) && scenes.length === 0 && currentBeats.length === 0) {
          episodeTitle = content;
        } else {
          beatSeq += 1;
          const isSfx = /^\[?SFX[:：\s]|^효과음[:：\s]/i.test(content);
          currentBeats.push({ beatId: `beat-${String(beatSeq).padStart(3, "0")}`, sceneId: "", kind: isSfx ? "sfx" : "action", speaker: null, text: isSfx ? content.replace(/^\[?(?:SFX|효과음)[:：\s]+|\]$/gi, "").trim() : content, parenthetical: null });
        }
        pendingSpeaker = null;
      }
    }
    match = paraRegex.exec(rawText);
  }
  flush();
  return { workTitle, episodeNumber: extractEpisodeNumber(episodeTitle), episodeTitle, scenes };
}

function parseLineBasedScript(rawText: string, format: Exclude<ResolvedScriptFormat, "fdx">, defaultWork: string, defaultEp: string): RawParsedHeaderAndScenes {
  const lines = rawText.replace(/\r\n/g, "\n").split("\n");
  let workTitle = defaultWork;
  let episodeTitle = defaultEp;
  const scenes: ParsedScriptScene[] = [];
  let currentHeading = "SCENE 1 - 오프닝";
  let currentBeats: ParsedScriptBeat[] = [];
  let pendingSpeaker: string | null = null;
  let pendingParen: string | null = null;
  let beatSeq = 0;

  const flush = (): void => {
    if (currentBeats.length === 0) return;
    scenes.push(makeScene(scenes.length + 1, currentHeading, currentBeats));
    currentBeats = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) { pendingSpeaker = null; pendingParen = null; continue; }

    const titleMeta = line.match(/^(?:Title|작품명)\s*[:：]\s*(.+)$/i);
    if (titleMeta) { workTitle = titleMeta[1].trim(); continue; }
    const epMeta = line.match(/^(?:Episode|화수|회차)\s*[:：]\s*(.+)$/i);
    if (epMeta) { episodeTitle = epMeta[1].trim(); continue; }
    if (format === "scrivener-md" && /^#\s+/.test(line)) {
      const h1 = line.replace(/^#\s+/, "").trim();
      if (/EP|화/i.test(h1)) episodeTitle = h1; else workTitle = h1;
      continue;
    }

    if (/^(?:INT\.\/EXT\.|INT\.|EXT\.|I\/E\.|S#\d+\.?)\s*/i.test(line) || /^#{2,3}\s+/.test(line) || /^\[(?:장면|SCENE)\b[^\]]*\]/i.test(line)) {
      flush(); currentHeading = line.replace(/^#{2,3}\s+/, "").trim(); pendingSpeaker = null; pendingParen = null; continue;
    }

    const sfxMatch = line.match(/^(?:[-*]\s*)?\[?(?:SFX|효과음)\s*[:：]\s*([^\]\n]+)\]?$/i);
    if (sfxMatch) {
      beatSeq += 1;
      currentBeats.push({ beatId: `beat-${String(beatSeq).padStart(3, "0")}`, sceneId: "", kind: "sfx", speaker: null, text: sfxMatch[1].trim(), parenthetical: null });
      continue;
    }

    if (/^>\s+/.test(line)) {
      beatSeq += 1;
      currentBeats.push({ beatId: `beat-${String(beatSeq).padStart(3, "0")}`, sceneId: "", kind: "action", speaker: null, text: line.replace(/^>\s+/, "").trim(), parenthetical: null });
      continue;
    }

    const inlineDlg = line.match(/^(?:[-*]\s*)?(?:\*\*([^*]+)\*\*|([가-힣A-Za-z0-9_ ]{1,18}))(?:\s*\(([^)]+)\))?\s*[:：]\s*(.+)$/);
    if (inlineDlg && !/^(?:장소|시간|배경|컷|노트|Note|Location|Time)$/i.test((inlineDlg[1] ?? inlineDlg[2] ?? "").trim())) {
      const speakerRaw = (inlineDlg[1] ?? inlineDlg[2] ?? "").trim();
      const parenRaw = inlineDlg[3]?.trim() ?? null;
      const bodyRaw = inlineDlg[4].trim().replace(/^["“]|["”]$/g, "");
      beatSeq += 1;
      const isNarr = /^(?:나레이션|해설|NARRATOR)$/i.test(speakerRaw);
      const isThought = /속마음|독백|thought|v\.o\./i.test(parenRaw ?? "") || /^\(.+\)$/.test(bodyRaw);
      currentBeats.push({ beatId: `beat-${String(beatSeq).padStart(3, "0")}`, sceneId: "", kind: isNarr ? "narration" : isThought ? "thought" : "dialogue", speaker: isNarr ? "나레이션" : speakerRaw, text: bodyRaw.replace(/^\(|\)$/g, "").trim(), parenthetical: parenRaw });
      continue;
    }

    if (format === "fountain") {
      if (pendingSpeaker && /^\([^)]+\)$/.test(line)) { pendingParen = line.slice(1, -1).trim(); continue; }
      if (pendingSpeaker) {
        beatSeq += 1;
        const isNarr = /^(?:NARRATOR|나레이션|해설)$/i.test(pendingSpeaker);
        const isThought = /v\.o\.|속마음|독백|thought/i.test(pendingParen ?? "");
        currentBeats.push({ beatId: `beat-${String(beatSeq).padStart(3, "0")}`, sceneId: "", kind: isNarr ? "narration" : isThought ? "thought" : "dialogue", speaker: isNarr ? "나레이션" : pendingSpeaker, text: line, parenthetical: pendingParen });
        pendingParen = null;
        continue;
      }
      const nextLine = lines[i + 1]?.trim() ?? "";
      if (nextLine && (/^@[가-힣A-Za-z0-9_ ()]+$/.test(line) || (/^[A-Z0-9가-힣][A-Z0-9가-힣 _-]{0,18}(?:\s*\([^)]+\))?$/.test(line) && !/[.!?]$/.test(line)))) {
        const cleanedCue = line.replace(/^@/, "").trim();
        pendingSpeaker = cleanedCue.replace(/\s*\([^)]+\)\s*$/, "").trim();
        pendingParen = cleanedCue.match(/\(([^)]+)\)/)?.[1].trim() ?? null;
        continue;
      }
    }

    beatSeq += 1;
    currentBeats.push({ beatId: `beat-${String(beatSeq).padStart(3, "0")}`, sceneId: "", kind: "action", speaker: null, text: line.replace(/^\[(?:컷|CUT)[^\]]*\]\s*/i, "").trim(), parenthetical: null });
  }
  flush();
  return { workTitle, episodeNumber: extractEpisodeNumber(episodeTitle), episodeTitle, scenes };
}

/** Fountain · Final Draft(.fdx) · Scrivener MD · Notion 대본을 파싱해 콘티 컷, 등장인물 설정집, 말풍선 초안을 자동 생성한다. */
export function parseNovelOrScriptToStoryboard(rawText: string, options: ParseScriptOptions = {}): ParsedNovelStoryboardResult {
  const detectedFormat: ResolvedScriptFormat = options.format && options.format !== "auto" ? options.format : detectScriptFormat(rawText);
  const maxBalloonsPerCut = Math.max(1, Math.min(4, Math.round(options.maxBalloonsPerCut ?? 2)));
  const parsed = detectedFormat === "fdx"
    ? parseFdxXml(rawText, options.defaultWorkTitle ?? "월광 아틀리에 계약", options.defaultEpisodeTitle ?? "EP.14 봉인 균열")
    : parseLineBasedScript(rawText, detectedFormat, options.defaultWorkTitle ?? "월광 아틀리에 계약", options.defaultEpisodeTitle ?? "EP.14 봉인 균열");

  const cuts: StoryboardCutDraft[] = [];
  const allBalloons: SpeechBalloonDraft[] = [];
  let sfxCount = 0;
  const charMap = new Map<string, { readonly name: string; dialogueCount: number; totalCharsSpoken: number; readonly firstAppearanceSceneId: string; readonly firstAppearanceCutId: string; readonly lines: string[]; readonly coAppearing: Set<string> }>();

  for (const scene of parsed.scenes) {
    let bucket: ParsedScriptBeat[] = [];
    let dlgCount = 0;
    let sceneCutIdx = 0;

    const flushBucket = (): void => {
      if (bucket.length === 0) return;
      const cutNumber = cuts.length + 1;
      const cutId = `cut-${String(cutNumber).padStart(2, "0")}`;
      const cutBalloons: SpeechBalloonDraft[] = [];
      const sfxLabels: string[] = [];
      const directions: string[] = [];
      const speakerSet = new Set<string>();

      for (const beat of bucket) {
        if (beat.kind === "action") { directions.push(beat.text); continue; }
        if (beat.kind === "sfx") { sfxLabels.push(beat.text); sfxCount += 1; continue; }
        const speaker = beat.speaker ?? "화자 미상";
        if (beat.kind !== "narration") speakerSet.add(speaker);
        const charCount = beat.text.length;
        const balloon: SpeechBalloonDraft = {
          balloonId: `bln-${String(allBalloons.length + 1).padStart(3, "0")}`, cutId, readingOrder: cutBalloons.length + 1,
          speaker, text: beat.text, balloonStyle: classifyBalloonStyle(beat.kind, beat.text, beat.parenthetical), charCount,
          estimatedWidthPx: Math.min(340, Math.max(130, 72 + charCount * 9)), estimatedHeightPx: Math.max(64, Math.ceil(charCount / 14) * 28 + 36),
        };
        cutBalloons.push(balloon);
        allBalloons.push(balloon);

        if (beat.kind !== "narration") {
          const key = speaker.toLowerCase();
          const existing = charMap.get(key);
          if (existing) { existing.dialogueCount += 1; existing.totalCharsSpoken += charCount; existing.lines.push(beat.text); }
          else charMap.set(key, { name: speaker, dialogueCount: 1, totalCharsSpoken: charCount, firstAppearanceSceneId: scene.sceneId, firstAppearanceCutId: cutId, lines: [beat.text], coAppearing: new Set<string>() });
        }
      }

      const cutSpeakers = [...speakerSet];
      for (const sp of cutSpeakers) {
        const entry = charMap.get(sp.toLowerCase());
        if (entry) for (const other of cutSpeakers) if (other !== sp) entry.coAppearing.add(other);
      }
      const cameraShot = inferCameraShot(bucket, sceneCutIdx === 0);
      cuts.push({
        cutId, cutNumber, sceneId: scene.sceneId, sceneHeading: scene.heading, cameraShot,
        visualDirection: directions.join(" ") || `${scene.location} 장면 연출 (${cameraShot})`,
        estimatedHeightPx: 760 + cutBalloons.length * 140 + (cameraShot === "wide-establishing" ? 260 : 0),
        speakers: cutSpeakers, balloons: cutBalloons, sfxLabels,
      });
      sceneCutIdx += 1; bucket = []; dlgCount = 0;
    };

    for (const beat of scene.beats) {
      const isSpoken = beat.kind === "dialogue" || beat.kind === "thought" || beat.kind === "narration";
      if ((isSpoken && dlgCount >= maxBalloonsPerCut) || (beat.kind === "action" && dlgCount > 0)) flushBucket();
      bucket.push(beat);
      if (isSpoken) dlgCount += 1;
    }
    flushBucket();
  }

  const characterBible: CharacterBibleEntry[] = [...charMap.values()]
    .sort((a, b) => b.dialogueCount - a.dialogueCount || a.name.localeCompare(b.name))
    .map((e) => ({
      characterId: `char-${slugifyId(e.name, "speaker")}`, name: e.name, dialogueCount: e.dialogueCount,
      totalCharsSpoken: e.totalCharsSpoken, firstAppearanceSceneId: e.firstAppearanceSceneId, firstAppearanceCutId: e.firstAppearanceCutId,
      speechRegisterHint: inferSpeechRegister(e.lines), sampleLine: e.lines[0] ?? "", coAppearingCharacters: [...e.coAppearing].sort(),
    }));

  return {
    detectedFormat, workTitle: parsed.workTitle, episodeNumber: parsed.episodeNumber, episodeTitle: parsed.episodeTitle,
    scenes: parsed.scenes, cuts, characterBible, balloons: allBalloons,
    summary: {
      sceneCount: parsed.scenes.length, cutCount: cuts.length, characterCount: characterBible.length,
      balloonCount: allBalloons.length, sfxCount, estimatedScrollHeightPx: cuts.reduce((s, c) => s + c.estimatedHeightPx, 0),
    },
  };
}

// --- 2. 제작사(CP)·어시스턴트·권리 BOM 정산 ERP 익스포터 ---

export type AssistantTaskRole = "lineart" | "flatting" | "shading" | "background" | "lettering";
export type SettlementTaxType = "freelancer-3.3" | "corporate-vat-10" | "tax-exempt";

export interface AssistantRateCard {
  readonly assistantId: string; readonly name: string; readonly role: AssistantTaskRole;
  readonly ratePerCut: number; readonly hourlyRate: number; readonly taxType: SettlementTaxType;
}
export interface CutAssistantContribution {
  readonly cutId: string; readonly assistantId: string; readonly taskType: AssistantTaskRole; readonly weight?: number; readonly dateIso: string;
}
export interface DailyWorkLogEntry { readonly assistantId: string; readonly dateIso: string; readonly hours: number; readonly note?: string; }
export interface RightsBomReceiptItem {
  readonly receiptId: string; readonly assetName: string; readonly vendor: string;
  readonly licenseType: "commercial-perpetual" | "commercial-subscription" | "editorial-only";
  readonly costAmount: number; readonly purchasedAtIso: string; readonly commercialVerified: boolean; readonly cutIds: readonly string[];
}
export interface StudioSettlementInput {
  readonly settlementPeriod: string; readonly studioName: string; readonly workTitle: string; readonly episodeCode: string;
  readonly currency?: "KRW" | "USD"; readonly withholdingRate?: number;
  readonly assistants: readonly AssistantRateCard[]; readonly cutContributions: readonly CutAssistantContribution[];
  readonly dailyWorkLogs: readonly DailyWorkLogEntry[]; readonly rightsBomReceipts: readonly RightsBomReceiptItem[];
}
export interface AssistantSettlementLine {
  readonly assistantId: string; readonly name: string; readonly role: AssistantTaskRole; readonly taxType: SettlementTaxType;
  readonly taskCutBreakdown: Readonly<Record<AssistantTaskRole, number>>; readonly weightedCutCount: number; readonly totalHours: number;
  readonly cutPayAmount: number; readonly timePayAmount: number; readonly grossAmount: number;
  readonly withholdingRate: number; readonly incomeTaxAmount: number; readonly localTaxAmount: number;
  readonly withholdingTaxAmount: number; readonly vatAmount: number; readonly netPayAmount: number;
}
export interface StudioSettlementReport {
  readonly settlementPeriod: string; readonly studioName: string; readonly workTitle: string; readonly episodeCode: string;
  readonly currency: "KRW" | "USD"; readonly assistantLines: readonly AssistantSettlementLine[];
  readonly rightsBomReceipts: readonly RightsBomReceiptItem[]; readonly vendorSubtotals: Readonly<Record<string, number>>;
  readonly totals: {
    readonly totalWeightedCuts: number; readonly totalLoggedHours: number; readonly totalAssistantGross: number;
    readonly totalWithholdingTax: number; readonly totalVatAmount: number; readonly totalAssistantNet: number;
    readonly totalRightsBomCost: number; readonly unverifiedLicenseCount: number; readonly totalEpisodeProductionCost: number;
  };
  readonly erpWebhookPayload: {
    readonly schemaVersion: "toonstudio.erp.settlement.v1"; readonly dryRunOnly: true; readonly idempotencyKey: string;
    readonly period: string; readonly studioName: string; readonly workTitle: string; readonly episodeCode: string;
    readonly currency: "KRW" | "USD"; readonly assistantLineCount: number; readonly rightsBomCount: number;
    readonly totalPayableAmount: number; readonly commercialRightsReady: boolean;
  };
}

/** 컷별 어시스턴트 기여·일별 작업시간·Rights BOM 영수증을 집계해 단가·원천징수(3.3%)·실지급액 및 ERP 웹훅 페이로드를 산출한다. */
export function computeStudioSettlementReport(input: StudioSettlementInput): StudioSettlementReport {
  const currency = input.currency ?? "KRW";
  const defaultRate = input.withholdingRate ?? 0.033;

  const assistantLines: AssistantSettlementLine[] = input.assistants.map((a) => {
    const breakdown: Record<AssistantTaskRole, number> = { lineart: 0, flatting: 0, shading: 0, background: 0, lettering: 0 };
    let weightedCutCount = 0;
    for (const c of input.cutContributions) {
      if (c.assistantId !== a.assistantId) continue;
      const w = Math.max(0, c.weight ?? 1);
      breakdown[c.taskType] = Math.round((breakdown[c.taskType] + w) * 100) / 100;
      weightedCutCount += w;
    }
    weightedCutCount = Math.round(weightedCutCount * 100) / 100;

    let totalHours = 0;
    for (const log of input.dailyWorkLogs) if (log.assistantId === a.assistantId) totalHours += Math.max(0, log.hours);
    totalHours = Math.round(totalHours * 100) / 100;

    const cutPayAmount = Math.round(weightedCutCount * Math.max(0, a.ratePerCut));
    const timePayAmount = Math.round(totalHours * Math.max(0, a.hourlyRate));
    const grossAmount = cutPayAmount + timePayAmount;

    let withholdingRate = 0; let incomeTaxAmount = 0; let localTaxAmount = 0; let withholdingTaxAmount = 0; let vatAmount = 0;
    let netPayAmount = grossAmount;
    if (a.taxType === "freelancer-3.3") {
      withholdingRate = defaultRate;
      withholdingTaxAmount = Math.round(grossAmount * withholdingRate);
      incomeTaxAmount = Math.round(grossAmount * (withholdingRate * (30 / 33)));
      localTaxAmount = withholdingTaxAmount - incomeTaxAmount;
      netPayAmount = grossAmount - withholdingTaxAmount;
    } else if (a.taxType === "corporate-vat-10") {
      vatAmount = Math.round(grossAmount * 0.1);
      netPayAmount = grossAmount + vatAmount;
    }
    return { assistantId: a.assistantId, name: a.name, role: a.role, taxType: a.taxType, taskCutBreakdown: breakdown, weightedCutCount, totalHours, cutPayAmount, timePayAmount, grossAmount, withholdingRate, incomeTaxAmount, localTaxAmount, withholdingTaxAmount, vatAmount, netPayAmount };
  });

  const vendorSubtotals: Record<string, number> = {};
  let totalRightsBomCost = 0;
  let unverifiedLicenseCount = 0;
  for (const r of input.rightsBomReceipts) {
    const cost = Math.max(0, Math.round(r.costAmount));
    totalRightsBomCost += cost;
    vendorSubtotals[r.vendor] = (vendorSubtotals[r.vendor] ?? 0) + cost;
    if (!r.commercialVerified || r.licenseType === "editorial-only") unverifiedLicenseCount += 1;
  }

  const totalWeightedCuts = Math.round(assistantLines.reduce((s, l) => s + l.weightedCutCount, 0) * 100) / 100;
  const totalLoggedHours = Math.round(assistantLines.reduce((s, l) => s + l.totalHours, 0) * 100) / 100;
  const totalAssistantGross = assistantLines.reduce((s, l) => s + l.grossAmount, 0);
  const totalWithholdingTax = assistantLines.reduce((s, l) => s + l.withholdingTaxAmount, 0);
  const totalVatAmount = assistantLines.reduce((s, l) => s + l.vatAmount, 0);
  const totalAssistantNet = assistantLines.reduce((s, l) => s + l.netPayAmount, 0);

  return {
    settlementPeriod: input.settlementPeriod, studioName: input.studioName, workTitle: input.workTitle, episodeCode: input.episodeCode,
    currency, assistantLines, rightsBomReceipts: input.rightsBomReceipts, vendorSubtotals,
    totals: {
      totalWeightedCuts, totalLoggedHours, totalAssistantGross, totalWithholdingTax, totalVatAmount, totalAssistantNet,
      totalRightsBomCost, unverifiedLicenseCount, totalEpisodeProductionCost: totalAssistantGross + totalVatAmount + totalRightsBomCost,
    },
    erpWebhookPayload: {
      schemaVersion: "toonstudio.erp.settlement.v1", dryRunOnly: true,
      idempotencyKey: `erp-${slugifyId(input.settlementPeriod, "period")}-${slugifyId(input.workTitle, "work")}-${slugifyId(input.episodeCode, "ep")}`,
      period: input.settlementPeriod, studioName: input.studioName, workTitle: input.workTitle, episodeCode: input.episodeCode,
      currency, assistantLineCount: assistantLines.length, rightsBomCount: input.rightsBomReceipts.length,
      totalPayableAmount: totalAssistantNet + totalRightsBomCost, commercialRightsReady: unverifiedLicenseCount === 0,
    },
  };
}

function escapeCsvCell(raw: string | number): string {
  const str = String(raw);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, "\"\"")}"` : str;
}

/** CP·어시스턴트·Rights BOM 정산 리포트를 엄격한 RFC 4180 CSV(CRLF) 문자열로 직렬화한다. */
export function formatSettlementCsv(report: StudioSettlementReport): string {
  const rows: string[] = [
    ["row_type", "id", "name", "role_or_vendor", "weighted_cuts", "logged_hours", "gross_amount", "withholding_rate", "withholding_tax", "vat_amount", "net_or_cost", "commercial_status", "period"].join(","),
  ];
  for (const l of report.assistantLines) {
    rows.push(["assistant", l.assistantId, l.name, l.role, l.weightedCutCount, l.totalHours, l.grossAmount, l.withholdingRate, l.withholdingTaxAmount, l.vatAmount, l.netPayAmount, l.taxType, report.settlementPeriod].map(escapeCsvCell).join(","));
  }
  for (const r of report.rightsBomReceipts) {
    rows.push(["rights_bom", r.receiptId, r.assetName, r.vendor, r.cutIds.length, 0, r.costAmount, 0, 0, 0, r.costAmount, r.commercialVerified && r.licenseType !== "editorial-only" ? "verified-commercial" : "review-required", report.settlementPeriod].map(escapeCsvCell).join(","));
  }
  rows.push(["summary_total", report.episodeCode, `${report.studioName} - ${report.workTitle}`, report.currency, report.totals.totalWeightedCuts, report.totals.totalLoggedHours, report.totals.totalAssistantGross, 0.033, report.totals.totalWithholdingTax, report.totals.totalVatAmount, report.totals.totalAssistantNet + report.totals.totalRightsBomCost, report.totals.unverifiedLicenseCount === 0 ? "all-verified" : `unverified:${report.totals.unverifiedLicenseCount}`, report.settlementPeriod].map(escapeCsvCell).join(","));
  return `${rows.join("\r\n")}\r\n`;
}

export const SAMPLE_FOUNTAIN_SCRIPT = `Title: 월광 아틀리에 계약
Episode: EP.14 봉인 균열

INT. 고딕 회랑 - 밤

달빛이 깨진 스테인드글라스 사이로 쏟아진다.

@세린 (낮게)
봉인의 균열이 예상보다 빠르게 번지고 있어요.

SFX: 파지직!

@카엘 (외침)
지금 막지 못하면 탑 전체가 무너진다!

@세린 (속마음)
시간이 얼마 남지 않았어...

EXT. 탑 외벽 발코니 - 밤

차가운 밤바람에 망토가 세차게 펄럭인다.

@나레이션
그날 밤, 두 사람의 계약은 새로운 국면으로 접어들었다.
`;

export const SAMPLE_FDX_SCRIPT = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Version="5">
  <TitlePage><Content><Paragraph><Text>월광 아틀리에 계약</Text></Paragraph></Content></TitlePage>
  <Content>
    <Paragraph Type="Action"><Text>EP.14 봉인 균열</Text></Paragraph>
    <Paragraph Type="Scene Heading"><Text>INT. 아틀리에 지하 서고 - 밤</Text></Paragraph>
    <Paragraph Type="Action"><Text>고대 석판 위로 청색 균열 빛이 새어 나온다.</Text></Paragraph>
    <Paragraph Type="Character"><Text>세린</Text></Paragraph>
    <Paragraph Type="Parenthetical"><Text>(긴장)</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>석판의 마력 수치가 임계점을 넘겼어요!</Text></Paragraph>
    <Paragraph Type="Character"><Text>카엘</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>뒤로 물러서, 내가 봉인식을 다시 묶겠다.</Text></Paragraph>
  </Content>
</FinalDraft>`;

export const SAMPLE_SCRIVENER_MD_SCRIPT = `# 월광 아틀리에 계약
## EP.14 봉인 균열 — 장면 1: 시계탑 내부 - 새벽
> 톱니바퀴가 멈춘 거대한 시계탑 중앙에 세린이 서 있다.
**세린**(낮게): 멈춰 있던 태엽이 스스로 돌기 시작했어요.
SFX: 끼이익—
**카엘**(외침): 조심해, 천장에서 파편이 떨어진다!
`;

export const SAMPLE_NOTION_SCRIPT = `작품명: 월광 아틀리에 계약
회차: EP.14 봉인 균열
[장면 1] 아틀리에 옥상 - 노을
- 세린: 오늘 마감 전에 3D 배경 광원부터 맞춰야 해요.
- 카엘(외침): 알겠어, 태양 고도각 26도로 바로 동기화할게!
효과음: 스윽—
`;

export const DEFAULT_STUDIO_SETTLEMENT_INPUT: StudioSettlementInput = {
  settlementPeriod: "2026-11", studioName: "문라이트 웹툰 스튜디오", workTitle: "월광 아틀리에 계약", episodeCode: "EP.14", currency: "KRW", withholdingRate: 0.033,
  assistants: [
    { assistantId: "ast-line", name: "박지후", role: "lineart", ratePerCut: 18_000, hourlyRate: 0, taxType: "freelancer-3.3" },
    { assistantId: "ast-color", name: "이서아", role: "shading", ratePerCut: 14_000, hourlyRate: 15_000, taxType: "freelancer-3.3" },
    { assistantId: "ast-bg", name: "김도현", role: "background", ratePerCut: 22_000, hourlyRate: 0, taxType: "freelancer-3.3" },
  ],
  cutContributions: [
    { cutId: "cut-01", assistantId: "ast-line", taskType: "lineart", weight: 1, dateIso: "2026-11-18" },
    { cutId: "cut-02", assistantId: "ast-line", taskType: "lineart", weight: 1, dateIso: "2026-11-18" },
    { cutId: "cut-03", assistantId: "ast-line", taskType: "lineart", weight: 1, dateIso: "2026-11-19" },
    { cutId: "cut-01", assistantId: "ast-color", taskType: "flatting", weight: 1, dateIso: "2026-11-19" },
    { cutId: "cut-02", assistantId: "ast-color", taskType: "shading", weight: 1, dateIso: "2026-11-20" },
    { cutId: "cut-01", assistantId: "ast-bg", taskType: "background", weight: 1, dateIso: "2026-11-18" },
    { cutId: "cut-02", assistantId: "ast-bg", taskType: "background", weight: 0.5, dateIso: "2026-11-19" },
  ],
  dailyWorkLogs: [
    { assistantId: "ast-line", dateIso: "2026-11-18", hours: 5.5, note: "1~3컷 펜선" },
    { assistantId: "ast-color", dateIso: "2026-11-19", hours: 4.0, note: "밑색·광원 보정" },
    { assistantId: "ast-bg", dateIso: "2026-11-18", hours: 3.0, note: "고딕 회랑 3D 보정" },
  ],
  rightsBomReceipts: [
    { receiptId: "rcp-acon-01", assetName: "고딕 대성당 회랑 3D 배경팩", vendor: "ACON3D", licenseType: "commercial-perpetual", costAmount: 85_000, purchasedAtIso: "2026-11-15", commercialVerified: true, cutIds: ["cut-01", "cut-02"] },
    { receiptId: "rcp-font-02", assetName: "산돌 웹툰 대사·효과음 폰트(월간)", vendor: "Sandoll", licenseType: "commercial-subscription", costAmount: 29_000, purchasedAtIso: "2026-11-01", commercialVerified: true, cutIds: ["cut-01", "cut-02", "cut-03"] },
  ],
};
