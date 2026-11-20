import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { buildEpisodeDeliveryPackage } from "./studio-episode-delivery-package";
import {
  buildGlobalLocalizationRightsManifest,
  formatGlobalLocalizationRightsMarkdown,
} from "./studio-localization-rights-chain";

describe("studio-localization-rights-chain", () => {
  it("clears multi-locale tracks when fonts/SFX are commercial-clean and human post-edit & voice consent are verified", () => {
    const pkg = buildEpisodeDeliveryPackage({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      pack: BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      cuts: [{ cutId: "c1", luma9x8: new Uint8Array(72) }],
      generatedAtIso: "2026-11-20T11:30:00.000Z",
    });
    const receipt = JSON.parse(pkg.receiptJson);

    const manifest = buildGlobalLocalizationRightsManifest({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: receipt.integrityHash,
      sourcePackageIntegrityHash: pkg.packageIntegrityHash,
      tracks: [
        {
          locale: "en-US",
          translatorLabel: "Sarah Kim (EN Localization)",
          letteringFontAsset: "CC Wild Words Commercial",
          letteringFontLicense: "COMMERCIAL",
          sfxAssetLicense: "MIT",
          aiTranslationUsed: true,
          humanPostEdited: true,
          includesVoiceDubbing: false,
          voiceActorConsentVerified: false,
        },
        {
          locale: "ja-JP",
          translatorLabel: "Tanaka Studio",
          letteringFontAsset: "Source Han Sans JP",
          letteringFontLicense: "MIT",
          sfxAssetLicense: "CC0",
          aiTranslationUsed: false,
          humanPostEdited: true,
          includesVoiceDubbing: true,
          voiceActorConsentVerified: true,
        },
      ],
      issuedAtIso: "2026-11-20T11:35:00.000Z",
    });

    expect(manifest.allLocalesCleared).toBe(true);
    expect(manifest.clearedLocaleCount).toBe(2);
    expect(manifest.localizationChainHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const md = formatGlobalLocalizationRightsMarkdown(manifest);
    expect(md).toContain("en-US");
    expect(md).toContain("ja-JP");
    expect(md).toContain("전 언어 배포 승인 (PASS)");
  });

  it("blocks release when localized font is CC-BY-NC or unedited AI translation / unconsented voice dubbing is used", () => {
    const manifest = buildGlobalLocalizationRightsManifest({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      sourceReceiptIntegrityHash: "fnv1a-12345678",
      sourcePackageIntegrityHash: "fnv1a-87654321",
      tracks: [
        {
          locale: "es-ES",
          translatorLabel: "Auto Bot",
          letteringFontAsset: "Free NC Comic Font",
          letteringFontLicense: "CC-BY-NC",
          sfxAssetLicense: "CC0",
          aiTranslationUsed: true,
          humanPostEdited: false,
          includesVoiceDubbing: true,
          voiceActorConsentVerified: false,
        },
      ],
    });

    expect(manifest.allLocalesCleared).toBe(false);
    expect(manifest.blockedLocaleCount).toBe(1);
    expect(manifest.trackEvaluations[0].issues).toHaveLength(3);
  });
});
