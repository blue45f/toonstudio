import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HUMANOID_BONE_NAMES, PART_ROLES, QUALITY_PRESETS, RECIPE_COLOR_KEYS } from "../../contracts";

import {
  DEFAULT_KIT_PREVIEW_BACKGROUND,
  DEFAULT_KIT_PREVIEW_SIZE,
  KIT_PREVIEW_BONE_NAMES,
  KIT_PREVIEW_COLOR_KEYS,
  KIT_PREVIEW_DEFAULT_VIEW_IDS,
  KIT_PREVIEW_QUALITIES,
  KIT_PREVIEW_ROLE_NAMES,
  KIT_PREVIEW_SHADINGS,
  KIT_PREVIEW_VIEW_IDS,
  kitPreviewHelpText,
  normalizeHexColor,
  parseKitPreviewArgs,
  parseMorphAssignment,
  parsePoseJson,
} from "./cli-args";

import type { KitPreviewRequest } from "./cli-args";

function parseOk(argv: readonly string[], readText?: (path: string) => string | null): KitPreviewRequest {
  const result = parseKitPreviewArgs(argv, readText ? { readText } : {});
  if (!result.ok || result.help) throw new Error(`성공해야 하는 인자: ${JSON.stringify(result)}`);
  return result.request;
}

function parseErrors(argv: readonly string[]): readonly string[] {
  const result = parseKitPreviewArgs(argv);
  if (result.ok) throw new Error("실패해야 하는 인자였습니다.");
  return result.errors;
}

describe("cli-args 어휘는 계약과 일치한다", () => {
  it("본 이름 55개가 계약 HUMANOID_BONE_NAMES와 같은 순서다", () => {
    expect([...KIT_PREVIEW_BONE_NAMES]).toEqual([...HUMANOID_BONE_NAMES]);
  });

  it("색 키는 RECIPE_COLOR_KEYS, 품질 id는 QUALITY_PRESETS와 같다", () => {
    expect([...KIT_PREVIEW_COLOR_KEYS]).toEqual([...RECIPE_COLOR_KEYS]);
    expect([...KIT_PREVIEW_QUALITIES].sort()).toEqual(Object.keys(QUALITY_PRESETS).sort());
  });

  it("역할 어휘는 계약 PART_ROLES(키트용 underwear 포함)와 같다", () => {
    expect([...KIT_PREVIEW_ROLE_NAMES]).toEqual([...PART_ROLES]);
  });

  it("기본 뷰는 스펙의 8종이고 모두 뷰 어휘 안에 있다", () => {
    expect([...KIT_PREVIEW_DEFAULT_VIEW_IDS]).toEqual(["front", "q3", "side", "back", "face", "face-q3", "hands", "feet"]);
    for (const id of KIT_PREVIEW_DEFAULT_VIEW_IDS) expect(KIT_PREVIEW_VIEW_IDS).toContain(id);
  });

  it("leaf 모듈이다: 런타임·타입 import가 하나도 없다(Node가 그대로 import한다)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "cli-args.ts"), "utf8");
    const imports = source.split("\n").filter((line) => /^\s*(import|export\s.*\sfrom)\s/u.test(line) && !line.trim().startsWith("*") && !line.trim().startsWith("//"));
    expect(imports).toEqual([]);
  });
});

