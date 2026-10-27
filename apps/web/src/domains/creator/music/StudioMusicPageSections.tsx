import { BookOpenText, Headphones, RotateCcw } from "lucide-react";

import { AiRecoveryNotice } from "@/shared/ai/AiRecoveryNotice";
import { LoadingState } from "@/shared/components/LoadingState";
import {
  translateCurrentStaticSourceText,
  useBilingual,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { frozenStatus4Text } from "../studio-frozen4-status-i18n";
import { MusicExternalImportPanel } from "./MusicExternalImportPanel";
import { MusicProviderToolkit } from "./MusicProviderToolkit";
import { MusicPublicationHint, MusicPublicationPanel } from "./MusicPublicationPanel";
import { MusicTrackCard } from "./MusicTrackCard";
import { ANIME_OST_STARTERS } from "./studio-anime-ost-presets";

import type { LocalMusicTrack } from "./studio-music-client";

import {
  MUSIC_TERMS_URL,
  MUSIC_THEME_PACKS,
  type MusicBrief,
} from "@toonstudio/core/studio-music";

const inputClass =
  "w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

export interface StudioMusicModeAndStarterSectionsProps {
  readonly vocals: boolean;
  readonly onChooseCreationMode: (vocals: boolean) => void;
  readonly onApplyAnimeOstStarter: (starterId: string) => void;
  readonly onApplyTheme: (themeId: string) => void;
}

export function StudioMusicModeAndStarterSections({
  vocals,
  onChooseCreationMode,
  onApplyAnimeOstStarter,
  onApplyTheme,
}: StudioMusicModeAndStarterSectionsProps) {
  return (
    <>
      <section aria-labelledby="music-mode-heading">
        <h3 id="music-mode-heading" className="text-sm font-semibold">
          {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "1. 무엇을 만들까요?")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "사이트용 테마곡처럼 들리게 하려면 보컬 애니 OST를 선택하세요. 장면 BGM은 독서 집중용 연주곡에 맞춥니다.")}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={vocals}
            onClick={() => onChooseCreationMode(true)}
            className={cn(
              "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              vocals ? "border-accent bg-accent/10" : "border-line bg-canvas hover:border-accent/40",
            )}
          >
            <span className="text-xs font-black tracking-[0.16em] text-accent">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "VOCAL ANIME OST")}
            </span>
            <span className="mt-1 block text-base font-black">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "오프닝 · 엔딩 · 캐릭터 송")}
            </span>
            <span className="mt-1 block text-xs leading-5 text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "보컬, 후렴 훅, 가사와 곡 구조를 중심으로 한 완성형 주제가")}
            </span>
          </button>
          <button
            type="button"
            aria-pressed={!vocals}
            onClick={() => onChooseCreationMode(false)}
            className={cn(
              "rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent",
              !vocals ? "border-accent bg-accent/10" : "border-line bg-canvas hover:border-accent/40",
            )}
          >
            <span className="text-xs font-black tracking-[0.16em] text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "en", "SCENE SCORE")}
            </span>
            <span className="mt-1 block text-base font-black">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "장면 BGM · 루프")}
            </span>
            <span className="mt-1 block text-xs leading-5 text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "대사와 스크롤을 방해하지 않는 분위기 중심의 연주 사운드트랙")}
            </span>
          </button>
        </div>
      </section>

      {vocals ? (
        <section aria-labelledby="anime-ost-starter-heading">
          <div>
            <h3 id="anime-ost-starter-heading" className="text-sm font-semibold">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "2. 애니 OST 스타터")}
            </h3>
            <p className="mt-1 text-xs text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "특정 기존 작품이나 가수를 모사하지 않고, 곡의 역할과 감정 구조만 빠르게 설정합니다.")}
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ANIME_OST_STARTERS.map((starter) => (
              <button
                key={starter.id}
                type="button"
                className="min-h-24 rounded-xl border border-line bg-canvas p-3 text-left transition-colors hover:border-accent/45 hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => onApplyAnimeOstStarter(starter.id)}
              >
                <span className="text-xs font-black tracking-[0.14em] text-accent">{starter.badge}</span>
                <span className="mt-1 block text-sm font-bold text-fg">{starter.label}</span>
                <span className="mt-1 block text-xs leading-5 text-fg-3">{starter.description}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="music-theme-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 id="music-theme-heading" className="text-sm font-semibold">
              {vocals
                ? translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "3. 장르·장면 테마 보강")
                : translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "2. 웹툰 장면 테마로 빠르게 시작")}
            </h3>
            <p className="mt-1 text-xs text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.music.StudioMusicPage", "ko", "테마를 누르면 악기·템포·강도·감정 곡선이 함께 설정됩니다.")}
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MUSIC_THEME_PACKS.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="min-h-20 rounded-xl border border-line bg-canvas p-3 text-left transition-colors hover:border-accent/45 hover:bg-accent/5 focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => onApplyTheme(theme.id)}
            >
              <span className="block text-sm font-bold text-fg">{theme.label}</span>
              <span className="mt-1 block text-xs leading-5 text-fg-3">{theme.description}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

