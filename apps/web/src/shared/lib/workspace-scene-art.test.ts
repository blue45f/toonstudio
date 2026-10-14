import { describe, expect, it } from "vitest";

import {
  WORKSPACE_SCENE_ART_STORAGE_KEY,
  applyWorkspaceSceneArt,
  readWorkspaceSceneArtEnabled,
  setWorkspaceSceneArtEnabled,
  workspaceSceneArtDatasetValue,
} from "./workspace-scene-art";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

function fakeRoot() {
  return { dataset: {} as Record<string, string> } as unknown as HTMLElement;
}

describe("workspace scene art opt-in (quiet spectacle)", () => {
  it("defaults to off when nothing is stored", () => {
    expect(readWorkspaceSceneArtEnabled(fakeStorage())).toBe(false);
    expect(workspaceSceneArtDatasetValue(false)).toBeUndefined();
  });

  it("reads only the exact 'on' value as enabled", () => {
    expect(readWorkspaceSceneArtEnabled(fakeStorage({ [WORKSPACE_SCENE_ART_STORAGE_KEY]: "on" }))).toBe(true);
    expect(readWorkspaceSceneArtEnabled(fakeStorage({ [WORKSPACE_SCENE_ART_STORAGE_KEY]: "yes" }))).toBe(false);
  });

  it("set applies the dataset attribute and persists the choice", () => {
    const storage = fakeStorage();
    const root = fakeRoot();
    setWorkspaceSceneArtEnabled(true, storage);
    expect(storage.map.get(WORKSPACE_SCENE_ART_STORAGE_KEY)).toBe("on");
    setWorkspaceSceneArtEnabled(false, storage);
    expect(storage.map.get(WORKSPACE_SCENE_ART_STORAGE_KEY)).toBe("off");
    applyWorkspaceSceneArt(true, root);
    expect((root.dataset as Record<string, string>).workspaceSceneArt).toBe("on");
    applyWorkspaceSceneArt(false, root);
    expect("workspaceSceneArt" in root.dataset).toBe(false);
  });
});
