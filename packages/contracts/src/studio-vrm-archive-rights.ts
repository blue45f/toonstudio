import type { StudioVrmLicenseMetadataReceipt } from "./studio-vrm-license-metadata";
import type { StudioVrmAvatarActorBasis, StudioVrmLicenseActionContext } from "./studio-vrm-license-policy";

export type StudioVrmAttestedContentClassification = "absent" | "present" | "unknown";


export interface StudioVrmProjectArchiveUseContextReceipt {
  readonly schema: "toonstudio.vrm-project-archive-use-context";
  readonly version: 1;
  readonly confirmedByUser: true;
  readonly actorIdentity: {
    readonly verification: "user-attested";
    readonly avatarPermissionBasis: StudioVrmAvatarActorBasis;
  };
  readonly attribution: {
    readonly verification: "user-attested";
    readonly commitment: "retain-exact-embedded-text-unchanged";
    readonly exactTexts: readonly string[];
  };
  readonly content: {
    readonly excessivelyViolent: StudioVrmAttestedContentClassification;
    readonly excessivelySexual: StudioVrmAttestedContentClassification;
    readonly politicalOrReligious: StudioVrmAttestedContentClassification;
    readonly antisocialOrHate: StudioVrmAttestedContentClassification;
  };
}

export interface StudioVrmProjectArchiveUseContextInput {
  readonly confirmedByUser: true;
  readonly avatarPermissionBasis: StudioVrmAvatarActorBasis;
  /** Exact bounded disclosure strings shown by the archive confirmation UI. */
  readonly confirmedAttributionTexts: readonly string[];
  readonly excessivelyViolent: StudioVrmAttestedContentClassification;
  readonly excessivelySexual: StudioVrmAttestedContentClassification;
  readonly politicalOrReligious: StudioVrmAttestedContentClassification;
  readonly antisocialOrHate: StudioVrmAttestedContentClassification;
}


export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const CONTENT_CLASSIFICATIONS = new Set<StudioVrmAttestedContentClassification>([
  "absent",
  "present",
  "unknown",
]);
export const ACTOR_BASES = new Set<StudioVrmAvatarActorBasis>([
  "author",
  "separately-licensed-person",
  "other",
  "unknown",
]);

export function isCanonicalAttributionText(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 160) return false;
  if (value === "") return true;
  const canonical = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (canonical !== value) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f
      || (codePoint >= 0x7f && codePoint <= 0x9f)
      || /\p{Cf}/u.test(character)
    ) return false;
  }
  return true;
}

function isCanonicalArchiveAttributionTexts(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= 512
    && value.every(isCanonicalAttributionText)
    && new Set(value).size === value.length;
}


export function isStudioVrmProjectArchiveUseContextReceipt(
  value: unknown,
): value is StudioVrmProjectArchiveUseContextReceipt {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Partial<StudioVrmProjectArchiveUseContextReceipt>;
  const actorIdentity = receipt.actorIdentity;
  const content = receipt.content;
  return receipt.schema === "toonstudio.vrm-project-archive-use-context"
    && receipt.version === 1
    && receipt.confirmedByUser === true
    && actorIdentity?.verification === "user-attested"
    && ACTOR_BASES.has(actorIdentity.avatarPermissionBasis)
    && receipt.attribution?.verification === "user-attested"
    && receipt.attribution.commitment === "retain-exact-embedded-text-unchanged"
    && isCanonicalArchiveAttributionTexts(receipt.attribution.exactTexts)
    && content != null
    && CONTENT_CLASSIFICATIONS.has(content.excessivelyViolent)
    && CONTENT_CLASSIFICATIONS.has(content.excessivelySexual)
    && CONTENT_CLASSIFICATIONS.has(content.politicalOrReligious)
    && CONTENT_CLASSIFICATIONS.has(content.antisocialOrHate);
}

