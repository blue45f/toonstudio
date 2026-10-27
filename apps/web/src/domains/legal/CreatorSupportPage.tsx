import {
  GraduationCap,
  HandHeart,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  CREATOR_SUPPORT_CATEGORIES,
  CREATOR_SUPPORT_OFFER_TYPES,
  validateCreatorSupportApplication,
  type CreatorSupportCategory,
  type CreatorSupportNeed,
  type CreatorSupportOfferType,
  type CreatorSupportProject,
} from "@toonstudio/core/creator-support";

import "./creator-support-i18n";
import {
  CreatorSupportApplicationSection,
  type CreatorSupportApplicationForm,
  type CreatorSupportSubmitStatus,
} from "./CreatorSupportApplicationSection";
import {
  getMyCreatorSupportApplication,
  listCreatorSupportProjects,
  listMyCreatorSupportOffers,
  submitCreatorSupportApplication,
  submitCreatorSupportOffer,
  type CreatorSupportApplicationSnapshot,
  type CreatorSupportReceivedOffer,
} from "./creator-support-api";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { getApiErrorMessage } from "@/platform/api";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { useT } from "@/shared/lib/i18n";
import { MotionEmptyState } from "@/shared/motion-assets/motion-assets-empty";

const CATEGORY_ICONS: Record<CreatorSupportCategory, typeof GraduationCap> = {
  student: GraduationCap,
  amateur: Lightbulb,
  emerging: Sparkles,
};

/** 프로젝트 카드 모양의 로딩 스켈레톤: 실제 카드 레이아웃과 같은 자리를 차지한다. */
function CreatorSupportProjectSkeleton() {
  const t = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label={t("creatorSupport.projects.loading")}>
      {[0, 1, 2, 3].map((key) => (
        <div key={key} className="animate-pulse rounded-3xl border border-line bg-card p-6" aria-hidden="true">
          <div className="flex items-start justify-between gap-3">
            <div className="size-11 rounded-xl bg-panel" />
            <div className="h-6 w-20 rounded-full bg-panel" />
          </div>
          <div className="mt-4 h-6 w-2/3 rounded-lg bg-panel" />
          <div className="mt-2 h-4 w-1/3 rounded-lg bg-panel" />
          <div className="mt-3 space-y-2">
            <div className="h-4 rounded-lg bg-panel" />
            <div className="h-4 w-5/6 rounded-lg bg-panel" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-16 rounded-full bg-panel" />
            <div className="h-6 w-20 rounded-full bg-panel" />
          </div>
        </div>
      ))}
    </div>
  );
}

const NEED_KEY = (need: CreatorSupportNeed) => `creatorSupport.needs.${need}`;
const formatWon = (value: number) => `₩${value.toLocaleString("ko-KR")}`;

const INITIAL_APPLICATION: CreatorSupportApplicationForm = {
  category: "student",
  ageBand: "adult",
  applicantRole: "self",
  title: "",
  story: "",
  intendedUse: "",
  supportNeeds: ["mentorship"],
  portfolioUrl: "",
  estimatedBudgetWon: 0,
  guardianConfirmed: false,
  consentAccepted: false,
};

interface OfferForm {
  type: CreatorSupportOfferType;
  contactEmail: string;
  message: string;
  consentAccepted: boolean;
  website: string;
}

const INITIAL_OFFER: OfferForm = {
  type: "mentorship",
  contactEmail: "",
  message: "",
  consentAccepted: false,
  website: "",
};

type SubmitStatus = CreatorSupportSubmitStatus;

