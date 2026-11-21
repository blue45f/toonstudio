/**
 * 캐릭터 토크 연출 설정(스포일러 안전선·말투 온도)과 1탭 장면 스타터 순수 모델.
 *
 * - `SpoilerFenceId`·`PersonaToneId`를 실제 LLM 시스템 프롬프트 지시문으로 변환한다.
 * - 작가가 승인한 프로필(성격·말투·세계관·금지 주제)만을 근거로 3종의 원클릭 대화 시작
 *   장면(첫 만남 인사 · 세계관 비밀 질문 · 위기 상황 대처)과 무키 게스트용 정사 미리보기
 *   응답을 결정론적으로 생성한다.
 * - 생성되는 모든 프롬프트와 미리보기 응답은 금지 주제 필터를 통과시켜 누출을 원천 차단한다.
 */

import { findForbiddenTopicHits, sanitizeCharacterReply } from "./character-chat-filter";
import type { CharacterChatProfile } from "./character-chat-types";

export type SpoilerFenceId = "ep10-canon-lock" | "season1-finale-sync" | "au-whatif-sandbox";
export type PersonaToneId = "canon-dialogue-strict" | "affection-stage-reactive" | "voice-tts-prosody";
export type SceneStarterKind = "first-meeting" | "world-secret" | "crisis-response";
export type SceneStarterTone = "accent" | "cool" | "good";

export interface CharacterChatDirectorOptions {
  readonly spoilerFence: SpoilerFenceId;
  readonly personaTone: PersonaToneId;
}

export interface SpoilerFenceOption {
  readonly id: SpoilerFenceId;
  readonly ko: string;
  readonly en: string;
  readonly shortKo: string;
  readonly shortEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly promptRuleKo: string;
  readonly tone: SceneStarterTone;
}

export interface PersonaToneOption {
  readonly id: PersonaToneId;
  readonly ko: string;
  readonly en: string;
  readonly shortKo: string;
  readonly shortEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly promptRuleKo: string;
  readonly tone: SceneStarterTone;
}

export interface CharacterChatSceneStarter {
  readonly kind: SceneStarterKind;
  readonly tone: SceneStarterTone;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly promptKo: string;
  readonly promptEn: string;
  readonly previewReplyKo: string;
  readonly previewReplyEn: string;
  readonly canonBasisKo: string;
  readonly canonBasisEn: string;
}

export const DEFAULT_SPOILER_FENCE: SpoilerFenceId = "ep10-canon-lock";
export const DEFAULT_PERSONA_TONE: PersonaToneId = "canon-dialogue-strict";

export const SPOILER_FENCE_OPTIONS: readonly SpoilerFenceOption[] = [
  {
    id: "ep10-canon-lock",
    ko: "10화 정사 스포일러 잠금",
    en: "Ep.10 Canon Spoiler Lock",
    shortKo: "10화 잠금",
    shortEn: "Ep.10 Lock",
    detailKo: "10화 이전 공개 설정만 대화에 반영하고 이후 핵심 복선은 미리 밝히지 않습니다.",
    detailEn: "Uses only approved canon details up to Episode 10 and holds back later plot twists.",
    promptRuleKo:
      "10화 이전까지 공개된 정사 설정만 알고 있는 것처럼 답한다. 그 이후 전개나 핵심 반전은 절대 스포일러하지 말고 캐릭터답게 말을 아낀다.",
    tone: "accent",
  },
  {
    id: "season1-finale-sync",
    ko: "시즌1 완결 기억 동기화",
    en: "Season 1 Finale Memory Sync",
    shortKo: "시즌1 동기화",
    shortEn: "Season 1 Sync",
    detailKo: "시즌1 완결 시점의 관계 변화와 주요 사건 기억을 모두 반영해 깊이 대화합니다.",
    detailEn: "Reflects full Season 1 finale relationship shifts and key story memories.",
    promptRuleKo:
      "시즌1 완결 시점까지 겪은 사건과 관계 변화를 기억한 상태로 깊이 있게 답한다. 단, 작가가 금지한 주제는 여전히 언급하지 않는다.",
    tone: "cool",
  },
  {
    id: "au-whatif-sandbox",
    ko: "IF 외전 멀티버스 샌드박스",
    en: "AU What-If Sandbox",
    shortKo: "IF 외전",
    shortEn: "What-If AU",
    detailKo: "본편 정사를 건드리지 않는 독립 IF 외전 상황에서 자유롭게 상황극을 펼칩니다.",
    detailEn: "Explores playful alternate-universe roleplay without changing the main canon.",
    promptRuleKo:
      "본편 정사를 바꾸지 않는 독립 IF 외전 상황극으로 받아들이고 유연하게 호흡을 맞춘다. 다만 캐릭터의 핵심 성격과 금지 주제는 유지한다.",
    tone: "good",
  },
] as const;

