/**
 * 키트 소스 경로 어댑터(순수): 뷰어가 받은 GLB들(베이스 + 파츠)에서 `kit.json` 없이 **즉석으로** `KitPlan`을 만든다.
 *
 * 앱의 키트 소스(`loadSource({ kind: "kit", plan })` → `loadKitRig`)는 `kit.json`을 읽어 만든 `KitPlan`을 받는다. 개발 중인 Blender 산출물은
 * 아직 `kit.json`이 없으므로(리드가 통합 단계에서 조립한다), 이 모듈이 GLB JSON에서 메시 선언·재질 틴트·스켈레톤을 읽어 같은 모양의 플랜을 만든다.
 * 그러면 엔진의 키트 정책(A-5·A-9 외곽선 제외, 키트 틴트, 정점색 AO, 알파 컷오프, 증분 교체, 얼굴 SDF 끔)이 뷰어 렌더에도 그대로 걸린다.
 *
 * 규칙(모두 계약 `character-kit.ts` 상수를 재사용하고 중복 정의하지 않는다):
 * - 메시 역할: `kit-roles.resolveMeshRole`(키트 이름 규칙 → `--role` 덮어쓰기 → 레거시 추정). 다중 프리미티브는 `KIT_PRIMITIVE_SPLITS`(`TS_Mouth`)만 선언한다.
 * - 재질 틴트: `KIT_ROLE_TINT_RULES`(recolor/fixed). fixed의 색은 GLB `baseColorFactor`(흰색이면 `#ffffff`)다.
 * - 스켈레톤: 계약 상수(`KIT_SKELETON_JOINTS` 등). GLB의 joint가 계약과 다르면 엔진이 `kit-joint-mismatch`로 거부하고 그 사유를 그대로 보인다.
 * - 선언 검증: `kitMeshSchema`·`kitMaterialSchema`로 점검하고 어긋난 항목은 경고로 남긴다(뷰어는 작업 중 산출물을 보는 도구라 선언 오류로 렌더를 막지 않는다).
 *
 * 바이트 수·SHA-256은 호출자(CLI)가 계산해 넘긴다 — 엔진은 이 값으로 받은 바이트를 검증한다(끄지 않는다).
 * 한계: `bodyRegions`·`jointOffsets`·`hides`는 `kit.json`에만 있는 값이라 비어 있다 → 몸 영역 가림(hides)과 체형 morph의 관절 이동은 적용되지 않는다.
 */
import {
  ALL_AVAILABLE_CAPABILITIES,
  KIT_BASE_MESH_SPECS,
  KIT_BODY_NODE,
  KIT_BONE_MAP,
  KIT_CURRENT_VERSION,
  KIT_DEFAULT_ID,
  KIT_END_BONES,
  KIT_HEAD_NODE,
  KIT_PART_SLOTS,
  KIT_PART_SLOT_REQUIRED_ROLES,
  KIT_PART_SLOT_ROLES,
  KIT_ROLE_TINT_RULES,
  KIT_SKELETON_JOINTS,
  KIT_SKELETON_PARENTS,
  isMorphTargetName,
  kitMaterialSchema,
  kitMeshSchema,
} from "../../contracts";
import { ROLE_COLOR_KEY } from "../material-presets";

import { inspectGlb } from "./glb-inspect";
import { arrayField, asNumber, asString, isJsonObject, parseGlb } from "./glb-io";
import { runKitChecks } from "./kit-checks";
import { KIT_PRIMITIVE_SPLITS, buildBoneMap, compareSkeletonToKit, resolveMeshRole, stripMeshSuffix } from "./kit-roles";
import { decideTint } from "./tint";
import { makeWarning, sortWarnings } from "./warnings";

import type { GlbImageSummary, GlbMaterialSummary, GlbMeshNodeSummary, GlbSummary } from "./glb-inspect";
import type { ResolvedRole } from "./kit-roles";
import type { PrepareResult, PreparedMesh } from "./prepare";
import type { PreviewWarning } from "./warnings";
import type { KitBaseId, KitMaterial, KitMesh, KitPartPlan, KitPartSlot, KitPlan, PartRole, RecipeColorKey, RecipeColors } from "../../contracts";

