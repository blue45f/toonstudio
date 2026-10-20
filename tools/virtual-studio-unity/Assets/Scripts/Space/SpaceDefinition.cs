using System.Collections.Generic;
using Newtonsoft.Json;

namespace Tsvs.Stage
{
    /// <summary>
    /// Space definition format v1 — mirrors, field for field, the shell-side
    /// contract in apps/web/src/domains/creator/virtual-space/studio-godot-space.ts
    /// (GodotSpaceDefinitionSchema). The stage is a consumer (and, in edit mode,
    /// a producer) of this JSON; the canonical copy lives server-side / in the
    /// static catalog, never in the stage.
    ///
    /// Kind values stay strings (not enums) so an unknown kind from a newer
    /// shell round-trips through the stage editor without being dropped.
    /// </summary>
    public sealed class SpaceDefinition
    {
        [JsonProperty("v")] public int Version = 1;
        [JsonProperty("id")] public string Id = "";
        [JsonProperty("name")] public string Name = "";
        /// <summary>Definition units [width, height]. The default room is 1600x1200.</summary>
        [JsonProperty("size")] public float[] Size;
        /// <summary>Optional door point [x, y] in definition units.</summary>
        [JsonProperty("door")] public float[] Door;
        /// <summary>Optional floor color ("#rrggbb") or material key, max 32 chars.</summary>
        [JsonProperty("floor")] public string Floor;
        [JsonProperty("background")] public SpaceBackgroundDef Background;
        [JsonProperty("zones")] public List<SpaceZoneDef> Zones = new List<SpaceZoneDef>();
        [JsonProperty("props")] public List<SpacePropDef> Props = new List<SpacePropDef>();
        [JsonProperty("npcs")] public List<SpaceNpcDef> Npcs = new List<SpaceNpcDef>();
    }

    public sealed class SpaceBackgroundDef
    {
        /// <summary>
        /// Stage-ready GLB reference. By the time the shell injects a definition
        /// this is either an absolute content URL (uploaded backgrounds, §14) or
        /// an absolute stage-base path ("/unity-space/...", static defaults).
        /// The stored canonical form ("uploads/&lt;assetId&gt;.glb") never reaches
        /// the stage.
        /// </summary>
        [JsonProperty("glb")] public string Glb;
        /// <summary>
        /// Optional explicit format of the <see cref="Glb"/> reference:
        /// "glb" | "gltf". When absent (null — the case for every definition
        /// written before this field existed), BackgroundLoader infers the
        /// format from the Glb reference's file extension. Only glTF-family
        /// formats are loadable at runtime; any other value is rejected
        /// before a load is attempted.
        /// </summary>
        [JsonProperty("format")] public string Format;
        /// <summary>Node names inside the GLB to hide after load (max 16).</summary>
        [JsonProperty("hideNodes")] public string[] HideNodes;
        [JsonProperty("camHeight")] public float? CamHeight;
        [JsonProperty("camDist")] public float? CamDist;
        [JsonProperty("camFov")] public float? CamFov;
        [JsonProperty("camTargetLead")] public float? CamTargetLead;
        [JsonProperty("yaw")] public float? Yaw;
    }

    public sealed class SpaceZoneDef
    {
        [JsonProperty("id")] public string Id = "";
        /// <summary>meeting | presentation | focus | lounge | open</summary>
        [JsonProperty("kind")] public string Kind = "open";
        [JsonProperty("name")] public string Name = "";
        /// <summary>[x, y, w, h] in definition units, origin at the space's top-left.</summary>
        [JsonProperty("rect")] public float[] Rect;
    }

    public sealed class SpacePropDef
    {
        /// <summary>desk | bench | plant | board | storefront | stage | tree | lamp | table | crosswalk | sign | rug</summary>
        [JsonProperty("kind")] public string Kind = "";
        [JsonProperty("name")] public string Name;
        /// <summary>[x, y, w, h] in definition units, origin at the space's top-left.</summary>
        [JsonProperty("rect")] public float[] Rect;
    }

    public sealed class SpaceNpcDef
    {
        [JsonProperty("name")] public string Name = "";
        [JsonProperty("role")] public string Role;
        [JsonProperty("skin")] public string Skin;
        [JsonProperty("color")] public string Color;
        /// <summary>Patrol waypoints, 2..16 points of [x, y] in definition units.</summary>
        [JsonProperty("points")] public float[][] Points;
        /// <summary>Ambient lines shown as local bubbles (max 12).</summary>
        [JsonProperty("lines")] public string[] Lines;
    }

    /// <summary>
    /// Session payload injected by the shell through __tsvs_setSession.
    /// Shape is fixed by StudioGodotSpaceEmbed.injectSession — do not rename.
    /// Ticket handling rule (shell contract): the ticket lives in memory only;
    /// never log, persist, or put it in a URL on our side either.
    /// </summary>
    public sealed class StageSession
    {
        [JsonProperty("v")] public int Version = 1;
        [JsonProperty("ticket")] public string Ticket;
        /// <summary>Realtime origin, already rewritten to wss:// by the shell.</summary>
        [JsonProperty("ws")] public string Ws;
        [JsonProperty("workId")] public string WorkId;
        [JsonProperty("roomId")] public string RoomId;
        [JsonProperty("name")] public string Name;
        /// <summary>Avatar color, "#rrggbb".</summary>
        [JsonProperty("color")] public string Color;
        [JsonProperty("skinKey")] public string SkinKey;
        [JsonProperty("restore")] public StageRestorePoint Restore;
        /// <summary>Resolved space definition (saved layout preferred over catalog).</summary>
        [JsonProperty("space")] public SpaceDefinition Space;
    }

    public sealed class StageRestorePoint
    {
        [JsonProperty("spaceId")] public string SpaceId;
        [JsonProperty("x")] public float X;
        [JsonProperty("y")] public float Y;
    }

    /// <summary>Contract constants from studio-godot-space.ts (GodotSpaceZoneKind/PropKind schemas).</summary>
    public static class SpaceKinds
    {
        public static readonly string[] ZoneKinds = { "meeting", "presentation", "focus", "lounge", "open" };
        public static readonly string[] PropKinds =
        {
            "desk", "bench", "plant", "board", "storefront", "stage",
            "tree", "lamp", "table", "crosswalk", "sign", "rug",
        };

        /// <summary>
        /// Prop kinds the shell renders an interaction notice for
        /// (GODOT_INTERACT_LABELS in studio-godot-space-embed-support.ts).
        /// PresenceSync only emits onInteract for these.
        /// </summary>
        public static readonly string[] InteractablePropKinds =
            { "board", "desk", "stage", "bench", "table", "storefront" };
    }
}
