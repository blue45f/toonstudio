/**
 * CC0 MyPaint 브러시 라이브러리의 가벼운 목록 API(설정 데이터는 읽지 않는다).
 * 변환 계획과 인스펙터가 쓰며, 무거운 설정 데이터는 작업자만 `studio-mypaint-cc0-library-loader` 로 지연 로드한다.
 */
import {
  STUDIO_MYPAINT_CC0_LIBRARY_BRUSH_COUNT,
  STUDIO_MYPAINT_CC0_LIBRARY_GROUPS,
  STUDIO_MYPAINT_CC0_LIBRARY_SOURCE_COMMIT,
} from "./studio-mypaint-cc0-library-index.generated";

import type { StudioMypaintCc0IndexEntry, StudioMypaintCc0SurfaceRequirement } from "./studio-mypaint-cc0-library-index.generated";

export type { StudioMypaintCc0SurfaceRequirement } from "./studio-mypaint-cc0-library-index.generated";

export interface StudioMypaintCc0Brush {
  readonly id: string;
  /** 원본 파일 이름에서 밑줄만 공백으로 바꾼 이름(고유명사라 번역하지 않는다). */
  readonly name: string;
  readonly group: string;
  readonly surface: StudioMypaintCc0SurfaceRequirement;
  /** 기준 반지름 배수로 잡은 물감 도달 범위의 보수적 상한. */
  readonly extentRadii: number;
  /** 속도 오프셋이 더하는 거리 상한(px). */
  readonly extentSpeedPx: number;
}

export interface StudioMypaintCc0Group {
  readonly id: string;
  readonly label: string;
  readonly brushes: readonly StudioMypaintCc0Brush[];
}

/** 묶음 표시 이름. 원본 Licenses.dep5 의 작성자 표기를 따른다. */
const GROUP_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Dieterle: "Brien Dieterle",
  Classic: "MyPaint 클래식",
  Experimental: "MyPaint 실험",
  Deevad: "David Revoy (deevad)",
  Ramon: "Ramón Miranda",
  Tanda: "Marcelo \"Tanda\" Cerviño",
  Kaerhon: "Guillaume Loussarévian (kaerhon)",
});

export const STUDIO_MYPAINT_CC0_LIBRARY_PROVENANCE = Object.freeze({
  repository: "github.com/mypaint/mypaint-brushes",
  commit: STUDIO_MYPAINT_CC0_LIBRARY_SOURCE_COMMIT,
  license: "CC0-1.0",
  licenseEvidence: "Licenses.dep5: Files: brushes/* — License: CC0-1.0 (작성자별 brushes/<set>/* 항목 포함)",
  brushCount: STUDIO_MYPAINT_CC0_LIBRARY_BRUSH_COUNT,
});

function toBrush(group: string, entry: StudioMypaintCc0IndexEntry): StudioMypaintCc0Brush {
  const [id, name, surface, extentRadii, extentSpeedPx] = entry;
  return Object.freeze({ id, name, group, surface, extentRadii, extentSpeedPx });
}

let groups: readonly StudioMypaintCc0Group[] | null = null;
let byId: ReadonlyMap<string, StudioMypaintCc0Brush> | null = null;

/** order.conf 순서의 묶음 목록. 처음 호출할 때 한 번만 만든다. */
export function listStudioMypaintCc0Groups(): readonly StudioMypaintCc0Group[] {
  if (groups) return groups;
  groups = Object.freeze(STUDIO_MYPAINT_CC0_LIBRARY_GROUPS.map(([group, entries]) => Object.freeze({
    id: group,
    label: GROUP_LABELS[group] ?? group,
    brushes: Object.freeze(entries.map((entry) => toBrush(group, entry))),
  })));
  return groups;
}

export function findStudioMypaintCc0Brush(id: string): StudioMypaintCc0Brush | null {
  if (!byId) {
    byId = new Map(listStudioMypaintCc0Groups().flatMap((group) => group.brushes.map((brush) => [brush.id, brush] as const)));
  }
  return byId.get(id) ?? null;
}

/** 투명한 새 표면(선택 획 변환)에서 칠할 수 없는 브러시의 이유. 칠할 수 있으면 null. */
export function studioMypaintCc0SurfaceBlockReason(brush: StudioMypaintCc0Brush): string | null {
  switch (brush.surface) {
    case "paint": return null;
    case "eraser": return "지우개 브러시라 빈 표면에서는 지울 물감이 없습니다.";
    case "smudge-only": return "문지르기 전용 브러시라 빈 표면에서는 섞을 물감이 없습니다.";
    case "lock-alpha": return "알파 잠금 브러시라 이미 칠한 곳에만 색을 입힙니다.";
    case "colorize": return "색입히기 브러시라 이미 칠한 물감의 색만 바꿉니다.";
    case "posterize": return "포스터화 전용 브러시라 이미 칠한 물감의 색 단계만 줄이며, 고정된 libmypaint 1.6.1 획 경로는 포스터화를 실행하지 않습니다.";
  }
}

/**
 * 변환 표면 여백(px). 기존 자체 3종과 같은 최소 여백(지름×4+4)을 지키고, 브러시의 보수적 도달 범위가 더 크면
 * 그만큼 넓힌다. 실제 물감이 표면 가장자리에 닿으면 작업자 출력 검증이 잘림을 숨기지 않고 거부한다.
 */
export function studioMypaintCc0Halo(brush: StudioMypaintCc0Brush, diameterPx: number): number {
  const radius = diameterPx / 2;
  const reach = radius * brush.extentRadii + brush.extentSpeedPx + 4;
  return Math.ceil(Math.max(diameterPx * 4 + 4, reach));
}