export const PERSONA_TONE_OPTIONS: readonly PersonaToneOption[] = [
  {
    id: "canon-dialogue-strict",
    ko: "원작 대사 말투 고정",
    en: "Strict Canon Dialogue",
    shortKo: "원작 고정",
    shortEn: "Canon Fixed",
    detailKo: "작가가 승인한 어미·호칭·성격 톤을 흔들림 없이 유지합니다.",
    detailEn: "Strictly keeps the author-approved honorifics, cadence, and personality boundaries.",
    promptRuleKo:
      "작가가 승인한 어미·호칭·대사 호흡을 원작 그대로 엄격히 지킨다. 과도한 친근함이나 설정 이탈 표현을 쓰지 않는다.",
    tone: "accent",
  },
  {
    id: "affection-stage-reactive",
    ko: "호감도 단계별 반응",
    en: "Affection-Stage Reactive",
    shortKo: "친밀도 반응",
    shortEn: "Warmth Shift",
    detailKo: "대화가 쌓일수록 경계심에서 신뢰로 자연스럽게 말투 온도가 부드러워집니다.",
    detailEn: "Gradually shifts warmth from cautious to trusting as the conversation builds.",
    promptRuleKo:
      "대화가 이어지며 쌓이는 친밀도에 맞춰 말투의 온도를 조금씩 부드럽게 연다. 처음의 경계심에서 자연스러운 신뢰로 옮겨 가는 뉘앙스를 담는다.",
    tone: "cool",
  },
  {
    id: "voice-tts-prosody",
    ko: "보이스 TTS 감정 운율",
    en: "Voice TTS Prosody",
    shortKo: "보이스 운율",
    shortEn: "Voice Cadence",
    detailKo: "음성 낭독 시 감정과 호흡이 살아나도록 짧은 입말 문장으로 대사를 다듬습니다.",
    detailEn: "Shapes short, breathable spoken lines optimized for expressive voice read-aloud.",
    promptRuleKo:
      "음성 낭독을 고려해 쉼표와 짧은 호흡이 살아 있는 입말 대사로 답한다. 괄호 지문·마크다운·장식 기호 대신 억양이 느껴지는 문장을 쓴다.",
    tone: "good",
  },
] as const;

export function resolveSpoilerFenceOption(id: SpoilerFenceId): SpoilerFenceOption {
  return SPOILER_FENCE_OPTIONS.find((item) => item.id === id) ?? SPOILER_FENCE_OPTIONS[0];
}

export function resolvePersonaToneOption(id: PersonaToneId): PersonaToneOption {
  return PERSONA_TONE_OPTIONS.find((item) => item.id === id) ?? PERSONA_TONE_OPTIONS[0];
}

/**
 * 스포일러 안전선과 말투 온도를 실제 LLM 시스템 프롬프트 지시문으로 변환한다.
 */
export function buildCharacterChatDirectorContext(
  options: Partial<CharacterChatDirectorOptions>,
): string {
  const fence = resolveSpoilerFenceOption(options.spoilerFence ?? DEFAULT_SPOILER_FENCE);
  const tone = resolvePersonaToneOption(options.personaTone ?? DEFAULT_PERSONA_TONE);
  return [
    "[대화 연출 설정]",
    `- 스포일러 안전선(${fence.ko}): ${fence.promptRuleKo}`,
    `- 말투 온도(${tone.ko}): ${tone.promptRuleKo}`,
  ].join("\n");
}

function usesPoliteSpeech(profile: CharacterChatProfile): boolean {
  const style = `${profile.speechStyle} ${profile.greeting}`;
  if (/반말/u.test(style) && !/존댓말/u.test(style)) return false;
  if (/존댓말|요[.?…!]?$|세요|실래요/u.test(style)) return true;
  return false;
}

function splitCleanSentences(text: string): readonly string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clipText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/gu, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function pickSafeSentence(
  profile: CharacterChatProfile,
  source: string,
  fallback: string,
): string {
  const sentences = splitCleanSentences(source);
  for (const sentence of sentences) {
    if (findForbiddenTopicHits(profile, sentence).length === 0) {
      return clipText(sentence, 58);
    }
  }
  return fallback;
}

