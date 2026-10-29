import { VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

import { createAvatarForgeState, sanitizeAvatarForgeState, type AvatarForgeState } from "./studio-vrm-avatar-forge";
import { readAvatarForgeVrmAuthoring, withAvatarForgeVrmAuthoring } from "./studio-vrm-avatar-forge-authoring";
import { STUDIO_VRM_EXPORT_LICENSE_URL } from "./studio-vrm-export-vrm-extension";
import {
  createStudioVrmGenerateExportMetaDraft,
  validateStudioVrmGenerateExportMeta,
} from "./studio-vrm-generate-export-meta";
import {
  addStudioVrmCustomExpression,
  STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES,
  STUDIO_VRM_DEFAULT_FACE_MORPHS,
  STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS,
  STUDIO_VRM_EXPRESSION_PARAM_KEYS,
  STUDIO_VRM_EXPRESSION_PARAMS,
  STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS,
  type StudioVrmExpressionAuthoring,
} from "./studio-vrm-generate-expressions";
import { applyStudioVrmHairSwayPreset, STUDIO_VRM_HAIR_SWAY_GROUP_IDS } from "./studio-vrm-generate-hair-sway";
import {
  createStudioVrmGenerateRecipe,
  exportStudioVrmFromGenerateRecipe,
  listStudioVrmGenerateHairSwayGroups,
  STUDIO_VRM_GENERATE_DEFAULT_PRESET_ID,
} from "./studio-vrm-generate-recipe";
import {
  createDefaultStudioVrmSceneDocument,
  parseStudioVrmSceneDocument,
  serializeStudioVrmSceneDocument,
} from "./studio-vrm-scene-document";
import { buildStudioVrmHumanoidMesh, STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES } from "./studio-vrm-humanoid-mesh";

(globalThis as unknown as { self: typeof globalThis }).self = globalThis;

async function loadVrmBytes(bytes: Uint8Array<ArrayBuffer>): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise<{ userData: { vrm: VRM } }>((resolve, reject) => {
    loader.parse(bytes.slice().buffer as ArrayBuffer, "", resolve as never, reject);
  });
  return gltf.userData.vrm;
}

type GltfJson = {
  readonly images?: readonly { readonly mimeType?: string; readonly name?: string }[];
  readonly extensions: {
    readonly VRMC_vrm: {
      readonly meta: Record<string, unknown>;
      readonly expressions: {
        readonly preset: Record<string, { readonly overrideBlink?: string }>;
        readonly custom?: Record<string, { readonly overrideBlink?: string; readonly overrideMouth?: string }>;
      };
    };
    readonly VRMC_springBone?: {
      readonly springs: readonly {
        readonly name: string;
        readonly joints: readonly { readonly stiffness: number; readonly gravityPower: number; readonly dragForce: number }[];
      }[];
    };
  };
};

function gltfJson(bytes: Uint8Array<ArrayBuffer>): GltfJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GltfJson;
}

function exportState(state: AvatarForgeState, extra: Parameters<typeof createStudioVrmGenerateRecipe>[0] = {}) {
  return exportStudioVrmFromGenerateRecipe(createStudioVrmGenerateRecipe({ state, ...extra }));
}

function withExpressions(state: AvatarForgeState, expressions: StudioVrmExpressionAuthoring | undefined) {
  return withAvatarForgeVrmAuthoring(state, { expressions });
}

/** 얼굴 프리미티브(재질 이름)의 모프 하나가 움직이는 정점 델타의 절대값 합. `side` 로 X 부호를 거른다. */
function morphMagnitude(
  state: AvatarForgeState,
  materialName: string,
  target: string,
  side?: "left" | "right",
): number {
  const mesh = buildStudioVrmHumanoidMesh(state);
  const material = mesh.materials.findIndex((entry) => entry.name === materialName);
  const primitive = mesh.parts[mesh.facePartIndex].primitives.find((entry) => entry.material === material);
  const positions = Array.from(primitive?.positions ?? []);
  const deltas = Array.from(primitive?.targets?.find((entry) => entry.name === target)?.positions ?? []);
  let total = 0;
  for (let vertex = 0; vertex * 3 < deltas.length; vertex += 1) {
    const x = positions[vertex * 3];
    if (side === "left" && x <= 0) continue;
    if (side === "right" && x >= 0) continue;
    total += Math.abs(deltas[vertex * 3]) + Math.abs(deltas[vertex * 3 + 1]) + Math.abs(deltas[vertex * 3 + 2]);
  }
  return total;
}

