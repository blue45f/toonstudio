import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import type { StudioSpacePollCommand, StudioSpacePollSnapshot } from "@toonstudio/contracts/studio-space-poll";
import type { PoolClient } from "pg";
import { studioRequestHash } from "./studio-project-graph.repository";
import { readStudioWorkMember, studioWorkTransaction } from "./studio-work-member-transaction";

type PollRow = {
  id: string; createdBy: string | null; creatorName: string; createdAt: Date; deadline: Date | null;
  question: string; options: string[]; anonymous: boolean; closed: boolean; expired: boolean;
};
type Member = NonNullable<Awaited<ReturnType<typeof readStudioWorkMember>>>;

async function current(client: PoolClient, workId: string, world: string): Promise<PollRow | null> {
  const result = await client.query<PollRow>(
    `SELECT id,"createdBy","creatorName","createdAt",deadline,question,options,anonymous,closed,
       coalesce(deadline <= clock_timestamp(),false) AS expired
     FROM studio_space_poll WHERE "workId"=$1 AND world=$2 ORDER BY "createdAt" DESC,id DESC LIMIT 1`, [workId, world],
  );
  return result.rows[0] ?? null;
}

async function snapshot(client: PoolClient, actor: string, member: Member, poll: PollRow | null): Promise<StudioSpacePollSnapshot> {
  const canCreate = member.access.edit;
  if (!poll) return { canCreate, didVote: false, canClose: false, canVote: false, poll: null };
  const votes = await client.query<{ index: number; count: number; mine: boolean; names: string[] | null }>(
    `SELECT "optionIndex" AS index,count(*)::int AS count,bool_or("voterId"=$2) AS mine,
       CASE WHEN $3::boolean THEN NULL ELSE array_agg("voterName" ORDER BY "voterName") END AS names
     FROM studio_space_poll_vote WHERE "pollId"=$1 GROUP BY "optionIndex"`, [poll.id, actor, poll.anonymous],
  );
  const byOption = new Map(votes.rows.map(row => [row.index, row]));
  const didVote = votes.rows.some(row => row.mine);
  const open = !poll.closed && !poll.expired;
  return {
    canCreate, canVote: member.access.comment && open && !didVote, didVote,
    canClose: open && (member.access.manageMembers || (canCreate && poll.createdBy === actor)),
    poll: {
      id: poll.id, anonymous: poll.anonymous, createdByName: poll.creatorName, createdAt: poll.createdAt.getTime(),
      closed: poll.closed, deadlineMs: poll.deadline?.getTime() ?? null, question: poll.question,
      options: poll.options.map((text, index) => {
        const row = byOption.get(index);
        return { text, count: row?.count ?? 0, voters: row?.names ?? [] };
      }),
    },
  };
}

async function apply(client: PoolClient, workId: string, actor: string, member: Member, poll: PollRow | null, input: StudioSpacePollCommand) {
  if (input.action === "create") {
    if (!member.access.edit) throw new ForbiddenException();
    const hash = studioRequestHash(input);
    const existing = (await client.query<{ match: boolean }>(
      'SELECT ("workId"=$2 AND world=$3 AND "createdBy"=$4 AND "requestHash"=$5) AS match FROM studio_space_poll WHERE id=$1',
      [input.id, workId, input.world, actor, hash],
    )).rows[0];
    if (existing?.match) return;
    if (existing || (poll?.id ?? null) !== input.previousId || (poll && !poll.closed && !poll.expired)) throw new ConflictException();
    const inserted = await client.query(
      `INSERT INTO studio_space_poll (id,"workId",world,question,options,anonymous,"createdBy","creatorName","requestHash",deadline)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp() + $10::double precision * interval '1 millisecond')
       ON CONFLICT (id) DO NOTHING`, [input.id,workId,input.world,input.question,input.options,input.anonymous,actor,member.name,hash,input.closesInMs],
    );
    if (!inserted.rowCount) throw new ConflictException();
    return;
  }
  if (!poll || input.id !== poll.id) throw new ConflictException();
  if (input.action === "close") {
    if (!member.access.manageMembers && (!member.access.edit || poll.createdBy !== actor)) throw new ForbiddenException();
    if (!poll.expired && !poll.closed) await client.query('UPDATE studio_space_poll SET closed=true WHERE id=$1', [poll.id]);
    return;
  }
  if (!member.access.comment) throw new ForbiddenException();
  if (input.optionIndex >= poll.options.length) throw new BadRequestException();
  const previous = (await client.query<{ optionIndex: number }>(
    'SELECT "optionIndex" FROM studio_space_poll_vote WHERE "pollId"=$1 AND "voterId"=$2', [poll.id, actor],
  )).rows[0];
  if (previous?.optionIndex === input.optionIndex) return;
  if (previous || poll.closed || poll.expired) throw new ConflictException();
  const inserted = await client.query(
    `INSERT INTO studio_space_poll_vote ("pollId","voterId","optionIndex","voterName")
     SELECT id,$2,$3,$4 FROM studio_space_poll WHERE id=$1 AND NOT closed AND (deadline IS NULL OR deadline > clock_timestamp())`,
    [poll.id, actor, input.optionIndex, poll.anonymous ? null : member.name],
  );
  if (!inserted.rowCount) throw new ConflictException();
}

@Injectable()
export class StudioSpacePollRepository {
  async readOrChange(actor: string, workId: string, input: string | StudioSpacePollCommand) {
    const command = typeof input === "string" ? undefined : input;
    const world = typeof input === "string" ? input : input.world;
    return studioWorkTransaction(async client => {
      const member = await readStudioWorkMember(client, actor, workId, Boolean(command));
      if (!member) throw new ForbiddenException();
      const poll = await current(client, workId, world);
      if (!command) return snapshot(client, actor, member, poll);
      await apply(client, workId, actor, member, poll, command);
      return snapshot(client, actor, member, await current(client, workId, world));
    });
  }
}
