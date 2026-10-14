import { Eye, EyeOff, Globe, Lock, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { WorldWikiSection } from "../catalog/WorldWikiSection";
import {
  buildPublicWiki,
  isWikiEntryPublic,
  setWikiEntryRevealEpisode,
  setWikiEntryVisibility,
  setWikiSpoilerBoundary,
  STUDIO_WIKI_KIND_LABELS,
  type StudioWikiSettings,
  type StudioWikiSourceEntry,
} from "./studio-world-wiki";

export interface StudioWorldWikiPanelProps {
  readonly sources: readonly StudioWikiSourceEntry[];
  readonly settings: StudioWikiSettings;
  readonly onChange: (settings: StudioWikiSettings) => void;
  /** 저장이 세션 메모리에만 머무는 등, 영속이 안 될 때의 안내 문구. */
  readonly persistenceNotice?: string;
}

const CONTROL_CLASS =
  "min-h-11 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TOGGLE_CLASS =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * 세계관 위키 공개 설정 — 작가가 항목별 공개 범위와 스포일러 경계를 정하는 표면.
 *
 * 기본값은 전부 비공개다. 항목을 공개로 돌리고, 설정이 처음 밝혀지는 회차를 적으면,
 * 아래 "독자에게 보이는 모습"이 경계 기준으로 즉시 다시 계산된다. 경계 뒤 항목은
 * 미리보기 데이터 자체에서 빠지므로, 눈으로 확인하는 것과 실제 공개 뷰가 어긋나지 않는다.
 */
export function StudioWorldWikiPanel({
  sources,
  settings,
  onChange,
  persistenceNotice,
}: StudioWorldWikiPanelProps) {
  const [showPreview, setShowPreview] = useState(true);
  const publicWiki = useMemo(
    () => buildPublicWiki(sources, settings),
    [settings, sources],
  );
  const settingBySourceId = useMemo(
    () => new Map(settings.entries.map((entry) => [entry.sourceId, entry])),
    [settings.entries],
  );
  const hiddenTotal =
    publicWiki.spoilerHiddenCount
    + publicWiki.privateHiddenCount
    + publicWiki.unconfiguredHiddenCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 px-3 py-4 sm:px-5">
        <section className="rounded-lg border border-line bg-card/50 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Globe size={19} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-fg">작품 페이지에 설정 위키 공개하기</h3>
              <p className="mt-0.5 max-w-[68ch] text-xs leading-relaxed text-fg-3">
                항목마다 공개 여부를 정하고, 설정이 처음 밝혀지는 회차를 적어 두세요.
                공개 경계보다 뒤의 회차에서 밝혀지는 설정은 이름까지 포함해 공개 뷰에
                나타나지 않아요.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-fg-2">
                스포일러 경계 — 몇 화까지 공개할까요?
              </span>
              <span className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  aria-label="공개 경계 회차"
                  value={settings.spoilerThroughEpisode}
                  onChange={(event) =>
                    onChange(
                      setWikiSpoilerBoundary(
                        settings,
                        event.target.value === ""
                          ? 0
                          : Number(event.target.value),
                      ),
                    )
                  }
                  className={`${CONTROL_CLASS} w-28 tabular-nums`}
                />
                <span className="text-xs text-fg-3">화까지의 설정만 공개</span>
              </span>
            </label>
            <p className="pb-2 text-xs tabular-nums text-fg-3" role="status">
              공개 {publicWiki.publicCount}개 · 경계 뒤라 숨김{" "}
              {publicWiki.spoilerHiddenCount}개 · 비공개 {hiddenTotal - publicWiki.spoilerHiddenCount}개
            </p>
          </div>

          {publicWiki.spoilerHiddenCount > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
              <ShieldAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
              공개로 지정했지만 경계보다 뒤에서 밝혀지는 설정 {publicWiki.spoilerHiddenCount}개는
              지금 공개 뷰에서 빠져 있어요. 경계를 올리면 그때부터 나타납니다.
            </p>
          )}
          {persistenceNotice && (
            <p className="mt-3 rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg-3">
              {persistenceNotice}
            </p>
          )}
        </section>

        <section aria-label="항목별 공개 범위" className="space-y-2">
          {sources.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-card/50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-fg">공개할 설정 항목이 아직 없어요</p>
              <p className="mx-auto mt-1 max-w-[52ch] text-xs leading-relaxed text-fg-3">
                장면·장소·소품이나 캐릭터를 먼저 등록하면, 여기서 항목별로 공개 범위를
                정할 수 있어요.
              </p>
            </div>
          ) : (
            sources.map((source) => {
              const setting = settingBySourceId.get(source.id);
              const isPublic = setting?.visibility === "public";
              const visibleNow = isWikiEntryPublic(setting, settings.spoilerThroughEpisode);
              const blockedByBoundary =
                isPublic && !visibleNow;
              return (
                <div
                  key={source.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card/50 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-semibold text-fg">
                      {source.name || source.id}
                      <span className="ml-2 text-[0.68rem] font-medium text-fg-3">
                        {STUDIO_WIKI_KIND_LABELS[source.kind].ko}
                      </span>
                    </p>
                    {(source.summary || source.details) && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-fg-3">
                        {source.summary || source.details}
                      </p>
                    )}
                    <p className="mt-1 text-[0.68rem] font-medium" role="status">
                      {visibleNow ? (
                        <span className="text-good">지금 공개 중</span>
                      ) : blockedByBoundary ? (
                        <span className="text-warn">
                          공개 지정됨 — {setting?.revealEpisode}화에 밝혀져 경계 뒤라 숨김
                        </span>
                      ) : (
                        <span className="text-fg-3">비공개</span>
                      )}
                    </p>
                  </div>

                  <label className="block">
                    <span className="sr-only">
                      {source.name || source.id} 설정이 처음 밝혀지는 회차
                    </span>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        placeholder="회차"
                        aria-label="처음 밝혀지는 회차 (비우면 회차 무관)"
                        value={setting?.revealEpisode ?? ""}
                        onChange={(event) =>
                          onChange(
                            setWikiEntryRevealEpisode(
                              settings,
                              source.id,
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                            ),
                          )
                        }
                        className={`${CONTROL_CLASS} w-24 tabular-nums`}
                      />
                      <span className="text-[0.68rem] text-fg-3">화에 처음 등장</span>
                    </span>
                  </label>

                  <button
                    type="button"
                    aria-pressed={isPublic}
                    onClick={() =>
                      onChange(
                        setWikiEntryVisibility(
                          settings,
                          source.id,
                          isPublic ? "private" : "public",
                        ),
                      )
                    }
                    className={`${TOGGLE_CLASS} ${
                      isPublic
                        ? "border-accent bg-accent text-on-accent"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                    }`}
                  >
                    {isPublic ? (
                      <Eye size={13} aria-hidden />
                    ) : (
                      <Lock size={13} aria-hidden />
                    )}
                    {isPublic ? "공개" : "비공개"}
                  </button>
                </div>
              );
            })
          )}
        </section>

        <section aria-label="공개 뷰 미리보기">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-fg">독자에게 보이는 모습</h3>
            <button
              type="button"
              aria-pressed={showPreview}
              onClick={() => setShowPreview((current) => !current)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {showPreview ? (
                <EyeOff size={13} aria-hidden />
              ) : (
                <Eye size={13} aria-hidden />
              )}
              {showPreview ? "미리보기 접기" : "미리보기 펼치기"}
            </button>
          </div>
          {showPreview && <WorldWikiSection wiki={publicWiki} />}
        </section>
      </div>
    </div>
  );
}
