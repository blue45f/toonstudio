/**
 * studio-dialogue-sync.ts — 콘티 대사·말풍선 동기화 검사 (순수 모듈, fetch 없음).
 *
 * 콘티 컷 대사와 캔버스 말풍선 요소 대사가 각각 배선돼 있으나 양방향
 * 동기화 경로는 확인되지 않았다. 이 모듈은 두 계층을 컷 식별자로 대조해
 * 불일치를 보고하는 검사만 담당한다. 자동 반영은 하지 않으며, 작가가
 * 보고를 보고 어느 쪽을 정본으로 할지 정한다.
 */

export interface StudioStoryboardDialogue {
  readonly cutId: string;
  readonly lines: readonly string[];
}

export interface StudioBalloonText {
  readonly cutId: string;
  readonly text: string;
}

export type StudioDialogueMismatchKind =
  | "missing-balloon"
  | "missing-storyboard"
  | "changed";

export interface StudioDialogueMismatch {
  readonly cutId: string;
  readonly kind: StudioDialogueMismatchKind;
  readonly detail: string;
}

/** 콘티 대사와 말풍선을 대조해 불일치 목록을 만든다. */
export function checkDialogueSync(input: {
  readonly storyboard: readonly StudioStoryboardDialogue[];
  readonly balloons: readonly StudioBalloonText[];
}): readonly StudioDialogueMismatch[] {
  const mismatches: StudioDialogueMismatch[] = [];
  const balloonByCut = new Map<string, string[]>();
  for (const balloon of input.balloons) {
    const list = balloonByCut.get(balloon.cutId) ?? [];
    list.push(balloon.text);
    balloonByCut.set(balloon.cutId, list);
  }
  const storyboardCutIds = new Set<string>();
  for (const entry of input.storyboard) {
    storyboardCutIds.add(entry.cutId);
    const balloons = balloonByCut.get(entry.cutId) ?? [];
    if (balloons.length === 0 && entry.lines.length > 0) {
      mismatches.push({
        cutId: entry.cutId,
        kind: "missing-balloon",
        detail: "콘티에는 대사가 있으나 말풍선이 없다",
      });
      continue;
    }
    const joined = entry.lines.join(" / ");
    const balloonJoined = balloons.join(" / ");
    if (joined !== balloonJoined) {
      mismatches.push({
        cutId: entry.cutId,
        kind: "changed",
        detail: "콘티 대사와 말풍선 내용이 다르다",
      });
    }
  }
  for (const cutId of balloonByCut.keys()) {
    if (!storyboardCutIds.has(cutId)) {
      mismatches.push({
        cutId,
        kind: "missing-storyboard",
        detail: "말풍선은 있으나 콘티 대사가 없다",
      });
    }
  }
  return Object.freeze(mismatches);
}
