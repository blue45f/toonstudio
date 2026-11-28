/**
 * Wave 154 — 3개국어(한/영/일) 웹툰 장면 해설 컴파일러, KWCAG/WCAG/EAA 감사 진입점,
 * 점자·TTS 오디오 드라마 대본 익스포터.
 *
 * - 연속 컷 동일 배경·인물 중복 생략(Anti-Redundancy Delta Description)으로 스크린리더 피로를 줄인다.
 * - 말풍선 대사는 화자·전달 스타일과 함께 `order` 순서대로 누락 없이 직렬화한다.
 * - 시각 효과음은 단순 글리프가 아닌 청각 의미 해설로 변환하고 FIPS 180-4 SHA-256 지문을 생성한다.
 */

import { clampInt, sha256AccessibleAltHex } from "./accessible-alt-sha256";
import {
  DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS,
  DEFAULT_CONCISE_ALT_TARGET_CHARS,
  SUPPORTED_ACCESSIBLE_LOCALES,
  type AccessibleDialogueCue,
  type AccessibleEpisodeInput,
  type AccessibleLocale,
  type AccessiblePanelInput,
  type AccessibleSfxCue,
  type AriaReadingNode,
  type CharacterHorizontalPosition,
  type CompileAccessibilityOptions,
  type CompiledAccessibleEpisode,
  type CompiledAccessiblePanel,
  type LocalizedPanelAccessibilityOutput,
  type ScreenReaderTranscriptExportOptions,
} from "./accessible-alt-types";
import { auditEpisodeAccessibilityCompliance } from "./accessible-compliance-auditor";
import {
  SHOT_SCALE_LABELS,
  compactAltToBudget,
  detectRedundantAltPrefix,
  formatCharacterClause,
  formatDialogueLine,
  formatSfxSemanticPhrase,
  hasAnyPanelContent,
  normalizeKey,
  normalizeWhitespace,
  resolveDialogueSpeaker,
  resolveDialogueText,
  resolveLighting,
  resolveManualOverrideForLocale,
  resolveSetting,
  sanitizeBraillePunctuation,
  sortDialoguesDeterministic,
  stripRedundantAltPrefixes,
} from "./accessible-scene-locale-helpers";

export { auditEpisodeAccessibilityCompliance, detectRedundantAltPrefix, stripRedundantAltPrefixes };

interface PreviousPanelContext {
  readonly settingSignature: string;
  readonly lightingSignature: string;
  readonly characterPositions: ReadonlyMap<string, CharacterHorizontalPosition>;
}

function buildSceneIntroSegment(
  locale: AccessibleLocale,
  shotLabel: string,
  setting: string,
  lighting: string,
  reusedSetting: boolean,
  reusedLighting: boolean,
): string {
  if (locale === "ko-KR") {
    if (!reusedSetting && setting.length > 0) {
      return lighting.length > 0 ? `${lighting} 아래 ${setting} ${shotLabel}` : `${setting} ${shotLabel}`;
    }
    return reusedSetting && !reusedLighting && lighting.length > 0
      ? `${lighting}으로 바뀐 ${shotLabel}`
      : shotLabel;
  }
  if (locale === "en-US") {
    if (!reusedSetting && setting.length > 0) {
      return lighting.length > 0 ? `${shotLabel} of ${setting} in ${lighting}` : `${shotLabel} of ${setting}`;
    }
    return reusedSetting && !reusedLighting && lighting.length > 0
      ? `${shotLabel} shifting to ${lighting}`
      : shotLabel;
  }
  if (!reusedSetting && setting.length > 0) {
    return lighting.length > 0 ? `${lighting}の${setting}、${shotLabel}` : `${setting}の${shotLabel}`;
  }
  return reusedSetting && !reusedLighting && lighting.length > 0
    ? `${lighting}に変わった${shotLabel}`
    : shotLabel;
}

