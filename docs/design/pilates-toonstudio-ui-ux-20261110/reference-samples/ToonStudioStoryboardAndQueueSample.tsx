import React, { useState } from 'react';

/**
 * [독립 참조 컴포넌트] ToonStudio 스토리보드 카드·패널 편집·로컬 생성 큐(무과금)·내보내기 사전 점검 및 복구 샘플
 * - 운영 라우트에 직접 연결하지 않는 디자인·상호작용 참조용 샘플 컴포넌트입니다.
 * - 실제 확인된 ToonStudio 모델:
 *   1) studio-product-ia.ts (STUDIO_FORBIDDEN_DEFAULT_UI_TERMS 금지 용어 배제, STUDIO_USER_WORK_STATES 4종)
 *   2) studio-storyboard-planner.ts (StudioStoryBeatKind, StudioShotSize, reserveDialogueAreaRatio, scrollGapAfterPx)
 *   3) studio-ai-job.ts (StudioAiJobStatus 9종, privacy: 'local', cost: 'free', 단조 증가 progress 0..1)
 *   4) studio-export-preflight.ts (webtoon-platform 800px, 12800px, 18px, rights, ai-disclosure)
 *   5) studio-save-recovery-ux.ts (SaveRecoveryKind 7단계 우선순위, 거짓 '저장됨' 표시 금지)
 */

export type StudioAiJobStatus =
  | 'draft'
  | 'awaiting-confirmation'
  | 'queued'
  | 'running'
  | 'preview-ready'
  | 'approved'
  | 'applied'
  | 'failed'
  | 'cancelled';

export type SaveRecoveryKind =
  | 'readonly'
  | 'failed'
  | 'offline'
  | 'reconnecting'
  | 'server-unavailable'
  | 'saving'
  | 'saved';

export type StudioShotSize = 'extreme-wide' | 'wide' | 'medium' | 'close-up' | 'extreme-close-up';
export type StudioStoryBeatKind = 'setup' | 'dialogue' | 'action' | 'reaction' | 'reveal' | 'transition';

export interface StoryboardShotCardItem {
  readonly shotId: string;
  readonly beatId: string;
  readonly episodeId: string;
  readonly sceneId: string;
  readonly order: number;
  readonly title: string;
  readonly beatKind: StudioStoryBeatKind;
  readonly shotSize: StudioShotSize;
  readonly camera: string;
  readonly dialogue: string;
  readonly reserveDialogueAreaRatio: number;
  readonly scrollGapAfterPx: number;
  readonly readinessScore: number;
  readonly priority: 'blocker' | 'attention' | 'ready';
  readonly jobStatus: StudioAiJobStatus;
  readonly jobProgress01: number;
  readonly jobErrorMessageKo?: string;
}

export interface PreflightFindingItem {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly messageKo: string;
  readonly suggestedActionKo: string;
}

const JOB_STATUS_LABELS_KO: Record<
  StudioAiJobStatus,
  { readonly labelKo: string; readonly requiresAttention: boolean }
> = {
  draft: { labelKo: '요청 준비', requiresAttention: false },
  'awaiting-confirmation': { labelKo: '확인 필요', requiresAttention: true },
  queued: { labelKo: '처리 대기', requiresAttention: false },
  running: { labelKo: '처리 중', requiresAttention: false },
  'preview-ready': { labelKo: '결과 확인', requiresAttention: true },
  approved: { labelKo: '적용 준비', requiresAttention: true },
  applied: { labelKo: '사본으로 적용됨', requiresAttention: false },
  failed: { labelKo: '다시 확인 필요', requiresAttention: true },
  cancelled: { labelKo: '취소됨', requiresAttention: false },
};

const SAVE_RECOVERY_LABELS_KO: Record<SaveRecoveryKind, string> = {
  readonly: '다른 탭에서 편집 중 · 이 탭은 읽기 전용입니다',
  failed: '확인할 내용이 있어요 · 이 기기에 저장하지 못했습니다',
  offline: '오프라인에서도 안전 · 이 기기에 저장됨',
  reconnecting: '연결을 다시 확인하는 중… (이 기기에 안전하게 보관됨)',
  'server-unavailable': '클라우드 연결 지연 · 이 기기에 안전하게 저장됨',
  saving: '저장 중…',
  saved: '저장됨',
};

