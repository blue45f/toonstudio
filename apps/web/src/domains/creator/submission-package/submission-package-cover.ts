/**
 * 투고 패키지 — 표지·시놉시스·캐릭터 Markdown 만들기(순수·결정적).
 *
 * 같은 입력과 같은 `generatedAt` 이면 항상 같은 글을 낸다. 사용자가 적은 글은 모두 이스케이프해서 받는 사람의
 * Markdown 뷰어가 제목·링크·HTML 로 해석하지 못하게 한다. 서버로 보내지 않는 브라우저 안 산출물이다.
 */
import { formatStudioByteSize } from "../export/studio-episode-byte-budget";

import { describeSubmissionIssue, SUBMISSION_COMPLETENESS_LABELS } from "./submission-package-messages";
import {
  SUBMISSION_PACKAGE_CHARACTERS_PATH,
  SUBMISSION_PACKAGE_COVER_PATH,
  SUBMISSION_PACKAGE_COVER_PDF_PATH,
  SUBMISSION_PACKAGE_MANIFEST_PATH,
  SUBMISSION_PACKAGE_SYNOPSIS_PATH,
  type SubmissionPackageLayout,
} from "./submission-package-layout";
import { submissionTargetWidth } from "./submission-package-preflight";
import {
  escapeMarkdownInline,
  escapeMarkdownLine,
  normalizeSingleLine,
  normalizeUserText,
  toMarkdownQuote,
} from "./submission-package-text";
import type {
  SubmissionCharacterRelation,
  SubmissionCharacterSheet,
  SubmissionPackageDraft,
  SubmissionPackageLocale,
  SubmissionPreflightReport,
} from "./submission-package-types";

export interface SubmissionCoverInput {
  readonly draft: SubmissionPackageDraft;
  readonly report: SubmissionPreflightReport;
  readonly layout: SubmissionPackageLayout;
  readonly locale: SubmissionPackageLocale;
  /** 내보내기 순간의 시계를 호출자가 넘겨 결과를 결정적으로 만든다. */
  readonly generatedAt: Date;
}

export interface SubmissionCoverLabels {
  readonly author: string;
  readonly madeOn: string;
  readonly contents: string;
  readonly widthCheck: string;
  readonly widthOff: string;
  readonly logline: string;
  readonly synopsis: string;
  readonly episodes: string;
  readonly tableHeader: readonly [string, string, string, string, string, string];
  readonly characters: string;
  readonly charactersDetail: string;
  readonly checks: string;
  readonly checksClean: string;
  readonly checksSome: (warnings: number) => string;
  readonly missingTitle: string;
  readonly files: string;
  readonly notWritten: string;
  readonly noEpisodes: string;
  readonly noCharacters: string;
  readonly episodeLabel: (number: number) => string;
  readonly episodeSummary: (episodes: number, pages: number, size: string, characters: number) => string;
  readonly fileLines: {
    readonly cover: string;
    readonly coverPdf: string;
    readonly synopsis: string;
    readonly characters: string;
    readonly manifest: string;
    readonly episodeDir: (number: number, pages: number) => string;
  };
  readonly closing: readonly string[];
  readonly charactersTitle: string;
  readonly aliases: string;
  readonly personality: string;
  readonly speechStyle: string;
  readonly background: string;
  readonly motivation: string;
  readonly signatureLines: string;
  readonly appearanceNotes: string;
  readonly relations: string;
  readonly relationKind: Readonly<Record<string, string>>;
  readonly noSheet: string;
  readonly outgoing: string;
  readonly incoming: string;
}

