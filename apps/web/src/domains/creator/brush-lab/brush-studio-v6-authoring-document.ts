import { isStudioBrushEngineProgramWireValue } from "../../../shared/lib/studio-brush-material-program-contract";
import { createBrushStudioV6Program, normalizeBrushStudioV6Program, type BrushStudioV6Program } from "./brush-studio-v6-engine";
import { normalizeBrushStudioV6MaterialConfig, type BrushStudioV6MaterialConfig } from "./brush-studio-v6-material-engine";
import { createBrushStudioV6MaterialReceipt } from "./brush-studio-v6-material-receipt";
import { sameBrushStudioData } from "./brush-studio-data-equality";
import { BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE, brushStudioV6LicenseProfileAllows } from "./brush-studio-v6-license-profile";

export const BRUSH_AUTHORING_FORMAT = "toonstudio-brush-authoring";
export const BRUSH_AUTHORING_MAX_CHARACTERS = 262_144;

/** New drafts keep execution receipts; a null receipt explicitly denotes authoring-only data. */
export function serializeBrushStudioV6Authoring(program: BrushStudioV6Program): string {
  let materialReceipt: BrushStudioV6MaterialConfig | null = null;
  try { materialReceipt = createBrushStudioV6MaterialReceipt(program); } catch { /* Unsupported graph remains a draft. */ }
  return JSON.stringify({ ...program, authoringFormat: BRUSH_AUTHORING_FORMAT,
    authoringVersion: 1, materialReceipt });
}

export function hasBrushStudioV6AuthoringEnvelope(raw: unknown): raw is Record<string, unknown> {
  return !!raw && typeof raw === "object"
    && ["authoringFormat", "authoringVersion", "materialReceipt"].some((key) => key in raw);
}

/** A recognized but unsupported envelope never falls through to a guessed legacy program. */
export function parseBrushStudioV6Authoring(raw: Record<string, unknown>): BrushStudioV6Program {
  const { authoringFormat, authoringVersion, materialReceipt, ...source } = raw;
  if (authoringFormat !== BRUSH_AUTHORING_FORMAT || authoringVersion !== 1
    || !Object.hasOwn(raw, "materialReceipt")) throw new Error("지원하지 않는 브러시 편집 파일입니다.");
  const program = normalizeBrushStudioV6Program(source);
  if (!sameBrushStudioData(source, program)) throw new Error("브러시 설정을 변경 없이 복원할 수 없습니다.");
  if (materialReceipt === null) {
    let supported = false;
    try { createBrushStudioV6MaterialReceipt(program); supported = true; } catch { /* Still a non-executable draft. */ }
    if (supported) throw new Error("실행 가능한 브러시의 원본 실행 정보가 없습니다. 자동 변경하지 않았습니다.");
  }
  if (materialReceipt !== null) {
    const receipt = requireExactMaterial(materialReceipt);
    const expected = createBrushStudioV6MaterialReceipt(program);
    if (!sameBrushStudioData(receipt, expected)) {
      throw new Error("저장된 브러시와 현재 실행 정보가 다릅니다. 원본을 보존했습니다.");
    }
  }
  return program;
}

function requireExactMaterial(raw: unknown): Extract<BrushStudioV6MaterialConfig, { version: 2 }> {
  if (!isStudioBrushEngineProgramWireValue({ version: 1, material: raw })) {
    throw new Error("재료 설정에 지원하지 않거나 손상된 값이 있습니다.");
  }
  const material = normalizeBrushStudioV6MaterialConfig(raw);
  if (!material || material.version !== 2) {
    throw new Error("이전 재료는 현재 엔진으로 자동 변환하지 않습니다. 원고는 그대로 유지됩니다.");
  }
  return material;
}

export interface BrushStudioV6LegacyPigmentMaterialMigration {
  readonly sourceProviderId: "mixbox-js-v2";
  readonly targetProviderId: "toonstudio-latent-pigment-v1";
  readonly sourceMaterial: Extract<BrushStudioV6MaterialConfig, { version: 2 }>;
  readonly material: Extract<BrushStudioV6MaterialConfig, { version: 2 }>;
}

interface BrushStudioV6LegacyPigmentAuthoringSource {
  readonly sourceAuthoring: string;
  readonly program: BrushStudioV6Program;
}

