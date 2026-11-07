/**
 * 컷츠 스튜디오 — 클립 만들기 (`/cuts/studio`).
 *
 * 3단계: ① 회차 선택 → ② 자동 변환 미리보기 → ③ 게시.
 * 미리보기까지는 로그인 없이 가능하고, 게시 버튼을 누르면
 * 게스트에게 로그인 유도를 띄운다.
 */

import { ArrowLeft, ArrowRight, Check, Clapperboard, Coins, Shuffle, Upload } from "lucide-react";
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
import { buildCutsClip, formatClipDuration } from "./cuts-clip-builder";
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

function ClipPreview({ clip }: Readonly<{ clip: CutsClip }>) {
  const t = useBilingual("cuts");
  const [muted, setMuted] = useState(true);
  return (
    <div className="cuts-studio__preview">
      <CutsPlayer
        clip={clip}
        active
        muted={muted}
        onToggleMute={() => setMuted((value) => !value)}
      />
      <div>
        {clip.remix ? <CutsRemixBadge clip={clip} /> : null}
        <h3>{t("샷 구성", "Shot list")}</h3>
        <ul className="cuts-shot-list">
          {clip.shots.map((shot, index) => (
            <li key={shot.id}>
              <img src={shot.imageUrl} alt={shot.alt} />
              <div>
                <div>
                  {t("샷 {{n}}", "Shot {{n}}").replace("{{n}}", String(index + 1))}
                  {" · "}
                  {formatClipDuration(shot.durationMs)}
                  {" · "}
                  {shot.kenBurns.direction}
                </div>
                <div className="cuts-shot-list__meta">{shot.caption}</div>
              </div>
            </li>
          ))}
        </ul>
        <details className="cuts-ssml">
          <summary>{t("내레이션 SSML 보기 (클라우드 TTS 내보내기용)", "View narration SSML (for cloud TTS export)")}</summary>
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
    if (isRemixDraft && originalClipId) {
      return buildRemixClip(selected, actorId ?? "guest", originalClipId);
    }
    return buildCutsClip(selected, actorId ?? "guest");
  }, [selected, isRemixDraft, originalClipId, actorId]);

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

      <div
        data-testid="cuts-rea-movingtoon-preset-bar"
        className="my-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card/85 px-4 py-3 text-xs"
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
          <span className="font-extrabold text-accent">
            {t("RIVE · SPINE · LIVE2D · GSAP · PLAYCANVAS · THEATRE.JS 무빙툰 프리셋:", "RIVE · SPINE · LIVE2D · GSAP · PLAYCANVAS · THEATRE.JS Presets:")}
          </span>
          {[
            t("GSAP ScrollTrigger 패럴랙스 깊이 루프 (2.5D)", "GSAP ScrollTrigger Parallax Loop (2.5D)"),
            t("PlayCanvas·cables.gl WebGPU 셰이더 & Theatre.js 카메라 커브", "PlayCanvas/cables.gl WebGPU & Theatre.js Curve"),
            t("Cascadeur·Runway·Pika·Kling·Hailuo 액션 카메라 셰이크 & 모션 브러시", "Cascadeur/Runway/Pika/Kling/Hailuo Camera Shake & Motion"),
            t("타입캐스트·수퍼톤·ElevenLabs AI 성우 더빙 & 뮤팟·Suno·Epidemic 효과음 싱크", "Typecast/Supertone/ElevenLabs Voice & Mewpot/Suno/Epidemic SFX Sync"),
            t("오노마AI 인서툰·브루(Vrew)·Katalist 대본 자막 타이밍 & 9:16 릴스 안전영역", "Onoma AI Insertoon/Vrew/Katalist Subtitle Sync & 9:16 Safe-Zone"),
          ].map((presetLabel) => (
            <span
              key={presetLabel}
              className="rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-fg-2"
            >
              {presetLabel}
            </span>
          ))}
        </div>
      </div>

      <section
        data-testid="cuts-studio-rea-engine-controller"
        aria-label={t(
          "REA 무빙툰 렌더 엔진 및 프레임레이트 컨트롤러",
          "REA Movingtoon Render Engine & Frame-Rate Controller",
        )}
        className="my-3 rounded-2xl border border-line bg-card/85 px-4 py-3 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label={t("무빙툰 렌더 엔진 선택", "Movingtoon Render Engine Selection")}
          >
            <span className="font-extrabold text-accent">
              {t("렌더 엔진:", "Render Engine:")}
            </span>
            {([
              {
                id: "gsap-parallax-25d",
                ko: "GSAP 2.5D 패럴랙스 깊이 루프",
                en: "GSAP 2.5D Parallax Depth Loop",
              },
              {
                id: "rive-spine-state-rig",
                ko: "Rive·Spine·Live2D 상태머신 리깅",
                en: "Rive/Spine/Live2D State Machine Rig",
              },
              {
                id: "vrew-insertoon-beat-sync",
                ko: "Vrew·오노마AI 인서툰 비트 자막 싱크",
                en: "Vrew & Onoma AI Insertoon Beat Sync",
              },
              {
                id: "elevenlabs-typecast-lufs14",
                ko: "ElevenLabs·타입캐스트 -14 LUFS 마스터링",
                en: "ElevenLabs & Typecast -14 LUFS Mastering",
              },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`cuts-studio-rea-engine-${item.id}`}
                aria-pressed={studioEngine === item.id}
                onClick={() => setStudioEngine(item.id)}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
            aria-label={t("목표 프레임레이트 선택", "Target Frame-Rate Selection")}
          >
            <span className="font-extrabold text-accent">
              {t("타깃 FPS:", "Target FPS:")}
            </span>
            {([
              { id: "60fps-webgpu", ko: "60fps WebGPU 표준", en: "60fps WebGPU Standard" },
              { id: "120fps-promotion", ko: "120fps ProMotion 고주사율", en: "120fps ProMotion High-Refresh" },
              { id: "24fps-anime-cel", ko: "24fps 애니 작화 셀", en: "24fps Anime Cel Cadence" },
            ] as const).map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`cuts-studio-rea-fps-${item.id}`}
                aria-pressed={targetFps === item.id}
                onClick={() => setTargetFps(item.id)}
                className={`inline-flex min-h-11 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
            `[활성 렌더 파이프라인] 엔진: ${studioEngine} · 주사율: ${targetFps} · Rive, Spine, Live2D, Vrew, Onoma AI Insertoon, ElevenLabs 무빙툰 규격 호환`,
            `[Active Render Pipeline] Engine: ${studioEngine} · Frame-Rate: ${targetFps} · Rive, Spine, Live2D, Vrew, Onoma AI Insertoon, ElevenLabs movingtoon spec ready`,
          )}
        </p>
      </section>
      <section
        data-testid="cuts-studio-rea-keyframe-ducking-bar"
        aria-label={t("REA 9:16 무빙툰 키프레임 이징 커브 및 오토더킹 스튜디오 바", "REA 9:16 moving-toon keyframe easing curve & auto-ducking studio bar")}
        className="my-3 rounded-2xl border border-line bg-card/90 p-3.5 text-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="font-extrabold text-accent">
            {t("RIVE · TOON BOOM · CAPCUT · VREW · KLING 1.6 카메라 키프레임 커브 & -12dB 보이스 오토더킹", "RIVE · TOON BOOM · CAPCUT · VREW · KLING 1.6 Camera Keyframe Curve & -12dB Auto-Ducking")}
          </strong>
          <span data-testid="cuts-studio-rea-ducking-badge" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
            {duckingProfile === "dialogue-minus12db"
              ? t("대사 발화 시 BGM -12dB 감쇠 · Rhubarb 6음소 싱크", "Dialogue -12dB BGM Ducking · Rhubarb 6-Viseme")
              : duckingProfile === "sfx-punch-minus6db"
                ? t("타격 효과음 구간 -6dB 사이드체인 · 60fps", "SFX Impact -6dB Sidechain · 60fps")
                : t("전 구간 -14 LUFS 라우드니스 정규화", "-14 LUFS Broadcast Loudness Normalization")}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("카메라 키프레임 커브 프리셋", "Camera keyframe curve presets")}>
            {([
              { id: "spring-impact", ko: "스프링 임팩트 줌 (Cubic-Bezier 0.22,1,0.36,1)", en: "Spring Impact Zoom (0.22,1,0.36,1)" },
              { id: "smooth-pan-25d", ko: "2.5D 다층 패럴랙스 글라이드", en: "2.5D Multi-Plane Parallax Glide" },
              { id: "shonen-shake-burst", ko: "액션 타격 카메라 셰이크 & 스피드라인", en: "Action Camera Shake & Speedline" },
              { id: "emotional-slowzoom", ko: "감정 클로즈업 슬로우 랙포커스", en: "Emotional Slow Zoom & Rack Focus" },
            ] as const).map((curve) => (
              <button
                key={curve.id}
                type="button"
                aria-pressed={cameraCurve === curve.id}
                data-testid={`cuts-studio-rea-curve-${curve.id}`}
                onClick={() => setCameraCurve(curve.id)}
                className={cameraCurve === curve.id ? "inline-flex min-h-11 items-center rounded-lg border border-accent bg-accent/15 px-3 py-1.5 font-bold text-accent transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" : "inline-flex min-h-11 items-center rounded-lg border border-line bg-panel px-3 py-1.5 text-fg-2 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"}
              >
                {t(curve.ko, curve.en)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("오디오 오토더킹 프로필", "Audio auto-ducking profile")}>
            {([
              { id: "dialogue-minus12db", ko: "대사 -12dB 더킹", en: "Dialogue -12dB" },
              { id: "sfx-punch-minus6db", ko: "효과음 -6dB 더킹", en: "SFX -6dB" },
              { id: "cinema-lufs14", ko: "-14 LUFS 마스터링", en: "-14 LUFS Master" },
            ] as const).map((duck) => (
              <button
                key={duck.id}
                type="button"
                aria-pressed={duckingProfile === duck.id}
                data-testid={`cuts-studio-rea-duck-${duck.id}`}
                onClick={() => setDuckingProfile(duck.id)}
                className={duckingProfile === duck.id ? "inline-flex min-h-11 items-center rounded-md border border-accent bg-accent px-3 py-1.5 text-[11px] font-bold text-on-accent transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" : "inline-flex min-h-11 items-center rounded-md border border-line bg-panel px-3 py-1.5 text-[11px] text-fg-3 transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"}
              >
                {t(duck.ko, duck.en)}
              </button>
            ))}
          </div>
        </div>
        <p data-testid="cuts-studio-rea-keyframe-status" className="mt-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-fg-2">
          {cameraCurve === "spring-impact"
            ? t("Rive·Theatre.js 스프링 이징 커브로 핵심 대사 컷 진입 첫 0.18초에 시선을 고정하고 말풍선 팝업 타이밍을 동기화합니다.", "Locks viewer focus in the first 0.18s using Rive/Theatre.js spring easing synced to speech-balloon pop-in.")
            : cameraCurve === "smooth-pan-25d"
              ? t("전경 캐릭터와 3D 배경 레이어를 1:0.35 깊이 비율로 분리 이동하여 스크롤 원고를 자연스러운 9:16 무빙툰으로 변환합니다.", "Separates foreground character and 3D background layers at a 1:0.35 depth ratio for smooth 9:16 motion comics.")
              : cameraCurve === "shonen-shake-burst"
                ? t("클라이맥스 타격 프레임에 12Hz 감쇠 진동과 집중선 오버레이를 결합해 소년만화풍 타격감을 극대화합니다.", "Combines 12Hz damped camera shake with speedline overlays on impact frames for shonen action punch.")
                : t("감정선 독백 구간에서 1.00x → 1.14x 선형 줌인과 피사계 심도(DoF) 블러를 적용해 대사 전달력을 높입니다.", "Applies a 1.00x → 1.14x slow push-in with subtle depth-of-field blur during emotional monologues.")}
        </p>
      </section>

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
          <RemixPolicySettings />
          <RewardFundLink />
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
        </>
      ) : null}

      {step === "preview" && draft ? (
        <>
          <ClipPreview clip={draft} />
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
            {t("클립이 피드에 게시됐어요!", "Your clip is live on the feed!")}
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
    </div>
  );
}