export function CreatorSupportPage() {
  const t = useT();
  const { status: sessionStatus } = useSession();
  useDocumentTitle(t("creatorSupport.documentTitle"));

  const [filter, setFilter] = useState<CreatorSupportCategory | "">("");
  const [projects, setProjects] = useState<CreatorSupportProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<CreatorSupportProject | null>(null);
  const [offer, setOffer] = useState<OfferForm>(INITIAL_OFFER);
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerStatus, setOfferStatus] = useState<SubmitStatus>(null);
  const [application, setApplication] = useState<CreatorSupportApplicationForm>(INITIAL_APPLICATION);
  const [applicationBusy, setApplicationBusy] = useState(false);
  const [applicationStatus, setApplicationStatus] = useState<SubmitStatus>(null);
  const [myApplication, setMyApplication] =
    useState<CreatorSupportApplicationSnapshot | null>(null);
  const [receivedOffers, setReceivedOffers] =
    useState<CreatorSupportReceivedOffer[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setLoadError("");
    listCreatorSupportProjects(filter)
      .then((data) => setProjects(data.items))
      .catch((error) =>
        void getApiErrorMessage(error, t("creatorSupport.error.load")).then(setLoadError),
      )
      .finally(() => setLoading(false));
  }, [filter, t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPrivate = useCallback(() => {
    if (sessionStatus !== "authenticated") {
      setMyApplication(null);
      setReceivedOffers([]);
      setPrivateError("");
      return;
    }
    setPrivateLoading(true);
    setPrivateError("");
    Promise.all([
      getMyCreatorSupportApplication(),
      listMyCreatorSupportOffers(),
    ])
      .then(([applicationResponse, offerResponse]) => {
        setMyApplication(applicationResponse.item);
        setReceivedOffers(offerResponse.items);
      })
      .catch((error) => {
        // 조회 실패를 "신청 없음·제안 없음"으로 위장하지 않는다.
        void getApiErrorMessage(error, t("creatorSupport.mine.loadError")).then(
          setPrivateError,
        );
      })
      .finally(() => setPrivateLoading(false));
  }, [sessionStatus, t]);

  useEffect(() => {
    loadPrivate();
  }, [loadPrivate]);

  const toggleNeed = (need: CreatorSupportNeed) => {
    setApplication((current) => ({
      ...current,
      supportNeeds: current.supportNeeds.includes(need)
        ? current.supportNeeds.filter((item) => item !== need)
        : [...current.supportNeeds, need],
    }));
  };

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (applicationBusy) return;
    // 서버와 같은 계약(코어 검증기)으로 제출 전에 막는다. 빈 신청·동의 미체크가
    // 네트워크를 타면 사용자는 사유를 늦게, 그것도 뭉개진 문구로 보게 된다.
    const parsed = validateCreatorSupportApplication(application);
    if (!parsed.ok) {
      setApplicationStatus({ kind: "error", message: parsed.error });
      return;
    }
    setApplicationBusy(true);
    setApplicationStatus(null);
    try {
      await submitCreatorSupportApplication(parsed.value);
      setApplicationStatus({
        kind: "success",
        message: t("creatorSupport.apply.success"),
      });
      setApplication(INITIAL_APPLICATION);
      loadPrivate();
    } catch (error) {
      setApplicationStatus({
        kind: "error",
        message: await getApiErrorMessage(error, t("creatorSupport.error.submit")),
      });
    } finally {
      setApplicationBusy(false);
    }
  };

  const submitOffer = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || offerBusy) return;
    setOfferBusy(true);
    setOfferStatus(null);
    try {
      await submitCreatorSupportOffer(selected.id, offer);
      setOfferStatus({
        kind: "success",
        message: t("creatorSupport.offer.success"),
      });
      setOffer(INITIAL_OFFER);
    } catch (error) {
      setOfferStatus({
        kind: "error",
        message: await getApiErrorMessage(error, t("creatorSupport.error.submit")),
      });
    } finally {
      setOfferBusy(false);
    }
  };

  const filters = useMemo(
    () => [
      ["", t("creatorSupport.filters.all")],
      ...CREATOR_SUPPORT_CATEGORIES.map((value) => [
        value,
        t(`creatorSupport.filters.${value}`),
      ]),
    ] as const,
    [t],
  );

  return (
    <Container size="wide" className="py-8 sm:py-12 lg:py-16">
      <SiteContextualSubNav pathnameOverride="/community" className="mb-5" />
      <PublicStoryHero
        purpose="community"
        eyebrow={t("creatorSupport.hero.eyebrow")}
        title={t("creatorSupport.hero.title")}
        description={t("creatorSupport.hero.description")}
        image="materials"
        imageAlt={t("creatorSupport.hero.imageAlt")}
        caption={t("creatorSupport.hero.caption")}
      >
        <a
          href="#creator-support-projects"
          className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent"
        >
          <HandHeart size={17} aria-hidden="true" />
          {t("creatorSupport.hero.browse")}
        </a>
        <a
          href="#creator-support-apply"
          className="ml-3 inline-flex min-h-12 items-center text-sm font-semibold text-fg-2 hover:text-accent"
        >
          {t("creatorSupport.hero.apply")}
        </a>
      </PublicStoryHero>

      {/* 첫 화면에서 받는 사람·주는 사람의 두 갈래를 나눈다 — 히어로 버튼만으로는 두 흐름이 읽히지 않았다. */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-line bg-card p-5 sm:p-6">
          <HandHeart className="size-6 text-accent" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-fg">{t("creatorSupport.paths.receiveTitle")}</h2>
          <p className="mt-1.5 text-sm leading-6 text-fg-2">{t("creatorSupport.paths.receiveBody")}</p>
          <a href="#creator-support-apply" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-accent hover:underline">
            {t("creatorSupport.hero.apply")}
          </a>
        </div>
        <div className="rounded-3xl border border-line bg-card p-5 sm:p-6">
          <Lightbulb className="size-6 text-accent" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold text-fg">{t("creatorSupport.paths.giveTitle")}</h2>
          <p className="mt-1.5 text-sm leading-6 text-fg-2">{t("creatorSupport.paths.giveBody")}</p>
          <a href="#creator-support-projects" className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-accent hover:underline">
            {t("creatorSupport.hero.browse")}
          </a>
        </div>
      </section>

      <section
        id="creator-support-projects"
        className="mt-8"
        aria-labelledby="creator-support-projects-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent">
              SUPPORT DISCOVERY
            </p>
            <h2 id="creator-support-projects-title" className="mt-1 text-2xl font-bold text-fg">
              {t("creatorSupport.projects.title")}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("creatorSupport.projects.title")}>
            {filters.map(([value, label]) => (
              <button
                key={value || "all"}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value as CreatorSupportCategory | "")}
                className={`min-h-11 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  filter === value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-8">
            <CreatorSupportProjectSkeleton />
          </div>
        ) : loadError ? (
          <div className="mt-6">
            <MotionEmptyState
              kind="error"
              title={loadError}
              action={
                <button
                  type="button"
                  onClick={load}
                  className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
                >
                  {t("common.retry")}
                </button>
              }
            />
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-6">
            <MotionEmptyState kind="empty" title={t("creatorSupport.projects.empty")} />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {projects.map((project) => {
              const Icon = CATEGORY_ICONS[project.category];
              return (
                <article key={project.id} className="rounded-3xl border border-line bg-card p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl border border-line bg-panel text-accent">
                      <Icon size={21} aria-hidden="true" />
                    </span>
                    <span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-bold text-fg-3">
                      {t(`creatorSupport.filters.${project.category}`)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-bold text-fg">{project.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-accent">{project.creatorName}</p>
                  <p className="mt-3 line-clamp-4 text-sm leading-7 text-fg-2">
                    {project.story}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.supportNeeds.map((need) => (
                      <span key={need} className="rounded-full bg-panel px-3 py-1 text-xs text-fg-2">
                        {t(NEED_KEY(need))}
                      </span>
                    ))}
                  </div>
                  {project.estimatedBudgetWon > 0 ? (
                    <p className="mt-4 text-sm text-fg-3">
                      {t("creatorSupport.project.budget")} ·{" "}
                      <strong className="text-fg">{formatWon(project.estimatedBudgetWon)}</strong>
                    </p>
                  ) : null}
                  <p className="mt-3 rounded-xl border border-line bg-panel/60 px-4 py-3 text-xs leading-5 text-fg-3">
                    {t(
                      project.monetarySupportEnabled
                        ? "creatorSupport.project.moneyReady"
                        : "creatorSupport.project.moneyPending",
                    )}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(project);
                        setOfferStatus(null);
                      }}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent"
                    >
                      <HandHeart size={15} aria-hidden="true" />
                      {t("creatorSupport.project.offer")}
                    </button>
                    {project.portfolioUrl ? (
                      <a
                        href={project.portfolioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-10 items-center rounded-xl border border-line px-4 text-sm font-semibold text-fg-2"
                      >
                        {t("creatorSupport.project.portfolio")}
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {selected ? (
        <section className="mt-6 rounded-3xl border border-accent/30 bg-card p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-accent">PRIVATE OFFER</p>
              <h2 className="mt-1 text-xl font-bold text-fg">{t("creatorSupport.offer.title")}</h2>
              <p className="mt-2 text-sm text-fg-2">{selected.title} · {selected.creatorName}</p>
              <p className="mt-1 text-xs leading-5 text-fg-3">{t("creatorSupport.offer.description")}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-xl border border-line px-3 py-2 text-sm text-fg-2"
            >
              {t("creatorSupport.offer.close")}
            </button>
          </div>
          <form onSubmit={submitOffer} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.offer.type")}
              <select
                value={offer.type}
                onChange={(event) =>
                  setOffer((current) => ({
                    ...current,
                    type: event.target.value as CreatorSupportOfferType,
                  }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              >
                {CREATOR_SUPPORT_OFFER_TYPES.map((type) => (
                  <option key={type} value={type}>{t(NEED_KEY(type as CreatorSupportNeed))}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-fg">
              {t("creatorSupport.offer.email")}
              <input
                type="email"
                value={offer.contactEmail}
                onChange={(event) =>
                  setOffer((current) => ({ ...current, contactEmail: event.target.value }))
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3"
              />
            </label>
            <label className="sm:col-span-2 text-sm font-semibold text-fg">
              {t("creatorSupport.offer.message")}
              <textarea
                rows={4}
                maxLength={2000}
                value={offer.message}
                onChange={(event) =>
                  setOffer((current) => ({ ...current, message: event.target.value }))
                }
                className="mt-2 w-full rounded-xl border border-line bg-panel px-3 py-2"
              />
            </label>
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={offer.website}
              onChange={(event) =>
                setOffer((current) => ({ ...current, website: event.target.value }))
              }
              className="hidden"
            />
            <label className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-line bg-panel/60 p-3 text-sm text-fg-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={offer.consentAccepted}
                onChange={(event) =>
                  setOffer((current) => ({ ...current, consentAccepted: event.target.checked }))
                }
              />
              <span>{t("creatorSupport.offer.consent")}</span>
            </label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={offerBusy}
                className="min-h-11 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent disabled:opacity-60"
              >
                {t("creatorSupport.offer.submit")}
              </button>
              {offerStatus ? (
                <p
                  role={offerStatus.kind === "error" ? "alert" : "status"}
                  className="text-sm text-fg-2"
                >
                  {offerStatus.message}
                </p>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {sessionStatus === "authenticated" ? (
        <section
          className="mt-8 rounded-3xl border border-line bg-card p-6 sm:p-8"
          aria-labelledby="creator-support-my-title"
        >
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            PRIVATE SUPPORT INBOX
          </p>
          <h2 id="creator-support-my-title" className="mt-1 text-2xl font-bold text-fg">
            {t("creatorSupport.mine.title")}
          </h2>
          <p className="mt-2 text-sm leading-7 text-fg-2">
            {t("creatorSupport.mine.description")}
          </p>
          {privateLoading ? (
            <p className="mt-5 text-sm text-fg-3">{t("creatorSupport.mine.loading")}</p>
          ) : privateError ? (
            <div className="mt-5">
              <MotionEmptyState
                kind="error"
                title={privateError}
                action={
                  <button
                    type="button"
                    onClick={loadPrivate}
                    className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 py-2 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
                  >
                    {t("common.retry")}
                  </button>
                }
              />
            </div>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <article className="rounded-2xl border border-line bg-panel/55 p-5">
                <p className="text-xs font-bold text-fg-3">
                  {t("creatorSupport.mine.application")}
                </p>
                {myApplication ? (
                  <>
                    <h3 className="mt-2 font-bold text-fg">{myApplication.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-line bg-card px-2.5 py-1 text-fg-2">
                        {myApplication.status}
                      </span>
                      <span className="rounded-full border border-line bg-card px-2.5 py-1 text-fg-2">
                        {myApplication.payoutStatus}
                      </span>
                    </div>
                    {myApplication.reviewNote ? (
                      <p className="mt-3 rounded-xl border border-line bg-card p-3 text-sm leading-6 text-fg-2">
                        {myApplication.reviewNote}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 text-sm text-fg-3">
                    {t("creatorSupport.mine.noApplication")}
                  </p>
                )}
              </article>
              <article className="rounded-2xl border border-line bg-panel/55 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold text-fg-3">
                    {t("creatorSupport.mine.offers")}
                  </p>
                  <span className="text-xs text-fg-3">{receivedOffers.length}</span>
                </div>
                {receivedOffers.length ? (
                  <div className="mt-3 space-y-3">
                    {receivedOffers.map((received) => (
                      <div key={received.id} className="rounded-xl border border-line bg-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-fg">{received.type}</p>
                          <span className="text-xs font-semibold text-fg-3">
                            {received.status}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg-2">
                          {received.message}
                        </p>
                        <p className="mt-3 text-sm font-semibold text-accent">
                          {received.contactEmail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-fg-3">{t("creatorSupport.mine.noOffers")}</p>
                )}
              </article>
            </div>
          )}
        </section>
      ) : (
        <section className="mt-8 rounded-3xl border border-line bg-panel/55 p-6">
          <p className="text-sm leading-6 text-fg-2">{t("creatorSupport.mine.signIn")}</p>
        </section>
      )}


      <CreatorSupportApplicationSection
        sessionStatus={sessionStatus}
        application={application}
        setApplication={setApplication}
        toggleNeed={toggleNeed}
        submitApplication={submitApplication}
        applicationBusy={applicationBusy}
        applicationStatus={applicationStatus}
      />
    </Container>
  );
}
