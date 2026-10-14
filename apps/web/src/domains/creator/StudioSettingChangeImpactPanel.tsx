import { AlertTriangle, BellRing, Check, Clapperboard, Flag, Image, XCircle } from "lucide-react";
import { useState } from "react";

import {
  summarizeStudioSettingChangeImpacts,
  type StudioSettingChangeImpact,
  type StudioSettingChangeNotice,
  type StudioSettingImpactKind,
} from "./studio-setting-change-impact";

export interface StudioSettingChangeImpactPanelProps {
  readonly notices: readonly StudioSettingChangeNotice[];
  readonly acknowledgedIds: readonly string[];
  readonly onAcknowledge: (noticeId: string) => void;
  readonly onAcknowledgeAll: () => void;
  /** 회차 장면 참조를 눌렀을 때 해당 장면으로 이동합니다. */
  readonly onSelectScene?: (sceneId: string) => void;
}

const IMPACT_KIND_META: Readonly<
  Record<
    StudioSettingImpactKind,
    { readonly label: string; readonly icon: typeof Clapperboard }
  >
> = {
  episode: { label: "회차", icon: Clapperboard },
  asset: { label: "에셋", icon: Image },
  foreshadow: { label: "복선", icon: Flag },
};

const IMPACT_KIND_ORDER: readonly StudioSettingImpactKind[] = [
  "episode",
  "asset",
  "foreshadow",
];

/**
 * 개요 배지. 미확인 영향 알림이 있을 때만 렌더링되고, 전부 확인할 때까지 남는다.
 * 호스트의 개요 머리글에 그대로 꽂아 쓴다.
 */
