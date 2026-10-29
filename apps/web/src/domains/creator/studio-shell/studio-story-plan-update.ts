import type { StudioStoryBeat } from "../studio-storyboard-planner";

/** 대본 재분석 결과만 교체·추가한다. 원고와 저장 권한은 이 함수에서 변경하지 않는다. */
export function updateStudioStoryPlan(
  current: readonly StudioStoryBeat[],
  beats: readonly StudioStoryBeat[],
  mode: "replace" | "append",
  stamp: string,
): StudioStoryBeat[] {
  if (mode === "replace") return beats.map((beat, order) => ({ ...beat, order }));
  const sceneIds = new Map<string, string>();
  const appended = beats.map((beat, index) => {
    const sceneId = sceneIds.get(beat.sceneId)
      ?? `adaptation-scene:${stamp}:${sceneIds.size + 1}`;
    sceneIds.set(beat.sceneId, sceneId);
    return {
      ...beat,
      id: `adaptation-beat:${stamp}:${index + 1}`,
      sceneId,
      order: current.length + index,
    };
  });
  return [...current, ...appended];
}
