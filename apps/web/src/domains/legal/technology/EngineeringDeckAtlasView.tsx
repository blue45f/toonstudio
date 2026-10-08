import type { CSSProperties } from "react";

import { EngineeringCodeBlock } from "./EngineeringCodeBlock";
import { EngineeringDiagramView } from "./EngineeringDiagramView";
import type { DeckAtlas } from "./engineering-deck-atlas";
import {
  atlasBlockHeight,
  fitExplainScale,
  footerExtraHeight,
  fitKeyPointsSize,
  planSideColumn,
  planUsageLayout,
} from "./engineering-deck-atlas-fit";
import type { DeckSlide } from "./engineering-deck-model";
import { fitCodeLayout, shortenDeckPath } from "./engineering-deck-fit";

import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringDeckAtlasView", ko, en);

/** 코드 면에서 코드 줄이 쓸 수 있는 크기(슬라이드 폭의 %). 본문 높이에서 코드 헤더를 뺀 값이다. */
const CODE_BOX = { width: 56.5, height: 39.5 } as const;

function KeyPoints({ points }: { readonly points: readonly string[] }) {
  if (points.length === 0) return null;
  return (
    <aside className="deck-atlas__points" aria-label={bi("핵심 요점", "Key points")}>
      <p className="deck-atlas__label" aria-hidden="true">{bi("핵심 요점", "Key points")}</p>
      <ol>
        {points.map((point, index) => (
          <li key={point}><span aria-hidden="true">{index + 1}</span>{point}</li>
        ))}
      </ol>
    </aside>
  );
}

function DiagramFace({ slide, atlas, fixed }: { readonly slide: DeckSlide; readonly atlas: DeckAtlas; readonly fixed: boolean }) {
  const diagram = atlas.diagram;
  const points = slide.points.length > 0 ? slide.points : atlas.keyPoints;
  const caption = diagram ? bi(diagram.caption.ko, diagram.caption.en) : "";
  // 요점이 많거나 길어도 도식 칸 높이 안에 담기도록 글자 크기를 정한다(제목·리드·캡션이 접히면 칸이 줄어든다).
  const stageHeight = atlasBlockHeight({ title: slide.title, lead: slide.lead, caption, gaps: 3, stack: slide.stack });
  const pointsSize = fitKeyPointsSize(points, { width: 24, height: stageHeight - 0.5 });
  return (
    <div className="deck-atlas deck-atlas--diagram">
      <h2 className="deck-slide__title deck-slide__title--compact">{slide.title}</h2>
      {slide.lead ? <p className="deck-slide__lead deck-atlas__lead">{slide.lead}</p> : null}
      <div className="deck-atlas__stage" data-points={points.length > 0 ? "true" : undefined} style={{ "--deck-points-size": pointsSize } as CSSProperties}>
        <div className="deck-atlas__diagram">
          {diagram ? <EngineeringDiagramView diagram={diagram} fixed={fixed} fit="contain" showCaption={false} /> : null}
        </div>
        <KeyPoints points={points} />
      </div>
      {caption ? <p className="deck-slide__caption deck-atlas__caption">{caption}</p> : null}
    </div>
  );
}

