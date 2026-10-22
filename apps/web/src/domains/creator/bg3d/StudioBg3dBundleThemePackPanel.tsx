import { PackageOpen, Search, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  countStudioBg3dBundlePackDeferred,
  loadStudioBg3dBundleDeployAvailability,
  loadStudioBg3dBundleThemePacks,
  studioBg3dBundleAssetName,
  type StudioBg3dBundleDeployAvailability,
  type StudioBg3dBundleThemePackAsset,
  type StudioBg3dBundleThemePacks,
} from "./studio-bg3d-bundle-theme-packs";

import { useT } from "@/shared/lib/i18n";

import "../studio-bg3d-panel-status-i18n";

const PAGE_SIZE = 24;
const CONTROL =
  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

type GroupSelection = "all" | "props" | "crowd" | `theme:${string}`;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function deferredTotal(
  data: StudioBg3dBundleThemePacks,
  packIndexes: ReadonlySet<number> | null,
): number {
  return data.packs.reduce(
    (sum, pack, index) => (packIndexes === null || packIndexes.has(index)
      ? sum + countStudioBg3dBundlePackDeferred(pack)
      : sum),
    0,
  );
}

/**
 * Creator Bundle 테마 팩 패널. 구매한 번들의 3D 에셋을 테마 팩 단위로 골라
 * 장면에 바로 배치한다. 원본 모델 파일 다운로드/내보내기 동선은 없고, 에셋은
 * 참조로만 장면에 들어가며 밖으로 나가는 것은 렌더된 이미지뿐이다.
 * 배경 군중 캐릭터는 장면 배치 대상이 아니라 렌더 전용 소재로 분리해 보여준다.
 */
