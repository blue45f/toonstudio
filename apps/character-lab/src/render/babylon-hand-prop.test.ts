/**
 * BabylonCharacterEngine 3D 소품 & 2인 듀오 스테이지(`setHandProp` · `setHeadProp` · `setStageProp` · `setDuoPartner`) 통합 검증:
 * - 손 소품 4종(`webtoon-hand-props-v1`) · 머리 액세서리 4종(`webtoon-head-props-v1`) · 배경 스테이지 5종(`webtoon-stage-props-v1`) SHA-256 검증 로드
 * - 실제 SHAPER 상대역 캐릭터 GLB(`shaper-noir-duke.glb`) 3D 듀오 동시 배치(`extra:duo-partner`, LOD0 헤어 선별 + 대화 스탠스 포즈)
 * - 손(250) + 머리(251) + 스테이지(252) + 3D 상대역(253) 4중 동시 배치 및 카메라 프레이밍 중심 불변, 툰 전환, 단일 투샷 GLB 직렬화 보존 확인
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_FRAMING, DEFAULT_SHADING } from "../contracts";
import { parseGlb } from "../testing/minimal-glb";

import { createNullEngineHarness } from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { HandPropId, HeadPropId, StagePropId } from "../contracts";
import type { NullEngineHarness } from "./testing/null-engine-harness";

const PUBLIC_DIR = resolve(process.cwd(), "public");
const HAND_PROPS_DIR = resolve(PUBLIC_DIR, "assets/props/webtoon-hand-props-v1");
const HEAD_PROPS_DIR = resolve(PUBLIC_DIR, "assets/props/webtoon-head-props-v1");
const STAGE_PROPS_DIR = resolve(PUBLIC_DIR, "assets/props/webtoon-stage-props-v1");

interface PropManifestEntry<TId extends string> {
  readonly id: TId;
  readonly labelKo: string;
  readonly meshName: string;
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly triangles: number;
}

describe("BabylonCharacterEngine 3D 소품 13종 & 2인 듀오 스테이지 어태치먼트 + 투샷 GLB 보존", () => {
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

  it("Blender 5.3 소품 13종(손 4·머리 4·스테이지 5) + SHAPER 3D 상대역 캐릭터 4중 동시 배치·투샷 GLB 보존·누수 없는 해제를 만족한다", async () => {
    const handManifest = JSON.parse(await readFile(resolve(HAND_PROPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry<HandPropId>[];
    };
    const headManifest = JSON.parse(await readFile(resolve(HEAD_PROPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry<HeadPropId>[];
    };
    const stageManifest = JSON.parse(await readFile(resolve(STAGE_PROPS_DIR, "index.json"), "utf8")) as {
      readonly props: readonly PropManifestEntry<StagePropId>[];
    };

    expect(handManifest.props).toHaveLength(4);
    expect(headManifest.props).toHaveLength(4);
    expect(stageManifest.props).toHaveLength(5);

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

    // 4번째 슬롯: 실제 SHAPER 북부대공 3D 패키지 GLB를 우측 0.95m 위치에 3D 듀오 파트너로 동시 배치
    await harness.engine.setDuoPartner({
      characterId: "shaper-noir-duke",
      glbUrl: "/assets/characters/shaper-noir-duke/shaper-noir-duke.glb",
      sha256: "98b038f6474f966e22d1c33e211119cb4788877b2c681130d13488ba59d2abec",
      side: "right",
      distanceMeters: 0.95,
      heightScale: 1.12,
      stance: "arms-crossed",
    });

    const duoParts = harness.engine.inspectRig()?.parts.filter((p) => p.id.startsWith("extra:duo-partner")) ?? [];
    expect(duoParts.length).toBeGreaterThanOrEqual(6);
    // LOD1·LOD2 헤어는 필터링되어 가시 메시 목록에 포함되지 않아야 한다
    expect(duoParts.some((p) => p.meshNames.some((n) => n.includes("_LOD1") || n.includes("_LOD2")))).toBe(false);
    expect(harness.engine.inspectRig()?.parts).toHaveLength(basePartCount + 3 + duoParts.length);

    // 4중 배치 상태에서도 얼굴 클로즈업 카메라는 주 캐릭터 두상에 그대로 고정되어야 한다
    harness.engine.setCamera({ ...DEFAULT_FRAMING, mode: "face" });
    const stageFaceCamPos = harness.engine.viewportCamera().position;
    expect(stageFaceCamPos[0]).toBeCloseTo(baseFaceCamPos[0], 4);
    expect(stageFaceCamPos[1]).toBeCloseTo(baseFaceCamPos[1], 4);
    expect(stageFaceCamPos[2]).toBeCloseTo(baseFaceCamPos[2], 4);

    // 툰 셰이딩 전환 시 4개 슬롯(다중 재질 듀오 파트너 포함) 모두 ShaderMaterial로 동기 전환
    harness.engine.setShading({ ...DEFAULT_SHADING, mode: "toon" });
    for (const extraPart of harness.engine.inspectRig()?.parts.filter((p) => p.id.startsWith("extra:")) ?? []) {
      expect(extraPart.materialClass).toBe("ShaderMaterial");
    }

    // 단일 투샷 GLB 내보내기 시 4개 슬롯 앵커 노드가 모두 직렬화 보존된다
    const glbBytes = await harness.engine.exportGlb();
    const parsed = parseGlb(glbBytes);
    const gltf = parsed.json as { nodes: Array<{ name?: string }> };
    const nodeNames = gltf.nodes.map((n) => n.name ?? "");
    expect(nodeNames.some((n) => n.includes("TS_HandPropAnchor_aether-blade"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_HeadPropAnchor_pearl-earrings-pin"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_StagePropAnchor_noir-interrogation-lamp"))).toBe(true);
    expect(nodeNames.some((n) => n.includes("TS_DuoPartnerAnchor_shaper-noir-duke"))).toBe(true);

    // 주 캐릭터 재로드 시 4개 슬롯 모두 자동 재부착
    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    expect(harness.engine.inspectRig()?.parts).toHaveLength(basePartCount + 3 + duoParts.length);

    // 4개 슬롯 해제(null) 시 원래 파츠·메시 수로 누수 없이 정리
    await harness.engine.setHandProp(null);
    await harness.engine.setHeadProp(null);
    await harness.engine.setStageProp(null);
    await harness.engine.setDuoPartner(null);
    expect(harness.engine.inspectRig()?.parts).toHaveLength(basePartCount);
    expect(harness.engine.inspectScene().meshCount).toBe(baseMeshCount);
  });
});
