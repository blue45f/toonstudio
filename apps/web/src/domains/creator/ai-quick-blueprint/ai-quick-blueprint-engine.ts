/**
 * AI 자동 콘티·스토리 블루프린트 엔진 (1-Line Idea → Editable Blueprint → Studio / Story Lab Handoff).
 *
 * 설계 원칙:
 * 1) 게스트·오프라인에서도 대기 시간 0초로 동작하는 결정적 스마트 설계기(`buildAiQuickBlueprint`)를 기본으로 제공하고,
 *    로그인/AI 연결 환경에서는 선택적 클라우드 AI 문장 윤문(`polishBlueprintWithCloudAi`)으로 업그레이드한다.
 * 2) 기본 제공 문구는 화면 언어에 맞추고, 사용자가 작성한 소재는 원래 언어 그대로 보존한다.
 * 3) 파일 크기 상한(<=800줄) 준수를 위해 컷 생성(`ai-quick-blueprint-cuts.ts`)과 전달·윤문(`ai-quick-blueprint-handoff.ts`)을 분리한다.
 */

import type { StoryField } from "@/shared/lib/creator-resources";

import type { StudioStoryBeatKind } from "../studio-storyboard-planner";

import { buildInitialCuts, deriveShortCoreTopic } from "./ai-quick-blueprint-cuts";
import {
  AI_BLUEPRINT_FORMATS,
  type AiBlueprintFormatId,
  type AiBlueprintLocale,
  type AiBlueprintRemixStyle,
  type AiBlueprintSource,
  type AiBlueprintToneId,
} from "./ai-quick-blueprint-formats";

export {
  AI_BLUEPRINT_FORMATS,
  type AiBlueprintFormatId,
  type AiBlueprintLocale,
  type AiBlueprintRemixStyle,
  type AiBlueprintSource,
  type AiBlueprintToneId,
};

export {
  buildBlueprintBeats,
  composeBlueprintScript,
  openAiQuickBlueprintInStudio,
  polishBlueprintWithCloudAi,
  type AiBlueprintHandoffResult,
  type AiBlueprintHandoffStorage,
  type PolishBlueprintOutcome,
} from "./ai-quick-blueprint-handoff";

export interface AiIdeaSparkPreset {
  readonly id: string;
  readonly chipKo: string;
  readonly chipEn: string;
  readonly ideaKo: string;
  readonly ideaEn: string;
  readonly recommendedFormat: AiBlueprintFormatId;
  readonly recommendedTone: AiBlueprintToneId;
}

export interface AiBlueprintCharacter {
  readonly id: string;
  readonly roleKo: string;
  readonly roleEn: string;
  readonly name: string;
  readonly traitSummary: string;
  readonly poseHint: string;
}

export interface AiBlueprintCut {
  readonly id: string;
  readonly index: number;
  readonly beatKind: StudioStoryBeatKind;
  readonly beatLabel: string;
  readonly shotAngle: string;
  readonly scene: string;
  readonly dialogue: string;
  readonly narration: string;
  readonly sfx: string;
  readonly stage3dHint: string;
  readonly remixRevision: number;
}

export type AiStoryWorksheet = Readonly<Record<StoryField, string>>;

export interface AiQuickBlueprint {
  readonly locale: AiBlueprintLocale;
  readonly idea: string;
  readonly formatId: AiBlueprintFormatId;
  readonly toneId: AiBlueprintToneId;
  readonly source: AiBlueprintSource;
  readonly title: string;
  readonly altTitles: readonly string[];
  readonly titleIndex: number;
  readonly logline: string;
  readonly characters: readonly AiBlueprintCharacter[];
  readonly cuts: readonly AiBlueprintCut[];
  readonly storyWorksheet: AiStoryWorksheet;
}