function buildExtendedLongdescParts(
  locale: AccessibleLocale,
  shotLabel: string,
  setting: string,
  lighting: string,
  reusedSetting: boolean,
  characterClausesFull: readonly string[],
  formattedSfx: ReadonlyArray<{ readonly formatted: string }>,
  formattedDialogues: ReadonlyArray<{ readonly formatted: string }>,
): readonly string[] {
  const parts: string[] = [];
  if (locale === "ko-KR") {
    const lead = reusedSetting
      ? `이전 컷과 같은 공간(${shotLabel}${lighting.length > 0 ? `, ${lighting}` : ""})`
      : `${shotLabel}${setting.length > 0 ? `, 배경: ${setting}` : ""}${lighting.length > 0 ? `, 조명: ${lighting}` : ""}`;
    parts.push(`[장면] ${lead}.`);
    if (characterClausesFull.length > 0) parts.push(`[인물] ${characterClausesFull.join(" / ")}.`);
    if (formattedSfx.length > 0) {
      parts.push(`[청각 효과] ${formattedSfx.map((item) => item.formatted).join("; ")}.`);
    }
    if (formattedDialogues.length > 0) {
      parts.push(`[대사] ${formattedDialogues.map((item) => item.formatted).join(" ")}`);
    }
    return parts;
  }
  if (locale === "en-US") {
    const lead = reusedSetting
      ? `Continuing in the same setting (${shotLabel}${lighting.length > 0 ? `, ${lighting}` : ""})`
      : `${shotLabel}${setting.length > 0 ? `, setting: ${setting}` : ""}${lighting.length > 0 ? `, lighting: ${lighting}` : ""}`;
    parts.push(`[Scene] ${lead}.`);
    if (characterClausesFull.length > 0) parts.push(`[Characters] ${characterClausesFull.join(" / ")}.`);
    if (formattedSfx.length > 0) {
      parts.push(`[Sound Cues] ${formattedSfx.map((item) => item.formatted).join("; ")}.`);
    }
    if (formattedDialogues.length > 0) {
      parts.push(`[Dialogue] ${formattedDialogues.map((item) => item.formatted).join(" ")}`);
    }
    return parts;
  }
  const lead = reusedSetting
    ? `前のコマと同じ場所（${shotLabel}${lighting.length > 0 ? `、${lighting}` : ""}）`
    : `${shotLabel}${setting.length > 0 ? `、背景: ${setting}` : ""}${lighting.length > 0 ? `、照明: ${lighting}` : ""}`;
  parts.push(`[場面] ${lead}。`);
  if (characterClausesFull.length > 0) parts.push(`[人物] ${characterClausesFull.join("／")}。`);
  if (formattedSfx.length > 0) {
    parts.push(`[効果音] ${formattedSfx.map((item) => item.formatted).join("；")}。`);
  }
  if (formattedDialogues.length > 0) {
    parts.push(`[セリフ] ${formattedDialogues.map((item) => item.formatted).join(" ")}`);
  }
  return parts;
}

