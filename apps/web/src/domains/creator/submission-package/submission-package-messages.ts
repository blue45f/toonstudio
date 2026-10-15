/**
 * 투고 패키지 — 점검 이슈를 사람이 읽는 문구로 바꾼다(한국어·영어, 순수).
 *
 * 화면(점검 목록)과 표지(Markdown/PDF)가 같은 문구를 쓰도록 한 곳에 둔다. React 훅을 쓰지 않으므로 표지를
 * 만드는 순수 함수에서도 호출할 수 있다.
 */
import { formatStudioByteSize } from "../export/studio-episode-byte-budget";

import type { SubmissionCompletenessKey, SubmissionIssue, SubmissionIssueCode, SubmissionPackageLocale } from "./submission-package-types";

export interface SubmissionIssueText {
  readonly title: string;
  readonly hint: string;
}

type Params = SubmissionIssue["params"];

interface IssueTextPair {
  readonly ko: (params: Params) => SubmissionIssueText;
  readonly en: (params: Params) => SubmissionIssueText;
}

/** 앱 언어 코드를 이 기능이 가진 두 언어 중 하나로 고른다(한국어가 아니면 영어). */
export function resolveSubmissionLocale(language: string | null | undefined): SubmissionPackageLocale {
  return typeof language === "string" && language.trim().toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

function text(value: string | number | undefined): string {
  return value === undefined ? "" : String(value);
}

function bytes(value: string | number | undefined): string {
  return typeof value === "number" ? formatStudioByteSize(value) : text(value);
}

const TEXT_FIELD_LABELS: Readonly<Record<string, SubmissionLabelPair>> = Object.freeze({
  title: { ko: "작품 제목", en: "Title" },
  author: { ko: "작가명", en: "Author name" },
  logline: { ko: "로그라인", en: "Logline" },
  synopsis: { ko: "시놉시스", en: "Synopsis" },
  episodeTitle: { ko: "회차 제목", en: "Episode title" },
  episodeNote: { ko: "회차 메모", en: "Episode note" },
  "character.personality": { ko: "캐릭터 성격", en: "Character personality" },
  "character.speechStyle": { ko: "캐릭터 말투", en: "Character speech style" },
  "character.background": { ko: "캐릭터 배경", en: "Character background" },
  "character.motivation": { ko: "캐릭터 욕망·목표", en: "Character motivation" },
  "character.appearanceNotes": { ko: "캐릭터 외형 메모", en: "Character appearance notes" },
});

interface SubmissionLabelPair {
  readonly ko: string;
  readonly en: string;
}

function fieldLabel(field: string | number | undefined, locale: SubmissionPackageLocale): string {
  const key = text(field);
  return TEXT_FIELD_LABELS[key]?.[locale] ?? key;
}

const PLATFORM_NOTE_KO = "앱에 기록된 일반 기준값이에요. 제출 전에 투고처의 최신 안내를 확인해 주세요.";
const PLATFORM_NOTE_EN = "This is a general reference value recorded in the app. Check the submission site's current guidelines before you submit.";

const ISSUE_TEXT: Readonly<Record<SubmissionIssueCode, IssueTextPair>> = {
  "title-missing": {
    ko: () => ({ title: "작품 제목이 비어 있어요", hint: "패키지 이름과 표지에 쓰는 제목을 적어 주세요." }),
    en: () => ({ title: "The title is empty", hint: "Enter the title used for the package name and the cover." }),
  },
  "text-too-long": {
    ko: (p) => ({
      title: `${fieldLabel(p.field, "ko")}${p.name ? `(${text(p.name)})` : ""}이(가) 너무 길어요 (${text(p.length)}자 / 최대 ${text(p.max)}자)`,
      hint: "내용을 줄여 주세요. 표지에 잘라서 넣지 않고, 줄이기 전에는 패키지를 만들지 않아요.",
    }),
    en: (p) => ({
      title: `${fieldLabel(p.field, "en")}${p.name ? ` (${text(p.name)})` : ""} is too long (${text(p.length)} of ${text(p.max)} characters)`,
      hint: "Shorten the text. It is never cut off silently, so the package is not built until it fits.",
    }),
  },
  "episodes-too-few": {
    ko: (p) => ({
      title: `쓸 수 있는 회차가 ${text(p.actual)}화예요 — 투고에는 최소 ${text(p.required)}화가 필요해요`,
      hint: "회차마다 원고 이미지를 추가하거나 회차를 더해 주세요. 이미지가 없는 회차는 세지 않아요.",
    }),
    en: (p) => ({
      title: `Only ${text(p.actual)} usable episode(s) — a submission needs at least ${text(p.required)}`,
      hint: "Add manuscript images to each episode or add more episodes. Episodes without images are not counted.",
    }),
  },
  "episodes-too-many": {
    ko: (p) => ({ title: `회차가 너무 많아요 (${text(p.actual)}화 / 최대 ${text(p.max)}화)`, hint: "투고에 필요한 앞부분 회차만 남겨 주세요." }),
    en: (p) => ({ title: `Too many episodes (${text(p.actual)} of ${text(p.max)})`, hint: "Keep only the opening episodes a submission needs." }),
  },
  "episode-number-invalid": {
    ko: (p) => ({ title: p.number ? `회차 번호 ‘${text(p.number)}’가 올바르지 않아요` : "회차 번호가 비어 있어요", hint: "1 이상의 정수로 적어 주세요." }),
    en: (p) => ({ title: p.number ? `Episode number “${text(p.number)}” is not valid` : "The episode number is empty", hint: "Use a whole number of 1 or more." }),
  },
  "episode-number-duplicate": {
    ko: (p) => ({ title: `${text(p.number)}화가 두 번 이상 있어요`, hint: "회차 번호를 겹치지 않게 고치거나 중복된 회차를 지워 주세요." }),
    en: (p) => ({ title: `Episode ${text(p.number)} appears more than once`, hint: "Change the numbers so they do not overlap, or remove the duplicate." }),
  },
  "episode-number-gap": {
    ko: (p) => ({ title: `회차 번호가 이어지지 않아요 (빠진 번호: ${text(p.missing)})`, hint: "일부러 건너뛴 게 아니라면 번호를 확인해 주세요." }),
    en: (p) => ({ title: `Episode numbers skip ahead (missing: ${text(p.missing)})`, hint: "Check the numbers unless the gap is intentional." }),
  },
  "episode-empty": {
    ko: (p) => ({ title: `${text(p.number)}화에 이미지가 없어요`, hint: "원고 이미지를 추가하거나 이 회차를 지워 주세요." }),
    en: (p) => ({ title: `Episode ${text(p.number)} has no images`, hint: "Add manuscript images or remove this episode." }),
  },
  "episode-pages-too-many": {
    ko: (p) => ({ title: `한 회차의 이미지가 너무 많아요 (${text(p.actual)}장 / 최대 ${text(p.max)}장)`, hint: "긴 세로 이미지로 합치거나 회차를 나눠 주세요." }),
    en: (p) => ({ title: `Too many images in one episode (${text(p.actual)} of ${text(p.max)})`, hint: "Merge them into longer vertical images or split the episode." }),
  },
  "page-unsupported": {
    ko: (p) => ({ title: `‘${text(p.name)}’은(는) 담을 수 없는 형식이에요`, hint: "PNG·JPEG·WebP 이미지만 담을 수 있어요. 에디터에서 PNG나 JPEG로 내보내 주세요." }),
    en: (p) => ({ title: `“${text(p.name)}” is not a supported format`, hint: "Only PNG, JPEG and WebP images can be packed. Export PNG or JPEG from the editor." }),
  },
  "page-unreadable": {
    ko: (p) => ({ title: `‘${text(p.name)}’을(를) 읽지 못했어요`, hint: "파일이 손상됐거나 중간에 잘렸을 수 있어요. 다시 내보내서 추가해 주세요." }),
    en: (p) => ({ title: `Could not read “${text(p.name)}”`, hint: "The file may be damaged or cut short. Export it again and re-add it." }),
  },
  "page-empty": {
    ko: (p) => ({ title: `‘${text(p.name)}’은(는) 빈 파일이에요`, hint: "내용이 있는 이미지로 바꿔 주세요." }),
    en: (p) => ({ title: `“${text(p.name)}” is an empty file`, hint: "Replace it with an image that has content." }),
  },
  "page-too-large": {
    ko: (p) => ({
      title: `‘${text(p.name)}’이(가) ${bytes(p.bytes)}로 너무 커요 (최대 ${bytes(p.max)})`,
      hint: "이미지를 나누거나 JPEG로 내보내 용량을 줄여 주세요. 이 상한은 브라우저 메모리를 지키려고 앱이 정한 값이에요.",
    }),
    en: (p) => ({
      title: `“${text(p.name)}” is too large at ${bytes(p.bytes)} (max ${bytes(p.max)})`,
      hint: "Split the image or export it as JPEG to shrink it. This cap is set by the app to protect browser memory.",
    }),
  },
  "page-large": {
    ko: (p) => ({ title: `‘${text(p.name)}’이(가) ${bytes(p.bytes)}로 커요`, hint: `${bytes(p.max)}를 넘으면 메일·클라우드 업로드가 느리거나 막힐 수 있어요. 앱의 권장선이에요.` }),
    en: (p) => ({ title: `“${text(p.name)}” is large at ${bytes(p.bytes)}`, hint: `Above ${bytes(p.max)}, email and cloud uploads can be slow or blocked. This is the app's recommended line.` }),
  },
  "package-files-too-many": {
    ko: (p) => ({ title: `이미지가 너무 많아요 (${text(p.actual)}장 / 최대 ${text(p.max)}장)`, hint: "투고에 필요한 앞부분 회차만 담아 주세요." }),
    en: (p) => ({ title: `Too many images (${text(p.actual)} of ${text(p.max)})`, hint: "Include only the opening episodes a submission needs." }),
  },
  "package-too-large": {
    ko: (p) => ({
      title: `전체 용량이 ${bytes(p.bytes)}로 상한 ${bytes(p.max)}를 넘었어요`,
      hint: "회차 수를 줄이거나 이미지를 JPEG로 내보내 줄여 주세요. 이 상한은 브라우저 메모리를 지키려고 앱이 정한 값이에요.",
    }),
    en: (p) => ({
      title: `Total size ${bytes(p.bytes)} is over the ${bytes(p.max)} cap`,
      hint: "Include fewer episodes or export JPEG to shrink the images. This cap is set by the app to protect browser memory.",
    }),
  },
  "package-large": {
    ko: (p) => ({ title: `전체 용량이 ${bytes(p.bytes)}예요`, hint: `${bytes(p.max)}를 넘으면 메일 첨부나 클라우드 업로드 한도에 걸릴 수 있어요. 앱의 권장선이에요.` }),
    en: (p) => ({ title: `Total size is ${bytes(p.bytes)}`, hint: `Above ${bytes(p.max)}, email attachments and cloud uploads can hit limits. This is the app's recommended line.` }),
  },
  "width-mismatch": {
    ko: (p) => ({
      title: `${text(p.count)}장이 ${text(p.label)} ${text(p.expected)}px이 아니에요 (현재 ${text(p.found)}px)`,
      hint: "표준폭과 다르면 투고처 규격과 어긋날 수 있어요. 에디터에서 같은 폭으로 다시 내보내거나 점검 기준 폭을 바꿔 주세요. 표준폭은 작업용 가이드이고 투고처의 최신 안내가 우선이에요.",
    }),
    en: (p) => ({
      title: `${text(p.count)} image(s) are not ${text(p.expected)}px wide (${text(p.label)}); found ${text(p.found)}px`,
      hint: "A width other than the standard may not match the submission site's format. Export again at that width or change the width check. The standard widths are working guides; the site's current guidelines come first.",
    }),
  },
  "width-mixed": {
    ko: (p) => ({ title: `이미지마다 가로 폭이 달라요 (${text(p.widths)}px)`, hint: "폭을 하나로 맞추면 읽는 사람이 보기 편해요. 점검 기준 폭을 고르면 어느 쪽이 다른지 알려 드려요." }),
    en: (p) => ({ title: `Image widths differ (${text(p.widths)}px)`, hint: "A single width is easier to read. Pick a width to check against and the differing pages are listed." }),
  },
  "platform-file-over": {
    ko: (p) => ({ title: `${text(p.label)} 기준 이미지 한 장 ${bytes(p.max)}를 넘는 이미지가 ${text(p.count)}장 있어요`, hint: PLATFORM_NOTE_KO }),
    en: (p) => ({ title: `${text(p.count)} image(s) exceed the ${bytes(p.max)} per-image reference for ${text(p.label)}`, hint: PLATFORM_NOTE_EN }),
  },
  "platform-episode-over": {
    ko: (p) => ({ title: `${text(p.label)} 기준 회차 합계 ${bytes(p.max)}를 넘었어요 (${bytes(p.bytes)})`, hint: PLATFORM_NOTE_KO }),
    en: (p) => ({ title: `Episode total ${bytes(p.bytes)} exceeds the ${bytes(p.max)} reference for ${text(p.label)}`, hint: PLATFORM_NOTE_EN }),
  },
  "logline-missing": {
    ko: () => ({ title: "로그라인이 비어 있어요", hint: "작품을 한두 문장으로 소개하는 글이에요. 비워 두면 표지에 ‘작성하지 않음’으로 표시돼요." }),
    en: () => ({ title: "The logline is empty", hint: "A one- or two-sentence pitch. If left empty, the cover shows “not written”." }),
  },
  "synopsis-missing": {
    ko: () => ({ title: "시놉시스가 비어 있어요", hint: "줄거리를 적어 주세요. 비워 두면 표지에 ‘작성하지 않음’으로 표시돼요." }),
    en: () => ({ title: "The synopsis is empty", hint: "Write the story outline. If left empty, the cover shows “not written”." }),
  },
  "author-missing": {
    ko: () => ({ title: "작가명이 비어 있어요", hint: "필명이나 이름을 적으면 표지에 함께 들어가요. 비워도 괜찮아요." }),
    en: () => ({ title: "The author name is empty", hint: "A pen name or name appears on the cover. Leaving it empty is fine." }),
  },
  "characters-missing": {
    ko: () => ({ title: "담을 캐릭터 시트가 없어요", hint: "프로젝트의 스토리 > 캐릭터에서 시트를 적은 뒤 여기서 고를 수 있어요." }),
    en: () => ({ title: "No character sheets selected", hint: "Write sheets under the project's Story > Characters, then pick them here." }),
  },
  "character-sheet-thin": {
    ko: (p) => ({ title: `‘${text(p.name)}’ 시트가 거의 비어 있어요`, hint: "성격·배경·욕망 중 하나라도 적으면 읽는 사람이 인물을 이해하기 쉬워요." }),
    en: (p) => ({ title: `The sheet for “${text(p.name)}” is almost empty`, hint: "Fill in at least one of personality, background or motivation." }),
  },
  "characters-too-many": {
    ko: (p) => ({ title: `캐릭터 시트가 너무 많아요 (${text(p.actual)}개 / 최대 ${text(p.max)}개)`, hint: "주요 인물만 골라 주세요." }),
    en: (p) => ({ title: `Too many character sheets (${text(p.actual)} of ${text(p.max)})`, hint: "Choose the main characters only." }),
  },
};

export function describeSubmissionIssue(issue: SubmissionIssue, locale: SubmissionPackageLocale): SubmissionIssueText {
  return ISSUE_TEXT[issue.code][locale](issue.params);
}

export const SUBMISSION_COMPLETENESS_LABELS: Readonly<Record<SubmissionCompletenessKey, SubmissionLabelPair>> = Object.freeze({
  title: { ko: "작품 제목", en: "Title" },
  episodes: { ko: "회차 원고 3화 이상", en: "At least 3 episodes" },
  logline: { ko: "로그라인", en: "Logline" },
  synopsis: { ko: "시놉시스", en: "Synopsis" },
  characters: { ko: "캐릭터 시트", en: "Character sheets" },
  author: { ko: "작가명", en: "Author name" },
});