export interface StudioMusicLibrarySectionProps {
  readonly ownerId: string;
  readonly workId?: string;
  readonly episodeId?: string;
  readonly tracks: readonly LocalMusicTrack[];
  readonly visibleTracks: readonly LocalMusicTrack[];
  readonly publicationTracks: readonly LocalMusicTrack[];
  readonly savedIds: readonly string[];
  readonly pendingIds: readonly string[];
  readonly unsavedCount: number;
  readonly busy: boolean;
  readonly savingTrack: boolean;
  readonly lyricsBusy: boolean;
  readonly libraryLoading: boolean;
  readonly loadError: string;
  readonly notice: string;
  readonly error: string;
  readonly query: string;
  readonly onlyWork: boolean;
  readonly onlyEpisode: boolean;
  readonly onQueryChange: (value: string) => void;
  readonly onOnlyWorkChange: (value: boolean) => void;
  readonly onOnlyEpisodeChange: (value: boolean) => void;
  readonly onRefresh: () => Promise<void>;
  readonly onSaveAgain: (track: LocalMusicTrack) => Promise<void>;
  readonly onRemove: (track: LocalMusicTrack) => Promise<void>;
  readonly onReuseTrack: (track: LocalMusicTrack) => void;
  readonly onBgmLinked: (trackId: string) => void;
}

