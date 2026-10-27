import { Settings, Star, SlidersHorizontal, ShieldCheck, Trash2, Check, Download, Upload, Clock, SearchX, UserCog, ChevronRight, Sparkles, RefreshCw, Languages, MonitorSmartphone, Database } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { SiteTabPanel } from "@/domains/legal/public/site-section-tabs";
import { useSiteTabAnchors, useSiteTabs } from "@/domains/legal/public/site-tabs";

// account·settings·userProfile 사전은 셸 번들에서 분리돼 이 모듈 평가 시점에 동기 등록된다.
import "./account-i18n";
import { AccountMergeSettings } from "./AccountMergeSettings";
import { ConnectedAccountsSettings } from "./ConnectedAccountsSettings";
import { SettingsAdvancedGroup } from "./SettingsAdvancedGroup";
import {
  Choice,
  Row,
  SavedToast,
  SettingsSearchAndRelatedPanel,
} from "./SettingsPageSubSections";
import {
  initialSettingsAdvancedOpen,
  saveSettingsAdvancedOpen,
  settingsAdvancedGroup,
  toggleSettingsAdvancedGroup,
} from "./settings-surface-tiers";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { NextgenLabSettingsSection } from "./NextgenLabSettingsSection";
import { LibraryBackupImport } from "./LibraryBackupImport";
import { AccountDataPortabilityPanel } from "./AccountDataPortabilityPanel";
import { detectBrowserRegionSettings, planRegionSettingsSync, readLocalRegionSettings, writeLocalRegionSettings } from "./region-settings-client";

import { AppearanceSettings } from "@/shared/components/appearance/AppearanceSettings";
import { StudioInteractionSfxSettingsSection } from "@/domains/account/StudioInteractionSfxSettingsSection";
import { PageIntro } from "@/shared/components/page-intro";
import { RevealOnScroll } from "@/shared/components/reveal-on-scroll";
import { RegionalPreferences } from "@/shared/components/RegionalPreferences";
import { useSiteExperience } from "@/shared/components/site-experience/site-experience-context";
import { Container } from "@/shared/components/section";
import { SectionArt } from "@/shared/components/section-art";
import { SectionNav, type SectionNavItem } from "@/shared/components/section-nav";
import { Switch } from "@/shared/components/ui/switch";
import { useI18n, useT } from "@/shared/lib/i18n";
import { VoiceGuideSettingsSection } from "@/shared/voice";
import { AmbientSettingsSection } from "@/shared/ambient";
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount } from "@/shared/lib/utils";
import { useApp, useHydrated, type RatingScale } from "@/shared/lib/store";
import {
  getRememberFlag,
  setRememberFlag,
  clearAllRememberedFilters,
} from "@/shared/lib/use-remembered-filters";
import { patchRegionSettings, type RegionSettings, type RegionSettingsPatch } from "@/shared/lib/region-settings";
import { getMyProfile, updateMyProfile } from "@/platform/me-client";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("SettingsPage", ko, en);

