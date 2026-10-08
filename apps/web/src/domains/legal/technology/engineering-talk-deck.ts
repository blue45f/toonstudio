import type { LocalizedText } from "./engineering-story-content";
import { CORE_SLIDES, CORE_TABLE_SOURCES } from "./engineering-talk-slides-core";
import { OPENING_SLIDES, OPENING_TABLE_SOURCES } from "./engineering-talk-slides-opening";
import { OPS_SLIDES, OPS_TABLE_SOURCES } from "./engineering-talk-slides-ops";
import type { TalkSection, TalkSlide, TalkTableSource } from "./engineering-talk-types";

/**
 * 세미나 기본 발표(30분) 원본 데이터.
 *
 * - 모든 기술 주장은 저장소의 실제 파일·설정으로 확인한 것만 쓴다(`evidence` 경로).
 * - 상태(운영/설정/실험)는 슬라이드가 아니라 `chapterId`가 가리키는 기술 스토리 챕터나 도감 카드·지도 행이 소유한다.
 * - 구간 시간 예산은 슬라이드별 `seconds`의 합으로만 계산한다(중복 원본 금지).
 * - 저장소 규모 수치는 `TALK_FACTS_REVIEWED_AT` 시점에 직접 센 값이며, 추정치를 쓰지 않는다. 늘 변하는 수(테스트 파일 수)는 하한만 말한다.
 * - 파일이 1,000줄을 넘지 않도록 타입은 `engineering-talk-types.ts`, 슬라이드 본문은 `engineering-talk-slides-{opening,core,ops}.ts`에 나눠 두었다.
 */

export type {
  TalkArt,
  TalkAtlasRef,
  TalkDemoStep,
  TalkFact,
  TalkLink,
  TalkModule,
  TalkModuleIcon,
  TalkQrLink,
  TalkSection,
  TalkSectionId,
  TalkSlide,
  TalkSlideLayout,
  TalkTable,
  TalkTableSource,
} from "./engineering-talk-types";

/** 이 발표의 수치·사실을 코드와 설정으로 확인을 끝낸 날짜. 콘텐츠 테스트가 수치를 소스와 대조한다. */
export const TALK_FACTS_REVIEWED_AT = "2026-10-08";

export const TALK_SECTIONS = [
  { id: "opening", title: t("문제 정의", "The problem") },
  { id: "product", title: t("제품과 데모 동선", "Product and demo route") },
  { id: "architecture", title: t("전체 아키텍처", "Architecture") },
  { id: "core", title: t("핵심 기술", "Core technology") },
  { id: "quality", title: t("품질과 검증", "Quality and verification") },
  { id: "operations", title: t("운영과 비용", "Operations and cost") },
  { id: "lessons", title: t("배운 점과 한계", "Lessons and limits") },
  { id: "qa", title: t("질의응답", "Q&A") },
] as const satisfies readonly TalkSection[];

function t(ko: string, en: string): LocalizedText {
  return { ko, en };
}

export const TALK_SLIDES = [...OPENING_SLIDES, ...CORE_SLIDES, ...OPS_SLIDES] as const satisfies readonly TalkSlide[];

/** 표 슬라이드가 어느 지도 행·도감 카드에서 옮겨 온 것인지(슬라이드 id → 근거). 콘텐츠 테스트가 근거의 존재와 상태·숫자를 대조한다. */
export const TALK_TABLE_SOURCES: Readonly<Record<string, TalkTableSource>> = {
  ...OPENING_TABLE_SOURCES,
  ...CORE_TABLE_SOURCES,
  ...OPS_TABLE_SOURCES,
};

export type TalkSlideId = (typeof TALK_SLIDES)[number]["id"];

export interface TalkSectionPlan {
  readonly id: TalkSection["id"];
  readonly title: LocalizedText;
  readonly order: number;
  readonly seconds: number;
  readonly startSeconds: number;
  readonly firstSlideIndex: number;
  readonly slideCount: number;
}

/** 슬라이드 순서대로 구간 예산을 계산한다. 구간 시간은 슬라이드 시간의 합이다. */
export function planTalkSections(
  slides: readonly Pick<TalkSlide, "section" | "seconds">[] = TALK_SLIDES,
): readonly TalkSectionPlan[] {
  let elapsed = 0;
  return TALK_SECTIONS.map((section, order) => {
    const firstSlideIndex = slides.findIndex((slide) => slide.section === section.id);
    const members = slides.filter((slide) => slide.section === section.id);
    const seconds = members.reduce((sum, slide) => sum + slide.seconds, 0);
    const plan: TalkSectionPlan = {
      id: section.id,
      title: section.title,
      order: order + 1,
      seconds,
      startSeconds: elapsed,
      firstSlideIndex,
      slideCount: members.length,
    };
    elapsed += seconds;
    return plan;
  });
}

/** 각 슬라이드가 시작되어야 하는 누적 시간(초). */
export function talkSlideStartSeconds(
  slides: readonly Pick<TalkSlide, "seconds">[] = TALK_SLIDES,
): readonly number[] {
  let elapsed = 0;
  return slides.map((slide) => {
    const start = elapsed;
    elapsed += slide.seconds;
    return start;
  });
}

export const TALK_TOTAL_SECONDS = TALK_SLIDES.reduce((sum, slide) => sum + slide.seconds, 0);
