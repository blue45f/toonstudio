import {
  BadgeCheck,
  Clock,
  Coins,
  FileSignature,
  Globe2,
  Handshake,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  GLOBAL_TIMEZONE_REGIONS,
  PLAZA_CURRENCY_CODES,
  PLAZA_GUILD_ZONES,
  computeKstWorkOverlap,
  convertCutRateAndEscrow,
  formatPlazaCurrency,
  type DivisionOsCutSliceHandoffPayload,
  type GlobalRegionTimezoneId,
  type HybridCrowdFilterMode,
  type OutsourcingQuestPost,
  type PlazaCurrencyCode,
  type PlazaFreelancerAvatar,
  type PlazaGuildZoneId,
  type RateNegotiationResult,
} from "./mmorpg-global-outsourcing-plaza";
import {
  PLAZA_LANGUAGE_CODES,
  PLAZA_LANGUAGE_METADATA,
  type PlazaLanguageCode,
} from "./realtime-meeting-voice-chat-engine";

export interface GlobalFreelancerDirectoryViewProps {
  readonly freelancers: readonly PlazaFreelancerAvatar[];
  readonly selectedFreelancer: PlazaFreelancerAvatar | null;
  readonly guildZoneFilter: PlazaGuildZoneId | "all";
  readonly timezoneFilter: GlobalRegionTimezoneId | "all";
  readonly languageFilter: PlazaLanguageCode | "all";
  readonly presenceFilter: HybridCrowdFilterMode;
  readonly onlyImmediate: boolean;
  readonly maxRateKrw: number;
  readonly searchQuery: string;
  readonly targetCurrency: PlazaCurrencyCode;
  readonly calcCutCount: number;
  readonly onChangeGuildZone: (value: PlazaGuildZoneId | "all") => void;
  readonly onChangeTimezone: (value: GlobalRegionTimezoneId | "all") => void;
  readonly onChangeLanguage: (value: PlazaLanguageCode | "all") => void;
  readonly onChangePresenceFilter: (value: HybridCrowdFilterMode) => void;
  readonly onChangeOnlyImmediate: (value: boolean) => void;
  readonly onChangeMaxRateKrw: (value: number) => void;
  readonly onChangeSearchQuery: (value: string) => void;
  readonly onChangeTargetCurrency: (value: PlazaCurrencyCode) => void;
  readonly onChangeCalcCutCount: (value: number) => void;
  readonly onWalkAndNegotiate: (freelancer: PlazaFreelancerAvatar) => void;
}

const REGION_IDS: readonly GlobalRegionTimezoneId[] = [
  "KR-KST",
  "VN-ICT",
  "TH-ICT",
  "ID-WIB",
  "PH-PHT",
  "JP-JST",
  "US-PST",
];

