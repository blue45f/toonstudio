# ToonStudio self-authored environment pack v1 — provenance and usage

All delivered GLB geometry, thumbnails, and scene arrangement in this directory
were authored by ToonStudio with the reproducible generator
`scripts/generate_self_authored_environment_pack_v1.py` and released under
**CC0-1.0**.

- License: CC0-1.0 — https://creativecommons.org/publicdomain/zero/1.0/
- Attribution required: no
- Commercial use, modification, and redistribution: permitted
- Third-party meshes, textures, HDRIs, fonts, or other embedded resources: none.
  Materials are flat authored colours; geometry is composed from procedural
  box / cylinder / gable-prism primitives defined in the generator.
- Generator output convention: metres, glTF Y-up, grounded at Y=0,
  self-contained GLB 2.0, no network resource required at runtime.

## Replacement history

This pack replaces the retired `mcp-free-v1` pack, whose assets were generated
with a promotional free Tripo API wallet. ToonStudio's rights review
(2026-10-14) determined that commercial rights in that pack could **not** be
confirmed: Tripo's Terms of User Agreement (last updated July 11, 2025) §5.2.1
reserves all rights in free users' inputs and outputs to Tripo, while §5.2.2
grants the broad rights only to paid users, and Tripo's pricing FAQ directs
users who need commercial use to a paid plan. No paid plan or purchase record
exists for the free wallet, so the pack was withdrawn instead of relying on
the earlier interpretation recorded in its `LICENSES.md`.

Asset IDs and file names are unchanged from the retired pack so that saved
projects resolving environments through the BG3D catalog keep working; only
the provenance, the directory, and the model bytes are new. Per-asset hashes,
bounds, and metrics are recorded in `manifest.json`.
