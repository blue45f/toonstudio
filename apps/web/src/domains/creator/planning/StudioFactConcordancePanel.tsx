/**
 * 사실 색인 표면 — 기획(story) 뷰의 "사실 색인" 탭 본문.
 *
 * 원칙:
 * - 색인은 게시된 본문에서 역추출한 도출 결과다. 이 표면은 색인을 만들거나
 *   상태를 바꾸지 않고, 대조 표시·제3 확인자 기록·원고 수정 제안·설정 수정
 *   이력 열람만 한다. 실제 기록은 콜백으로 호스트(컨테이너)가 저장한다.
 * - "정해진 적 없음"과 "정해졌는데 잊음"을 첫 화면에서 갈라 보여주는 것이
 *   핵심이다 — 두 문제는 처방이 다르기 때문이다(등록/정리 vs 재등장/폐기 판단).
 * - 오류 수정 폼은 원고 쪽만 고칠 수 있게 열려 있고, 설정 수정은 이력 목록으로
 *   보여줄 뿐 이 표면에서 설정을 직접 고치는 경로는 두지 않는다.
 */
import { useMemo, useState } from "react";
import { r3c04StatusText } from "../studio-r3c04-status-i18n";

import {
  FACT_CHECK_VERDICT_LABELS,
  FACT_CLASSIFICATION_LABELS,
  FACT_TERM_KIND_LABELS,
  type FactCheckRecord,
  type FactCheckVerdict,
  type FactConcordance,
  type FactConcordanceClassification,
  type FactConcordanceEntry,
  type FactFixRecord,
  type LoreRevisionRecord,
} from "./studio-fact-concordance";

export interface FactEpisodeOption {
  readonly episodeId: string;
  readonly label: string;
}

export interface StudioFactConcordancePanelProps {
  readonly concordance: FactConcordance;
  readonly episodes: readonly FactEpisodeOption[];
  readonly checks: readonly FactCheckRecord[];
  readonly fixes: readonly FactFixRecord[];
  readonly loreRevisions: readonly LoreRevisionRecord[];
  /** 현재 사용자 id — 제3 확인자 기록의 확인자. 작성자 본인이면 모델이 거부한다. */
  readonly currentUserId: string;
  readonly onRecordCheck: (
    entryKey: string,
    verdict: FactCheckVerdict,
    note: string,
  ) => string | null;
  readonly onProposeManuscriptFix: (input: {
    readonly entryKey: string;
    readonly episodeId: string;
    readonly segmentId: string;
    readonly before: string;
    readonly after: string;
    readonly reason: string;
  }) => string | null;
}

type ClassificationFilter = FactConcordanceClassification | "all";

const FILTER_LABEL: Readonly<Record<ClassificationFilter, string>> = {
  all: "전체",
  used: "정해졌고 쓰임",
  unregistered: "정해진 적 없음",
  forgotten: "정해졌는데 잊음",
};

const FIELD_LABEL: Readonly<Record<LoreRevisionRecord["field"], string>> = {
  summary: "한 줄 요약",
  details: "상세 설정",
};

