/**
 * Wave 154 — 3개국어(한/영/일) 장면 문구 사전, 중복 접두사 제거기, 포맷·압축 헬퍼.
 *
 * - 스크린리더 중복 접두사("이미지:", "picture of", "画像:")를 오탐 없이 제거한다.
 * - `compactAltToBudget`은 샷·배경·개별 인물·효과음·대사 순으로 우선순위를 지키며
 *   권장 길이(기본 220자) 안에 핵심 시각 정보를 빠짐없이 채운다.
 */

import type {
  AccessibleCharacterCue,
  AccessibleDialogueCue,
  AccessibleLocale,
  AccessiblePanelInput,
  AccessibleSfxCue,
  CharacterHorizontalPosition,
  DialogueDeliveryStyle,
  ManualAltOverrideInput,
  PanelShotScale,
} from "./accessible-alt-types";

export const SHOT_SCALE_LABELS: Readonly<Record<AccessibleLocale, Readonly<Record<PanelShotScale, string>>>> = {
  "ko-KR": {
    "extreme-closeup": "초근접 클로즈업",
    closeup: "클로즈업",
    "medium-shot": "미디엄 샷",
    "wide-establishing": "전경 샷",
    "insert-detail": "인서트 컷",
  },
  "en-US": {
    "extreme-closeup": "Extreme close-up",
    closeup: "Close-up",
    "medium-shot": "Medium shot",
    "wide-establishing": "Wide establishing shot",
    "insert-detail": "Detail insert",
  },
  "ja-JP": {
    "extreme-closeup": "超クローズアップ",
    closeup: "クローズアップ",
    "medium-shot": "ミディアムショット",
    "wide-establishing": "全景ショット",
    "insert-detail": "インサートカット",
  },
};

const POSITION_LABELS: Readonly<Record<AccessibleLocale, Readonly<Record<CharacterHorizontalPosition, string>>>> = {
  "ko-KR": { left: "왼쪽", center: "중앙", right: "오른쪽" },
  "en-US": { left: "on the left", center: "at center", right: "on the right" },
  "ja-JP": { left: "左側に", center: "中央に", right: "右側に" },
};

const DELIVERY_STYLE_LABELS: Readonly<Record<AccessibleLocale, Readonly<Record<DialogueDeliveryStyle, string>>>> = {
  "ko-KR": {
    normal: "",
    shout: "외침",
    whisper: "속삭임",
    internal: "속마음",
    narration: "내레이션",
    offscreen: "화면 밖 목소리",
  },
  "en-US": {
    normal: "",
    shout: "shouting",
    whisper: "whispering",
    internal: "inner thought",
    narration: "narration",
    offscreen: "offscreen",
  },
  "ja-JP": {
    normal: "",
    shout: "叫び",
    whisper: "ささやき",
    internal: "心の声",
    narration: "ナレーション",
    offscreen: "画面外の声",
  },
};

const LIGHTING_PRESETS: Readonly<Record<string, Readonly<Record<AccessibleLocale, string>>>> = {
  "bright-daylight": { "ko-KR": "밝은 낮빛", "en-US": "bright daylight", "ja-JP": "明るい昼光" },
  "warm-sunset": { "ko-KR": "따뜻한 노을빛", "en-US": "warm sunset light", "ja-JP": "暖かい夕焼け光" },
  "cool-night": { "ko-KR": "차가운 밤빛", "en-US": "cool night light", "ja-JP": "冷たい夜光" },
  "dramatic-backlit": { "ko-KR": "강한 역광", "en-US": "dramatic backlighting", "ja-JP": "強い逆光" },
  "dim-interior": { "ko-KR": "어두운 실내조명", "en-US": "dim interior light", "ja-JP": "薄暗い室内光" },
  "neon-rain": { "ko-KR": "비 내리는 네온 불빛", "en-US": "rainy neon glow", "ja-JP": "雨のネオン光" },
  "overcast-soft": { "ko-KR": "흐린 부드러운 빛", "en-US": "soft overcast light", "ja-JP": "曇天の柔らかな光" },
  "spotlight-stark": { "ko-KR": "강렬한 스포트라이트", "en-US": "stark spotlight", "ja-JP": "鋭いスポットライト" },
};

