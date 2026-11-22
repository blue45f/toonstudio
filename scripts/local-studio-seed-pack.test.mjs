import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");
import { fileURLToPath } from "node:url";

import {
  assertLocalStudioSeedAllowed,
  buildStudioSeedPackRecipe,
  buildStudioSeedPackSql,
  isRemoteStudioDatabaseUrl,
  redactStudioDatabaseUrl,
  STUDIO_SEED_ART_BIBLE_SETTING_KEY,
  STUDIO_SEED_SERIES_ID,
  STUDIO_SEED_TEAM_IDS,
  validateCutSlicePartition,
} from "./local-studio-seed-pack.mjs";

const SEED_PACK_PATH = fileURLToPath(new URL("./local-studio-seed-pack.mjs", import.meta.url));

describe("local-studio-seed-pack fail-closed guards", () => {
  it("원격 URL·호스트 우회 쿼리·외부 DATABASE_URL을 fail-closed로 차단한다", () => {
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://postgres:pw@127.0.0.1:55439/postgres"), false);
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://postgres:pw@localhost:55439/postgres"), false);
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://postgres:pw@[::1]:55439/postgres"), false);
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://u:p@ep-prod.neon.tech/neondb"), true);
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://u:p@db.onpod.ai:5432/prod"), true);
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://u:p@127.0.0.1:55439/postgres?host=db.onpod.ai"), true);
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://u:p@127.0.0.1:55439/postgres?hostaddr=10.0.0.2"), true);
    assert.equal(isRemoteStudioDatabaseUrl("postgresql://u:p@127.0.0.1:55439/postgres?service=prod"), true);

    assert.doesNotThrow(() =>
      assertLocalStudioSeedAllowed({
        databaseUrl: "postgresql://postgres:pw@127.0.0.1:55439/postgres",
        managedDisposable: true,
        environmentDatabaseUrl: "",
      }),
    );

    assert.throws(
      () =>
        assertLocalStudioSeedAllowed({
          databaseUrl: "postgresql://postgres:pw@127.0.0.1:55439/postgres",
          managedDisposable: true,
          environmentDatabaseUrl: "postgresql://u:p@db.onpod.ai:5432/prod",
        }),
      /원격 DATABASE_URL/,
    );

    assert.throws(
      () =>
        assertLocalStudioSeedAllowed({
          databaseUrl: "postgresql://postgres:pw@127.0.0.1:55439/postgres",
          managedDisposable: true,
          environmentDatabaseUrl: "postgresql://postgres:pw@127.0.0.1:5432/custom",
        }),
      /외부 DATABASE_URL/,
    );

    assert.throws(
      () =>
        assertLocalStudioSeedAllowed({
          databaseUrl: "postgresql://postgres:pw@127.0.0.1:55439/postgres",
          managedDisposable: false,
          environmentDatabaseUrl: "",
        }),
      /관리되는 로컬 일회용 DB/,
    );

    assert.throws(
      () =>
        assertLocalStudioSeedAllowed({
          databaseUrl: "postgresql://u:p@ep-prod.neon.tech/neondb",
          managedDisposable: true,
          environmentDatabaseUrl: "",
        }),
      /loopback/,
    );

    // secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- synthetic loopback fixture verifying credential redaction
    const masked = redactStudioDatabaseUrl("postgresql://pguser:s3cret@127.0.0.1:55439/postgres?sslmode=disable");
    assert.ok(!masked.includes("s3cret"), masked);
    assert.ok(!masked.includes("pguser"), masked);
    assert.ok(masked.includes("127.0.0.1:55439"), masked);
  });
});

