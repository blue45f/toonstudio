import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioSaveSyncSignals } from "../use-studio-save-sync-signals";
import type { StudioSaveSyncSignalStore } from "../studio-save-sync-signals";

/** 마지막 실제 기기 receipt만 읽는다. 현재 저장 성공이나 서버 승인을 새로 추론하지 않는다. */
export function StudioDrawingClarityReceipt({ store }: { readonly store: StudioSaveSyncSignalStore }) {
  const bt = useBilingual("studio.drawingClarity"), receipt = useStudioSaveSyncSignals(store).lastReceipt;
  const candidate = receipt && receipt.savedAtMs > 0 ? new Date(receipt.savedAtMs) : null;
  const recorded = candidate && Number.isFinite(candidate.getTime()) ? candidate : null;
  return <p className="studio-drawing-clarity-receipt" data-studio-clarity-receipt="true">
    {recorded ? <><span>{bt("마지막 기기 저장", "Last saved on this device")}</span><span aria-hidden> · </span>
      <time dateTime={recorded.toISOString()}>{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(recorded)}</time></>
      : bt("아직 기기 저장 전", "Not saved on this device yet")}
  </p>;
}
