/**
 * 키트 manifest v2(`toonstudio.character-kit/2`) 스키마·정합성 규칙(레시피 v3, 2026-10-23 CORE-1).
 * 유효한 합성 v2 키트(testing/kit-v2-fixtures.ts)에서 출발해 규칙 하나씩 어기고, 그 규칙의 한글 사유가 나오는지 본다.
 */
import { describe, expect, it } from "vitest";

import { kitManifestJson } from "../testing/kit-fixtures";
import { kitManifestV2Json, kitV2MeshJson } from "../testing/kit-v2-fixtures";

import { KIT_BUDGET, KIT_PART_SLOT_ROLES, parseKitManifest } from "./character-kit";
import {
  KIT_V2_BUDGET,
  KIT_V2_PART_SLOT_ROLES,
  KIT_V2_SCHEMA_ID,
  KIT_V2_SLOT_LAYERS,
  kitManifestV2Schema,
  parseAnyKitManifest,
  parseKitManifestV2,
} from "./character-kit-v2";
import { ACCESSORY_ANCHORS } from "./customization";

type Node = Record<string, unknown>;

/** JSON 경로를 따라 객체를 꺼낸다(객체가 아니면 던진다 — 시험 설정 오류) */
function at(root: unknown, ...path: ReadonlyArray<string | number>): Node {
  let node: unknown = root;
  for (const key of path) node = (node as Record<string | number, unknown> | undefined)?.[key];
  if (typeof node !== "object" || node === null) throw new Error(`경로 ${path.join(".")}가 객체가 아닙니다.`);
  return node as Node;
}

function partOf(json: Node, id: string): Node {
  const part = (json.parts as Node[]).find((candidate) => candidate.id === id);
  if (part === undefined) throw new Error(`파츠 ${id}가 없습니다.`);
  return part;
}

function femaleVariant(json: Node, id: string): Node {
  return at(partOf(json, id), "variants", "female");
}

function meshesOf(variant: Node): Node[] {
  return variant.meshes as Node[];
}

function materialNameOfRole(json: Node, role: string): string {
  const found = Object.entries(at(json, "materials")).find(([, material]) => (material as Node).role === role);
  if (found === undefined) throw new Error(`역할 ${role}의 재질이 없습니다.`);
  return found[0];
}

