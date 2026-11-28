/**
 * Wave 154 — KWCAG 2.2 · WCAG 2.2 AA · EAA 6대 웹툰 접근성 출고 결함 fail-closed 감사기.
 *
 * 1. `missing-panel-alt` (blocker)
 * 2. `untranscribed-dialogue` (blocker)
 * 3. `unexplained-visual-sfx` (warning)
 * 4. `redundant-alt-prefix` (warning)
 * 5. `alt-length-bloat` (warning)
 * 6. `reading-order-gap-or-duplicate` (blocker)
 */

import { clampInt, roundDeterministic } from "./accessible-alt-sha256";
import {
  DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS,
  type AccessibilityAuditDefect,
  type AccessibilityComplianceVerdict,
  type AccessibilityDefectCode,
  type AccessibleEpisodeInput,
  type AccessibleLocale,
  type AriaReadingNode,
  type AuditAccessibilityOptions,
  type CompiledAccessibleEpisode,
  type CompiledAccessiblePanel,
  type EpisodeAccessibilityAuditReport,
  type PanelAccessibilityAuditRow,
} from "./accessible-alt-types";
import {
  detectRedundantAltPrefix,
  normalizeWhitespace,
  resolveDialogueText,
  resolveSfxMeaning,
} from "./accessible-scene-locale-helpers";

type DefectPusher = (
  code: AccessibilityDefectCode,
  severity: "blocker" | "warning",
  locale: AccessibleLocale,
  panelId: string,
  panelIndex: number,
  standardRef: string,
  messageKo: string,
  evidence: string,
) => void;

function auditSourceSequenceIntegrity(
  episode: AccessibleEpisodeInput,
  primaryLocale: AccessibleLocale,
  pushDefect: DefectPusher,
): void {
  const seenPanelIndices = new Set<number>();
  let prevPanelIndex: number | null = null;

  for (let i = 0; i < episode.panels.length; i += 1) {
    const panel = episode.panels[i];
    if (
      !Number.isInteger(panel.panelIndex) ||
      panel.panelIndex < 1 ||
      seenPanelIndices.has(panel.panelIndex) ||
      (prevPanelIndex !== null && panel.panelIndex !== prevPanelIndex + 1)
    ) {
      pushDefect(
        "reading-order-gap-or-duplicate",
        "blocker",
        primaryLocale,
        panel.panelId,
        panel.panelIndex,
        "WCAG 2.2 SC 1.3.2 Meaningful Sequence",
        `컷 ${String(panel.panelIndex)}(${panel.panelId})의 컷 순번이 중복되었거나 연속 순서를 벗어났습니다.`,
        `expected=${String((prevPanelIndex ?? 0) + 1)}, actual=${String(panel.panelIndex)}`,
      );
    }
    seenPanelIndices.add(panel.panelIndex);
    prevPanelIndex = panel.panelIndex;

    const seenDlgOrders = new Set<number>();
    const validDlgOrders: number[] = [];
    for (let d = 0; d < panel.dialogues.length; d += 1) {
      const dlg = panel.dialogues[d];
      if (!Number.isInteger(dlg.order) || dlg.order < 1 || seenDlgOrders.has(dlg.order)) {
        pushDefect(
          "reading-order-gap-or-duplicate",
          "blocker",
          primaryLocale,
          panel.panelId,
          panel.panelIndex,
          "WCAG 2.2 SC 1.3.2 Meaningful Sequence",
          `컷 ${String(panel.panelIndex)} 대사(${dlg.dialogueId})의 발화 순서(${String(dlg.order)})가 중복되었거나 유효하지 않습니다.`,
          `dialogueId=${dlg.dialogueId}, order=${String(dlg.order)}`,
        );
      } else {
        seenDlgOrders.add(dlg.order);
        validDlgOrders.push(dlg.order);
      }
    }
    validDlgOrders.sort((a, b) => a - b);
    for (let k = 0; k < validDlgOrders.length; k += 1) {
      if (validDlgOrders[k] !== k + 1) {
        pushDefect(
          "reading-order-gap-or-duplicate",
          "blocker",
          primaryLocale,
          panel.panelId,
          panel.panelIndex,
          "WCAG 2.2 SC 1.3.2 Meaningful Sequence",
          `컷 ${String(panel.panelIndex)} 대사 발화 순서에 건너뛴 번호가 있습니다.`,
          `orders=[${validDlgOrders.join(",")}]`,
        );
        break;
      }
    }
  }
}

