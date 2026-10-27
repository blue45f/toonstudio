import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

// account·settings·userProfile 사전은 셸 번들에서 분리돼 이 모듈 평가 시점에 동기 등록된다.
import "./account-i18n";

import {
  Check,
  ChevronRight,
  Loader2,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ActivityTab,
  DeleteAccountDialog,
  PostsTab,
  ProfilePreview,
  SignInPrompt,
} from "./AccountPageSubSections";
import { CreatorRoleProfileEditor } from "./CreatorRoleProfileEditor";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getCurrentUserId } from "@/platform/creator-client";
import { getMyProfile, updateMyProfile } from "@/platform/me-client";
import { AvatarUploader } from "@/shared/components/avatar-uploader";
import { MySpaceModuleChrome } from "@/shared/components/my-space-module-chrome";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  EMPTY_CREATOR_ROLE_PROFILE,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export { DeleteAccountDialog, ProfilePreview };

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("AccountPage", ko, en);

/** 탭별 목적 한 줄 — 처음 보는 사용자도 각 탭이 무엇인지 바로 알 수 있게. */
const TAB_PURPOSE: Record<Tab, { ko: string; en: string }> = {
  posts: { ko: "내가 공개한 작품", en: "Works I've published" },
  activity: { ko: "나의 감상 기록", en: "My reading and review history" },
  profile: { ko: "공개 프로필과 소개", en: "Public profile and bio" },
};

type Tab = "posts" | "activity" | "profile";
const TABS: { id: Tab; labelKey: string }[] = [
  { id: "posts", labelKey: "account.tabs.posts" },
  { id: "activity", labelKey: "account.tabs.activity" },
  { id: "profile", labelKey: "account.tabs.profile" },
];

function isTab(value: string | null): value is Tab {
  return value === "posts" || value === "activity" || value === "profile";
}

