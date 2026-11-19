import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";
import { generateWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

import {
  buildStudioAiOptOutManifest,
  buildTdmRepWellKnownRules,
  serializeStudioAiOptOutManifest,
  verifyAiOptOutManifestJson,
} from "./studio-ai-optout-manifest";
import { buildCutPerceptualRightsEntry } from "./studio-cut-perceptual-rights-ledger";

describe("studio-ai-optout-manifest", () => {
  it("builds and verifies a W3C TDMRep opt-out manifest bound to Rights BOM and perceptual dHashes", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const receipt = generateWorkflowPackRightsReceipt(pack, "2026-11-19T12:00:00.000Z");
    const luma = new Uint8Array(72).map((_, idx) => (idx * 13) % 256);
    const entry = buildCutPerceptualRightsEntry({
      cutId: "cut-01",
      episodeLabel: "1화",
      luma9x8: luma,
      receipt,
      recordedAtIso: "2026-11-19T12:00:00.000Z",
    });

    const manifest = buildStudioAiOptOutManifest({
      seriesTitle: "황녀의 검",
      episodeLabel: "1화",
      rightsHolder: "스튜디오 알파",
      receipt,
      ledger: {
        ledgerSchemaVersion: 1,
        seriesTitle: "황녀의 검",
        entries: [entry],
      },
      issuedAtIso: "2026-11-19T12:05:00.000Z",
    });

    expect(manifest.tdmReservation).toBe(1);
    expect(manifest.aiTrainingAllowed).toBe(false);
    expect(manifest.cutCount).toBe(1);
    expect(manifest.manifestIntegrityHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);

    const serialized = serializeStudioAiOptOutManifest(manifest);
    const verified = verifyAiOptOutManifestJson(serialized);
    expect(verified.validFormat).toBe(true);
    expect(verified.optOutEnforced).toBe(true);
    expect(verified.integrityVerified).toBe(true);

    const tampered = verifyAiOptOutManifestJson(
      JSON.stringify({ ...manifest, rightsHolder: "변조된 권리자" }),
    );
    expect(tampered.integrityVerified).toBe(false);

    const rules = buildTdmRepWellKnownRules(manifest, "/episodes/ep01/*");
    expect(rules).toEqual([{ location: "/episodes/ep01/*", "tdm-reservation": 1 }]);
  });
});
