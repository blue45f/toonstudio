import { Brush, MapPinned, PersonStanding, Share2, Sparkles, UsersRound, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { EngineeringArchitectureDiagram } from "./EngineeringArchitectureDiagram";
import { DeckAtlasBody } from "./EngineeringDeckAtlasView";
import { EngineeringDiagramView } from "./EngineeringDiagramView";
import { externalLinkForName } from "./engineering-external-links";
import type { DeckSectionPlan, DeckSlide } from "./engineering-deck-model";
import { formatClock } from "./engineering-deck-model";
import { DECK_MODULE_MAX_CHIPS, fitModulesScale, modulesBodyHeight } from "./engineering-deck-atlas-fit";
import { deckDensity, fitTableFontSize, visualWidth } from "./engineering-deck-fit";
import { DECK_SITE_HOST, absoluteDeckUrl, buildQrSvgModel } from "./engineering-deck-qr";
import { ENGINEERING_STATUS_META } from "./engineering-story-content";
import type { TalkModuleIcon } from "./engineering-talk-deck";

import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringDeckSlide", ko, en);

const MODULE_ICONS: Record<TalkModuleIcon, LucideIcon> = {
  canvas: Brush,
  character: PersonStanding,
  space: MapPinned,
  collab: UsersRound,
  ai: Sparkles,
  publish: Share2,
};

const SITE_HOST = DECK_SITE_HOST;

/** 표가 쓸 수 있는 크기(슬라이드 폭의 %). 제목·리드·여백·캡션을 뺀 값이다. */
const TABLE_BOX = { width: 93, height: 30.5 } as const;
const TABLE_CAPTION_HEIGHT = 3;

export interface EngineeringDeckSlideProps {
  readonly slide: DeckSlide;
  readonly index: number;
  readonly total: number;
  readonly sections: readonly DeckSectionPlan[];
  /**
   * 항상 16:9 비율로 축소한다(개요 썸네일·다음 슬라이드 미리보기·인쇄).
   * 기본값은 폭이 좁으면 읽기 쉬운 세로 배치로 전환한다.
   */
  readonly fixed?: boolean;
  /** 썸네일처럼 조작 대상이 아닐 때 링크를 일반 텍스트로 바꾸고 스크린 리더에서 숨긴다. */
  readonly decorative?: boolean;
  readonly className?: string;
}

function SlideStatus({ slide }: { readonly slide: DeckSlide }) {
  if (!slide.status) return null;
  const meta = ENGINEERING_STATUS_META[slide.status];
  return (
    <span className="deck-slide__status" data-status={slide.status}>
      {bi(meta.label.ko, meta.label.en)}
    </span>
  );
}

function SlideLink({
  href,
  decorative,
  className,
  children,
}: {
  readonly href: string;
  readonly decorative: boolean;
  readonly className: string;
  readonly children: ReactNode;
}) {
  if (decorative) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function SlideArt({ art }: { readonly art: NonNullable<DeckSlide["art"]> }) {
  return (
    <figure className="deck-slide__art">
      <img src={art.src} alt={art.alt} loading="lazy" decoding="async" width={640} height={637} />
      <figcaption>{bi("브랜드 콘셉트 아트 · 실제 편집 화면이 아닙니다", "Brand concept art · not a product screen")}</figcaption>
    </figure>
  );
}

function StackChipList({
  items,
  extra,
  decorative,
  className,
  linkClassName,
}: {
  readonly items: readonly string[];
  /** 보여 주지 않은 칩의 수("+3"). */
  readonly extra?: string;
  readonly decorative: boolean;
  readonly className: string;
  readonly linkClassName: string;
}) {
  return (
    <ul className={className} aria-label={bi("사용 기술", "Technologies")}>
      {items.map((item) => {
        const url = decorative ? undefined : externalLinkForName(item);
        return (
          <li key={item}>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
                {item}
              </a>
            ) : item}
          </li>
        );
      })}
      {extra ? <li aria-label={formatI18nTemplate(String(bi("기술 {value0}개 더", "{value0} more technologies")), { value0: extra.replace("+", "") })}>{extra}</li> : null}
    </ul>
  );
}

