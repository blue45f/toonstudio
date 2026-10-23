import { useEffect, useMemo, useRef, useState } from "react";

import { applyOperationPolicy, loadOperationPolicy, previewOperationPolicy } from "./api/operation-policy-api";

import type { LicenseReview, ModeProfile, OperatingMode, OperationFeature, OperationPolicyAdminView, OperationPolicyDraft, OperationPolicyPreview } from "@toonstudio/contracts/operation-policy";

const modes: readonly OperatingMode[] = ["free", "paid"];
const modeLabel = { free: "무료 운영", paid: "유료 운영" };
const featureLabels: Record<OperationFeature, string> = {
  "team-workspace": "팀 워크스페이스 생성·초대·작품 연결",
  "licensed-assets": "라이선스 자산 (연동 준비 중)",
  "ai-shading": "AI 음영 (연동 준비 중)",
};
type ReviewKey = "release" | "licensed-assets" | "ai-shading";
const reviews: readonly ReviewKey[] = ["release", "licensed-assets", "ai-shading"];
const reviewLabels = {
  release: "배포물 전체 검토",
  "licensed-assets": "라이선스 자산 검토",
  "ai-shading": "AI 모델 검토",
};
const reviewStateLabels: Record<LicenseReview["state"], string> = {
  pending: "미검토",
  approved: "승인 완료",
  blocked: "사용 제한",
};
const quickReasonTemplates: readonly string[] = [
  "무료 운영 한도 정기 점검",
  "유료 전환 사전 라이선스 검토 반영",
  "팀 워크스페이스 한도 조정",
  "배포물 SHA-256 갱신 및 검토 반영",
];

function countDraftDiffs(base: OperationPolicyDraft, current: OperationPolicyDraft): number {
  let diffs = 0;
  if (base.mode !== current.mode) diffs += 1;
  for (const mode of modes) {
    const bProf = base.profiles[mode];
    const cProf = current.profiles[mode];
    if (bProf.limits.ownedWorkspaces !== cProf.limits.ownedWorkspaces) diffs += 1;
    if (bProf.limits.projectsPerWorkspace !== cProf.limits.projectsPerWorkspace) diffs += 1;
    if (bProf.limits.membersPerWorkspace !== cProf.limits.membersPerWorkspace) diffs += 1;
    if (bProf.notice !== cProf.notice) diffs += 1;
    for (const feat of Object.keys(featureLabels) as OperationFeature[]) {
      if (bProf.features[feat] !== cProf.features[feat]) diffs += 1;
    }
  }
  for (const key of reviews) {
    const bRev = key === "release" ? base.releaseReview : base.featureReviews[key];
    const cRev = key === "release" ? current.releaseReview : current.featureReviews[key];
    if (
      bRev.state !== cRev.state ||
      bRev.evidenceRef !== cRev.evidenceRef ||
      bRev.subjectDigest !== cRev.subjectDigest ||
      bRev.validUntil !== cRev.validUntil ||
      bRev.approvedModes.join(",") !== cRev.approvedModes.join(",")
    ) {
      diffs += 1;
    }
  }
  return diffs;
}

