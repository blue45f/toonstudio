/**
 * Plotr 일관성 소재 스트립(이중 의미 ✕ · 타 프로젝트 이름 병합 가져오기),
 * 프로젝트 그림체 8종+커스텀 DNA, 빈 컷 일괄 조립 큐(소재 선행 · 동시 3건 · Esc 중단),
 * 글콘티 TXT 내보내기 및 회차 기획/2D 원고 인계 패치 생성 엔진.
 */
import type { EpisodePlanWithSynopsis } from "../studio-episode-synopsis";
import type {
  PlotrArtStyleDna,
  PlotrArtStylePresetId,
  PlotrAssetCategory,
  PlotrBatchQueueState,
  PlotrConsistencyAsset,
  PlotrCutCard,
  PlotrDocumentState,
} from "./plotr-types";
import { PLOTR_EFFECT_LINE_LABELS } from "./plotr-types";

export const PLOTR_ART_STYLE_PRESETS: readonly PlotrArtStyleDna[] = Object.freeze([
  {
    presetId: "rough",
    labelKo: "러프 콘티",
    lineWeight: 2,
    proportionStyle: "webtoon",
    coloringTone: "monochrome",
    textureGrain: 35,
    backgroundAtmosphere: "연필 거친 선화와 담백한 명암",
  },
  {
    presetId: "anime",
    labelKo: "애니 웹툰",
    lineWeight: 2,
    proportionStyle: "webtoon",
    coloringTone: "cel",
    textureGrain: 10,
    backgroundAtmosphere: "또렷한 셀 채색과 선명한 역광",
  },
  {
    presetId: "anime-3d",
    labelKo: "3D 애니",
    lineWeight: 1,
    proportionStyle: "webtoon",
    coloringTone: "cinematic",
    textureGrain: 15,
    backgroundAtmosphere: "입체 광원과 부드러운 림라이트",
  },
  {
    presetId: "watercolor",
    labelKo: "수채화",
    lineWeight: 2,
    proportionStyle: "webtoon",
    coloringTone: "watercolor",
    textureGrain: 48,
    backgroundAtmosphere: "번짐 질감과 따뜻한 파스텔 여백",
  },
  {
    presetId: "bw-manga",
    labelKo: "흑백만화",
    lineWeight: 3,
    proportionStyle: "webtoon",
    coloringTone: "monochrome",
    textureGrain: 30,
    backgroundAtmosphere: "스크린톤 대비와 먹선 강조",
  },
  {
    presetId: "cinematic",
    labelKo: "시네마틱",
    lineWeight: 1,
    proportionStyle: "realistic",
    coloringTone: "cinematic",
    textureGrain: 25,
    backgroundAtmosphere: "영화 조명 대비와 얕은 심도",
  },
  {
    presetId: "fantasy-photo",
    labelKo: "판타지실사",
    lineWeight: 1,
    proportionStyle: "realistic",
    coloringTone: "cinematic",
    textureGrain: 20,
    backgroundAtmosphere: "장엄한 대기 원근과 사실 질감",
  },
  {
    presetId: "fantasy-illust",
    labelKo: "판타지일러",
    lineWeight: 2,
    proportionStyle: "webtoon",
    coloringTone: "cel",
    textureGrain: 22,
    backgroundAtmosphere: "화려한 보석광과 채도 높은 마력 효과",
  },
]);

export function findArtStylePreset(presetId: PlotrArtStylePresetId): PlotrArtStyleDna {
  return (
    PLOTR_ART_STYLE_PRESETS.find((p) => p.presetId === presetId) ??
    PLOTR_ART_STYLE_PRESETS[1]!
  );
}

/**
 * 플로터 '✕ 두 가지 의미' 규칙 (REA ev_261df530… 관찰):
 * - 외형 메모가 채워진 소재에서 ✕ 클릭 → 외형 메모만 비워 빈 슬롯(+)으로 되돌린다(소재 유지).
 * - 빈 슬롯(+)에서 ✕ 클릭 → 소재 자체를 목록에서 제거하고 되돌리기용 스냅샷을 반환한다.
 */
