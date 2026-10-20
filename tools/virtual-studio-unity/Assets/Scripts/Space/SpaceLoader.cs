using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// Builds and maintains the stage's static world from a SpaceDefinition:
    /// floor, zone overlays, props (via PropFactory), door marker — and owns
    /// the in-stage half of layout editing (the shell owns the form, the
    /// draft/persistence, and saving; this stage owns direct manipulation):
    ///
    ///   shell -&gt; stage : __tsvs_applyLayout({spec}) / __tsvs_layoutCommand /
    ///                      __tsvs_setEditMode — routed here by StageBootstrap.
    ///   stage -&gt; shell : onLayoutChanged({spec}) after any in-stage edit
    ///                      (the definition sent is stage-normalized; uploaded
    ///                      background references stay exactly as injected —
    ///                      the shell reverse-converts them before persisting),
    ///                      onLayoutSelection({selection}) on pick/clear.
    ///
    /// Rebuilds are wholesale (definitions cap at 24 zones / 64 props), which
    /// keeps the normalized-definition invariant trivially true.
    /// </summary>
    public sealed class SpaceLoader : MonoBehaviour
    {
        [Tooltip("Parent for floor/zones/props. Created at runtime if unset.")]
        public Transform SpaceRoot;
        public PropFactory PropFactory;
        public BackgroundLoader BackgroundLoader;

        public SpaceDefinition Current { get; private set; }
        public bool EditMode { get; private set; }

        /// <summary>Raised after a definition is applied (initial, pushed, or edited).</summary>
        public event Action<SpaceDefinition> SpaceApplied;

        private readonly List<GameObject> _zoneObjects = new List<GameObject>();
        private readonly List<GameObject> _propObjects = new List<GameObject>();
        private GameObject _floorObject;
        private GameObject _doorObject;

        private int _selectedCategory = -1; // 0 = zone, 1 = prop
        private int _selectedIndex = -1;
        private bool _dragging;
        private Vector3 _dragOffset;

        private static readonly Dictionary<string, Color> ZoneColors = new Dictionary<string, Color>
        {
            ["meeting"] = new Color(0.30f, 0.55f, 0.90f),
            ["presentation"] = new Color(0.85f, 0.45f, 0.75f),
            ["focus"] = new Color(0.45f, 0.75f, 0.45f),
            ["lounge"] = new Color(0.90f, 0.70f, 0.35f),
            ["open"] = new Color(0.60f, 0.65f, 0.70f),
        };

        private void Awake()
        {
            if (SpaceRoot == null)
            {
                var root = new GameObject("SpaceRoot");
                root.transform.SetParent(transform, false);
                SpaceRoot = root.transform;
            }
            if (PropFactory == null) PropFactory = GetComponent<PropFactory>() ?? gameObject.AddComponent<PropFactory>();
        }

        /// <summary>Apply a full definition: rebuild statics, then load its background.</summary>
        public async void Apply(SpaceDefinition definition)
        {
            if (definition == null || definition.Size == null || definition.Size.Length != 2) return;
            Current = definition;
            RebuildStatics();
            SpaceApplied?.Invoke(definition);
            if (BackgroundLoader != null)
            {
                await BackgroundLoader.LoadAsync(definition.Background);
            }
        }

        public void SetEditMode(bool enabled)
        {
            EditMode = enabled;
            // Zone overlays are hints in play mode, working surfaces in edit mode.
            foreach (var zoneObject in _zoneObjects)
            {
                var renderer = zoneObject.GetComponent<Renderer>();
                if (renderer != null)
                {
                    var color = renderer.material.color;
                    color.a = enabled ? 0.35f : 0.15f;
                    renderer.material.color = color;
                }
            }
            if (!enabled)
            {
                ClearSelection();
            }
        }

        /// <summary>
        /// GodotLayoutCommand from the shell panel:
        ///   {op:"add", category, kind}
        ///   {op:"update", category, index, fields:{name?, kind?, rect?}}
        ///   {op:"delete", category, index}
        /// The stage applies it to the normalized definition, rebuilds, and
        /// reports the whole definition back via onLayoutChanged.
        /// </summary>
        public void ApplyLayoutCommand(string json)
        {
            if (Current == null || string.IsNullOrEmpty(json)) return;
            JObject command;
            try { command = JObject.Parse(json); }
            catch (Exception) { return; }

            string op = command.Value<string>("op") ?? "";
            string category = command.Value<string>("category") ?? "";
            int index = command.Value<int?>("index") ?? -1;
            bool isZone = category == "zone";

            switch (op)
            {
                case "add":
                {
                    string kind = command.Value<string>("kind") ?? (isZone ? "open" : "desk");
                    float cx = Current.Size[0] * 0.5f;
                    float cy = Current.Size[1] * 0.5f;
                    if (isZone)
                    {
                        if (Current.Zones.Count >= 24) return;
                        Current.Zones.Add(new SpaceZoneDef
                        {
                            Id = "zone-" + Guid.NewGuid().ToString("N").Substring(0, 8),
                            Kind = kind,
                            Name = kind,
                            Rect = new[] { cx - 150f, cy - 100f, 300f, 200f },
                        });
                    }
                    else
                    {
                        if (Current.Props.Count >= 64) return;
                        Current.Props.Add(new SpacePropDef
                        {
                            Kind = kind,
                            Rect = DefaultPropRect(kind, cx, cy),
                        });
                    }
                    break;
                }
                case "update":
                {
                    var fields = command["fields"] as JObject;
                    if (fields == null) return;
                    if (isZone)
                    {
                        if (index < 0 || index >= Current.Zones.Count) return;
                        var zone = Current.Zones[index];
                        if (fields["name"] != null) zone.Name = fields.Value<string>("name");
                        if (fields["kind"] != null) zone.Kind = fields.Value<string>("kind");
                        if (fields["rect"] is JArray rect && rect.Count == 4) zone.Rect = rect.ToObject<float[]>();
                    }
                    else
                    {
                        if (index < 0 || index >= Current.Props.Count) return;
                        var prop = Current.Props[index];
                        if (fields["name"] != null) prop.Name = fields.Value<string>("name");
                        if (fields["kind"] != null) prop.Kind = fields.Value<string>("kind");
                        if (fields["rect"] is JArray rect && rect.Count == 4) prop.Rect = rect.ToObject<float[]>();
                    }
                    break;
                }
                case "delete":
                {
                    if (isZone)
                    {
                        if (index < 0 || index >= Current.Zones.Count) return;
                        Current.Zones.RemoveAt(index);
                    }
                    else
                    {
                        if (index < 0 || index >= Current.Props.Count) return;
                        Current.Props.RemoveAt(index);
                    }
                    break;
                }
                default:
                    return;
            }

            RebuildStatics();
            SpaceApplied?.Invoke(Current);
            TsvsBridge.Instance?.NotifyLayoutChanged(Current);
        }

        private static float[] DefaultPropRect(string kind, float cx, float cy)
        {
            // Footprints follow the static catalog's examples (desk 220x90 etc.).
            switch (kind)
            {
                case "desk": return new[] { cx - 110f, cy - 45f, 220f, 90f };
                case "board": return new[] { cx - 200f, cy - 55f, 400f, 110f };
                case "stage": return new[] { cx - 200f, cy - 120f, 400f, 240f };
                case "rug": return new[] { cx - 200f, cy - 140f, 400f, 280f };
                default: return new[] { cx - 50f, cy - 50f, 100f, 100f };
            }
        }

        // ------------------------------------------------------------------
        // Edit-mode picking + dragging (stage owns direct manipulation).
        // ------------------------------------------------------------------

        private void Update()
        {
            if (!EditMode || Current == null) return;
            var camera = Camera.main;
            if (camera == null) return;

            if (Input.GetMouseButtonDown(0))
            {
                if (TryPick(camera, out int category, out int index, out Vector3 hitPoint))
                {
                    _selectedCategory = category;
                    _selectedIndex = index;
                    _dragging = true;
                    var rect = SelectedRect();
                    if (rect != null)
                    {
                        SpaceCoordinates.RectToWorld(rect, Current, out var center, out _);
                        _dragOffset = center - hitPoint;
                    }
                    SendSelection();
                }
                else
                {
                    ClearSelection();
                }
            }
            else if (Input.GetMouseButton(0) && _dragging && _selectedIndex >= 0)
            {
                var ray = camera.ScreenPointToRay(Input.mousePosition);
                var floorPlane = new Plane(Vector3.up, Vector3.zero);
                if (floorPlane.Raycast(ray, out float enter))
                {
                    var point = ray.GetPoint(enter) + _dragOffset;
                    var rect = SelectedRect();
                    if (rect != null)
                    {
                        var defPoint = SpaceCoordinates.WorldToPoint(point, Current);
                        rect[0] = Mathf.Clamp(defPoint.x - rect[2] * 0.5f, 0f, Current.Size[0] - rect[2]);
                        rect[1] = Mathf.Clamp(defPoint.y - rect[3] * 0.5f, 0f, Current.Size[1] - rect[3]);
                        RebuildStatics();
                    }
                }
            }
            else if (Input.GetMouseButtonUp(0) && _dragging)
            {
                _dragging = false;
                TsvsBridge.Instance?.NotifyLayoutChanged(Current);
                SendSelection();
            }
        }

        private float[] SelectedRect()
        {
            if (Current == null || _selectedIndex < 0) return null;
            if (_selectedCategory == 0 && _selectedIndex < Current.Zones.Count) return Current.Zones[_selectedIndex].Rect;
            if (_selectedCategory == 1 && _selectedIndex < Current.Props.Count) return Current.Props[_selectedIndex].Rect;
            return null;
        }

        private bool TryPick(Camera camera, out int category, out int index, out Vector3 hitPoint)
        {
            category = -1; index = -1; hitPoint = Vector3.zero;
            var ray = camera.ScreenPointToRay(Input.mousePosition);
            var hits = Physics.RaycastAll(ray, 200f);
            float best = float.MaxValue;
            foreach (var hit in hits)
            {
                // Pick the nearest registered zone/prop root.
                for (int i = 0; i < _propObjects.Count; i++)
                {
                    if (hit.collider.gameObject == _propObjects[i] && hit.distance < best)
                    {
                        best = hit.distance; category = 1; index = i; hitPoint = hit.point;
                    }
                }
                for (int i = 0; i < _zoneObjects.Count; i++)
                {
                    if (hit.collider.gameObject == _zoneObjects[i] && hit.distance < best)
                    {
                        best = hit.distance; category = 0; index = i; hitPoint = hit.point;
                    }
                }
            }
            return category >= 0;
        }

        private void SendSelection()
        {
            if (Current == null || _selectedIndex < 0)
            {
                TsvsBridge.Instance?.NotifyLayoutSelection(null);
                return;
            }
            // The stage editor reports the discriminator as "type" (the shell
            // also accepts "category"); rect is the definition-space tuple.
            JObject selection;
            if (_selectedCategory == 0)
            {
                var zone = Current.Zones[_selectedIndex];
                selection = new JObject
                {
                    ["type"] = "zone",
                    ["index"] = _selectedIndex,
                    ["kind"] = zone.Kind,
                    ["name"] = zone.Name ?? "",
                    ["rect"] = new JArray(zone.Rect[0], zone.Rect[1], zone.Rect[2], zone.Rect[3]),
                };
            }
            else
            {
                var prop = Current.Props[_selectedIndex];
                selection = new JObject
                {
                    ["type"] = "prop",
                    ["index"] = _selectedIndex,
                    ["kind"] = prop.Kind,
                    ["name"] = prop.Name ?? "",
                    ["rect"] = new JArray(prop.Rect[0], prop.Rect[1], prop.Rect[2], prop.Rect[3]),
                };
            }
            TsvsBridge.Instance?.NotifyLayoutSelection(selection);
        }

        private void ClearSelection()
        {
            _selectedCategory = -1;
            _selectedIndex = -1;
            _dragging = false;
            TsvsBridge.Instance?.NotifyLayoutSelection(null);
        }

        // ------------------------------------------------------------------
        // Static world construction.
        // ------------------------------------------------------------------

        private void RebuildStatics()
        {
            foreach (var go in _zoneObjects) Destroy(go);
            foreach (var go in _propObjects) Destroy(go);
            _zoneObjects.Clear();
            _propObjects.Clear();
            if (_floorObject != null) { Destroy(_floorObject); _floorObject = null; }
            if (_doorObject != null) { Destroy(_doorObject); _doorObject = null; }

            BuildFloor();

            for (int i = 0; i < Current.Zones.Count; i++)
            {
                _zoneObjects.Add(BuildZone(Current.Zones[i], i));
            }
            for (int i = 0; i < Current.Props.Count; i++)
            {
                _propObjects.Add(PropFactory.Create(Current.Props[i], Current, SpaceRoot, i));
            }
            if (Current.Door != null && Current.Door.Length == 2)
            {
                _doorObject = new GameObject("door");
                _doorObject.transform.SetParent(SpaceRoot, false);
                _doorObject.transform.position =
                    SpaceCoordinates.PointToWorld(Current.Door[0], Current.Door[1], Current) + Vector3.up * 0.02f;
                var marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                marker.transform.SetParent(_doorObject.transform, false);
                marker.transform.localScale = new Vector3(0.5f, 0.02f, 0.5f);
                Destroy(marker.GetComponent<Collider>());
            }
        }

        private void BuildFloor()
        {
            _floorObject = GameObject.CreatePrimitive(PrimitiveType.Cube);
            _floorObject.name = "floor";
            _floorObject.transform.SetParent(SpaceRoot, false);
            float w = SpaceCoordinates.ToWorldLength(Current.Size[0]);
            float h = SpaceCoordinates.ToWorldLength(Current.Size[1]);
            _floorObject.transform.localScale = new Vector3(w, 0.05f, h);
            var center = SpaceCoordinates.SpaceCenterWorld(Current);
            _floorObject.transform.position = new Vector3(center.x, -0.026f, center.z);
            var renderer = _floorObject.GetComponent<Renderer>();
            var material = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"));
            // definition.floor is "#rrggbb" in the static catalog.
            if (!string.IsNullOrEmpty(Current.Floor) &&
                ColorUtility.TryParseHtmlString(Current.Floor, out var color))
            {
                material.color = color;
            }
            else
            {
                material.color = new Color(0.18f, 0.20f, 0.27f);
            }
            renderer.sharedMaterial = material;
        }

        private GameObject BuildZone(SpaceZoneDef zone, int index)
        {
            SpaceCoordinates.RectToWorld(zone.Rect, Current, out var center, out var size);
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = $"zone:{zone.Id}:{index}";
            go.transform.SetParent(SpaceRoot, false);
            go.transform.position = center + Vector3.up * 0.012f;
            go.transform.localScale = new Vector3(size.x, 0.024f, size.y);
            var renderer = go.GetComponent<Renderer>();
            var material = new Material(Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Unlit/Transparent"))
            {
                color = ZoneColor(zone.Kind),
            };
            // Transparent overlay: URP Unlit with alpha via _BaseColor is not
            // blend-configured by default; use the legacy transparent shader
            // fallback chain above (Standard/Unlit transparent in practice is
            // set up by the material's render queue below).
            material.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);
            material.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            material.SetInt("_ZWrite", 0);
            material.renderQueue = 3000;
            renderer.sharedMaterial = material;
            var collider = go.GetComponent<BoxCollider>();
            collider.isTrigger = true;
            return go;
        }

        private static Color ZoneColor(string kind)
        {
            var color = ZoneColors.TryGetValue(kind ?? "open", out var c) ? c : ZoneColors["open"];
            color.a = 0.15f;
            return color;
        }
    }
}
