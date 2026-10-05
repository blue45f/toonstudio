import { Briefcase, Check, Loader2 } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";

import { CreatorRoleProfileEditor } from "./CreatorRoleProfileEditor";

import { PageIntro } from "@/shared/components/page-intro";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { getMyProfile, updateMyProfile } from "@/platform/me-client";
import type { CreatorRoleProfile } from "@/shared/lib/creator-role-contract";
import { useI18n } from "@/shared/lib/i18n";
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";

/**
 * R-3 개인화 진입점 통합: 직군 프로필(층 A)과 작업환경 개인화를 설정의
 * "내 직군 · 작업환경" 한 화면으로 모은다. 프로필 편집기는 프로필 페이지(/me)와
 * 같은 서버 프로필을 편집하고, 작업환경 탭은 기존 개인화 센터 패널을 그대로 쓴다.
 * 라이브러리의 `#role-personalization` 딥링크는 요약+이 진입점 링크로 안내한다.
 */
function bi(ko: string, en: string): string {
  return translateBilingualValueForActiveLocale("RoleWorkspaceSettingsPage", ko, en);
}

const StudioLibraryPersonalizePanels = lazyRetry(
  () =>
    import("@/domains/creator/public/role-personalization").then((module) => ({
      default: module.StudioLibraryPersonalizePanels,
    })),
  "RoleWorkspacePersonalizePanels",
);

type RoleSettingsTab = "profile" | "workspace";

const ROLE_SETTINGS_TABS: readonly { key: RoleSettingsTab; label: readonly [string, string] }[] = [
  { key: "profile", label: ["내 직군", "My role"] },
  { key: "workspace", label: ["작업환경", "Workspace"] },
];

export function RoleWorkspaceSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = useI18n((state) => state.lang);
  const tab: RoleSettingsTab = searchParams.get("tab") === "workspace" ? "workspace" : "profile";

  const selectTab = (next: RoleSettingsTab) => {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (next === "profile") params.delete("tab");
        else params.set("tab", next);
        return params;
      },
      { replace: true },
    );
  };

  return (
    <Container className="py-10">
      <PageIntro variant="restrained">
        {bi("직군과 작업환경", "Role and workspace")}
      </PageIntro>
      <SitePageHeader
        surface="plain"
        className="mb-6"
        icon={Briefcase}
        eyebrow={bi("설정", "Settings")}
        title={bi("내 직군 · 작업환경", "My role · workspace")}
        description={bi(
          "직군은 기능 접근을 막는 권한이 아니라, 자주 쓰는 화면·기본 선택·알림 수준을 내 일에 맞게 바꿔 주는 프리셋입니다. 직군을 바꿔도 모든 기능을 그대로 쓸 수 있습니다.",
          "Your role is not a permission gate — it is a preset that tunes default views, shortcuts and notification levels to your work. Every feature stays available either way.",
        )}
        aside={
          <Link to="/settings" className={buttonClass({ variant: "outline" })}>
            {bi("설정으로 돌아가기", "Back to settings")}
          </Link>
        }
      />

      <div role="tablist" aria-label={bi("직군·작업환경 설정", "Role and workspace settings")} className="mb-6 flex flex-wrap gap-2">
        {ROLE_SETTINGS_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => selectTab(item.key)}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors",
              tab === item.key
                ? "border-accent bg-accent text-white"
                : "border-line bg-raised text-fg-2 hover:border-accent/50 hover:text-fg",
            )}
          >
            {bi(item.label[0], item.label[1])}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <div role="tabpanel">
          <RoleProfileSettingsSection />
        </div>
      ) : (
        <div role="tabpanel">
          <Suspense
            fallback={
              <div role="status" className="rounded-2xl border border-line bg-panel/40 p-5 text-sm text-fg-2">
                {bi("작업환경 설정을 불러오는 중…", "Loading workspace settings…")}
              </div>
            }
          >
            <StudioLibraryPersonalizePanels locale={lang} />
          </Suspense>
        </div>
      )}
    </Container>
  );
}

/** 직군 프로필 편집 — /me의 프로필 편집기와 같은 서버 프로필(creatorRoleProfile)을 저장한다. */
function RoleProfileSettingsSection() {
  const userId = useApp((state) => state.userId);
  const [value, setValue] = useState<CreatorRoleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    getMyProfile(controller.signal)
      .then((profile) => {
        if (!alive) return;
        setValue(profile.creatorRoleProfile);
        setDirty(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : bi("직군 프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "Could not load your role profile. Please try again."),
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId, reloadKey]);

  if (!userId) {
    return (
      <section className="rounded-2xl border border-line bg-panel/40 p-5">
        <h2 className="text-sm font-semibold text-fg">{bi("로그인이 필요합니다", "Sign in required")}</h2>
        <p className="mt-1 text-sm leading-6 text-fg-2">
          {bi(
            "내 직군은 로그인한 계정의 프로필에 저장됩니다. 로그인하면 직군과 작업 스타일을 정할 수 있어요.",
            "Your role is saved on your account profile. Sign in to set your role and working style.",
          )}
        </p>
        <Link to="/auth/login" className={buttonClass({ variant: "solid", className: "mt-4" })}>
          {bi("로그인하기", "Sign in")}
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <div role="status" className="rounded-2xl border border-line bg-panel/40 p-5">
        <span className="sr-only">{bi("직군 프로필을 불러오는 중…", "Loading role profile…")}</span>
        <span className="skeleton mb-4 block h-5 w-28 rounded" aria-hidden />
        <span className="skeleton block h-11 rounded-xl" aria-hidden />
        <span className="skeleton mt-3 block h-24 rounded-xl" aria-hidden />
      </div>
    );
  }

  if (loadError || !value) {
    return (
      <section className="rounded-2xl border border-line bg-panel/40 p-5">
        <p role="alert" className="text-sm text-bad">
          {loadError ?? bi("직군 프로필을 불러오지 못했습니다.", "Could not load your role profile.")}
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className={buttonClass({ variant: "outline", className: "mt-4" })}
        >
          {bi("다시 시도", "Retry")}
        </button>
      </section>
    );
  }

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMyProfile({ creatorRoleProfile: value });
      setValue(updated.creatorRoleProfile);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : bi("직군 프로필을 저장하지 못했습니다.", "Could not save your role profile."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <CreatorRoleProfileEditor
        value={value}
        onChange={(next) => {
          setValue(next);
          setDirty(true);
          setSaved(false);
        }}
        disabled={saving}
      />
      {error ? (
        <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className={buttonClass({ variant: "solid", className: "gap-1.5" })}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : null}
          {saving
            ? bi("저장 중…", "Saving…")
            : saved
              ? bi("저장됨", "Saved")
              : bi("직군 프로필 저장", "Save role profile")}
        </button>
        {dirty ? <span className="text-xs text-fg-3">{bi("저장 전 변경 사항이 있습니다", "Unsaved changes")}</span> : null}
      </div>
    </div>
  );
}
