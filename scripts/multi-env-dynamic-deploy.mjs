#!/usr/bin/env node

/**
 * ToonStudio 다이나믹 멀티 클라우드 & 로컬 통합 배포 계획 생성기 (Offline Plan Preview Only)
 *
 * 이 스크립트는 실제 원격 클라우드 배포를 실행하지 않으며(`deployed: false`, `deploymentAuthorized: false`),
 * 워크스페이스 검증 매트릭스와 환경별 참조 명령 프리뷰만 생성한다.
 * 실제 운영 배포 권위는 Cloudflare(`toonspectrum-web`)와 서울 onpod(`toonstudio-api`·`toonstudio-db`)뿐이며
 * `DEPLOY.md`와 `docs/operations/infrastructure-map.md`의 승인·SHA 절차를 따른다.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const SUPPORTED_DEPLOY_TARGETS = Object.freeze([
  {
    id: "local-pnpm-preview",
    category: "local",
    labelKo: "로컬 즉시 프리뷰 (Zero-Docker pnpm 멀티 서버)",
    requiresApprovalSha: false,
    supportsOffline: true,
    estimatedBootSec: 4,
    commandPreview:
      "pnpm --parallel --filter @toonstudio/web --filter @toonstudio/character-lab --filter @toonstudio/brush-lab preview",
  },
  {
    id: "local-docker-compose",
    category: "local",
    labelKo: "로컬 & 단일 클라우드 VM Docker Compose 풀스택",
    requiresApprovalSha: false,
    supportsOffline: true,
    estimatedBootSec: 18,
    commandPreview:
      "docker compose -f deploy/multi-env/docker-compose.local.yml up --build -d",
  },
  {
    id: "cloudflare-edge-static",
    category: "cloud-edge",
    labelKo: "Cloudflare Workers 정적 에셋 + R2 글로벌 엣지 (운영 권위)",
    requiresApprovalSha: true,
    supportsOffline: false,
    estimatedBootSec: 35,
    commandPreview: "node scripts/deploy-cloudflare-static.mjs --dry-run",
  },
  {
    id: "onpod-container-cloud",
    category: "cloud-container",
    labelKo: "Onpod 컨테이너 클라우드 (`toonstudio-api` / `toonstudio-db`, 별도 승인 필수)",
    requiresApprovalSha: true,
    supportsOffline: false,
    estimatedBootSec: 45,
    commandPreview:
      "node scripts/deployment-preflight.mjs --profile onpod-current --operation onpod-image-update",
  },
  {
    id: "aws-ecs-cloudfront",
    category: "cloud-hyperscaler",
    labelKo: "AWS ECS Fargate + S3 / CloudFront 하이브리드 이식성 참조 (미운영·별도 승인 대상)",
    requiresApprovalSha: true,
    supportsOffline: false,
    estimatedBootSec: 60,
    commandPreview:
      "aws s3 sync apps/web/dist s3://$AWS_STATIC_BUCKET --delete && aws ecs update-service --cluster toonstudio --service api --force-new-deployment",
  },
  {
    id: "gcp-cloud-run",
    category: "cloud-hyperscaler",
    labelKo: "Google Cloud Run 컨테이너 + Cloud Storage CDN 이식성 참조 (미운영·별도 승인 대상)",
    requiresApprovalSha: true,
    supportsOffline: false,
    estimatedBootSec: 50,
    commandPreview:
      "gcloud run deploy toonstudio-api --image ghcr.io/blue45f/toonstudio-api:$COMMIT_SHA --region asia-northeast3 --allow-unauthenticated",
  },
  {
    id: "self-hosted-k8s",
    category: "cloud-portable",
    labelKo: "표준 Kubernetes (K8s / Helm / K3s) 멀티 클라우드 호환 참조 매니페스트",
    requiresApprovalSha: true,
    supportsOffline: true,
    estimatedBootSec: 30,
    commandPreview: "kubectl apply -f deploy/multi-env/k8s-portable-stack.yaml --dry-run=client",
  },
]);

export const DEPLOYABLE_WORKSPACES = Object.freeze([
  {
    id: "web",
    packageName: "@toonstudio/web",
    labelKo: "ToonStudio 메인 웹 스튜디오 (3D Labs 포함)",
    buildCommand: "pnpm run build",
    verifyCommand: "pnpm exec tsx scripts/verify-blender-fresh-ideas-ai-gate.mts",
    artifactDir: "apps/web/dist",
    defaultPort: 4173,
  },
  {
    id: "character-lab",
    packageName: "@toonstudio/character-lab",
    labelKo: "캐릭터 랩스 (Character Labs · 턴어라운드/툰/VRM)",
    buildCommand: "pnpm --filter @toonstudio/character-lab run build",
    verifyCommand:
      "./node_modules/.bin/vitest run apps/character-lab/src/render/style/character-verify-ai-fresh-ideas.test.ts apps/character-lab/src/architecture.test.ts",
    artifactDir: "apps/character-lab/dist",
    defaultPort: 4174,
  },
  {
    id: "brush-lab",
    packageName: "@toonstudio/brush-lab",
    labelKo: "브러시 랩스 (Brush Labs · 분광 안료/WebGPU 링버퍼)",
    buildCommand: "pnpm --filter @toonstudio/brush-lab run build",
    verifyCommand:
      "./node_modules/.bin/vitest run apps/brush-lab/src/bench/metrics/webtoon-brush-verify-ai-remix.test.ts apps/brush-lab/src/boundary.test.ts",
    artifactDir: "apps/brush-lab/dist",
    defaultPort: 4175,
  },
  {
    id: "api",
    packageName: "@toonstudio/api",
    labelKo: "Core API & 실시간 협업 백엔드",
    buildCommand: "pnpm --filter @toonstudio/api run build",
    verifyCommand:
      "./node_modules/.bin/vitest run scripts/deployment-preflight.test.mjs",
    artifactDir: "apps/api/dist",
    defaultPort: 3000,
  },
]);

export function buildDynamicDeployMatrix(options = {}) {
  const requestedTargets =
    Array.isArray(options.targets) && options.targets.length > 0
      ? options.targets
      : SUPPORTED_DEPLOY_TARGETS.map((t) => t.id);

  const requestedWorkspaces =
    Array.isArray(options.workspaces) && options.workspaces.length > 0
      ? options.workspaces
      : DEPLOYABLE_WORKSPACES.map((w) => w.id);

  const targets = SUPPORTED_DEPLOY_TARGETS.filter((t) =>
    requestedTargets.includes(t.id),
  );
  const workspaces = DEPLOYABLE_WORKSPACES.filter((w) =>
    requestedWorkspaces.includes(w.id),
  );

  if (targets.length === 0) {
    throw new Error(
      `지원하지 않는 배포 타겟입니다: ${requestedTargets.join(", ")}`,
    );
  }
  if (workspaces.length === 0) {
    throw new Error(
      `지원하지 않는 워크스페이스입니다: ${requestedWorkspaces.join(", ")}`,
    );
  }

  const commitSha =
    typeof options.commitSha === "string" && options.commitSha.trim().length > 0
      ? options.commitSha.trim()
      : "HEAD";

  return Object.freeze({
    schemaVersion: 1,
    commitSha,
    generatedAt: options.generatedAt ?? "2026-11-09T00:00:00.000Z",
    executionStatus: "offline-plan-only",
    deployed: false,
    deploymentAuthorized: false,
    parallelStrategy: {
      failFast: false,
      maxParallelWorkspaces: workspaces.length,
      maxParallelTargets: targets.length,
    },
    githubActionsMatrix: {
      workspace: workspaces.map((w) => ({
        id: w.id,
        packageName: w.packageName,
        labelKo: w.labelKo,
        buildCommand: w.buildCommand,
        verifyCommand: w.verifyCommand,
        artifactDir: w.artifactDir,
        defaultPort: w.defaultPort,
      })),
      target: targets.map((t) => ({
        id: t.id,
        category: t.category,
        labelKo: t.labelKo,
        requiresApprovalSha: t.requiresApprovalSha,
        supportsOffline: t.supportsOffline,
        commandPreview: t.commandPreview,
      })),
    },
    summaryKo: `병렬 워크스페이스 ${workspaces.length}종(${workspaces.map((w) => w.id).join(", ")}) × 배포 환경 ${targets.length}종(${targets.map((t) => t.id).join(", ")}) 오프라인 계획 프리뷰 준비 완료 (실제 배포 아님)`,
  });
}

export function formatDynamicDeployPlanMarkdown(plan) {
  const wsRows = plan.githubActionsMatrix.workspace
    .map(
      (w) =>
        `| \`${w.id}\` | ${w.labelKo} | \`${w.buildCommand}\` | \`${w.verifyCommand}\` | \`${w.defaultPort}\` |`,
    )
    .join("\n");

  const targetRows = plan.githubActionsMatrix.target
    .map(
      (t) =>
        `| \`${t.id}\` | ${t.category} | ${t.labelKo} | ${t.supportsOffline ? "YES" : "NO"} | \`${t.commandPreview}\` |`,
    )
    .join("\n");

  return [
    "# ToonStudio 다이나믹 멀티 클라우드 & 로컬 병렬 배포 플랜 (오프라인 프리뷰)",
    "",
    `- **요약:** ${plan.summaryKo}`,
    `- **실행 상태:** \`${plan.executionStatus}\` (\`deployed: false\`, \`deploymentAuthorized: false\` — 운영 반영 증거가 아님)`,
    `- **기준 커밋:** \`${plan.commitSha}\``,
    "",
    "## 1. 병렬 빌드·Verify AI 검증 워크스페이스 매트릭스",
    "",
    "| 워크스페이스 | 설명 | 빌드 명령 | Verify AI 게이트 명령 | 기본 포트 |",
    "|---|---|---|---|---:|",
    wsRows,
    "",
    "## 2. 다중 클라우드 & 로컬 배포 환경 매트릭스",
    "",
    "| 타겟 ID | 분류 | 환경 설명 | 오프라인/로컬 가능 | 실행 명령 프리뷰 |",
    "|---|---|---|:---:|---|",
    targetRows,
    "",
  ].join("\n");
}

function parseCliArgs(argv) {
  const out = {
    targets: [],
    workspaces: [],
    githubMatrixOnly: false,
    reportPath: undefined,
    jsonPath: undefined,
    commitSha: process.env.GITHUB_SHA ?? "HEAD",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--github-matrix") {
      out.githubMatrixOnly = true;
    } else if (arg === "--target" && argv[i + 1]) {
      out.targets.push(
        ...argv[i + 1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      i += 1;
    } else if (arg === "--workspace" && argv[i + 1]) {
      out.workspaces.push(
        ...argv[i + 1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      i += 1;
    } else if (arg === "--report" && argv[i + 1]) {
      out.reportPath = argv[i + 1];
      i += 1;
    } else if (arg === "--json" && argv[i + 1]) {
      out.jsonPath = argv[i + 1];
      i += 1;
    } else if (arg === "--sha" && argv[i + 1]) {
      out.commitSha = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

const isDirectRun =
  process.argv[1] &&
  resolve(process.argv[1]).endsWith("multi-env-dynamic-deploy.mjs");

if (isDirectRun) {
  const cli = parseCliArgs(process.argv.slice(2));
  const plan = buildDynamicDeployMatrix({
    targets: cli.targets,
    workspaces: cli.workspaces,
    commitSha: cli.commitSha,
  });

  if (cli.jsonPath) {
    const resolvedJson = resolve(cli.jsonPath);
    mkdirSync(dirname(resolvedJson), { recursive: true });
    writeFileSync(resolvedJson, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }

  if (cli.reportPath) {
    const resolvedReport = resolve(cli.reportPath);
    mkdirSync(dirname(resolvedReport), { recursive: true });
    writeFileSync(
      resolvedReport,
      formatDynamicDeployPlanMarkdown(plan),
      "utf8",
    );
  }

  if (cli.githubMatrixOnly) {
    process.stdout.write(`${JSON.stringify(plan.githubActionsMatrix)}\n`);
  } else {
    process.stdout.write(formatDynamicDeployPlanMarkdown(plan));
  }
}
