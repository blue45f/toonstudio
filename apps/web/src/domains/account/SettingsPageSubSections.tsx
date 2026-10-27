/* eslint-disable react-refresh/only-export-components -- 분리된 서브섹션 컴포넌트와 정적 옵션 상수를 함께 소유한다 */
import {
  Bell,
  Briefcase,
  Check,
  Crown,
  Gauge,
  Globe,
  KeyRound,
  PlugZap,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { settingsRevealGroupForEntry } from "./settings-surface-tiers";

import { SiteLinkCard } from "@/domains/legal/public/site-link-card";
import { AdvancedSection } from "@/shared/components/layout/AdvancedSection";
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("SettingsPage", ko, en);

/** 설정 화면 위쪽의 관련 설정 바로가기 — 카드 문법을 한곳에서 맞추기 위한 데이터. */
export const RELATED_SETTINGS: ReadonlyArray<{
  readonly href: string;
  readonly icon: LucideIcon;
  readonly title: readonly [string, string];
  readonly description: readonly [string, string];
}> = [
  {
    href: "/membership",
    icon: Crown,
    title: ["멤버십 · 포인트 · 용량 정책", "Membership, points & storage"],
    description: ["내 등급의 저장공간·업로드 한도와 활동 포인트 적립 기준 확인", "Review storage, upload limits and activity-point rules for your tier"],
  },
  {
    href: "/membership/usage",
    icon: Gauge,
    title: ["내 사용량 · 멤버십 알림", "My usage & membership notices"],
    description: ["실제 저장공간, 오늘 업로드량, 포인트 적립 잔여량과 한도 경고 확인", "See actual storage, today's uploads, reward limits and quota notices"],
  },
  {
    href: "/settings/ai",
    icon: Sparkles,
    title: ["AI 연결과 사용 순서", "AI connections & order"],
    description: ["초보자용 빠른 연결, 자동 무료 AI와 기능별 사용 순서를 한곳에서 관리", "Quick setup, automatic free AI and per-feature order in one place"],
  },
  {
    href: "/settings/api-keys",
    icon: KeyRound,
    title: ["API 키 허브", "API key hub"],
    description: ["AI·Unsplash 키를 한곳에서 마스킹 표시로 안전하게 관리", "Manage AI and Unsplash keys in one place, always masked"],
  },
  {
    href: "/settings/integrations",
    icon: PlugZap,
    title: ["외부 시스템 연동", "External integrations"],
    description: ["저장소·업무·알림·게시·결제 연결 상태와 권한 확인", "Review storage, work, notification, publishing and payment connections"],
  },
  {
    href: "/settings/notifications",
    icon: Bell,
    title: ["알림 설정", "Notification settings"],
    description: ["알림 종류별 수신 여부와 직군 알림이 함께 적용되는 방식 확인", "Review per-type notification switches and how role notifications combine"],
  },
  {
    href: "/settings/role",
    icon: Briefcase,
    title: ["내 직군 · 작업환경", "My role & workspace"],
    description: ["직군별 빠른 실행 순서, 기본 작업공간, 알림 수준 같은 작업환경 개인화", "Role-based quick actions, default workspace and notification level personalization"],
  },
];

export type SettingsTab = "display" | "region" | "age" | "data" | "account";
export const SETTINGS_TABS: readonly SettingsTab[] = ["display", "region", "age", "data", "account"];
export const SETTINGS_TAB_PREFIX = "settings";

/** 예전 섹션 앵커(공유 링크·다른 화면의 바로가기)를 해당 탭으로 연다. */
export const SETTINGS_HASH_TABS: Readonly<Record<string, SettingsTab>> = {
  "#settings-display": "display",
  "#settings-voice": "display",
  "#settings-ambient": "display",
  "#settings-nextgen": "display",
  "#settings-region": "region",
  "#settings-filters": "region",
  "#settings-age": "age",
  "#settings-data": "data",
  "#account-security": "account",
};

// 단일 선택 컨트롤 — radiogroup 시맨틱 + 방향키 이동(roving tabindex).
export function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === value));

  const move = (event: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-card/40 p-0.5">
      {options.map((o, index) => {
        const checked = value === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(event) => move(event, index)}
            className={`inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              checked ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// 로컬 저장 피드백 토스트 — role="status" 로 스크린리더에 알린다.
export function SavedToast({ visible, message }: { visible: boolean; message: string }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <p
        role="status"
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-sm font-semibold text-fg shadow-lg"
      >
        <Check size={16} className="shrink-0 text-good" aria-hidden />
        {message}
      </p>
    </div>
  );
}

export function Row({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Globe;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line/60 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className="mt-0.5 text-[0.78rem] leading-relaxed text-fg-2">{desc}</p>
        </div>
      </div>
      <div className="min-w-0 sm:max-w-[60%] sm:pl-4">{children}</div>
    </div>
  );
}

/**
 * 설정 검색 색인 — 이 화면의 섹션(앵커)과 다른 설정 화면을 한 목록으로 찾는다.
 * 섹션 앵커는 SETTINGS_HASH_TABS와 같은 문자열을 써야 탭 전환+스크롤이 함께 동작한다.
 */
export interface SettingsSearchEntry {
  readonly key: string;
  readonly title: readonly [string, string];
  readonly hint: readonly [string, string];
  readonly keywords: string;
  readonly anchor?: string;
  readonly href?: string;
}

export const SETTINGS_SEARCH_SECTIONS: readonly SettingsSearchEntry[] = [
  { key: "theme", title: ["디자인 테마", "Design theme"], hint: ["화면·음성 탭", "Display & voice tab"], keywords: "테마 다크 라이트 디자인 색상 theme dark light appearance", anchor: "#settings-display" },
  { key: "effects", title: ["화면 연출", "Motion feel"], hint: ["화면·음성 탭", "Display & voice tab"], keywords: "연출 몰입 집중 애니메이션 vivid calm motion 효과", anchor: "#settings-effects" },
  { key: "scale", title: ["별점 척도", "Rating scale"], hint: ["화면·음성 탭", "Display & voice tab"], keywords: "별점 평점 점수 rating scale star", anchor: "#settings-scale" },
  { key: "voice", title: ["음성 안내", "Voice guide"], hint: ["화면·음성 탭", "Display & voice tab"], keywords: "음성 나레이션 안내 읽기 소리 tts voice narration", anchor: "#settings-voice" },
  { key: "ambient", title: ["앰비언트 효과", "Ambient effects"], hint: ["화면·음성 탭 · 고급 설정", "Display & voice tab · Advanced"], keywords: "앰비언트 분위기 배경 ambient mood", anchor: "#settings-ambient" },
  { key: "nextgen", title: ["실험 기능", "Experimental features"], hint: ["화면·음성 탭 · 고급 설정", "Display & voice tab · Advanced"], keywords: "실험 베타 미리보기 신기능 lab experimental beta nextgen", anchor: "#settings-nextgen" },
  { key: "region", title: ["지역 · 언어", "Region & language"], hint: ["지역·필터 탭", "Region & filters tab"], keywords: "언어 지역 날짜 시간대 통화 언어팩 language locale region", anchor: "#settings-region" },
  { key: "filters", title: ["필터 기억", "Remember filters"], hint: ["지역·필터 탭", "Region & filters tab"], keywords: "필터 기억 검색 조건 정렬 filter remember", anchor: "#settings-filters" },
  { key: "age", title: ["연령 확인", "Age verification"], hint: ["연령 확인 탭", "Age verification tab"], keywords: "연령 성인 확인 age verify adult", anchor: "#settings-age" },
  { key: "data", title: ["내 데이터 · 백업 · 초기화", "My data, backup & reset"], hint: ["내 데이터 탭", "My data tab"], keywords: "백업 내보내기 가져오기 초기화 삭제 기록 서재 data backup export import reset", anchor: "#settings-data" },
  { key: "account", title: ["계정 보안 · 연동 계정", "Account security & linked accounts"], hint: ["계정 탭", "Account tab"], keywords: "계정 보안 연동 병합 로그인 account security linked merge", anchor: "#account-security" },
];

export const RELATED_SEARCH_KEYWORDS: Readonly<Record<string, string>> = {
  "/membership": "멤버십 요금제 구독 플랜 membership plan billing",
  "/membership/usage": "사용량 한도 크레딧 usage limits quota",
  "/settings/ai": "AI 모델 제공자 생성 ai model provider",
  "/settings/api-keys": "API 키 발급 api key token",
  "/settings/integrations": "연동 통합 외부 integration connect",
  "/settings/notifications": "알림 수신 끄기 켜기 종 notification alerts bell",
  "/settings/role": "직군 직업 역할 작업환경 개인화 알림 수준 role job workspace personalization",
};

export function matchesSettingsQuery(entry: SettingsSearchEntry, query: string): boolean {
  const haystack = `${entry.title[0]} ${entry.title[1]} ${entry.keywords}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function SettingsSearchAndRelatedPanel({
  settingsQuery,
  setSettingsQuery,
  searchResults,
  advancedOpen,
  toggleAdvancedGroup,
  openAnchor,
}: {
  readonly settingsQuery: string;
  readonly setSettingsQuery: (next: string) => void;
  readonly searchResults: readonly SettingsSearchEntry[];
  readonly advancedOpen: readonly string[];
  readonly toggleAdvancedGroup: (groupId: string) => void;
  readonly openAnchor: (anchor: string) => void;
}) {
  return (
    <>
      {/* 설정 검색 — 이 화면의 섹션과 다른 설정 화면을 한 번에 찾는다. */}
      <div className="mb-6">
        <label htmlFor="settings-search" className="sr-only">
          {bi("설정 검색", "Search settings")}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            id="settings-search"
            type="search"
            value={settingsQuery}
            onChange={(event) => setSettingsQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSettingsQuery("");
            }}
            placeholder={bi("설정 검색 — 예: 알림, 테마, 백업, 직군", "Search settings — e.g. notifications, theme, backup, role")}
            className="min-h-12 w-full rounded-2xl border border-line bg-panel pl-10 pr-4 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </div>
        {settingsQuery.trim() ? (
          <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-panel">
            {searchResults.length > 0 ? (
              <ul aria-label={bi("설정 검색 결과", "Settings search results")}>
                {searchResults.map((entry) => (
                  <li key={entry.key} className="border-b border-line/60 last:border-b-0">
                    {entry.href ? (
                      <Link
                        to={entry.href}
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-raised"
                      >
                        <span className="text-sm font-bold text-fg">{bi(...entry.title)}</span>
                        <span className="shrink-0 text-xs text-fg-3">{bi(...entry.hint)}</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          // 고급 그룹 안의 항목이면 먼저 펼치고 나서 이동한다(접힌 채로는 대상이 없다).
                          const revealGroup = settingsRevealGroupForEntry(entry.key);
                          if (revealGroup && !advancedOpen.includes(revealGroup)) {
                            toggleAdvancedGroup(revealGroup);
                          }
                          if (entry.anchor) {
                            const anchor = entry.anchor;
                            if (revealGroup) {
                              requestAnimationFrame(() => openAnchor(anchor));
                            } else {
                              openAnchor(anchor);
                            }
                          }
                          setSettingsQuery("");
                        }}
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors hover:bg-raised"
                      >
                        <span className="text-sm font-bold text-fg">{bi(...entry.title)}</span>
                        <span className="shrink-0 text-xs text-fg-3">{bi(...entry.hint)}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-fg-3">
                {bi("찾는 설정이 없어요. 다른 단어로 검색해 보세요.", "No matching settings. Try another word.")}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* 다른 설정 화면(멤버십·AI·API 키·연동·알림·직군)은 고급 구역(AdvancedSection panel 프리셋)으로
          접어 두어 이 화면의 설정 탭이 첫 화면에 보이게 한다. keepMounted라 접힌 상태에서도
          링크가 DOM에 남아 검색·안내 동선이 그대로 이어진다. */}
      <AdvancedSection
        preset="panel"
        keepMounted
        data-related-settings=""
        className="mb-6"
        title={
          <>
            {bi("다른 설정 화면", "More settings pages")}
            <span className="ml-1.5 rounded-full bg-raised px-1.5 py-0.5 text-[0.68rem] font-bold text-fg-3">{RELATED_SETTINGS.length}</span>
          </>
        }
        description={RELATED_SETTINGS.map((item) => bi(...item.title)).join(" · ")}
      >
        <nav aria-label={bi("관련 설정", "Related settings")} className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
          {RELATED_SETTINGS.map((item) => (
            <SiteLinkCard
              key={item.href}
              layout="compact"
              href={item.href}
              icon={item.icon}
              title={bi(...item.title)}
              description={bi(...item.description)}
            />
          ))}
        </nav>
      </AdvancedSection>
    </>
  );
}

// 하이드레이션 직후 1회 초기화(localStorage 선호값 반영). effect 의존성 가드.
export function useStateOnceHydrated(hydrated: boolean, fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (hydrated && !done.current) {
      done.current = true;
      fn();
    }
  }, [hydrated, fn]);
}
