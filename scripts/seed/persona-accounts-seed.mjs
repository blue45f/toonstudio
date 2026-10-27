#!/usr/bin/env node
/**
 * 오픈 전 초기 콘텐츠 생성 및 실사용 검증용 일반 유저·창작자 계정 프로비저닝 스크립트.
 *
 * 특징:
 * - 공개 프로필·이메일·소개글·역할 설정 어디에도 테스트/데모/시드 계정 티가 나지 않는
 *   12명의 유기적 일반 유저·창작자 계정을 생성/갱신한다.
 * - admin_member_test_accounts 테이블에 등록하지 않으며(혹시 존재하면 제거),
 *   일반 가입자와 동일한 상태(role='user', status='active', emailVerified 설정)로 유지한다.
 * - 비밀번호는 apps/api/src/server/password.ts 와 동일한 scrypt v2 포맷으로 해싱하며,
 *   평문 비밀번호는 로컬 전용 env 파일(권한 0600)에만 기록하고 콘솔/로그에 절대 출력하지 않는다.
 *
 * 사용법:
 *   node scripts/seed/persona-accounts-seed.mjs --dry-run
 *   node scripts/seed/persona-accounts-seed.mjs --prepare-env --target-env .env.test-accounts.local
 *   node scripts/seed/persona-accounts-seed.mjs --apply --target-env .env.test-accounts.local
 *   node scripts/seed/persona-accounts-seed.mjs --verify-login https://www.toonstudio.cloud
 */

import { randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  DEFAULT_KR_REGION_SETTINGS,
  FORBIDDEN_TEST_GIVEAWAY_PATTERNS,
  ORGANIC_PERSONA_ACCOUNTS,
} from "./persona-accounts-catalog.mjs";

const scrypt = promisify(scryptCallback);

const SCRYPT_PREFIX = "scrypt";
const SCRYPT_VERSION = "v2";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 32 * 1024 * 1024;

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

const VALID_AVATAR_PRESETS = new Set([
  "preset:slate", "preset:rose", "preset:orange", "preset:amber",
  "preset:emerald", "preset:teal", "preset:cyan", "preset:sky",
  "preset:indigo", "preset:violet", "preset:fuchsia", "preset:lime",
]);
const VALID_CREATOR_ROLES = new Set([
  "creator", "story", "storyboard", "line-art", "background", "three-d",
  "color", "character", "lettering", "editor", "assistant", "producer",
  "planner", "reviewer", "educator", "localization",
]);
const VALID_CREATOR_STAGES = new Set([
  "exploring", "aspiring", "hobbyist", "active_creator", "professional", "team_lead", "studio", "educator",
]);
const VALID_COLLABORATION_MODES = new Set([
  "solo", "small_team", "studio_team", "client_work", "education",
]);
const VALID_PREFERRED_TOOLS = new Set([
  "brush", "pen", "3d-stage", "pose", "script", "storyboard", "balloon",
  "tone", "color-grade", "filter", "template", "asset-pack", "collab-review", "publish",
]);
const VALID_PREFERRED_ASSET_KINDS = new Set([
  "brush", "3d-asset", "3d-preset", "palette", "filter", "template", "asset",
]);
const VALID_CREATOR_LEVELS = new Set(["new", "verified", "active", "trusted", "professional", "partner"]);
const VALID_TRUST_LEVELS = new Set(["new", "verified", "trusted", "restricted"]);
const VALID_SELLER_LEVELS = new Set(["none", "starter", "verified", "professional"]);
const VALID_PLAN_IDS = new Set(["free", "creator", "pro", "team"]);

export function passwordPolicyError(password) {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (password.trim().length === 0) {
    return "Password must not be blank";
  }
  return null;
}

export function isValidSignupEmail(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 254) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 32 || code === 127) return false;
  }
  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return false;
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (!local || !domain || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => label.length > 0);
}