function CodeFace({ slide, atlas }: { readonly slide: DeckSlide; readonly atlas: DeckAtlas }) {
  const code = atlas.code;
  if (!code) return null;
  // 꼬리의 기술 칩이 두 줄로 접히면 코드 영역도 그만큼 줄어든다.
  const layout = fitCodeLayout(code.code, { width: CODE_BOX.width, height: CODE_BOX.height - footerExtraHeight(slide.stack) });
  const showLead = slide.lead && slide.lead !== code.explain;
  const explainScale = fitExplainScale({
    title: slide.title,
    explain: [showLead ? slide.lead : "", code.explain].filter(Boolean).join(" "),
    extra: slide.points,
    source: code.source,
    stack: slide.stack,
  });
  return (
    <div className="deck-atlas deck-atlas--code">
      <div className="deck-atlas__code-grid" style={{ "--deck-explain-fit": explainScale } as CSSProperties}>
        <div className="deck-atlas__code" style={{ "--deck-code-size": layout.size, "--deck-code-lh": layout.lineHeight } as CSSProperties}>
          <EngineeringCodeBlock code={code.code} language={code.language} variant="slide" />
        </div>
        <div className="deck-atlas__explain-col">
          <p className="deck-atlas__label">
            {code.count > 1
              ? formatI18nTemplate(String(bi("코드 {value0}/{value1}", "Code {value0}/{value1}")), { value0: code.index + 1, value1: code.count })
              : bi("코드", "Code")}
          </p>
          <h2 className="deck-slide__title deck-slide__title--compact">{slide.title}</h2>
          {showLead ? <p className="deck-atlas__explain-lead">{slide.lead}</p> : null}
          <div className="deck-atlas__explain">
            <p className="deck-atlas__label">{bi("읽는 법", "How to read")}</p>
            <p className="deck-atlas__explain-text">{code.explain}</p>
            {slide.points.length > 0 ? (
              <ul className="deck-atlas__explain-points">
                {slide.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            ) : null}
          </div>
          {code.source ? (
            <div className="deck-atlas__source">
              <p className="deck-atlas__label">{bi("단순화 전 원본", "Simplified from")}</p>
              <code title={code.source}>{code.source}</code>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UsageFace({ slide, atlas, decorative }: { readonly slide: DeckSlide; readonly atlas: DeckAtlas; readonly decorative: boolean }) {
  const usage = atlas.usage ?? [];
  const allFacts = atlas.facts ?? [];
  const allLinks = atlas.links ?? [];
  const hasSide = allFacts.length > 0 || allLinks.length > 0;
  // 사용처가 많거나 경로가 길어도 본문 높이 안에 담도록 글자 배율과 보여 줄 경로 수를 정한다. 전체 경로는 title·발표자 패널·오프라인 발표본에 있다.
  const height = atlasBlockHeight({ title: slide.title, lead: slide.lead, gaps: 2, stack: slide.stack });
  const plan = planUsageLayout(
    usage.map((item) => ({ feature: item.feature, role: item.role, paths: item.paths.map((path) => shortenDeckPath(path)), hasRoute: Boolean(item.route) })),
    { hasSide, height: height - 0.5 },
  );
  // 옆 열은 수치 이름·링크 제목이 몇 줄로 접히는지 세어 정한다. 다 안 들어가면 링크 → 수치 순으로 줄이고 도감 카드에서 보게 한다.
  const side = planSideColumn(
    allFacts.map((fact) => ({ label: fact.label, value: fact.value, source: fact.source })),
    allLinks.map((link) => ({ title: link.title, kind: link.kind })),
    height - 0.5,
  );
  const facts = allFacts.slice(0, side.facts);
  const hiddenFacts = allFacts.length - facts.length;
  const links = allLinks.slice(0, side.links);
  const hiddenLinks = allLinks.length - links.length;
  return (
    <div className="deck-atlas deck-atlas--usage">
      <h2 className="deck-slide__title deck-slide__title--compact">{slide.title}</h2>
      {slide.lead ? <p className="deck-slide__lead deck-atlas__lead">{slide.lead}</p> : null}
      <div className="deck-atlas__usage-grid" data-side={hasSide ? "true" : undefined}>
        <ol
          className="deck-atlas__usage"
          data-count={Math.min(usage.length, 4)}
          style={{ "--deck-fit": plan.scale } as CSSProperties}
          aria-label={bi("서비스에서 쓰인 곳", "Where it is used")}
        >
          {usage.map((item) => {
            const shown = item.paths.slice(0, plan.maxPaths);
            const hidden = item.paths.slice(plan.maxPaths);
            return (
              <li key={`${item.feature}-${item.paths.join("|")}`}>
                <strong className="deck-atlas__feature">{item.feature}</strong>
                <span className="deck-atlas__role">{item.role}</span>
                <ul className="deck-atlas__paths" aria-label={bi("근거 파일", "Source files")}>
                  {shown.map((path) => (
                    <li key={path}><code title={path}>{shortenDeckPath(path)}</code></li>
                  ))}
                  {hidden.length > 0 ? (
                    <li>
                      <code className="deck-atlas__more" title={hidden.join("\n")}>
                        {formatI18nTemplate(String(bi("외 {value0}개 파일", "+{value0} more files")), { value0: hidden.length })}
                      </code>
                    </li>
                  ) : null}
                  {item.route ? <li><code className="deck-atlas__route">{item.route}</code></li> : null}
                </ul>
              </li>
            );
          })}
        </ol>
        {hasSide ? (
          <aside className="deck-atlas__side" style={{ "--deck-side-fit": side.scale } as CSSProperties}>
            {facts.length > 0 || hiddenFacts > 0 ? (
              <div className="deck-atlas__facts-block">
                {facts.length > 0 ? (
                  <dl className="deck-atlas__facts">
                    {facts.map((fact) => (
                      <div key={`${fact.label}-${fact.value}`}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                        <dd className="deck-atlas__fact-source"><code title={fact.source}>{shortenDeckPath(fact.source, 40)}</code></dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {hiddenFacts > 0 ? (
                  <p className="deck-atlas__facts-more">
                    {formatI18nTemplate(String(bi("수치 {value0}개는 도감 카드에서 볼 수 있습니다", "Figures not shown: {value0} (see the atlas card)")), { value0: hiddenFacts })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {links.length > 0 || hiddenLinks > 0 ? (
              <div className="deck-atlas__links">
                {links.length > 0 ? (
                  <>
                    <p className="deck-atlas__label">{bi("참고 링크", "References")}</p>
                    <ul>
                      {links.map((link) => (
                        <li key={link.url}>
                          {decorative ? (
                            <span className="deck-atlas__link"><strong>{link.title}</strong><span>{link.kind}</span></span>
                          ) : (
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="deck-atlas__link">
                              <strong>{link.title}</strong>
                              <span>{link.kind}</span>
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {hiddenLinks > 0 ? (
                  <p className="deck-atlas__links-more">
                    {formatI18nTemplate(String(bi("참고 링크 {value0}개는 도감 카드에서 볼 수 있습니다", "References not shown: {value0} (see the atlas card)")), { value0: hiddenLinks })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** 도감 카드의 한 면(도식·코드·사용처)을 슬라이드 본문으로 그린다. 카드가 정본이라 내용을 복제하지 않는다. */
export function DeckAtlasBody({
  slide,
  decorative,
  fixed,
  className,
}: {
  readonly slide: DeckSlide;
  readonly decorative: boolean;
  readonly fixed: boolean;
  readonly className?: string;
}) {
  useBilingualI18nRevision();
  const atlas = slide.atlas;
  if (!atlas) {
    // 도감 데이터가 없는 atlas 레이아웃도 빈 슬라이드가 되지 않게 제목·리드만 보여준다(검증은 테스트가 맡는다).
    return (
      <div className={cx("deck-atlas", className)} data-missing="true">
        <h2 className="deck-slide__title">{slide.title}</h2>
        <p className="deck-slide__lead">{slide.lead}</p>
      </div>
    );
  }
  switch (atlas.view) {
    case "diagram":
      return <DiagramFace slide={slide} atlas={atlas} fixed={fixed} />;
    case "code":
      return <CodeFace slide={slide} atlas={atlas} />;
    case "usage":
      return <UsageFace slide={slide} atlas={atlas} decorative={decorative} />;
  }
}