describe("local-studio-seed-pack recipe & SQL generation", () => {
  it("6인 분업 팀·샘플 3화·9개 컷 슬라이스·아트바이블 레시피를 결정적으로 생성한다", () => {
    const recipe = buildStudioSeedPackRecipe();
    assert.deepEqual(STUDIO_SEED_TEAM_IDS, [
      "studio-pd",
      "studio-ad",
      "studio-line",
      "studio-color",
      "studio-bg3d",
      "studio-letterer",
    ]);
    assert.equal(recipe.team.length, 6);
    assert.equal(recipe.series.id, STUDIO_SEED_SERIES_ID);
    assert.equal(recipe.episodes.length, 3);
    assert.equal(recipe.cutSlices.length, 9);
    assert.equal(recipe.artBible.paletteTokens.length, 5);
    assert.equal(recipe.artBible.rightsBomPolicy.allowNonCommercial, false);
    assert.equal(recipe.artBible.rightsBomPolicy.allowGpl, false);

    // 기존 seed.ts ID와 0건 충돌 보장
    const existingSeedIds = new Set(["seed-admin", "seed-tester", "seed-creator", "seed-user-001", "seed-work-1", "seed-work-2", "seed-work-3"]);
    for (const member of recipe.team) assert.equal(existingSeedIds.has(member.id), false);
    for (const ep of recipe.episodes) assert.equal(existingSeedIds.has(ep.id), false);

    const partition = validateCutSlicePartition(recipe.cutSlices, 75);
    assert.equal(partition.ok, true, partition.failures.join("; "));
    assert.equal(partition.episodeCount, 3);
    assert.equal(partition.sliceCount, 9);
  });

  it("컷 슬라이스 겹침·누락을 탐지한다", () => {
    const overlapping = validateCutSlicePartition([
      { id: "s1", episodeId: "ep1", cutStart: 1, cutEnd: 30 },
      { id: "s2", episodeId: "ep1", cutStart: 25, cutEnd: 75 },
    ], 75);
    assert.equal(overlapping.ok, false);
    assert.ok(overlapping.failures.some((msg) => msg.includes("겹침")));

    const gapped = validateCutSlicePartition([
      { id: "s1", episodeId: "ep1", cutStart: 1, cutEnd: 20 },
      { id: "s2", episodeId: "ep1", cutStart: 30, cutEnd: 75 },
    ], 75);
    assert.equal(gapped.ok, false);
    assert.ok(gapped.failures.some((msg) => msg.includes("누락")));
  });

  it("실제 테이블 존재 여부에 따라 멱등 SQL을 안전하게 조립하고 선택 테이블을 분기 처리한다", () => {
    const recipe = buildStudioSeedPackRecipe();
    const coreTables = new Set([
      "user",
      "creator_profile",
      "creator_series",
      "creator_work",
      "creator_work_revision",
      "creator_work_collaborator",
      "creator_work_production_workspace",
      "production_organization",
      "production_organization_member",
      "production_project",
      "production_team_workspace",
      "production_team_member",
      "production_team_project",
      "production_stage_gate",
      "app_setting",
    ]);

    const withoutWave7 = buildStudioSeedPackSql(recipe, { existingTables: coreTables });
    assert.equal(withoutWave7.appliedTables.length, 15);
    assert.deepEqual(withoutWave7.skippedTables, []);
    assert.deepEqual(withoutWave7.skippedOptionalTables, ["production_cut_slice"]);
    assert.match(withoutWave7.sql, /ON CONFLICT \("id"\) DO NOTHING/u);
    assert.ok(withoutWave7.sql.includes(STUDIO_SEED_ART_BIBLE_SETTING_KEY));
    assert.ok(!withoutWave7.sql.includes('INSERT INTO public."production_cut_slice"'));

    // Wave 7 production_cut_slice 테이블이 존재하는 경우(snake_case) 자동 포함
    const withWave7Snake = buildStudioSeedPackSql(recipe, {
      existingTables: new Set([...coreTables, "production_cut_slice"]),
      tableColumns: new Map([
        ["production_cut_slice", new Set([
          "id", "project_id", "episode_id", "stage_code", "cut_start", "cut_end",
          "allowed_folders", "assignee_user_id", "status", "lease_expires_at", "latest_rev_hash", "due_at",
        ])],
      ]),
    });
    assert.ok(withWave7Snake.appliedTables.includes("production_cut_slice"));
    assert.deepEqual(withWave7Snake.skippedOptionalTables, []);
    assert.ok(withWave7Snake.sql.includes('INSERT INTO public."production_cut_slice"'));

    // 최소 테이블만 있는 부분 스키마에서도 FK 오류 없이 안전 동작
    const minimal = buildStudioSeedPackSql(recipe, { existingTables: new Set(["user", "app_setting"]) });
    assert.deepEqual(minimal.appliedTables, ["user", "app_setting"]);
    assert.ok(minimal.skippedTables.includes("creator_work"));
  });

  it("CLI --help 및 레시피 요약 JSON 출력이 exit 0으로 동작한다", () => {
    const help = spawnSync(process.execPath, [SEED_PACK_PATH, "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /6인 분업 스튜디오/u);

    const summary = spawnSync(process.execPath, [SEED_PACK_PATH, "--json"], { encoding: "utf8" });
    assert.equal(summary.status, 0, summary.stderr);
    const parsed = JSON.parse(summary.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.teamCount, 6);
    assert.equal(parsed.episodeCount, 3);
    assert.equal(parsed.cutSliceCount, 9);
  });
});
