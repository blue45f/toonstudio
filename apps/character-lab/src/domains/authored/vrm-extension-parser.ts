/**
 * VRM 확장 순수 파서(베타): glTF JSON에서 `VRMC_vrm`(1.0) 또는 `VRM`(0.x)의 meta·humanoid·expressions만 읽는다.
 * Babylon 로더에는 VRM 확장이 없으므로 라이선스 표시·본 매핑 보조에만 쓴다. 사양 본문은 복제하지 않고
 * 키 이름(사실)만 사용한다. 재질(MToon)·스프링본은 범위 밖이다.
 */
import { REQUIRED_HUMANOID_BONES, isHumanoidBoneName } from "../../contracts";

import { readGlbJsonChunk } from "./glb-json-chunk";

import type { HumanoidBoneName } from "../../contracts";

export interface VrmMetaInfo {
  readonly name: string | null;
  readonly version: string | null;
  readonly authors: readonly string[];
  readonly licenseUrl: string | null;
  /** 0.x licenseName 또는 1.0 licenseUrl에서 유추 */
  readonly licenseName: string | null;
  readonly commercialUsage: string | null;
  readonly allowRedistribution: boolean | null;
  readonly modification: string | null;
}

export interface VrmcVrmInfo {
  readonly specVersion: string;
  readonly family: "vrm-1.0" | "vrm-0.x";
  readonly meta: VrmMetaInfo;
  /** 휴머노이드 본 → glTF 노드 인덱스 */
  readonly humanoid: Partial<Record<HumanoidBoneName, number>>;
  readonly humanoidMissingRequired: readonly HumanoidBoneName[];
  /** 본 어휘 밖 이름(파서가 조용히 버리지 않고 노출) */
  readonly unknownHumanBones: readonly string[];
  readonly expressions: readonly string[];
  /** VRMC_materials_mtoon 또는 VRM 0.x MToon 재질 확장 포함 여부 */
  readonly hasMtoonExtension?: boolean;
  /** VRMC_springBone springs 또는 VRM 0.x secondaryAnimation boneGroups 개수 */
  readonly springBoneGroupCount?: number;
}

export interface GlbVrmBudgetAuditResult {
  readonly score: number;
  readonly vrmToolkitPassed: boolean;
  readonly glbForgeTier: "mobile-hero" | "desktop-hero" | "over-budget";
  readonly warningsKo: readonly string[];
  readonly summaryKo: string;
}

export interface Tripo3dCharacterLabMcpAsset {
  readonly id: string;
  readonly labelKo: string;
  readonly slot: "accessory";
  readonly glbUrl: string;
  readonly sha256: string;
  readonly fileSizeBytes: number;
  readonly triangles: number;
  readonly drawCalls: number;
  readonly glbforgeScore: number;
}

export const TRIPO3D_CHARACTER_LAB_MCP_ASSETS: readonly Tripo3dCharacterLabMcpAsset[] = [
  {
    id: "tripo3d-h31-character-lab-protagonist",
    labelKo: "웹툰 주인공 전신 T-Pose + 스마트 메시 리토폴로지 (Tripo H3.1 8K)",
    slot: "accessory",
    glbUrl: "/models/tripo3d-mcp/tripo_h31_webtoon_protagonist_character.glb",
    sha256: "01dc6309a68e6329e30d7fc1dcae7dd27f6682f39f7744b86d41ed8d7d40d06a",
    fileSizeBytes: 4_704_536,
    triangles: 17_733,
    drawCalls: 1,
    glbforgeScore: 85,
  },
  {
    id: "tripo3d-h31-character-lab-archmage-regalia",
    labelKo: "대마법사 로열 케이프 & 마도서 스태프 세트 (Tripo H3.1 Ultra 8K)",
    slot: "accessory",
    glbUrl: "/models/tripo3d-mcp/tripo_h31_archmage_cape_grimoire_staff.glb",
    sha256: "c0c92d4b2f7b72118462f4303da2bb8a01af5aa2f1f5404bceed8b5e52f6eaaf",
    fileSizeBytes: 2_029_660,
    triangles: 24_342,
    drawCalls: 1,
    glbforgeScore: 85,
  },
  {
    id: "tripo3d-h31-character-lab-knight-arms",
    labelKo: "황실 성기사 롱소드 & 문장 방패 무장 세트 (Tripo H3.1 Ultra 8K)",
    slot: "accessory",
    glbUrl: "/models/tripo3d-mcp/tripo_h31_royal_knight_sword_shield.glb",
    sha256: "1fc7775ecd81ff9bccb4c8f472b0d47f1da4f46674c7a2bc53b24fc304c7cb87",
    fileSizeBytes: 1_945_548,
    triangles: 24_000,
    drawCalls: 1,
    glbforgeScore: 85,
  },
  {
    id: "tripo3d-mcp-character-lab-pauldron",
    labelKo: "웹툰 기사 문장 견갑 (Crest Shoulder Pauldron)",
    slot: "accessory",
    glbUrl: "/models/tripo3d-mcp/character_lab_crest_shoulder_pauldron.glb",
    sha256: "37566397f24ef35a0cb22e5d7f1fac012e1ae618c3624593ff51b81874e7cea2",
    fileSizeBytes: 41_980,
    triangles: 1_856,
    drawCalls: 3,
    glbforgeScore: 95,
  },
] as const;

