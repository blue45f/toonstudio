import { describe, expect, it } from "vitest";

import {
  STUDIO_AI_IMAGE_REFERENCE_LIMITS,
  compileStudioAiImageReferencePromptContexts,
  createEmptyStudioAiImageReferenceDocument,
  hydrateStudioAiImageReferenceDocument,
  serializeStudioAiImageReferenceDocument,
} from "../ai/studio-ai-image-reference-roles";
import { resolveStudioAiImageReferences } from "../ai/studio-ai-image-reference-resolution";
import {
  STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS,
  inspectStudioAiReferenceImageDataUrl,
  prepareStudioAiRoleReferences,
} from "../ai/studio-ai-reference-images";

import { ANCHOR_ANGLE_IDS, ANCHOR_LIMITS, type AnchorAngleId } from "./anchor-capture-spec";
import { anchorTextSha256, createAnchorCaptureSet, type AnchorCaptureSet, type AnchorImageInput } from "./anchor-capture-set";
import {
  ANCHOR_REFERENCE_PACK_LIMITS,
  ANCHOR_REFERENCE_RIGHTS_NOTE_KO,
  addAnchorReferencesToPack,
  anchorReferenceId,
  anchorSetReferenceIds,
  anchorShotReferenceId,
  describeReferencePackUsage,
  removeAnchorReferencesFromPack,
  type AnchorShotCaptureInput,
} from "./anchor-reference-pack";
import { createAnchorRights } from "./anchor-rights";
import { fakePngBytes } from "./anchor-test-kit";

const RIGHTS = createAnchorRights({ confirmed: true, attestedAt: "2026-10-22T00:00:00Z", anchorId: "hero-01", sourceCharacterId: "char-7" });

const hashOf = (seed: string): string => anchorTextSha256(`img:${seed}`);

function image(angleId: AnchorAngleId, overrides: Partial<AnchorImageInput> = {}): AnchorImageInput {
  return { angleId, mimeType: "image/png", width: 768, height: 1152, byteLength: 500_000, imageSha256: hashOf(angleId), ...overrides };
}

function setOf(angles: readonly AnchorAngleId[] = ANCHOR_ANGLE_IDS, anchorId = "hero-01"): AnchorCaptureSet {
  return createAnchorCaptureSet({ anchorId, sourceCharacterId: "char-7" }, angles.map((angle) => image(angle)));
}

function shot(shotId: string, kind: "pose" | "composition", overrides: Partial<AnchorShotCaptureInput> = {}): AnchorShotCaptureInput {
  return { shotId, kind, mimeType: "image/png", width: 1024, height: 1024, byteLength: 300_000, imageSha256: hashOf(`shot:${shotId}`), ...overrides };
}

function docWith(references: readonly unknown[]) {
  return hydrateStudioAiImageReferenceDocument({ version: 1, references });
}

const otherRefs = (count: number, role: "character" | "method" | "style") =>
  Array.from({ length: count }, (_, index) => ({ id: `other-${role}-${index}`, role, assetId: `asset-${role}-${index}`, sha256: hashOf(`${role}${index}`) }));

function pack(overrides: Partial<Parameters<typeof addAnchorReferencesToPack>[0]> = {}) {
  return addAnchorReferencesToPack({ document: createEmptyStudioAiImageReferenceDocument(), anchorSet: setOf(), rights: RIGHTS, origin: "file", ...overrides });
}