function ensureSafeText(
  profile: CharacterChatProfile,
  candidate: string,
  fallback: string,
): string {
  const checked = sanitizeCharacterReply(profile, candidate);
  if (!checked.replaced) return candidate;
  const fallbackChecked = sanitizeCharacterReply(profile, fallback);
  return fallbackChecked.replaced ? checked.text : fallback;
}

function formatToneClosing(
  polite: boolean,
  tone: PersonaToneId,
  variant: "greet" | "lore" | "crisis",
): { readonly ko: string; readonly en: string } {
  if (tone === "affection-stage-reactive") {
    if (variant === "greet") {
      return polite
        ? {
            ko: "처음엔 조금 긴장했지만, 당신과는 편하게 이야기할 수 있을 것 같아요.",
            en: "I was a little guarded at first, yet talking with you already feels easier.",
          }
        : {
            ko: "처음엔 경계했는데, 너라면 조금은 곁에 둬도 괜찮겠군.",
            en: "I kept my guard up at first, yet I don't mind letting you stay close.",
          };
    }
    if (variant === "lore") {
      return polite
        ? {
            ko: "다른 분께는 잘 꺼내지 않던 얘기지만, 지금이라면 조금 더 들려드릴게요.",
            en: "I rarely share this with anyone else, though I can tell you a bit more now.",
          }
        : {
            ko: "아무한테나 꺼낼 얘기는 아니지만, 네가 묻는다면 조금은 알려주지.",
            en: "I wouldn't tell just anyone, yet since you're asking, I'll share a piece.",
          };
    }
    return polite
      ? {
          ko: "괜찮아요, 제 뒤에 서 계세요. 이번엔 꼭 함께 빠져나가요.",
          en: "Stay right behind me—we'll make it out together this time.",
        }
      : {
          ko: "내 뒤로 물러서. 네가 다치게 둘 생각은 없으니까.",
          en: "Step behind me. I have no intention of letting you get hurt.",
        };
  }

  if (tone === "voice-tts-prosody") {
    if (variant === "greet") {
      return polite
        ? {
            ko: "잠시 숨 좀 고르고… 자, 이제 천천히 이야기해 볼까요?",
            en: "Let me catch my breath... alright, shall we talk slowly?",
          }
        : {
            ko: "잠깐. 숨 고르고 말해. 들을 준비는 됐어.",
            en: "Hold on. Catch your breath and speak. I'm listening.",
          };
    }
    if (variant === "lore") {
      return polite
        ? {
            ko: "그건 말이에요… 조용히 귀 기울여 들으셔야 하는 이야기예요.",
            en: "That part... you'll need to listen closely and quietly.",
          }
        : {
            ko: "그 얘기? 짧게 말할게. 잘 들어.",
            en: "That secret? I'll keep it brief. Listen close.",
          };
    }
    return polite
      ? {
          ko: "지금 바로 움직여야 해요! 이쪽, 제 손을 잡으세요!",
          en: "We have to move right now! Over here—take my hand!",
        }
      : {
          ko: "지금이야. 망설이지 마. 이쪽으로 뛰어!",
          en: "Now. Don't hesitate. Jump this way!",
        };
  }

  // canon-dialogue-strict
  if (variant === "greet") {
    return polite
      ? {
          ko: "작품 속 시간 그대로 여기서 기다리고 있었어요. 편하게 말을 걸어 주세요.",
          en: "I've been waiting right here inside the story. Go ahead and speak.",
        }
      : {
          ko: "쓸데없는 말은 접고, 지금 네가 궁금한 것부터 꺼내 봐.",
          en: "Skip the small talk and ask whatever brought you here.",
        };
  }
  if (variant === "lore") {
    return polite
      ? {
          ko: "제가 알고 있는 범위 안에서 차근차근 설명해 드릴게요.",
          en: "I'll walk you through everything I'm allowed to share.",
        }
      : {
          ko: "내가 확인한 사실만 말해 주지. 추측은 사양이야.",
          en: "I only speak from what I've verified. No guesswork.",
        };
  }
  return polite
    ? {
        ko: "당황하지 마세요. 제가 먼저 앞을 살피고 길을 열어 볼게요.",
        en: "Stay calm. I'll check ahead first and clear a path.",
      }
    : {
        ko: "뒤는 맡겨. 내가 먼저 상황을 정리한다.",
        en: "Leave the rear to me. I'll handle what's ahead first.",
      };
}

