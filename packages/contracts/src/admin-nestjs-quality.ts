import { NEST_BOARD_REPOSITORY, STATUSES } from "./admin-nestjs-quality-values";

export { NEST_BOARD_REPOSITORY, STATUSES, NEST_BOARD_MAX_JSON_BYTES } from "./admin-nestjs-quality-values";
export type Status = typeof STATUSES[number];
export type Link = { label: string; url: string; type?: string };
export type Task = {
  id: string; title: string; category: string; priority: "P0" | "P1" | "P2";
  status: Status; kind: string; summary: string; scope: string; nextAction: string;
  owner: string; commit: string; checkedAt: string; verificationDate: string;
  environment: string; result: string; steps: string[]; acceptance: string;
  beforeEvidence: string; afterEvidence: string; evidenceLinks: Link[]; notes: string;
  approvalRequired: boolean; archived: boolean; revision: number; updatedAt?: string;
};
export type PackageRow = {
  name: string; declared: string; locked: string; target: string; targetNote: string;
  peerSummary: string; assessment: string; scope: string; links: Link[]; taskId: string;
};
export type PRRow = {
  number: number; title: string; state: string; sha: string; mergedAt: string; url: string; note: string;
};
export type CIRow = { title: string; scope: string; result: string; detail: string; url: string; counted: boolean };
export type PathRow = { id: string; title: string; subtitle: string; detail: string; url: string; taskId: string };
export type Exclusion = { title: string; reason: string; url: string };
export type Snapshot = {
  observedAt: string; observedKst: string; repository: string; mainSha: string;
  mainUrl: string; mainCiUrl: string; mainCiState: string; releaseUrl: string; releaseDate: string;
  packages: PackageRow[]; prs: PRRow[]; ci: CIRow[]; paths: PathRow[]; exclusions: Exclusion[];
  sources: Link[]; sequence: { title: string; detail: string; status: string }[];
};
/** Sites에서 가져온 원본 이력이다. 서버가 관측한 관리자 감사 이력으로 취급하지 않는다. */
export type HistoryEntry = {
  id: string; taskId: string; taskTitle: string; changedAt: string; actor: string; changes: string[];
};
export type NestBoardDocument = {
  schemaVersion: 1;
  repository: typeof NEST_BOARD_REPOSITORY;
  snapshot: Snapshot;
  tasks: Task[];
  sourceHistory: HistoryEntry[];
};
export type NestBoardHistorySummary = {
  revision: number;
  actorId: string;
  createdAt: string;
  reason: string;
  changedTaskIds: string[];
  snapshotChanged: boolean;
};
export type NestBoardHistoryDetail = NestBoardHistorySummary & {
  before: NestBoardDocument | null;
  after: NestBoardDocument;
};
export type NestBoardView = {
  document: NestBoardDocument;
  revision: number;
  history: NestBoardHistorySummary[];
  canEdit: boolean;
  updatedAt: string | null;
};
export type NestBoardMutation = {
  expectedRevision: number;
  mutationId: string;
  document: NestBoardDocument;
  reason: string;
};

export { parseNestBoardDocument, parseNestBoardImport, parseNestBoardMutation } from "./admin-nestjs-quality-validation";
