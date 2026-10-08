import { describe, expect, it } from "vitest";

import { CHARACTER_SLOT_KINDS, KIT_REQUIRED_PRESETS, SLOT_PRESET_IDS, parseKitManifest } from "../../contracts";

import { compareKitCapabilities, deriveKitCapabilities, kitCapabilityDifferences } from "./kit-capability";
import { kitManifestFixture, kitManifestJson } from "./kit-test-fixture";

import type { KitBaseId, KitManifest, SlotCapability, SlotCapabilityMap } from "../../contracts";

function parsed(raw: unknown): KitManifest {
  const result = parseKitManifest(raw);
  if (!result.ok) throw new Error(result.failure.reasonKo);
  return result.manifest;
}

function mapMeshMorphs(manifest: KitManifest, baseId: KitBaseId, role: string, remove: (name: string) => boolean): KitManifest {
  const base = manifest.bases[baseId];
  if (base === undefined) throw new Error("테스트 설정 오류: 베이스 없음");
  const meshes = base.meshes.map((mesh) => (mesh.role === role ? { ...mesh, morphs: mesh.morphs.filter((name) => !remove(name)) } : mesh));
  return { ...manifest, bases: { ...manifest.bases, [baseId]: { ...base, meshes } } };
}

describe("authored/kit-capability — 규칙 판정", () => {
  it("모든 파츠·morph·본이 있는 여성 베이스는 15슬롯이 전부 available이다", () => {
    const capabilities = deriveKitCapabilities(kitManifestFixture(), "female");
    for (const slot of CHARACTER_SLOT_KINDS) expect(capabilities[slot], slot).toEqual({ status: "available" });
    expect(Object.keys(capabilities)).toHaveLength(15);
    expect(Object.isFrozen(capabilities)).toBe(true);
  });

  it("남성 베이스는 필수 파츠만 있으면 파츠 슬롯이 partial이고 미제공 프리셋마다 한글 사유가 붙는다", () => {
    const manifest = kitManifestFixture();
    const male = deriveKitCapabilities(manifest, "male");
    expect(male.hair.status).toBe("partial");
    expect(male.hair.reasonKo).toBe("제공 1/7종, 미제공: short-layered, romance-long, action-pony, hime-cut, wolf-layered, twin-tail");
    expect(Object.keys(male.hair.unavailablePresets ?? {})).toEqual(SLOT_PRESET_IDS.hair.filter((name) => name !== "soft-bob").map((name) => `hair/${name}`));
    expect(male.hair.unavailablePresets?.["hair/twin-tail"]).toBe("남성 핏 미제작");
    expect(male.top.reasonKo).toBe("제공 1/5종, 미제공: hoodie, shirt, blazer, sailor");
    expect(male.irises.status).toBe("partial");
    // 필수 파츠 자체는 미제공 목록에 들어가지 않는다
    for (const id of KIT_REQUIRED_PRESETS) {
      const slot = id.slice(0, id.indexOf("/")) as keyof SlotCapabilityMap;
      expect(male[slot].unavailablePresets?.[id], id).toBeUndefined();
    }
    // 변형이 하나도 없는 슬롯은 unavailable(프리셋 맵 없음)
    expect(male.accessory).toEqual({ status: "unavailable", reasonKo: "키트가 male 베이스용 액세서리 파츠를 제공하지 않습니다(0/6종)." });
    // 몸·얼굴·표정·포즈는 베이스와 무관하게 morph/본 기준이라 그대로 available
    for (const slot of ["face-shape", "eyes", "nose", "mouth", "ears", "body", "expression", "pose", "hand-pose"] as const) {
      expect(male[slot].status, slot).toBe("available");
    }
  });

  it("남성에게 일부 프리셋을 추가하면 제공 수와 미제공 목록이 따라 바뀐다", () => {
    const manifest = kitManifestFixture({ malePresets: [...KIT_REQUIRED_PRESETS, "hair/short-layered", "accessory/glasses"] });
    const male = deriveKitCapabilities(manifest, "male");
    expect(male.hair.reasonKo).toBe("제공 2/7종, 미제공: romance-long, action-pony, hime-cut, wolf-layered, twin-tail");
    expect(male.accessory.status).toBe("partial");
    expect(male.accessory.reasonKo).toBe("제공 1/6종, 미제공: ribbon, cap, earrings, choker, headphones");
  });

  it("여성 변형이 빠진 프리셋은 여성 슬롯을 partial로 만들고 사유를 그대로 싣는다", () => {
    const manifest = kitManifestFixture({ omitFemale: ["hair/twin-tail", "top/sailor"] });
    const female = deriveKitCapabilities(manifest, "female");
    expect(female.hair).toEqual({ status: "partial", reasonKo: "제공 6/7종, 미제공: twin-tail", unavailablePresets: { "hair/twin-tail": "여성 핏 미제작" } });
    expect(female.top.unavailablePresets).toEqual({ "top/sailor": "여성 핏 미제작" });
    expect(female.bottom).toEqual({ status: "available" });
  });

  it("베이스가 manifest에 없으면 전부 unavailable(방어)", () => {
    const manifest = kitManifestFixture({ male: false });
    const male = deriveKitCapabilities(manifest, "male");
    for (const slot of CHARACTER_SLOT_KINDS) expect(male[slot]).toEqual({ status: "unavailable", reasonKo: "키트에 male 베이스가 없습니다." });
  });

  it("같은 입력은 같은 결과다(결정적)", () => {
    const manifest = kitManifestFixture();
    expect(deriveKitCapabilities(manifest, "male")).toEqual(deriveKitCapabilities(manifest, "male"));
  });

  it("얼굴 슬롯: 한쪽 방향만 있으면 partial, 축이 없으면 partial(나머지 축만), 전부 없으면 unavailable", () => {
    const manifest = kitManifestFixture();
    const plusOnly = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", (name) => name === "param:eyeSize:-"), "female");
    expect(plusOnly.eyes.status).toBe("partial");
    expect(plusOnly.eyes.reasonKo).toBe("음수 방향 셰이프 키 없음: 눈 크기(eyeSize)");
    expect(plusOnly.nose).toEqual({ status: "available" });

    const minusOnly = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", (name) => name === "param:noseWidth:+"), "female");
    expect(minusOnly.nose.reasonKo).toBe("양수 방향 셰이프 키 없음: 코 너비(noseWidth)");

    const oneAxisGone = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", (name) => name.startsWith("param:earAngle:")), "female");
    expect(oneAxisGone.ears.status).toBe("partial");
    expect(oneAxisGone.ears.reasonKo).toMatch(/키트 머리\(TS_Head\)에 .*earAngle.* 셰이프 키가 없습니다\(나머지 축만 조절\)/u);

    const allGone = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", (name) => name.startsWith("param:mouthWidth:") || name.startsWith("param:lipFullness:")), "female");
    expect(allGone.mouth.status).toBe("unavailable");
    expect(allGone.mouth.reasonKo).toMatch(/TS_Head/u);
  });

  it("표정: FACS 16개 전부 available, 8~15개 partial, 그 미만 unavailable", () => {
    const manifest = kitManifestFixture();
    const facsOnHead = (names: readonly string[]) => (name: string) => names.includes(name);
    const allFacs = (name: string): boolean => name.startsWith("facs:");
    const firstN = (count: number): ((name: string) => boolean) => {
      const keep = new Set<string>(
        manifest.bases.female?.meshes
          .find((mesh) => mesh.role === "head")
          ?.morphs.filter(allFacs)
          .slice(0, count),
      );
      return (name) => allFacs(name) && !keep.has(name);
    };
    expect(deriveKitCapabilities(manifest, "female").expression.status).toBe("available");
    const thirteen = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", facsOnHead(["facs:tongueOut", "facs:cheekPuff", "facs:mouthPress"])), "female").expression;
    expect(thirteen.status).toBe("partial");
    expect(thirteen.reasonKo).toBe("FACS 16유닛 중 13개만 있습니다(없음: cheekPuff, mouthPress, tongueOut).");
    expect(deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", firstN(8)), "female").expression.status).toBe("partial");
    const seven = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", firstN(7)), "female").expression;
    expect(seven.status).toBe("unavailable");
    expect(seven.reasonKo).toMatch(/7\/16/u);
    const none = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "head", allFacs), "female").expression;
    expect(none).toEqual({ status: "unavailable", reasonKo: "키트 머리(TS_Head)에 표정(FACS) 셰이프 키가 없습니다." });
  });

  it("체형: 체형 morph·관절 오프셋·55본이 모두 있어야 available, 일부면 partial, 전혀 없으면 unavailable", () => {
    const manifest = kitManifestFixture();
    const noHipOffset = { ...manifest, jointOffsets: Object.fromEntries(Object.entries(manifest.jointOffsets).filter(([name]) => !name.startsWith("param:hip:"))) };
    const hip = deriveKitCapabilities(noHipOffset, "female").body;
    expect(hip.status).toBe("partial");
    expect(hip.reasonKo).toBe("관절 오프셋 2개 없음: param:hip:+, param:hip:-");

    // waist·chestDepth는 관절이 안 움직여도 된다(필수 오프셋 목록에 없다)
    const noWaist = { ...manifest, jointOffsets: { ...manifest.jointOffsets, "param:waist:+": {} } };
    expect(deriveKitCapabilities(noWaist, "female").body).toEqual({ status: "available" });

    const noBodyMorph = deriveKitCapabilities(mapMeshMorphs(manifest, "female", "skin", (name) => name === "param:waist:+"), "female").body;
    expect(noBodyMorph.status).toBe("partial");
    expect(noBodyMorph.reasonKo).toBe("TS_Body 체형 셰이프 키 1개 없음: param:waist:+");

    const lessBones = { ...manifest, skeleton: { ...manifest.skeleton, boneMap: Object.fromEntries(Object.entries(manifest.skeleton.boneMap).filter(([joint]) => joint !== "TS_Jaw")) } };
    const jaw = deriveKitCapabilities(lessBones, "female");
    expect(jaw.body.reasonKo).toBe("휴머노이드 본 54/55만 매핑됨(없음: jaw)");
    // jaw는 필수 15본이 아니고 손가락도 아니라 포즈 슬롯은 그대로
    expect(jaw.pose.status).toBe("available");

    const nothing = { ...mapMeshMorphs(manifest, "female", "skin", () => true), jointOffsets: {}, skeleton: { ...manifest.skeleton, boneMap: {} } };
    const empty = deriveKitCapabilities(nothing, "female");
    expect(empty.body).toEqual({ status: "unavailable", reasonKo: "키트에 체형 셰이프 키·관절 오프셋·휴머노이드 본이 없습니다." });
    expect(empty.pose).toEqual({ status: "unavailable", reasonKo: "키트에 휴머노이드 본 매핑이 없습니다(스켈레톤 없음)." });
    expect(empty["hand-pose"]).toEqual({ status: "unavailable", reasonKo: "키트에 손가락 본 매핑이 없습니다." });
  });

  it("포즈·손 포즈: boneMap의 필수 15본·손가락 30본 커버리지로 판정한다", () => {
    const manifest = kitManifestFixture();
    const dropJoints = (...joints: string[]): KitManifest => ({
      ...manifest,
      skeleton: { ...manifest.skeleton, boneMap: Object.fromEntries(Object.entries(manifest.skeleton.boneMap).filter(([joint]) => !joints.includes(joint))) },
    });
    const noFoot = deriveKitCapabilities(dropJoints("mixamorig:LeftFoot"), "female");
    expect(noFoot.pose.status).toBe("partial");
    expect(noFoot.pose.reasonKo).toBe("VRM 필수 본 14/15만 매핑됨(없음: leftFoot).");
    expect(noFoot["hand-pose"].status).toBe("available");
    const noThumb = deriveKitCapabilities(dropJoints("mixamorig:RightHandThumb1", "mixamorig:RightHandThumb2"), "female");
    expect(noThumb["hand-pose"].reasonKo).toBe("손가락 본 28/30만 매핑됨(없음: rightThumbMetacarpal, rightThumbProximal).");
    expect(noThumb.pose.status).toBe("available");
    // skeleton.joints에 없는 이름은 boneMap에 있어도 세지 않는다
    const phantom: KitManifest = { ...manifest, skeleton: { ...manifest.skeleton, joints: manifest.skeleton.joints.filter((joint) => joint !== "mixamorig:LeftFoot") } };
    expect(deriveKitCapabilities(phantom, "female").pose.reasonKo).toMatch(/14\/15/u);
  });
});

