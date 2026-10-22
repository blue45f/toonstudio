import { describe, expect, it } from "vitest";

import {
  analyzeTabTraversal,
  auditAccessibilityTree,
  axeExemptionKey,
  axeTargetKey,
  classifyFocusIndicator,
  colorAlpha,
  compareTraversalDirections,
  describeAxeViolation,
  isMeaninglessAccessibleName,
  NAME_ROLE_AXE_RULES,
  normalizeAccessibleName,
  STUDIO_EDITOR_AXE_EXEMPTIONS,
  summarizeAxeViolations,
  type AxNodeLike,
  type TabStopRecord,
} from "./studio-editor-a11y-audit";

interface NodeSpec {
  readonly id: string;
  readonly role: string;
  readonly name?: string;
  readonly parent?: string;
  readonly ignored?: boolean;
  readonly value?: string;
  readonly props?: Readonly<Record<string, unknown>>;
}

function node(spec: NodeSpec): AxNodeLike {
  return {
    nodeId: spec.id,
    ignored: spec.ignored ?? false,
    role: { type: "role", value: spec.role },
    name: { type: "computedString", value: spec.name ?? "" },
    ...(spec.value === undefined ? {} : { value: { type: "string", value: spec.value } }),
    properties: Object.entries(spec.props ?? {}).map(([name, value]) => ({ name, value: { type: "boolean", value } })),
    ...(spec.parent === undefined ? {} : { parentId: spec.parent }),
    backendDOMNodeId: Number(spec.id.replace(/\D/gu, "")) || 0,
  };
}

function kinds(nodes: readonly AxNodeLike[]): string[] {
  return auditAccessibilityTree(nodes).map((finding) => `${finding.kind}:${finding.role}`);
}

describe("접근성 이름 정규화와 무의미한 이름 판정", () => {
  it("공백과 제로폭 문자를 정리한다", () => {
    expect(normalizeAccessibleName("  레이어 ​ 필터\n")).toBe("레이어 필터");
  });

  it.each(["", "   ", "​", "button", "버튼", "Icon", "아이콘", "img", "undefined", "×", "…", "—", "studio.assetMenu.upload", "icon.png", "https://x.test/a"])(
    "무의미한 이름 %j 을 잡는다",
    (name) => {
      expect(isMeaninglessAccessibleName(name)).toBe(true);
    },
  );

  it.each(["닫기", "에셋 위쪽 크기 조절", "1페이지", "A", "펜 (B)", "AI 도우미", "작업 내역 1단계", "이미지", "텍스트"])(
    "정상 이름 %j 은 통과시킨다",
    (name) => {
      expect(isMeaninglessAccessibleName(name)).toBe(false);
    },
  );
});

describe("auditAccessibilityTree — 이름", () => {
  it("이름이 없는 버튼·입력·탭·슬라이더를 모두 잡는다", () => {
    const nodes = [
      node({ id: "1", role: "button" }),
      node({ id: "2", role: "textbox" }),
      node({ id: "3", role: "tablist" }),
      node({ id: "4", role: "tab", parent: "3", props: { selected: false } }),
      node({ id: "5", role: "slider", value: "50" }),
      node({ id: "6", role: "checkbox", props: { checked: false } }),
    ];
    expect(kinds(nodes)).toEqual([
      "name-missing:button",
      "name-missing:textbox",
      "name-missing:tab",
      "name-missing:slider",
      "name-missing:checkbox",
    ]);
  });

  it("접근성 트리에서 무시된 노드는 화면 낭독기가 보지 못하므로 판정하지 않는다", () => {
    expect(kinds([node({ id: "1", role: "button", ignored: true })])).toEqual([]);
  });

  it("이름이 있어도 번역 키·기호뿐이면 무의미한 이름으로 잡는다", () => {
    const nodes = [
      node({ id: "1", role: "button", name: "studio.canvas.close" }),
      node({ id: "2", role: "button", name: "×" }),
      node({ id: "3", role: "button", name: "닫기" }),
    ];
    expect(kinds(nodes)).toEqual(["name-meaningless:button", "name-meaningless:button"]);
  });

  it("이름이 필요 없는 역할(generic·group·heading)은 건드리지 않는다", () => {
    const nodes = [
      node({ id: "1", role: "generic" }),
      node({ id: "2", role: "group" }),
      node({ id: "3", role: "heading" }),
      node({ id: "4", role: "StaticText" }),
    ];
    expect(kinds(nodes)).toEqual([]);
  });
});

