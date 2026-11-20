/**
 * Channel-Native Mode B Blueprints & Korean Rhetoric Localization Engine (REQ-051 ~ REQ-070, REQ-076 ~ REQ-080).
 */

import type { KoreanSpeechRegister, TargetChannelId } from "./fresh-ideas-contracts";
import type { FreshIdeaLensCardV2 } from "./fresh-ideas-lenses-engine";

export interface ChannelDraftHeadlineVariants {
  readonly directThesisKo: string;
  readonly tensionQuestionKo: string;
  readonly metricOrSceneKo: string;
}

export interface ExpandedChannelDraftV2 {
  readonly lensId: FreshIdeaLensCardV2["id"];
  readonly indexTag: string;
  readonly channelId: TargetChannelId;
  readonly channelLabelKo: string;
  readonly register: KoreanSpeechRegister;
  readonly headlineVariants: ChannelDraftHeadlineVariants;
  readonly openingHookKo: string;
  readonly bodySectionsKo: readonly string[];
  readonly preemptiveObjectionKo: string;
  readonly closingCtaKo: string;
  readonly socialThreeLineCutKo?: readonly [string, string, string];
  readonly preservedUrls: readonly string[];
}

const CHANNEL_METADATA: Record<
  TargetChannelId,
  {
    readonly labelKo: string;
    readonly defaultRegister: KoreanSpeechRegister;
    readonly ctaStyle: "debate" | "diagnostic" | "signoff";
  }
