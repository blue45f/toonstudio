/**
 * Wave 110 — 다국어 원문 한글 누출 차단·시리즈 용어집 강제·화자 말투/경어 일관성 감사기.
 *
 * - 비한국어 로케일에 한글 음절(`0xAC00..0xD7A3`)·자모가 잔류하면 fail-closed `'blocker'`로 차단한다.
 * - 잠긴 시리즈 용어집의 정본 번역 누락 및 금지 표기 이탈을 검출한다.
 * - 화자→청자 관계별 경어/반말/고어체 규칙을 한·일·불·독 표지로 대조한다.
 * - 순수 동기 ES2017 FIPS 180-4 SHA-256 릴리스 매니페스트 다이제스트와 출고 승인 판정을 산출한다.
 */

import {
  ALL_LOCALIZATION_LOCALES,
  LOCALIZATION_LOCALE_PROFILES,
  canonicalizeLocalizationJson,
  sha256LocalizationHex,
  type LocalizationTargetLocale,
} from "./localization-locale-profiles-and-crypto";
import {
  containsTermWithBoundary,
  evaluateRegisterViolation,
  scanRegisterMarkers,
  type RegisterPolitenessLevel,
} from "./localization-register-marker-scanner";

export { canonicalizeLocalizationJson, sha256LocalizationHex };
export type { RegisterPolitenessLevel };

export type LocalizationAuditSeverity = "blocker" | "warning";

export type LocalizationAuditFindingCode =
  | "untranslated-source-leak"
  | "glossary-forbidden-variant"
  | "glossary-missing-approved-term"
  | "register-honorific-mismatch";

export interface EpisodeLocalizedDialogueLine {
  readonly cutId: string;
  readonly balloonId: string;
  readonly speakerId: string;
  readonly listenerId?: string;
  readonly sourceKoText: string;
  readonly translationsByLocale: Readonly<Partial<Record<LocalizationTargetLocale, string>>>;
}

export interface EpisodeLocalizationPayload {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly seriesId?: string;
  readonly masterRevision?: number;
  readonly targetLocales?: readonly LocalizationTargetLocale[];
  readonly lines: readonly EpisodeLocalizedDialogueLine[];
}

export interface SeriesGlossaryTerm {
  readonly termId: string;
  readonly category?: "character" | "skill" | "location" | "item" | "faction" | "title";
  readonly sourceKo: string;
  readonly approvedByLocale: Readonly<
    Partial<Record<LocalizationTargetLocale, string | readonly string[]>>
  >;
  readonly forbiddenVariantsByLocale?: Readonly<
    Partial<Record<LocalizationTargetLocale, readonly string[]>>
  >;
  readonly caseSensitive?: boolean;
}

export interface SeriesGlossarySpec {
  readonly seriesId: string;
  readonly glossaryVersion: string;
  readonly terms: readonly SeriesGlossaryTerm[];
}

export interface SpeakerListenerRegisterRule {
  readonly ruleId: string;
  readonly speakerId: string;
  readonly listenerId: string;
  readonly requiredRegister: RegisterPolitenessLevel;
  readonly appliesToLocales?: readonly LocalizationTargetLocale[];
  readonly severity?: LocalizationAuditSeverity;
}

export interface SpeakerRegisterMatrix {
  readonly rules: readonly SpeakerListenerRegisterRule[];
  readonly treatRegisterMismatchAsBlocker?: boolean;
}

export interface LocalizationAuditFinding {
  readonly findingId: string;
  readonly code: LocalizationAuditFindingCode;
  readonly severity: LocalizationAuditSeverity;
  readonly cutId: string;
  readonly balloonId: string;
  readonly locale: LocalizationTargetLocale;
  readonly speakerId: string;
  readonly listenerId: string;
  readonly messageKo: string;
  readonly leakedSnippets?: readonly string[];
  readonly termId?: string;
  readonly sourceTermKo?: string;
  readonly detectedVariant?: string;
  readonly expectedApprovedTerms?: readonly string[];
  readonly ruleId?: string;
  readonly expectedRegister?: RegisterPolitenessLevel;
  readonly detectedRegister?: RegisterPolitenessLevel;
  readonly matchedMarkers?: readonly string[];
}

