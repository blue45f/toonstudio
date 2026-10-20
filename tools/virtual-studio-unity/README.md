# ToonStudio Virtual Studio — Unity Stage

The Unity replacement for the Godot virtual-studio stage. The React shell,
the layout/background APIs, and all saved data stay exactly as they are
(engine-neutral by design); only the stage inside the iframe changes.
Design of record: `um-design/DESIGN.md` in the migration workspace — §2
(bridge contract) and §4 (Unity mapping) are normative for this project.

## Unity version

- **Unity 6000.0 LTS** (see `ProjectSettings/ProjectVersion.txt`).
  The 6000.0 line is pinned because it is the current LTS with WebGL/Wasm
  support and URP 17; the exact patch in ProjectVersion.txt is provisional —
  on first open, align it to the newest 6000.0 LTS patch offered by Unity
  Hub and commit the editor-written revision line.
- Rendering: URP (`com.unity.render-pipelines.universal` 17.0.3).
- Runtime GLB loading: **glTFast** (`com.atteneder.gltfast`, Apache-2.0) via
  OpenUPM — see `Packages/manifest.json`. If 6.9.0 fails to resolve, take
  the newest 6.x patch.
- JSON: `com.unity.nuget.newtonsoft-json` (the space definition has jagged
  arrays — NPC waypoint lists — that JsonUtility cannot model).

## License requirement

**Unity Personal is sufficient.** Personal covers commercial WebGL builds
for organizations whose revenue + funding in the last 12 months is under
**US$200,000** (the Unity 6 threshold; splash screen optional, the runtime
fee was abolished). ToonStudio is currently far below that threshold —
verified 2026-10-20. If the threshold is ever crossed, Unity Pro becomes
mandatory (US$2,310/seat/year); that is a plan decision for that time, not
a blocker for this migration. No license server or activation secret is
needed for local editor builds (the initial route in DESIGN §7.1).

## Build procedure

1. Open this project in Unity Hub (6000.0 LTS + WebGL Build Support module).
2. Menu **TSVS > Create Stage Scene** — generates `Assets/Scenes/Stage.unity`
   from code (no binary scene is committed blind) and registers it in
   Build Settings.
3. Menu **TSVS > Build WebGL Stage** — configures player settings and builds
   to **`apps/web/public/unity-space/`** at the repo root.
   Headless equivalent: `-executeMethod Tsvs.Stage.Editor.BuildWebGL.Build`.
4. Copy the static catalog next to the build output (DESIGN §6.1):
   `spaces.json` and `spaces/*.glb` into `apps/web/public/unity-space/`
   (copied from the current `public/godot-space/` set). The stage fetches
   `/unity-space/spaces.json` directly for local boot and boot defaults.
   For editor-only local testing, the same `spaces.json` may be placed in
   `Assets/StreamingAssets/` as a fallback.
5. Shell-side prerequisites (separate shell work, DESIGN §6.1/§6.2): the
   embed path points at `/unity-space/index.html`, the `/godot-space` header
   rules (COOP/COEP/CORP/CSP/cache) are replicated for `/unity-space`, and
   `GODOT_STAGE_BASE_PATH` becomes `/unity-space/`.

Build settings applied by the build script:

- **Threading DISABLED** (`threadsSupport = false`) — same as the current
  Godot export. No SharedArrayBuffer, no cross-origin-isolation requirement
  introduced by this stage.