export function createStudioVrmProjectArchiveUseContextReceipt(
  input: StudioVrmProjectArchiveUseContextInput,
): StudioVrmProjectArchiveUseContextReceipt {
  if (
    input.confirmedByUser !== true
    || !ACTOR_BASES.has(input.avatarPermissionBasis)
    || !isCanonicalArchiveAttributionTexts(input.confirmedAttributionTexts)
    || !CONTENT_CLASSIFICATIONS.has(input.excessivelyViolent)
    || !CONTENT_CLASSIFICATIONS.has(input.excessivelySexual)
    || !CONTENT_CLASSIFICATIONS.has(input.politicalOrReligious)
    || !CONTENT_CLASSIFICATIONS.has(input.antisocialOrHate)
  ) {
    throw new TypeError("VRM archive 이용 맥락 확인값이 올바르지 않습니다.");
  }
  return deepFreeze({
    schema: "toonstudio.vrm-project-archive-use-context" as const,
    version: 1 as const,
    confirmedByUser: true as const,
    actorIdentity: {
      verification: "user-attested" as const,
      avatarPermissionBasis: input.avatarPermissionBasis,
    },
    attribution: {
      verification: "user-attested" as const,
      commitment: "retain-exact-embedded-text-unchanged" as const,
      exactTexts: [...input.confirmedAttributionTexts],
    },
    content: {
      excessivelyViolent: input.excessivelyViolent,
      excessivelySexual: input.excessivelySexual,
      politicalOrReligious: input.politicalOrReligious,
      antisocialOrHate: input.antisocialOrHate,
    },
  });
}

export function attestedClassificationValue(
  value: StudioVrmAttestedContentClassification,
): boolean | null {
  return value === "present" ? true : value === "absent" ? false : null;
}

export function studioVrmProjectArchiveActionContext(
  useContextReceipt: StudioVrmProjectArchiveUseContextReceipt | null | undefined,
  licenseReceipt: StudioVrmLicenseMetadataReceipt,
): StudioVrmLicenseActionContext {
  if (!isStudioVrmProjectArchiveUseContextReceipt(useContextReceipt)) return {};
  const expectedAttributionText = boundedAttribution(licenseReceipt);
  return {
    avatarActorBasis: useContextReceipt.actorIdentity.avatarPermissionBasis,
    containsModifiedModel: false,
    containsViolentContent: attestedClassificationValue(
      useContextReceipt.content.excessivelyViolent,
    ),
    containsSexualContent: attestedClassificationValue(
      useContextReceipt.content.excessivelySexual,
    ),
    containsPoliticalOrReligiousContent: attestedClassificationValue(
      useContextReceipt.content.politicalOrReligious,
    ),
    containsAntisocialOrHateContent: attestedClassificationValue(
      useContextReceipt.content.antisocialOrHate,
    ),
    creditProvided: expectedAttributionText !== null
      && useContextReceipt.attribution.exactTexts.includes(expectedAttributionText)
      && studioVrmEmbeddedCreditIsRetained(licenseReceipt),
    // The unchanged GLB retains the model's declared share-alike license and notices.
    shareAlikeSatisfied: licenseReceipt.shareAlike === "required" ? true : null,
  };
}


export function boundedAttribution(
  receipt: StudioVrmLicenseMetadataReceipt,
): string | null {
  if (receipt.credit === "unnecessary") return "";
  if (receipt.credit !== "required" || receipt.authors.length === 0) return null;
  const parts = [
    receipt.title,
    receipt.authors.join(", "),
    receipt.licenseIdentifier,
    receipt.licenseUrl,
  ].filter((part): part is string => Boolean(part));
  const normalized = parts.join(" · ").normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  return normalized.length <= 160 ? normalized : null;
}


/**
 * An unchanged VRM file carries its own author/license metadata into an archive. This is evidence
 * that the embedded notice is retained, not a claim that every external attribution format is met.
 */
export function studioVrmEmbeddedCreditIsRetained(
  receipt: StudioVrmLicenseMetadataReceipt,
): boolean {
  return receipt.authors.length > 0
    && (receipt.licenseIdentifier !== null || receipt.licenseUrl !== null);
}