describe("parseKitPreviewArgs", () => {
  it("필수 인자만 주면 기본값이 채워진다", () => {
    const request = parseOk(["--glb", "base.glb", "--out", "out"]);
    expect(request.glbPaths).toEqual(["base.glb"]);
    expect(request.outDir).toBe("out");
    expect(request.views).toEqual([...KIT_PREVIEW_DEFAULT_VIEW_IDS]);
    expect(request.shadings).toEqual([...KIT_PREVIEW_SHADINGS]);
    expect(request.size).toBe(DEFAULT_KIT_PREVIEW_SIZE);
    expect(request.background).toBe(DEFAULT_KIT_PREVIEW_BACKGROUND);
    expect(request.transparent).toBe(false);
    expect(request.pose).toEqual({ kind: "none" });
    expect(request.morphs).toEqual([]);
    expect(request.quality).toBe("standard");
    expect(request.sheetTile).toBe(256);
    expect(request.inspectOnly).toBe(false);
    expect(request.renderer).toBe("swiftshader");
    expect(request.hairLod).toBe(0);
    expect(request.toon).toEqual({});
    expect(request.legacyMerge).toBe(false);
  });

  it("--ramp-steps·--rim·--outline은 툰 덮어쓰기로 모이고 지정하지 않은 값은 비워 둔다(소스 종류별 기본값에 맡김)", () => {
    expect(parseOk(["--glb", "a", "--out", "o", "--ramp-steps", "4", "--rim", "on", "--outline", "edge"]).toon).toEqual({ rampSteps: 4, rim: true, outline: "edge" });
    expect(parseOk(["--glb", "a", "--out", "o", "--ramp-steps=2", "--rim=off"]).toon).toEqual({ rampSteps: 2, rim: false });
    expect(parseOk(["--glb", "a", "--out", "o", "--outline", "none"]).toon).toEqual({ outline: "none" });
  });

  it("--ramp-steps·--rim·--outline 값이 어휘 밖이면 한글 오류", () => {
    expect(parseErrors(["--glb", "a", "--out", "o", "--ramp-steps", "5"]).join(" ")).toContain("--ramp-steps는 2, 3, 4");
    expect(parseErrors(["--glb", "a", "--out", "o", "--ramp-steps", "two"]).join(" ")).toContain("--ramp-steps");
    expect(parseErrors(["--glb", "a", "--out", "o", "--rim", "maybe"]).join(" ")).toContain("--rim은 on 또는 off");
    expect(parseErrors(["--glb", "a", "--out", "o", "--outline", "thick"]).join(" ")).toContain("알 수 없는 외곽선");
  });

  it("--legacy-merge는 값을 받지 않는 불리언이다", () => {
    expect(parseOk(["--glb", "a", "--out", "o", "--legacy-merge"]).legacyMerge).toBe(true);
    expect(parseErrors(["--glb", "a", "--out", "o", "--legacy-merge=1"]).join(" ")).toContain("--legacy-merge는 값을 받지 않습니다");
  });

  it("--help에 소스 경로 감지와 새 옵션이 설명돼 있다", () => {
    const help = kitPreviewHelpText();
    for (const word of ["--ramp-steps", "--rim", "--outline", "--legacy-merge", "sourceKind", "kit.json 없이", "SHA-256"]) expect(help).toContain(word);
  });

  it("--glb는 반복되고 순서가 보존된다(첫 번째 = 베이스)", () => {
    const request = parseOk(["--glb", "base.glb", "--glb", "hair.glb", "--glb=top.glb", "--out", "o"]);
    expect(request.glbPaths).toEqual(["base.glb", "hair.glb", "top.glb"]);
  });

  it("--views·--shading은 쉼표 목록과 all/both를 받고 중복을 제거한다", () => {
    expect(parseOk(["--glb", "a", "--out", "o", "--views", "front,face,front"]).views).toEqual(["front", "face"]);
    expect(parseOk(["--glb", "a", "--out", "o", "--views", "all"]).views).toEqual([...KIT_PREVIEW_VIEW_IDS]);
    expect(parseOk(["--glb", "a", "--out", "o", "--shading", "pbr"]).shadings).toEqual(["pbr"]);
    expect(parseOk(["--glb", "a", "--out", "o", "--shading", "both"]).shadings).toEqual(["toon", "pbr"]);
  });

  it("--morph는 마지막 '='로 나눠 콜론·부호가 있는 이름을 받는다", () => {
    const request = parseOk(["--glb", "a", "--out", "o", "--morph", "param:height:+=0.5", "--morph", "facs:jawOpen=1", "--morph", "param:waist=-0.25"]);
    expect(request.morphs).toEqual([
      { name: "param:height:+", value: 0.5 },
      { name: "facs:jawOpen", value: 1 },
      { name: "param:waist", value: -0.25 },
    ]);
  });

  it("--color는 키=#hex 쌍을 모으고 대소문자·# 생략을 정규화한다", () => {
    const request = parseOk(["--glb", "a", "--out", "o", "--color", "skin=#F3D3BD,hair=2b1d16", "--color", "top=#112233"]);
    expect(request.colors).toEqual({ skin: "#f3d3bd", hair: "#2b1d16", top: "#112233" });
  });

  it("--pose는 프리셋·인라인 JSON·파일을 받는다", () => {
    expect(parseOk(["--glb", "a", "--out", "o", "--pose", "arms-up"]).pose).toEqual({ kind: "preset", id: "arms-up" });
    const inline = parseOk(["--glb", "a", "--out", "o", "--pose", '{"leftUpperArm":{"axis":[0,0,1],"deg":-45},"head":[0,0,0,1],"neck":{"euler":[0,30,0]}}']);
    expect(inline.pose).toEqual({
      kind: "custom",
      rotations: {
        leftUpperArm: { kind: "axis-angle", axis: [0, 0, 1], deg: -45 },
        head: { kind: "quat", value: [0, 0, 0, 1] },
        neck: { kind: "euler", degXyz: [0, 30, 0] },
      },
    });
    const fromFile = parseOk(["--glb", "a", "--out", "o", "--pose", "pose.json"], (path) => (path === "pose.json" ? '{"spine":{"euler":[10,0,0]}}' : null));
    expect(fromFile.pose.kind).toBe("custom");
  });

  it("--role·--hair-lod·--quality·--size·--bg·--transparent·--inspect-only·--no-sheet", () => {
    const request = parseOk([
      "--glb",
      "a",
      "--out",
      "o",
      "--role",
      "Avatar_Body=skin",
      "--hair-lod",
      "1",
      "--quality",
      "preview",
      "--size",
      "512",
      "--bg",
      "#101010",
      "--transparent",
      "--inspect-only",
      "--no-sheet",
      "--renderer",
      "default",
      "--timeout-sec",
      "60",
      "--name",
      "hero",
      "--quiet",
    ]);
    expect(request.roleOverrides).toEqual({ Avatar_Body: "skin" });
    expect(request.hairLod).toBe(1);
    expect(request.quality).toBe("preview");
    expect(request.size).toBe(512);
    expect(request.background).toBe("#101010");
    expect(request.transparent).toBe(true);
    expect(request.inspectOnly).toBe(true);
    expect(request.sheetTile).toBe(0);
    expect(request.renderer).toBe("default");
    expect(request.timeoutSec).toBe(60);
    expect(request.name).toBe("hero");
    expect(request.quiet).toBe(true);
  });

  it("--help는 다른 오류와 무관하게 도움말 결과를 돌려준다", () => {
    expect(parseKitPreviewArgs(["--help"])).toEqual({ ok: true, help: true });
    expect(parseKitPreviewArgs(["-h"])).toEqual({ ok: true, help: true });
    expect(kitPreviewHelpText()).toContain("--glb");
    expect(kitPreviewHelpText()).toContain("종료 코드");
  });

  it("필수 인자 누락과 알 수 없는 인자는 한글 오류로 모아 돌려준다", () => {
    const errors = parseErrors(["--bogus"]);
    expect(errors.some((error) => error.includes("--glb가 필요"))).toBe(true);
    expect(errors.some((error) => error.includes("--out이 필요"))).toBe(true);
    expect(errors.some((error) => error.includes("알 수 없는 인자: --bogus"))).toBe(true);
  });

  it("값이 빠진 플래그는 다음 플래그를 값으로 삼키지 않는다", () => {
    const errors = parseErrors(["--glb", "--out", "o"]);
    expect(errors).toContain("--glb에 값이 없습니다.");
    expect(errors.some((error) => error.includes("--glb가 필요"))).toBe(true);
  });

  it("잘못된 값은 항목별로 오류가 된다", () => {
    const errors = parseErrors([
      "--glb",
      "a",
      "--out",
      "o",
      "--views",
      "front,nope",
      "--shading",
      "flat",
      "--size",
      "10",
      "--bg",
      "red",
      "--color",
      "skin=zzz,eyes=#fff000",
      "--morph",
      "novalue",
      "--quality",
      "ultra",
      "--role",
      "Mesh=banana",
      "--pose",
      "moonwalk",
      "--renderer",
      "gpu",
      "--dev-url",
      "localhost:1",
    ]);
    const joined = errors.join("\n");
    for (const needle of ["알 수 없는 뷰 'nope'", "알 수 없는 셰이딩 'flat'", "--size은(는) 64~4096", "--bg가 #RRGGBB", "--color skin의 값", "--color 키 'eyes'", "--morph는 이름=값", "알 수 없는 품질 'ultra'", "--role은 메시이름=역할", "알 수 없는 프리셋", "알 수 없는 렌더러", "--dev-url은 http"]) {
      expect(joined).toContain(needle);
    }
  });

  it("같은 단일 값 플래그를 두 번 주면 오류다", () => {
    expect(parseErrors(["--glb", "a", "--out", "o", "--out", "p"])).toContain("--out는 한 번만 지정할 수 있습니다.");
  });
});

