import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { CREATOR_STORAGE_DETAIL_SEPARATOR } from "./studio-device-storage-copy";

/** 임의의 줄바꿈을 접지 않고 저장 안내 생산자가 분리한 기술 원인만 접는다. */
export function StudioDeviceStorageMessage({ message }: { readonly message: string }) {
  const bt = useBilingual("creator.deviceStorage");
  const separator = message.indexOf(CREATOR_STORAGE_DETAIL_SEPARATOR);
  const summary = separator < 0 ? message : message.slice(0, separator);
  const detail = separator < 0 ? null : message.slice(separator + CREATOR_STORAGE_DETAIL_SEPARATOR.length);
  return <><span className="whitespace-pre-line">{summary}</span>{detail ? <details className="mt-1.5"><summary className="min-h-11 cursor-pointer py-3 font-medium">{bt("문제 세부 정보", "Problem details")}</summary><pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs">{detail}</pre></details> : null}</>;
}

export function StudioVrmStorageNotice({ message, authority }: { readonly message: string; readonly authority: string }) {
  const warning = authority === "memory" || authority === "read-error";
  return <div className={`rounded-lg border px-2.5 py-2 text-[0.65rem] leading-relaxed ${warning ? "border-warn/35 bg-warn/10 text-warn" : "border-line/55 bg-card/35 text-fg-3"}`} role="status" aria-live="polite" data-studio-vrm-creative-authority={authority}><StudioDeviceStorageMessage message={message} /></div>;
}