const LABELS: Readonly<Record<SubmissionPackageLocale, SubmissionCoverLabels>> = Object.freeze({
  ko: {
    author: "작가",
    madeOn: "만든 날",
    contents: "구성",
    widthCheck: "가로 폭 점검 기준",
    widthOff: "점검하지 않음",
    logline: "로그라인",
    synopsis: "시놉시스",
    episodes: "회차",
    tableHeader: ["회차", "제목", "쪽", "가로 폭(px)", "용량", "메모"],
    characters: "캐릭터",
    charactersDetail: `자세한 시트는 \`${SUBMISSION_PACKAGE_CHARACTERS_PATH}\` 에 있어요.`,
    checks: "만들기 전 점검",
    checksClean: "막는 문제도, 알릴 문제도 없었어요.",
    checksSome: (warnings) => `알릴 내용이 ${warnings}건 있어요. 투고 전에 살펴보세요.`,
    missingTitle: "아직 갖추지 못한 구성",
    files: "묶음 구성",
    notWritten: "작성하지 않음",
    noEpisodes: "담긴 회차가 없어요.",
    noCharacters: "담긴 캐릭터 시트가 없어요.",
    episodeLabel: (number) => `${number}화`,
    episodeSummary: (episodes, pages, size, characters) => `회차 ${episodes}화 · 이미지 ${pages}장 · 합계 ${size} · 캐릭터 시트 ${characters}개`,
    fileLines: {
      cover: "이 표지",
      coverPdf: "표지 요약 PDF(그림으로 그린 요약본)",
      synopsis: "로그라인과 시놉시스 본문",
      characters: "캐릭터 시트",
      manifest: "파일 목록과 점검 결과(기계가 읽는 용도)",
      episodeDir: (number, pages) => `${number}화 원고 이미지 ${pages}장`,
    },
    closing: [
      "---",
      "이 패키지는 ToonStudio 에서 브라우저 안에서 만들었고 어떤 서버에도 올리지 않았어요.",
      "투고처마다 요구하는 형식과 분량이 달라요. 폭과 용량 점검은 작업용 기준이므로 제출 전에 투고처의 최신 안내를 확인해 주세요.",
    ],
    charactersTitle: "캐릭터 시트",
    aliases: "별칭",
    personality: "성격",
    speechStyle: "말투",
    background: "배경",
    motivation: "욕망·목표",
    signatureLines: "대표 대사",
    appearanceNotes: "외형 메모",
    relations: "관계",
    relationKind: {
      family: "가족",
      friend: "친구",
      rival: "라이벌",
      lover: "연인",
      mentor: "스승·멘토",
      enemy: "적대",
      colleague: "동료",
      other: "기타",
    },
    noSheet: "서술 시트가 아직 비어 있어요.",
    outgoing: "→",
    incoming: "←",
  },
  en: {
    author: "Author",
    madeOn: "Created on",
    contents: "Contents",
    widthCheck: "Width checked against",
    widthOff: "not checked",
    logline: "Logline",
    synopsis: "Synopsis",
    episodes: "Episodes",
    tableHeader: ["Episode", "Title", "Pages", "Width (px)", "Size", "Note"],
    characters: "Characters",
    charactersDetail: `Full sheets are in \`${SUBMISSION_PACKAGE_CHARACTERS_PATH}\`.`,
    checks: "Pre-build check",
    checksClean: "No blocking or notable issues were found.",
    checksSome: (warnings) => `${warnings} item(s) to review before you submit.`,
    missingTitle: "Parts not yet complete",
    files: "Package contents",
    notWritten: "not written",
    noEpisodes: "No episodes are included.",
    noCharacters: "No character sheets are included.",
    episodeLabel: (number) => `Ep. ${number}`,
    episodeSummary: (episodes, pages, size, characters) => `${episodes} episode(s) · ${pages} image(s) · ${size} in total · ${characters} character sheet(s)`,
    fileLines: {
      cover: "this cover",
      coverPdf: "summary PDF of the cover (drawn as pictures)",
      synopsis: "logline and synopsis text",
      characters: "character sheets",
      manifest: "file list and check results (machine readable)",
      episodeDir: (number, pages) => `${pages} manuscript image(s) for episode ${number}`,
    },
    closing: [
      "---",
      "This package was built inside the browser in ToonStudio and was not uploaded to any server.",
      "Each submission site asks for its own format and volume. The width and size checks are working guides, so check the site's current guidelines before you submit.",
    ],
    charactersTitle: "Character sheets",
    aliases: "Also known as",
    personality: "Personality",
    speechStyle: "Speech style",
    background: "Background",
    motivation: "Motivation",
    signatureLines: "Signature lines",
    appearanceNotes: "Appearance notes",
    relations: "Relationships",
    relationKind: {
      family: "family",
      friend: "friend",
      rival: "rival",
      lover: "lover",
      mentor: "mentor",
      enemy: "enemy",
      colleague: "colleague",
      other: "other",
    },
    noSheet: "The narrative sheet is still empty.",
    outgoing: "→",
    incoming: "←",
  },
});

/** 표지 PDF 가 Markdown 표지와 같은 문구를 쓰도록 라벨 묶음을 내준다. */
export function submissionCoverLabels(locale: SubmissionPackageLocale): SubmissionCoverLabels {
  return LABELS[locale];
}