describe("parseMorphAssignment / parsePoseJson / normalizeHexColor", () => {
  it("morph 값 범위: 일반 이름은 0~1, 부호 약식은 −1~1", () => {
    expect(parseMorphAssignment("facs:jawOpen=1.5").ok).toBe(false);
    expect(parseMorphAssignment("facs:jawOpen=-0.1").ok).toBe(false);
    expect(parseMorphAssignment("param:height=-1")).toEqual({ ok: true, value: { name: "param:height", value: -1 } });
    expect(parseMorphAssignment("param:height:-=-1").ok).toBe(false);
    expect(parseMorphAssignment("=1").ok).toBe(false);
    expect(parseMorphAssignment("name=").ok).toBe(false);
    expect(parseMorphAssignment("name=abc").ok).toBe(false);
  });

  it("포즈 JSON은 본 이름·값 형식·길이 0 쿼터니언을 검사한다", () => {
    expect(parsePoseJson("not json").ok).toBe(false);
    expect(parsePoseJson("[]").ok).toBe(false);
    expect(parsePoseJson("{}").ok).toBe(false);
    const unknownBone = parsePoseJson('{"leftArm":[0,0,0,1]}');
    expect(unknownBone.ok).toBe(false);
    expect(unknownBone.ok ? [] : unknownBone.errors.join(" ")).toContain("leftArm");
    expect(parsePoseJson('{"head":[0,0,0,0]}').ok).toBe(false);
    expect(parsePoseJson('{"head":{"axis":[0,0,0],"deg":10}}').ok).toBe(false);
    expect(parsePoseJson('{"head":"x"}').ok).toBe(false);
    expect(parsePoseJson('{"head":{"axis":[0,1,0],"deg":10}}').ok).toBe(true);
  });

  it("hex 색 정규화", () => {
    expect(normalizeHexColor("#ABCDEF")).toBe("#abcdef");
    expect(normalizeHexColor("abcdef")).toBe("#abcdef");
    expect(normalizeHexColor("#abc")).toBeNull();
    expect(normalizeHexColor("#gggggg")).toBeNull();
  });
});
