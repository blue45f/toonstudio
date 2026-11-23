import "./vibrant-page-motion.css";

import { ArrowRight, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useInRouterContext } from "react-router-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  getVibrantPageIdentity,
  type VibrantPageIdentityId,
} from "./page-identity-catalog";

export interface VibrantEmptyStateAction {
  readonly label: string;
  readonly href?: string;
  readonly onClick?: () => void;
}

export interface VibrantVisualEmptyStateProps {
  readonly pageId: VibrantPageIdentityId;
  readonly title: string;
  readonly description: string;
  readonly primaryAction: VibrantEmptyStateAction;
  readonly secondaryAction?: VibrantEmptyStateAction;
  readonly role?: "status" | "region";
  readonly headingLevel?: "h2" | "h3";
  readonly compact?: boolean;
  readonly showStepHints?: boolean;
  readonly className?: string;
  readonly dataTestId?: string;
}

function EmptyActionControl({
  action,
  variant,
  children,
}: {
  readonly action: VibrantEmptyStateAction;
  readonly variant: "primary" | "secondary";
  readonly children: ReactNode;
}) {
  const inRouter = useInRouterContext();
  const controlClass = variant === "primary" ? "vp-cta-primary" : "vp-cta-secondary";

  if (action.href && !action.onClick) {
    if (!inRouter) {
      return (
        <a href={action.href} className={controlClass}>
          {children}
        </a>
      );
    }
    return (
      <Link href={action.href} className={controlClass}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={controlClass}>
      {children}
    </button>
  );
}

export function VibrantVisualEmptyState({
  pageId,
  title,
  description,
  primaryAction,
  secondaryAction,
  role = "status",
  headingLevel = "h3",
  compact = false,
  showStepHints = false,
  className,
  dataTestId,
}: VibrantVisualEmptyStateProps) {
  const bt = useBilingual("VibrantVisualEmptyState");
  const spec = getVibrantPageIdentity(pageId);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const imageFailed = failedSrc === spec.emblemSrc;

  const HeadingTag = headingLevel;
  const roleBadge = bt(spec.roleBadge.ko, spec.roleBadge.en);

  return (
    <div
      role={role}
      aria-label={role === "region" ? title : undefined}
      data-testid={dataTestId ?? `vibrant-empty-state-${spec.id}`}
      data-vibrant-page-id={spec.id}
      data-vibrant-mood={spec.mood.key}
      data-vibrant-empty="true"
      className={cn("vp-empty", compact && "vp-empty--compact", className)}
    >
      <div className="vp-empty-medallion vp-specular-sheen" aria-hidden="true">
        {imageFailed ? (
          <span
            className="vp-emblem-fallback"
            data-testid={`vibrant-empty-fallback-${spec.id}`}
          >
            <Sparkles size={26} strokeWidth={1.6} aria-hidden="true" />
          </span>
        ) : (
          <img
            src={spec.emblemSrc}
            alt=""
            aria-hidden="true"
            width={96}
            height={96}
            loading="lazy"
            decoding="async"
            className="vp-emblem-img"
            onError={() => setFailedSrc(spec.emblemSrc)}
          />
        )}
      </div>

      <span className="vp-role-badge">
        <span className="vp-role-dot" aria-hidden="true" />
        <span>{roleBadge}</span>
      </span>

      <HeadingTag className="vp-empty-title">{title}</HeadingTag>
      <p className="vp-empty-desc">{description}</p>

      {showStepHints ? (
        <ol
          aria-label={bt(`${roleBadge} 다음 단계 힌트`, `${roleBadge} next step hints`)}
          className="vp-empty-step-hints"
        >
          {spec.steps.map((step) => (
            <li key={`${spec.id}-empty-step-${step.stepNumber}`} className="vp-empty-step-pill">
              <span aria-hidden="true">{`0${step.stepNumber}`}</span>
              <span>{bt(step.label.ko, step.label.en)}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="vp-empty-actions">
        <EmptyActionControl action={primaryAction} variant="primary">
          <span>{primaryAction.label}</span>
          <ArrowRight size={15} strokeWidth={1.75} aria-hidden="true" />
        </EmptyActionControl>
        {secondaryAction ? (
          <EmptyActionControl action={secondaryAction} variant="secondary">
            <span>{secondaryAction.label}</span>
          </EmptyActionControl>
        ) : null}
      </div>
    </div>
  );
}
