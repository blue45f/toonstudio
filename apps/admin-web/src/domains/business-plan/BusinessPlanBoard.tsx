import { getChecks, stats, todayKst } from "@toonstudio/contracts/business-plan";
import { useEffect, useState } from "react";

import { BusinessPlanPermissions } from "./business-plan-permissions";
import { BusinessPlanBadge, BusinessPlanDialog, BusinessPlanError, BusinessPlanPanel, businessPlanDate, downloadBusinessPlan } from "./business-plan-ui";
import { BusinessPlanAccessDialog } from "./BusinessPlanAccessDialog";
import { BusinessPlanClaims } from "./BusinessPlanClaims";
import { BusinessPlanDataDialog } from "./BusinessPlanDataDialog";
import { BusinessPlanDocuments } from "./BusinessPlanDocuments";
import { BusinessPlanApprovalPanel, BusinessPlanProject, BusinessPlanReadiness, BusinessPlanReview } from "./BusinessPlanReview";
import { BusinessPlanTasks } from "./BusinessPlanTasks";
import { useBusinessPlan } from "./use-business-plan";

import "./business-plan.css";

export function BusinessPlanBoard({ userIdentity }: { userIdentity: string }) {
  if (!userIdentity.trim()) return <div className="business-plan"><p className="bp-notice bp-notice--error" role="alert">관리자 인증을 확인한 뒤 사업계획서 기록을 열 수 있습니다.</p></div>;
  return <BusinessPlanWorkspace key={userIdentity} />;
}

