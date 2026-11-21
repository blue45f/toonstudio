import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  KIT_V2_ALLOWED_EXTENSIONS,
  KIT_V2_ARCHETYPE_IDS,
  KIT_V2_ARCHETYPE_PRESETS,
  KIT_V2_ARCHETYPE_PRESET_LIST,
  KIT_V2_FORBIDDEN_EXTENSIONS,
  KIT_V2_GARMENT_GENRES,
  KIT_V2_HAND_POSE_IDS,
  KIT_V2_HAND_POSE_LABELS_KO,
  archetypePresetToBodyParams,
  isKitV2ArchetypeId,
  parseWebtoonKitV2Manifest,
  summarizeWebtoonKitV2Catalog,
} from "./character-kit-v2-archetypes";

/**
 * 루트 vitest와 앱 vitest 양쪽 cwd에서 실제 디스크의 `toonstudio-kit-v2` 경로를 찾는다.
 */
function resolveKitV2Root(): string {
  const sentinel = "kit.json";
  const candidates: string[] = [];
  const metaDirname: unknown = import.meta.dirname;
  if (typeof metaDirname === "string") {
    candidates.push(path.resolve(metaDirname, "..", "..", "public", "assets", "characters", "toonstudio-kit-v2"));
  }
  const metaUrl: unknown = import.meta.url;
  if (typeof metaUrl === "string" && metaUrl.startsWith("file:")) {
    const dir = path.dirname(fileURLToPath(metaUrl));
    candidates.push(path.resolve(dir, "..", "..", "public", "assets", "characters", "toonstudio-kit-v2"));
  }
  candidates.push(
    path.resolve(process.cwd(), "apps", "character-lab", "public", "assets", "characters", "toonstudio-kit-v2"),
    path.resolve(process.cwd(), "public", "assets", "characters", "toonstudio-kit-v2"),
  );
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, sentinel))) return candidate;
  }
  throw new Error(`toonstudio-kit-v2/kit.json을 찾지 못했습니다(cwd=${process.cwd()}).`);
}

const KIT_V2_ROOT = resolveKitV2Root();
const RAW_KIT_V2_JSON: unknown = JSON.parse(readFileSync(path.join(KIT_V2_ROOT, "kit.json"), "utf8"));