function compileLocalizedPanel(
  panel: AccessiblePanelInput,
  locale: AccessibleLocale,
  prevCtx: PreviousPanelContext | null,
  readingOrderCounter: { value: number },
  conciseAltTargetChars: number,
  enableAntiRedundancyDelta: boolean,
  stripRedundantPrefixOption: boolean,
): LocalizedPanelAccessibilityOutput {
  const setting = resolveSetting(panel, locale);
  const lighting = resolveLighting(panel, locale);
  const shotLabel = SHOT_SCALE_LABELS[locale][panel.shotScale];
  const settingSig = `${normalizeKey(panel.settingKo)}|${normalizeKey(panel.settingEn)}|${normalizeKey(panel.settingJa)}`;
  const lightingSig = normalizeKey(panel.lightingMood);

  const reusedPreviousSetting =
    enableAntiRedundancyDelta && prevCtx !== null && settingSig !== "||" && prevCtx.settingSignature === settingSig;
  const reusedLighting = reusedPreviousSetting && prevCtx !== null && prevCtx.lightingSignature === lightingSig;

  const reusedCharacterIds: string[] = [];
  const characterClausesConcise: string[] = [];
  const characterClausesFull: string[] = [];
  for (let i = 0; i < panel.characters.length; i += 1) {
    const ch = panel.characters[i];
    const prevPos = prevCtx ? prevCtx.characterPositions.get(ch.characterId) : undefined;
    const samePos = enableAntiRedundancyDelta && prevPos !== undefined && prevPos === ch.horizontalPosition;
    if (samePos) reusedCharacterIds.push(ch.characterId);
    characterClausesConcise.push(formatCharacterClause(ch, locale, samePos));
    characterClausesFull.push(formatCharacterClause(ch, locale, false));
  }

  const orderedDialogues = sortDialoguesDeterministic(panel.dialogues);
  const transcribedDialogueIds: string[] = [];
  const formattedDialogues: Array<{ readonly cue: AccessibleDialogueCue; readonly formatted: string }> = [];
  for (let i = 0; i < orderedDialogues.length; i += 1) {
    const dlg = orderedDialogues[i];
    if (resolveDialogueText(dlg, locale).length > 0) {
      transcribedDialogueIds.push(dlg.dialogueId);
      formattedDialogues.push({ cue: dlg, formatted: formatDialogueLine(dlg, locale) });
    }
  }

  const explainedSfxIds: string[] = [];
  const formattedSfx: Array<{ readonly cue: AccessibleSfxCue; readonly formatted: string }> = [];
  for (let i = 0; i < panel.sfxItems.length; i += 1) {
    const sfx = panel.sfxItems[i];
    const phrase = formatSfxSemanticPhrase(sfx, locale);
    if (phrase.length > 0) {
      explainedSfxIds.push(sfx.sfxId);
      formattedSfx.push({ cue: sfx, formatted: phrase });
    }
  }

  const manual = resolveManualOverrideForLocale(panel.manualAltOverride, locale);
  let conciseAlt = "";
  let strippedRedundantPrefix = false;
  if (manual.present) {
    if (stripRedundantPrefixOption) {
      const cleaned = stripRedundantAltPrefixes(manual.value);
      conciseAlt = cleaned.cleaned;
      strippedRedundantPrefix = cleaned.strippedPrefix !== null;
    } else {
      conciseAlt = normalizeWhitespace(manual.value);
    }
  } else if (hasAnyPanelContent(panel)) {
    const intro = buildSceneIntroSegment(locale, shotLabel, setting, lighting, reusedPreviousSetting, reusedLighting);
    const segments: string[] = [
      intro,
      ...characterClausesConcise,
      ...formattedSfx.map((item) => item.formatted),
      ...formattedDialogues.map((item) => item.formatted),
    ];
    conciseAlt = compactAltToBudget(segments, conciseAltTargetChars, locale === "ja-JP" ? "。" : ". ");
    if (stripRedundantPrefixOption) {
      const cleaned = stripRedundantAltPrefixes(conciseAlt);
      conciseAlt = cleaned.cleaned;
      strippedRedundantPrefix = cleaned.strippedPrefix !== null;
    }
  }

  const longdescParts = buildExtendedLongdescParts(
    locale,
    shotLabel,
    setting,
    lighting,
    reusedPreviousSetting,
    characterClausesFull,
    formattedSfx,
    formattedDialogues,
  );
  const extendedLongdesc = longdescParts.join(" ");

  const ariaReadingNodes: AriaReadingNode[] = [];
  const nextOrder = (): number => {
    readingOrderCounter.value += 1;
    return readingOrderCounter.value;
  };
  const landmarkLabel =
    locale === "ko-KR"
      ? `컷 ${String(panel.panelIndex)}`
      : locale === "en-US"
        ? `Panel ${String(panel.panelIndex)}`
        : `コマ ${String(panel.panelIndex)}`;

  ariaReadingNodes.push(
    {
      nodeId: `${panel.panelId}:${locale}:landmark`,
      panelId: panel.panelId,
      panelIndex: panel.panelIndex,
      readingOrder: nextOrder(),
      kind: "panel-landmark",
      ariaRole: "region",
      ariaLabel: landmarkLabel,
      textContent: conciseAlt,
      lang: locale,
      sourceRefId: panel.panelId,
    },
    {
      nodeId: `${panel.panelId}:${locale}:scene`,
      panelId: panel.panelId,
      panelIndex: panel.panelIndex,
      readingOrder: nextOrder(),
      kind: "scene-description",
      ariaRole: "img",
      ariaLabel: conciseAlt,
      textContent: longdescParts[0] + (characterClausesFull.length > 0 ? ` ${longdescParts[1]}` : ""),
      lang: locale,
      sourceRefId: panel.panelId,
    },
  );

  for (let i = 0; i < formattedSfx.length; i += 1) {
    const entry = formattedSfx[i];
    ariaReadingNodes.push({
      nodeId: `${panel.panelId}:${locale}:sfx:${entry.cue.sfxId}`,
      panelId: panel.panelId,
      panelIndex: panel.panelIndex,
      readingOrder: nextOrder(),
      kind: "sfx-cue",
      ariaRole: "note",
      ariaLabel: locale === "ko-KR" ? "효과음 해설" : locale === "en-US" ? "Sound effect description" : "効果音解説",
      textContent: entry.formatted,
      lang: locale,
      sourceRefId: entry.cue.sfxId,
    });
  }

  for (let i = 0; i < formattedDialogues.length; i += 1) {
    const entry = formattedDialogues[i];
    ariaReadingNodes.push({
      nodeId: `${panel.panelId}:${locale}:dlg:${entry.cue.dialogueId}`,
      panelId: panel.panelId,
      panelIndex: panel.panelIndex,
      readingOrder: nextOrder(),
      kind: "dialogue-line",
      ariaRole: "paragraph",
      ariaLabel: resolveDialogueSpeaker(entry.cue, locale),
      textContent: entry.formatted,
      lang: locale,
      sourceRefId: entry.cue.dialogueId,
      deliveryStyle: entry.cue.deliveryStyle,
      speakerId: entry.cue.speakerId,
    });
  }

  return {
    locale,
    panelId: panel.panelId,
    panelIndex: panel.panelIndex,
    conciseAlt,
    conciseAltCharCount: conciseAlt.length,
    extendedLongdesc,
    ariaReadingNodes,
    reusedPreviousSetting,
    reusedCharacterIds,
    usedManualAltOverride: manual.present,
    strippedRedundantPrefix,
    transcribedDialogueIds,
    explainedSfxIds,
  };
}