export const AI_IDEA_SPARK_PRESETS: readonly AiIdeaSparkPreset[] = Object.freeze([
  {
    id: "rainy-bookstore",
    chipKo: "비 오는 헌책방의 미래 일기",
    chipEn: "Future diary in a rainy bookshop",
    ideaKo: "비 오는 날 헌책방에서 내일의 내 선택이 적힌 일기장을 주웠다",
    ideaEn: "On a rainy evening, I found a diary in an old bookshop listing the choices I will make tomorrow",
    recommendedFormat: "webtoon-6",
    recommendedTone: "romance",
  },
  {
    id: "dungeon-barista",
    chipKo: "던전 입구 심야 카페",
    chipEn: "Midnight cafe at a dungeon gate",
    ideaKo: "은퇴한 최강 헌터가 던전 입구에 심야 에스프레소 바를 열었다",
    ideaEn: "A retired top hunter opened a quiet midnight espresso bar right outside a dungeon gate",
    recommendedFormat: "webtoon-6",
    recommendedTone: "action",
  },
  {
    id: "cat-intern",
    chipKo: "야근 책상 위 고양이 신입",
    chipEn: "Cat intern on my overtime desk",
    ideaKo: "야근하던 내 모니터 앞에 정장 조끼를 입은 고양이 신입이 이력서를 내려놓았다",
    ideaEn: "During late-night overtime, a cat in a tailored vest placed a resume right in front of my monitor",
    recommendedFormat: "instatoon-4",
    recommendedTone: "comedy",
  },
  {
    id: "rooftop-timeleap",
    chipKo: "졸업식 옥상 3회 타임루프",
    chipEn: "3-loop rewind on graduation rooftop",
    ideaKo: "학교 옥상 문을 열자 졸업식 아침으로 세 번 되감기는 타임루프가 시작됐다",
    ideaEn: "Opening the school rooftop door triggered a three-loop rewind back to graduation morning",
    recommendedFormat: "movingtoon-4",
    recommendedTone: "mystery",
  },
  {
    id: "ghost-roommate",
    chipKo: "마감 돕는 유령 룸메이트",
    chipEn: "Deadline-helping ghost roommate",
    ideaKo: "반값 보증금 자취방의 조건은 밤 11시마다 배경 선화를 도와주는 유령 룸메이트였다",
    ideaEn: "The half-deposit studio apartment came with a friendly ghost roommate who inks backgrounds at 11 PM",
    recommendedFormat: "instatoon-4",
    recommendedTone: "comedy",
  },
  {
    id: "palace-night-snack",
    chipKo: "폭군을 재우는 수라간 야식",
    chipEn: "Royal kitchen midnight comfort dish",
    ideaKo: "궁중 수라간 막내가 불면증에 시달리는 왕을 잠재우는 비밀 야식을 만들었다",
    ideaEn: "The youngest royal kitchen cook created a secret midnight dish that finally cured the king's insomnia",
    recommendedFormat: "webtoon-6",
    recommendedTone: "romance",
  },
]);


