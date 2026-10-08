import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringStatus, LocalizedText } from "./engineering-story-content";

/**
 * 기술 지도(Map)의 데이터 계약.
 *
 * 도감 카드가 "기술 하나"를 깊게 설명한다면, 지도는 같은 종류의 대상을 **한 표로 비교**한다:
 * 무료로 세운 서비스, 오픈소스, Open API, 경쟁·참고 제품, AI 활용 개발 도구.
 * 발표 슬라이드(`table` 레이아웃)와 도감 페이지의 "지도" 구역이 같은 데이터를 쓴다.
 *
 * 작성 규칙 (테스트가 강제한다):
 * - 모든 `evidence` 경로는 저장소에 실제로 있어야 한다. 링크는 https 공식 주소만, 지어내지 않는다.
 * - 공급자의 무료 한도·가격 같은 **외부 수치는 저장소 문서·코드에 기록된 값만** 쓰고 `asOf` 날짜를 붙인다.
 *   기록이 없으면 수치를 쓰지 않고 공식 링크만 둔다.
 * - 경쟁·참고 제품은 저장소 문서에 기록된 관찰만 쓴다(문서에 없는 경쟁사 사실을 만들지 않는다).
 * - 비밀값·실제 계정·키는 넣지 않는다(환경변수는 이름만).
 */

export type EngineeringMapId = "free-tier" | "open-source" | "open-api" | "competitors" | "ai-dev";

export interface EngineeringMapColumn {
  readonly id: string;
  readonly label: LocalizedText;
  /** 표에서 좁게 보여줄 열(상태·라이선스 같은 짧은 값). */
  readonly narrow?: boolean;
}

export interface EngineeringMapLink {
  readonly title: string;
  readonly url: string;
}

export interface EngineeringMapRow {
  /** 소문자 kebab-case 고유 id(앵커 `#map-<mapId>-<id>`). */
  readonly id: string;
  /** 이름(고유명사). 첫 열에 굵게 보인다. */
  readonly name: string;
  /** 열 id → 값. 열 정의에 없는 키는 허용하지 않는다. 고유명사·값이 같으면 ko/en 에 같은 문자열을 쓴다. */
  readonly cells: Readonly<Record<string, LocalizedText>>;
  readonly status?: EngineeringStatus;
  /** 공식 링크(있으면 이름이 링크가 된다). */
  readonly link?: EngineeringMapLink;
  /** 이 행을 뒷받침하는 저장소 경로(문서·코드). */
  readonly evidence: readonly string[];
  /** 같은 대상을 깊게 설명하는 기술 도감 카드 id. */
  readonly atlasIds?: readonly string[];
  /** 외부 수치·사실을 확인한 날짜(YYYY-MM-DD). */
  readonly asOf?: string;
}

export interface EngineeringMap {
  readonly id: EngineeringMapId;
  readonly title: LocalizedText;
  /** 이 지도가 답하는 질문을 한두 문장으로(쉬운 말). */
  readonly intro: LocalizedText;
  /** 발표에서 말할 한 줄 결론. */
  readonly takeaway: LocalizedText;
  readonly columns: readonly EngineeringMapColumn[];
  readonly rows: readonly EngineeringMapRow[];
  /** 큰 그림 도식(선택 권장). */
  readonly diagram?: EngineeringDiagram;
  /** 읽는 법·주의(선택): 예: "무료 한도는 공급자가 바꿀 수 있으니 날짜를 함께 봅니다." */
  readonly notes?: readonly LocalizedText[];
  readonly reviewedAt: string;
}

export const ENGINEERING_MAP_IDS: readonly EngineeringMapId[] = ["free-tier", "open-source", "open-api", "competitors", "ai-dev"];