export function submissionCoverDate(value: Date): string {
  return isoDate(value);
}

function isoDate(value: Date): string {
  const time = value.getTime();
  if (Number.isNaN(time)) throw new Error("A valid date is required to build the submission cover.");
  return value.toISOString().slice(0, 10);
}

function quotedOrPlaceholder(value: string, labels: SubmissionCoverLabels): string {
  const quote = toMarkdownQuote(value);
  return quote || `_${labels.notWritten}_`;
}

function cell(value: string): string {
  return escapeMarkdownInline(normalizeSingleLine(value)) || "—";
}

function relationLine(relation: SubmissionCharacterRelation, labels: SubmissionCoverLabels): string {
  const kind = labels.relationKind[relation.kind] ?? relation.kind;
  const label = relation.label || kind;
  const arrow = relation.direction === "outgoing" ? labels.outgoing : labels.incoming;
  const note = relation.note ? ` — ${escapeMarkdownInline(normalizeSingleLine(relation.note))}` : "";
  return `- ${arrow} **${escapeMarkdownInline(relation.withName)}** (${escapeMarkdownInline(label)})${note}`;
}

function titleOf(draft: SubmissionPackageDraft): string {
  return normalizeSingleLine(draft.title);
}

export function missingSubmissionParts(input: SubmissionCoverInput): string[] {
  return input.report.completeness.items
    .filter((item) => item.required && !item.done)
    .map((item) => SUBMISSION_COMPLETENESS_LABELS[item.key][input.locale]);
}

export function submissionWidthCheckText(input: SubmissionCoverInput, labels: SubmissionCoverLabels): string {
  const standard = submissionTargetWidth(input.draft.targetWidth);
  return standard ? `${standard.label} ${standard.width}px` : labels.widthOff;
}

/** `cover.md` — 받는 사람이 가장 먼저 여는 표지. */
export function buildSubmissionCoverMarkdown(input: SubmissionCoverInput): string {
  const labels = LABELS[input.locale];
  const { draft, report, layout } = input;
  const title = titleOf(draft);
  const author = normalizeSingleLine(draft.authorName);
  const characterCount = draft.characters.length;
  const lines: string[] = [`# ${escapeMarkdownLine(title)}`, ""];
  if (author) lines.push(`- ${labels.author}: ${escapeMarkdownInline(author)}`);
  lines.push(
    `- ${labels.madeOn}: ${isoDate(input.generatedAt)}`,
    `- ${labels.contents}: ${labels.episodeSummary(layout.episodes.length, layout.pageCount, formatStudioByteSize(report.totalBytes), characterCount)}`,
    `- ${labels.widthCheck}: ${submissionWidthCheckText(input, labels)}`,
    "",
  );

  const missing = missingSubmissionParts(input);
  if (missing.length > 0) {
    lines.push(`> **${labels.missingTitle}**: ${missing.join(", ")}`, "");
  }

  lines.push(`## ${labels.logline}`, "", quotedOrPlaceholder(draft.logline, labels), "");
  lines.push(`## ${labels.synopsis}`, "", quotedOrPlaceholder(draft.synopsis, labels), "");

  lines.push(`## ${labels.episodes}`, "");
  if (layout.episodes.length === 0) {
    lines.push(labels.noEpisodes, "");
  } else {
    const header = labels.tableHeader;
    lines.push(`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`);
    for (const planned of layout.episodes) {
      const stats = report.episodeStats.find((entry) => entry.episodeId === planned.episodeId);
      const episode = draft.episodes.find((entry) => entry.id === planned.episodeId);
      const widths = stats && stats.widths.length > 0 ? stats.widths.join(", ") : "—";
      lines.push(
        `| ${[
          labels.episodeLabel(planned.number),
          cell(episode?.title ?? ""),
          String(planned.pages.length),
          widths,
          formatStudioByteSize(stats?.totalBytes ?? 0),
          cell(episode?.note ?? ""),
        ].join(" | ")} |`,
      );
    }
    lines.push("");
  }

  lines.push(`## ${labels.characters}`, "");
  if (characterCount === 0) {
    lines.push(labels.noCharacters, "");
  } else {
    for (const sheet of draft.characters) {
      const aliasText = sheet.aliases.length > 0 ? ` (${escapeMarkdownInline(sheet.aliases.join(", "))})` : "";
      const gist = normalizeSingleLine(sheet.personality);
      lines.push(`- **${escapeMarkdownInline(sheet.name)}**${aliasText}${gist ? ` — ${escapeMarkdownInline(gist)}` : ""}`);
    }
    lines.push("", labels.charactersDetail, "");
  }

  lines.push(`## ${labels.checks}`, "");
  const notable = report.issues.filter((issue) => issue.severity !== "error");
  if (notable.length === 0) {
    lines.push(labels.checksClean, "");
  } else {
    lines.push(labels.checksSome(notable.length), "");
    for (const issue of notable) {
      const text = describeSubmissionIssue(issue, input.locale);
      lines.push(`- ${escapeMarkdownInline(text.title)}`);
    }
    lines.push("");
  }

  lines.push(`## ${labels.files}`, "");
  lines.push(`- \`${SUBMISSION_PACKAGE_COVER_PATH}\` — ${labels.fileLines.cover}`);
  if (layout.coverPdf) lines.push(`- \`${SUBMISSION_PACKAGE_COVER_PDF_PATH}\` — ${labels.fileLines.coverPdf}`);
  lines.push(
    `- \`${SUBMISSION_PACKAGE_SYNOPSIS_PATH}\` — ${labels.fileLines.synopsis}`,
    `- \`${SUBMISSION_PACKAGE_CHARACTERS_PATH}\` — ${labels.fileLines.characters}`,
    `- \`${SUBMISSION_PACKAGE_MANIFEST_PATH}\` — ${labels.fileLines.manifest}`,
  );
  for (const planned of layout.episodes) {
    lines.push(`- \`${planned.directory}/\` — ${labels.fileLines.episodeDir(planned.number, planned.pages.length)}`);
  }
  lines.push("", ...labels.closing, "");
  return lines.join("\n");
}

