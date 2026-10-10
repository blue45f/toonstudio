import { Sparkles } from "lucide-react";

import { FORTUNE_TAB_META, type FortuneTab } from "./fortune-page-data";

/**
 * 운세 본문 상단 공통 헤더 — 현재 선택된 도구의 이름·맥락을 보여 주는 타이틀 블록.
 * FortunePage가 파일 크기 래칫 천장에 닿아 있어 헤더를 이 파일로 추출했다.
 *
 * 역할 분리: 도구 하위 라우트의 첫 장면(FortuneToolHero)은 장면 무대·루나 패널·
 * 말풍선이 맡고, 이 본문 헤더는 아트 없이 도구의 이름(labelKo)과 한 줄
 * 맥락(taglineKo)만으로 "지금 어떤 운세를 보고 있는지"를 밝힌다.
 * 이름·맥락의 정본은 FORTUNE_TAB_META이며 여기서 다시 정의하지 않는다.
 * (웨이브 20: 과거 이 헤더가 함께 실었던 섹션 아트 카드는 무대와 겹치는 이중
 * 마스트헤드라 제거했다 — 첫 화면의 아트는 무대 한 곳이 전담한다.)
 */
export function FortunePageHeader({
  tx,
  activeTab,
}: {
  tx: (source: string) => string;
  activeTab: FortuneTab;
}) {
  const meta = FORTUNE_TAB_META[activeTab];
  return (
    <header className="mb-7 text-center sm:mb-10">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3.5 py-1 text-xs font-semibold text-accent">
        <Sparkles className="h-3 w-3" />
        <span>{tx("페르소나 캐릭터 운세 레이어")}</span>
      </div>
      <h1 className="font-display text-[clamp(1.6rem,8vw,1.875rem)] font-extrabold tracking-tight text-fg sm:text-4xl">
        {meta.labelKo}
      </h1>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-fg-2">
        {meta.taglineKo}
      </p>
    </header>
  );
}
