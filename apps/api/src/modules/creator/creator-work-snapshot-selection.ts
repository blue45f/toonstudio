import { creatorWorks } from "../../platform/database";

/** 원고 저장과 이력 복원이 함께 사용하는 정본 스냅샷 열이다. */
export const creatorWorkSnapshotSelection = {
  id: creatorWorks.id,
  userId: creatorWorks.userId,
  hidden: creatorWorks.hidden,
  createdAt: creatorWorks.createdAt,
  updatedAt: creatorWorks.updatedAt,
  titleId: creatorWorks.titleId,
  title: creatorWorks.title,
  description: creatorWorks.description,
  cover: creatorWorks.cover,
  tags: creatorWorks.tags,
  format: creatorWorks.format,
  pages: creatorWorks.pages,
  doc: creatorWorks.doc,
  status: creatorWorks.status,
  seriesId: creatorWorks.seriesId,
  episodeNo: creatorWorks.episodeNo,
  challengeId: creatorWorks.challengeId,
  remixFromId: creatorWorks.remixFromId,
  revision: creatorWorks.revision,
};
