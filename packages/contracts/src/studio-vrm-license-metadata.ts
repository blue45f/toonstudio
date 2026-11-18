import {
  STUDIO_VRM_LICENSE_METADATA_LIMITS,
  STUDIO_VRM_1_PUBLIC_LICENSE_URL,
  type StudioVrmCommercialPermission,
  type StudioVrmModificationPermission,
  type StudioVrmBinaryPermission,
  type StudioVrmCreditPermission,
  type StudioVrmShareAlikePermission,
  type StudioVrmLicenseMetadataReceipt,
  type StudioVrmLicenseMetadataParseResult,
  type JsonRecord,
  MetadataAdmissionError,
  TEXT_ENCODER,
  LEGACY_LICENSE_NAMES,
  explicitVrm1CreativeCommonsLicense,
  deepFreeze,
  fail,
  isPlainRecord,
  boundedRecord,
  ownValue,
  inspectMetadataJson,
  rawString,
  rawBooleanOrString,
  rawStringArray,
  normalizeDisplayText,
  normalizeHttpUrl,
  createDiagnosticWriter,
  validateOptionalUrl,
  validateEnum,
  validateBoolean,
  validateOptionalLicenseText,
} from "./studio-vrm-license-fields";

export {
  STUDIO_VRM_LICENSE_METADATA_LIMITS,
  STUDIO_VRM_1_PUBLIC_LICENSE_URL,
  STUDIO_VRM_CC0_1_LICENSE_URL,
  STUDIO_VRM_CC_BY_4_LICENSE_URL,
  STUDIO_VRM_CC_BY_NC_4_LICENSE_URL,
  type StudioVrmLicenseSpec,
  type StudioVrmCommercialPermission,
  type StudioVrmModificationPermission,
  type StudioVrmBinaryPermission,
  type StudioVrmCreditPermission,
  type StudioVrmShareAlikePermission,
  type StudioVrmAvatarPermission,
  type StudioVrmLicenseDiagnosticCode,
  type StudioVrmLicenseDiagnostic,
  type StudioVrmLicenseRawIntent,
  type StudioVrmLicenseMetadataReceipt,
  type StudioVrmLicenseMetadataFailureCode,
  type StudioVrmLicenseMetadataParseResult,
} from "./studio-vrm-license-fields";

