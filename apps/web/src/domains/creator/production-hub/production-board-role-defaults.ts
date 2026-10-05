import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import { useEffect, useState } from "react";

import { getMyProfile } from "@/platform/me-client";
import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";
import { useApp } from "@/shared/lib/store";

import type { ProductionBoardFilters } from "./production-workboard-model";

/**
 * R-4: 직군별 제작 보드 기본 필터. §5 매트릭스의 "제작 허브 기본 뷰·필터" 열을 옮긴 것으로,
 * 데이터를 걸러 숨기는 서버 필터가 아니라 **기본 선택 상태**만 정한다.
 * 사용자가 칩·공정을 바꾸거나 끄면 전체가 보이며, 기본값은 그 선택을 다시 덮지 않는다.
 */
export interface BoardRoleDefaultFilters {
  readonly focus?: ProductionBoardFilters["focus"];
  /** 이 프로젝트에 실제로 있는 공정부터 순서대로 고른다. */
  readonly processCandidates?: readonly string[];
}

const MINE_FOCUS: BoardRoleDefaultFilters = Object.freeze({ focus: "mine" });
const REVIEW_FOCUS: BoardRoleDefaultFilters = Object.freeze({ focus: "review" });

export function boardRoleDefaultFilters(
  roleId: CreatorRoleId | null | undefined,
): BoardRoleDefaultFilters | null {
  switch (roleId) {
    case "story":
    case "planner":
      // 글·기획: 기획·스토리 공정부터 본다.
      return { processCandidates: ["story-lock", "story"] };
    case "storyboard":
      // 콘티: 콘티 공정부터 본다. (인계 대기는 별도 칩이 없어 공정 기본값만 둔다.)
      return { processCandidates: ["storyboard"] };
    case "line-art":
    case "character":
    case "assistant":
      // 선화·캐릭터·어시: 내게 배정된 컷부터 본다.
      return MINE_FOCUS;
    case "background":
    case "three-d":
      // 배경·3D: 배경 공정부터 본다. 프로필마다 단계 키가 달라 후보를 넓게 둔다.
      return {
        processCandidates: ["background", "background-draft", "background-compose", "background-3d"],
      };
    case "color":
      return { processCandidates: ["color"] };
    case "lettering":
    case "localization":
      return { processCandidates: ["lettering"] };
    case "editor":
    case "reviewer":
    case "producer":
      // 편집·검수·PD: 검수 대기부터 본다. 마감 위험(기한 지남 칩)은 단일 선택이라 기본값에서
      // 제외한다 — 검수 칩을 끄면 바로 옆 칩으로 한 번에 갈 수 있다.
      return REVIEW_FOCUS;
    default:
      // creator(1인 작가)는 전체 공정이 기본이고, educator·미선택은 중립 기본값을 쓴다.
      return null;
  }
}

/** 후보 중 이 프로젝트에 실제로 있는 첫 공정의 canonical 키. 없으면 빈 문자열. */
export function resolveBoardRoleProcess(
  candidates: readonly string[],
  availableCanonicalKeys: ReadonlySet<string>,
): string {
  for (const candidate of candidates) {
    const canonical = canonicalProductionProcessKey(candidate);
    if (availableCanonicalKeys.has(canonical)) return canonical;
  }
  return "";
}

/**
 * 로그인 사용자의 활성 직군(없으면 주 직군)으로 기본 필터를 정한다.
 * 비로그인이거나 프로필을 읽지 못하면 null — 보드는 현행 기본값(전체)을 유지한다.
 * `usePreferredRoleLens`와 같은 조회 방식을 쓴다.
 */
export function useBoardRoleDefaultFilters(): BoardRoleDefaultFilters | null {
  const userId = useApp((state) => state.userId);
  const [defaults, setDefaults] = useState<BoardRoleDefaultFilters | null>(null);

  useEffect(() => {
    setDefaults(null);
    if (!userId) return;
    let alive = true;
    const controller = new AbortController();
    getMyProfile(controller.signal)
      .then((profile) => {
        if (!alive) return;
        const role = profile.creatorRoleProfile.activeRole ?? profile.creatorRoleProfile.primaryRole;
        setDefaults(boardRoleDefaultFilters(role));
      })
      .catch(() => {
        // 프로필을 읽지 못해도 현행 기본값으로 계속 사용할 수 있다.
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [userId]);

  return defaults;
}
