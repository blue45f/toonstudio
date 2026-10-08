import type { EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 경쟁·참고 제품 지도의 행을 만드는 공용 도구(행 자료는 engineering-map-competitors-rows*.ts).
 * 영역 순서대로 모은다.
 *
 * 쓰는 규칙(저장소가 스스로 정한 선):
 * - 저장소 문서(벤치마크·ADR·플레이북·참고 카드)가 기록한 관찰만 쓴다. 경쟁 제품의 가격·점유율·최신 버전·기능 우열은 조사하지 않았으므로 쓰지 않는다.
 * - "대체·동등·우위"를 말하지 않는다(`replacementClaimAllowed: false`). 자체 평가표(Magma 동등+, 3D 매트릭스 ‘O’)는 근거로 쓰지 않는다.
 * - 정량 수치(성능·번들 크기)와 마켓 수수료율(자체 설계값)은 싣지 않는다.
 * - 문서가 따로 적지 않은 것은 지어내지 않고 ‘문서에 없음·미확인’이라고 쓴다.
 */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 첫 열(영역). 같은 객체를 여러 행이 공유한다. */
export const D = {
  drawing: t("그림·페인팅", "Drawing & painting"),
  threeD: t("3D·캐릭터", "3D & characters"),
  collab: t("협업·가상공간", "Collaboration & virtual space"),
  storyboard: t("콘티·검토", "Storyboard & review"),
  design: t("디자인·문서", "Design & documents"),
  publishing: t("웹툰 유통·생태계", "Webtoon publishing & ecosystem"),
  ai: t("AI·에이전트", "AI & agents"),
  engines: t("엔진·표준", "Engines & standards"),
} as const;

export interface RowSource {
  readonly id: string;
  readonly name: string;
  readonly domain: LocalizedText;
  /** 공식 주소. 링크 레지스트리(engineering-external-links.ts)나 접속 점검을 통과한 주소만 쓴다. */
  readonly url?: string;
  /** 공식 사이트 홈이 아니라 문서·저장소 페이지를 걸 때의 링크 제목(기본은 "<이름> official site"). */
  readonly urlTitle?: string;
  readonly what: LocalizedText;
  readonly learned: LocalizedText;
  readonly overlap: LocalizedText;
  readonly evidence: readonly string[];
}

export function row(source: RowSource): EngineeringMapRow {
  return {
    id: source.id,
    name: source.name,
    cells: { domain: source.domain, what: source.what, learned: source.learned, overlap: source.overlap },
    ...(source.url ? { link: { title: source.urlTitle ?? `${source.name} official site`, url: source.url } } : {}),
    evidence: source.evidence,
  };
}

export const CREATOR = "apps/web/src/domains/creator";
export const FIELD_NOTES = "apps/web/src/domains/legal/technology/engineering-field-notes-content.ts";
export const PLAYBOOK = "apps/web/src/domains/legal/technology/engineering-playbook-content.ts";