describe("contracts/character-kit-v2-archetypes: 온디스크 toonstudio-kit-v2 실계약 검증", () => {
  it("실제 디스크의 toonstudio-kit-v2/kit.json이 parseWebtoonKitV2Manifest를 100% 통과한다", () => {
    const parsed = parseWebtoonKitV2Manifest(RAW_KIT_V2_JSON, 1_000);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const summary = summarizeWebtoonKitV2Catalog(parsed.manifest);
    expect(summary.kitId).toBe("toonstudio-kit-v2");
    expect(summary.baseCount).toBe(5);
    expect(summary.hairCount).toBe(12);
    expect(summary.garmentCount).toBe(34);
    expect(summary.totalGlbCount).toBe(51);
    expect(summary.handPoseCount).toBe(16);
    expect(summary.handPoseVrmaCount).toBe(16);
    expect(summary.heroVrmCount).toBe(8);
    expect(summary.expressionMorphCount).toBe(64);

    expect(parsed.manifest.bases["female-romance"].headToBodyRatio).toBe(7.8);
    expect(parsed.manifest.bases["male-webtoon"].headToBodyRatio).toBe(8.6);
    expect(parsed.manifest.bases["male-action"].headToBodyRatio).toBe(8.4);
    expect(parsed.manifest.bases["youth-academy"].headToBodyRatio).toBe(7.0);
    expect(parsed.manifest.bases["sd-chibi"].headToBodyRatio).toBe(3.1);
  });

  it("5 베이스 GLB + 12 헤어 GLB + 34 의상 GLB + 16 .vrma 핸드 포즈 파일이 모두 디스크에 존재하고 크기 > 0이다", () => {
    const parsed = parseWebtoonKitV2Manifest(RAW_KIT_V2_JSON, 1_000);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const checkedBases: string[] = [];
    for (const archId of KIT_V2_ARCHETYPE_IDS) {
      const base = parsed.manifest.bases[archId];
      const absPath = path.join(KIT_V2_ROOT, base.file.path);
      expect(existsSync(absPath), base.file.path).toBe(true);
      const stat = statSync(absPath);
      expect(stat.size, base.file.path).toBeGreaterThan(0);
      expect(stat.size, base.file.path).toBe(base.file.bytes);
      checkedBases.push(base.file.path);
    }
    expect(checkedBases).toHaveLength(5);

    const checkedHair: string[] = [];
    const checkedGarments: string[] = [];
    for (const part of parsed.manifest.parts) {
      const variants = Object.values(part.variants);
      expect(variants.length, part.id).toBeGreaterThan(0);
      for (const variant of variants) {
        const absPath = path.join(KIT_V2_ROOT, variant.file.path);
        expect(existsSync(absPath), variant.file.path).toBe(true);
        const stat = statSync(absPath);
        expect(stat.size, variant.file.path).toBeGreaterThan(0);
        expect(stat.size, variant.file.path).toBe(variant.file.bytes);
        if (part.slot === "hair") checkedHair.push(variant.file.path);
        if (part.slot === "garments") checkedGarments.push(variant.file.path);
      }
    }
    expect(checkedHair).toHaveLength(12);
    expect(checkedGarments).toHaveLength(34);
    expect(checkedBases.length + checkedHair.length + checkedGarments.length).toBe(51);

    const handPosesJsonPath = path.join(KIT_V2_ROOT, parsed.manifest.handPoses.file.path);
    expect(existsSync(handPosesJsonPath)).toBe(true);
    expect(statSync(handPosesJsonPath).size).toBeGreaterThan(0);

    const checkedVrmas: string[] = [];
    for (const poseId of parsed.manifest.handPoses.poseIds) {
      const vrmaRel = path.join("hand-poses", "vrma", `${poseId}.vrma`);
      const vrmaAbs = path.join(KIT_V2_ROOT, vrmaRel);
      expect(existsSync(vrmaAbs), vrmaRel).toBe(true);
      expect(statSync(vrmaAbs).size, vrmaRel).toBeGreaterThan(0);
      checkedVrmas.push(vrmaRel);
    }
    expect(checkedVrmas).toHaveLength(16);
  });

  it("codecPolicy가 KHR_mesh_quantization 단독 허용이며 Draco·meshopt·WebP·KTX2를 모두 차단 목록에 둔다", () => {
    const parsed = parseWebtoonKitV2Manifest(RAW_KIT_V2_JSON, 1_000);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.manifest.codecPolicy.allowedExtensions).toEqual([...KIT_V2_ALLOWED_EXTENSIONS]);
    const forbidden = new Set(parsed.manifest.codecPolicy.forbiddenExtensions);
    expect(forbidden.has("KHR_draco_mesh_compression")).toBe(true);
    expect(forbidden.has("EXT_meshopt_compression")).toBe(true);
    expect(forbidden.has("EXT_texture_webp")).toBe(true);
    expect(forbidden.has("KHR_texture_basisu")).toBe(true);
    for (const ext of KIT_V2_FORBIDDEN_EXTENSIONS) {
      expect(forbidden.has(ext)).toBe(true);
    }
  });

  it("금지 코덱이 허용 목록이나 에셋 확장에 끼어들면 parseWebtoonKitV2Manifest가 실패한다", () => {
    const cloned = structuredClone(RAW_KIT_V2_JSON) as Record<string, unknown>;
    const codecPolicy = cloned.codecPolicy as { allowedExtensions: string[]; forbiddenExtensions: string[] };
    codecPolicy.allowedExtensions = ["KHR_mesh_quantization", "KHR_draco_mesh_compression"];
    const invalidAllowed = parseWebtoonKitV2Manifest(cloned, 1_000);
    expect(invalidAllowed.ok).toBe(false);
    if (!invalidAllowed.ok) {
      expect(invalidAllowed.failure.code).toBe("kit-manifest-invalid");
    }

    const clonedMissingForbidden = structuredClone(RAW_KIT_V2_JSON) as Record<string, unknown>;
    const policy2 = clonedMissingForbidden.codecPolicy as { allowedExtensions: string[]; forbiddenExtensions: string[] };
    policy2.forbiddenExtensions = policy2.forbiddenExtensions.filter((ext) => ext !== "KHR_texture_basisu");
    const invalidForbidden = parseWebtoonKitV2Manifest(clonedMissingForbidden, 1_000);
    expect(invalidForbidden.ok).toBe(false);
  });

  it("5대 웹툰 아키타입 프리셋·핸드 포즈 라벨·6대 장르 의상 집계가 계약 범위를 지킨다", () => {
    expect(KIT_V2_ARCHETYPE_PRESET_LIST).toHaveLength(5);
    expect(KIT_V2_HAND_POSE_IDS).toHaveLength(16);
    expect(Object.keys(KIT_V2_HAND_POSE_LABELS_KO)).toHaveLength(16);
    expect(KIT_V2_GARMENT_GENRES).toHaveLength(6);
    expect(KIT_V2_GARMENT_GENRES.reduce((sum, item) => sum + item.count, 0)).toBe(34);

    for (const id of KIT_V2_ARCHETYPE_IDS) {
      expect(isKitV2ArchetypeId(id)).toBe(true);
      const preset = KIT_V2_ARCHETYPE_PRESETS[id];
      expect(preset.labelKo).toMatch(/[가-힣]/u);
      expect(["female", "male"]).toContain(preset.baseId);
      const body = archetypePresetToBodyParams(preset);
      expect(body.waist).toBe(preset.waistWidth);
      for (const value of Object.values(body)) {
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(isKitV2ArchetypeId("unknown-archetype")).toBe(false);
  });
});
