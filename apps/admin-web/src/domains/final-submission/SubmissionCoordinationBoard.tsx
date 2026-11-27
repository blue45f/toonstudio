import {
  COORDINATION_STATUSES,
  coordinationMissing,
  coordinationStatus,
  coordinationWarnings,
  createCoordinationItem,
} from "@toonstudio/contracts/final-submission";
import { useState } from "react";

import {
  COORDINATION_OPERATIONS_URL,
  COORDINATION_SUBMISSION_URL,
  coordinationOperationOptions,
  coordinationSourceDetail,
  coordinationSuggestions,
} from "./coordination-sources";
import { SubmissionBadge, SubmissionDialog, SubmissionError, SubmissionLink, submissionDate } from "./final-submission-ui";
import { SubmissionCoordinationEditor } from "./SubmissionCoordinationEditor";
import { SubmissionCoordinationImport } from "./SubmissionCoordinationImport";
import { useCoordinationOperations } from "./use-coordination-operations";
import { useFinalSubmission } from "./use-final-submission";

import type { BoardState, CoordinationItem, Link } from "@toonstudio/contracts/final-submission";

import "./final-submission.css";
import "./submission-coordination.css";

const steps = [
  ["원본 항목 확인", "두 보드에서 확인 시각과 미해결 항목의 식별자를 확인합니다."],
  ["파일 후보 대조", "이미 확보한 이름·버전·SHA-256으로 중복 사본과 다른 후보를 구분합니다."],
  ["인용한 변경만 검증", "제출 화면에 쓰인 버전의 병합 기록, 동일 SHA의 CI와 운영 검증을 연결합니다."],
  ["담당자 최종 확인", "멘토 반영 위치, 첨부 후보와 접수 근거를 대조하고 결정자와 확인 시점을 기록합니다."],
] as const;
const fields = [
  ["file", "파일"],
  ["version", "후보 버전"],
  ["approvedVersion", "승인 기준 버전"],
  ["digest", "파일 SHA-256"],
  ["repo", "저장소"],
  ["branch", "브랜치"],
  ["pr", "PR"],
  ["commit", "변경 커밋"],
  ["merge", "병합 여부"],
  ["ci", "CI 결과"],
  ["ciCommit", "CI 대상 커밋"],
  ["deployment", "배포 여부"],
  ["deployCommit", "배포 커밋"],
  ["smoke", "배포 후 검증"],
  ["migration", "마이그레이션"],
  ["platform", "플랫폼 제출"],
  ["mentor", "멘토 반영"],
  ["owner", "담당자"],
] as const;
type SourceDetail = ReturnType<typeof coordinationSourceDetail>;
type Category = "전체" | "차단 요인" | "미확인 증빙" | "담당자 결정";

