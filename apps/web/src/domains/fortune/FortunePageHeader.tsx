import { Sparkles } from "lucide-react";

import { SectionArt } from "@/shared/components/section-art";

/**
 * 운세 본문 상단 공통 헤더 — 캐릭터 운세 레이어의 타이틀 블록.
 * FortunePage가 파일 크기 래칫 천장에 닿아 있어 헤더를 이 파일로 추출했다.
 * 추출 자체는 렌더 결과 무변경이 원칙이다.
 */
export function FortunePageHeader({ tx }: { tx: (source: string) => string }) {
  return (
    <header className="mb-7 text-center sm:mb-10">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent-soft px-3.5 py-1 text-xs font-semibold text-accent">
        <Sparkles className="h-3 w-3" />
        <span>{tx("페르소나 캐릭터 운세 레이어")}</span>
      </div>
      <h1 className="font-display text-[clamp(1.6rem,8vw,1.875rem)] font-extrabold tracking-tight text-fg sm:text-4xl">
        CHARACTER FORTUNE
      </h1>
      <p className="mx-auto mt-2 max-w-md text-pretty text-sm leading-relaxed text-fg-2">
        최애 웹툰 캐릭터가 제안하는 사주팔자와 타로 큐레이션
      </p>
      {/* 운세 섹션 키 비주얼 — 장식용. */}
      <SectionArt
        image="fortune"
        className="mx-auto mt-6 h-56 w-full max-w-2xl rounded-2xl border border-line/60 object-cover sm:h-72"
      />
    </header>
  );
}
