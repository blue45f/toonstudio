import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  loadStudioFloatingSurfaceLayout,
  normalizeStudioFloatingSurfaceLayout,
  saveStudioFloatingSurfaceLayout,
  studioFloatingSurfaceLayoutsEqual,
  type StudioFloatingSurfaceLayout,
  type StudioFloatingSurfaceStorage,
} from "./studio-floating-surface";

import type {
  StudioFloatingSurfacePersistenceFailure,
  StudioFloatingSurfacePreferencesRepository,
} from "./studio-floating-surface-preferences-sqlite";

export type StudioFloatingSurfaceLayoutAuthority =
  | "checking"
  | "sqlite-opfs"
  | "session-only";

/** none은 저장·사용자 배치가 없음을 확인한 상태다. */
export type StudioFloatingSurfaceLayoutOverride = "checking" | "none" | "present" | "unknown";

export interface UseStudioFloatingSurfaceLayoutOptions {
  readonly surfaceId: string;
  readonly defaultLayout: StudioFloatingSurfaceLayout;
  readonly sessionKey?: string;
  readonly enabled?: boolean;
  readonly repositoryFactory?: () =>
    Promise<StudioFloatingSurfacePreferencesRepository>;
}

export interface UseStudioFloatingSurfaceLayoutResult {
  readonly layout: StudioFloatingSurfaceLayout;
  readonly authority: StudioFloatingSurfaceLayoutAuthority;
  readonly layoutOverride: StudioFloatingSurfaceLayoutOverride;
  readonly failure: StudioFloatingSurfacePersistenceFailure | "storage-unavailable" | null;
  readonly setLayout: (layout: StudioFloatingSurfaceLayout) => void;
  readonly resetLayout: () => void;
}

export function studioFloatingSurfaceSessionKey(surfaceId: string): string {
  return `toonspectrum:studio:floating:${surfaceId}:v1`;
}

function browserSessionStorage(): StudioFloatingSurfaceStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readSessionLayout(sessionKey: string, fallback: StudioFloatingSurfaceLayout) {
  const storage = browserSessionStorage();
  let override: StudioFloatingSurfaceLayoutOverride = "unknown";
  try {
    if (storage) override = storage.getItem(sessionKey) === null ? "none" : "present";
  } catch { override = "unknown"; }
  return { layout: loadStudioFloatingSurfaceLayout(storage, sessionKey, fallback), override };
}

function productRepositoryAvailable(): boolean {
  try {
    return typeof navigator !== "undefined"
      && typeof navigator.storage?.getDirectory === "function";
  } catch {
    return false;
  }
}

async function acquireProductStudioFloatingSurfacePreferencesRepositoryDeferred(): Promise<
  StudioFloatingSurfacePreferencesRepository
> {
  const { acquireProductStudioFloatingSurfacePreferencesRepository } = await import(
    "./studio-floating-surface-preferences-sqlite"
  );
  return acquireProductStudioFloatingSurfacePreferencesRepository();
}

/** 같은 탭의 세션은 시작 캐시이며 V12 SQLite/OPFS가 저장 권위다.
 * 늦은 읽기는 사용자가 옮긴 배치를 덮지 않는다.
 */