function BusinessPlanWorkspace() {
  const workspace = useBusinessPlan();
  const { board, revision, updatedAt, loading, saving, dirty, denied, conflict, error, notice, hasPendingSave, access, accessVerified, commit, persist, reload, claimOwnership, exportBoard, revoke } = workspace;
  const [jsonOpen, setJsonOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [backupError, setBackupError] = useState("");
  const [, refreshClock] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => refreshClock((tick) => tick + 1), 60_000); return () => window.clearInterval(timer); }, []);
  const now = new Date();

  if (denied) return <div className="business-plan"><BusinessPlanError error={error} /></div>;
  if (!accessVerified && !board) return <div className="business-plan">
    {loading ? <p className="bp-notice" role="status">사업계획서 서버 기록과 접근 권한을 확인하고 있습니다.</p> : <><BusinessPlanError error={error} /><button type="button" className="bp-button" onClick={() => void reload()}>접근 권한과 서버 기록 다시 확인</button></>}
  </div>;
  if (access.canClaimOwnership) return <div className="business-plan"><h1>사업계획서 고도화·제출 준비</h1>
    <p className="bp-notice">이 보드는 아직 비어 있습니다. 아래 버튼으로 현재 관리자 계정을 소유자로 설정한 뒤 자료를 작성할 수 있습니다. 다른 관리자는 자동으로 접근할 수 없으며, 소유자가 계정별 권한을 지정합니다.</p>
    <BusinessPlanError error={error} />
    <button type="button" className="bp-button bp-button--primary" disabled={saving} onClick={() => void claimOwnership()}>{saving ? "소유권 확인 중…" : "이 빈 보드의 소유자로 시작"}</button>
  </div>;
  const summary = board ? stats(board, now) : null;
  const checks = board ? getChecks(board, now) : [];

  async function backup() {
    const authorized = await exportBoard(); if (!authorized) return;
    try { downloadBusinessPlan(`business-plan-backup-${todayKst()}.json`, JSON.stringify(authorized)); setBackupError(""); }
    catch { setBackupError("JSON 파일을 만들지 못했습니다. 내보내기 권한을 다시 확인한 뒤 시도하세요."); }
  }

  async function openJson() {
    if (!access.canWrite && !access.canExport) return;
    if (access.canExport && board) {
      const authorized = await exportBoard(); if (!authorized) return;
      setJsonOpen(true);
    } else setJsonOpen(true);
  }

  return <BusinessPlanPermissions.Provider key={`${access.canWrite}:${access.canExport}`} value={{ canWrite: access.canWrite, canExport: access.canExport, exportBoard }}><div className="business-plan">
    {loading && <p className="bp-notice" role="status">사업계획서 접근 권한을 다시 확인하는 동안 기록을 숨깁니다. 확인되면 현재 입력을 이어서 볼 수 있습니다.</p>}
    {!loading && !accessVerified && <><BusinessPlanError error={error} /><button type="button" className="bp-button" onClick={() => void reload(true)}>접근 권한과 서버 기록 다시 확인</button></>}
    <div className="bp-workspace" hidden={!accessVerified} inert={loading || !accessVerified} aria-busy={loading} onClickCapture={(event) => {
      if (loading || !accessVerified) { event.preventDefault(); event.stopPropagation(); }
    }} onSubmitCapture={(event) => {
      if (loading || !accessVerified) { event.preventDefault(); event.stopPropagation(); }
    }}>
    <div className="bp-heading"><div className="bp-heading-copy"><p className="bp-eyebrow">BUSINESS PLAN · WORKSPACE</p><h1>사업계획서 고도화·제출 준비</h1><p>{board?.project.subtitle || "문제와 근거를 정리하고, 문서 변경과 제출 전 점검을 한곳에서 관리합니다."}</p></div><div className="bp-actions"><button type="button" className="bp-button" disabled={!board || !access.canExport} onClick={() => void backup()}>JSON 백업</button><button type="button" className="bp-button" disabled={!access.canWrite && !access.canExport} onClick={() => void openJson()}>JSON 관리</button>{access.canManageAccess && <button type="button" className="bp-button" onClick={() => setAccessOpen(true)}>사업 자료 접근 권한</button>}</div></div>
    <div className="bp-savebar" data-dirty={dirty}><div className="bp-savebar-copy"><BusinessPlanBadge tone={dirty ? "warn" : board ? "good" : "neutral"}>{dirty ? "서버 미저장 변경 있음" : board ? "서버 저장본과 동일" : "서버 기록 미확인"}</BusinessPlanBadge><span className="bp-status-message">{revision === null ? "서버 버전 미확인" : `서버 버전 ${revision}`} · {updatedAt ? `마지막 저장 ${businessPlanDate(updatedAt)}` : "저장 이력 없음"}</span></div><div className="bp-actions"><button type="button" className="bp-button bp-button--small" disabled={loading || saving} onClick={() => dirty ? setConfirmReload(true) : void reload()}>{loading ? "불러오는 중…" : "서버 기록 다시 읽기"}</button><button type="button" className="bp-button bp-button--primary" disabled={!access.canWrite || !board || revision === null || (!dirty && !hasPendingSave) || saving || loading || conflict} onClick={() => void persist()}>{saving ? "서버 저장 중…" : hasPendingSave ? "실패한 저장 다시 시도" : "서버에 저장"}</button></div></div>
    {!access.canWrite && <p className="bp-notice">읽기 전용으로 열었습니다. 수정은 소유자가 별도로 권한을 부여해야 합니다. 내보내기도 별도 권한을 확인합니다.</p>}
    <BusinessPlanError error={error} /><BusinessPlanError error={backupError} />
    {notice && <p className="bp-status-message" role="status">{notice}</p>}
    {hasPendingSave && !saving && <p className="bp-notice bp-notice--warn">재시도는 실패한 요청 당시의 기록과 같은 요청 ID로 수행합니다. 그 후 추가한 편집 내용은 재시도 성공 후 다시 저장하세요.</p>}
    {!board ? <div className="bp-notice"><p>서버 기록을 확인하지 못해 새 기본값으로 덮어쓰지 않았습니다. 연결을 확인하고 다시 읽거나 보유한 JSON 백업을 가져올 수 있습니다.</p><p>서버 버전을 확인하기 전에는 가져온 기록도 서버에 저장할 수 없습니다.</p></div> : <>
      <div className="bp-metrics" aria-label="보드 전체 현황"><a className="bp-metric" href="#bp-tasks"><span className="bp-metric-label">보완 작업</span><strong className="bp-metric-value">{summary?.completedTasks}<small>/ {board.tasks.length}</small></strong><span className="bp-metric-note">최종 확인 {summary?.finalTasks}개</span></a><a className="bp-metric" href="#bp-claims"><span className="bp-metric-label">근거 확인 기록</span><strong className="bp-metric-value">{summary?.verifiedClaims}<small>/ {board.claims.length}</small></strong><span className="bp-metric-note">미확인 {summary?.unknownClaims} · 최신성 경고 {summary?.staleClaims}</span></a><a className="bp-metric" href="#bp-mentor"><span className="bp-metric-label">멘토 피드백 반영</span><strong className="bp-metric-value">{summary?.mentorDone}<small>/ {summary?.mentorTotal}</small></strong><span className="bp-metric-note">반영 문서·위치·근거 기준</span></a><a className="bp-metric" href="#bp-review"><span className="bp-metric-label">자동 점검 통과</span><strong className="bp-metric-value">{checks.filter((item) => item.pass).length}<small>/ {checks.length}</small></strong><span className="bp-metric-note">외부 실행 승인 대기 {summary?.approvalCount}개</span></a></div>
      <nav className="bp-nav" aria-label="사업계획서 작업 구역"><a href="#bp-tasks">보완 작업</a><a href="#bp-claims">주장·근거</a><a href="#bp-documents">문서·버전</a><a href="#bp-mentor">멘토 피드백</a><a href="#bp-review">최종 점검</a></nav>
      <div className="bp-overview-grid"><div className="bp-column"><BusinessPlanTasks board={board} onCommit={commit} /><BusinessPlanProject board={board} onCommit={commit} /></div><aside className="bp-column" aria-label="제출 점검과 승인 대기"><BusinessPlanReadiness board={board} now={now} /><BusinessPlanApprovalPanel board={board} onCommit={commit} /></aside></div>
      <BusinessPlanClaims board={board} onCommit={commit} now={now} /><BusinessPlanDocuments board={board} onCommit={commit} /><BusinessPlanReview board={board} onCommit={commit} />
      <BusinessPlanPanel title="변경 기록" description="보드에 반영한 기록입니다. 서버 저장 여부는 상단에서 확인하세요." className="bp-section"><ul className="bp-activity">{[...board.activity].reverse().slice(0, 12).map((item) => <li key={item.id}><time dateTime={item.at}>{businessPlanDate(item.at)}</time><span>{item.text}</span></li>)}</ul>{!board.activity.length && <p className="bp-empty">아직 반영한 변경이 없습니다.</p>}</BusinessPlanPanel>
      <footer className="bp-footer"><span>{board.project.title} · 시간 표시는 KST 기준</span><span>코드 수정·외부 제출·계정 설정 변경·외부 배포: 승인 대기 메모만 관리</span></footer>
    </>}
    {jsonOpen && (access.canWrite || access.canExport) && <BusinessPlanDataDialog board={board} initialJson={access.canExport && board ? JSON.stringify(board) : ""} onCommit={commit} onClose={() => setJsonOpen(false)} />}
    {accessOpen && access.canManageAccess && <BusinessPlanAccessDialog onClose={() => setAccessOpen(false)} onDenied={revoke} />}
    {confirmReload && <BusinessPlanDialog title="서버 최신 기록 다시 읽기" description="현재 화면의 미저장 변경을 버리고 서버에 저장된 최신 기록으로 교체합니다." onClose={() => setConfirmReload(false)}><div className="bp-dialog-body"><p className="bp-notice bp-notice--warn">미저장 변경은 현재 화면에서 제거됩니다. 필요하면 내보내기 권한을 확인하고 직접 백업할 수 있습니다.</p><button type="button" className="bp-button" disabled={!access.canExport} onClick={() => void backup()}>교체 전 현재 JSON 백업</button></div><footer className="bp-dialog-footer"><button type="button" className="bp-button" onClick={() => setConfirmReload(false)}>다시 읽기 취소</button><button type="button" className="bp-button bp-button--danger" onClick={() => { setConfirmReload(false); void reload(); }}>미저장 변경을 버리고 최신본 읽기</button></footer></BusinessPlanDialog>}
    </div>
  </div></BusinessPlanPermissions.Provider>;
}
