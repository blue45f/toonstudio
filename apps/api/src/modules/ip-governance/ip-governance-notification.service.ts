import { Injectable } from "@nestjs/common";

import type { ApiRevocationReasonCode } from "./ip-governance.repository";

export interface CreatorGovernanceAlert {
  readonly alertId: string;
  readonly slug: string;
  readonly kind: "revocation-hold" | "reissuance-restored";
  readonly reasonCode: ApiRevocationReasonCode | "reissued";
  readonly title: string;
  readonly remediationGuide: string;
  readonly createdAtIso: string;
}

const REMEDIATION_GUIDES: Record<ApiRevocationReasonCode, string> = {
  "font-license-expired":
    "만료된 외주 폰트를 Pretendard(OFL) 또는 상업 라이선스 갱신 폰트로 교체한 뒤 1클릭 재발급을 실행해 주세요.",
  "voice-contract-terminated":
    "성우 AI 음성권 계약 갱신본을 업로드하거나 무빙툰 더빙 트랙을 비활성화한 뒤 재발급해 주세요.",
  "asset-takedown":
    "문제가 된 외부 3D/브러시 에셋을 CC0 또는 스튜디오 자체 에셋으로 교체한 뒤 재검증해 주세요.",
  "manual-compliance-hold":
    "법무·운영팀 검토 메모를 확인하고 증빙 참조 ID를 첨부해 재발급을 요청해 주세요.",
};

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 철회·에스크로 보류 및 재발급 복구 시 창작자에게 즉시 사유와 대체 에셋 가이드를 발행하는 알림 서비스.
 */
@Injectable()
export class IpGovernanceNotificationService {
  private readonly alertsBySlug = new Map<string, CreatorGovernanceAlert[]>();

  notifyRevocationHold(params: {
    readonly slug: string;
    readonly seriesTitle: string;
    readonly reasonCode: ApiRevocationReasonCode;
    readonly reasonDetail: string;
    readonly occurredAtIso: string;
  }): CreatorGovernanceAlert {
    const alert: CreatorGovernanceAlert = {
      alertId: `ALT-${fnv1aHex(`${params.slug}:hold:${params.occurredAtIso}:${params.reasonCode}`).slice(6)}`,
      slug: params.slug,
      kind: "revocation-hold",
      reasonCode: params.reasonCode,
      title: `[정산 보류 안내] ${params.seriesTitle} — ${params.reasonDetail}`,
      remediationGuide: REMEDIATION_GUIDES[params.reasonCode],
      createdAtIso: params.occurredAtIso,
    };
    const list = this.alertsBySlug.get(params.slug) ?? [];
    list.unshift(alert);
    this.alertsBySlug.set(params.slug, list);
    return alert;
  }

  notifyReissuanceRestored(params: {
    readonly slug: string;
    readonly seriesTitle: string;
    readonly replacementAssetLabel: string;
    readonly occurredAtIso: string;
  }): CreatorGovernanceAlert {
    const alert: CreatorGovernanceAlert = {
      alertId: `ALT-${fnv1aHex(`${params.slug}:restored:${params.occurredAtIso}`).slice(6)}`,
      slug: params.slug,
      kind: "reissuance-restored",
      reasonCode: "reissued",
      title: `[정산 보류 해제] ${params.seriesTitle} 트러스트 배지 재발급 완료`,
      remediationGuide: `대체 에셋(${params.replacementAssetLabel}) 증빙이 승인되어 에스크로 정상 지급이 재개되었습니다.`,
      createdAtIso: params.occurredAtIso,
    };
    const list = this.alertsBySlug.get(params.slug) ?? [];
    list.unshift(alert);
    this.alertsBySlug.set(params.slug, list);
    return alert;
  }

  listAlertsForSlug(slug: string): readonly CreatorGovernanceAlert[] {
    return this.alertsBySlug.get(slug) ?? [];
  }
}
