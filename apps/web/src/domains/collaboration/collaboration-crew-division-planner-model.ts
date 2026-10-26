/**
 * Webtoon Weekly Episode Division-of-Labor Crew Simulator & Baton Planner Model
 *
 * Clean-room internalization of REA reverse-engineering evidence:
 * - Linear (`https://linear.app/`, AST `ev_1a0767916ccd345cf27bf77a2cd11acf76697f2eb9d006e04d6c05c3e7584be6`,
 *   routes `/plan`, `/build`, `/intake`, `/insights` — cycle capacity & bottleneck simulation)
 * - Kmong Enterprise (`https://kmong.com/`, AST `ev_2a801e736626b7d913f64e6c4a27d8e169a0784de4a11ed0052e3882a7ad907b`,
 *   routes `/enterprise/projects/new`, `/enterprise/simple-apply/gate` — modular crew outsourcing)
 */

export type CrewDivisionTrackKey =
  | "story_board"
  | "bg_3d"
  | "line_art"
  | "flat_color"
  | "shading_render"
  | "compositing_lettering";

export type TrackExecutionMode = "creator-solo" | "assistant-outsourced";

export type BurnoutRiskLevel = "safe" | "caution" | "overload";

export interface CrewDivisionTrackSpec {
  readonly key: CrewDivisionTrackKey;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly boardRoleFilter: "story" | "background" | "ink" | "color" | "lettering";
  readonly minutesPerCutSolo: number;
  readonly minutesPerCutCreatorReviewWhenOutsourced: number;
  readonly defaultRatePerCutKrw: number;
  readonly defaultMode: TrackExecutionMode;
}

export interface CrewTrackSimulationRow {
  readonly spec: CrewDivisionTrackSpec;
  readonly mode: TrackExecutionMode;
  readonly creatorHours: number;
  readonly assistantHours: number;
  readonly episodeCostKrw: number;
}

export interface CrewDivisionSimulationResult {
  readonly targetCuts: number;
  readonly weeklyDeadlineHours: number;
  readonly rows: readonly CrewTrackSimulationRow[];
  readonly totalCreatorHours: number;
  readonly totalAssistantHours: number;
  readonly parallelCriticalPathHours: number;
  readonly deadlineBufferHours: number;
  readonly estimatedEpisodeOutsourcingKrw: number;
  readonly burnoutRiskLevel: BurnoutRiskLevel;
  readonly bottleneckTrack: CrewDivisionTrackSpec;
}

export const CREW_DIVISION_TRACK_SPECS: readonly CrewDivisionTrackSpec[] = [
  {
    key: "story_board",
    labelKo: "1. 글·그림콘티 연출",
    labelEn: "1. Script & Storyboard",
    boardRoleFilter: "story",
    minutesPerCutSolo: 16,
    minutesPerCutCreatorReviewWhenOutsourced: 5,
    defaultRatePerCutKrw: 8000,
    defaultMode: "creator-solo",
  },
  {
    key: "bg_3d",
    labelKo: "2. 3D 배경·소품 배치",
    labelEn: "2. 3D Background & Props",
    boardRoleFilter: "background",
    minutesPerCutSolo: 18,
    minutesPerCutCreatorReviewWhenOutsourced: 3,
    defaultRatePerCutKrw: 14000,
    defaultMode: "assistant-outsourced",
  },
  {
    key: "line_art",
    labelKo: "3. 인물·의상 선화(펜선)",
    labelEn: "3. Character Line Art",
    boardRoleFilter: "ink",
    minutesPerCutSolo: 32,
    minutesPerCutCreatorReviewWhenOutsourced: 7,
    defaultRatePerCutKrw: 17000,
    defaultMode: "creator-solo",
  },
  {
    key: "flat_color",
    labelKo: "4. 밑색·부위별 마스킹",
    labelEn: "4. Flat Color & ID Mask",
    boardRoleFilter: "color",
    minutesPerCutSolo: 14,
    minutesPerCutCreatorReviewWhenOutsourced: 2,
    defaultRatePerCutKrw: 6500,
    defaultMode: "assistant-outsourced",
  },
  {
    key: "shading_render",
    labelKo: "5. 명암·피부·머리카락 채색",
    labelEn: "5. Shading & Rendering",
    boardRoleFilter: "color",
    minutesPerCutSolo: 24,
    minutesPerCutCreatorReviewWhenOutsourced: 5,
    defaultRatePerCutKrw: 12000,
    defaultMode: "creator-solo",
  },
  {
    key: "compositing_lettering",
    labelKo: "6. 후보정·이펙트·식자",
    labelEn: "6. Compositing, VFX & Lettering",
    boardRoleFilter: "lettering",
    minutesPerCutSolo: 12,
    minutesPerCutCreatorReviewWhenOutsourced: 3,
    defaultRatePerCutKrw: 6000,
    defaultMode: "creator-solo",
  },
];

