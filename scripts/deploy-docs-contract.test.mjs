import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 정적 웹 production 배포 문서와 스크립트(`scripts/deploy-cloudflare-static.mjs`)의 일치 검사.
 *
 * 2026-10-08 이전에는 스크립트가 `TOONSPECTRUM_APPROVED_MAIN_SHA`(소문자 40자리 SHA, main, 깨끗한
 * 작업 트리, HEAD 일치)를 요구하는데 배포 명령을 적은 문서는 승인 문구만 적어 그대로 따라 하면 배포가
 * 중단되었다. 현재 DB·API 권위는 2026-10-23 컷오버와 인프라 지도의 onpod 행을 따른다.
 * 퇴역 제공자의 기록과 현재 운영 표를 구분한다. 읽기 전용 파일 대조이며
 * 배포 명령을 실행하지 않는다.
 */

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(repositoryRoot, relativePath), "utf8");

const APPROVAL_ASSIGNMENT = "TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production";
const APPROVED_SHA_NAME = "TOONSPECTRUM_APPROVED_MAIN_SHA";

/** 정적 웹 production 배포 명령을 안내하는 문서. */
const DEPLOY_COMMAND_DOCS = [
  "DEPLOY.md",
  "deploy/cloudflare-static/README.md",
  "deploy/cloudflare-static/.env.example",
  "docs/FREE_INFRASTRUCTURE.md",
  "docs/operations/minimum-cost-deployment-policy.md",
  "docs/operations/production-environment.md",
];

/** 운영 DB 권위를 말하는 현재 문서. */
const DATABASE_AUTHORITY_DOCS = ["DEPLOY.md", "docs/operations/minimum-cost-deployment-policy.md"];

const count = (text, needle) => text.split(needle).length - 1;

describe("정적 웹 production 배포 스크립트 요구 조건", () => {
  const script = read("scripts/deploy-cloudflare-static.mjs");

  it("production 에서 승인 문구·승인 SHA·main·깨끗한 작업 트리·HEAD 일치를 모두 요구한다", () => {
    expect(script).toContain('approval === "cloudflare-static-production"');
    expect(script).toContain("STANDING_APPROVAL");
    expect(script).toContain(`process.env.${APPROVED_SHA_NAME}`);
    expect(script).toContain("/^[0-9a-f]{40}$/u");
    expect(script).toContain('branch !== "main"');
    expect(script).toContain('status !== ""');
    expect(script).toContain("head !== approvedSha");
  });
});

describe.each(DEPLOY_COMMAND_DOCS)("%s", (file) => {
  const text = read(file);

  it("승인 문구를 적는 곳마다 승인 SHA 변수(TOONSPECTRUM_APPROVED_MAIN_SHA)도 적는다", () => {
    const approvalMentions = count(text, APPROVAL_ASSIGNMENT);
    expect(approvalMentions).toBeGreaterThan(0);
    expect(count(text, APPROVED_SHA_NAME)).toBeGreaterThanOrEqual(approvalMentions);
  });

  it("승인 SHA 를 고정 40자리 값으로 적어 두지 않는다(승인된 값을 직접 입력하게 한다)", () => {
    expect(text).not.toMatch(/TOONSPECTRUM_APPROVED_MAIN_SHA=["']?[0-9a-f]{40}/u);
  });
});

describe.each(DATABASE_AUTHORITY_DOCS)("%s 의 운영 DB 서술", (file) => {
  const text = read(file);

  it("현재 API·DB 권위 행은 정본 인프라 지도의 onpod 컷오버와 일치한다", () => {
    const map = read("docs/operations/infrastructure-map.md");
    expect(map).toContain("문서 상태: **current**");
    expect(map).toContain("`toonstudio-api`");
    expect(map).toContain("`toonstudio-db`");
    const rows = text.split("\n");
    expect(rows.find((line) => /^\|\s*Core API\s*\|/u.test(line))).toContain("onpod `toonstudio-api`");
    expect(rows.find((line) => /^\|\s*(?:DB|PostgreSQL 원장)\s*\|/u.test(line))).toContain("onpod `toonstudio-db`");
    expect(text).toContain("infrastructure-map.md");
    expect(text).not.toContain("Neon/호환");
    expect(text).not.toMatch(/Neon 또는 호환/u);
  });

  it("Neon 언급은 legacy·과거·퇴역·삭제 상태를 명시한다", () => {
    const offenders = text
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => /Neon/u.test(line) && !/legacy|과거|퇴역|삭제/u.test(line))
      .map(({ line, number }) => `${file}:${number} ${line.trim()}`);
    expect(offenders).toEqual([]);
  });
});