describe("auditAccessibilityTree — 역할 구조", () => {
  it("tablist 안의 tab 은 래퍼(generic)를 건너뛰어도 통과한다", () => {
    const nodes = [
      node({ id: "1", role: "tablist", name: "작업 모드" }),
      node({ id: "2", role: "generic", parent: "1" }),
      node({ id: "3", role: "tab", name: "전체", parent: "2", props: { selected: true } }),
    ];
    expect(kinds(nodes)).toEqual([]);
  });

  it("tablist 밖의 tab 과 selected 상태가 없는 tab 을 잡는다", () => {
    const nodes = [
      node({ id: "1", role: "toolbar", name: "도구" }),
      node({ id: "2", role: "tab", name: "전체", parent: "1" }),
    ];
    expect(kinds(nodes)).toEqual(["tab-outside-tablist:tab", "tab-selected-state-missing:tab"]);
  });

  it("menu·menubar 안의 menuitem 은 group 을 건너뛰어 통과하고, 그 밖은 잡는다", () => {
    const nodes = [
      node({ id: "1", role: "menubar", name: "메인 메뉴" }),
      node({ id: "2", role: "menuitem", name: "파일", parent: "1" }),
      node({ id: "3", role: "menu", name: "창 배치" }),
      node({ id: "4", role: "group", name: "빠른 크기", parent: "3" }),
      node({ id: "5", role: "menuitem", name: "최소", parent: "4" }),
      node({ id: "6", role: "toolbar", name: "도구" }),
      node({ id: "7", role: "menuitem", name: "엉뚱한 곳", parent: "6" }),
    ];
    expect(kinds(nodes)).toEqual(["menuitem-outside-menu:menuitem"]);
  });

  it("listbox 밖의 option 을 잡는다", () => {
    const nodes = [
      node({ id: "1", role: "listbox", name: "언어" }),
      node({ id: "2", role: "option", name: "한국어", parent: "1" }),
      node({ id: "3", role: "group", name: "묶음" }),
      node({ id: "4", role: "option", name: "고아", parent: "3" }),
    ];
    expect(kinds(nodes)).toEqual(["option-outside-listbox:option"]);
  });

  it("값이 없는 슬라이더·스핀버튼과 선택 상태가 없는 체크박스를 잡는다", () => {
    const nodes = [
      node({ id: "1", role: "slider", name: "굵기" }),
      node({ id: "2", role: "slider", name: "투명도", value: "40" }),
      node({ id: "3", role: "spinbutton", name: "각도", props: { valuetext: "45도" } }),
      node({ id: "4", role: "checkbox", name: "잠금" }),
      node({ id: "5", role: "switch", name: "자동 저장", props: { checked: true } }),
    ];
    expect(kinds(nodes)).toEqual(["value-missing:slider", "checked-state-missing:checkbox"]);
  });
});

describe("colorAlpha", () => {
  it.each([
    ["rgb(179, 155, 255)", 1],
    ["rgba(151, 121, 255, 0.16)", 0.16],
    ["rgba(0, 0, 0, 0)", 0],
    ["transparent", 0],
    ["oklch(0.72 0.18 45 / 0.12)", 0.12],
    ["oklch(0.72 0.18 45 / 50%)", 0.5],
    ["oklch(0.72 0.18 45)", 1],
    ["", 0],
  ])("%j 의 알파는 %d", (color, alpha) => {
    expect(colorAlpha(color)).toBeCloseTo(alpha, 5);
  });
});

