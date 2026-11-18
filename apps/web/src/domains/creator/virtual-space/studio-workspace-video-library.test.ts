import { IDBFactory } from "fake-indexeddb";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { listWorkspaceVideos, readWorkspaceVideo, removeWorkspaceVideo, saveWorkspaceVideo } from "./studio-workspace-video-library";

beforeEach(() => { vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => vi.unstubAllGlobals());

it("계정·작품마다 영상과 목록을 함께 보관하고 같은 파일 ID도 구분한다", async () => {
  const recording = { id: "shared-id", title: "검수", zoneId: "review", zoneName: "검수실", quality: "medium" as const,
    startedAt: 1, durationMs: 1000, participantCount: 1, createdAt: 1001 };
  const first = JSON.stringify(["actor", "work"]), other = JSON.stringify(["other", "work"]);
  const firstVideo = new Blob(["first"], { type: "video/webm" });
  await saveWorkspaceVideo({ scope: first, recording }, firstVideo);
  await saveWorkspaceVideo({ scope: other, recording }, new Blob(["other"]));
  expect((await listWorkspaceVideos(first)).map(item => item.recording.id)).toEqual(["shared-id"]);
  expect(await (await readWorkspaceVideo(first, recording.id))?.text()).toBe("first");
  await removeWorkspaceVideo(first, recording.id);
  expect(await listWorkspaceVideos(first)).toEqual([]);
  expect(await readWorkspaceVideo(first, recording.id)).toBeUndefined();
  expect(await (await readWorkspaceVideo(other, recording.id))?.text()).toBe("other");
});
