import { engineeringDeckHref } from "./engineering-deck-state";
import type { LocalizedText } from "./engineering-story-content";
import { findEngineeringPage, type EngineeringPageId } from "./engineering-tech-pages";

/**
 * 기술 허브의 "여기서 시작"과 "읽는 길" 데이터.
 *
 * 허브가 큰 콘텐츠 모듈(스토리 챕터·덱 모델·도감)을 더 불러오지 않도록, 페이지 목록(`engineering-tech-pages.ts`)과
 * 덱 주소 계약(`engineering-deck-state.ts`, 의존성 없음)만 가져온다. 시간은 여기에 적지 않고 레지스트리의
 * `readingMinutes`·`talkMinutes` 에서 더해 낸다. 덱의 "핵심 요약" 트랙 길이만 덱 모델이 정본이라 값을 고정해 두고,
 * `engineering-reading-routes.test.ts` 가 덱 모델의 실제 길이와 같은지 확인한다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 발표 모드 "핵심 요약" 트랙의 예정 시간(분). 정본은 `deckTrackTotalSeconds("brief")` 이고 테스트가 같은 값인지 본다. */
export const ENGINEERING_DECK_BRIEF_MINUTES = 11;

export type ReadingRouteId = "skim" | "understand" | "deep";

export interface ReadingRouteStep {
  readonly pageId: EngineeringPageId;
  /** 발표 모드의 트랙을 가리킬 때만. 링크는 그 트랙의 첫 슬라이드로 열리고 시간은 트랙 길이를 쓴다. */
  readonly deckTrack?: "brief";
  /** 필요할 때만 들르는 단계. 시간 합계에 넣지 않는다. */
  readonly optional?: boolean;
  /** 링크 이름. 없으면 페이지의 메뉴 이름을 쓴다(덱 트랙처럼 페이지보다 좁은 곳을 가리킬 때 지정한다). */
  readonly label?: LocalizedText;
  /** 이 단계에서 얻는 것 한 줄. */
  readonly note: LocalizedText;
}

export interface ReadingRoute {
  readonly id: ReadingRouteId;
  readonly title: LocalizedText;
  readonly audience: LocalizedText;
  /** 이 길을 고르는 때 한 줄. */
  readonly goal: LocalizedText;
  readonly steps: readonly ReadingRouteStep[];
}

/** 첫 화면의 두 문. 구조(아키텍처 해설)와 재료(라이브러리 해설)를 같은 크기의 카드로 놓는다. */
export const ENGINEERING_START_PAGES: readonly {
  readonly pageId: Extract<EngineeringPageId, "architecture" | "libraries">;
  /** 카드 제목. 메뉴 이름(짧은 한 줄)보다 풀어 쓴다. */
  readonly title: LocalizedText;
  /** 이 해설이 큰 그림에서 맡은 몫. */
  readonly role: LocalizedText;
  /** 어떻게 읽기 시작하나. */
  readonly hook: LocalizedText;
}[] = [
  {
    pageId: "architecture",
    title: t("아키텍처 해설", "Architecture guide"),
    role: t("구조", "Structure"),
    hook: t("한 장의 도식으로 먼저 보고, 구간별로 내려갑니다.", "See one diagram first, then go down section by section."),
  },
  {
    pageId: "libraries",
    title: t("라이브러리 해설", "Library guide"),
    role: t("재료", "Materials"),
    hook: t("영역을 하나 골라 쓰인 라이브러리와 이유를 봅니다.", "Pick an area to see the libraries in use and the reasons."),
  },
];