/** 뷰어가 엔진에 올리는 소스 종류: kit = 엔진의 키트 소스 경로, package = 기존 병합(제작 패키지) 경로 */
export type PreviewSourceKind = "kit" | "package";

export interface SourceKindDecision {
  readonly kind: PreviewSourceKind;
  /** 판정 근거(한글, 요약 JSON과 경고에 그대로 싣는다) */
  readonly reasonKo: string;
  /** `--legacy-merge`로 강제했는지 */
  readonly forced: boolean;
}

/** 키트 베이스가 반드시 가진 두 메시. 베이스 GLB에 하나라도 있으면 키트 규약 입력으로 본다. */
const KIT_BASE_MARKER_NODES: readonly string[] = [KIT_BODY_NODE, KIT_HEAD_NODE];

function meshNodeNames(bytes: Uint8Array, label: string): string[] {
  const doc = parseGlb(bytes, label);
  const names: string[] = [];
  for (const node of arrayField(doc.json, "nodes")) {
    if (isJsonObject(node) && asNumber(node.mesh) !== null) {
      const name = asString(node.name);
      if (name !== null) names.push(name);
    }
  }
  return names;
}

/**
 * 입력이 키트 규약인지 판정한다(자동 감지). 첫 번째(베이스) GLB에 `TS_Body`/`TS_Head` 메시 노드가 있으면 `kit`,
 * 없으면(제작 패키지 Orion·reference 등 키트 이름 규약 밖) 기존 병합 경로인 `package`다. `legacyMerge`는 감지를 건너뛰고 `package`로 강제한다.
 * 베이스를 GLB로 읽지 못하면 `glb-invalid` LabFailure를 던진다(병합 경로도 같은 입력을 거부한다).
 */
export function decideSourceKind(baseBytes: Uint8Array, baseLabel: string, legacyMerge: boolean): SourceKindDecision {
  if (legacyMerge) return { kind: "package", reasonKo: "--legacy-merge로 기존 병합(package) 경로를 강제했습니다.", forced: true };
  const found = meshNodeNames(baseBytes, baseLabel).filter((name) => KIT_BASE_MARKER_NODES.includes(stripMeshSuffix(name)));
  if (found.length > 0) return { kind: "kit", reasonKo: `베이스에 키트 이름 메시(${found.join(", ")})가 있어 엔진의 키트 소스 경로로 올립니다.`, forced: false };
  return { kind: "package", reasonKo: `베이스에 키트 이름 메시(${KIT_BASE_MARKER_NODES.join("·")})가 없어 기존 병합(package) 경로로 올립니다(키트 규약 밖 GLB).`, forced: false };
}

// ---------------------------------------------------------------- 입력·출력 형식