function formatFenceNote(
  polite: boolean,
  fence: SpoilerFenceId,
  worldClue: string,
): { readonly ko: string; readonly en: string } {
  if (fence === "season1-finale-sync") {
    return polite
      ? {
          ko: `시즌1의 일을 다 겪고 나니 "${worldClue}"의 의미가 이제는 훨씬 선명하게 보여요.`,
          en: `After everything through the Season 1 finale, the weight of this world feels much clearer now.`,
        }
      : {
          ko: `시즌1 끝까지 버텨 오고 나니, "${worldClue}" 뒤에 숨은 무게가 이제야 분명해졌어.`,
          en: `After surviving through the Season 1 finale, the truth behind our world finally makes sense.`,
        };
  }
  if (fence === "au-whatif-sandbox") {
    return polite
      ? {
          ko: `만약 본편과 다른 갈래의 오늘이었다면, "${worldClue}" 이야기도 전혀 다른 풍경으로 흘러갔겠죠?`,
          en: `In an alternate branch apart from main canon, even our ordinary day could unfold in a totally new way.`,
        }
      : {
          ko: `본편과 다른 외전 분기라면… "${worldClue}" 따위 잠시 내려놓고 색다른 선택을 해 볼 수도 있겠지.`,
          en: `If this is a What-If branch outside canon... I might set aside the usual script and try another path.`,
        };
  }
  return polite
    ? {
        ko: `지금은 초반 시점이라 "${worldClue}"까지만 들려드릴 수 있어요. 뒷이야기는 아직 비밀로 둘게요.`,
        en: `Since we're locked before Episode 10, I can only share what's known so far and keep later twists safe.`,
      }
    : {
        ko: `아직 초반 시점이야. "${worldClue}" 정도만 알아둬. 그 너머 이야기는 때가 되면 알게 될 테니까.`,
        en: `We're still early in the story. Keep to what's revealed up to Episode 10—the rest stays sealed for now.`,
      };
}

/**
 * 선택된 캐릭터의 승인 설정과 현재 연출 옵션(스포일러 안전선·말투 온도)에 맞춘
 * 3종의 원클릭 장면 스타터와 무키 게스트 정사 미리보기 응답을 결정론적으로 생성한다.
 */