describe("classifyFocusIndicator", () => {
  const base = { outlineStyle: "none", outlineWidth: "0px", outlineColor: "rgb(241, 244, 255)", boxShadow: "none" };

  it("2px 실선 윤곽선은 윤곽선 표시다(편집기 버튼에서 실제로 관측된 값)", () => {
    expect(
      classifyFocusIndicator({ ...base, outlineStyle: "solid", outlineWidth: "2px", outlineColor: "rgb(179, 155, 255)" }),
    ).toBe("outline");
  });

  it("두께 0px 윤곽선은 표시가 아니다(summary 에서 실제로 관측된 값)", () => {
    expect(
      classifyFocusIndicator({ ...base, outlineStyle: "solid", outlineWidth: "0px", outlineColor: "rgb(241, 244, 255)" }),
    ).toBe("none");
  });

  it("투명한 윤곽선은 표시가 아니다", () => {
    expect(
      classifyFocusIndicator({ ...base, outlineStyle: "solid", outlineWidth: "2px", outlineColor: "rgba(0, 0, 0, 0)" }),
    ).toBe("none");
  });

  it("퍼짐 2px 의 불투명한 box-shadow 는 링이다", () => {
    expect(classifyFocusIndicator({ ...base, boxShadow: "rgb(179, 155, 255) 0px 0px 0px 2px" })).toBe("ring");
    expect(
      classifyFocusIndicator({
        ...base,
        boxShadow: "rgb(0, 0, 0) 0px 0px 0px 0px, rgb(179, 155, 255) 0px 0px 0px 2px, rgba(0, 0, 0, 0) 0px 0px 0px 0px",
      }),
    ).toBe("ring");
  });

  it("옅은 링(알파 0.16)·떠 있는 카드 그림자·한쪽으로 치우친 그림자는 표시로 세지 않는다", () => {
    expect(classifyFocusIndicator({ ...base, boxShadow: "rgba(151, 121, 255, 0.16) 0px 0px 0px 3px" })).toBe("none");
    expect(classifyFocusIndicator({ ...base, boxShadow: "rgba(0, 0, 0, 0.45) 0px 10px 30px 0px" })).toBe("none");
    expect(classifyFocusIndicator({ ...base, boxShadow: "rgb(179, 155, 255) 0px 4px 0px 2px" })).toBe("none");
  });
});

describe("summarizeAxeViolations", () => {
  const nodeA = { target: [".cursor-n-resize"], html: '<button aria-label="위쪽 크기 조절">' };
  const nodeB = { target: [".real-problem"], html: "<button>작은 단추</button>" };
  const violations = [
    { id: "target-size", impact: "serious", help: "목표 크기", helpUrl: "https://x/ts", nodes: [nodeA, nodeB] },
    { id: "label", impact: "critical", help: "라벨", helpUrl: "https://x/l", nodes: [{ target: ["input"], html: "<input>" }] },
    { id: "region", impact: "moderate", help: "랜드마크", helpUrl: "https://x/r", nodes: [{ target: ["div"], html: "<div>" }] },
    { id: "aria-allowed-role", impact: "minor", help: "역할", helpUrl: "https://x/a", nodes: [{ target: ["aside"], html: "<aside>" }] },
  ];

  it("기본으로 serious·critical 위반만 남긴다", () => {
    expect(summarizeAxeViolations(violations).map((violation) => violation.id)).toEqual(["target-size", "label"]);
  });

  it("예외 키에 든 노드만 빼고 나머지 노드는 남긴다", () => {
    const summary = summarizeAxeViolations(violations, {
      exemptKeys: new Set([axeExemptionKey("target-size", nodeA.target)]),
    });
    expect(summary.find((violation) => violation.id === "target-size")?.targets).toEqual([".real-problem"]);
  });

  it("노드가 모두 예외면 위반 자체가 사라진다", () => {
    const summary = summarizeAxeViolations(
      [{ id: "target-size", impact: "serious", help: "h", helpUrl: "u", nodes: [nodeA] }],
      { exemptKeys: new Set([axeExemptionKey("target-size", nodeA.target)]) },
    );
    expect(summary).toEqual([]);
  });

  it("영향도 집합을 바꾸면 minor 위반도 볼 수 있다", () => {
    const summary = summarizeAxeViolations(violations, { impacts: new Set(["minor"]) });
    expect(summary.map((violation) => violation.id)).toEqual(["aria-allowed-role"]);
  });

  it("그림자 DOM 처럼 중첩된 target 을 한 줄로 편다", () => {
    expect(axeTargetKey([["#host", ".inner"], "button"])).toBe("#host .inner button");
  });

  it("단언 실패 메시지는 영향도·규칙·대상·도움말을 한 줄로 보여 준다", () => {
    const [summary] = summarizeAxeViolations([
      {
        id: "target-size",
        impact: "serious",
        help: "목표 크기가 24px 이상이어야 해요",
        helpUrl: "https://x/ts",
        nodes: [nodeA, nodeB],
      },
    ]);
    expect(summary).toBeDefined();
    if (summary === undefined) return;
    expect(describeAxeViolation(summary)).toBe(
      "serious target-size: .cursor-n-resize | .real-problem — 목표 크기가 24px 이상이어야 해요",
    );
  });

  it("영향도가 없는 위반은 unknown 으로 표기하고 기본 집합에서는 빠진다", () => {
    const noImpact = [{ id: "x", help: "h", helpUrl: "u", nodes: [nodeB] }];
    expect(summarizeAxeViolations(noImpact)).toEqual([]);
    const [summary] = summarizeAxeViolations(noImpact, { impacts: new Set(["unknown"]) });
    expect(summary?.impact).toBe("unknown");
  });
});

