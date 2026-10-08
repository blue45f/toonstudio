import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringStatus, LocalizedText } from "./engineering-story-content";

/**
 * 라이브러리 해설(`/about/technology/libraries`)의 데이터 계약.
 *
 * 이 페이지는 "쓰인 주요 라이브러리를 영역별로 소개하고, 그 설계와 그 라이브러리를 왜 골랐는지"를 읽기 쉽게 풀어 준다.
 * 영역마다 ① 이 영역이 답하는 질문 → ② 도식(라이브러리들이 어떻게 맞물리나) → ③ 왜 이런 설계인가 →
 * ④ 라이브러리 카드(한 줄 소개·하는 일·왜 골랐나·검토한 대안·대가·쓰는 곳·라이선스) → ⑤ 오해하기 쉬운 점 → ⑥ 더 보기 순서다.
 *
 * 사실의 정본은 코드·설치본·기술 지도(`engineering-map-open-source-rows.ts`)·ADR이다. 카드는 지도 행(`mapRowId`)과
 * 상태·라이선스가 어긋나지 않아야 하고, 설치본(`package`)의 라이선스와 같아야 한다 — 테스트가 강제한다.
 *
 * 작성 규칙 (`engineering-library-guide-content.test.ts` 가 강제한다):
 * - `paths`·`licenseSource` 는 저장소에 실제로 있어야 한다.
 * - 모든 문장은 한국어·영어 쌍이며 영어 칸에 한글을 섞지 않는다. 최상급·"유일"·"완벽" 같은 과장 표현을 쓰지 않는다.
 * - "왜 골랐나"는 서비스의 요구(브라우저 안에서 끝남·서버 비용·배포 가능한 라이선스·번들 크기·품질)와 연결해 쓴다.
 * - 상태는 코드로 확인한 현재 상태만 쓴다. 제품에 연결되지 않은 것을 `live` 로 쓰지 않는다.
 */

export type LibraryKind = "library" | "engine" | "format" | "service" | "tool";

export const LIBRARY_KIND_LABELS: Readonly<Record<LibraryKind, LocalizedText>> = {
  library: { ko: "라이브러리", en: "Library" },
  engine: { ko: "엔진", en: "Engine" },
  format: { ko: "표준·파일 형식", en: "Standard / format" },
  service: { ko: "서비스", en: "Service" },
  tool: { ko: "개발 도구", en: "Dev tool" },
};

/** 라이브러리(또는 엔진·형식·서비스·도구) 하나의 소개 카드. */
export interface LibraryCard {
  /** 소문자 kebab-case, 전체 페이지에서 고유. */
  readonly id: string;
  /** 고유명사(공백 앞뒤 없음). 예: "three-vrm", "Hokusai". */
  readonly name: string;
  readonly kind: LibraryKind;
  /** npm 패키지 이름. 있으면 설치본 `package.json` 의 license 와 `license` 가 같아야 한다. */
  readonly package?: string;
  /** 한 줄 소개 — 비전문가도 아는 말로(≤70자). */
  readonly oneLine: LocalizedText;
  /** 서비스에서 이걸로 하는 일(≤130자). */
  readonly usedFor: LocalizedText;
  /** 왜 골랐나 — 서비스 요구와 연결(≤220자). */
  readonly why: LocalizedText;
  /** 검토한 대안과 고르지 않은 이유(≤220자). 없으면 생략. */
  readonly alternatives?: LocalizedText;
  /** 대가·주의(≤170자). 번들 크기·라이선스 제한·패치·브라우저 지원 등 숨기지 않는다. */
  readonly cost: LocalizedText;
  /** 실제로 쓰이는 코드 경로(1개 이상, `경로#심볼` 가능). */
  readonly paths: readonly string[];
  /** 라이선스 표기(SPDX). 설치본이나 `licenseSource` 파일에서 직접 확인한 값. */
  readonly license: string;
  /** npm 패키지가 아닌 것(Rust crate·내장 코드 등)의 라이선스 근거 파일 경로. */
  readonly licenseSource?: string;
  readonly status: EngineeringStatus;
  /** 기술 지도(오픈소스) 행 id. 있으면 상태·라이선스가 그 행과 어긋나지 않아야 한다. */
  readonly mapRowId?: string;
  /** 더 깊게 볼 기술 도감 카드 id(실제 카드만). */
  readonly atlasIds?: readonly string[];
}

/** "왜 이런 설계인가" 한 가지. */
export interface LibraryDesignChoice {
  readonly title: LocalizedText;
  readonly body: LocalizedText;
}

export interface LibraryGuideArea {
  /** 소문자 kebab-case. 바로가기(`#id`)와 도식 id(`<id>-diagram`)의 바탕. */
  readonly id: string;
  /** 1부터 끊김 없이. */
  readonly number: number;
  /** 쉬운 제목(≤24자). */
  readonly title: LocalizedText;
  /** 이 영역이 답하는 질문(≤60자, 물음표로 끝남). */
  readonly question: LocalizedText;
  /** 한 줄 요약(≤90자). */
  readonly oneLine: LocalizedText;
  /** 쉽게 말해 — 일상 사물 비유 1~2문장. */
  readonly easy: LocalizedText;
  /** 왜 이런 설계인가 2~4개. 라이브러리 이름보다 "구조를 이렇게 나눈 이유"를 먼저. */
  readonly designWhy: readonly LibraryDesignChoice[];
  /** 이 영역의 라이브러리들이 어떻게 맞물리는지 보여 주는 도식. */
  readonly diagram: EngineeringDiagram;
  /** 3~8개. 중요한 것부터. */
  readonly libraries: readonly LibraryCard[];
  /** 오해하기 쉬운 점·확인하지 못한 항목. */
  readonly pitfall?: LocalizedText;
  /** 이 영역 전체의 대표 상태. */
  readonly status: EngineeringStatus;
  readonly atlasIds: readonly string[];
  readonly chapterIds: readonly string[];
  readonly glossaryIds: readonly string[];
}

/** 페이지 맨 위 "왜 이런 라이브러리들인가" 띠. */
export interface LibraryGuideOverview {
  /** 전체 스택을 한 장에 그린 도식(id `library-overview-diagram`). */
  readonly diagram: EngineeringDiagram;
  /** 라이브러리를 고르는 원칙 4~6개(제목 + 한두 문장). 코드·ADR로 근거를 댈 수 있는 것만. */
  readonly principles: readonly { readonly title: LocalizedText; readonly body: LocalizedText }[];
  /** 이 페이지를 읽는 법 3~4줄. */
  readonly howToRead: readonly LocalizedText[];
}
