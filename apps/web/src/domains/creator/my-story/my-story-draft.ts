/**
 * 인터뷰 답변 → 결정적 초안(규칙 기반). 순수 모듈.
 *
 * 같은 답변과 같은 템플릿이면 항상 같은 초안이 나온다. 하는 일은 배치뿐이다.
 * - 컷 요약: 템플릿 골격이 가리키는 답변을 나온 순서대로 모은다(사용자 글자 그대로).
 * - 나레이션 후보: 골격이 가리키는 답변을 상자 한 칸(maxChars) 단위로 나눈다. 넘치는 부분은
 *   버리지 않고 "이어서 쓸 후보"로 남긴다.
 * - 말풍선 후보: 사용자가 따옴표로 직접 묶은 말만 올린다. 없으면 비워 둔다.
 * - 빈 답변은 빈칸으로 표시한다. 대신 채우지 않는다(지어내지 않음).
 *
 * 인터뷰 엔진(domains/character-interview)이 "캐논 시트 근거 고정, 시트에 없는 값은 지어내지 않고
 * missingFields로 드러낸다"는 규율을 쓰는 것과 같은 원칙을 따른다 — 여기서는 사용자의 답변이 근거 시트다.
 */

import type { StudioStoryBeat, StudioStoryBeatKind } from "../studio-storyboard-planner";

import type { MyStorySession } from "./my-story-interview";
import {
  MY_STORY_CUT_ROLES,
  MY_STORY_TONES,
  pickMyStoryText,
  type MyStoryCutCount,
  type MyStoryCutRoleId,
  type MyStoryLocale,
  type MyStoryQuestion,
  type MyStorySlotId,
  type MyStoryTemplate,
  type MyStoryTemplateId,
  type MyStoryToneId,
} from "./my-story-model";
import { myStorySkeleton, myStoryTemplateById, resolveMyStoryToneId } from "./my-story-templates";
import {
  cleanMyStoryAnswer,
  detectMyStorySensitiveKinds,
  extractMyStoryQuotes,
  mergeMyStorySensitiveKinds,
  splitMyStoryNarration,
  type MyStorySensitiveKind,
} from "./my-story-text";

export interface MyStoryDraftPart {
  readonly slot: MyStorySlotId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly text: string;
}

