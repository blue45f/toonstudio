import { describe, expect, it } from "vitest";

import { KraIssueList, clipForMessage } from "../kra-issues";
import { parseKraMaindoc } from "../kra-maindoc";
import { flattenKraNodes } from "../kra-nodes";
import { KRA_LIMITS } from "../kra-types";

function flatten(layersXml: string, maxIssues = 500) {
  const text = `<DOC><IMAGE name="x" width="8" height="8" colorspacename="RGBA">${layersXml}</IMAGE></DOC>`;
  const warnings = new KraIssueList(maxIssues);
  const unsupported = new KraIssueList(maxIssues);
  const result = flattenKraNodes(parseKraMaindoc(text, KRA_LIMITS).nodes, { warnings, unsupported });
  return { ...result, warnings: warnings.toArray(), unsupported: unsupported.toArray() };
}

const codes = (issues: readonly { readonly code: string }[]) => issues.map((issue) => issue.code);

describe("노드 트리 펼치기", () => {
  it("깊이 우선(위에서 아래) 순서로 번호를 매기고 부모와 깊이를 기록한다", () => {
    const { drafts } = flatten(`<layers>
      <layer name="top" nodetype="paintlayer"/>
      <layer name="grp" nodetype="grouplayer"><layers>
        <layer name="a" nodetype="paintlayer"/>
        <layer name="sub" nodetype="grouplayer"><layers><layer name="leaf" nodetype="paintlayer"/></layers></layer>
        <layer name="b" nodetype="paintlayer"/>
      </layers></layer>
      <layer name="bottom" nodetype="paintlayer"/>
    </layers>`);
    expect(drafts.map((d) => [d.index, d.name, d.parentIndex, d.depth])).toEqual([
      [0, "top", null, 0],
      [1, "grp", null, 0],
      [2, "a", 1, 1],
      [3, "sub", 1, 1],
      [4, "leaf", 3, 2],
      [5, "b", 1, 1],
      [6, "bottom", null, 0],
    ]);
  });

  it("보이는지는 자신과 모든 조상 그룹을 합쳐 effectiveVisible로 계산한다", () => {
    const { drafts } = flatten(`<layers>
      <layer name="hidden group" nodetype="grouplayer" visible="0"><layers>
        <layer name="visible child" nodetype="paintlayer" visible="1"/>
        <layer name="inner" nodetype="grouplayer" visible="1"><layers><layer name="deep" nodetype="paintlayer" visible="1"/></layers></layer>
      </layers></layer>
      <layer name="shown group" nodetype="grouplayer" visible="1"><layers>
        <layer name="hidden child" nodetype="paintlayer" visible="0"/>
        <layer name="shown child" nodetype="paintlayer" visible="1"/>
      </layers></layer>
    </layers>`);
    const byName = Object.fromEntries(drafts.map((d) => [d.name, [d.visible, d.effectiveVisible]]));
    expect(byName).toEqual({
      "hidden group": [false, false],
      "visible child": [true, false],
      inner: [true, false],
      deep: [true, false],
      "shown group": [true, true],
      "hidden child": [false, false],
      "shown child": [true, true],
    });
  });

  it("종류를 래스터·그룹·기타로 나누고 기타는 unsupported에 남긴다", () => {
    const { drafts, unsupported } = flatten(`<layers>
      <layer name="p" nodetype="paintlayer"/>
      <layer name="g" nodetype="grouplayer"/>
      <layer name="c" nodetype="clonelayer"/>
      <layer name="s" nodetype="shapelayer"/>
      <layer name="f" nodetype="adjustmentlayer"/>
      <layer name="n"/>
    </layers>`);
    expect(drafts.map((d) => d.kind)).toEqual(["raster", "group", "other", "other", "other", "other"]);
    expect(unsupported.map((u) => [u.code, u.path])).toEqual([
      ["kra-node-unsupported", "layer[2]"],
      ["kra-node-unsupported", "layer[3]"],
      ["kra-node-unsupported", "layer[4]"],
      ["kra-node-unsupported", "layer[5]"],
    ]);
    expect(unsupported[0]!.message).toContain("clonelayer");
  });

  it("마스크는 레이어에 붙여 읽고 적용하지 않음을 unsupported에 남긴다", () => {
    const { drafts, unsupported } = flatten(`<layers>
      <layer name="base" nodetype="paintlayer"><masks>
        <mask name="tm" nodetype="transparencymask" uuid="{u1}" visible="0" locked="1" filename="mask3"/>
        <mask name="sm" nodetype="selectionmask"/>
      </masks></layer>
    </layers>`);
    expect(drafts[0]!.masks).toMatchObject([
      { nodeType: "transparencymask", name: "tm", uuid: "{u1}", visible: false, locked: true, filename: "mask3" },
      { nodeType: "selectionmask", name: "sm", uuid: null, visible: true, locked: false, filename: null },
    ]);
    expect(drafts[0]!.masks[0]!.attributes["filename"]).toBe("mask3");
    expect(unsupported.map((u) => [u.code, u.scope, u.path])).toEqual([
      ["kra-mask-unsupported", "semantic", "layer[0]"],
      ["kra-mask-unsupported", "semantic", "layer[0]"],
    ]);
  });

  it("불투명도는 0~255 정수를 0~1로 환산하고 범위 밖은 가까운 끝으로 맞춘다", () => {
    const { drafts, warnings } = flatten(`<layers>
      <layer name="a" nodetype="paintlayer" opacity="255"/>
      <layer name="b" nodetype="paintlayer" opacity="0"/>
      <layer name="c" nodetype="paintlayer" opacity="128"/>
      <layer name="d" nodetype="paintlayer" opacity="127.6"/>
      <layer name="e" nodetype="paintlayer" opacity="300"/>
      <layer name="f" nodetype="paintlayer" opacity="-5"/>
      <layer name="g" nodetype="paintlayer" opacity="abc"/>
      <layer name="h" nodetype="paintlayer"/>
    </layers>`);
    expect(drafts.map((d) => d.opacityRaw)).toEqual([255, 0, 128, 128, 255, 0, 255, 255]);
    expect(drafts[2]!.opacity).toBeCloseTo(128 / 255, 10);
    expect(drafts[0]!.opacity).toBe(1);
    expect(drafts[1]!.opacity).toBe(0);
    expect(warnings.filter((w) => w.code === "kra-attribute-invalid").map((w) => w.path)).toEqual(["layer[4]", "layer[5]", "layer[6]"]);
  });

  it("불리언은 0/1이며 그 밖의 값은 기본값으로 보고 경고한다", () => {
    const { drafts, warnings } = flatten(`<layers>
      <layer name="a" nodetype="paintlayer" visible="0" locked="1" collapsed="1" intimeline="1"/>
      <layer name="b" nodetype="paintlayer" visible="maybe" locked="true"/>
      <layer name="c" nodetype="paintlayer"/>
    </layers>`);
    expect(drafts.map((d) => [d.visible, d.locked, d.collapsed, d.inTimeline])).toEqual([
      [false, true, true, true],
      [true, false, false, false],
      [true, false, false, false],
    ]);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ["kra-attribute-invalid", "layer[1]"],
      ["kra-attribute-invalid", "layer[1]"],
    ]);
  });

  it("통과(pass-through)는 그룹에서만 의미가 있다", () => {
    const { drafts } = flatten(`<layers>
      <layer name="g1" nodetype="grouplayer" passthrough="1"/>
      <layer name="g2" nodetype="grouplayer" passthrough="0"/>
      <layer name="p" nodetype="paintlayer" passthrough="1"/>
    </layers>`);
    expect(drafts.map((d) => d.passThrough)).toEqual([true, false, false]);
  });

  it("합성 연산 id는 그대로 보존하고 관찰하지 못한 id는 경고한다", () => {
    const { drafts, warnings } = flatten(`<layers>
      <layer name="a" nodetype="paintlayer" compositeop="multiply"/>
      <layer name="b" nodetype="paintlayer" compositeop="future_op_9"/>
      <layer name="c" nodetype="paintlayer"/>
    </layers>`);
    expect(drafts.map((d) => [d.compositeOp, d.compositeOpKnown])).toEqual([
      ["multiply", true],
      ["future_op_9", false],
      ["normal", true],
    ]);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([["kra-composite-op-unknown", "layer[1]"]]);
  });

  it("오프셋과 색 라벨, 색 공간 이름, 파일 이름, uuid를 읽는다", () => {
    const { drafts } = flatten(
      `<layers><layer name="a" nodetype="paintlayer" x="-12" y="34" colorlabel="3" colorspacename="RGBA16" filename="layer7" uuid="{abc}"/></layers>`,
    );
    expect(drafts[0]).toMatchObject({ offsetX: -12, offsetY: 34, colorLabel: 3, colorSpace: "RGBA16", filename: "layer7", uuid: "{abc}" });
  });

  it("원본 속성을 문서에 없는 키까지 그대로 보존한다", () => {
    const { drafts } = flatten(`<layers><layer name="a" nodetype="paintlayer" future="값" channelflags=""/></layers>`);
    expect(drafts[0]!.attributes).toMatchObject({ future: "값", channelflags: "", name: "a" });
  });

  it("읽을 수 없는 오프셋은 레이어 픽셀을 배치하지 않도록 표시한다", () => {
    const { drafts, placementInvalid, unsupported } = flatten(`<layers>
      <layer name="ok" nodetype="paintlayer" x="5" y="-5"/>
      <layer name="badx" nodetype="paintlayer" x="1.5"/>
      <layer name="huge" nodetype="paintlayer" y="99999999999"/>
      <layer name="text" nodetype="paintlayer" x="left"/>
    </layers>`);
    expect([...placementInvalid]).toEqual([1, 2, 3]);
    expect(codes(unsupported)).toEqual(["kra-layer-offset-invalid", "kra-layer-offset-invalid", "kra-layer-offset-invalid"]);
    expect(drafts.map((d) => [d.offsetX, d.offsetY])).toEqual([
      [5, -5],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it("오프셋은 ±2^31까지 받아들이고 그 밖은 거부한다", () => {
    const { drafts, placementInvalid } = flatten(`<layers>
      <layer name="a" nodetype="paintlayer" x="2147483648" y="-2147483648"/>
      <layer name="b" nodetype="paintlayer" x="2147483649"/>
      <layer name="c" nodetype="paintlayer" y="-2147483649"/>
    </layers>`);
    expect([...placementInvalid]).toEqual([1, 2]);
    expect([drafts[0]!.offsetX, drafts[0]!.offsetY]).toEqual([2_147_483_648, -2_147_483_648]);
  });

  it("색 라벨이 범위 밖이면 0으로 보고 경고한다", () => {
    const { drafts, warnings } = flatten(
      `<layers><layer name="a" nodetype="paintlayer" colorlabel="-1"/><layer name="b" nodetype="paintlayer" colorlabel="x"/><layer name="c" nodetype="paintlayer" colorlabel=""/></layers>`,
    );
    expect(drafts.map((d) => d.colorLabel)).toEqual([0, 0, 0]);
    expect(codes(warnings)).toEqual(["kra-attribute-invalid", "kra-attribute-invalid", "kra-attribute-invalid"]);
  });

  it("진단 목록은 한도에서 잘라 마지막에 생략 건수를 한 줄로 알린다", () => {
    const many = Array.from({ length: 20 }, (_, index) => `<layer name="l${index}" nodetype="paintlayer" compositeop="odd${index}"/>`).join("");
    const { warnings } = flatten(`<layers>${many}</layers>`, 5);
    expect(warnings).toHaveLength(6);
    expect(warnings.slice(0, 5).every((w) => w.code === "kra-composite-op-unknown")).toBe(true);
    expect(warnings[5]).toMatchObject({ code: "kra-issues-truncated", scope: "container" });
    expect(warnings[5]!.message).toContain("15");
  });

  it("진단 메시지에 끼우는 이름은 길이를 자른다", () => {
    const { warnings } = flatten(`<layers><layer name="a" nodetype="paintlayer" compositeop="${"x".repeat(5000)}"/></layers>`);
    expect(warnings[0]!.message.length).toBeLessThan(300);
  });
});

describe("진단 보조", () => {
  it("clipForMessage는 코드 포인트 단위로 자른다", () => {
    expect(clipForMessage("abc", 5)).toBe("abc");
    expect(clipForMessage("abcde", 5)).toBe("abcde");
    expect(clipForMessage("abcdef", 5)).toBe("abcde…");
    expect(clipForMessage("😀".repeat(10), 3)).toBe("😀😀😀…");
  });

  it("경로가 없는 진단에는 path 키가 없다", () => {
    const list = new KraIssueList(3);
    list.add("metadata", "a", "m");
    list.add("metadata", "b", "m", "p");
    expect(list.toArray()).toEqual([
      { scope: "metadata", code: "a", message: "m" },
      { scope: "metadata", code: "b", message: "m", path: "p" },
    ]);
    expect("path" in list.toArray()[0]!).toBe(false);
  });

  it("toArray는 호출할 때마다 새 배열이다", () => {
    const list = new KraIssueList(3);
    list.add("metadata", "a", "m");
    expect(list.toArray()).not.toBe(list.toArray());
  });
});
