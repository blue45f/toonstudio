import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 허브의 "한 장 흐름 도식". 제품 소개에서 시작해 큰 그림(구조·재료)을 보고, 이야기 → 원칙 → 적용 → 깊이로 내려간 뒤
 * 발표로 마무리하는 순서와, 어느 단계에서든 꺼내 쓰는 찾아보기 도구를 한 장에 그린다.
 * 번호는 발표 동선(1~5)과 같다. 큰 그림 두 페이지와 제품 소개는 번호 없는 앞 단계다.
 * 이 도식은 선언형 명세라 허브가 도식 렌더러(`EngineeringDiagramFrame`)만 가져와 그린다. 계약은 `validateEngineeringDiagram` 이 검사한다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const ENGINEERING_READING_FLOW_DIAGRAM: EngineeringDiagram = {
  id: "technology-reading-flow-diagram",
  kind: "graph",
  title: t("기술 자료를 읽는 순서", "The order to read the engineering material"),
  caption: t(
    "큰 그림으로 시작해 이야기·원칙·적용·깊이를 거쳐 발표로 끝나고, 찾아보기 도구는 어느 단계에서든 꺼내 씁니다.",
    "Start with the big picture, go through story, principles, adoption and depth, end with the talk, and reach for the look-up tools at any step.",
  ),
  alt: t(
    "제품 소개에서 시작해 큰 그림(아키텍처와 라이브러리), 1번 제작 스토리, 2번 플레이북, 3번 적용 가이드, 4번 심화 노트, 5번 발표 모드 순서로 이어집니다. 1번부터 4번은 발표의 근거이고 5번이 발표입니다. 도감·지도·용어집·참고 자료·라이선스는 찾아보기 도구로, 낯선 말이 나오는 큰 그림 단계와 질문이 나오는 발표 단계에서 점선으로 이어집니다.",
    "It starts at the product introduction, moves to the big picture (architecture and libraries), then step 1 story, step 2 playbook, step 3 guides, step 4 field notes and step 5 presentation mode (deck). Steps 1 to 4 are the evidence and step 5 is the talk. The atlas, maps, glossary, references and licenses are look-up tools, linked by dashed lines to the big-picture stage where unfamiliar terms appear and to the presentation stage where questions come up.",
  ),
  nodes: [
    { id: "intro", label: t("제품 소개", "The product"), sub: t("서비스 소개·제품 투어", "About and product tour"), tone: "neutral", shape: "pill", at: [0, 0] },
    { id: "big", label: t("큰 그림", "Big picture"), sub: t("아키텍처·라이브러리", "Architecture, libraries"), tone: "good", at: [1, 0] },
    { id: "story", label: t("1 · 제작 스토리", "1 · Story"), sub: t("왜·어떻게 만들었나", "Why and how it was built"), tone: "local", at: [2, 0] },
    { id: "playbook", label: t("2 · 플레이북", "2 · Playbook"), sub: t("설계 원칙과 결정", "Principles and decisions"), tone: "local", at: [3, 0] },
    { id: "guides", label: t("3 · 적용 가이드", "3 · Guides"), sub: t("내 서비스에 옮기기", "Adopt in your product"), tone: "local", at: [4, 0] },
    { id: "notes", label: t("4 · 심화 노트", "4 · Field notes"), sub: t("깊은 노트와 장애·교훈", "Deep notes and incidents"), tone: "local", at: [5, 0] },
    { id: "deck", label: t("5 · 발표 모드", "5 · Deck"), sub: t("같은 사실을 슬라이드로", "The same facts as slides"), tone: "edge", at: [5, 1] },
    { id: "tools", label: t("찾아보기 도구", "Look-up tools"), sub: t("도감·지도·용어집·참고·라이선스", "Atlas, maps, glossary, references, licenses"), tone: "external", at: [2, 2], span: 3 },
  ],
  edges: [
    { from: "intro", to: "big" },
    { from: "big", to: "story" },
    { from: "story", to: "playbook" },
    { from: "playbook", to: "guides" },
    { from: "guides", to: "notes" },
    { from: "notes", to: "deck" },
    { from: "tools", to: "big", style: "dashed", both: true, label: t("낯선 말이 나오면", "Unfamiliar term") },
    { from: "tools", to: "deck", style: "dashed", both: true, label: t("질문이 나오면", "A question") },
  ],
  groups: [
    { id: "evidence", label: t("발표의 근거 · 1~4", "The evidence · 1 to 4"), tone: "local", nodeIds: ["story", "playbook", "guides", "notes"] },
  ],
};