/** v2 스키마 이슈를 "경로: 메시지" 문자열로 */
function issuesOf(json: unknown): string[] {
  const result = kitManifestV2Schema.safeParse(json);
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`);
}

function expectIssue(json: unknown, pattern: RegExp): void {
  const issues = issuesOf(json);
  expect(
    issues.some((issue) => pattern.test(issue)),
    `${pattern.source}\n${issues.join("\n") || "(이슈 없음)"}`,
  ).toBe(true);
}

describe("contracts/character-kit-v2: 키트 manifest v2", () => {
  it("합성 v2 키트(형태·채널 메시·층·강체 헤어 부속·UV1·영역 마스크)는 통과하고, 같은 옵션이면 같은 JSON이다", () => {
    const json = kitManifestV2Json();
    expect(issuesOf(json)).toEqual([]);
    expect(kitManifestV2Json()).toEqual(json);
    const parsed = parseKitManifestV2(json);
    if (!parsed.ok) throw new Error(parsed.failure.reasonKo);
    const { manifest } = parsed;
    expect(manifest.schema).toBe(KIT_V2_SCHEMA_ID);
    expect(Object.keys(manifest.bases.female?.anchors ?? {}).sort()).toEqual([...ACCESSORY_ANCHORS].sort());
    expect(manifest.bases.female?.headRegionMask?.channels).toEqual({ lip: "r", blush: "g" });
    const partOfManifest = (id: string) => manifest.parts.find((part) => part.id === id);
    expect(partOfManifest("hair/soft-bob")?.variants.female?.shapes).toEqual(["length", "volume"]);
    expect(partOfManifest("top/blazer")?.layerVariants?.female?.outer?.meshes.map((mesh) => mesh.role)).toEqual(["outer"]);
    expect(partOfManifest("top/tee")?.variants.female?.meshes.map((mesh) => mesh.material)).toEqual(["ts_top_tee", "ts_top_tee_trim"]);
    expect(partOfManifest("accessory/ribbon")?.variants.female).toMatchObject({ anchor: "hair", meshes: [{ role: "hair-accessory", skinned: false, morphs: [] }] });
    // 안구는 고정색이 아니라 sclera 채널 recolor, 칠할 채널이 없는 역할(하이라이트·치아·혀·속옷)은 fixed
    const materials = Object.values(manifest.materials);
    expect(materials.filter((material) => material.role === "eyeball")).not.toHaveLength(0);
    for (const material of materials) {
      if (material.role === "eyeball") expect(material).toMatchObject({ channel: "sclera", tint: { mode: "recolor" } });
      if (["eye-highlight", "teeth", "tongue", "underwear"].includes(material.role)) expect(material.tint.mode).toBe("fixed");
    }
  });

  it("parseAnyKitManifest는 schema로 v1·v2를 고르고, 모르는 schema는 대체 없이 kit-manifest-invalid다", () => {
    const v1 = parseAnyKitManifest(kitManifestJson());
    expect(v1.ok && v1.version).toBe(1);
    const v2 = parseAnyKitManifest(kitManifestV2Json());
    expect(v2.ok && v2.version).toBe(2);
    for (const json of [{ ...kitManifestV2Json(), schema: "toonstudio.character-kit/3" }, null, "kit", { kitId: "toonstudio-kit" }]) {
      const result = parseAnyKitManifest(json, 7);
      expect(result).toMatchObject({ ok: false, failure: { code: "kit-manifest-invalid", at: 7 } });
      if (!result.ok) expect(result.failure.reasonKo).toContain(`지원하지 않는 키트 manifest schema입니다`);
    }
  });

  it("v1 파서·역할 표는 그대로다: v1 파서는 v2 문서를, v2 파서는 v1 문서를 받지 않는다", () => {
    expect(KIT_PART_SLOT_ROLES.accessory).toEqual(["accessory"]);
    expect(KIT_V2_PART_SLOT_ROLES.accessory).toEqual(["accessory", "hair-accessory"]);
    expect(parseKitManifest(kitManifestJson()).ok).toBe(true);
    expect(parseKitManifest(kitManifestV2Json()).ok).toBe(false);
    const asV2 = parseKitManifestV2(kitManifestJson());
    expect(asV2.ok).toBe(false);
    if (!asV2.ok) expect(asV2.failure.reasonKo).toMatch(/^키트 v2 manifest 형식이 올바르지 않습니다: /u);
  });

  it("재질: 채널 있는 역할은 recolor + 허용 채널, 채널 없는 역할은 fixed + 채널 없음(안구는 sclera recolor)", () => {
    const wrongChannel = kitManifestV2Json();
    at(wrongChannel, "materials", "ts_top_tee").channel = "hair";
    expectIssue(wrongChannel, /^materials\.ts_top_tee: 재질 ts_top_tee\(역할 top\)은 recolor이고 채널이 top·top-trim·top-accent 중 하나여야 합니다/u);

    const fixedTop = kitManifestV2Json();
    at(fixedTop, "materials").ts_top_tee = { role: "top", tint: { mode: "fixed", hex: "#ffffff" }, doubleSided: false };
    expectIssue(fixedTop, /^materials\.ts_top_tee: .*recolor이고/u);

    const highlightChannel = kitManifestV2Json();
    at(highlightChannel, "materials", "ts_highlight").channel = "iris";
    expectIssue(highlightChannel, /^materials\.ts_highlight: .*고정색\(fixed\)이고 채널이 없어야 합니다/u);

    const eyeballFixed = kitManifestV2Json();
    const eyeball = materialNameOfRole(eyeballFixed, "eyeball");
    at(eyeballFixed, "materials")[eyeball] = { role: "eyeball", tint: { mode: "fixed", hex: "#f8f8fa" }, doubleSided: false };
    expectIssue(eyeballFixed, /recolor이고 채널이 sclera 중 하나여야 합니다/u);

    const upperHex = kitManifestV2Json();
    at(upperHex, "materials", "ts_highlight").tint = { mode: "fixed", hex: "#FFFFFF" };
    expectIssue(upperHex, /소문자 #rrggbb/u);

    // v1 틴트(recolor + colorKey)는 v2 재질 스키마가 받지 않는다(strict)
    const legacyTint = kitManifestV2Json();
    at(legacyTint, "materials", "ts_top_tee").tint = { mode: "recolor", colorKey: "top" };
    expect(issuesOf(legacyTint)).not.toEqual([]);
  });

  it("(파일, 역할, 채널)당 재질 1: 채널이 다르면 한 역할에 재질 여럿, 같은 채널에 둘이면 실패", () => {
    const accent = kitManifestV2Json();
    at(accent, "materials").ts_top_tee_accent = { role: "top", channel: "top-accent", tint: { mode: "recolor" }, doubleSided: false };
    meshesOf(femaleVariant(accent, "top/tee")).push(kitV2MeshJson("TS_Top_tee_Accent", "top", "ts_top_tee_accent"));
    expect(issuesOf(accent)).toEqual([]);

    const doubled = kitManifestV2Json();
    at(doubled, "materials").ts_top_tee_b = { role: "top", channel: "top", tint: { mode: "recolor" }, doubleSided: false };
    meshesOf(femaleVariant(doubled, "top/tee")).push(kitV2MeshJson("TS_Top_tee_Accent", "top", "ts_top_tee_b"));
    expectIssue(doubled, /역할 top·채널 top에 재질이 둘 이상입니다\('ts_top_tee', 'ts_top_tee_b', kit-material-multiple\)/u);

    const roleMismatch = kitManifestV2Json();
    meshesOf(femaleVariant(roleMismatch, "top/tee"))[1] = kitV2MeshJson("TS_Top_tee_Trim", "top", "ts_bottom_jeans");
    expectIssue(roleMismatch, /재질 'ts_bottom_jeans'의 역할\(bottom\)이 메시 역할\(top\)과 다릅니다/u);

    const undeclared = kitManifestV2Json();
    meshesOf(femaleVariant(undeclared, "top/tee"))[1] = kitV2MeshJson("TS_Top_tee_Trim", "top", "ts_top_tee_missing");
    expectIssue(undeclared, /재질 'ts_top_tee_missing'이 materials에 선언되지 않았습니다/u);
  });

  it("형태 키: 선언한 이름만 shape morph로 두고, 선언했으면 morph가 있어야 하며, 이름 규칙과 8개 상한을 지킨다", () => {
    const undeclared = kitManifestV2Json();
    femaleVariant(undeclared, "hair/soft-bob").shapes = ["length"];
    expectIssue(undeclared, /형태 morph shape:volume:\+의 이름이 변형 shapes에 선언되지 않았습니다/u);

    const orphan = kitManifestV2Json();
    femaleVariant(orphan, "hair/soft-bob").shapes = ["length", "volume", "curl"];
    expectIssue(orphan, /형태 curl을 선언했지만 shape:curl:± morph를 가진 메시가 없습니다/u);

    const duplicate = kitManifestV2Json();
    femaleVariant(duplicate, "hair/soft-bob").shapes = ["length", "volume", "length"];
    expectIssue(duplicate, /shapes에 같은 이름이 두 번 있습니다/u);

    const tooMany = kitManifestV2Json();
    femaleVariant(tooMany, "hair/soft-bob").shapes = Array.from({ length: KIT_V2_BUDGET.maxShapesPerVariant + 1 }, (_, index) => `s${index}`);
    expectIssue(tooMany, /^parts\.\d+\.variants\.female\.shapes: /u);

    for (const bad of ["Length", "9lives", "side_length"]) {
      const json = kitManifestV2Json();
      femaleVariant(json, "hair/soft-bob").shapes = ["length", "volume", bad];
      expectIssue(json, /형태 이름은 소문자로 시작하는/u);
    }

    const badMorph = kitManifestV2Json();
    const [first] = meshesOf(femaleVariant(badMorph, "hair/soft-bob"));
    first.morphs = [...(first.morphs as string[]), "shape:length:x"];
    expectIssue(badMorph, /morph 이름이 계약 어휘/u);
  });

  it("층 변형: top은 inner·outer, bottom은 legwear만 입고, 층 메시는 층 역할·층 접두 이름을 쓴다", () => {
    expect(KIT_V2_SLOT_LAYERS).toEqual({ top: ["inner", "outer"], bottom: ["legwear"] });

    const wrongLayer = kitManifestV2Json();
    const slacks = at(partOf(wrongLayer, "bottom/slacks"), "layerVariants", "female");
    slacks.inner = slacks.legwear;
    expectIssue(wrongLayer, /bottom\/slacks: 슬롯 bottom은 inner 층에 입을 수 없습니다\(허용: legwear\)/u);

    const wrongRole = kitManifestV2Json();
    at(partOf(wrongRole, "top/blazer"), "layerVariants", "female", "outer").meshes = [kitV2MeshJson("TS_Outer_blazer", "top", "ts_top_blazer")];
    expectIssue(wrongRole, /top\/blazer: outer에 허용되지 않는 역할 top입니다/u);
    expectIssue(wrongRole, /top\/blazer: 필수 역할 outer 메시가 없습니다/u);

    const wrongName = kitManifestV2Json();
    at(partOf(wrongName, "top/blazer"), "layerVariants", "female", "outer").meshes = [kitV2MeshJson("TS_Top_blazer", "outer", "ts_outer_blazer")];
    expectIssue(wrongName, /TS_Top_blazer: 메시 이름은 TS_Outer_blazer/u);

    const noMale = kitManifestV2Json({ male: false });
    const blazerLayers = at(partOf(noMale, "top/blazer"), "layerVariants");
    blazerLayers.male = { outer: at(blazerLayers, "female", "outer") };
    expectIssue(noMale, /top\/blazer: bases에 없는 베이스\(male\)의 변형입니다/u);
  });

  it("강체 소품: 액세서리 슬롯 변형만 skinned:false·anchor를 쓰고, 강체에는 기본 앵커가 필요하다(필수 morph는 면제)", () => {
    const noAnchor = kitManifestV2Json();
    delete femaleVariant(noAnchor, "accessory/ribbon").anchor;
    expectIssue(noAnchor, /accessory\/ribbon: 강체 소품 변형에는 기본 앵커\(anchor\)가 필요합니다/u);

    const rigidTop = kitManifestV2Json();
    meshesOf(femaleVariant(rigidTop, "top/tee"))[1].skinned = false;
    expectIssue(rigidTop, /TS_Top_tee_Trim: 강체\(skinned: false\) 메시는 액세서리 슬롯 변형에만 둘 수 있습니다/u);

    const anchoredTop = kitManifestV2Json();
    femaleVariant(anchoredTop, "top/tee").anchor = "waist";
    expectIssue(anchoredTop, /top\/tee: anchor는 액세서리 슬롯 변형에만 둘 수 있습니다/u);

    const skinnedNoMorphs = kitManifestV2Json();
    meshesOf(femaleVariant(skinnedNoMorphs, "accessory/glasses"))[0].morphs = [];
    expectIssue(skinnedNoMorphs, /TS_Accessory_glasses: 필수 morph \d+개가 없습니다/u);

    const wrongPrefix = kitManifestV2Json();
    meshesOf(femaleVariant(wrongPrefix, "accessory/ribbon"))[0].node = "TS_Accessory_ribbon";
    expectIssue(wrongPrefix, /TS_Accessory_ribbon: 메시 이름은 TS_HairAccessory_ribbon/u);

    const badAnchor = kitManifestV2Json();
    femaleVariant(badAnchor, "accessory/ribbon").anchor = "tail";
    expectIssue(badAnchor, /^parts\.\d+\.variants\.female\.anchor: /u);
  });

  it("메시 이름: <접두>_<프리셋> 뒤에는 대문자로 시작하는 채널 접미(_Trim 등)만 붙일 수 있다", () => {
    const cases: ReadonlyArray<readonly [string, boolean]> = [
      ["TS_Top_tee_Trim", true],
      ["TS_Top_tee_Accent2", true],
      ["TS_Top_tee_trim", false],
      ["TS_Top_teeTrim", false],
      ["TS_Top_hoodie_Trim", false],
    ];
    for (const [node, ok] of cases) {
      const json = kitManifestV2Json();
      meshesOf(femaleVariant(json, "top/tee"))[1].node = node;
      expect(issuesOf(json).length === 0, node).toBe(ok);
    }
  });

  it("베이스: 머리 높이 범위·앵커 어휘와 joint·영역 마스크 채널", () => {
    for (const headHeightM of [0.05, 0.6, undefined]) {
      const json = kitManifestV2Json();
      at(json, "bases", "female").headHeightM = headHeightM;
      expectIssue(json, /^bases\.female\.headHeightM: /u);
    }
    const badJoint = kitManifestV2Json();
    at(badJoint, "bases", "female", "anchors", "hair").joint = "mixamorig:Tail";
    expectIssue(badJoint, /^bases\.female\.anchors\.hair: 앵커 hair의 joint mixamorig:Tail가 skeleton\.joints에 없습니다/u);

    const badAnchorKey = kitManifestV2Json();
    at(badAnchorKey, "bases", "female", "anchors").tail = { joint: "mixamorig:Hips", offsetM: [0, 0, 0] };
    expect(issuesOf(badAnchorKey)).not.toEqual([]);

    for (const channels of [{ skin: "r" }, { lip: "x" }]) {
      const json = kitManifestV2Json();
      at(json, "bases", "female", "headRegionMask").channels = channels;
      expect(issuesOf(json), JSON.stringify(channels)).not.toEqual([]);
    }
  });

  it("UV1 메타는 패턴(양수 cm 밀도)·헤어 흐름 두 가지뿐이다", () => {
    for (const uv1 of [{ purpose: "pattern", cmPerUnit: 0 }, { purpose: "pattern" }, { purpose: "decal" }, { purpose: "hair-flow", cmPerUnit: 10 }]) {
      const json = kitManifestV2Json();
      meshesOf(femaleVariant(json, "top/tee"))[0].uv1 = uv1;
      expect(issuesOf(json), JSON.stringify(uv1)).not.toEqual([]);
    }
  });

  it("예산: budgets는 KIT_V2_BUDGET(= v1 예산 + 변형당 형태 8)의 사본이어야 한다", () => {
    expect(KIT_V2_BUDGET).toEqual({ ...KIT_BUDGET, maxShapesPerVariant: 8 });
    expect(Object.isFrozen(KIT_V2_BUDGET)).toBe(true);
    const v1Budget = kitManifestV2Json();
    v1Budget.budgets = JSON.parse(JSON.stringify(KIT_BUDGET)) as unknown;
    expectIssue(v1Budget, /^budgets: budgets는 계약 상수 KIT_V2_BUDGET의 사본과 같아야 합니다/u);
  });

  it("실패는 한글 사유의 kit-manifest-invalid이고 이슈를 다섯 개까지만 싣는다", () => {
    const json = kitManifestV2Json();
    for (const name of ["ts_top_tee", "ts_top_hoodie", "ts_top_shirt", "ts_top_blazer", "ts_top_sailor", "ts_bottom_jeans"]) at(json, "materials", name).channel = "hair";
    expect(issuesOf(json).length).toBeGreaterThanOrEqual(6);
    const parsed = parseKitManifestV2(json, 42);
    expect(parsed).toMatchObject({ ok: false, failure: { code: "kit-manifest-invalid", at: 42 } });
    if (parsed.ok) return;
    expect(parsed.failure.reasonKo).toMatch(/^키트 v2 manifest 형식이 올바르지 않습니다: materials\./u);
    expect(parsed.failure.reasonKo.split("; ")).toHaveLength(5);
  });
});
