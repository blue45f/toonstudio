import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");

// Vendored forks wired through [patch.crates-io] in the crate manifest. A
// locked package with no registry source must be one of these, and its
// recorded inventory source is the fork's repo-relative path so provenance
// stays truthful per fork. refresh derives the path from cargo metadata and
// fails if it is not declared here.
export const VELLO_VENDORED_PACKAGE_SOURCES = Object.freeze({
  wgpu: "path:crates/vendor/wgpu-toon",
  vello_hybrid: "path:crates/vendor/vello-hybrid",
  velato: "path:crates/vendor/velato",
  vello_svg: "path:crates/vendor/vello-svg",
});

export const REVIEWED_RUST_LICENSE_EXPRESSIONS = new Set([
  "(MIT OR Apache-2.0) AND Unicode-3.0",
  "0BSD OR MIT OR Apache-2.0",
  "Apache-2.0/MIT",
  "Apache-2.0 OR MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "MIT",
  "MIT OR Apache-2.0",
  "MIT OR Apache-2.0 OR Zlib",
  "MIT OR Zlib OR Apache-2.0",
  "MIT/Apache-2.0",
  "Unicode-3.0",
  "Unlicense OR MIT",
  "Zlib",
  "Zlib OR Apache-2.0 OR MIT",
]);

export function vendoredVelloSource(packageMetadata, key) {
  const derived = `path:${relative(REPOSITORY_ROOT, dirname(packageMetadata.manifest_path)).replaceAll("\\", "/")}`;
  if (VELLO_VENDORED_PACKAGE_SOURCES[packageMetadata.name] !== derived) {
    throw new Error(`Undeclared vendored Vello package: ${key} at ${derived}.`);
  }
  return derived;
}
