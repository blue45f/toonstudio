// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";

import { deviceKey, records } from "../planning/__tests__/planning-device-database";
import { createStudioAiComicDirectorSession, studioAiComicDirectorStorageKey } from "./studio-ai-comic-director-session";
import { readDirectorDeviceDraft, saveReviewedDirectorSession, writeDirectorDeviceDraft } from "./studio-director-device-draft";

afterEach(() => localStorage.clear());

it("기존 대본·인물·승인 기준과 클라우드 revision을 유지하면서 패널 변경만 저장한다", async () => {
  const prior = createStudioAiComicDirectorSession({ id: "review", title: "1화", workId: "a", storyText: "편집자가 고친 대사", characterDescription: "파란 코트" });
  const original = JSON.stringify({ ...prior, localCheckpoint: { dirty: false, remoteRevision: 8 } });
  await writeDirectorDeviceDraft(prior.id, null, original);
  const opened = { ...prior, storyText: "이전 대사" };
  await saveReviewedDirectorSession(opened, { ...opened });
  expect((await readDirectorDeviceDraft(prior.id)).raw).toBe(original);
  await saveReviewedDirectorSession(opened, { ...opened, stage: "production" });
  const saved = await readDirectorDeviceDraft(prior.id);
  expect(saved.session).toMatchObject({ title: "1화", workId: "a", storyText: "편집자가 고친 대사", characterDescription: "파란 코트", stage: "production" });
  expect(JSON.parse(saved.raw!).localCheckpoint).toEqual({ dirty: true, remoteRevision: 8 });
  await expect(saveReviewedDirectorSession(opened, { ...opened, storyText: "패널 대사" })).rejects.toThrow("다른 창");
  const other = { ...prior, workId: "b" };
  await expect(saveReviewedDirectorSession(other, { ...other, stage: "finish" })).rejects.toThrow("작품");
  expect((await readDirectorDeviceDraft(prior.id)).raw).toBe(saved.raw);
});

it("구형 기기 원본을 한 번 이전하고 다른 창의 새 대본을 덮지 않는다", async () => {
  const prior = createStudioAiComicDirectorSession({ id: "legacy", storyText: "첫 장" });
  const key = studioAiComicDirectorStorageKey(prior.id);
  const raw = JSON.stringify(prior);
  localStorage.setItem(key, raw);
  expect((await readDirectorDeviceDraft(prior.id)).raw).toBe(raw);
  const changed = JSON.stringify({ ...prior, storyText: "저장된 새 장" });
  await writeDirectorDeviceDraft(prior.id, raw, changed);
  await expect(writeDirectorDeviceDraft(prior.id, raw, raw)).rejects.toThrow("다른 창");
  expect(records.get(deviceKey("studio-director-drafts", key))).toBe(changed);
  expect(localStorage.getItem(key)).toBe(raw);
});