export function useStudioFloatingSurfaceLayout({
  surfaceId,
  defaultLayout,
  sessionKey = studioFloatingSurfaceSessionKey(surfaceId),
  enabled = true,
  repositoryFactory =
    acquireProductStudioFloatingSurfacePreferencesRepositoryDeferred,
}: UseStudioFloatingSurfaceLayoutOptions): UseStudioFloatingSurfaceLayoutResult {
  const { version, xRatio, yRatio, width, height, dock, positionLocked, sizeLocked } =
    normalizeStudioFloatingSurfaceLayout(defaultLayout, defaultLayout);
  // 같은 기본값은 참조를 유지한다.
  const normalizedDefault = useMemo(
    () => Object.freeze({ version, xRatio, yRatio, width, height, dock, positionLocked, sizeLocked }),
    [version, xRatio, yRatio, width, height, dock, positionLocked, sizeLocked],
  );
  const repository = useMemo(() => {
    let pending: Promise<StudioFloatingSurfacePreferencesRepository> | null = null;
    return () => { pending ??= repositoryFactory(); return pending; };
  }, [repositoryFactory]);
  const identity = useMemo(() => ({ surfaceId, sessionKey, repository }), [surfaceId, sessionKey, repository]);
  const currentIdentityRef = useRef(identity);
  currentIdentityRef.current = identity;
  const session = useMemo(() => readSessionLayout(identity.sessionKey, normalizedDefault), [identity, normalizedDefault]);
  const [layoutState, setLayoutState] = useState(() => ({ identity, layout: session.layout }));
  const layout = layoutState.identity === identity ? layoutState.layout : session.layout;
  const [overrideState, setOverrideState] = useState<{
    identity: typeof identity; value: StudioFloatingSurfaceLayoutOverride;
  }>(() => ({ identity, value: session.override === "present" ? "present" : "checking" }));
  const [authority, setAuthority] =
    useState<StudioFloatingSurfaceLayoutAuthority>("checking");
  const [failure, setFailure] =
    useState<UseStudioFloatingSurfaceLayoutResult["failure"]>(null);
  const liveLayoutRef = useRef(layout);
  const localGenerationRef = useRef(0);
  const localChoiceIdentityRef = useRef<typeof identity | null>(null);
  liveLayoutRef.current = layout;

  const sqliteAvailable = repositoryFactory
    !== acquireProductStudioFloatingSurfacePreferencesRepositoryDeferred
    || productRepositoryAvailable();

  useEffect(() => {
    setLayoutState((current) => current.identity === identity ? current : { identity, layout: session.layout });
    if (!enabled || !sqliteAvailable) {
      setAuthority("session-only");
      setOverrideState({ identity, value: session.override === "present" ? "present" : "unknown" });
      return;
    }
    setAuthority("checking");
    setFailure(null);
    setOverrideState({ identity, value: session.override === "present" || localChoiceIdentityRef.current === identity ? "present" : "checking" });
    let disposed = false;
    const generationAtStart = localGenerationRef.current;
    void repository()
      .then((target) => target.load(surfaceId, normalizedDefault))
      .then((result) => {
        if (disposed || currentIdentityRef.current !== identity || generationAtStart !== localGenerationRef.current) return;
        setFailure(result.failure);
        setAuthority(result.failure ? "session-only" : "sqlite-opfs");
        setOverrideState({ identity, value: result.failure ? "unknown"
          : result.persisted || session.override === "present" || localChoiceIdentityRef.current === identity ? "present"
            : session.override === "none" ? "none" : "unknown" });
        if (
          !result.persisted
          || localChoiceIdentityRef.current === identity
        ) {
          return;
        }
        liveLayoutRef.current = result.layout;
        setLayoutState({ identity, layout: result.layout });
        saveStudioFloatingSurfaceLayout(
          browserSessionStorage(),
          sessionKey,
          result.layout,
        );
      })
      .catch(() => {
        if (disposed || currentIdentityRef.current !== identity || generationAtStart !== localGenerationRef.current) return;
        setAuthority("session-only");
        setFailure("storage-unavailable");
        setOverrideState({ identity, value: "unknown" });
      });
    return () => {
      disposed = true;
    };
  }, [
    enabled,
    identity,
    normalizedDefault,
    repository,
    sessionKey,
    session,
    sqliteAvailable,
    surfaceId,
  ]);

  const setLayout = useCallback((nextLayout: StudioFloatingSurfaceLayout) => {
    if (currentIdentityRef.current !== identity) return;
    localGenerationRef.current += 1;
    const generation = localGenerationRef.current;
    localChoiceIdentityRef.current = identity;
    setOverrideState({ identity, value: "present" });
    const normalized = normalizeStudioFloatingSurfaceLayout(
      nextLayout,
      normalizedDefault,
    );
    if (studioFloatingSurfaceLayoutsEqual(liveLayoutRef.current, normalized)) {
      setAuthority((current) => current === "checking" ? "session-only" : current);
      return;
    }
    liveLayoutRef.current = normalized;
    setLayoutState({ identity, layout: normalized });
    saveStudioFloatingSurfaceLayout(
      browserSessionStorage(),
      sessionKey,
      normalized,
    );
    if (!sqliteAvailable) {
      setAuthority("session-only");
      setFailure("storage-unavailable");
      setOverrideState({ identity, value: "unknown" });
      return;
    }
    void repository()
      .then((target) => target.save(surfaceId, normalized))
      .then((result) => {
        if (currentIdentityRef.current !== identity || generation !== localGenerationRef.current) return;
        setAuthority(result.status === "persisted" ? "sqlite-opfs" : "session-only");
        setFailure(result.failure);
        if (result.failure || result.status !== "persisted") setOverrideState({ identity, value: "unknown" });
      })
      .catch(() => {
        if (currentIdentityRef.current !== identity || generation !== localGenerationRef.current) return;
        setAuthority("session-only");
        setFailure("storage-unavailable");
        setOverrideState({ identity, value: "unknown" });
      });
  }, [
    normalizedDefault,
    identity,
    repository,
    sessionKey,
    sqliteAvailable,
    surfaceId,
  ]);

  const resetLayout = useCallback(() => {
    setLayout(normalizedDefault);
  }, [normalizedDefault, setLayout]);

  return {
    layout,
    authority,
    layoutOverride: overrideState.identity === identity ? overrideState.value : "checking",
    failure,
    setLayout,
    resetLayout,
  };
}
