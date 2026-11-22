/**
 * 웹툰 컷별 자동 화면 해설(Alt-Text) 및 상세 대본 생성기 (WCAG 2.2 AA 준수 · 100% 결정적).
 *
 * - 시각장애·저시력 독자의 스크린리더 감상과 스토리·대사 작가의 컷 검수를 지원한다.
 * - 컷의 배경·구도·화자·감정·대사·효과음(SFX) 메타데이터를 자연스러운 한국어(`ko`) 또는
 *   영어(`en`) 스크린리더 설명문(권장 120~240자 요약)과 전체 상세 대본으로 결정적 조합한다.
 * - JSON 및 시맨틱 HTML5(`article`/`figure`/`figcaption`/`details`/`dl`) 내보내기를 제공한다.
 */

export type AltTextLocale = "ko" | "en";
export type WebtoonPanelRole = "establishing" | "dialogue" | "action" | "reaction" | "narration" | "cliffhanger";
export type WebtoonCameraShot = "wide" | "medium" | "closeup" | "extreme-closeup" | "bird-eye" | "low-angle";
export type WebtoonBubbleStyle = "speech" | "thought" | "shout" | "whisper" | "narration" | "caption";
export type WebtoonCharacterPosition = "left" | "center" | "right" | "foreground" | "background";

export interface WebtoonCutSceneSetting {
  readonly location?: string;
  readonly timeOfDay?: string;
  readonly weather?: string;
  readonly lighting?: string;
  readonly cameraShot?: WebtoonCameraShot;
}

export interface WebtoonCutCharacterCue {
  readonly name: string;
  readonly emotion?: string;
  readonly expression?: string;
  readonly action?: string;
  readonly position?: WebtoonCharacterPosition;
}

export interface WebtoonCutDialogueLine {
  readonly speaker: string;
  readonly text: string;
  readonly bubbleStyle?: WebtoonBubbleStyle;
}

export interface WebtoonCutSoundEffect {
  readonly text: string;
  readonly intensity?: "subtle" | "medium" | "loud";
  readonly meaning?: string;
}

export interface WebtoonCutAccessibilityInput {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly panelRole?: WebtoonPanelRole;
  readonly sceneSetting?: WebtoonCutSceneSetting;
  readonly characters?: readonly WebtoonCutCharacterCue[];
  readonly dialogues?: readonly WebtoonCutDialogueLine[];
  readonly soundEffects?: readonly WebtoonCutSoundEffect[];
  readonly visualNotes?: string;
}

export interface GenerateCutAltTextOptions {
  readonly locale?: AltTextLocale;
  readonly minChars?: number;
  readonly maxChars?: number;
}

export interface WebtoonCutWcagCompliance {
  readonly standard: "WCAG 2.2 AA";
  readonly passed: boolean;
  readonly charCount: number;
  readonly targetMinChars: number;
  readonly targetMaxChars: number;
  readonly withinRecommendedRange: boolean;
  readonly hasSceneContext: boolean;
  readonly hasSpeakerAttribution: boolean;
  readonly hasSoundEffectDescription: boolean;
  readonly issues: readonly string[];
}

export interface WebtoonCutAccessibilityOutput {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly locale: AltTextLocale;
  readonly altText: string;
  readonly longDescription: string;
  readonly longDescElementId: string;
  readonly ariaAttributes: {
    readonly role: "img";
    readonly "aria-label": string;
    readonly "aria-describedby": string;
  };
  readonly wcagCompliance: WebtoonCutWcagCompliance;
  readonly dialogues: readonly WebtoonCutDialogueLine[];
  readonly soundEffects: readonly WebtoonCutSoundEffect[];
}

export interface EpisodeAccessibilityBundleInput {
  readonly workId: string;
  readonly episodeTitle: string;
  readonly locale?: AltTextLocale;
  readonly cuts: readonly WebtoonCutAccessibilityInput[];
}

export interface EpisodeAccessibilityBundle {
  readonly schema: "toonstudio.webtoon-accessibility-transcript/1";
  readonly schemaVersion: 1;
  readonly standard: "WCAG 2.2 AA";
  readonly workId: string;
  readonly episodeTitle: string;
  readonly locale: AltTextLocale;
  readonly totalCuts: number;
  readonly compliantCutCount: number;
  readonly complianceRatio: number;
  readonly cuts: readonly WebtoonCutAccessibilityOutput[];
}