function LinkList({ title, links }: { title: string; links: readonly Link[] }) {
  return (
    <div>
      <h4>{title}</h4>
      {links.length ? (
        <ul>
          {links.map((link, i) => (
            <li key={i}>
              {link.url === COORDINATION_OPERATIONS_URL || link.url === COORDINATION_SUBMISSION_URL ? (
                <a href={link.url}>{link.label}</a>
              ) : (
                <SubmissionLink href={link.url}>{link.label || link.url}</SubmissionLink>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="fs-muted">미확인</p>
      )}
    </div>
  );
}

function RecordDetail({
  item,
  source,
  gaps,
  warnings,
  related,
  onRelated,
}: {
  item: CoordinationItem;
  source: SourceDetail;
  gaps: string[];
  warnings: string[];
  related: CoordinationItem[];
  onRelated: (id: string) => void;
}) {
  return (
    <div className="sc-detail">
      {item.sourceNote && <p>{item.sourceNote}</p>}
      {warnings.length > 0 && (
        <div className="sc-alert">
          <strong>비교 경고</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {gaps.length > 0 && (
        <p className="fs-muted">
          <strong>확인할 증빙</strong> · {gaps.join(" · ")}
        </p>
      )}
      <dl className="sc-facts">
        {fields.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{item[key] || "미확인"}</dd>
          </div>
        ))}
        <div>
          <dt>증빙 대조 시점</dt>
          <dd>{submissionDate(item.evidenceAt)}</dd>
        </div>
        <div>
          <dt>최종 확인 시점</dt>
          <dd>{submissionDate(item.checkedAt)}</dd>
        </div>
      </dl>
      <h4>연결한 원본 기록</h4>
      <p className="fs-muted">기록한 진행 단계 · {item.status}</p>
      <p className="fs-muted">
        운영 항목 {item.operationId || "미확인"} · 제출 항목 {item.sourceTaskId || "미확인"}
      </p>
      {source.facts.length > 0 && (
        <dl className="sc-facts">
          {source.facts.map((f, i) => (
            <div key={i}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {Boolean(item.comparisons?.length) && (
        <div>
          <h4>비교한 파일 후보</h4>
          <div className="sc-variants">
            {item.comparisons?.map((file, i) => (
              <article key={i}>
                <strong>{file.label}</strong>
                <p>
                  {file.file} · {file.version || "버전 미확인"}
                </p>
                <code>{file.sha || "해시 미확인"}</code>
                {file.note && <p>{file.note}</p>}
              </article>
            ))}
          </div>
        </div>
      )}
      <div className="sc-links">
        <LinkList title="근거 링크" links={[...item.refs, ...source.links]} />
        <LinkList title="기준 자료" links={item.basisRefs ?? []} />
        <LinkList title="첨부 증빙" links={item.attachments} />
      </div>
      {related.length > 0 && (
        <div>
          <h4>함께 확인할 항목</h4>
          <div className="fs-actions">
            {related.map((r) => (
              <button type="button" className="fs-button" key={r.id} onClick={() => onRelated(r.id)}>
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SubmissionCoordinationBoard({ userIdentity }: { userIdentity: string }) {
  const workspace = useFinalSubmission(userIdentity);
  const { board, accessVerified, loading, denied, error } = workspace;
  const ops = useCoordinationOperations(userIdentity, Boolean(userIdentity && accessVerified && !denied && !loading));
  if (!userIdentity || denied) return <SubmissionError error={error || "개인 기록 접근 권한을 확인하지 못했습니다."} />;
  const hidden = !accessVerified || loading;
  return (
    <>
      {(hidden || !board) && (
        <div className="final-submission" aria-busy={loading}>
          {loading ? (
            <p role="status">관리자 권한과 조정 기록을 확인하고 있습니다.</p>
          ) : (
            <>
              <SubmissionError error={error || "개인 점검 기록을 확인하지 못했습니다."} />
              <button className="fs-button" type="button" onClick={() => void workspace.reload(true)}>
                다시 확인
              </button>
            </>
          )}
        </div>
      )}
      {board && (
        <div hidden={hidden} inert={hidden}>
          <CoordinationWorkspace key={userIdentity} board={board} workspace={workspace} ops={ops} />
        </div>
      )}
    </>
  );
}

function CoordinationWorkspace({
  board,
  workspace,
  ops,
}: {
  board: BoardState;
  workspace: ReturnType<typeof useFinalSubmission>;
  ops: ReturnType<typeof useCoordinationOperations>;
}) {
  const [project, setProject] = useState("");
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("전체");
  const [editing, setEditing] = useState<CoordinationItem | null>(null);
  const [open, setOpen] = useState("");
  const [importing, setImporting] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const saved = board.coordination ?? [];
  const suggestions = coordinationSuggestions(board, ops.records, saved);
  const all = [...saved, ...suggestions];
  const list = all
    .map((item) => {
      const source = coordinationSourceDetail(board, ops.records, item);
      const gaps = [...new Set([...coordinationMissing(item), ...source.gaps])];
      const warnings = [...new Set([...coordinationWarnings(item, all), ...source.warnings])];
      const recorded = coordinationStatus(item, all);
      const verified = recorded === "최종 확인" || recorded === "검증 완료";
      let status = recorded;
      if (source.gaps.length > 0 && (verified || item.operationId)) status = "미확인";
      else if (verified && source.warnings.length > 0) status = "검토 필요";
      const unresolved = status !== "최종 확인";
      const categories: Category[] = ["전체"];
      if (unresolved && (item.blocking || warnings.length > 0)) categories.push("차단 요인");
      if (unresolved && (gaps.length > 0 || status === "미확인" || source.warnings.length > 0)) categories.push("미확인 증빙");
      if (unresolved && (item.action || item.status === "승인 대기")) categories.push("담당자 결정");
      return { item, source, gaps, warnings, status, categories };
    })
    .sort((a, b) => a.item.priority - b.item.priority || a.item.title.localeCompare(b.item.title, "ko"));
  const projects = [...new Set(all.map((item) => item.project).filter(Boolean))].sort();
  const filtered = list.filter(
    ({ item, status, categories }) =>
      categories.includes(category) &&
      (!project || item.project === project) &&
      (!stage || status === stage) &&
      [item.title, item.file, item.repo, item.version, item.commit, item.id, item.sourceTaskId, item.operationId]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase())
  );
  const locked = workspace.loading || workspace.saving || workspace.conflict || workspace.hasPendingSave || !workspace.accessVerified;
  function apply(rows: CoordinationItem[], summary: string) {
    if (locked) return "현재 원장을 다시 확인한 뒤 편집할 수 있습니다.";
    return workspace.commit({ ...board, coordination: rows }, summary);
  }
  function applyImport(incoming: CoordinationItem[]) {
    const known = new Set(saved.map((item) => item.id));
    const additions = incoming
      .filter((item) => !known.has(item.id))
      .map((item) => {
        const sourceTaskId = board.tasks.some((task) => task.id === item.sourceTaskId) ? item.sourceTaskId : "";
        const operationId = ops.records.some((record) => record.id === item.operationId) ? item.operationId : "";
        const missingLinks = [
          item.sourceTaskId && !sourceTaskId ? "제출 원본 " + item.sourceTaskId : "",
          item.operationId && !operationId ? "운영 원본 " + item.operationId : "",
        ].filter(Boolean);
        const sourceNote = [item.sourceNote, missingLinks.length ? "현재 원장 연결 미확인 · " + missingLinks.join(", ") : ""]
          .filter(Boolean)
          .join("\n");
        return { ...item, sourceTaskId, operationId, sourceNote };
      });
    if (!additions.length) return "모든 항목이 이미 연결되어 있습니다.";
    const error = apply([...saved, ...additions], "검토한 조정 기록 가져오기");
    if (!error) setImporting(false);
    return error;
  }
  function selectRelated(id: string) {
    setCategory("전체");
    setProject("");
    setSearch("");
    setStage("");
    setOpen(id);
    requestAnimationFrame(() => document.getElementById("coord-" + id)?.scrollIntoView({ block: "nearest" }));
  }
  return (
    <div className="final-submission sc-board">
      <header className="fs-heading">
        <div>
          <h1>제출 전 증빙 조정</h1>
          <p className="fs-muted">개발 변경과 1R 제출 후보를 연결해 확인이 남은 근거와 결정을 추적합니다.</p>
        </div>
        <nav className="fs-actions" aria-label="원본 보드">
          <a href="/admin/workspace/">관리자 운영 보드</a>
          <a href="/admin/growth/business-plan/?view=final-submission">1R 제출 점검</a>
        </nav>
      </header>
      <div className="fs-savebar">
        <div>
          <strong>{workspace.dirty ? "서버 미저장 변경 있음" : "현재 계정의 조정 기록"}</strong>
          <span>
            저장 버전 {workspace.revision ?? "미확인"} · 마지막 저장 {submissionDate(workspace.updatedAt)}
          </span>
        </div>
        <div className="fs-actions">
          <button
            type="button"
            className="fs-button"
            disabled={workspace.saving}
            onClick={() => (workspace.dirty ? setReloadOpen(true) : void workspace.reload())}
          >
            서버 기록 다시 읽기
          </button>
          <button
            type="button"
            className="fs-button fs-button--primary"
            disabled={workspace.saving || workspace.conflict || (!workspace.dirty && !workspace.hasPendingSave)}
            onClick={() => void workspace.persist()}
          >
            {workspace.hasPendingSave && !workspace.saving ? "같은 저장 요청 다시 확인" : "서버에 저장"}
          </button>
        </div>
      </div>
      <SubmissionError error={workspace.error} />
      {workspace.notice && (
        <p className="fs-status" role="status">
          {workspace.notice}
        </p>
      )}
      {ops.error && (
        <p className="fs-notice">
          운영 원본 미확인 · {ops.error}{" "}
          <button type="button" className="fs-button" onClick={ops.reload}>
            운영 기록 다시 확인
          </button>
        </p>
      )}
      <div className="sc-priorities">
        {(["차단 요인", "미확인 증빙", "담당자 결정"] as const).map((name) => (
          <button
            className="sc-priority"
            type="button"
            key={name}
            aria-pressed={category === name}
            onClick={() => setCategory(category === name ? "전체" : name)}
          >
            <span>{name}</span>
            <strong>
              {list.filter((r) => r.categories.includes(name)).length}
              <small>건</small>
            </strong>
          </button>
        ))}
        <a className="sc-priority" href="#coord-steps">
          <span>저비용 선별 검증</span>
          <strong>
            4<small>단계</small>
          </strong>
        </a>
      </div>
      <section className="fs-panel" aria-label="조정 항목">
        <header className="fs-panel-header">
          <div>
            <h2>{category === "전체" ? "조정 항목" : category}</h2>
            <p>{filtered.length}건 · 우선순위순</p>
          </div>
          <div className="fs-actions">
            <button type="button" className="fs-button" disabled={locked} onClick={() => setImporting(true)}>
              어드민용 JSON 가져오기
            </button>
            <button
              type="button"
              className="fs-button fs-button--primary"
              disabled={locked}
              onClick={() => setEditing(createCoordinationItem(crypto.randomUUID(), ""))}
            >
              조정 항목 추가
            </button>
          </div>
        </header>
        <div className="sc-controls">
          <label>
            프로젝트
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">전체 프로젝트</option>
              {projects.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            증빙 상태
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">전체 상태</option>
              {COORDINATION_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            항목 검색
            <input type="search" value={search} placeholder="제목·파일·커밋" onChange={(e) => setSearch(e.target.value)} />
          </label>
          <button
            className="fs-button"
            type="button"
            onClick={() => {
              setProject("");
              setStage("");
              setSearch("");
              setCategory("전체");
            }}
          >
            전체 보기
          </button>
        </div>
        {!filtered.length && (
          <p className="sc-empty">
            {all.length
              ? "조건에 맞는 조정 항목이 없습니다."
              : "연결한 조정 기록이 없습니다. 보유한 보드의 어드민용 JSON을 가져오거나 확인할 원본 항목을 연결하세요."}
          </p>
        )}
        {filtered.map(({ item, status, gaps, warnings, source }) => (
          <article className="sc-record" key={item.id} id={"coord-" + item.id}>
            <div className="sc-line">
              <div>
                <small>
                  {item.project || "프로젝트 미확인"} · 우선순위 {item.priority}
                </small>
                <h3>
                  <button type="button" aria-expanded={open === item.id} onClick={() => setOpen(open === item.id ? "" : item.id)}>
                    {item.title}
                  </button>
                </h3>
              </div>
              <div className="fs-actions">
                <SubmissionBadge status={status} />
                {item.action && <span className="fs-badge fs-badge--pending">{item.action} 승인 대기</span>}
              </div>
            </div>
            <p>{item.next || "다음 조치 미확인"}</p>
            {open === item.id && (
              <>
                <RecordDetail
                  item={item}
                  warnings={warnings}
                  gaps={gaps}
                  source={source}
                  related={all.filter((r) => item.related?.includes(r.id))}
                  onRelated={selectRelated}
                />
                <button type="button" className="fs-button" disabled={locked} onClick={() => setEditing(structuredClone(item))}>
                  항목·증빙 편집
                </button>
              </>
            )}
          </article>
        ))}
      </section>
      <section id="coord-steps" className="fs-panel sc-steps">
        <h2>저비용 선별 검증 순서</h2>
        <ol>
          {steps.map(([title, note]) => (
            <li key={title}>
              <strong>{title}</strong>
              <p>{note}</p>
            </li>
          ))}
        </ol>
      </section>
      {editing && !workspace.conflict && (
        <SubmissionCoordinationEditor
          item={all.find((row) => row.id === editing.id) ?? editing}
          taskOptions={board.tasks.filter((t) => t.unresolved || t.id === editing.sourceTaskId).map((t) => ({ id: t.id, title: t.title }))}
          relatedOptions={all.filter((i) => i.id !== editing.id).map((i) => ({ id: i.id, title: i.title }))}
          operationOptions={coordinationOperationOptions(ops.records).map((o) => ({ id: o.id, title: o.label }))}
          onSave={(item) => {
            const rows = saved.some((r) => r.id === item.id) ? saved.map((r) => (r.id === item.id ? item : r)) : [...saved, item];
            const error = apply(rows, "증빙 조정 항목 편집");
            if (!error) {
              setEditing(null);
              setOpen(item.id);
            }
            return error;
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && !workspace.conflict && <SubmissionCoordinationImport existing={saved} onApply={applyImport} onClose={() => setImporting(false)} />}
      {reloadOpen && (
        <SubmissionDialog
          title="저장 기록 다시 읽기"
          description="화면에만 반영한 변경을 버리고 현재 계정의 저장본을 읽습니다."
          onClose={() => setReloadOpen(false)}
        >
          <button
            type="button"
            className="fs-button"
            onClick={() => {
              setReloadOpen(false);
              void workspace.reload();
            }}
          >
            저장본 다시 읽기
          </button>
        </SubmissionDialog>
      )}
    </div>
  );
}
