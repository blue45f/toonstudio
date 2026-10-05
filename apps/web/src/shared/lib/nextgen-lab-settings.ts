// 실험 기능(차세대 웹 기술) 사용자 설정 — localStorage 정본 + 구독.
//
// 기본값은 전부 켜짐이다: 실험 기능은 능력 감지를 통과한 환경에서만 동작하므로,
// 감지 자체가 1차 게이트이고 이 설정은 사용자가 끌 수 있는 2차 게이트다.
// 서버 동기화는 없다(기기·브라우저 단위 성질이 강하고, 계정 설정과 섞을 이유가 없다).

export interface NextgenLabSettings {
  /** 작품 리더에서 화면 꺼짐 방지(Wake Lock)를 쓴다. */
  readonly readerWakeLock: boolean;
  /** 공개 페이지에서 스튜디오 문서를 미리 렌더링(Speculation Rules)한다. */
  readonly studioPrerender: boolean;
  /** 작품 상세 → 리더 이동에 View Transitions를 입힌다. */
  readonly viewTransitions: boolean;
}

export const NEXTGEN_LAB_DEFAULTS: NextgenLabSettings = {
  readerWakeLock: true,
  studioPrerender: true,
  viewTransitions: true,
};

export const NEXTGEN_LAB_STORAGE_KEY = "toonstudio.nextgen-lab.settings.v1";

const listeners = new Set<() => void>();
let snapshot: NextgenLabSettings = readFromStorage();

function readFromStorage(): NextgenLabSettings {
  try {
    if (typeof localStorage === "undefined") return NEXTGEN_LAB_DEFAULTS;
    const raw = localStorage.getItem(NEXTGEN_LAB_STORAGE_KEY);
    if (!raw) return NEXTGEN_LAB_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Record<keyof NextgenLabSettings, unknown>>;
    return {
      readerWakeLock: typeof parsed.readerWakeLock === "boolean"
        ? parsed.readerWakeLock
        : NEXTGEN_LAB_DEFAULTS.readerWakeLock,
      studioPrerender: typeof parsed.studioPrerender === "boolean"
        ? parsed.studioPrerender
        : NEXTGEN_LAB_DEFAULTS.studioPrerender,
      viewTransitions: typeof parsed.viewTransitions === "boolean"
        ? parsed.viewTransitions
        : NEXTGEN_LAB_DEFAULTS.viewTransitions,
    };
  } catch {
    return NEXTGEN_LAB_DEFAULTS;
  }
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** useSyncExternalStore용 스냅샷 — 쓰기가 있을 때만 참조가 바뀐다. */
export function getNextgenLabSettingsSnapshot(): NextgenLabSettings {
  return snapshot;
}

export function updateNextgenLabSettings(patch: Partial<NextgenLabSettings>): NextgenLabSettings {
  snapshot = { ...snapshot, ...patch };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(NEXTGEN_LAB_STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // 저장 실패(프라이빗 모드·용량)는 세션 내 상태만으로 계속 동작한다.
  }
  notify();
  return snapshot;
}

export function subscribeNextgenLabSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// 다른 탭에서 바꾼 설정을 이 탭에도 반영한다.
if (typeof window !== "undefined") {
  try {
    window.addEventListener("storage", (event) => {
      if (event.key !== NEXTGEN_LAB_STORAGE_KEY) return;
      snapshot = readFromStorage();
      notify();
    });
  } catch {
    // 리스너 등록 실패는 치명적이지 않다 — 이 탭의 설정만으로 동작한다.
  }
}
