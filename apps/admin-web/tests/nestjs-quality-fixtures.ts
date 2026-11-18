import { createNestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality-seed";

import type { NestBoardMutation, NestBoardView } from "@toonstudio/contracts/admin-nestjs-quality";

export function nestBoardFixture(canEdit = true): NestBoardView {
  const document = createNestBoardDocument();
  document.snapshot.observedAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  document.snapshot.observedKst = document.snapshot.observedAt;
  return { document, revision: 0, history: [], canEdit, updatedAt: null };
}

export function applyNestFixture(previous: NestBoardView, mutation: NestBoardMutation, actorId = "nest-admin-a"): NestBoardView {
  const createdAt = new Date().toISOString();
  const revision = previous.revision + 1;
  const changedTaskIds = mutation.document.tasks.filter((task) => JSON.stringify(previous.document.tasks.find((item) => item.id === task.id)) !== JSON.stringify(task)).map((task) => task.id);
  return { document: structuredClone(mutation.document), revision, canEdit: previous.canEdit, updatedAt: createdAt,
    history: [{ revision, actorId, createdAt, reason: mutation.reason, changedTaskIds,
      snapshotChanged: JSON.stringify(previous.document.snapshot) !== JSON.stringify(mutation.document.snapshot) }, ...previous.history] };
}
