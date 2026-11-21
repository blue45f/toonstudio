/**
 * CRECO++ 초기 워크스페이스 시드 및 5계층 버전 체인 빌더.
 */

import {
  computeDeterministicDigest,
  getStageMeta,
  type CompareSlotRef,
  type CrecoCollabWorkspaceState,
  type CrecoCutArtifact,
  type CrecoCutChangeBadge,
  type CrecoImmutableVersion,
  type CrecoPinFeedback,
  type CrecoStageId,
  type CrecoStageNode,
} from "./creco-version-compare-types";

const DEFAULT_CUT_TEMPLATES: readonly {
  readonly title: string;
  readonly dialogueSummary: string;
  readonly heightPx: number;
  readonly moodSurfaceOklch: string;
  readonly keyFocalOklch: string;
}[] = [
  {
    title: "컷 1 · 옥상 난간 대치 와이드 샷",
    dialogueSummary: "비 내리는 야경 위 주인공과 추격자 첫 시선 교차",
    heightPx: 1480,
    moodSurfaceOklch: "oklch(0.91 0.028 250)",
    keyFocalOklch: "oklch(0.46 0.14 255)",
  },
  {
    title: "컷 2 · 손끝 마법진 클로즈업",
    dialogueSummary: "“지금 열지 않으면 탑 전체가 무너져.”",
    heightPx: 1240,
    moodSurfaceOklch: "oklch(0.92 0.032 68)",
    keyFocalOklch: "oklch(0.56 0.16 42)",
  },
  {
    title: "컷 3 · 도약 액션 세로 롱 컷",
    dialogueSummary: "효과음 [콰아앙—!]과 빗방울 궤적 속도선",
    heightPx: 1920,
    moodSurfaceOklch: "oklch(0.90 0.030 22)",
    keyFocalOklch: "oklch(0.50 0.18 24)",
  },
  {
    title: "컷 4 · 봉인 해제 후 정적 여운",
    dialogueSummary: "빛이 가라앉으며 다음 화 예고 말풍선 배치",
    heightPx: 1360,
    moodSurfaceOklch: "oklch(0.93 0.026 165)",
    keyFocalOklch: "oklch(0.47 0.13 160)",
  },
];

export function buildStageArtifacts(
  stageId: CrecoStageId,
  versionNumber: number,
  updatedCutIndices: readonly number[],
): readonly CrecoCutArtifact[] {
  const meta = getStageMeta(stageId);
  return DEFAULT_CUT_TEMPLATES.map((tpl, cutIndex) => {
    const isUpdated = versionNumber === 1 || updatedCutIndices.includes(cutIndex);
    const changeBadge: CrecoCutChangeBadge =
      versionNumber === 1 ? "new" : isUpdated ? "updated" : "unchanged";
    const fileSizeKb = 420 + versionNumber * 18 + cutIndex * 65;
    return {
      cutIndex,
      cutId: `${stageId}-cut-${cutIndex + 1}`,
      title: tpl.title,
      widthPx: 800,
      heightPx: Math.round(tpl.heightPx * meta.heightScale),
      layerId: `${meta.defaultLayerId}-c${cutIndex + 1}`,
      layerName: `${meta.defaultLayerName}_컷${cutIndex + 1}`,
      fileSizeKb,
      digest: computeDeterministicDigest(`${stageId}:v${versionNumber}:c${cutIndex}`),
      changeBadge,
      dialogueSummary:
        stageId === "loc-ja"
          ? `[JA] ${tpl.dialogueSummary}`
          : stageId === "loc-en"
            ? `[EN] ${tpl.dialogueSummary}`
            : tpl.dialogueSummary,
      moodSurfaceOklch: tpl.moodSurfaceOklch,
      keyFocalOklch: tpl.keyFocalOklch,
    };
  });
}

function buildVersionChain(
  stageId: CrecoStageId,
  count: number,
  authorName: string,
  approvedUpTo: number,
  summaries: readonly string[],
): readonly CrecoImmutableVersion[] {
  const meta = getStageMeta(stageId);
  const versions: CrecoImmutableVersion[] = [];
  for (let num = 1; num <= count; num += 1) {
    const parentVersionId = num === 1 ? null : `${stageId}-v${num - 1}`;
    const isApproved = num <= approvedUpTo;
    const summary =
      summaries[num - 1] ?? `${meta.shortLabel} ${num}차 검수 반영 및 컷 밸런스 보정`;
    const artifacts = buildStageArtifacts(stageId, num, [(num - 1) % DEFAULT_CUT_TEMPLATES.length]);
    versions.push({
      versionId: `${stageId}-v${num}`,
      versionNumber: num,
      label: `${meta.shortLabel} ${num}차`,
      stageId,
      parentVersionId,
      createdAtIso: `2026-11-${String(10 + num).padStart(2, "0")}T10:30:00Z`,
      authorName,
      summary,
      workMinutes: 45 + num * 12,
      visibility: "public",
      lifecycle: isApproved ? "stage-closed" : "work-done",
      approved: isApproved,
      digest: computeDeterministicDigest(`${stageId}:v${num}:${summary}`),
      artifacts,
      contributors: [{ name: authorName, sharePct: 100 }],
    });
  }
  return versions;
}