export const AI_BLUEPRINT_TONES: readonly {
  readonly id: AiBlueprintToneId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = Object.freeze([
  { id: "romance", labelKo: "설레는 감성·로맨스", labelEn: "Warm & Romantic" },
  { id: "action", labelKo: "박진감 판타지·액션", labelEn: "Dynamic & Fantasy" },
  { id: "comedy", labelKo: "일상 공감·유머", labelEn: "Relatable & Witty" },
  { id: "mystery", labelKo: "긴장감 추리·반전", labelEn: "Suspense & Twist" },
]);

function normalizeIdea(rawIdea: string, locale: AiBlueprintLocale): string {
  const cleaned = rawIdea.replace(/\s+/gu, " ").trim().slice(0, 200);
  if (cleaned) return cleaned;
  return locale === "ko"
    ? (AI_IDEA_SPARK_PRESETS[0]?.ideaKo ?? "비 오는 날 헌책방에서 내일의 일기장을 주웠다")
    : (AI_IDEA_SPARK_PRESETS[0]?.ideaEn ?? "On a rainy evening, I found a diary listing tomorrow's choices");
}

function buildTitles(coreTopic: string, toneId: AiBlueprintToneId, locale: AiBlueprintLocale): readonly string[] {
  if (locale === "ko") {
    const byTone: Record<AiBlueprintToneId, readonly string[]> = {
      romance: [
        `${coreTopic}, 그날의 기록`,
        `우리의 첫 장면: ${coreTopic}`,
        `${coreTopic}에서 시작된 계절`,
      ],
      action: [
        `${coreTopic}: 각성의 서막`,
        `코드 네임 · ${coreTopic}`,
        `${coreTopic}의 마지막 규칙`,
      ],
      comedy: [
        `어쩌다 ${coreTopic}!`,
        `오늘부터 ${coreTopic} 담당입니다`,
        `${coreTopic} 생존 일지`,
      ],
      mystery: [
        `${coreTopic}의 숨겨진 페이지`,
        `자정 직전, ${coreTopic}`,
        `${coreTopic}: 세 번째 단서`,
      ],
    };
    return byTone[toneId].map((title) => title.slice(0, 60));
  }

  const cleanTopic = coreTopic.replace(/^(?:on a|during|opening|the)\s+/iu, "");
  const titled = cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1);
  const byToneEn: Record<AiBlueprintToneId, readonly string[]> = {
    romance: [
      `Notes from ${titled}`,
      `Where Our Scene Began: ${titled}`,
      `After the Rain: ${titled}`,
    ],
    action: [
      `${titled}: Zero Hour`,
      `Vanguard of ${titled}`,
      `The Final Rule of ${titled}`,
    ],
    comedy: [
      `Somehow Stuck with ${titled}!`,
      `Day One at ${titled}`,
      `Surviving ${titled}`,
    ],
    mystery: [
      `The Missing Page of ${titled}`,
      `Before Midnight: ${titled}`,
      `${titled} — Clue Three`,
    ],
  };
  return byToneEn[toneId].map((title) => title.slice(0, 80));
}

function buildCharacters(
  idea: string,
  toneId: AiBlueprintToneId,
  locale: AiBlueprintLocale,
): readonly AiBlueprintCharacter[] {
  if (locale === "ko") {
    const leadTraitByTone: Record<AiBlueprintToneId, string> = {
      romance: "감정을 숨기려 하지만 결정적인 순간에 솔직해지는 주인공",
      action: "평소엔 침착하지만 위기 앞에서 가장 먼저 나서는 실력자",
      comedy: "평범한 일상을 지키고 싶지만 매번 기묘한 사건에 휘말리는 현실주의자",
      mystery: "사소한 단서도 놓치지 않고 끝까지 진실을 추적하는 관찰자",
    };
    const partnerTraitByTone: Record<AiBlueprintToneId, string> = {
      romance: `‘${deriveShortCoreTopic(idea, "ko")}’의 비밀을 쥔 따뜻한 조력자`,
      action: "예상 밖의 제안을 건네며 판을 흔드는 파트너",
      comedy: "천연덕스러운 한마디로 상황을 뒤집는 단짝 파트너",
      mystery: "아군인지 적군인지 알 수 없는 핵심 목격자",
    };
    return [
      {
        id: "character-lead",
        roleKo: "주인공",
        roleEn: "Lead",
        name: "주인공 (이안)",
        traitSummary: leadTraitByTone[toneId],
        poseHint: "시선 집중 상반신 · 자연스러운 손 제스처",
      },
      {
        id: "character-partner",
        roleKo: "상대역·조력자",
        roleEn: "Partner",
        name: "상대역 (서윤)",
        traitSummary: partnerTraitByTone[toneId],
        poseHint: "측면 실루엣 등장 · 거리감 대비 구도",
      },
    ];
  }

  const leadTraitEn: Record<AiBlueprintToneId, string> = {
    romance: "Guarded on the surface, yet honest when the moment matters most",
    action: "Calm under pressure and decisive the instant danger strikes",
    comedy: "Wants a quiet routine, yet magnets every absurd twist in town",
    mystery: "Observant investigator who notices the one detail everyone missed",
  };
  const partnerTraitEn: Record<AiBlueprintToneId, string> = {
    romance: "Warm counterpart holding the key to the opening mystery",
    action: "Unpredictable ally whose offer changes the stakes",
    comedy: "Deadpan sidekick who flips every tense scene with one line",
    mystery: "Key witness standing on the line between ally and suspect",
  };
  return [
    {
      id: "character-lead",
      roleKo: "주인공",
      roleEn: "Lead",
      name: "Rowan (Lead)",
      traitSummary: leadTraitEn[toneId],
      poseHint: "Medium portrait · expressive hand gesture",
    },
    {
      id: "character-partner",
      roleKo: "상대역·조력자",
      roleEn: "Partner",
      name: "Claire (Partner)",
      traitSummary: partnerTraitEn[toneId],
      poseHint: "Backlit entrance · contrast framing",
    },
  ];
}

