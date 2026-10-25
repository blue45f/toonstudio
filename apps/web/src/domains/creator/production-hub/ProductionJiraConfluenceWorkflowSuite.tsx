import { useMemo, useState } from "react";
import {
  claimWebtoonTicket,
  evaluateConfluenceSmartLinks,
  formatStandardWebtoonTicketTitle,
  INITIAL_CONFLUENCE_PAGES,
  INITIAL_PD_NOTIFICATIONS,
  INITIAL_WEBTOON_TICKETS,
  issueWebtoonProductionTicket,
  queryTicketsWithJqlFilter,
  reviewWebtoonTicketByPd,
  submitWebtoonTicketForPdReview,
  syncTicketConfluenceSpecVersions,
  WEBTOON_TICKET_PRIORITY_LABELS,
  WEBTOON_TICKET_STATUS_META,
  type ConfluenceLorePage,
  type PdReviewAutoNotification,
  type WebtoonTicketPriority,
  type WebtoonTicketRecord,
  type WebtoonTicketStatus,
} from "./production-jira-confluence-workflow-model";
import {
  SHOTGRID_STEP_LABELS,
  type ShotGridPipelineStep,
} from "./production-shotgrid-version-lineage-model";

const CARD_STYLE = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "0.85rem",
  display: "grid",
  gap: "0.6rem",
} as const;

const INPUT_STYLE = {
  minHeight: 44,
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  padding: "0 0.5rem",
  background: "#ffffff",
} as const;

