/**
 * 샘플 그래프 "빗속의 우산" — 시작 하나, 장면 넷, 결말 셋, 되돌아가는 길 하나.
 * 오류 없이 읽을 수 있고, 되돌아가는 길(경고) 하나로 그 구분을 보여 준다.
 *
 * 글(제목·컷·선택지)은 번역 키로만 적고 구조(식별자, 연결)만 여기서 정한다. 키는 문자열 리터럴이라 문구 계약 시험이
 * 사전과 대조한다. 번역이 없는 언어는 영어 원문을 받는다.
 */
import type { BranchingCuttoonGraph, BranchingNodeKind } from "./model";

import type { BranchingT } from "./use-branching-t";

import "./branching-cuttoon-i18n";

interface SampleChoice {
  readonly id: string;
  readonly labelKey: string;
  readonly target: string;
}

interface SampleNode {
  readonly id: string;
  readonly kind: BranchingNodeKind;
  readonly titleKey: string;
  readonly cutIds: readonly string[];
  readonly choices: readonly SampleChoice[];
}

const SAMPLE_CUTS: ReadonlyArray<{ readonly id: string; readonly key: string }> = [
  { id: "k1", key: "branchingCuttoon.sample.cut1" },
  { id: "k2", key: "branchingCuttoon.sample.cut2" },
  { id: "k3", key: "branchingCuttoon.sample.cut3" },
  { id: "k4", key: "branchingCuttoon.sample.cut4" },
  { id: "k5", key: "branchingCuttoon.sample.cut5" },
  { id: "k6", key: "branchingCuttoon.sample.cut6" },
  { id: "k7", key: "branchingCuttoon.sample.cut7" },
  { id: "k8", key: "branchingCuttoon.sample.cut8" },
  { id: "k9", key: "branchingCuttoon.sample.cut9" },
  { id: "k10", key: "branchingCuttoon.sample.cut10" },
  { id: "k11", key: "branchingCuttoon.sample.cut11" },
  { id: "k12", key: "branchingCuttoon.sample.cut12" },
];

const SAMPLE_NODES: readonly SampleNode[] = [
  {
    id: "rain",
    kind: "start",
    titleKey: "branchingCuttoon.sample.nodeRain",
    cutIds: ["k1", "k2", "k3"],
    choices: [
      { id: "c1", labelKey: "branchingCuttoon.sample.choiceRainShare", target: "share" },
      { id: "c2", labelKey: "branchingCuttoon.sample.choiceRainIgnore", target: "ignore" },
    ],
  },
  {
    id: "share",
    kind: "scene",
    titleKey: "branchingCuttoon.sample.nodeShare",
    cutIds: ["k4", "k5"],
    choices: [
      { id: "c1", labelKey: "branchingCuttoon.sample.choiceShareKey", target: "key" },
      { id: "c2", labelKey: "branchingCuttoon.sample.choiceShareWalk", target: "walk" },
    ],
  },
  {
    id: "ignore",
    kind: "scene",
    titleKey: "branchingCuttoon.sample.nodeIgnore",
    cutIds: ["k6", "k7"],
    choices: [
      // 앞선 장면(시작)으로 돌아가는 길: 검증기가 "되돌아가는 길" 경고로 알린다.
      { id: "c1", labelKey: "branchingCuttoon.sample.choiceIgnoreBack", target: "rain" },
      { id: "c2", labelKey: "branchingCuttoon.sample.choiceIgnoreHome", target: "endHome" },
    ],
  },
  {
    id: "key",
    kind: "scene",
    titleKey: "branchingCuttoon.sample.nodeKey",
    cutIds: ["k8"],
    choices: [
      { id: "c1", labelKey: "branchingCuttoon.sample.choiceKeyLocker", target: "endLocker" },
      { id: "c2", labelKey: "branchingCuttoon.sample.choiceKeyReturn", target: "walk" },
    ],
  },
  {
    id: "walk",
    kind: "scene",
    titleKey: "branchingCuttoon.sample.nodeWalk",
    cutIds: ["k9"],
    choices: [{ id: "c1", labelKey: "branchingCuttoon.sample.choiceWalkEnd", target: "endWalk" }],
  },
  { id: "endLocker", kind: "ending", titleKey: "branchingCuttoon.sample.nodeEndLocker", cutIds: ["k10"], choices: [] },
  { id: "endWalk", kind: "ending", titleKey: "branchingCuttoon.sample.nodeEndWalk", cutIds: ["k11"], choices: [] },
  { id: "endHome", kind: "ending", titleKey: "branchingCuttoon.sample.nodeEndHome", cutIds: ["k12"], choices: [] },
];

/** 샘플 그래프를 현재 언어의 글로 만든다. 호출할 때마다 새 객체를 돌려준다. */
export function createSampleBranchingGraph(t: BranchingT): BranchingCuttoonGraph {
  return {
    title: t("branchingCuttoon.sample.graphTitle"),
    startNodeId: "rain",
    cuts: SAMPLE_CUTS.map((cut) => ({ id: cut.id, caption: t(cut.key) })),
    nodes: SAMPLE_NODES.map((node) => ({
      id: node.id,
      kind: node.kind,
      title: t(node.titleKey),
      cutIds: [...node.cutIds],
      choices: node.choices.map((choice) => ({ id: choice.id, label: t(choice.labelKey), targetNodeId: choice.target })),
    })),
  };
}
