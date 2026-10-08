// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EngineeringDiagramView } from "./EngineeringDiagramView";
import { FIXTURE_GRAPH, FIXTURE_LAYERS, FIXTURE_SEQUENCE } from "./engineering-diagram.fixtures";
import { layoutGraph, layoutLayers, layoutSequence, textUnits, wrapText } from "./engineering-diagram-layout";
import type { EngineeringDiagram, EngineeringGraphDiagram } from "./engineering-diagram-types";
import { validateEngineeringDiagram } from "./engineering-diagram-validate";

afterEach(cleanup);

const ko = (value: { readonly ko: string }): string => value.ko;

type GraphDiagram = Extract<EngineeringDiagram, { kind: "graph" }>;
const graph = (overrides: Partial<EngineeringGraphDiagram>): GraphDiagram => ({ ...(FIXTURE_GRAPH as GraphDiagram), ...overrides });

describe("도식 텍스트 계산", () => {
  it("한글은 1em, 영문은 더 좁게 계산한다", () => {
    expect(textUnits("가나다")).toBe(3);
    expect(textUnits("abc")).toBeLessThan(3);
    expect(textUnits("ABC")).toBeGreaterThan(textUnits("abc"));
  });

  it("폭을 넘는 문장은 줄을 나누고 최대 줄 수를 넘으면 말줄임표를 붙인다", () => {
    const lines = wrapText("브라우저 안에서 작업을 끝까지 지키는 방법", 17, 120, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.at(-1)).toMatch(/…$/u);
    expect(wrapText("짧다", 17, 200, 2)).toEqual(["짧다"]);
    expect(wrapText("   ", 17, 200, 2)).toEqual([]);
  });

  it("공백 없는 식별자는 구두점 뒤에서 끊는다", () => {
    expect(wrapText("storage.googleapis.com", 13, 120, 2)).toEqual(["storage.", "googleapis.com"]);
    expect(wrapText("studio-direct-v1-channel", 13, 100, 2)[0]).toBe("studio-direct-");
  });

  it("영문은 단어 경계에서 줄을 나눈다", () => {
    const lines = wrapText("Dedicated Worker pool", 13, 90, 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toContain("Worker");
    expect(lines.every((line) => !line.startsWith(" "))).toBe(true);
  });
});

describe("도식 명세 검증", () => {
  it("기준 도식 세 종류는 문제가 없다", () => {
    expect(validateEngineeringDiagram(FIXTURE_GRAPH)).toEqual([]);
    expect(validateEngineeringDiagram(FIXTURE_SEQUENCE)).toEqual([]);
    expect(validateEngineeringDiagram(FIXTURE_LAYERS)).toEqual([]);
  });

  it("같은 칸을 쓰거나 없는 노드를 가리키면 알려준다", () => {
    const overlapping = graph({
      nodes: [
        { id: "a", label: { ko: "가", en: "A" }, at: [0, 0] },
        { id: "b", label: { ko: "나", en: "B" }, at: [0, 0] },
      ],
      edges: [{ from: "a", to: "zzz" }],
      groups: undefined,
    });
    const problems = validateEngineeringDiagram(overlapping);
    expect(problems.some((problem) => problem.includes("함께 씁니다"))).toBe(true);
    expect(problems.some((problem) => problem.includes("to zzz"))).toBe(true);
  });

  it("라벨이 너무 길거나 영어가 비어 있으면 알려준다", () => {
    const wordy = graph({
      nodes: [
        { id: "a", label: { ko: "아주아주아주아주 긴 라벨입니다", en: "" }, at: [0, 0] },
        { id: "b", label: { ko: "나", en: "B" }, at: [1, 0] },
      ],
      edges: [{ from: "a", to: "b" }],
      groups: undefined,
    });
    const problems = validateEngineeringDiagram(wordy);
    expect(problems.some((problem) => problem.includes("영어가 비어"))).toBe(true);
    expect(problems.some((problem) => problem.includes("한국어") && problem.includes("em >"))).toBe(true);
  });

  it("간선이 다른 노드를 피할 수 없으면 격자 조정을 요구한다", () => {
    const blocked = graph({
      nodes: [
        { id: "a", label: { ko: "가", en: "A" }, at: [0, 0] },
        { id: "b", label: { ko: "나", en: "B" }, at: [1, 0] },
        { id: "c", label: { ko: "다", en: "C" }, at: [0, 1] },
        { id: "e", label: { ko: "라", en: "E" }, at: [1, 1] },
        { id: "d", label: { ko: "마", en: "D" }, at: [2, 2] },
      ],
      edges: [
        { from: "a", to: "d" },
        { from: "b", to: "e" },
        { from: "c", to: "e" },
      ],
      groups: undefined,
    });
    expect(validateEngineeringDiagram(blocked).some((problem) => problem.includes("가로지릅니다"))).toBe(true);
  });

  it("같은 행의 떨어진 노드는 막힌 직선 대신 아래로 돌아가는 경로를 쓴다", () => {
    const layout = layoutGraph(FIXTURE_GRAPH as GraphDiagram, ko);
    const back = layout.edges.find((edge) => edge.edge.from === "sqlite" && edge.edge.to === "edit");
    expect(back).toBeDefined();
    expect(back?.points).toHaveLength(4);
    expect(back?.crossesNode).toBe(false);
    expect(layout.edges.every((edge) => !edge.crossesNode)).toBe(true);
  });
});

describe("도식 가독성 검증", () => {
  const fork = (labels: { readonly up: string; readonly down: string }): GraphDiagram =>
    graph({
      nodes: [
        { id: "src", label: { ko: "입력", en: "Input" }, at: [0, 1] },
        { id: "up", label: { ko: "위쪽", en: "Upper" }, at: [2, 0] },
        { id: "down", label: { ko: "아래쪽", en: "Lower" }, at: [2, 2] },
      ],
      edges: [
        { from: "src", to: "up", label: { ko: labels.up, en: labels.up } },
        { from: "src", to: "down", label: { ko: labels.down, en: labels.down } },
      ],
      groups: undefined,
    });

  it("같은 줄기에서 갈라지는 간선의 라벨은 서로 겹치지 않고 각자의 가지에 놓인다", () => {
    const layout = layoutGraph(fork({ up: "묶인 점", down: "짐작한 점" }), ko);
    const [first, second] = layout.edges;
    expect(first?.labelAt).toBeDefined();
    expect(second?.labelAt).toBeDefined();
    expect(first?.labelCollides).toBe(false);
    expect(second?.labelCollides).toBe(false);
    const distance = Math.hypot((first?.labelAt?.[0] ?? 0) - (second?.labelAt?.[0] ?? 0), (first?.labelAt?.[1] ?? 0) - (second?.labelAt?.[1] ?? 0));
    expect(distance).toBeGreaterThan(40);
  });

  it("글이 상자에 안 들어가 말줄임표로 잘리면 오류로 알려준다(한국어·영어 모두)", () => {
    const cutNode = graph({
      nodes: [
        { id: "a", label: { ko: "시작", en: "Start" }, at: [0, 0], shape: "pill" },
        {
          id: "d",
          label: { ko: "판단", en: "Decide" },
          sub: { ko: "아주아주 긴 판단 부제 문장입니다", en: "A very very long decision subtitle sentence" },
          at: [1, 0],
          shape: "diamond",
        },
      ],
      edges: [{ from: "a", to: "d" }],
      groups: undefined,
    });
    const problems = validateEngineeringDiagram(cutNode);
    expect(problems.some((problem) => problem.includes("부제가 상자에 안 들어가 잘립니다") && problem.includes("한국어"))).toBe(true);
    expect(problems.some((problem) => problem.includes("부제가 상자에 안 들어가 잘립니다") && problem.includes("영어"))).toBe(true);
  });

  it("시퀀스 참여자 부제는 이름이 한 줄이면 두 줄까지 들어가고 한도를 넘으면 오류가 된다", () => {
    const sequence = (sub: string): EngineeringDiagram => ({
      ...(FIXTURE_SEQUENCE as Extract<EngineeringDiagram, { kind: "sequence" }>),
      actors: [
        { id: "a", label: { ko: "브라우저", en: "Browser" }, sub: { ko: sub, en: sub } },
        { id: "b", label: { ko: "서버", en: "Server" } },
      ],
      messages: [
        { from: "a", to: "b", label: { ko: "요청", en: "Request" } },
        { from: "b", to: "a", label: { ko: "응답", en: "Response" }, style: "dashed" },
      ],
    });
    expect(validateEngineeringDiagram(sequence("Socket.IO 와 방 서버 연결"))).toEqual([]);
    // 이름이 한 줄이어도 24em 를 넘으면 두 줄에도 안 들어간다(글자 수 한도 검사가 먼저 알려준다).
    expect(validateEngineeringDiagram(sequence("아주 긴 참여자 부제가 두 줄에도 다 들어가지 않는 경우 입니다 정말로")).length).toBeGreaterThan(0);
    // 한도(25em) 안이지만 이름이 두 줄이면 부제는 한 줄만 허용되므로 잘림으로 알려준다.
    const twoLineName = sequence("두 줄 이름과 함께 쓰는 긴 부제 문장");
    const named = {
      ...twoLineName,
      actors: [{ id: "a", label: { ko: "모두 함께 쓰는 참여자", en: "Shared participant here" }, sub: { ko: "두 줄 이름과 함께 쓰는 긴 부제 문장", en: "A long subtitle sentence beside a two-line name" } }, ...(twoLineName as Extract<EngineeringDiagram, { kind: "sequence" }>).actors.slice(1)],
    } as EngineeringDiagram;
    expect(validateEngineeringDiagram(named).some((problem) => problem.includes("부제가 상자에 안 들어가"))).toBe(true);
  });
});

describe("도식 레이아웃", () => {
  it("그래프는 격자 위치를 좌표로 바꾸고 그룹 프레임이 구성원을 감싼다", () => {
    const layout = layoutGraph(FIXTURE_GRAPH as GraphDiagram, ko);
    const edit = layout.nodes.find((item) => item.node.id === "edit");
    const worker = layout.nodes.find((item) => item.node.id === "worker");
    expect(edit && worker && worker.rect.x > edit.rect.x + edit.rect.w).toBe(true);
    const group = layout.groups[0];
    expect(group).toBeDefined();
    for (const item of layout.nodes.filter((entry) => group?.group.nodeIds.includes(entry.node.id))) {
      expect(item.rect.x).toBeGreaterThan(group?.rect.x ?? Infinity);
      expect(item.rect.y).toBeGreaterThan(group?.rect.y ?? Infinity);
    }
    expect(layout.viewBox[2]).toBeGreaterThan(layout.viewBox[3]);
  });

  it("시퀀스는 참여자 수만큼 생명선을 두고 메시지에 번호를 붙인다", () => {
    const layout = layoutSequence(FIXTURE_SEQUENCE as Extract<EngineeringDiagram, { kind: "sequence" }>, ko);
    expect(layout.actors).toHaveLength(3);
    expect(layout.messages).toHaveLength(5);
    expect(layout.messages[0]?.labelLines[0]).toMatch(/^1\./u);
    expect(layout.messages.find((message) => message.self)).toBeDefined();
    const ys = layout.messages.map((message) => message.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });

  it("계층은 위에서 아래로 쌓고 괄호가 묶인 계층의 높이를 덮는다", () => {
    const layout = layoutLayers(FIXTURE_LAYERS as Extract<EngineeringDiagram, { kind: "layers" }>, ko);
    expect(layout.layers).toHaveLength(4);
    const tops = layout.layers.map((item) => item.rect.y);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    const bracket = layout.brackets[0];
    expect(bracket?.top).toBe(layout.layers[1]?.rect.y);
    expect(bracket?.bottom).toBe((layout.layers[3]?.rect.y ?? 0) + (layout.layers[3]?.rect.h ?? 0));
    expect(layout.layers[0]?.chips.map((chip) => chip.text)).toEqual(["OPFS", "Worker", "WASM"]);
  });
});

describe("EngineeringDiagramView", () => {
  it("SVG는 장식으로 숨기고 같은 내용을 목록과 캡션으로 제공한다", () => {
    const { container } = render(<EngineeringDiagramView diagram={FIXTURE_GRAPH} />);
    const figure = container.querySelector("figure.eng-dia");
    expect(figure?.getAttribute("data-kind")).toBe("graph");
    expect(figure?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText(/로컬 우선 저장 흐름/u)).toBeTruthy();
    const components = screen.getByRole("list", { name: /구성 요소|Components/u });
    expect(within(components).getAllByRole("listitem")).toHaveLength(FIXTURE_GRAPH.kind === "graph" ? FIXTURE_GRAPH.nodes.length : 0);
    expect(screen.getByRole("list", { name: /연결|Connections/u })).toBeTruthy();
    expect(container.querySelectorAll("[data-node]")).toHaveLength(6);
  });

  it("시퀀스와 계층도 순서 있는 텍스트 대체를 가진다", () => {
    const sequence = render(<EngineeringDiagramView diagram={FIXTURE_SEQUENCE} />);
    expect(within(sequence.container as HTMLElement).getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
    cleanup();
    const layers = render(<EngineeringDiagramView diagram={FIXTURE_LAYERS} showCaption={false} />);
    expect(layers.container.querySelector("figcaption")).toBeNull();
    expect(within(layers.container as HTMLElement).getAllByRole("listitem")).toHaveLength(4);
  });

  it("고정 모드와 맞춤 모드는 속성으로 구분한다", () => {
    const { container } = render(<EngineeringDiagramView diagram={FIXTURE_LAYERS} fixed fit="contain" />);
    const figure = container.querySelector("figure.eng-dia");
    expect(figure?.getAttribute("data-fixed")).toBe("true");
    expect(figure?.getAttribute("data-fit")).toBe("contain");
  });
});
