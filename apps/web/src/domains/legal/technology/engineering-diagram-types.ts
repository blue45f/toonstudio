import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 자료 도식의 데이터 계약.
 *
 * 도식은 손으로 그린 SVG가 아니라 이 명세로 선언하고, 하나의 렌더러(EngineeringDiagramView)가 그린다.
 * 같은 명세가 기술 도감 카드·발표 슬라이드·인쇄본에서 그대로 쓰이며, 좁은 화면에서는 같은 내용을 목록으로 보여준다.
 *
 * 작성 규칙 (테스트가 강제한다):
 * - 라벨은 짧게. 글자 수가 아니라 화면 폭(em: 한글 1em, 영문 약 0.56em)으로 잰다.
 *   노드 `label` 13em·`sub` 25em·간선 라벨 10em 이내(한글 약 13자/25자/10자, 영문 약 24자/45자/18자).
 * - 격자는 `graph`에서 최대 6열 × 5행, 노드는 12개 이하. 두 노드가 같은 칸을 쓰지 않는다.
 * - 모든 간선은 존재하는 노드를 가리키고, 모든 문자열은 ko/en 둘 다 채운다.
 * - 도식은 "어떻게 흐르는가/누가 소유하는가"를 보여준다. 장식용 박스 나열은 쓰지 않는다.
 *
 * 종류:
 * - `graph`    격자 위에 노드를 놓고 화살표로 잇는다. 파이프라인·상태 전이·의사결정·허브-스포크 모두 이것으로 그린다.
 * - `sequence` 참여자 열과 위에서 아래로 흐르는 메시지. 시그널링·인증·요청 흐름에 쓴다.
 * - `layers`   위에서 아래로 쌓인 계층. 저장소 계층·무료 계층 지도·렌더 스택에 쓴다.
 */

export type EngineeringDiagramTone =
  | "neutral"
  /** 사용자 기기에서 일어나는 일 */
  | "local"
  /** Cloudflare 같은 엣지·전달 계층 */
  | "edge"
  /** 서버·원장·데이터베이스 */
  | "server"
  /** 외부 서비스·공급자·제3자 API */
  | "external"
  /** AI·모델·추론 */
  | "ai"
  | "good"
  | "warn";

export type EngineeringDiagramShape = "box" | "pill" | "cylinder" | "diamond" | "cloud";

export interface EngineeringDiagramNode {
  readonly id: string;
  readonly label: LocalizedText;
  /** 기술 이름·수치 같은 작은 보조 문구. */
  readonly sub?: LocalizedText;
  readonly tone?: EngineeringDiagramTone;
  /** 기본 `box`. 저장소는 `cylinder`, 판단은 `diamond`, 외부는 `cloud`, 시작·끝은 `pill`. */
  readonly shape?: EngineeringDiagramShape;
  /** 격자 위치 `[열, 행]`(0부터). */
  readonly at: readonly [number, number];
  /** 가로로 차지하는 칸 수(기본 1). */
  readonly span?: number;
}

export interface EngineeringDiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: LocalizedText;
  readonly style?: "solid" | "dashed";
  /** 양방향 화살표. */
  readonly both?: boolean;
}

/** 점선 프레임으로 묶는 영역. 예: "사용자 기기", "Cloudflare 엣지". 묶인 노드는 인접한 격자에 둔다. */
export interface EngineeringDiagramGroup {
  readonly id: string;
  readonly label: LocalizedText;
  readonly nodeIds: readonly string[];
  readonly tone?: EngineeringDiagramTone;
}

export interface EngineeringGraphDiagram {
  readonly kind: "graph";
  readonly nodes: readonly EngineeringDiagramNode[];
  readonly edges: readonly EngineeringDiagramEdge[];
  readonly groups?: readonly EngineeringDiagramGroup[];
}

export interface EngineeringSequenceActor {
  readonly id: string;
  readonly label: LocalizedText;
  readonly sub?: LocalizedText;
  readonly tone?: EngineeringDiagramTone;
}

export interface EngineeringSequenceMessage {
  readonly from: string;
  /** `from`과 같으면 자기 호출(자기 안에서 처리)로 그린다. */
  readonly to: string;
  readonly label: LocalizedText;
  /** 점선은 응답·비동기 알림. */
  readonly style?: "solid" | "dashed";
  /** 메시지 오른쪽에 붙는 짧은 설명(선택). */
  readonly note?: LocalizedText;
}

export interface EngineeringSequenceDiagram {
  readonly kind: "sequence";
  readonly actors: readonly EngineeringSequenceActor[];
  readonly messages: readonly EngineeringSequenceMessage[];
}

export interface EngineeringDiagramLayer {
  readonly id: string;
  readonly label: LocalizedText;
  readonly sub?: LocalizedText;
  readonly tone?: EngineeringDiagramTone;
  /** 계층 안에 칩으로 보여줄 기술 이름. */
  readonly chips?: readonly string[];
}

export interface EngineeringLayersDiagram {
  readonly kind: "layers";
  /** 위에서 아래 순서. */
  readonly layers: readonly EngineeringDiagramLayer[];
  /** 오른쪽 괄호 주석: 어느 계층들이 한 묶음인지(선택). */
  readonly brackets?: readonly { readonly label: LocalizedText; readonly layerIds: readonly string[] }[];
}

export type EngineeringDiagramBody = EngineeringGraphDiagram | EngineeringSequenceDiagram | EngineeringLayersDiagram;

export type EngineeringDiagram = EngineeringDiagramBody & {
  /** 소문자 kebab-case 고유 id. */
  readonly id: string;
  readonly title: LocalizedText;
  /** 도식이 말하는 핵심을 한 문장으로. */
  readonly caption: LocalizedText;
  /** 스크린 리더용 대체 설명: 도식을 말로 풀어 쓴 2~3문장. */
  readonly alt: LocalizedText;
};

/** 한 줄 폭은 em(글자 크기 배수)으로 잰다. 한글 1글자 = 1em. */
export const ENGINEERING_DIAGRAM_LIMITS = {
  graphColumns: 6,
  graphRows: 5,
  graphNodes: 12,
  nodeLabelEm: 13,
  nodeSubEm: 25,
  edgeLabelEm: 10,
  messageLabelEm: 27,
  messageNoteEm: 34,
  layerLabelEm: 22,
  layerSubEm: 44,
  groupLabelEm: 20,
  bracketLabelEm: 28,
  sequenceActors: 5,
  sequenceMessages: 12,
  layers: 7,
} as const;
