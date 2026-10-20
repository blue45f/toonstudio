using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// Definition plane &lt;-&gt; Unity world conversion — the single place that
    /// knows how the two coordinate systems relate (DESIGN §3.3).
    ///
    /// Definition plane (contract, confirmed by measurement):
    ///   - 2D plan, origin at the space's TOP-LEFT corner, +x right, +y down
    ///   - units are plane units, NOT meters (one room is 1600 x 1200)
    ///   - rect = [x, y, w, h] from the rect's top-left corner; there is no
    ///     height axis anywhere in the contract
    ///   - positions reported to the shell (onPosition) are plane (x, y)
    ///
    /// Unity mapping (DESIGN §3.3 decision):
    ///   worldX = x / PLANE_UNITS_PER_METER
    ///   worldZ = PLANE_Y_TO_WORLD_Z_SIGN * (y / PLANE_UNITS_PER_METER)
    ///   worldY (height) is assigned by the stage; the floor is worldY = 0.
    ///
    /// !! INFERENCE, NOT YET VERIFIED !!
    /// PLANE_UNITS_PER_METER = 100 is inferred: it is the only order of
    /// magnitude that makes the 1600x1200 plane a 16m x 12m room consistent
    /// with the meter-scale camera fields (camHeight 10.5, camDist 12). The
    /// Godot stage's actual conversion lives in its project source, which is
    /// not in the repo, so neither the exact scale nor the worldZ sign
    /// (mirror) could be read. DESIGN stage 3 A/B-verifies both against the
    /// running Godot stage using door/spawn/zone landmarks; if the sign is
    /// flipped, flip PLANE_Y_TO_WORLD_Z_SIGN — it is isolated here on
    /// purpose, and every conversion routes through this class.
    /// </summary>
    public static class SpaceCoordinates
    {
        /// <summary>Plane units per world meter. INFERRED — pending DESIGN stage-3 A/B verification.</summary>
        public const float PLANE_UNITS_PER_METER = 100f;

        /// <summary>+1: plane +y maps to world +Z. Flip to -1 if A/B shows the Godot stage mirrored y.</summary>
        public const float PLANE_Y_TO_WORLD_Z_SIGN = 1f;

        public static float ToWorldLength(float planeUnits)
        {
            return planeUnits / PLANE_UNITS_PER_METER;
        }

        public static float ToPlaneLength(float worldUnits)
        {
            return worldUnits * PLANE_UNITS_PER_METER;
        }

        /// <summary>Plane point -&gt; world point on the floor (worldY = 0).</summary>
        public static Vector3 PointToWorld(float x, float y, SpaceDefinition definition)
        {
            _ = definition; // mapping is origin-based; the definition is not needed today
            return new Vector3(
                x / PLANE_UNITS_PER_METER,
                0f,
                PLANE_Y_TO_WORLD_Z_SIGN * (y / PLANE_UNITS_PER_METER));
        }

        /// <summary>World point -&gt; plane point (inverse of PointToWorld).</summary>
        public static Vector2 WorldToPoint(Vector3 world, SpaceDefinition definition)
        {
            _ = definition;
            return new Vector2(
                world.x * PLANE_UNITS_PER_METER,
                PLANE_Y_TO_WORLD_Z_SIGN * (world.z * PLANE_UNITS_PER_METER));
        }

        /// <summary>Rect [x, y, w, h] -&gt; world-space center (on floor) + world size (x = width, y = depth).</summary>
        public static void RectToWorld(float[] rect, SpaceDefinition definition, out Vector3 center, out Vector2 size)
        {
            float cx = rect[0] + rect[2] * 0.5f;
            float cy = rect[1] + rect[3] * 0.5f;
            center = PointToWorld(cx, cy, definition);
            size = new Vector2(ToWorldLength(rect[2]), ToWorldLength(rect[3]));
        }

        /// <summary>Is a plane point inside rect [x, y, w, h]?</summary>
        public static bool RectContains(float[] rect, float x, float y)
        {
            return rect != null && rect.Length == 4
                && x >= rect[0] && x < rect[0] + rect[2]
                && y >= rect[1] && y < rect[1] + rect[3];
        }

        /// <summary>World-space center of the whole space (for floor placement / overview camera).</summary>
        public static Vector3 SpaceCenterWorld(SpaceDefinition definition)
        {
            return PointToWorld(definition.Size[0] * 0.5f, definition.Size[1] * 0.5f, definition);
        }

        /// <summary>Clamp a world position inside the space bounds (with a small inset).</summary>
        public static Vector3 ClampToSpace(Vector3 world, SpaceDefinition definition, float insetWorld = 0.3f)
        {
            float w = ToWorldLength(definition.Size[0]);
            float h = ToWorldLength(definition.Size[1]);
            world.x = Mathf.Clamp(world.x, insetWorld, w - insetWorld);
            float zMin = PLANE_Y_TO_WORLD_Z_SIGN > 0 ? insetWorld : -(h - insetWorld);
            float zMax = PLANE_Y_TO_WORLD_Z_SIGN > 0 ? h - insetWorld : -insetWorld;
            world.z = Mathf.Clamp(world.z, zMin, zMax);
            world.y = 0f;
            return world;
        }
    }
}