/** 실행 기록이 없던 초안과 실제 외부 실행 영수증을 구분해 원본 정보를 지어내지 않는다. */
export type BrushStudioV6LegacyPigmentAuthoringMigration = BrushStudioV6LegacyPigmentAuthoringSource & (
  | (BrushStudioV6LegacyPigmentMaterialMigration & { readonly sourceKind: "execution-receipt" })
  | {
    readonly sourceKind: "authoring-draft";
    readonly sourceProviderId: "mixbox-js-v2";
    readonly targetProviderId: "toonstudio-latent-pigment-v1";
    readonly sourceMaterial: null;
    readonly material: Extract<BrushStudioV6MaterialConfig, { version: 2 }>;
  }
  | {
    readonly sourceKind: "program-settings";
    readonly sourceProviderId: null;
    readonly targetProviderId: "toonstudio-latent-pigment-v1";
    readonly sourceMaterial: null;
    readonly material: Extract<BrushStudioV6MaterialConfig, { version: 2 }>;
  }
);

/** 호출자가 원본 보존과 색 변화 안내 뒤 적용하는 명시적 이주다. 정확한 복원 경로에서는 호출하지 않는다. */
export function migrateBrushStudioV6LegacyMixboxMaterial(raw: unknown): BrushStudioV6LegacyPigmentMaterialMigration | null {
  const sourceMaterial = requireExactMaterial(raw);
  const legacyBindings = sourceMaterial.runtime.bindings.filter((binding) => binding.providerId === "mixbox-js-v2");
  if (legacyBindings.length === 0) return null;
  if (sourceMaterial.slots.pigment !== "pigment-mixbox" || legacyBindings.length !== 1
    || !sameBrushStudioData(legacyBindings[0], {
      providerId: "mixbox-js-v2", version: "2.0.0", license: "CC-BY-NC-4.0",
      rights: "noncommercial", execution: "native", nodeIds: ["pigment-mixbox"],
    })) throw new Error("이전 Mixbox 실행 정보를 정확하게 확인할 수 없습니다. 원본은 유지됩니다.");
  const program = normalizeBrushStudioV6Program({ ...createBrushStudioV6Program(),
    seed: sourceMaterial.seed, input: sourceMaterial.input, slots: sourceMaterial.slots,
    tuning: sourceMaterial.tuning, licenseProfile: sourceMaterial.runtime.licenseProfile });
  const material = createBrushStudioV6MaterialReceipt(program);
  const internalBinding = material.runtime.bindings.find((binding) => binding.nodeIds.includes("pigment-mixbox"));
  if (!internalBinding || internalBinding.providerId !== "toonstudio-latent-pigment-v1") {
    throw new Error("자체 잠재 안료의 실행 정보를 구성하지 못했습니다.");
  }
  const candidate = { ...sourceMaterial, runtime: { ...sourceMaterial.runtime,
    bindings: sourceMaterial.runtime.bindings.map((binding) => binding.providerId === "mixbox-js-v2" ? internalBinding : binding),
  } };
  if (!sameBrushStudioData(candidate, material)) {
    throw new Error("안료 이외의 실행 정보가 다릅니다. 이전 브러시를 자동 변경하지 않았습니다.");
  }
  return Object.freeze({ sourceProviderId: "mixbox-js-v2", targetProviderId: "toonstudio-latent-pigment-v1",
    sourceMaterial: structuredClone(sourceMaterial), material });
}