export function OperationPolicyPanel() {
  const [data, setData] = useState<OperationPolicyAdminView | null>(null);
  const [draft, setDraft] = useState<OperationPolicyDraft | null>(null);
  const [tab, setTab] = useState<OperatingMode>("free");
  const [impact, setImpact] = useState<OperationPolicyPreview | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const mutationId = useRef("");

  useEffect(() => {
    let current = true;
    setBusy(true);
    setError("");
    setData(null);
    setDraft(null);
    setImpact(null);
    void loadOperationPolicy()
      .then((result) => {
        if (current) {
          setData(result);
          setDraft(result.policy.draft);
          setTab(result.policy.draft.mode);
        }
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "불러오기 실패");
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [reload]);

  const change = (value: OperationPolicyDraft) => {
    setDraft(value);
    setImpact(null);
    setNotice("");
  };

  function resetDraft() {
    if (!data) return;
    setDraft(data.policy.draft);
    setTab(data.policy.draft.mode);
    setImpact(null);
    setNotice("초안을 서버 저장본 상태로 되돌렸습니다.");
  }

  function updateProfile(patch: Partial<ModeProfile>) {
    if (draft) {
      change({
        ...draft,
        profiles: { ...draft.profiles, [tab]: { ...draft.profiles[tab], ...patch } },
      });
    }
  }

  function updateReview(key: ReviewKey, patch: Partial<LicenseReview>) {
    if (!draft) return;
    if (key === "release") change({ ...draft, releaseReview: { ...draft.releaseReview, ...patch } });
    else change({ ...draft, featureReviews: { ...draft.featureReviews, [key]: { ...draft.featureReviews[key], ...patch } } });
  }

  async function prepare() {
    if (!draft || !data) return;
    setBusy(true);
    setError("");
    setImpact(null);
    try {
      const result = await previewOperationPolicy(data.policy.revision, draft);
      mutationId.current = crypto.randomUUID();
      setImpact(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "미리보기 실패");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!draft || !data || !impact) return;
    setBusy(true);
    setError("");
    try {
      const result = await applyOperationPolicy(data.policy.revision, draft, impact.digest, reason.trim(), mutationId.current);
      setNotice(`정책 revision ${result.acceptedRevision} 저장 완료. 사용자 청구는 시작되지 않았습니다.`);
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey && (event.key === "p" || event.key === "P")) {
        event.preventDefault();
        if (!busy && draft && data) {
          void prepare();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const draftDiffCount = useMemo(() => {
    if (!data || !draft) return 0;
    return countDraftDiffs(data.policy.draft, draft);
  }, [data, draft]);

  const approvedReviewCount = useMemo(() => {
    if (!draft) return 0;
    return reviews.filter((key) => {
      const r = key === "release" ? draft.releaseReview : draft.featureReviews[key];
      return r.state === "approved";
    }).length;
  }, [draft]);

  const isReasonValid = reason.trim().length >= 5;

  return (
    <section className="operation-policy" aria-labelledby="policy-title">
      <header className="policy-header">
        <p className="admin-eyebrow">ToonStudio / 운영 설정</p>
        <h1 id="policy-title">운영 모드와 라이선스</h1>
        <p>당분간 무료로 운영하고, 검토를 마친 뒤 유료 운영 정책으로 전환합니다. 운영 모드와 실제 청구는 서로 다릅니다.</p>
        <details className="policy-onboarding-guide">
          <summary>처음 사용하는 관리자를 위한 4단계 안전 가이드 (클릭하여 열기)</summary>
          <div className="policy-onboarding-guide__body">
            <ol>
              <li><strong>1단계 (모드 선택)</strong>: 적용할 운영 모드(무료/유료)를 선택합니다. 선택만으로는 즉시 반영되지 않습니다.</li>
              <li><strong>2단계 (한도·기능 구성)</strong>: 무료/유료 각 모드의 워크스페이스·프로젝트·구성원 한도와 활성 기능을 설정합니다.</li>
              <li><strong>3단계 (라이선스·SHA-256 검토)</strong>: 배포물 전체 및 유료/AI 기능의 라이선스 근거 문서와 SHA-256 다이제스트를 검증합니다.</li>
              <li><strong>4단계 (영향 미리보기 → 적용)</strong>: 5자 이상의 변경 사유를 입력하고 <kbd>Alt</kbd>+<kbd>P</kbd> 또는 <em>변경 영향 미리보기</em>로 차단 사유가 없는지 확인한 뒤 최종 적용합니다.</li>
            </ol>
          </div>
        </details>
      </header>

      {error && (
        <div role="alert" className="policy-alert">
          <span>{error}</span>{" "}
          <button type="button" disabled={busy} onClick={() => setReload((value) => value + 1)}>
            최신 설정 다시 읽기
          </button>
        </div>
      )}
      {notice && <p role="status" className="policy-notice">{notice}</p>}
      {busy && <p role="status" className="policy-busy">처리 중입니다.</p>}

      {data && draft && (
        <>
          <div className="policy-status" aria-label="현재 정책 요약">
            <strong>현재: {modeLabel[data.policy.draft.mode]}</strong>
            <span>정책 revision {data.policy.revision}</span>
            <span>이용료 결제: 비활성</span>
            <span className="policy-status__badge" data-dirty={draftDiffCount > 0 ? "true" : "false"}>
              {draftDiffCount > 0 ? `미저장 변경 ${draftDiffCount}건` : "서버 저장본과 동일"}
            </span>
            {draftDiffCount > 0 && (
              <button type="button" className="policy-btn--subtle" disabled={busy} onClick={resetDraft}>
                초안 되돌리기
              </button>
            )}
          </div>

          <nav className="policy-stepper" aria-label="정책 변경 워크플로 단계">
            <ol className="policy-stepper__list">
              <li className="policy-stepper__item" data-state="ready">
                <span className="policy-stepper__num">1</span>
                <div>
                  <strong>운영 모드 선택</strong>
                  <small>목표: {modeLabel[draft.mode]}</small>
                </div>
              </li>
              <li className="policy-stepper__item" data-state="ready">
                <span className="policy-stepper__num">2</span>
                <div>
                  <strong>한도·기능 구성</strong>
                  <small>{modeLabel[tab]} 편집 중</small>
                </div>
              </li>
              <li className="policy-stepper__item" data-state={approvedReviewCount === reviews.length ? "ready" : "pending"}>
                <span className="policy-stepper__num">3</span>
                <div>
                  <strong>라이선스 검토</strong>
                  <small>승인 {approvedReviewCount}/{reviews.length}건</small>
                </div>
              </li>
              <li className="policy-stepper__item" data-state={impact && impact.blockedReasons.length === 0 && isReasonValid ? "ready" : "pending"}>
                <span className="policy-stepper__num">4</span>
                <div>
                  <strong>미리보기·적용</strong>
                  <small>{impact ? (impact.blockedReasons.length === 0 ? "검증 완료" : "차단 사유 있음") : "미리보기 전"}</small>
                </div>
              </li>
            </ol>
          </nav>

          <fieldset disabled={busy}>
            <legend>적용할 운영 모드</legend>
            <div className="mode-options">
              {modes.map((mode) => (
                <label key={mode} className="mode-radio-card" data-checked={draft.mode === mode ? "true" : "false"}>
                  <input
                    type="radio"
                    name="operating-mode"
                    checked={draft.mode === mode}
                    onChange={() => change({ ...draft, mode })}
                  />
                  {modeLabel[mode]}
                </label>
              ))}
            </div>
            <p>선택만으로 저장되지 않습니다. 변경 영향과 라이선스를 확인한 뒤 적용합니다.</p>
          </fieldset>

          <section className="policy-card" aria-labelledby="profile-title">
            <h2 id="profile-title">모드별 구성</h2>
            <div className="policy-comparison-bar" aria-label="무료 대 유료 한도 한눈에 비교">
              {modes.map((m) => (
                <div key={m} className="policy-comparison-chip" data-active={tab === m ? "true" : "false"}>
                  <strong>{modeLabel[m]} 요약</strong>
                  <span>
                    워크스페이스 {draft.profiles[m].limits.ownedWorkspaces} · 프로젝트 {draft.profiles[m].limits.projectsPerWorkspace} · 구성원{" "}
                    {draft.profiles[m].limits.membersPerWorkspace}
                  </span>
                </div>
              ))}
            </div>
            <div className="mode-options" role="group" aria-label="편집할 정책">
              <button type="button" aria-pressed={tab === "free"} onClick={() => setTab("free")}>
                무료 구성
              </button>
              <button type="button" aria-pressed={tab === "paid"} onClick={() => setTab("paid")}>
                유료 구성
              </button>
            </div>
            <fieldset disabled={busy}>
              <legend>{modeLabel[tab]} 이용 한도와 기능</legend>
              <div className="policy-grid">
                {(
                  [
                    ["ownedWorkspaces", "소유 워크스페이스", 100],
                    ["projectsPerWorkspace", "조직별 프로젝트", 1000],
                    ["membersPerWorkspace", "조직별 구성원·대기 초대", 1000],
                  ] as const
                ).map(([key, label, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min={1}
                      max={max}
                      step={1}
                      value={draft.profiles[tab].limits[key]}
                      onChange={(event) => updateProfile({ limits: { ...draft.profiles[tab].limits, [key]: Number(event.target.value) } })}
                    />
                  </label>
                ))}
              </div>
              <div className="policy-checks">
                {(Object.keys(featureLabels) as OperationFeature[]).map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={draft.profiles[tab].features[key]}
                      onChange={(event) => updateProfile({ features: { ...draft.profiles[tab].features, [key]: event.target.checked } })}
                    />
                    {featureLabels[key]}
                  </label>
                ))}
              </div>
              <label>
                사용자 안내 문구
                <textarea
                  rows={3}
                  maxLength={500}
                  value={draft.profiles[tab].notice}
                  onChange={(event) => updateProfile({ notice: event.target.value })}
                />
              </label>
              <p>초과한 기존 자료나 구성원을 자동 삭제·추방하지 않습니다. 유료 구성의 한도도 유료 가입이나 구매 권한을 자동 부여하지 않습니다.</p>
            </fieldset>
          </section>

          <section className="policy-card" aria-labelledby="license-title">
            <h2 id="license-title">라이선스 검토</h2>
            <p>
              무료 제공도 곧 비상업적 이용을 뜻하지 않습니다. 승인 근거는 실제 배포물·용도·버전과 일치해야 합니다. 이 화면은 법률 검토를 대신하지 않습니다.
            </p>
            <p>
              배포물 fingerprint: <code className="policy-digest">{data.runtimeFingerprint ?? "미등록 — 유료 전환 차단"}</code>
            </p>
            {reviews.map((key) => {
              const review = key === "release" ? draft.releaseReview : draft.featureReviews[key];
              return (
                <details key={key} open={key === "release"}>
                  <summary>
                    <span>
                      {reviewLabels[key]} · {review.state}
                    </span>
                    <span className="policy-review-pill" data-state={review.state}>
                      {reviewStateLabels[review.state]}
                    </span>
                  </summary>
                  <fieldset disabled={busy}>
                    <legend>{reviewLabels[key]} 설정</legend>
                    <div className="policy-grid">
                      <label>
                        검토 상태
                        <select
                          value={review.state}
                          onChange={(event) => updateReview(key, { state: event.target.value as LicenseReview["state"] })}
                        >
                          <option value="pending">미검토</option>
                          <option value="approved">승인 근거 확인</option>
                          <option value="blocked">사용 제한</option>
                        </select>
                      </label>
                      <label>
                        근거 문서 참조
                        <input
                          maxLength={512}
                          value={review.evidenceRef}
                          placeholder="내부 검토 문서·계약 참조"
                          onChange={(event) => updateReview(key, { evidenceRef: event.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      검토 대상 SHA-256
                      <input
                        value={review.subjectDigest}
                        maxLength={71}
                        placeholder="sha256:…"
                        onChange={(event) => updateReview(key, { subjectDigest: event.target.value })}
                      />
                    </label>
                    {data.runtimeFingerprint && review.subjectDigest !== data.runtimeFingerprint && (
                      <button
                        type="button"
                        className="policy-btn--subtle"
                        disabled={busy}
                        onClick={() => updateReview(key, { subjectDigest: data.runtimeFingerprint ?? "" })}
                      >
                        현재 배포물 fingerprint 채우기
                      </button>
                    )}
                    <div className="policy-checks">
                      {modes.map((mode) => (
                        <label key={mode}>
                          <input
                            type="checkbox"
                            checked={review.approvedModes.includes(mode)}
                            onChange={(event) =>
                              updateReview(key, {
                                approvedModes: event.target.checked
                                  ? [...review.approvedModes, mode]
                                  : review.approvedModes.filter((value) => value !== mode),
                              })
                            }
                          />
                          {modeLabel[mode]} 용도 승인
                        </label>
                      ))}
                    </div>
                    <label>
                      검토 유효기한 (UTC, 비우면 별도 만료 없음)
                      <input
                        type="datetime-local"
                        value={review.validUntil?.slice(0, 16) ?? ""}
                        onChange={(event) =>
                          updateReview(key, { validUntil: event.target.value ? new Date(`${event.target.value}:00Z`).toISOString() : null })
                        }
                      />
                    </label>
                  </fieldset>
                </details>
              );
            })}
            <p>자산·AI는 검토 상태를 승인으로 바꾸어도 제공자 연동이 준비되지 않으면 실행되지 않습니다. 배포물 교체나 승인 만료 시 다시 검토합니다.</p>
          </section>

          <section className="policy-card">
            <h2>검토 후 적용</h2>
            <div className="policy-reason-templates" role="group" aria-label="빠른 변경 사유 템플릿">
              <span className="policy-reason-templates__label">빠른 사유 선택:</span>
              {quickReasonTemplates.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  className="policy-chip-btn"
                  disabled={busy}
                  onClick={() => {
                    setReason(tpl);
                    setImpact(null);
                  }}
                >
                  {tpl}
                </button>
              ))}
            </div>
            <label>
              변경 사유 (5자 이상)
              <textarea
                rows={2}
                maxLength={500}
                placeholder="예: 무료 운영 한도 정기 점검 및 팀 워크스페이스 설정 확인"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setImpact(null);
                }}
              />
            </label>
            <div className="policy-action-row">
              <button
                type="button"
                disabled={busy}
                title="단축키: Alt+P"
                onClick={() => {
                  void prepare();
                }}
              >
                변경 영향 미리보기
              </button>
              <span className="policy-shortcut-hint">
                단축키 <kbd>Alt</kbd>+<kbd>P</kbd> · 사유 {reason.trim().length}/5자 이상 {isReasonValid ? "충족" : "필요"}
              </span>
            </div>
            {impact && (
              <div className="policy-impact">
                <h3>적용될 변경</h3>
                <ul>
                  {impact.changes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {impact.blockedReasons.length > 0 && (
                  <div role="alert" className="policy-alert">
                    {impact.blockedReasons.join(" ")}
                  </div>
                )}
                <p>
                  팀 기능:{" "}
                  {impact.effective.features["team-workspace"].enabled
                    ? "사용 가능"
                    : impact.effective.features["team-workspace"].reason}
                </p>
                <button
                  type="button"
                  disabled={busy || impact.blockedReasons.length > 0 || !isReasonValid}
                  onClick={() => {
                    void apply();
                  }}
                >
                  확인한 정책 적용
                </button>
              </div>
            )}
          </section>

          <section className="policy-card">
            <h2>최근 변경 이력</h2>
            {data.audit.length === 0 ? (
              <p>아직 변경 이력이 없습니다.</p>
            ) : (
              <ol>
                {data.audit.map((entry) => (
                  <li key={entry.revision}>
                    <strong>revision {entry.revision}</strong> · {entry.reason}
                    <br />
                    <small>
                      {entry.occurredAt} · {entry.actorUserId}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      {!busy && !data && <p>이 관리 화면과 API는 같은 출처에서 제공되어야 합니다. 기존 서비스 관리자 계정의 로그인 세션이 필요합니다.</p>}
    </section>
  );
}