export function StudioMusicLibrarySection({
  ownerId,
  workId,
  episodeId,
  tracks,
  visibleTracks,
  publicationTracks,
  savedIds,
  pendingIds,
  unsavedCount,
  busy,
  savingTrack,
  lyricsBusy,
  libraryLoading,
  loadError,
  notice,
  error,
  query,
  onlyWork,
  onlyEpisode,
  onQueryChange,
  onOnlyWorkChange,
  onOnlyEpisodeChange,
  onRefresh,
  onSaveAgain,
  onRemove,
  onReuseTrack,
  onBgmLinked,
}: StudioMusicLibrarySectionProps) {
  return (
    <section
      id="music-library"
      tabIndex={-1}
      className="min-w-0 scroll-mt-24 space-y-4 focus:outline-none xl:sticky xl:top-4"
      aria-labelledby="music-library-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="music-library-heading" className="text-xl font-semibold">
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "나의 사운드트랙",
          )}
        </h2>
        <span className="text-sm text-fg-3">
          {tracks.length}
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "/20곡",
          )}
        </span>
        {ownerId ? (
          <button
            type="button"
            className={buttonClass}
            disabled={busy || libraryLoading || pendingIds.length > 0}
            onClick={() => void onRefresh()}
          >
            <RotateCcw size={16} aria-hidden />
            {translateCurrentStaticSourceText(
              "domains.creator.music.StudioMusicPage",
              "ko",
              "보관함 다시 확인",
            )}
          </button>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-fg-2">
        {translateCurrentStaticSourceText(
          "domains.creator.music.StudioMusicPage",
          "ko",
          "이 브라우저·기기에 저장되는 개인 보관함입니다. 다른 기기와 동기화되지 않으며 브라우저 데이터 삭제 시 사라질 수 있어 MP3를 별도로 보관해 주세요.",
        )}
      </p>

      {loadError ? (
        <div role="alert" className="rounded-xl border border-bad/30 p-4 text-sm text-bad">
          <p>
            {translateCurrentStaticSourceText(
              "domains.creator.music.StudioMusicPage",
              "ko",
              "보관함을 확인하지 못해 새 유료 생성을 잠시 막았습니다. 위의 ‘보관함 다시 확인’을 눌러 주세요.",
            )}
          </p>
          <p className="mt-2">{loadError}</p>
        </div>
      ) : null}
      {unsavedCount > 0 ? (
        <p role="status" className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "저장 확인이 필요한 음원이 ",
          )}
          {unsavedCount}
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "곡 있습니다. ‘기기에 다시 저장’은 새 생성 요청을 보내지 않습니다. 화면을 떠나기 전에 MP3도 보관해 주세요.",
          )}
        </p>
      ) : null}

      <label className="block space-y-2 text-sm">
        {translateCurrentStaticSourceText(
          "domains.creator.music.StudioMusicPage",
          "ko",
          "보관함 검색",
        )}
        <input
          type="search"
          className={inputClass}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "제목 또는 장면 검색",
          )}
        />
      </label>
      {workId ? (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyWork}
            onChange={(event) => onOnlyWorkChange(event.target.checked)}
          />
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "현재 작품에 연결해 만든 음악만 보기",
          )}
        </label>
      ) : null}
      {episodeId ? (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyEpisode}
            onChange={(event) => onOnlyEpisodeChange(event.target.checked)}
          />
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "현재 회차에 연결해 만든 음악만 보기",
          )}
        </label>
      ) : null}

      {workId && publicationTracks.length > 0 ? (
        <MusicPublicationPanel
          key={`${workId}:${episodeId ?? ""}`}
          workId={workId}
          tracks={[...publicationTracks]}
          onLinked={onBgmLinked}
        />
      ) : (
        <MusicPublicationHint workLinked={Boolean(workId)} />
      )}

      <div aria-live="polite" aria-atomic="true">
        {busy ? (
          <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
            {savingTrack
              ? translateCurrentStaticSourceText(
                  "domains.creator.music.StudioMusicPage",
                  "ko",
                  "음원 생성이 완료되어 기기 저장 결과를 확인하고 있습니다. MP3 다운로드는 지금도 가능합니다.",
                )
              : translateCurrentStaticSourceText(
                  "domains.creator.music.StudioMusicPage",
                  "ko",
                  "장면에 맞는 음악을 생성하고 있습니다. 이 화면에서 결과를 받은 뒤 기기 보관함에 저장합니다.",
                )}
          </p>
        ) : null}
        {lyricsBusy ? (
          <p role="status" className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
            {translateCurrentStaticSourceText(
              "domains.creator.music.StudioMusicPage",
              "ko",
              "장면의 감정과 길이에 맞는 독창적인 가사 초안을 작성하고 있습니다.",
            )}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 rounded-xl border border-line bg-panel/40 p-4 text-sm leading-relaxed">
            {notice}
          </p>
        ) : null}
      </div>
      {error ? <AiRecoveryNotice message={error} /> : null}
      {libraryLoading ? (
        <LoadingState
          label={frozenStatus4Text(
            "studio.frozenStatus4.music.libraryOpening",
            "기기 보관함을 여는 중",
          )}
          className="p-2"
        />
      ) : null}

      {visibleTracks.map((track) => (
        <MusicTrackCard
          key={track.metadata.id}
          track={track}
          saved={savedIds.includes(track.metadata.id)}
          busy={busy || libraryLoading}
          pending={pendingIds.includes(track.metadata.id)}
          onSave={() => onSaveAgain(track)}
          onDelete={() => onRemove(track)}
          onReuse={() => onReuseTrack(track)}
        />
      ))}

      {!libraryLoading && !loadError && visibleTracks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <Headphones size={32} className="mx-auto mb-4 text-fg-3" aria-hidden />
          <h3 className="font-semibold">
            {tracks.length
              ? translateCurrentStaticSourceText(
                  "domains.creator.music.StudioMusicPage",
                  "ko",
                  "검색 조건에 맞는 음악이 없어요",
                )
              : translateCurrentStaticSourceText(
                  "domains.creator.music.StudioMusicPage",
                  "ko",
                  "아직 만들어진 음악이 없어요",
                )}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-fg-3">
            {translateCurrentStaticSourceText(
              "domains.creator.music.StudioMusicPage",
              "ko",
              "웹툰 테마를 고르고 장면을 설명해 주세요.",
            )}
            <br />
            {translateCurrentStaticSourceText(
              "domains.creator.music.StudioMusicPage",
              "ko",
              "실제로 생성된 음원만 이곳에 표시됩니다.",
            )}
          </p>
        </div>
      ) : null}

      <aside className="rounded-2xl border border-line bg-card p-5 text-sm leading-relaxed">
        <h3 className="flex items-center gap-2 font-semibold">
          <BookOpenText size={17} aria-hidden />
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "작품에 사용할 때",
          )}
        </h3>
        <p className="mt-2 text-fg-2">
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "음악을 만든 후 MP3와 제작 정보를 별도로 보관하세요. 작품에 연결해 만든 곡은 위 게시 연결에서 직접 호스팅한 지속적인 HTTPS MP3 주소를 저장하면 효과툰 독자용 BGM으로 이어집니다. 사이트 전역 OST 승격은 별도 운영 검수를 거칩니다.",
          )}
        </p>
        <a
          href={MUSIC_TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block min-h-9 text-accent underline underline-offset-4"
        >
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "음원 이용 조건 확인",
          )}
        </a>
        <p className="text-xs text-fg-3">
          {translateCurrentStaticSourceText(
            "domains.creator.music.StudioMusicPage",
            "ko",
            "상용 이용 범위는 공급자 요금제·용도에 따라 달라집니다. 모든 배포·재판매에 대한 권리를 보장하지 않습니다.",
          )}
        </p>
      </aside>
    </section>
  );
}