export interface MyStoryMissingSlot {
  readonly slot: MyStorySlotId;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface MyStoryDraftNarration {
  /** 기본 후보. 빈 문자열이면 빈칸이다. */
  readonly text: string;
  /** 상자 한 칸을 넘는 뒷부분 — 다음 상자에 이어 쓸 후보. */
  readonly more: readonly string[];
  readonly slot: MyStorySlotId;
  /** answer = 사용자의 답변에서 나온 후보, ai = 사용자가 직접 채택한 AI 후보. */
  readonly source: "answer" | "ai";
  readonly maxChars: number;
  readonly position: "top" | "bottom";
}

export interface MyStoryDraftBalloon {
  /** 사용자가 따옴표로 묶은 첫 대사. 없으면 빈 문자열(빈칸). */
  readonly text: string;
  /** 같은 답변에서 나온 다른 대사 후보. */
  readonly more: readonly string[];
  readonly kind: "dialogue" | "thought";
  readonly maxChars: number;
  /** 첫 대사가 말풍선 권장 글자 수를 넘는가. 글자는 줄이지 않고 알리기만 한다. */
  readonly overflow: boolean;
}

export interface MyStoryDraftCut {
  /** 1부터. */
  readonly index: number;
  readonly id: string;
  readonly roleId: MyStoryCutRoleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shotKo: string;
  readonly shotEn: string;
  readonly beat: StudioStoryBeatKind;
  readonly parts: readonly MyStoryDraftPart[];
  readonly missing: readonly MyStoryMissingSlot[];
  /** 모은 답변을 " / "로 이은 한 줄. 빈 컷이면 빈 문자열. */
  readonly summary: string;
  readonly blank: boolean;
  /** 이 컷에 나레이션 계획이 없으면 null. 계획은 있는데 답이 없으면 text가 빈 문자열. */
  readonly narration: MyStoryDraftNarration | null;
  readonly balloon: MyStoryDraftBalloon | null;
}

export type MyStoryDraftWarning =
  | { readonly code: "blank-cuts"; readonly count: number }
  | { readonly code: "few-answers"; readonly answered: number; readonly total: number }
  | { readonly code: "narration-overflow"; readonly cutIndexes: readonly number[] }
  | { readonly code: "balloon-overflow"; readonly cutIndexes: readonly number[] }
  | { readonly code: "sensitive-text"; readonly kinds: readonly MyStorySensitiveKind[] };

export interface MyStoryDraft {
  readonly templateId: MyStoryTemplateId;
  readonly cutCount: MyStoryCutCount;
  readonly toneId: MyStoryToneId;
  /** 사용자가 정한 제목, 없으면 템플릿 기본 제목. */
  readonly title: string;
  readonly titleIsDefault: boolean;
  /** "전하고 싶은 한 줄" 답변 그대로. 없으면 빈 문자열. */
  readonly logline: string;
  readonly cuts: readonly MyStoryDraftCut[];
  readonly filledCuts: number;
  readonly blankCuts: number;
  readonly answered: number;
  readonly questionCount: number;
  readonly warnings: readonly MyStoryDraftWarning[];
}

/** 답변이 이 수보다 적으면 "더 적으면 좋아요" 안내를 띄운다. */
export const MY_STORY_FEW_ANSWERS_THRESHOLD = 3;

function questionBySlot(template: MyStoryTemplate): ReadonlyMap<MyStorySlotId, MyStoryQuestion> {
  return new Map(template.questions.map((question) => [question.slot, question]));
}

export function buildMyStoryDraft(
  session: MyStorySession,
  locale: MyStoryLocale,
): MyStoryDraft | null {
  const template = myStoryTemplateById(session.templateId);
  if (!template) return null;
  const { cutCount, cuts: defs } = myStorySkeleton(template, session.cutCount);
  const toneId = resolveMyStoryToneId(template, session.toneId);
  const questions = questionBySlot(template);
  const answer = (slot: MyStorySlotId): string => cleanMyStoryAnswer(session.answers[slot] ?? "");

  const cuts: MyStoryDraftCut[] = defs.map((def, offset) => {
    const role = MY_STORY_CUT_ROLES[def.role];
    const parts: MyStoryDraftPart[] = [];
    const missing: MyStoryMissingSlot[] = [];
    for (const slot of def.from) {
      const question = questions.get(slot);
      if (!question) continue;
      const text = answer(slot);
      if (text) parts.push({ slot, labelKo: question.labelKo, labelEn: question.labelEn, text });
      else missing.push({ slot, labelKo: question.labelKo, labelEn: question.labelEn });
    }

    let narration: MyStoryDraftNarration | null = null;
    if (def.narrate) {
      const override = (session.narrationOverrides[def.narrate] ?? "").trim();
      const chunks = splitMyStoryNarration(answer(def.narrate), template.narration.maxChars);
      const aiText = override && chunks.length > 0 ? override : "";
      narration = {
        text: aiText || (chunks[0] ?? ""),
        // AI 문장을 채택하면 그 문장이 상자 한 칸을 대신한다. 사용자의 원래 답변은 컷 요약(장면)에
        // 그대로 남아 있고, 채택을 풀면 규칙 기반 후보로 돌아온다.
        more: aiText ? [] : chunks.slice(1),
        slot: def.narrate,
        source: aiText ? "ai" : "answer",
        maxChars: template.narration.maxChars,
        position: template.narration.position,
      };
    }

    let balloon: MyStoryDraftBalloon | null = null;
    if (def.say) {
      const quotes = extractMyStoryQuotes(answer(def.say));
      const first = quotes[0] ?? "";
      balloon = {
        text: first,
        more: quotes.slice(1),
        kind: template.balloon.kind,
        maxChars: template.balloon.maxChars,
        overflow: Array.from(first).length > template.balloon.maxChars,
      };
    }

    return {
      index: offset + 1,
      id: `cut-${offset + 1}`,
      roleId: role.id,
      labelKo: role.labelKo,
      labelEn: role.labelEn,
      shotKo: role.shotKo,
      shotEn: role.shotEn,
      beat: role.beat,
      parts,
      missing,
      summary: parts.map((part) => part.text).join(" / "),
      blank: parts.length === 0,
      narration,
      balloon,
    };
  });

  const answered = template.questions.filter((question) => answer(question.slot)).length;
  const blankCuts = cuts.filter((entry) => entry.blank).length;
  const narrationOverflow = cuts.filter((entry) => (entry.narration?.more.length ?? 0) > 0).map((entry) => entry.index);
  const balloonOverflow = cuts.filter((entry) => entry.balloon?.overflow).map((entry) => entry.index);
  const sensitiveKinds = mergeMyStorySensitiveKinds(
    template.questions.map((question) => detectMyStorySensitiveKinds(session.answers[question.slot] ?? "")),
  );

  const warnings: MyStoryDraftWarning[] = [];
  if (blankCuts > 0) warnings.push({ code: "blank-cuts", count: blankCuts });
  if (answered < MY_STORY_FEW_ANSWERS_THRESHOLD) {
    warnings.push({ code: "few-answers", answered, total: template.questions.length });
  }
  if (narrationOverflow.length > 0) warnings.push({ code: "narration-overflow", cutIndexes: narrationOverflow });
  if (balloonOverflow.length > 0) warnings.push({ code: "balloon-overflow", cutIndexes: balloonOverflow });
  if (sensitiveKinds.length > 0) warnings.push({ code: "sensitive-text", kinds: sensitiveKinds });

  const customTitle = cleanMyStoryAnswer(session.title);
  return {
    templateId: template.id,
    cutCount,
    toneId,
    title: customTitle || pickMyStoryText(locale, template.defaultTitleKo, template.defaultTitleEn),
    titleIsDefault: customTitle === "",
    logline: answer("message"),
    cuts,
    filledCuts: cuts.length - blankCuts,
    blankCuts,
    answered,
    questionCount: template.questions.length,
    warnings,
  };
}

// ── 대본 본문 · 줄거리 · 콘티 비트 ──────────────────────────────────────

function blankMarker(locale: MyStoryLocale): string {
  return pickMyStoryText(locale, "(빈칸)", "(blank)");
}

function missingLabels(missing: readonly MyStoryMissingSlot[], locale: MyStoryLocale): string {
  return missing.map((entry) => pickMyStoryText(locale, entry.labelKo, entry.labelEn)).join(", ");
}

/**
 * 대본 패널(회차 본문)에 넣을 읽기 쉬운 원고. 첫 문단은 연출 메모(톤·나레이션/말풍선 기본값)이고
 * 이어서 컷마다 한 문단이다. 빈칸은 (빈칸)으로 남겨 어디를 채워야 하는지 보이게 한다.
 */
export function composeMyStoryScript(draft: MyStoryDraft, locale: MyStoryLocale): string {
  const template = myStoryTemplateById(draft.templateId);
  const tone = MY_STORY_TONES[draft.toneId];
  const L = (ko: string, en: string): string => pickMyStoryText(locale, ko, en);
  const blank = blankMarker(locale);
  const sections: string[] = [];

  if (template) {
    const position = template.narration.position === "top" ? L("위쪽", "top") : L("아래쪽", "bottom");
    const balloonKind = template.balloon.kind === "thought" ? L("생각", "thought") : L("대사", "speech");
    sections.push([
      `${L("내 이야기 초안", "My story draft")} · ${L(template.titleKo, template.titleEn)} · ${L(`${draft.cutCount}컷`, `${draft.cutCount} panels`)}`,
      `${L("톤", "Tone")}: ${L(tone.labelKo, tone.labelEn)} (${L(tone.voiceKo, tone.voiceEn)})`,
      L(
        `나레이션: ${position}, 한 상자 ${template.narration.maxChars}자 이내 · 말풍선: ${balloonKind}, ${template.balloon.maxChars}자 이내`,
        `Narration: ${position}, up to ${template.narration.maxChars} characters per box · Balloon: ${balloonKind}, up to ${template.balloon.maxChars} characters`,
      ),
    ].join("\n"));
  }

  for (const cut of draft.cuts) {
    const lines: string[] = [`${L("컷", "Panel")} ${cut.index} · ${L(cut.labelKo, cut.labelEn)}`];
    if (cut.blank) {
      lines.push(`${L("장면", "Scene")}: ${blank} ${L(`${missingLabels(cut.missing, locale)} 칸을 직접 채워 주세요`, `Fill in: ${missingLabels(cut.missing, locale)}`)}`);
    } else {
      lines.push(`${L("장면", "Scene")}: ${cut.summary}`);
      if (cut.missing.length > 0) {
        lines.push(`${L("빈 칸", "Empty")}: ${missingLabels(cut.missing, locale)}`);
      }
    }
    if (cut.narration) {
      lines.push(`${L("나레이션", "Narration")}: ${cut.narration.text || blank}`);
      for (const more of cut.narration.more) lines.push(`${L("나레이션(이어서)", "Narration (next box)")}: ${more}`);
    }
    if (cut.balloon) {
      lines.push(`${L("말풍선", "Balloon")}: ${cut.balloon.text ? `“${cut.balloon.text}”` : blank}`);
      for (const more of cut.balloon.more) lines.push(`${L("말풍선(다른 후보)", "Balloon (other)")}: “${more}”`);
    }
    sections.push(lines.join("\n"));
  }
  return sections.join("\n\n");
}

/** 줄거리 칸에 넣을 글 — 사용자가 쓴 사건·순간·결말 답변만 이어 붙인다(메모를 섞지 않는다). */
export function composeMyStorySynopsis(session: MyStorySession): string {
  const template = myStoryTemplateById(session.templateId);
  if (!template) return "";
  const slots: readonly MyStorySlotId[] = ["event", "turn", "ending"];
  return slots
    .filter((slot) => template.questions.some((question) => question.slot === slot))
    .map((slot) => cleanMyStoryAnswer(session.answers[slot] ?? ""))
    .filter((text) => text.length > 0)
    .join(" ");
}

/**
 * 컷마다 스토리 비트 하나. 기존 콘티 플래너(planStudioStoryboard)가 그대로 샷·카메라·여백을 계획한다.
 * 컷 수 = 비트 수라서 골격(4컷/8컷)이 콘티까지 그대로 이어진다.
 */
export function buildMyStoryBeats(draft: MyStoryDraft, locale: MyStoryLocale): StudioStoryBeat[] {
  const sceneSize = Math.max(1, Math.round(draft.cuts.length / 4));
  return draft.cuts.map((cut, offset) => {
    const sceneNumber = Math.floor(offset / sceneSize) + 1;
    const label = pickMyStoryText(locale, cut.labelKo, cut.labelEn);
    const dialogue = cut.balloon?.text ?? "";
    return {
      id: `my-story:beat:${cut.index}`,
      sceneId: `my-story:scene:${sceneNumber}`,
      order: offset,
      kind: cut.beat,
      summary: cut.blank
        ? pickMyStoryText(locale, `(빈칸) ${label} — 직접 채워 주세요`, `(blank) ${label} — fill this in`)
        : cut.summary,
      dialogue,
      // 대화·반응 비트는 등장인물이 있어야 콘티 플래너 경고가 나지 않는다. 기본 주인공(나)로 둔다.
      characterIds: cut.beat === "dialogue" || cut.beat === "reaction" ? ["character:lead"] : [],
      locationId: null,
    };
  });
}
