import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringStatus, LocalizedText } from "./engineering-story-content";

/**
 * 아키텍처 해설(`/about/technology/architecture`)의 데이터 계약.
 *
 * 이 페이지는 "구조를 한눈에 이해하고, 필요한 배경 지식을 쉬운 한글로 읽고, 더 깊은 근거로 내려가는 길"이다.
 * 구간마다 같은 순서로 ① 도식 → ② 한 줄 요약·쉬운 비유 → ③ 흐름 단계 → ④ 배경 지식 → ⑤ 서비스에서 쓰인 곳(파일) →
 * ⑥ 선택과 대가 → ⑦ 오해하기 쉬운 점 → ⑧ 더 보기(도감·챕터·용어)를 담는다.
 *
 * 작성 규칙 (`engineering-architecture-guide-content.test.ts` 가 강제한다):
 * - 모든 `inService[].paths`·`facts[].source` 는 저장소에 실제로 있어야 한다.
 * - 도식은 선언형 도식(`graph`/`sequence`/`layers`)이며 `validateEngineeringDiagram` 을 통과해야 한다.
 * - `atlasIds`·`chapterIds`·`glossaryIds` 는 실제로 있는 것만 쓴다(없으면 링크가 조용히 사라지므로 테스트가 막는다).
 * - 상태(`status`)는 코드·설정으로 확인한 현재 상태만 쓴다. 과장하지 않는다.
 * - 모든 문장은 한국어·영어 쌍이며 영어 칸에 한글을 섞지 않는다.
 */

export type ArchitectureGuideGroupId = "runtime" | "delivery";

export interface ArchitectureGuideGroup {
  readonly id: ArchitectureGuideGroupId;
  readonly label: LocalizedText;
  /** 이 묶음이 답하는 질문 한 줄. */
  readonly hint: LocalizedText;
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const ARCHITECTURE_GUIDE_GROUPS: readonly ArchitectureGuideGroup[] = [
  {
    id: "runtime",
    label: t("앱이 돌아가는 구조", "How the app runs"),
    hint: t("사용자가 앱을 여는 순간 어디서 무엇이 일하나", "Where does what work once a user opens the app?"),
  },
  {
    id: "delivery",
    label: t("만들고 지키는 구조", "How it is built and protected"),
    hint: t("코드가 어떻게 한 덩어리로 맞춰져 배포되고, 무엇이 품질을 지키나", "How code is kept in step, shipped and guarded"),
  },
];

/** 이 구조가 서비스의 어느 기능·코드 영역에서 어떤 일을 맡는지. */
export interface ArchitectureServiceUse {
  /** 사용자가 보는 기능 이름 또는 코드 영역 이름. */
  readonly what: LocalizedText;
  /** 그 안에서 이 구조가 맡은 일. */
  readonly role: LocalizedText;
  /** 저장소에 실제로 있는 경로(`경로#심볼` 가능). 첫 경로가 대표 근거다. */
  readonly paths: readonly string[];
}

/** 선택과 대가: 왜 이렇게 했고 무엇을 감수했나. */
export interface ArchitectureDecision {
  readonly choice: LocalizedText;
  readonly because: LocalizedText;
  readonly cost: LocalizedText;
}

export interface ArchitectureFact {
  /** 화면에 보이는 값(숫자·이름·상수). 코드·설정에서 직접 확인한 값만. */
  readonly value: string;
  readonly label: LocalizedText;
  /** 값을 확인한 저장소 경로. */
  readonly source: string;
}

export interface ArchitectureGuideSection {
  /** 소문자 kebab-case. 구간 바로가기(`#id`)와 도식 id(`<id>-diagram`)의 바탕. */
  readonly id: string;
  readonly group: ArchitectureGuideGroupId;
  /** 1부터 이어지는 번호(실행 구조 → 만들고 지키는 구조 순서로 끊김 없이). */
  readonly number: number;
  /** 쉬운 제목(비전문가가 읽어도 무슨 이야기인지 알 수 있게). */
  readonly title: LocalizedText;
  /** 이 구간이 답하는 질문. 예: "내 그림은 어디에 저장될까?" */
  readonly question: LocalizedText;
  /** 한 줄 요약(≤90자). */
  readonly oneLine: LocalizedText;
  /** 쉽게 말해 — 일상 사물 비유 1~2문장. */
  readonly easy: LocalizedText;
  readonly diagram: EngineeringDiagram;
  /** 흐름 3~6단계. 도식을 말로 따라 읽는 순서. */
  readonly steps: readonly LocalizedText[];
  /** 배경 지식 2~3문단. 첫 문단은 비전문가용, 뒤는 동작 원리와 대안. */
  readonly background: readonly LocalizedText[];
  readonly inService: readonly ArchitectureServiceUse[];
  readonly decisions: readonly ArchitectureDecision[];
  /** 오해하기 쉬운 점·확인하지 못한 항목. */
  readonly pitfall?: LocalizedText;
  readonly facts?: readonly ArchitectureFact[];
  /** 이 구간 전체의 대표 상태. */
  readonly status: EngineeringStatus;
  /** 더 깊게 보는 기술 도감 카드 id(1개 이상, 실제 카드만). */
  readonly atlasIds: readonly string[];
  /** 이어 읽는 제작 스토리 챕터 id(1개 이상, 실제 챕터만). */
  readonly chapterIds: readonly string[];
  /** 관련 용어집 항목 id(1개 이상, 실제 용어만). */
  readonly glossaryIds: readonly string[];
}

/** 페이지 맨 위 "한 장으로 보기" 띠. */
export interface ArchitectureGuideOverview {
  /** 전체를 한 장에 그린 도식. 제목·캡션·대체 텍스트 포함. */
  readonly diagram: EngineeringDiagram;
  /** 구조를 지탱하는 원칙 4~6개(제목 + 한두 문장). */
  readonly principles: readonly { readonly title: LocalizedText; readonly body: LocalizedText }[];
  /** 이 페이지를 읽는 법 3~4줄. */
  readonly howToRead: readonly LocalizedText[];
}