function buildVrm0Receipt(meta: JsonRecord, metadataJsonBytes: number): StudioVrmLicenseMetadataReceipt {
  const writer = createDiagnosticWriter();
  const basePath = "extensions.VRM.meta";
  const titleRaw = ownValue(meta, "title");
  const authorRaw = ownValue(meta, "author");
  const title = normalizeDisplayText(titleRaw);
  const author = normalizeDisplayText(authorRaw);
  if (titleRaw !== undefined && title === null) {
    writer.add("error", typeof titleRaw === "string" ? "invalid-field-value" : "invalid-field-type",
      `${basePath}.title`, "VRM 0.x title must be a bounded, display-safe string.");
  }
  if (authorRaw !== undefined && author === null) {
    writer.add("error", typeof authorRaw === "string" ? "invalid-field-value" : "invalid-field-type",
      `${basePath}.author`, "VRM 0.x author must be a bounded, display-safe string.");
  }

  const licenseName = validateEnum<string>(
    meta,
    "licenseName",
    LEGACY_LICENSE_NAMES,
    `${basePath}.licenseName`,
    writer.add
  );
  const declaredAvatarPermission = validateEnum<
    "OnlyAuthor" | "ExplicitlyLicensedPerson" | "Everyone"
  >(
    meta,
    "allowedUserName",
    new Set(["OnlyAuthor", "ExplicitlyLicensedPerson", "Everyone"]),
    `${basePath}.allowedUserName`,
    writer.add,
  );
  const declaredCommercial = validateEnum<"Allow" | "Disallow">(
    meta,
    "commercialUssageName",
    new Set(["Allow", "Disallow"]),
    `${basePath}.commercialUssageName`,
    writer.add
  );
  const declaredViolent = validateEnum<"Allow" | "Disallow">(
    meta,
    "violentUssageName",
    new Set(["Allow", "Disallow"]),
    `${basePath}.violentUssageName`,
    writer.add
  );
  const declaredSexual = validateEnum<"Allow" | "Disallow">(
    meta,
    "sexualUssageName",
    new Set(["Allow", "Disallow"]),
    `${basePath}.sexualUssageName`,
    writer.add
  );
  const otherLicenseUrl = validateOptionalUrl(
    meta,
    "otherLicenseUrl",
    `${basePath}.otherLicenseUrl`,
    writer.add
  );
  const otherPermissionUrl = validateOptionalUrl(
    meta,
    "otherPermissionUrl",
    `${basePath}.otherPermissionUrl`,
    writer.add
  );

  const isNc = licenseName === "CC_BY_NC"
    || licenseName === "CC_BY_NC_SA"
    || licenseName === "CC_BY_NC_ND";
  if (declaredCommercial === "Allow" && isNc) {
    writer.add(
      "error",
      "conflicting-license-declarations",
      `${basePath}.commercialUssageName`,
      "Commercial use is declared Allow while the selected Creative Commons license is noncommercial."
    );
  }

  let commercial: StudioVrmCommercialPermission = declaredCommercial === "Allow"
    ? "allow"
    : declaredCommercial === "Disallow"
      ? "disallow"
      : "unknown";
  if (isNc) commercial = "disallow";
  else if (commercial === "unknown" && licenseName?.startsWith("CC")) commercial = "allow";

  let modification: StudioVrmModificationPermission = "unknown";
  let redistribution: StudioVrmBinaryPermission = "unknown";
  let credit: StudioVrmCreditPermission = "unknown";
  let shareAlike: StudioVrmShareAlikePermission = "unknown";
  if (licenseName === "Redistribution_Prohibited") {
    redistribution = "disallow";
  } else if (licenseName === "CC0") {
    modification = "allow-modification-redistribution";
    redistribution = "allow";
    credit = "unnecessary";
    shareAlike = "not-required";
  } else if (licenseName?.startsWith("CC_BY")) {
    const noDerivatives = licenseName.endsWith("_ND");
    const requiresShareAlike = licenseName.endsWith("_SA");
    modification = noDerivatives ? "prohibited" : "allow-modification-redistribution";
    redistribution = "allow";
    credit = "required";
    shareAlike = requiresShareAlike ? "required" : "not-required";
  }

  const diagnostics = Object.freeze(writer.diagnostics.map((entry) => Object.freeze(entry)));
  return deepFreeze({
    schema: "toonstudio.vrm-license-metadata" as const,
    version: 1 as const,
    spec: "vrm0" as const,
    sourcePath: basePath,
    declaredSpecVersion: null,
    conformance: diagnostics.some(({ severity }) => severity === "error")
      ? "nonconformant" as const
      : "conformant" as const,
    metadataJsonBytes,
    title,
    authors: Object.freeze(author ? [author] : []),
    licenseIdentifier: licenseName,
    licenseUrl: licenseName === "Other" ? otherLicenseUrl : null,
    additionalLicenseUrl: otherLicenseUrl,
    additionalPermissionUrl: otherPermissionUrl,
    avatarPermission: declaredAvatarPermission === "OnlyAuthor"
      ? "only-author"
      : declaredAvatarPermission === "ExplicitlyLicensedPerson"
        ? "only-separately-licensed-person"
        : declaredAvatarPermission === "Everyone"
          ? "everyone"
          : "unknown",
    commercial,
    modification,
    redistribution,
    credit,
    violent: declaredViolent === "Allow" ? "allow" : declaredViolent === "Disallow" ? "disallow" : "unknown",
    sexual: declaredSexual === "Allow" ? "allow" : declaredSexual === "Disallow" ? "disallow" : "unknown",
    politicalOrReligious: "unknown" as const,
    antisocialOrHate: "unknown" as const,
    thirdPartyLicenses: null,
    shareAlike,
    rawIntent: {
      title: rawString(meta, "title"),
      authors: rawString(meta, "author") === null
        ? null
        : Object.freeze([rawString(meta, "author")!]),
      licenseUrl: null,
      otherLicenseUrl: rawString(meta, "otherLicenseUrl"),
      otherPermissionUrl: rawString(meta, "otherPermissionUrl"),
      legacyLicenseName: rawString(meta, "licenseName"),
      avatarPermission: rawString(meta, "allowedUserName"),
      commercial: rawString(meta, "commercialUssageName"),
      modification: rawString(meta, "licenseName"),
      redistribution: rawString(meta, "licenseName"),
      credit: rawString(meta, "licenseName"),
      violent: rawBooleanOrString(meta, "violentUssageName"),
      sexual: rawBooleanOrString(meta, "sexualUssageName"),
      politicalOrReligious: null,
      antisocialOrHate: null,
      thirdPartyLicenses: null,
    },
    diagnostics,
  });
}

