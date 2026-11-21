#!/usr/bin/env node

/**
 * 6인 산업형 분업 스튜디오 로컬 시드 팩 (`127.0.0.1` 일회용 로컬 DB 전용).
 *
 * 안전 규칙 (FAIL-CLOSED · 외부 의존성 0개):
 * - `.env` / `.env.infrastructure.local`을 읽거나 쓰거나 출력하지 않는다.
 * - 원격 DATABASE_URL·외부 DATABASE_URL·libpq 호스트 우회 쿼리(`?host=`/`?hostaddr=`/`?service=`)를 즉시 차단한다.
 * - 기존 `apps/api/src/platform/database/seed.ts`의 `seed-*` 행과 ID·이메일이 0건 겹치며 `ON CONFLICT DO NOTHING`으로 멱등 공존한다.
 * - 실제 DB의 `pg_catalog.pg_tables` / `information_schema.columns`를 조회해 존재하는 테이블만 안전하게 시드한다.
 */

import { spawn } from "node:child_process";
import { createHash, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export const STUDIO_SEED_PACK_ID = "toonstudio-6-member-division-v1";
export const STUDIO_SEED_SERIES_ID = "studio-series-neon-seoul";
export const STUDIO_SEED_ORG_ID = "studio-org-neon-atelier";
export const STUDIO_SEED_WORKSPACE_ID = "studio-ws-neon-6team";
export const STUDIO_SEED_ART_BIBLE_ID = "studio-art-bible-neon-seoul";
export const STUDIO_SEED_ART_BIBLE_SETTING_KEY = "studio.seed.art_bible.neon_seoul";
export const STUDIO_SEED_PD_EMAIL = "studio-pd@toonstudio.dev";

const STUDIO_SEED_BASE_ISO = "2026-06-01T09:00:00.000Z";
const STUDIO_SEED_DEMO_CREDENTIAL = ["Demo", "1234", "!"].join("");
const LIBPQ_HOST_OVERRIDE_PARAMS = new Set(["host", "hostaddr", "service"]);
const POSTGRES_CANDIDATE_DIRS = Object.freeze([
  "/opt/homebrew/opt/postgresql@17/bin", "/opt/homebrew/opt/postgresql@16/bin",
  "/opt/homebrew/opt/postgresql@18/bin", "/usr/local/opt/postgresql@17/bin",
  "/usr/local/opt/postgresql@16/bin", "/opt/homebrew/bin", "/usr/local/bin",
  "/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin",
]);
const SAFE_HOST_ENV_KEYS = Object.freeze([
  "PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TZ",
]);

export const STUDIO_SEED_TEAM_MEMBERS = Object.freeze([
  {
    id: "studio-pd", name: "한지우 PD", email: "studio-pd@toonstudio.dev", divisionRole: "pd",
    primaryRole: "producer", secondaryRoles: ["planner"], specialties: ["production-schedule", "budget", "quality-control", "episode-planning"],
    orgRole: "owner", workspaceRole: "owner", workRole: "owner", allowedFolders: ["00_CONTI", "99_AD_REDLINE"],
    avatar: "#1d4ed8", bio: "6인 분업 스튜디오 총괄 PD (회차 일정·병목·정산 관리)",
  },
  {
    id: "studio-ad", name: "서윤아 AD", email: "studio-ad@toonstudio.dev", divisionRole: "art_director",
    primaryRole: "reviewer", secondaryRoles: ["editor"], specialties: ["quality-control", "editing", "proofing", "character-design"],
    orgRole: "admin", workspaceRole: "admin", workRole: "admin", allowedFolders: ["99_AD_REDLINE"],
    avatar: "#0f766e", bio: "아트 디렉터 (아트바이블·색감 ΔE·선폭·최종 레귤레이션 검수)",
  },
  {
    id: "studio-line", name: "민도현 선화", email: "studio-line@toonstudio.dev", divisionRole: "line",
    primaryRole: "line-art", secondaryRoles: ["line-assistant"], specialties: ["line-art", "inking", "character-design", "composition"],
    orgRole: "member", workspaceRole: "member", workRole: "editor", allowedFolders: ["20_LINEART"],
    avatar: "#334155", bio: "메인 선화·펜터치 담당 (캐릭터 연기·벡터 선 클린업)",
  },
  {
    id: "studio-color", name: "박채린 채색", email: "studio-color@toonstudio.dev", divisionRole: "color",
    primaryRole: "color", secondaryRoles: ["flat-color-assistant", "shading-assistant"], specialties: ["flat-color", "rendering", "effects", "retouching"],
    orgRole: "member", workspaceRole: "member", workRole: "editor", allowedFolders: ["30_FLAT_COLOR", "40_SHADING", "50_FX_LIGHTING"],
    avatar: "#d97706", bio: "밑색·명암·후보정 채색 담당 (아트바이블 OKLCH 팔레트 준수)",
  },
  {
    id: "studio-bg3d", name: "김태오 3D배경", email: "studio-bg3d@toonstudio.dev", divisionRole: "bg3d",
    primaryRole: "background", secondaryRoles: ["three-d", "background-assistant"], specialties: ["background-3d", "background-2d", "prop-design", "composition"],
    orgRole: "member", workspaceRole: "member", workRole: "editor", allowedFolders: ["10_BG_3D_LT"],
    avatar: "#0284c7", bio: "3D 배경·소품·카메라 매칭 및 LT 선화/음영 패스 추출 담당",
  },
  {
    id: "studio-letterer", name: "이소민 식자", email: "studio-letterer@toonstudio.dev", divisionRole: "lettering",
    primaryRole: "lettering", secondaryRoles: ["lettering-assistant"], specialties: ["lettering", "balloon", "sound-effects", "proofing"],
    orgRole: "member", workspaceRole: "member", workRole: "editor", allowedFolders: ["60_BALLOONS", "70_LETTERING_SFX"],
    avatar: "#be123c", bio: "말풍선·대사 식자·효과음(SFX)·모바일 375px 가독성 교정 담당",
  },
]);

export const STUDIO_SEED_TEAM_IDS = Object.freeze(STUDIO_SEED_TEAM_MEMBERS.map((member) => member.id));

export function isRemoteStudioDatabaseUrl(url) {
  try {
    const parsed = new URL(String(url ?? "").trim());
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") return true;
    const host = parsed.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]") return true;
    for (const [key] of parsed.searchParams) {
      if (LIBPQ_HOST_OVERRIDE_PARAMS.has(key.toLowerCase())) return true;
    }
    return false;
  } catch { return true; }
}

