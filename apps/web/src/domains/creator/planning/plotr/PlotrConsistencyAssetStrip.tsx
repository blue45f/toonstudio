/**
 * Plotr 일관성 소재 스트립(인물 · 배경 · 소품 3분류) 컴포넌트.
 *
 * - 빈 슬롯(+) 클릭 채우기, 이중 의미 ✕(채움→비움→삭제·되돌리기),
 *   다른 작품 소재 이름 병합 가져오기, 현재 컷 참조 토글(`소재 N 참조`)을 담당한다.
 */
import { Check, Download, Plus, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  createConsistencyAsset,
  mergeImportedConsistencyAssets,
  removeOrClearConsistencyAsset,
} from "./plotr-consistency-and-batch";
import { toggleCutAssetReference } from "./plotr-script-cut-engine";
import {
  PLOTR_ASSET_CATEGORY_LABELS,
  type PlotrAssetCategory,
  type PlotrConsistencyAsset,
  type PlotrCutCard,
  type PlotrDocumentState,
} from "./plotr-types";

export interface PlotrConsistencyAssetStripProps {
  readonly document: PlotrDocumentState;
  readonly primaryCut: PlotrCutCard | null;
  readonly onUpdateDocument: (
    updater: (prev: PlotrDocumentState) => PlotrDocumentState,
    noticeKo?: string,
  ) => void;
}

const IMPORTABLE_SAMPLE_ASSETS: readonly PlotrConsistencyAsset[] = Object.freeze([
  {
    id: "imp-shared-watch",
    category: "prop",
    name: "은빛 회중시계",
    visualNote: "푸른 태엽이 빛나는 앤티크 은장 회중시계",
    swatchOklch: "oklch(0.69 0.15 215)",
    costumeOrMaterial: "은장 금속 + 사파이어 유리",
  },
  {
    id: "imp-shared-dagger",
    category: "prop",
    name: "낡은 강철 단검",
    visualNote: "손잡이에 가죽 끈을 감은 실전형 단검, 칼날 끝 룬 각인",
    swatchOklch: "oklch(0.7 0.15 160)",
    costumeOrMaterial: "무광 강철 + 청록 룬",
  },
  {
    id: "imp-shared-recorder",
    category: "prop",
    name: "빨간 LED 녹음기",
    visualNote: "모서리가 긁힌 은회색 금속 녹음기, 상단 적색 점멸등",
    swatchOklch: "oklch(0.62 0.22 25)",
    costumeOrMaterial: "금속 바디 + 적색 LED",
  },
  {
    id: "imp-shared-mentor",
    category: "character",
    name: "공통 조력자",
    visualNote: "안경 쓴 차분한 인상, 긴 트렌치코트",
    swatchOklch: "oklch(0.66 0.14 230)",
    costumeOrMaterial: "베이지 코트 + 가죽 수첩",
  },
]);