const REDUNDANT_ALT_PREFIX_PATTERNS: readonly RegExp[] = [
  /^(?:웹툰\s*컷\s*(?:그림|이미지)|웹툰\s*(?:그림|이미지)|컷\s*(?:그림|이미지)|만화\s*(?:컷|그림|이미지))\s*(?:[:：\-—–]\s*|\s+(?:속|안|의)\s*|\s+)/iu,
  /^(?:이미지|사진|그림|삽화|일러스트)(?:\s*[:：\-—–]\s*|\s+(?:속|안|의|에서)\s+|\s+)/iu,
  /^(?:(?:an?|the)\s+)?(?:webtoon\s+panel\s+|comic\s+panel\s+|panel\s+)?(?:image|picture|photo|photograph|graphic|illustration|drawing|artwork)(?:\s+of|\s+showing|\s+depicting|\s*[:\-—–])\s*/iu,
  /^(?:image|picture|photo|graphic|illustration)\s*[:\-—–]?\s+(?=\S)/iu,
  /^(?:ウェブトゥーン(?:の)?コマ(?:画像|イラスト)|コマ(?:画像|イラスト)|画像|写真|イラスト|絵)(?:\s*[:：\-—–]\s*|の説明\s*[:：]?\s*|\s+)/iu,
];

