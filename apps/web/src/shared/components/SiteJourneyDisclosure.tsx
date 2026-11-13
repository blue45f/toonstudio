import { ChevronDown, Compass } from "lucide-react";
import type { ReactNode } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import "./site-journey-disclosure.css";

/** 페이지의 주 작업을 마친 뒤에만 보조 여정을 펼친다. */
export function SiteJourneyDisclosure({ children }: { readonly children: ReactNode }) {
  const bt = useBilingual("site-journey-disclosure");
  return <details className="site-journey-disclosure">
    <summary><Compass size={18} aria-hidden="true" /><span>{bt("다음 작업 찾기", "Find your next task")}</span><ChevronDown size={18} aria-hidden="true" /></summary>
    {children}
  </details>;
}