function EntryCard({
  entry,
  episodeLabel,
  checks,
  currentUserId,
  onRecordCheck,
  onProposeManuscriptFix,
}: {
  readonly entry: FactConcordanceEntry;
  readonly episodeLabel: (episodeId: string | null) => string;
  readonly checks: readonly FactCheckRecord[];
  readonly currentUserId: string;
  readonly onRecordCheck: StudioFactConcordancePanelProps["onRecordCheck"];
  readonly onProposeManuscriptFix: StudioFactConcordancePanelProps["onProposeManuscriptFix"];
}) {
  const [verdict, setVerdict] = useState<FactCheckVerdict>("ok");
  const [note, setNote] = useState("");
  const [checkError, setCheckError] = useState<string | null>(null);
  const [fixAfter, setFixAfter] = useState("");
  const [fixReason, setFixReason] = useState("");
  const [fixError, setFixError] = useState<string | null>(null);
  const entryChecks = checks.filter((check) => check.entryKey === entry.key);
  const firstMention = entry.mentions[0] ?? null;
  const label = FACT_CLASSIFICATION_LABELS[entry.classification];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{entry.displayName}</h3>
        {entry.kind ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
            {FACT_TERM_KIND_LABELS[entry.kind].ko}
          </span>
        ) : null}
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {label.ko}
        </span>
        {entry.loreStatus ? (
          <span className="text-[11px] text-slate-500">
            설정 v{entry.loreVersion ?? 1} · 상태 {entry.loreStatus}
          </span>
        ) : null}
      </header>
      <p className="mt-1 text-xs text-slate-500">{label.hintKo}</p>
      {entry.mentions.length > 0 ? (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-slate-600">
            {entry.episodeCount}개 회차 · 언급 {entry.mentions.length}곳 · 처음{" "}
            {episodeLabel(entry.firstEpisodeId)} · 마지막 {episodeLabel(entry.lastEpisodeId)}
          </p>
          <ul className="space-y-1">
            {entry.mentions.slice(0, 3).map((mention) => (
              <li key={mention.id} className="text-xs text-slate-500">
                [{episodeLabel(mention.episodeId)} ·{" "}
                {mention.segmentKind === "dialogue" ? "대사" : "지문"}] {mention.excerpt}
              </li>
            ))}
          </ul>
          {entry.mentions.length > 3 ? (
            <p className="text-[11px] text-slate-400">
              외 {entry.mentions.length - 3}곳의 언급이 더 있어요.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">{r3c04StatusText("studio.r3c04Status.planning.fact.notFoundInPublished", "게시된 회차 본문에서 찾지 못했어요.")}</p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium text-slate-700">
          제3 확인자 체크 {entryChecks.length > 0 ? `(${entryChecks.length}건)` : ""}
        </p>
        <ul className="mt-1 space-y-1">
          {entryChecks.map((check) => (
            <li key={check.id} className="text-xs text-slate-500">
              {FACT_CHECK_VERDICT_LABELS[check.verdict]}
              {check.note ? ` — ${check.note}` : ""} ({check.checkedAt})
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            aria-label="확인 판정"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            value={verdict}
            onChange={(event) => setVerdict(event.target.value as FactCheckVerdict)}
          >
            {(Object.keys(FACT_CHECK_VERDICT_LABELS) as FactCheckVerdict[]).map((key) => (
              <option key={key} value={key}>
                {FACT_CHECK_VERDICT_LABELS[key]}
              </option>
            ))}
          </select>
          <input
            aria-label="확인 메모"
            className="min-w-40 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
            placeholder="확인 메모 (선택)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white"
            onClick={() => {
              const error = onRecordCheck(entry.key, verdict, note);
              setCheckError(error);
              if (!error) setNote("");
            }}
          >
            {currentUserId ? "확인 기록" : "확인자 지정 필요"}
          </button>
        </div>
        {checkError ? <p className="mt-1 text-xs text-red-600">{checkError}</p> : null}
      </div>

      {firstMention ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-medium text-slate-700">
            원고 쪽 수정 제안 — 설정이 아니라 신규 원고를 고치는 것이 원칙이에요.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            대상: {episodeLabel(firstMention.episodeId)} · “{firstMention.surface}”가 실린 조각
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label="고친 원고 내용"
              className="min-w-40 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              placeholder="고친 뒤의 문장"
              value={fixAfter}
              onChange={(event) => setFixAfter(event.target.value)}
            />
            <input
              aria-label="수정 이유"
              className="min-w-32 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
              placeholder="고치는 이유"
              value={fixReason}
              onChange={(event) => setFixReason(event.target.value)}
            />
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
              onClick={() => {
                const error = onProposeManuscriptFix({
                  entryKey: entry.key,
                  episodeId: firstMention.episodeId,
                  segmentId: firstMention.segmentId,
                  before: firstMention.excerpt,
                  after: fixAfter,
                  reason: fixReason,
                });
                setFixError(error);
                if (!error) {
                  setFixAfter("");
                  setFixReason("");
                }
              }}
            >
              원고 수정 기록
            </button>
          </div>
          {fixError ? <p className="mt-1 text-xs text-red-600">{fixError}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

export function StudioFactConcordancePanel(props: StudioFactConcordancePanelProps) {
  const { concordance } = props;
  const [filter, setFilter] = useState<ClassificationFilter>("all");
  const [query, setQuery] = useState("");
  const episodeLabel = useMemo(() => {
    const byId = new Map(props.episodes.map((episode) => [episode.episodeId, episode.label]));
    return (episodeId: string | null) => (episodeId ? (byId.get(episodeId) ?? episodeId) : "-");
  }, [props.episodes]);
  const visible = useMemo(
    () =>
      concordance.entries.filter((entry) => {
        if (filter !== "all" && entry.classification !== filter) return false;
        const needle = query.trim().toLocaleLowerCase();
        return !needle || entry.displayName.toLocaleLowerCase().includes(needle);
      }),
    [concordance.entries, filter, query],
  );
  const { digest } = concordance;

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">사실 색인</h2>
        <p className="mt-1 text-sm text-slate-600">
          게시된 회차 본문·대사에서 인물·장소·사건·설정을 역추출해 설정집과 대조한
          색인이에요. 본문에 나왔는데 정해진 적 없는 것과, 정해졌는데 잊힌 것을
          갈라서 보여줘요.
        </p>
        <p className="mt-2 text-sm text-slate-700">
          색인 {digest.totalEntries}건 · 언급 {digest.mentionCount}곳 ·{" "}
          <strong>정해진 적 없음 {digest.unregisteredCount}건</strong> ·{" "}
          <strong>정해졌는데 잊음 {digest.forgottenCount}건</strong>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(Object.keys(FILTER_LABEL) as ClassificationFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              className={
                filter === key
                  ? "rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600"
              }
              onClick={() => setFilter(key)}
            >
              {FILTER_LABEL[key]}
            </button>
          ))}
          <input
            aria-label="색인 검색"
            className="min-w-40 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs"
            placeholder="이름으로 찾기"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{r3c04StatusText("studio.r3c04Status.planning.fact.emptyIndexFiltered", "이 조건에 맞는 색인 항목이 없어요.")}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((entry) => (
            <EntryCard
              key={entry.key}
              entry={entry}
              episodeLabel={episodeLabel}
              checks={props.checks}
              currentUserId={props.currentUserId}
              onRecordCheck={props.onRecordCheck}
              onProposeManuscriptFix={props.onProposeManuscriptFix}
            />
          ))}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">설정 수정 이력</h3>
        <p className="mt-1 text-xs text-slate-500">
          설정은 조용히 바뀌지 않아요. 바뀐 항목·필드·전후 값·버전이 여기에 남아요.
        </p>
        {props.loreRevisions.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">{r3c04StatusText("studio.r3c04Status.planning.fact.emptyRevisions", "아직 설정 수정 이력이 없어요.")}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {props.loreRevisions.map((revision) => (
              <li key={revision.id} className="text-xs text-slate-600">
                <strong>{revision.entryName}</strong> · {FIELD_LABEL[revision.field]} · v
                {revision.beforeVersion} → v{revision.afterVersion} · {revision.at}
                <br />
                전: {revision.before || r3c04StatusText("studio.r3c04Status.planning.fact.emptyValue", "(비어 있음)")} → 후: {revision.after}
                {revision.reason ? <br /> : null}
                {revision.reason ? `이유: ${revision.reason}` : null}
              </li>
            ))}
          </ul>
        )}
        {props.fixes.length > 0 ? (
          <>
            <h4 className="mt-4 text-sm font-semibold text-slate-900">원고 수정 기록</h4>
            <ul className="mt-2 space-y-1">
              {props.fixes.map((fix) => (
                <li key={fix.id} className="text-xs text-slate-600">
                  [{episodeLabel(fix.episodeId)}] {fix.before} → {fix.after}
                  {fix.reason ? ` — ${fix.reason}` : ""} ({fix.at})
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </section>
  );
}
