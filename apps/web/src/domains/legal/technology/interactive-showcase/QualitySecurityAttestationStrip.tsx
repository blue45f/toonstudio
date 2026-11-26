import {
  Accessibility,
  BookCheck,
  ChevronDown,
  FileCheck2,
  KeyRound,
  PackageCheck,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useId } from "react";

import "./interactive-showcase.css";
import {
  QUALITY_SECURITY_ATTESTATIONS,
  type QualitySecurityAttestationItem,
} from "./interactive-showcase-data";
import { pickShowcaseText, showcaseBi } from "./interactive-showcase-models";

import { cx } from "@/shared/lib/cx";
import { useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const ATTESTATION_ICONS: Readonly<Record<QualitySecurityAttestationItem["id"], LucideIcon>> = {
  "doc-integrity": BookCheck,
  "sharded-typecheck": FileCheck2,
  "wcag-aa-gate": Accessibility,
  "pq-wots-zk": KeyRound,
  "korean-pii-linear": ShieldCheck,
  "zero-eager-bundle": PackageCheck,
};

export interface QualitySecurityAttestationStripProps {
  readonly className?: string;
}

export function QualitySecurityAttestationStrip({
  className,
}: QualitySecurityAttestationStripProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const headingId = `${baseId}-attestation-heading`;

  return (
    <section
      aria-labelledby={headingId}
      data-showcase-widget="quality-security-attestation"
      className={cx(
        "rounded-3xl border border-line/80 bg-panel/75 p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            {showcaseBi(
              "검증된 엔지니어링 · 보안 보증 지표",
              "Verified Engineering & Security Attestations",
            )}
          </p>
          <h3
            id={headingId}
            className="mt-1.5 text-balance break-keep text-xl font-black tracking-tight text-fg sm:text-2xl"
          >
            {showcaseBi(
              "선언이 아니라 CI·로컬 게이트가 매번 실행하는 6대 무결성 계약",
              "6 Repository Integrity Gates Enforced Automatically in Local & CI Checks",
            )}
          </h3>
        </div>
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-good/35 bg-good-soft px-3 py-1 text-xs font-bold tabular-nums text-good">
          <ShieldCheck size={14} aria-hidden="true" />
          {showcaseBi("6개 상시 자동 검증 게이트", "6 Continuous Verification Gates")}
        </span>
      </div>

      {/* 6개 보증 지표 카드 그리드 */}
      <ul
        aria-label={showcaseBi("엔지니어링 및 보안 보증 목록", "Engineering and security attestations")}
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {QUALITY_SECURITY_ATTESTATIONS.map((item) => {
          const Icon = ATTESTATION_ICONS[item.id];
          return (
            <li
              key={item.id}
              data-attestation-card={item.id}
              className="grid content-start gap-2 rounded-2xl border border-line bg-card/80 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-xl border border-accent/35 bg-accent-soft text-accent">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 font-mono text-[0.68rem] font-extrabold tabular-nums text-fg-2">
                  {pickShowcaseText(item.metricBadge)}
                </span>
              </div>
              <h4 className="mt-1 text-sm font-black break-keep text-fg">
                {pickShowcaseText(item.title)}
              </h4>
              <p className="text-xs leading-6 break-keep text-fg-2">
                {pickShowcaseText(item.detail)}
              </p>
            </li>
          );
        })}
      </ul>

      {/* <details> 점진적 공개: 재현 가능한 CLI 검증 명령어와 실재 소스 경로 */}
      <details
        data-attestation-disclosure=""
        className="group/attest mt-4 rounded-2xl border border-line bg-card/65 open:bg-card/90"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs font-black text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2 break-keep">
            <Terminal size={15} className="shrink-0 text-accent" aria-hidden="true" />
            <span>
              {showcaseBi(
                "직접 실행해 확인하는 로컬·CI 검증 명령어 펼치기",
                "Show Reproducible Local & CI Verification Commands",
              )}
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 font-mono text-[0.68rem] font-extrabold tabular-nums text-accent">
              {QUALITY_SECURITY_ATTESTATIONS.length} CLI
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="text-accent transition-transform group-open/attest:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </summary>

        <div className="border-t border-line/70 p-4">
          <dl className="grid gap-2.5 lg:grid-cols-2">
            {QUALITY_SECURITY_ATTESTATIONS.map((item) => (
              <div
                key={item.id}
                className="grid gap-1 rounded-xl border border-line/80 bg-panel/85 p-3"
              >
                <dt className="flex flex-wrap items-center justify-between gap-2 text-xs font-black text-fg">
                  <span className="break-keep">{pickShowcaseText(item.title)}</span>
                  <span className="font-mono text-[0.65rem] font-normal text-fg-3">
                    {item.evidencePath}
                  </span>
                </dt>
                <dd className="m-0">
                  <code className="block overflow-x-auto rounded-lg border border-line bg-card px-2.5 py-1.5 font-mono text-[0.72rem] text-accent">
                    {item.verifyCommand}
                  </code>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </section>
  );
}