describe("앵커 참조 팩 어댑터 — 기본 동작", () => {
  it("여섯 앵커를 character 역할 참조로 더하고 소재 id 와 SHA-256 만 문서에 둔다", () => {
    const result = pack();
    expect(result.added).toHaveLength(6);
    expect(result.skipped).toEqual([]);
    expect(result.document.references.every((reference) => reference.role === "character")).toBe(true);
    const front = result.document.references.find((reference) => reference.id === anchorReferenceId("hero-01", "front"));
    expect(front?.asset).toEqual({ assetId: "anchor:hero-01:front", sha256: `sha256:${hashOf("front")}` });
    expect(front?.label).toBe("앵커 정면");
    expect(front?.guidance).toContain("정/반측 턴테이블");
    expect(front?.guidance).toContain(ANCHOR_REFERENCE_RIGHTS_NOTE_KO);
    expect(JSON.stringify(result.document)).not.toMatch(/data:|base64|bytes/u);
    expect(result.usage).toMatchObject({ character: 6, method: 0, style: 0, total: 6, addedBytes: 3_000_000 });
  });

  it("입력 문서는 바꾸지 않고 같은 입력은 같은 결과를 낸다", () => {
    const original = docWith(otherRefs(2, "style"));
    const snapshot = serializeStudioAiImageReferenceDocument(original);
    const first = pack({ document: original });
    const second = pack({ document: original });
    expect(serializeStudioAiImageReferenceDocument(original)).toBe(snapshot);
    expect(serializeStudioAiImageReferenceDocument(first.document)).toBe(serializeStudioAiImageReferenceDocument(second.document));
  });

  it("소재 초안에 내용 해시·크기·권리 확인 메타데이터를 담는다", () => {
    const { assets } = pack();
    const back = assets.find((asset) => asset.assetId === "anchor:hero-01:back");
    expect(back).toMatchObject({
      name: "앵커 hero-01 · 후면",
      contentHash: `sha256:${hashOf("back")}`,
      width: 768,
      height: 1152,
      byteLength: 500_000,
      kind: "anchor-capture",
      rights: { sourceKind: "local-upload", rightsConfirmed: true, licenseId: "user-owned-virtual-character" },
    });
    expect(pack({ origin: "stage" }).assets[0]?.rights.sourceKind).toBe("3d-generated");
  });

  it("앵커 세트도 샷도 없으면 문서를 정본화만 한다", () => {
    const result = addAnchorReferencesToPack({ document: undefined, rights: RIGHTS, origin: "file" });
    expect(result.document).toEqual(createEmptyStudioAiImageReferenceDocument());
    expect(result.added).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("앵커 참조 팩 어댑터 — 역방향 호환", () => {
  it("옛 배열 형식 문서도 받아 기존 참조를 그대로 두고 앵커만 더한다", () => {
    const legacy = [
      { id: "bg3d-current-shot-method", role: "method", asset: { assetId: "asset-shot", sha256: `sha256:${hashOf("bg3d")}` }, label: "현재 3D 샷 구도", guidance: "구도만 참고하세요." },
      { id: "style-1", role: "style", assetId: "asset-style" },
    ];
    const result = pack({ document: legacy });
    const ids = result.document.references.map((reference) => reference.id);
    expect(ids).toContain("bg3d-current-shot-method");
    expect(ids).toContain("style-1");
    expect(result.document.references.find((reference) => reference.id === "bg3d-current-shot-method")).toMatchObject({
      role: "method",
      label: "현재 3D 샷 구도",
      guidance: "구도만 참고하세요.",
    });
    expect(result.document.version).toBe(1);
    expect(result.usage).toMatchObject({ character: 6, method: 1, style: 1, total: 8 });
  });

  it("알 수 없는 값이나 잘못된 문서는 빈 문서에서 시작한다", () => {
    for (const bad of [null, "not json", 42, { version: 99, references: [{ id: "x", role: "style", assetId: "a" }] }]) {
      expect(pack({ document: bad }).document.references).toHaveLength(6);
    }
  });

  it("만든 문서는 직렬화·복원해도 같고 역할별 프롬프트 맥락을 컴파일할 수 있다", () => {
    const { document } = pack();
    const restored = hydrateStudioAiImageReferenceDocument(serializeStudioAiImageReferenceDocument(document));
    expect(restored).toEqual(document);
    const contexts = compileStudioAiImageReferencePromptContexts(document);
    expect(contexts.character.bindings).toHaveLength(6);
    expect(contexts.character.prompt).toContain("character-1");
    expect(contexts.method.prompt).toBe("");
    expect(contexts.style.prompt).toBe("");
  });

  it("소재 라이브러리에 같은 해시로 저장되면 컴파일된 참조가 모두 이미지로 해소되고 요청 한도를 통과한다", () => {
    const { document, assets } = pack();
    const sources = assets.map((asset, index) => {
      const bytes = fakePngBytes(asset.width, asset.height, index + 1, 2_000);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return { id: `lib-${index}`, name: asset.name, dataUrl: `data:image/png;base64,${btoa(binary)}`, contentHash: asset.contentHash };
    });
    const resolution = resolveStudioAiImageReferences(document, sources);
    expect(resolution.missing).toEqual([]);
    expect(resolution.references).toHaveLength(6);
    expect(resolution.hasCharacterReference).toBe(true);
    const prepared = prepareStudioAiRoleReferences(resolution.references);
    expect(prepared.ok).toBe(true);
    for (const reference of resolution.references) {
      expect(inspectStudioAiReferenceImageDataUrl(reference.dataUrl).ok).toBe(true);
    }
  });

  it("사용자가 지운 소재는 조용히 다른 이미지로 대체되지 않고 누락으로 보고된다", () => {
    const { document } = pack();
    const resolution = resolveStudioAiImageReferences(document, []);
    expect(resolution.references).toEqual([]);
    expect(resolution.missing).toHaveLength(6);
  });
});

describe("앵커 참조 팩 어댑터 — 크기 상한", () => {
  it("상한 상수는 기존 참조 팩 모듈의 값을 그대로 쓴다", () => {
    expect(ANCHOR_REFERENCE_PACK_LIMITS.maxPerRole).toBe(STUDIO_AI_IMAGE_REFERENCE_LIMITS.maxReferencesPerRole);
    expect(ANCHOR_REFERENCE_PACK_LIMITS.maxTotal).toBe(STUDIO_AI_ROLE_REFERENCE_REQUEST_LIMITS.maxImages);
    expect(ANCHOR_REFERENCE_PACK_LIMITS.maxTotal).toBeLessThanOrEqual(STUDIO_AI_IMAGE_REFERENCE_LIMITS.maxReferences);
    expect(ANCHOR_LIMITS.maxImageBytes).toBeLessThan(ANCHOR_REFERENCE_PACK_LIMITS.maxDecodedBytesPerImage);
  });

  it("character 자리가 둘뿐이면 정면과 후면만 넣고 쌍은 한쪽만 넣지 않는다", () => {
    const result = pack({ document: docWith(otherRefs(4, "character")) });
    expect(result.added.map((entry) => entry.angleId)).toEqual(["front", "back"]);
    const pairSkips = result.skipped.filter((entry) => entry.reason === "pair-rule").map((entry) => entry.angleId);
    expect(pairSkips).toEqual(["left-34", "right-34"]);
    expect(result.skipped.filter((entry) => entry.reason === "role-limit").map((entry) => entry.angleId)).toEqual(["left", "right"]);
    expect(result.usage.character).toBe(6);
  });

  it("character 자리가 하나도 없으면 전부 role-limit 로 건너뛰고 문서를 그대로 둔다", () => {
    const full = docWith(otherRefs(6, "character"));
    const result = pack({ document: full });
    expect(result.added).toEqual([]);
    expect(result.skipped).toHaveLength(6);
    expect(result.skipped.every((entry) => entry.reason === "role-limit")).toBe(true);
    expect(serializeStudioAiImageReferenceDocument(result.document)).toBe(serializeStudioAiImageReferenceDocument(full));
  });

  it("제공자 안전 한도(16)를 넘기지 않는다", () => {
    const crowded = docWith([...otherRefs(5, "method"), ...otherRefs(6, "style"), ...otherRefs(3, "character")]);
    expect(crowded.references).toHaveLength(14);
    const result = pack({ document: crowded });
    expect(result.usage.total).toBeLessThanOrEqual(ANCHOR_REFERENCE_PACK_LIMITS.maxTotal);
    // 자리 둘: 정면(1) → 3/4 쌍(2)은 한쪽만 들어갈 수 없어 건너뛰고 → 후면(1) → 옆 쌍은 자리가 없다.
    expect(result.added.map((entry) => entry.angleId)).toEqual(["front", "back"]);
    expect(result.skipped.map((entry) => [entry.angleId, entry.reason])).toEqual([
      ["left-34", "pair-rule"],
      ["right-34", "pair-rule"],
      ["left", "provider-limit"],
      ["right", "provider-limit"],
    ]);
    expect(result.usage.total).toBe(ANCHOR_REFERENCE_PACK_LIMITS.maxTotal);
  });

  it("이미 쓴 이미지 크기를 알려 주면 전체 50MiB 예산 안에서만 더한다", () => {
    const nearLimit = ANCHOR_REFERENCE_PACK_LIMITS.maxTotalDecodedBytes - 600_000;
    const result = pack({ existingBytes: nearLimit });
    expect(result.added.map((entry) => entry.angleId)).toEqual(["front"]);
    expect(result.skipped.every((entry) => entry.reason === "byte-budget")).toBe(true);
    expect(result.usage.addedBytes).toBe(500_000);
  });

  it("기존 참조가 있는데 크기를 모르면 경고한다", () => {
    expect(pack({ document: docWith(otherRefs(1, "style")) }).warnings.map((warning) => warning.code)).toContain("existing-bytes-unknown");
    expect(pack().warnings.map((warning) => warning.code)).not.toContain("existing-bytes-unknown");
  });
});

describe("앵커 참조 팩 어댑터 — 세트가 불완전할 때", () => {
  it("정면이 없으면 경고하지만 있는 각도는 넣는다", () => {
    const result = pack({ anchorSet: setOf(["left-34", "right-34", "back"]) });
    expect(result.warnings).toContainEqual({ code: "missing-front" });
    expect(result.added.map((entry) => entry.angleId)).toEqual(["left-34", "right-34", "back"]);
  });

  it("짝이 없는 3/4 는 경고와 함께 있는 쪽만 넣는다", () => {
    const result = pack({ anchorSet: setOf(["front", "right-34"]) });
    expect(result.warnings).toContainEqual({ code: "missing-mirror-pair", angleId: "right-34", relatedAngleId: "left-34" });
    expect(result.added.map((entry) => entry.angleId)).toEqual(["front", "right-34"]);
  });

  it("같은 이미지가 두 각도에 들어 있으면 같은 역할의 중복으로 합쳐지고 건너뜀으로 보고한다", () => {
    const same = hashOf("same");
    const set = createAnchorCaptureSet({ anchorId: "hero-01", sourceCharacterId: "char-7" }, [
      image("front", { imageSha256: same }),
      image("back", { imageSha256: same }),
    ]);
    const result = pack({ anchorSet: set });
    expect(result.added).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe("duplicate-content");
    expect(result.assets).toHaveLength(1);
  });
});

describe("앵커 참조 팩 어댑터 — 다시 더하기와 제거", () => {
  it("같은 앵커 id 를 다시 더하면 이전 참조를 걷어 내고 같은 결과를 만든다", () => {
    const first = pack();
    const again = pack({ document: first.document });
    expect(again.removedReferenceIds).toHaveLength(6);
    expect(again.warnings).toContainEqual({ code: "replaced-previous", count: 6 });
    expect(serializeStudioAiImageReferenceDocument(again.document)).toBe(serializeStudioAiImageReferenceDocument(first.document));
  });

  it("앵커 이미지를 바꿔 다시 더하면 해시가 새 값으로 바뀐다", () => {
    const first = pack();
    const changed = createAnchorCaptureSet({ anchorId: "hero-01", sourceCharacterId: "char-7" }, ANCHOR_ANGLE_IDS.map((angle) => image(angle, { imageSha256: hashOf(`v2-${angle}`) })));
    const second = pack({ document: first.document, anchorSet: changed });
    const front = second.document.references.find((reference) => reference.id === anchorReferenceId("hero-01", "front"));
    expect(front?.asset.sha256).toBe(`sha256:${hashOf("v2-front")}`);
    expect(second.document.references).toHaveLength(6);
  });

  it("다른 앵커 id 의 참조는 서로 섞이지 않는다(접두어가 겹쳐도)", () => {
    const a = pack({ anchorSet: setOf(["front"], "a") });
    const otherSet = createAnchorCaptureSet({ anchorId: "a-b", sourceCharacterId: "char-7" }, [image("front", { imageSha256: hashOf("a-b-front") })]);
    const ab = pack({ document: a.document, anchorSet: otherSet });
    expect(ab.document.references.map((reference) => reference.id).sort()).toEqual([anchorReferenceId("a-b", "front"), anchorReferenceId("a", "front")]);
    const removed = removeAnchorReferencesFromPack(ab.document, "a");
    expect(removed.references.map((reference) => reference.id)).toEqual([anchorReferenceId("a-b", "front")]);
  });

  it("앵커 참조를 걷어 내도 다른 참조는 그대로다", () => {
    const base = docWith(otherRefs(2, "style"));
    const added = pack({ document: base });
    const removed = removeAnchorReferencesFromPack(added.document, "hero-01");
    expect(serializeStudioAiImageReferenceDocument(removed)).toBe(serializeStudioAiImageReferenceDocument(base));
    expect(anchorSetReferenceIds("hero-01")).toHaveLength(6);
  });
});

describe("앵커 참조 팩 어댑터 — 샷의 포즈·구도 캡처", () => {
  it("포즈와 구도 캡처를 method 역할로 더하고 정체성·화풍은 따라 하지 않게 안내한다", () => {
    const result = pack({ anchorSet: null, shotCaptures: [shot("shot-1", "pose"), shot("shot-2", "composition", { label: "와이드 구도" })] });
    expect(result.added.map((entry) => [entry.referenceId, entry.role])).toEqual([
      [anchorShotReferenceId("shot-1"), "method"],
      [anchorShotReferenceId("shot-2"), "method"],
    ]);
    const pose = result.document.references.find((reference) => reference.id === anchorShotReferenceId("shot-1"));
    const composition = result.document.references.find((reference) => reference.id === anchorShotReferenceId("shot-2"));
    expect(pose?.guidance).toContain("포즈·실루엣");
    expect(pose?.guidance).toContain("정체성·화풍·문자는 복제하지 마세요");
    expect(composition?.label).toBe("와이드 구도");
    expect(composition?.guidance).toContain("카메라 각도·프레이밍");
    expect(result.assets.every((asset) => asset.kind === "anchor-shot")).toBe(true);
    expect(result.usage).toMatchObject({ character: 0, method: 2 });
  });

  it("method 자리가 모자라거나 잘못된 샷, 이미 있는 같은 내용은 이유와 함께 건너뛴다", () => {
    const existing = docWith([
      ...otherRefs(5, "method"),
      { id: "bg3d-current-shot-method", role: "method", assetId: "asset-bg3d", sha256: `sha256:${hashOf("shot:dup")}` },
    ]);
    const result = pack({
      document: existing,
      anchorSet: null,
      shotCaptures: [shot("dup", "pose"), shot("bad id!", "pose"), shot("new", "composition")],
    });
    expect(result.skipped.map((entry) => entry.reason)).toEqual(["duplicate-content", "invalid-shot", "role-limit"]);
    expect(result.added).toEqual([]);
  });

  it("같은 샷 id 를 다시 더하면 이전 샷 참조를 교체한다", () => {
    const first = pack({ anchorSet: null, shotCaptures: [shot("s", "pose")] });
    const second = pack({ document: first.document, anchorSet: null, shotCaptures: [shot("s", "pose", { imageSha256: hashOf("v2") })] });
    expect(second.removedReferenceIds).toEqual([anchorShotReferenceId("s")]);
    expect(second.document.references).toHaveLength(1);
    expect(second.document.references[0]?.asset.sha256).toBe(`sha256:${hashOf("v2")}`);
  });

  it("앵커와 샷을 함께 더해도 역할별 상한을 각각 지킨다", () => {
    const result = pack({ shotCaptures: Array.from({ length: 8 }, (_, index) => shot(`s${index}`, "pose")) });
    expect(result.usage.character).toBe(6);
    expect(result.usage.method).toBe(ANCHOR_REFERENCE_PACK_LIMITS.maxPerRole);
    expect(result.skipped.filter((entry) => entry.reason === "role-limit")).toHaveLength(2);
    expect(result.usage.total).toBeLessThanOrEqual(ANCHOR_REFERENCE_PACK_LIMITS.maxTotal);
  });
});

describe("참조 팩 사용량", () => {
  it("역할별 개수와 합계를 센다", () => {
    expect(describeReferencePackUsage(docWith([...otherRefs(2, "character"), ...otherRefs(1, "style")]))).toEqual({
      character: 2,
      method: 0,
      style: 1,
      total: 3,
      addedBytes: 0,
    });
    expect(describeReferencePackUsage(null).total).toBe(0);
  });
});