/** `table` 레이아웃: 열 제목 + 행. 첫 열은 행 제목이다. 좁은 화면에서는 행마다 카드로 쌓는다. */
function DeckTableBody({ slide }: { readonly slide: DeckSlide }) {
  const table = slide.table;
  if (!table || table.columns.length === 0) {
    return (
      <div className="deck-slide__stack">
        <h2 className="deck-slide__title">{slide.title}</h2>
        <p className="deck-slide__lead">{slide.lead}</p>
      </div>
    );
  }
  const size = fitTableFontSize(table, { width: TABLE_BOX.width, height: TABLE_BOX.height - (table.caption ? TABLE_CAPTION_HEIGHT : 0) });
  return (
    <div className="deck-slide__table-layout">
      <h2 className="deck-slide__title deck-slide__title--compact">{slide.title}</h2>
      {slide.lead ? <p className="deck-slide__lead deck-slide__lead--small">{slide.lead}</p> : null}
      <div className="deck-slide__table-wrap" style={{ "--deck-table-size": size } as CSSProperties}>
        <table className="deck-slide__table" aria-label={table.caption ? undefined : slide.title}>
          {table.caption ? <caption>{table.caption}</caption> : null}
          <thead>
            <tr>
              {table.columns.map((column, columnIndex) => <th key={`${columnIndex}-${column}`} scope="col">{column}</th>)}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row[0] ?? ""}`}>
                {row.map((cell, cellIndex) => (cellIndex === 0
                  ? <th key={cellIndex} scope="row" data-label={table.columns[0]}>{cell}</th>
                  : <td key={cellIndex} data-label={table.columns[cellIndex]}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 링크 QR. 벡터 경로라 화면·인쇄·오프라인에서 같게 보이고, 만들지 못하면 링크 텍스트만 보여준다. */
function DeckQrCode({ qr }: { readonly qr: NonNullable<DeckSlide["qr"]> }) {
  const url = absoluteDeckUrl(qr.href);
  const model = url ? buildQrSvgModel(url) : null;
  const shown = url ? url.replace(/^https:\/\//u, "") : qr.href;
  return (
    <figure className="deck-slide__qr" data-state={model ? "ready" : "text"}>
      {model ? (
        <svg
          className="deck-slide__qr-code"
          viewBox={`0 0 ${model.size} ${model.size}`}
          role="img"
          aria-label={formatI18nTemplate(String(bi("{value0} 링크 QR 코드", "QR code for {value0}")), { value0: qr.label })}
          shapeRendering="crispEdges"
          focusable="false"
        >
          <rect width={model.size} height={model.size} className="deck-slide__qr-paper" />
          <path d={model.path} className="deck-slide__qr-ink" />
        </svg>
      ) : null}
      <figcaption>
        <strong>{qr.label}</strong>
        <code>{shown}</code>
        {model ? null : <span>{bi("QR 코드를 만들지 못해 링크만 보여 드립니다.", "The QR code could not be created, so only the link is shown.")}</span>}
      </figcaption>
    </figure>
  );
}

/** 새 레이아웃을 추가하고 `SlideBody`에 case 를 넣지 않았을 때 빈 슬라이드가 되지 않게 하는 마지막 안전망. */
function UnhandledLayoutBody({ slide }: { readonly slide: DeckSlide }) {
  return (
    <div className="deck-slide__stack" data-unhandled-layout={slide.layout}>
      <h2 className="deck-slide__title">{slide.title}</h2>
      <p className="deck-slide__lead">{slide.lead}</p>
      {slide.points.length > 0 ? (
        <ol className="deck-slide__points deck-slide__points--row">
          {slide.points.map((point, pointIndex) => (
            <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function SlideBody({
  slide,
  sections,
  decorative,
  fixed,
}: {
  readonly slide: DeckSlide;
  readonly sections: readonly DeckSectionPlan[];
  readonly decorative: boolean;
  readonly fixed: boolean;
}) {
  switch (slide.layout) {
    case "cover":
      return (
        <div className={cx("deck-slide__cover", slide.art && "deck-slide__with-art")}>
          <div className="deck-slide__cover-copy">
            <h2 className="deck-slide__title deck-slide__title--hero">{slide.title}</h2>
            <p className="deck-slide__lead">{slide.lead}</p>
            {slide.points.length ? (
              <ul className="deck-slide__chips" aria-label={bi("발표 약속", "Talk promises")}>
                {slide.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            ) : null}
          </div>
          {slide.art ? <SlideArt art={slide.art} /> : null}
        </div>
      );
    case "agenda": {
      const total = sections.reduce((sum, section) => sum + section.seconds, 0) || 1;
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          <ol className="deck-slide__agenda">
            {sections.map((section) => (
              <li key={section.id} style={{ "--deck-share": `${(section.seconds / total) * 100}%` } as CSSProperties}>
                <span className="deck-slide__agenda-order">{String(section.order).padStart(2, "0")}</span>
                <span className="deck-slide__agenda-title">{section.title}</span>
                <span className="deck-slide__agenda-time">{formatClock(section.seconds)}</span>
                <span className="deck-slide__agenda-bar" aria-hidden="true" />
              </li>
            ))}
          </ol>
        </div>
      );
    }
    case "modules": {
      // 기술 칩이 많아 타일이 높아지면 글자·여백을 함께 줄이고, 칩은 최대 5개만 보여 준다(전체는 오프라인 발표본에 있다).
      const tiles = slide.modules ?? [];
      const fit = fitModulesScale(
        tiles.map((module) => ({ title: module.title, body: module.body, stack: module.stack ?? [], hasHref: Boolean(module.href) })),
        modulesBodyHeight(slide.title, slide.lead, slide.stack),
      );
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          <ul className="deck-slide__modules" style={fit < 1 ? ({ "--deck-fit": fit } as CSSProperties) : undefined}>
            {tiles.map((module) => {
              const Icon = MODULE_ICONS[module.icon];
              const chips = module.stack ?? [];
              const shown = chips.slice(0, DECK_MODULE_MAX_CHIPS);
              const hidden = chips.length - shown.length;
              return (
                <li key={module.id}>
                  <span className="deck-slide__module-icon" aria-hidden="true"><Icon /></span>
                  <span className="deck-slide__module-copy">
                    <strong>{module.title}</strong>
                    <span>{module.body}</span>
                    {shown.length > 0 ? (
                      <StackChipList
                        items={shown}
                        extra={hidden > 0 ? `+${hidden}` : undefined}
                        decorative={decorative}
                        className="deck-slide__module-stack"
                        linkClassName="deck-slide__stack-link"
                      />
                    ) : null}
                    {module.href ? <code>{module.href}</code> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    case "demo":
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          <ol className="deck-slide__demo">
            {(slide.demoSteps ?? []).map((step, stepIndex) => (
              <li key={`${step.href}-${step.action}`}>
                <span className="deck-slide__demo-step" aria-hidden="true">{stepIndex + 1}</span>
                <strong>{step.action}</strong>
                <span>{step.expected}</span>
                <SlideLink href={step.href} decorative={decorative} className="deck-slide__demo-link">
                  {step.href}
                </SlideLink>
              </li>
            ))}
          </ol>
        </div>
      );
    case "diagram":
      return (
        <div className="deck-slide__diagram-layout">
          <h2 className="deck-slide__title deck-slide__title--compact">{slide.title}</h2>
          {slide.diagram ? (
            <div className="deck-slide__diagram deck-slide__diagram--spec">
              <EngineeringDiagramView diagram={slide.diagram} fixed={fixed} fit="contain" showCaption={false} />
            </div>
          ) : (
            <EngineeringArchitectureDiagram className="deck-slide__diagram" fixed={fixed} />
          )}
          <p className="deck-slide__caption">{slide.lead}</p>
        </div>
      );
    case "metrics":
      return (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          {slide.facts?.length ? (
            <dl className="deck-slide__metrics">
              {slide.facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <ol className="deck-slide__points deck-slide__points--row">
            {slide.points.map((point, pointIndex) => (
              <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>
            ))}
          </ol>
        </div>
      );
    case "lessons":
    case "statement": {
      const content = (
        <div className="deck-slide__stack">
          <h2 className="deck-slide__title">{slide.title}</h2>
          <p className="deck-slide__lead">{slide.lead}</p>
          {slide.statusChips?.length ? (
            <ul className="deck-slide__status-strip" aria-label={bi("현재 상태", "Current status")}>
              {slide.statusChips.map((chip) => {
                const meta = ENGINEERING_STATUS_META[chip.status];
                return (
                  <li key={chip.id}>
                    <span>{chip.title}</span>
                    <span className="deck-slide__status" data-status={chip.status}>{bi(meta.label.ko, meta.label.en)}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <ol
            className={cx(
              "deck-slide__points",
              slide.art ? "deck-slide__points--column" : slide.points.length === 4 ? "deck-slide__points--grid" : "deck-slide__points--row",
            )}
          >
            {slide.points.map((point, pointIndex) => (
              <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>
            ))}
          </ol>
          {slide.facts?.length ? (
            <dl className="deck-slide__facts deck-slide__facts--inline">
              {slide.facts.map((fact) => (
                <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
              ))}
            </dl>
          ) : null}
          {slide.question && slide.layout === "statement" ? (
            <p className="deck-slide__question"><span aria-hidden="true">Q</span>{slide.question}</p>
          ) : null}
        </div>
      );
      return slide.art ? (
        <div className="deck-slide__with-art">
          {content}
          <SlideArt art={slide.art} />
        </div>
      ) : content;
    }
    case "qa":
      return (
        <div className="deck-slide__qa" data-qr={slide.qr ? "true" : undefined}>
          <div>
            <h2 className="deck-slide__title deck-slide__title--hero">{slide.title}</h2>
            <p className="deck-slide__lead">{slide.lead}</p>
          </div>
          <ul className="deck-slide__qa-links">
            {(slide.links ?? []).map((link) => (
              <li key={link.href}>
                <SlideLink href={link.href} decorative={decorative} className="deck-slide__qa-link">
                  <strong>{link.label}</strong>
                  <code>{SITE_HOST}{link.href}</code>
                </SlideLink>
              </li>
            ))}
          </ul>
          {slide.qr ? <DeckQrCode qr={slide.qr} /> : null}
        </div>
      );
    case "atlas":
      return <DeckAtlasBody slide={slide} decorative={decorative} fixed={fixed} />;
    case "table":
      return <DeckTableBody slide={slide} />;
    case "tech":
    case "chapter":
      return (
        <div className="deck-slide__tech">
          <div className="deck-slide__tech-head">
            <div>
              <h2 className="deck-slide__title">{slide.title}</h2>
              <p className="deck-slide__lead">{slide.lead}</p>
            </div>
            {slide.facts?.length ? (
              <dl className="deck-slide__facts">
                {slide.facts.map((fact) => (
                  <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                ))}
              </dl>
            ) : null}
          </div>
          {slide.flow?.length ? (
            <ol className="deck-slide__flow" aria-label={bi("동작 흐름", "Execution flow")}>
              {slide.flow.map((step) => <li key={step}>{step}</li>)}
            </ol>
          ) : null}
          <ol className="deck-slide__points deck-slide__points--row">
            {slide.points.map((point, pointIndex) => (
              <li key={point}><span aria-hidden="true">{pointIndex + 1}</span>{point}</li>
            ))}
          </ol>
        </div>
      );
    default: {
      // 새 레이아웃을 DeckSlideLayout 에 추가하고 위에 case 를 빼먹으면 여기서 컴파일 오류가 난다.
      const unhandled: never = slide.layout;
      void unhandled;
      return <UnhandledLayoutBody slide={slide} />;
    }
  }
}

/** 16:9 발표 슬라이드. 크기는 컨테이너 폭 기준(cqw)으로 비례 확대·축소한다. */
export function EngineeringDeckSlide({
  slide,
  index,
  total,
  sections,
  fixed = false,
  decorative = false,
  className,
}: EngineeringDeckSlideProps) {
  useBilingualI18nRevision();
  const section = sections.find((item) => item.id === slide.sectionId);
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0;
  // 문단이 긴 슬라이드는 글자를 한 단계 줄여 16:9 프레임 안에 담는다(원문은 줄이지 않는다).
  const density = deckDensity(slide.points.map(visualWidth));

  return (
    <div
      className={cx("deck-frame", className)}
      data-fixed={fixed ? "true" : undefined}
      aria-hidden={decorative || undefined}
      // 썸네일·미리보기·인쇄본 안의 링크·스크롤 영역에 키보드 초점이 들어가지 않게 한다.
      inert={decorative || undefined}
    >
      <article
        className={cx("deck-slide", `deck-slide--${slide.layout}`)}
        data-deck-slide="true"
        data-density={density === "normal" ? undefined : density}
        data-slide-id={slide.id}
        aria-roledescription={decorative ? undefined : bi("슬라이드", "slide")}
        aria-label={decorative ? undefined : `${index + 1} / ${total} · ${slide.title}`}
      >
        <header className="deck-slide__top">
          <p className="deck-slide__eyebrow" title={slide.eyebrow}>{slide.eyebrow}</p>
          <div className="deck-slide__meta">
            <SlideStatus slide={slide} />
            <span className="deck-slide__brand">ToonStudio</span>
            <span className="deck-slide__count">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
        </header>
        <div className="deck-slide__body">
          <SlideBody slide={slide} sections={sections} decorative={decorative} fixed={fixed} />
        </div>
        <footer className="deck-slide__foot">
          {slide.stack?.length ? (
            <StackChipList items={slide.stack} decorative={decorative} className="deck-slide__stack-chips" linkClassName="deck-slide__stack-link" />
          ) : (
            <span className="deck-slide__section-name">{section?.title ?? ""}</span>
          )}
          <span className="deck-slide__host">{SITE_HOST}</span>
        </footer>
        <div className="deck-slide__progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </article>
    </div>
  );
}
