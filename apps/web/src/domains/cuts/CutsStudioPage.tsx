/**
 * 컷츠 스튜디오 — 클립 만들기 (`/cuts/studio`).
 *
 * 3단계: ① 회차 선택 → ② 자동 변환 미리보기 → ③ 게시.
 * 미리보기까지는 로그인 없이 가능하고, 게시 버튼을 누르면
 * 게스트에게 로그인 유도를 띄운다.
 */

import { ArrowLeft, ArrowRight, Check, ChevronDown, Clapperboard, Coins, Shuffle, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { awardCutsClipPublished } from "@/domains/account/public/asset-points";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useAuthActorId } from "@/domains/auth/public/session/use-auth-actor-id";

import { CutsPlayer } from "./CutsPlayer";
import { CutsRemixBadge } from "./CutsRemixBadge";
import { CutsRhythmDirectorPanel } from "./CutsRhythmDirectorPanel";
import { buildCutsClip, formatClipDuration } from "./cuts-clip-builder";
import {
  applyPresetToRhythmConfig,
  applyRhythmToClip,
  DEFAULT_CUTS_RHYTHM_CONFIG,
  loadCutsRhythmConfig,
  nudgeShotDurationOffset,
  saveCutsRhythmConfig,
  type CutsPlaybackRate,
  type CutsRhythmConfig,
  type CutsRhythmPresetId,
} from "./cuts-rhythm-director";
import {
  buildRemixClip,
  guardRemixPublish,
  resolveRemixAllowed,
  type RemixPolicyOverrides,
} from "./cuts-remix";
import { DEMO_EPISODES } from "./cuts-seed";
import { useCutsHydrated, useCutsStore } from "./cuts-store";
import type { CutsClip, EpisodeSource } from "./cuts-types";

import "./cuts.css";

type StudioStep = "select" | "preview" | "done";

type StudioEnginePreset =
  | "gsap-parallax-25d"
  | "rive-spine-state-rig"
  | "vrew-insertoon-beat-sync"
  | "elevenlabs-typecast-lufs14";

type StudioTargetFps = "60fps-webgpu" | "120fps-promotion" | "24fps-anime-cel";

const STEP_LABELS = [
  { id: "select", ko: "1. 회차 선택", en: "1. Pick an episode" },
  { id: "preview", ko: "2. 변환 미리보기", en: "2. Preview conversion" },
  { id: "done", ko: "3. 게시 완료", en: "3. Published" },
] as const;

function Stepper({ step }: Readonly<{ step: StudioStep }>) {
  const t = useBilingual("cuts");
  const order: StudioStep[] = ["select", "preview", "done"];
  const currentIndex = order.indexOf(step);
  return (
    <ol className="cuts-studio__steps" aria-label={t("클립 만들기 단계", "Clip creation steps")}>
      {STEP_LABELS.map((label, index) => (
        <li
          key={label.id}
          className={
            `cuts-studio__step` +
            (index === currentIndex ? " cuts-studio__step--current" : "") +
            (index < currentIndex ? " cuts-studio__step--done" : "")
          }
          aria-current={index === currentIndex ? "step" : undefined}
        >
          {t(label.ko, label.en)}
        </li>
      ))}
    </ol>
  );
}

