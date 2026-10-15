/**
 * 왼쪽 패널: 점검 범위, 점검 가능 범위(커버리지), 점수와 계산식, 점검한 출처, 다시 점검.
 *
 * 점수 옆에는 항상 점검 가능 범위와 신뢰 안내를 함께 둔다. 입력이 적을 때의 높은 점수를 완성도로
 * 읽지 않게 하려는 것이다.
 */
import { RefreshCcw } from "lucide-react";

import type { StoryworldProject } from "../studio-storyworld-causality";
import { formatCheckedAt } from "./studio-story-plausibility-display";
import { availableEpisodeNumbers, type PlausibilityScope } from "./studio-story-plausibility-scope";
import {
  PLAUSIBILITY_CATEGORY_IDS,
  PLAUSIBILITY_TRUST_HINTS,
  PLAUSIBILITY_TRUST_LABELS,
  plausibilityCategoryLabel,
  type PlausibilityReport,
  type PlausibilitySummary,
} from "./studio-story-plausibility-types";

export interface ScopePanelProps {
  readonly project: StoryworldProject;
  readonly scope: PlausibilityScope;
  readonly onScopeChange: (scope: PlausibilityScope) => void;
  readonly report: PlausibilityReport;
  /** 처리 기록을 겹친 요약(건수·점수). */
  readonly summary: PlausibilitySummary;
  readonly notices: readonly string[];
  readonly refreshing: boolean;
  readonly onRerun: () => void;
  readonly onOpenQuestionnaire: () => void;
}

const SOURCE_STATUS_LABELS = { used: "사용함", empty: "비어 있음", unavailable: "연결 안 됨" } as const;

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function meterTone(percent: number): string {
  return percent < 40 ? "plausibility-meter--low" : percent >= 70 ? "plausibility-meter--high" : "";
}

