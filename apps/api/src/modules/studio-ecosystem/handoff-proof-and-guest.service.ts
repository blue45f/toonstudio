import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

export interface VerifiedAssetEntryInput {
  readonly assetName: string;
  readonly category: "3d-bg" | "font" | "brush" | "texture" | "ai-assist";
  readonly licenseType: string;
  readonly licenseVerified: boolean;
}

export interface DeliveryRightsCertificateRecord {
  readonly certificateId: string;
  readonly workTitle: string;
  readonly episodeLabel: string;
  readonly creatorName: string;
  readonly assetCount: number;
  readonly verifiedAssets: readonly VerifiedAssetEntryInput[];
  readonly zeroUnauthorizedAiConfirmed: boolean;
  readonly sha256Digest: string;
  readonly shortVerifyCode: string;
  readonly issuedAt: string;
}

export interface GuestReviewPinEntry {
  readonly pinId: string;
  readonly reviewerLabel: string;
  readonly cutNumber: number;
  readonly noteKo: string;
  readonly mandatory: boolean;
  readonly createdAt: string;
}

export interface GuestReviewLinkRecord {
  readonly token: string;
  readonly workspaceId: string;
  readonly episodeCutLabel: string;
  readonly createdByUserId: string;
  readonly status: "active" | "revoked";
  readonly expiresAt: string;
  readonly pins: readonly GuestReviewPinEntry[];
  readonly createdAt: string;
}

export interface StudioByokPolicyRecord {
  readonly workspaceId: string;
  readonly enabled: boolean;
  readonly provider: "openai" | "anthropic" | "gemini" | "local";
  readonly maskedKeyHint: string | null;
  readonly platformTokenChargeKrw: 0;
  readonly updatedAt: string;
}

function maskKeyHint(rawHint?: string): string | null {
  if (!rawHint) return null;
  const trimmed = rawHint.trim();
  if (trimmed.length === 0) return null;
  const tail = trimmed.slice(-4).replace(/[^A-Za-z0-9]/gu, "X");
  return `****-${tail.padStart(4, "X")}`;
}

@Injectable()
export class HandoffProofAndGuestService {
  private readonly certificates = new Map<
    string,
    DeliveryRightsCertificateRecord
  >();

  private readonly guestLinks = new Map<string, GuestReviewLinkRecord>();

  private readonly byokPolicies = new Map<string, StudioByokPolicyRecord>();

  issueDeliveryRightsCertificate(input: {
    readonly workTitle: string;
    readonly episodeLabel: string;
    readonly creatorName: string;
    readonly verifiedAssets: readonly VerifiedAssetEntryInput[];
    readonly zeroUnauthorizedAiConfirmed: boolean;
  }): DeliveryRightsCertificateRecord {
    const workTitle = input.workTitle?.trim();
    const episodeLabel = input.episodeLabel?.trim();
    const creatorName = input.creatorName?.trim();
    if (!workTitle || !episodeLabel || !creatorName) {
      throw new BadRequestException("작품명, 회차, 작성자 정보가 필요합니다.");
    }
    if (!input.zeroUnauthorizedAiConfirmed) {
      throw new BadRequestException(
        "무단 학습·미허가 생성물 미혼입 확인이 필요합니다.",
      );
    }
    const assets = Array.isArray(input.verifiedAssets)
      ? input.verifiedAssets
      : [];
    const unverified = assets.find((a) => !a.licenseVerified);
    if (unverified) {
      throw new BadRequestException(
        `사용권 미확인 소재(${unverified.assetName})가 남아 확인서를 발급할 수 없습니다.`,
      );
    }

    const issuedAt = new Date().toISOString();
    const canonicalPayload = JSON.stringify({
      workTitle,
      episodeLabel,
      creatorName,
      zeroUnauthorizedAiConfirmed: true,
      assets: assets.map((a) => ({
        assetName: a.assetName.trim(),
        category: a.category,
        licenseType: a.licenseType.trim(),
        licenseVerified: true,
      })),
      issuedAt,
    });
    const sha256Digest = createHash("sha256")
      .update(canonicalPayload, "utf8")
      .digest("hex");
    const certificateId = `cert_${sha256Digest.slice(0, 12)}`;
    const record: DeliveryRightsCertificateRecord = {
      certificateId,
      workTitle,
      episodeLabel,
      creatorName,
      assetCount: assets.length,
      verifiedAssets: assets,
      zeroUnauthorizedAiConfirmed: true,
      sha256Digest,
      shortVerifyCode: sha256Digest.slice(0, 8).toUpperCase(),
      issuedAt,
    };
    this.certificates.set(certificateId, record);
    return record;
  }

