/**
 * BabylonCharacterEngine 손 소품 어태치먼트(`setHandProp`) NullEngine 통합 검증:
 * - Blender 5.3 제작 소품 4종(`smartphone`, `coffee-cup`, `case-folder`, `aether-blade`) SHA-256 검증 로드
 * - PBR ↔ 툰 셰이딩 전환, 캐릭터 재로드 시 자동 재장착, 해제 시 누수 없는 정리, GLB 내보내기 보존 확인
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SHADING } from "../contracts";
import { parseGlb } from "../testing/minimal-glb";

import { createNullEngineHarness } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { HandPropId } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

const PROPS_DIR = fileURLToPath(new URL("../../public/assets/props/webtoon-hand-props-v1/", import.meta.url));

interface PropManifestEntry {
  readonly id: HandPropId;
  readonly labelKo: string;
  readonly meshName: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly triangles: number;
}

describe("BabylonCharacterEngine.setHandProp — 웹툰 3D 손 소품 어태치먼트 & GLB 내보내기 보존", () => {
  let harness: NullEngineHarness;

  beforeEach(async () => {
    harness = await createNullEngineHarness({
      now: () => 2_000,
      fetchBytes: async (url) => {
        const rel = url.replace(/^\/assets\/props\/webtoon-hand-props-v1\//u, "");
        const buf = await readFile(resolve(PROPS_DIR, rel));
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      },
    });
  });

  afterEach(() => {
    harness.dispose();
  });

  it("Blender 5.3 소품 4종 매니페스트 해시 정합성·PBR↔툰 전환·재로드 재부착·GLB 직렬화 보존·해제 정리를 만족한다", async () => {
    const manifestRaw = JSON.parse(await readFile(resolve(PROPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry[];
    };
    expect(manifestRaw.props).toHaveLength(4);

    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    const basePartCount = harness.engine.inspectRig()?.parts.length ?? 0;
    const baseMeshCount = harness.engine.inspectScene().meshCount;

    for (const entry of manifestRaw.props) {
      await harness.engine.setHandProp({
        propId: entry.id,
        hand: "rightHand",
        glbUrl: `/assets/props/webtoon-hand-props-v1/${entry.path}`,
        sha256: entry.sha256,
      });
      const rig = harness.engine.inspectRig();
      expect(rig?.parts).toHaveLength(basePartCount + 1);
      const propPart = rig?.parts.find((p) => p.id === "extra:hand-prop");
      expect(propPart).toBeDefined();
      expect(propPart?.role).toBe("accessory");
      expect(propPart?.triangleCount).toBe(entry.triangles);
    }

    // 마지막 장착 소품(aether-blade) 상태에서 툰 모드 전환 및 GLB 내보내기 검증
    harness.engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    expect(harness.engine.inspectRig()?.parts.find((p) => p.id === "extra:hand-prop")?.materialClass).toBe("ShaderMaterial");

    const glbBytes = await harness.engine.exportGlb();
    const parsed = parseGlb(glbBytes);
    const gltf = parsed.json as { nodes: Array<{ name?: string }> };
    const nodeNames = gltf.nodes.map((n) => n.name ?? "");
    expect(nodeNames.some((n) => n.includes("TS_HandPropAnchor_aether-blade"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_Prop_aether-blade"))).toBe(true);

    // 캐릭터 소스를 다시 로드해도 활성 손 소품이 자동으로 재장착되어야 한다
    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(harness.engine.inspectRig()?.parts.some((p) => p.id === "extra:hand-prop")).toBe(true);

    // 소품 해제(null) 시 원래 파츠·메시 수로 누수 없이 복원되어야 한다
    await harness.engine.setHandProp(null);
    expect(harness.engine.inspectRig()?.parts).toHaveLength(basePartCount);
    expect(harness.engine.inspectScene().meshCount).toBe(baseMeshCount);
  });
});