describe("문서화된 axe 예외", () => {
  it("모든 예외에 근거와 선택자가 있고 id 가 겹치지 않는다", () => {
    const ids = STUDIO_EDITOR_AXE_EXEMPTIONS.map((exemption) => exemption.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const exemption of STUDIO_EDITOR_AXE_EXEMPTIONS) {
      expect(exemption.selector.length).toBeGreaterThan(0);
      expect(exemption.reason.length).toBeGreaterThan(40);
    }
  });

  it("예외는 target-size 하나뿐이다 — 이름·역할 규칙에는 예외를 두지 않는다", () => {
    expect(STUDIO_EDITOR_AXE_EXEMPTIONS.map((exemption) => exemption.ruleId)).toEqual(["target-size"]);
    for (const exemption of STUDIO_EDITOR_AXE_EXEMPTIONS) {
      expect(NAME_ROLE_AXE_RULES).not.toContain(exemption.ruleId);
    }
  });

  it("이름·역할 규칙 목록에 중복이 없다", () => {
    expect(new Set(NAME_ROLE_AXE_RULES).size).toBe(NAME_ROLE_AXE_RULES.length);
  });
});

describe("analyzeTabTraversal", () => {
  let counter = 0;
  function stop(partial: Partial<TabStopRecord> & Pick<TabStopRecord, "region">): TabStopRecord {
    counter += 1;
    return {
      index: counter,
      key: `k${counter}`,
      tag: "button",
      role: "",
      name: `정지${counter}`,
      isDocumentBody: false,
      inViewport: true,
      indicator: "outline",
      pixelVerified: false,
      ...partial,
    };
  }
  function run(partials: readonly (Partial<TabStopRecord> & Pick<TabStopRecord, "region">)[]): TabStopRecord[] {
    counter = 0;
    return partials.map((partial) => stop(partial));
  }
  const expectation = { regionOrder: ["menubar", "tool-rail", "canvas", "inspector"] };

  it("영역을 기대 순서로 지나면 문제가 없다", () => {
    const report = analyzeTabTraversal(
      run([{ region: "menubar" }, { region: "menubar" }, { region: "tool-rail" }, { region: "canvas" }, { region: "inspector" }]),
      expectation,
    );
    expect(report.problems).toEqual([]);
    expect(report.firstIndexByRegion).toEqual({ menubar: 1, "tool-rail": 3, canvas: 4, inspector: 5 });
  });

  it("순회 도중 문서 본문으로 포커스가 떨어지면 포커스 유실이다(마지막 정지는 허용)", () => {
    const lost = analyzeTabTraversal(
      run([{ region: "menubar" }, { region: "other", isDocumentBody: true, tag: "body", name: "" }, { region: "tool-rail" }, { region: "canvas" }, { region: "inspector" }]),
      expectation,
    );
    expect(lost.problems.some((problem) => problem.startsWith("포커스 유실"))).toBe(true);

    const atEnd = analyzeTabTraversal(
      run([{ region: "menubar" }, { region: "tool-rail" }, { region: "canvas" }, { region: "inspector" }, { region: "other", isDocumentBody: true, tag: "body", name: "" }]),
      expectation,
    );
    expect(atEnd.problems).toEqual([]);
  });

  it("영역을 다 지나기 전에 같은 요소로 돌아오면 순환 함정이다", () => {
    counter = 0;
    const first = stop({ region: "menubar", key: "same" });
    const second = stop({ region: "menubar" });
    const again = stop({ region: "menubar", key: "same" });
    const report = analyzeTabTraversal([first, second, again], expectation);
    expect(report.problems.some((problem) => problem.startsWith("순환 함정"))).toBe(true);
  });

  it("기대 영역을 지나지 못하면 누락으로, 순서가 뒤집히면 순서 위반으로 알린다", () => {
    const missing = analyzeTabTraversal(run([{ region: "menubar" }, { region: "tool-rail" }]), expectation);
    expect(missing.problems).toEqual(["영역 누락: canvas 영역을 Tab 으로 지나지 못했어요.", "영역 누락: inspector 영역을 Tab 으로 지나지 못했어요."]);

    const reversed = analyzeTabTraversal(
      run([{ region: "inspector" }, { region: "canvas" }, { region: "tool-rail" }, { region: "menubar" }]),
      expectation,
    );
    expect(reversed.problems.some((problem) => problem.startsWith("영역 순서"))).toBe(true);
  });

  it("포커스 표시가 없으면 알리되, 화면 비교로 변화가 확인된 정지는 통과시킨다", () => {
    const failing = analyzeTabTraversal(
      run([{ region: "menubar", indicator: "none" }, { region: "tool-rail" }, { region: "canvas" }, { region: "inspector" }]),
      expectation,
    );
    expect(failing.problems.some((problem) => problem.startsWith("포커스 표시 없음"))).toBe(true);

    const verified = analyzeTabTraversal(
      run([{ region: "menubar", indicator: "none", pixelVerified: true }, { region: "tool-rail" }, { region: "canvas" }, { region: "inspector" }]),
      expectation,
    );
    expect(verified.problems).toEqual([]);
  });

  it("화면 밖 포커스와 이름 없는 정지를 알린다", () => {
    const report = analyzeTabTraversal(
      run([
        { region: "menubar", inViewport: false },
        { region: "tool-rail", name: "" },
        { region: "canvas" },
        { region: "inspector" },
      ]),
      expectation,
    );
    expect(report.problems.some((problem) => problem.startsWith("화면 밖 포커스"))).toBe(true);
    expect(report.problems.some((problem) => problem.startsWith("이름 없는 정지"))).toBe(true);
  });
});