/** 이전 Mixbox 영수증 또는 당시 권리 검사로 실행되지 못한 초안을 명시적 이주 후보로 만든다. */
export function migrateBrushStudioV6LegacyMixboxAuthoring(serialized: string): BrushStudioV6LegacyPigmentAuthoringMigration | null {
  if (serialized.length > BRUSH_AUTHORING_MAX_CHARACTERS) throw new Error("브러시 파일이 허용 크기를 초과했습니다.");
  const parsed: unknown = JSON.parse(serialized);
  // 일반 가져오기와 같은 우선순위다. 잘못된 루트 envelope를 내부 program으로 우회하지 않는다.
  const envelope = hasBrushStudioV6AuthoringEnvelope(parsed) ? parsed
    : parsed && typeof parsed === "object" && "program" in parsed && hasBrushStudioV6AuthoringEnvelope(parsed.program)
      ? parsed.program : null;
  if (!envelope) {
    const settings = parsed && typeof parsed === "object" && "program" in parsed ? parsed.program : parsed;
    if (!settings || typeof settings !== "object" || !("schemaVersion" in settings) || settings.schemaVersion !== 6
      || !("slots" in settings) || !settings.slots || typeof settings.slots !== "object"
      || !("pigment" in settings.slots) || settings.slots.pigment !== "pigment-mixbox") return null;
    const program = normalizeBrushStudioV6Program(settings);
    if (!sameBrushStudioData(settings, program)) throw new Error("브러시 설정을 변경 없이 복원할 수 없습니다.");
    const material = createBrushStudioV6MaterialReceipt(program);
    // 실행 영수증이 없는 설정 파일이므로 외부 제공자의 실행·버전 정보를 추정하지 않는다.
    return Object.freeze({ sourceKind: "program-settings", sourceProviderId: null,
      targetProviderId: "toonstudio-latent-pigment-v1", sourceMaterial: null,
      material, sourceAuthoring: serialized, program });
  }
  const { authoringFormat, authoringVersion, materialReceipt, ...source } = envelope;
  if (authoringFormat !== BRUSH_AUTHORING_FORMAT || authoringVersion !== 1
    || !Object.hasOwn(envelope, "materialReceipt")) throw new Error("지원하지 않는 브러시 편집 파일입니다.");
  const program = normalizeBrushStudioV6Program(source);
  if (!sameBrushStudioData(source, program)) throw new Error("브러시 설정을 변경 없이 복원할 수 없습니다.");
  if (materialReceipt === null) {
    const profile = program.licenseProfile ?? BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE;
    // 원래 실행 가능했던 프로필의 누락 영수증을 복구하지 않는다. 당시 NC 검사로 막힌 안료만 해당한다.
    if (program.slots.pigment !== "pigment-mixbox" || brushStudioV6LicenseProfileAllows(profile, "noncommercial")) return null;
    const material = createBrushStudioV6MaterialReceipt(program);
    return Object.freeze({ sourceKind: "authoring-draft", sourceProviderId: "mixbox-js-v2",
      targetProviderId: "toonstudio-latent-pigment-v1", sourceMaterial: null,
      material, sourceAuthoring: serialized, program });
  }
  const migration = migrateBrushStudioV6LegacyMixboxMaterial(materialReceipt);
  if (!migration) return null;
  if (!sameBrushStudioData(createBrushStudioV6MaterialReceipt(program), migration.material)) {
    throw new Error("이전 편집 설정과 실행 정보가 다릅니다. 원본은 유지됩니다.");
  }
  return Object.freeze({ ...migration, sourceKind: "execution-receipt", sourceAuthoring: serialized, program });
}

export interface BrushStudioMaterialToolValues {
  readonly strokeWidth: number;
  readonly brushOpacity: number;
  readonly color: string;
}

/** Exact current material, including only explicit main-tool overrides, never a similar recipe. */
export function createBrushStudioV6ExactEditorProgram(raw: unknown, id: string, name: string,
  tool?: BrushStudioMaterialToolValues): BrushStudioV6Program {
  const material = requireExactMaterial(raw);
  if (tool && (!Number.isFinite(tool.strokeWidth) || tool.strokeWidth < 1 || tool.strokeWidth > 240
    || !Number.isFinite(tool.brushOpacity) || tool.brushOpacity < 0 || tool.brushOpacity > 1
    || !/^#[0-9a-f]{6}$/iu.test(tool.color))) {
    throw new Error("현재 크기·색·불투명도를 정확하게 전달할 수 없습니다.");
  }
  const tuning = tool ? { ...material.tuning, size: tool.strokeWidth,
    primaryColor: tool.color.toLowerCase(), opacity: tool.brushOpacity } : material.tuning;
  const program = normalizeBrushStudioV6Program({ ...createBrushStudioV6Program(),
    id, name, licenseProfile: material.runtime.licenseProfile, description: "원고의 현재 재료 설정 · 저장 시 별도 브러시로 보존",
    seed: material.seed, input: material.input, slots: material.slots, tuning });
  const expected = createBrushStudioV6MaterialReceipt(program, material.runtime.licenseProfile);
  if (!sameBrushStudioData({ ...material, tuning }, expected)) {
    throw new Error("현재 재료를 같은 엔진·설정으로 편집할 수 없습니다. 원고는 유지됩니다.");
  }
  return program;
}
