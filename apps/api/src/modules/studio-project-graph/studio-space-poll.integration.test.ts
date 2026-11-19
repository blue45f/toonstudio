import { randomUUID } from "node:crypto";

import type { StudioSpacePollCommand } from "@toonstudio/contracts/studio-space-poll";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as DatabaseRuntime from "../../platform/database";
import type { StudioSpacePollRepository } from "./studio-space-poll.repository";

const url = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL;
if (process.env.CI && !url) throw new Error("팀 공간 투표 검증에 실제 PostgreSQL 연결이 필요합니다.");

describe.skipIf(!url)("팀 공간 투표의 PostgreSQL 트랜잭션", () => {
  const owner = randomUUID(), editor = randomUUID(), work = randomUUID();
  const originalUrl = process.env.DATABASE_URL;
  let fixture: Pool, runtime: typeof DatabaseRuntime, polls: StudioSpacePollRepository;
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    fixture = new Pool({ connectionString: process.env.STUDIO_SPACE_POLL_FIXTURE_DATABASE_URL ?? url });
    runtime = await import("../../platform/database");
    polls = new (await import("./studio-space-poll.repository")).StudioSpacePollRepository();
    for (const [id, name] of [[owner, "원고 작가"], [editor, "편집자"]]) {
      await fixture.query('INSERT INTO "user"(id,email,name) VALUES($1,$2,$3)', [id, id+"@example.test", name]);
    }
    await fixture.query('INSERT INTO creator_work(id,"userId",title) VALUES($1,$2,$3)', [work, owner, "팀 투표 검증"]);
    await fixture.query(`INSERT INTO creator_work_collaborator("workId","userId",role,status,"invitationId","respondedAt")
      VALUES ($1,$2,'editor','active',$3,now())`, [work, editor, randomUUID()]);
  });
  afterAll(async () => {
    try {
      await fixture?.query('DELETE FROM creator_work WHERE id=$1', [work]);
      await fixture?.query('DELETE FROM "user" WHERE id=ANY($1::text[])', [[owner, editor]]);
    } finally {
      await Promise.all([fixture?.end(), runtime?.dbPool.end()]);
      if (originalUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalUrl;
    }
  });
  const create = (world: string, anonymous: boolean): Extract<StudioSpacePollCommand, { action: "create" }> => ({
    action: "create", world, id: randomUUID(), previousId: null, question: "다음 콘티는?", options: ["첫 장", "둘째 장"], closesInMs: null, anonymous,
  });

  it("같은 공간의 두 개설 시도와 같은 계정의 두 선택을 각각 한 번만 반영한다", async () => {
    const world = "studio-floor", a = create(world, true), b = create(world, true);
    const open = await Promise.allSettled([polls.readOrChange(owner, work, a), polls.readOrChange(editor, work, b)]);
    expect(open.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(open.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const current = (await polls.readOrChange(owner, work, world)).poll;
    expect(current).not.toBeNull();
    if (!current) throw new Error("생성된 투표가 없습니다.");
    const vote = (optionIndex: number): StudioSpacePollCommand => ({ action: "vote", world, id: current.id, optionIndex });
    const submissions = await Promise.allSettled([polls.readOrChange(editor, work, vote(0)), polls.readOrChange(editor, work, vote(1))]);
    expect(submissions.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(submissions.find(r => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const received = await polls.readOrChange(owner, work, world);
    expect(received.poll?.options.reduce((n, option) => n + option.count, 0)).toBe(1);
    expect(received.poll?.options.flatMap(option => option.voters)).toEqual([]);
    const saved = await fixture.query('SELECT "voterId","voterName" FROM studio_space_poll_vote WHERE "pollId"=$1', [current.id]);
    expect(saved.rows).toEqual([{ voterId: editor, voterName: null }]);
  });

  it("새 장소·활성 계정·마감 권한과 제출 시점 이름을 구분하며 같은 요청은 한 번만 적용한다", async () => {
    const world = "review-room", input = create(world, false);
    await polls.readOrChange(owner, work, input);
    await polls.readOrChange(owner, work, input);
    expect((await polls.readOrChange(editor, work, "outside")).poll).toBeNull();
    await expect(polls.readOrChange(editor, work, { action: "close", world, id: input.id })).rejects.toMatchObject({ status: 403 });
    const vote: StudioSpacePollCommand = { action: "vote", world, id: input.id, optionIndex: 0 };
    await polls.readOrChange(editor, work, vote);
    const replay = await polls.readOrChange(editor, work, vote);
    expect(replay.poll?.options[0]).toEqual({ text: "첫 장", count: 1, voters: ["편집자"] });
    await polls.readOrChange(owner, work, { action: "close", world, id: input.id });
    await expect(polls.readOrChange(owner, work, vote)).rejects.toMatchObject({ status: 409 });
    await expect(polls.readOrChange(owner, work, create(world, true))).rejects.toMatchObject({ status: 409 });
    const next = await polls.readOrChange(owner, work, { ...create(world, true), previousId: input.id });
    expect(next.poll?.options.every(option => option.count === 0)).toBe(true);
    await fixture.query('UPDATE "user" SET status=$2 WHERE id=$1', [editor, "suspended"]);
    await expect(polls.readOrChange(editor, work, world)).rejects.toMatchObject({ status: 403 });
  });
});