export function redactStudioDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.username = "***";
    parsed.password = "";
    parsed.search = "";
    return parsed.toString();
  } catch { return "(unparseable-url)"; }
}

export function assertLocalStudioSeedAllowed({ databaseUrl, managedDisposable = false, environmentDatabaseUrl = "" }) {
  const externalUrl = String(environmentDatabaseUrl ?? "").trim();
  if (externalUrl) {
    if (isRemoteStudioDatabaseUrl(externalUrl)) {
      throw new Error(`원격 DATABASE_URL에는 6인 스튜디오 시드 팩을 실행할 수 없습니다 (차단됨: ${redactStudioDatabaseUrl(externalUrl)}).`);
    }
    throw new Error(
      `외부 DATABASE_URL(${redactStudioDatabaseUrl(externalUrl)})이 설정되어 있어 6인 스튜디오 시드 팩을 차단했습니다. `
      + "로컬 일회용 DB(127.0.0.1)에서만 실행할 수 있습니다.",
    );
  }
  if (!managedDisposable) throw new Error("관리되는 로컬 일회용 DB가 아니므로 6인 스튜디오 시드 팩을 실행할 수 없습니다.");
  if (!databaseUrl || isRemoteStudioDatabaseUrl(databaseUrl)) {
    throw new Error(`로컬 loopback DB URL이 아니므로 6인 스튜디오 시드 팩을 차단했습니다 (${redactStudioDatabaseUrl(databaseUrl)}).`);
  }
}

const deterministicRevHash = (seedText) => createHash("sha256").update(seedText).digest("hex");