export function ProductionJiraConfluenceWorkflowSuite() {
  const [tickets, setTickets] = useState<readonly WebtoonTicketRecord[]>(INITIAL_WEBTOON_TICKETS);
  const [notifications, setNotifications] = useState<readonly PdReviewAutoNotification[]>(INITIAL_PD_NOTIFICATIONS);
  const [confluencePages, setConfluencePages] = useState<readonly ConfluenceLorePage[]>(INITIAL_CONFLUENCE_PAGES);

  const [workTitleInput, setWorkTitleInput] = useState("화산귀환");
  const [episodeInput, setEpisodeInput] = useState(49);
  const [stepInput, setStepInput] = useState<ShotGridPipelineStep>("shading");
  const [priorityInput, setPriorityInput] = useState<WebtoonTicketPriority>("highest");
  const [cutStartInput, setCutStartInput] = useState(1);
  const [cutEndInput, setCutEndInput] = useState(68);
  const [activeWorkerName, setActiveWorkerName] = useState("이채림 (채색 담당)");
  const [versionInput, setVersionInput] = useState("v003");

  const [statusFilter, setStatusFilter] = useState<WebtoonTicketStatus | "ALL">("ALL");
  const [onlyPullable, setOnlyPullable] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIssueKey, setSelectedIssueKey] = useState("HSGH-4802");
  const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);

  const previewTicketTitle = useMemo(
    () => formatStandardWebtoonTicketTitle(workTitleInput, episodeInput, stepInput),
    [workTitleInput, episodeInput, stepInput],
  );

  const filteredTickets = useMemo(
    () => queryTicketsWithJqlFilter(tickets, { status: statusFilter, onlyPullableUnassigned: onlyPullable, searchText: searchQuery }),
    [tickets, statusFilter, onlyPullable, searchQuery],
  );

  const selectedTicket = useMemo(
    () => tickets.find((item) => item.issueKey === selectedIssueKey) ?? tickets[0] ?? null,
    [tickets, selectedIssueKey],
  );

  const evaluatedSmartLinks = useMemo(
    () => (selectedTicket ? evaluateConfluenceSmartLinks(selectedTicket, confluencePages) : []),
    [selectedTicket, confluencePages],
  );

  const unreadPdNotificationCount = useMemo(
    () => notifications.filter((item) => !item.acknowledged).length,
    [notifications],
  );

  const handleIssueTicket = () => {
    const result = issueWebtoonProductionTicket(tickets, confluencePages, {
      projectKey: "HSGH",
      workTitle: workTitleInput,
      episodeNumber: episodeInput,
      step: stepInput,
      cutRange: [cutStartInput, Math.max(cutStartInput, cutEndInput)],
      priority: priorityInput,
      reporterPdId: "pd-main-1",
      reporterPdName: "김현준 메인 PD",
      dueDate: "2026-10-30",
      linkedConfluencePageIds: confluencePages.map((p) => p.id),
    });
    setTickets(result.tickets);
    setSelectedIssueKey(result.createdTicket.issueKey);
    setWorkflowNotice(`메인 PD가 '${result.createdTicket.title}' (${result.createdTicket.issueKey}) 티켓을 일감 대기열에 발행했습니다.`);
  };

  const handleClaimTicket = (issueKey: string) => {
    const result = claimWebtoonTicket(tickets, issueKey, {
      workerId: "worker-color-1",
      workerName: activeWorkerName.trim() || "이채림 (채색 담당)",
    });
    if (!result.ok) {
      setWorkflowNotice(
        result.reason === "blocked-by-upstream"
          ? `선행 공정 티켓(${result.unresolvedBlockers?.join(", ")})이 아직 PD 승인되지 않아 가져갈 수 없습니다.`
          : "이 티켓은 현재 가져갈 수 없는 상태입니다.",
      );
      return;
    }
    setTickets(result.tickets);
    setSelectedIssueKey(issueKey);
    setWorkflowNotice(`${activeWorkerName}님이 ${issueKey} 일감을 가져가 작업 중(IN_PROGRESS) 상태로 전환했습니다.`);
  };

  const handleSubmitForReview = (issueKey: string) => {
    const result = submitWebtoonTicketForPdReview(tickets, notifications, {
      issueKey,
      workerId: "worker-color-1",
      workerName: activeWorkerName.trim() || "이채림 (채색 담당)",
      linkedVersionCode: versionInput.trim() || "v003",
    });
    if (!result.ok) return;
    setTickets(result.tickets);
    setNotifications(result.notifications);
    setSelectedIssueKey(issueKey);
    setWorkflowNotice(
      `${issueKey} 작업 완료 제출! 담당 PD(${result.createdNotification?.recipientPdName})에게 자동 검수 알림(인앱·푸시·웹훅)이 즉시 발송되었습니다.`,
    );
  };

  const handlePdDecision = (issueKey: string, decision: "approve" | "retake") => {
    const result = reviewWebtoonTicketByPd(tickets, {
      issueKey,
      decision,
      retakeReason: "14컷 매화검기 코어 발광 및 42컷 얼굴 주변 채도 보완 요청",
    });
    if (!result.ok) return;
    setTickets(result.tickets);
    if (decision === "approve") {
      const unblockedNote =
        result.unblockedIssueKeys.length > 0
          ? ` (후속 공정 티켓 ${result.unblockedIssueKeys.join(", ")} 선행 블로커 자동 해제됨)`
          : "";
      setWorkflowNotice(`${issueKey} 티켓을 PD 최종 승인(PD_APPROVED) 처리했습니다.${unblockedNote}`);
    } else {
      setWorkflowNotice(`${issueKey} 티켓을 리테이크 요청(RETAKE_REQUESTED) 상태로 전환했습니다.`);
    }
  };

  const handleSyncConfluenceSpecs = (issueKey: string) => {
    setTickets((prev) => syncTicketConfluenceSpecVersions(prev, issueKey, confluencePages));
    setWorkflowNotice(`${issueKey} 티켓의 Confluence 설정집·컬러 시트 기준 버전을 최신본으로 동기화했습니다.`);
  };

  const handleBumpConfluenceVersion = (pageId: string) => {
    setConfluencePages((prev) =>
      prev.map((page) => (page.id === pageId ? { ...page, versionNumber: page.versionNumber + 1, updatedAt: "방금 전" } : page)),
    );
    setWorkflowNotice("Confluence 설정 문서가 새 버전으로 개정되어 연결된 티켓에 변경 알림이 표시됩니다.");
  };

  return (
    <section
      aria-label="Jira & Confluence 웹툰 일감 티켓 발행·자율 가져가기·PD 자동 검수 알림 및 설정집 연동"
      data-testid="jira-confluence-workflow-suite"
      style={{ border: "1px solid #cbd5e1", borderRadius: 14, padding: "1rem", background: "#f8fafc", display: "grid", gap: "1rem" }}
    >
      <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <span style={{ display: "inline-block", fontSize: "0.7rem", fontWeight: 800, color: "#1d4ed8", background: "#dbeafe", padding: "0.15rem 0.55rem", borderRadius: 999 }}>
            Jira & Confluence 애자일 파이프라인 내재화
          </span>
          <h3 style={{ margin: "0.3rem 0 0", fontSize: "1rem", fontWeight: 800, color: "#0f172a" }}>
            메인 PD 일감 티켓 발행 · 담당자 가져가기(Pull) · 완료 시 PD 자동 검수 알림 & 설정집 스마트 링크
          </h3>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "#475569" }}>
            메인 PD가 &lsquo;화산귀환 O화 채색 요청&rsquo; 티켓을 발행하면 채색 담당자가 가져가 작업하고, 완료 제출 즉시 담당 PD에게 자동 검수 알림이 발송되며 Confluence 설정집과 양방향 동기화됩니다.
          </p>
        </div>

        <span
          data-testid="jira-unread-pd-notif-badge"
          style={{
            alignSelf: "center",
            fontSize: "0.76rem",
            fontWeight: 800,
            padding: "0.35rem 0.7rem",
            borderRadius: 999,
            background: unreadPdNotificationCount > 0 ? "#fef3c7" : "#e2e8f0",
            color: unreadPdNotificationCount > 0 ? "#b45309" : "#475569",
          }}
        >
          PD 미확인 자동 검수 알림 {unreadPdNotificationCount}건
        </span>
      </header>

      {workflowNotice ? (
        <p
          role="status"
          data-testid="jira-workflow-notice"
          style={{ margin: 0, padding: "0.55rem 0.8rem", borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe", fontSize: "0.78rem", fontWeight: 700, color: "#1e40af" }}
        >
          {workflowNotice}
        </p>
      ) : null}

      <div style={CARD_STYLE}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 800, color: "#0f172a" }}>
            1. 메인 PD 일감 티켓 발행기 (Jira Issue Dispatch)
          </h4>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0369a1" }}>
            발행 예정 티켓명: <strong>{previewTicketTitle}</strong>
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.55rem", alignItems: "end" }}>
          <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.74rem", fontWeight: 700, color: "#334155" }}>
            작품명
            <input type="text" aria-label="티켓 발행 작품명" value={workTitleInput} onChange={(e) => setWorkTitleInput(e.target.value)} style={INPUT_STYLE} />
          </label>
          <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.74rem", fontWeight: 700, color: "#334155" }}>
            회차 번호 (화)
            <input type="number" aria-label="티켓 발행 회차 번호" value={episodeInput} onChange={(e) => setEpisodeInput(Number(e.target.value) || 1)} style={INPUT_STYLE} />
          </label>
          <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.74rem", fontWeight: 700, color: "#334155" }}>
            요청 공정
            <select aria-label="티켓 발행 공정 선택" value={stepInput} onChange={(e) => setStepInput(e.target.value as ShotGridPipelineStep)} style={INPUT_STYLE}>
              {(Object.keys(SHOTGRID_STEP_LABELS) as ShotGridPipelineStep[]).map((step) => (
                <option key={step} value={step}>{SHOTGRID_STEP_LABELS[step]}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.74rem", fontWeight: 700, color: "#334155" }}>
            컷 구간 (시작~종료)
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem" }}>
              <input type="number" aria-label="티켓 시작 컷" value={cutStartInput} onChange={(e) => setCutStartInput(Number(e.target.value) || 1)} style={INPUT_STYLE} />
              <input type="number" aria-label="티켓 종료 컷" value={cutEndInput} onChange={(e) => setCutEndInput(Number(e.target.value) || 1)} style={INPUT_STYLE} />
            </div>
          </label>
          <label style={{ display: "grid", gap: "0.2rem", fontSize: "0.74rem", fontWeight: 700, color: "#334155" }}>
            우선순위
            <select aria-label="티켓 우선순위 선택" value={priorityInput} onChange={(e) => setPriorityInput(e.target.value as WebtoonTicketPriority)} style={INPUT_STYLE}>
              {(Object.keys(WEBTOON_TICKET_PRIORITY_LABELS) as WebtoonTicketPriority[]).map((prio) => (
                <option key={prio} value={prio}>{WEBTOON_TICKET_PRIORITY_LABELS[prio]}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="jira-issue-ticket-btn"
            onClick={handleIssueTicket}
            style={{ minHeight: 44, borderRadius: 8, border: "none", background: "#1d4ed8", color: "#ffffff", fontWeight: 800, fontSize: "0.78rem", cursor: "pointer", padding: "0 0.85rem" }}
          >
            일감 티켓 발행 ({previewTicketTitle})
          </button>
        </div>
      </div>

      <div style={CARD_STYLE}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <h4 style={{ margin: 0, fontSize: "0.85rem", fontWeight: 800, color: "#0f172a" }}>
            2. 애자일 공정 일감 보드 ({filteredTickets.length}건)
          </h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center" }}>
            <label style={{ fontSize: "0.73rem", fontWeight: 700, color: "#334155" }}>
              작업자 프로필
              <input
                type="text"
                aria-label="현재 작업자 이름"
                value={activeWorkerName}
                onChange={(e) => setActiveWorkerName(e.target.value)}
                style={{ ...INPUT_STYLE, minHeight: 40, marginLeft: 6, width: 145 }}
              />
            </label>
            <label style={{ fontSize: "0.73rem", fontWeight: 700, color: "#334155" }}>
              제출 버전 코드
              <input
                type="text"
                aria-label="제출할 ShotGrid 버전 코드"
                value={versionInput}
                onChange={(e) => setVersionInput(e.target.value)}
                style={{ ...INPUT_STYLE, minHeight: 40, marginLeft: 6, width: 72 }}
              />
            </label>
            <select
              aria-label="티켓 상태 JQL 필터"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WebtoonTicketStatus | "ALL")}
              style={{ ...INPUT_STYLE, minHeight: 40, fontSize: "0.74rem" }}
            >
              <option value="ALL">전체 상태</option>
              {(Object.keys(WEBTOON_TICKET_STATUS_META) as WebtoonTicketStatus[]).map((st) => (
                <option key={st} value={st}>{WEBTOON_TICKET_STATUS_META[st].labelKo}</option>
              ))}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.73rem", fontWeight: 700 }}>
              <input type="checkbox" checked={onlyPullable} onChange={(e) => setOnlyPullable(e.target.checked)} />
              가져가기 가능 일감만
            </label>
            <input
              type="search"
              aria-label="JQL 키워드 검색"
              placeholder="티켓 키·제목·담당자 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...INPUT_STYLE, minHeight: 40, fontSize: "0.74rem" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.55rem" }}>
          {filteredTickets.map((ticket) => {
            const statusMeta = WEBTOON_TICKET_STATUS_META[ticket.status];
            const isBlocked = ticket.blockedByIssueKeys.length > 0;
            return (
              <article
                key={ticket.id}
                aria-label={`${ticket.issueKey} ${ticket.title}`}
                data-testid={`jira-ticket-card-${ticket.issueKey}`}
                style={{
                  border: selectedTicket?.issueKey === ticket.issueKey ? "2px solid #2563eb" : "1px solid #cbd5e1",
                  borderRadius: 10,
                  padding: "0.7rem 0.85rem",
                  background: "#f8fafc",
                  display: "grid",
                  gap: "0.45rem",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.4rem" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedIssueKey(ticket.issueKey)}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "0.45rem",
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: "0.72rem", fontWeight: 800, background: "#0f172a", color: "#ffffff", padding: "0.15rem 0.45rem", borderRadius: 6 }}>
                      {ticket.issueKey}
                    </span>
                    <strong style={{ fontSize: "0.84rem", color: "#0f172a" }}>{ticket.title}</strong>
                    <span style={{ fontSize: "0.72rem", color: "#475569" }}>
                      ({ticket.cutRange[0]}~{ticket.cutRange[1]}컷 · 마감 {ticket.dueDate})
                    </span>
                  </button>
                  <span style={{ fontSize: "0.7rem", fontWeight: 800, padding: "0.18rem 0.55rem", borderRadius: 999, background: statusMeta.bg, color: statusMeta.color }}>
                    {statusMeta.labelKo}
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", fontSize: "0.74rem", color: "#334155" }}>
                  <div>
                    발행 PD: <strong>{ticket.reporterPdName}</strong> · 담당자: <strong>{ticket.assigneeWorkerName ?? "미배정 (대기열)"}</strong>
                    {ticket.linkedVersionCode ? <span> · 제출 버전: <strong>{ticket.linkedVersionCode}</strong></span> : null}
                    {isBlocked ? <span style={{ marginLeft: 8, color: "#b91c1c", fontWeight: 800 }}>[선행 공정 대기: {ticket.blockedByIssueKeys.join(", ")}]</span> : null}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                    {(ticket.status === "READY_FOR_PULL" || ticket.status === "RETAKE_REQUESTED") ? (
                      <button
                        type="button"
                        data-testid={`jira-claim-btn-${ticket.issueKey}`}
                        onClick={(e) => { e.stopPropagation(); handleClaimTicket(ticket.issueKey); }}
                        style={{ minHeight: 38, padding: "0.25rem 0.65rem", borderRadius: 6, border: "1px solid #0284c7", background: "#e0f2fe", color: "#0369a1", fontWeight: 800, fontSize: "0.72rem", cursor: "pointer" }}
                      >
                        일감 가져가기 (Claim & Start)
                      </button>
                    ) : null}

                    {(ticket.status === "IN_PROGRESS" || ticket.status === "RETAKE_REQUESTED") ? (
                      <button
                        type="button"
                        data-testid={`jira-submit-review-btn-${ticket.issueKey}`}
                        onClick={(e) => { e.stopPropagation(); handleSubmitForReview(ticket.issueKey); }}
                        style={{ minHeight: 38, padding: "0.25rem 0.65rem", borderRadius: 6, border: "none", background: "#d97706", color: "#ffffff", fontWeight: 800, fontSize: "0.72rem", cursor: "pointer" }}
                      >
                        작업 완료 및 PD 자동 검수 알림 전송
                      </button>
                    ) : null}

                    {ticket.status === "PENDING_PD_REVIEW" ? (
                      <>
                        <button
                          type="button"
                          data-testid={`jira-pd-approve-btn-${ticket.issueKey}`}
                          onClick={(e) => { e.stopPropagation(); handlePdDecision(ticket.issueKey, "approve"); }}
                          style={{ minHeight: 38, padding: "0.25rem 0.65rem", borderRadius: 6, border: "none", background: "#15803d", color: "#ffffff", fontWeight: 800, fontSize: "0.72rem", cursor: "pointer" }}
                        >
                          PD 검수 승인 (후속 공정 잠금 해제)
                        </button>
                        <button
                          type="button"
                          data-testid={`jira-pd-retake-btn-${ticket.issueKey}`}
                          onClick={(e) => { e.stopPropagation(); handlePdDecision(ticket.issueKey, "retake"); }}
                          style={{ minHeight: 38, padding: "0.25rem 0.65rem", borderRadius: 6, border: "1px solid #dc2626", background: "#fee2e2", color: "#b91c1c", fontWeight: 800, fontSize: "0.72rem", cursor: "pointer" }}
                        >
                          리테이크 요청
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: "0.75rem" }}>
        <div style={CARD_STYLE}>
          <h4 style={{ margin: 0, fontSize: "0.84rem", fontWeight: 800, color: "#0f172a" }}>
            3. 담당 PD 실시간 자동 검수 알림 인박스 ({notifications.length}건)
          </h4>
          {notifications.map((notif) => (
            <div
              key={notif.id}
              data-testid={`pd-auto-notif-${notif.issueKey}`}
              style={{ border: "1px solid #fde68a", background: notif.acknowledged ? "#f8fafc" : "#fffbeb", borderRadius: 8, padding: "0.6rem", display: "grid", gap: "0.3rem", fontSize: "0.75rem" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.4rem" }}>
                <strong style={{ color: "#92400e" }}>[{notif.issueKey}] → {notif.recipientPdName} ({notif.channels.join(" · ")})</strong>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b" }}>ShotGrid {notif.linkedVersionCode}</span>
              </div>
              <p style={{ margin: 0, color: "#334155", lineHeight: 1.45 }}>{notif.message}</p>
            </div>
          ))}
        </div>

        <div style={CARD_STYLE}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "0.4rem" }}>
            <h4 style={{ margin: 0, fontSize: "0.84rem", fontWeight: 800, color: "#0f172a" }}>
              4. Confluence 설정집 스마트 링크 ({selectedTicket?.issueKey ?? "미선택"})
            </h4>
            {selectedTicket ? (
              <button
                type="button"
                data-testid="confluence-sync-spec-btn"
                onClick={() => handleSyncConfluenceSpecs(selectedTicket.issueKey)}
                style={{ minHeight: 36, padding: "0.2rem 0.6rem", borderRadius: 6, border: "1px solid #cbd5e1", background: "#f1f5f9", color: "#0f172a", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
              >
                최신 설정집 버전 확인 완료 동기화
              </button>
            ) : null}
          </div>

          {evaluatedSmartLinks.map(({ page, acknowledgedVersion, isOutdatedSpec }) => (
            <div
              key={page.id}
              data-testid={`confluence-smart-link-${page.id}`}
              style={{ border: isOutdatedSpec ? "1px solid #f59e0b" : "1px solid #cbd5e1", background: isOutdatedSpec ? "#fffbeb" : "#f8fafc", borderRadius: 8, padding: "0.65rem", display: "grid", gap: "0.4rem" }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "0.4rem" }}>
                <strong style={{ fontSize: "0.78rem", color: "#0f172a" }}>[{page.spaceKey}] {page.title} (v{page.versionNumber})</strong>
                <button
                  type="button"
                  onClick={() => handleBumpConfluenceVersion(page.id)}
                  style={{ minHeight: 32, padding: "0.15rem 0.5rem", borderRadius: 6, border: "1px solid #cbd5e1", background: "#ffffff", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer" }}
                >
                  설정집 개정 (v{page.versionNumber + 1})
                </button>
              </div>
              {isOutdatedSpec ? (
                <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 800, color: "#b45309" }}>
                  설정 변경 경고: 티켓 확인 버전(v{acknowledgedVersion}) 이후 최신 문서(v{page.versionNumber})가 개정되었습니다.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.7rem", color: "#15803d", fontWeight: 700 }}>
                  기준 설정 동기화됨 (v{page.versionNumber}) · 인라인 코멘트 {page.inlineCommentsCount}건
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {page.paletteSwatches.map((swatch) => (
                  <span
                    key={swatch.hex}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.68rem", fontWeight: 700, padding: "0.15rem 0.45rem", borderRadius: 6, border: "1px solid #cbd5e1", background: "#ffffff" }}
                  >
                    <span aria-hidden="true" style={{ width: 11, height: 11, borderRadius: 3, background: swatch.hex, border: "1px solid #94a3b8" }} />
                    {swatch.label} ({swatch.hex})
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