export async function hashPasswordV2(password) {
  const policyError = passwordPolicyError(password);
  if (policyError) throw new Error(policyError);
  const normalized = password.normalize("NFKC");
  const salt = randomBytes(16);
  const derivedKey = await scrypt(normalized, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  });
  return [
    SCRYPT_PREFIX, SCRYPT_VERSION, String(SCRYPT_N), String(SCRYPT_R),
    String(SCRYPT_P), String(SCRYPT_KEYLEN),
    salt.toString("base64url"), Buffer.from(derivedKey).toString("base64url"),
  ].join("$");
}

export async function verifyPasswordV2(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") return false;
  const parts = storedHash.split("$");
  if (parts.length !== 8 || parts[0] !== SCRYPT_PREFIX || parts[1] !== SCRYPT_VERSION) return false;
  const n = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  const keylen = Number(parts[5]);
  const salt = Buffer.from(parts[6], "base64url");
  const expected = Buffer.from(parts[7], "base64url");
  if (expected.length !== keylen) return false;
  const derivedKey = await scrypt(password.normalize("NFKC"), salt, keylen, {
    N: n, r, p, maxmem: SCRYPT_MAXMEM,
  });
  return timingSafeEqual(Buffer.from(derivedKey), expected);
}

export function generateStrongOrganicPassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#%^&*-_=+";
  const all = upper + lower + digits + symbols;
  const chars = [
    upper[randomInt(upper.length)],
    lower[randomInt(lower.length)],
    digits[randomInt(digits.length)],
    symbols[randomInt(symbols.length)],
  ];
  for (let i = chars.length; i < 24; i += 1) {
    chars.push(all[randomInt(all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join("");
}

export function containsTestGiveaway(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  return FORBIDDEN_TEST_GIVEAWAY_PATTERNS.some((pattern) => pattern.test(text));
}

export function validatePersonaCatalog(personas = ORGANIC_PERSONA_ACCOUNTS) {
  if (!Array.isArray(personas) || personas.length === 0) {
    throw new Error("Persona catalog must be a non-empty array");
  }
  const seenIds = new Set();
  const seenSlugs = new Set();
  const seenNames = new Set();
  const seenEmails = new Set();

  for (const persona of personas) {
    if (!persona.id || seenIds.has(persona.id)) {
      throw new Error(`Duplicate or missing persona id: ${persona.id}`);
    }
    seenIds.add(persona.id);
    if (!/^[A-Z0-9_]+$/.test(persona.slug) || seenSlugs.has(persona.slug)) {
      throw new Error(`Invalid or duplicate persona slug: ${persona.slug}`);
    }
    seenSlugs.add(persona.slug);
    if (!persona.name || seenNames.has(persona.name)) {
      throw new Error(`Duplicate or missing persona name: ${persona.name}`);
    }
    seenNames.add(persona.name);
    const normalizedEmail = String(persona.email ?? "").trim().toLowerCase();
    if (!isValidSignupEmail(normalizedEmail) || seenEmails.has(normalizedEmail)) {
      throw new Error(`Invalid or duplicate persona email for ${persona.slug}`);
    }
    seenEmails.add(normalizedEmail);
    if (!VALID_AVATAR_PRESETS.has(persona.avatar)) {
      throw new Error(`Invalid avatar preset for ${persona.slug}: ${persona.avatar}`);
    }
    if (!VALID_PLAN_IDS.has(persona.planId)) {
      throw new Error(`Invalid planId for ${persona.slug}: ${persona.planId}`);
    }

    const inspectStrings = [
      persona.name, persona.email, persona.bio,
      ...(persona.creatorRoleProfile?.customTags ?? []),
      persona.creatorProfile?.title ?? "",
      persona.creatorProfile?.summary ?? "",
      persona.creatorProfile?.supportMessage ?? "",
    ];
    for (const candidate of inspectStrings) {
      if (containsTestGiveaway(candidate)) {
        throw new Error(`Persona ${persona.slug} contains forbidden test-account giveaway text`);
      }
    }

    const roleProfile = persona.creatorRoleProfile;
    if (!roleProfile || (roleProfile.version !== 1 && roleProfile.version !== 2)) {
      throw new Error(`Invalid creatorRoleProfile version for ${persona.slug}`);
    }
    if (roleProfile.primaryRole !== null && !VALID_CREATOR_ROLES.has(roleProfile.primaryRole)) {
      throw new Error(`Invalid primaryRole for ${persona.slug}: ${roleProfile.primaryRole}`);
    }
    if (roleProfile.primaryRole === null && roleProfile.roleVisibility !== false) {
      throw new Error(`Reader persona ${persona.slug} must have roleVisibility=false`);
    }
    for (const secondary of roleProfile.secondaryRoles ?? []) {
      if (!VALID_CREATOR_ROLES.has(secondary) || secondary === roleProfile.primaryRole) {
        throw new Error(`Invalid secondaryRole ${secondary} for ${persona.slug}`);
      }
    }
    if (roleProfile.creatorStage !== null && !VALID_CREATOR_STAGES.has(roleProfile.creatorStage)) {
      throw new Error(`Invalid creatorStage for ${persona.slug}: ${roleProfile.creatorStage}`);
    }
    if (
      roleProfile.collaborationMode !== undefined &&
      roleProfile.collaborationMode !== null &&
      !VALID_COLLABORATION_MODES.has(roleProfile.collaborationMode)
    ) {
      throw new Error(`Invalid collaborationMode for ${persona.slug}: ${roleProfile.collaborationMode}`);
    }
    for (const tool of roleProfile.preferredTools ?? []) {
      if (!VALID_PREFERRED_TOOLS.has(tool)) throw new Error(`Invalid preferredTool ${tool} for ${persona.slug}`);
    }
    for (const kind of roleProfile.preferredAssetKinds ?? []) {
      if (!VALID_PREFERRED_ASSET_KINDS.has(kind)) {
        throw new Error(`Invalid preferredAssetKind ${kind} for ${persona.slug}`);
      }
    }

    const level = persona.memberLevel;
    if (
      !level || !VALID_CREATOR_LEVELS.has(level.creatorLevel) ||
      !VALID_TRUST_LEVELS.has(level.trustLevel) || !VALID_SELLER_LEVELS.has(level.sellerLevel) ||
      typeof level.trustScore !== "number" || level.trustScore < 0 || level.trustScore > 1000
    ) {
      throw new Error(`Invalid memberLevel configuration for ${persona.slug}`);
    }
  }
  return true;
}

export function parseEnvContent(content) {
  const map = new Map();
  if (typeof content !== "string") return map;
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

const MANAGED_BLOCK_START = "# >>> TOONSTUDIO_ORGANIC_USER_ACCOUNTS_START >>>";
const MANAGED_BLOCK_END = "# <<< TOONSTUDIO_ORGANIC_USER_ACCOUNTS_END <<<";

export function buildManagedEnvSection(personas, passwordBySlug) {
  const lines = [
    MANAGED_BLOCK_START,
    "# 오픈 전 초기 콘텐츠 작성 및 실사용 검증용 일반 유저·창작자 계정 (로컬 전용, 커밋 금지)",
    `TOONSTUDIO_ORGANIC_ACCOUNTS_COUNT="${personas.length}"`,
    `TOONSTUDIO_ORGANIC_ACCOUNTS_SLUGS="${personas.map((p) => p.slug).join(",")}"`,
  ];

  const primaryCreator = personas.find((p) => p.slug === "SOLO_CREATOR") ?? personas[0];
  const marketCreator = personas.find((p) => p.slug === "BG3D_ARTIST") ?? personas[0];
  const primaryReader = personas.find((p) => p.slug === "READER_CRITIC") ?? personas[personas.length - 1];

  if (primaryCreator) {
    lines.push(
      `TOONSTUDIO_SEED_CREATOR_ID="${primaryCreator.id}"`,
      `TOONSTUDIO_SEED_CREATOR_NAME="${primaryCreator.name}"`,
      `TOONSTUDIO_SEED_CREATOR_EMAIL="${primaryCreator.email}"`,
      `TOONSTUDIO_SEED_CREATOR_PASSWORD="${passwordBySlug.get(primaryCreator.slug)}"`,
    );
  }
  if (primaryReader) {
    lines.push(
      `TOONSTUDIO_SEED_READER_ID="${primaryReader.id}"`,
      `TOONSTUDIO_SEED_READER_NAME="${primaryReader.name}"`,
      `TOONSTUDIO_SEED_READER_EMAIL="${primaryReader.email}"`,
      `TOONSTUDIO_SEED_READER_PASSWORD="${passwordBySlug.get(primaryReader.slug)}"`,
    );
  }
  if (marketCreator) {
    lines.push(
      `TOONSPECTRUM_MARKET_SEED_NAME="${marketCreator.name}"`,
      `TOONSPECTRUM_MARKET_SEED_EMAIL="${marketCreator.email}"`,
      `TOONSPECTRUM_MARKET_SEED_PASSWORD="${passwordBySlug.get(marketCreator.slug)}"`,
    );
  }

  for (const persona of personas) {
    const prefix = `TOONSTUDIO_ACCOUNT_${persona.slug}`;
    const pwd = passwordBySlug.get(persona.slug);
    const primaryRole = persona.creatorRoleProfile.primaryRole ?? "reader";
    lines.push(
      `# [${persona.slug}] ${persona.name} — ${persona.personaLabel} (${persona.contentUseCase})`,
      `${prefix}_ID="${persona.id}"`,
      `${prefix}_NAME="${persona.name}"`,
      `${prefix}_EMAIL="${persona.email}"`,
      `${prefix}_PASSWORD="${pwd}"`,
      `${prefix}_ROLE="${primaryRole}"`,
      `${prefix}_PLAN="${persona.planId}"`,
    );
  }
  lines.push(MANAGED_BLOCK_END);
  return lines.join("\n");
}

export function upsertManagedEnvBlock(existingContent, managedSection) {
  const normalized = typeof existingContent === "string" ? existingContent : "";
  const startIdx = normalized.indexOf(MANAGED_BLOCK_START);
  const endIdx = normalized.indexOf(MANAGED_BLOCK_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = normalized.slice(0, startIdx).replace(/\s*$/u, "");
    const after = normalized.slice(endIdx + MANAGED_BLOCK_END.length).replace(/^\s*/u, "");
    const parts = [before, managedSection, after].filter((part) => part.length > 0);
    return `${parts.join("\n\n")}\n`;
  }
  const trimmed = normalized.replace(/\s*$/u, "");
  return trimmed.length > 0 ? `${trimmed}\n\n${managedSection}\n` : `${managedSection}\n`;
}

export function resolveOrGeneratePersonaPasswords(personas = ORGANIC_PERSONA_ACCOUNTS, existingEnvFiles = []) {
  const existingVars = new Map();
  for (const envFile of existingEnvFiles) {
    if (existsSync(envFile)) {
      const parsed = parseEnvContent(readFileSync(envFile, "utf8"));
      for (const [k, v] of parsed.entries()) {
        if (!existingVars.has(k) && v) existingVars.set(k, v);
      }
    }
  }
  const passwordBySlug = new Map();
  for (const persona of personas) {
    const key = `TOONSTUDIO_ACCOUNT_${persona.slug}_PASSWORD`;
    const existing = existingVars.get(key);
    if (existing && passwordPolicyError(existing) === null) {
      passwordBySlug.set(persona.slug, existing);
    } else {
      passwordBySlug.set(persona.slug, generateStrongOrganicPassword());
    }
  }
  return passwordBySlug;
}

export function syncLocalAccountEnvFiles({ personas = ORGANIC_PERSONA_ACCOUNTS, envFiles = [], passwordBySlug = null }) {
  validatePersonaCatalog(personas);
  const resolvedPasswords = passwordBySlug ?? resolveOrGeneratePersonaPasswords(personas, envFiles);
  for (const persona of personas) {
    const err = passwordPolicyError(resolvedPasswords.get(persona.slug));
    if (err) throw new Error(`Invalid password for ${persona.slug}: ${err}`);
  }
  const managedSection = buildManagedEnvSection(personas, resolvedPasswords);
  const updatedFiles = [];
  for (const targetPath of envFiles) {
    const absPath = path.resolve(targetPath);
    const existing = existsSync(absPath) ? readFileSync(absPath, "utf8") : "";
    const nextContent = upsertManagedEnvBlock(existing, managedSection);
    writeFileSync(absPath, nextContent, { encoding: "utf8", mode: 0o600 });
    chmodSync(absPath, 0o600);
    if ((statSync(absPath).mode & 0o777) !== 0o600) {
      throw new Error(`Failed to enforce 0600 permissions on ${absPath}`);
    }
    updatedFiles.push(absPath);
  }
  return { updatedFiles, passwordBySlug: resolvedPasswords };
}

export async function buildPersonaSeedPayloads(personas = ORGANIC_PERSONA_ACCOUNTS, passwordBySlug) {
  validatePersonaCatalog(personas);
  const payloads = [];
  for (const persona of personas) {
    const password = passwordBySlug.get(persona.slug);
    if (!password) throw new Error(`Missing password for persona ${persona.slug}`);
    const passwordHash = await hashPasswordV2(password);
    payloads.push({
      ...persona,
      passwordHash,
      regionSettings: { ...DEFAULT_KR_REGION_SETTINGS, updatedAt: persona.creatorRoleProfile.updatedAt },
    });
  }
  return payloads;
}

async function ensureWalletWelcomeGrant(client, { userId, asset, amount, reason, createdAt }) {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  const idempotencyKey = `organic_welcome_grant:${userId}:${asset}`;
  const existingLedger = await client.query(
    `SELECT id FROM public.wallet_ledger_entry WHERE "idempotencyKey" = $1 LIMIT 1`,
    [idempotencyKey],
  );
  if (existingLedger.rowCount && existingLedger.rowCount > 0) return false;

  const accountRes = await client.query(
    `INSERT INTO public.wallet_account (
      "userId", "asset", "availableBalance", "reservedBalance",
      "lifetimeGranted", "lifetimePurchased", "lifetimeSpent", "lifetimeExpired", "createdAt", "updatedAt"
    ) VALUES ($1, $2, $3, 0, $3, 0, 0, 0, $4::timestamptz, $4::timestamptz)
    ON CONFLICT ("userId", "asset") DO UPDATE SET
      "availableBalance" = public.wallet_account."availableBalance" + EXCLUDED."availableBalance",
      "lifetimeGranted" = public.wallet_account."lifetimeGranted" + EXCLUDED."lifetimeGranted",
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "availableBalance"`,
    [userId, asset, amount, createdAt],
  );
  const balanceAfter = Number(accountRes.rows[0]?.availableBalance ?? amount);

  const lotRes = await client.query(
    `INSERT INTO public.wallet_lot (
      "userId", "asset", "sourceType", "sourceId", "originalAmount", "remainingAmount",
      "expiresAt", "metadata", "createdAt", "updatedAt"
    ) VALUES ($1, $2, 'welcome_grant', $3, $4, $4, NULL, $5::jsonb, $6::timestamptz, $6::timestamptz)
    RETURNING id`,
    [userId, asset, idempotencyKey, amount, JSON.stringify({ channel: "onboarding", organicInit: true }), createdAt],
  );
  const lotId = lotRes.rows[0]?.id ?? null;

  await client.query(
    `INSERT INTO public.wallet_ledger_entry (
      "userId", "asset", "entryType", "delta", "balanceAfter", "lotId",
      "referenceType", "referenceId", "idempotencyKey", "reason", "actorId", "metadata", "createdAt"
    ) VALUES ($1, $2, 'grant', $3, $4, $5, 'onboarding', $6, $7, $8, NULL, $9::jsonb, $10::timestamptz)`,
    [
      userId, asset, amount, balanceAfter, lotId, `welcome:${userId}`,
      idempotencyKey, reason, JSON.stringify({ channel: "onboarding" }), createdAt,
    ],
  );
  return true;
}

export async function seedPersonaAccounts(client, payloads, { dryRun = false } = {}) {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw new Error("seedPersonaAccounts requires non-empty payloads");
  }
  if (dryRun) {
    return {
      dryRun: true,
      totalPersonas: payloads.length,
      creatorProfilesPlanned: payloads.filter((p) => p.creatorProfile !== null).length,
      readerProfilesPlanned: payloads.filter((p) => p.creatorProfile === null).length,
      slugs: payloads.map((p) => p.slug),
    };
  }

  const results = [];
  await client.query("BEGIN");
  try {
    for (const payload of payloads) {
      const existingUser = await client.query(
        `SELECT id FROM public."user" WHERE lower(btrim(email)) = lower(btrim($1)) OR id = $2 LIMIT 1`,
        [payload.email, payload.id],
      );

      let userId = payload.id;
      if (existingUser.rowCount && existingUser.rowCount > 0) {
        userId = existingUser.rows[0].id;
        await client.query(
          `UPDATE public."user" SET
             name = $2, email = lower(btrim($3)),
             "emailVerified" = COALESCE("emailVerified", $4::timestamptz),
             "passwordHash" = $5, avatar = $6, bio = $7,
             role = 'user', status = 'active',
             "suspendedUntil" = NULL, "suspensionReason" = NULL,
             "deletedAt" = NULL, "mergedIntoUserId" = NULL,
             "creatorRoleProfile" = $8::jsonb, "regionSettings" = $9::jsonb
           WHERE id = $1`,
          [
            userId, payload.name, payload.email, payload.emailVerified,
            payload.passwordHash, payload.avatar, payload.bio,
            JSON.stringify(payload.creatorRoleProfile), JSON.stringify(payload.regionSettings),
          ],
        );
      } else {
        await client.query(
          `INSERT INTO public."user" (
            id, name, email, "emailVerified", "passwordHash", avatar, bio,
            role, status, "sessionVersion", "creatorRoleProfile", "regionSettings", "createdAt"
          ) VALUES (
            $1, $2, lower(btrim($3)), $4::timestamptz, $5, $6, $7,
            'user', 'active', 1, $8::jsonb, $9::jsonb, $10::timestamptz
          )`,
          [
            userId, payload.name, payload.email, payload.emailVerified,
            payload.passwordHash, payload.avatar, payload.bio,
            JSON.stringify(payload.creatorRoleProfile), JSON.stringify(payload.regionSettings),
            payload.createdAt,
          ],
        );
      }

      // 테스트 계정 플래그 테이블에 절대 남지 않도록 보장
      await client.query(`DELETE FROM public.admin_member_test_accounts WHERE "userId" = $1`, [userId]);

      if (payload.creatorProfile) {
        await client.query(
          `INSERT INTO public.creator_profile (
            "userId", title, summary, "supportMessage", "accentColor",
            layout, "isPublic", links, "featuredProjectIds", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::timestamptz)
          ON CONFLICT ("userId") DO UPDATE SET
            title = EXCLUDED.title, summary = EXCLUDED.summary,
            "supportMessage" = EXCLUDED."supportMessage", "accentColor" = EXCLUDED."accentColor",
            layout = EXCLUDED.layout, "isPublic" = EXCLUDED."isPublic",
            links = EXCLUDED.links, "updatedAt" = EXCLUDED."updatedAt"`,
          [
            userId, payload.creatorProfile.title, payload.creatorProfile.summary,
            payload.creatorProfile.supportMessage, payload.creatorProfile.accentColor,
            payload.creatorProfile.layout, payload.creatorProfile.isPublic,
            JSON.stringify(payload.creatorProfile.links),
            JSON.stringify(payload.creatorProfile.featuredProjectIds),
            payload.creatorRoleProfile.updatedAt,
          ],
        );
      }

      await client.query(
        `INSERT INTO public.member_level (
          "userId", "creatorLevel", "trustLevel", "sellerLevel", "trustScore",
          "emailVerified", "identityVerified", "paymentVerified", "metrics", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz, $11::timestamptz)
        ON CONFLICT ("userId") DO UPDATE SET
          "creatorLevel" = EXCLUDED."creatorLevel", "trustLevel" = EXCLUDED."trustLevel",
          "sellerLevel" = EXCLUDED."sellerLevel", "trustScore" = EXCLUDED."trustScore",
          "emailVerified" = EXCLUDED."emailVerified", "identityVerified" = EXCLUDED."identityVerified",
          "paymentVerified" = EXCLUDED."paymentVerified", "updatedAt" = EXCLUDED."updatedAt"`,
        [
          userId, payload.memberLevel.creatorLevel, payload.memberLevel.trustLevel,
          payload.memberLevel.sellerLevel, payload.memberLevel.trustScore,
          payload.memberLevel.emailVerified, payload.memberLevel.identityVerified,
          payload.memberLevel.paymentVerified, JSON.stringify({}),
          payload.createdAt, payload.creatorRoleProfile.updatedAt,
        ],
      );

      if (payload.planId !== "free") {
        await client.query(
          `INSERT INTO public.membership_grant (
            "userId", "grantKey", "planId", source, status, "startsAt", "endsAt",
            reason, "grantedBy", metadata, "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, 'promotion', 'active', $4::timestamptz, NULL,
            '창작 워크스페이스 멤버십 이용권', NULL, $5::jsonb, $4::timestamptz, $6::timestamptz
          )
          ON CONFLICT ("userId", "grantKey") DO UPDATE SET
            "planId" = EXCLUDED."planId", status = 'active', "updatedAt" = EXCLUDED."updatedAt"`,
          [
            userId, `organic_membership_${payload.planId}`, payload.planId,
            payload.createdAt, JSON.stringify({ tier: payload.planId }), payload.creatorRoleProfile.updatedAt,
          ],
        );
      }

      const creditGranted = await ensureWalletWelcomeGrant(client, {
        userId, asset: "studio_credit", amount: payload.studioCredits,
        reason: "창작 스튜디오 웰컴 크레딧 적립", createdAt: payload.createdAt,
      });
      const pointGranted = await ensureWalletWelcomeGrant(client, {
        userId, asset: "reward_point", amount: payload.rewardPoints,
        reason: "회원 가입 웰컴 포인트 적립", createdAt: payload.createdAt,
      });

      results.push({
        slug: payload.slug, userId, name: payload.name, email: payload.email,
        primaryRole: payload.creatorRoleProfile.primaryRole ?? "reader",
        planId: payload.planId, creditGranted, pointGranted,
      });
    }

    await client.query("COMMIT");
    return { dryRun: false, totalPersonas: results.length, results };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function verifyPersonaLogins({
  baseUrl, personas = ORGANIC_PERSONA_ACCOUNTS, passwordBySlug,
  slugs = ["SOLO_CREATOR", "BG3D_ARTIST", "READER_CRITIC"],
}) {
  const normalizedBase = baseUrl.replace(/\/+$/u, "");
  const verified = [];
  for (const slug of slugs) {
    const persona = personas.find((p) => p.slug === slug);
    if (!persona) throw new Error(`Unknown persona slug for verification: ${slug}`);
    const password = passwordBySlug.get(slug);
    if (!password) throw new Error(`Missing password for persona slug: ${slug}`);

    const loginRes = await fetch(`${normalizedBase}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: normalizedBase },
      body: JSON.stringify({ email: persona.email, password }),
    });
    if (!loginRes.ok) {
      throw new Error(`Login failed for ${slug} (${loginRes.status}): ${await loginRes.text()}`);
    }

    const setCookieHeader =
      typeof loginRes.headers.getSetCookie === "function"
        ? loginRes.headers.getSetCookie()
        : [loginRes.headers.get("set-cookie")].filter(Boolean);
    const cookiePair = setCookieHeader.map((item) => item.split(";")[0]).filter(Boolean).join("; ");

    const loginJson = await loginRes.json();
    const user = loginJson?.data?.user ?? loginJson?.user;
    if (!user || user.email !== persona.email || user.name !== persona.name) {
      throw new Error(`Unexpected login response user payload for ${slug}`);
    }

    const sessionRes = await fetch(`${normalizedBase}/api/auth/session`, {
      method: "GET",
      headers: { cookie: cookiePair, origin: normalizedBase },
    });
    if (!sessionRes.ok) throw new Error(`Session check failed for ${slug} (${sessionRes.status})`);
    const sessionJson = await sessionRes.json();
    const sessionUser = sessionJson?.data?.user ?? sessionJson?.user;
    if (!sessionUser || sessionUser.id !== user.id) throw new Error(`Session user mismatch for ${slug}`);

    await fetch(`${normalizedBase}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: cookiePair, origin: normalizedBase },
    });

    verified.push({
      slug, userId: user.id, name: user.name, role: user.role,
      primaryCreatorRole: user.creatorRoleProfile?.primaryRole ?? "reader",
    });
  }
  return verified;
}

export function buildPgClientOptions(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode === "require" || sslmode === "prefer") {
    parsed.searchParams.delete("sslmode");
    return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } };
  }
  return { connectionString: databaseUrl };
}

