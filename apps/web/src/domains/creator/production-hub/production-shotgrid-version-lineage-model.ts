/**
 * ShotGrid(Autodesk Flow Production Tracking — 구 Shotgun) 역공학 기반
 * 웹툰·노블코믹스 스튜디오용 버전 히스토리(수정 전 Before ↔ 수정 후 After),
 * 리테이크 노트 반영 검증, PublishedFile 의존성 그래프 도메인 모델.
 */

export type ShotGridStatusCode =
  | "wtg"
  | "rdy"
  | "ip"
  | "rev"
  | "fix"
  | "cda"
  | "apr"
  | "fin";

export type ShotGridPipelineStep =
  | "storyboard"
  | "line-art"
  | "base-color"
  | "shading"
  | "background-3d"
  | "lighting-fx"
  | "typesetting";

export type ShotGridReviewCompareMode =
  | "side-by-side"
  | "ab-wipe"
  | "onion-skin"
  | "diff-matte";

export interface ShotGridCutChangeRegion {
  readonly regionId: string;
  readonly cutNumber: number;
  readonly label: string;
  readonly xPercent: number;
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
  readonly changedPixelRatio: number;
  readonly deltaE: number;
  readonly beforeSummary: string;
  readonly afterSummary: string;
  readonly linkedNoteId?: string | null;
}

export interface ShotGridVersionRecord {
  readonly id: string;
  readonly versionCode: string;
  readonly versionNumber: number;
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly step: ShotGridPipelineStep;
  readonly cutRange: readonly [number, number];
  readonly status: ShotGridStatusCode;
  readonly artistId: string;
  readonly artistName: string;
  readonly createdAt: string;
  readonly parentVersionId: string | null;
  readonly byteHash: string;
  readonly resolution: string;
  readonly fileSizeBytes: number;
  readonly comment: string;
  readonly triggeredByNoteId: string | null;
  readonly changeRegions: readonly ShotGridCutChangeRegion[];
  readonly publishedFileIds: readonly string[];
}

export interface ShotGridPublishedFileRecord {
  readonly id: string;
  readonly code: string;
  readonly fileType: "clip" | "psd" | "skp" | "vrm" | "png-pack";
  readonly versionNumber: number;
  readonly step: ShotGridPipelineStep;
  readonly path: string;
  readonly byteHash: string;
  readonly upstreamFileIds: readonly string[];
  readonly linkedVersionId: string;
}

export interface ShotGridRetakeNote {
  readonly id: string;
  readonly targetVersionId: string;
  readonly resolvedInVersionId: string | null;
  readonly cutNumber: number;
  readonly authorName: string;
  readonly body: string;
  readonly status: "open" | "addressed" | "verified";
}

export interface BeforeAfterVersionDiffReport {
  readonly beforeVersionId: string;
  readonly beforeVersionCode: string;
  readonly afterVersionId: string;
  readonly afterVersionCode: string;
  readonly isDirectParentChild: boolean;
  readonly lineagePathCodes: readonly string[];
  readonly hashChanged: boolean;
  readonly resolutionChanged: boolean;
  readonly fileSizeDeltaBytes: number;
  readonly modifiedCutNumbers: readonly number[];
  readonly changeRegions: readonly ShotGridCutChangeRegion[];
  readonly averageDeltaE: number;
  readonly maxDeltaE: number;
  readonly averageChangedPixelRatio: number;
  readonly verifiedNoteIds: readonly string[];
  readonly unverifiedNoteIds: readonly string[];
}

export interface PublishedFileDownstreamImpact {
  readonly modifiedFileId: string;
  readonly modifiedFileCode: string;
  readonly directDownstreamIds: readonly string[];
  readonly transitiveDownstreamIds: readonly string[];
  readonly affectedSteps: readonly ShotGridPipelineStep[];
}

export interface ShotGridVersionFilterInput {
  readonly step?: ShotGridPipelineStep | "all";
  readonly statusIn?: readonly ShotGridStatusCode[];
  readonly cutNumber?: number | null;
  readonly searchQuery?: string;
}

export const SHOTGRID_STATUS_META: Readonly<
  Record<
    ShotGridStatusCode,
    { readonly code: ShotGridStatusCode; readonly labelKo: string; readonly labelEn: string; readonly bg: string; readonly color: string }
  >