> = {
  "linkedin-kr": { labelKo: "링크드인 코리아", defaultRegister: "haeyo", ctaStyle: "debate" },
  "x-threads": { labelKo: "X · 스레드 연작", defaultRegister: "haeyo", ctaStyle: "debate" },
  "shorts-reels-60s": { labelKo: "60초 쇼츠 · 릴스 대본", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
  "ig-carousel": { labelKo: "인스타그램 캐러셀(9장)", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
  newsletter: { labelKo: "뉴스레터 에디션", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
  "brunch-blog": { labelKo: "브런치 · 장문 에세이", defaultRegister: "haera", ctaStyle: "diagnostic" },
  "internal-1pager": { labelKo: "사내 1페이저 메모", defaultRegister: "hapsyo", ctaStyle: "signoff" },
  "podcast-sheet": { labelKo: "팟캐스트 토킹 포인트", defaultRegister: "haeyo", ctaStyle: "debate" },
  "community-debate": { labelKo: "커뮤니티 토론 발제문", defaultRegister: "haeyo", ctaStyle: "debate" },
  "default-dual-preview": { labelKo: "기본 에디토리얼 + SNS 3줄", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
};

const TRANSLATIONESE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /모두가\s+(.+?)라고\s+말하지만\s+(.+?)가\s+진짜\s+이유인\s+이유/g,
    "흔히 $1 때문이라고 보지만 실제 병목은 $2에 있습니다",
  ],
  [/하루의\s*끝에/g, "결국 현장에서 남는 것은"],
  [/영원히\s*바꿀\s*것입니다/g, "실무 기준선을 새로 세웁니다"],
  [/watercooler\s*chat|virtual\s*happy\s*hour/gi, "슬랙 실시간 멘션과 비정기 화상 티타임"],
  [
    /혁신적인|놀랍게도|게임\s*체인저|압도적인|마법\s*같은|오늘날\s*급변하는\s*환경에서|새로운\s*패러다임/g,
    "검증된",
  ],
  [/supercharge|paradigm\s+shift|game-changer|unlock\s+the\s+full\s+potential/gi, "기준선 개선"],
  [/이\(가\)/g, "이"],
  [/을\(를\)/g, "을"],
  [/은\(는\)/g, "은"],
  [/과\(와\)/g, "와"],
];

export function localizeKoreanEditorialCopy(
  rawText: string,
  options?: {
    readonly register?: KoreanSpeechRegister;
    readonly bridgeForeignSourceToKorea?: boolean;
  },
): string {
  let text = rawText.replace(/!+/g, ".");
  for (const [pattern, replacement] of TRANSLATIONESE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/\s{2,}/g, " ").trim();

  if (options?.bridgeForeignSourceToKorea) {
    text +=
      " 국내 주간 연재·협업 환경에서는 출퇴근·승인 구조와 플랫폼 규격 편차 때문에 기준선 잠금이 더 먼저 작동합니다.";
  }

  if (options?.register === "haera") {
    text = text
      .replace(/합니다\./g, "한다.")
      .replace(/됩니다\./g, "된다.")
      .replace(/입니다\./g, "이다.")
      .replace(/있습니다\./g, "있다.")
      .replace(/많습니다\./g, "많다.")
      .replace(/수\s*있어요\./g, "수 있다.")
      .replace(/보세요\./g, "보라.")
      .replace(/해요\./g, "한다.");
  } else if (options?.register === "haeyo") {
    text = text
      .replace(/한다\./g, "해요.")
      .replace(/된다\./g, "돼요.")
      .replace(/이다\./g, "이에요.")
      .replace(/있다\./g, "있어요.");
  } else if (options?.register === "hapsyo") {
    text = text
      .replace(/해요\./g, "합니다.")
      .replace(/돼요\./g, "됩니다.")
      .replace(/이에요\./g, "입니다.")
      .replace(/있어요\./g, "있습니다.")
      .replace(/한다\./g, "합니다.")
      .replace(/된다\./g, "됩니다.")
      .replace(/이다\./g, "입니다.")
      .replace(/있다\./g, "있습니다.");
  }

  return text;
}

export function expandLensToChannelDraft(
  lens: FreshIdeaLensCardV2,
  channelId: TargetChannelId = "default-dual-preview",
  options?: {
    readonly registerOverride?: KoreanSpeechRegister;
    readonly bridgeForeignSourceToKorea?: boolean;
  },
): ExpandedChannelDraftV2 {
  const meta = CHANNEL_METADATA[channelId];
  const register = options?.registerOverride ?? meta.defaultRegister;

  const headlineVariants: ChannelDraftHeadlineVariants = Object.freeze({
    directThesisKo: localizeKoreanEditorialCopy(lens.headlineKo, { register: "haera" }),
    tensionQuestionKo: `왜 ${lens.labelKo} 관점을 놓치면 매주 같은 재작업이 반복될까`,
    metricOrSceneKo: `${lens.indexTag}번 기준선 하나로 주간 수정 병목을 절반 이하로 줄인 현장 기록`,
  });

  const openingHookKo = localizeKoreanEditorialCopy(
    `${lens.headlineKo}. 현장에서 마감 직전 일정표를 열어 보면 겉으로 드러난 증상과 실제 원인이 어긋나 있는 경우가 많습니다.`,
    { register, bridgeForeignSourceToKorea: options?.bridgeForeignSourceToKorea },
  );

  const coreAngle = localizeKoreanEditorialCopy(lens.angleKo, { register });
  const sourceCitationLine =
    lens.preservedUrls.length > 0
      ? `참고 원문 출처: ${lens.preservedUrls.map((u, idx) => `[원문 ${idx + 1}](${u})`).join(", ")}`
      : "";

  const bodySectionsKo: string[] = [];
  if (channelId === "linkedin-kr") {
    bodySectionsKo.push(
      `[접힘 전 2줄 훅]\n${lens.headlineKo}.\n마감 직전 재작업이 반복된다면 도구 부족이 아니라 기준선 부재를 먼저 의심해 봐야 합니다.`,
      `[현장 마찰 장면]\n회의실에서는 속도를 높이자고 합의하지만, 막상 실무 파일이 오갈 때는 담당자마다 다른 규격 때문에 검수 대기열이 길어집니다.`,
      `[핵심 전환 논리]\n${coreAngle}`,
      lens.experienceSlotPromptKo ??
        lens.playbookStepsKo?.[0]?.actionKo ??
        "오늘 오후 30분만 내어 가장 수정이 잦은 1개 공정에 기본값 잠금 규칙을 적어 두세요.",
    );
  } else if (channelId === "shorts-reels-60s") {
    bodySectionsKo.push(
      `[00:00-00:03 패턴 인터럽트 훅] ${openingHookKo}`,
      `[00:03-00:18 통념 해체] ${coreAngle}`,
      `[00:18-00:48 핵심 3단계 시연] ${
        lens.playbookStepsKo
          ? lens.playbookStepsKo.map((s, i) => `${i + 1}) ${s.actionKo}`).join(" / ")
          : "기준선 고정 → 전후 수치 대조 → 예외 케이스 격리 순으로 바로 검증합니다."
      }`,
      "[00:48-01:00 결론 및 루프 연결] 기능을 늘리기 전에 기준선 하나부터 잠가야 첫 3초의 병목이 사라집니다.",
    );
  } else if (channelId === "ig-carousel") {
    bodySectionsKo.push(
      `슬라이드 1 (표지): ${headlineVariants.directThesisKo}`,
      `슬라이드 2 (마찰 장면): ${openingHookKo}`,
      `슬라이드 3 (기존 오해): 흔히 툴 숙련도만 높이면 마감 지연이 사라진다고 생각합니다.`,
      `슬라이드 4-5 (핵심 구조): ${coreAngle}`,
      `슬라이드 6-7 (30분 실행): ${
        lens.experienceSlotPromptKo ??
        lens.playbookStepsKo?.[0]?.actionKo ??
        "오늘 오후 30분 안에 반복 수정 구간 1곳만 표시해 기준선으로 잠급니다."
      }`,
      "슬라이드 8 (예외 경계): 긴급 대응 주간에는 가장 반려율이 높은 1개 단계에만 먼저 적용합니다.",
      "슬라이드 9 (저장 요약): 저장해 두고 다음 주간 점검 회의 첫 5분에 바로 대조해 보세요.",
    );
  } else if (channelId === "x-threads") {
    bodySectionsKo.push(
      `1/ ${openingHookKo}`,
      `2/ ${coreAngle}`,
      `3/ ${
        lens.falsifiableBoundaryKo ??
        lens.experienceSlotPromptKo ??
        "팀 규모와 수정 빈도에 따라 적용 경계를 명확히 나눠야 합니다."
      }`,
      `4/ ${
        lens.playbookStepsKo?.[0]
          ? `${lens.playbookStepsKo[0].actionKo} (${lens.playbookStepsKo[0].doneCriteriaKo})`
          : "첫 단계는 오늘 30분 안에 최근 작업물 3건의 반복 반려 지점 1곳을 적는 일입니다."
      }`,
      "5/ 요약하면 도구 추가보다 기준선 잠금과 단일 검수 게이트가 마감 시간을 지킵니다.",
    );
  } else if (channelId === "newsletter") {
    bodySectionsKo.push(
      `[이메일 제목줄] ${headlineVariants.directThesisKo}`,
      `[프리뷰 텍스트] 기능 추가 없이 주간 재작업 병목을 줄이는 ${lens.labelKo} 프레임`,
      `[도입 에피소드] ${openingHookKo}`,
      `[핵심 인사이트]\n1) ${coreAngle}\n2) ${
        lens.falsifiableBoundaryKo ?? "소규모 파일럿과 다인원 분업 구간의 규칙을 분리합니다."
      }\n3) ${
        lens.playbookStepsKo?.[0]?.doneCriteriaKo ??
        "완료 기준을 수치와 산출물 단위로 못 박아야 다음 주 회고가 작동합니다."
      }`,
    );
  } else if (channelId === "brunch-blog") {
    bodySectionsKo.push(
      localizeKoreanEditorialCopy(
        `프롤로그 · 마감 전날 밤 메신저에 올라온 짧은 질문 하나에서 고민이 시작됐다. 왜 도구는 빨라졌는데 우리의 퇴근 시간은 그대로일까. ${openingHookKo}`,
        { register },
      ),
      localizeKoreanEditorialCopy(
        `1장 · 익숙한 해결책이 현장에서 헛도는 이유\n${coreAngle}`,
        { register },
      ),
      localizeKoreanEditorialCopy(
        `2장 · 기준선을 바꾼 뒤 달라진 작업의 결\n${
          lens.experienceSlotPromptKo ??
          lens.playbookStepsKo?.map((s, i) => `${i + 1}) ${s.actionKo}`).join(" ") ??
          "수정이 잦은 구간 두 곳만 기본값으로 잠그자 불필요한 왕복 확인이 눈에 띄게 줄었다."
        }`,
        { register },
      ),
      localizeKoreanEditorialCopy(
        "에필로그 · 결국 오래 버티는 팀은 더 많은 기능을 아는 팀이 아니라 무엇을 고정하고 무엇을 비워 둘지 합의한 팀이다.",
        { register },
      ),
    );
  } else if (channelId === "internal-1pager") {
    bodySectionsKo.push(
      `1. 배경 및 병목 정의: ${openingHookKo}`,
      `2. 구조적 원인 및 시사점: ${coreAngle}`,
      "3. 7일 파일럿 의사결정 요청: 담당자 1인 지정 · 오늘 30분 병목 진단 · 다음 주 수정 횟수 전후 비교표 보고.",
    );
  } else if (channelId === "podcast-sheet") {
    bodySectionsKo.push(
      `콜드 오픈 티저 (30초): ${openingHookKo}`,
      `진행자 A/B 핑퐁 질문 1: 실제로 ${lens.labelKo} 원칙을 소팀에 적용했을 때 가장 먼저 부딪히는 반발은 무엇인가요`,
      `진행자 A/B 핑퐁 질문 2: ${coreAngle}`,
      "청취자 테이크어웨이: 내일 출근 직후 30분 동안 점검할 단 하나의 병목 지점을 정해 봅니다.",
    );
  } else if (channelId === "community-debate") {
    bodySectionsKo.push(
      `[발제 요약] ${openingHookKo}`,
      `[핵심 쟁점] ${coreAngle}`,
      "[균형 선택지]\n선택지 A: 초반 속도를 위해 자율 파라미터를 열어 두고 마감 직전에 일괄 보정한다.\n선택지 B: 초기 세팅 시간이 들더라도 핵심 기준선 2개를 먼저 잠그고 시작한다.",
    );
  } else {
    bodySectionsKo.push(openingHookKo, coreAngle);
    if (lens.experienceSlotPromptKo) {
      bodySectionsKo.push(lens.experienceSlotPromptKo);
    }
    if (lens.playbookStepsKo && lens.playbookStepsKo.length > 0) {
      bodySectionsKo.push(
        lens.playbookStepsKo
          .map((s, idx) => `${idx + 1}. ${s.actionKo} (${s.doneCriteriaKo})`)
          .join("\n"),
      );
    }
  }

  if (sourceCitationLine) {
    bodySectionsKo.push(sourceCitationLine);
  }

  const preemptiveObjectionKo = localizeKoreanEditorialCopy(
    "물론 인원이 적거나 긴급 대응이 잦은 주간에는 이 기준선조차 번거롭게 느껴질 수 있습니다. 그럴 때는 전체 공정을 바꾸지 말고 가장 수정이 잦은 1개 단계에만 예외 없이 적용하면 부담을 최소화할 수 있습니다.",
    { register },
  );

  const rawCta =
    meta.ctaStyle === "debate"
      ? "현재 팀에서 기준선 없이 반복 수정이 가장 많이 발생하는 구간은 어디인지 실무 경험을 들려주실 수 있나요?"
      : meta.ctaStyle === "signoff"
        ? "이번 주 1개 에피소드·스프린트에 파일럿 적용 여부를 결정해 주시면 전후 리드타임 측정표를 공유하겠습니다."
        : "오늘 오후 30분만 투자해 최근 작업물 3건 중 가장 오래 걸린 수정 지점 1곳을 기록해 보세요.";

  const closingCtaKo = localizeKoreanEditorialCopy(rawCta, { register });

  const socialThreeLineCutKo: readonly [string, string, string] | undefined =
    channelId === "default-dual-preview"
      ? Object.freeze([
          `${lens.indexTag} · ${headlineVariants.directThesisKo}`,
          coreAngle.slice(0, 110),
          localizeKoreanEditorialCopy(
            "오늘 30분 안에 반복 수정 구간 1곳만 잠가도 다음 마감의 체감 피로가 달라집니다.",
            { register },
          ),
        ])
      : undefined;

  return Object.freeze({
    lensId: lens.id,
    indexTag: lens.indexTag,
    channelId,
    channelLabelKo: meta.labelKo,
    register,
    headlineVariants,
    openingHookKo,
    bodySectionsKo: Object.freeze(bodySectionsKo),
    preemptiveObjectionKo,
    closingCtaKo,
    socialThreeLineCutKo,
    preservedUrls: lens.preservedUrls,
  });
}

export const SUPPORTED_CHANNEL_OPTIONS: readonly {
  readonly id: TargetChannelId;
  readonly labelKo: string;
}[] = Object.freeze(
  (Object.keys(CHANNEL_METADATA) as TargetChannelId[]).map((id) => ({
    id,
    labelKo: CHANNEL_METADATA[id].labelKo,
  })),
);
