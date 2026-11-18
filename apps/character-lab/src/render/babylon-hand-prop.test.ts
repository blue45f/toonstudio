/**
 * BabylonCharacterEngine 3D 에셋 26종 & 2인 듀오 스테이지(상대역 표정 MorphTarget + 전용 손소품) & 3D 효과음 스탬프 통합 검증:
 * - 손 소품 7종(`webtoon-hand-props-v1`) · 머리 액세서리 6종(`webtoon-head-props-v1`) · 배경 스테이지 7종(`webtoon-stage-props-v1`) · 효과음 스탬프 6종(`webtoon-sfx-stamps-v1`) SHA-256 검증 로드
 * - 실제 SHAPER 상대역 캐릭터 GLB(`shaper-noir-duke.glb`) 3D 듀오 동시 배치(`extra:duo-partner`, 표정 MorphTarget + `imperial-scroll` 전용 손소품 `extra:duo-partner-prop`)
 * - 손(250) + 머리(251) + 스테이지(252) + 효과음 스탬프(254) + 3D 상대역(220.. + 249) 5중 동시 배치 및 카메라 프레이밍 불변, 툰 전환, 단일 투샷 GLB 직렬화 보존 확인
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_FRAMING, DEFAULT_SHADING } from "../contracts";
import { parseGlb } from "../testing/minimal-glb";

import { createNullEngineHarness } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { HandPropId, HeadPropId, SfxStampId, StagePropId } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));
const HAND_PROPS_DIR = resolve(PUBLIC_DIR, "assets/props/webtoon-hand-props-v1");
const HEAD_PROPS_DIR = resolve(PUBLIC_DIR, "assets/props/webtoon-head-props-v1");
const STAGE_PROPS_DIR = resolve(PUBLIC_DIR, "assets/props/webtoon-stage-props-v1");
const SFX_STAMPS_DIR = resolve(PUBLIC_DIR, "assets/props/webtoon-sfx-stamps-v1");

interface PropManifestEntry<TId extends string> {
  readonly id: TId;
  readonly labelKo: string;
  readonly meshName: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly triangles: number;
}

describe("BabylonCharacterEngine 3D 에셋 26종 & 2인 듀오 상대역 표정/손소품 & 효과음 스탬프 + 투샷 GLB 보존", () => {
  let harness: NullEngineHarness;

  beforeEach(async () => {
    harness = await createNullEngineHarness({
      now: () => 2_000,
      fetchBytes: async (url) => {
        const rel = url.replace(/^\//u, "");
        const buf = await readFile(resolve(PUBLIC_DIR, rel));
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      },
    });
  });

  afterEach(() => {
    harness.dispose();
  });

  it("Blender 5.3 에셋 26종(손 7·머리 6·스테이지 7·효과음 6) + SHAPER 3D 상대역(표정·황실 두루마리 손소품) 5중 동시 배치·투샷 GLB 보존·누수 없는 해제를 만족한다", async () => {
    const handManifest = JSON.parse(await readFile(resolve(HAND_PROPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry<HandPropId>[];
    };
    const headManifest = JSON.parse(await readFile(resolve(HEAD_PROPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry<HeadPropId>[];
    };
    const stageManifest = JSON.parse(await readFile(resolve(STAGE_PROPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry<StagePropId>[];
    };
    const sfxManifest = JSON.parse(await readFile(resolve(SFX_STAMPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry<SfxStampId>[];
    };

    expect(handManifest.props).toHaveLength(7);
    expect(headManifest.props).toHaveLength(6);
    expect(stageManifest.props).toHaveLength(7);
    expect(sfxManifest.props).toHaveLength(6);

    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    const basePartCount = harness.engine.inspectRig()?.parts.length ?? 0;
    const baseMeshCount = harness.engine.inspectScene().meshCount;

    harness.engine.setCamera({ ...DEFAULT_FRAMING, mode: "face" });
    const baseFaceCamPos = harness.engine.viewportCamera().position;

    for (const entry of handManifest.props) {
      await harness.engine.setHandProp({
        propId: entry.id,
        hand: "rightHand",
        glbUrl: `/assets/props/webtoon-hand-props-v1/${entry.path}`,
        sha256: entry.sha256,
      });
      expect(harness.engine.inspectRig()?.parts.find((p) => p.id === "extra:hand-prop")?.triangleCount).toBe(entry.triangles);
    }

    for (const entry of headManifest.props) {
      await harness.engine.setHeadProp({
        propId: entry.id,
        glbUrl: `/assets/props/webtoon-head-props-v1/${entry.path}`,
        sha256: entry.sha256,
      });
      expect(harness.engine.inspectRig()?.parts.find((p) => p.id === "extra:head-prop")?.triangleCount).toBe(entry.triangles);
    }

    for (const entry of stageManifest.props) {
      await harness.engine.setStageProp({
        propId: entry.id,
        glbUrl: `/assets/props/webtoon-stage-props-v1/${entry.path}`,
        sha256: entry.sha256,
      });
      expect(harness.engine.inspectRig()?.parts.find((p) => p.id === "extra:stage-prop")?.triangleCount).toBe(entry.triangles);
    }

    for (const entry of sfxManifest.props) {
      await harness.engine.setSfxStamp({
        stampId: entry.id,
        glbUrl: `/assets/props/webtoon-sfx-stamps-v1/${entry.path}`,
        sha256: entry.sha256,
      });
      expect(harness.engine.inspectRig()?.parts.find((p) => p.id === "extra:sfx-stamp")?.triangleCount).toBe(entry.triangles);
    }

    const scrollEntry = handManifest.props.find((p) => p.id === "imperial-scroll")!;
    await harness.engine.setDuoPartner({
      characterId: "shaper-noir-duke",
      glbUrl: "/assets/characters/shaper-noir-duke/shaper-noir-duke.glb",
      sha256: "98b038f6474f966e22d1c33e211119cb4788877b2c681130d13488ba59d2abec",
      side: "right",
      distanceMeters: 0.95,
      heightScale: 1.12,
      stance: "attentive",
      expression: "cold-smirk",
      handProp: {
        propId: scrollEntry.id,
        hand: "leftHand",
        glbUrl: `/assets/props/webtoon-hand-props-v1/${scrollEntry.path}`,
        sha256: scrollEntry.sha256,
      },
    });

    const duoParts = harness.engine.inspectRig()?.parts.filter((p) => p.id.startsWith("extra:duo-partner")) ?? [];
    expect(duoParts.length).toBeGreaterThanOrEqual(7);
    expect(duoParts.some((p) => p.id === "extra:duo-partner-prop" && p.triangleCount === scrollEntry.triangles)).toBe(true);
    expect(duoParts.some((p) => p.meshNames.some((n) => n.includes("_LOD1") || n.includes("_LOD2")))).toBe(false);
    expect(harness.engine.inspectRig()?.parts).toHaveLength(basePartCount + 4 + duoParts.length);

    harness.engine.setCamera({ ...DEFAULT_FRAMING, mode: "face" });
    const stageFaceCamPos = harness.engine.viewportCamera().position;
    expect(stageFaceCamPos[0]).toBeCloseTo(baseFaceCamPos[0], 4);
    expect(stageFaceCamPos[1]).toBeCloseTo(baseFaceCamPos[1], 4);
    expect(stageFaceCamPos[2]).toBeCloseTo(baseFaceCamPos[2], 4);

    harness.engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    for (const extraPart of harness.engine.inspectRig()?.parts.filter((p) => p.id.startsWith("extra:")) ?? []) {
      expect(extraPart.materialClass).toBe("ShaderMaterial");
    }

    // 단일 투샷 GLB 내보내기 시 신규 예고장·장미(calling-card-rose)와 보석 진열대(velvet-display-pedestal) 앵커 노드가 모두 직렬화 보존된다
    const glbBytes = await harness.engine.exportGlb();
    const parsed = parseGlb(glbBytes);
    const gltf = parsed.json as { nodes: Array<{ name?: string }> };
    const nodeNames = gltf.nodes.map((n) => n.name ?? "");
    expect(nodeNames.some((n) => n.includes("TS_HandPropAnchor_calling-card-rose"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_HeadPropAnchor_silver-monocle"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_StagePropAnchor_velvet-display-pedestal"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_SfxStampAnchor_beonjjeok"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_DuoPartnerAnchor_shaper-noir-duke"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_DuoPartnerPropAnchor_imperial-scroll"))).toBe(true);

    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(harness.engine.inspectRig()?.parts).toHaveLength(basePartCount + 4 + duoParts.length);

    await harness.engine.setHandProp(null);
    await harness.engine.setHeadProp(null);
    await harness.engine.setStageProp(null);
    await harness.engine.setSfxStamp(null);
    await harness.engine.setDuoPartner(null);
    expect(harness.engine.inspectRig()?.parts).toHaveLength(basePartCount);
    expect(harness.engine.inspectScene().meshCount).toBe(baseMeshCount);
  });
});