> = {
  wtg: { code: "wtg", labelKo: "대기 (WTG)", labelEn: "Waiting to Start", bg: "#f1f5f9", color: "#475569" },
  rdy: { code: "rdy", labelKo: "준비 완료 (RDY)", labelEn: "Ready to Start", bg: "#e0f2fe", color: "#0369a1" },
  ip: { code: "ip", labelKo: "작업 중 (IP)", labelEn: "In Progress", bg: "#dbeafe", color: "#1d4ed8" },
  rev: { code: "rev", labelKo: "PD 검수 대기 (REV)", labelEn: "Pending Review", bg: "#fef3c7", color: "#b45309" },
  fix: { code: "fix", labelKo: "리테이크 요청 (FIX)", labelEn: "Needs Fix / Retake", bg: "#fee2e2", color: "#b91c1c" },
  cda: { code: "cda", labelKo: "조건부 승인 (CDA)", labelEn: "Conditional Approval", bg: "#ede9fe", color: "#6d28d9" },
  apr: { code: "apr", labelKo: "승인 완료 (APR)", labelEn: "Approved", bg: "#dcfce7", color: "#15803d" },
  fin: { code: "fin", labelKo: "최종 마감 (FIN)", labelEn: "Final Locked", bg: "#14532d", color: "#ffffff" },
};

export const SHOTGRID_STEP_LABELS: Readonly<Record<ShotGridPipelineStep, string>> = {
  storyboard: "콘티·각색 (Storyboard)",
  "line-art": "선화·펜터치 (Line Art)",
  "base-color": "밑색·지정색 (Base Color)",
  shading: "명암·채색 (Shading)",
  "background-3d": "배경·3D 합성 (BG 3D)",
  "lighting-fx": "후보정·이펙트 (Lighting FX)",
  typesetting: "식자·최종 편집 (Typesetting)",
};

/**
 * 특정 버전까지의 부모-자식 버전 계보(Lineage Chain)를 루트(v001)부터 순서대로 추적한다.
 * 순환 참조가 있어도 안전하게 종료한다.
 */
export function buildVersionLineageChain(
  versions: readonly ShotGridVersionRecord[],
  targetVersionId: string,
): readonly ShotGridVersionRecord[] {
  const byId = new Map(versions.map((version) => [version.id, version]));
  const chain: ShotGridVersionRecord[] = [];
  const visited = new Set<string>();
  let cursor: ShotGridVersionRecord | undefined = byId.get(targetVersionId);

  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentVersionId ? byId.get(cursor.parentVersionId) : undefined;
  }

  return chain.reverse();
}

/**
 * 수정 전(Before) 버전과 수정 후(After) 버전 사이의 픽셀/컷 변경 영역, ΔE 색차,
 * 그리고 수정 전 버전에 달린 리테이크 노트(Note)가 수정 후 버전에서 실제로 반영되었는지 계산한다.
 */
export function computeBeforeAfterVersionDiff(
  versions: readonly ShotGridVersionRecord[],
  beforeVersionId: string,
  afterVersionId: string,
  retakeNotes: readonly ShotGridRetakeNote[] = [],
): BeforeAfterVersionDiffReport | null {
  const byId = new Map(versions.map((version) => [version.id, version]));
  const before = byId.get(beforeVersionId);
  const after = byId.get(afterVersionId);
  if (!before || !after) return null;

  const afterLineage = buildVersionLineageChain(versions, after.id);
  const beforeIdx = afterLineage.findIndex((item) => item.id === before.id);
  const intermediateVersions =
    beforeIdx >= 0 ? afterLineage.slice(beforeIdx + 1) : [after];
  const lineagePathCodes =
    beforeIdx >= 0
      ? afterLineage.slice(beforeIdx).map((item) => item.versionCode)
      : [before.versionCode, after.versionCode];

  const aggregatedRegions: ShotGridCutChangeRegion[] = [];
  for (const ver of intermediateVersions) {
    for (const region of ver.changeRegions) {
      aggregatedRegions.push(region);
    }
  }

  const modifiedCutNumbers = [...new Set(aggregatedRegions.map((region) => region.cutNumber))].toSorted(
    (a, b) => a - b,
  );

  const regionCount = aggregatedRegions.length;
  const totalDeltaE = aggregatedRegions.reduce((sum, item) => sum + item.deltaE, 0);
  const maxDeltaE = aggregatedRegions.reduce((max, item) => Math.max(max, item.deltaE), 0);
  const totalRatio = aggregatedRegions.reduce((sum, item) => sum + item.changedPixelRatio, 0);

  const relevantNotes = retakeNotes.filter((note) => note.targetVersionId === before.id);
  const verifiedNoteIds: string[] = [];
  const unverifiedNoteIds: string[] = [];

  for (const note of relevantNotes) {
    const matchedRegion = aggregatedRegions.some(
      (region) =>
        (region.linkedNoteId === note.id || region.cutNumber === note.cutNumber) &&
        region.changedPixelRatio > 0 &&
        region.deltaE > 0.5,
    );
    if (matchedRegion) {
      verifiedNoteIds.push(note.id);
    } else {
      unverifiedNoteIds.push(note.id);
    }
  }

  return {
    beforeVersionId: before.id,
    beforeVersionCode: before.versionCode,
    afterVersionId: after.id,
    afterVersionCode: after.versionCode,
    isDirectParentChild: after.parentVersionId === before.id,
    lineagePathCodes,
    hashChanged: before.byteHash !== after.byteHash,
    resolutionChanged: before.resolution !== after.resolution,
    fileSizeDeltaBytes: after.fileSizeBytes - before.fileSizeBytes,
    modifiedCutNumbers,
    changeRegions: aggregatedRegions,
    averageDeltaE: regionCount > 0 ? Number((totalDeltaE / regionCount).toFixed(2)) : 0,
    maxDeltaE: Number(maxDeltaE.toFixed(2)),
    averageChangedPixelRatio:
      regionCount > 0 ? Number((totalRatio / regionCount).toFixed(3)) : 0,
    verifiedNoteIds,
    unverifiedNoteIds,
  };
}