export interface StudioMusicAlternativesSectionProps {
  readonly brief: MusicBrief;
  readonly ownerId: string;
  readonly trackCount: number;
  readonly disabled: boolean;
  readonly prompt: string;
  readonly onImport: (track: LocalMusicTrack) => Promise<void>;
  readonly onNotice: (message: string) => void;
  readonly onError: (message: string) => void;
}

export function StudioMusicAlternativesSection({
  brief,
  ownerId,
  trackCount,
  disabled,
  prompt,
  onImport,
  onNotice,
  onError,
}: StudioMusicAlternativesSectionProps) {
  const bt = useBilingual("StudioMusicPage");
  return (
    <section
      aria-labelledby="music-alternatives-heading"
      className="ux-deferred-section space-y-4 border-t border-line pt-7"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-accent">Other ways</p>
        <h2 id="music-alternatives-heading" className="mt-1 text-xl font-semibold">
          {bt("다른 방법으로 음원 준비하기", "Other ways to get audio")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-fg-3">
          {bt(
            "다른 서비스에서 만든 음원을 가져오거나, 현재 장면 설정을 외부 도구로 넘겨 이어서 만들 수 있어요. 가져오기는 유료 생성 요청을 보내지 않아요.",
            "Import audio made elsewhere, or hand this scene's settings to an external tool. Importing never sends a paid generation request.",
          )}
        </p>
      </div>
      <div id="music-import" tabIndex={-1} className="scroll-mt-24 focus:outline-none">
        <MusicExternalImportPanel
          brief={brief}
          ownerId={ownerId}
          trackCount={trackCount}
          disabled={disabled}
          onImport={onImport}
          onNotice={onNotice}
          onError={onError}
        />
      </div>
      <MusicProviderToolkit
        brief={brief}
        prompt={prompt}
        onNotice={onNotice}
        onError={onError}
      />
    </section>
  );
}
