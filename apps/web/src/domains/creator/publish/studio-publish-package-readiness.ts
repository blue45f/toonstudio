import type { StudioPublishComplianceResult } from "../studio-publish-compliance";
import type { StudioPublishPackagePlan } from "../studio-publish-package";
import type { StudioPublishPreflightResult } from "../studio-publish-preflight";

export interface StudioPublishPackageReadiness {
  readonly canExport: boolean;
  readonly checksAvailable: boolean;
  readonly blockingIssueCount: number;
  readonly warningCount: number;
  readonly packageErrorCount: number;
  readonly structuralErrors: StudioPublishPreflightResult["errors"];
  readonly humanConfirmationErrors: StudioPublishComplianceResult["errors"];
}

/** 파일 계획과 실제 생성 경계의 검사 결과를 함께 읽는다. 자체 확인 답변은 변경하지 않는다. */
export function resolveStudioPublishPackageReadiness(
  plan: StudioPublishPackagePlan,
  preflight: StudioPublishPreflightResult | null,
  compliance: StudioPublishComplianceResult | null,
): StudioPublishPackageReadiness {
  const destination = plan.settings.destination;
  const checksAvailable = preflight?.profile === destination && compliance?.destination === destination;
  const structuralErrors = preflight?.errors ?? [];
  const humanConfirmationErrors = compliance?.errors ?? [];
  return {
    canExport: checksAvailable && plan.canExport
      && preflight?.canPublish === true && compliance?.readyForDestinationReview === true,
    checksAvailable,
    blockingIssueCount: plan.errors.length + structuralErrors.length + humanConfirmationErrors.length
      + (checksAvailable ? 0 : 1),
    warningCount: plan.warnings.length + (preflight?.warnings.length ?? 0) + (compliance?.warnings.length ?? 0),
    packageErrorCount: plan.errors.length,
    structuralErrors,
    humanConfirmationErrors,
  };
}
