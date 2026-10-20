using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// Emote id -&gt; glyph table, copied from the shell catalog
    /// (GODOT_EMOTE_GLYPHS in studio-godot-space-embed-support.ts; the same ids
    /// as the web emote-catalog). Unknown ids render nothing — the shell
    /// applies the same rule on its side.
    /// </summary>
    public static class EmoteGlyphs
    {
        private static readonly Dictionary<string, string> Glyphs = new Dictionary<string, string>
        {
            ["wave"] = "👋", ["heart"] = "❤️", ["party"] = "🎉", ["thumbs-up"] = "👍",
            ["laugh"] = "😂", ["clap"] = "👏", ["wow"] = "😮", ["think"] = "🤔",
            ["idea"] = "💡", ["dance"] = "💃", ["sparkles"] = "✨", ["question"] = "❓",
            ["exclaim"] = "❗", ["coffee"] = "☕", ["music"] = "🎵", ["sleep"] = "😴",
        };

        public static bool TryGet(string emoteId, out string glyph) =>
            Glyphs.TryGetValue(emoteId ?? string.Empty, out glyph);
    }

    /// <summary>
    /// Builds the in-world avatar visual: colored capsule body + floating
    /// nameplate + bubble label. Kept code-built (no scene assets) so the
    /// Stage scene stays generatable by StageSceneBuilder and avatars can be
    /// spawned for any roster size. Bundle character models (Creator Bundle
    /// cartoon characters / villagers) can replace the capsule later by
    /// skinning this root — presence and movement logic do not depend on the
    /// visual.
    /// </summary>
    public static class AvatarViewFactory
    {
        public static GameObject Build(string displayName, string colorHex, Transform parent)
        {
            var root = new GameObject("avatar");
            root.transform.SetParent(parent, false);

            var color = new Color(0.45f, 0.60f, 0.90f);
            if (!string.IsNullOrEmpty(colorHex)) ColorUtility.TryParseHtmlString(colorHex, out color);

            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "body";
            body.transform.SetParent(root.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.9f, 0f);
            body.transform.localScale = new Vector3(0.62f, 0.9f, 0.62f);
            var material = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"))
            {
                color = color,
            };
            body.GetComponent<Renderer>().sharedMaterial = material;
            UnityEngine.Object.Destroy(body.GetComponent<Collider>());

            var nameplate = CreateLabel(root.transform, "nameplate", 2.15f, 0.32f);
            nameplate.text = displayName ?? string.Empty;

            var bubble = CreateLabel(root.transform, "bubble", 2.65f, 0.42f);
            bubble.gameObject.SetActive(false);
            return root;
        }

        private static TextMeshPro CreateLabel(Transform parent, string name, float y, float fontSize)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0f, y, 0f);
            var label = go.AddComponent<TextMeshPro>();
            label.fontSize = fontSize;
            label.alignment = TextAlignmentOptions.Center;
            label.color = Color.white;
            label.outlineWidth = 0.18f;
            label.outlineColor = new Color(0f, 0f, 0f, 0.65f);
            label.rectTransform.sizeDelta = new Vector2(3.2f, 0.7f);
            return label;
        }
    }

    /// <summary>
    /// One participant in the space: the local user, a remote peer, or an NPC.
    ///
    ///   - local : keyboard (WASD/arrows) + click-to-move on the floor plane;
    ///             every move is reported to PresenceSync (position save +
    ///             peer broadcast seam live there, not here).
    ///   - remote: PresenceSync sets TargetWorldPosition; this lerps to it.
    ///   - npc   : walks the definition's waypoint loop and shows its lines
    ///             as local-only bubbles (NPC演出 is stage-local per contract).
    ///
    /// Movement input specifics of the Godot stage are not in the shell
    /// contract (stage source is not in the repo); the bindings above are
    /// this stage's choice and are confined to this class.
    /// </summary>
    public sealed class AvatarController : MonoBehaviour
    {
        public string ActorId { get; private set; } = "";
        public string ClientId { get; private set; } = "";
        public string DisplayName { get; private set; } = "";
        public bool IsLocal { get; private set; }
        public bool IsNpc { get; private set; }

        /// <summary>Set false in edit mode / while the tab is hidden.</summary>
        public bool MovementEnabled = true;
        /// <summary>World-space floor position (y is always 0).</summary>
        public Vector3 WorldPosition => transform.position;

        /// <summary>Raised for the local avatar whenever its position changes.</summary>
        public event Action<AvatarController> Moved;

        private const float MoveSpeed = 3.4f;      // world units / s
        private const float NpcSpeed = 1.1f;
        private const float RemoteSnapDistance = 6f;

        private SpaceDefinition _definition;
        private Vector3? _clickTarget;
        private Vector3 _remoteTarget;
        private bool _hasRemoteTarget;

        private List<Vector3> _npcWaypoints;
        private string[] _npcLines;
        private int _npcWaypointIndex;
        private float _npcPauseUntil;
        private float _npcNextLineAt;

        private TextMeshPro _bubbleLabel;
        private float _bubbleHideAt;

        public void Init(
            string actorId, string clientId, string displayName, string colorHex,
            bool isLocal, bool isNpc, SpaceDefinition definition, Transform parent)
        {
            ActorId = actorId ?? "";
            ClientId = clientId ?? "";
            DisplayName = displayName ?? "";
            IsLocal = isLocal;
            IsNpc = isNpc;
            _definition = definition;

            var visual = AvatarViewFactory.Build(displayName, colorHex, parent);
            visual.transform.SetParent(transform, false);
            _bubbleLabel = visual.transform.Find("bubble")?.GetComponent<TextMeshPro>();
            _remoteTarget = transform.position;
        }

        public void SetDefinition(SpaceDefinition definition) => _definition = definition;

        public void PlaceAtDefinitionPoint(float x, float y)
        {
            if (_definition == null) return;
            transform.position = SpaceCoordinates.PointToWorld(x, y, _definition);
            _remoteTarget = transform.position;
            _hasRemoteTarget = true;
            _clickTarget = null;
        }

        public void SetTargetWorldPosition(Vector3 worldPosition)
        {
            _remoteTarget = worldPosition;
            _hasRemoteTarget = true;
        }

        /// <summary>NPC patrol setup from the definition's points (definition units).</summary>
        public void SetNpcRoute(SpaceNpcDef npc, SpaceDefinition definition)
        {
            _npcWaypoints = new List<Vector3>();
            if (npc?.Points != null)
            {
                foreach (var point in npc.Points)
                {
                    if (point != null && point.Length == 2)
                        _npcWaypoints.Add(SpaceCoordinates.PointToWorld(point[0], point[1], definition));
                }
            }
            _npcLines = npc?.Lines;
            _npcWaypointIndex = 0;
            _npcPauseUntil = 0f;
            _npcNextLineAt = Time.time + UnityEngine.Random.Range(4f, 10f);
            if (_npcWaypoints.Count > 0) transform.position = _npcWaypoints[0];
        }

        public void ShowBubble(string text, float seconds = 4f)
        {
            if (_bubbleLabel == null || string.IsNullOrEmpty(text)) return;
            _bubbleLabel.text = text;
            _bubbleLabel.fontSize = 0.42f;
            _bubbleLabel.gameObject.SetActive(true);
            _bubbleHideAt = Time.time + seconds;
        }

        /// <summary>Emote hook: renders the catalog glyph above the head.</summary>
        public void ShowEmote(string emoteId)
        {
            if (!EmoteGlyphs.TryGet(emoteId, out var glyph)) return;
            if (_bubbleLabel == null) return;
            _bubbleLabel.text = glyph;
            _bubbleLabel.fontSize = 0.8f;
            _bubbleLabel.gameObject.SetActive(true);
            _bubbleHideAt = Time.time + 2.2f;
        }

        private void Update()
        {
            if (IsNpc)
            {
                UpdateNpc();
            }
            else if (IsLocal)
            {
                UpdateLocal();
            }
            else if (_hasRemoteTarget)
            {
                var delta = _remoteTarget - transform.position;
                delta.y = 0f;
                if (delta.magnitude > RemoteSnapDistance)
                {
                    transform.position = _remoteTarget;
                }
                else if (delta.magnitude > 0.01f)
                {
                    transform.position += delta * Mathf.Min(1f, Time.deltaTime * 10f);
                }
            }

            if (_bubbleLabel != null && _bubbleLabel.gameObject.activeSelf && Time.time >= _bubbleHideAt)
            {
                _bubbleLabel.gameObject.SetActive(false);
            }
        }

        private void LateUpdate()
        {
            // Billboard the labels toward the main camera.
            var camera = Camera.main;
            if (camera == null) return;
            foreach (var label in GetComponentsInChildren<TextMeshPro>(true))
            {
                label.transform.rotation = camera.transform.rotation;
            }
        }

        private void UpdateLocal()
        {
            if (!MovementEnabled || _definition == null) return;
            var before = transform.position;

            float h = Input.GetAxisRaw("Horizontal");
            float v = Input.GetAxisRaw("Vertical");
            var move = new Vector3(h, 0f, v);
            if (move.sqrMagnitude > 0.01f)
            {
                _clickTarget = null;
                transform.position += move.normalized * MoveSpeed * Time.deltaTime;
            }
            else
            {
                if (Input.GetMouseButtonDown(0))
                {
                    var camera = Camera.main;
                    if (camera != null)
                    {
                        var ray = camera.ScreenPointToRay(Input.mousePosition);
                        var floorPlane = new Plane(Vector3.up, Vector3.zero);
                        if (floorPlane.Raycast(ray, out float enter))
                        {
                            _clickTarget = ray.GetPoint(enter);
                        }
                    }
                }
                if (_clickTarget.HasValue)
                {
                    var delta = _clickTarget.Value - transform.position;
                    delta.y = 0f;
                    if (delta.magnitude < 0.05f)
                    {
                        _clickTarget = null;
                    }
                    else
                    {
                        transform.position += delta.normalized * Mathf.Min(
                            MoveSpeed * Time.deltaTime, delta.magnitude);
                    }
                }
            }

            transform.position = SpaceCoordinates.ClampToSpace(transform.position, _definition);
            if ((transform.position - before).sqrMagnitude > 0.000001f)
            {
                Moved?.Invoke(this);
            }
        }

        private void UpdateNpc()
        {
            if (_npcWaypoints == null || _npcWaypoints.Count < 2) return;
            if (Time.time < _npcPauseUntil)
            {
                MaybeShowNpcLine();
                return;
            }
            int next = (_npcWaypointIndex + 1) % _npcWaypoints.Count;
            var target = _npcWaypoints[next];
            var delta = target - transform.position;
            delta.y = 0f;
            if (delta.magnitude < 0.05f)
            {
                _npcWaypointIndex = next;
                _npcPauseUntil = Time.time + UnityEngine.Random.Range(1.5f, 4f);
                return;
            }
            transform.position += delta.normalized * NpcSpeed * Time.deltaTime;
            MaybeShowNpcLine();
        }

        private void MaybeShowNpcLine()
        {
            if (_npcLines == null || _npcLines.Length == 0) return;
            if (Time.time < _npcNextLineAt) return;
            _npcNextLineAt = Time.time + UnityEngine.Random.Range(9f, 18f);
            ShowBubble(_npcLines[UnityEngine.Random.Range(0, _npcLines.Length)], 3.5f);
        }
    }
}
