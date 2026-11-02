import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  FileSpreadsheet,
  FolderPlus,
  GitCompareArrows,
  Layers,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  MARKET_COMPARE_MAX_ITEMS,
  useMarketCompare,
} from "../hooks/use-market-compare";
import {
  MarketAssetBundlePlanner,
  type BundleItemCategory,
  type BundleItemEntry,
} from "../models/market-asset-bundle-planner";
import { formatMarketByteSize, marketLicenseMeta } from "../models/market-kind";

import type { MarketWishlistCollection } from "../hooks/use-market-collections";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface MarketWishlistMoodboardPanelProps {
  readonly allWishlistCount: number;
  readonly collections: readonly MarketWishlistCollection[];
  readonly activeCollectionId: string | null;
  readonly onSelectCollection: (id: string | null) => void;
  readonly onCreateCollection: (name: string, description: string) => void;
  readonly onRenameCollection: (id: string, name: string, description: string) => void;
  readonly onDeleteCollection: (id: string) => void;
  readonly resolvedRecords: readonly CreatorMarketplaceResourceRecord[];
  readonly memos: Readonly<Record<string, string>>;
}

function toBundleCategory(kind: CreatorMarketplaceResourceRecord["kind"]): BundleItemCategory {
  switch (kind) {
    case "3d-asset":
      return "background-3d";
    case "3d-preset":
    case "template":
    case "asset":
      return "prop-3d";
    case "brush":
      return "brush";
    case "palette":
      return "palette";
    case "filter":
      return "filter";
  }
}

const STAGE_REQUIREMENTS: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly check: (covered: ReadonlySet<BundleItemCategory>) => boolean;
  readonly browseHref: string;
}[] = [
  {
    id: "bg",
    labelKo: "3D 공간·배경",
    labelEn: "3D Background",
    check: (set) => set.has("background-3d"),
    browseHref: "/market/browse?kind=3d-asset",
  },
  {
    id: "prop",
    labelKo: "소품·템플릿·프리셋",
    labelEn: "Props & Templates",
    check: (set) => set.has("prop-3d"),
    browseHref: "/market/browse?kind=template",
  },
  {
    id: "brush",
    labelKo: "선화·드로잉 브러시",
    labelEn: "Drawing Brush",
    check: (set) => set.has("brush"),
    browseHref: "/market/browse?kind=brush",
  },
  {
    id: "color",
    labelKo: "팔레트·보정 마감",
    labelEn: "Palette & Filter",
    check: (set) => set.has("palette") || set.has("filter"),
    browseHref: "/market/browse?kind=palette",
  },
] as const;

const bundlePlanner = new MarketAssetBundlePlanner();

/**
 * 찜 목록 프로젝트 무드보드 컬렉션 & 회차 에피소드 키트 준비도 플래너.
 * 주의: `MarketWishlistPage.test.tsx`의 `getAllByRole("listitem")` 불변식을 보존하기 위해
 * 탭·체크 칩·요약 블록에는 `<ul>`/`<li>` 대신 시맨틱 `role="tablist"` 및 `<div>` 그리드를 사용한다.
 */
