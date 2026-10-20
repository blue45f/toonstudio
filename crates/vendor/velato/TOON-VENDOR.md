# TOON-VENDOR — velato 0.12.0 (vendored fork)

Base: crates.io velato 0.12.0
  https://static.crates.io/crates/velato/velato-0.12.0.crate
  sha256 55c392c376a5b03fe20454f30e84c1d752334f40bb9ad78a3c9e01951e8ed9db
  (matches the crates.io index cksum, verified 2026-10-20)

WHY: velato 0.12.0 is the latest upstream release and pins
`vello ^0.10`. The Lottie lane feeds velato's `Scene` straight into
the vello 0.11 GPU render path, so the two must be the same `Scene`
type. Wired in via `[patch.crates-io]` in
`crates/studio-engine-vello/Cargo.toml`.

EDITS (everything else is upstream bytes, unmodified):
- `Cargo.toml`: `[dependencies.vello] version = "0.10.0"` -> `"0.11.0"`,
  and the same bump in `[dev-dependencies.vello]` for in-tree work.
- No source edits: velato's `vello::Scene` surface (push_layer /
  push_clip_layer / pop_layer / fill / stroke) is signature-identical
  between vello 0.10 and 0.11, verified by compilation.

REMOVE WHEN: upstream velato releases a version on vello 0.11+.
