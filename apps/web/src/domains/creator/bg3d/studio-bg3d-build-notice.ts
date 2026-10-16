// 방·웹툰 배경을 추가한 직후 보여 주는 안내 문구와, 자동 단면이 숨긴 벽 조각을 요약하는 순수 함수.
//
// 자동 단면은 시선을 가리는 벽을 지우지 않고 visible:false 로 만든다. 그런데 오프닝 때문에 한 벽이 여러
// 조각으로 쪼개지고(복도 앞벽은 13조각) 조각 이름이 모두 같아("앞벽 벽체") 레이어 목록에서 눈 아이콘을 하나씩
// 켜기는 번거롭다. 그래서 방금 만든 묶음에서 숨긴 조각의 id 를 모아 두었다가 한 번에 되살릴 수 있게 한다.
//
// 이 모듈은 템플릿 탭의 지연 청크(웹툰 배경 선택기·방 만들기 패널)에서만 가져온다 — Studio 정적 진입
// 그래프에 넣지 않으려는 경계다. 문구는 모두 해요체로 쓰고, 실패 문구는 "원인 + 다음 행동" 형태를 지킨다
// (shared/language 의 두 가드가 시험에서 이 문자열을 직접 검사한다).

import { STUDIO_BG3D_ROOM_WALL_PART_SUFFIX } from "./studio-bg3d-room-builder";

import type { BgPrimitive } from "../studio-background-3d-metadata";

export const STUDIO_BG3D_AUTO_CUTAWAY_LABEL = "자동 단면 (카메라 쪽 벽 숨김)";
export const STUDIO_BG3D_RESTORE_WALLS_LABEL = "숨긴 벽 되돌리기";
export const STUDIO_BG3D_FOCUS_BUILT_LABEL = "새로 만든 곳 보기";

/** 원클릭 웹툰 배경 선택기의 소개 문단. 수치는 카탈로그가 실제로 만드는 값과 같다(선택기 시험이 비교한다). */
export const STUDIO_BG3D_PICKER_INTRO =
  "사람 키 기준 실제 크기(문 2.1m, 책상 윗면 0.72m, 층고 3m)로 한 번에 만들어요. 추가한 뒤에는 벽·책상·가로등을 하나씩 골라 옮기고 지울 수 있어요.";
/** 선택기의 자동 단면 설명. 기본값은 켜짐이다. */
export const STUDIO_BG3D_PICKER_CUTAWAY_HELP =
  "교실·복도는 방 밖에서 안을 볼 때 시선을 가로막는 벽을 추가하는 순간 숨겨요. 숨긴 벽은 안내 아래 버튼으로 한 번에 되돌릴 수 있어요. 거리에는 벽이 없어 영향이 없어요.";
/** 방 만들기 패널의 자동 단면 설명. 기본값은 꺼짐이다(예전 "방 추가"와 같은 동작). */
export const STUDIO_BG3D_ROOM_PANEL_CUTAWAY_HELP =
  "켜면 방 밖에서 안을 보고 있을 때 추가하는 순간 시선을 가로막는 벽을 숨김 상태로 만들어요. 벽은 지워지지 않고, 안내 아래 버튼이나 레이어 목록의 눈 아이콘으로 다시 켤 수 있어요. 한 번만 판단하고, 이후 카메라를 옮겨도 다시 계산하지 않아요.";

/** 추가하지 못했을 때의 안내: 원인(준비 중이거나 한도) + 다음 행동(잠시 후 다시, 또는 정리). */
export const STUDIO_BG3D_BUILD_FAILED_NOTICE =
  "지금은 추가하지 못했어요. 편집기를 준비하는 중이거나 오브젝트 한도에 닿았을 수 있어요. 잠시 후 다시 시도하거나, 필요 없는 오브젝트를 지운 뒤 다시 눌러 주세요.";

export interface StudioBg3dHiddenWallSummary {
  /** 숨김 상태로 만든 조각의 id. "숨긴 벽 되돌리기"가 이 목록만 다시 켠다. */
  readonly ids: readonly string[];
  /** 벽 이름표(앞벽·오른벽 등)별 숨긴 조각 수. 처음 나온 순서를 지킨다. */
  readonly walls: ReadonlyArray<{ readonly label: string; readonly pieces: number }>;
}

/** 방금 만든 도형 묶음에서 숨김 상태인 벽 조각을 모은다. 새 묶음에서 숨김은 자동 단면이 만든 것뿐이다. */
export function summarizeStudioBg3dHiddenWalls(primitives: readonly BgPrimitive[]): StudioBg3dHiddenWallSummary {
  const ids: string[] = [];
  const pieces = new Map<string, number>();
  for (const primitive of primitives) {
    if (primitive.visible !== false) continue;
    ids.push(primitive.id);
    const name = primitive.name ?? "";
    const label = name.endsWith(STUDIO_BG3D_ROOM_WALL_PART_SUFFIX)
      ? name.slice(0, -STUDIO_BG3D_ROOM_WALL_PART_SUFFIX.length)
      : name || "도형";
    pieces.set(label, (pieces.get(label) ?? 0) + 1);
  }
  return { ids, walls: [...pieces].map(([label, count]) => ({ label, pieces: count })) };
}

export interface StudioBg3dBuildNoticeInput {
  /** 만든 것의 이름(교실·복도·거리·방). */
  readonly label: string;
  readonly objectCount: number;
  readonly hiddenWalls: StudioBg3dHiddenWallSummary;
  /** "숨긴 벽 되돌리기"를 이미 눌렀다. */
  readonly wallsRestored: boolean;
  /** 기존 도형과 겹치지 않게 더한 X 오프셋(m). 0 이면 원점에 만들었다. */
  readonly anchorX: number;
}

function describeHiddenWalls(summary: StudioBg3dHiddenWallSummary): string {
  return summary.walls.map(({ label, pieces }) => `${label} ${pieces}조각`).join("·");
}

function formatMeters(value: number): string {
  return String(Number(value.toFixed(1)));
}

/** 추가 직후 안내 한 단락. 문장은 모두 해요체(또는 말투가 없는 명사형)다. */
export function describeStudioBg3dBuildNotice(input: StudioBg3dBuildNoticeInput): string {
  const sentences = [`${input.label} 추가 완료 · 오브젝트 ${input.objectCount}개.`];
  if (input.hiddenWalls.ids.length > 0) {
    const walls = describeHiddenWalls(input.hiddenWalls);
    sentences.push(
      input.wallsRestored
        ? `숨겼던 ${walls}을 다시 보이게 했어요.`
        : `시선을 가리는 ${walls}을 숨겼어요. 아래 '${STUDIO_BG3D_RESTORE_WALLS_LABEL}'나 레이어 목록의 눈 아이콘으로 다시 켤 수 있어요.`,
    );
  }
  if (input.anchorX > 0) {
    sentences.push(
      `기존 오브젝트와 겹치지 않게 +X 방향으로 ${formatMeters(input.anchorX)}m 떨어진 곳에 만들었어요. 화면에 보이지 않으면 '${STUDIO_BG3D_FOCUS_BUILT_LABEL}'를 눌러 주세요.`,
    );
  }
  return sentences.join(" ");
}
