/**
 * StudioSerialPlatformSubPanel.tsx
 *
 * https://www.ggumtoon.com/ 의 작가·작품 등록, 연재 방식(자유 40% / 정기 60% / 주2회 80%),
 * 3:1 배너 크롭, 이중 지갑(꿈·크레딧), 10일 출석체크, 기다리면 무료, 카카오 바이럴 공유(최대 15꿈),
 * 웹소설/웹툰 뷰어(3종 테마·3단계 폰트·실시간 한→영 번역·교차 배너), 수익 정산(3.3% 원천징수·14개 은행) 및
 * 16대 어드민 모듈을 시뮬레이션·검증하는 서브 패널.
 */
import {
  Award,
  BookOpen,
  CalendarCheck,
  Coins,
  Globe,
  Landmark,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  buildSerialStudioCrossAdaptationBanner,
  calculateSerialStudioCreatorSettlement,
  computeSerialStudioCoinChargeOrder,
  computeSerialStudioWeeklyCoinConsumptionMetrics,
  evaluateSerialStudioAttendanceCycle,
  evaluateSerialStudioShareRewardProgress,
  SERIAL_STUDIO_ADMIN_MODULES,
  SERIAL_STUDIO_CREDIT_PURCHASE_PLANS,
  SERIAL_STUDIO_NOVEL_FONT_SIZES,
  SERIAL_STUDIO_NOVEL_VIEWER_THEMES,
  SERIAL_STUDIO_SETTLEMENT_BANKS,
  SERIAL_STUDIO_SUBSCRIPTION_TIERS,
  SERIAL_STUDIO_WEB_COIN_PLANS,
  resolveSerialStudioEpisodeAccess,
  shouldTriggerSerialStudioAutoLike,
  translateSerialStudioEpisodeTextBoxes,
  validateSerialStudioSettlementRegistration,
  type SerialStudioNovelFontSizeKey,
  type SerialStudioNovelViewerThemeId,
  type SerialStudioPayMethod,
} from "./serial-platform-economy";
import {
  computeSerialStudioCoverOrBannerCrop,
  SERIAL_STUDIO_GENRES,
  SERIAL_STUDIO_SERIAL_POLICIES,
  SERIAL_STUDIO_WEEKDAYS,
  isSerialStudioEpisodeAutomaticallyFree,
  validateAndBuildSerialStudioWorkPayload,
  validateSerialStudioAuthorName,
  type SerialStudioGenre,
  type SerialStudioSerialType,
  type SerialStudioWeekday,
} from "./serial-studio-suite";

import { cn } from "@/shared/lib/utils";

const SIMULATED_BASE_MS = 1_793_000_000_000;
const SIMULATED_NEXT_FREE_ISO = new Date(SIMULATED_BASE_MS + 125 * 60_000).toISOString();