export const DEFAULT_TRACK_MODES: Readonly<Record<CrewDivisionTrackKey, TrackExecutionMode>> = {
  story_board: "creator-solo",
  bg_3d: "assistant-outsourced",
  line_art: "creator-solo",
  flat_color: "assistant-outsourced",
  shading_render: "creator-solo",
  compositing_lettering: "creator-solo",
};

export function simulateCrewDivisionPlan(params: {
  readonly targetCuts: number;
  readonly weeklyDeadlineHours: number;
  readonly trackModes: Readonly<Record<CrewDivisionTrackKey, TrackExecutionMode>>;
}): CrewDivisionSimulationResult {
  const safeCuts = Math.max(10, Math.min(150, Math.round(params.targetCuts)));
  const safeDeadline = Math.max(24, Math.min(168, Math.round(params.weeklyDeadlineHours)));

  const rows: CrewTrackSimulationRow[] = CREW_DIVISION_TRACK_SPECS.map((spec) => {
    const mode = params.trackModes[spec.key] ?? spec.defaultMode;
    if (mode === "creator-solo") {
      const creatorHours = Number(((safeCuts * spec.minutesPerCutSolo) / 60).toFixed(1));
      return {
        spec,
        mode,
        creatorHours,
        assistantHours: 0,
        episodeCostKrw: 0,
      };
    }
    const creatorHours = Number(
      ((safeCuts * spec.minutesPerCutCreatorReviewWhenOutsourced) / 60).toFixed(1),
    );
    const assistantHours = Number(
      ((safeCuts * (spec.minutesPerCutSolo * 0.85)) / 60).toFixed(1),
    );
    const episodeCostKrw = safeCuts * spec.defaultRatePerCutKrw;
    return {
      spec,
      mode,
      creatorHours,
      assistantHours,
      episodeCostKrw,
    };
  });

  const totalCreatorHours = Number(
    rows.reduce((sum, r) => sum + r.creatorHours, 0).toFixed(1),
  );
  const totalAssistantHours = Number(
    rows.reduce((sum, r) => sum + r.assistantHours, 0).toFixed(1),
  );
  const longestAssistantTrackHours = Math.max(0, ...rows.map((r) => r.assistantHours));
  // Parallel critical path: creator sequential hours + longest parallel assistant track handoff span
  const parallelCriticalPathHours = Number(
    (totalCreatorHours + longestAssistantTrackHours * 0.85).toFixed(1),
  );
  const deadlineBufferHours = Number(
    (safeDeadline - parallelCriticalPathHours).toFixed(1),
  );
  const estimatedEpisodeOutsourcingKrw = rows.reduce(
    (sum, r) => sum + r.episodeCostKrw,
    0,
  );

  let burnoutRiskLevel: BurnoutRiskLevel = "safe";
  if (totalCreatorHours > 72 || deadlineBufferHours < 0) {
    burnoutRiskLevel = "overload";
  } else if (totalCreatorHours > 56 || deadlineBufferHours < 12) {
    burnoutRiskLevel = "caution";
  }

  const bottleneckRow = [...rows].sort((a, b) => b.creatorHours - a.creatorHours)[0] ?? rows[0];

  return {
    targetCuts: safeCuts,
    weeklyDeadlineHours: safeDeadline,
    rows,
    totalCreatorHours,
    totalAssistantHours,
    parallelCriticalPathHours,
    deadlineBufferHours,
    estimatedEpisodeOutsourcingKrw,
    burnoutRiskLevel,
    bottleneckTrack: bottleneckRow.spec,
  };
}