export function buildStoryLabWorksheetFromIdea(
  rawIdea: string,
  toneId: AiBlueprintToneId = "romance",
  locale: AiBlueprintLocale = "ko",
): AiStoryWorksheet {
  const idea = normalizeIdea(rawIdea, locale);
  const topic = deriveShortCoreTopic(idea, locale);
  const titles = buildTitles(topic, toneId, locale);

  if (locale === "ko") {
    return {
      title: titles[0] ?? topic,
      protagonist:
        toneId === "action"
          ? "평소엔 실력을 숨기고 조용히 지내지만 결정적인 순간에 앞장서는 주인공"
          : toneId === "comedy"
            ? "평화로운 퇴근과 일상을 꿈꾸지만 기묘한 사건의 중심에 서게 된 주인공"
            : toneId === "mystery"
              ? "남들이 스쳐 지나간 작은 모순을 끝까지 기록하고 추적하는 주인공"
              : "마음을 쉽게 드러내지 못하지만 소중한 순간 앞에서는 진심을 택하는 주인공",
      desire: `‘${idea}’ 속에서 찾아온 뜻밖의 기회를 붙잡고 진짜 해답을 확인하고 싶다.`,
      obstacle: "정체를 알 수 없는 규칙과 시간 제한 때문에 기존에 믿던 방식이 더 이상 통하지 않는다.",
      stakes: "이번 선택을 피하면 소중한 인연과 다시 오지 않을 결정적인 단서를 영영 놓치게 된다.",
      world: `익숙한 일상 공간에 ‘${topic}’이라는 특별한 규칙이 겹쳐진 현대·판타지 무대.`,
      turn: "1화 중반, 우연인 줄 알았던 사건이 사실 주인공을 향해 열려 있었다는 반전이 드러난다.",
      ending: "두려움을 넘어 스스로 첫 발을 내딛으며 이전과는 완전히 다른 내일을 맞이한다.",
    };
  }

  return {
    title: titles[0] ?? topic,
    protagonist:
      toneId === "action"
        ? "A calm, understated specialist who steps forward first when danger becomes real"
        : toneId === "comedy"
          ? "A practical everyday lead who just wants peace and quiet yet attracts every odd twist"
          : toneId === "mystery"
            ? "An observant lead who records every small contradiction others overlook"
            : "A guarded lead who chooses honesty when an irreplaceable connection is at stake",
    desire: `Wants to uncover the truth behind "${idea}" and protect what matters.`,
    obstacle: "An unfamiliar rule and ticking time limit render safe, ordinary solutions useless.",
    stakes: "Walking away means losing both a pivotal bond and the only chance to change tomorrow.",
    world: `An everyday setting subtly reshaped by the hidden rule of "${topic}".`,
    turn: "Mid-episode, what looked like coincidence turns out to be waiting specifically for the lead.",
    ending: "Steps across the threshold by choice, opening a bold new chapter.",
  };
}