export function StudioSerialPlatformSubPanel(): ReactElement {
  // 1. 작가 핸들 & 작품 등록 상태
  const [authorName, setAuthorName] = useState("연재작가01");
  const [workTitle, setWorkTitle] = useState("레벨업 연애");
  const [selectedGenre, setSelectedGenre] = useState<SerialStudioGenre>("로맨스");
  const [serialType, setSerialType] = useState<SerialStudioSerialType>("twice_weekly");
  const [serialDays, setSerialDays] = useState<readonly SerialStudioWeekday[]>(["수", "토"]);
  const [bannerZoom, setBannerZoom] = useState<number>(1.2);
  const [checkEpisodeNum, setCheckEpisodeNum] = useState<number>(4);

  // 2. 지갑 · 출석체크 · 공유 · 기다무 상태
  const [coinPlanIdx, setCoinPlanIdx] = useState<number>(1);
  const [hasNeverCharged, setHasNeverCharged] = useState<boolean>(true);
  const [payMethod, setPayMethod] = useState<SerialStudioPayMethod>("KAKAOPAY");
  const [attendanceDays, setAttendanceDays] = useState<number>(9);
  const [shareClicks, setShareClicks] = useState<number>(7);
  const [paidReadEpisodeIds, setPaidReadEpisodeIds] = useState<readonly string[]>([
    "ep-4",
    "ep-5",
  ]);
  const [waitFreeClaimable, setWaitFreeClaimable] = useState<boolean>(false);

  // 3. 뷰어 테마 · 폰트 크기 · 실시간 한→영 번역
  const [viewerTheme, setViewerTheme] = useState<SerialStudioNovelViewerThemeId>("dark");
  const [viewerFontSizeKey, setViewerFontSizeKey] =
    useState<SerialStudioNovelFontSizeKey>("md");
  const [isTranslatedEn, setIsTranslatedEn] = useState<boolean>(false);

  // 4. 정산 계산기 상태
  const [paidCoinsRead, setPaidCoinsRead] = useState<number>(1500);
  const [freeCoinsRead, setFreeCoinsRead] = useState<number>(320);
  const [isBusiness, setIsBusiness] = useState<boolean>(false);
  const [selectedBank, setSelectedBank] = useState<string>(
    SERIAL_STUDIO_SETTLEMENT_BANKS[0]!,
  );

  const authorValidation = useMemo(
    () => validateSerialStudioAuthorName(authorName, ["관리자", "기존작가"]),
    [authorName],
  );

  const workValidation = useMemo(
    () =>
      validateAndBuildSerialStudioWorkPayload({
        type: "webtoon",
        title: workTitle,
        genres: [selectedGenre],
        serialType,
        serialDays,
        viewMode: "scroll",
        description: "AI와 함께 제작한 로맨스 판타지 웹툰",
        agreeAdPromotion: true,
        agreeOperationPolicy: true,
      }),
    [workTitle, selectedGenre, serialType, serialDays],
  );

  const bannerCrop = useMemo(
    () =>
      computeSerialStudioCoverOrBannerCrop({
        role: "banner",
        mediaWidth: 1536,
        mediaHeight: 1024,
        panX: 0,
        panY: 0,
        zoom: bannerZoom,
      }),
    [bannerZoom],
  );

  const coinChargeOrder = useMemo(
    () =>
      computeSerialStudioCoinChargeOrder({
        plan: SERIAL_STUDIO_WEB_COIN_PLANS[coinPlanIdx] ?? SERIAL_STUDIO_WEB_COIN_PLANS[0]!,
        hasNeverCharged,
        payMethod,
      }),
    [coinPlanIdx, hasNeverCharged, payMethod],
  );

  const attendanceSummary = useMemo(
    () => evaluateSerialStudioAttendanceCycle(attendanceDays),
    [attendanceDays],
  );

  const shareProgress = useMemo(
    () =>
      evaluateSerialStudioShareRewardProgress(
        shareClicks,
        "bda0a3d2-82f7-4e67-a1c5-ae5e6d4334d8",
        "ep-4",
      ),
    [shareClicks],
  );

  const episodeAccess = useMemo(
    () =>
      resolveSerialStudioEpisodeAccess({
        episodeIndexZeroBased: checkEpisodeNum - 1,
        isEpisodeFreeFlag: isSerialStudioEpisodeAutomaticallyFree(checkEpisodeNum, "webtoon"),
        isChallengeWork: false,
        isAuthorOwner: false,
        isAlreadyRead: false,
        userCoinBalance: 10,
        waitFreeApplicable: true,
        waitFreeClaimable,
        waitFreeNextFreeAtIso: SIMULATED_NEXT_FREE_ISO,
        nowMs: SIMULATED_BASE_MS,
      }),
    [checkEpisodeNum, waitFreeClaimable],
  );

  const autoLikeStatus = useMemo(
    () =>
      shouldTriggerSerialStudioAutoLike({
        alreadyLiked: false,
        alreadyAutoLikedInSession: false,
        paidReadEpisodeIds,
        currentEpisodeId: "ep-6",
      }),
    [paidReadEpisodeIds],
  );

  const settlementBreakdown = useMemo(
    () =>
      calculateSerialStudioCreatorSettlement({
        paidCoinsRead,
        freeMarketingCoinsRead: freeCoinsRead,
        serialType,
        isBusiness,
        appChannelRatio: 0.2,
      }),
    [paidCoinsRead, freeCoinsRead, serialType, isBusiness],
  );

  const settlementFormValid = useMemo(
    () =>
      validateSerialStudioSettlementRegistration({
        realName: "홍길동",
        bankName: selectedBank,
        accountNumber: "3333-01-2345678",
        accountHolder: "홍길동",
        isBusiness,
        businessNumber: isBusiness ? "123-45-67890" : "",
        agreedPrivacyCollection: true,
      }),
    [selectedBank, isBusiness],
  );

  const adminWeeklyMetrics = useMemo(
    () =>
      computeSerialStudioWeeklyCoinConsumptionMetrics({
        weeklyUsedPaidCoins: paidCoinsRead,
        weeklyUsedFreeCoins: freeCoinsRead,
        weeklyChargedPaidCoins: 2400,
      }),
    [paidCoinsRead, freeCoinsRead],
  );

  const translatedBoxes = useMemo(
    () =>
      translateSerialStudioEpisodeTextBoxes([
        {
          id: "tb-1",
          y: 25,
          align: "center",
          fontSize: SERIAL_STUDIO_NOVEL_FONT_SIZES[viewerFontSizeKey],
          text: "기다렸어. 오늘 밤 모든 진실을 밝히겠어.",
        },
      ]),
    [viewerFontSizeKey],
  );

  const crossBanner = useMemo(
    () =>
      buildSerialStudioCrossAdaptationBanner({
        currentWorkType: "novel",
        relatedWorkId: "work-webtoon-01",
        relatedTitle: workTitle || "레벨업 연애",
      }),
    [workTitle],
  );

  const activeThemeSpec =
    SERIAL_STUDIO_NOVEL_VIEWER_THEMES.find((t) => t.id === viewerTheme) ??
    SERIAL_STUDIO_NOVEL_VIEWER_THEMES[0]!;

  const toggleWeekday = (day: SerialStudioWeekday) => {
    setSerialDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].slice(-2),
    );
  };

  return (
    <div
      data-testid="ggumtoon-platform-subpanel"
      className="space-y-3 rounded-lg border border-line bg-panel p-3 text-xs"
    >
      {/* 1. 작가 핸들 & 연재 방식(40/60/80%) & 3:1 상세 배너 크롭 */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-line bg-card p-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Award size={12} className="text-accent" aria-hidden="true" />
              작가 등록 (2~12자 불변) · 연재 방식별 수익 배분
            </span>
            <span
              data-testid="ggumtoon-author-status"
              className={cn(
                "rounded px-1.5 py-0.5 text-[0.6rem] font-semibold",
                authorValidation.valid ? "bg-good/15 text-good" : "bg-bad/15 text-bad",
              )}
            >
              {authorValidation.message}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="space-y-0.5">
              <span className="text-[0.6rem] text-fg-3">작가 이름 (한/영/숫자 2~12자)</span>
              <input
                type="text"
                data-testid="ggumtoon-author-name-input"
                value={authorName}
                maxLength={12}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full rounded border border-line bg-raised px-2 py-1 text-[0.65rem] text-fg"
              />
            </label>
            <label className="space-y-0.5">
              <span className="text-[0.6rem] text-fg-3">작품 제목 / 대표 장르</span>
              <div className="flex gap-1">
                <input
                  type="text"
                  data-testid="ggumtoon-work-title-input"
                  value={workTitle}
                  onChange={(e) => setWorkTitle(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-line bg-raised px-2 py-1 text-[0.65rem] text-fg"
                />
                <select
                  aria-label="작품 장르 선택"
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value as SerialStudioGenre)}
                  className="rounded border border-line bg-raised px-1.5 py-1 text-[0.62rem] text-fg"
                >
                  {SERIAL_STUDIO_GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {SERIAL_STUDIO_SERIAL_POLICIES.map((pol) => (
              <button
                key={pol.id}
                type="button"
                data-testid={`ggumtoon-serial-type-${pol.id}`}
                onClick={() => {
                  setSerialType(pol.id);
                  if (pol.id === "regular") setSerialDays(["수"]);
                  if (pol.id === "twice_weekly") setSerialDays(["수", "토"]);
                  if (pol.id === "free") setSerialDays([]);
                }}
                className={cn(
                  "rounded border p-1.5 text-left transition-colors",
                  serialType === pol.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-raised text-fg-2",
                )}
              >
                <div className="text-[0.64rem] font-bold">{pol.label}</div>
                <div className="text-[0.58rem] opacity-85">
                  작가 {pol.creatorSharePercent}% / 플랫폼 {pol.platformSharePercent}%
                </div>
              </button>
            ))}
          </div>

          {serialType !== "free" ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[0.58rem] text-fg-3">연재 요일:</span>
              {SERIAL_STUDIO_WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className={cn(
                    "h-6 w-6 rounded-full text-[0.6rem] font-bold",
                    serialDays.includes(day)
                      ? "bg-accent text-fg"
                      : "bg-raised text-fg-3",
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center justify-between text-[0.58rem] text-fg-3">
            <span data-testid="ggumtoon-work-validation-summary">
              {workValidation.valid
                ? `✓ 등록 가능 (${workValidation.payload?.serial_type} · 요일: ${workValidation.payload?.serial_day ?? "자유"})`
                : workValidation.errors[0]}
            </span>
            <span data-testid="ggumtoon-banner-crop-summary">
              배너 크롭(3:1, {bannerZoom}x): {bannerCrop.width}×{bannerCrop.height}px
            </span>
          </div>
          <input
            type="range"
            aria-label="배너 3:1 노출 영역 확대/축소"
            min={1}
            max={2.5}
            step={0.1}
            value={bannerZoom}
            onChange={(e) => setBannerZoom(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>

        {/* 2. 이중 지갑 (꿈 코인 첫 충전 10% 더! + AI 크레딧 플랜) & 10일 출석체크 */}
        <div className="space-y-2 rounded-lg border border-line bg-card p-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Coins size={12} className="text-accent" aria-hidden="true" />
              이중 지갑 (꿈 코인 · AI 크레딧) & 10일 개근 출석체크
            </span>
            <label className="inline-flex items-center gap-1 text-[0.6rem] text-accent">
              <input
                type="checkbox"
                checked={hasNeverCharged}
                onChange={(e) => setHasNeverCharged(e.target.checked)}
              />
              첫 충전 10% 더!
            </label>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {SERIAL_STUDIO_WEB_COIN_PLANS.map((plan, idx) => (
              <button
                key={plan.coins}
                type="button"
                data-testid={`ggumtoon-coin-plan-${plan.coins}`}
                onClick={() => setCoinPlanIdx(idx)}
                className={cn(
                  "rounded border p-1.5 text-center",
                  coinPlanIdx === idx
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-raised text-fg-2",
                )}
              >
                <div className="text-[0.64rem] font-bold">{plan.coins}꿈</div>
                <div className="text-[0.56rem]">₩{plan.price.toLocaleString()}</div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between rounded bg-raised px-2 py-1 text-[0.6rem]">
            <span data-testid="ggumtoon-coin-order-summary" className="font-semibold text-fg">
              지급: {coinChargeOrder.totalCoinsGranted}꿈 (기본 {coinChargeOrder.baseCoins} + 보너스{" "}
              {coinChargeOrder.bonusCoins}) · ₩{coinChargeOrder.paymentAmountKrw.toLocaleString()}
            </span>
            <div className="flex gap-1">
              {(["KAKAOPAY", "CARD"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPayMethod(method)}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[0.55rem] font-semibold",
                    payMethod === method
                      ? "bg-accent text-fg"
                      : "bg-card text-fg-3",
                  )}
                >
                  {method === "KAKAOPAY" ? "카카오페이" : "신용카드"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 rounded border border-line/70 bg-raised p-1.5 text-[0.58rem]">
            <span className="inline-flex items-center gap-1 font-semibold text-fg">
              <CalendarCheck size={11} className="text-accent" aria-hidden="true" />
              출석 {attendanceSummary.totalAttendanceDays}일차 (사이클 {attendanceSummary.cycleDay}/10)
            </span>
            <span data-testid="ggumtoon-attendance-summary" className="text-accent">
              누적 {attendanceSummary.totalCoinsFromCycle}꿈 · {attendanceSummary.nextRewardLabel}
            </span>
            <button
              type="button"
              data-testid="ggumtoon-attendance-check-btn"
              onClick={() => setAttendanceDays((d) => d + 1)}
              className={cn(
                "rounded bg-accent px-2 py-0.5 text-[0.58rem] font-bold text-fg",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              출석하기 (+도장)
            </button>
          </div>

          <p className="text-[0.56rem] text-fg-3">
            크레딧 단건 충전:{" "}
            {SERIAL_STUDIO_CREDIT_PURCHASE_PLANS.map((p) => `${p.credits}개(₩${p.price.toLocaleString()})`).join(
              " · ",
            )}{" "}
            / 구독:{" "}
            {SERIAL_STUDIO_SUBSCRIPTION_TIERS.map((t) => `${t.id}(${t.monthlyCredits}개)`).join(" · ")}
          </p>
        </div>
      </div>

      {/* 3. 기다리면 무료 · 바이럴 공유(15꿈 상한) · 3회 유료열람 자동 좋아요 · 뷰어 */}
      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-line bg-card p-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <Share2 size={12} className="text-accent" aria-hidden="true" />
              1~3화 무료 · 기다리면 무료 · 공유 리워드(최대 15꿈) · 자동 좋아요
            </span>
            <button
              type="button"
              data-testid="ggumtoon-toggle-waitfree-btn"
              onClick={() => setWaitFreeClaimable((v) => !v)}
              className="rounded border border-line bg-raised px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-2"
            >
              {waitFreeClaimable ? "🎁 무료 이용권 도착 상태" : "⏳ 대기 중 상태"}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((epNum) => (
              <button
                key={epNum}
                type="button"
                data-testid={`ggumtoon-check-ep-${epNum}`}
                onClick={() => setCheckEpisodeNum(epNum)}
                className={cn(
                  "rounded border px-2 py-1 text-[0.6rem] font-bold",
                  checkEpisodeNum === epNum
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-raised text-fg-2",
                )}
              >
                {epNum}화 ({epNum <= 3 ? "자동무료" : "유료 1꿈"})
              </button>
            ))}
          </div>

          <div
            data-testid="ggumtoon-episode-access-result"
            className="rounded bg-raised px-2 py-1 text-[0.6rem] text-fg-2"
          >
            {checkEpisodeNum}화 열람 판정: <strong>{episodeAccess.access}</strong> (필요 꿈:{" "}
            {episodeAccess.coinsRequired}개
            {"waitRemainingLabel" in episodeAccess && episodeAccess.waitRemainingLabel
              ? ` · ${episodeAccess.waitRemainingLabel}`
              : ""}
            )
          </div>

          <div className="flex items-center justify-between rounded bg-raised px-2 py-1 text-[0.6rem]">
            <span data-testid="ggumtoon-share-reward-status" className="font-semibold text-fg">
              카카오 공유 리워드: {shareProgress.statusText}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                data-testid="ggumtoon-share-click-btn"
                onClick={() => setShareClicks((c) => Math.min(15, c + 1))}
                className="rounded bg-warn px-2 py-0.5 text-[0.58rem] font-bold text-fg"
              >
                공유 클릭 +1꿈
              </button>
              <button
                type="button"
                data-testid="ggumtoon-paid-read-3rd-btn"
                onClick={() => setPaidReadEpisodeIds(["ep-4", "ep-5", "ep-6"])}
                className="rounded border border-line bg-card px-2 py-0.5 text-[0.58rem] font-semibold text-fg-2"
              >
                {autoLikeStatus.triggerAutoLike
                  ? "❤️ 3화 유료열람 자동 좋아요 발동됨"
                  : "유료 3화 열람 시뮬레이션"}
              </button>
            </div>
          </div>
        </div>

        {/* 4. 웹소설/웹툰 뷰어 (다크·라이트·세피아, 14/17/20px, 한→영 번역, 원작 교차 배너) */}
        <div className="space-y-2 rounded-lg border border-line bg-card p-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 font-bold text-fg">
              <BookOpen size={12} className="text-accent" aria-hidden="true" />
              뷰어 (다크·라이트·세피아 · 14/17/20px · 실시간 번역)
            </span>
            <button
              type="button"
              data-testid="ggumtoon-viewer-translate-btn"
              onClick={() => setIsTranslatedEn((v) => !v)}
              className="inline-flex items-center gap-1 rounded border border-accent bg-accent-soft px-2 py-0.5 text-[0.58rem] font-bold text-accent"
            >
              <Globe size={10} aria-hidden="true" />
              {isTranslatedEn ? "원문(KO) 보기" : "AI 영문 번역 (/api/translate-episode)"}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {SERIAL_STUDIO_NOVEL_VIEWER_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  data-testid={`ggumtoon-viewer-theme-${theme.id}`}
                  onClick={() => setViewerTheme(theme.id)}
                  className={cn(
                    "rounded border px-2 py-0.5 text-[0.58rem] font-semibold",
                    viewerTheme === theme.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-raised text-fg-2",
                  )}
                >
                  {theme.label} ({theme.bg})
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["sm", "md", "lg"] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  data-testid={`ggumtoon-viewer-fontsize-${sz}`}
                  onClick={() => setViewerFontSizeKey(sz)}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[0.58rem] font-bold",
                    viewerFontSizeKey === sz
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-raised text-fg-2",
                  )}
                >
                  가 ({SERIAL_STUDIO_NOVEL_FONT_SIZES[sz]}px)
                </button>
              ))}
            </div>
          </div>

          <div
            data-testid="ggumtoon-viewer-preview-box"
            style={{
              backgroundColor: activeThemeSpec.bg,
              color: activeThemeSpec.text,
              fontSize: `${SERIAL_STUDIO_NOVEL_FONT_SIZES[viewerFontSizeKey]}px`,
            }}
            className="rounded-lg border border-line p-2.5 leading-relaxed"
          >
            {isTranslatedEn
              ? translatedBoxes[0]?.text_en
              : translatedBoxes[0]?.text}
          </div>

          <div className="flex items-center justify-between rounded bg-raised px-2 py-1 text-[0.58rem]">
            <span className="font-semibold text-fg-2">
              {crossBanner.badgeText} · {crossBanner.targetTitle}
            </span>
            <span className="font-bold text-accent">{crossBanner.ctaText}</span>
          </div>
        </div>
      </div>

      {/* 5. 창작자 수익 정산 계산기 (14개 은행 · 3.3% 원천징수 · 유료 꿈 전용) & 16대 어드민 모듈 */}
      <div className="rounded-lg border border-line bg-card p-2.5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 font-bold text-fg">
            <Landmark size={12} className="text-accent" aria-hidden="true" />
            창작자 수익 정산 시뮬레이터 (익월 10일 지급 · 유료 꿈 열람 전용 · 무료 마케팅 꿈 제외)
          </span>
          <span className="inline-flex items-center gap-1 text-[0.58rem] text-fg-3">
            <ShieldCheck size={11} className="text-good" aria-hidden="true" />
            어드민 16개 모듈 연동 · 주간 꿈 소비율 {adminWeeklyMetrics.consumptionRatePercent}% (유료 비중{" "}
            {adminWeeklyMetrics.paidSharePercent}%)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="space-y-0.5">
            <span className="text-[0.58rem] text-fg-3">유료 충전 꿈 열람수</span>
            <input
              type="number"
              data-testid="ggumtoon-settlement-paid-coins"
              value={paidCoinsRead}
              min={0}
              onChange={(e) => setPaidCoinsRead(Number(e.target.value) || 0)}
              className="w-full rounded border border-line bg-raised px-2 py-1 text-[0.64rem] text-fg"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[0.58rem] text-fg-3">무료 꿈 열람수 (정산 제외)</span>
            <input
              type="number"
              data-testid="ggumtoon-settlement-free-coins"
              value={freeCoinsRead}
              min={0}
              onChange={(e) => setFreeCoinsRead(Number(e.target.value) || 0)}
              className="w-full rounded border border-line bg-raised px-2 py-1 text-[0.64rem] text-fg"
            />
          </label>
          <label className="space-y-0.5">
            <span className="text-[0.58rem] text-fg-3">정산 은행 (14개 지원)</span>
            <select
              aria-label="정산 은행 선택"
              data-testid="ggumtoon-settlement-bank-select"
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="w-full rounded border border-line bg-raised px-2 py-1 text-[0.64rem] text-fg"
            >
              {SERIAL_STUDIO_SETTLEMENT_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="text-[0.58rem] text-fg-3">사업자 구분</span>
            <button
              type="button"
              data-testid="ggumtoon-settlement-business-toggle"
              onClick={() => setIsBusiness((b) => !b)}
              className="w-full rounded border border-line bg-raised px-2 py-1 text-[0.62rem] font-semibold text-fg"
            >
              {isBusiness ? "사업자 (세금계산서)" : "일반 개인 (3.3% 원천징수)"}
            </button>
          </label>
        </div>

        <div
          data-testid="ggumtoon-settlement-result"
          className="flex flex-wrap items-center justify-between gap-2 rounded bg-raised px-2.5 py-1.5 text-[0.62rem]"
        >
          <span>
            정산율:{" "}
            <strong>{Math.round(settlementBreakdown.creatorShareRate * 100)}%</strong> · 세전
            작가 몫: ₩{settlementBreakdown.creatorGrossShareKrw.toLocaleString()} · 원천세(3.3%):
            -₩{settlementBreakdown.withholdingTaxKrw.toLocaleString()}
          </span>
          <strong className="text-accent">
            세후 예상 실수령: ₩{settlementBreakdown.finalPayoutKrw.toLocaleString()} (
            {settlementFormValid.valid ? `${selectedBank} 계좌 확인됨` : "미등록"})
          </strong>
        </div>

        <div className="flex flex-wrap gap-1 pt-0.5">
          {SERIAL_STUDIO_ADMIN_MODULES.map((mod) => (
            <span
              key={mod.id}
              className="rounded border border-line/60 bg-raised px-1.5 py-0.5 text-[0.54rem] text-fg-3"
            >
              {mod.label} ({mod.path})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