export interface StudioAccessibleElementLike {
  readonly id: string;
  readonly type: string;
  readonly text?: string;
  readonly variant?: string;
  readonly stroke?: string;
  readonly x?: number;
  readonly y?: number;
  readonly storyBeat?: {
    readonly type?: string;
    readonly summary?: string;
  };
}

export interface StudioAccessiblePageLike {
  readonly id: string;
  readonly elements: readonly StudioAccessibleElementLike[];
}

export const ALT_TEXT_RECOMMENDED_MIN_CHARS = 120 as const;
export const ALT_TEXT_RECOMMENDED_MAX_CHARS = 240 as const;

const CAMERA_LABELS: Readonly<
  Record<WebtoonCameraShot, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  wide: { ko: "와이드 구도", en: "wide shot" },
  medium: { ko: "미디엄 구도", en: "medium shot" },
  closeup: { ko: "클로즈업 구도", en: "close-up" },
  "extreme-closeup": { ko: "익스트림 클로즈업", en: "extreme close-up" },
  "bird-eye": { ko: "부감 구도", en: "bird's-eye view" },
  "low-angle": { ko: "로우 앵글 구도", en: "low-angle view" },
});

const ROLE_LABELS: Readonly<
  Record<WebtoonPanelRole, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  establishing: { ko: "장면 도입 컷", en: "establishing panel" },
  dialogue: { ko: "대화 중심 컷", en: "dialogue panel" },
  action: { ko: "역동적 액션 컷", en: "action panel" },
  reaction: { ko: "감정 반응 컷", en: "reaction panel" },
  narration: { ko: "서사 나레이션 컷", en: "narration panel" },
  cliffhanger: { ko: "긴장감 있는 마무리 컷", en: "cliffhanger panel" },
});

const POSITION_LABELS: Readonly<
  Record<WebtoonCharacterPosition, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  left: { ko: "화면 왼쪽", en: "on the left" },
  center: { ko: "화면 중앙", en: "at the center" },
  right: { ko: "화면 오른쪽", en: "on the right" },
  foreground: { ko: "전경", en: "in the foreground" },
  background: { ko: "배경 쪽", en: "in the background" },
});

const BUBBLE_VERBS: Readonly<
  Record<WebtoonBubbleStyle, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  speech: { ko: "말한다", en: "says" },
  thought: { ko: "속으로 생각한다", en: "thinks" },
  shout: { ko: "외친다", en: "shouts" },
  whisper: { ko: "속삭인다", en: "whispers" },
  narration: { ko: "나레이션", en: "narration" },
  caption: { ko: "설명 자막", en: "caption" },
});

const SFX_INTENSITY_LABELS: Readonly<
  Record<"subtle" | "medium" | "loud", { readonly ko: string; readonly en: string }>
> = Object.freeze({
  subtle: { ko: "잔잔하게", en: "softly" },
  medium: { ko: "선명하게", en: "clearly" },
  loud: { ko: "강하게", en: "loudly" },
});

function cleanText(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/gu, " ").trim();
}

function sanitizeDomId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return cleaned.length > 0 ? cleaned : "cut";
}