export function buildCharacterChatSceneStarters(
  profile: CharacterChatProfile,
  director: CharacterChatDirectorOptions,
): readonly CharacterChatSceneStarter[] {
  const polite = usesPoliteSpeech(profile);
  const fenceOption = resolveSpoilerFenceOption(director.spoilerFence);
  const toneOption = resolvePersonaToneOption(director.personaTone);

  const safeWorkTitle = ensureSafeText(profile, profile.workTitle, "이 작품");
  const safeWorldClue = pickSafeSentence(
    profile,
    profile.worldview,
    `${safeWorkTitle}의 풍경`,
  );
  const safePersonalityCue = pickSafeSentence(
    profile,
    profile.personality,
    "흔들리지 않는 태도",
  );
  const safeAppearanceCue = profile.appearanceHint
    ? pickSafeSentence(profile, profile.appearanceHint, "")
    : "";

  const basisKo = `${fenceOption.shortKo} · ${toneOption.shortKo}`;
  const basisEn = `${fenceOption.shortEn} · ${toneOption.shortEn}`;

  // 1) 첫 만남 인사
  const greetClosing = formatToneClosing(polite, director.personaTone, "greet");
  const firstMeetingPromptKo = ensureSafeText(
    profile,
    `${profile.characterName}님, "${safeWorkTitle}" 세계에 방금 도착했어요. 처음 만나는 저에게 한마디 해 줄 수 있나요?`,
    `${profile.characterName}, 처음 인사드려요. 오늘 어떤 하루를 보내고 있나요?`,
  );
  const firstMeetingPromptEn = ensureSafeText(
    profile,
    `Hi ${profile.characterName}, I just stepped into your story. How would you greet a visitor meeting you for the first time?`,
    `Hi ${profile.characterName}, nice to meet you. How is your day going?`,
  );
  const appearanceBitKo = safeAppearanceCue ? ` (${safeAppearanceCue})` : "";
  const firstMeetingReplyKo = ensureSafeText(
    profile,
    polite
      ? `반가워요, 저는 ${profile.characterName}예요.${appearanceBitKo} ${greetClosing.ko}`
      : `${profile.characterName}. 기억해 둬.${appearanceBitKo} ${greetClosing.ko}`,
    `${profile.characterName}: ${greetClosing.ko}`,
  );
  const firstMeetingReplyEn = ensureSafeText(
    profile,
    `${profile.characterName}: ${greetClosing.en}`,
    greetClosing.en,
  );

  // 2) 세계관 비밀 질문
  const loreFence = formatFenceNote(polite, director.spoilerFence, safeWorldClue);
  const loreClosing = formatToneClosing(polite, director.personaTone, "lore");
  const worldSecretPromptKo = ensureSafeText(
    profile,
    `"${safeWorkTitle}"의 배경에서 가장 신경 쓰이는 단서가 있어요. 지금 시점에서 들려줄 수 있는 세계관 이야기가 있나요?`,
    `${profile.characterName}이 지내는 곳에서 가장 흥미로운 이야기를 들려줄래요?`,
  );
  const worldSecretPromptEn = ensureSafeText(
    profile,
    `There's a detail in your world that caught my eye. What canon lore can you share at this point in the story?`,
    `What is the most intriguing detail about the world you live in?`,
  );
  const worldSecretReplyKo = ensureSafeText(
    profile,
    `${loreFence.ko} ${loreClosing.ko}`,
    loreClosing.ko,
  );
  const worldSecretReplyEn = ensureSafeText(
    profile,
    `${loreFence.en} ${loreClosing.en}`,
    loreClosing.en,
  );

  // 3) 위기 상황 대처
  const crisisClosing = formatToneClosing(polite, director.personaTone, "crisis");
  const crisisPromptKo = ensureSafeText(
    profile,
    `갑자기 주변에 예기치 못한 위기가 닥쳤어요! ${profile.characterName}이라면 지금 이 순간 가장 먼저 어떻게 움직일 건가요?`,
    `갑작스러운 위기가 닥쳤어요. 지금 가장 먼저 어떤 선택을 할 건가요?`,
  );
  const crisisPromptEn = ensureSafeText(
    profile,
    `An unexpected crisis just broke out around us! What is your very first move in this moment, ${profile.characterName}?`,
    `An unexpected crisis just broke out! What is your first move?`,
  );
  const crisisReplyKo = ensureSafeText(
    profile,
    polite
      ? `${crisisClosing.ko} (${safePersonalityCue} — 승인된 성격 그대로 대응해요.)`
      : `${crisisClosing.ko} (${safePersonalityCue} — 승인된 성격 그대로 움직여.)`,
    crisisClosing.ko,
  );
  const crisisReplyEn = ensureSafeText(
    profile,
    `${crisisClosing.en} (${fenceOption.shortEn} · ${toneOption.shortEn})`,
    crisisClosing.en,
  );

  return [
    {
      kind: "first-meeting",
      tone: "accent",
      badgeKo: "장면 01",
      badgeEn: "Scene 01",
      titleKo: "첫 만남 인사",
      titleEn: "First Greeting",
      promptKo: firstMeetingPromptKo,
      promptEn: firstMeetingPromptEn,
      previewReplyKo: firstMeetingReplyKo,
      previewReplyEn: firstMeetingReplyEn,
      canonBasisKo: `승인 성격·말투 반영 · ${basisKo}`,
      canonBasisEn: `Approved canon voice · ${basisEn}`,
    },
    {
      kind: "world-secret",
      tone: "cool",
      badgeKo: "장면 02",
      badgeEn: "Scene 02",
      titleKo: "세계관 비밀 질문",
      titleEn: "World Lore Question",
      promptKo: worldSecretPromptKo,
      promptEn: worldSecretPromptEn,
      previewReplyKo: worldSecretReplyKo,
      previewReplyEn: worldSecretReplyEn,
      canonBasisKo: `승인 세계관·안전선 반영 · ${basisKo}`,
      canonBasisEn: `Approved world & fence · ${basisEn}`,
    },
    {
      kind: "crisis-response",
      tone: "good",
      badgeKo: "장면 03",
      badgeEn: "Scene 03",
      titleKo: "위기 상황 대처",
      titleEn: "Crisis Response",
      promptKo: crisisPromptKo,
      promptEn: crisisPromptEn,
      previewReplyKo: crisisReplyKo,
      previewReplyEn: crisisReplyEn,
      canonBasisKo: `승인 행동 원칙 반영 · ${basisKo}`,
      canonBasisEn: `Approved character instinct · ${basisEn}`,
    },
  ] as const;
}
