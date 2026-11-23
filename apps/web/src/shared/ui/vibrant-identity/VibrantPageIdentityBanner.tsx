import "./vibrant-page-motion.css";

import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";
import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useInRouterContext } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  getVibrantPageIdentity,
  VIBRANT_GLOBAL_QUICK_LINKS,
  type VibrantPageIdentityId,
} from "./page-identity-catalog";

export interface VibrantPageIdentityBannerProps {
  readonly pageId: VibrantPageIdentityId;
  readonly compact?: boolean;
  readonly showQuickLinks?: boolean;
  readonly activeStep?: 1 | 2 | 3;
  readonly headingLevel?: "h2" | "h3" | "p";
  readonly headlineOverride?: string;
  readonly summaryOverride?: string;
  readonly primaryCtaHrefOverride?: string;
  readonly primaryCtaLabelOverride?: string;
  readonly scrollReveal?: boolean;
  readonly className?: string;
  readonly dataTestId?: string;
}

function BannerLink({
  href,
  className,
  ariaCurrent,
  ariaLabel,
  children,
}: {
  readonly href: string;
  readonly className?: string;
  readonly ariaCurrent?: "page" | "step";
  readonly ariaLabel?: string;
  readonly children: ReactNode;
}) {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return (
      <a
        href={href}
        className={className}
        aria-current={ariaCurrent}
        aria-label={ariaLabel}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={className}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function VibrantPageIdentityBanner({
  pageId,
  compact = false,
  showQuickLinks = true,
  activeStep,
  headingLevel = "h2",
  headlineOverride,
  summaryOverride,
  primaryCtaHrefOverride,
  primaryCtaLabelOverride,
  scrollReveal = false,
  className,
  dataTestId,
}: VibrantPageIdentityBannerProps) {
  const bt = useBilingual("VibrantPageIdentityBanner");
  const spec = getVibrantPageIdentity(pageId);
  const stageRef = useRef<HTMLDivElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageFailed = failedSrc === spec.emblemSrc;

  const roleBadge = bt(spec.roleBadge.ko, spec.roleBadge.en);
  const headline = headlineOverride ?? bt(spec.headline.ko, spec.headline.en);
  const summary = summaryOverride ?? bt(spec.summary.ko, spec.summary.en);
  const primaryHref = primaryCtaHrefOverride ?? spec.primaryCta.href;
  const primaryLabel =
    primaryCtaLabelOverride ?? bt(spec.primaryCta.label.ko, spec.primaryCta.label.en);
  const emblemDescription = bt(spec.emblemAlt.ko, spec.emblemAlt.en);

  const handleStagePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || prefersReducedMotion()) return;
    const node = stageRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--vp-tilt-rx", `${(-ny * 7).toFixed(2)}deg`);
    node.style.setProperty("--vp-tilt-ry", `${(nx * 8).toFixed(2)}deg`);
  };

  const handleStagePointerLeave = () => {
    const node = stageRef.current;
    if (!node) return;
    node.style.setProperty("--vp-tilt-rx", "0deg");
    node.style.setProperty("--vp-tilt-ry", "0deg");
  };

  const HeadingTag = headingLevel;

  return (
    <section
      data-testid={dataTestId ?? `vibrant-page-banner-${spec.id}`}
      data-vibrant-page-id={spec.id}
      data-vibrant-mood={spec.mood.key}
      data-vibrant-compact={compact ? "true" : "false"}
      aria-label={bt(`${roleBadge} 안내 배너`, `${roleBadge} identity banner`)}
      className={cn(
        "vp-banner",
        compact && "vp-banner--compact",
        scrollReveal && "vp-scroll-reveal",
        className,
      )}
    >
      <div className="vp-banner-inner">
        <div
          className="vp-banner-head vp-cascade-item"
          style={{ "--vp-stagger-i": 0 } as CSSProperties}
        >
          <div
            ref={stageRef}
            className="vp-emblem-stage vp-specular-sheen"
            data-emblem-alt={emblemDescription}
            onPointerMove={handleStagePointerMove}
            onPointerLeave={handleStagePointerLeave}
          >
            {imageFailed ? (
              <span
                className="vp-emblem-fallback"
                data-testid={`vibrant-emblem-fallback-${spec.id}`}
                aria-hidden="true"
              >
                <Sparkles size={28} strokeWidth={1.6} aria-hidden="true" />
              </span>
            ) : (
              <img
                src={spec.emblemSrc}
                alt=""
                aria-hidden="true"
                width={112}
                height={112}
                loading="eager"
                decoding="async"
                className="vp-emblem-img"
                onError={() => setFailedSrc(spec.emblemSrc)}
              />
            )}
          </div>

          <div className="vp-banner-copy">
            <span className="vp-role-badge">
              <span className="vp-role-dot" aria-hidden="true" />
              <span>{roleBadge}</span>
            </span>
            <HeadingTag className="vp-banner-title">{headline}</HeadingTag>
            <p className="vp-banner-summary">{summary}</p>
          </div>
        </div>

        <ol
          aria-label={bt(`${roleBadge} 3단계 핵심 흐름`, `${roleBadge} 3-step quick flow`)}
          className="vp-flow-list"
        >
          {spec.steps.map((step, index) => {
            const isActive = activeStep === step.stepNumber;
            const stepIndexLabel = `0${step.stepNumber}`;
            return (
              <li
                key={`${spec.id}-step-${step.stepNumber}`}
                className="vp-flow-item vp-cascade-item"
                style={{ "--vp-stagger-i": index + 1 } as CSSProperties}
              >
                <BannerLink
                  href={step.href}
                  ariaCurrent={isActive ? "step" : undefined}
                  className="vp-flow-chip"
                >
                  <span className="vp-step-index" aria-hidden="true">
                    {stepIndexLabel}
                  </span>
                  <span className="vp-step-text">
                    <span className="vp-step-label">{bt(step.label.ko, step.label.en)}</span>
                    <span className="vp-step-detail">{bt(step.detail.ko, step.detail.en)}</span>
                  </span>
                </BannerLink>
                {index < spec.steps.length - 1 ? (
                  <span className="vp-flow-arrow" aria-hidden="true">
                    <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div
          className="vp-actions-bar vp-cascade-item"
          style={{ "--vp-stagger-i": 4 } as CSSProperties}
        >
          <div className="vp-cta-group">
            <BannerLink href={primaryHref} className="vp-cta-primary">
              <span>{primaryLabel}</span>
              <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
            </BannerLink>
          </div>

          {showQuickLinks ? (
            <nav
              aria-label={bt("핵심 작업실 빠른 이동", "Quick hub navigation")}
              className="vp-quick-links"
            >
              {VIBRANT_GLOBAL_QUICK_LINKS.map((quickLink) => (
                <BannerLink
                  key={quickLink.id}
                  href={quickLink.href}
                  className="vp-quick-link"
                >
                  <span>
                    {compact
                      ? bt(quickLink.shortLabel.ko, quickLink.shortLabel.en)
                      : bt(quickLink.label.ko, quickLink.label.en)}
                  </span>
                  <ChevronRight size={13} strokeWidth={1.75} aria-hidden="true" />
                </BannerLink>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}
