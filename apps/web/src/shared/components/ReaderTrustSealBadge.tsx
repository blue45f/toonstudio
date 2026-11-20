import { CheckCircle2, Globe2, Mic2, ShieldCheck, ShieldOff } from "lucide-react";

import {
  formatReaderTrustSealLabel,
  verifyReaderTrustSealDigest,
  type ReaderTrustSealPayload,
} from "@/shared/lib/reader-trust-seal";
import type { ReaderTrustSealLiveStatus } from "@/shared/lib/reader-trust-seal-revocation";
import { cn } from "@/shared/lib/utils";

/**
 * 독자 열람 페이지·작품 상세 카드에 표시되는 클린 IP 트러스트 배지 컴포넌트.
 * 10단계 프로비넌스 감사 해시와 AI 학습 금지·성우 음성권 동의·실시간 철회 상태를 한눈에 공개한다.
 */
export function ReaderTrustSealBadge({
  seal,
  compact = false,
  liveStatus,
}: {
  readonly seal: ReaderTrustSealPayload;
  readonly compact?: boolean;
  readonly liveStatus?: ReaderTrustSealLiveStatus;
}) {
  const digestValid = liveStatus ? liveStatus.digestValid : verifyReaderTrustSealDigest(seal);
  const isActive = !liveStatus || liveStatus.effectiveStatus === "active";
  const effectiveLevel = liveStatus ? liveStatus.effectiveLevel : seal.level;
  const verified = digestValid && isActive && effectiveLevel !== "unverified";
  let label: string;
  if (!digestValid) {
    label = "인증 해시 불일치";
  } else if (liveStatus && liveStatus.effectiveStatus === "revoked") {
    label = "인증 철회됨";
  } else if (liveStatus && liveStatus.effectiveStatus === "expired") {
    label = "인증 만료됨";
  } else {
    label = formatReaderTrustSealLabel(seal);
  }

  if (compact) {
    return (
      <span
        data-testid="reader-trust-seal-pill"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-bold",
          verified
            ? "border-good/30 bg-good/10 text-good"
            : "border-warn/30 bg-warn/10 text-warn",
        )}
      >
        {verified ? (
          <ShieldCheck className="size-3" aria-hidden />
        ) : (
          <ShieldOff className="size-3" aria-hidden />
        )}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <details
      data-testid="reader-trust-seal-card"
      className="rounded-xl border border-line bg-card p-3 text-fg"
    >
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-xs font-bold">
        <span className="inline-flex items-center gap-1.5">
          {verified ? (
            <ShieldCheck className="size-4 text-good" aria-hidden />
          ) : (
            <ShieldOff className="size-4 text-warn" aria-hidden />
          )}
          <span>{label}</span>
        </span>
        <span className="rounded bg-raised px-2 py-0.5 font-mono text-[0.6rem] text-fg-3">
          {seal.verifiedStagesCount}/{seal.totalStagesCount} · {seal.sealDigestHash}
        </span>
      </summary>

      {liveStatus && liveStatus.effectiveStatus !== "active" ? (
        <p
          role="alert"
          data-testid="reader-trust-seal-revocation-alert"
          className="mt-2 rounded-lg border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[0.64rem] font-bold text-warn"
        >
          {liveStatus.summary}
        </p>
      ) : null}
      <ul className="mt-2.5 flex flex-wrap gap-1.5 text-[0.65rem] text-fg-2">
        <li className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-1">
          <CheckCircle2 className="size-3 text-good" aria-hidden />
          <span>{seal.commercialAssetsCleared ? "상업 클린 에셋 인증" : "에셋 검토 필요"}</span>
        </li>
        <li className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-1">
          <ShieldCheck className="size-3 text-accent" aria-hidden />
          <span>{seal.aiTrainingOptOut ? "AI 무단 학습 금지(TDMRep)" : "TDM 허용 설정"}</span>
        </li>
        {seal.voiceConsentVerified ? (
          <li className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-1">
            <Mic2 className="size-3 text-good" aria-hidden />
            <span>정식 성우 음성권 계약 인증</span>
          </li>
        ) : null}
        {seal.globalLocalesCount > 0 ? (
          <li className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-1">
            <Globe2 className="size-3 text-accent" aria-hidden />
            <span>글로벌 {seal.globalLocalesCount}개국 현지화 검증</span>
          </li>
        ) : null}
      </ul>
    </details>
  );
}
