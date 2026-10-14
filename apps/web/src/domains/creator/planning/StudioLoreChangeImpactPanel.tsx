import { useState } from "react";

import {
  summarizeStudioLoreChangeImpacts,
  type StudioLoreChangeNotice,
  type StudioLoreImpactKind,
} from "./studio-lore-change-impact";

/**
 * 설정 변경 영향 목록 — 세계관 허브(StudioWorldLoreHub)에 꽂는 표면.
 *
 * 허브와 같은 무클래스 마크업 관례를 따른다. 설정 변경을 막지 않고,
 * 이름·규칙이 바뀐 설정을 참조하는 회차 줄거리·대사·다른 설정을 목록으로
 * 보여준다. 알림마다 확인 버튼을 눌러야 허브 배지에서 사라진다.
 */

export interface StudioLoreChangeImpactPanelProps {
  readonly notices: readonly StudioLoreChangeNotice[];
  readonly acknowledgedIds: readonly string[];
  readonly onAcknowledge: (noticeId: string) => void;
  readonly onAcknowledgeAll: () => void;
  /** 다른 설정 참조를 눌렀을 때 그 항목으로 이동합니다. */
  readonly onSelectEntry?: (entryId: string) => void;
  /** 회차 줄거리·대사 참조를 눌렀을 때 그 회차로 이동합니다. */
  readonly onSelectEpisode?: (episodeId: string) => void;
}

const IMPACT_KIND_LABELS: Readonly<Record<StudioLoreImpactKind, string>> = {
  "episode-synopsis": "회차 줄거리",
  dialogue: "대사",
  "lore-entry": "다른 설정",
};

const IMPACT_KIND_ORDER: readonly StudioLoreImpactKind[] = [
  "episode-synopsis",
  "dialogue",
  "lore-entry",
];

/**
 * 허브 배지. 미확인 영향 알림이 있을 때만 렌더링되고, 전부 확인할
 * 때까지 남는다(studio-lore-change-impact 의 집계가 근거).
 */
export function StudioLoreChangeImpactBadge({
  notices,
  acknowledgedIds,
  onClick,
}: {
  readonly notices: readonly StudioLoreChangeNotice[];
  readonly acknowledgedIds: readonly string[];
  readonly onClick?: () => void;
}) {
  const summary = summarizeStudioLoreChangeImpacts(notices, acknowledgedIds);
  if (summary.unacknowledgedCount === 0) return null;
  const label = `설정 변경 영향 ${summary.unacknowledgedCount}건 미확인`;
  if (!onClick) {
    return <span data-studio-lore-change-impact-badge="true">{label}</span>;
  }
  return (
    <button
      type="button"
      data-studio-lore-change-impact-badge="true"
      onClick={onClick}
      aria-label={`${label} — 영향 목록 열기`}
    >
      {label}
    </button>
  );
}

export function StudioLoreChangeImpactPanel({
  notices,
  acknowledgedIds,
  onAcknowledge,
  onAcknowledgeAll,
  onSelectEntry,
  onSelectEpisode,
}: StudioLoreChangeImpactPanelProps) {
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const acknowledged = new Set(acknowledgedIds);
  const summary = summarizeStudioLoreChangeImpacts(notices, acknowledgedIds);
  const pending = notices.filter((notice) => !acknowledged.has(notice.change.id));
  const done = notices.filter((notice) => acknowledged.has(notice.change.id));
  const visible = showAcknowledged ? [...pending, ...done] : pending;

  return (
    <section aria-label="설정 변경 영향" data-studio-lore-change-impact-panel="true">
      <h2>설정 변경 영향</h2>
      <p>
        {summary.unacknowledgedCount > 0
          ? `미확인 ${summary.unacknowledgedCount}건 · 줄거리 ${summary.impactedSynopsisCount} · 대사 ${summary.impactedDialogueCount} · 다른 설정 ${summary.impactedLoreEntryCount}`
          : "미확인 영향이 없어요."}{" "}
        설정을 바꿔도 작업이 막히지는 않아요. 대신 그 설정을 이미 쓴 곳을 모아 두니,
        한 번씩 눈으로 확인하고 넘기세요.
      </p>
      <div>
        {done.length > 0 && (
          <button type="button" onClick={() => setShowAcknowledged((value) => !value)}>
            {showAcknowledged ? "확인한 항목 숨기기" : `확인한 항목 ${done.length}건 보기`}
          </button>
        )}{" "}
        {pending.length > 0 && (
          <button type="button" onClick={onAcknowledgeAll}>
            전부 확인
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p>
          {notices.length === 0
            ? "아직 영향을 주는 설정 변경이 없어요. 설정의 이름이나 규칙이 바뀌면, 그 설정을 참조하는 줄거리·대사·다른 설정이 여기에 쌓입니다."
            : "미확인 영향이 없어요. 확인한 항목은 위 버튼으로 다시 볼 수 있어요."}
        </p>
      ) : (
        <ol aria-label="설정 변경 영향 알림">
          {visible.map((notice) => {
            const isDone = acknowledged.has(notice.change.id);
            return (
              <li key={notice.change.id}>
                <p>
                  {notice.change.severity === "error" ? "[삭제] " : ""}
                  {notice.change.summaryKo} (영향 {notice.impactCount}곳){" "}
                  {isDone ? (
                    <span>확인함</span>
                  ) : (
                    <button type="button" onClick={() => onAcknowledge(notice.change.id)}>
                      확인
                    </button>
                  )}
                </p>
                <ul>
                  {IMPACT_KIND_ORDER.flatMap((kind) =>
                    notice.impacts
                      .filter((impact) => impact.kind === kind)
                      .map((impact) => {
                        const onSelect =
                          impact.kind === "lore-entry"
                            ? onSelectEntry
                            : impact.kind === "episode-synopsis"
                              ? onSelectEpisode
                              : undefined;
                        const body = (
                          <>
                            [{IMPACT_KIND_LABELS[impact.kind]}] {impact.label}
                            {impact.detail ? ` · ${impact.detail}` : ""} — {impact.reasonKo}
                            {impact.excerpt ? (
                              <>
                                {" "}
                                <q>{impact.excerpt}</q>
                              </>
                            ) : null}
                          </>
                        );
                        return (
                          <li key={`${impact.kind}:${impact.refId}:${impact.detail}`}>
                            {onSelect ? (
                              <button type="button" onClick={() => onSelect(impact.refId)}>
                                {body}
                              </button>
                            ) : (
                              body
                            )}
                          </li>
                        );
                      }),
                  )}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