export const ENGINEERING_READING_ROUTES: readonly ReadingRoute[] = [
  {
    id: "skim",
    title: t("훑어보기", "Skim"),
    audience: t("투자자·처음 오신 분", "Investors and first-time visitors"),
    goal: t("큰 줄기만 짧게 듣고 싶을 때", "When you want only the main thread, briefly"),
    steps: [
      {
        pageId: "deck",
        deckTrack: "brief",
        label: t("발표 모드 · 핵심 요약", "Deck · Brief"),
        note: t("핵심 요약 트랙으로 같은 이야기를 짧게 따라갑니다.", "Follow the same story in the brief track."),
      },
      {
        pageId: "glossary",
        optional: true,
        note: t("낯선 말이 나오면 용어집에서 바로 찾습니다.", "Look up any unfamiliar term in the glossary."),
      },
    ],
  },
  {
    id: "understand",
    title: t("이해하기", "Understand"),
    audience: t("개발자·스터디 참가자", "Developers and study groups"),
    goal: t("구조와 재료, 그리고 그 이유를 이해하고 싶을 때", "When you want the structure, the materials and the reasons"),
    steps: [
      {
        pageId: "architecture",
        note: t("구조: 브라우저·엣지·서버·데이터가 어떻게 맞물리는지 봅니다.", "Structure: see how the browser, edge, server and data fit together."),
      },
      {
        pageId: "libraries",
        note: t("재료: 쓰인 라이브러리와 그것을 고른 이유를 영역별로 봅니다.", "Materials: see the libraries in use and why each was chosen, area by area."),
      },
      {
        pageId: "atlas",
        optional: true,
        note: t("궁금한 기술은 도감 카드 한 장으로 더 깊이 봅니다.", "Go deeper on one technology with a single atlas card."),
      },
    ],
  },
  {
    id: "deep",
    title: t("깊이 파고들기", "Go deep"),
    audience: t("적용을 검토하거나 깊이 공부하려는 분", "People adopting the patterns or studying in depth"),
    goal: t("원칙을 가져가 내 서비스에 옮기고 싶을 때", "When you want to carry the principles into your own product"),
    steps: [
      { pageId: "story", note: t("왜, 어떻게 만들었는지 챕터 순서로 읽습니다.", "Read why and how it was built, chapter by chapter.") },
      { pageId: "playbook", note: t("다른 서비스에도 쓸 설계 원칙과 결정을 가져갑니다.", "Take the design principles and decisions that carry over.") },
      { pageId: "guides", note: t("단계별 가이드로 내 서비스에 옮기는 순서를 잡습니다.", "Plan the adoption order with step-by-step guides.") },
      { pageId: "field-notes", note: t("깨졌던 곳과 고친 과정으로 한계를 확인합니다.", "Check the limits through what broke and how it was fixed.") },
      {
        pageId: "deck",
        optional: true,
        note: t("정리한 내용을 발표 모드로 말해 봅니다.", "Rehearse what you learned in presentation mode."),
      },
    ],
  },
];

/** 단계가 가리키는 주소. 덱 트랙을 지정하면 그 트랙의 첫 슬라이드로 연다. */
export function readingStepHref(step: ReadingRouteStep): string {
  if (step.deckTrack) return engineeringDeckHref({ track: step.deckTrack, index: 0 });
  return findEngineeringPage(step.pageId).href;
}

/** 단계에 걸리는 시간(분). 레지스트리에 시간이 없는 페이지(자료 페이지 등)는 undefined 다. */
export function readingStepMinutes(step: ReadingRouteStep): number | undefined {
  if (step.deckTrack === "brief") return ENGINEERING_DECK_BRIEF_MINUTES;
  const page = findEngineeringPage(step.pageId);
  return page.readingMinutes ?? page.talkMinutes;
}

export interface ReadingRouteTime {
  /** 시간이 정해진 필수 단계의 합(분). */
  readonly minutes: number;
  /** 모든 필수 단계의 시간이 정해져 있는지. 하나라도 없으면 합계를 보여주지 않는다(작게 말하지 않기 위해). */
  readonly complete: boolean;
}

export function readingRouteTime(route: ReadingRoute): ReadingRouteTime {
  let minutes = 0;
  let complete = true;
  for (const step of route.steps) {
    if (step.optional) continue;
    const stepMinutes = readingStepMinutes(step);
    if (stepMinutes === undefined) complete = false;
    else minutes += stepMinutes;
  }
  return { minutes, complete };
}