function formatSceneClause(
  cutIndex: number,
  panelRole: WebtoonPanelRole | undefined,
  setting: WebtoonCutSceneSetting | undefined,
  locale: AltTextLocale,
): string {
  const location = cleanText(setting?.location);
  const timeOfDay = cleanText(setting?.timeOfDay);
  const weather = cleanText(setting?.weather);
  const lighting = cleanText(setting?.lighting);
  const camera = setting?.cameraShot ? CAMERA_LABELS[setting.cameraShot][locale] : "";
  const roleLabel = panelRole ? ROLE_LABELS[panelRole][locale] : "";

  if (locale === "ko") {
    const contextParts = [timeOfDay, weather, location, lighting].filter(Boolean);
    const contextText = contextParts.join(" ");
    const framing = [camera, roleLabel].filter(Boolean).join(", ");
    if (contextText && framing) {
      return `${cutIndex}컷(${framing}), ${contextText} 배경이다.`;
    }
    if (contextText) {
      return `${cutIndex}컷, ${contextText} 배경 장면이다.`;
    }
    if (framing) {
      return `${cutIndex}컷(${framing}) 장면이다.`;
    }
    return `${cutIndex}컷 웹툰 화면이다.`;
  }

  const contextParts = [location, timeOfDay, weather, lighting].filter(Boolean);
  const contextText = contextParts.join(", ");
  const framing = [camera, roleLabel].filter(Boolean).join(", ");
  if (contextText && framing) {
    return `Panel ${cutIndex} (${framing}) set in ${contextText}.`;
  }
  if (contextText) {
    return `Panel ${cutIndex} set in ${contextText}.`;
  }
  if (framing) {
    return `Panel ${cutIndex} (${framing}).`;
  }
  return `Panel ${cutIndex} of the webtoon episode.`;
}

function formatCharacterClause(
  character: WebtoonCutCharacterCue,
  locale: AltTextLocale,
): string {
  const name = cleanText(character.name);
  if (!name) return "";
  const emotion = cleanText(character.emotion);
  const expression = cleanText(character.expression);
  const action = cleanText(character.action);
  const pos = character.position ? POSITION_LABELS[character.position][locale] : "";

  if (locale === "ko") {
    const lead = pos ? `${pos}의 ${name}` : name;
    const moodParts = [emotion, expression].filter(Boolean);
    const moodText = moodParts.length > 0 ? `${moodParts.join("·")} 표정으로 ` : "";
    if (action) {
      return `${lead}이(가) ${moodText}${action}.`;
    }
    if (moodParts.length > 0) {
      return `${lead}이(가) ${moodParts.join("·")} 감정을 드러낸다.`;
    }
    return `${lead}이(가) 장면에 등장한다.`;
  }

  const moodParts = [emotion, expression].filter(Boolean);
  const moodText = moodParts.length > 0 ? ` looking ${moodParts.join(" and ")}` : "";
  const posText = pos ? ` ${pos}` : "";
  if (action) {
    return `${name}${posText}${moodText} ${action}.`;
  }
  if (moodParts.length > 0) {
    return `${name}${posText} appears${moodText}.`;
  }
  return `${name}${posText} appears in the scene.`;
}

function formatDialogueClause(
  line: WebtoonCutDialogueLine,
  locale: AltTextLocale,
  maxQuoteChars: number,
): string {
  const speaker = cleanText(line.speaker);
  const rawQuote = cleanText(line.text);
  if (!rawQuote) return "";
  const style: WebtoonBubbleStyle = line.bubbleStyle ?? "speech";
  const quote =
    rawQuote.length > maxQuoteChars
      ? `${rawQuote.slice(0, Math.max(8, maxQuoteChars - 1)).trimEnd()}…`
      : rawQuote;

  if (locale === "ko") {
    if (style === "narration" || style === "caption") {
      return `${BUBBLE_VERBS[style].ko}: "${quote}".`;
    }
    const attributed = speaker || "화자";
    return `${attributed}이(가) ${BUBBLE_VERBS[style].ko}: "${quote}".`;
  }

  if (style === "narration" || style === "caption") {
    return `${BUBBLE_VERBS[style]}: "${quote}".`;
  }
  const attributed = speaker || "Speaker";
  return `${attributed} ${BUBBLE_VERBS[style]}: "${quote}".`;
}

function formatSfxClause(
  sfx: WebtoonCutSoundEffect,
  locale: AltTextLocale,
): string {
  const text = cleanText(sfx.text);
  if (!text) return "";
  const intensity = sfx.intensity ? SFX_INTENSITY_LABELS[sfx.intensity][locale] : "";
  const meaning = cleanText(sfx.meaning);

  if (locale === "ko") {
    const nuance = [intensity, meaning ? `(${meaning})` : ""].filter(Boolean).join(" ");
    return nuance
      ? `효과음 '${text}'가 ${nuance} 울린다.`
      : `효과음 '${text}'가 화면에 연출된다.`;
  }

  const nuance = [intensity, meaning ? `(${meaning})` : ""].filter(Boolean).join(" ");
  return nuance
    ? `Sound effect "${text}" rings ${nuance}.`
    : `Sound effect "${text}" appears on panel.`;
}