export function StudioBg3dBundleThemePackPanel({
  onAdd,
  disabled = false,
}: {
  readonly onAdd: (id: string) => void;
  readonly disabled?: boolean;
}) {
  const t = useT();
  const searchId = "bg3d-bundle-theme-pack-search";
  const [data, setData] = useState<StudioBg3dBundleThemePacks | null>(null);
  const [availability, setAvailability] = useState<"checking" | StudioBg3dBundleDeployAvailability>("checking");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [group, setGroup] = useState<GroupSelection>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [addingId, setAddingId] = useState<string | null>(null);
  const addingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data) return;
    const controller = new AbortController();
    setLoadError(null);
    loadStudioBg3dBundleThemePacks({ signal: controller.signal })
      .then((loaded) => {
        if (!controller.signal.aborted) setData(loaded);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : t("studio.bg3dPanelStatus.bundleThemePack.loadFailed", "테마 팩을 불러오지 못했습니다."));
        }
      });
    return () => controller.abort();
  }, [data, revision]);

  // 메타데이터만으로 "배치 가능"이라 주장하지 않는다: GLB 실물 배포의 완료
  // 신호(배포 인덱스)가 테마 팩 합계와 맞을 때만 배치를 연다.
  useEffect(() => {
    if (!data) return;
    const controller = new AbortController();
    setAvailability("checking");
    loadStudioBg3dBundleDeployAvailability(data, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setAvailability(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability("unavailable");
      });
    return () => controller.abort();
  }, [data]);

  useEffect(() => () => {
    if (addingTimer.current) clearTimeout(addingTimer.current);
  }, []);

  const packIndexesForGroup = useMemo((): ReadonlySet<number> | null => {
    if (!data || group === "all" || group === "crowd") return null;
    const indexes = new Set<number>();
    data.packs.forEach((pack, index) => {
      if (group === "props" ? pack.category === "prop" : pack.theme === group.slice("theme:".length)) {
        indexes.add(index);
      }
    });
    return indexes;
  }, [data, group]);

  const filteredAssets = useMemo(() => {
    if (!data || group === "crowd") return [];
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    return data.assets.filter((asset) => {
      if (packIndexesForGroup && !packIndexesForGroup.has(asset.packIndex)) return false;
      if (!normalizedQuery) return true;
      const pack = data.packs[asset.packIndex];
      return [studioBg3dBundleAssetName(asset), pack?.title ?? "", pack?.creator ?? ""]
        .some((value) => value.toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    });
  }, [data, group, query, packIndexesForGroup]);

  const visiblePresets = useMemo(() => {
    if (!data || group === "crowd" || group === "props") return [];
    if (group === "all") return data.presets;
    const themeId = group.slice("theme:".length);
    return data.presets.filter((preset) => preset.theme === themeId);
  }, [data, group]);

  const pages = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visibleAssets = filteredAssets.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  const placementBlocked = disabled || availability !== "available";

  function add(assetId: string): void {
    if (placementBlocked || addingId !== null) return;
    setAddingId(assetId);
    onAdd(assetId);
    addingTimer.current = setTimeout(() => setAddingId(null), 1500);
  }

  function renderAssetCard(asset: StudioBg3dBundleThemePackAsset) {
    const pack = data?.packs[asset.packIndex];
    const name = studioBg3dBundleAssetName(asset);
    const busy = placementBlocked || addingId !== null;
    return (
      <article
        key={asset.id}
        className="min-w-0 rounded-lg border border-line bg-panel p-2"
        data-bundle-theme-asset-id={asset.id}
      >
        <span className="grid h-12 place-items-center overflow-hidden rounded-lg border border-line/80 bg-card">
          <PackageOpen size={20} className="text-fg-3" aria-hidden />
        </span>
        <p className="mt-1 break-words text-xs font-semibold text-fg">{name}</p>
        <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
          {pack?.title} · {pack?.creator}
          <br />
          GLB · {formatBytes(asset.bytes)} · 삼각형 {asset.triangles.toLocaleString("ko-KR")}
        </p>
        <button
          type="button"
          className={`${CONTROL} mt-2 w-full`}
          disabled={busy}
          onClick={() => add(asset.id)}
        >
          {addingId === asset.id ? t("studio.bg3dPanelStatus.bundleThemePack.placing", "배치 준비 중…") : "장면에 추가"}
        </button>
      </article>
    );
  }

  const groupButton = (id: GroupSelection, label: string) => (
    <button
      key={id}
      type="button"
      className={`${CONTROL} ${group === id ? "border-accent font-bold text-accent" : ""}`}
      aria-pressed={group === id}
      onClick={() => {
        setGroup(id);
        setPage(0);
      }}
    >
      {label}
    </button>
  );

  return (
    <section
      aria-labelledby="bg3d-bundle-theme-packs-title"
      className="mt-3 rounded-xl border border-line bg-card/70 p-3"
      data-studio-bundle-theme-packs="true"
    >
      <h4 id="bg3d-bundle-theme-packs-title" className="text-sm font-bold text-fg">
        Creator Bundle 테마 팩
        {data ? (
          <span className="text-fg-3"> · 배치 가능 {data.totals.placeableAssets.toLocaleString("ko-KR")}종</span>
        ) : null}
      </h4>
      <p className="mt-1 text-xs leading-relaxed text-fg-3">
        구매한 Creator Bundle의 배경 에셋을 테마별로 골라 장면에 배치합니다. 원본 모델 파일은
        제공하지 않으며, 에셋은 서비스 안에서만 쓰는 참조로 들어가고 밖으로 나가는 것은 렌더된
        이미지뿐입니다.
      </p>
      {data && availability === "checking" ? (
        <p role="status" className="mt-2 text-xs text-fg-3">{t("studio.bg3dPanelStatus.bundleThemePack.checkingAvailability", "에셋 배포 상태를 확인하는 중입니다.")}</p>
      ) : null}
      {data && availability === "unavailable" ? (
        <p
          role="alert"
          className="mt-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-xs leading-relaxed text-fg-2"
        >
          에셋 파일 배포가 아직 완료되지 않아 목록만 미리 볼 수 있습니다. 장면 배치는
          배포가 끝난 뒤에 가능합니다.
        </p>
      ) : null}

      {loadError ? (
        <div role="alert" className="mt-2 space-y-2 text-xs text-fg-2">
          <p>{loadError}</p>
          <button type="button" className={CONTROL} onClick={() => setRevision((value) => value + 1)}>
            {t("studio.bg3dPanelStatus.bundleThemePack.reload", "다시 불러오기")}
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="mt-2 text-xs text-fg-3">{t("studio.bg3dPanelStatus.bundleThemePack.loadingPacks", "테마 팩을 불러오는 중입니다.")}</p>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="테마 팩 그룹">
            {groupButton("all", "전체")}
            {data.themes.map((theme) => groupButton(`theme:${theme.id}`, theme.label))}
            {groupButton("props", "소품")}
            {groupButton("crowd", "배경 군중")}
          </div>

          {group === "crowd" ? (
            <div className="space-y-2">
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-fg-2">
                <Users size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                배경 군중 캐릭터는 장면에 직접 배치하는 모델이 아니라, 배경 렌더에 사람 실루엣을
                채우는 렌더 전용 소재입니다. 셰이퍼의 마네킹과는 섞지 않고 따로 관리합니다.
              </p>
              {data.crowdPacks.map((pack) => (
                <div
                  key={pack.title}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-2.5 py-2"
                  data-bundle-crowd-pack={pack.title}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-fg">{pack.title}</span>
                    <span className="text-[0.65rem] text-fg-3">
                      {pack.creator} · GLB {pack.glbAssets.toLocaleString("ko-KR")}종
                      {pack.note ? ` · ${pack.note}` : ""}
                    </span>
                  </span>
                  <span className="inline-flex rounded-full bg-raised px-1.5 py-0.5 text-[0.64rem] font-bold text-fg-3">
                    렌더 전용
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <label htmlFor={searchId} className="block text-xs font-semibold text-fg-2">
                에셋 검색
              </label>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
                  aria-hidden
                />
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  placeholder="건물, 나무, 음식, building…"
                  className={`${CONTROL} w-full pl-8`}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                />
              </div>

              {visiblePresets.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-fg-2">프리빌트 장면 프리셋</p>
                  {visiblePresets.map((preset) => {
                    const asset = data.assets[preset.assetIndex];
                    if (!asset) return null;
                    return (
                      <div
                        key={preset.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/40 bg-accent-soft/30 px-2.5 py-2"
                        data-bundle-preset-id={preset.id}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-fg">{preset.label}</span>
                          <span className="text-[0.65rem] text-fg-3">
                            완성된 장면 1개가 통째로 들어갑니다 · {formatBytes(asset.bytes)}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={CONTROL}
                          disabled={placementBlocked || addingId !== null}
                          onClick={() => add(asset.id)}
                        >
                          {addingId === asset.id ? t("studio.bg3dPanelStatus.bundleThemePack.placing", "배치 준비 중…") : "장면에 배치"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <p role="status" className="text-xs text-fg-3">
                검색 결과 {filteredAssets.length.toLocaleString("ko-KR")}종 · {currentPage + 1}/{pages}페이지
              </p>
              {visibleAssets.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {visibleAssets.map((asset) => renderAssetCard(asset))}
                </div>
              ) : (
                <p className="py-4 text-center text-xs text-fg-3">
                  {t("studio.bg3dPanelStatus.bundleThemePack.groupEmpty", "이 그룹에는 아직 배치 가능한 에셋이 없습니다. 검색어나 그룹을 바꿔 주세요.")}
                </p>
              )}
              {pages > 1 ? (
                <nav className="flex items-center justify-between gap-2" aria-label="에셋 페이지">
                  <button
                    type="button"
                    className={CONTROL}
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    이전
                  </button>
                  <span className="text-xs text-fg-3">{currentPage + 1} / {pages}</span>
                  <button
                    type="button"
                    className={CONTROL}
                    disabled={currentPage + 1 >= pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    다음
                  </button>
                </nav>
              ) : null}

              <p className="text-[0.65rem] leading-relaxed text-fg-3">
                GLB 변환본이 없거나, 외부 텍스처를 참조하거나, 기기 예산을 넘어 보류 중인 에셋{" "}
                {deferredTotal(data, packIndexesForGroup).toLocaleString("ko-KR")}종은 임베드 변환·회수가
                끝나면 자동으로 이 목록에 편입됩니다.
              </p>
              {data.pendingPacks.length > 0 ? (
                <details className="rounded-lg border border-line bg-panel/60 px-2.5 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-fg-2">
                    준비 중인 팩 {data.pendingPacks.length}개
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {data.pendingPacks.map((pack) => (
                      <li key={pack.title} className="text-[0.65rem] leading-relaxed text-fg-3">
                        <span className="font-semibold text-fg-2">{pack.title}</span> — {pack.reasonLabel}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  );
}