  verifyDeliveryRightsCertificate(
    certificateId: string,
    expectedDigest?: string,
  ): {
    readonly valid: boolean;
    readonly certificate: DeliveryRightsCertificateRecord;
  } {
    const cert = this.certificates.get(certificateId);
    if (!cert) {
      throw new NotFoundException("발급된 납품 권리 확인서를 찾을 수 없습니다.");
    }
    const valid = expectedDigest ? cert.sha256Digest === expectedDigest : true;
    return { valid, certificate: cert };
  }

  createGuestReviewLink(input: {
    readonly workspaceId: string;
    readonly episodeCutLabel: string;
    readonly createdByUserId: string;
    readonly ttlHours?: number;
  }): GuestReviewLinkRecord {
    const workspaceId = input.workspaceId?.trim();
    const episodeCutLabel = input.episodeCutLabel?.trim();
    const createdByUserId = input.createdByUserId?.trim() || "studio-pd";
    if (!workspaceId || !episodeCutLabel) {
      throw new BadRequestException("작업방 ID와 검수 대상 회차·컷 정보가 필요합니다.");
    }
    const ttl = Math.min(Math.max(input.ttlHours ?? 48, 1), 168);
    const now = Date.now();
    const token = `grv_${randomBytes(9).toString("hex")}`;
    const record: GuestReviewLinkRecord = {
      token,
      workspaceId,
      episodeCutLabel,
      createdByUserId,
      status: "active",
      expiresAt: new Date(now + ttl * 3600_000).toISOString(),
      pins: [],
      createdAt: new Date(now).toISOString(),
    };
    this.guestLinks.set(token, record);
    return record;
  }

  private assertActiveGuestLink(token: string): GuestReviewLinkRecord {
    const link = this.guestLinks.get(token);
    if (!link) {
      throw new NotFoundException("유효하지 않은 외부 검수 링크입니다.");
    }
    if (link.status !== "active") {
      throw new ForbiddenException("회수된 외부 검수 링크입니다.");
    }
    if (Date.parse(link.expiresAt) <= Date.now()) {
      throw new ForbiddenException("열람 기한이 만료된 외부 검수 링크입니다.");
    }
    return link;
  }

  getGuestReviewSession(token: string): GuestReviewLinkRecord {
    return this.assertActiveGuestLink(token);
  }

  submitGuestReviewPin(
    token: string,
    input: {
      readonly reviewerLabel: string;
      readonly cutNumber: number;
      readonly noteKo: string;
      readonly mandatory?: boolean;
    },
  ): GuestReviewLinkRecord {
    const current = this.assertActiveGuestLink(token);
    const noteKo = input.noteKo?.trim();
    if (!noteKo || input.cutNumber < 1) {
      throw new BadRequestException("컷 번호(1 이상)와 수정 요청 내용을 입력해 주세요.");
    }
    const pin: GuestReviewPinEntry = {
      pinId: `gpin_${randomBytes(4).toString("hex")}`,
      reviewerLabel: input.reviewerLabel?.trim() || "외부 담당 PD",
      cutNumber: Math.floor(input.cutNumber),
      noteKo,
      mandatory: input.mandatory !== false,
      createdAt: new Date().toISOString(),
    };
    const updated: GuestReviewLinkRecord = {
      ...current,
      pins: [...current.pins, pin],
    };
    this.guestLinks.set(token, updated);
    return updated;
  }

  revokeGuestReviewLink(token: string): GuestReviewLinkRecord {
    const link = this.guestLinks.get(token);
    if (!link) {
      throw new NotFoundException("회수할 외부 검수 링크를 찾을 수 없습니다.");
    }
    const revoked: GuestReviewLinkRecord = {
      ...link,
      status: "revoked",
    };
    this.guestLinks.set(token, revoked);
    return revoked;
  }

  configureStudioByokPolicy(input: {
    readonly workspaceId: string;
    readonly enabled: boolean;
    readonly provider: "openai" | "anthropic" | "gemini" | "local";
    readonly keyTailHint?: string;
  }): StudioByokPolicyRecord {
    const workspaceId = input.workspaceId?.trim();
    if (!workspaceId) {
      throw new BadRequestException("작업방 ID가 필요합니다.");
    }
    const record: StudioByokPolicyRecord = {
      workspaceId,
      enabled: Boolean(input.enabled),
      provider: input.provider,
      maskedKeyHint: input.enabled ? maskKeyHint(input.keyTailHint) : null,
      platformTokenChargeKrw: 0,
      updatedAt: new Date().toISOString(),
    };
    this.byokPolicies.set(workspaceId, record);
    return record;
  }

  getStudioByokPolicy(workspaceId: string): StudioByokPolicyRecord {
    return (
      this.byokPolicies.get(workspaceId) ?? {
        workspaceId,
        enabled: false,
        provider: "local",
        maskedKeyHint: null,
        platformTokenChargeKrw: 0,
        updatedAt: "2026-11-26T00:00:00.000Z",
      }
    );
  }
}