describe("generate authoring: expressions", () => {
  const base = createAvatarForgeState("pop-twin");

  it("leaves bytes unchanged when the authoring settings are empty", () => {
    const empty = sanitizeAvatarForgeState({
      ...base,
      authoring: {
        expressions: { custom: [{ name: "mine", delta: {} }], presets: { happy: { mouthCurve: 0 } } },
        hairSway: { global: { stiffness: 1, gravity: 1, drag: 1 } },
      },
    });
    // 빈 커스텀 표정 하나는 상태에 남지만 모프로는 나가지 않는다.
    expect(readAvatarForgeVrmAuthoring(empty)?.expressions?.custom).toHaveLength(1);
    expect(Buffer.from(exportState(empty)).equals(Buffer.from(exportState(base)))).toBe(true);
  });

  it("bakes a preset edit into only that morph target", () => {
    const edited = withExpressions(base, { presets: { happy: { mouthCurve: 1, browRaise: 0.5 } } });
    expect(morphMagnitude(edited, "Face_Mouth", "happy")).not.toBeCloseTo(morphMagnitude(base, "Face_Mouth", "happy"), 6);
    expect(morphMagnitude(edited, "Face_Brow", "happy")).toBeGreaterThan(morphMagnitude(base, "Face_Brow", "happy"));
    expect(morphMagnitude(edited, "Face_Mouth", "angry")).toBeCloseTo(morphMagnitude(base, "Face_Mouth", "angry"), 9);
    expect(buildStudioVrmHumanoidMesh(edited).morphTargetNames).toEqual([...STUDIO_VRM_HUMANOID_MORPH_TARGET_NAMES]);
  });

  it("winks one eye while the mouth still smiles", () => {
    const { authoring } = addStudioVrmCustomExpression(undefined, "wink");
    const winking = withExpressions(base, authoring);
    expect(buildStudioVrmHumanoidMesh(winking).morphTargetNames.at(-1)).toBe("wink");
    expect(morphMagnitude(winking, "Face_EyeWhite", "wink", "left")).toBeGreaterThan(0);
    expect(morphMagnitude(winking, "Face_EyeWhite", "wink", "right")).toBe(0);
    expect(morphMagnitude(winking, "Face_Mouth", "wink")).toBeGreaterThan(0);
  });

  it("exports custom expressions that three-vrm loads next to the presets", async () => {
    let authoring = addStudioVrmCustomExpression(undefined, "shock").authoring;
    authoring = addStudioVrmCustomExpression(authoring, "pout").authoring;
    authoring = addStudioVrmCustomExpression(authoring, "mine").authoring;
    const bytes = exportState(withExpressions(base, authoring));

    const json = gltfJson(bytes);
    const custom = json.extensions.VRMC_vrm.expressions.custom ?? {};
    // 아직 조정하지 않은 "내 표정"은 내보내지 않는다.
    expect(Object.keys(custom).sort()).toEqual(["pout", "shock"]);
    expect(custom.shock).toMatchObject({ overrideBlink: "block", overrideMouth: "blend" });
    expect(custom.pout).toMatchObject({ overrideMouth: "blend" });
    expect(Object.keys(json.extensions.VRMC_vrm.expressions.preset)).toHaveLength(STUDIO_VRM_DEFAULT_FACE_MORPHS.length);

    const vrm = await loadVrmBytes(bytes);
    expect(vrm.expressionManager?.getExpression("shock")).not.toBeNull();
    expect(vrm.expressionManager?.getExpression("pout")).not.toBeNull();
    expect(vrm.expressionManager?.getExpression("happy")).not.toBeNull();
    expect(vrm.expressionManager?.getExpression("mine")).toBeNull();
  }, 60_000);

  it("upgrades a preset's blink override when the edit closes the eyes", () => {
    const sleepyAngry = withExpressions(base, { presets: { angry: { eyeClose: 0.8 } } });
    const preset = gltfJson(exportState(sleepyAngry)).extensions.VRMC_vrm.expressions.preset;
    expect(preset.angry?.overrideBlink).toBe("block");
    expect(preset.sad?.overrideBlink).toBe("blend");
  });
});