export interface CutLocaleAuditStatus {
  readonly cutId: string;
  readonly locale: LocalizationTargetLocale;
  readonly hasLeakBlocker: boolean;
  readonly hasGlossaryBlocker: boolean;
  readonly hasRegisterIssue: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
}

export interface LocaleGlossaryAuditSummary {
  readonly locale: LocalizationTargetLocale;
  readonly inspectedLineCount: number;
  readonly untranslatedSourceLeakCount: number;
  readonly glossaryViolationCount: number;
  readonly registerViolationCount: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly approved: boolean;
}

export interface GlossaryRegisterLeakAuditReport {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly seriesId: string;
  readonly masterRevision: number;
  readonly glossaryVersion: string;
  readonly targetLocales: readonly LocalizationTargetLocale[];
  readonly cutIds: readonly string[];
  readonly inspectedLineCount: number;
  readonly untranslatedSourceLeakCount: number;
  readonly totalLeakedHangulChars: number;
  readonly glossaryViolationCount: number;
  readonly forbiddenVariantCount: number;
  readonly missingApprovedTermCount: number;
  readonly registerViolationCount: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly exportApproved: boolean;
  readonly releaseManifestSha256: string;
  readonly perLocaleSummaries: readonly LocaleGlossaryAuditSummary[];
  readonly cutLocaleStatuses: readonly CutLocaleAuditStatus[];
  readonly findings: readonly LocalizationAuditFinding[];
}

function isHangulCodePoint(code: number): boolean {
  return (
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x3131 && code <= 0x318e) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xd7b0 && code <= 0xd7ff)
  );
}

/** 비한국어 텍스트에 잔류한 한글 음절·자모 구간을 전부 추출한다. */
export function detectStrayHangulSnippets(text: string): {
  readonly snippets: readonly string[];
  readonly totalHangulChars: number;
} {
  const snippets: string[] = [];
  let totalHangulChars = 0;
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    if (isHangulCodePoint(text.charCodeAt(i))) {
      current += text.charAt(i);
      totalHangulChars += 1;
    } else if (current.length > 0) {
      snippets.push(current);
      current = "";
    }
  }
  if (current.length > 0) snippets.push(current);
  return { snippets, totalHangulChars };
}

function normalizeApprovedList(raw: string | readonly string[] | undefined): readonly string[] {
  if (raw === undefined) return [];
  const items = typeof raw === "string" ? [raw] : raw;
  const clean: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const trimmed = items[i].trim();
    if (trimmed.length > 0) clean.push(trimmed);
  }
  return clean;
}

function resolveRegisterRule(
  speakerId: string,
  listenerId: string,
  locale: LocalizationTargetLocale,
  rules: readonly SpeakerListenerRegisterRule[],
): SpeakerListenerRegisterRule | null {
  let wildcardMatch: SpeakerListenerRegisterRule | null = null;
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (rule.speakerId !== speakerId) continue;
    if (rule.appliesToLocales && rule.appliesToLocales.indexOf(locale) < 0) continue;
    if (rule.listenerId === listenerId) return rule;
    if (rule.listenerId === "*" && wildcardMatch === null) wildcardMatch = rule;
  }
  return wildcardMatch;
}