describe("compareTraversalDirections", () => {
  function stops(...keys: string[]): TabStopRecord[] {
    return keys.map((key, index) => ({
      index: index + 1,
      key,
      region: "menubar",
      tag: "button",
      role: "",
      name: `단추 ${key}`,
      isDocumentBody: false,
      inViewport: true,
      indicator: "outline" as const,
      pixelVerified: false,
    }));
  }

  it("거꾸로 지난 순서가 앞으로 지난 순서를 뒤집은 것이면 문제도 목록도 없다", () => {
    const result = compareTraversalDirections(stops("a", "b", "c", "d"), stops("d", "c", "b", "a"));
    expect(result).toEqual({ problems: [], onlyForward: [], onlyBackward: [] });
  });

  it("한쪽에서만 닿은 요소는 목록으로만 알리고 순서 문제로 세지 않는다(상태에 따라 켜지는 단추)", () => {
    const result = compareTraversalDirections(stops("a", "b", "c"), stops("c", "x", "b", "a"));
    expect(result.problems).toEqual([]);
    expect(result.onlyBackward).toEqual([expect.stringContaining('"단추 x"')]);
    expect(result.onlyForward).toEqual([]);
  });

  it("공통 요소의 순서가 서로 거울이 아니면 순서 비대칭으로 잡는다", () => {
    const result = compareTraversalDirections(stops("a", "b", "c"), stops("c", "a", "b"));
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("순서 비대칭");
  });

  it("문서 본문 정지는 무시하고 같은 요소를 두 번 만나도 처음 만난 자리만 센다", () => {
    const bodyStop: TabStopRecord = {
      index: 3,
      key: "body",
      region: "other",
      tag: "body",
      role: "",
      name: "",
      isDocumentBody: true,
      inViewport: true,
      indicator: "outline",
      pixelVerified: false,
    };
    const forward = [...stops("a", "b"), bodyStop, ...stops("a", "c")];
    const result = compareTraversalDirections(forward, stops("c", "b", "a"));
    expect(result.problems).toEqual([]);
    expect(result.onlyForward).toEqual([]);
  });
});
