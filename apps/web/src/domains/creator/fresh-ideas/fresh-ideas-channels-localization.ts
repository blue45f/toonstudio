/**
 * Channel-Native Mode B Blueprints & Korean Rhetoric Localization Engine (REQ-051 ~ REQ-070).
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
  { readonly labelKo: string; readonly defaultRegister: KoreanSpeechRegister; readonly ctaStyle: "debate" | "diagnostic" | "signoff" }
> = {
  "linkedin-kr": { labelKo: "링크드인 코리아", defaultRegister: "haeyo", ctaStyle: "debate" },
  "x-threads": { labelKo: "X · 스레드 연작", defaultRegister: "haeyo", ctaStyle: "debate" },
  "shorts-reels-60s": { labelKo: "60초 쇼츠 · 릴스 대본", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
  "ig-carousel": { labelKo: "인스타그램 캐러셀(8장)", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
  newsletter: { labelKo: "뉴스레터 에디션", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
  "brunch-blog": { labelKo: "브런치 · 장문 칼럼", defaultRegister: "haera", ctaStyle: "diagnostic" },
  "internal-1pager": { labelKo: "사내 1페이저 메모", defaultRegister: "hapsyo", ctaStyle: "signoff" },
  "podcast-sheet": { labelKo: "팟캐스트 토킹 포인트", defaultRegister: "haeyo", ctaStyle: "debate" },
  "community-debate": { labelKo: "커뮤니티 토론 발제문", defaultRegister: "haeyo", ctaStyle: "debate" },
  "default-dual-preview": { labelKo: "기본 에디토리얼 + SNS 3줄", defaultRegister: "haeyo", ctaStyle: "diagnostic" },
};

const TRANSLATIONESE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/모두가\s+(.+?)라고\s+말하지만\s+(.+?)가\s+진짜\s+이유인\s+이유/g, "흔히 $1 때문이라고 보지만 실제 병목은 $2에 있습니다"],
  [/하루의\s*끝에/g, "결국 현장에서 남는 것은"],
  [/영원히\s*바꿀\s*것입니다/g, "실무 기준선을 새로 세웁니다"],
  [/watercooler\s*chat|virtual\s*happy\s*hour/gi, "슬랙 실시간 멘션과 비정기 화상 티타임"],
  [/혁신적인|놀랍게도|게임\s*체인저|압도적인|마법\s*같은/g, "검증된"],
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
    text += " 국내 주간 연재·협업 환경에서는 출퇴근·승인 구조와 플랫폼 규격 편차 때문에 기준선 잠금이 더 먼저 작동합니다.";
  }

  if (options?.register === "haera") {
    text = text
      .replace(/합니다\./g, "한다.")
      .replace(/됩니다\./g, "된다.")
      .replace(/입니다\./g, "이다.")
      .replace(/있습니다\./g, "있다.")
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
      .replace(/있어요\./g, "있습니다.");
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

  const bodySectionsKo: string[] = [];
  if (channelId === "shorts-reels-60s") {
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
      `슬라이드 3-5 (핵심 전개): ${coreAngle}`,
      `슬라이드 6-7 (실행 체크): ${
        lens.experienceSlotPromptKo ??
        lens.playbookStepsKo?.[0]?.actionKo ??
        "오늘 오후 30분 안에 반복 수정 구간 1곳만 표시해 기준선으로 잠급니다."
      }`,
      "슬라이드 8 (행동 요약): 저장해 두고 다음 주간 점검 회의 첫 5분에 바로 적용해 보세요.",
    );
  } else if (channelId === "x-threads") {
    bodySectionsKo.push(
      `1/ ${openingHookKo}`,
      `2/ ${coreAngle}`,
      `3/ ${lens.falsifiableBoundaryKo ?? lens.experienceSlotPromptKo ?? "팀 규모와 수정 빈도에 따라 적용 경계를 명확히 나눠야 합니다."}`,
      "4/ 요약하면 도구 추가보다 기준선 잠금과 단일 검수 게이트가 마감 시간을 지킵니다.",
    );
  } else if (channelId === "internal-1pager") {
    bodySectionsKo.push(
      `배경 및 문제 정의: ${openingHookKo}`,
      `우리 팀 시사점: ${coreAngle}`,
      "이번 주 7일 파일럿 제안: 담당자 1인 지정 · 30분 진단 · 전후 수정 횟수 비교표 제출.",
    );
  } else if (channelId === "podcast-sheet") {
    bodySectionsKo.push(
      `콜드 오픈 티저 (30초): ${openingHookKo}`,
      `진행자 A/B 핑퐁 질문: "실제로 ${lens.labelKo} 원칙을 소팀에 적용했을 때 가장 먼저 부딪히는 반발은 무엇인가요?"`,
      `핵심 정리: ${coreAngle}`,
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

  const preemptiveObjectionKo = localizeKoreanEditorialCopy(
    "물론 인원이 적거나 긴급 대응이 잦은 주간에는 이 기준선조차 번거롭게 느껴질 수 있습니다. 그럴 때는 전체 공정을 바꾸지 말고 가장 수정이 잦은 1개 단계에만 예외 없이 적용하면 부담을 최소화할 수 있습니다.",
    { register },
  );

  const closingCtaKo =
    meta.ctaStyle === "debate"
      ? "현재 팀에서 기준선 없이 반복 수정이 가장 많이 발생하는 구간은 어디인지 실무 경험을 들려주실 수 있나요?"
      : meta.ctaStyle === "signoff"
        ? "이번 주 1개 에피소드·스프린트에 파일럿 적용 여부를 결정해 주시면 전후 리드타임 측정표를 공유하겠습니다."
        : "오늘 오후 30분만 투자해 최근 작업물 3건 중 가장 오래 걸린 수정 지점 1곳을 기록해 보세요.";

  const socialThreeLineCutKo: readonly [string, string, string] | undefined =
    channelId === "default-dual-preview"
      ? Object.freeze([
          `${lens.indexTag} · ${headlineVariants.directThesisKo}`,
          coreAngle.slice(0, 110),
          "오늘 30분 안에 반복 수정 구간 1곳만 잠가도 다음 마감의 체감 피로가 달라집니다.",
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