export function removeOrClearConsistencyAsset(
  assets: readonly PlotrConsistencyAsset[],
  assetId: string,
): {
  readonly nextAssets: readonly PlotrConsistencyAsset[];
  readonly action: "cleared-visual" | "deleted-asset" | "noop";
  readonly removedAsset: PlotrConsistencyAsset | null;
} {
  const target = assets.find((item) => item.id === assetId);
  if (!target) {
    return { nextAssets: assets, action: "noop", removedAsset: null };
  }
  if (target.visualNote.trim().length > 0) {
    return {
      nextAssets: Object.freeze(
        assets.map((item) =>
          item.id === assetId ? Object.freeze({ ...item, visualNote: "" }) : item,
        ),
      ),
      action: "cleared-visual",
      removedAsset: target,
    };
  }
  return {
    nextAssets: Object.freeze(assets.filter((item) => item.id !== assetId)),
    action: "deleted-asset",
    removedAsset: target,
  };
}

/**
 * 플로터 '다른 프로젝트에서 소재 가져오기' 병합 규칙 (REA ev_261df530… 관찰):
 * - 같은 이름의 소재가 이미 있고 비어 있으면 새 칸을 만들지 않고 그 슬롯을 채운다.
 * - 이미 외형 메모가 채워져 있으면 건너뛴다(기존 작업 보존).
 * - 없는 이름이면 새 소재 슬롯으로 추가한다.
 */
export function mergeImportedConsistencyAssets(
  current: readonly PlotrConsistencyAsset[],
  incoming: readonly PlotrConsistencyAsset[],
  sourceLabel: string,
): {
  readonly nextAssets: readonly PlotrConsistencyAsset[];
  readonly filledExistingCount: number;
  readonly addedNewCount: number;
  readonly skippedFilledCount: number;
} {
  const copy = [...current];
  let filledExistingCount = 0;
  let addedNewCount = 0;
  let skippedFilledCount = 0;

  for (const candidate of incoming) {
    const key = candidate.name.trim();
    if (!key) continue;
    const matchIdx = copy.findIndex((item) => item.name.trim() === key);
    if (matchIdx >= 0) {
      const existing = copy[matchIdx]!;
      if (existing.visualNote.trim().length > 0) {
        skippedFilledCount += 1;
        continue;
      }
      copy[matchIdx] = Object.freeze({
        ...existing,
        visualNote: candidate.visualNote,
        costumeOrMaterial: candidate.costumeOrMaterial || existing.costumeOrMaterial,
        sourceProjectLabel: sourceLabel,
      });
      filledExistingCount += 1;
    } else {
      copy.push(
        Object.freeze({
          ...candidate,
          id: `asset-imp-${copy.length + 1}-${candidate.category}`,
          sourceProjectLabel: sourceLabel,
        }),
      );
      addedNewCount += 1;
    }
  }

  return {
    nextAssets: Object.freeze(copy),
    filledExistingCount,
    addedNewCount,
    skippedFilledCount,
  };
}

export function createConsistencyAsset(
  assets: readonly PlotrConsistencyAsset[],
  input: {
    readonly category: PlotrAssetCategory;
    readonly name: string;
    readonly visualNote: string;
    readonly costumeOrMaterial: string;
  },
): readonly PlotrConsistencyAsset[] {
  const cleanName = input.name.trim();
  if (!cleanName) return assets;
  const swatches = [
    "oklch(0.65 0.19 340)",
    "oklch(0.6 0.19 250)",
    "oklch(0.68 0.17 155)",
    "oklch(0.72 0.16 75)",
  ];
  const created: PlotrConsistencyAsset = Object.freeze({
    id: `asset-user-${Date.now()}-${assets.length + 1}`,
    category: input.category,
    name: cleanName,
    visualNote: input.visualNote.trim(),
    swatchOklch: swatches[assets.length % swatches.length]!,
    costumeOrMaterial: input.costumeOrMaterial.trim() || "직접 등록한 소재",
  });
  return Object.freeze([...assets, created]);
}

/**
 * 선택 개수(0 / 1 / 2+)에 따라 역할이 자동 전환되는 컨텍스트 액션 바 상태 도출
 * (REA ev_05aec7d2… `/guide/canvas-basics/` 관찰).
 */
export function resolveContextPromptMode(selectedCutIds: readonly string[]): {
  readonly mode: "create" | "edit" | "compose-ref";
  readonly labelKo: string;
  readonly buttonLabelKo: string;
  readonly hintKo: string;
} {
  if (selectedCutIds.length === 0) {
    return {
      mode: "create",
      labelKo: "새 컷 추가",
      buttonLabelKo: "새 컷 만들기",
      hintKo: "장면 지문을 적으면 컷 스트립 끝에 새 컷이 추가됩니다.",
    };
  }
  if (selectedCutIds.length === 1) {
    return {
      mode: "edit",
      labelKo: "선택 컷 수정",
      buttonLabelKo: "선택 컷 반영",
      hintKo: "선택한 1개 컷의 구도·연출 지시를 바로 수정하거나 화풍만 바꿉니다.",
    };
  }
  return {
    mode: "compose-ref",
    labelKo: `컷 ${selectedCutIds.length}개 참조 합치기`,
    buttonLabelKo: "참조 컷 합성 만들기",
    hintKo: `선택한 ${selectedCutIds.length}개 컷의 소재와 구도를 순서대로 참조한 연결 컷을 만듭니다.`,
  };
}