function resolveTargetLocales(payload: EpisodeLocalizationPayload): readonly LocalizationTargetLocale[] {
  const out: LocalizationTargetLocale[] = [];
  if (payload.targetLocales) {
    for (let i = 0; i < payload.targetLocales.length; i += 1) {
      const loc = payload.targetLocales[i];
      if (LOCALIZATION_LOCALE_PROFILES[loc] && out.indexOf(loc) < 0) out.push(loc);
    }
  }
  for (let i = 0; i < payload.lines.length; i += 1) {
    const map = payload.lines[i].translationsByLocale;
    for (let j = 0; j < ALL_LOCALIZATION_LOCALES.length; j += 1) {
      const loc = ALL_LOCALIZATION_LOCALES[j];
      if (map[loc] !== undefined && out.indexOf(loc) < 0) out.push(loc);
    }
  }
  return out;
}

/**
 * 에피소드 다국어 번역본의 원문 한글 누출, 용어집 일관성, 화자 말투 규칙을 감사하고
 * 결정론적 FIPS 180-4 SHA-256 릴리스 다이제스트와 출고 승인 판정을 산출한다.
 */
export function auditLocalizationGlossaryAndRegister(
  episodeLocalizations: EpisodeLocalizationPayload,
  glossarySpec: SeriesGlossarySpec,
  registerMatrix: SpeakerRegisterMatrix,
): GlossaryRegisterLeakAuditReport {
  const targetLocales = resolveTargetLocales(episodeLocalizations);
  const cutIds: string[] = [];
  const findings: LocalizationAuditFinding[] = [];
  let findingSeq = 0;
  let untranslatedSourceLeakCount = 0;
  let totalLeakedHangulChars = 0;
  let forbiddenVariantCount = 0;
  let missingApprovedTermCount = 0;
  let registerViolationCount = 0;
  let totalInspectedLines = 0;

  const cutLocaleMap = new Map<
    string,
    {
      cutId: string;
      locale: LocalizationTargetLocale;
      hasLeakBlocker: boolean;
      hasGlossaryBlocker: boolean;
      hasRegisterIssue: boolean;
      blockerCount: number;
      warningCount: number;
    }
  >();
  const perLocaleCounters = new Map<
    LocalizationTargetLocale,
    { inspected: number; leaks: number; glossary: number; register: number; blockers: number; warnings: number }
  >();
  for (let i = 0; i < targetLocales.length; i += 1) {
    perLocaleCounters.set(targetLocales[i], {
      inspected: 0,
      leaks: 0,
      glossary: 0,
      register: 0,
      blockers: 0,
      warnings: 0,
    });
  }

  const recordFinding = (
    draft: Omit<LocalizationAuditFinding, "findingId">,
    category: "leak" | "glossary" | "register",
  ): void => {
    findingSeq += 1;
    findings.push({ findingId: `LOC-AUD-${String(findingSeq).padStart(4, "0")}`, ...draft });
    const locStats = perLocaleCounters.get(draft.locale);
    if (locStats) {
      if (category === "leak") locStats.leaks += 1;
      if (category === "glossary") locStats.glossary += 1;
      if (category === "register") locStats.register += 1;
      if (draft.severity === "blocker") locStats.blockers += 1;
      else locStats.warnings += 1;
    }
    const cellKey = `${draft.cutId}::${draft.locale}`;
    let cell = cutLocaleMap.get(cellKey);
    if (!cell) {
      cell = {
        cutId: draft.cutId,
        locale: draft.locale,
        hasLeakBlocker: false,
        hasGlossaryBlocker: false,
        hasRegisterIssue: false,
        blockerCount: 0,
        warningCount: 0,
      };
      cutLocaleMap.set(cellKey, cell);
    }
    if (category === "leak") cell.hasLeakBlocker = true;
    if (category === "glossary") cell.hasGlossaryBlocker = true;
    if (category === "register") cell.hasRegisterIssue = true;
    if (draft.severity === "blocker") cell.blockerCount += 1;
    else cell.warningCount += 1;
  };

  for (let i = 0; i < episodeLocalizations.lines.length; i += 1) {
    const line = episodeLocalizations.lines[i];
    if (cutIds.indexOf(line.cutId) < 0) cutIds.push(line.cutId);
    const listenerId = line.listenerId ?? "*";

    for (let li = 0; li < targetLocales.length; li += 1) {
      const locale = targetLocales[li];
      const localizedText = line.translationsByLocale[locale];
      if (localizedText === undefined) continue;

      totalInspectedLines += 1;
      const locStats = perLocaleCounters.get(locale);
      if (locStats) locStats.inspected += 1;

      const cellKey = `${line.cutId}::${locale}`;
      if (!cutLocaleMap.has(cellKey)) {
        cutLocaleMap.set(cellKey, {
          cutId: line.cutId,
          locale,
          hasLeakBlocker: false,
          hasGlossaryBlocker: false,
          hasRegisterIssue: false,
          blockerCount: 0,
          warningCount: 0,
        });
      }

      if (locale !== "ko-KR") {
        const leak = detectStrayHangulSnippets(localizedText);
        if (leak.totalHangulChars > 0) {
          untranslatedSourceLeakCount += 1;
          totalLeakedHangulChars += leak.totalHangulChars;
          recordFinding(
            {
              code: "untranslated-source-leak",
              severity: "blocker",
              cutId: line.cutId,
              balloonId: line.balloonId,
              locale,
              speakerId: line.speakerId,
              listenerId,
              leakedSnippets: leak.snippets,
              messageKo: `${locale} 말풍선(${line.balloonId})에 미번역 한글 "${leak.snippets.join(", ")}" 잔류`,
            },
            "leak",
          );
        }
      }

      for (let ti = 0; ti < glossarySpec.terms.length; ti += 1) {
        const term = glossarySpec.terms[ti];
        const caseSensitive = term.caseSensitive === true;
        const approvedList = normalizeApprovedList(term.approvedByLocale[locale]);
        const forbiddenList = term.forbiddenVariantsByLocale?.[locale] ?? [];

        let matchedForbidden: string | null = null;
        for (let fi = 0; fi < forbiddenList.length; fi += 1) {
          if (containsTermWithBoundary(localizedText, forbiddenList[fi], locale, caseSensitive, false)) {
            matchedForbidden = forbiddenList[fi];
            break;
          }
        }

        if (matchedForbidden !== null) {
          forbiddenVariantCount += 1;
          recordFinding(
            {
              code: "glossary-forbidden-variant",
              severity: "blocker",
              cutId: line.cutId,
              balloonId: line.balloonId,
              locale,
              speakerId: line.speakerId,
              listenerId,
              termId: term.termId,
              sourceTermKo: term.sourceKo,
              detectedVariant: matchedForbidden,
              expectedApprovedTerms: approvedList,
              messageKo: `${locale} 말풍선(${line.balloonId})에 금지 표기 "${matchedForbidden}" 사용 (정본: ${approvedList.join(" / ") || term.sourceKo})`,
            },
            "glossary",
          );
        } else if (
          term.sourceKo.trim().length > 0 &&
          line.sourceKoText.indexOf(term.sourceKo) >= 0 &&
          approvedList.length > 0
        ) {
          let approvedFound = false;
          for (let ai = 0; ai < approvedList.length; ai += 1) {
            if (containsTermWithBoundary(localizedText, approvedList[ai], locale, caseSensitive, true)) {
              approvedFound = true;
              break;
            }
          }
          if (!approvedFound) {
            missingApprovedTermCount += 1;
            recordFinding(
              {
                code: "glossary-missing-approved-term",
                severity: "blocker",
                cutId: line.cutId,
                balloonId: line.balloonId,
                locale,
                speakerId: line.speakerId,
                listenerId,
                termId: term.termId,
                sourceTermKo: term.sourceKo,
                expectedApprovedTerms: approvedList,
                messageKo: `원문 용어 "${term.sourceKo}"의 ${locale} 정본 표기(${approvedList.join(" / ")}) 누락`,
              },
              "glossary",
            );
          }
        }
      }

      const rule = resolveRegisterRule(line.speakerId, listenerId, locale, registerMatrix.rules);
      if (rule) {
        const scan = scanRegisterMarkers(localizedText, locale);
        if (scan) {
          const mismatch = evaluateRegisterViolation(rule.requiredRegister, scan);
          if (mismatch) {
            registerViolationCount += 1;
            const severity: LocalizationAuditSeverity =
              rule.severity ??
              (registerMatrix.treatRegisterMismatchAsBlocker === true ? "blocker" : "warning");
            recordFinding(
              {
                code: "register-honorific-mismatch",
                severity,
                cutId: line.cutId,
                balloonId: line.balloonId,
                locale,
                speakerId: line.speakerId,
                listenerId,
                ruleId: rule.ruleId,
                expectedRegister: rule.requiredRegister,
                detectedRegister: mismatch.detected,
                matchedMarkers: mismatch.markers,
                messageKo: `${line.speakerId}→${listenerId} ${locale} 대사 말투 불일치 (기대: ${rule.requiredRegister}, 감지: ${mismatch.detected} [${mismatch.markers.join(", ")}])`,
              },
              "register",
            );
          }
        }
      }
    }
  }

  let blockerCount = 0;
  let warningCount = 0;
  for (let i = 0; i < findings.length; i += 1) {
    if (findings[i].severity === "blocker") blockerCount += 1;
    else warningCount += 1;
  }

  const perLocaleSummaries: LocaleGlossaryAuditSummary[] = targetLocales.map((loc) => {
    const s = perLocaleCounters.get(loc) ?? {
      inspected: 0,
      leaks: 0,
      glossary: 0,
      register: 0,
      blockers: 0,
      warnings: 0,
    };
    return {
      locale: loc,
      inspectedLineCount: s.inspected,
      untranslatedSourceLeakCount: s.leaks,
      glossaryViolationCount: s.glossary,
      registerViolationCount: s.register,
      blockerCount: s.blockers,
      warningCount: s.warnings,
      approved: s.blockers === 0,
    };
  });

  const exportApproved = blockerCount === 0;
  const glossaryViolationCount = forbiddenVariantCount + missingApprovedTermCount;
  const seriesId = episodeLocalizations.seriesId ?? glossarySpec.seriesId;
  const masterRevision = episodeLocalizations.masterRevision ?? 1;
  const releaseManifestSha256 = sha256LocalizationHex(
    canonicalizeLocalizationJson({
      schemaVersion: "toonstudio-wave110-localization-release-v1",
      episodeId: episodeLocalizations.episodeId,
      episodeTitle: episodeLocalizations.episodeTitle,
      seriesId,
      masterRevision,
      glossaryVersion: glossarySpec.glossaryVersion,
      targetLocales,
      lines: episodeLocalizations.lines,
      glossaryTerms: glossarySpec.terms,
      registerRules: registerMatrix.rules,
      verdict: {
        exportApproved,
        blockerCount,
        warningCount,
        untranslatedSourceLeakCount,
        glossaryViolationCount,
        registerViolationCount,
      },
    }),
  );

  return {
    episodeId: episodeLocalizations.episodeId,
    episodeTitle: episodeLocalizations.episodeTitle,
    seriesId,
    masterRevision,
    glossaryVersion: glossarySpec.glossaryVersion,
    targetLocales,
    cutIds,
    inspectedLineCount: totalInspectedLines,
    untranslatedSourceLeakCount,
    totalLeakedHangulChars,
    glossaryViolationCount,
    forbiddenVariantCount,
    missingApprovedTermCount,
    registerViolationCount,
    blockerCount,
    warningCount,
    exportApproved,
    releaseManifestSha256,
    perLocaleSummaries,
    cutLocaleStatuses: Array.from(cutLocaleMap.values()),
    findings,
  };
}
