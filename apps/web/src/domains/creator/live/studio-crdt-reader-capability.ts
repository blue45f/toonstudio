import { STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";

export const STUDIO_CRDT_READER_CAPABILITIES: readonly string[] = Object.freeze([STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY, STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY]);
export interface StudioCrdtReaderMetadata {
  readonly readerCapabilities?: readonly string[];
  readonly requiredReaderCapabilities?: readonly string[];
  readonly artifactScope?: "origin" | "work";
}
const KEYS = ["readerCapabilities", "requiredReaderCapabilities", "artifactScope"] as const;
export function studioCrdtReaderMetadataKeys(value: Record<string, unknown>): string[] {
  return KEYS.filter((key) => Object.hasOwn(value, key));
}
function capabilities(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length <= 16 && new Set(value).size === value.length
    && value.every((entry) => typeof entry === "string" && /^[a-z0-9][a-z0-9.-]{0,63}$/u.test(entry));
}
export function validStudioCrdtReaderMetadata(value: Record<string, unknown>): boolean {
  return (!Object.hasOwn(value, "readerCapabilities") || capabilities(value.readerCapabilities))
    && (!Object.hasOwn(value, "requiredReaderCapabilities") || capabilities(value.requiredReaderCapabilities))
    && (!Object.hasOwn(value, "artifactScope") || value.artifactScope === "origin" || value.artifactScope === "work");
}
export function studioCrdtReaderMetadata(value: StudioCrdtReaderMetadata): StudioCrdtReaderMetadata {
  return { ...(value.readerCapabilities ? { readerCapabilities: value.readerCapabilities } : {}),
    ...(value.requiredReaderCapabilities ? { requiredReaderCapabilities: value.requiredReaderCapabilities } : {}),
    ...(value.artifactScope ? { artifactScope: value.artifactScope } : {}) };
}
export function requiresStudioBg3dBundleReader(value: StudioCrdtReaderMetadata): boolean {
  return value.requiredReaderCapabilities?.includes(STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY) === true;
}
export function supportsStudioCrdtReaders(value: StudioCrdtReaderMetadata, required: readonly string[] = [STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY]): boolean {
  return required.every((capability) => value.readerCapabilities?.includes(capability));
}
export function assertStudioCrdtSupportedReaders(value: StudioCrdtReaderMetadata): void {
  if (value.requiredReaderCapabilities?.some((entry) => !STUDIO_CRDT_READER_CAPABILITIES.includes(entry))) {
    throw new Error("이 원고의 저장 계약을 지원하는 새 버전이 필요합니다.");
  }
}