export const ToonStudioStoryboardAndQueueSample: React.FC<{
  readonly initialShots: readonly StoryboardShotCardItem[];
  readonly saveRecoveryKind: SaveRecoveryKind;
  readonly preflightFindings: readonly PreflightFindingItem[];
  readonly conflictPaths?: readonly string[];
}> = ({ initialShots, saveRecoveryKind, preflightFindings, conflictPaths = [] }) => {
  const [shots, setShots] = useState<readonly StoryboardShotCardItem[]>(initialShots);
  const [selectedShotId, setSelectedShotId] = useState<string>(initialShots[0]?.shotId ?? '');
  const [filterPriority, setFilterPriority] = useState<'all' | 'blocker' | 'attention' | 'ready'>('all');

  const reorderEnabled = filterPriority === 'all';
  const visibleShots = shots.filter((s) => filterPriority === 'all' || s.priority === filterPriority);
  const selectedShot = shots.find((s) => s.shotId === selectedShotId) ?? shots[0] ?? null;

  const transitionLocalJob = (shotId: string, nextStatus: StudioAiJobStatus) => {
    setShots((current) =>
      current.map((shot) => {
        if (shot.shotId !== shotId) return shot;
        return {
          ...shot,
          jobStatus: nextStatus,
          jobProgress01:
            nextStatus === 'queued' || nextStatus === 'cancelled'
              ? 0
              : nextStatus === 'preview-ready' || nextStatus === 'approved' || nextStatus === 'applied'
                ? 1
                : shot.jobProgress01,
          jobErrorMessageKo: nextStatus === 'queued' ? undefined : shot.jobErrorMessageKo,
        };
      }),
    );
  };

  const blockingCount = preflightFindings.filter((f) => f.severity === 'error').length;

  return (
    <div
      style={{
        backgroundColor: '#090D16',
        color: '#F8FAFC',
        padding: 20,
        borderRadius: 16,
        fontFamily: 'Pretendard, sans-serif',
      }}
    >
      <header
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px',
          borderRadius: 10,
          marginBottom: 16,
          backgroundColor:
            saveRecoveryKind === 'failed'
              ? '#7F1D1D'
              : saveRecoveryKind === 'offline' || saveRecoveryKind === 'server-unavailable'
                ? '#78350F'
                : '#1E293B',
          border: '1px solid #334155',
          fontSize: 13,
        }}
      >
        <span>
          <strong>작업 상태:</strong> {SAVE_RECOVERY_LABELS_KO[saveRecoveryKind]}
        </span>
        <span style={{ fontSize: 12, color: '#CBD5E1' }}>
          {reorderEnabled
            ? '카드를 드래그하면 순서가 바뀝니다.'
            : '검색·필터 중에는 숨겨진 페이지를 건너뛰는 오배치를 막기 위해 재배열이 잠깁니다.'}
        </span>
      </header>

      {conflictPaths.length > 0 && (
        <aside
          role="alert"
          style={{
            backgroundColor: '#1E293B',
            border: '1px solid #F59E0B',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <strong>다른 화면에서 수정된 내용과 겹치는 항목이 {conflictPaths.length}건 있어요</strong>
          <p style={{ margin: '4px 0 8px', color: '#CBD5E1' }}>
            겹친 설정 항목: {conflictPaths.join(', ')} · 내 작업본을 유지하거나 사본 페이지로 함께 보관할 수 있습니다.
          </p>
        </aside>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'blocker', 'attention', 'ready'] as const).map((prio) => (
          <button
            key={prio}
            type="button"
            aria-pressed={filterPriority === prio}
            onClick={() => setFilterPriority(prio)}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #334155',
              backgroundColor: filterPriority === prio ? '#6366F1' : '#1E293B',
              color: '#F8FAFC',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {prio === 'all'
              ? '전체 페이지'
              : prio === 'blocker'
                ? '차단 이슈'
                : prio === 'attention'
                  ? '확인 필요'
                  : '준비 완료'}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {visibleShots.map((shot) => {
            const jobMeta = JOB_STATUS_LABELS_KO[shot.jobStatus];
            const isSelected = shot.shotId === selectedShot?.shotId;
            return (
              <article
                key={shot.shotId}
                onClick={() => setSelectedShotId(shot.shotId)}
                style={{
                  backgroundColor: '#1E293B',
                  border: isSelected ? '2px solid #6366F1' : '1px solid #334155',
                  borderRadius: 12,
                  padding: 12,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <strong>
                    #{shot.order + 1} · {shot.title}
                  </strong>
                  <span style={{ color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
                    준비도 {shot.readinessScore}%
                  </span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#CBD5E1' }}>
                  샷: {shot.shotSize} · 카메라: {shot.camera} · 여백 {shot.scrollGapAfterPx}px
                </p>
                <p
                  style={{
                    margin: '0 0 8px',
                    padding: 8,
                    borderRadius: 6,
                    backgroundColor: '#0F172A',
                    fontSize: 12,
                  }}
                >
                  {shot.dialogue || '(대사 없음)'}
                </p>

                <div
                  style={{
                    borderTop: '1px solid #334155',
                    paddingTop: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 11,
                  }}
                >
                  <span>
                    큐: <strong>{jobMeta.labelKo}</strong> ({Math.round(shot.jobProgress01 * 100)}%)
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(shot.jobStatus === 'failed' || shot.jobStatus === 'preview-ready') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          transitionLocalJob(shot.shotId, 'queued');
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: 'none',
                          backgroundColor: '#4F46E5',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                        }}
                      >
                        다시 시도(무과금)
                      </button>
                    )}
                    {(shot.jobStatus === 'queued' || shot.jobStatus === 'running') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          transitionLocalJob(shot.shotId, 'cancelled');
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: 'none',
                          backgroundColor: '#BE123C',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                        }}
                      >
                        취소
                      </button>
                    )}
                    {shot.jobStatus === 'preview-ready' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          transitionLocalJob(shot.shotId, 'approved');
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: 'none',
                          backgroundColor: '#059669',
                          color: '#FFFFFF',
                          cursor: 'pointer',
                        }}
                      >
                        승인
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {selectedShot && (
          <aside
            aria-label="선택한 컷 상세 편집"
            style={{
              backgroundColor: '#1E293B',
              border: '1px solid #334155',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>
              컷 #{selectedShot.order + 1} 패널 편집 ({selectedShot.episodeId})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div>
                <strong>비트 유형:</strong> {selectedShot.beatKind}
              </div>
              <div>
                <strong>샷 크기 / 카메라:</strong> {selectedShot.shotSize} / {selectedShot.camera}
              </div>
              <div>
                <strong>대사 영역 예약 비율:</strong> {Math.round(selectedShot.reserveDialogueAreaRatio * 100)}% (최대 42%)
              </div>
              <div>
                <strong>컷 뒤 스크롤 간격:</strong> {selectedShot.scrollGapAfterPx}px
              </div>
            </div>
          </aside>
        )}
      </div>

      <section
        aria-label="내보내기 사전 점검"
        style={{
          marginTop: 20,
          backgroundColor: '#1E293B',
          border: '1px solid #334155',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>
          배포 사전 점검 ({blockingCount > 0 ? '먼저 해결해야 할 항목이 있습니다.' : '내보낼 준비가 되었습니다.'})
        </h3>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {preflightFindings.map((item) => (
            <li
              key={item.code}
              style={{
                backgroundColor: '#0F172A',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>
                <strong>[{item.severity.toUpperCase()}]</strong> {item.messageKo}
              </span>
              <span style={{ color: '#94A3B8' }}>{item.suggestedActionKo}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={blockingCount > 0}
          style={{
            minHeight: 44,
            padding: '0 16px',
            borderRadius: 8,
            border: 'none',
            backgroundColor: blockingCount > 0 ? '#475569' : '#6366F1',
            color: '#FFFFFF',
            fontWeight: 600,
            cursor: blockingCount > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {blockingCount > 0 ? `차단 오류 ${blockingCount}건 해결 후 내보내기 가능` : '원고 내보내기 실행'}
        </button>
      </section>
    </div>
  );
};