export function createInitialCrecoWorkspaceState(): CrecoCollabWorkspaceState {
  const stageConfigs: readonly {
    readonly stageId: CrecoStageId;
    readonly count: number;
    readonly author: string;
    readonly approvedUpTo: number;
    readonly summaries: readonly string[];
  }[] = [
    {
      stageId: "script-conti",
      count: 4,
      author: "윤서연(글작가)",
      approvedUpTo: 4,
      summaries: [
        "1차 시놉시스 및 대사 초고",
        "옥상 대치 템포 압축",
        "엔딩 후킹 대사 강화",
        "PD 검수 완료 최종 글콘티",
      ],
    },
    {
      stageId: "storyboard-conti",
      count: 7,
      author: "김도현(콘티)",
      approvedUpTo: 7,
      summaries: [
        "초안 4컷 구도 배치",
        "컷 1 로우앵글 전환",
        "컷 2 손끝 포커스 강조",
        "컷 3 롱스크롤 낙하 여백 확보",
        "말풍선 시선 흐름 정리",
        "연출 리듬 PD 피드백 반영",
        "콘티 7차 최종 승인본",
      ],
    },
    {
      stageId: "lineart",
      count: 1,
      author: "박하린(선화)",
      approvedUpTo: 1,
      summaries: ["콘티 7차 기반 주인공·추격자 주선화 1차"],
    },
    {
      stageId: "bg3d",
      count: 2,
      author: "정민재(배경3D)",
      approvedUpTo: 2,
      summaries: ["옥상 난간·야경 3D 카메라 구도 1차", "비 젖은 바닥 반사 NPR 라인 추출 2차"],
    },
    {
      stageId: "coloring",
      count: 2,
      author: "최지우(채색)",
      approvedUpTo: 1,
      summaries: ["밑색 분할 및 기본 톤 지정", "야경 역광 AI 음영 1차 후보 적용"],
    },
    {
      stageId: "lettering",
      count: 3,
      author: "한소율(식자)",
      approvedUpTo: 3,
      summaries: [
        "기본 대사 배치 1차",
        "효과음 콰아앙 궤적 변형 2차",
        "모바일 가독성 기준 자간·말풍선 3차 확정",
      ],
    },
    {
      stageId: "loc-ja",
      count: 3,
      author: "사토 미유(일본어)",
      approvedUpTo: 3,
      summaries: [
        "일본어 초역 세로 식자 1차",
        "효과음 가타카나 리터칭 2차",
        "피코마 세로 여백 규격 3차 승인",
      ],
    },
    {
      stageId: "loc-en",
      count: 2,
      author: "알렉스 킴(영어)",
      approvedUpTo: 2,
      summaries: ["영어 초역 말풍선 배치", "웹툰 글로벌 폰트 크기 보정 2차"],
    },
  ];

  const stages: CrecoStageNode[] = stageConfigs.map((cfg) => {
    const meta = getStageMeta(cfg.stageId);
    const versions = buildVersionChain(
      cfg.stageId,
      cfg.count,
      cfg.author,
      cfg.approvedUpTo,
      cfg.summaries,
    );
    const latest = versions[versions.length - 1];
    const approved = [...versions].reverse().find((item) => item.approved) ?? null;
    return {
      stageId: cfg.stageId,
      label: meta.label,
      shortLabel: meta.shortLabel,
      kind: meta.kind,
      versions,
      latestApprovedVersionId: approved ? approved.versionId : null,
      activeVersionId: latest ? latest.versionId : `${cfg.stageId}-v1`,
    };
  });

  const defaultSlots: CompareSlotRef[] = [
    {
      slotId: "lane-1",
      stageId: "storyboard-conti",
      versionId: "storyboard-conti-v7",
      heightScale: getStageMeta("storyboard-conti").heightScale,
    },
    {
      slotId: "lane-2",
      stageId: "lineart",
      versionId: "lineart-v1",
      heightScale: getStageMeta("lineart").heightScale,
    },
    {
      slotId: "lane-3",
      stageId: "lettering",
      versionId: "lettering-v3",
      heightScale: getStageMeta("lettering").heightScale,
    },
    {
      slotId: "lane-4",
      stageId: "loc-ja",
      versionId: "loc-ja-v3",
      heightScale: getStageMeta("loc-ja").heightScale,
    },
  ];

  const slotScrollRatios: Record<string, number> = {};
  for (const slot of defaultSlots) {
    slotScrollRatios[slot.slotId] = 0;
  }

  const initialFeedbacks: CrecoPinFeedback[] = [
    {
      id: "pin-101",
      stageId: "lineart",
      versionId: "lineart-v1",
      cutIndex: 0,
      xPct: 62,
      yPct: 38,
      layerId: "layer-ink-vector-c1",
      layerName: "02_캐릭터_주선화_컷1",
      authorName: "오태훈(담당 PD)",
      assigneeName: "박하린(선화)",
      body: "주인공 오른쪽 어깨 실루엣이 콘티 7차보다 살짝 좁습니다. 외투 깃을 바깥으로 6% 넓혀 주세요.",
      importance: "required",
      visibility: "public",
      status: "open",
      strokes: [
        {
          id: "stroke-101",
          widthPx: 3,
          tone: "crimson",
          points: [
            { xPct: 55, yPct: 32 },
            { xPct: 64, yPct: 36 },
            { xPct: 68, yPct: 45 },
          ],
        },
      ],
      createdAtIso: "2026-11-18T11:20:00Z",
      resolvedBy: null,
      resolvedAtIso: null,
    },
    {
      id: "pin-102",
      stageId: "lettering",
      versionId: "lettering-v3",
      cutIndex: 2,
      xPct: 34,
      yPct: 52,
      layerId: "layer-ko-balloon-c3",
      layerName: "05_한국어_말풍선_효과음_컷3",
      authorName: "김도현(콘티)",
      assigneeName: "한소율(식자)",
      body: "효과음 [콰아앙—!] 꼬리가 추격자 얼굴을 살짝 가립니다. 좌측 상단 여백으로 살짝 올려 두면 완벽합니다.",
      importance: "recommended",
      visibility: "public",
      status: "in-progress",
      strokes: [
        {
          id: "stroke-102",
          widthPx: 3,
          tone: "amber",
          points: [
            { xPct: 28, yPct: 48 },
            { xPct: 36, yPct: 54 },
          ],
        },
      ],
      createdAtIso: "2026-11-18T13:10:00Z",
      resolvedBy: null,
      resolvedAtIso: null,
    },
    {
      id: "pin-103",
      stageId: "loc-ja",
      versionId: "loc-ja-v3",
      cutIndex: 1,
      xPct: 72,
      yPct: 26,
      layerId: "layer-ja-vertical-c2",
      layerName: "06_일본어_세로식자_컷2",
      authorName: "오태훈(담당 PD)",
      assigneeName: "사토 미유(일본어)",
      body: "세로 식자 루비 간격 아주 깔끔합니다. 최종 검수 전 내부 메모 초안으로 남깁니다.",
      importance: "suggestion",
      visibility: "private",
      status: "open",
      strokes: [],
      createdAtIso: "2026-11-18T14:05:00Z",
      resolvedBy: null,
      resolvedAtIso: null,
    },
  ];

  return {
    tree: {
      projectId: "proj-moonlight-atelier",
      projectTitle: "달빛 아틀리에 연대기",
      abbreviation: "MOON",
      episode: {
        episodeId: "ep-042",
        episodeNumber: 42,
        title: "42화 · 옥상 추격과 봉인 해제",
        treatment: "비 내리는 야경 옥상에서 봉인의 열쇠를 둘러싼 결정적 대치와 각성",
        stages,
      },
      canonicalShareLink: {
        shareId: "share-moon-ep42",
        url: "https://toonstudio.kr/review/MOON/ep-042/canonical",
        mode: "latest-approved",
        stageId: "lettering",
        pinnedVersionId: null,
      },
    },
    compare: {
      layoutMode: "vertical-sync",
      syncMode: "all-lock",
      slots: defaultSlots,
      activeCutIndex: 0,
      masterScrollRatio: 0,
      slotScrollRatios,
      wipePercent: 50,
      wipeBeforeSlotIndex: 0,
      wipeAfterSlotIndex: 1,
    },
    feedbacks: initialFeedbacks,
  };
}