/**
 * 플로터 '빈 컷 일괄 생성(소재 선행 · 동시 3건 · Esc 중단)' 로컬 콘티 조립 큐.
 * 유료 외부 모델 생성을 흉내 내지 않고, 빈 소재의 기본 외형 브리프를 먼저 확정한 뒤
 * 아직 조립되지 않은 빈 컷들의 화풍·소재 참조·구도 브리프를 3건씩 정직하게 채운다.
 */
export function createBatchCutQueue(
  assets: readonly PlotrConsistencyAsset[],
  cuts: readonly PlotrCutCard[],
): PlotrBatchQueueState {
  const pendingAssetIds = assets
    .filter((asset) => asset.visualNote.trim().length === 0)
    .map((asset) => asset.id);
  const queuedCutIds = cuts
    .filter((cut) => !cut.renderReady)
    .map((cut) => cut.id);

  if (pendingAssetIds.length === 0 && queuedCutIds.length === 0) {
    return Object.freeze({
      active: false,
      cancelled: false,
      phase: "done",
      pendingAssetIds: Object.freeze([]),
      queuedCutIds: Object.freeze([]),
      completedCutIds: Object.freeze([]),
      concurrency: 3,
      statusMessageKo: "모든 빈 컷이 이미 콘티 조립을 마쳤어요.",
    });
  }

  return Object.freeze({
    active: true,
    cancelled: false,
    phase: pendingAssetIds.length > 0 ? "resolving-assets" : "building-cuts",
    pendingAssetIds: Object.freeze(pendingAssetIds),
    queuedCutIds: Object.freeze(queuedCutIds),
    completedCutIds: Object.freeze([]),
    concurrency: 3,
    statusMessageKo:
      pendingAssetIds.length > 0
        ? `비어 있는 일관성 소재 ${pendingAssetIds.length}건을 먼저 채우고 있어요… (Esc로 중단)`
        : `빈 컷 ${queuedCutIds.length}건을 동시 3컷씩 콘티 조립 중이에요… (Esc로 중단)`,
  });
}

