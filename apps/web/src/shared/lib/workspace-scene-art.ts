/**
 * 작업공간 씬 아트(전경 배경) opt-in 계약 — BLUEPRINT §6.3 "조용한 스펙터클".
 *
 * 기본값은 끔이다. 사용자가 명시적으로 켠 경우에만 `:root`에
 * `data-workspace-scene-art="on"`을 걸고, workspace-visual-v3.css가 그때만
 * 불투명도 상한(데스크톱 .2 / 모바일 .13) 안에서 씬 아트를 표시한다.
 * 집중 셸(.workspace-focused-shell)은 CSS 선택자에서 제외돼 있어 밀도(집중)
 * 모드에서는 이 설정과 무관하게 항상 꺼진다.
 */
export const WORKSPACE_SCENE_ART_STORAGE_KEY = "toonstudio-workspace-scene-art";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): StorageLike | undefined =>
  typeof window === "undefined" ? undefined : window.localStorage;

/** 저장된 opt-in 값을 읽는다. 저장값이 없거나 "on"이 아니면 기본값(끔)이다. */
export function readWorkspaceSceneArtEnabled(
  storage: StorageLike | undefined = browserStorage(),
): boolean {
  try {
    return storage?.getItem(WORKSPACE_SCENE_ART_STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** dataset에 쓸 값: 켬일 때만 "on", 끔이면 속성 자체를 제거한다(undefined). */
export function workspaceSceneArtDatasetValue(enabled: boolean): "on" | undefined {
  return enabled ? "on" : undefined;
}

export function applyWorkspaceSceneArt(
  enabled: boolean,
  root: HTMLElement | undefined = typeof document === "undefined"
    ? undefined
    : document.documentElement,
): void {
  if (!root) return;
  const value = workspaceSceneArtDatasetValue(enabled);
  if (value === undefined) delete root.dataset.workspaceSceneArt;
  else root.dataset.workspaceSceneArt = value;
}

/** 설정을 저장하고 즉시 :root에 반영한다. 이 함수가 토글 UI의 단일 진입점이다. */
export function setWorkspaceSceneArtEnabled(
  enabled: boolean,
  storage: StorageLike | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(WORKSPACE_SCENE_ART_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* 저장이 불가능해도 현재 세션의 표시는 반영한다. */
  }
  applyWorkspaceSceneArt(enabled);
}

/** 앱에 한 번 마운트한다(AppearanceBridge). 다른 탭의 변경도 storage 이벤트로 따라간다. */
export function installWorkspaceSceneArtSync(): () => void {
  if (typeof window === "undefined") return () => {};
  applyWorkspaceSceneArt(readWorkspaceSceneArtEnabled());
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WORKSPACE_SCENE_ART_STORAGE_KEY && event.key !== null) return;
    applyWorkspaceSceneArt(readWorkspaceSceneArtEnabled());
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
