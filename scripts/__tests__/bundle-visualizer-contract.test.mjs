import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const viteConfig = readFileSync(
  path.join(repoRoot, "apps/web/vite.config.ts"),
  "utf8",
);
const workflow = readFileSync(
  path.join(repoRoot, ".github/workflows/bundle-visualizer.yml"),
  "utf8",
);
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));

/**
 * Build-free contract for the bundle visualizer. The treemap itself needs a
 * production build, so it is generated in the workflow; this suite pins the
 * wiring that keeps the report a report: the plugin is dev-only, opt-in via
 * BUNDLE_VISUALIZER=1 (a normal build keeps the exact same plugin list and
 * therefore the same chunks), and its output lands in the ignored `.qa/`
 * directory — never in `dist/`, where it could be deployed or served.
 */
describe("bundle visualizer contract", () => {
  it("installs rollup-plugin-visualizer as a pinned dev-only dependency", () => {
    expect(pkg.devDependencies["rollup-plugin-visualizer"]).toBe("7.1.1");
    expect(pkg.dependencies?.["rollup-plugin-visualizer"]).toBeUndefined();
  });

  it("exposes exactly one visualize script that opts in and builds the web bundle", () => {
    expect(pkg.scripts["bundle:visualize"]).toBe(
      "BUNDLE_VISUALIZER=1 NODE_OPTIONS='--max-old-space-size=12288' vite build --config apps/web/vite.config.ts",
    );
    // The plain bundle build must not opt in: no env flag, no report.
    expect(pkg.scripts["build:bundle"]).not.toContain("BUNDLE_VISUALIZER");
    expect(pkg.scripts.build).not.toContain("BUNDLE_VISUALIZER");
  });

  it("gates the plugin behind BUNDLE_VISUALIZER=1 and registers it last", () => {
    // Dynamic import only: the package is ESM-only and this config is
    // bundled as CommonJS, so a static import would break every build.
    expect(viteConfig).toContain(
      'return import("rollup-plugin-visualizer")',
    );
    expect(viteConfig).not.toContain(
      'import { visualizer } from "rollup-plugin-visualizer"',
    );
    expect(viteConfig).toContain(
      'if (process.env.BUNDLE_VISUALIZER !== "1") return null;',
    );
    const pluginsStart = viteConfig.indexOf("plugins: [");
    const visualizerCall = viteConfig.indexOf("bundleVisualizerPlugin()", pluginsStart);
    const babelCall = viteConfig.indexOf("babel({", pluginsStart);
    expect(visualizerCall).toBeGreaterThan(-1);
    // Last plugin: it must observe the final bundle, after react/babel.
    expect(visualizerCall).toBeGreaterThan(babelCall);
  });

  it("writes a treemap with gzip+brotli sizes outside dist/, without opening a browser", () => {
    expect(viteConfig).toContain('template: "treemap"');
    expect(viteConfig).toContain("gzipSize: true");
    expect(viteConfig).toContain("brotliSize: true");
    expect(viteConfig).toContain("open: false");
    expect(viteConfig).toContain(
      'path.resolve(repositoryRoot, ".qa/bundle-visualizer.html")',
    );
    expect(viteConfig).not.toContain("dist/bundle-visualizer");
    expect(viteConfig).not.toContain("emitFile: true");
  });

  it("uploads the report as a CI artifact from the same path the config writes", () => {
    expect(workflow).toContain("pnpm run bundle:visualize");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("path: .qa/bundle-visualizer.html");
    expect(workflow).toContain("workflow_dispatch:");
  });
});
