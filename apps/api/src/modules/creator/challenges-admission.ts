// 챌린지 참여 가능 검증 — works.ts와 challenges.ts 간 순환 의존성 제거용 리프 모듈.
import { eq } from "drizzle-orm";

import { creatorChallenges, db } from "../../platform/database";
import { withDatabaseCapability } from "../../platform/http/service-availability";
import { challengeStateOf } from "../../server/creator/community-contract";
import { requireCreatorCommunitySchema } from "./community-schema";

// 참여 가능 챌린지 검증 — 없거나 마감/시작 전이면 throw.
export async function assertJoinableChallenge(challengeId: string): Promise<{ id: string; title: string }> {
  return withDatabaseCapability("creator.challenges.write", async () => {
    await requireCreatorCommunitySchema("creator.challenges.write");
    const [challenge] = await db
      .select({
        id: creatorChallenges.id,
        title: creatorChallenges.title,
        startsAt: creatorChallenges.startsAt,
        endsAt: creatorChallenges.endsAt,
      })
      .from(creatorChallenges)
      .where(eq(creatorChallenges.id, challengeId))
      .limit(1);
    if (!challenge) throw new Error("챌린지를 찾을 수 없습니다.");
    const state = challengeStateOf(challenge.startsAt, challenge.endsAt);
    if (state === "ended") throw new Error("이미 마감된 챌린지입니다.");
    if (state === "upcoming") throw new Error("아직 시작 전인 챌린지입니다.");
    return { id: challenge.id, title: challenge.title };
  });
}
