import {
  BALLOON_MAX_CHARS, CUT_BALLOON_WARNING_MIN,
  type DialogueBalloonInput, type DialogueSplitSuggestion, type EpisodeCutInput,
} from "./episode-pacing-thumbnail-engine";

export const MAX_EPISODE_CUTS = 128;
export const MAX_CUT_BALLOONS = 32;
export const MAX_BALLOON_TEXT = 8192;
export const MAX_EPISODE_TEXT = 131072;
const MAX_CUT_LABEL_LENGTH = 4096;
const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });

function graphemes(text: string): readonly string[] {
  if (text.length > MAX_BALLOON_TEXT) throw new RangeError("말풍선 원문 상한은 8192자입니다.");
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

export function assertEpisodeCuts(cuts: readonly EpisodeCutInput[]): void {
  if (cuts.length > MAX_EPISODE_CUTS) throw new RangeError("회차 예제 상한은 128컷입니다.");
  const ids = new Set<string>();
  let totalText = 0;
  for (const cut of cuts) {
    if (!cut.id.trim() || cut.id.length > 256 || ids.has(cut.id)) throw new RangeError("컷 ID는 비어 있지 않고 고유해야 합니다.");
    ids.add(cut.id);
    if (!Number.isFinite(cut.tensionLevel)) throw new RangeError("긴장도는 유한한 수여야 합니다.");
    if (cut.balloons.length > MAX_CUT_BALLOONS) throw new RangeError("컷당 말풍선 상한은 32개입니다.");
    if (cut.labelKo.length > MAX_CUT_LABEL_LENGTH || cut.labelEn.length > MAX_CUT_LABEL_LENGTH) throw new RangeError("컷 설명 상한은 4096자입니다.");
    const balloonIds = new Set<string>();
    for (const balloon of cut.balloons) {
      if (!balloon.id.trim() || balloon.id.length > 256 || balloonIds.has(balloon.id)) throw new RangeError("컷 안의 말풍선 ID는 비어 있지 않고 고유해야 합니다.");
      balloonIds.add(balloon.id);
      if (balloon.text.length > MAX_BALLOON_TEXT || balloon.speaker.length > 4096) throw new RangeError("말풍선 원문·화자 상한을 넘었습니다.");
      totalText += balloon.text.length;
      if (totalText > MAX_EPISODE_TEXT) throw new RangeError("회차 전체 대사 상한은 131072자입니다.");
    }
  }
}

export function countDialogueChars(text: string): { readonly charCount: number; readonly hangulCharCount: number } {
  if (text.length > MAX_BALLOON_TEXT) throw new RangeError("말풍선 원문 상한은 8192자입니다.");
  const normalized = text.trim().replace(/\s+/gu, " ");
  const characters = graphemes(normalized);
  return { charCount: characters.length, hangulCharCount: characters.filter((part) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(part)).length };
}

/** 공백과 개행을 청크에 그대로 포함하고 grapheme 경계에서만 분리한다. */
export function suggestBalloonTextSplit(text: string, maxChars: number = BALLOON_MAX_CHARS): readonly string[] {
  if (!Number.isFinite(maxChars)) throw new RangeError("분할 상한은 유한한 수여야 합니다.");
  const limit = Math.min(256, Math.max(12, Math.floor(maxChars)));
  const characters = graphemes(text);
  const target = Math.max(12, Math.floor(limit * 0.86));
  const chunks: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = Math.min(characters.length, start + target);
    if (end < characters.length) {
      for (let boundary = end; boundary > start + Math.floor(target * 0.6); boundary -= 1) {
        if (/[\s.!?…~,]$/u.test(characters[boundary - 1] ?? "")) { end = boundary; break; }
      }
    }
    chunks.push(characters.slice(start, end).join(""));
    start = end;
  }
  return chunks;
}

/** UTF-16 입력 계약을 지키며 이모지·결합 문자 단위로 식별자 접두사를 제한한다. */
function episodeIdStem(base: string, budget: number): string {
  let stem = "";
  for (const { segment } of segmenter.segment(base)) {
    if (stem.length + segment.length > budget) break;
    stem += segment;
  }
  return stem || "id";
}

