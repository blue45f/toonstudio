import { describe, expect, it } from "vitest";

import { ANCHOR_ANGLE_IDS, ANCHOR_LIMITS, type AnchorAngleId } from "./anchor-capture-spec";
import {
  AnchorSetError,
  anchorImageFileName,
  anchorTextSha256,
  canonicalAnchorJson,
  checkAnchorCompleteness,
  createAnchorCaptureSet,
  guessAnchorAngleFromFileName,
  parseAnchorImageFileName,
  validateAnchorImage,
  validateAnchorSetInput,
  type AnchorImageInput,
} from "./anchor-capture-set";

const IDENTITY = { anchorId: "hero-01", sourceCharacterId: "char-7" } as const;

function hash(seed: string): string {
  return anchorTextSha256(`image:${seed}`);
}

function image(angleId: AnchorAngleId, overrides: Partial<AnchorImageInput> = {}): AnchorImageInput {
  return {
    angleId,
    mimeType: "image/png",
    width: 768,
    height: 1152,
    byteLength: 400_000,
    imageSha256: hash(angleId),
    ...overrides,
  };
}

const FULL: readonly AnchorImageInput[] = ANCHOR_ANGLE_IDS.map((id) => image(id));

describe("정본 JSON 과 해시", () => {
  it("키 순서와 무관하게 같은 문자열을 만들고 undefined 항목은 뺀다", () => {
    expect(canonicalAnchorJson({ b: 1, a: [2, { d: true, c: null }], e: undefined })).toBe('{"a":[2,{"c":null,"d":true}],"b":1}');
    expect(canonicalAnchorJson({ a: 1, b: 2 })).toBe(canonicalAnchorJson({ b: 2, a: 1 }));
  });

  it("유한하지 않은 숫자와 함수는 직렬화하지 않는다", () => {
    expect(() => canonicalAnchorJson({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalAnchorJson({ a: () => 1 })).toThrow(TypeError);
  });

  it("SHA-256 은 알려진 값과 같다", () => {
    expect(anchorTextSha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("앵커 이미지 파일 이름", () => {
  const sha = hash("front");

  it("<앵커id>.<각도>.<해시 8자>.<확장자> 로 만들고 다시 읽는다", () => {
    const name = anchorImageFileName({ anchorId: "hero-01", angleId: "right-34", imageSha256: sha, mimeType: "image/jpeg" });
    expect(name).toBe(`hero-01.right-34.${sha.slice(0, 8)}.jpg`);
    expect(parseAnchorImageFileName(name)).toEqual({ anchorId: "hero-01", angleId: "right-34", hash8: sha.slice(0, 8) });
  });

  it("해시가 없는 이름·대문자·폴더 경로도 읽는다", () => {
    expect(parseAnchorImageFileName("Hero-01.FRONT.PNG")).toEqual({ anchorId: "hero-01", angleId: "front", hash8: null });
    expect(parseAnchorImageFileName("C:\\fake\\hero.left.png")).toEqual({ anchorId: "hero", angleId: "left", hash8: null });
    expect(parseAnchorImageFileName("a/b/hero.back.12345678.webp")).toEqual({ anchorId: "hero", angleId: "back", hash8: "12345678" });
  });

  it("규칙에 맞지 않는 이름은 null 이다", () => {
    for (const name of ["front.png", "hero.top.png", "hero.front.gif", "hero_front.png", "hero.front.png.exe", ".front.png"]) {
      expect(parseAnchorImageFileName(name), name).toBeNull();
    }
  });

  it("올바르지 않은 id·해시로는 이름을 만들지 않는다", () => {
    expect(() => anchorImageFileName({ anchorId: "Bad.Id", angleId: "front", imageSha256: sha, mimeType: "image/png" })).toThrow(RangeError);
    expect(() => anchorImageFileName({ anchorId: "hero", angleId: "front", imageSha256: "xyz", mimeType: "image/png" })).toThrow(RangeError);
  });
});

describe("파일 이름으로 각도 짐작", () => {
  it.each([
    ["hero_front.png", "front"],
    ["front view.PNG", "front"],
    ["캐릭터 정면.png", "front"],
    ["back.jpg", "back"],
    ["rear-view.webp", "back"],
    ["후면.png", "back"],
    ["side_left.png", "left"],
    ["좌측.png", "left"],
    ["오른쪽 옆.png", "right"],
    ["hero-right.png", "right"],
    ["left_34.png", "left-34"],
    ["left-3-4.png", "left-34"],
    ["Left 3-4 view.png", "left-34"],
    ["좌측 3_4.png", "left-34"],
    ["right_three-quarter.png", "right-34"],
    ["우측 반측면.png", "right-34"],
    ["hero.right-34.12ab34cd.png", "right-34"],
  ] as const)("%s → %s", (name, expected) => {
    expect(guessAnchorAngleFromFileName(name)).toBe(expected);
  });

  it("모호하거나 단서가 없으면 짐작하지 않는다", () => {
    for (const name of ["front-left-34.png", "left_right.png", "IMG_0042.png", "character.png", "frontend.png", "background.png"]) {
      expect(guessAnchorAngleFromFileName(name), name).toBeNull();
    }
  });
});

describe("이미지·세트 검증", () => {
  it("올바른 이미지는 문제가 없다", () => {
    expect(validateAnchorImage(image("front"))).toEqual([]);
  });

  it("너무 작은 이미지, 너무 큰 이미지, 지원하지 않는 형식, 잘못된 해시를 각각 알린다", () => {
    const codes = (value: AnchorImageInput) => validateAnchorImage(value).map((issue) => issue.code);
    expect(codes(image("front", { width: 100, height: 1152 }))).toEqual(["image-too-small"]);
    expect(codes(image("front", { width: ANCHOR_LIMITS.maxEdgePx + 1 }))).toEqual(["image-too-large"]);
    expect(codes(image("front", { width: 4000, height: 4300 }))).toEqual(["image-too-large"]);
    expect(codes(image("front", { byteLength: ANCHOR_LIMITS.maxImageBytes + 1 }))).toEqual(["file-too-large"]);
    expect(codes(image("front", { byteLength: 0 }))).toEqual(["file-empty"]);
    expect(codes(image("front", { mimeType: "image/gif" as never }))).toEqual(["unsupported-format"]);
    expect(codes(image("front", { imageSha256: "ABC" }))).toEqual(["invalid-hash"]);
    expect(codes(image("front", { width: 1.5 }))).toEqual(["invalid-dimensions"]);
    expect(codes(image("top" as never))).toEqual(["unknown-angle"]);
  });

  it("식별자 오류, 빈 세트, 같은 각도 두 장, 세트 총 크기 초과를 함께 알린다", () => {
    const codes = (identity: { anchorId: string; sourceCharacterId: string }, images: readonly AnchorImageInput[]) =>
      validateAnchorSetInput(identity, images).map((issue) => issue.code);
    expect(codes({ anchorId: "Bad", sourceCharacterId: "한글" }, [])).toEqual(["invalid-anchor-id", "invalid-character-id", "no-images"]);
    expect(codes(IDENTITY, [image("front"), image("front", { imageSha256: hash("other") })])).toEqual(["duplicate-angle"]);
    const big = ANCHOR_ANGLE_IDS.map((id) => image(id, { byteLength: ANCHOR_LIMITS.maxImageBytes }));
    expect(codes(IDENTITY, big)).toEqual(["set-too-large"]);
    expect(codes(IDENTITY, FULL)).toEqual([]);
  });

  it("문제가 있으면 모든 문제를 담은 AnchorSetError 로 세트를 거절한다", () => {
    try {
      createAnchorCaptureSet({ anchorId: "x y", sourceCharacterId: "c" }, [image("front", { width: 10 })]);
      expect.unreachable("던져야 해요");
    } catch (error) {
      expect(error).toBeInstanceOf(AnchorSetError);
      expect((error as AnchorSetError).issues.map((issue) => issue.code)).toEqual(["invalid-anchor-id", "image-too-small"]);
    }
  });
});

describe("앵커 세트 해시", () => {
  it("입력 순서와 무관하게 정본 각도 순서·같은 해시를 만든다", () => {
    const forward = createAnchorCaptureSet(IDENTITY, FULL);
    const reversed = createAnchorCaptureSet(IDENTITY, [...FULL].reverse());
    expect(forward.entries.map((entry) => entry.angleId)).toEqual([...ANCHOR_ANGLE_IDS]);
    expect(reversed).toEqual(forward);
    expect(forward.setHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(forward.entries.every((entry) => /^[0-9a-f]{64}$/u.test(entry.entryHash))).toBe(true);
  });

  it("시각이나 표시 이름이 들어갈 자리가 없고, 같은 입력은 몇 번을 만들어도 같은 해시다", () => {
    const first = createAnchorCaptureSet(IDENTITY, FULL).setHash;
    const second = createAnchorCaptureSet({ ...IDENTITY }, FULL.map((entry) => ({ ...entry }))).setHash;
    expect(second).toBe(first);
  });

  it("앵커 id · 원본 캐릭터 id · 이미지 내용 · 각도 구성이 바뀌면 해시가 바뀐다", () => {
    const base = createAnchorCaptureSet(IDENTITY, FULL).setHash;
    expect(createAnchorCaptureSet({ ...IDENTITY, anchorId: "hero-02" }, FULL).setHash).not.toBe(base);
    expect(createAnchorCaptureSet({ ...IDENTITY, sourceCharacterId: "char-8" }, FULL).setHash).not.toBe(base);
    const changed = FULL.map((entry) => (entry.angleId === "back" ? { ...entry, imageSha256: hash("changed") } : entry));
    expect(createAnchorCaptureSet(IDENTITY, changed).setHash).not.toBe(base);
    expect(createAnchorCaptureSet(IDENTITY, FULL.slice(0, 5)).setHash).not.toBe(base);
  });

  it("항목마다 파일 이름과 방위각, 항목 해시를 갖는다", () => {
    const set = createAnchorCaptureSet(IDENTITY, FULL);
    const right = set.entries.find((entry) => entry.angleId === "right");
    expect(right?.azimuthDeg).toBe(90);
    expect(right?.fileName).toBe(`hero-01.right.${hash("right").slice(0, 8)}.png`);
    expect(new Set(set.entries.map((entry) => entry.entryHash)).size).toBe(6);
  });

  it("고정 입력의 해시 값을 고정해 규칙이 바뀌면 알아챈다", () => {
    const set = createAnchorCaptureSet(IDENTITY, FULL);
    // 이 값이 바뀌면 이미 내보낸 앵커 세트의 해시와 새 세트의 해시가 달라진다. 규칙을 일부러 바꿀 때만 갱신한다.
    expect(set.setHash).toBe("5921025ee1f42ebd53e086920918b2d750b472509afbf40bd5718a4843fb0b6f");
  });
});

describe("세트 완전성 검사", () => {
  const entry = (angleId: AnchorAngleId, overrides: Partial<{ width: number; height: number; imageSha256: string }> = {}) => ({
    angleId,
    width: 768,
    height: 1152,
    imageSha256: hash(angleId),
    ...overrides,
  });

  it("비어 있으면 empty 이고 참조 팩에 쓸 수 없다", () => {
    const report = checkAnchorCompleteness([]);
    expect(report).toMatchObject({ status: "empty", present: [], usableForReferencePack: false, clean: false });
    expect(report.missing).toEqual([...ANCHOR_ANGLE_IDS]);
    expect(report.issues).toEqual([]);
  });

  it("정면만 있으면 partial 이고 참조 팩에는 쓸 수 있으며 빠진 다섯 각도를 알린다", () => {
    const report = checkAnchorCompleteness([entry("front")]);
    expect(report.status).toBe("partial");
    expect(report.usableForReferencePack).toBe(true);
    expect(report.issues.filter((issue) => issue.code === "missing-angle").map((issue) => issue.angleId))
      .toEqual(["left-34", "left", "back", "right", "right-34"]);
  });

  it("옆모습만 있으면 정면이 없어 참조 팩에 쓸 수 없다", () => {
    expect(checkAnchorCompleteness([entry("left"), entry("right")]).usableForReferencePack).toBe(false);
  });

  it("반측 쌍 규칙: 한쪽 3/4 나 한쪽 옆만 있으면 짝이 없다고 알린다", () => {
    const report = checkAnchorCompleteness([entry("front"), entry("left-34"), entry("right")]);
    const pairs = report.issues.filter((issue) => issue.code === "missing-mirror-pair");
    expect(pairs.map((issue) => [issue.angleId, issue.relatedAngleId])).toEqual([["left-34", "right-34"], ["right", "left"]]);
    expect(checkAnchorCompleteness([entry("front"), entry("left"), entry("right")]).issues
      .some((issue) => issue.code === "missing-mirror-pair")).toBe(false);
  });

  it("여섯 각도가 같은 크기로 모두 있으면 complete 이고 clean 이다", () => {
    const report = checkAnchorCompleteness(ANCHOR_ANGLE_IDS.map((id) => entry(id)));
    expect(report).toMatchObject({ status: "complete", missing: [], usableForReferencePack: true, clean: true });
    expect(report.issues).toEqual([]);
  });

  it("가장 많은 크기와 다른 이미지는 크기 불일치로 알린다", () => {
    const entries = ANCHOR_ANGLE_IDS.map((id) => (id === "back" ? entry(id, { width: 1024, height: 1536 }) : entry(id)));
    const report = checkAnchorCompleteness(entries);
    const mismatch = report.issues.filter((issue) => issue.code === "size-mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]).toMatchObject({
      angleId: "back",
      params: { width: 1024, height: 1536, expectedWidth: 768, expectedHeight: 1152 },
    });
    expect(report.status).toBe("complete");
    expect(report.clean).toBe(false);
  });

  it("같은 이미지가 두 각도에 들어 있으면 먼저 나온 각도를 짝으로 알린다", () => {
    const report = checkAnchorCompleteness([entry("front"), entry("back", { imageSha256: hash("front") })]);
    expect(report.issues.find((issue) => issue.code === "duplicate-image")).toMatchObject({ angleId: "back", relatedAngleId: "front" });
  });

  it("규약 비율에서 벗어나거나 작은 이미지는 참고 안내(info)로만 알린다", () => {
    const report = checkAnchorCompleteness([entry("front", { width: 400, height: 400 })]);
    const codes = report.issues.filter((issue) => issue.severity === "info").map((issue) => issue.code);
    expect(codes).toEqual(["aspect-off-convention", "below-recommended-size"]);
  });

  it("같은 각도가 두 번 들어와도 첫 항목만 센다", () => {
    const report = checkAnchorCompleteness([entry("front"), entry("front", { imageSha256: hash("x") })]);
    expect(report.present).toEqual(["front"]);
    expect(report.issues.some((issue) => issue.code === "duplicate-image")).toBe(false);
  });
});