export function buildAiQuickBlueprint(options: {
  readonly idea: string;
  readonly formatId?: AiBlueprintFormatId;
  readonly toneId?: AiBlueprintToneId;
  readonly locale?: AiBlueprintLocale;
}): AiQuickBlueprint {
  const locale = options.locale ?? "ko";
  const formatId = options.formatId ?? "instatoon-4";
  const toneId = options.toneId ?? "romance";
  const idea = normalizeIdea(options.idea, locale);
  const topic = deriveShortCoreTopic(idea, locale);
  const altTitles = buildTitles(topic, toneId, locale);
  const characters = buildCharacters(idea, toneId, locale);
  const cuts = buildInitialCuts(idea, formatId, toneId, locale);
  const storyWorksheet = buildStoryLabWorksheetFromIdea(idea, toneId, locale);
  const logline =
    locale === "ko"
      ? `${idea} — 예상 밖의 조우와 반전 속에서 주인공이 직접 다음 장면을 선택하는 웹툰 블루프린트.`
      : `${idea} — an editable webtoon blueprint following an unexpected encounter, twist, and decisive choice.`;

  return {
    locale,
    idea,
    formatId,
    toneId,
    source: "smart-instant",
    title: altTitles[0] ?? storyWorksheet.title,
    altTitles,
    titleIndex: 0,
    logline,
    characters,
    cuts,
    storyWorksheet,
  };
}

export function cycleBlueprintTitle(blueprint: AiQuickBlueprint): AiQuickBlueprint {
  if (blueprint.altTitles.length <= 1) return blueprint;
  const nextIndex = (blueprint.titleIndex + 1) % blueprint.altTitles.length;
  const nextTitle = blueprint.altTitles[nextIndex] ?? blueprint.title;
  return {
    ...blueprint,
    titleIndex: nextIndex,
    title: nextTitle,
    storyWorksheet: {
      ...blueprint.storyWorksheet,
      title: nextTitle,
    },
  };
}

export function remixBlueprintCut(
  blueprint: AiQuickBlueprint,
  cutId: string,
  style: AiBlueprintRemixStyle,
): AiQuickBlueprint {
  const ko = blueprint.locale === "ko";
  return {
    ...blueprint,
    cuts: blueprint.cuts.map((cut) => {
      if (cut.id !== cutId) return cut;
      const rev = cut.remixRevision + 1;
      const variant = rev % 2;

      if (style === "natural") {
        return {
          ...cut,
          dialogue: ko
            ? (variant === 1
              ? "솔직히 말하면… 나도 방금까지 믿기지 않았거든."
              : "잠깐, 우리 천천히 다시 확인해 보자. 분명 이유가 있을 거야.")
            : (variant === 1
              ? "Honestly… I barely believed what I was seeing a second ago."
              : "Hold on, let's look at this one step at a time. There has to be a reason."),
          narration: ko
            ? "힘을 빼고 건넨 한마디가 오히려 공기를 부드럽게 바꿨다."
            : "A quieter, honest line softened the tension in the room.",
          remixRevision: rev,
        };
      }

      if (style === "dramatic") {
        return {
          ...cut,
          shotAngle: ko
            ? "초근접 눈빛 클로즈업 · 강한 역광 대비"
            : "Extreme eye-level close-up · high-contrast backlight",
          dialogue: ko
            ? (variant === 1
              ? "물러설 생각 없어. 이 문 너머에 뭐가 있든 직접 확인할 거야!"
              : "기억해 둬. 오늘 이 선택이 모든 규칙을 바꿀 테니까.")
            : (variant === 1
              ? "I'm not backing down—whatever waits past this door, I'll face it myself!"
              : "Remember this beat. Today's choice rewrites every rule we knew."),
          sfx: ko ? "쿠구구궁—!" : "BOOM—!",
          remixRevision: rev,
        };
      }

      return {
        ...cut,
        shotAngle: ko
          ? "데포르메 리액션 컷 · 말풍선 강조"
          : "Expressive reaction panel · punchy speech balloon",
        dialogue: ko
          ? (variant === 1
            ? "아니 잠깐만요, 설명서도 없이 실전 투입이라고요?!"
            : "좋습니다. 일단 심호흡 한 번 하고… 간식부터 챙겨도 될까요?")
          : (variant === 1
            ? "Wait a second—you're throwing me in live without a manual?!"
            : "Alright, deep breath first… and maybe grab a snack before saving the day?"),
        sfx: ko ? "띠로리~!" : "BOING!",
        remixRevision: rev,
      };
    }),
  };
}