function buildManifestFingerprintInput(
  episodeId: string,
  locales: readonly AccessibleLocale[],
  panels: readonly CompiledAccessiblePanel[],
): string {
  const chunks: string[] = [`wave154|ep:${episodeId}|locales:${locales.join(",")}`];
  for (let i = 0; i < panels.length; i += 1) {
    const panel = panels[i];
    chunks.push(`p:${panel.panelId}#${String(panel.panelIndex)}:${panel.shotScale}`);
    for (let l = 0; l < locales.length; l += 1) {
      const loc = locales[l];
      const item = panel.byLocale[loc];
      const nodesText = item.ariaReadingNodes
        .map((n) => `${String(n.readingOrder)}:${n.kind}:${n.sourceRefId}:${n.textContent}`)
        .join(";");
      chunks.push(`loc:${loc}|alt:${item.conciseAlt}|long:${item.extendedLongdesc}|nodes:${nodesText}`);
    }
  }
  return chunks.join("\n");
}

/** 컷 메타데이터로부터 3개국어 Alt-Text, 상세 장면 해설, ARIA 읽기 그래프를 결정론적으로 컴파일한다. */
export function compileAccessibleEpisodeDescriptions(
  episode: AccessibleEpisodeInput,
  options?: CompileAccessibilityOptions,
): CompiledAccessibleEpisode {
  const targetChars = clampInt(
    options?.conciseAltTargetChars ?? DEFAULT_CONCISE_ALT_TARGET_CHARS,
    40,
    500,
    DEFAULT_CONCISE_ALT_TARGET_CHARS,
  );
  const bloatLimitChars = clampInt(
    options?.conciseAltBloatLimitChars ?? DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS,
    targetChars,
    800,
    DEFAULT_CONCISE_ALT_BLOAT_LIMIT_CHARS,
  );
  const enableDelta = options?.enableAntiRedundancyDelta ?? true;
  const stripPrefix = options?.stripRedundantAltPrefix ?? true;
  const requested = options?.locales && options.locales.length > 0 ? options.locales : SUPPORTED_ACCESSIBLE_LOCALES;
  const locales: AccessibleLocale[] = [];
  for (let i = 0; i < requested.length; i += 1) {
    if (locales.indexOf(requested[i]) === -1) locales.push(requested[i]);
  }

  const orderByLocale: Record<AccessibleLocale, { value: number }> = {
    "ko-KR": { value: 0 },
    "en-US": { value: 0 },
    "ja-JP": { value: 0 },
  };
  const compiledPanels: CompiledAccessiblePanel[] = [];
  let prevCtx: PreviousPanelContext | null = null;
  let totalDialogueCount = 0;
  let totalSfxCount = 0;
  let skippedSettingsCount = 0;

  for (let i = 0; i < episode.panels.length; i += 1) {
    const panel = episode.panels[i];
    totalDialogueCount += panel.dialogues.length;
    totalSfxCount += panel.sfxItems.length;
    const koOut = compileLocalizedPanel(panel, "ko-KR", prevCtx, orderByLocale["ko-KR"], targetChars, enableDelta, stripPrefix);
    const enOut = compileLocalizedPanel(panel, "en-US", prevCtx, orderByLocale["en-US"], targetChars, enableDelta, stripPrefix);
    const jaOut = compileLocalizedPanel(panel, "ja-JP", prevCtx, orderByLocale["ja-JP"], targetChars, enableDelta, stripPrefix);
    if (koOut.reusedPreviousSetting) skippedSettingsCount += 1;

    compiledPanels.push({
      panelId: panel.panelId,
      panelIndex: panel.panelIndex,
      shotScale: panel.shotScale,
      sourceCharacterCount: panel.characters.length,
      sourceDialogueCount: panel.dialogues.length,
      sourceSfxCount: panel.sfxItems.length,
      byLocale: { "ko-KR": koOut, "en-US": enOut, "ja-JP": jaOut },
    });

    const posMap = new Map<string, CharacterHorizontalPosition>();
    for (let c = 0; c < panel.characters.length; c += 1) {
      posMap.set(panel.characters[c].characterId, panel.characters[c].horizontalPosition);
    }
    prevCtx = {
      settingSignature: `${normalizeKey(panel.settingKo)}|${normalizeKey(panel.settingEn)}|${normalizeKey(panel.settingJa)}`,
      lightingSignature: normalizeKey(panel.lightingMood),
      characterPositions: posMap,
    };
  }

  return {
    episodeId: episode.episodeId,
    seriesTitleByLocale: {
      "ko-KR": normalizeWhitespace(episode.seriesTitleKo),
      "en-US": normalizeWhitespace(episode.seriesTitleEn ?? episode.seriesTitleKo),
      "ja-JP": normalizeWhitespace(episode.seriesTitleJa ?? episode.seriesTitleKo),
    },
    episodeTitleByLocale: {
      "ko-KR": normalizeWhitespace(episode.episodeTitleKo),
      "en-US": normalizeWhitespace(episode.episodeTitleEn ?? episode.episodeTitleKo),
      "ja-JP": normalizeWhitespace(episode.episodeTitleJa ?? episode.episodeTitleKo),
    },
    locales,
    panels: compiledPanels,
    totalPanelCount: compiledPanels.length,
    totalDialogueCount,
    totalSfxCount,
    antiRedundancySkippedSettingsCount: skippedSettingsCount,
    conciseAltTargetChars: targetChars,
    conciseAltBloatLimitChars: bloatLimitChars,
    accessibilityManifestSha256Hex: sha256AccessibleAltHex(
      buildManifestFingerprintInput(episode.episodeId, locales, compiledPanels),
    ),
  };
}