- Template: `TsvsStage` (this repo's `Assets/WebGLTemplates/TsvsStage`) —
  required; it carries the bridge page glue.
- Brotli compression + decompression fallback (hosts without
  `Content-Encoding: br` rules still boot). `index.html` must be served
  no-cache; `*.wasm` as `application/wasm`.

## Shell contract summary (frozen — DESIGN §2/§4)

Boot: iframe URL `?space=<id>`, `?local=1[&px=<x>&py=<y>]`. Space switching
is an iframe reload driven by the shell; the stage never switches itself.

Shell → stage (page-glue globals → `SendMessage("TsvsBridge", …)`; boolean
args travel as `"1"`/`"0"` strings; calls before scene readiness are queued
by the page glue and flushed in order):

| Global | C# method | Payload |
|---|---|---|
| `__tsvs_setSession(json)` | `OnSetSession` | `{v:1, ticket, ws, workId, roomId, name, color, skinKey?, restore?, space?}` |
| `__tsvs_setVisibility(hidden)` | `OnSetVisibility` | `"1"`/`"0"` |
| `__tsvs_bridgePing()` | `OnBridgePing` | `""` (20 s watchdog) |
| `__tsvs_sendSignal(json)` | `OnSendSignal` | meeting signal record — opaque, relay only (incl. the `signal.stop` `shareId` quirk) |
| `__tsvs_showBubble(json)` | `OnShowBubble` | `{actorId, text}` |
| `__tsvs_showEmote(json)` | `OnShowEmote` | `{actorId, emote}` |
| `__tsvs_setEditMode(enabled)` | `OnSetEditMode` | `"1"`/`"0"` |
| `__tsvs_applyLayout(json)` | `OnApplyLayout` | `{spec: <definition>}` |
| `__tsvs_layoutCommand(json)` | `OnLayoutCommand` | `{op:"add"\|"update"\|"delete", category, kind?, index?, fields?}` |
| `__tsvs_notifyLayout(json)` | `OnNotifyLayout` | `{spaceId, revision}` |

`__tsvs_requestReconnect` is intentionally **not implemented** — the shell
declares it but never calls it (DESIGN §2.2 #4).

Stage → shell (`window.parent.__tsvsHost.*` via `TsvsHost.jslib`; one JSON
string each; names frozen): `onGodotReady("")`, `onConnectionState({state})`,
`onTicketNeeded("")`, `onZoneChanged`, `onProximityChanged({size})`,
`onSignal({fromClientId, payload})`, `onBubble({fromActorId, text})`,
`onEmote({fromActorId, emote})`, `onInteract({kind})`,
`onPosition({spaceId, x, y})`, `onLayoutChanged({spec})`,
`onLayoutSelection({selection})` (discriminator key `type`),
`onLayoutRemote({spaceId})`.

Background state: published as both `__godotBgState` and `__tsvsBgState`
(`idle|loading|ready|failed`) during the transition; the shell polls it
before injecting sessions/layouts, so loads here are serialized and always
settle the state.

Coordinates (`SpaceCoordinates.cs`, DESIGN §3.3):
`worldX = x / 100`, `worldZ = +1 * (y / 100)`, floor at worldY 0.
**The 100 units = 1 m scale is an inference**, not a measured fact — the
Godot stage's conversion is not in the repo. It is the only order of
magnitude consistent with the camera fields (camHeight 10.5, camDist 12
for a 1600×1200 room), and DESIGN stage 3 A/B-verifies scale and the
worldZ sign against the live Godot stage (door/spawn/zone landmarks). The
sign is isolated in `PLANE_Y_TO_WORLD_Z_SIGN` for a one-line correction.

## Bundle assets (Creator Bundle — EmaceArt / RG Poly)

Service rule: assets are used **inside the service only** — no download or
export of model files, scenes stored by reference, only rendered images
leave. Accordingly:

- Bundle models enter as prefabs registered in `PropFactory.Catalog`
  (kind → prefab), converted to GLB and baked into the WebGL build /
  StreamingAssets of this project — never as separately fetchable files.
- Backgrounds keep flowing through the existing upload + content pipeline
  (the stage just loads the injected URL via glTFast). The current upload
  extension ban list stays in force initially (DESIGN §5.5).

## Layout of this project

```
ProjectSettings/ProjectVersion.txt   Unity 6000.0 LTS pin
Packages/manifest.json               URP 17, glTFast (OpenUPM), Newtonsoft, Input System
Assets/Scripts/Bridge/TsvsBridge.cs  shell<->stage boundary (names frozen by DESIGN)
Assets/Plugins/WebGL/TsvsHost.jslib      stage -> shell (__tsvsHost), bg state, page facts
Assets/Plugins/WebGL/RealtimeSocket.jslib WebSocket transport (browser API wrapper)
Assets/Scripts/Space/                definition DTOs, coordinates, loader, props, background
Assets/Scripts/Avatar/               avatar controller (move/nameplate/bubble/NPC), PresenceSync
Assets/Scripts/Camera/CameraRig.cs   follow/overview camera (background camera block)
Assets/Scripts/Realtime/RealtimeSocket.cs  socket transport (GameObject "RealtimeSocket")
Assets/Scripts/StageBootstrap.cs     boot order + wiring
Assets/Editor/StageSceneBuilder.cs   TSVS > Create Stage Scene
Assets/Editor/BuildWebGL.cs          TSVS > Build WebGL Stage
Assets/WebGLTemplates/TsvsStage/     page glue (bridge globals + pre-ready queue)
```
