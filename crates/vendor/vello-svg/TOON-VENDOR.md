# TOON-VENDOR — vello_svg 0.11.0 (vendored fork)

Base: crates.io vello_svg 0.11.0
  https://static.crates.io/crates/vello_svg/vello_svg-0.11.0.crate
  sha256 76e121946d05c44dd71a767fcc462ff632baf30d05a3b9dfe4e655c1ac93ff06
  (matches the crates.io index cksum, verified 2026-10-20)

WHY: vello_svg 0.11.0 is the latest upstream release and pins
`vello ^0.10`. The SVG lane feeds its `vello::Scene` straight into
the vello 0.11 GPU render path (`crate::svg::svg_to_vello_scene`
returns `vello_svg::vello::Scene`), so the two must be the same
`Scene` type. Wired in via `[patch.crates-io]` in
`crates/studio-engine-vello/Cargo.toml`.

EDITS (everything else is upstream bytes, unmodified):
- `Cargo.toml`: `[dependencies.vello] version = "0.10.0"` -> `"0.11.0"`.
- No source edits: the `RenderSink for vello::Scene` surface is
  signature-identical between vello 0.10 and 0.11, verified by
  compilation.

REMOVE WHEN: upstream vello_svg releases a version on vello 0.11+.