/** 점자 단말기 및 TTS 오디오 드라마 재생용 순수 텍스트 대본을 출력한다. */
export function exportScreenReaderTranscriptText(
  compiled: CompiledAccessibleEpisode,
  options?: ScreenReaderTranscriptExportOptions,
): string {
  const locale: AccessibleLocale = options?.locale ?? "ko-KR";
  const includeHeaders = options?.includePanelHeaders ?? true;
  const includeSfx = options?.includeSfxCues ?? true;
  const includeShot = options?.includeShotNotes ?? true;
  const brailleSafe = options?.brailleSafeAsciiPunctuation ?? false;

  const lines: string[] = [
    `[${compiled.seriesTitleByLocale[locale]}] ${compiled.episodeTitleByLocale[locale]}`,
    locale === "ko-KR"
      ? "오디오·점자 접근성 대본 (KWCAG 2.2 / WCAG 2.2 AA / EAA)"
      : locale === "en-US"
        ? "Audio & Braille Accessible Script (KWCAG 2.2 / WCAG 2.2 AA / EAA)"
        : "音声・点字アクセシビリティ台本 (KWCAG 2.2 / WCAG 2.2 AA / EAA)",
  ];

  if (compiled.panels.length === 0) {
    lines.push(
      "",
      locale === "ko-KR"
        ? "등록된 컷이 없습니다."
        : locale === "en-US"
          ? "No panels registered in this episode."
          : "登録されたコマはありません。",
    );
  }

  for (let i = 0; i < compiled.panels.length; i += 1) {
    const panel = compiled.panels[i];
    const locOut = panel.byLocale[locale];
    lines.push("");
    if (includeHeaders) {
      lines.push(
        locale === "ko-KR"
          ? `컷 ${String(panel.panelIndex)}.`
          : locale === "en-US"
            ? `Panel ${String(panel.panelIndex)}.`
            : `コマ ${String(panel.panelIndex)}。`,
      );
    }
    if (includeShot) {
      const sceneNode = locOut.ariaReadingNodes.find((n) => n.kind === "scene-description");
      const sceneText = sceneNode ? sceneNode.textContent : locOut.conciseAlt;
      if (sceneText.length > 0) lines.push(sceneText);
    }
    if (includeSfx) {
      for (let n = 0; n < locOut.ariaReadingNodes.length; n += 1) {
        if (locOut.ariaReadingNodes[n].kind === "sfx-cue") lines.push(locOut.ariaReadingNodes[n].textContent);
      }
    }
    for (let n = 0; n < locOut.ariaReadingNodes.length; n += 1) {
      if (locOut.ariaReadingNodes[n].kind === "dialogue-line") lines.push(locOut.ariaReadingNodes[n].textContent);
    }
  }

  const sha12 = compiled.accessibilityManifestSha256Hex.slice(0, 12);
  lines.push(
    "",
    locale === "ko-KR"
      ? `요약: 총 ${String(compiled.totalPanelCount)}컷, 대사 ${String(compiled.totalDialogueCount)}건, 효과음 ${String(compiled.totalSfxCount)}건, 지문 ${sha12}`
      : locale === "en-US"
        ? `Summary: ${String(compiled.totalPanelCount)} panels, ${String(compiled.totalDialogueCount)} dialogues, ${String(compiled.totalSfxCount)} SFX cues, manifest ${sha12}`
        : `要約: 全${String(compiled.totalPanelCount)}コマ、セリフ${String(compiled.totalDialogueCount)}件、効果音${String(compiled.totalSfxCount)}件、署名 ${sha12}`,
  );
  const text = lines.join("\n");
  return brailleSafe ? sanitizeBraillePunctuation(text) : text;
}