type SettingsTab = "display" | "region" | "age" | "data" | "account";
const SETTINGS_TABS: readonly SettingsTab[] = ["display", "region", "age", "data", "account"];
const SETTINGS_TAB_PREFIX = "settings";
const SETTINGS_HASH_TABS: Readonly<Record<string, SettingsTab>> = {
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

function useStateOnceHydrated(hydrated: boolean, fn: () => void) {
  const done = useRef(false);
  useEffect(() => {
    if (hydrated && !done.current) {
      done.current = true;
      fn();
    }
  }, [hydrated, fn]);
}

export function SettingsPage() {
  const hydrated = useHydrated();
  const experience = useSiteExperience();
  const lang = useI18n((s) => s.lang);
  const userId = useApp((s) => s.userId);
  const setLang = useI18n((s) => s.setLang);
  const ratingScale = useApp((s) => s.ratingScale);
  const setRatingScale = useApp((s) => s.setRatingScale);
  const adultVerified = useApp((s) => s.adultVerified);
  const adultBirthdate = useApp((s) => s.adultBirthdate);
  const setAdultVerified = useApp((s) => s.setAdultVerified);
  const openAgeGate = useApp((s) => s.openAgeGate);
  const resetAll = useApp((s) => s.resetAll);
  const hydrateFromServer = useApp((s) => s.hydrateFromServer);
  const recentCount = useApp((s) => s.recentlyViewed.length);
  const clearRecentlyViewed = useApp((s) => s.clearRecentlyViewed);
  const recentSearchCount = useApp((s) => s.recentSearches.length);
  const clearRecentSearches = useApp((s) => s.clearRecentSearches);

  const [remember, setRemember] = useState(false);
  const [filtersCleared, setFiltersCleared] = useState(false);
  const [recentCleared, setRecentCleared] = useState(false);
  const [searchesCleared, setSearchesCleared] = useState(false);
  const [dataReset, setDataReset] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const t = useT();
  const [regionPreferences, setRegionPreferences] = useState<RegionSettings>(() =>
    detectBrowserRegionSettings(lang),
  );
  const [regionStatus, setRegionStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [regionMessage, setRegionMessage] = useState<string | null>(null);
  const [regionRetryKey, setRegionRetryKey] = useState(0);
  const [saveNotice, setSaveNotice] = useState(false);
  const saveNoticeTimer = useRef<number | undefined>(undefined);
  const langRef = useRef(lang);
  langRef.current = lang;
  const scaleOptions: { id: RatingScale; label: string }[] = [
    { id: "star", label: t("settings.rating.star") },
    { id: "ten", label: t("settings.rating.ten") },
    { id: "hundred", label: t("settings.rating.hundred") },
  ];

  // 로컬 설정 저장 피드백 — 토스트로 "저장됨"을 알린다.
  const flashSaved = useCallback(() => {
    setSaveNotice(true);
    window.clearTimeout(saveNoticeTimer.current);
    saveNoticeTimer.current = window.setTimeout(() => setSaveNotice(false), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(saveNoticeTimer.current), []);

  const { value: activeTab, select: selectTab, isMounted } = useSiteTabs({ ids: SETTINGS_TABS, fallback: "display", param: "view" });
  const { openAnchor } = useSiteTabAnchors(SETTINGS_HASH_TABS, activeTab, selectTab);

  // 고급 설정 펼침 상태 — 일상 설정만 기본 노출하고, 펼침 선택은 이 기기에 기억한다.
  // 고급 섹션 앵커로 직접 들어온 경우(딥링크)에는 해당 그룹이 열린 채로 시작한다.
  const [advancedOpen, setAdvancedOpen] = useState<readonly string[]>(() => {
    try {
      return initialSettingsAdvancedOpen(
        typeof window === "undefined" ? null : window.localStorage,
        typeof window === "undefined" ? "" : window.location.hash,
      );
    } catch {
      return [];
    }
  });
  const displayAdvancedMeta = settingsAdvancedGroup("display-advanced");
  const dataAdvancedMeta = settingsAdvancedGroup("data-advanced");
  const accountAdvancedMeta = settingsAdvancedGroup("account-advanced");
  const toggleAdvancedGroup = useCallback(
    (groupId: string) => {
      setAdvancedOpen((current) => {
        const next = toggleSettingsAdvancedGroup(current, groupId);
        try {
          saveSettingsAdvancedOpen(
            typeof window === "undefined" ? null : window.localStorage,
            next,
          );
        } catch {
          // 위와 동일 — 세션 상태만으로 충분하다.
        }
        return next;
      });
    },
    [],
  );
  const tabs = useMemo<readonly SectionNavItem[]>(
    () => [
      { id: "display", icon: MonitorSmartphone, label: bi("화면·음성", "Display & voice") },
      { id: "region", icon: Languages, label: bi("지역·필터", "Region & filters") },
      { id: "age", icon: ShieldCheck, label: t("settings.section.age") },
      { id: "data", icon: Database, label: t("settings.section.data") },
      { id: "account", icon: UserCog, label: t("settings.section.account") },
    ],
    [t],
  );
  // 공용 SectionNav(표준 S-2)는 문자열 id로 알려 주므로 알려진 탭 id만 상태로 되돌린다.
  const selectNavTab = useCallback((id: string) => {
    const next = SETTINGS_TABS.find((tab) => tab === id);
    if (next) selectTab(next);
  }, [selectTab]);

  useEffect(() => {
    let cancelled = false;
    const syncRegionPreferences = async () => {
      setRegionStatus("loading");
      setRegionMessage(null);
      const detected = detectBrowserRegionSettings(langRef.current);
      const local = readLocalRegionSettings();
      const provisional = local ?? detected;
      if (!local) writeLocalRegionSettings(provisional);
      if (!cancelled) {
        setRegionPreferences(provisional);
        if (provisional.language !== langRef.current) {
          setLang(provisional.language);
        }
      }

      if (!userId) {
        const plan = planRegionSettingsSync({
          local,
          remote: null,
          detected,
        });
        if (cancelled) return;
        if (plan.shouldWriteLocal) writeLocalRegionSettings(plan.settings);
        setRegionPreferences(plan.settings);
        if (plan.settings.language !== langRef.current) {
          setLang(plan.settings.language);
        }
        setRegionStatus("idle");
        return;
      }
      const profile = await getMyProfile(undefined, true);
      const plan = planRegionSettingsSync({
        local,
        remote: profile.regionSettings,
        detected,
      });
      if (cancelled) return;
      if (plan.shouldWriteLocal) writeLocalRegionSettings(plan.settings);
      setRegionPreferences(plan.settings);
      if (plan.settings.language !== langRef.current) {
        setLang(plan.settings.language);
      }

      if (plan.shouldPushRemote) {
        const updated = await updateMyProfile({
          regionSettings: plan.settings,
        });
        if (cancelled) return;
        const canonical = updated.regionSettings ?? plan.settings;
        writeLocalRegionSettings(canonical);
        setRegionPreferences(canonical);
      }
      setRegionStatus("saved");
    };

    void syncRegionPreferences().catch(() => {
      if (cancelled) return;
      setRegionStatus("error");
      setRegionMessage(
        langRef.current.startsWith("ko")
          ? "지역 설정을 서버와 동기화하지 못했습니다. 이 기기의 설정은 유지됩니다."
          : "Could not sync region settings. Local preferences are preserved.",
      );
    });

    return () => {
      cancelled = true;
    };
  }, [userId, setLang, regionRetryKey]);

  // 내 서재(별점·읽음·구독·컬렉션)는 이 브라우저에만 저장되므로 JSON 백업으로 내보내기/가져오기 지원.
  const doExport = () => {
    const s = useApp.getState();
    const payload = {
      _app: "toonstudio-library",
      version: 1,
      exportedAt: new Date().toISOString(),
      ratings: s.ratings,
      reads: s.reads,
      subscriptions: s.subscriptions,
      reviews: s.reviews,
      likedReviews: s.likedReviews,
      collections: s.collections,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toonstudio-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 클라이언트에서만 localStorage 기반 선호값 반영.
  useStateOnceHydrated(hydrated, () => setRemember(getRememberFlag()));

  const toggleRemember = () => {
    const next = !remember;
    setRemember(next);
    setRememberFlag(next);
    if (!next) setFiltersCleared(true);
    flashSaved();
  };
  const clearFilters = () => {
    clearAllRememberedFilters();
    setRemember(false);
    setFiltersCleared(true);
    flashSaved();
  };
  const doReset = () => {
    resetAll();
    setDataReset(true);
    setConfirmReset(false);
    flashSaved();
  };

  const changeRegionPreference = (
    field: "country" | "language" | "currency" | "timezone",
    nextValue: string,
  ) => {
    const patch: RegionSettingsPatch = { [field]: nextValue };
    const next = patchRegionSettings(regionPreferences, patch);
    if (!next) {
      setRegionStatus("error");
      setRegionMessage(
        lang.startsWith("ko")
          ? "지원하지 않는 지역 설정입니다."
          : "That regional preference is not supported.",
      );
      return;
    }

    setRegionPreferences(next);
    writeLocalRegionSettings(next);
    if (field === "language") setLang(next.language);

    if (!userId) {
      setRegionStatus("saved");
      setRegionMessage(null);
      return;
    }

    setRegionStatus("saving");
    setRegionMessage(null);
    void updateMyProfile({ regionSettings: next })
      .then((profile) => {
        const canonical = profile.regionSettings ?? next;
        setRegionPreferences(canonical);
        writeLocalRegionSettings(canonical);
        setRegionStatus("saved");
      })
      .catch(() => {
        setRegionStatus("error");
        setRegionMessage(
          lang.startsWith("ko")
            ? "서버 저장에 실패했습니다. 이 기기의 설정은 유지됩니다."
            : "Server save failed. Local preferences are preserved.",
        );
      });
  };

  return (
    <Container size="default" className="py-6 sm:py-14">
      <PageIntro variant="restrained">
      <div className="max-w-3xl">
      <SitePageHeader
        surface="plain"
        className="mb-6"
        icon={Settings}
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        description={t("settings.subtitle")}
        aside={
          <SectionArt
            image="studio-lobby"
            className="aspect-[16/10] w-full rounded-2xl border border-line object-cover"
          />
        }
        asideClassName="hidden lg:block"
      />

      <SettingsSearchAndRelatedPanel
        advancedOpen={advancedOpen}
        toggleAdvancedGroup={toggleAdvancedGroup}
        openAnchor={openAnchor}
      />
      </div>

      {/* 섹션 내비는 공용 SectionNav(표준 S-2) — 좁은 화면은 상단 탭 줄, 넓은 화면은 좌측 레일. */}
      <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <SectionNav
        mode="tabs"
        className="mb-6 lg:mb-0"
        items={tabs}
        value={activeTab}
        onChange={selectNavTab}
        label={bi("설정 영역", "Settings areas")}
        idPrefix={SETTINGS_TAB_PREFIX}
      />
      <div className="min-w-0 max-w-3xl">

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="display" active={activeTab === "display"} mounted={isMounted("display")}>
      <RevealOnScroll variant="fade">
      <div id="settings-display" className="scroll-mt-28">
        <section className="mb-6 rounded-2xl border border-line bg-panel/40 p-5" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className="mb-4 text-base font-semibold">
            {lang.startsWith("ko") ? "디자인 테마" : "Design themes"}
          </h2>
          <AppearanceSettings />
        </section>

        <StudioInteractionSfxSettingsSection />

        {/* 표시 설정 */}
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.display")}>
          {experience && <Row icon={Sparkles}
            title={lang.startsWith("ko") ? "화면 효과" : "Appearance"}
            desc={lang.startsWith("ko") ? "화려한 색채와 차분한 화면 중 선택하세요. 스튜디오는 변경되지 않습니다." : "Choose a vivid or calm appearance. Studio remains unchanged."}>
            <Choice options={[
              { id: "vivid", label: lang.startsWith("ko") ? "화려하게" : "Vivid" },
              { id: "calm", label: lang.startsWith("ko") ? "차분하게" : "Calm" },
            ]} value={experience.mode} label={lang.startsWith("ko") ? "화면 효과" : "Appearance"} onChange={(next) => { experience.setMode(next); flashSaved(); }} />
          </Row>}
          <Row icon={Star} title={t("settings.rating.title")} desc={t("settings.rating.desc")}>
            <Choice options={scaleOptions} value={ratingScale} label={t("settings.rating.title")} onChange={(next) => { setRatingScale(next); flashSaved(); }} />
          </Row>
        </section>
      </div>

      <div id="settings-voice" className="mt-6 scroll-mt-28">
        <VoiceGuideSettingsSection />
      </div>
      </RevealOnScroll>

      {displayAdvancedMeta ? (
        <SettingsAdvancedGroup
          id={displayAdvancedMeta.id}
          title={bi(...displayAdvancedMeta.title)}
          description={bi(...displayAdvancedMeta.description)}
          open={advancedOpen.includes(displayAdvancedMeta.id)}
          onToggle={() => toggleAdvancedGroup(displayAdvancedMeta.id)}
        >
          <div id="settings-ambient" className="scroll-mt-28">
            <AmbientSettingsSection />
          </div>

          <div id="settings-nextgen" className="mt-2 scroll-mt-28">
            <NextgenLabSettingsSection />
          </div>
        </SettingsAdvancedGroup>
      ) : null}

      </SiteTabPanel>

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="region" active={activeTab === "region"} mounted={isMounted("region")}>
      <RevealOnScroll variant="fade">
      <div id="settings-region" className="scroll-mt-28">
        {regionStatus === "loading" ? (
          <div className="rounded-2xl border border-line bg-panel/40 p-5" role="status">
            <span className="skeleton block h-5 w-36 rounded" aria-hidden />
            <span className="skeleton mt-2 block h-4 w-72 max-w-full rounded" aria-hidden />
            <div className="mt-4 grid gap-4 sm:grid-cols-2" aria-hidden>
              {[0, 1, 2, 3].map((index) => (
                <span key={index} className="skeleton block h-11 rounded-xl" />
              ))}
            </div>
            <span className="sr-only">{bi("지역 설정을 불러오는 중…", "Loading region settings…")}</span>
          </div>
        ) : (
          <RegionalPreferences
            value={regionPreferences}
            disabled={regionStatus === "saving"}
            saved={regionStatus === "saved"}
            message={regionStatus === "error" ? null : regionMessage}
            onChange={changeRegionPreference}
          />
        )}
        {regionStatus === "error" && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3" role="alert">
            <p className="text-sm text-bad">{regionMessage}</p>
            <button
              type="button"
              onClick={() => setRegionRetryKey((key) => key + 1)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
            >
              <RefreshCw size={14} aria-hidden />
              {bi("다시 시도", "Retry")}
            </button>
          </div>
        )}
      </div>
      </RevealOnScroll>

      {/* 필터 */}
      <RevealOnScroll variant="fade">
      <div id="settings-filters" className="mt-8 scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.filters")}</h2>
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.filters")}>
          <Row
            icon={SlidersHorizontal}
            title={t("settings.filters.remember")}
            desc={t("settings.filters.remember.desc")}
          >
            <Switch
              checked={hydrated && remember}
              aria-label={t("settings.filters.remember")}
              onCheckedChange={toggleRemember}
              disabled={!hydrated}
            />
          </Row>
          <Row
            icon={Trash2}
            title={t("settings.filters.clear")}
            desc={t("settings.filters.clear.desc")}
          >
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              {filtersCleared ? <Check size={14} className="text-good" /> : <Trash2 size={14} />}
              {filtersCleared ? t("settings.data.clear") : t("settings.filters.clearNow")}
            </button>
          </Row>
        </section>
      </div>
      </RevealOnScroll>

      </SiteTabPanel>

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="age" active={activeTab === "age"} mounted={isMounted("age")}>
      {/* 연령 확인 */}
      <RevealOnScroll variant="fade">
      <div id="settings-age" className="scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.age")}</h2>
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.age")}>
          <Row
            icon={ShieldCheck}
            title={t("settings.age.title")}
            desc={
              hydrated && adultVerified
                ? adultBirthdate
                  ? t("settings.age.descriptionVerifiedWithBirthdate").replace("{date}", adultBirthdate)
                  : t("settings.age.descriptionVerified")
                : t("settings.age.description")
            }
          >
            {hydrated && adultVerified ? (
              <button
                type="button"
                onClick={() => setAdultVerified(false)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
              >
                {t("settings.age.reset")}
              </button>
            ) : (
              <button
                type="button"
                onClick={openAgeGate}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
              >
                {t("settings.age.verify")}
              </button>
            )}
          </Row>
        </section>
      </div>
      </RevealOnScroll>

      </SiteTabPanel>

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="data" active={activeTab === "data"} mounted={isMounted("data")}>
      {/* 내 데이터 */}
      <RevealOnScroll variant="fade">
      <div id="settings-data" className="scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.data")}</h2>
        <section className="rounded-2xl border border-line bg-panel/40 px-5" aria-label={t("settings.section.data")}>
          <Row icon={Download} title={t("settings.data.export")} desc={t("settings.data.exportDesc")}>
            <button
              type="button"
              onClick={doExport}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised"
            >
              <Download size={14} /> {t("settings.data.export")}
            </button>
          </Row>
          <AccountDataPortabilityPanel
            userId={typeof userId === "string" && userId ? userId : null}
            locale={lang.toLowerCase().startsWith("ko") ? "ko" : "en"}
          />
          <Row icon={Upload} title={t("settings.data.import")} desc={t("settings.data.importDesc")}>
            <LibraryBackupImport onRestore={hydrateFromServer} locale={lang.toLowerCase().startsWith("ko") ? "ko" : "en"} ownerId={userId} />
          </Row>
          </section>
          {dataAdvancedMeta ? (
            <SettingsAdvancedGroup
              id={dataAdvancedMeta.id}
              title={bi(...dataAdvancedMeta.title)}
              description={bi(...dataAdvancedMeta.description)}
              open={advancedOpen.includes(dataAdvancedMeta.id)}
              onToggle={() => toggleAdvancedGroup(dataAdvancedMeta.id)}
            >
              <section className="px-0" aria-label={bi(...dataAdvancedMeta.title)}>
          <Row
            icon={Clock}
            title={t("settings.data.recent")}
            desc={`${t("settings.data.recentDesc")}${
              recentCount > 0 ? ` (${t("settings.data.now")} ${formatCount(recentCount, lang)})` : ""
            }`}
          >
            {recentCleared ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
                <Check size={14} /> {t("settings.data.clear")}
              </span>
            ) : (
              <button
                type="button"
                disabled={recentCount === 0}
                onClick={() => {
                  clearRecentlyViewed();
                  setRecentCleared(true);
                  flashSaved();
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Clock size={14} /> {t("settings.data.recent")}
              </button>
            )}
          </Row>
          <Row
            icon={SearchX}
            title={t("settings.data.search")}
            desc={`${t("settings.data.searchDesc")}${
              recentSearchCount > 0 ? ` (${t("settings.data.now")} ${formatCount(recentSearchCount, lang)})` : ""
            }`}
          >
            {searchesCleared ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
                <Check size={14} /> {t("settings.data.clear")}
              </span>
            ) : (
              <button
                type="button"
                disabled={recentSearchCount === 0}
                onClick={() => {
                  clearRecentSearches();
                  setSearchesCleared(true);
                  flashSaved();
                }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <SearchX size={14} /> {t("settings.data.search")}
              </button>
            )}
          </Row>
          <Row
            icon={Trash2}
            title={t("settings.data.reset")}
            desc={t("settings.data.resetDesc")}
          >
            {dataReset ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-good">
                <Check size={14} /> {t("settings.data.cleared")}
              </span>
            ) : confirmReset ? (
              <span className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={doReset}
                  className="inline-flex min-h-11 items-center rounded-lg bg-bad px-3 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
                >
                  {t("settings.data.confirmDelete")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 hover:bg-raised"
                >
                  {t("settings.data.cancel")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-bad/50 px-3 py-1.5 text-sm font-medium text-bad transition-colors hover:bg-bad/10"
              >
                <Trash2 size={14} /> {t("settings.data.confirmReset")}
              </button>
            )}
          </Row>
          <p className="border-t border-line/60 px-1 py-3 text-xs leading-5 text-fg-3">
            {bi(
              "초기화 범위는 서재 활동 데이터(별점·리뷰·읽음 상태·구독·컬렉션·최근 기록)뿐입니다. 테마·언어·알림 같은 환경설정과 연령 확인 상태, 계정 정보는 그대로 유지됩니다.",
              "This reset only covers library activity data (ratings, reviews, read state, subscriptions, collections, recent history). Preferences such as theme, language and notifications, your age-verification state, and your account stay as they are.",
            )}
          </p>
              </section>
            </SettingsAdvancedGroup>
          ) : null}
      </div>
      </RevealOnScroll>

      </SiteTabPanel>

      <SiteTabPanel idPrefix={SETTINGS_TAB_PREFIX} id="account" active={activeTab === "account"} mounted={isMounted("account")}>
      {/* 계정 */}
      <RevealOnScroll variant="fade">
      <div id="account-security" className="scroll-mt-28">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-3">{t("settings.section.account")}</h2>
        <section
          aria-label={t("settings.section.account")}
          className="rounded-2xl border border-line bg-panel/40 px-5"
        >
          <Row
            icon={UserCog}
            title={t("settings.account.title")}
            desc={t("settings.account.desc")}
          >
            <Link
              to="/me"
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
            >
              {t("settings.account.toProfile")} <ChevronRight size={14} />
            </Link>
          </Row>
        </section>
        {accountAdvancedMeta ? (
          <SettingsAdvancedGroup
            id={accountAdvancedMeta.id}
            title={bi(...accountAdvancedMeta.title)}
            description={bi(...accountAdvancedMeta.description)}
            open={advancedOpen.includes(accountAdvancedMeta.id)}
            onToggle={() => toggleAdvancedGroup(accountAdvancedMeta.id)}
          >
            <ConnectedAccountsSettings
              userId={typeof userId === "string" && userId ? userId : null}
            />
            <AccountMergeSettings
              userId={typeof userId === "string" && userId ? userId : null}
            />
          </SettingsAdvancedGroup>
        ) : null}
        {/* 탈퇴는 프로필 편집(/me)에서 분리해 계정 목적지에 모은다. */}
        <div className="mt-6">
          <DeleteAccountSection
            userId={typeof userId === "string" && userId ? userId : null}
          />
        </div>
      </div>
      </RevealOnScroll>
      </SiteTabPanel>
      </div>
      </div>
      <SavedToast visible={saveNotice} message={t("settings.filters.saved")} />
      </PageIntro>
    </Container>
  );
}