describe("generate authoring: hair sway", () => {
  const base = createAvatarForgeState("hime-noble");

  it("multiplies every hair spring joint by the chosen preset", () => {
    const still = withAvatarForgeVrmAuthoring(base, { hairSway: applyStudioVrmHairSwayPreset(undefined, "still") });
    const before = gltfJson(exportState(base)).extensions.VRMC_springBone?.springs ?? [];
    const after = gltfJson(exportState(still)).extensions.VRMC_springBone?.springs ?? [];
    expect(after.map((spring) => spring.name)).toEqual(before.map((spring) => spring.name));
    expect(before.length).toBeGreaterThan(0);
    after.forEach((spring, springIndex) => {
      spring.joints.forEach((joint, jointIndex) => {
        const original = before[springIndex].joints[jointIndex];
        expect(joint.stiffness).toBeCloseTo(original.stiffness * 3, 9);
        expect(joint.gravityPower).toBeCloseTo(original.gravityPower * 0.4, 9);
        expect(joint.dragForce).toBeCloseTo(Math.min(1, original.dragForce * 1.6), 9);
      });
    });
  });

  it("limits a group adjustment to that group's chains", () => {
    const bangsOnly = withAvatarForgeVrmAuthoring(base, { hairSway: { groups: { bang: { stiffness: 2 } } } });
    const before = gltfJson(exportState(base)).extensions.VRMC_springBone?.springs ?? [];
    const after = gltfJson(exportState(bangsOnly)).extensions.VRMC_springBone?.springs ?? [];
    after.forEach((spring, index) => {
      const ratio = spring.joints[0].stiffness / before[index].joints[0].stiffness;
      expect(ratio).toBeCloseTo(spring.name.startsWith("Hair_bang-") ? 2 : 1, 9);
    });
    expect(after.some((spring) => spring.name.startsWith("Hair_bang-"))).toBe(true);
  });

  it("lists exactly the groups whose multiplier reaches an exported spring", () => {
    // 정수리 번(elegant-bun)·땋은 머리(braid-scholar)·반묶음(halfup-idol)은 파츠 역할과 체인이 갈린다.
    for (const presetId of ["elegant-bun", "braid-scholar", "halfup-idol", "pop-twin"]) {
      const state = createAvatarForgeState(presetId);
      const before = gltfJson(exportState(state)).extensions.VRMC_springBone?.springs ?? [];
      const listed = listStudioVrmGenerateHairSwayGroups(state);
      for (const group of STUDIO_VRM_HAIR_SWAY_GROUP_IDS) {
        const tuned = withAvatarForgeVrmAuthoring(state, { hairSway: { groups: { [group]: { stiffness: 2 } } } });
        const after = gltfJson(exportState(tuned)).extensions.VRMC_springBone?.springs ?? [];
        const reached = after.some((spring, index) => spring.joints[0].stiffness !== before[index].joints[0].stiffness);
        expect(reached, `${presetId} ${group}`).toBe(listed.includes(group));
      }
    }
  });
});

