import { BellRing, Camera, Check, CheckCheck, History, Lightbulb, MapPin, Package } from "lucide-react";

import {
  getStudioBg3dPlaceSetLatestVersion,
  summarizeStudioBg3dPlaceSetImpacts,
  type StudioBg3dPlaceSetChange,
  type StudioBg3dPlaceSetImpactNotice,
  type StudioBg3dPlaceSetPackage,
} from "./studio-bg3d-place-set-package";

export interface StudioBg3dPlaceSetPackagePanelProps {
  readonly placeSet: StudioBg3dPlaceSetPackage;
  readonly notices: readonly StudioBg3dPlaceSetImpactNotice[];
  readonly acknowledgedIds: readonly string[];
  readonly onAcknowledge: (noticeId: string) => void;
  readonly onAcknowledgeAll: () => void;
  /** 현재 씬 상태가 정본과 다를 때만 주어진다. 누르면 새 정본으로 발행한다. */
  readonly onPublishCurrent?: () => void;
  /** 영향 알림의 사용처를 눌렀을 때 해당 회차·컷으로 이동한다. */
  readonly onSelectUsage?: (notice: StudioBg3dPlaceSetImpactNotice) => void;
}

function ChangeIcon({ change }: { readonly change: StudioBg3dPlaceSetChange }) {
  if (change.kind === "camera") return <Camera size={11} aria-hidden />;
  if (change.kind === "lighting") return <Lightbulb size={11} aria-hidden />;
  return <Package size={11} aria-hidden />;
}

/**
 * 세트 영향 배지. 미확인 알림이 있을 때만 렌더링되고, 전부 확인할 때까지 남는다.
 */
export function StudioBg3dPlaceSetImpactBadge({
  notices,
  acknowledgedIds,
  onClick,
}: {
  readonly notices: readonly StudioBg3dPlaceSetImpactNotice[];
  readonly acknowledgedIds: readonly string[];
  readonly onClick?: () => void;
}) {
  const summary = summarizeStudioBg3dPlaceSetImpacts(notices, acknowledgedIds);
  if (summary.unacknowledgedCount === 0) return null;
  const label = `세트 정본 변경 영향 ${summary.unacknowledgedCount}건 미확인`;
  const className =
    "inline-flex min-h-7 items-center gap-1 rounded-full border border-warn/35 bg-warn/10 px-2 text-[0.62rem] font-semibold text-warn";
  if (!onClick) {
    return (
      <span data-studio-bg3d-place-set-impact-badge="true" className={className}>
        <BellRing size={11} aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-studio-bg3d-place-set-impact-badge="true"
      onClick={onClick}
      aria-label={`${label} — 영향 목록 열기`}
      className={`${className} transition-colors hover:bg-warn/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <BellRing size={11} aria-hidden />
      {label}
    </button>
  );
}

/**
 * 장소 세트 패키지 패널: 현재 정본 버전·버전 이력·영향 알림을 한곳에 보여준다.
 * 세트를 열면 마지막 정본으로 시작하므로, 이 패널의 "현재 정본"이 곧 시작 상태다.
 */
export function StudioBg3dPlaceSetPackagePanel({
  placeSet,
  notices,
  acknowledgedIds,
  onAcknowledge,
  onAcknowledgeAll,
  onPublishCurrent,
  onSelectUsage,
}: StudioBg3dPlaceSetPackagePanelProps) {
  const latest = getStudioBg3dPlaceSetLatestVersion(placeSet);
  const summary = summarizeStudioBg3dPlaceSetImpacts(notices, acknowledgedIds);
  const acknowledged = new Set(acknowledgedIds);
  const versionsDescending = [...placeSet.versions].sort((a, b) => b.version - a.version);

  return (
    <section
      data-studio-bg3d-place-set-package="true"
      aria-label={`${placeSet.placeName} 세트 패키지`}
      className="flex flex-col gap-3"
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-sm font-semibold">
          <MapPin size={13} aria-hidden />
          {placeSet.placeName} 세트
        </span>
        {latest ? (
          <span
            data-studio-bg3d-place-set-latest="true"
            className="inline-flex min-h-7 items-center rounded-full border border-accent/35 bg-accent/10 px-2 text-[0.62rem] font-semibold text-accent"
          >
            현재 정본 v{latest.version} — 세트를 열면 이 상태로 시작합니다
          </span>
        ) : (
          <span className="text-xs text-muted">아직 등록된 정본이 없습니다</span>
        )}
        {onPublishCurrent ? (
          <button
            type="button"
            onClick={onPublishCurrent}
            className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line px-2 text-[0.62rem] font-semibold transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <History size={11} aria-hidden />
            현재 상태를 새 정본으로 발행
          </button>
        ) : null}
      </header>

      <div>
        <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold">
          <History size={11} aria-hidden />
          버전 이력
        </h3>
        {versionsDescending.length === 0 ? (
          <p className="text-xs text-muted">버전이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {versionsDescending.map((entry) => (
              <li
                key={entry.version}
                className="flex flex-wrap items-center gap-2 rounded-md border border-line px-2 py-1 text-xs"
              >
                <span className="font-semibold">v{entry.version}</span>
                <span className="text-muted">{entry.createdAt}</span>
                <span className="inline-flex items-center gap-1 text-muted">
                  <Package size={11} aria-hidden />
                  소품 {entry.state.props.length}개
                </span>
                {entry.note ? <span>{entry.note}</span> : null}
                {latest && entry.version === latest.version ? (
                  <span className="font-semibold text-accent">정본</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold">
          <BellRing size={11} aria-hidden />
          정본 변경 영향
          {summary.unacknowledgedCount > 0 ? (
            <span className="text-warn">미확인 {summary.unacknowledgedCount}건</span>
          ) : null}
        </h3>
        {notices.length === 0 ? (
          <p className="text-xs text-muted">
            옛 정본을 쓰는 회차·컷이 없습니다. 모든 사용처가 현재 정본과 같습니다.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {notices.map((notice) => {
                const isAcknowledged = acknowledged.has(notice.id);
                return (
                  <li
                    key={notice.id}
                    className="flex flex-col gap-1 rounded-md border border-line px-2 py-1 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!onSelectUsage}
                        onClick={() => onSelectUsage?.(notice)}
                        className="font-semibold underline-offset-2 hover:underline disabled:no-underline"
                      >
                        {notice.usage.episodeLabel}
                        {notice.usage.shotLabel ? ` · ${notice.usage.shotLabel}` : ""}
                      </button>
                      <span className="text-muted">
                        v{notice.fromVersion} → v{notice.toVersion}
                      </span>
                      {isAcknowledged ? (
                        <span className="text-muted">확인됨</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAcknowledge(notice.id)}
                          className="inline-flex min-h-7 items-center gap-1 rounded-full border border-line px-2 text-[0.62rem] font-semibold transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          <Check size={11} aria-hidden />
                          확인
                        </button>
                      )}
                    </div>
                    <span>{notice.message}</span>
                    {notice.changes.length > 0 ? (
                      <ul className="flex flex-col gap-0.5 text-muted">
                        {notice.changes.map((change) => (
                          <li
                            key={`${change.kind}:${change.nodeId ?? ""}:${change.label}`}
                            className="inline-flex items-center gap-1"
                          >
                            <ChangeIcon change={change} />
                            {change.label}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {summary.unacknowledgedCount > 0 ? (
              <button
                type="button"
                onClick={onAcknowledgeAll}
                className="mt-2 inline-flex min-h-7 items-center gap-1 rounded-full border border-line px-2 text-[0.62rem] font-semibold transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <CheckCheck size={11} aria-hidden />
                전부 확인
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