describe("authored/kit-capability — 선언 대조", () => {
  it("규칙 판정과 같은 선언은 차이가 없고, 사유 문구는 비교하지 않는다", () => {
    const manifest = kitManifestFixture();
    const derived = deriveKitCapabilities(manifest, "male");
    expect(compareKitCapabilities(derived, derived)).toEqual([]);
    const reworded: Partial<Record<keyof SlotCapabilityMap, SlotCapability>> = { ...derived, hair: { ...derived.hair, reasonKo: "다른 문장" } };
    expect(compareKitCapabilities(derived, reworded)).toEqual([]);
    expect(kitCapabilityDifferences(manifest).size).toBe(0);
  });

  it("상태·미제공 프리셋 집합·누락 선언의 차이를 슬롯별 한글 사유로 알린다", () => {
    const derived = deriveKitCapabilities(kitManifestFixture(), "male");
    const status = compareKitCapabilities(derived, { ...derived, hair: { status: "available" } });
    expect(status).toHaveLength(1);
    expect(status[0]?.slot).toBe("hair");
    expect(status[0]?.reasonKo).toBe("헤어(hair): 선언 상태 available이(가) 규칙 판정 partial과 다릅니다.");

    const presets = compareKitCapabilities(derived, { ...derived, top: { ...derived.top, unavailablePresets: { "top/hoodie": "x" } } });
    expect(presets[0]?.reasonKo).toMatch(/^상의\(top\): 미제공 프리셋 목록이 다릅니다/u);

    const { shoes: _omitted, ...withoutShoes } = derived;
    const missing = compareKitCapabilities(derived, withoutShoes);
    expect(missing).toEqual([{ slot: "shoes", reasonKo: "신발(shoes): 선언이 없습니다(규칙 판정 partial)." }]);
  });

  it("manifest 전체 대조는 어긋난 베이스만 모으고, 선언 자체가 없으면 slot null로 알린다", () => {
    const raw = kitManifestJson();
    const tampered = structuredClone(raw) as { slotCapabilities: { male: Record<string, unknown> } };
    tampered.slotCapabilities.male.hair = { status: "available" };
    tampered.slotCapabilities.male.pose = { status: "unavailable", reasonKo: "x" };
    const manifest = parsed(tampered);
    const differences = kitCapabilityDifferences(manifest);
    expect([...differences.keys()]).toEqual(["male"]);
    expect(differences.get("male")?.map((difference) => difference.slot)).toEqual(["hair", "pose"]);

    const original = parsed(raw);
    const lacking: KitManifest = { ...original, slotCapabilities: { female: original.slotCapabilities.female } };
    expect(kitCapabilityDifferences(lacking).get("male")).toEqual([{ slot: null, reasonKo: "slotCapabilities.male 선언이 없습니다." }]);
  });
});