function buildVrm1Receipt(
  extension: JsonRecord,
  meta: JsonRecord,
  metadataJsonBytes: number
): StudioVrmLicenseMetadataReceipt {
  const writer = createDiagnosticWriter();
  const basePath = "extensions.VRMC_vrm.meta";
  const titleRaw = ownValue(meta, "name");
  const title = normalizeDisplayText(titleRaw);
  if (titleRaw === undefined) {
    writer.add("error", "missing-required-field", `${basePath}.name`, "VRM 1.0 requires meta.name.");
  } else if (title === null) {
    writer.add("error", typeof titleRaw === "string" ? "invalid-field-value" : "invalid-field-type",
      `${basePath}.name`, "VRM 1.0 meta.name must be a bounded, non-empty display string.");
  }

  const authorsRaw = ownValue(meta, "authors");
  const authors: string[] = [];
  if (authorsRaw === undefined) {
    writer.add("error", "missing-required-field", `${basePath}.authors`, "VRM 1.0 requires meta.authors.");
  } else if (!Array.isArray(authorsRaw)) {
    writer.add("error", "invalid-field-type", `${basePath}.authors`, "VRM 1.0 meta.authors must be an array.");
  } else if (authorsRaw.length < 1 || authorsRaw.length > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxAuthors) {
    writer.add("error", "invalid-field-value", `${basePath}.authors`, "VRM 1.0 meta.authors must contain 1 to 32 authors.");
  } else {
    for (let index = 0; index < authorsRaw.length; index += 1) {
      const author = normalizeDisplayText(authorsRaw[index]);
      if (author === null) {
        writer.add("error", typeof authorsRaw[index] === "string" ? "invalid-field-value" : "invalid-field-type",
          `${basePath}.authors[${index}]`, "Every VRM 1.0 author must be a bounded, non-empty display string.");
      } else {
        authors.push(author);
      }
    }
  }

  const licenseRaw = ownValue(meta, "licenseUrl");
  const licenseUrl = normalizeHttpUrl(licenseRaw);
  if (licenseRaw === undefined) {
    writer.add("error", "missing-required-field", `${basePath}.licenseUrl`, "VRM 1.0 requires meta.licenseUrl.");
  } else if (!licenseUrl) {
    writer.add("error", typeof licenseRaw === "string" ? "invalid-url" : "invalid-field-type",
      `${basePath}.licenseUrl`, "VRM 1.0 meta.licenseUrl must be an absolute HTTP(S) URL.");
  } else if (licenseUrl !== STUDIO_VRM_1_PUBLIC_LICENSE_URL) {
    writer.add(
      "warning",
      "unsupported-license-document",
      `${basePath}.licenseUrl`,
      "This custom VRM 1.0 license URL is preserved but cannot be automatically authorized by the built-in policy."
    );
  }

  const declaredSpecVersionRaw = ownValue(extension, "specVersion");
  const declaredSpecVersion = typeof declaredSpecVersionRaw === "string"
    && TEXT_ENCODER.encode(declaredSpecVersionRaw).byteLength <= 64
    ? declaredSpecVersionRaw
    : null;
  if (declaredSpecVersionRaw === undefined) {
    writer.add("error", "missing-required-field", "extensions.VRMC_vrm.specVersion",
      "VRMC_vrm requires specVersion.");
  } else if (declaredSpecVersion !== "1.0") {
    writer.add("error", typeof declaredSpecVersionRaw === "string" ? "invalid-field-value" : "invalid-field-type",
      "extensions.VRMC_vrm.specVersion", "This parser only recognizes VRMC_vrm specVersion 1.0.");
  }

  const commercialRaw = ownValue(meta, "commercialUsage");
  const commercialEnum = validateEnum<"personalNonProfit" | "personalProfit" | "corporation">(
    meta,
    "commercialUsage",
    new Set(["personalNonProfit", "personalProfit", "corporation"]),
    `${basePath}.commercialUsage`,
    writer.add
  );
  const modificationRaw = ownValue(meta, "modification");
  const modificationEnum = validateEnum<"prohibited" | "allowModification" | "allowModificationRedistribution">(
    meta,
    "modification",
    new Set(["prohibited", "allowModification", "allowModificationRedistribution"]),
    `${basePath}.modification`,
    writer.add
  );
  const redistributionRaw = ownValue(meta, "allowRedistribution");
  const redistribution = validateBoolean(
    meta,
    "allowRedistribution",
    `${basePath}.allowRedistribution`,
    writer.add
  );
  const creditRaw = ownValue(meta, "creditNotation");
  const creditEnum = validateEnum<"required" | "unnecessary">(
    meta,
    "creditNotation",
    new Set(["required", "unnecessary"]),
    `${basePath}.creditNotation`,
    writer.add
  );
  const violentRaw = ownValue(meta, "allowExcessivelyViolentUsage");
  const violent = validateBoolean(
    meta,
    "allowExcessivelyViolentUsage",
    `${basePath}.allowExcessivelyViolentUsage`,
    writer.add
  );
  const sexualRaw = ownValue(meta, "allowExcessivelySexualUsage");
  const sexual = validateBoolean(
    meta,
    "allowExcessivelySexualUsage",
    `${basePath}.allowExcessivelySexualUsage`,
    writer.add
  );
  const avatarPermissionRaw = ownValue(meta, "avatarPermission");
  const avatarPermissionEnum = validateEnum<
    "onlyAuthor" | "onlySeparatelyLicensedPerson" | "everyone"
  >(
    meta,
    "avatarPermission",
    new Set(["onlyAuthor", "onlySeparatelyLicensedPerson", "everyone"]),
    `${basePath}.avatarPermission`,
    writer.add,
  );
  const politicalRaw = ownValue(meta, "allowPoliticalOrReligiousUsage");
  const political = validateBoolean(
    meta,
    "allowPoliticalOrReligiousUsage",
    `${basePath}.allowPoliticalOrReligiousUsage`,
    writer.add,
  );
  const antisocialRaw = ownValue(meta, "allowAntisocialOrHateUsage");
  const antisocial = validateBoolean(
    meta,
    "allowAntisocialOrHateUsage",
    `${basePath}.allowAntisocialOrHateUsage`,
    writer.add,
  );
  const thirdPartyLicenses = validateOptionalLicenseText(
    meta,
    "thirdPartyLicenses",
    `${basePath}.thirdPartyLicenses`,
    writer.add,
  );
  const otherLicenseUrl = validateOptionalUrl(
    meta,
    "otherLicenseUrl",
    `${basePath}.otherLicenseUrl`,
    writer.add
  );
  // VRM 1.0 requires its public-license document in `licenseUrl`. A second, exact canonical
  // Creative Commons URL is an explicit model license, not an opaque extra term. Anything else
  // remains in `additionalLicenseUrl` and therefore continues to fail closed in outgoing policy.
  const explicitCreativeCommonsLicense = explicitVrm1CreativeCommonsLicense(
    licenseUrl,
    otherLicenseUrl,
  );

  const diagnostics = Object.freeze(writer.diagnostics.map((entry) => Object.freeze(entry)));
  return deepFreeze({
    schema: "toonstudio.vrm-license-metadata" as const,
    version: 1 as const,
    spec: "vrm1" as const,
    sourcePath: basePath,
    declaredSpecVersion,
    conformance: diagnostics.some(({ severity }) => severity === "error")
      ? "nonconformant" as const
      : "conformant" as const,
    metadataJsonBytes,
    title,
    authors: Object.freeze(authors),
    licenseIdentifier: explicitCreativeCommonsLicense?.identifier
      ?? (licenseUrl === STUDIO_VRM_1_PUBLIC_LICENSE_URL
        ? "VRM-Public-License-1.0"
        : null),
    licenseUrl: explicitCreativeCommonsLicense?.url ?? licenseUrl,
    additionalLicenseUrl: explicitCreativeCommonsLicense ? null : otherLicenseUrl,
    additionalPermissionUrl: null,
    avatarPermission: avatarPermissionRaw === undefined
      ? "only-author"
      : avatarPermissionEnum === "onlyAuthor"
        ? "only-author"
        : avatarPermissionEnum === "onlySeparatelyLicensedPerson"
          ? "only-separately-licensed-person"
          : avatarPermissionEnum === "everyone"
            ? "everyone"
            : "unknown",
    commercial: explicitCreativeCommonsLicense?.commercial
      ?? (commercialRaw === undefined
        ? "personal-nonprofit"
        : commercialEnum === "personalNonProfit"
          ? "personal-nonprofit"
          : commercialEnum === "personalProfit"
            ? "personal-profit"
            : commercialEnum === "corporation"
              ? "corporation"
              : "unknown"),
    modification: explicitCreativeCommonsLicense?.modification
      ?? (modificationRaw === undefined
        ? "prohibited"
        : modificationEnum === "prohibited"
          ? "prohibited"
          : modificationEnum === "allowModification"
            ? "allow-modification"
            : modificationEnum === "allowModificationRedistribution"
              ? "allow-modification-redistribution"
              : "unknown"),
    redistribution: explicitCreativeCommonsLicense?.redistribution
      ?? (redistributionRaw === undefined
        ? "disallow"
        : redistribution === true
          ? "allow"
          : redistribution === false
            ? "disallow"
            : "unknown"),
    credit: explicitCreativeCommonsLicense?.credit
      ?? (creditRaw === undefined
        ? "required"
        : creditEnum === "required"
          ? "required"
          : creditEnum === "unnecessary"
            ? "unnecessary"
            : "unknown"),
    violent: violentRaw === undefined
      ? "disallow"
      : violent === true
        ? "allow"
        : violent === false
          ? "disallow"
          : "unknown",
    sexual: sexualRaw === undefined
      ? "disallow"
      : sexual === true
        ? "allow"
        : sexual === false
          ? "disallow"
          : "unknown",
    politicalOrReligious: politicalRaw === undefined
      ? "disallow"
      : political === true
        ? "allow"
        : political === false
          ? "disallow"
          : "unknown",
    antisocialOrHate: antisocialRaw === undefined
      ? "disallow"
      : antisocial === true
        ? "allow"
        : antisocial === false
          ? "disallow"
          : "unknown",
    thirdPartyLicenses,
    shareAlike: explicitCreativeCommonsLicense?.shareAlike ?? "not-required" as const,
    rawIntent: {
      title: rawString(meta, "name"),
      authors: rawStringArray(meta, "authors"),
      licenseUrl: rawString(meta, "licenseUrl"),
      otherLicenseUrl: rawString(meta, "otherLicenseUrl"),
      otherPermissionUrl: null,
      legacyLicenseName: null,
      avatarPermission: rawString(meta, "avatarPermission"),
      commercial: rawString(meta, "commercialUsage"),
      modification: rawString(meta, "modification"),
      redistribution: rawBooleanOrString(meta, "allowRedistribution"),
      credit: rawString(meta, "creditNotation"),
      violent: rawBooleanOrString(meta, "allowExcessivelyViolentUsage"),
      sexual: rawBooleanOrString(meta, "allowExcessivelySexualUsage"),
      politicalOrReligious: rawBooleanOrString(meta, "allowPoliticalOrReligiousUsage"),
      antisocialOrHate: rawBooleanOrString(meta, "allowAntisocialOrHateUsage"),
      thirdPartyLicenses: rawString(meta, "thirdPartyLicenses"),
    },
    diagnostics,
  });
}

