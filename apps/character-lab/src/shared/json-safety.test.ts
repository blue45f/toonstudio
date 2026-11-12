import { describe, expect, it } from "vitest";

import {
  describeJsonSyntaxErrorKo,
  detectBinaryFileSignature,
  findDuplicateJsonObjectKeys,
  parseJsonSafely,
  stripUtf8Bom,
} from "./json-safety";

describe("shared/json-safety", () => {
  it("선두 UTF-8 BOM(\\uFEFF)을 제거해 정상 JSON을 복구한다", () => {
    const withBom = '\ufeff{"version":3,"slots":{"hair":"hair/soft-bob"}}';
    expect(stripUtf8Bom(withBom)).toEqual({
      text: '{"version":3,"slots":{"hair":"hair/soft-bob"}}',
      bomStripped: true,
    });
    const parsed = parseJsonSafely(withBom);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bomStripped).toBe(true);
    expect(parsed.value).toEqual({ version: 3, slots: { hair: "hair/soft-bob" } });
  });

  it("GLB·PNG·PSD·ZIP·NUL 바이너리 파일을 오선택하면 파일 종류를 명시한 한글 사유를 돌려준다", () => {
    const glb = detectBinaryFileSignature("glTF\u0002\u0000\u0000\u0000\u0010\u0000\u0000\u0000");
    expect(glb?.kind).toBe("glb");
    expect(glb?.reasonKo).toContain("GLB 3D 모델 바이너리");

    const png = detectBinaryFileSignature("\ufffdPNG\r\n\u001a\n");
    expect(png?.kind).toBe("png");
    expect(png?.reasonKo).toContain("PNG 이미지 바이너리");

    const psd = detectBinaryFileSignature("8BPS\u0000\u0001\u0000\u0000");
    expect(psd?.kind).toBe("psd");
    expect(psd?.reasonKo).toContain("PSD 문서 바이너리");

    const zip = detectBinaryFileSignature("PK\u0003\u0004\u0014\u0000");
    expect(zip?.kind).toBe("zip");
    expect(zip?.reasonKo).toContain("ZIP/아카이브 바이너리");

    const rawNul = parseJsonSafely('{"version":3}\u0000');
    expect(rawNul.ok).toBe(false);
    if (!rawNul.ok) {
      expect(rawNul.code).toBe("recipe-json-syntax");
      expect(rawNul.reasonKo).toContain("바이너리(NUL)");
    }
  });

  it("잘린 JSON은 파일 끝 잘림 힌트와 올바른 JSON 아님 안내를 포함한다", () => {
    const truncated = '{\n  "version": 3,\n  "colors": {\n    "skin": "#f3d3bd"';
    const parsed = parseJsonSafely(truncated);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("recipe-json-syntax");
    expect(parsed.reasonKo).toContain("올바른 JSON이 아닙니다");
    expect(parsed.reasonKo).toContain("파일 끝이 잘렸거나");
    expect(describeJsonSyntaxErrorKo("{\n  bad", new SyntaxError("Unexpected token b in JSON at position 4"))).toContain("줄 2, 열 3");
  });

  it("동일 객체 내 중복 키(중첩 경로·배열 내부·유니코드 이스케이프 포함)를 정확히 탐지하고 다른 객체의 동명 키는 허용한다", () => {
    const clean = JSON.stringify({
      version: 3,
      a: { id: "same-name-in-different-object" },
      b: { id: "allowed" },
      arr: [{ part: "skin", note: 'escaped \\"quote\\" { "part": "ignored" }' }, { part: "head" }],
    });
    expect(findDuplicateJsonObjectKeys(clean)).toEqual([]);

    const dupRaw = [
      "{",
      '  "version": 3,',
      '  "slots": { "hair": "hair/a", "\\u0068air": "hair/b" },',
      '  "layers": [{ "part": "skin", "part": "head" }]',
      "}",
    ].join("\n");
    expect(findDuplicateJsonObjectKeys(dupRaw)).toEqual(["slots.hair", "layers[0].part"]);

    const rejected = parseJsonSafely(dupRaw);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.code).toBe("recipe-duplicate-id");
      expect(rejected.reasonKo).toContain("slots.hair");
      expect(rejected.reasonKo).toContain("layers[0].part");
    }
  });
});