export function StudioSettingChangeImpactBadge({
  notices,
  acknowledgedIds,
  onClick,
}: {
  readonly notices: readonly StudioSettingChangeNotice[];
  readonly acknowledgedIds: readonly string[];
  readonly onClick?: () => void;
}) {
  const summary = summarizeStudioSettingChangeImpacts(notices, acknowledgedIds);
  if (summary.unacknowledgedCount === 0) return null;
  const label = `설정 변경 영향 ${summary.unacknowledgedCount}건 미확인`;
  const className =
    "inline-flex min-h-7 items-center gap-1 rounded-full border border-warn/35 bg-warn/10 px-2 text-[0.62rem] font-semibold text-warn";
  if (!onClick) {
    return (
      <span data-studio-setting-change-impact-badge="true" className={className}>
        <BellRing size={11} aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-studio-setting-change-impact-badge="true"
      onClick={onClick}
      aria-label={`${label} — 영향 목록 열기`}
      className={`${className} transition-colors hover:bg-warn/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
    >
      <BellRing size={11} aria-hidden />
      {label}
    </button>
  );
}

function ImpactRow({
  impact,
  onSelectScene,
}: {
  readonly impact: StudioSettingChangeImpact;
  readonly onSelectScene?: (sceneId: string) => void;
}) {
  const meta = IMPACT_KIND_META[impact.kind];
  const Icon = meta.icon;
  const body = (
    <>
      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-raised px-1.5 py-0.5 text-[0.6rem] font-semibold text-fg-2">
        <Icon size={10} aria-hidden />
        {meta.label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-fg">
          {impact.label}
          {impact.detail && impact.detail !== impact.label ? (
            <span className="ml-1.5 font-normal text-fg-3">{impact.detail}</span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[0.65rem] leading-relaxed text-fg-3">
          {impact.reasonKo}
        </span>
      </span>
    </>
  );
  if (impact.kind === "episode" && onSelectScene) {
    return (
      <li>
        <button
          type="button"
          onClick={() => onSelectScene(impact.refId)}
          className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {body}
        </button>
      </li>
    );
  }
  return <li className="flex min-h-11 items-center gap-2 px-2 py-1.5">{body}</li>;
}

/**
 * 설정 변경 영향 목록 패널. 변경을 막지 않고 영향 받는 회차·에셋·복선을
 * 보여주며, 알림마다 확인 버튼을 눌러야 개요 배지에서 사라진다.
 */
export function StudioSettingChangeImpactPanel({
  notices,
  acknowledgedIds,
  onAcknowledge,
  onAcknowledgeAll,
  onSelectScene,
}: StudioSettingChangeImpactPanelProps) {
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const acknowledged = new Set(acknowledgedIds);
  const summary = summarizeStudioSettingChangeImpacts(notices, acknowledgedIds);
  const pending = notices.filter((notice) => !acknowledged.has(notice.change.id));
  const done = notices.filter((notice) => acknowledged.has(notice.change.id));
  const visible = showAcknowledged ? [...pending, ...done] : pending;

  return (
    <section
      aria-label="설정 변경 영향"
      data-studio-setting-change-impact-panel="true"
      className="flex min-h-0 flex-col"
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5">
        <h3 className="text-sm font-bold text-fg">설정 변경 영향</h3>
        {summary.unacknowledgedCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-warn/35 bg-warn/10 px-2 py-0.5 text-[0.62rem] font-semibold text-warn">
            <BellRing size={11} aria-hidden />
            미확인 {summary.unacknowledgedCount}건
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good/10 px-2 py-0.5 text-[0.62rem] font-semibold text-good">
            <Check size={11} aria-hidden />
            모두 확인함
          </span>
        )}
        <span className="text-[0.65rem] tabular-nums text-fg-3">
          회차 {summary.impactedEpisodeCount} · 에셋 {summary.impactedAssetCount} · 복선{" "}
          {summary.impactedForeshadowCount}
        </span>
        <span className="ml-auto flex gap-1.5">
          {done.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAcknowledged((value) => !value)}
              className="inline-flex min-h-9 items-center rounded-lg border border-line bg-card px-2.5 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {showAcknowledged ? "확인한 항목 숨기기" : `확인한 항목 ${done.length}건 보기`}
            </button>
          )}
          {pending.length > 0 && (
            <button
              type="button"
              onClick={onAcknowledgeAll}
              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Check size={12} aria-hidden />
              전부 확인
            </button>
          )}
        </span>
      </div>
      <p className="px-3 pb-2 text-[0.68rem] leading-relaxed text-fg-3 sm:px-5">
        설정을 바꿔도 작업이 막히지는 않아요. 대신 그 설정을 이미 쓴 회차·에셋·복선을 모아 두니,
        한 번씩 눈으로 확인하고 넘기세요.
      </p>

      {visible.length === 0 ? (
        <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-line px-4 text-center">
          <div>
            <Check size={21} className="mx-auto text-good" aria-hidden />
            <p className="mt-2 text-xs font-semibold text-fg-2">
              {notices.length === 0
                ? "아직 영향을 주는 설정 변경이 없어요"
                : "미확인 영향이 없어요"}
            </p>
            <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
              바이블의 사실·의상·외형·장소가 바뀌면 여기에 영향 목록이 쌓입니다.
            </p>
          </div>
        </div>
      ) : (
        <ol className="min-h-0 space-y-2 overflow-y-auto px-3 pb-3 sm:px-5" aria-label="설정 변경 영향 알림">
          {visible.map((notice) => {
            const isDone = acknowledged.has(notice.change.id);
            const SeverityIcon = notice.change.severity === "error" ? XCircle : AlertTriangle;
            return (
              <li
                key={notice.change.id}
                className={`rounded-lg border px-3 py-2.5 ${
                  isDone ? "border-line bg-card/40 opacity-70" : "border-warn/30 bg-warn/5"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityIcon
                    size={14}
                    aria-hidden
                    className={notice.change.severity === "error" ? "text-bad" : "text-warn"}
                  />
                  <p className="min-w-0 flex-1 text-xs font-semibold leading-relaxed text-fg">
                    {notice.change.summaryKo}
                    <span className="ml-1.5 font-normal tabular-nums text-fg-3">
                      영향 {notice.impactCount}곳
                    </span>
                  </p>
                  {isDone ? (
                    <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold text-good">
                      <Check size={12} aria-hidden />
                      확인함
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(notice.change.id)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent/50 bg-accent-soft px-2.5 text-[0.68rem] font-semibold text-accent transition-colors hover:bg-accent hover:text-on-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <Check size={12} aria-hidden />
                      확인
                    </button>
                  )}
                </div>
                <ul className="mt-1.5 space-y-0.5">
                  {IMPACT_KIND_ORDER.flatMap((kind) =>
                    notice.impacts
                      .filter((impact) => impact.kind === kind)
                      .map((impact) => (
                        <ImpactRow
                          key={`${impact.kind}:${impact.refId}:${impact.detail}`}
                          impact={impact}
                          onSelectScene={onSelectScene}
                        />
                      )),
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