export function uniqueEpisodeId(base: string, ids: ReadonlySet<string>): string {
  const stem = episodeIdStem(base, 200);
  let id = stem;
  let sequence = 2;
  while (ids.has(id)) {
    const suffix = `-${sequence}`;
    id = `${episodeIdStem(stem, 256 - suffix.length)}${suffix}`;
    sequence += 1;
  }
  return id;
}

/** 최신 컷·말풍선 원문이 일치하는 제안만 메모리 사본에 적용한다. */
export function applySplitSuggestionToCuts(cuts: readonly EpisodeCutInput[], suggestion: DialogueSplitSuggestion): readonly EpisodeCutInput[] {
  assertEpisodeCuts(cuts);
  if (!Number.isInteger(suggestion.cutIndex)) return cuts;
  const target = cuts[suggestion.cutIndex];
  if (!target || target.id !== suggestion.cutId) return cuts;
  function splitCut(items: readonly DialogueBalloonInput[], at: number, suffixKo: string, suffixEn: string): readonly EpisodeCutInput[] {
    const nextLabelKo = `${target.labelKo} (${suffixKo})`;
    const nextLabelEn = `${target.labelEn} (${suffixEn})`;
    const second = {
      ...target, id: uniqueEpisodeId(`${target.id}-split`, new Set(cuts.map((cut) => cut.id))),
      labelKo: nextLabelKo.length <= MAX_CUT_LABEL_LENGTH ? nextLabelKo : target.labelKo,
      labelEn: nextLabelEn.length <= MAX_CUT_LABEL_LENGTH ? nextLabelEn : target.labelEn,
      role: "reaction" as const, actionShift: target.actionShift === "none" ? "subtle" as const : target.actionShift,
      balloons: items.slice(at),
    };
    const result = [...cuts.slice(0, suggestion.cutIndex), { ...target, balloons: items.slice(0, at) }, second, ...cuts.slice(suggestion.cutIndex + 1)];
    assertEpisodeCuts(result);
    return result;
  }
  if (suggestion.reason === "balloon-over-42-chars" && suggestion.balloonId) {
    const original = target.balloons.find((balloon) => balloon.id === suggestion.balloonId);
    if (!original || original.text !== suggestion.originalText) return cuts;
    if (suggestion.suggestedChunks.length > 1024 || suggestion.suggestedChunks.some((chunk) => chunk.length > MAX_BALLOON_TEXT)) throw new RangeError("분할 제안 상한을 넘었습니다.");
    const chunks = suggestion.suggestedChunks.length ? suggestion.suggestedChunks : suggestBalloonTextSplit(original.text);
    if (chunks.join("") !== original.text || chunks.some((chunk) => !chunk)) return cuts;
    const boundaries = new Set([original.text.length, ...Array.from(segmenter.segment(original.text), (part) => part.index)]);
    let offset = 0;
    for (const chunk of chunks) { offset += chunk.length; if (!boundaries.has(offset)) return cuts; }
    const ids = new Set(cuts.flatMap((cut) => cut.balloons.map((balloon) => balloon.id)));
    const expanded = target.balloons.flatMap((balloon) => {
      if (balloon.id !== original.id) return [balloon];
      return chunks.map((text, index) => { const id = uniqueEpisodeId(`${balloon.id}-s${index + 1}`, ids); ids.add(id); return { ...balloon, id, text }; });
    });
    if (expanded.length >= CUT_BALLOON_WARNING_MIN) return splitCut(expanded, Math.ceil(expanded.length / 2), "분할 호흡", "Split Beat");
    const result = cuts.map((cut, index) => index === suggestion.cutIndex ? { ...cut, balloons: expanded } : cut);
    assertEpisodeCuts(result);
    return result;
  }
  if (suggestion.reason === "cut-over-4-balloons" && target.balloons.length >= 2) {
    const source = suggestion.sourceBalloons;
    if (!source || source.length !== target.balloons.length || target.balloons.some((balloon, index) => {
      const previous = source[index];
      return !previous || previous.id !== balloon.id || previous.speaker !== balloon.speaker
        || previous.kind !== balloon.kind || previous.text !== balloon.text;
    })) return cuts;
    const requested = suggestion.recommendedCutSplitIndex ?? Math.ceil(target.balloons.length / 2);
    if (!Number.isFinite(requested)) return cuts;
    return splitCut(target.balloons, Math.max(1, Math.min(target.balloons.length - 1, Math.floor(requested))), "분할 컷", "Split Cut");
  }
  return cuts;
}
