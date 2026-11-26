import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { HandoffProofAndGuestController } from "./handoff-proof-and-guest.controller";
import { HandoffProofAndGuestService } from "./handoff-proof-and-guest.service";
import { PlazaHandoffOpsController } from "./plaza-handoff-ops.controller";
import { StudioEcosystemModule } from "./studio-ecosystem.module";

describe("StudioEcosystemModule", () => {
  it("keeps the in-memory handoff prototype off the public API", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StudioEcosystemModule);
    expect(controllers).toContain(PlazaHandoffOpsController);
    expect(controllers).not.toContain(HandoffProofAndGuestController);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, StudioEcosystemModule))
      .not.toContain(HandoffProofAndGuestService);
  });
});

describe("HandoffProofAndGuestService", () => {
  it("issues and verifies SHA-256 Rights BOM delivery certificate and blocks unverified assets", () => {
    const svc = new HandoffProofAndGuestService();

    expect(() =>
      svc.issueDeliveryRightsCertificate({
        workTitle: "게이트 브레이커",
        episodeLabel: "48화 최종",
        creatorName: "김희준",
        verifiedAssets: [
          {
            assetName: "미확인_외부폰트.otf",
            category: "font",
            licenseType: "unknown",
            licenseVerified: false,
          },
        ],
        zeroUnauthorizedAiConfirmed: true,
      }),
    ).toThrow(/사용권 미확인 소재/);

    const cert = svc.issueDeliveryRightsCertificate({
      workTitle: "게이트 브레이커",
      episodeLabel: "48화 최종",
      creatorName: "김희준",
      verifiedAssets: [
        {
          assetName: "교실_복도_세미나룸.glb",
          category: "3d-bg",
          licenseType: "스튜디오 상용 영구권",
          licenseVerified: true,
        },
        {
          assetName: "본문_말풍선_서체",
          category: "font",
          licenseType: "OFL-1.1",
          licenseVerified: true,
        },
      ],
      zeroUnauthorizedAiConfirmed: true,
    });

    expect(cert.sha256Digest).toHaveLength(64);
    expect(cert.assetCount).toBe(2);
    expect(
      svc.verifyDeliveryRightsCertificate(cert.certificateId, cert.sha256Digest)
        .valid,
    ).toBe(true);
    expect(
      svc.verifyDeliveryRightsCertificate(cert.certificateId, "0".repeat(64))
        .valid,
    ).toBe(false);
  });

  it("mints zero-signup guest review link, accepts mandatory pin, and blocks access immediately on revoke", () => {
    const svc = new HandoffProofAndGuestService();
    const link = svc.createGuestReviewLink({
      workspaceId: "ws-ep48",
      episodeCutLabel: "48화 08~12컷 비교 검수",
      createdByUserId: "pd-kim",
      ttlHours: 24,
    });

    expect(link.token.startsWith("grv_")).toBe(true);
    const withPin = svc.submitGuestReviewPin(link.token, {
      reviewerLabel: "원작사 담당 편집자",
      cutNumber: 8,
      noteKo: "책상 위 소품 그림자 방향만 창가 쪽으로 맞춰 주세요.",
      mandatory: true,
    });
    expect(withPin.pins).toHaveLength(1);
    expect(withPin.pins[0]?.mandatory).toBe(true);

    svc.revokeGuestReviewLink(link.token);
    expect(() => svc.getGuestReviewSession(link.token)).toThrow(
      /회수된 외부 검수 링크/,
    );
  });

  it("stores studio BYOK routing mode with masked 4-char hint only and zero raw secret retention", () => {
    const svc = new HandoffProofAndGuestService();
    const policy = svc.configureStudioByokPolicy({
      workspaceId: "ws-ep48",
      enabled: true,
      provider: "openai",
      keyTailHint: "sk-proj-super-secret-9A7F",
    });

    expect(policy.enabled).toBe(true);
    expect(policy.maskedKeyHint).toBe("****-9A7F");
    expect(JSON.stringify(policy)).not.toContain("super-secret");
    expect(policy.platformTokenChargeKrw).toBe(0);
  });
});
