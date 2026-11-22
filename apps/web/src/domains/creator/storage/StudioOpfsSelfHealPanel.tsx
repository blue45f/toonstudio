import { HardDrive, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import type { StudioOpfsFileSystem } from "../studio-opfs-filesystem";
import {
  STUDIO_OPFS_SELF_HEAL_ROOT_NAME,
  createOpfsSnapshotTimeMachine,
  executeOrphanTempCleanup,
  formatStorageBytes,
  inspectBrowserStorageQuota,
  planOrphanTempCleanup,
  type StudioManuscriptSnapshotRecord,
  type StudioOpfsFileEntry,
  type StudioOpfsSelfHealReport,
  type StudioStorageQuotaEstimatorLike,
  type StudioStorageQuotaGrade,
} from "./studio-opfs-self-heal-engine";

export interface StudioOpfsSelfHealPanelProps {
  readonly projectId: string;
  /** 테스트·호스트 주입용 StorageManager 추정기(미지정 시 브라우저 navigator.storage 사용). */
  readonly storageEstimator?: StudioStorageQuotaEstimatorLike | null;
  /** 테스트·호스트 주입용 OPFS 파일시스템(미지정 시 브라우저 OPFS 자동 선택). */
  readonly fileSystem?: StudioOpfsFileSystem | null;
  /** 진행 중 원고 파일 경로(정리 계획에서 절대 보호). */
  readonly activeManuscriptPaths?: readonly string[];
  /** 추가 검사 대상 파일 메타데이터(선택). */
  readonly extraFiles?: readonly StudioOpfsFileEntry[];
  /** 검증된 직전 정상 스냅샷 복구 콜백(미지정 시 검증 JSON 파일 다운로드). */
  readonly onRestoreSnapshot?: (snapshot: StudioManuscriptSnapshotRecord) => void | Promise<void>;
}

const QUOTA_BADGE_META: Readonly<Record<StudioStorageQuotaGrade, { readonly label: string; readonly className: string }>> = {
  safe: {
    label: "안전",
    className: "border-good/35 bg-good-soft/30 text-good",
  },
  warning: {
    label: "주의 (75%+)",
    className: "border-warn/40 bg-warn/15 text-warn",
  },
  critical: {
    label: "위험 (90%+)",
    className: "border-bad/40 bg-bad/15 text-bad",
  },
  unavailable: {
    label: "확인 불가",
    className: "border-line bg-card text-fg-2",
  },
};

export function StudioOpfsSelfHealPanel(props: StudioOpfsSelfHealPanelProps) {
  return <OpfsSelfHealPanelSession key={props.projectId} {...props} />;
}

function OpfsSelfHealPanelSession({
  projectId,
  storageEstimator,
  fileSystem,
  activeManuscriptPaths,
  extraFiles,
  onRestoreSnapshot,
}: StudioOpfsSelfHealPanelProps) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<StudioOpfsSelfHealReport | null>(null);
  const [opfsUnavailable, setOpfsUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeFsRef = useRef<StudioOpfsFileSystem | null>(null);
  const generationRef = useRef(0);

  useLayoutEffect(() => () => {
    generationRef.current += 1;
  }, [projectId]);

  async function resolveOpfsFileSystem(): Promise<StudioOpfsFileSystem | null> {
    if (fileSystem) return fileSystem;
    if (fileSystem === null) return null;
    const { selectStudioOpfsFileSystem } = await import("../studio-opfs-filesystem");
    const selection = await selectStudioOpfsFileSystem(
      globalThis as Parameters<typeof selectStudioOpfsFileSystem>[0],
      { rootName: STUDIO_OPFS_SELF_HEAL_ROOT_NAME },
    );
    return selection.kind === "opfs" ? selection.fs : null;
  }

  async function runDiagnosis(): Promise<void> {
    const token = ++generationRef.current;
    setBusy(true);
    setErrorMessage(null);
    setNotice("로컬 저장 용량과 스냅샷 무결성을 점검하고 있습니다.");
    try {
      const fs = await resolveOpfsFileSystem();
      if (token !== generationRef.current) return;
      activeFsRef.current = fs;

      if (!fs) {
        const quota = await inspectBrowserStorageQuota(storageEstimator);
        if (token !== generationRef.current) return;
        const cleanupPlan = planOrphanTempCleanup(extraFiles ?? [], {
          activeManuscriptPaths,
          activeProjectIds: [projectId],
        });
        setOpfsUnavailable(true);
        setReport({
          projectId,
          diagnosedAtMs: Date.now(),
          quota,
          timeline: {
            projectId,
            recoveryStatus: "empty",
            selfHealed: false,
            latestEntry: null,
            lastKnownGood: null,
            lastKnownGoodPath: null,
            verifiedCount: 0,
            corruptedCount: 0,
            entries: [],
            summaryKo: "이 브라우저 환경에서는 로컬 원고 파일시스템(OPFS)을 열 수 없어 용량만 진단했습니다.",
          },
          cleanupPlan,
        });
        setNotice(`${quota.summaryKo} · OPFS 미지원 환경이므로 프로젝트 파일 백업을 유지해 주세요.`);
        return;
      }

      setOpfsUnavailable(false);
      const timeMachine = createOpfsSnapshotTimeMachine({ fs, projectId });
      const nextReport = await timeMachine.runSelfHealDiagnosis({
        estimator: storageEstimator,
        extraFiles,
        activeManuscriptPaths,
      });
      if (token !== generationRef.current) return;
      setReport(nextReport);
      setNotice(`${nextReport.quota.summaryKo} · ${nextReport.timeline.summaryKo}`);
    } catch (cause) {
      if (token !== generationRef.current) return;
      setErrorMessage(cause instanceof Error ? cause.message : "로컬 저장소 진단을 완료하지 못했습니다.");
      setNotice("");
    } finally {
      if (token === generationRef.current) setBusy(false);
    }
  }

  async function handleCleanupOrphans(): Promise<void> {
    if (!report || report.cleanupPlan.deletable.length === 0) return;
    const fs = activeFsRef.current;
    if (!fs) {
      setErrorMessage("로컬 원고 파일시스템에 연결되지 않아 정리를 실행할 수 없습니다.");
      return;
    }
    const token = ++generationRef.current;
    setBusy(true);
    setErrorMessage(null);
    setNotice("고아 임시 파일만 선별해 정리하고 있습니다. 최신 스냅샷과 진행 중 원고는 보호됩니다.");
    try {
      const execution = await executeOrphanTempCleanup(report.cleanupPlan, (path) => fs.remove(path));
      if (token !== generationRef.current) return;
      const timeMachine = createOpfsSnapshotTimeMachine({ fs, projectId });
      const refreshed = await timeMachine.runSelfHealDiagnosis({
        estimator: storageEstimator,
        activeManuscriptPaths,
      });
      if (token !== generationRef.current) return;
      setReport(refreshed);
      setNotice(execution.summaryKo);
    } catch (cause) {
      if (token !== generationRef.current) return;
      setErrorMessage(cause instanceof Error ? cause.message : "고아 임시 파일 정리 중 오류가 발생했습니다.");
    } finally {
      if (token === generationRef.current) setBusy(false);
    }
  }

  async function handleRecoverLastKnownGood(): Promise<void> {
    const target = report?.timeline.lastKnownGood;
    if (!target) return;
    const token = ++generationRef.current;
    setBusy(true);
    setErrorMessage(null);
    try {
      if (onRestoreSnapshot) {
        await onRestoreSnapshot(target);
        if (token !== generationRef.current) return;
        setNotice(`검증된 스냅샷 #${target.revision} (${target.label}) 복구 요청을 전달했습니다.`);
        return;
      }
      const { downloadBlob } = await import("../export/studio-export");
      if (token !== generationRef.current) return;
      const serialized = JSON.stringify(target, null, 2);
      downloadBlob(
        new Blob([serialized], { type: "application/json" }),
        `toonstudio-verified-snapshot-r${target.revision}.json`,
      );
      setNotice(`검증된 스냅샷 #${target.revision} (SHA-256 ${target.sha256.slice(0, 12)}) 백업 파일을 내려받았습니다.`);
    } catch (cause) {
      if (token !== generationRef.current) return;
      setErrorMessage(cause instanceof Error ? cause.message : "직전 정상 스냅샷 복구에 실패했습니다.");
    } finally {
      if (token === generationRef.current) setBusy(false);
    }
  }

  const quotaBadge = report ? QUOTA_BADGE_META[report.quota.grade] : null;
  const canCleanup = Boolean(report && !opfsUnavailable && report.cleanupPlan.deletable.length > 0);
  const canRecover = Boolean(report?.timeline.lastKnownGood);

  return (
    <section
      aria-label="로컬 원고 자가 치유 및 스냅샷 타임머신"
      data-testid="studio-opfs-self-heal-panel"
      className="mt-3 space-y-3 rounded-xl border border-line bg-panel p-3 text-fg"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>로컬 원고 자가 치유 · 스냅샷 타임머신</span>
          </h4>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            기기 잔여 용량(75% 주의 · 90% 위험)을 진단하고, 최신 스냅샷과 진행 중 원고는 보호한 채 오래된 고아 임시 파일만 정리하며, 손상 시 직전 정상 스냅샷(SHA-256 검증)을 자동 선출합니다.
          </p>
        </div>
        {quotaBadge ? (
          <span
            data-testid="self-heal-quota-grade"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${quotaBadge.className}`}
          >
            <HardDrive className="size-3.5" aria-hidden="true" />
            <span>용량 {quotaBadge.label}</span>
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runDiagnosis()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft/20 px-3 text-xs font-semibold text-fg hover:bg-accent-soft/35 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>저장소·무결성 진단</span>
        </button>

        <button
          type="button"
          disabled={busy || !canCleanup}
          onClick={() => void handleCleanupOrphans()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:border-accent/45 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          <span>
            고아 임시 파일 정리
            {report ? ` (${report.cleanupPlan.deletable.length}건)` : ""}
          </span>
        </button>

        <button
          type="button"
          disabled={busy || !canRecover}
          onClick={() => void handleRecoverLastKnownGood()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg hover:border-accent/45 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          <span>직전 정상 스냅샷 복구</span>
        </button>
      </div>

      {notice ? (
        <p role="status" className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
          {notice}
        </p>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="rounded-lg border border-bad/35 bg-bad/10 px-3 py-2 text-xs font-medium text-bad">
          {errorMessage}
        </p>
      ) : null}

      {report ? (
        <div className="space-y-2.5 border-t border-line pt-2.5 text-xs">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-card/50 p-2.5">
              <p className="font-semibold text-fg">저장 공간 진단</p>
              <p className="mt-0.5 text-fg-2">{report.quota.summaryKo}</p>
              <p className="mt-0.5 text-fg-3">{report.quota.actionHintKo}</p>
            </div>
            <div className="rounded-lg border border-line bg-card/50 p-2.5">
              <p className="font-semibold text-fg">고아 임시 파일 정리 계획</p>
              <p className="mt-0.5 text-fg-2">{report.cleanupPlan.dryRunSummaryKo}</p>
              <p className="mt-0.5 text-fg-3">
                보호 항목 {report.cleanupPlan.protectedItems.length}건 ({formatStorageBytes(report.cleanupPlan.protectedBytes)}) · 보류 {report.cleanupPlan.deferredItems.length}건
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card/40 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <p className="font-semibold text-fg">스냅샷 무결성 타임라인 (SHA-256)</p>
              <span className="text-fg-3 tabular-nums">
                정상 {report.timeline.verifiedCount}건 · 손상 {report.timeline.corruptedCount}건
              </span>
            </div>
            <p className="mt-0.5 text-fg-2">{report.timeline.summaryKo}</p>

            {report.timeline.entries.length > 0 ? (
              <ol className="mt-2 space-y-1.5" aria-label="스냅샷 무결성 타임라인 목록">
                {report.timeline.entries.slice(0, 6).map((entry) => (
                  <li
                    key={`${entry.snapshotId}-${entry.revision}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line/70 bg-panel px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-fg">
                        #{entry.revision >= 0 ? entry.revision : "?"} · {entry.label}
                      </p>
                      <p className="text-[11px] text-fg-3 tabular-nums">
                        SHA-256 {entry.sha256Prefix} · {formatStorageBytes(entry.byteLength)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        entry.isRecoveryTarget && report.timeline.selfHealed
                          ? "border-accent/45 bg-accent-soft/25 text-accent"
                          : entry.integrity.valid
                            ? "border-good/35 bg-good-soft/25 text-good"
                            : "border-bad/40 bg-bad/10 text-bad"
                      }`}
                    >
                      {entry.isRecoveryTarget && report.timeline.selfHealed
                        ? "자동 복구 대상"
                        : entry.integrity.valid
                          ? "무결성 정상"
                          : "손상 격리"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