const BTN =
  "plotr-btn-tactile inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export function PlotrConsistencyAssetStrip({
  document,
  primaryCut,
  onUpdateDocument,
}: PlotrConsistencyAssetStripProps) {
  const [assetFilter, setAssetFilter] = useState<PlotrAssetCategory | "all">("all");
  const [undoDeletedAsset, setUndoDeletedAsset] = useState<PlotrConsistencyAsset | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [assetVisualDraft, setAssetVisualDraft] = useState("");
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [newAssetCategory, setNewAssetCategory] = useState<PlotrAssetCategory>("character");
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetVisual, setNewAssetVisual] = useState("");

  const filteredAssets = useMemo(
    () =>
      assetFilter === "all"
        ? document.assets
        : document.assets.filter((asset) => asset.category === assetFilter),
    [document.assets, assetFilter],
  );

  const handleRemoveOrClearAsset = (assetId: string) => {
    const res = removeOrClearConsistencyAsset(document.assets, assetId);
    if (res.action === "noop") return;
    if (res.action === "deleted-asset" && res.removedAsset) {
      setUndoDeletedAsset(res.removedAsset);
    }
    onUpdateDocument(
      (prev) => ({
        ...prev,
        assets: res.nextAssets,
        cuts:
          res.action === "deleted-asset"
            ? prev.cuts.map((cut) => ({
                ...cut,
                referencedAssetIds: cut.referencedAssetIds.filter((id) => id !== assetId),
              }))
            : prev.cuts,
      }),
      res.action === "cleared-visual"
        ? "외형 메모를 비워 빈 슬롯(+)으로 되돌렸어요. 한 번 더 누르면 소재가 삭제됩니다."
        : "빈 소재를 삭제했어요. 원하면 바로 되돌릴 수 있어요.",
    );
  };

  const handleUndoDeleteAsset = () => {
    if (!undoDeletedAsset) return;
    const restore = undoDeletedAsset;
    setUndoDeletedAsset(null);
    onUpdateDocument(
      (prev) => ({ ...prev, assets: [...prev.assets, restore] }),
      `삭제한 소재 '${restore.name}'를 되돌렸어요.`,
    );
  };

  const handleImportOtherProjectAssets = () => {
    const merged = mergeImportedConsistencyAssets(
      document.assets,
      IMPORTABLE_SAMPLE_ASSETS,
      "이전 연재작 시트",
    );
    onUpdateDocument(
      (prev) => ({ ...prev, assets: merged.nextAssets }),
      `이전 작품에서 빈 슬롯 ${merged.filledExistingCount}건을 채우고 새 소재 ${merged.addedNewCount}건을 가져왔어요(이미 채워진 ${merged.skippedFilledCount}건은 유지).`,
    );
  };

  return (
    <section
      aria-label="일관성 소재 줄"
      data-testid="plotr-consistency-strip"
      className="space-y-3 rounded-xl border border-line bg-panel p-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-fg">
            1. 인물 · 배경 · 소품 일관성 고정
          </h3>
          <p className="mt-0.5 text-xs text-fg-2 [word-break:keep-all]">
            소재를 눌러 현재 컷({primaryCut?.sceneTitle ?? "선택 없음"})에 참조를 걸면 컷마다 같은 얼굴·배경을 유지해요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowAddAsset((v) => !v)}
            className={`${BTN} border-line bg-card text-fg hover:bg-raised`}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>소재 추가</span>
          </button>
          <button
            type="button"
            data-testid="plotr-import-assets-btn"
            onClick={handleImportOtherProjectAssets}
            className={`${BTN} border-line bg-card text-fg hover:bg-raised`}
          >
            <Download className="size-3.5" aria-hidden="true" />
            <span>다른 작품 소재 가져오기</span>
          </button>
          {undoDeletedAsset ? (
            <button
              type="button"
              onClick={handleUndoDeleteAsset}
              className={`${BTN} border-accent/50 bg-accent-soft text-accent`}
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              <span>삭제 되돌리기</span>
            </button>
          ) : null}
        </div>
      </div>

      <div role="group" aria-label="소재 분류 필터" className="flex flex-wrap gap-1.5">
        {(["all", "character", "location", "prop"] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            aria-pressed={assetFilter === cat}
            onClick={() => setAssetFilter(cat)}
            className={`${BTN} ${
              assetFilter === cat
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
            }`}
          >
            {cat === "all" ? "전체" : PLOTR_ASSET_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {showAddAsset ? (
        <div className="grid gap-2 rounded-xl border border-line bg-card p-3 sm:grid-cols-4">
          <select
            aria-label="새 소재 종류"
            value={newAssetCategory}
            onChange={(e) => setNewAssetCategory(e.target.value as PlotrAssetCategory)}
            className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
          >
            <option value="character">인물</option>
            <option value="location">배경</option>
            <option value="prop">소품</option>
          </select>
          <input
            type="text"
            value={newAssetName}
            onChange={(e) => setNewAssetName(e.target.value)}
            placeholder="이름 (예: 주인공 수호)"
            aria-label="새 소재 이름"
            className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
          />
          <input
            type="text"
            value={newAssetVisual}
            onChange={(e) => setNewAssetVisual(e.target.value)}
            placeholder="외형/분위기 (비우면 빈 슬롯+)"
            aria-label="새 소재 외형 메모"
            className="min-h-11 rounded-lg border border-line bg-panel px-2.5 text-xs text-fg"
          />
          <button
            type="button"
            disabled={!newAssetName.trim()}
            title={!newAssetName.trim() ? "소재 이름을 입력해 주세요" : undefined}
            onClick={() => {
              onUpdateDocument(
                (prev) => ({
                  ...prev,
                  assets: createConsistencyAsset(prev.assets, {
                    category: newAssetCategory,
                    name: newAssetName,
                    visualNote: newAssetVisual,
                    costumeOrMaterial: newAssetVisual || "직접 등록한 소재",
                  }),
                }),
                `소재 '${newAssetName.trim()}'를 추가했어요.`,
              );
              setNewAssetName("");
              setNewAssetVisual("");
              setShowAddAsset(false);
            }}
            className={`${BTN} border-accent bg-accent text-on-accent disabled:opacity-40`}
          >
            등록하기
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {filteredAssets.length === 0 ? (
          <p className="text-xs text-fg-3">
            표시할 소재가 없어요. 대본에서 인물을 추출하거나 직접 추가해 보세요.
          </p>
        ) : (
          filteredAssets.map((asset) => {
            const isEmpty = asset.visualNote.trim().length === 0;
            const isReferenced =
              primaryCut?.referencedAssetIds.includes(asset.id) ?? false;
            const isEditing = editingAssetId === asset.id;
            return (
              <div
                key={asset.id}
                data-testid={`plotr-asset-chip-${asset.id}`}
                data-empty={isEmpty ? "true" : "false"}
                data-referenced={isReferenced ? "true" : "false"}
                className="plotr-asset-chip flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isEmpty) {
                      setEditingAssetId(asset.id);
                      setAssetVisualDraft(asset.costumeOrMaterial);
                      return;
                    }
                    if (!primaryCut) return;
                    onUpdateDocument((prev) => ({
                      ...prev,
                      cuts: toggleCutAssetReference(prev.cuts, primaryCut.id, asset.id),
                    }));
                  }}
                  className="inline-flex min-h-11 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: asset.swatchOklch }}
                  />
                  <span>
                    <strong className="font-semibold text-fg">
                      {isEmpty ? `+ ${asset.name}` : asset.name}
                    </strong>
                    <span className="ml-1.5 text-[11px] text-fg-3">
                      {PLOTR_ASSET_CATEGORY_LABELS[asset.category]}
                      {isEmpty ? " · 비어 있음(눌러서 채우기)" : isReferenced ? " · 참조 중" : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={
                    isEmpty
                      ? `${asset.name} 소재 삭제`
                      : `${asset.name} 외형 비우고 빈 슬롯으로 되돌리기`
                  }
                  title={
                    isEmpty
                      ? "빈 소재 삭제(되돌리기 가능)"
                      : "외형만 지워 빈 슬롯(+)으로 되돌리기"
                  }
                  data-testid={`plotr-asset-clear-${asset.id}`}
                  onClick={() => handleRemoveOrClearAsset(asset.id)}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  <span>{isEmpty ? "삭제" : "비우기"}</span>
                </button>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={assetVisualDraft}
                      onChange={(e) => setAssetVisualDraft(e.target.value)}
                      aria-label={`${asset.name} 외형 메모 입력`}
                      className="min-h-11 w-36 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateDocument(
                          (prev) => ({
                            ...prev,
                            assets: prev.assets.map((a) =>
                              a.id === asset.id
                                ? { ...a, visualNote: assetVisualDraft.trim() || a.costumeOrMaterial }
                                : a,
                            ),
                          }),
                          `'${asset.name}' 외형 기준을 채웠어요.`,
                        );
                        setEditingAssetId(null);
                      }}
                      className={`${BTN} border-accent bg-accent text-on-accent`}
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      <span>저장</span>
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default PlotrConsistencyAssetStrip;
