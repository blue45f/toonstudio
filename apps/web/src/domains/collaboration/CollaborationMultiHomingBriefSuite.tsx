/**
 * Asana (멀티호밍 단일 과업 다중 보드 연결) + Notion (동기화 브리프 블록 & 최소 권한 원고 격리)
 * 역공학 내재화 컴포넌트 (`CollaborationPostPage.tsx` 탑재).
 */

import { useMemo, useState } from "react";
import { CheckCircle2, GitMerge, Lock, Sparkles } from "lucide-react";

import {
  evaluateMultiHomingBriefSync,
  type MultiHomedBoardId,
} from "./collaboration-multi-homing-brief-model";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export function CollaborationMultiHomingBriefSuite({
  postId,
  roleKey,
}: {
  readonly postId: string;
  readonly roleKey: string;
}) {
  const bt = useBilingual("CollaborationMultiHomingBriefSuite");
  const [syncedBoards, setSyncedBoards] = useState<Record<MultiHomedBoardId, boolean>>({
    "board-public-gig": true,
    "board-recruiting-slot": true,
    "board-production-stage": true,
    "board-studio-layer-seat": true,
  });
  const [includeCharacterSheetBlock, setIncludeCharacterSheetBlock] = useState<boolean>(true);
  const [includeEpisodeCutRangeBlock, setIncludeEpisodeCutRangeBlock] = useState<boolean>(true);
  const [enforcePrivateManuscriptIsolation, setEnforcePrivateManuscriptIsolation] =
    useState<boolean>(true);

  const evaluation = useMemo(
    () =>
      evaluateMultiHomingBriefSync({
        postId,
        roleKey,
        syncedBoards,
        includeCharacterSheetBlock,
        includeEpisodeCutRangeBlock,
        enforcePrivateManuscriptIsolation,
      }),
    [
      postId,
      roleKey,
      syncedBoards,
      includeCharacterSheetBlock,
      includeEpisodeCutRangeBlock,
      enforcePrivateManuscriptIsolation,
    ]
  );

  function toggleBoard(id: MultiHomedBoardId) {
    setSyncedBoards((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  return (
    <section
      data-testid="collaboration-multi-homing-brief-suite"
      aria-label={bt(
        "Asana·Notion 역공학 멀티호밍 과업 브리프 및 최소 권한 원고 격리",
        "Multi-Homing Task Brief & Least-Privilege Manuscript Isolation"
      )}
      className="rounded-2xl border border-line bg-panel p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-bold text-accent">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {bt("Asana Multi-Homing · Notion Synced Block 내재화", "Asana Multi-Homing · Notion Synced Block")}
            </span>
            <span
              data-testid="multi-homing-score-badge"
              className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-2.5 py-0.5 text-xs font-semibold text-fg-2"
            >
              <GitMerge className="size-3.5 text-good" aria-hidden="true" />
              {bt(
                `멀티호밍 보드 ${evaluation.syncedBoardCount}/4 · 준비도 ${evaluation.readinessScore}점`,
                `Multi-Homed ${evaluation.syncedBoardCount}/4 · Readiness ${evaluation.readinessScore}/100`
              )}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-bold text-fg">
            {bt(
              "공고 ↔ 채용 ↔ 제작 보드 ↔ 스튜디오 좌석 멀티호밍(Multi-Homing) 브리프 연결",
              "Gig ↔ Recruiting ↔ Production ↔ Studio Seat Multi-Homing Brief Sync"
            )}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(
              "공고에서 합의된 범위·단가·마감 브리프 블록을 복제 없이 4개 워크스페이스에 동시 귀속(Multi-Home)하되, 지원·합류 시 비공개 전체 원고 대신 담당 레이어 좌석만 최소 권한으로 개방합니다.",
              "Multi-homes the agreed gig brief across all 4 workspaces without duplicating cards, while isolating private manuscripts to the assigned layer seat only."
            )}
          </p>
        </div>
      </div>

      {/* 4대 멀티호밍 보드 카드 */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {evaluation.boards.map((board) => (
          <div
            key={board.id}
            data-testid={`multi-homing-card-${board.id}`}
            className={`flex flex-col justify-between rounded-xl border p-3.5 text-xs ${
              board.synced
                ? "border-accent/45 bg-accent/5"
                : "border-line bg-canvas/50 opacity-75"
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-fg">{bt(board.labelKo, board.labelEn)}</span>
                <button
                  type="button"
                  aria-pressed={board.synced}
                  data-testid={`toggle-multi-home-${board.id}`}
                  onClick={() => toggleBoard(board.id)}
                  className={`rounded-lg border px-2 py-0.5 text-[0.6875rem] font-bold ${
                    board.synced
                      ? "border-good/40 bg-good/10 text-good"
                      : "border-line bg-panel text-fg-3"
                  }`}
                >
                  {board.synced ? bt("동기화 켜짐", "Synced") : bt("동기화 끔", "Off")}
                </button>
              </div>
              <p className="mt-1.5 text-[0.6875rem] leading-4 text-fg-2">
                <Lock className="mr-1 inline size-3 text-accent" aria-hidden="true" />
                {bt(board.permissionBoundaryKo, board.permissionBoundaryEn)}
              </p>
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2">
              <span className="font-mono text-[0.6875rem] text-fg-3">{board.routePath}</span>
              <Link
                href={board.routePath}
                className="text-[0.6875rem] font-bold text-accent hover:underline"
              >
                {bt("보드 열기 →", "Open board →")}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Notion 스타일 동기화 브리프 블록 옵션 */}
      <div className="mt-4 flex flex-wrap gap-3 rounded-xl border border-line bg-raised/40 p-3 text-xs text-fg-2">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={includeCharacterSheetBlock}
            onChange={(event) => setIncludeCharacterSheetBlock(event.target.checked)}
          />
          <span>{bt("캐릭터 설정·브러시 동기화 블록 포함", "Include Synced Character/Brush Block")}</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={includeEpisodeCutRangeBlock}
            onChange={(event) => setIncludeEpisodeCutRangeBlock(event.target.checked)}
          />
          <span>{bt("회차 할당 컷 번호 범위 블록 포함", "Include Assigned Cut-Range Block")}</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            data-testid="toggle-manuscript-isolation"
            checked={enforcePrivateManuscriptIsolation}
            onChange={(event) => setEnforcePrivateManuscriptIsolation(event.target.checked)}
          />
          <span>{bt("비공개 원고 전체 열람 차단 (담당 레이어만 개방)", "Enforce Layer-Only Manuscript Isolation")}</span>
        </label>
      </div>

      <div
        aria-live="polite"
        data-testid="multi-homing-status-banner"
        className={`mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
          evaluation.isolationSafe
            ? "border-good/40 bg-good/10 text-fg"
            : "border-warn/40 bg-warn/10 text-fg"
        }`}
      >
        <CheckCircle2 className="size-4 shrink-0 text-good" aria-hidden="true" />
        <span>{bt(evaluation.statusSummaryKo, evaluation.statusSummaryEn)}</span>
      </div>
    </section>
  );
}