export interface KitPlanFile {
  readonly label: string;
  /** 엔진 `fetchBytes`가 받을 주소(플랜의 파츠 url) */
  readonly url: string;
  /** CLI가 디스크의 원본에서 계산한 SHA-256(소문자 hex 64자) */
  readonly sha256: string;
  /** CLI가 잰 바이트 수 */
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface KitPlanOptions {
  readonly colors: RecipeColors;
  readonly roleOverrides: Readonly<Record<string, string>>;
  readonly hairLod: number;
}

export interface KitPlanBuild {
  readonly plan: KitPlan;
  /** 정적 요약(`summary.buildStaticReport`)이 그대로 읽는 모양. 병합이 없으므로 `passthrough`는 true, `bytes`는 베이스 원본이다. */
  readonly prepared: PrepareResult;
  readonly warnings: readonly PreviewWarning[];
}

// ---------------------------------------------------------------- 보조

const SLOT_BY_ROLE: ReadonlyMap<PartRole, KitPartSlot> = new Map(KIT_PART_SLOTS.flatMap((slot) => KIT_PART_SLOT_ROLES[slot].map((role) => [role, slot] as const)));

/** 파일 이름에서 베이스 id를 추정한다(`male`이 들어 있고 `female`이 아니면 남성, 그 외 여성) */
export function guessBaseId(label: string): KitBaseId {
  const lower = label.toLowerCase();
  return /(^|[^a-z])male([^a-z]|$)/u.test(lower) && !lower.includes("female") ? "male" : "female";
}

function stemOf(label: string): string {
  return label.replace(/\.(?:glb|gltf)$/iu, "").replace(/[^A-Za-z0-9._-]+/gu, "-");
}

function materialOf(mesh: GlbMeshNodeSummary, primitive: number): string | null {
  return mesh.primitives[primitive]?.material ?? null;
}

function listFirst(names: readonly string[], limit = 6): string {
  return `${names.slice(0, limit).join(", ")}${names.length > limit ? ` 외 ${names.length - limit}개` : ""}`;
}

/** 역할의 재질 틴트 선언. 계약 규칙(`KIT_ROLE_TINT_RULES`)이 없는 역할(pupil)은 앱의 역할→색 키 표를 따라 recolor로 둔다. */
function tintFor(role: PartRole, colors: RecipeColors, authoredFactor: readonly number[] | null): KitMaterial["tint"] {
  const rule = KIT_ROLE_TINT_RULES[role];
  if (rule?.mode === "fixed") return { mode: "fixed", hex: decideTint(role, "fixed", colors, authoredFactor).planColorHex ?? "#ffffff" };
  const colorKey: RecipeColorKey = rule?.mode === "recolor" ? rule.colorKey : (ROLE_COLOR_KEY[role] ?? "accessory");
  return { mode: "recolor", colorKey };
}

function issueSummary(issues: ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey>; readonly message: string }>): string {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

interface DeclaredMesh {
  readonly declared: KitMesh;
  readonly role: ResolvedRole;
  readonly summary: GlbMeshNodeSummary;
  /** 선언에 쓴 (역할, 재질) 쌍 */
  readonly materials: ReadonlyArray<{ readonly role: PartRole; readonly material: string }>;
}

function declareMesh(summary: GlbMeshNodeSummary, overrides: Readonly<Record<string, string>>, warnings: PreviewWarning[]): DeclaredMesh {
  const resolved = resolveMeshRole(summary.node, overrides);
  const splits = KIT_PRIMITIVE_SPLITS[stripMeshSuffix(summary.node)];
  // 계약 어휘(param:<키>:±, facs:<유닛>) 밖의 morph 이름은 선언하지 않는다(KitMesh.morphs 타입). 엔진은 선언 안 된 morph를 구동하지 않으므로 이유를 경고한다.
  const morphs = summary.morphTargetNames.filter(isMorphTargetName);
  const undeclaredMorphs = summary.morphTargetNames.filter((name) => !isMorphTargetName(name));
  if (undeclaredMorphs.length > 0) {
    warnings.push(makeWarning(summary.node, "kit-morph-unknown-name", `메시 '${summary.node}'의 morph ${undeclaredMorphs.length}개가 키트 어휘(param:<키>:±, facs:<유닛>)에 없어 선언하지 않았습니다(키트 경로에서는 구동되지 않음): ${listFirst(undeclaredMorphs, 4)}. 이름이 임의인 GLB는 --legacy-merge로 올리세요.`));
  }
  const base = { node: summary.node, triangles: Math.max(1, summary.triangles), vertices: Math.max(1, summary.vertices), ...(summary.skinned ? { skinned: true as const } : {}), morphs };
  const noMaterial = (): string => {
    warnings.push(makeWarning(summary.node, "kit-no-material", `키트 메시 '${summary.node}'에 재질이 없습니다. 키트의 모든 메시는 재질 하나(ts_*)를 가져야 합니다.`));
    return `ts_missing_${summary.node.toLowerCase().replace(/[^a-z0-9]+/gu, "_")}`;
  };
  // 프리미티브마다 역할이 다른 메시(TS_Mouth: 0 = teeth, 1 = tongue). 프리미티브 수가 규칙과 다르면 단일 메시로 선언해 엔진이 사유를 보이게 한다.
  if (splits !== undefined && summary.primitives.length === splits.length) {
    const roles = splits.map((split) => resolveMeshRole(`${stripMeshSuffix(summary.node)}_${split.suffix}`, overrides).role);
    const names = splits.map((_split, index) => materialOf(summary, index) ?? noMaterial());
    const declared: KitMesh = { ...base, primitiveRoles: roles, primitiveMaterials: names };
    return { declared, role: resolved, summary, materials: roles.map((role, index) => ({ role, material: names[index] as string })) };
  }
  const material = materialOf(summary, 0) ?? noMaterial();
  const declared: KitMesh = { ...base, role: resolved.role, material };
  return { declared, role: resolved, summary, materials: [{ role: resolved.role, material }] };
}

/** 입력별 요약을 하나로 합친다(이미지·재질 인덱스를 다시 매긴다). 정적 보고서와 `runKitChecks`가 읽는다. */
function combineSummaries(summaries: readonly GlbSummary[]): GlbSummary {
  const images: GlbImageSummary[] = [];
  const materials: GlbMaterialSummary[] = [];
  for (const summary of summaries) {
    const imageOffset = images.length;
    const materialOffset = materials.length;
    for (const image of summary.images) images.push({ ...image, index: image.index + imageOffset });
    for (const material of summary.materials) {
      materials.push({ ...material, index: material.index + materialOffset, textures: Object.fromEntries(Object.entries(material.textures).map(([slot, index]) => [slot, index + imageOffset])) });
    }
  }
  const meshNodes = summaries.flatMap((summary) => summary.meshNodes);
  const morphTargetNames = [...new Set(summaries.flatMap((summary) => summary.morphTargetNames))];
  return {
    label: "키트 입력 합",
    bytes: summaries.reduce((sum, summary) => sum + summary.bytes, 0),
    generator: summaries[0]?.generator ?? null,
    extensionsUsed: [...new Set(summaries.flatMap((summary) => summary.extensionsUsed))],
    extensionsRequired: [...new Set(summaries.flatMap((summary) => summary.extensionsRequired))],
    nodeCount: summaries.reduce((sum, summary) => sum + summary.nodeCount, 0),
    meshNodes,
    skins: summaries[0]?.skins ?? [],
    materials,
    images,
    totals: {
      meshNodes: meshNodes.length,
      vertices: meshNodes.reduce((sum, mesh) => sum + mesh.vertices, 0),
      triangles: meshNodes.reduce((sum, mesh) => sum + mesh.triangles, 0),
      morphTargetNames: morphTargetNames.length,
    },
    morphTargetNames,
    warnings: [],
  };
}

/** 파츠 파일의 슬롯: 메시 역할이 속한 슬롯. 둘 이상에 걸치면 첫 슬롯을 쓰고 경고한다. */
function slotOfPart(label: string, declared: readonly DeclaredMesh[], warnings: PreviewWarning[]): KitPartSlot {
  const slots = [...new Set(declared.flatMap((mesh) => mesh.materials.map((entry) => SLOT_BY_ROLE.get(entry.role))).filter((slot): slot is KitPartSlot => slot !== undefined))];
  if (slots.length === 0) {
    warnings.push(makeWarning(label, "kit-part-slot-unknown", `파츠 '${label}'의 메시 역할로 슬롯(${KIT_PART_SLOTS.join("·")})을 정할 수 없습니다. --role 메시=역할로 지정하세요.`));
    return "accessory";
  }
  if (slots.length > 1) warnings.push(makeWarning(label, "kit-part-mixed-slots", `파츠 '${label}'가 여러 슬롯의 역할을 함께 가집니다(${slots.join(", ")}). 파츠 GLB는 슬롯 하나만 다루세요(첫 슬롯 ${slots[0]}로 취급).`));
  return slots[0] as KitPartSlot;
}

// ---------------------------------------------------------------- 플랜 조립

export function buildKitPlan(files: readonly KitPlanFile[], options: KitPlanOptions): KitPlanBuild {
  const warnings: PreviewWarning[] = [];
  const base = files[0];
  if (!base) throw new Error("buildKitPlan: 입력 파일이 없습니다(호출자가 먼저 확인해야 합니다).");

  // 1) 파싱·정적 검사
  const summaries = files.map((file) => {
    const summary = inspectGlb(parseGlb(file.bytes, file.label), file.label, file.byteLength);
    warnings.push(...summary.warnings);
    return summary;
  });
  const baseSummary = summaries[0] as GlbSummary;

  // 2) 메시 선언·재질 틴트
  const roles = new Map<string, ResolvedRole>();
  const preparedMeshes: PreparedMesh[] = [];
  const materials: Record<string, KitMaterial> = {};
  const materialRoles = new Map<string, Set<PartRole>>();
  const parts: KitPartPlan[] = [];
  const baseId = guessBaseId(base.label);

  files.forEach((file, fileIndex) => {
    const summary = summaries[fileIndex] as GlbSummary;
    const declaredMeshes = summary.meshNodes.map((mesh) => declareMesh(mesh, options.roleOverrides, warnings));
    for (const entry of declaredMeshes) {
      const nodeName = entry.summary.node;
      roles.set(nodeName, entry.role);
      const check = kitMeshSchema.safeParse(entry.declared);
      if (!check.success) warnings.push(makeWarning(nodeName, "kit-declaration-invalid", `메시 '${nodeName}'의 선언이 키트 계약(kitMeshSchema)에 맞지 않습니다: ${issueSummary(check.error.issues)}. 엔진은 그대로 시도합니다.`));
      for (const { role, material } of entry.materials) {
        const roleSet = materialRoles.get(material) ?? new Set<PartRole>();
        roleSet.add(role);
        materialRoles.set(material, roleSet);
        if (materials[material]) continue;
        const glbMaterial = summary.materials.find((candidate) => candidate.name === material);
        materials[material] = { role, tint: tintFor(role, options.colors, glbMaterial?.baseColorFactor ?? null), doubleSided: glbMaterial?.doubleSided ?? false };
        const materialCheck = kitMaterialSchema.safeParse(materials[material]);
        if (!materialCheck.success) warnings.push(makeWarning(material, "kit-declaration-invalid", `재질 '${material}'의 선언이 키트 계약(kitMaterialSchema)에 맞지 않습니다: ${issueSummary(materialCheck.error.issues)}.`));
      }
      const first = entry.materials[0];
      const tint = first ? materials[first.material]?.tint : undefined;
      preparedMeshes.push({
        node: nodeName,
        role: entry.role.role,
        roleSource: entry.role.source,
        tintMode: tint?.mode ?? "legacy",
        colorKey: tint?.mode === "recolor" ? tint.colorKey : null,
        planColorHex: tint?.mode === "fixed" ? tint.hex : tint?.mode === "recolor" ? (options.colors[tint.colorKey] ?? null) : null,
        material: first?.material ?? null,
        origin: file.label,
      });
    }

    const declared = declaredMeshes.map((entry) => entry.declared);
    if (fileIndex === 0) {
      parts.push({ id: `base/${baseId}`, kind: "base", slot: null, url: file.url, sha256: file.sha256, bytes: file.byteLength, meshes: declared, hides: [] });
      // 필수 베이스 메시(계약 KIT_BASE_MESH_SPECS) 점검
      const present = new Set(declared.map((mesh) => stripMeshSuffix(mesh.node)));
      const missing = KIT_BASE_MESH_SPECS.map((spec) => spec.node).filter((name) => !present.has(name));
      if (missing.length > 0) warnings.push(makeWarning(file.label, "kit-base-mesh-missing", `베이스에 키트 필수 메시 ${missing.length}개가 없습니다: ${listFirst(missing)}. 실제 앱의 키트 검증은 이 베이스를 거부합니다.`, "error"));
    } else {
      const slot = slotOfPart(file.label, declaredMeshes, warnings);
      parts.push({ id: `${slot}/${stemOf(file.label)}`, kind: "part", slot, url: file.url, sha256: file.sha256, bytes: file.byteLength, meshes: declared, hides: [] });
      const have = new Set(declaredMeshes.flatMap((entry) => entry.materials.map((pair) => pair.role)));
      const allowed: readonly PartRole[] = KIT_PART_SLOT_ROLES[slot];
      const wrong = [...have].filter((role) => !allowed.includes(role));
      if (wrong.length > 0) warnings.push(makeWarning(file.label, "kit-part-role-invalid", `슬롯 ${slot} 파츠에 허용되지 않은 역할이 있습니다: ${wrong.join(", ")}(허용: ${allowed.join(", ")}).`));
      const lacking = KIT_PART_SLOT_REQUIRED_ROLES[slot].filter((role) => !have.has(role));
      if (lacking.length > 0) warnings.push(makeWarning(file.label, "kit-part-role-missing", `슬롯 ${slot} 파츠에 필수 역할이 없습니다: ${lacking.join(", ")}.`));
    }
  });

  for (const [material, roleSet] of materialRoles) {
    if (roleSet.size > 1) warnings.push(makeWarning(material, "kit-material-shared-roles", `재질 '${material}'가 서로 다른 역할(${[...roleSet].join(", ")})에서 쓰입니다. 재질은 역할마다 따로 두세요(틴트 규칙이 역할별입니다).`));
  }

  // 3) 스켈레톤·본 매핑(베이스 스킨 기준) · 키트 점검
  const merged = combineSummaries(summaries);
  const baseSkin = baseSummary.skins[0] ?? null;
  const bones = baseSkin ? buildBoneMap(baseSkin.joints) : null;
  const skeleton = baseSkin && bones ? { joints: baseSkin.joints, mappedBones: Object.keys(bones.boneMap).length, unmapped: bones.unmapped, kit: compareSkeletonToKit(baseSkin.joints) } : null;
  warnings.push(...runKitChecks({ files: files.map((file) => ({ label: file.label, bytes: file.byteLength })), merged, roles, skeletonJoints: baseSkin?.joints ?? null }));
  warnings.push(
    makeWarning(
      "kit-plan",
      "kit-plan-synthesized",
      "kit.json 없이 GLB에서 즉석으로 만든 키트 플랜입니다. bodyRegions·jointOffsets·hides는 비어 있어 몸 영역 가림(hides)과 체형 morph의 관절 이동은 적용되지 않습니다(실제 앱은 kit.json 값을 씁니다).",
      "info",
    ),
  );

  const morphNames = [...new Set(parts.flatMap((part) => part.meshes.flatMap((mesh) => mesh.morphs)))].sort();
  const plan: KitPlan = {
    kitId: KIT_DEFAULT_ID,
    kitVersion: KIT_CURRENT_VERSION,
    baseId,
    skeleton: { root: "Armature", joints: [...KIT_SKELETON_JOINTS], parents: { ...KIT_SKELETON_PARENTS }, boneMap: { ...KIT_BONE_MAP }, endBones: [...KIT_END_BONES] },
    parts,
    morphNames,
    jointOffsets: {},
    bodyRegions: [],
    capabilities: ALL_AVAILABLE_CAPABILITIES,
    hairLodPolicy: { preferredLod: options.hairLod },
    licenseNote: "kit-preview(개발 전용 뷰어, 앱 에셋 아님)",
    materials,
  };

  const meshRoles: Record<string, PartRole> = {};
  for (const mesh of preparedMeshes) meshRoles[mesh.node] = mesh.role;
  const sorted = sortWarnings(warnings);
  const prepared: PrepareResult = {
    bytes: base.bytes,
    passthrough: true,
    inputs: summaries.map((summary) => ({ ...summary, warnings: [] })),
    merged: { ...merged, warnings: [] },
    merge: { parts: [], splits: [], changed: false, warnings: [] },
    meshes: preparedMeshes,
    meshRoles,
    boneMap: bones?.boneMap ?? {},
    skeleton,
    warnings: sorted,
  };
  return { plan, prepared, warnings: sorted };
}
