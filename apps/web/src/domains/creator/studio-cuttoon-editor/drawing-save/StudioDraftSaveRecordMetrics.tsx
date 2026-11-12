import { Loader2 } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { formatStudioDraftSaveTime } from "../../studio-draft-save-center-model";

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
      <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">{bt("기기 체크포인트", "Device checkpoints")}</dt>
      <dd className="mt-1 text-sm font-black">{checkpointCount}{bt("개", "")}</dd>
    </div>
    <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
      <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">{bt("서버 저장 번호", "Server save revision")}</dt>
      <dd className="mt-1 text-sm font-black">{serverRevision ?? "—"}</dd>
    </div>
    <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
      <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">{bt("서버 버전", "Server versions")}</dt>
      <dd className="mt-1 flex items-center justify-center gap-1 text-sm font-black">
        {serverRevisionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label={loadingLabel} /> : `${serverRevisionCount}${bt("개", "")}`}
      </dd>
    </div>
    <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
      <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">{bt("마지막 서버 확인", "Last server confirmation")}</dt>
      <dd className="mt-1 text-xs font-black">{lastServerSaveAt === null ? "—" : formatStudioDraftSaveTime(lastServerSaveAt)}</dd>
    </div>
  </dl>;
}
