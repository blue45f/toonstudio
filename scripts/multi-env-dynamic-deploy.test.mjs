import { describe, expect, it } from "vitest";

import {
  DEPLOYABLE_WORKSPACES,
  SUPPORTED_DEPLOY_TARGETS,
  buildDynamicDeployMatrix,
  formatDynamicDeployPlanMarkdown,
} from "./multi-env-dynamic-deploy.mjs";

describe("multi-env-dynamic-deploy", () => {
  it("builds a complete parallel matrix across all 4 workspaces and 7 cloud/local targets", () => {
    const plan = buildDynamicDeployMatrix({
      commitSha: "50f8c95d0",
    });

    expect(plan.githubActionsMatrix.workspace).toHaveLength(
      DEPLOYABLE_WORKSPACES.length,
    );
    expect(plan.githubActionsMatrix.target).toHaveLength(
      SUPPORTED_DEPLOY_TARGETS.length,
    );
    expect(plan.parallelStrategy.failFast).toBe(false);
    expect(plan.summaryKo).toContain("병렬 워크스페이스 4종");
    expect(plan.summaryKo).toContain("배포 환경 7종");

    const markdown = formatDynamicDeployPlanMarkdown(plan);
    expect(markdown).toContain("local-docker-compose");
    expect(markdown).toContain("cloudflare-edge-static");
    expect(markdown).toContain("onpod-container-cloud");
    expect(markdown).toContain("aws-ecs-cloudfront");
    expect(markdown).toContain("gcp-cloud-run");
    expect(markdown).toContain("self-hosted-k8s");
    expect(markdown).toContain("character-lab");
    expect(markdown).toContain("brush-lab");
  });

  it("filters workspaces and targets dynamically for targeted local or cloud runs", () => {
    const filtered = buildDynamicDeployMatrix({
      workspaces: ["character-lab", "brush-lab"],
      targets: ["local-docker-compose", "gcp-cloud-run"],
    });

    expect(filtered.githubActionsMatrix.workspace.map((w) => w.id)).toEqual([
      "character-lab",
      "brush-lab",
    ]);
    expect(filtered.githubActionsMatrix.target.map((t) => t.id)).toEqual([
      "local-docker-compose",
      "gcp-cloud-run",
    ]);
  });
});
