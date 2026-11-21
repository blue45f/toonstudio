import { CheckCircle2, CloudOff, Loader2, Save, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import {
  DRAFT_SAVE_TONE_CLASS,
  formatStudioDraftSaveTime,
  type StudioDraftSaveStatusSection,
  type StudioDraftSaveTone,
} from "../../studio-draft-save-center-model";

export function DraftSaveStatusIcon({ tone, className }: { readonly tone: StudioDraftSaveTone; readonly className?: string }) {
  if (tone === "danger") return <ShieldAlert aria-hidden className={className} />;
  if (tone === "warning") return <CloudOff aria-hidden className={className} />;
  if (tone === "progress") return <Loader2 aria-hidden className={cn(className, "animate-spin motion-reduce:animate-none")} />;
  if (tone === "success") return <CheckCircle2 aria-hidden className={className} />;
  return <Save aria-hidden className={className} />;
}

export function DraftSaveStatusCard({ icon, label, section, footer }: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly section: StudioDraftSaveStatusSection;
  readonly footer: string;
}) {
  return (
    <section className={cn("rounded-xl border p-3", DRAFT_SAVE_TONE_CLASS[section.tone])}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold opacity-75">{label}</p>
          <p className="mt-0.5 text-sm font-semibold leading-snug">{section.title}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed opacity-90">{section.detail}</p>
          <p className="mt-2 text-xs font-semibold opacity-80">{footer}</p>
        </div>
      </div>
    </section>
  );
}

/** 저장 판정을 만들지 않고 기존 저장·버전 기록의 표시만 담당한다. */
export function StudioDraftSaveRecordMetrics({ checkpointCount, serverRevision, serverRevisionLoading, serverRevisionCount, lastServerSaveAt, loadingLabel }: {
  readonly checkpointCount: number;
  readonly serverRevision: number | null;
  readonly serverRevisionLoading: boolean;
  readonly serverRevisionCount: number;
  readonly lastServerSaveAt: number | null;
  readonly loadingLabel: string;
}) {
  const bt = useBilingual("StudioDraftSaveCenter");
  return <dl data-studio-save-record-metrics="true" className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
    <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
      <dt className="text-xs font-medium text-fg-3">{bt("기기 체크포인트", "Device checkpoints")}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{checkpointCount}{bt("개", "")}</dd>
    </div>
    <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
      <dt className="text-xs font-medium text-fg-3">{bt("서버 저장 번호", "Server save number")}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{serverRevision ?? "—"}</dd>
    </div>
    <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
      <dt className="text-xs font-medium text-fg-3">{bt("서버 버전", "Server versions")}</dt>
      <dd className="mt-1 flex items-center justify-center gap-1 text-sm font-semibold tabular-nums">
        {serverRevisionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label={loadingLabel} /> : `${serverRevisionCount}${bt("개", "")}`}
      </dd>
    </div>
    <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
      <dt className="text-xs font-medium text-fg-3">{bt("마지막 서버 확인", "Last server confirmation")}</dt>
      <dd className="mt-1 text-xs font-semibold tabular-nums">{lastServerSaveAt === null ? "—" : formatStudioDraftSaveTime(lastServerSaveAt)}</dd>
    </div>
  </dl>;
}