function auditLocalePanels(
  episode: AccessibleEpisodeInput,
  compiledById: ReadonlyMap<string, CompiledAccessiblePanel>,
  locale: AccessibleLocale,
  bloatLimit: number,
  pushDefect: DefectPusher,
): void {
  const seenOrders = new Set<number>();
  let expectedOrder = 1;

  for (let i = 0; i < episode.panels.length; i += 1) {
    const src = episode.panels[i];
    const locOut = compiledById.get(src.panelId)?.byLocale[locale];

    if (!locOut || normalizeWhitespace(locOut.conciseAlt).length === 0) {
      pushDefect(
        "missing-panel-alt",
        "blocker",
        locale,
        src.panelId,
        src.panelIndex,
        "KWCAG 2.2 1.1.1 / WCAG 2.2 SC 1.1.1",
        `[${locale}] 컷 ${String(src.panelIndex)}(${src.panelId})의 간결 대체텍스트(Alt-Text)가 비어 있습니다.`,
        "conciseAlt is empty",
      );
    } else {
      const prefix = detectRedundantAltPrefix(locOut.conciseAlt);
      if (prefix !== null) {
        pushDefect(
          "redundant-alt-prefix",
          "warning",
          locale,
          src.panelId,
          src.panelIndex,
          "KWCAG 2.2 1.1.1 Alt-Text Quality",
          `[${locale}] 컷 ${String(src.panelIndex)} 대체텍스트가 스크린리더 중복 접두사("${prefix}")로 시작합니다.`,
          `prefix=${prefix}`,
        );
      }
      if (locOut.conciseAlt.length > bloatLimit) {
        pushDefect(
          "alt-length-bloat",
          "warning",
          locale,
          src.panelId,
          src.panelIndex,
          "KWCAG 2.2 1.1.1 Concise Alt Guideline",
          `[${locale}] 컷 ${String(src.panelIndex)} 간결 Alt-Text 길이(${String(locOut.conciseAlt.length)}자)가 상한(${String(bloatLimit)}자)을 초과했습니다.`,
          `length=${String(locOut.conciseAlt.length)}, limit=${String(bloatLimit)}`,
        );
      }
    }

    const dlgNodes = new Map<string, AriaReadingNode>();
    const sfxNodes = new Map<string, AriaReadingNode>();
    if (locOut) {
      for (let n = 0; n < locOut.ariaReadingNodes.length; n += 1) {
        const node = locOut.ariaReadingNodes[n];
        if (node.kind === "dialogue-line") dlgNodes.set(node.sourceRefId, node);
        if (node.kind === "sfx-cue") sfxNodes.set(node.sourceRefId, node);
        if (
          !Number.isInteger(node.readingOrder) ||
          node.readingOrder < 1 ||
          seenOrders.has(node.readingOrder) ||
          node.readingOrder !== expectedOrder
        ) {
          pushDefect(
            "reading-order-gap-or-duplicate",
            "blocker",
            locale,
            src.panelId,
            src.panelIndex,
            "WCAG 2.2 SC 1.3.2 Meaningful Sequence",
            `[${locale}] 컷 ${String(src.panelIndex)} ARIA 노드(${node.nodeId}) 읽기 순서가 불일치합니다.`,
            `expected=${String(expectedOrder)}, actual=${String(node.readingOrder)}`,
          );
        }
        seenOrders.add(node.readingOrder);
        expectedOrder =
          Number.isInteger(node.readingOrder) && node.readingOrder >= expectedOrder
            ? node.readingOrder + 1
            : expectedOrder + 1;
      }
    }

    for (let d = 0; d < src.dialogues.length; d += 1) {
      const dlg = src.dialogues[d];
      const text = resolveDialogueText(dlg, locale);
      const node = dlgNodes.get(dlg.dialogueId);
      if (
        text.length === 0 ||
        !locOut ||
        locOut.extendedLongdesc.indexOf(text) === -1 ||
        !node ||
        node.textContent.indexOf(text) === -1
      ) {
        pushDefect(
          "untranscribed-dialogue",
          "blocker",
          locale,
          src.panelId,
          src.panelIndex,
          "WCAG 2.2 SC 1.1.1 / EAA Complete Text Alternative",
          `[${locale}] 컷 ${String(src.panelIndex)} 대사(${dlg.dialogueId})가 해설 또는 ARIA 읽기 그래프에서 누락되었습니다.`,
          `dialogueId=${dlg.dialogueId}`,
        );
      }
    }

    for (let s = 0; s < src.sfxItems.length; s += 1) {
      const sfx = src.sfxItems[s];
      const meaning = resolveSfxMeaning(sfx, locale);
      const node = sfxNodes.get(sfx.sfxId);
      if (meaning.length === 0 || !locOut || locOut.extendedLongdesc.indexOf(meaning) === -1 || !node) {
        pushDefect(
          "unexplained-visual-sfx",
          "warning",
          locale,
          src.panelId,
          src.panelIndex,
          "KWCAG 2.2 1.1.1 Sensory Meaning Equivalent",
          `[${locale}] 컷 ${String(src.panelIndex)} 효과음("${sfx.visualGlyph || sfx.sfxId}")에 청각 의미 설명이 누락되었습니다.`,
          `sfxId=${sfx.sfxId}`,
        );
      }
    }
  }
}