export function normalizeWhitespace(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/[\t\f\v]+/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeKey(raw: string): string {
  return normalizeWhitespace(raw).toLowerCase();
}

/** 스크린리더 중복 접두사("이미지:", "picture of", "画像:" 등) 포함 여부를 탐지한다. */
export function detectRedundantAltPrefix(rawText: string): string | null {
  const trimmed = normalizeWhitespace(rawText);
  if (trimmed.length === 0) return null;
  for (let i = 0; i < REDUNDANT_ALT_PREFIX_PATTERNS.length; i += 1) {
    const match = REDUNDANT_ALT_PREFIX_PATTERNS[i].exec(trimmed);
    if (match && match[0].trim().length > 0) {
      return match[0].trim();
    }
  }
  return null;
}

/** 스크린리더 중복 접두사를 최대 3회 반복 제거하고 결과를 반환한다. */
export function stripRedundantAltPrefixes(rawText: string): {
  readonly cleaned: string;
  readonly strippedPrefix: string | null;
} {
  let current = normalizeWhitespace(rawText);
  let firstRemoved: string | null = null;
  for (let pass = 0; pass < 3; pass += 1) {
    const detected = detectRedundantAltPrefix(current);
    if (!detected) break;
    if (firstRemoved === null) firstRemoved = detected;
    let updated = current;
    for (let i = 0; i < REDUNDANT_ALT_PREFIX_PATTERNS.length; i += 1) {
      const next = updated.replace(REDUNDANT_ALT_PREFIX_PATTERNS[i], "").trim();
      if (next !== updated) {
        updated = next;
        break;
      }
    }
    if (updated === current) break;
    current = updated;
  }
  return { cleaned: normalizeWhitespace(current), strippedPrefix: firstRemoved };
}

export function resolveSetting(panel: AccessiblePanelInput, locale: AccessibleLocale): string {
  const ko = normalizeWhitespace(panel.settingKo);
  const en = normalizeWhitespace(panel.settingEn);
  const ja = normalizeWhitespace(panel.settingJa);
  if (locale === "ko-KR") return ko || en || ja;
  if (locale === "en-US") return en || ko || ja;
  return ja || ko || en;
}

export function resolveLighting(panel: AccessiblePanelInput, locale: AccessibleLocale): string {
  const explicit =
    locale === "en-US" ? panel.lightingMoodEn : locale === "ja-JP" ? panel.lightingMoodJa : undefined;
  if (explicit && normalizeWhitespace(explicit).length > 0) {
    return normalizeWhitespace(explicit);
  }
  const base = normalizeWhitespace(panel.lightingMood);
  if (base.length === 0) return "";
  const preset = LIGHTING_PRESETS[base.toLowerCase()];
  return preset ? preset[locale] : base;
}

export function resolveCharacterName(character: AccessibleCharacterCue, locale: AccessibleLocale): string {
  const ko = normalizeWhitespace(character.nameKo);
  const en = normalizeWhitespace(character.nameEn);
  const ja = normalizeWhitespace(character.nameJa);
  if (locale === "ko-KR") return ko || en || ja || character.characterId;
  if (locale === "en-US") return en || ko || ja || character.characterId;
  return ja || ko || en || character.characterId;
}

export function resolveDialogueSpeaker(dialogue: AccessibleDialogueCue, locale: AccessibleLocale): string {
  if (locale === "en-US" && dialogue.speakerNameEn) return normalizeWhitespace(dialogue.speakerNameEn);
  if (locale === "ja-JP" && dialogue.speakerNameJa) return normalizeWhitespace(dialogue.speakerNameJa);
  const base = normalizeWhitespace(dialogue.speakerName);
  return base.length > 0 ? base : dialogue.speakerId;
}

export function resolveDialogueText(dialogue: AccessibleDialogueCue, locale: AccessibleLocale): string {
  if (locale === "en-US" && dialogue.textEn !== undefined) return normalizeWhitespace(dialogue.textEn);
  if (locale === "ja-JP" && dialogue.textJa !== undefined) return normalizeWhitespace(dialogue.textJa);
  return normalizeWhitespace(dialogue.text);
}

export function resolveSfxMeaning(sfx: AccessibleSfxCue, locale: AccessibleLocale): string {
  if (locale === "en-US" && sfx.semanticMeaningEn !== undefined) {
    return normalizeWhitespace(sfx.semanticMeaningEn);
  }
  if (locale === "ja-JP" && sfx.semanticMeaningJa !== undefined) {
    return normalizeWhitespace(sfx.semanticMeaningJa);
  }
  return normalizeWhitespace(sfx.semanticMeaning);
}

export function resolveManualOverrideForLocale(
  override: ManualAltOverrideInput | undefined,
  locale: AccessibleLocale,
): { readonly present: boolean; readonly value: string } {
  if (override === undefined) return { present: false, value: "" };
  if (typeof override === "string") return { present: true, value: override };
  if (Object.prototype.hasOwnProperty.call(override, locale)) {
    const localized = override[locale];
    if (typeof localized === "string") return { present: true, value: localized };
  }
  return { present: false, value: "" };
}

export function sortDialoguesDeterministic(
  dialogues: readonly AccessibleDialogueCue[],
): readonly AccessibleDialogueCue[] {
  return dialogues
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const orderA = Number.isFinite(a.item.order) ? a.item.order : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(b.item.order) ? b.item.order : Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.idx - b.idx;
    })
    .map((entry) => entry.item);
}

export function formatDialogueLine(dialogue: AccessibleDialogueCue, locale: AccessibleLocale): string {
  const speaker = resolveDialogueSpeaker(dialogue, locale);
  const text = resolveDialogueText(dialogue, locale);
  const styleLabel = DELIVERY_STYLE_LABELS[locale][dialogue.deliveryStyle];
  if (locale === "ko-KR") {
    return `${styleLabel.length > 0 ? `${speaker}(${styleLabel})` : speaker}: "${text}"`;
  }
  if (locale === "en-US") {
    return `${styleLabel.length > 0 ? `${speaker} (${styleLabel})` : speaker}: "${text}"`;
  }
  return `${styleLabel.length > 0 ? `${speaker}（${styleLabel}）` : speaker}「${text}」`;
}