export function stepBatchCutQueue(
  queue: PlotrBatchQueueState,
  assets: readonly PlotrConsistencyAsset[],
  cuts: readonly PlotrCutCard[],
  artStyle: PlotrArtStyleDna,
): {
  readonly nextQueue: PlotrBatchQueueState;
  readonly nextAssets: readonly PlotrConsistencyAsset[];
  readonly nextCuts: readonly PlotrCutCard[];
} {
  if (!queue.active || queue.cancelled) {
    return { nextQueue: queue, nextAssets: assets, nextCuts: cuts };
  }

  if (queue.pendingAssetIds.length > 0) {
    const resolvedSet = new Set(queue.pendingAssetIds);
    const nextAssets = Object.freeze(
      assets.map((asset) =>
        resolvedSet.has(asset.id)
          ? Object.freeze({
              ...asset,
              visualNote: `${artStyle.labelKo} 톤 · ${asset.costumeOrMaterial || "기본 외형 기준 확정"}`,
            })
          : asset,
      ),
    );
    const hasCuts = queue.queuedCutIds.length > 0;
    return {
      nextAssets,
      nextCuts: cuts,
      nextQueue: Object.freeze({
        ...queue,
        active: hasCuts,
        phase: hasCuts ? "building-cuts" : "done",
        pendingAssetIds: Object.freeze([]),
        statusMessageKo: hasCuts
          ? `소재 기준 확정 완료! 빈 컷 ${queue.queuedCutIds.length}건을 동시 3컷씩 조립합니다…`
          : "비어 있던 소재 기준을 모두 채웠어요.",
      }),
    };
  }

  const batchIds = queue.queuedCutIds.slice(0, queue.concurrency);
  const remaining = queue.queuedCutIds.slice(queue.concurrency);
  const batchSet = new Set(batchIds);
  const assetById = new Map(assets.map((a) => [a.id, a]));

  const nextCuts = Object.freeze(
    cuts.map((cut) => {
      if (!batchSet.has(cut.id)) return cut;
      const refNames = cut.referencedAssetIds
        .map((id) => assetById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const refLine = refNames.length > 0 ? `참조 소재(${refNames.join(", ")})` : "단독 장면";
      return Object.freeze({
        ...cut,
        renderReady: true,
        compositionBrief: `[${artStyle.labelKo}] ${refLine} · ${cut.cameraShot} · ${cut.actionSummary}`,
      });
    }),
  );

  const completedCutIds = Object.freeze([...queue.completedCutIds, ...batchIds]);
  const done = remaining.length === 0;
  return {
    nextAssets: assets,
    nextCuts,
    nextQueue: Object.freeze({
      ...queue,
      active: !done,
      phase: done ? "done" : "building-cuts",
      queuedCutIds: Object.freeze(remaining),
      completedCutIds,
      statusMessageKo: done
        ? `빈 컷 ${completedCutIds.length}건 콘티 조립을 마쳤어요. 이제 말풍선을 한꺼번에 올릴 수 있어요.`
        : `콘티 조립 진행 중 (${completedCutIds.length}/${completedCutIds.length + remaining.length}컷 완료 · Esc로 중단)`,
    }),
  };
}

export function cancelBatchCutQueue(queue: PlotrBatchQueueState): PlotrBatchQueueState {
  return Object.freeze({
    ...queue,
    active: false,
    cancelled: true,
    phase: "cancelled",
    statusMessageKo: `일괄 조립을 중단했어요. 완료된 ${queue.completedCutIds.length}컷은 그대로 유지됩니다.`,
  });
}

/**
 * 플로터 '글콘티 텍스트 (.txt)' 내보내기 — 그림 이미지가 없어도 언제든 내보낸다.
 */
export function exportPlotrTextConti(doc: PlotrDocumentState): string {
  const assetById = new Map(doc.assets.map((a) => [a.id, a]));
  const lines: string[] = [
    `# ${doc.title} — 글콘티 (${doc.format})`,
    `그림체: ${doc.artStyle.labelKo} · 총 ${doc.cuts.length}컷`,
    "",
  ];
  for (const cut of doc.cuts) {
    const refs = cut.referencedAssetIds
      .map((id) => assetById.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    lines.push(`[${cut.sceneTitle}] ${cut.cameraShot} · 장소: ${cut.locationName} · 텐션 ${cut.tensionScore}`);
    if (refs.length > 0) lines.push(`참조 소재: ${refs.join(", ")}`);
    lines.push(`지문: ${cut.actionSummary}`);
    for (const dlg of cut.dialogues) {
      if (dlg.kind === "narration") {
        lines.push(`(나레이션) ${dlg.text}`);
      } else {
        lines.push(`${dlg.speaker || "화자"}: "${dlg.text}"`);
      }
    }
    if (cut.effectLine !== "none" || cut.sfxText) {
      lines.push(
        `연출: ${PLOTR_EFFECT_LINE_LABELS[cut.effectLine]}${cut.sfxText ? ` · 효과음 ${cut.sfxText}` : ""}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/**
 * Plotr 작업본을 ToonStudio 정본 회차 기획(EpisodePlanWithSynopsis) 패치로 변환한다.
 */
export function buildEpisodePlanPatchFromPlotr(
  basePlan: EpisodePlanWithSynopsis,
  doc: PlotrDocumentState,
): EpisodePlanWithSynopsis {
  const turningPoints = doc.cuts.map((cut) => `${cut.sceneTitle}: ${cut.actionSummary}`);
  const firstCut = doc.cuts[0];
  const lastCut = doc.cuts[doc.cuts.length - 1];
  const synopsis =
    doc.helper.logline.trim() ||
    doc.cuts.slice(0, 3).map((cut) => cut.actionSummary).join(" ");
  const cliffhanger =
    lastCut?.dialogues[lastCut.dialogues.length - 1]?.text ||
    lastCut?.actionSummary ||
    basePlan.cliffhanger;

  return Object.freeze({
    ...basePlan,
    title: doc.title.trim() || basePlan.title,
    goal: doc.helper.logline.trim() || basePlan.goal || `${doc.title} 핵심 사건 전개`,
    logline: doc.helper.logline.trim() || basePlan.logline,
    synopsis,
    turningPoints: Object.freeze(turningPoints),
    cliffhanger,
    targetCutCount: doc.cuts.length,
    emotionalArc: {
      from: firstCut?.emotionBeat || basePlan.emotionalArc?.from || "도입",
      to: lastCut?.emotionBeat || basePlan.emotionalArc?.to || "여운",
    },
  });
}