export function StudioStoryPlausibilityScopePanel(props: ScopePanelProps) {
  const { project, scope, report, summary } = props;
  const episodes = availableEpisodeNumbers(project);
  const activeScenes = project.scenes
    .filter((scene) => scene.disabled !== true)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const coverage = summary.coverage;
  const penaltyTotal = summary.score.terms.reduce((sum, term) => sum + term.penalty, 0);

  return (
    <aside aria-label="점검 범위와 점검 가능 범위" className="plausibility-scope">
      <section aria-labelledby="pl-scope-title" className="plausibility-card">
        <h2 id="pl-scope-title">점검 범위</h2>
        <fieldset>
          <legend className="sr-only">어디까지 점검할까요?</legend>
          <label>
            <input
              checked={scope.kind === "all"}
              name="plausibility-scope"
              onChange={() => props.onScopeChange({ kind: "all" })}
              type="radio"
            />
            전체 장면 ({activeScenes.length}개)
          </label>
          <label>
            <input
              checked={scope.kind === "episodes"}
              disabled={episodes.length === 0}
              name="plausibility-scope"
              onChange={() => props.onScopeChange({ kind: "episodes", episodeNumbers: [] })}
              type="radio"
            />
            회차 고르기
          </label>
          {episodes.length === 0 ? (
            <p className="plausibility-hint">회차 번호가 있는 장면이 없어요. 원고에서 가져오면 회차가 채워져요.</p>
          ) : null}
          {scope.kind === "episodes" ? (
            <div aria-label="점검할 회차" className="plausibility-scope__list" role="group">
              {episodes.map((number) => (
                <label key={number}>
                  <input
                    checked={scope.episodeNumbers.includes(number)}
                    onChange={() => props.onScopeChange({ kind: "episodes", episodeNumbers: toggle(scope.episodeNumbers, number) })}
                    type="checkbox"
                  />
                  {number}화
                </label>
              ))}
            </div>
          ) : null}
          <label>
            <input
              checked={scope.kind === "scenes"}
              disabled={activeScenes.length === 0}
              name="plausibility-scope"
              onChange={() => props.onScopeChange({ kind: "scenes", sceneIds: [] })}
              type="radio"
            />
            장면 고르기
          </label>
          {scope.kind === "scenes" ? (
            <>
              <div className="plausibility-scope__tools">
                <button className="storyworld-text-button" onClick={() => props.onScopeChange({ kind: "scenes", sceneIds: activeScenes.map((scene) => scene.id) })} type="button">모두 고르기</button>
                <button className="storyworld-text-button" onClick={() => props.onScopeChange({ kind: "scenes", sceneIds: [] })} type="button">모두 빼기</button>
              </div>
              <div aria-label="점검할 장면" className="plausibility-scope__list" role="group">
                {activeScenes.map((scene) => (
                  <label key={scene.id}>
                    <input
                      checked={scope.sceneIds.includes(scene.id)}
                      onChange={() => props.onScopeChange({ kind: "scenes", sceneIds: toggle(scope.sceneIds, scene.id) })}
                      type="checkbox"
                    />
                    {scene.order}. {scene.title}
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </fieldset>
        {(scope.kind === "episodes" && scope.episodeNumbers.length === 0) || (scope.kind === "scenes" && scope.sceneIds.length === 0) ? (
          <p className="plausibility-hint" role="status">아직 아무것도 고르지 않아서 전체 장면을 점검하고 있어요.</p>
        ) : null}
        <button className="storyworld-button storyworld-button--primary" disabled={props.refreshing} onClick={props.onRerun} type="button">
          <RefreshCcw aria-hidden size={15} /> {props.refreshing ? "점검하는 중…" : "다시 점검"}
        </button>
        <p className="plausibility-hint">마지막 점검: {formatCheckedAt(report.generatedAtIso)}</p>
      </section>

      <section aria-labelledby="pl-coverage-title" className="plausibility-card">
        <h2 id="pl-coverage-title">점검 가능 범위</h2>
        <div className="plausibility-bignum">
          <strong>{coverage.percent}%</strong>
          <span>장면 {coverage.sceneCount}개 × 9칸 중 {coverage.coveredCells}/{coverage.totalCells}칸</span>
        </div>
        <div
          aria-label={`점검 가능 범위 ${coverage.percent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={coverage.percent}
          className={`plausibility-meter ${meterTone(coverage.percent)}`}
          role="meter"
        >
          <span style={{ width: `${coverage.percent}%` }} />
        </div>
        <p className="plausibility-hint">입력하지 않은 칸은 ‘문제 없음’이 아니라 ‘점검 불가’예요.</p>
        <details className="plausibility-details">
          <summary>칸별로 보기</summary>
          <table className="plausibility-table">
            <caption>점검한 장면 수</caption>
            <thead>
              <tr><th scope="col">칸</th><th scope="col">점검함</th><th scope="col">전체</th></tr>
            </thead>
            <tbody>
              {coverage.items.map((item) => (
                <tr key={item.id}><th scope="row">{item.label}</th><td>{item.covered}</td><td>{item.total}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
        <button className="storyworld-button" onClick={props.onOpenQuestionnaire} type="button">질문지로 칸 채우기</button>
      </section>

      <section aria-labelledby="pl-score-title" className="plausibility-card">
        <h2 id="pl-score-title">개연성 점수</h2>
        <div className="plausibility-bignum">
          <strong>{summary.score.value}</strong>
          <span>/ 100 · 점수 신뢰 {PLAUSIBILITY_TRUST_LABELS[summary.trust]}</span>
        </div>
        <p className="plausibility-hint">{PLAUSIBILITY_TRUST_HINTS[summary.trust]}</p>
        <p className="plausibility-hint">오류 {summary.counts.error} · 경고 {summary.counts.warning} · 제안 {summary.counts.suggestion}</p>
        <details className="plausibility-details">
          <summary>점수 계산식 보기</summary>
          <p className="plausibility-hint">{summary.score.formula}</p>
          <table className="plausibility-table">
            <caption>범주별 감점 (감점 합계 {penaltyTotal}점)</caption>
            <thead>
              <tr><th scope="col">범주</th><th scope="col">오류</th><th scope="col">경고</th><th scope="col">제안</th><th scope="col">감점</th></tr>
            </thead>
            <tbody>
              {PLAUSIBILITY_CATEGORY_IDS.map((category) => {
                const term = summary.score.terms.find((item) => item.category === category);
                if (!term) return null;
                return (
                  <tr key={category}>
                    <th scope="row">{plausibilityCategoryLabel(category)}</th>
                    <td>{term.errors}</td>
                    <td>{term.certainWarnings + term.heuristicWarnings}</td>
                    <td>{term.suggestions}</td>
                    <td>{term.penalty}{term.rawPenalty > term.penalty ? ` (상한)` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      </section>

      <section aria-labelledby="pl-sources-title" className="plausibility-card">
        <h2 id="pl-sources-title">점검한 출처</h2>
        <details className="plausibility-details">
          <summary>{report.sources.filter((source) => source.status === "used").length}곳을 사용했어요</summary>
          <ul className="plausibility-sources">
            {report.sources.map((source) => (
              <li key={source.id}>
                <strong>{source.label} · {SOURCE_STATUS_LABELS[source.status]}</strong>
                <span className="plausibility-hint">{source.detail}</span>
              </li>
            ))}
          </ul>
        </details>
        <details className="plausibility-details">
          <summary>이 점검의 한계</summary>
          <ul className="plausibility-sources">
            {report.limits.map((limit) => <li className="plausibility-hint" key={limit}>{limit}</li>)}
          </ul>
        </details>
        {props.notices.length > 0 ? (
          <ul aria-label="점검하면서 알게 된 점" className="plausibility-sources" role="status">
            {props.notices.map((notice) => <li className="plausibility-hint" key={notice}>{notice}</li>)}
          </ul>
        ) : null}
      </section>
    </aside>
  );
}
