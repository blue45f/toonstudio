import type { CSSProperties } from "react";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/shared/lib/i18n";
import Link from "@/shared/navigation/router-link";
import { runSameDocumentViewTransition } from "@/shared/navigation/webtoon-platform-router-ux-model";
import {
  getNanoBananaSiteCard,
  type NanoBananaCardId,
  type NanoBananaInteractiveLens,
  resolveNanoBananaCardForPath,
} from "./nano-banana-site-ui-pack";
import "./nano-banana-site-ui.css";

export interface NanoBananaSurfaceSpotlightProps {
  readonly cardId?: NanoBananaCardId;
  readonly pathname?: string;
  readonly compact?: boolean;
  readonly defaultLensId?: NanoBananaInteractiveLens["id"];
  readonly className?: string;
}

export function NanoBananaSurfaceSpotlight({
  cardId,
  pathname,
  compact = false,
  defaultLensId = "curation",
  className = "",
}: NanoBananaSurfaceSpotlightProps) {
  const location = useLocation();
  const lang = useI18n((state) => state.lang) ?? "ko";
  const isEn = !lang.toLowerCase().startsWith("ko");
  const pick = (copy: { readonly ko: string; readonly en: string }) =>
    isEn ? copy.en : copy.ko;

  const card = cardId
    ? getNanoBananaSiteCard(cardId)
    : resolveNanoBananaCardForPath(pathname ?? location.pathname);

  const [activeLensId, setActiveLensId] =
    useState<NanoBananaInteractiveLens["id"]>(defaultLensId);

  const activeLens =
    card.lenses.find((lens) => lens.id === activeLensId) ?? card.lenses[0];

  const customVars = {
    "--nb-accent": card.accentHex,
    "--nb-secondary": card.secondaryHex,
  } as CSSProperties;

  return (
    <section
      className={`nb-site-spotlight-shell ${className}`.trim()}
      data-nano-banana-spotlight={card.cardId}
      data-nano-banana-domain={card.domain}
      aria-label={
        isEn
          ? `${card.title.en} Atelier Guide`
          : `${card.title.ko} 아틀리에 가이드`
      }
    >
      <div
        className={`nb-site-spotlight ${compact ? "nb-site-spotlight--compact" : ""}`.trim()}
        style={customVars}
      >
        <div className="nb-site-spotlight__visual" aria-hidden="true">
          <img
            src={card.src640}
            srcSet={card.srcSet}
            sizes="(max-width: 679px) calc(100vw - 48px), 280px"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            width={640}
            height={360}
            className="nb-site-spotlight__img"
          />
          <span className="nb-site-spotlight__visual-badge">
            <span className="nb-site-spotlight__visual-dot" />
            <span>{card.atelierModelLabel}</span>
          </span>
        </div>

        <div className="nb-site-spotlight__body">
          <div>
            <div className="nb-site-spotlight__top">
              <span className="nb-site-spotlight__stage">
                {pick(card.stageBadge)}
              </span>
              <div
                className="nb-site-spotlight__lenses"
                role="group"
                aria-label={isEn ? "Spotlight focus lens" : "스포트라이트 초점 렌즈"}
              >
                {card.lenses.map((lens) => {
                  const isSelected = lens.id === activeLens.id;
                  return (
                    <button
                      key={lens.id}
                      type="button"
                      className="nb-site-spotlight__lens-btn"
                      aria-pressed={isSelected}
                      data-nb-lens={lens.id}
                      onClick={() => {
                        if (lens.id === activeLens.id) return;
                        runSameDocumentViewTransition(() => {
                          setActiveLensId(lens.id);
                        });
                      }}
                    >
                      {pick(lens.label)}
                    </button>
                  );
                })}
              </div>
            </div>

            <h2 className="nb-site-spotlight__title">{pick(card.title)}</h2>
            <p className="nb-site-spotlight__headline">
              {pick(activeLens.headline)}
            </p>
            <p className="nb-site-spotlight__detail">{pick(activeLens.detail)}</p>
          </div>

          <div className="nb-site-spotlight__footer">
            <div className="nb-site-spotlight__chips">
              {card.quickChips.map((chip) => (
                <span key={chip.en} className="nb-site-spotlight__chip">
                  {pick(chip)}
                </span>
              ))}
              {activeLens.id === "recipe" ? (
                <code
                  className="nb-site-spotlight__seed"
                  title={pick(activeLens.promptSeed)}
                >
                  {pick(activeLens.promptSeed)}
                </code>
              ) : null}
            </div>

            <Link
              href={activeLens.ctaHref}
              className="nb-site-spotlight__cta"
              data-nb-spotlight-cta={activeLens.id}
            >
              <span>{pick(activeLens.ctaLabel)}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
