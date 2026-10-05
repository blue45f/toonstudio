/**
 * 스토리월드 랩 공용 표시 부품 — 패널·빈 상태·축 카드.
 *
 * 페이지(StudioStoryworldLabPage)와 모순·위험 탭(StudioStoryworldIssues)이 함께 쓴다.
 * 계산은 하지 않고 분석 결과를 표시만 한다.
 */
import { BadgeCheck } from "lucide-react";
import type { ReactNode } from "react";

import type { StoryworldAnalysisResult } from "./studio-storyworld-causality";
import { AXIS_LABELS, scoreTone } from "./studio-storyworld-lab-display";

export function Panel({ title, description, children, action }: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <section className="storyworld-panel">
      <div className="storyworld-panel__heading">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="storyworld-panel__action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { readonly children: ReactNode }) {
  return (
    <div className="storyworld-empty">
      <BadgeCheck aria-hidden size={28} />
      <p>{children}</p>
    </div>
  );
}

export function AxisCards({ result }: { readonly result: StoryworldAnalysisResult }) {
  return (
    <div className="storyworld-axis-grid">
      {result.axisScores.map((axis) => (
        <article className={`storyworld-axis-card storyworld-tone--${scoreTone(axis.score)}`} key={axis.axis}>
          <div className="storyworld-axis-card__topline">
            <span>{AXIS_LABELS[axis.axis]}</span>
            <strong>{axis.score}</strong>
          </div>
          <div
            aria-label={`${AXIS_LABELS[axis.axis]} 점수 ${axis.score}점`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={axis.score}
            className="storyworld-meter"
            role="meter"
          >
            <span style={{ width: `${axis.score}%` }} />
          </div>
          <p>오류 {axis.errorCount} · 경고 {axis.warningCount} · 확인 {axis.infoCount}</p>
        </article>
      ))}
    </div>
  );
}