/** KWCAG 2.2 · WCAG 2.2 AA · EAA 6대 웹툰 접근성 결함을 fail-closed로 감사한다. */
export function auditEpisodeAccessibilityCompliance(
  episode: AccessibleEpisodeInput,
  compiled: CompiledAccessibleEpisode,
  options?: AuditAccessibilityOptions,
): EpisodeAccessibilityAuditReport {
  const primaryLocale: AccessibleLocale = options?.primaryLocale ?? "ko-KR";
  const checkedLocales: readonly AccessibleLocale[] =
    options?.locales && options.locales.length > 0 ? options.locales : compiled.locales;
  const bloatLimit = clampInt(
    options?.conciseAltBloatLimitChars ?? compiled.conciseAltBloatLimitChars,
    60,
    800,
    DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS,
  );

  const defects: AccessibilityAuditDefect[] = [];
  const countsByCode: Record<AccessibilityDefectCode, number> = {
    "missing-panel-alt": 0,
    "untranscribed-dialogue": 0,
    "unexplained-visual-sfx": 0,
    "redundant-alt-prefix": 0,
    "alt-length-bloat": 0,
    "reading-order-gap-or-duplicate": 0,
  };
  const pushDefect: DefectPusher = (
    code,
    severity,
    locale,
    panelId,
    panelIndex,
    standardRef,
    messageKo,
    evidence,
  ) => {
    countsByCode[code] += 1;
    defects.push({
      defectId: `a11y-${String(defects.length + 1).padStart(3, "0")}`,
      code,
      severity,
      locale,
      panelId,
      panelIndex,
      standardRef,
      messageKo,
      evidence,
    });
  };

  const compiledById = new Map<string, CompiledAccessiblePanel>();
  for (let i = 0; i < compiled.panels.length; i += 1) {
    compiledById.set(compiled.panels[i].panelId, compiled.panels[i]);
  }

  auditSourceSequenceIntegrity(episode, primaryLocale, pushDefect);
  for (let l = 0; l < checkedLocales.length; l += 1) {
    auditLocalePanels(episode, compiledById, checkedLocales[l], bloatLimit, pushDefect);
  }

  const panelMetrics: PanelAccessibilityAuditRow[] = [];
  let validAltPanels = 0;
  let totalDlg = 0;
  let transcribedDlg = 0;
  let totalSfx = 0;
  let explainedSfx = 0;
  let sumAltLen = 0;
  let maxAltLen = 0;

  for (let i = 0; i < episode.panels.length; i += 1) {
    const src = episode.panels[i];
    const locOut = compiledById.get(src.panelId)?.byLocale[primaryLocale];
    const altLen = locOut ? locOut.conciseAlt.length : 0;
    if (locOut && normalizeWhitespace(locOut.conciseAlt).length > 0) validAltPanels += 1;
    sumAltLen += altLen;
    if (altLen > maxAltLen) maxAltLen = altLen;

    const pDefects = defects.filter((d) => d.panelId === src.panelId);
    const dlgDone = src.dialogues.filter((dlg) => {
      const text = resolveDialogueText(dlg, primaryLocale);
      return (
        text.length > 0 &&
        locOut !== undefined &&
        locOut.extendedLongdesc.indexOf(text) !== -1 &&
        locOut.ariaReadingNodes.some((n) => n.kind === "dialogue-line" && n.sourceRefId === dlg.dialogueId)
      );
    }).length;
    const sfxDone = src.sfxItems.filter((sfx) => {
      const meaning = resolveSfxMeaning(sfx, primaryLocale);
      return (
        meaning.length > 0 &&
        locOut !== undefined &&
        locOut.extendedLongdesc.indexOf(meaning) !== -1 &&
        locOut.ariaReadingNodes.some((n) => n.kind === "sfx-cue" && n.sourceRefId === sfx.sfxId)
      );
    }).length;

    totalDlg += src.dialogues.length;
    transcribedDlg += dlgDone;
    totalSfx += src.sfxItems.length;
    explainedSfx += sfxDone;

    panelMetrics.push({
      panelId: src.panelId,
      panelIndex: src.panelIndex,
      conciseAltCharCount: altLen,
      dialogueCount: src.dialogues.length,
      transcribedDialogueCount: dlgDone,
      sfxCount: src.sfxItems.length,
      explainedSfxCount: sfxDone,
      ariaNodeCount: locOut ? locOut.ariaReadingNodes.length : 0,
      reusedPreviousSetting: locOut ? locOut.reusedPreviousSetting : false,
      blockerCount: pDefects.filter((d) => d.severity === "blocker").length,
      warningCount: pDefects.filter((d) => d.severity === "warning").length,
      readingOrders: locOut ? locOut.ariaReadingNodes.map((n) => n.readingOrder) : [],
      hasReadingOrderDefect: pDefects.some((d) => d.code === "reading-order-gap-or-duplicate"),
    });
  }

  const blockerCount = defects.filter((d) => d.severity === "blocker").length;
  const warningCount = defects.filter((d) => d.severity === "warning").length;
  const verdict: AccessibilityComplianceVerdict =
    blockerCount > 0 ? "fail-closed" : warningCount > 0 ? "pass-with-warnings" : "pass";
  const panelCount = episode.panels.length;

  return {
    episodeId: episode.episodeId,
    episodeTitleKo: normalizeWhitespace(episode.episodeTitleKo),
    primaryLocale,
    checkedLocales,
    verdict,
    readyForRelease: blockerCount === 0,
    kwcag22Compliant: blockerCount === 0,
    wcag22AaCompliant: blockerCount === 0,
    eaaCompliant: blockerCount === 0,
    totalPanelCount: panelCount,
    totalDialogueCount: totalDlg,
    totalSfxCount: totalSfx,
    blockerCount,
    warningCount,
    altCoveragePercent: panelCount === 0 ? 100 : roundDeterministic((validAltPanels / panelCount) * 100, 1),
    dialogueTranscriptionCoveragePercent:
      totalDlg === 0 ? 100 : roundDeterministic((transcribedDlg / totalDlg) * 100, 1),
    sfxSemanticCoveragePercent: totalSfx === 0 ? 100 : roundDeterministic((explainedSfx / totalSfx) * 100, 1),
    averageConciseAltChars: panelCount === 0 ? 0 : roundDeterministic(sumAltLen / panelCount, 1),
    maxConciseAltChars: maxAltLen,
    conciseAltTargetChars: compiled.conciseAltTargetChars,
    conciseAltBloatLimitChars: bloatLimit,
    antiRedundancySkippedSettingsCount: compiled.antiRedundancySkippedSettingsCount,
    panelMetrics,
    defects,
    defectCountsByCode: countsByCode,
    accessibilityManifestSha256Hex: compiled.accessibilityManifestSha256Hex,
  };
}