export function appendBlueprintCut(blueprint: AiQuickBlueprint): AiQuickBlueprint {
  if (blueprint.cuts.length >= 8) return blueprint;
  const nextIndex = blueprint.cuts.length + 1;
  const ko = blueprint.locale === "ko";
  const nextCut: AiBlueprintCut = {
    id: `cut-${nextIndex}`,
    index: nextIndex,
    beatKind: "transition",
    beatLabel: ko ? `${nextIndex}컷 · 에필로그 보너스` : `Panel ${nextIndex} · Bonus Beat`,
    shotAngle: ko ? "여백 있는 미디엄 풀샷 · 다음 화 예고" : "Breathing medium-full shot · next-episode tease",
    scene: ko
      ? "사건 직후 두 인물이 새로운 단서를 확인하며 다음 회차의 여운을 남긴다."
      : "Right after the dust settles, a quiet new clue points toward Episode 2.",
    dialogue: ko
      ? "끝난 줄 알았지? 진짜 이야기는 지금부터야."
      : "Thought that was the whole mystery? We're just getting started.",
    narration: ko
      ? "닫힌 줄 알았던 페이지 너머로 다음 장이 예고되고 있었다."
      : "Beyond what looked like the final page, the next chapter was already waiting.",
    sfx: ko ? "사락…" : "Turn…",
    stage3dHint: ko ? "저녁 노을 조명 + 2화 타이틀 여백" : "Sunset key light + Episode 2 title space",
    remixRevision: 0,
  };
  return {
    ...blueprint,
    cuts: [...blueprint.cuts, nextCut],
  };
}

export function buildContextualInterviewAnswer(options: {
  readonly slot: string;
  readonly seedIdea: string;
  readonly fallbackExampleKo: string;
  readonly fallbackExampleEn: string;
  readonly locale: AiBlueprintLocale;
}): string {
  const { slot, seedIdea, fallbackExampleKo, fallbackExampleEn, locale } = options;
  const cleanSeed = seedIdea.trim();
  if (!cleanSeed) {
    return locale === "ko" ? fallbackExampleKo : fallbackExampleEn;
  }
  const shortSeed = deriveShortCoreTopic(cleanSeed, locale);

  if (locale === "ko") {
    switch (slot) {
      case "who":
        return `‘${shortSeed}’ 사건의 중심에 선 주인공과 비밀을 알고 있는 파트너`;
      case "where":
        return `비 개인 저녁빛이 스며드는 골목 끝, ‘${shortSeed}’이(가) 시작된 장소`;
      case "event":
        return cleanSeed;
      case "problem":
      case "obstacle":
        return `‘${shortSeed}’에는 단 한 번만 선택할 수 있다는 뜻밖의 조건이 붙어 있었다`;
      case "turn":
        return `우연인 줄 알았던 ‘${shortSeed}’이 사실 처음부터 나를 향해 열려 있었다는 걸 알게 된다 — “이제 내 차례야.”`;
      case "ending":
        return "망설임을 접고 직접 문을 열며, 어제와는 전혀 다른 내일이 시작된다";
      case "lesson":
      case "takeaway":
        return "작은 용기 하나가 가장 평범했던 하루를 특별한 이야기로 바꾼다";
      default:
        return fallbackExampleKo;
    }
  }

  switch (slot) {
    case "who":
      return `The lead caught up in "${shortSeed}" and a counterpart who knows its secret`;
    case "where":
      return `A quiet dusk corner right where "${shortSeed}" first began`;
    case "event":
      return cleanSeed;
    case "problem":
    case "obstacle":
      return `"${shortSeed}" comes with an unexpected one-shot rule and a ticking clock`;
    case "turn":
      return `Realizing "${shortSeed}" was never an accident — "Alright, it's my turn now."`;
    case "ending":
      return "Stepping forward by choice as an unfamiliar, exciting tomorrow opens up";
    case "lesson":
    case "takeaway":
      return "One honest step can turn an ordinary evening into the start of a real story";
    default:
      return fallbackExampleEn;
  }
}
