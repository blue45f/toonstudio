import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resetFailedStudioLocalDatabaseOwnership } from "../../studio-local-database-runtime";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  readStudioVirtualArtStyle,
  writeStudioVirtualArtStyle,
  type StudioVirtualArtStyleKey,
} from "../studio-virtual-space-art-style";
import {
  readStudioVirtualCharacterCustomization,
  studioVirtualDecorationPreset,
  writeStudioVirtualCharacterCustomization,
  type StudioVirtualCharacterCustomization,
  type StudioVirtualDecorationState,
} from "../studio-virtual-space-customization";
import { StudioVirtualDecorationSession } from "../studio-virtual-space-decoration-session";
import type { StudioVirtualDecorationSyncResult } from "../studio-virtual-space-decoration-sync";
import { studioVirtualSpaceDecorationSync, studioVirtualSpaceSyncEnabled } from "../studio-virtual-space-decoration-sync-gate";
import {
  readStudioVirtualEnvironmentPreference,
  writeStudioVirtualEnvironmentPreference,
  type StudioVirtualEnvironmentPreference,
} from "../studio-virtual-space-environment-preference";
import {
  readStudioVirtualExperiencePreference,
  writeStudioVirtualExperiencePreference,
  type StudioVirtualExperiencePreference,
} from "../studio-virtual-space-experience-preference";
import {
  readStudioSpaceTheme,
  writeStudioSpaceTheme,
  type StudioSpaceThemeKey,
} from "../studio-virtual-space-theme";
import {
  applyStudioVirtualReward,
  readStudioVirtualRewardInventory,
  unlockStudioVirtualReward,
  writeStudioVirtualRewardInventory,
  type StudioVirtualRewardId,
  type StudioVirtualRewardInventory,
} from "../studio-virtual-space-rewards";
import { studioDistrictEnvironment } from "../studio-virtual-space-scene-direction";
import type { StudioBuildPlacementRequest } from "../studio-virtual-space-build-mode";
import {
  studioBuildPlacedFixtures,
  type StudioBuildPlacedFixture,
} from "../studio-virtual-space-build-mode-vitality";
import {
  readStudioPlacedFixtureRequests,
  writeStudioPlacedFixtureRequests,
} from "../studio-virtual-space-placed-fixtures";

/**
 * 이 브라우저에 저장하는 개인 설정(아트 스타일·캐릭터 꾸미기·보상·경험·환경·공간 꾸미기·배치 가구).
 * 계정 배치는 저장 대기 상태와 원본 버전까지 기기에 보관한다.
 */
