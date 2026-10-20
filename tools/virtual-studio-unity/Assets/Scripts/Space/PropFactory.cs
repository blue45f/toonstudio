using System;
using System.Collections.Generic;
using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// Turns a prop definition (kind + rect) into a stage object.
    ///
    /// Resolution order:
    ///   1. A prefab registered in <see cref="Catalog"/> for the kind
    ///      (scaled to the rect footprint, anchored at the rect center).
    ///   2. A built-in primitive composition (below) so every contract kind
    ///      renders even with an empty catalog.
    ///
    /// BUNDLE ASSETS LAND HERE: prefabs converted from the Creator Bundle
    /// (EmaceArt / RG Poly) GLBs are registered in the catalog slots — one
    /// prefab per kind to start (e.g. a bundle desk for "desk", a bundle tree
    /// for "tree"). Converted GLBs must ship inside the WebGL build
    /// (Resources/StreamingAssets of this project): the service's asset rule
    /// is in-service use only, so bundle models are never exposed as separate
    /// downloadable files or an exportable library — they exist only as part
    /// of the compiled stage, exactly like a compiled game build.
    /// </summary>
    public sealed class PropFactory : MonoBehaviour
    {
        [Serializable]
        public sealed class CatalogEntry
        {
            public string Kind;
            public GameObject Prefab;
        }

        [Tooltip("kind -> prefab overrides. Empty slots fall back to primitives.")]
        public List<CatalogEntry> Catalog = new List<CatalogEntry>();

        private static readonly Dictionary<string, float> Heights = new Dictionary<string, float>
        {
            ["desk"] = 0.75f, ["table"] = 0.74f, ["bench"] = 0.45f, ["board"] = 1.9f,
            ["storefront"] = 2.6f, ["stage"] = 0.4f, ["plant"] = 0.9f, ["tree"] = 2.6f,
            ["lamp"] = 1.8f, ["sign"] = 1.6f, ["crosswalk"] = 0.02f, ["rug"] = 0.02f,
        };

        private static readonly Dictionary<string, Color> Palette = new Dictionary<string, Color>
        {
            ["desk"] = new Color(0.55f, 0.42f, 0.30f), ["table"] = new Color(0.60f, 0.46f, 0.33f),
            ["bench"] = new Color(0.50f, 0.38f, 0.27f), ["board"] = new Color(0.20f, 0.32f, 0.26f),
            ["storefront"] = new Color(0.72f, 0.55f, 0.35f), ["stage"] = new Color(0.42f, 0.33f, 0.45f),
            ["plant"] = new Color(0.30f, 0.55f, 0.32f), ["tree"] = new Color(0.25f, 0.50f, 0.28f),
            ["lamp"] = new Color(0.85f, 0.75f, 0.45f), ["sign"] = new Color(0.80f, 0.62f, 0.30f),
            ["crosswalk"] = new Color(0.85f, 0.85f, 0.85f), ["rug"] = new Color(0.45f, 0.33f, 0.50f),
        };

        private readonly Dictionary<string, Material> _materials = new Dictionary<string, Material>();

        public float HeightFor(string kind) => Heights.TryGetValue(kind, out var h) ? h : 0.8f;

        /// <summary>Create the stage object for one prop under <paramref name="parent"/>.</summary>
        public GameObject Create(SpacePropDef prop, SpaceDefinition definition, Transform parent, int index)
        {
            SpaceCoordinates.RectToWorld(prop.Rect, definition, out var center, out var size);
            float height = HeightFor(prop.Kind);

            var root = new GameObject($"prop:{prop.Kind}:{index}");
            root.transform.SetParent(parent, false);
            root.transform.position = center;

            var prefab = FindPrefab(prop.Kind);
            if (prefab != null)
            {
                var instance = Instantiate(prefab, root.transform);
                instance.transform.localPosition = Vector3.zero;
                // Prefabs are authored at a nominal 1x1 footprint; scale to the rect.
                instance.transform.localScale = new Vector3(size.x, 1f, size.y);
            }
            else
            {
                BuildPrimitive(prop.Kind, root.transform, size, height);
            }

            // Edit-mode picking + interact overlap tests share this footprint box.
            var collider = root.AddComponent<BoxCollider>();
            collider.center = new Vector3(0f, height * 0.5f, 0f);
            collider.size = new Vector3(Mathf.Max(size.x, 0.2f), Mathf.Max(height, 0.05f), Mathf.Max(size.y, 0.2f));
            collider.isTrigger = true;
            return root;
        }

        private GameObject FindPrefab(string kind)
        {
            foreach (var entry in Catalog)
            {
                if (entry != null && entry.Kind == kind && entry.Prefab != null) return entry.Prefab;
            }
            return null;
        }

        private Material MaterialFor(string kind)
        {
            if (_materials.TryGetValue(kind, out var material)) return material;
            var color = Palette.TryGetValue(kind, out var c) ? c : new Color(0.6f, 0.6f, 0.6f);
            material = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"))
            {
                color = color,
            };
            _materials[kind] = material;
            return material;
        }

        private void BuildPrimitive(string kind, Transform root, Vector2 size, float height)
        {
            var material = MaterialFor(kind);
            switch (kind)
            {
                case "rug":
                case "crosswalk":
                    AddBox(root, material, new Vector3(0f, 0.011f, 0f), new Vector3(size.x, 0.02f, size.y));
                    break;
                case "plant":
                    AddBox(root, material, new Vector3(0f, 0.25f, 0f), new Vector3(0.4f, 0.5f, 0.4f));
                    AddSphere(root, material, new Vector3(0f, 0.75f, 0f), 0.45f);
                    break;
                case "tree":
                    AddBox(root, material, new Vector3(0f, 0.6f, 0f), new Vector3(0.25f, 1.2f, 0.25f));
                    AddSphere(root, material, new Vector3(0f, 1.9f, 0f), 1.1f);
                    break;
                case "lamp":
                    AddBox(root, material, new Vector3(0f, 0.9f, 0f), new Vector3(0.08f, 1.8f, 0.08f));
                    AddSphere(root, material, new Vector3(0f, 1.85f, 0f), 0.22f);
                    break;
                case "board":
                    AddBox(root, material, new Vector3(0f, height * 0.5f, 0f), new Vector3(size.x, height, 0.08f));
                    break;
                case "stage":
                    AddBox(root, material, new Vector3(0f, height * 0.5f, 0f), new Vector3(size.x, height, size.y));
                    break;
                default:
                    // desk, table, bench, storefront, sign, and unknown kinds: a
                    // simple slab at the kind's height so the footprint reads.
                    AddBox(root, material, new Vector3(0f, height * 0.5f, 0f), new Vector3(size.x, height, size.y));
                    break;
            }
        }

        private static void AddBox(Transform parent, Material material, Vector3 localPos, Vector3 scale)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Cube);
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPos;
            part.transform.localScale = scale;
            part.GetComponent<Renderer>().sharedMaterial = material;
            UnityEngine.Object.Destroy(part.GetComponent<Collider>());
        }

        private static void AddSphere(Transform parent, Material material, Vector3 localPos, float radius)
        {
            var part = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPos;
            part.transform.localScale = Vector3.one * radius * 2f;
            part.GetComponent<Renderer>().sharedMaterial = material;
            UnityEngine.Object.Destroy(part.GetComponent<Collider>());
        }
    }
}