// ── 프로필 편집(아바타 + 이름 + 소개) ─────────────────
function ProfileTab({ userId }: { userId: string }) {
  const t = useT();
  const { data: session } = useSession();
  const user = session?.user;
  const fallbackInitial = (user?.name ?? user?.email ?? "U").charAt(0).toUpperCase();

  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState("");
  const [image, setImage] = useState<string | null>(user?.image ?? null);
  const [creatorRoleProfile, setCreatorRoleProfile] = useState<CreatorRoleProfile>(() => ({
    ...EMPTY_CREATOR_ROLE_PROFILE,
    secondaryRoles: [],
    specialties: [],
  }));
  const [roleProfileLoaded, setRoleProfileLoaded] = useState(false);
  const [roleProfileTouched, setRoleProfileTouched] = useState(false);
  const [profileLoading, setProfileLoading] = useState(Boolean(user?.id));
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<{
    name: string;
    bio: string;
    image: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버 프로필(소개·직무 포함)을 불러와 폼 초기값을 채운다(세션엔 전체 프로필이 없음).
  useEffect(() => {
    if (!user?.id) {
      setProfileLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setProfileLoading(true);
    setLoadError(false);
    setRoleProfileLoaded(false);
    setRoleProfileTouched(false);
    getMyProfile(controller.signal)
      .then((profile) => {
        if (!alive) return;
        const nextName = profile.name || "";
        const nextBio = profile.bio || "";
        const nextImage = profile.image ?? null;
        setName((prev) => prev || nextName);
        setBio((prev) => prev || nextBio);
        setImage((prev) => prev ?? nextImage);
        setCreatorRoleProfile(profile.creatorRoleProfile);
        setRoleProfileLoaded(true);
        setLoaded({ name: nextName, bio: nextBio, image: nextImage });
      })
      .catch(() => {
        if (alive) setLoadError(true);
      })
      .finally(() => {
        if (alive) setProfileLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [user?.id, reloadKey]);

  // 저장되지 않은 변경 여부 — 미리보기 배지로 표시한다.
  const dirty =
    roleProfileTouched ||
    (loaded !== null &&
      (name !== loaded.name || bio !== loaded.bio || (image ?? null) !== loaded.image));

  const markEdited = useCallback(() => setSaved(false), []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMyProfile({
        name: name.trim(),
        bio: bio.trim(),
        image,
        ...(roleProfileLoaded || roleProfileTouched ? { creatorRoleProfile } : {}),
      });
      setCreatorRoleProfile(updated.creatorRoleProfile);
      setRoleProfileLoaded(true);
      setRoleProfileTouched(false);
      setLoaded({
        name: updated.name || "",
        bio: updated.bio || "",
        image: updated.image ?? null,
      });
      setName(updated.name || "");
      setBio(updated.bio || "");
      setImage(updated.image ?? null);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("account.profile.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const nameInvalid = name.trim().length === 0;

  if (profileLoading) {
    return (
      <div className="max-w-4xl space-y-6" role="status">
        <span className="sr-only">{bi("프로필을 불러오는 중…", "Loading profile…")}</span>
        <div className="rounded-2xl border border-line bg-panel/40 p-5" aria-hidden>
          <span className="skeleton mb-4 block h-5 w-28 rounded" />
          <span className="skeleton block size-20 rounded-full" />
        </div>
        <div className="rounded-2xl border border-line bg-panel/40 p-5" aria-hidden>
          <span className="skeleton mb-2 block h-5 w-20 rounded" />
          <span className="skeleton mb-4 block h-11 rounded-xl" />
          <span className="skeleton mb-2 block h-5 w-20 rounded" />
          <span className="skeleton block h-24 rounded-xl" />
        </div>
        <div className="rounded-2xl border border-line bg-panel/40 p-5" aria-hidden>
          <span className="skeleton block h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <div className="min-w-0 space-y-6">
      {loadError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3"
          role="alert"
        >
          <p className="text-sm text-bad">{t("account.profile.loadingError")}</p>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
          >
            <RefreshCw size={14} aria-hidden />
            {bi("다시 불러오기", "Retry")}
          </button>
        </div>
      )}
      <section className="rounded-2xl border border-line bg-panel/40 p-5">
        <h2 className="mb-1 text-sm font-semibold text-fg">{t("account.profile.photoTitle")}</h2>
        <p className="mb-4 text-[0.78rem] leading-relaxed text-fg-2">{t("account.profile.photoDesc")}</p>
        <AvatarUploader
          value={image}
          fallbackText={fallbackInitial}
          onChange={(next) => {
            setImage(next);
            markEdited();
          }}
          onError={setError}
          disabled={saving}
        />
      </section>

      <section className="rounded-2xl border border-line bg-panel/40 p-5 space-y-4">
        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-sm font-semibold text-fg">
            {t("account.profile.nameLabel")}
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              markEdited();
            }}
            disabled={saving}
            className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/40"
            placeholder={t("account.profile.namePlaceholder")}
          />
        </div>
        <div>
          <label htmlFor="profile-bio" className="mb-1.5 block text-sm font-semibold text-fg">
            {t("account.profile.bioLabel")}
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            maxLength={280}
            rows={3}
            onChange={(e) => {
              setBio(e.target.value);
              markEdited();
            }}
            disabled={saving}
            className="w-full resize-none rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/40"
            placeholder={t("account.profile.bioPlaceholder")}
          />
          <p className="mt-1 text-right text-[0.7rem] text-fg-3 numeral">
            {t("account.profile.bioLength").replace("{length}", String(bio.length))}
          </p>
        </div>
      </section>

      <CreatorRoleProfileEditor
        value={creatorRoleProfile}
        onChange={(next) => {
          setCreatorRoleProfile(next);
          setRoleProfileTouched(true);
          markEdited();
        }}
        disabled={saving || profileLoading}
      />

      {error && (
        <p className="rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || nameInvalid}
          className={buttonClass({ variant: "solid", className: "gap-1.5" })}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : null}
          {saving ? t("account.profile.saving") : saved ? t("account.profile.saved") : t("account.profile.saveButton")}
        </button>
        {nameInvalid && <span className="text-xs text-fg-3">{t("account.profile.nameRequired")}</span>}
      </div>

      {/* 탈퇴 같은 위험 작업은 프로필 편집과 분리해 설정의 계정 탭에서만 다룬다. */}
      <section className="rounded-2xl border border-line bg-panel/40 p-5">
        <h2 className="text-sm font-semibold text-fg">
          {bi("계정 보안과 탈퇴", "Account security and deletion")}
        </h2>
        <p className="mt-1.5 text-[0.78rem] leading-relaxed text-fg-3">
          {bi(
            "연결 계정·계정 병합·탈퇴는 설정의 계정 탭에서 관리해요.",
            "Connected accounts, account merging, and deletion live in the Account tab of Settings.",
          )}
        </p>
        <Link
          href="/settings?view=account#account-security"
          className="mt-4 inline-flex min-h-11 items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
        >
          {bi("설정 계정 탭 열기", "Open account settings")}
          <ChevronRight size={14} />
        </Link>
      </section>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-[var(--site-header-sticky-offset,5rem)]">
        <ProfilePreview
          name={name}
          bio={bio}
          image={image}
          fallbackInitial={fallbackInitial}
          creatorRoleProfile={creatorRoleProfile}
          dirty={dirty}
          userId={userId}
        />
      </aside>

    </div>
  );
}

export function AccountPage() {
  const t = useT();
  const { status } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "posts";
  const userId = getCurrentUserId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (status !== "authenticated" || !userId) {
    return <SignInPrompt />;
  }

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const onTabKeyDown = (index: number) => (event: React.KeyboardEvent) => {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <MySpaceModuleChrome />
      <header className="mb-6 sm:mb-7">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <UserRound size={14} /> {t("account.page.eyebrow")}
        </p>
        <h1 className="mt-2 text-[clamp(1.6rem,7vw,1.875rem)] font-bold tracking-tight sm:text-4xl">
          {t("account.page.title")}
        </h1>
        <p className="lede mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-2">
          {t("account.page.subtitle")}
        </p>
      </header>

      <div
        role="tablist"
        aria-label={t("account.page.tabsAria")}
        className="rail -mx-4 mb-6 flex gap-1.5 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map((option, index) => {
          const on = option.id === tab;
          return (
            <button
              key={option.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setTab(option.id)}
              onKeyDown={onTabKeyDown(index)}
              className={cn(
                "-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
                on
                  ? "border-accent text-fg"
                  : "border-transparent text-fg-2 hover:text-fg"
              )}
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>
      <p className="mb-6 -mt-4 text-xs text-fg-3" aria-live="polite">
        {bi(TAB_PURPOSE[tab].ko, TAB_PURPOSE[tab].en)}
      </p>

      {tab === "posts" && <PostsTab userId={userId} />}
      {tab === "activity" && <ActivityTab />}
      {tab === "profile" && <ProfileTab userId={userId} />}
    </Container>
  );
}