/**
 * 상위 공정의 PublishedFile(.clip, .psd, .skp 등)이 갱신되었을 때
 * 이를 참조하는 하위 공정 파일(Downstream)과 영향받는 공정 목록을 DAG 탐색으로 계산한다.
 */
export function analyzePublishedFileDownstreamImpact(
  files: readonly ShotGridPublishedFileRecord[],
  modifiedFileId: string,
): PublishedFileDownstreamImpact | null {
  const byId = new Map(files.map((file) => [file.id, file]));
  const root = byId.get(modifiedFileId);
  if (!root) return null;

  const directDownstreamIds = files
    .filter((file) => file.upstreamFileIds.includes(modifiedFileId))
    .map((file) => file.id);

  const visited = new Set<string>();
  const queue = [...directDownstreamIds];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) continue;
    visited.add(currentId);
    for (const candidate of files) {
      if (candidate.upstreamFileIds.includes(currentId) && !visited.has(candidate.id)) {
        queue.push(candidate.id);
      }
    }
  }

  const transitiveDownstreamIds = [...visited];
  const affectedSteps = [
    ...new Set(
      transitiveDownstreamIds
        .map((id) => byId.get(id)?.step)
        .filter((step): step is ShotGridPipelineStep => Boolean(step)),
    ),
  ];

  return {
    modifiedFileId: root.id,
    modifiedFileCode: root.code,
    directDownstreamIds,
    transitiveDownstreamIds,
    affectedSteps,
  };
}

/**
 * ShotGrid 복합 필터 문법(공정, 상태 목록, 컷 번호 포함 여부, 검색어)으로 버전 목록을 필터링한다.
 */