function EpisodePicker({
  selected,
  onSelect,
  remixOverrides,
}: Readonly<{
  selected: EpisodeSource | null;
  onSelect: (episode: EpisodeSource) => void;
  remixOverrides: RemixPolicyOverrides;
}>) {
  const t = useBilingual("cuts");
  return (
    <div
      className="cuts-episode-list"
      role="radiogroup"
      aria-label={t("회차 선택", "Choose an episode")}
    >
      {DEMO_EPISODES.map((episode) => {
        const checked = selected?.titleId === episode.titleId
          && selected?.episodeNumber === episode.episodeNumber;
        const preview = buildCutsClip(episode, "preview");
        const remixAllowed = resolveRemixAllowed(episode, remixOverrides);
        return (
          <button
            key={`${episode.titleId}-ep${episode.episodeNumber}`}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`cuts-episode-card${checked ? " cuts-episode-card--selected" : ""}`}
            onClick={() => onSelect(episode)}
          >
            {preview ? (
              <img src={preview.thumbnailUrl} alt="" aria-hidden="true" />
            ) : null}
            <span>
              <h3>{episode.title}</h3>
              <p>{t("{{episode}}화 · {{episodeTitle}}", "Ep.{{episode}} · {{episodeTitle}}")
                .replace("{{episode}}", String(episode.episodeNumber))
                .replace("{{episodeTitle}}", episode.episodeTitle)}</p>
              <p>{episode.author}</p>
              <p>
                {t("{{panels}}개 패널", "{{panels}} panels").replace("{{panels}}", String(episode.panels.length))}
                {preview ? ` · ${formatClipDuration(preview.durationMs)}` : ""}
              </p>
              {remixAllowed ? (
                <p className="cuts-episode-card__remix">
                  <Shuffle size={13} aria-hidden="true" /> {t("팬 리믹스 허용 중", "Fan remixes allowed")}
                </p>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 작가 설정 — 작품별 팬 리믹스 허용 토글. 기본값은 허용 안 함(opt-in)이다. */
function RemixPolicySettings() {
  const t = useBilingual("cuts");
  const actorId = useAuthActorId();
  const remixOverrides = useCutsStore((state) => state.remixPolicyOverrides);
  const setRemixAllowed = useCutsStore((state) => state.setRemixAllowed);

  const handleToggle = (episode: EpisodeSource) => {
    const allowed = resolveRemixAllowed(episode, remixOverrides);
    const result = setRemixAllowed(
      { titleId: episode.titleId, episodeNumber: episode.episodeNumber },
      !allowed,
      actorId,
    );
    if (result.needsLogin) {
      requestAuthModalOpen({ reason: "protected-action", source: "cuts-remix-toggle" });
    }
  };

  return (
    <section
      className="cuts-remix-settings"
      aria-label={t("작가 설정", "Creator settings")}
    >
      <h2>{t("작가 설정 — 팬 리믹스 허용", "Creator settings — fan remix permission")}</h2>
      <p>
        {t(
          "허용을 켠 작품은 팬이 내 회차로 새 컷츠를 만들 수 있어요. 만든 클립에는 원작 표시가 자동으로 붙고 지울 수 없어요.",
          "Titles you allow can be remixed by fans into new Cuts. Original credit is attached automatically and cannot be removed.",
        )}
      </p>
      {DEMO_EPISODES.map((episode) => {
        const allowed = resolveRemixAllowed(episode, remixOverrides);
        return (
          <div
            key={`${episode.titleId}-ep${episode.episodeNumber}`}
            className="cuts-remix-settings__row"
          >
            <div className="cuts-remix-settings__meta">
              {episode.title} {episode.episodeNumber}화
              <span>
                {allowed
                  ? t("팬 리믹스 허용 중", "Fan remixes allowed")
                  : t("허용 안 함", "Not allowed")}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowed}
              className="cuts-switch"
              onClick={() => handleToggle(episode)}
              aria-label={t("「{{title}}」 팬 리믹스 허용", "Allow fan remixes of “{{title}}”")
                .replace("{{title}}", episode.title)}
            />
          </div>
        );
      })}
    </section>
  );
}

/** 작가 수익 — 리워드 펀드 정산 대시보드 진입. */
function RewardFundLink() {
  const t = useBilingual("cuts");
  return (
    <section
      className="cuts-remix-settings"
      aria-label={t("리워드 펀드", "Reward fund")}
    >
      <h2>{t("리워드 펀드 정산", "Reward fund settlement")}</h2>
      <p>
        {t(
          "컷츠 조회가 쌓이면 월간 펀드에서 내 몫이 계산돼요. 팬 리믹스가 번 조회도 원작자에게 30%가 돌아와요.",
          "Views on your Cuts earn a share of the monthly fund. Views earned by fan remixes also pay 30% back to you.",
        )}
      </p>
      <Link href="/cuts/rewards" className="cuts-button cuts-button--ghost">
        <Coins size={16} aria-hidden="true" /> {t("정산 대시보드 보기", "Open settlement dashboard")}
      </Link>
    </section>
  );
}

function ClipPreview({
  clip,
  rhythmConfig,
  onSelectPreset,
  onChangeRate,
  onToggleLetterbox,
  onNudgeShot,
  onResetRhythm,
}: Readonly<{
  clip: CutsClip;
  rhythmConfig: CutsRhythmConfig;
  onSelectPreset: (presetId: CutsRhythmPresetId) => void;
  onChangeRate: (rate: CutsPlaybackRate) => void;
  onToggleLetterbox: () => void;
  onNudgeShot: (shotId: string, deltaMs: number) => void;
  onResetRhythm: () => void;
}>) {
  const t = useBilingual("cuts");
  const [muted, setMuted] = useState(true);
  const [activeShotIndex, setActiveShotIndex] = useState(0);
  const [jumpRequest, setJumpRequest] = useState<{ readonly shotIndex: number; readonly nonce: number } | null>(null);
  return (
    <div className="cuts-studio__preview">
      <CutsPlayer
        clip={clip}
        active
        muted={muted}
        onToggleMute={() => setMuted((value) => !value)}
        rhythmPreset={rhythmConfig.presetId}
        playbackRate={rhythmConfig.playbackRate}
        letterbox={rhythmConfig.letterbox}
        jumpRequest={jumpRequest}
        onShotChange={setActiveShotIndex}
      />
      <div>
        {clip.remix ? <CutsRemixBadge clip={clip} /> : null}
        <CutsRhythmDirectorPanel
          clip={clip}
          config={rhythmConfig}
          activeShotIndex={activeShotIndex}
          onSelectPreset={onSelectPreset}
          onChangeRate={onChangeRate}
          onToggleLetterbox={onToggleLetterbox}
          onNudgeShot={onNudgeShot}
          onJumpShot={(index) =>
            setJumpRequest((prev) => ({ shotIndex: index, nonce: (prev?.nonce ?? 0) + 1 }))
          }
          onReset={onResetRhythm}
        />
        <details className="cuts-ssml mt-4">
          <summary>{t("내레이션 대본 코드 보기 (음성 내보내기용)", "View narration script (for cloud voice export)")}</summary>
          <pre>{clip.narrationSsml}</pre>
        </details>
      </div>
    </div>
  );
}

export function CutsStudioPage() {
  const t = useBilingual("cuts");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const actorId = useAuthActorId();
  const publishClip = useCutsStore((state) => state.publishClip);
  const clips = useCutsStore((state) => state.clips);
  const remixPolicyOverrides = useCutsStore((state) => state.remixPolicyOverrides);
  const bindCutsOwner = useCutsStore((state) => state.bindCutsOwner);
  // 복원 전에는 리믹스 정책이 비어 있어 허용 판정이 뒤집힐 수 있다 — bind와
  // 게시를 복원 뒤로 미룬다.
  const cutsHydrated = useCutsHydrated();
  useEffect(() => {
    if (cutsHydrated) bindCutsOwner(actorId);
  }, [cutsHydrated, actorId, bindCutsOwner]);

  // 피드의 "리믹스 만들기" 진입 — ?remixOf={titleId}:{episodeNumber}
  const remixOfParam = searchParams.get("remixOf");
  const remixEpisode = useMemo(() => {
    if (!remixOfParam) return null;
    const separator = remixOfParam.lastIndexOf(":");
    if (separator <= 0) return null;
    const titleId = remixOfParam.slice(0, separator);
    const episodeNumber = Number(remixOfParam.slice(separator + 1));
    if (!Number.isFinite(episodeNumber)) return null;
    return (
      DEMO_EPISODES.find(
        (entry) => entry.titleId === titleId && entry.episodeNumber === episodeNumber,
      ) ?? null
    );
  }, [remixOfParam]);
  const remixParamInvalid = remixOfParam !== null && remixEpisode === null;

  // 원작 메타에 박을 원본 클립 ID — 스토어 원본을 우선하고, 없으면 빌더 규약 ID.
  const originalClipId = useMemo(() => {
    if (!remixEpisode) return null;
    const original = clips.find(
      (clip) =>
        clip.titleId === remixEpisode.titleId
        && clip.episodeNumber === remixEpisode.episodeNumber
        && !clip.remix,
    );
    if (original) return original.id;
    return buildCutsClip(remixEpisode, "preview")?.id ?? null;
  }, [remixEpisode, clips]);

  const [step, setStep] = useState<StudioStep>("select");
  const [selected, setSelected] = useState<EpisodeSource | null>(remixEpisode);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishBlocked, setPublishBlocked] = useState(false);
  const [studioEngine, setStudioEngine] = useState<StudioEnginePreset>("gsap-parallax-25d");
  const [targetFps, setTargetFps] = useState<StudioTargetFps>("60fps-webgpu");
  const [cameraCurve, setCameraCurve] = useState<"spring-impact" | "smooth-pan-25d" | "shonen-shake-burst" | "emotional-slowzoom">("spring-impact");
  const [duckingProfile, setDuckingProfile] = useState<"dialogue-minus12db" | "sfx-punch-minus6db" | "cinema-lufs14">("dialogue-minus12db");
  const [rhythmConfig, setRhythmConfig] = useState<CutsRhythmConfig>(() => loadCutsRhythmConfig());

  const updateRhythmConfig = (updater: (prev: CutsRhythmConfig) => CutsRhythmConfig) => {
    setRhythmConfig((prev) => {
      const next = updater(prev);
      saveCutsRhythmConfig(next);
      return next;
    });
  };

  // 선택한 회차가 리믹스 진입 대상과 같을 때만 리믹스 초안으로 만든다.
  const isRemixDraft =
    remixEpisode !== null
    && selected?.titleId === remixEpisode.titleId
    && selected?.episodeNumber === remixEpisode.episodeNumber;
  const remixNotAllowed =
    isRemixDraft && selected !== null
      ? !resolveRemixAllowed(selected, remixPolicyOverrides)
      : false;

  const draft = useMemo(() => {
    if (!selected) return null;
    const baseClip = isRemixDraft && originalClipId
      ? buildRemixClip(selected, actorId ?? "guest", originalClipId)
      : buildCutsClip(selected, actorId ?? "guest");
    return baseClip ? applyRhythmToClip(baseClip, rhythmConfig) : null;
  }, [selected, isRemixDraft, originalClipId, actorId, rhythmConfig]);

  const publishedClip = clips.find((clip) => clip.id === publishedId) ?? null;
  const publishedRemix = publishedClip?.remix;

  const handleSelect = (episode: EpisodeSource) => {
    setSelected(episode);
    setPublishBlocked(false);
  };

  const handlePublish = () => {
    if (!draft || !selected) return;
    if (!actorId) {
      requestAuthModalOpen({
        reason: "protected-action",
        source: isRemixDraft ? "cuts-remix-publish" : "cuts-publish",
      });
      return;
    }
    // 리믹스는 게시 직전에 허용 여부를 다시 판정한다 (미리보기 뒤 껐으면 차단).
    if (isRemixDraft) {
      const decision = guardRemixPublish(selected, remixPolicyOverrides, actorId);
      if (!decision.ok) {
        setPublishBlocked(true);
        return;
      }
    }
    const clip: CutsClip = { ...draft, createdBy: actorId, publishedAt: new Date().toISOString() };
    publishClip(clip);
    // 활동 보상: 컷츠 게시 포인트 적립(일일 상한·중복 방지는 포인트 원장이 판정한다).
    awardCutsClipPublished(clip.id);
    setPublishedId(clip.id);
    setStep("done");
  };

  return (
    <div className="cuts-studio">
      <SiteContextualSubNav pathnameOverride="/cuts/studio" />
      <nav className="flex flex-wrap items-center gap-2" aria-label={t("컷츠 및 영상 도구 이동", "Cuts and video tool navigation")}>
        <Link href="/cuts" className="cuts-button cuts-button--ghost">
          <ArrowLeft size={16} aria-hidden="true" /> {t("피드로 돌아가기", "Back to feed")}
        </Link>
        <Link href="/cuts/rewards" className="cuts-button cuts-button--ghost">
          <Coins size={16} aria-hidden="true" /> {t("리워드 정산", "Reward settlement")}
        </Link>
        <Link href="/showcase/promo" className="cuts-button cuts-button--ghost">
          <Clapperboard size={16} aria-hidden="true" /> {t("예고편·트레일러 스튜디오", "Promo trailer studio")}
        </Link>
        <Link href="/studio/motion-webtoon" className="cuts-button cuts-button--ghost">
          {t("모션 웹툰 스튜디오", "Motion webtoon studio")}
        </Link>
      </nav>
      <h1>
        <Clapperboard size={24} aria-hidden="true" /> {t("컷츠 클립 만들기", "Create a Cuts clip")}
      </h1>
      <p>
        {t(
          "회차를 고르면 패널 이미지·자막·내레이션을 묶어 9:16 세로형 클립으로 자동 변환해요.",
          "Pick an episode and its panels, captions, and narration become a 9:16 vertical clip automatically.",
        )}
      </p>

      <Stepper step={step} />

      {remixParamInvalid ? (
        <p className="cuts-studio__notice" role="note">
          {t(
            "원작을 찾지 못해 일반 클립 만들기로 진행해요.",
            "We couldn't find the original, so you're in standard clip creation.",
          )}
        </p>
      ) : null}

      {step === "select" ? (
        <>
          {isRemixDraft ? (
            <p className="cuts-studio__notice" role="note">
              <Shuffle size={16} aria-hidden="true" />{" "}
              {t(
                "팬 리믹스 모드예요. 원작 표시가 자동으로 붙고 지울 수 없어요.",
                "You're in fan remix mode. Original credit is attached automatically and can't be removed.",
              )}
            </p>
          ) : null}
          {remixNotAllowed ? (
            <p className="cuts-studio__notice" role="alert">
              {t(
                "이 작품은 작가가 팬 리믹스를 허용하지 않았어요.",
                "The creator hasn't allowed fan remixes of this title.",
              )}
            </p>
          ) : null}
          <EpisodePicker
            selected={selected}
            onSelect={handleSelect}
            remixOverrides={remixPolicyOverrides}
          />
          <div className="cuts-studio__actions">
            <button
              type="button"
              className="cuts-button cuts-button--primary"
              disabled={!selected || remixNotAllowed}
              onClick={() => setStep("preview")}
            >
              {t("클립으로 변환하기", "Convert to clip")} <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          <RemixPolicySettings />
          <RewardFundLink />
        </>
      ) : null}

      {step === "preview" && draft ? (
        <>
          <ClipPreview
            clip={draft}
            rhythmConfig={rhythmConfig}
            onSelectPreset={(presetId) => updateRhythmConfig((prev) => applyPresetToRhythmConfig(prev, presetId))}
            onChangeRate={(rate) => updateRhythmConfig((prev) => ({ ...prev, playbackRate: rate }))}
            onToggleLetterbox={() => updateRhythmConfig((prev) => ({ ...prev, letterbox: !prev.letterbox }))}
            onNudgeShot={(shotId, deltaMs) => updateRhythmConfig((prev) => nudgeShotDurationOffset(prev, shotId, deltaMs))}
            onResetRhythm={() => updateRhythmConfig(() => DEFAULT_CUTS_RHYTHM_CONFIG)}
          />
          {!actorId ? (
            <p className="cuts-studio__notice" role="note">
              {t(
                "게스트로 미리보는 중이에요. 게시하려면 로그인이 필요해요.",
                "You're previewing as a guest. Sign in to publish.",
              )}
            </p>
          ) : null}
          {publishBlocked ? (
            <p className="cuts-studio__notice" role="alert">
              {t(
                "원작자가 리믹스 허용을 껐어요. 지금은 이 작품으로 게시할 수 없어요.",
                "The creator turned off remixes. You can't publish this remix right now.",
              )}
            </p>
          ) : null}
          <div className="cuts-studio__actions">
            <button
              type="button"
              className="cuts-button cuts-button--ghost"
              onClick={() => setStep("select")}
            >
              <ArrowLeft size={16} aria-hidden="true" /> {t("다시 선택", "Pick again")}
            </button>
            <button
              type="button"
              className="cuts-button cuts-button--primary"
              onClick={handlePublish}
              disabled={!cutsHydrated}
            >
              <Upload size={16} aria-hidden="true" /> {t("피드에 게시하기", "Publish to feed")}
            </button>
          </div>
        </>
      ) : null}

      {step === "done" && publishedId ? (
        <div className="cuts-studio__notice" role="status">
          <p>
            <Check size={18} aria-hidden="true" />{" "}
            {t("클립이 피드에 게시됐어요", "Your clip is live on the feed")}
          </p>
          <div className="cuts-studio__actions">
            <button
              type="button"
              className="cuts-button cuts-button--primary"
              onClick={() => navigate("/cuts")}
            >
              {t("피드에서 확인하기", "See it on the feed")}
            </button>
            {publishedRemix ? (
              <button
                type="button"
                className="cuts-button cuts-button--ghost"
                onClick={() => navigate(`/cuts?fanOf=${publishedRemix.titleId}`)}
              >
                <Shuffle size={16} aria-hidden="true" />{" "}
                {t("이 작품의 팬 리믹스 보기", "See fan remixes of this title")}
              </button>
            ) : null}
            <button
              type="button"
              className="cuts-button cuts-button--ghost"
              onClick={() => {
                setSelected(null);
                setPublishedId(null);
                setPublishBlocked(false);
                setStep("select");
              }}
            >
              {t("다른 클립 만들기", "Make another clip")}
            </button>
          </div>
        </div>
      ) : null}

      <details
        data-testid="cuts-studio-advanced-disclosure"
        className="group/cuts-adv mt-6 rounded-2xl border border-line bg-panel/60"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-fg transition-colors hover:bg-card/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <span>{t("고급 모션·오디오 설정", "Advanced motion & audio settings")}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-fg-2 transition-transform duration-150 group-open/cuts-adv:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="space-y-3 border-t border-line p-4">
          <div
            data-testid="cuts-rea-movingtoon-preset-bar"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card/85 px-3.5 py-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <img
                src="/assets/site-experience/site-art-v1/motion-previews/atelier-interactive-stage-640.webp"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                width={56}
                height={32}
                className="h-8 w-14 shrink-0 rounded-md border border-line object-cover"
              />
              <span className="font-semibold text-fg">
                {t("지원 연출 방식", "Supported motion styles")}
              </span>
              {[
                t("전경·배경 깊이감 이동", "Layered depth parallax"),
                t("부드러운 카메라 곡선", "Smooth camera curves"),
                t("장면 전환·화면 흔들림", "Impact camera shake"),
                t("내레이션·효과음 맞춤", "Voice & sound sync"),
                t("대사 자막·세로 안전영역", "Subtitle timing & 9:16 safe zone"),
              ].map((presetLabel) => (
                <span
                  key={presetLabel}
                  className="rounded-lg border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-fg-2"
                >
                  {presetLabel}
                </span>
              ))}
            </div>
          </div>

          <section
            data-testid="cuts-studio-rea-engine-controller"
            aria-label={t(
              "모션 방식 및 프레임 속도 설정",
              "Motion mode & frame-rate settings",
            )}
            className="rounded-xl border border-line bg-card/85 px-3.5 py-3 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t("모션 연출 방식 선택", "Motion style selection")}
              >
                <span className="font-semibold text-fg">
                  {t("모션 방식", "Motion style")}
                </span>
                {([
                  {
                    id: "gsap-parallax-25d",
                    ko: "깊이감 스크롤 연출",
                    en: "Layered depth motion",
                  },
                  {
                    id: "rive-spine-state-rig",
                    ko: "캐릭터 관절 모션",
                    en: "Character rig motion",
                  },
                  {
                    id: "vrew-insertoon-beat-sync",
                    ko: "대사 박자 자막 맞춤",
                    en: "Dialogue beat sync",
                  },
                  {
                    id: "elevenlabs-typecast-lufs14",
                    ko: "성우 톤·음량 균일화",
                    en: "Voice tone & level balance",
                  },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`cuts-studio-rea-engine-${item.id}`}
                    aria-pressed={studioEngine === item.id}
                    onClick={() => setStudioEngine(item.id)}
                    className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      studioEngine === item.id
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel text-fg-2 hover:border-accent/50"
                    }`}
                  >
                    {t(item.ko, item.en)}
                  </button>
                ))}
              </div>
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t("목표 프레임 속도 선택", "Target frame-rate selection")}
              >
                <span className="font-semibold text-fg">
                  {t("프레임 속도", "Frame rate")}
                </span>
                {([
                  { id: "60fps-webgpu", ko: "60fps 부드러운 재생", en: "60fps smooth" },
                  { id: "120fps-promotion", ko: "120fps 고주사율", en: "120fps high refresh" },
                  { id: "24fps-anime-cel", ko: "24fps 만화 영화 호흡", en: "24fps animation cadence" },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid={`cuts-studio-rea-fps-${item.id}`}
                    aria-pressed={targetFps === item.id}
                    onClick={() => setTargetFps(item.id)}
                    className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      targetFps === item.id
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-panel text-fg-2 hover:border-accent/50"
                    }`}
                  >
                    {t(item.ko, item.en)}
                  </button>
                ))}
              </div>
            </div>
            <p data-testid="cuts-studio-rea-engine-status" className="mt-2 text-[11px] text-fg-2">
              {t(
                `선택된 설정: ${studioEngine} · ${targetFps} · 세로형 9:16 클립 미리보기에 반영됩니다`,
                `Selected preset: ${studioEngine} · ${targetFps} · Applied to 9:16 vertical clip preview`,
              )}
            </p>
          </section>

          <section
            data-testid="cuts-studio-rea-keyframe-ducking-bar"
            aria-label={t("카메라 움직임 곡선 및 배경음 자동 조절", "Camera motion curve & auto background volume")}
            className="rounded-xl border border-line bg-card/90 p-3.5 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="font-semibold text-fg">
                {t("카메라 움직임 곡선 · 배경음 자동 조절", "Camera motion curve & auto background volume")}
              </strong>
              <span data-testid="cuts-studio-rea-ducking-badge" className="rounded-md border border-line bg-panel px-2.5 py-0.5 text-[11px] font-medium text-fg-2">
                {duckingProfile === "dialogue-minus12db"
                  ? t("대사 구간 배경음 낮춤", "Lower music on dialogue")
                  : duckingProfile === "sfx-punch-minus6db"
                    ? t("효과음 구간 강조", "Emphasize sound effects")
                    : t("전체 음량 균일 맞춤", "Balanced overall loudness")}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("카메라 움직임 곡선 프리셋", "Camera motion curve presets")}>
                {([
                  { id: "spring-impact", ko: "탄력 줌인 강조", en: "Crisp focus zoom" },
                  { id: "smooth-pan-25d", ko: "다층 깊이 패닝", en: "Layered depth pan" },
                  { id: "shonen-shake-burst", ko: "액션 화면 흔들림", en: "Action impact shake" },
                  { id: "emotional-slowzoom", ko: "천천히 다가가는 클로즈업", en: "Slow emotional zoom" },
                ] as const).map((curve) => (
                  <button
                    key={curve.id}
                    type="button"
                    aria-pressed={cameraCurve === curve.id}
                    data-testid={`cuts-studio-rea-curve-${curve.id}`}
                    onClick={() => setCameraCurve(curve.id)}
                    className={cameraCurve === curve.id ? "inline-flex min-h-11 items-center rounded-lg border border-accent bg-accent/15 px-3 py-1.5 font-semibold text-accent transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" : "inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 py-1.5 text-fg-2 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"}
                  >
                    {t(curve.ko, curve.en)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label={t("배경음 조절 방식", "Background audio balance")}>
                {([
                  { id: "dialogue-minus12db", ko: "대사 중심 조절", en: "Dialogue focus" },
                  { id: "sfx-punch-minus6db", ko: "효과음 중심 조절", en: "SFX focus" },
                  { id: "cinema-lufs14", ko: "전체 음량 균일화", en: "Balanced loudness" },
                ] as const).map((duck) => (
                  <button
                    key={duck.id}
                    type="button"
                    aria-pressed={duckingProfile === duck.id}
                    data-testid={`cuts-studio-rea-duck-${duck.id}`}
                    onClick={() => setDuckingProfile(duck.id)}
                    className={duckingProfile === duck.id ? "inline-flex min-h-11 items-center rounded-md border border-accent bg-accent px-3 py-1.5 text-[11px] font-semibold text-on-accent transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" : "inline-flex min-h-11 items-center rounded-md border border-line bg-panel px-3 py-1.5 text-[11px] text-fg-3 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"}
                  >
                    {t(duck.ko, duck.en)}
                  </button>
                ))}
              </div>
            </div>
            <p data-testid="cuts-studio-rea-keyframe-status" className="mt-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-fg-2">
              {cameraCurve === "spring-impact"
                ? t("핵심 대사 장면에 진입할 때 빠르게 초점을 맞추고 말풍선 등장 시점을 함께 맞춥니다.", "Focuses quickly on key dialogue panels in sync with speech-balloon timing.")
                : cameraCurve === "smooth-pan-25d"
                  ? t("전경 인물과 배경의 이동 속도를 다르게 두어 자연스러운 공간감을 만듭니다.", "Moves foreground characters and backgrounds at distinct speeds for natural depth.")
                  : cameraCurve === "shonen-shake-burst"
                    ? t("강한 동작 장면에 짧은 화면 흔들림을 더해 역동적인 인상을 줍니다.", "Adds brief camera shake on action beats for a crisp sense of impact.")
                    : t("독백 구간에서 천천히 화면을 당겨 대사에 시선이 머물도록 돕습니다.", "Slowly pushes in during monologues so attention stays on the dialogue.")}
            </p>
          </section>
        </div>
      </details>
    </div>
  );
}
