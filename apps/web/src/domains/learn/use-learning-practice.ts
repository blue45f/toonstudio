import { useEffect, useState } from "react";

import {
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";

import type { LearningProgress } from "./learning-model";
import {
  completeMission,
  loadPracticeProgress,
  markMissionStarted,
  reopenMission,
  savePracticeProgress,
  type PracticeMission,
  type PracticeProgress,
} from "./learning-practice";

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

const SAVE_WARNING = "실습 기록을 이 기기에 저장하지 못했습니다. 학습은 계속할 수 있지만 새로고침하면 미션 기록이 사라질 수 있습니다.";

/** 실습 미션 기록용 로컬 스토어 — 서버 상태는 만들지 않는다. */
export function useLearningPractice() {
  // 소유자 스코프: 생성 시점의 계정으로 시작하고, 세션 전환(로그인·로그아웃·
  // 계정 교체)마다 저장 키를 갈아끼운다 — 진도·노트 스토어의 세션 바인딩과
  // 같은 계약. 게스트는 "guest" 파티션을 쓴다.
  const [ownerKey, setOwnerKey] = useState(() => getAuthUserId() ?? "guest");
  const [progress, setProgress] = useState<PracticeProgress>(() =>
    loadPracticeProgress(browserStorage(), ownerKey),
  );
  const [warning, setWarning] = useState("");

  useEffect(() => {
    const syncOwner = (session: Session) => {
      setOwnerKey(session?.user.id ?? "guest");
    };
    authListeners.add(syncOwner);
    return () => {
      authListeners.delete(syncOwner);
    };
  }, []);

  // 소유자가 바뀌면 그 파티션을 다시 읽어 화면 상태를 갈아끼운다.
  // 저장에 실패해 메모리에만 있던 변경은 이때 버려진다 — 다른 계정의
  // 화면에 남의 기록이 남으면 안 된다(진도·노트 bind와 같은 처리).
  useEffect(() => {
    setProgress(loadPracticeProgress(browserStorage(), ownerKey));
    setWarning("");
  }, [ownerKey]);

  function persist(next: PracticeProgress) {
    setProgress(next);
    setWarning(savePracticeProgress(browserStorage(), next, ownerKey) ? "" : SAVE_WARNING);
  }

  return {
    progress,
    warning,
    startMission(lessonId: string) {
      persist(markMissionStarted(progress, lessonId, new Date().toISOString()));
    },
    completeCurrentMission(mission: PracticeMission, learning: LearningProgress) {
      persist(completeMission(progress, mission, learning, new Date().toISOString()));
    },
    reopenCurrentMission(lessonId: string) {
      persist(reopenMission(progress, lessonId));
    },
  };
}

export type LearningPracticeStore = ReturnType<typeof useLearningPractice>;