export function filterShotGridVersions(
  versions: readonly ShotGridVersionRecord[],
  filter: ShotGridVersionFilterInput,
): readonly ShotGridVersionRecord[] {
  const query = (filter.searchQuery ?? "").trim().toLowerCase();
  return versions.filter((version) => {
    if (filter.step && filter.step !== "all" && version.step !== filter.step) {
      return false;
    }
    if (filter.statusIn && filter.statusIn.length > 0 && !filter.statusIn.includes(version.status)) {
      return false;
    }
    if (typeof filter.cutNumber === "number" && Number.isFinite(filter.cutNumber)) {
      const [startCut, endCut] = version.cutRange;
      if (filter.cutNumber < startCut || filter.cutNumber > endCut) {
        return false;
      }
    }
    if (query.length > 0) {
      const haystack = [
        version.versionCode,
        version.episodeLabel,
        version.artistName,
        version.comment,
        ...version.changeRegions.map((region) => `${region.label} ${region.beforeSummary} ${region.afterSummary}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/**
 * 버전의 ShotGrid 상태(wtg/rdy/ip/rev/fix/cda/apr/fin)를 전이한다.
 * 이미 최종 마감(fin)된 버전은 명시적 강제 해제 없이는 역전이를 차단한다.
 */
export function transitionShotGridVersionStatus(
  versions: readonly ShotGridVersionRecord[],
  versionId: string,
  nextStatus: ShotGridStatusCode,
  options?: { readonly allowReopenFinal?: boolean },
): {
  readonly updated: boolean;
  readonly reason?: "not-found" | "final-locked";
  readonly versions: readonly ShotGridVersionRecord[];
} {
  const target = versions.find((item) => item.id === versionId);
  if (!target) {
    return { updated: false, reason: "not-found", versions };
  }
  if (target.status === "fin" && nextStatus !== "fin" && !options?.allowReopenFinal) {
    return { updated: false, reason: "final-locked", versions };
  }
  return {
    updated: true,
    versions: versions.map((item) =>
      item.id === versionId ? { ...item, status: nextStatus } : item,
    ),
  };
}

export const INITIAL_SHOTGRID_VERSIONS: readonly ShotGridVersionRecord[] = [
  {
    id: "sg-ver-1",
    versionCode: "v001",
    versionNumber: 1,
    episodeId: "ep-48",
    episodeLabel: "화산귀환 48화",
    step: "shading",
    cutRange: [1, 65],
    status: "fix",
    artistId: "artist-color-1",
    artistName: "이채림 (메인 채색)",
    createdAt: "2026-10-24T11:20:00.000Z",
    parentVersionId: null,
    byteHash: "sha256-48c101a9",
    resolution: "1440×48000",
    fileSizeBytes: 38_400_000,
    comment: "48화 1~65컷 1차 밑색 및 기본 명암 배치본",
    triggeredByNoteId: null,
    changeRegions: [
      {
        regionId: "reg-v1-c14",
        cutNumber: 14,
        label: "14컷 청명 매화검기 기본 채색",
        xPercent: 18,
        yPercent: 22,
        widthPercent: 64,
        heightPercent: 48,
        changedPixelRatio: 0.42,
        deltaE: 14.2,
        beforeSummary: "선화 원고(무채색)",
        afterSummary: "매화검기 1차 분홍 광원(#F472B6) 기본 도포",
        linkedNoteId: null,
      },
    ],
    publishedFileIds: ["pub-psd-v1"],
  },
  {
    id: "sg-ver-2",
    versionCode: "v002",
    versionNumber: 2,
    episodeId: "ep-48",
    episodeLabel: "화산귀환 48화",
    step: "shading",
    cutRange: [1, 65],
    status: "fix",
    artistId: "artist-color-1",
    artistName: "이채림 (메인 채색)",
    createdAt: "2026-10-25T15:40:00.000Z",
    parentVersionId: "sg-ver-1",
    byteHash: "sha256-48c208b4",
    resolution: "1440×48000",
    fileSizeBytes: 41_120_000,
    comment: "14컷 매화검기 역광 강화 및 27컷 객잔 실내 그림자 톤 보강",
    triggeredByNoteId: "note-retake-1",
    changeRegions: [
      {
        regionId: "reg-v2-c14",
        cutNumber: 14,
        label: "14컷 청명 매화검기 역광 코어 명도 보정",
        xPercent: 20,
        yPercent: 24,
        widthPercent: 58,
        heightPercent: 44,
        changedPixelRatio: 0.28,
        deltaE: 9.6,
        beforeSummary: "단일 분홍 광원(#F472B6) 평면 채색",
        afterSummary: "검끝 코어 백색 발광(#FFF1F2) + 매화 잔상 다중 레이어 분리",
        linkedNoteId: "note-retake-1",
      },
      {
        regionId: "reg-v2-c27",
        cutNumber: 27,
        label: "27컷 야간 객잔 창가 역광 및 도복 주름 음영",
        xPercent: 12,
        yPercent: 52,
        widthPercent: 72,
        heightPercent: 36,
        changedPixelRatio: 0.19,
        deltaE: 6.8,
        beforeSummary: "실내 난색 조명 위주 단조로운 명암",
        afterSummary: "창밖 청색 달빛(#38BDF8) 림라이트 추가 및 흑색 도복 대비 강화",
        linkedNoteId: "note-retake-2",
      },
    ],
    publishedFileIds: ["pub-psd-v2"],
  },
  {
    id: "sg-ver-3",
    versionCode: "v003",
    versionNumber: 3,
    episodeId: "ep-48",
    episodeLabel: "화산귀환 48화",
    step: "shading",
    cutRange: [1, 65],
    status: "rev",
    artistId: "artist-color-1",
    artistName: "이채림 (메인 채색)",
    createdAt: "2026-10-26T05:30:00.000Z",
    parentVersionId: "sg-ver-2",
    byteHash: "sha256-48c399f1",
    resolution: "1440×48000",
    fileSizeBytes: 42_650_000,
    comment: "42컷 검기 파편 모션블러 색수차 보정 및 전 컷 피부톤 통일 완료",
    triggeredByNoteId: "note-retake-3",
    changeRegions: [
      {
        regionId: "reg-v3-c42",
        cutNumber: 42,
        label: "42컷 매화검결 폭발 컷 색수차·발광 레이어 보정",
        xPercent: 10,
        yPercent: 14,
        widthPercent: 80,
        heightPercent: 66,
        changedPixelRatio: 0.34,
        deltaE: 11.4,
        beforeSummary: "외곽 검기 채도 과포화로 캐릭터 얼굴 시인성 저하",
        afterSummary: "인물 주변 채도 18% 감쇠 및 시선 유도 하이라이트 재설계",
        linkedNoteId: "note-retake-3",
      },
    ],
    publishedFileIds: ["pub-psd-v3"],
  },
];

export const INITIAL_SHOTGRID_NOTES: readonly ShotGridRetakeNote[] = [
  {
    id: "note-retake-1",
    targetVersionId: "sg-ver-1",
    resolvedInVersionId: "sg-ver-2",
    cutNumber: 14,
    authorName: "김현준 메인 PD",
    body: "14컷 매화검기 코어 발광이 약합니다. 검끝 백색 코어와 꽃잎 잔상 레이어를 분리해 주세요.",
    status: "verified",
  },
  {
    id: "note-retake-2",
    targetVersionId: "sg-ver-1",
    resolvedInVersionId: "sg-ver-2",
    cutNumber: 27,
    authorName: "김현준 메인 PD",
    body: "27컷 야간 객잔 씬에서 달빛 역광(림라이트)을 도복 어깨선에 추가해 입체감을 살려 주세요.",
    status: "verified",
  },
  {
    id: "note-retake-3",
    targetVersionId: "sg-ver-2",
    resolvedInVersionId: "sg-ver-3",
    cutNumber: 42,
    authorName: "김현준 메인 PD",
    body: "42컷 검기 폭발 광량이 과해 청명 표정이 묻힙니다. 얼굴 주변 채도를 낮춰 시선을 집중시켜 주세요.",
    status: "addressed",
  },
];

export const INITIAL_SHOTGRID_PUBLISHED_FILES: readonly ShotGridPublishedFileRecord[] = [
  {
    id: "pub-clip-line-v2",
    code: "HSGH_ep48_lineart_v002.clip",
    fileType: "clip",
    versionNumber: 2,
    step: "line-art",
    path: "/projects/hsgh/ep48/lineart/HSGH_ep48_lineart_v002.clip",
    byteHash: "sha256-line48v2",
    upstreamFileIds: [],
    linkedVersionId: "sg-ver-1",
  },
  {
    id: "pub-skp-bg-v1",
    code: "HSGH_ep48_inn_night_v001.skp",
    fileType: "skp",
    versionNumber: 1,
    step: "background-3d",
    path: "/projects/hsgh/ep48/bg3d/HSGH_ep48_inn_night_v001.skp",
    byteHash: "sha256-bg48v1",
    upstreamFileIds: [],
    linkedVersionId: "sg-ver-2",
  },
  {
    id: "pub-psd-v3",
    code: "HSGH_ep48_shading_v003.psd",
    fileType: "psd",
    versionNumber: 3,
    step: "shading",
    path: "/projects/hsgh/ep48/shading/HSGH_ep48_shading_v003.psd",
    byteHash: "sha256-48c399f1",
    upstreamFileIds: ["pub-clip-line-v2", "pub-skp-bg-v1"],
    linkedVersionId: "sg-ver-3",
  },
  {
    id: "pub-psd-fx-v1",
    code: "HSGH_ep48_lighting_fx_v001.psd",
    fileType: "psd",
    versionNumber: 1,
    step: "lighting-fx",
    path: "/projects/hsgh/ep48/fx/HSGH_ep48_lighting_fx_v001.psd",
    byteHash: "sha256-fx48v1",
    upstreamFileIds: ["pub-psd-v3"],
    linkedVersionId: "sg-ver-3",
  },
  {
    id: "pub-png-typeset-v1",
    code: "HSGH_ep48_typeset_master_v001.png-pack",
    fileType: "png-pack",
    versionNumber: 1,
    step: "typesetting",
    path: "/projects/hsgh/ep48/final/HSGH_ep48_typeset_master_v001.png-pack",
    byteHash: "sha256-type48v1",
    upstreamFileIds: ["pub-psd-fx-v1"],
    linkedVersionId: "sg-ver-3",
  },
];
