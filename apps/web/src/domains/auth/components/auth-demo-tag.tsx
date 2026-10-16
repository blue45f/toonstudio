import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

// 실제 OAuth 미설정 시 데모 폴백임을 버튼에 명확히 표시(정직성).
export function DemoTag({ dark }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide",
        dark
          ? "bg-[oklch(0.2_0.02_60/0.16)] text-on-accent"
          : "border border-line bg-raised text-fg-3"
      )}
    >
      {translateCurrentStaticSourceText(
        "domains.auth.components.auth.modal",
        "ko",
        "데모"
      )}
    </span>
  );
}