export function formatSfxSemanticPhrase(sfx: AccessibleSfxCue, locale: AccessibleLocale): string {
  const meaning = resolveSfxMeaning(sfx, locale);
  const glyph = normalizeWhitespace(sfx.visualGlyph);
  if (meaning.length === 0) return "";
  if (locale === "ko-KR") return glyph.length > 0 ? `효과음 ${meaning}(${glyph})` : `효과음 ${meaning}`;
  if (locale === "en-US") return glyph.length > 0 ? `SFX: ${meaning} (${glyph})` : `SFX: ${meaning}`;
  return glyph.length > 0 ? `効果音: ${meaning}（${glyph}）` : `効果音: ${meaning}`;
}

export function formatCharacterClause(
  character: AccessibleCharacterCue,
  locale: AccessibleLocale,
  omitPosition: boolean,
): string {
  const name = resolveCharacterName(character, locale);
  const pos = POSITION_LABELS[locale][character.horizontalPosition];
  const expr =
    locale === "en-US" && character.expressionLabelEn
      ? normalizeWhitespace(character.expressionLabelEn)
      : locale === "ja-JP" && character.expressionLabelJa
        ? normalizeWhitespace(character.expressionLabelJa)
        : normalizeWhitespace(character.expressionLabel);
  const action =
    locale === "en-US" && character.actionDescriptionEn
      ? normalizeWhitespace(character.actionDescriptionEn)
      : locale === "ja-JP" && character.actionDescriptionJa
        ? normalizeWhitespace(character.actionDescriptionJa)
        : normalizeWhitespace(character.actionDescription);

  if (locale === "ko-KR") {
    const lead = omitPosition ? name : `${pos} ${name}`;
    const details = [expr.length > 0 ? `${expr} 표정` : "", action].filter((s) => s.length > 0);
    return details.length > 0 ? `${lead}(${details.join(", ")})` : lead;
  }
  if (locale === "en-US") {
    const lead = omitPosition ? name : `${name} ${pos}`;
    const details = [expr.length > 0 ? `${expr} expression` : "", action].filter((s) => s.length > 0);
    return details.length > 0 ? `${lead}, ${details.join(", ")}` : lead;
  }
  const lead = omitPosition ? name : `${pos}${name}`;
  const details = [expr.length > 0 ? `${expr}の表情` : "", action].filter((s) => s.length > 0);
  return details.length > 0 ? `${lead}（${details.join("、")}）` : lead;
}

export function compactAltToBudget(segments: readonly string[], maxChars: number, separator: string): string {
  const cleanSegments = segments.map((s) => normalizeWhitespace(s)).filter((s) => s.length > 0);
  if (cleanSegments.length === 0) return "";
  let combined = cleanSegments[0];
  for (let i = 1; i < cleanSegments.length; i += 1) {
    const candidate = `${combined}${separator}${cleanSegments[i]}`;
    if (candidate.length <= maxChars) {
      combined = candidate;
      continue;
    }
    const remaining = maxChars - combined.length - separator.length;
    if (remaining >= 24) {
      combined = `${combined}${separator}${cleanSegments[i].slice(0, remaining - 1).trim()}…`;
    }
    break;
  }
  if (combined.length <= maxChars) return combined;
  if (maxChars <= 3) return combined.slice(0, maxChars);
  return `${combined.slice(0, maxChars - 1).trim()}…`;
}

export function hasAnyPanelContent(panel: AccessiblePanelInput): boolean {
  const hasSetting =
    normalizeWhitespace(panel.settingKo).length > 0 ||
    normalizeWhitespace(panel.settingEn).length > 0 ||
    normalizeWhitespace(panel.settingJa).length > 0;
  const hasMood = normalizeWhitespace(panel.lightingMood).length > 0;
  const hasDialogue = panel.dialogues.some((d) => normalizeWhitespace(d.text).length > 0);
  const hasSfx = panel.sfxItems.some(
    (s) => normalizeWhitespace(s.semanticMeaning).length > 0 || normalizeWhitespace(s.visualGlyph).length > 0,
  );
  return hasSetting || hasMood || panel.characters.length > 0 || hasDialogue || hasSfx;
}

export function sanitizeBraillePunctuation(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[「」『』]/g, '"')
    .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
    .replace(/…/g, "...")
    .replace(/[—–]/g, "-");
}