export function MarketWishlistMoodboardPanel({
  allWishlistCount,
  collections,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  resolvedRecords,
  memos,
}: MarketWishlistMoodboardPanelProps) {
  const t = useBilingual("MarketWishlistMoodboardPanel");
  const navigate = useNavigate();
  const { clearCompare, toggleCompare } = useMarketCompare();

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [copiedAction, setCopiedAction] = useState<"credits" | "markdown" | null>(null);

  const activeCollection = useMemo(
    () => collections.find((item) => item.id === activeCollectionId) ?? null,
    [activeCollectionId, collections],
  );

  const bundlePlan = useMemo(() => {
    const entries: BundleItemEntry[] = resolvedRecords.map((record) => ({
      id: record.id,
      title: record.name,
      category: toBundleCategory(record.kind),
      individualPriceKrw: 0,
      byteSize: record.manifestByteSize,
    }));
    return bundlePlanner.planBundle(
      activeCollection?.name ?? t("전체 찜 에피소드 키트", "Wishlist Episode Kit"),
      entries,
    );
  }, [activeCollection?.name, resolvedRecords, t]);

  const coveredSet = useMemo(
    () => new Set<BundleItemCategory>(bundlePlan.categoriesCovered),
    [bundlePlan.categoriesCovered],
  );

  const rightsAudit = useMemo(() => {
    let commercialOk = 0;
    let noAiDisclosed = 0;
    let attributionNeeded = 0;
    for (const record of resolvedRecords) {
      if (record.license !== "cc-by-nc-4.0") commercialOk += 1;
      if (!record.containsAi) noAiDisclosed += 1;
      if (
        record.license === "cc-by-4.0" ||
        record.license === "cc-by-nc-4.0" ||
        record.attributionText.trim().length > 0
      ) {
        attributionNeeded += 1;
      }
    }
    return {
      total: resolvedRecords.length,
      commercialOk,
      noAiDisclosed,
      attributionNeeded,
    };
  }, [resolvedRecords]);

  const copyText = async (text: string, kind: "credits" | "markdown") => {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard permission restricted
      }
    }
    setCopiedAction(kind);
    window.setTimeout(() => setCopiedAction(null), 2000);
  };

  const handleCopyEpisodeCredits = () => {
    if (resolvedRecords.length === 0) return;
    const lines = resolvedRecords.map((record) => {
      const license = marketLicenseMeta(record.license);
      const attr = record.attributionText.trim() || `© ${record.publisher.name}`;
      return `- ${record.name} (${attr} / ${license.label})`;
    });
    const text = `[웹툰 회차 사용 소재 출처 표기]\n${lines.join("\n")}`;
    void copyText(text, "credits");
  };

  const handleCopyMarkdownChecklist = () => {
    const title = activeCollection?.name ?? "찜 목록 제작 무드보드";
    const lines = resolvedRecords.map((record) => {
      const license = marketLicenseMeta(record.license);
      const memo = memos[record.id];
      return `- [ ] **${record.name}** (${record.kind}, v${record.resourceVersion}, ${license.label}, ${record.containsAi ? "AI 포함" : "No-AI"})${memo ? ` — 메모: ${memo}` : ""}`;
    });
    const md = `# ${title}\n\n- 장면 공정 준비도: ${bundlePlan.sceneReadinessScore}%\n- 상업 연재 허용: ${rightsAudit.commercialOk}/${rightsAudit.total}\n\n${lines.join("\n")}`;
    void copyText(md, "markdown");
  };

  const handleSendToCompare = () => {
    if (resolvedRecords.length === 0) return;
    clearCompare();
    for (const record of resolvedRecords.slice(0, MARKET_COMPARE_MAX_ITEMS)) {
      toggleCompare(record);
    }
    navigate("/market/compare");
  };

  return (
    <section
      aria-label={t("프로젝트 무드보드 컬렉션 및 에피소드 키트 점검", "Project moodboard collections & episode kit planner")}
      data-testid="market-wishlist-moodboard-panel"
      className="mt-5 space-y-4 rounded-2xl border border-line bg-card/85 p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label={t("무드보드 컬렉션 탭", "Moodboard collection tabs")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeCollectionId === null}
            onClick={() => onSelectCollection(null)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
              activeCollectionId === null
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-panel text-fg-2 hover:text-fg",
            )}
          >
            {t("전체 찜", "All saved")}
            <span className="numeral tnum rounded-full bg-canvas/20 px-1.5 py-0.5 text-[11px]">
              {allWishlistCount}
            </span>
          </button>

          {collections.map((collection) => {
            const selected = activeCollectionId === collection.id;
            return (
              <button
                key={collection.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSelectCollection(collection.id)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors",
                  selected
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:text-fg",
                )}
              >
                <span>{collection.name}</span>
                <span className="numeral tnum rounded-full bg-canvas/20 px-1.5 py-0.5 text-[11px]">
                  {collection.resourceIds.length}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-expanded={creating}
          onClick={() => setCreating((prev) => !prev)}
          className={buttonClass({
            variant: "outline",
            size: "sm",
            className: "min-h-9 gap-1.5",
          })}
        >
          <FolderPlus className="size-3.5 text-accent" aria-hidden="true" />
          {t("새 무드보드 만들기", "New moodboard")}
        </button>
      </div>

      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!draftName.trim()) return;
            onCreateCollection(draftName, draftDesc);
            setDraftName("");
            setDraftDesc("");
            setCreating(false);
          }}
          className="grid gap-2.5 rounded-xl border border-accent/35 bg-panel p-3.5 sm:grid-cols-[1fr_1.3fr_auto]"
        >
          <input
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={48}
            required
            aria-label={t("새 무드보드 이름", "New moodboard name")}
            placeholder={t("예: 신작 로판 1화 황궁 연회장", "e.g. Ep.1 Palace Ballroom")}
            className="h-9 rounded-lg border border-line bg-card px-3 text-xs text-fg focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            value={draftDesc}
            onChange={(event) => setDraftDesc(event.target.value)}
            maxLength={140}
            aria-label={t("무드보드 메모", "Moodboard note")}
            placeholder={t("연출 톤·시간대·담당 어시스턴트 메모 (선택)", "Scene mood, lighting, or assistant note (optional)")}
            className="h-9 rounded-lg border border-line bg-card px-3 text-xs text-fg focus:border-accent focus:outline-none"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="submit"
              className={buttonClass({ variant: "solid", size: "sm", className: "min-h-9" })}
            >
              {t("생성", "Create")}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-9" })}
            >
              {t("취소", "Cancel")}
            </button>
          </div>
        </form>
      ) : null}

      {activeCollection ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/80 px-3.5 py-2.5 text-xs">
          {editingId === activeCollection.id ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!editName.trim()) return;
                onRenameCollection(activeCollection.id, editName, editDesc);
                setEditingId(null);
              }}
              className="flex flex-1 flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                maxLength={48}
                aria-label={t("무드보드 이름 수정", "Edit moodboard name")}
                className="h-8 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
              />
              <input
                type="text"
                value={editDesc}
                onChange={(event) => setEditDesc(event.target.value)}
                maxLength={140}
                aria-label={t("무드보드 설명 수정", "Edit moodboard description")}
                className="h-8 min-w-48 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
              />
              <button
                type="submit"
                className={buttonClass({ variant: "solid", size: "sm", className: "min-h-8" })}
              >
                {t("저장", "Save")}
              </button>
            </form>
          ) : (
            <div className="min-w-0">
              <strong className="font-bold text-fg">{activeCollection.name}</strong>
              {activeCollection.description ? (
                <span className="ml-2 text-fg-2">— {activeCollection.description}</span>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            {editingId !== activeCollection.id ? (
              <button
                type="button"
                onClick={() => {
                  setEditingId(activeCollection.id);
                  setEditName(activeCollection.name);
                  setEditDesc(activeCollection.description);
                }}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-line bg-card px-2 text-xs font-medium text-fg-2 hover:text-fg"
              >
                <Pencil className="size-3" aria-hidden="true" />
                {t("이름 수정", "Rename")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDeleteCollection(activeCollection.id)}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-bad/30 bg-bad/10 px-2 text-xs font-medium text-bad hover:bg-bad/20"
            >
              <Trash2 className="size-3" aria-hidden="true" />
              {t("컬렉션 삭제", "Delete")}
            </button>
          </div>
        </div>
      ) : null}

      {resolvedRecords.length > 0 ? (
        <div className="grid gap-3 border-t border-line/70 pt-3.5 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-xl border border-line bg-panel/70 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Sparkles className="size-3.5 text-accent" aria-hidden="true" />
                {t("회차 에피소드 키트 공정 준비도", "Episode kit stage readiness")}
              </span>
              <span className="numeral tnum rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-extrabold text-accent">
                {bundlePlan.sceneReadinessScore}%
              </span>
            </div>

            <div
              aria-hidden="true"
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-raised"
            >
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${bundlePlan.sceneReadinessScore}%` }}
              />
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-4">
              {STAGE_REQUIREMENTS.map((stage) => {
                const covered = stage.check(coveredSet);
                return covered ? (
                  <div
                    key={stage.id}
                    className="flex items-center gap-1 rounded-lg border border-good/30 bg-good/10 px-2 py-1.5 font-semibold text-good"
                  >
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t(stage.labelKo, stage.labelEn)}</span>
                  </div>
                ) : (
                  <Link
                    key={stage.id}
                    href={stage.browseHref}
                    className="flex items-center justify-between gap-1 rounded-lg border border-dashed border-line bg-card px-2 py-1.5 text-fg-3 transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    <span className="truncate">{t(stage.labelKo, stage.labelEn)}</span>
                    <span className="shrink-0 font-bold">+</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-3 rounded-xl border border-line bg-panel/70 p-3.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-good/15 px-2 py-1 font-semibold text-good">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                {t(
                  `상업 연재 가능 ${rightsAudit.commercialOk}/${rightsAudit.total}`,
                  `Commercial ${rightsAudit.commercialOk}/${rightsAudit.total}`,
                )}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 font-semibold text-fg-2">
                {t(
                  `No-AI 공개 ${rightsAudit.noAiDisclosed}/${rightsAudit.total}`,
                  `No-AI ${rightsAudit.noAiDisclosed}/${rightsAudit.total}`,
                )}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 font-semibold text-fg-2">
                <Layers className="size-3.5 text-accent" aria-hidden="true" />
                {formatMarketByteSize(bundlePlan.totalByteSize)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyEpisodeCredits}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "min-h-8 gap-1 text-xs",
                })}
              >
                {copiedAction === "credits" ? (
                  <Check className="size-3.5 text-good" aria-hidden="true" />
                ) : (
                  <ClipboardCopy className="size-3.5" aria-hidden="true" />
                )}
                {copiedAction === "credits"
                  ? t("출처 복사됨", "Credits copied")
                  : t("통합 출처 표기 복사", "Copy episode credits")}
              </button>

              <button
                type="button"
                onClick={handleCopyMarkdownChecklist}
                className={buttonClass({
                  variant: "outline",
                  size: "sm",
                  className: "min-h-8 gap-1 text-xs",
                })}
              >
                {copiedAction === "markdown" ? (
                  <Check className="size-3.5 text-good" aria-hidden="true" />
                ) : (
                  <FileSpreadsheet className="size-3.5" aria-hidden="true" />
                )}
                {copiedAction === "markdown"
                  ? t("체크리스트 복사됨", "Checklist copied")
                  : t("제작 체크리스트 복사", "Copy checklist")}
              </button>

              <button
                type="button"
                onClick={handleSendToCompare}
                className={buttonClass({
                  variant: "solid",
                  size: "sm",
                  className: "min-h-8 gap-1 text-xs",
                })}
              >
                <GitCompareArrows className="size-3.5" aria-hidden="true" />
                {t("비교함으로 일괄 전송", "Send to compare")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