export const VRM_TOOLKIT_MCP_BASELINES = [
  {
    id: "avatar-orion-vrm1",
    name: "Orion (VRMC_vrm-1.0)",
    mappedBones: 53,
    triangles: 8_104,
    valid: true,
  },
  {
    id: "alicia-solid-vrm0",
    name: "Alicia Solid (VRM 0.0)",
    mappedBones: 55,
    triangles: 22_192,
    valid: true,
  },
] as const;

/**
 * VRM Toolkit (`vrm-toolkit-mcp` 70k Tri / 50MB) 및 GLBForge (`@glbforge/core` mobile-hero 150k / desktop-hero 500k)
 * 기준을 결합해 패키지 GLB의 런타임 예산을 순수 함수로 진단한다.
 */
export function auditGlbAndVrmBudget(options: {
  readonly glbBytesLength: number;
  readonly triangles: number;
  readonly missingRequiredBoneCount: number;
}): GlbVrmBudgetAuditResult {
  const warningsKo: string[] = [];
  let penalty = 0;

  if (options.triangles > 70_000) {
    warningsKo.push(`VRM 권장 삼각형 상한 초과 (${options.triangles.toLocaleString("ko-KR")} > 70,000)`);
    penalty += 15;
  }
  if (options.glbBytesLength > 50 * 1024 * 1024) {
    warningsKo.push("VRM 권장 파일 크기 초과 (> 50 MiB)");
    penalty += 20;
  }
  if (options.missingRequiredBoneCount > 0) {
    warningsKo.push(`필수 휴머노이드 본 누락 ${options.missingRequiredBoneCount}개`);
    penalty += options.missingRequiredBoneCount * 5;
  }

  const glbForgeTier: "mobile-hero" | "desktop-hero" | "over-budget" =
    options.triangles <= 150_000 && options.glbBytesLength <= 6 * 1024 * 1024
      ? "mobile-hero"
      : options.triangles <= 500_000 && options.glbBytesLength <= 20 * 1024 * 1024
        ? "desktop-hero"
        : "over-budget";

  if (glbForgeTier === "over-budget") {
    warningsKo.push("GLBForge desktop-hero 예산 초과 (Meshopt/Draco 압축 권장)");
    penalty += 15;
  }

  const score = Math.max(0, 100 - penalty);
  const vrmToolkitPassed = warningsKo.length === 0;
  return {
    score,
    vrmToolkitPassed,
    glbForgeTier,
    warningsKo,
    summaryKo: `점수 ${score}/100 · GLBForge ${glbForgeTier} · VRM 70k 예산 ${vrmToolkitPassed ? "통과" : `경고 ${warningsKo.length}건`}`,
  };
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseVrm1(ext: Json, rootExtensions: Json, extensionsUsed: readonly string[]): VrmcVrmInfo {
  const meta = asRecord(ext.meta) ?? {};
  const humanoid: Partial<Record<HumanoidBoneName, number>> = {};
  const unknown: string[] = [];
  const humanBones = asRecord(asRecord(ext.humanoid)?.humanBones) ?? {};
  for (const [bone, value] of Object.entries(humanBones)) {
    const node = asRecord(value)?.node;
    if (typeof node !== "number") continue;
    if (isHumanoidBoneName(bone)) humanoid[bone] = node;
    else unknown.push(bone);
  }
  const expressions = asRecord(ext.expressions);
  const names = [...Object.keys(asRecord(expressions?.preset) ?? {}), ...Object.keys(asRecord(expressions?.custom) ?? {})];
  const springBone = asRecord(rootExtensions.VRMC_springBone);
  const springs = Array.isArray(springBone?.springs) ? springBone.springs.length : 0;
  const hasMtoon = extensionsUsed.includes("VRMC_materials_mtoon");
  return {
    specVersion: asString(ext.specVersion) ?? "1.0",
    family: "vrm-1.0",
    meta: {
      name: asString(meta.name),
      version: asString(meta.version),
      authors: asStringArray(meta.authors),
      licenseUrl: asString(meta.licenseUrl),
      licenseName: asString(meta.licenseUrl),
      commercialUsage: asString(meta.commercialUsage),
      allowRedistribution: asBoolean(meta.allowRedistribution),
      modification: asString(meta.modification),
    },
    humanoid,
    humanoidMissingRequired: REQUIRED_HUMANOID_BONES.filter((bone) => humanoid[bone] === undefined),
    unknownHumanBones: unknown,
    expressions: names,
    hasMtoonExtension: hasMtoon,
    springBoneGroupCount: springs,
  };
}

function parseVrm0(ext: Json): VrmcVrmInfo {
  const meta = asRecord(ext.meta) ?? {};
  const humanoid: Partial<Record<HumanoidBoneName, number>> = {};
  const unknown: string[] = [];
  const humanBones = asRecord(ext.humanoid)?.humanBones;
  if (Array.isArray(humanBones)) {
    for (const entry of humanBones) {
      const record = asRecord(entry);
      const bone = asString(record?.bone);
      const node = record?.node;
      if (bone === null || typeof node !== "number") continue;
      if (isHumanoidBoneName(bone)) humanoid[bone] = node;
      else unknown.push(bone);
    }
  }
  const groups = asRecord(ext.blendShapeMaster)?.blendShapeGroups;
  const expressions = Array.isArray(groups) ? groups.map((group) => asString(asRecord(group)?.name) ?? asString(asRecord(group)?.presetName) ?? "").filter((name) => name.length > 0) : [];
  const author = asString(meta.author);
  const boneGroups = asRecord(ext.secondaryAnimation)?.boneGroups;
  const springBoneGroupCount = Array.isArray(boneGroups) ? boneGroups.length : 0;
  const matProps = Array.isArray(ext.materialProperties) ? ext.materialProperties : [];
  const hasMtoonExtension = matProps.some((m) => {
    const shader = asString(asRecord(m)?.shader);
    return shader !== null && shader.toLowerCase().includes("mtoon");
  });
  return {
    specVersion: asString(ext.specVersion) ?? asString(ext.exporterVersion) ?? "0.x",
    family: "vrm-0.x",
    meta: {
      name: asString(meta.title),
      version: asString(meta.version),
      authors: author ? [author] : [],
      licenseUrl: asString(meta.otherLicenseUrl),
      licenseName: asString(meta.licenseName),
      commercialUsage: asString(meta.commercialUssageName),
      allowRedistribution: null,
      modification: null,
    },
    humanoid,
    humanoidMissingRequired: REQUIRED_HUMANOID_BONES.filter((bone) => humanoid[bone] === undefined),
    unknownHumanBones: unknown,
    expressions,
    hasMtoonExtension,
    springBoneGroupCount,
  };
}

/** glTF JSON 루트에서 VRM 확장을 읽는다. 확장이 없으면 null. */
export function parseVrmcVrmFromGltfJson(json: unknown): VrmcVrmInfo | null {
  const root = asRecord(json);
  const extensions = asRecord(root?.extensions);
  if (!extensions) return null;
  const extensionsUsed = asStringArray(root?.extensionsUsed);
  const vrm1 = asRecord(extensions.VRMC_vrm);
  if (vrm1) return parseVrm1(vrm1, extensions, extensionsUsed);
  const vrm0 = asRecord(extensions.VRM);
  if (vrm0) return parseVrm0(vrm0);
  return null;
}

export type VrmGlbParseResult = { readonly ok: true; readonly info: VrmcVrmInfo | null; readonly nodeNames: readonly string[] } | { readonly ok: false; readonly reasonKo: string };

/** GLB 바이트에서 VRM 확장과 노드 이름 목록을 읽는다(BIN 청크는 읽지 않음). */
export function parseVrmFromGlb(bytes: Uint8Array): VrmGlbParseResult {
  const chunk = readGlbJsonChunk(bytes);
  if (!chunk.ok) return { ok: false, reasonKo: chunk.reasonKo };
  const nodes = Array.isArray(chunk.json.nodes) ? chunk.json.nodes : [];
  const nodeNames = nodes.map((node, index) => asString(asRecord(node)?.name) ?? `node#${index}`);
  return { ok: true, info: parseVrmcVrmFromGltfJson(chunk.json), nodeNames };
}

/** VRM humanoid(본 → 노드 인덱스)를 노드 이름 → 본 매핑으로 바꾼다(bone-name-mapping override 입력용). */
export function vrmHumanoidToBoneMap(info: VrmcVrmInfo, nodeNames: readonly string[]): Record<string, HumanoidBoneName> {
  const map: Record<string, HumanoidBoneName> = {};
  for (const [bone, index] of Object.entries(info.humanoid)) {
    const name = typeof index === "number" ? nodeNames[index] : undefined;
    if (name !== undefined && isHumanoidBoneName(bone) && !(name in map)) map[name] = bone;
  }
  return map;
}
