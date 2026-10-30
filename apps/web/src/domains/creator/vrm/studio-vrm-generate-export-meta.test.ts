import { describe, expect, it } from "vitest";

import { STUDIO_VRM_EXPORT_LICENSE_URL } from "./studio-vrm-export-vrm-extension";
import {
  applyStudioVrmUsagePreset,
  createStudioVrmGenerateExportMetaDraft,
  describeStudioVrmUsageConditions,
  inspectStudioVrmThumbnailBytes,
  matchStudioVrmUsagePreset,
  sanitizeStudioVrmExportProfile,
  STUDIO_VRM_THUMBNAIL_MAX_BYTES,
  STUDIO_VRM_USAGE_PRESETS,
  studioVrmExportProfileFromDraft,
  studioVrmGenerateFileName,
  validateStudioVrmGenerateExportMeta,
} from "./studio-vrm-generate-export-meta";

/** 디코드 없이 헤더만 읽는지 확인하려고, 시그니처와 IHDR 만 있는 PNG 머리를 만든다. */
function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** SOI → APP0 → SOF0 순서의 최소 JPEG 머리. */
function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00,
  ]);
}

describe("export meta draft", () => {
  it("starts from the author-only conditions and the remembered profile", () => {
    const draft = createStudioVrmGenerateExportMetaDraft({
      avatarName: "웨이브 디바",
      profile: {
        ...STUDIO_VRM_USAGE_PRESETS[2].conditions,
        authors: "하늘 작가",
        copyrightInformation: "© 하늘",
        contactInformation: "sky@example.com",
        otherLicenseUrl: "",
      },
    });
    expect(draft).toMatchObject({
      avatarName: "웨이브 디바",
      authors: "하늘 작가",
      avatarPermission: "everyone",
      version: "",
      references: "",
    });
    expect(matchStudioVrmUsagePreset(draft)).toBe("community");
    expect(matchStudioVrmUsagePreset(createStudioVrmGenerateExportMetaDraft({ avatarName: "a" }))).toBe("author-only");
  });

  it("matches each usage preset after applying it and reports manual edits as custom", () => {
    const base = createStudioVrmGenerateExportMetaDraft({ avatarName: "a" });
    for (const preset of STUDIO_VRM_USAGE_PRESETS) {
      expect(matchStudioVrmUsagePreset(applyStudioVrmUsagePreset(base, preset.id))).toBe(preset.id);
    }
    const manual = { ...applyStudioVrmUsagePreset(base, "open"), allowExcessivelyViolentUsage: true };
    expect(matchStudioVrmUsagePreset(manual)).toBeNull();
    expect(describeStudioVrmUsageConditions(applyStudioVrmUsagePreset(base, "open"))).toBe(
      "누구나 사용 · 법인·단체까지 · 크레딧 불필요 · 재배포 허용 · 개변·개변물 재배포 허용",
    );
  });

  it("never enables sensitive uses from a preset", () => {
    for (const preset of STUDIO_VRM_USAGE_PRESETS) {
      expect(preset.conditions).toMatchObject({
        allowExcessivelyViolentUsage: false,
        allowExcessivelySexualUsage: false,
        allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false,
      });
    }
  });
});