export function parseStudioVrmLicenseMetadata(
  input: unknown
): StudioVrmLicenseMetadataParseResult {
  try {
    const root = boundedRecord(input, "glTF root");
    const extensionsValue = ownValue(root, "extensions");
    if (extensionsValue === undefined) {
      return fail("missing-metadata", "The glTF document has no extensions object.");
    }
    const extensions = boundedRecord(extensionsValue, "extensions");
    const hasVrm0 = Object.prototype.hasOwnProperty.call(extensions, "VRM");
    const hasVrm1 = Object.prototype.hasOwnProperty.call(extensions, "VRMC_vrm");
    if (hasVrm0 && hasVrm1) {
      return fail(
        "ambiguous-metadata",
        "A glTF document cannot authorize actions through both VRM 0.x and VRM 1.0 metadata."
      );
    }
    if (!hasVrm0 && !hasVrm1) {
      return fail("missing-metadata", "The glTF document has no recognized VRM metadata extension.");
    }

    if (hasVrm1) {
      const extension = boundedRecord(ownValue(extensions, "VRMC_vrm"), "extensions.VRMC_vrm");
      const metaValue = ownValue(extension, "meta");
      if (metaValue === undefined) {
        return fail("missing-metadata", "extensions.VRMC_vrm.meta is required.");
      }
      const meta = boundedRecord(metaValue, "extensions.VRMC_vrm.meta");
      const metadataJsonBytes = inspectMetadataJson(meta);
      return deepFreeze({ ok: true as const, receipt: buildVrm1Receipt(extension, meta, metadataJsonBytes) });
    }

    const extension = boundedRecord(ownValue(extensions, "VRM"), "extensions.VRM");
    const metaValue = ownValue(extension, "meta");
    if (metaValue === undefined) {
      return fail("missing-metadata", "extensions.VRM.meta is required.");
    }
    const meta = boundedRecord(metaValue, "extensions.VRM.meta");
    const metadataJsonBytes = inspectMetadataJson(meta);
    return deepFreeze({ ok: true as const, receipt: buildVrm0Receipt(meta, metadataJsonBytes) });
  } catch (error) {
    if (error instanceof MetadataAdmissionError) return fail(error.code, error.message);
    return fail("invalid-root", "The glTF document could not be inspected as bounded JSON data.");
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Receipt numbers must be finite.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isPlainRecord(value)) throw new TypeError("Receipt must contain only plain JSON data.");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

/** Stable key ordering for a caller that wants to hash or sign an admitted receipt. */
export function canonicalStudioVrmLicenseMetadataReceiptJson(
  receipt: StudioVrmLicenseMetadataReceipt
): string {
  return canonicalJson(receipt);
}