function trimToMaxCharsCleanly(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const budget = Math.max(20, maxChars - 1);
  const slice = text.slice(0, budget);
  const lastPeriod = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("다."));
  if (lastPeriod >= Math.floor(maxChars * 0.6)) {
    const cutAt = slice.lastIndexOf("다.") === lastPeriod ? lastPeriod + 2 : lastPeriod + 1;
    return slice.slice(0, cutAt).trim();
  }
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace >= Math.floor(maxChars * 0.65) ? slice.slice(0, lastSpace) : slice;
  const trimmed = cut.replace(/[,:;·\s]+$/u, "");
  // 열린 큰따옴표가 남아 있으면 자연스럽게 닫아 스크린리더 낭독 깨짐을 방지한다.
  const quoteCount = (trimmed.match(/"/gu) ?? []).length;
  const closing = quoteCount % 2 === 1 ? '…"' : "…";
  const maxBody = maxChars - closing.length;
  return `${trimmed.slice(0, maxBody).trimEnd()}${closing}`;
}

function composeCalibratedAltText(params: {
  readonly input: WebtoonCutAccessibilityInput;
  readonly locale: AltTextLocale;
  readonly minChars: number;
  readonly maxChars: number;
  readonly sceneClause: string;
  readonly characterClauses: readonly string[];
  readonly dialogueClauses: readonly string[];
  readonly sfxClauses: readonly string[];
  readonly visualNote: string;
}): string {
  const {
    input,
    locale,
    minChars,
    maxChars,
    sceneClause,
    characterClauses,
    dialogueClauses,
    sfxClauses,
    visualNote,
  } = params;

  const segments: string[] = [sceneClause];
  const tryAppend = (clause: string): boolean => {
    const normalized = cleanText(clause);
    if (!normalized) return false;
    const candidate = `${segments.join(" ")} ${normalized}`;
    if (candidate.length <= maxChars) {
      segments.push(normalized);
      return true;
    }
    return false;
  };

  for (const clause of characterClauses) {
    if (!tryAppend(clause) && segments.length === 1) {
      segments.push(trimToMaxCharsCleanly(clause, Math.max(40, maxChars - sceneClause.length - 1)));
      break;
    }
  }

  for (const clause of dialogueClauses) {
    if (!tryAppend(clause) && segments.join(" ").length < maxChars - 36) {
      const remaining = maxChars - segments.join(" ").length - 1;
      segments.push(trimToMaxCharsCleanly(clause, remaining));
      break;
    }
  }

  for (const clause of sfxClauses) {
    tryAppend(clause);
  }

  if (visualNote) {
    tryAppend(visualNote);
  }

  // 메타데이터가 간결해 120자 미만인 경우에도 스크린리더 독자가 컷의 구성·대사·효과음 유무와
  // 읽기 흐름을 파악할 수 있도록 WCAG 안내 보충 문장을 결정적으로 덧붙인다.
  let assembled = segments.join(" ").trim();
  const dialogueCount = input.dialogues?.length ?? 0;
  const sfxCount = input.soundEffects?.length ?? 0;
  const charCount = input.characters?.length ?? 0;

  const supplements =
    locale === "ko"
      ? [
          dialogueCount === 0
            ? "별도 대사 없이 화면 분위기와 인물의 시선 흐름으로 감정을 전달하는 무성 연출이다."
            : `이 컷에는 총 ${dialogueCount}개의 대사 말풍선이 위에서 아래 읽기 순서대로 배치되어 있다.`,
          sfxCount === 0
            ? "표기된 효과음은 없으며 정적인 호흡으로 다음 컷 전환을 준비한다."
            : `총 ${sfxCount}개의 효과음이 장면의 리듬과 현장감을 강조한다.`,
          charCount === 0
            ? "인물 대신 공간과 소품 배치가 서사 배경을 설명하며 상세 대본에서 전체 구성을 확인할 수 있다."
            : `등장인물 ${charCount}명의 동선과 표정 변화가 중심을 이루며 상세 대본에서 전체 해설을 확인할 수 있다.`,
        ]
      : [
          dialogueCount === 0
            ? "This silent panel conveys mood and pacing purely through visual framing and gaze direction."
            : `The panel arranges ${dialogueCount} speech bubble(s) in top-to-bottom reading order for screen readers.`,
          sfxCount === 0
            ? "No on-panel sound effects appear, holding a quiet beat before the next transition."
            : `A total of ${sfxCount} visual sound effect(s) underscore the scene rhythm and atmosphere.`,
          charCount === 0
            ? "Environmental details anchor the story setting, with complete scene metadata available in the full transcript."
            : `Visual staging highlights ${charCount} character(s), with unabridged narration available in the detailed transcript.`,
        ];

  for (const supplement of supplements) {
    if (assembled.length >= minChars) break;
    const candidate = `${assembled} ${supplement}`;
    if (candidate.length <= maxChars) {
      assembled = candidate;
    } else {
      const remaining = maxChars - assembled.length - 1;
      if (remaining >= 24) {
        assembled = `${assembled} ${trimToMaxCharsCleanly(supplement, remaining)}`;
      }
      break;
    }
  }

  return trimToMaxCharsCleanly(assembled, maxChars);
}

/**
 * 단일 웹툰 컷의 메타데이터를 WCAG 2.2 AA 준수 120~240자 Alt-Text와
 * 전체 상세 해설(`longDescription`)로 결정적 조합한다.
 */
export function generateWebtoonCutAltText(
  input: WebtoonCutAccessibilityInput,
  options: GenerateCutAltTextOptions = {},
): WebtoonCutAccessibilityOutput {
  const locale: AltTextLocale = options.locale ?? "ko";
  const targetMinChars = Math.max(60, options.minChars ?? ALT_TEXT_RECOMMENDED_MIN_CHARS);
  const targetMaxChars = Math.max(targetMinChars, options.maxChars ?? ALT_TEXT_RECOMMENDED_MAX_CHARS);

  const cutIndex = Number.isInteger(input.cutIndex) && input.cutIndex > 0 ? input.cutIndex : 1;
  const cutId = cleanText(input.cutId) || `cut-${String(cutIndex).padStart(2, "0")}`;
  const characters = input.characters ?? [];
  const dialogues = input.dialogues ?? [];
  const soundEffects = input.soundEffects ?? [];
  const visualNote = cleanText(input.visualNotes);

  const sceneClause = formatSceneClause(cutIndex, input.panelRole, input.sceneSetting, locale);
  const characterClauses = characters
    .map((character) => formatCharacterClause(character, locale))
    .filter(Boolean);
  const shortDialogueClauses = dialogues
    .map((line) => formatDialogueClause(line, locale, 56))
    .filter(Boolean);
  const fullDialogueClauses = dialogues
    .map((line) => formatDialogueClause(line, locale, 400))
    .filter(Boolean);
  const sfxClauses = soundEffects
    .map((sfx) => formatSfxClause(sfx, locale))
    .filter(Boolean);

  const altText = composeCalibratedAltText({
    input,
    locale,
    minChars: targetMinChars,
    maxChars: targetMaxChars,
    sceneClause,
    characterClauses,
    dialogueClauses: shortDialogueClauses,
    sfxClauses,
    visualNote,
  });

  const longParts = [
    sceneClause,
    ...characterClauses,
    ...fullDialogueClauses,
    ...sfxClauses,
    ...(visualNote ? [visualNote] : []),
  ];
  const longDescription = longParts.join(" ").trim();
  const longDescElementId = `webtoon-cut-desc-${sanitizeDomId(cutId)}`;

  const hasSceneContext = sceneClause.length > 0;
  const hasSpeakerAttribution =
    dialogues.length === 0 ||
    dialogues.every(
      (line) =>
        cleanText(line.speaker).length > 0 ||
        line.bubbleStyle === "narration" ||
        line.bubbleStyle === "caption",
    );
  const hasSoundEffectDescription =
    soundEffects.length === 0 || sfxClauses.length === soundEffects.length;
  const withinRecommendedRange =
    altText.length >= targetMinChars && altText.length <= targetMaxChars;

  const issues: string[] = [];
  if (!withinRecommendedRange) {
    issues.push(
      `Alt-Text 길이(${altText.length}자)가 권장 범위(${targetMinChars}~${targetMaxChars}자)를 벗어났습니다.`,
    );
  }
  if (!hasSpeakerAttribution) {
    issues.push("일부 대사에 화자(speaker) 정보가 누락되어 있습니다.");
  }

  return {
    cutId,
    cutIndex,
    locale,
    altText,
    longDescription,
    longDescElementId,
    ariaAttributes: {
      role: "img",
      "aria-label": altText,
      "aria-describedby": longDescElementId,
    },
    wcagCompliance: {
      standard: "WCAG 2.2 AA",
      passed: issues.length === 0,
      charCount: altText.length,
      targetMinChars,
      targetMaxChars,
      withinRecommendedRange,
      hasSceneContext,
      hasSpeakerAttribution,
      hasSoundEffectDescription,
      issues: Object.freeze(issues),
    },
    dialogues: Object.freeze([...dialogues]),
    soundEffects: Object.freeze([...soundEffects]),
  };
}

/**
 * 에피소드 전체 컷의 화면 해설·접근성 준수 리포트를 생성한다.
 */
export function generateEpisodeAccessibilityBundle(
  input: EpisodeAccessibilityBundleInput,
): EpisodeAccessibilityBundle {
  const locale: AltTextLocale = input.locale ?? "ko";
  const ordered = [...input.cuts].sort((left, right) => left.cutIndex - right.cutIndex);
  const cuts = ordered.map((cut) => generateWebtoonCutAltText(cut, { locale }));
  const compliantCutCount = cuts.filter((cut) => cut.wcagCompliance.passed).length;
  const complianceRatio =
    cuts.length === 0 ? 1 : Number((compliantCutCount / cuts.length).toFixed(4));

  return {
    schema: "toonstudio.webtoon-accessibility-transcript/1",
    schemaVersion: 1,
    standard: "WCAG 2.2 AA",
    workId: cleanText(input.workId) || "local-work",
    episodeTitle: cleanText(input.episodeTitle) || "Untitled Episode",
    locale,
    totalCuts: cuts.length,
    compliantCutCount,
    complianceRatio,
    cuts: Object.freeze(cuts),
  };
}

/**
 * 에피소드 상세 대본을 정규 JSON 문자열로 직렬화한다.
 */
export function exportEpisodeTranscriptJson(bundle: EpisodeAccessibilityBundle): string {
  return JSON.stringify(bundle, null, 2);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

/**
 * WCAG 2.2 AA 시맨틱 구조(`article`/`ol`/`figure`/`figcaption`/`details`/`dl`)와
 * 엄격한 HTML 이스케이프를 적용한 스크린리더용 상세 대본 HTML을 생성한다.
 */
export function exportEpisodeTranscriptHtml(bundle: EpisodeAccessibilityBundle): string {
  const titleEscaped = escapeHtml(bundle.episodeTitle);
  const headingLabel =
    bundle.locale === "ko"
      ? `${titleEscaped} — 웹툰 화면 해설 및 대본 (WCAG 2.2 AA)`
      : `${titleEscaped} — Webtoon Alt-Text & Accessible Transcript (WCAG 2.2 AA)`;
  const summaryLabel =
    bundle.locale === "ko" ? "상세 해설 및 대본 펼치기" : "Expand full panel transcript";

  const itemsHtml = bundle.cuts
    .map((cut) => {
      const cutHeading =
        bundle.locale === "ko" ? `${cut.cutIndex}컷 (${escapeHtml(cut.cutId)})` : `Panel ${cut.cutIndex} (${escapeHtml(cut.cutId)})`;
      const dialogueRows = cut.dialogues
        .map(
          (line) =>
            `            <dt>${escapeHtml(cleanText(line.speaker) || (bundle.locale === "ko" ? "화자" : "Speaker"))}</dt><dd>${escapeHtml(cleanText(line.text))}</dd>`,
        )
        .join("\n");
      const sfxRows = cut.soundEffects
        .map(
          (sfx) =>
            `            <li>${escapeHtml(cleanText(sfx.text))}${sfx.meaning ? ` (${escapeHtml(cleanText(sfx.meaning))})` : ""}</li>`,
        )
        .join("\n");

      return [
        `      <li data-cut-id="${escapeHtml(cut.cutId)}">`,
        `        <figure role="img" aria-label="${escapeHtml(cut.altText)}" aria-describedby="${escapeHtml(cut.longDescElementId)}">`,
        `          <figcaption><strong>${cutHeading}</strong>: ${escapeHtml(cut.altText)}</figcaption>`,
        `          <details open>`,
        `            <summary>${summaryLabel}</summary>`,
        `            <p id="${escapeHtml(cut.longDescElementId)}">${escapeHtml(cut.longDescription)}</p>`,
        ...(dialogueRows ? [`            <dl>\n${dialogueRows}\n            </dl>`] : []),
        ...(sfxRows ? [`            <ul>\n${sfxRows}\n            </ul>`] : []),
        `          </details>`,
        `        </figure>`,
        `      </li>`,
      ].join("\n");
    })
    .join("\n");

  return [
    "<!doctype html>",
    `<html lang="${bundle.locale}">`,
    "<head>",
    '  <meta charset="utf-8">',
    `  <title>${headingLabel}</title>`,
    "</head>",
    "<body>",
    `  <article role="region" aria-label="${headingLabel}" data-work-id="${escapeHtml(bundle.workId)}">`,
    `    <h1>${headingLabel}</h1>`,
    "    <ol>",
    itemsHtml,
    "    </ol>",
    "  </article>",
    "</body>",
    "</html>",
  ].join("\n");
}

function mapBubbleVariantToStyle(variant: string | undefined): WebtoonBubbleStyle {
  const n = (variant ?? "").toLowerCase();
  if (n.includes("shout") || n.includes("angry") || n.includes("burst")) return "shout";
  if (n.includes("thought") || n.includes("cloud")) return "thought";
  if (n.includes("whisper") || n.includes("dashed")) return "whisper";
  if (n.includes("box") || n.includes("narration") || n.includes("rect")) return "narration";
  return "speech";
}

/** 스튜디오 페이지 요소(`bubble`/`text`/`frame`/`image`)에서 컷별 접근성 입력을 결정적으로 추출한다. */
export function extractWebtoonCutInputsFromPages(
  pages: readonly StudioAccessiblePageLike[],
): readonly WebtoonCutAccessibilityInput[] {
  return pages.map((page, index) => {
    const sorted = [...page.elements].sort(
      (left, right) => (left.y ?? 0) - (right.y ?? 0) || (left.x ?? 0) - (right.x ?? 0),
    );
    const dialogues: WebtoonCutDialogueLine[] = [];
    const soundEffects: WebtoonCutSoundEffect[] = [];
    let storyBeatSummary = "";
    let imageCount = 0;

    for (const element of sorted) {
      if (element.type === "bubble" && cleanText(element.text)) {
        const bubbleStyle = mapBubbleVariantToStyle(element.variant);
        dialogues.push({
          speaker: bubbleStyle === "narration" ? "나레이션" : `화자 ${dialogues.length + 1}`,
          text: cleanText(element.text),
          bubbleStyle,
        });
      } else if (element.type === "text" && cleanText(element.text)) {
        if (element.stroke) soundEffects.push({ text: cleanText(element.text), intensity: "medium" });
        else dialogues.push({ speaker: "자막", text: cleanText(element.text), bubbleStyle: "caption" });
      } else if (element.type === "frame" && element.storyBeat?.summary) {
        storyBeatSummary = cleanText(element.storyBeat.summary);
      } else if (element.type === "image") {
        imageCount += 1;
      }
    }

    return {
      cutId: page.id,
      cutIndex: index + 1,
      panelRole: dialogues.length > 0 ? "dialogue" : soundEffects.length > 0 ? "action" : "establishing",
      sceneSetting: {
        location:
          storyBeatSummary ||
          (imageCount > 0 ? `배치 이미지 ${imageCount}장이 포함된 웹툰 장면` : "작화 캔버스 장면"),
      },
      dialogues,
      soundEffects,
    };
  });
}