function loadPgClient() {
  const candidates = [
    path.resolve(process.cwd(), "apps/api/package.json"),
    "/app/apps/api/package.json",
    path.resolve(process.cwd(), "package.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        return createRequire(candidate)("pg");
      } catch {
        // 다음 후보 경로 시도
      }
    }
  }
  throw new Error("Could not resolve 'pg' module");
}

export function parseCliArgs(argv) {
  const options = {
    dryRun: true, prepareEnv: false, apply: false,
    envFiles: [], verifyLoginUrl: null,
    verifySlugs: ["SOLO_CREATOR", "BG3D_ARTIST", "READER_CRITIC"],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--prepare-env") { options.prepareEnv = true; options.dryRun = false; }
    else if (arg === "--apply") { options.apply = true; options.dryRun = false; }
    else if (arg === "--target-env" || arg === "--env-file") {
      const next = argv[++i];
      if (!next) throw new Error(`${arg} requires a path`);
      options.envFiles.push(next);
    } else if (arg === "--verify-login") {
      const next = argv[++i];
      if (!next) throw new Error("--verify-login requires a base URL");
      options.verifyLoginUrl = next;
      options.dryRun = false;
    } else if (arg === "--verify-slugs") {
      const next = argv[++i];
      if (!next) throw new Error("--verify-slugs requires comma-separated slugs");
      options.verifySlugs = next.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`);
    }
  }
  return options;
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  validatePersonaCatalog(ORGANIC_PERSONA_ACCOUNTS);
  const passwordBySlug = resolveOrGeneratePersonaPasswords(ORGANIC_PERSONA_ACCOUNTS, options.envFiles);

  if (options.prepareEnv) {
    if (options.envFiles.length === 0) throw new Error("--prepare-env requires at least one --target-env <path>");
    const { updatedFiles } = syncLocalAccountEnvFiles({
      personas: ORGANIC_PERSONA_ACCOUNTS, envFiles: options.envFiles, passwordBySlug,
    });
    console.log(JSON.stringify({
      ok: true, action: "prepare-env",
      accountsCount: ORGANIC_PERSONA_ACCOUNTS.length, updatedEnvFilesCount: updatedFiles.length,
    }));
  }

  const payloads = await buildPersonaSeedPayloads(ORGANIC_PERSONA_ACCOUNTS, passwordBySlug);
  if (options.dryRun) {
    console.log(JSON.stringify({ ok: true, ...(await seedPersonaAccounts(null, payloads, { dryRun: true })) }));
    return;
  }

  if (options.apply) {
    const databaseUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required when running with --apply");
    const { Client } = loadPgClient();
    const client = new Client(buildPgClientOptions(databaseUrl));
    await client.connect();
    try {
      const summary = await seedPersonaAccounts(client, payloads, { dryRun: false });
      console.log(JSON.stringify({
        ok: true, action: "apply", totalPersonas: summary.totalPersonas,
        personas: summary.results.map((r) => ({
          slug: r.slug, userId: r.userId, name: r.name, primaryRole: r.primaryRole,
          planId: r.planId, creditGranted: r.creditGranted, pointGranted: r.pointGranted,
        })),
      }));
    } finally {
      await client.end();
    }
  }

  if (options.verifyLoginUrl) {
    const verified = await verifyPersonaLogins({
      baseUrl: options.verifyLoginUrl, personas: ORGANIC_PERSONA_ACCOUNTS,
      passwordBySlug, slugs: options.verifySlugs,
    });
    console.log(JSON.stringify({ ok: true, action: "verify-login", verifiedCount: verified.length, verified }));
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli().catch((error) => {
    console.error(`[persona-accounts-seed] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