/** `synopsis.md` — 투고처가 글로 따로 받는 로그라인·시놉시스 본문. */
export function buildSubmissionSynopsisMarkdown(input: SubmissionCoverInput): string {
  const labels = LABELS[input.locale];
  const { draft } = input;
  const lines: string[] = [
    `# ${escapeMarkdownLine(titleOf(draft))}`,
    "",
    `## ${labels.logline}`,
    "",
    quotedOrPlaceholder(draft.logline, labels),
    "",
    `## ${labels.synopsis}`,
    "",
    quotedOrPlaceholder(draft.synopsis, labels),
    "",
  ];
  return lines.join("\n");
}

function sheetLines(sheet: SubmissionCharacterSheet, labels: SubmissionCoverLabels): string[] {
  const lines: string[] = [`## ${escapeMarkdownLine(sheet.name)}`, ""];
  if (sheet.aliases.length > 0) lines.push(`- ${labels.aliases}: ${escapeMarkdownInline(sheet.aliases.join(", "))}`);
  const fields: ReadonlyArray<readonly [string, string]> = [
    [labels.personality, sheet.personality],
    [labels.speechStyle, sheet.speechStyle],
    [labels.background, sheet.background],
    [labels.motivation, sheet.motivation],
    [labels.appearanceNotes, sheet.appearanceNotes],
  ];
  let filled = 0;
  for (const [label, value] of fields) {
    const text = normalizeUserText(value);
    if (!text) continue;
    filled += 1;
    lines.push("", `### ${label}`, "", toMarkdownQuote(text));
  }
  const signature = sheet.signatureLines.map(normalizeUserText).filter((line) => line.length > 0);
  if (signature.length > 0) {
    filled += 1;
    lines.push("", `### ${labels.signatureLines}`, "");
    for (const line of signature) lines.push(`- “${escapeMarkdownInline(normalizeSingleLine(line))}”`);
  }
  if (sheet.relations.length > 0) {
    lines.push("", `### ${labels.relations}`, "");
    for (const relation of sheet.relations) lines.push(relationLine(relation, labels));
  }
  if (filled === 0 && sheet.relations.length === 0) lines.push("", `_${labels.noSheet}_`);
  lines.push("");
  return lines;
}

/** `characters.md` — 캐릭터 시트 전체. */
export function buildSubmissionCharactersMarkdown(input: SubmissionCoverInput): string {
  const labels = LABELS[input.locale];
  const lines: string[] = [`# ${labels.charactersTitle} — ${escapeMarkdownInline(titleOf(input.draft))}`, ""];
  if (input.draft.characters.length === 0) {
    lines.push(labels.noCharacters, "");
  } else {
    for (const sheet of input.draft.characters) lines.push(...sheetLines(sheet, labels));
  }
  return lines.join("\n");
}