function deterministicPasswordHash() {
  const salt = createHash("sha256").update("toonstudio-local-studio-seed-pack-v1-salt").digest("hex").slice(0, 32);
  const hash = scryptSync(STUDIO_SEED_DEMO_CREDENTIAL, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function buildCreatorRoleProfile(member) {
  return {
    version: 1, primaryRole: member.primaryRole, secondaryRoles: member.secondaryRoles, specialties: member.specialties,
    creatorStage: "studio", experienceLevel: "professional", collaborationStatus: "available", roleVisibility: true,
    visibility: { roles: true, specialties: true, experienceLevel: true, collaborationStatus: true },
    activeRole: member.primaryRole, usagePurposes: ["team-production", "serialization", "studio-operations"], roleAliases: [],
    workCapacity: { weeklyHours: 40, maxConcurrentTasks: 3, availabilityNote: `${member.name} (6인 분업 시드)` },
    defaultNotificationLevel: "standard",
    onboarding: { status: "completed", step: 4, completedAt: STUDIO_SEED_BASE_ISO, updatedAt: STUDIO_SEED_BASE_ISO },
    projectRolePreferences: [],
  };
}

/** 컷 슬라이스 파티션의 회차별 겹침 0건·연속성(1..totalCuts)을 검증한다. */
export function validateCutSlicePartition(cutSlices, expectedCutsPerEpisode = 75) {
  const failures = [];
  const byEpisode = new Map();
  for (const slice of cutSlices) {
    if (!Number.isInteger(slice.cutStart) || !Number.isInteger(slice.cutEnd) || slice.cutStart < 1 || slice.cutEnd < slice.cutStart) {
      failures.push(`잘못된 컷 범위: ${slice.id} (${slice.cutStart}..${slice.cutEnd})`);
      continue;
    }
    const list = byEpisode.get(slice.episodeId) ?? [];
    list.push(slice);
    byEpisode.set(slice.episodeId, list);
  }
  for (const [episodeId, list] of byEpisode.entries()) {
    let cursor = 1;
    for (const slice of [...list].sort((a, b) => a.cutStart - b.cutStart)) {
      if (slice.cutStart < cursor) failures.push(`컷 슬라이스 겹침 감지(${episodeId}): ${slice.id}`);
      else if (slice.cutStart > cursor) failures.push(`컷 슬라이스 누락 감지(${episodeId}): ${cursor}..${slice.cutStart - 1}`);
      cursor = Math.max(cursor, slice.cutEnd + 1);
    }
    if (cursor - 1 !== expectedCutsPerEpisode) {
      failures.push(`회차 컷 총량 불일치(${episodeId}): 기대 ${expectedCutsPerEpisode}, 실제 ${cursor - 1}`);
    }
  }
  return { ok: failures.length === 0, failures, episodeCount: byEpisode.size, sliceCount: cutSlices.length };
}

/** 6인 분업 팀 + 3화 샘플 원고 + 9개 컷 슬라이스 + 아트바이블 결정적 시드 레시피를 생성한다. */
export function buildStudioSeedPackRecipe() {
  const artBible = {
    id: STUDIO_SEED_ART_BIBLE_ID, seriesId: STUDIO_SEED_SERIES_ID, title: "서울 야경 수사록 아트바이블 v1",
    version: "1.0.0", ownerUserId: "studio-ad", updatedAt: STUDIO_SEED_BASE_ISO,
    paletteTokens: [
      { id: "tok-protagonist-coat", name: "주인공 트렌치 네이비", role: "character", oklch: { l: 0.31, c: 0.07, h: 255 }, maxDeltaE: 2.0 },
      { id: "tok-skin-neutral", name: "기본 피부 톤", role: "character", oklch: { l: 0.84, c: 0.05, h: 58 }, maxDeltaE: 1.5 },
      { id: "tok-neon-cyan", name: "서울 야경 네온 시안", role: "environment", oklch: { l: 0.76, c: 0.14, h: 205 }, maxDeltaE: 2.5 },
      { id: "tok-night-shadow", name: "야간 곱하기 그림자", role: "lighting", oklch: { l: 0.24, c: 0.06, h: 268 }, maxDeltaE: 2.0 },
      { id: "tok-ad-redline", name: "AD 검수 레드라인", role: "review", oklch: { l: 0.61, c: 0.21, h: 24 }, maxDeltaE: 1.0 },
    ],
    lineWeightSpec: { primaryContourPx: 2.2, detailLinePx: 1.1, maxCvRatio: 0.18, brushPreset: "studio-gpen-ink" },
    typographySpec: { dialogueFont: "Pretendard Variable", minMobileBodyPx: 14, mobileViewportWidthPx: 375, sfxLayerFolder: "70_LETTERING_SFX" },
    colorScriptMoods: [
      { episodeId: "studio-ep-1", mood: "야간 빗속 네온 도입", keyLightOklch: { l: 0.72, c: 0.12, h: 210 } },
      { episodeId: "studio-ep-2", mood: "새벽 취조실 냉백색 대치", keyLightOklch: { l: 0.82, c: 0.03, h: 225 } },
      { episodeId: "studio-ep-3", mood: "여명 옥상 청회색 추격전", keyLightOklch: { l: 0.68, c: 0.09, h: 38 } },
    ],
    rightsBomPolicy: { allowNonCommercial: false, allowGpl: false, requireCommercialLicense: true },
  };

  const episodes = [
    {
      id: "studio-ep-1", projectId: "studio-proj-neon-seoul-ep1", episodeNo: 1,
      title: "서울 야경 수사록 1화 — 빗속의 네온 골목", description: "G3 최종 승인 완료 샘플 회차 (75컷 · 3슬라이스 완결 합본)",
      status: "published", pipelinePhase: "g3-approved", stageGateId: "stage-gate:studio-ep-1:art", stageGateStage: "art",
      totalCuts: 75, cover: "/brand/showcase-covers-20261009/night-store-ep1.webp", views: 840, dueAt: "2026-06-08T09:00:00.000Z",
    },
    {
      id: "studio-ep-2", projectId: "studio-proj-neon-seoul-ep2", episodeNo: 2,
      title: "서울 야경 수사록 2화 — 새벽 취조실의 단서", description: "AD 레귤레이션 검수 대기 샘플 회차 (75컷 · 채색/식자 인계)",
      status: "draft", pipelinePhase: "ad-review", stageGateId: "stage-gate:studio-ep-2:art", stageGateStage: "art",
      totalCuts: 75, cover: "/brand/showcase-covers-20261009/night-store-ep2.webp", views: 0, dueAt: "2026-06-15T09:00:00.000Z",
    },
    {
      id: "studio-ep-3", projectId: "studio-proj-neon-seoul-ep3", episodeNo: 3,
      title: "서울 야경 수사록 3화 — 여명의 옥상 추격전", description: "3D 배경·선화·채색 병렬 제작 중 샘플 회차 (75컷)",
      status: "draft", pipelinePhase: "in-production", stageGateId: "stage-gate:studio-ep-3:storyboard", stageGateStage: "storyboard",
      totalCuts: 75, cover: "/brand/showcase-covers-20261009/demo-cuttoon-ep1.webp", views: 0, dueAt: "2026-06-22T09:00:00.000Z",
    },
  ];

  const mkSlice = (id, projectId, episodeId, stageCode, cutStart, cutEnd, allowedFolders, assigneeUserId, status, leaseDay, dueDay) => ({
    id, projectId, episodeId, stageCode, cutStart, cutEnd, allowedFolders, assigneeUserId, status,
    leaseExpiresAt: `2026-06-${String(leaseDay).padStart(2, "0")}T09:00:00.000Z`,
    latestRevHash: deterministicRevHash(id),
    dueAt: `2026-06-${String(dueDay).padStart(2, "0")}T09:00:00.000Z`,
  });
  const cutSlices = [
    mkSlice("studio-slice-ep1-1", "studio-proj-neon-seoul-ep1", "studio-ep-1", "bg3d", 1, 25, ["10_BG_3D_LT"], "studio-bg3d", "approved", 6, 5),
    mkSlice("studio-slice-ep1-2", "studio-proj-neon-seoul-ep1", "studio-ep-1", "line", 26, 50, ["20_LINEART"], "studio-line", "approved", 7, 6),
    mkSlice("studio-slice-ep1-3", "studio-proj-neon-seoul-ep1", "studio-ep-1", "lettering", 51, 75, ["60_BALLOONS", "70_LETTERING_SFX"], "studio-letterer", "approved", 8, 7),
    mkSlice("studio-slice-ep2-1", "studio-proj-neon-seoul-ep2", "studio-ep-2", "line", 1, 25, ["20_LINEART"], "studio-line", "approved", 13, 12),
    mkSlice("studio-slice-ep2-2", "studio-proj-neon-seoul-ep2", "studio-ep-2", "color", 26, 50, ["30_FLAT_COLOR", "40_SHADING", "50_FX_LIGHTING"], "studio-color", "in-review", 14, 13),
    mkSlice("studio-slice-ep2-3", "studio-proj-neon-seoul-ep2", "studio-ep-2", "lettering", 51, 75, ["60_BALLOONS", "70_LETTERING_SFX"], "studio-letterer", "in-review", 15, 14),
    mkSlice("studio-slice-ep3-1", "studio-proj-neon-seoul-ep3", "studio-ep-3", "bg3d", 1, 25, ["10_BG_3D_LT"], "studio-bg3d", "in-progress", 20, 19),
    mkSlice("studio-slice-ep3-2", "studio-proj-neon-seoul-ep3", "studio-ep-3", "line", 26, 50, ["20_LINEART"], "studio-line", "in-progress", 21, 20),
    mkSlice("studio-slice-ep3-3", "studio-proj-neon-seoul-ep3", "studio-ep-3", "color", 51, 75, ["30_FLAT_COLOR", "40_SHADING", "50_FX_LIGHTING"], "studio-color", "assigned", 22, 21),
  ];

  const partitionCheck = validateCutSlicePartition(cutSlices, 75);
  if (!partitionCheck.ok) throw new Error(`시드 레시피 컷 슬라이스 불변식 오류: ${partitionCheck.failures.join("; ")}`);

  return {
    packId: STUDIO_SEED_PACK_ID, createdAt: STUDIO_SEED_BASE_ISO,
    organization: { id: STUDIO_SEED_ORG_ID, name: "스튜디오 네온 아틀리에", kind: "studio", description: "6인 산업형 웹툰 분업 로컬 시드 조직", ownerUserId: "studio-pd" },
    teamWorkspace: { id: STUDIO_SEED_WORKSPACE_ID, name: "네온 아틀리에 6인팀", ownerUserId: "studio-pd" },
    series: {
      id: STUDIO_SEED_SERIES_ID, userId: "studio-pd", author: "스튜디오 네온 아틀리에", avatar: "#1d4ed8",
      title: "서울 야경 수사록", description: "6인 산업형 분업 스튜디오(PD·AD·선화·채색·3D배경·식자) 검증용 3화 샘플 연재",
      tags: ["스릴러", "스튜디오분업", "로컬시드"], status: "ongoing",
    },
    team: STUDIO_SEED_TEAM_MEMBERS, episodes, cutSlices, artBible,
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const sqlJsonb = (value) => `${sqlLiteral(JSON.stringify(value))}::jsonb`;

function buildProductionWorkspaceDocument(episode, episodeSlices, recipe) {
  return {
    schemaVersion: "3", packId: recipe.packId, seriesId: recipe.series.id, episodeId: episode.id,
    updatedAt: recipe.createdAt, artBible: recipe.artBible, cutSlices: episodeSlices,
    hierarchy: [{ id: episode.id, kind: "episode", title: episode.title, episodeNo: episode.episodeNo, totalCuts: episode.totalCuts }],
    roleAssignments: recipe.team.map((m) => ({
      id: `assign-${episode.id}-${m.divisionRole}`, userId: m.id, name: m.name, role: m.divisionRole, allowedFolders: m.allowedFolders,
    })),
    tasks: episodeSlices.map((s) => ({
      id: `task-${s.id}`, sliceId: s.id, title: `${episode.episodeNo}화 ${s.cutStart}~${s.cutEnd}컷 (${s.stageCode})`,
      assigneeUserId: s.assigneeUserId, stageCode: s.stageCode, status: s.status, dueAt: s.dueAt,
    })),
    reviews: [{
      id: `review-${episode.id}-ad`, reviewerUserId: "studio-ad", stage: episode.stageGateStage,
      status: episode.pipelinePhase === "g3-approved" ? "approved" : "pending", artBibleId: recipe.artBible.id,
    }],
    handoffs: episodeSlices.map((s) => ({
      id: `handoff-${s.id}`, fromUserId: s.assigneeUserId, toUserId: "studio-ad", sliceId: s.id, status: s.status === "approved" ? "accepted" : "open",
    })),
  };
}

function buildProductionProjectAggregate(episode, episodeSlices, recipe) {
  return {
    modelVersion: 2, projectId: episode.projectId, workId: episode.id, title: episode.title,
    collaborationModel: "studio-production", revision: 1, artBibleId: recipe.artBible.id, cutSlices: episodeSlices,
    parties: recipe.team.map((m) => ({ id: `party-${m.id}`, accountUserId: m.id, displayName: m.name, role: m.divisionRole })),
    assignments: recipe.team.map((m) => ({ id: `role-${episode.id}-${m.divisionRole}`, partyId: `party-${m.id}`, role: m.divisionRole, allowedFolders: m.allowedFolders })),
    auditEvents: [{ id: `audit-${episode.id}-seed`, actorUserId: "studio-pd", action: "seed.studio_division_pack", occurredAt: recipe.createdAt }],
  };
}

function resolveOptionalCutSliceSql(cutSlices, columnsSet) {
  if (!columnsSet || columnsSet.size === 0) return null;
  const camel = ["id", "projectId", "episodeId", "stageCode", "cutStart", "cutEnd", "allowedFolders", "assigneeUserId", "status", "leaseExpiresAt", "latestRevHash", "dueAt"];
  const snake = ["id", "project_id", "episode_id", "stage_code", "cut_start", "cut_end", "allowed_folders", "assignee_user_id", "status", "lease_expires_at", "latest_rev_hash", "due_at"];
  const selected = camel.every((col) => columnsSet.has(col)) ? camel : (snake.every((col) => columnsSet.has(col)) ? snake : null);
  if (!selected) return null;
  const values = cutSlices.map((s) => `(${[
    sqlLiteral(s.id), sqlLiteral(s.projectId), sqlLiteral(s.episodeId), sqlLiteral(s.stageCode),
    sqlLiteral(s.cutStart), sqlLiteral(s.cutEnd), sqlJsonb(s.allowedFolders), sqlLiteral(s.assigneeUserId),
    sqlLiteral(s.status), `${sqlLiteral(s.leaseExpiresAt)}::timestamptz`, sqlLiteral(s.latestRevHash), `${sqlLiteral(s.dueAt)}::timestamptz`,
  ].join(", ")})`).join(",\n  ");
  return `INSERT INTO public."production_cut_slice" (${selected.map((c) => `"${c}"`).join(", ")}) VALUES\n  ${values}\nON CONFLICT ("id") DO NOTHING;`;
}

/** 실제 DB에 존재하는 테이블 집합과 선택 테이블 컬럼 정보를 바탕으로 멱등 SQL 스크립트를 생성한다. */
export function buildStudioSeedPackSql(recipe = buildStudioSeedPackRecipe(), { existingTables, tableColumns = new Map() } = {}) {
  const tables = existingTables instanceof Set ? existingTables : new Set(existingTables ?? []);
  const has = (...names) => names.every((name) => tables.has(name));
  const statements = ["BEGIN;"];
  const appliedTables = [];
  const skippedTables = [];
  const skippedOptionalTables = [];
  const record = (tableName, canApply, builder, optional = false) => {
    const sql = canApply ? builder() : null;
    if (!sql) { (optional ? skippedOptionalTables : skippedTables).push(tableName); return; }
    appliedTables.push(tableName);
    statements.push(sql);
  };
  const pwHash = deterministicPasswordHash();
  const ts = `${sqlLiteral(recipe.createdAt)}::timestamptz`;

  record("user", has("user"), () => `INSERT INTO public."user" ("id", "name", "email", "emailVerified", "role", "status", "passwordHash", "avatar", "bio", "creatorRoleProfile", "createdAt") VALUES\n  ${
    recipe.team.map((m) => `(${[sqlLiteral(m.id), sqlLiteral(m.name), sqlLiteral(m.email), ts, "'user'", "'active'", sqlLiteral(pwHash), sqlLiteral(m.avatar), sqlLiteral(m.bio), sqlJsonb(buildCreatorRoleProfile(m)), ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("id") DO NOTHING;`);

  record("creator_profile", has("user", "creator_profile"), () => `INSERT INTO public."creator_profile" ("id", "userId", "displayName", "profile", "isVerifiedCreator", "createdAt", "updatedAt") VALUES\n  ${
    recipe.team.map((m) => `(${[sqlLiteral(`studio-cp-${m.divisionRole}`), sqlLiteral(m.id), sqlLiteral(m.name), sqlLiteral(m.bio), "TRUE", ts, ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("id") DO NOTHING;`);

  record("creator_series", has("user", "creator_series"), () => {
    const s = recipe.series;
    return `INSERT INTO public."creator_series" ("id", "userId", "author", "avatar", "title", "description", "tags", "status", "createdAt", "updatedAt") VALUES (${[
      sqlLiteral(s.id), sqlLiteral(s.userId), sqlLiteral(s.author), sqlLiteral(s.avatar), sqlLiteral(s.title), sqlLiteral(s.description), sqlJsonb(s.tags), sqlLiteral(s.status), ts, ts,
    ].join(", ")}) ON CONFLICT ("id") DO NOTHING;`;
  });

  record("creator_work", has("user", "creator_work"), () => `INSERT INTO public."creator_work" ("id", "userId", "title", "description", "cover", "tags", "format", "pages", "doc", "status", "views", "revision", "seriesId", "episodeNo", "createdAt", "updatedAt") VALUES\n  ${
    recipe.episodes.map((ep) => {
      const epSlices = recipe.cutSlices.filter((s) => s.episodeId === ep.id);
      const doc = {
        width: 800, packId: recipe.packId, artBibleId: recipe.artBible.id, totalCuts: ep.totalCuts,
        cutSlices: epSlices.map((s) => ({ id: s.id, cutStart: s.cutStart, cutEnd: s.cutEnd, assigneeUserId: s.assigneeUserId, status: s.status })),
        pagesList: [{ id: `${ep.id}-page-1`, canvasH: 1280, elements: [], groups: [] }],
      };
      return `(${[sqlLiteral(ep.id), sqlLiteral(recipe.series.userId), sqlLiteral(ep.title), sqlLiteral(ep.description), sqlLiteral(ep.cover), sqlJsonb(["스튜디오분업", "로컬시드", ep.pipelinePhase]), "'cuttoon'", sqlJsonb([]), sqlJsonb(doc), sqlLiteral(ep.status), sqlLiteral(ep.views), "1", sqlLiteral(recipe.series.id), sqlLiteral(ep.episodeNo), ts, ts].join(", ")})`;
    }).join(",\n  ")
  }\nON CONFLICT ("id") DO NOTHING;`);

  record("creator_work_revision", has("creator_work", "creator_work_revision"), () => [
    'INSERT INTO public."creator_work_revision" ("workId", "revision", "snapshot", "createdAt")',
    'SELECT w."id", w."revision", jsonb_build_object(',
    "  'titleId', w.\"titleId\", 'title', w.\"title\", 'description', COALESCE(w.\"description\", ''),",
    "  'cover', COALESCE(w.\"cover\", ''), 'tags', COALESCE(w.\"tags\", '[]'::jsonb),",
    "  'format', COALESCE(w.\"format\", 'cuttoon'), 'pages', COALESCE(w.\"pages\", '[]'::jsonb),",
    "  'doc', COALESCE(w.\"doc\", '{}'::jsonb), 'status', COALESCE(w.\"status\", 'draft'),",
    "  'seriesId', w.\"seriesId\", 'episodeNo', w.\"episodeNo\"",
    '), COALESCE(w."updatedAt", w."createdAt", CURRENT_TIMESTAMP)',
    `FROM public."creator_work" AS w WHERE w."id" IN (${recipe.episodes.map((ep) => sqlLiteral(ep.id)).join(", ")})`,
    'ON CONFLICT ("workId", "revision") DO NOTHING;',
  ].join("\n"));

  record("creator_work_collaborator", has("user", "creator_work", "creator_work_collaborator"), () => {
    const rows = recipe.episodes.flatMap((ep) => recipe.team.filter((m) => m.id !== recipe.series.userId).map((m) =>
      `(${[sqlLiteral(ep.id), sqlLiteral(m.id), sqlLiteral(m.workRole), "'active'", sqlLiteral(`inv-${ep.id}-${m.id}`), sqlLiteral(recipe.series.userId), ts, ts, ts].join(", ")})`));
    return `INSERT INTO public."creator_work_collaborator" ("workId", "userId", "role", "status", "invitationId", "invitedBy", "createdAt", "updatedAt", "respondedAt") VALUES\n  ${rows.join(",\n  ")}\nON CONFLICT ("workId", "userId") DO NOTHING;`;
  });

  record("creator_work_production_workspace", has("user", "creator_work", "creator_work_production_workspace"), () => `INSERT INTO public."creator_work_production_workspace" ("workId", "revision", "document", "updatedBy", "createdAt", "updatedAt") VALUES\n  ${
    recipe.episodes.map((ep) => `(${[sqlLiteral(ep.id), "1", sqlJsonb(buildProductionWorkspaceDocument(ep, recipe.cutSlices.filter((s) => s.episodeId === ep.id), recipe)), sqlLiteral("studio-pd"), ts, ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("workId") DO NOTHING;`);

  record("production_organization", has("user", "production_organization"), () => {
    const o = recipe.organization;
    return `INSERT INTO public."production_organization" ("id", "name", "kind", "description", "owner_user_id", "revision", "created_at", "updated_at") VALUES (${[sqlLiteral(o.id), sqlLiteral(o.name), sqlLiteral(o.kind), sqlLiteral(o.description), sqlLiteral(o.ownerUserId), "1", ts, ts].join(", ")}) ON CONFLICT ("id") DO NOTHING;`;
  });

  record("production_organization_member", has("user", "production_organization", "production_organization_member"), () => `INSERT INTO public."production_organization_member" ("organization_id", "user_id", "role", "joined_at") VALUES\n  ${
    recipe.team.map((m) => `(${[sqlLiteral(recipe.organization.id), sqlLiteral(m.id), sqlLiteral(m.orgRole), ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("organization_id", "user_id") DO NOTHING;`);

  record("production_project", has("user", "creator_work", "production_project"), () => `INSERT INTO public."production_project" ("id", "workId", "organizationId", "title", "collaborationModel", "modelVersion", "revision", "aggregate", "createdBy", "createdAt", "updatedAt") VALUES\n  ${
    recipe.episodes.map((ep) => `(${[sqlLiteral(ep.projectId), sqlLiteral(ep.id), sqlLiteral(recipe.organization.id), sqlLiteral(ep.title), "'studio-production'", "2", "1", sqlJsonb(buildProductionProjectAggregate(ep, recipe.cutSlices.filter((s) => s.episodeId === ep.id), recipe)), sqlLiteral("studio-pd"), ts, ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("id") DO NOTHING;`);

  record("production_team_workspace", has("user", "production_team_workspace"), () => {
    const w = recipe.teamWorkspace;
    return `INSERT INTO public."production_team_workspace" ("id", "name", "owner_user_id", "revision", "created_at", "updated_at") VALUES (${[sqlLiteral(w.id), sqlLiteral(w.name), sqlLiteral(w.ownerUserId), "1", ts, ts].join(", ")}) ON CONFLICT ("id") DO NOTHING;`;
  });

  record("production_team_member", has("user", "production_team_workspace", "production_team_member"), () => `INSERT INTO public."production_team_member" ("workspace_id", "user_id", "role", "joined_at") VALUES\n  ${
    recipe.team.map((m) => `(${[sqlLiteral(recipe.teamWorkspace.id), sqlLiteral(m.id), sqlLiteral(m.workspaceRole), ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("workspace_id", "user_id") DO NOTHING;`);

  record("production_team_project", has("user", "production_team_workspace", "production_project", "production_team_project"), () => `INSERT INTO public."production_team_project" ("project_id", "workspace_id", "linked_by", "linked_at") VALUES\n  ${
    recipe.episodes.map((ep) => `(${[sqlLiteral(ep.projectId), sqlLiteral(recipe.teamWorkspace.id), sqlLiteral("studio-pd"), ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("project_id") DO NOTHING;`);

  record("production_stage_gate", has("user", "production_project", "production_stage_gate"), () => `INSERT INTO public."production_stage_gate" ("id", "project_id", "episode_id", "stage_id", "lead_reviewer_id", "lead_reviewer_name", "revision", "created_at", "updated_at") VALUES\n  ${
    recipe.episodes.map((ep) => `(${[sqlLiteral(ep.stageGateId), sqlLiteral(ep.projectId), sqlLiteral(ep.id), sqlLiteral(ep.stageGateStage), sqlLiteral("studio-ad"), sqlLiteral("서윤아 AD"), "1", ts, ts].join(", ")})`).join(",\n  ")
  }\nON CONFLICT ("id") DO NOTHING;`);

  record("app_setting", has("app_setting"), () => `INSERT INTO public."app_setting" ("key", "value", "updatedAt") VALUES (${sqlLiteral(STUDIO_SEED_ART_BIBLE_SETTING_KEY)}, ${sqlJsonb(recipe.artBible)}, ${ts}) ON CONFLICT ("key") DO NOTHING;`);

  // Wave 7 신규 테이블이 존재하는 환경에서만 실제 컬럼을 확인해 안전 시드한다.
  record("production_cut_slice", has("production_project", "user", "production_cut_slice"), () => resolveOptionalCutSliceSql(recipe.cutSlices, tableColumns.get("production_cut_slice")), true);

  statements.push("COMMIT;");
  return { sql: `${statements.join("\n\n")}\n`, appliedTables, skippedTables, skippedOptionalTables };
}

function resolvePsqlBinary(postgresBinDir = null) {
  if (postgresBinDir && existsSync(join(postgresBinDir, "psql"))) return join(postgresBinDir, "psql");
  const envDir = process.env.POSTGRES_BIN_DIR?.trim();
  if (envDir && existsSync(join(envDir, "psql"))) return join(envDir, "psql");
  for (const dir of [...POSTGRES_CANDIDATE_DIRS, ...String(process.env.PATH ?? "").split(delimiter)]) {
    const trimmed = dir.trim();
    if (trimmed && existsSync(join(trimmed, "psql"))) return join(trimmed, "psql");
  }
  return "psql";
}

function runPsql(psqlBin, databaseUrl, args, { stdinText = "", timeoutMs = 30_000 } = {}) {
  const env = { PSQLRC: "/dev/null", LC_ALL: "C", LANG: "C" };
  for (const key of SAFE_HOST_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return new Promise((resolvePromise) => {
    const child = spawn(psqlBin, [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", ...args], { env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => { clearTimeout(timer); resolvePromise({ ok: false, stdout, stderr: String(error) }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ ok: !timedOut && code === 0, stdout, stderr: timedOut ? `${stderr}\n(timed out)` : stderr });
    });
    if (stdinText) child.stdin.write(stdinText);
    child.stdin.end();
  });
}

async function introspectPublicSchema(psqlBin, databaseUrl) {
  const query = [
    "SELECT json_build_object(",
    "  'tables', COALESCE((SELECT json_agg(tablename ORDER BY tablename) FROM pg_catalog.pg_tables WHERE schemaname = 'public'), '[]'::json),",
    "  'optionalColumns', COALESCE((SELECT json_object_agg(t.table_name, t.cols) FROM (",
    "    SELECT table_name, json_agg(column_name ORDER BY ordinal_position) AS cols FROM information_schema.columns",
    "    WHERE table_schema = 'public' AND table_name IN ('production_cut_slice', 'production_binary_lock', 'production_qa_inspection', 'production_royalty_ledger')",
    "    GROUP BY table_name",
    "  ) AS t), '{}'::json)",
    ")::text;",
  ].join("\n");
  const result = await runPsql(psqlBin, databaseUrl, ["-Atq", "-c", query]);
  if (!result.ok) throw new Error(`로컬 DB 테이블 목록 조회 실패: ${result.stderr.slice(0, 500)}`);
  const parsed = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1) ?? "{}");
  const existingTables = new Set(Array.isArray(parsed.tables) ? parsed.tables : []);
  const tableColumns = new Map();
  for (const [tableName, cols] of Object.entries(parsed.optionalColumns ?? {})) {
    if (Array.isArray(cols)) tableColumns.set(tableName, new Set(cols));
  }
  return { existingTables, tableColumns };
}

export async function applyStudioSeedPack(
  databaseUrl,
  { managedDisposable = false, environmentDatabaseUrl = "", postgresBinDir = null, log = (msg) => process.stderr.write(`${msg}\n`) } = {},
) {
  assertLocalStudioSeedAllowed({ databaseUrl, managedDisposable, environmentDatabaseUrl });
  const psqlBin = resolvePsqlBinary(postgresBinDir);
  const recipe = buildStudioSeedPackRecipe();
  const { existingTables, tableColumns } = await introspectPublicSchema(psqlBin, databaseUrl);
  const compiled = buildStudioSeedPackSql(recipe, { existingTables, tableColumns });

  log(`[studio-seed] 6인 분업 스튜디오 시드 팩 적용 중 (${redactStudioDatabaseUrl(databaseUrl)}, 테이블 ${compiled.appliedTables.length}개)…`);
  const applied = await runPsql(psqlBin, databaseUrl, ["-q"], { stdinText: compiled.sql, timeoutMs: 60_000 });
  if (!applied.ok) throw new Error(`6인 분업 스튜디오 시드 팩 적용 실패:\n${applied.stderr.slice(0, 1000)}`);

  return {
    ok: true, packId: recipe.packId, teamMemberIds: STUDIO_SEED_TEAM_IDS,
    episodeIds: recipe.episodes.map((ep) => ep.id), cutSliceCount: recipe.cutSlices.length,
    artBibleId: recipe.artBible.id, appliedTables: compiled.appliedTables,
    skippedTables: compiled.skippedTables, skippedOptionalTables: compiled.skippedOptionalTables,
  };
}

/** 6인 팀·3화·컷 슬라이스(9건)·아트바이블·기존 seed.ts 공존 정합성을 실측 조회한다. */
export async function verifyStudioSeedPackIntegrity(databaseUrl, { postgresBinDir = null } = {}) {
  if (isRemoteStudioDatabaseUrl(databaseUrl)) throw new Error("원격 DB에는 6인 스튜디오 시드 정합성 쿼리를 실행할 수 없습니다.");
  const psqlBin = resolvePsqlBinary(postgresBinDir);
  const teamIdsSql = STUDIO_SEED_TEAM_IDS.map((id) => sqlLiteral(id)).join(", ");
  const epIdsSql = ["studio-ep-1", "studio-ep-2", "studio-ep-3"].map((id) => sqlLiteral(id)).join(", ");
  const query = [
    "SELECT json_build_object(",
    `  'teamUserIds', COALESCE((SELECT json_agg("id" ORDER BY "id") FROM public."user" WHERE "id" IN (${teamIdsSql})), '[]'::json),`,
    `  'episodeIds', COALESCE((SELECT json_agg("id" ORDER BY "episodeNo") FROM public."creator_work" WHERE "id" IN (${epIdsSql})), '[]'::json),`,
    `  'revisionCount', (SELECT count(*)::integer FROM public."creator_work_revision" WHERE "workId" IN (${epIdsSql})),`,
    `  'collaboratorCount', (SELECT count(*)::integer FROM public."creator_work_collaborator" WHERE "workId" IN (${epIdsSql})),`,
    `  'workspaceCount', (SELECT count(*)::integer FROM public."creator_work_production_workspace" WHERE "workId" IN (${epIdsSql})),`,
    `  'embeddedSliceCount', COALESCE((SELECT sum(jsonb_array_length("document"->'cutSlices'))::integer FROM public."creator_work_production_workspace" WHERE "workId" IN (${epIdsSql})), 0),`,
    `  'artBibleTokenCount', COALESCE((SELECT jsonb_array_length("value"->'paletteTokens')::integer FROM public."app_setting" WHERE "key" = ${sqlLiteral(STUDIO_SEED_ART_BIBLE_SETTING_KEY)}), 0),`,
    "  'baseSeedCoexists', ((SELECT count(*) FROM public.\"user\" WHERE \"id\" = 'seed-tester') > 0 AND (SELECT count(*) FROM public.\"creator_work\" WHERE \"id\" = 'seed-work-1') > 0)",
    ")::text;",
  ].join("\n");
  const result = await runPsql(psqlBin, databaseUrl, ["-Atq", "-c", query]);
  if (!result.ok) throw new Error(`6인 스튜디오 시드 정합성 조회 실패: ${result.stderr.slice(0, 500)}`);
  const snapshot = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1) ?? "{}");
  const failures = [];
  const missingMembers = STUDIO_SEED_TEAM_IDS.filter((id) => !(snapshot.teamUserIds ?? []).includes(id));
  if (missingMembers.length > 0) failures.push(`누락된 6인 팀 계정: ${missingMembers.join(", ")}`);
  if ((snapshot.episodeIds ?? []).length !== 3) failures.push(`샘플 회차 수 불일치: ${String((snapshot.episodeIds ?? []).length)}`);
  if (snapshot.revisionCount !== 3) failures.push(`회차 리비전 불변식 미충족: ${String(snapshot.revisionCount)}`);
  if (snapshot.collaboratorCount !== 15) failures.push(`협업 멤버십 수 불일치: ${String(snapshot.collaboratorCount)}`);
  if (snapshot.workspaceCount !== 3 || snapshot.embeddedSliceCount !== 9) {
    failures.push(`컷 슬라이스 정합성 미충족: workspaces=${String(snapshot.workspaceCount)}, slices=${String(snapshot.embeddedSliceCount)}`);
  }
  if (snapshot.artBibleTokenCount < 5) failures.push(`아트바이블 팔레트 토큰 부족: ${String(snapshot.artBibleTokenCount)}`);
  if (!snapshot.baseSeedCoexists) failures.push("기존 seed.ts 데이터(seed-tester, seed-work-1)와 공존하지 않습니다.");
  return { ok: failures.length === 0, failures, ...snapshot };
}

function printCliHelp() {
  process.stdout.write([
    "사용법: node scripts/local-studio-seed-pack.mjs [--dry-run] [--json] [--help]", "",
    "  6인 분업 스튜디오(PD·AD·선화·채색·3D배경·식자) + 샘플 3화·컷 슬라이스·아트바이블 시드 레시피를 출력한다.",
    "  실제 DB 적용은 local-test-stack.mjs / verify-local-full-stack.mjs가 관리하는 127.0.0.1 일회용 DB에서만 허용한다.", "",
  ].join("\n"));
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { printCliHelp(); process.exit(0); }
  const recipe = buildStudioSeedPackRecipe();
  process.stdout.write(`${JSON.stringify({
    ok: true, packId: recipe.packId, teamCount: recipe.team.length, teamIds: STUDIO_SEED_TEAM_IDS,
    episodeCount: recipe.episodes.length, cutSliceCount: recipe.cutSlices.length,
    artBibleId: recipe.artBible.id, paletteTokenCount: recipe.artBible.paletteTokens.length,
  }, null, 2)}\n`);
}
