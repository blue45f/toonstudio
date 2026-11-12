import { Music2, Settings2 } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/** 설정과 음악은 본문 위를 가리지 않고 전체 메뉴의 같은 자리에서 찾는다. */
export function SiteMenuUtilities({ onOpenMusic, settingsActive = false }: {
  readonly onOpenMusic: () => void;
  readonly settingsActive?: boolean;
}) {
  const bt = useBilingual("site-menu-utilities");
  return <section className="site-menu-utilities" aria-label={bt("화면과 음악", "Display and music")}>
    <Link href="/settings" className="site-menu-utility" aria-current={settingsActive ? "page" : undefined}>
      <Settings2 size={20} aria-hidden="true" />
      <span><strong>{bt("화면·언어 설정", "Display and language")}</strong><small>{bt("테마, 언어와 사용 환경", "Theme, language and preferences")}</small></span>
    </Link>
    <button type="button" data-site-menu-ost="true" className="site-menu-utility" onClick={onOpenMusic}>
      <Music2 size={20} aria-hidden="true" />
      <span><strong>{bt("배경 음악", "Background music")}</strong><small>{bt("곡 선택과 재생 설정", "Tracks and playback settings")}</small></span>
    </button>
  </section>;
}
