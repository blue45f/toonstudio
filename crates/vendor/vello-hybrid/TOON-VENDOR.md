# TOON-VENDOR — vello_hybrid 0.2.0 (vendored fork)

Base: crates.io vello_hybrid 0.2.0
  https://static.crates.io/crates/vello_hybrid/vello_hybrid-0.2.0.crate
  sha256 dccbb4221070e7ef92486abef0002a651702f00a52d6be532249a0fa0eb3e9ba
  (matches the crates.io index cksum, verified 2026-10-20)

WHY: vello_hybrid 0.2.0 is the latest upstream release and pins
`wgpu ^29.0.3`. The vello 0.11 port needs every GPU-lane crate on
wgpu 30 (vello 0.11's pin), otherwise the hybrid renderer and the
classic renderer close over two different `wgpu::Device` types.
Wired in via `[patch.crates-io]` in
`crates/studio-engine-vello/Cargo.toml`.

EDITS (everything else is upstream bytes, unmodified):
- `Cargo.toml`: `[dependencies.wgpu] version = "29.0.3"` -> `"30.0.1"`.
- `src/render/wgpu/mod.rs`: wgpu 30 made `VertexState.buffers` a
  `&[Option<VertexBufferLayout>]`. The five layout values (strip,
  clear, filter, blend, copy pipelines) are wrapped in `Some(...)`;
  no other source change was needed.

REMOVE WHEN: upstream vello_hybrid releases a version whose wgpu pin
reaches 30 (or vello ships a hybrid renderer on the same wgpu major).
