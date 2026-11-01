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
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";

import {
  ActivityTab,
  DeleteAccountDialog,
  PostsTab,
  ProfilePreview,
  SignInPrompt,
} from "./AccountPageSubSections";
import { CreatorRoleProfileEditor } from "./CreatorRoleProfileEditor";
import {
  captureProfileDraftScope,
  changedProfileFields,
  clearProfileDraft,
  getProfileDraftIdentityGeneration,
  isProfileDraftScopeCurrent,
  readProfileDraft,
  subscribeProfileDraftIdentity,
  writeProfileDraft,
  type ProfileDraftFields,
} from "./account-profile-draft";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getCurrentUserId } from "@/platform/creator-client";
import { getMyProfileForEditing, updateMyProfile } from "@/platform/me-client";
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
  const [roleProfileTouched, setRoleProfileTouched] = useState(false);
  const [profileLoading, setProfileLoading] = useState(Boolean(user?.id));
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<ProfileDraftFields | null>(null);
  const [draftScope] = useState(() => captureProfileDraftScope(userId));
  const draftRevision = useRef<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [draftRecovered, setDraftRecovered] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
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
    setRoleProfileTouched(false);
    // 편집 시작·재시도에는 서버의 최신 값을 읽는다. 폼은 조회가 끝날 때까지 잠근다.
    getMyProfileForEditing(controller.signal)
      .then((profile) => {
        if (!alive || !isProfileDraftScopeCurrent(draftScope)) return;
        const serverFields: ProfileDraftFields = {
          name: profile.name || "",
          bio: profile.bio || "",
          image: profile.image ?? null,
          creatorRoleProfile: profile.creatorRoleProfile,
        };
        const recovered = readProfileDraft(draftScope);
        // 손댄 필드만 복구해 다른 화면에서 갱신한 서버 값은 그대로 둔다.
        const fields = { ...serverFields, ...recovered?.patch };
        draftRevision.current = recovered?.revision ?? null;
        setName(fields.name);
        setBio(fields.bio);
        setImage(fields.image);
        setCreatorRoleProfile(fields.creatorRoleProfile);
        setRoleProfileTouched(Boolean(recovered?.patch.creatorRoleProfile));
        setDraftRecovered(recovered !== null);
        setLoaded(serverFields);
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
  }, [user?.id, reloadKey, draftScope]);

  // 저장되지 않은 변경 여부 — 미리보기 배지로 표시한다.
  const dirty =
    roleProfileTouched ||
    (loaded !== null &&
      (name !== loaded.name || bio !== loaded.bio || (image ?? null) !== loaded.image));

  const profileUnavailable = profileLoading || loadError || loaded === null;
  const editingDisabled = saving || profileUnavailable;

  // 라우터를 막거나 영구 저장하지 않고 같은 로그인 세션의 화면 왕복을 보호한다.
  useEffect(() => {
    if (!loaded || profileUnavailable) return;
    if (dirty) {
      draftRevision.current = writeProfileDraft(draftScope, changedProfileFields(
        { name, bio, image, creatorRoleProfile }, loaded, roleProfileTouched,
      ));
    } else {
      clearProfileDraft(draftScope, draftRevision.current);
    }
  }, [name, bio, image, creatorRoleProfile, loaded, roleProfileTouched, dirty, profileUnavailable, draftScope]);

  const markEdited = useCallback(() => {
    setSaved(false);
    setError(null);
  }, []);

  const onSave = async () => {
    // 표시뿐 아니라 이벤트 경계도 막아 조회 실패·중복 제출로 덮어쓰지 않는다.
    if (!isProfileDraftScopeCurrent(draftScope)
      || savingRef.current || profileUnavailable || !loaded || !name.trim() || !dirty) return;
    savingRef.current = true;
    const savingDraftRevision = draftRevision.current;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMyProfile({
        // 변경한 필드만 보내 다른 화면에서 저장한 직무·사진을 덮어쓰지 않는다.
        ...(name !== loaded.name ? { name: name.trim() } : {}),
        ...(bio !== loaded.bio ? { bio: bio.trim() } : {}),
        ...(image !== loaded.image ? { image } : {}),
        ...(roleProfileTouched ? { creatorRoleProfile } : {}),
      });
      if (!isProfileDraftScopeCurrent(draftScope)) return;
      clearProfileDraft(draftScope, savingDraftRevision);
      setDraftRecovered(false);
      setCreatorRoleProfile(updated.creatorRoleProfile);
      setRoleProfileTouched(false);
      setLoaded({
        name: updated.name || "",
        bio: updated.bio || "",
        image: updated.image ?? null,
        creatorRoleProfile: updated.creatorRoleProfile,
      });
      setName(updated.name || "");
      setBio(updated.bio || "");
      setImage(updated.image ?? null);
      setSaved(true);
    } catch (err) {
      if (!isProfileDraftScopeCurrent(draftScope)) return;
      setError(err instanceof Error ? err.message : t("account.profile.errorSave"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const discardDraft = () => {
    if (!loaded || editingDisabled) return;
    clearProfileDraft(draftScope, draftRevision.current);
    setName(loaded.name);
    setBio(loaded.bio);
    setImage(loaded.image);
    setCreatorRoleProfile(loaded.creatorRoleProfile);
    setRoleProfileTouched(false);
    setDraftRecovered(false);
    setSaved(false);
    setError(null);
    nameInputRef.current?.focus();
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
    <form
      aria-label={bi("공개 프로필 편집", "Edit public profile")}
      onSubmit={(event) => { event.preventDefault(); void onSave(); }}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start"
    >
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
      {draftRecovered && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/40 px-4 py-3">
          <p className="text-sm text-fg-2">{t("account.profile.draftRecovered")}</p>
          <button
            type="button"
            onClick={discardDraft}
            disabled={editingDisabled}
            className={buttonClass({ variant: "outline", className: "min-h-11" })}
          >
            {t("account.profile.discardDraft")}
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
          disabled={editingDisabled}
        />
      </section>

      <section className="rounded-2xl border border-line bg-panel/40 p-5 space-y-4">
        <div>
          <label htmlFor="profile-name" className="mb-1.5 block text-sm font-semibold text-fg">
            {t("account.profile.nameLabel")}
          </label>
          <input
            ref={nameInputRef}
            id="profile-name"
            type="text"
            value={name}
            maxLength={60}
            required
            aria-invalid={nameInvalid}
            aria-describedby={nameInvalid ? "profile-name-required" : undefined}
            onChange={(e) => {
              setName(e.target.value);
              markEdited();
            }}
            disabled={editingDisabled}
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
            disabled={editingDisabled}
            className="w-full resize-none rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent/70 focus-visible:ring-2 focus-visible:ring-accent/40"
            placeholder={t("account.profile.bioPlaceholder")}
          />
          <p className="mt-1 text-right text-[0.7rem] text-fg-3 numeral">
            {t("account.profile.bioLength").replace("{length}", String(bio.length))}
          </p>
        </div>
      </section>

      <details className="rounded-2xl border border-line bg-panel/40">
        <summary className="min-h-11 cursor-pointer rounded-2xl px-5 py-3 text-sm font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {bi("직무·협업 정보 (선택)", "Role and collaboration (optional)")}
          <span className="ml-2 text-xs font-normal text-fg-2">
            {roleProfileTouched
              ? bi("저장 전", "Unsaved")
              : creatorRoleProfile.primaryRole
                ? bi("설정한 직무 확인·수정", "Review or edit your role")
                : bi("필요할 때 추가하세요", "Add when needed")}
          </span>
        </summary>
        <div className="p-3 pt-0">
          <CreatorRoleProfileEditor
            value={creatorRoleProfile}
            onChange={(next) => {
              setCreatorRoleProfile(next);
              setRoleProfileTouched(true);
              markEdited();
            }}
            disabled={editingDisabled}
          />
        </div>
      </details>

      {error && (
        <p className="rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={editingDisabled || nameInvalid || !dirty}
          className={buttonClass({ variant: "solid", className: "gap-1.5" })}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : null}
          {saving ? t("account.profile.saving") : saved ? t("account.profile.saved") : t("account.profile.saveButton")}
        </button>
        {nameInvalid && <span id="profile-name-required" className="text-xs text-fg-3">{t("account.profile.nameRequired")}</span>}
      </div>
      <p role="status" aria-live="polite" className="text-sm text-fg-2">
        {saved ? bi("프로필을 저장했어요.", "Your profile has been saved.")
          : draftRecovered ? t("account.profile.draftRestored") : null}
      </p>

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

    </form>
  );
}

export function AccountPage() {
  const t = useT();
  const { status } = useSession();
  const profileIdentityGeneration = useSyncExternalStore(
    subscribeProfileDraftIdentity,
    getProfileDraftIdentityGeneration,
    getProfileDraftIdentityGeneration,
  );
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
              id={`account-tab-${option.id}`}
              aria-controls={`account-panel-${option.id}`}
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

      <section id="account-panel-posts" role="tabpanel" aria-labelledby="account-tab-posts" hidden={tab !== "posts"}>
        {tab === "posts" && <PostsTab userId={userId} />}
      </section>
      <section id="account-panel-activity" role="tabpanel" aria-labelledby="account-tab-activity" hidden={tab !== "activity"}>
        {tab === "activity" && <ActivityTab />}
      </section>
      {/* 같은 계정 재로그인도 새 폼으로 열고 일반 프로필 갱신은 기존 입력을 유지한다. */}
      <section id="account-panel-profile" role="tabpanel" aria-labelledby="account-tab-profile" hidden={tab !== "profile"}>
        <ProfileTab key={`${userId}:${profileIdentityGeneration}`} userId={userId} />
      </section>
    </Container>
  );
}