describe("generate authoring: avatar info and thumbnail", () => {
  it("embeds the author's meta and a thumbnail that three-vrm accepts", async () => {
    const draft = {
      ...createStudioVrmGenerateExportMetaDraft({ avatarName: "하늘 시노" }),
      authors: "하늘 작가",
      contactInformation: "sky@example.com",
      otherLicenseUrl: "https://example.com/terms",
    };
    const validation = validateStudioVrmGenerateExportMeta(draft);
    if (!validation.ok) throw new Error("expected a valid draft");
    // 헤더만 있는 PNG 도 VRM 메타 관점에서는 유효한 이미지 바이트다(로더는 썸네일을 디코드하지 않는다).
    const thumbnail = { mimeType: "image/png" as const, bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) };
    const bytes = exportState(createAvatarForgeState("soft-bob"), { exportMeta: validation.meta, thumbnail });

    const json = gltfJson(bytes);
    expect(json.images).toEqual([expect.objectContaining({ name: "Thumbnail", mimeType: "image/png" })]);
    expect(json.extensions.VRMC_vrm.meta).toMatchObject({
      name: "하늘 시노",
      authors: ["하늘 작가"],
      licenseUrl: STUDIO_VRM_EXPORT_LICENSE_URL,
      contactInformation: "sky@example.com",
      otherLicenseUrl: "https://example.com/terms",
      thumbnailImage: 0,
      avatarPermission: "onlyAuthor",
      allowRedistribution: false,
    });

    const vrm = await loadVrmBytes(bytes);
    const meta = vrm.meta as { name?: string; authors?: readonly string[] };
    expect(meta.name).toBe("하늘 시노");
    expect(meta.authors).toEqual(["하늘 작가"]);
  }, 60_000);
});

describe("generate authoring: default style substitution", () => {
  it("keeps edited expressions when an untouched look falls back to the default style", () => {
    const { authoring } = addStudioVrmCustomExpression(undefined, "laugh");
    const recipe = createStudioVrmGenerateRecipe({ state: withExpressions(createAvatarForgeState(), authoring) });
    expect(recipe.appliedDefaultPresetId).toBe(STUDIO_VRM_GENERATE_DEFAULT_PRESET_ID);
    expect(recipe.state.hair.style).not.toBe("none");
    expect(readAvatarForgeVrmAuthoring(recipe.state)?.expressions?.custom?.map((entry) => entry.name)).toEqual(["laugh"]);
  });
});

describe("generate authoring: persistence", () => {
  it("survives the VRM scene document envelope at its largest size", () => {
    // 저장 경계(studio-vrm-scene-document)는 키 하나라도 규칙을 어기면 조형 데이터 전체를 버린다.
    // 가장 큰 저작 설정을 넣어 키 패턴·깊이·노드 한도를 모두 통과하는지 확인한다.
    const everyParam = Object.fromEntries(
      STUDIO_VRM_EXPRESSION_PARAM_KEYS.map((key) => [key, STUDIO_VRM_EXPRESSION_PARAMS[key].max]),
    );
    let expressions: StudioVrmExpressionAuthoring | undefined = {
      presets: Object.fromEntries(STUDIO_VRM_EDITABLE_EXPRESSION_PRESETS.map((spec) => [spec.name, everyParam])),
    };
    for (let index = 0; index < STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS; index += 1) {
      const template = STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES[index % STUDIO_VRM_CUSTOM_EXPRESSION_TEMPLATES.length];
      expressions = addStudioVrmCustomExpression(expressions, template.id).authoring;
    }
    const hairSway = {
      global: { stiffness: 2, gravity: 2, drag: 1.2 },
      groups: Object.fromEntries(STUDIO_VRM_HAIR_SWAY_GROUP_IDS.map((id) => [id, { stiffness: 0.5, gravity: 1.5, drag: 0.8 }])),
    };
    const avatarForge = withAvatarForgeVrmAuthoring(createAvatarForgeState("wave-diva"), { expressions, hairSway });
    expect(readAvatarForgeVrmAuthoring(avatarForge)?.expressions?.custom).toHaveLength(STUDIO_VRM_MAX_CUSTOM_EXPRESSIONS);

    const scene = {
      ...createDefaultStudioVrmSceneDocument(),
      appearance: { ...createDefaultStudioVrmSceneDocument().appearance, avatarForge },
    };
    const serialized = serializeStudioVrmSceneDocument(scene);
    expect(serialized).not.toBeNull();
    const restored = parseStudioVrmSceneDocument(serialized!)?.appearance.avatarForge;
    expect(restored).toEqual(avatarForge);
    expect(readAvatarForgeVrmAuthoring(sanitizeAvatarForgeState(restored))).toEqual(
      readAvatarForgeVrmAuthoring(avatarForge),
    );
  });
});