export function useSpacePreferences({ initialArtStyle, decorationScope, decorationOwner, notify }: {
  readonly initialArtStyle?: StudioVirtualArtStyleKey;
  readonly decorationScope: string;
  readonly decorationOwner: string | null;
  readonly notify: (message: string, tone?: "info" | "warn") => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceExperience");
  const [artStyle, setArtStyle] = useState<StudioVirtualArtStyleKey>(() => initialArtStyle ?? readStudioVirtualArtStyle());
  const selectArtStyle = useCallback((next: StudioVirtualArtStyleKey) => {
    setArtStyle(next);
    writeStudioVirtualArtStyle(next);
  }, []);

  const [characterCustomization, setCharacterCustomization] = useState<StudioVirtualCharacterCustomization>(
    () => readStudioVirtualCharacterCustomization(),
  );
  const selectCharacterCustomization = useCallback((next: StudioVirtualCharacterCustomization) => {
    setCharacterCustomization(next);
    writeStudioVirtualCharacterCustomization(next);
  }, []);

  const [rewardInventory, setRewardInventory] = useState<StudioVirtualRewardInventory>(() => readStudioVirtualRewardInventory());
  // 상태 갱신 함수 안에서 저장하지 않는다(갱신 함수는 순수해야 한다).
  const claimReward = useCallback((id: StudioVirtualRewardId) => {
    const next = unlockStudioVirtualReward(rewardInventory, id);
    setRewardInventory(next);
    writeStudioVirtualRewardInventory(next);
  }, [rewardInventory]);
  const equipReward = useCallback((id: StudioVirtualRewardId) => {
    const next = applyStudioVirtualReward(characterCustomization, id);
    setCharacterCustomization(next);
    writeStudioVirtualCharacterCustomization(next);
  }, [characterCustomization]);

  const [initialExperiencePreference] = useState(readStudioVirtualExperiencePreference);
  const [experiencePreference, setExperiencePreference] = useState<StudioVirtualExperiencePreference>(initialExperiencePreference);
  const selectExperiencePreference = useCallback((next: StudioVirtualExperiencePreference) => {
    setExperiencePreference(next);
    writeStudioVirtualExperiencePreference(next);
  }, []);

  const [environmentPreference, setEnvironmentPreference] = useState<StudioVirtualEnvironmentPreference>(
    () => readStudioVirtualEnvironmentPreference(),
  );
  const selectEnvironmentPreference = useCallback((next: StudioVirtualEnvironmentPreference) => {
    setEnvironmentPreference(next);
    writeStudioVirtualEnvironmentPreference(next);
  }, []);

  const [spaceTheme, setSpaceTheme] = useState<StudioSpaceThemeKey>(() => readStudioSpaceTheme());
  const selectSpaceTheme = useCallback((next: StudioSpaceThemeKey) => {
    setSpaceTheme(next);
    writeStudioSpaceTheme(next);
  }, []);
  useEffect(() => {
    const onThemeEvent = (event: Event) => {
      const next = (event as CustomEvent<StudioSpaceThemeKey>).detail;
      if (next) setSpaceTheme(next);
    };
    window.addEventListener("toonspectrum:space-theme-change", onThemeEvent);
    return () => window.removeEventListener("toonspectrum:space-theme-change", onThemeEvent);
  }, []);

  const syncEnabled = Boolean(decorationOwner) && studioVirtualSpaceSyncEnabled();
  const decorationSession = useMemo(() => new StudioVirtualDecorationSession(decorationScope,
    syncEnabled ? studioVirtualSpaceDecorationSync() : null, decorationOwner), [decorationOwner, decorationScope, syncEnabled]);
  const activeSession = useRef<StudioVirtualDecorationSession | null>(decorationSession);
  useEffect(() => {
    activeSession.current = decorationSession;
    return () => { activeSession.current = null; decorationSession.cancelPending(); };
  }, [decorationSession]);
  const viewKey = JSON.stringify([decorationOwner, decorationScope]);
  const [decorationDrafts, setDecorationDrafts] = useState<ReadonlyMap<string, StudioVirtualDecorationState>>(() => new Map());
  const [syncFeedback, setSyncFeedback] = useState<{ owner: StudioVirtualDecorationSession; status: "local" | "conflict" | "device-error" } | null>(null);
  const [initialDecorations] = useState(() => studioVirtualDecorationPreset("creator-garden"));
  const decorations = decorationDrafts.get(viewKey) ?? initialDecorations;
  const updateDecorationView = useCallback((next: StudioVirtualDecorationState) => {
    setDecorationDrafts(current => new Map(current).set(viewKey, next));
  }, [viewKey, setDecorationDrafts]);
  const handleResult = useCallback((result: StudioVirtualDecorationSyncResult, edit: number, adopt: boolean) => {
    if (activeSession.current !== decorationSession || decorationSession.editCount !== edit) return;
    if (adopt && decorationSession.cachedState) updateDecorationView(decorationSession.cachedState);
    if (decorationSession.cachedState && !decorationSession.cachedLocally)
      setSyncFeedback({ owner: decorationSession, status: "device-error" });
    else if (decorationSession.hasConflict) setSyncFeedback({ owner: decorationSession, status: "conflict" });
    else if (result.status === "local" && decorationSession.hasPendingDraft) setSyncFeedback({ owner: decorationSession, status: "local" });
    else setSyncFeedback(null);
  }, [decorationSession, setSyncFeedback, updateDecorationView]);
  const recoverDecorations = useCallback(async (choice?: "retry" | "device" | "server") => {
    if (choice === "retry") await resetFailedStudioLocalDatabaseOwnership();
    if (activeSession.current !== decorationSession) return;
    const pending = !choice || choice === "retry" ? decorationSession.load(initialDecorations) : decorationSession.resolveConflict(choice);
    const edit = decorationSession.editCount;
    void pending?.then(result => handleResult(result, edit, true));
  }, [decorationSession, initialDecorations, handleResult]);
  const selectDecorations = useCallback((next: StudioVirtualDecorationState) => {
    updateDecorationView(next);
    if (next.districtKey !== decorations.districtKey) selectEnvironmentPreference(studioDistrictEnvironment(next.districtKey));
    const warn = () => notify(bt("공간 변경은 적용됐지만 이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.", "Space changes are applied, but could not be saved on this device. Check available storage."), "warn");
    const pending = decorationSession.save(next);
    const edit = decorationSession.editCount;
    void pending.then(result => {
      if (activeSession.current !== decorationSession || edit !== decorationSession.editCount) return;
      if (!decorationSession.cachedLocally) warn();
      handleResult(result, edit, false);
    });
  }, [bt, decorations.districtKey, decorationSession, handleResult, notify, selectEnvironmentPreference, updateDecorationView]);
  // 빌드 모드로 배치한 상태 가구. 꾸미기와 달리 서버 계약이 없어 이 브라우저에만
  // 저장한다(배치 모듈이 키를 소유한다). 캔버스로 넘길 디스크립터는 여기서 파생한다.
  const [placedFixtureDrafts, setPlacedFixtureDrafts] = useState<ReadonlyMap<string, readonly StudioBuildPlacementRequest[]>>(() => new Map());
  const initialPlacedFixtureRequests = useMemo(() => readStudioPlacedFixtureRequests(decorationScope), [decorationScope]);
  const placedFixtureRequests = placedFixtureDrafts.get(decorationScope) ?? initialPlacedFixtureRequests;
  const selectPlacedFixtureRequests = useCallback((next: readonly StudioBuildPlacementRequest[]) => {
    setPlacedFixtureDrafts((current) => new Map(current).set(decorationScope, next));
    if (!writeStudioPlacedFixtureRequests(next, decorationScope)) {
      notify(bt("배치는 적용됐지만 이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.", "The furniture layout is applied, but could not be saved on this device. Check available storage."), "warn");
    }
  }, [bt, decorationScope, notify]);
  const placedFixtures: readonly StudioBuildPlacedFixture[] = useMemo(
    () => studioBuildPlacedFixtures(placedFixtureRequests),
    [placedFixtureRequests],
  );
  useEffect(() => {
    if (!decorationSession) return;
    recoverDecorations();
    const online = () => { if (decorationSession.hasPendingDraft) recoverDecorations(); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [decorationSession, recoverDecorations]);

  return {
    decorationSyncEnabled: syncEnabled,
    decorationSyncStatus: syncFeedback && syncFeedback.owner === decorationSession ? syncFeedback.status : null,
    recoverDecorations,
    artStyle, selectArtStyle,
    characterCustomization, selectCharacterCustomization,
    rewardInventory, claimReward, equipReward,
    initialExperiencePreference, experiencePreference, selectExperiencePreference,
    environmentPreference, selectEnvironmentPreference,
    spaceTheme, selectSpaceTheme,
    decorations, selectDecorations,
    placedFixtureRequests, selectPlacedFixtureRequests, placedFixtures,
  };
}