describe("validateStudioVrmGenerateExportMeta", () => {
  it("requires an avatar name and at least one author", () => {
    const result = validateStudioVrmGenerateExportMeta(
      createStudioVrmGenerateExportMetaDraft({ avatarName: "  " }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field)).toEqual(["avatarName", "authors"]);
  });

  it("builds explicit VRM 1.0 meta with the fixed licence URL and trimmed lists", () => {
    const draft = {
      ...applyStudioVrmUsagePreset(createStudioVrmGenerateExportMetaDraft({ avatarName: " 시노 " }), "collaborators"),
      authors: "하늘, 바다\n하늘\n",
      version: "1.2",
      references: "https://example.com/original\n\n원작 설정집",
      otherLicenseUrl: "https://example.com/terms",
    };
    const result = validateStudioVrmGenerateExportMeta(draft);
    expect(result.ok).toBe(true);
    expect(result.meta).toEqual({
      name: "시노",
      authors: ["하늘", "바다"],
      licenseUrl: STUDIO_VRM_EXPORT_LICENSE_URL,
      version: "1.2",
      references: ["https://example.com/original", "원작 설정집"],
      avatarPermission: "onlySeparatelyLicensedPerson",
      allowExcessivelyViolentUsage: false,
      allowExcessivelySexualUsage: false,
      commercialUsage: "personalProfit",
      allowPoliticalOrReligiousUsage: false,
      allowAntisocialOrHateUsage: false,
      creditNotation: "required",
      allowRedistribution: false,
      modification: "allowModification",
      otherLicenseUrl: "https://example.com/terms",
    });
  });

  it("rejects non-http licence URLs, oversized fields and control characters stay out", () => {
    const base = { ...createStudioVrmGenerateExportMetaDraft({ avatarName: "a\u0007b" }), authors: "작가" };
    const result = validateStudioVrmGenerateExportMeta({
      ...base,
      otherLicenseUrl: "javascript:alert(1)",
      version: "v".repeat(65),
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.field).sort()).toEqual(["otherLicenseUrl", "version"]);
    const clean = validateStudioVrmGenerateExportMeta(base);
    expect(clean.meta?.name).toBe("a b");
  });
});

describe("export profile", () => {
  it("remembers who made it and on what terms, but not the per-character name", () => {
    const draft = {
      ...createStudioVrmGenerateExportMetaDraft({ avatarName: "시노" }),
      authors: "하늘",
      version: "2",
      references: "원작",
    };
    const profile = studioVrmExportProfileFromDraft(draft);
    expect(profile).not.toHaveProperty("avatarName");
    expect(profile).not.toHaveProperty("version");
    expect(profile).not.toHaveProperty("references");
    expect(sanitizeStudioVrmExportProfile(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
  });

  it("falls back to safe values for a corrupted stored profile", () => {
    expect(sanitizeStudioVrmExportProfile(null)).toBeNull();
    expect(
      sanitizeStudioVrmExportProfile({
        authors: 42,
        avatarPermission: "anyone",
        allowExcessivelySexualUsage: "yes",
        creditNotation: "maybe",
      }),
    ).toMatchObject({
      authors: "",
      avatarPermission: "onlyAuthor",
      allowExcessivelySexualUsage: false,
      creditNotation: "required",
    });
  });
});

describe("thumbnail and file name", () => {
  it("reads PNG and JPEG sizes from headers and flags non-square images", () => {
    const png = inspectStudioVrmThumbnailBytes(pngHeader(1024, 1024));
    expect(png).toMatchObject({ ok: true, square: true, image: { mimeType: "image/png", width: 1024, height: 1024 } });
    const jpeg = inspectStudioVrmThumbnailBytes(jpegHeader(800, 600));
    expect(jpeg).toMatchObject({ ok: true, square: false, image: { mimeType: "image/jpeg", width: 800, height: 600 } });
  });

  it("refuses unknown formats, tiny or huge images and oversized files", () => {
    expect(inspectStudioVrmThumbnailBytes(new Uint8Array(0)).ok).toBe(false);
    expect(inspectStudioVrmThumbnailBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])).ok).toBe(false);
    expect(inspectStudioVrmThumbnailBytes(pngHeader(32, 32)).ok).toBe(false);
    expect(inspectStudioVrmThumbnailBytes(pngHeader(8192, 8192)).ok).toBe(false);
    const huge = new Uint8Array(STUDIO_VRM_THUMBNAIL_MAX_BYTES + 1);
    huge.set(pngHeader(512, 512));
    expect(inspectStudioVrmThumbnailBytes(huge).ok).toBe(false);
  });

  it("derives a safe download name from the avatar name", () => {
    expect(studioVrmGenerateFileName("웨이브 디바")).toBe("웨이브 디바.vrm");
    expect(studioVrmGenerateFileName("a/b:c?*d")).toBe("a b c d.vrm");
    expect(studioVrmGenerateFileName("  ..숨김..  ")).toBe("숨김.vrm");
    expect(studioVrmGenerateFileName("   ")).toBe("ToonStudio 캐릭터.vrm");
  });
});
