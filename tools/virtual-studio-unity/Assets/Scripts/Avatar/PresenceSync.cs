using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// Presence synchronization entry point: owns the avatar roster (self,
    /// remote peers, NPCs) and every stage-side judgement the shell consumes —
    /// zone occupancy, proximity size, prop interaction, own-position reports.
    /// Zone judgement is stage-owned by contract; the shell only renders the
    /// notifications.
    ///
    /// WIRE SEAM: how roster/pose/bubble/signal facts arrive from the server
    /// is the stage&lt;-&gt;Worker protocol, which is not defined by the shell
    /// contract files (the Godot project source is not in the repo). The
    /// public Receive*/AddOrUpdate* methods below are the exact entry points
    /// that protocol layer will call once its schema is pinned; outbound
    /// facts are raised as events for the same layer to serialize. Nothing in
    /// this class invents a wire format. See NOTES.md.
    /// </summary>
    public sealed class PresenceSync : MonoBehaviour
    {
        [Tooltip("Parent transform for all avatar objects.")]
        public Transform AvatarRoot;

        /// <summary>Outbound facts for the (future) wire layer to serialize to the room.</summary>
        public event Action<string, Vector3> PoseOutbound;        // actorId, world position
        public event Action<string, string> BubbleOutbound;        // actorId, text
        public event Action<string, string> EmoteOutbound;         // actorId, emote id
        public event Action<string> SignalOutbound;                // raw signal record JSON (shell meeting session -> room)
        public event Action<string, long> LayoutNoticeOutbound;    // spaceId, revision (shell save -> room)

        /// <summary>Peers within this world-space distance count as "nearby" (260 definition units).</summary>
        public float ProximityRadiusWorld = 2.6f;

        private SpaceDefinition _definition;
        private AvatarController _self;
        private readonly Dictionary<string, AvatarController> _remotes = new Dictionary<string, AvatarController>();
        private readonly List<AvatarController> _npcs = new List<AvatarController>();
        private readonly List<string> _joinOrder = new List<string>();

        private float _evaluateAt;
        private string _lastZoneSignature = "";
        private int _lastProximitySize = -1;
        private string _currentInteractKind = "";
        private float _lastPositionNotifyAt;
        private Vector2 _lastPositionNotified;
        private bool _hidden;

        public AvatarController Self => _self;
        public string SelfActorId => _self != null ? _self.ActorId : "";

        private void Awake()
        {
            if (AvatarRoot == null)
            {
                var root = new GameObject("AvatarRoot");
                root.transform.SetParent(transform, false);
                AvatarRoot = root.transform;
            }
        }

        public void SetDefinition(SpaceDefinition definition)
        {
            _definition = definition;
            if (_self != null) _self.SetDefinition(definition);
            foreach (var remote in _remotes.Values) remote.SetDefinition(definition);
        }

        // ------------------------------------------------------------------
        // Roster management.
        // ------------------------------------------------------------------

        /// <summary>
        /// Spawn (or refresh) the local avatar from the injected session.
        /// The stage assigns the actor id and reports it in onZoneChanged;
        /// the shell then uses that exact id to address bubbles/emotes.
        /// </summary>
        public AvatarController SpawnSelf(StageSession session, Vector2? restoreDefPoint)
        {
            if (_self == null)
            {
                var go = new GameObject("avatar:self");
                go.transform.SetParent(AvatarRoot, false);
                _self = go.AddComponent<AvatarController>();
                string actorId = "actor-" + Guid.NewGuid().ToString("N").Substring(0, 8);
                _self.Init(actorId, "", session?.Name ?? "", session?.Color, true, false, _definition, go.transform);
                _self.Moved += OnSelfMoved;
                _joinOrder.Add(actorId);
            }
            if (_definition != null)
            {
                if (restoreDefPoint.HasValue)
                {
                    _self.PlaceAtDefinitionPoint(restoreDefPoint.Value.x, restoreDefPoint.Value.y);
                }
                else if (_definition.Door != null && _definition.Door.Length == 2)
                {
                    _self.PlaceAtDefinitionPoint(_definition.Door[0], _definition.Door[1]);
                }
                else
                {
                    _self.PlaceAtDefinitionPoint(_definition.Size[0] * 0.5f, _definition.Size[1] * 0.5f);
                }
            }
            return _self;
        }

        /// <summary>Spawn the local avatar for local-only boot (no session).</summary>
        public AvatarController SpawnLocalSelf(string displayName, Vector2? restoreDefPoint)
        {
            return SpawnSelf(
                new StageSession { Name = displayName ?? "", Color = "#7a99e6" },
                restoreDefPoint);
        }

        /// <summary>Wire-layer entry: a remote participant appears or moves.</summary>
        public AvatarController AddOrUpdateRemote(
            string actorId, string clientId, string displayName, string colorHex, Vector3 worldPosition)
        {
            if (string.IsNullOrEmpty(actorId)) return null;
            if (!_remotes.TryGetValue(actorId, out var avatar))
            {
                var go = new GameObject("avatar:" + actorId);
                go.transform.SetParent(AvatarRoot, false);
                avatar = go.AddComponent<AvatarController>();
                avatar.Init(actorId, clientId, displayName, colorHex, false, false, _definition, go.transform);
                avatar.transform.position = worldPosition;
                _remotes[actorId] = avatar;
                _joinOrder.Add(actorId);
            }
            avatar.SetTargetWorldPosition(worldPosition);
            return avatar;
        }

        /// <summary>Wire-layer entry: a remote participant leaves.</summary>
        public void RemoveRemote(string actorId)
        {
            if (_remotes.TryGetValue(actorId, out var avatar))
            {
                Destroy(avatar.gameObject);
                _remotes.Remove(actorId);
                _joinOrder.Remove(actorId);
            }
        }

        /// <summary>(Re)spawn NPCs from the current definition. NPCs are local-only演出:
        /// they never enter zone occupancy, proximity, or the wire roster.</summary>
        public void RespawnNpcs()
        {
            foreach (var npc in _npcs)
            {
                if (npc != null) Destroy(npc.gameObject);
            }
            _npcs.Clear();
            if (_definition?.Npcs == null) return;
            int index = 0;
            foreach (var npcDef in _definition.Npcs)
            {
                var go = new GameObject("npc:" + (npcDef.Name ?? index.ToString()));
                go.transform.SetParent(AvatarRoot, false);
                var avatar = go.AddComponent<AvatarController>();
                avatar.Init("npc-" + index, "", npcDef.Name, npcDef.Color, false, true, _definition, go.transform);
                avatar.SetNpcRoute(npcDef, _definition);
                _npcs.Add(avatar);
                index++;
            }
        }

        // ------------------------------------------------------------------
        // Shell-requested displays (bubble / emote bar, chat form).
        // ------------------------------------------------------------------

        /// <summary>__tsvs_showBubble from the shell: show on the addressed avatar;
        /// if it is ours, also broadcast (the shell does not log our own bubble
        /// from this call — remote stages report it back via onBubble).</summary>
        public void ShowBubbleFromShell(string actorId, string text)
        {
            var avatar = FindAvatar(actorId);
            if (avatar == null) return;
            avatar.ShowBubble(text);
            if (avatar == _self) BubbleOutbound?.Invoke(actorId, text);
        }

        /// <summary>__tsvs_showEmote from the shell emote bar.</summary>
        public void ShowEmoteFromShell(string actorId, string emoteId)
        {
            var avatar = FindAvatar(actorId);
            if (avatar == null) return;
            avatar.ShowEmote(emoteId);
            if (avatar == _self) EmoteOutbound?.Invoke(actorId, emoteId);
        }

        // ------------------------------------------------------------------
        // Wire-layer receive entry points (facts from peers).
        // ------------------------------------------------------------------

        public void ReceiveBubble(string actorId, string text)
        {
            FindAvatar(actorId)?.ShowBubble(text);
            TsvsBridge.Instance?.NotifyBubble(actorId, text);
        }

        public void ReceiveEmote(string actorId, string emoteId)
        {
            FindAvatar(actorId)?.ShowEmote(emoteId);
            TsvsBridge.Instance?.NotifyEmote(actorId, emoteId);
        }

        /// <summary>A peer's meeting signal record arrived; hand it to the shell's meeting session.</summary>
        public void ReceiveSignal(string fromClientId, string signalJson)
        {
            TsvsBridge.Instance?.NotifySignal(fromClientId, signalJson);
        }

        /// <summary>A peer's shell saved a layout; our shell decides (dirty = conflict flow).</summary>
        public void ReceiveLayoutRemote(string spaceId)
        {
            TsvsBridge.Instance?.NotifyLayoutRemote(spaceId);
        }

        /// <summary>Shell meeting session -> room: forward the raw record to the wire layer.</summary>
        public void ForwardSignalFromShell(string signalJson)
        {
            SignalOutbound?.Invoke(signalJson);
        }

        /// <summary>Shell saved a layout and asks the stage to tell the room.</summary>
        public void ForwardLayoutNotice(string spaceId, long revision)
        {
            LayoutNoticeOutbound?.Invoke(spaceId, revision);
        }

        public void SetHidden(bool hidden) => _hidden = hidden;

        /// <summary>
        /// The shell's 20s watchdog (__tsvs_bridgePing) orders the stage to
        /// emit its presence keepalive on the socket, because the shell timer
        /// keeps running even if the stage loop stalls. The keepalive frame
        /// itself belongs to the wire layer (schema not in the shell
        /// contract — NOTES); this is its hook point.
        /// </summary>
        public void HandleBridgePing()
        {
            // Wire seam: send the presence keepalive frame here once the
            // stage<->Worker protocol is pinned.
        }

        private AvatarController FindAvatar(string actorId)
        {
            if (string.IsNullOrEmpty(actorId)) return null;
            if (_self != null && _self.ActorId == actorId) return _self;
            return _remotes.TryGetValue(actorId, out var avatar) ? avatar : null;
        }

        // ------------------------------------------------------------------
        // Judgement loop: zones, proximity, interact, position reports.
        // ------------------------------------------------------------------

        private void Update()
        {
            if (Time.time < _evaluateAt) return;
            _evaluateAt = Time.time + 0.25f;
            if (_definition == null || _self == null) return;
            EvaluateZones();
            EvaluateProximity();
            EvaluateInteract();
        }

        private void EvaluateZones()
        {
            var selfPoint = SpaceCoordinates.WorldToPoint(_self.WorldPosition, _definition);
            string selfZoneId = "";
            var occupants = new Dictionary<string, List<string>>();
            foreach (var zone in _definition.Zones) occupants[zone.Id] = new List<string>();

            var participants = new List<AvatarController>();
            if (_self != null) participants.Add(_self);
            foreach (var actorId in _joinOrder)
            {
                if (_remotes.TryGetValue(actorId, out var remote)) participants.Add(remote);
            }

            foreach (var participant in participants)
            {
                var point = SpaceCoordinates.WorldToPoint(participant.WorldPosition, _definition);
                foreach (var zone in _definition.Zones)
                {
                    if (SpaceCoordinates.RectContains(zone.Rect, point.x, point.y))
                    {
                        occupants[zone.Id].Add(participant.ActorId);
                        if (participant == _self) selfZoneId = zone.Id;
                        break; // first matching zone wins, as in the plan view
                    }
                }
            }

            // Presenter: earliest-joined current occupant of any presentation
            // zone. (Stage-internal rule — the Godot stage's exact rule is not
            // in the shell contract; the shell only displays the name.)
            string presenterActorId = "";
            foreach (var actorId in _joinOrder)
            {
                bool isPresenter = false;
                foreach (var zone in _definition.Zones)
                {
                    if (zone.Kind == "presentation" && occupants[zone.Id].Contains(actorId))
                    {
                        isPresenter = true;
                        break;
                    }
                }
                if (isPresenter) { presenterActorId = actorId; break; }
            }

            var zonesArray = new JArray();
            var signature = new System.Text.StringBuilder();
            signature.Append(selfZoneId).Append('|').Append(presenterActorId);
            foreach (var zone in _definition.Zones)
            {
                var list = occupants[zone.Id];
                signature.Append('|').Append(zone.Id).Append(':').Append(string.Join(",", list));
                var occupantsArray = new JArray();
                foreach (var actorId in list) occupantsArray.Add(actorId);
                zonesArray.Add(new JObject
                {
                    ["zoneId"] = zone.Id,
                    ["kind"] = zone.Kind,
                    ["name"] = zone.Name ?? "",
                    ["occupants"] = occupantsArray,
                });
            }

            if (signature.ToString() == _lastZoneSignature) return;
            _lastZoneSignature = signature.ToString();

            var peerClientIds = new JObject();
            var names = new JObject();
            foreach (var participant in participants)
            {
                names[participant.ActorId] = participant.DisplayName ?? "";
                if (participant != _self) peerClientIds[participant.ActorId] = participant.ClientId ?? "";
            }

            var payload = new JObject
            {
                ["selfZoneId"] = selfZoneId,
                ["selfActorId"] = _self.ActorId,
                ["selfClientId"] = _self.ClientId ?? "",
                ["presenterActorId"] = presenterActorId,
                ["peerClientIds"] = peerClientIds,
                ["names"] = names,
                ["zones"] = zonesArray,
            };
            TsvsBridge.Instance?.NotifyZoneChanged(payload);
        }

        private void EvaluateProximity()
        {
            if (_hidden) return;
            int size = 1; // self
            foreach (var remote in _remotes.Values)
            {
                var delta = remote.WorldPosition - _self.WorldPosition;
                delta.y = 0f;
                if (delta.magnitude <= ProximityRadiusWorld) size++;
            }
            if (size == _lastProximitySize) return;
            _lastProximitySize = size;
            TsvsBridge.Instance?.NotifyProximityChanged(size);
        }

        private void EvaluateInteract()
        {
            var selfPoint = SpaceCoordinates.WorldToPoint(_self.WorldPosition, _definition);
            string kind = "";
            foreach (var prop in _definition.Props)
            {
                if (Array.IndexOf(SpaceKinds.InteractablePropKinds, prop.Kind) >= 0 &&
                    SpaceCoordinates.RectContains(prop.Rect, selfPoint.x, selfPoint.y))
                {
                    kind = prop.Kind;
                    break;
                }
            }
            if (kind == _currentInteractKind) return;
            _currentInteractKind = kind;
            if (!string.IsNullOrEmpty(kind))
            {
                TsvsBridge.Instance?.NotifyInteract(kind);
            }
        }

        private void OnSelfMoved(AvatarController avatar)
        {
            PoseOutbound?.Invoke(avatar.ActorId, avatar.WorldPosition);

            // Position persistence is shell-owned (localStorage, 30-day TTL);
            // the stage only reports facts, throttled.
            if (_definition == null || _hidden) return;
            var point = SpaceCoordinates.WorldToPoint(avatar.WorldPosition, _definition);
            if (Time.time - _lastPositionNotifyAt < 0.5f) return;
            if ((point - _lastPositionNotified).sqrMagnitude < 4f) return; // < 2 definition units
            _lastPositionNotifyAt = Time.time;
            _lastPositionNotified = point;
            TsvsBridge.Instance?.NotifyPosition(_definition.Id, point.x, point.y);
        }
    }
}
