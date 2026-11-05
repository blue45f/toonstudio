import { describe, expect, it } from "vitest";

import { parseStudioLinked3dCorrectionProvenance } from "./studio-linked-3d-correction";

const provenance = { kind: "toonstudio.linked-3d-correction", version: 1, bundleId: "bundle-a", pass: "line", sourcePassRevision: 1,
  sourceHash: `sha256:${"a".repeat(64)}`, baseGeometryHash: `sha256:${"b".repeat(64)}`, topologyHash: `sha256:${"c".repeat(64)}`,
  objectIdentityHash: `sha256:${"d".repeat(64)}`, basePassRootHash: `sha256:${"e".repeat(64)}` };

describe("공유 3D 보정 출처 형식", () => {
  it("기존 웹 parser의 제한·불변 결과를 API에서도 같은 함수로 사용한다", () => {
    const parsed = parseStudioLinked3dCorrectionProvenance(provenance);
    expect(parsed).toEqual(provenance); expect(Object.isFrozen(parsed)).toBe(true);
  });
  it.each([
    { ...provenance, extra: true }, { ...provenance, version: 2 }, { ...provenance, pass: "tone" },
    { ...provenance, sourcePassRevision: 0 }, { ...provenance, sourcePassRevision: 0.5 },
    { ...provenance, bundleId: "constructor" }, { ...provenance, bundleId: "x".repeat(129) },
    { ...provenance, sourceHash: `sha256:${"A".repeat(64)}` }, { ...provenance, topologyHash: "bad" },
  ])("손상·미지 버전·위조 구조를 정규화해서 통과시키지 않는다: %j", (value) => {
    expect(parseStudioLinked3dCorrectionProvenance(value)).toBeNull();
  });
});