export function GlobalFreelancerDirectoryView({
  freelancers,
  selectedFreelancer,
  guildZoneFilter,
  timezoneFilter,
  languageFilter,
  presenceFilter,
  onlyImmediate,
  maxRateKrw,
  searchQuery,
  targetCurrency,
  calcCutCount,
  onChangeGuildZone,
  onChangeTimezone,
  onChangeLanguage,
  onChangePresenceFilter,
  onChangeOnlyImmediate,
  onChangeMaxRateKrw,
  onChangeSearchQuery,
  onChangeTargetCurrency,
  onChangeCalcCutCount,
  onWalkAndNegotiate,
}: GlobalFreelancerDirectoryViewProps) {
  const sampleRate = selectedFreelancer?.ratePerCutKrw ?? 14500;
  const escrowCalc = convertCutRateAndEscrow({
    ratePerCutKrw: sampleRate,
    cutCount: calcCutCount,
    targetCurrency,
  });

  return (
    <div className="space-y-4" data-testid="gpp-directory-view">
      {/* 1. 동남아·글로벌 실시간 겹치는 근무 시간(KST 기준) & 6종 통화 에스크로 계산기 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="gpp-card space-y-2.5" aria-label="서울 KST 기준 동남아·글로벌 시차 겹침 계산기">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Clock className="size-4 text-accent" aria-hidden="true" />
              <span>서울(KST 09:00~18:00) 동시 협업 시간표</span>
            </h3>
            <span className="gpp-pill" data-tone="good">실시간 계산</span>
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {REGION_IDS.filter((id) => id !== "KR-KST").map((tzId) => {
              const overlap = computeKstWorkOverlap(9, 18, tzId, 9, 18);
              const tone =
                overlap.syncQuality === "prime"
                  ? "good"
                  : overlap.syncQuality === "good"
                    ? "accent"
                    : "warn";
              return (
                <div
                  key={tzId}
                  className="rounded-lg border border-line bg-canvas p-2 text-xs"
                  data-testid={`gpp-overlap-${tzId}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-fg">
                      {overlap.countryNameKo} ({GLOBAL_TIMEZONE_REGIONS[tzId].cityLabelKo})
                    </span>
                    <span className="gpp-pill" data-tone={tone}>
                      {overlap.overlapHours}시간 겹침
                    </span>
                  </div>
                  <p className="mt-0.5 text-fg-2">
                    {overlap.offsetLabelKo} · {overlap.overlapSummaryKo}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="gpp-card space-y-2.5" aria-label="6종 통화 컷당 단가 및 3단계 에스크로 환산기">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Coins className="size-4 text-warn" aria-hidden="true" />
              <span>6종 통화 컷당 단가 · 3단계 에스크로 환산</span>
            </h3>
            <span className="gpp-pill" data-tone="accent">
              기준 {formatPlazaCurrency(sampleRate, "KRW")}/컷
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
              <span className="text-fg-2">지급 통화</span>
              <select
                aria-label="에스크로 정산 통화 선택"
                data-testid="gpp-currency-select"
                value={targetCurrency}
                onChange={(event) => onChangeTargetCurrency(event.target.value as PlazaCurrencyCode)}
                className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg"
              >
                {PLAZA_CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
              <span className="text-fg-2">발주 컷 수</span>
              <input
                type="number"
                min={1}
                max={120}
                value={calcCutCount}
                aria-label="발주 컷 수"
                data-testid="gpp-calc-cuts-input"
                onChange={(event) => onChangeCalcCutCount(Math.max(1, Number(event.target.value) || 1))}
                className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg gpp-num"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-xs" data-testid="gpp-currency-grid">
            {PLAZA_CURRENCY_CODES.map((code) => (
              <div key={code} className="rounded-lg border border-line bg-canvas p-2">
                <span className="text-fg-2">{code}</span>
                <p className="gpp-num font-bold text-fg">{escrowCalc.allCurrencies[code].formattedPerCut}/컷</p>
                <p className="gpp-num text-fg-2">{escrowCalc.allCurrencies[code].formattedNetTotal}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-line bg-canvas p-2 text-xs">
            <p className="font-semibold text-fg">단계별 마일스톤 에스크로 지급 분할 (먹튀 방지):</p>
            <ul className="mt-1 space-y-0.5 text-fg-2">
              {escrowCalc.milestones.map((m) => (
                <li key={m.stageKey} className="gpp-num flex justify-between gap-2">
                  <span>{m.labelKo} ({m.ratioPct}%)</span>
                  <span className="font-semibold text-fg">{m.formattedLocal}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-fg-3">{escrowCalc.rateNoticeKo}</p>
          </div>
        </section>
      </div>

      {/* 2. 하이브리드 콜드스타트 방어 & 글로벌 프리랜서 검색 필터 */}
      <section className="gpp-card space-y-3" aria-label="글로벌 프리랜서 검색 및 필터">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="실시간 및 상시 대기 검증 풀 전환">
            {(
              [
                ["hybrid-all", "전체 (실시간 + 24시간 비동기 검증 풀)"],
                ["live-only", "실시간 광장 접속만"],
                ["async-verified-pool", "상시 대기 검증 풀 (비동기 제안)"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className="gpp-chip-btn"
                aria-pressed={presenceFilter === mode}
                data-testid={`gpp-presence-filter-${mode}`}
                onClick={() => onChangePresenceFilter(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="gpp-pill" data-tone="accent" data-testid="gpp-filtered-count">
            검색 결과 {freelancers.length}명
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 size-4 text-fg-3" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onChangeSearchQuery(event.target.value)}
              placeholder="이름·역할·국가 검색"
              aria-label="글로벌 프리랜서 검색"
              data-testid="gpp-freelancer-search"
              className="min-h-11 w-full rounded-lg border border-line bg-canvas pl-9 pr-3 text-xs text-fg"
            />
          </label>

          <select
            aria-label="길드 존 필터"
            value={guildZoneFilter}
            onChange={(event) => onChangeGuildZone(event.target.value as PlazaGuildZoneId | "all")}
            className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg"
          >
            <option value="all">전체 길드 존</option>
            {PLAZA_GUILD_ZONES.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.nameKo}
              </option>
            ))}
          </select>

          <select
            aria-label="국가 및 시간대 필터"
            data-testid="gpp-region-select"
            value={timezoneFilter}
            onChange={(event) => onChangeTimezone(event.target.value as GlobalRegionTimezoneId | "all")}
            className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg"
          >
            <option value="all">전체 국가 (한국·동남아·글로벌)</option>
            {REGION_IDS.map((id) => (
              <option key={id} value={id}>
                {GLOBAL_TIMEZONE_REGIONS[id].countryNameKo} ({GLOBAL_TIMEZONE_REGIONS[id].tzLabel})
              </option>
            ))}
          </select>

          <select
            aria-label="소통 언어 필터"
            value={languageFilter}
            onChange={(event) => onChangeLanguage(event.target.value as PlazaLanguageCode | "all")}
            className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg"
          >
            <option value="all">전체 언어 (6개국어)</option>
            {PLAZA_LANGUAGE_CODES.map((code) => (
              <option key={code} value={code}>
                {PLAZA_LANGUAGE_METADATA[code].labelKo}
              </option>
            ))}
          </select>

          <label className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 text-xs font-semibold text-fg">
            <span>최대 ₩{(maxRateKrw / 1000).toFixed(0)}k</span>
            <input
              type="range"
              min={9000}
              max={30000}
              step={1000}
              value={maxRateKrw}
              aria-label="최대 컷당 단가 필터"
              onChange={(event) => onChangeMaxRateKrw(Number(event.target.value))}
              className="w-20"
            />
          </label>
        </div>

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-fg">
          <input
            type="checkbox"
            checked={onlyImmediate}
            onChange={(event) => onChangeOnlyImmediate(event.target.checked)}
            className="size-4"
          />
          <span>즉시 투입 가능한 파트너만 보기</span>
        </label>

        {/* 프리랜서 카드 리스트 (신뢰·먹튀 방지 가드레일 필수 표기) */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {freelancers.slice(0, 12).map((item) => {
            const overlap = computeKstWorkOverlap(9, 18, item.timezoneId);
            const rateLocal = convertCutRateAndEscrow({
              ratePerCutKrw: item.ratePerCutKrw,
              cutCount: 1,
              targetCurrency,
            }).formattedPerCutLocal;

            return (
              <article
                key={item.id}
                className="flex flex-col justify-between gap-2.5 rounded-xl border border-line bg-canvas p-3 text-xs"
                data-testid={`gpp-freelancer-card-${item.id}`}
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-bold text-fg">
                      {item.displayName}{" "}
                      <span className="font-normal text-fg-2">({item.countryNameKo})</span>
                    </span>
                    <span
                      className="gpp-pill"
                      data-tone={item.presenceKind === "live-online" ? "good" : "warn"}
                    >
                      <span className="gpp-pill-dot" />
                      {item.presenceKind === "live-online" ? "실시간 광장 접속" : "상시 비동기 대기"}
                    </span>
                  </div>

                  <p className="font-semibold text-accent">
                    {item.roleKo} · {formatPlazaCurrency(item.ratePerCutKrw, "KRW")}/컷 ({rateLocal})
                  </p>
                  <p className="text-fg-2">
                    {item.availabilityLabelKo} · 평균 응답 {item.responseMinutes}분 · KST 겹침 {overlap.overlapHours}시간 ·{" "}
                    {item.languages.map((l) => PLAZA_LANGUAGE_METADATA[l].badge).join("/")}
                  </p>

                  {/* 신뢰·먹튀 방지 에스크로 가드레일 블록 */}
                  <div className="space-y-1 rounded-lg border border-line bg-card p-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 font-bold text-good">
                        <BadgeCheck className="size-3.5" aria-hidden="true" />
                        {item.trust.portfolioBadgeKo}
                      </span>
                      <span className="gpp-num font-semibold text-fg">
                        납기 준수율 {item.trust.onTimeDeliveryRatePct}%
                      </span>
                      <span className="text-fg-3">({item.sampleProfileLabel})</span>
                    </div>
                    <p className="flex items-center gap-1 text-fg-2">
                      <ShieldCheck className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
                      <span>단계별 마일스톤 에스크로: {item.trust.escrowMilestonePlanKo}</span>
                    </p>
                    <p className="flex items-center gap-1 text-fg-2">
                      <Lock className="size-3.5 shrink-0 text-warn" aria-hidden="true" />
                      <span>부분 컷 워터마크 열람 (Zero-Leak · 최대 {item.trust.previewMaxWidthPx}px)</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="gpp-btn w-full"
                  data-variant="primary"
                  data-testid={`gpp-negotiate-btn-${item.id}`}
                  onClick={() => onWalkAndNegotiate(item)}
                >
                  <Handshake className="size-4" aria-hidden="true" />
                  <span>걸어가서 1:1 음성·단가 협의</span>
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export interface OutsourcingQuestHandoffViewProps {
  readonly episodeId: string;
  readonly selectedFreelancer: PlazaFreelancerAvatar;
  readonly quests: readonly OutsourcingQuestPost[];
  readonly targetCurrency: PlazaCurrencyCode;
  readonly negotiationResult: RateNegotiationResult | null;
  readonly handoffPayload: DivisionOsCutSliceHandoffPayload | null;
  readonly onNegotiate: (proposedRateKrw: number, cutCount: number) => void;
  readonly onPublishQuest: (input: {
    readonly titleKo: string;
    readonly guildZoneId: PlazaGuildZoneId;
    readonly cutRangeStart: number;
    readonly cutRangeEnd: number;
    readonly budgetPerCutKrw: number;
    readonly targetCurrency: PlazaCurrencyCode;
  }) => void;
  readonly onHandoffQuestToDivisionOs: (quest: OutsourcingQuestPost) => void;
}

export function OutsourcingQuestHandoffView({
  episodeId,
  selectedFreelancer,
  quests,
  targetCurrency,
  negotiationResult,
  handoffPayload,
  onNegotiate,
  onPublishQuest,
  onHandoffQuestToDivisionOs,
}: OutsourcingQuestHandoffViewProps) {
  const [proposedRateKrw, setProposedRateKrw] = useState(selectedFreelancer.ratePerCutKrw);
  const [negCutCount, setNegCutCount] = useState(20);
  const [questTitle, setQuestTitle] = useState(`${episodeId} 1~20컷 글로벌 선화·채색 긴급 파티`);
  const [questGuild, setQuestGuild] = useState<PlazaGuildZoneId>(selectedFreelancer.guildZoneId);
  const [cutStart, setCutStart] = useState(1);
  const [cutEnd, setCutEnd] = useState(20);
  const [budgetPerCut, setBudgetPerCut] = useState(selectedFreelancer.ratePerCutKrw);

  const handlePublish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onPublishQuest({
      titleKo: questTitle,
      guildZoneId: questGuild,
      cutRangeStart: cutStart,
      cutRangeEnd: cutEnd,
      budgetPerCutKrw: budgetPerCut,
      targetCurrency,
    });
  };

  return (
    <div className="space-y-4" data-testid="gpp-quest-handoff-view">
      <div className="grid gap-3 lg:grid-cols-2">
        {/* 1:1 단가 협상 데스크 */}
        <section className="gpp-card space-y-3" aria-label="1대1 단가 협상 데스크">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Handshake className="size-4 text-accent" aria-hidden="true" />
              <span>1:1 단가 협상 · {selectedFreelancer.displayName}</span>
            </h3>
            <span className="gpp-pill" data-tone="good">
              {selectedFreelancer.trust.portfolioBadgeKo} · 납기 {selectedFreelancer.trust.onTimeDeliveryRatePct}%
            </span>
          </div>

          <p className="text-xs text-fg-2">
            희망가 {formatPlazaCurrency(selectedFreelancer.ratePerCutKrw, "KRW")}/컷 ·{" "}
            {selectedFreelancer.countryNameKo} ·{" "}
            {selectedFreelancer.presenceKind === "live-online" ? "실시간 대화 즉시 연결" : "비동기 제안 즉시 발송"}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
              <span className="text-fg-2">제안 컷당 단가 (KRW)</span>
              <input
                type="number"
                step={500}
                min={5000}
                value={proposedRateKrw}
                data-testid="gpp-neg-rate-input"
                onChange={(event) => setProposedRateKrw(Number(event.target.value) || 5000)}
                className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg gpp-num"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
              <span className="text-fg-2">협의 컷 수</span>
              <input
                type="number"
                min={1}
                max={100}
                value={negCutCount}
                data-testid="gpp-neg-cuts-input"
                onChange={(event) => setNegCutCount(Math.max(1, Number(event.target.value) || 1))}
                className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg gpp-num"
              />
            </label>
          </div>

          <button
            type="button"
            className="gpp-btn w-full"
            data-variant="primary"
            data-testid="gpp-submit-negotiation-btn"
            onClick={() => onNegotiate(proposedRateKrw, negCutCount)}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            <span>에스크로 조건 포함 1:1 단가 제안 보내기</span>
          </button>

          {negotiationResult ? (
            <div
              className="rounded-lg border border-line bg-canvas p-2.5 text-xs"
              role="status"
              data-testid="gpp-negotiation-result"
            >
              <p className="font-bold text-fg">
                {negotiationResult.accepted ? "합의 완료" : "절충안 도착"}:{" "}
                {negotiationResult.replyKo}
              </p>
              <p className="gpp-num mt-0.5 text-fg-2">
                총 예상 계약액 {formatPlazaCurrency(negotiationResult.totalBudgetKrw, "KRW")} (30/40/30 에스크로 보호)
              </p>
            </div>
          ) : null}
        </section>

        {/* 원클릭 파티(퀘스트) 모집 공고 발행기 */}
        <section className="gpp-card space-y-3" aria-label="원클릭 글로벌 외주 퀘스트 발행">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
              <Globe2 className="size-4 text-good" aria-hidden="true" />
              <span>원클릭 글로벌 외주 파티(퀘스트) 모집 발행</span>
            </h3>
            <span className="gpp-pill" data-tone="warn">실시간 + 비동기 보드 동시 게시</span>
          </div>

          <form className="space-y-2.5" onSubmit={handlePublish}>
            <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
              <span className="text-fg-2">퀘스트 공고 제목</span>
              <input
                type="text"
                value={questTitle}
                data-testid="gpp-quest-title-input"
                onChange={(event) => setQuestTitle(event.target.value)}
                className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg"
              />
            </label>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-semibold text-fg sm:col-span-2">
                <span className="text-fg-2">길드 존</span>
                <select
                  value={questGuild}
                  onChange={(event) => setQuestGuild(event.target.value as PlazaGuildZoneId)}
                  className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg"
                >
                  {PLAZA_GUILD_ZONES.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.nameKo}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
                <span className="text-fg-2">시작 컷</span>
                <input
                  type="number"
                  min={1}
                  value={cutStart}
                  onChange={(event) => setCutStart(Math.max(1, Number(event.target.value) || 1))}
                  className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg gpp-num"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
                <span className="text-fg-2">종료 컷</span>
                <input
                  type="number"
                  min={cutStart}
                  value={cutEnd}
                  onChange={(event) => setCutEnd(Math.max(cutStart, Number(event.target.value) || cutStart))}
                  className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg gpp-num"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs font-semibold text-fg">
              <span className="text-fg-2">컷당 예산 (KRW) · 지급 통화 {targetCurrency}</span>
              <input
                type="number"
                step={500}
                min={5000}
                value={budgetPerCut}
                onChange={(event) => setBudgetPerCut(Math.max(5000, Number(event.target.value) || 5000))}
                className="min-h-11 rounded-lg border border-line bg-canvas px-2.5 text-xs text-fg gpp-num"
              />
            </label>

            <button
              type="submit"
              className="gpp-btn w-full"
              data-variant="good"
              data-testid="gpp-publish-quest-btn"
            >
              <span>광장 + 상시 비동기 퀘스트 보드에 1클릭 발행</span>
            </button>
          </form>
        </section>
      </div>

      {/* 상시 비동기 외주 퀘스트 보드 & 분업 OS Cut-Slice 계약 인계 */}
      <section className="gpp-card space-y-3" aria-label="활성 외주 퀘스트 및 분업 OS 인계">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <FileSignature className="size-4 text-accent" aria-hidden="true" />
            <span>상시 외주 퀘스트 보드 ({quests.length}건) · 분업 OS Cut-Slice 즉시 인계</span>
          </h3>
          <span className="gpp-pill" data-tone="good">
            Zero-Leak 워터마크 + 3단계 에스크로 필수
          </span>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          {quests.map((quest) => (
            <article
              key={quest.questId}
              className="flex flex-col justify-between gap-2 rounded-xl border border-line bg-canvas p-3 text-xs"
              data-testid={`gpp-quest-card-${quest.questId}`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-fg">{quest.titleKo}</span>
                  <span
                    className="gpp-pill"
                    data-tone={quest.status === "handed-off" ? "good" : "accent"}
                  >
                    {quest.status === "handed-off" ? "Cut-Slice 인계 완료" : "모집 중"}
                  </span>
                </div>
                <p className="gpp-num text-fg-2">
                  {quest.cutRangeStart}~{quest.cutRangeEnd}컷 ({quest.cutCount}컷) ·{" "}
                  {formatPlazaCurrency(quest.budgetPerCutKrw, "KRW")}/컷 · 통화 {quest.targetCurrency}
                </p>
                <p className="text-fg-2">{quest.trustGuardrailSummaryKo}</p>
              </div>
              <button
                type="button"
                className="gpp-btn w-full"
                data-variant="primary"
                data-testid={`gpp-handoff-btn-${quest.questId}`}
                onClick={() => onHandoffQuestToDivisionOs(quest)}
              >
                <span>{selectedFreelancer.displayName}님과 분업 OS Cut-Slice 계약 인계</span>
              </button>
            </article>
          ))}
        </div>

        {handoffPayload ? (
          <div className="space-y-2 rounded-xl border border-accent bg-panel p-3 text-xs" data-testid="gpp-cut-slice-handoff-box">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-fg">
                분업 OS Cut-Slice 계약 인계 페이로드 생성 완료 ({handoffPayload.sliceId})
              </p>
              <span className="gpp-pill" data-tone="good">
                폴더 {handoffPayload.divisionRoleFolder} · Zero-Leak 워터마크 활성
              </span>
            </div>
            <pre className="gpp-code-box gpp-num">{JSON.stringify(handoffPayload, null, 2)}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
