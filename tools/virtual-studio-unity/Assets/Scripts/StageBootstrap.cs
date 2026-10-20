using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Tsvs.Stage
{
    /// <summary>
    /// Boot sequencing and cross-component wiring. Boot contract (DESIGN §2.1):
    /// the stage page URL carries ?space=, ?local=1, &amp;px=, &amp;py=; space
    /// switching is done by the shell reloading the iframe, never in-stage.
    ///
    /// Order of operations:
    ///   1. Wire bridge/loader/socket events (Awake).
    ///   2. Parse the boot query (Start).
    ///   3a. Local mode: fetch the stage catalog directly (DESIGN §3.4 — the
    ///       stage reads /unity-space/spaces.json itself, like the Godot
    ///       stage did), apply the boot space, spawn the local avatar at
    ///       px/py (or the catalog-only spawn point, or the door).
    ///   3b. Networked mode: NotifyReady — the shell answers with
    ///       __tsvs_setSession; the session's `space` (or a later
    ///       applyLayout) provides the definition; the socket connects to
    ///       session.ws and its open/close drives onConnectionState and
    ///       onTicketNeeded exactly as the contract prescribes.
    /// </summary>
    public sealed class StageBootstrap : MonoBehaviour
    {
        /// <summary>
        /// Raw realtime frames from the socket. The stage&lt;-&gt;Worker wire
        /// schema is not defined by the shell contract (see NOTES), so frames
        /// surface here for the future protocol layer, which will dispatch
        /// into PresenceSync's Receive* entry points.
        /// </summary>
        public event Action<string> WireMessage;

        private TsvsBridge _bridge;
        private SpaceLoader _spaceLoader;
        private BackgroundLoader _backgroundLoader;
        private PresenceSync _presence;
        private CameraRig _cameraRig;
        private RealtimeSocket _socket;

        private bool _localMode;
        private string _bootSpaceId;
        private Vector2? _bootRestorePoint;
        private StageSession _session;
        private SpaceDefinition _currentDefinition;
        private string _placedSpaceId;
        private bool _editMode;
        private bool _hidden;

        private void Awake()
        {
            _bridge = FindFirstObjectByType<TsvsBridge>();
            _spaceLoader = FindFirstObjectByType<SpaceLoader>();
            _backgroundLoader = FindFirstObjectByType<BackgroundLoader>();
            _presence = FindFirstObjectByType<PresenceSync>();
            _cameraRig = FindFirstObjectByType<CameraRig>();
            _socket = FindFirstObjectByType<RealtimeSocket>();

            if (_bridge != null)
            {
                _bridge.SessionReceived += OnSessionReceived;
                _bridge.VisibilityChanged += OnVisibilityChanged;
                _bridge.BridgePingReceived += () => _presence?.HandleBridgePing();
                _bridge.SignalFromShell += json => _presence?.ForwardSignalFromShell(json);
                _bridge.BubbleRequested += (actorId, text) => _presence?.ShowBubbleFromShell(actorId, text);
                _bridge.EmoteRequested += (actorId, emote) => _presence?.ShowEmoteFromShell(actorId, emote);
                _bridge.EditModeChanged += OnEditModeChanged;
                _bridge.LayoutApplied += definition => _spaceLoader?.Apply(definition);
                _bridge.LayoutCommandReceived += json => _spaceLoader?.ApplyLayoutCommand(json);
                _bridge.LayoutNotified += (spaceId, revision) => _presence?.ForwardLayoutNotice(spaceId, revision);
            }
            if (_spaceLoader != null) _spaceLoader.SpaceApplied += OnSpaceApplied;
            if (_backgroundLoader != null)
            {
                _backgroundLoader.BackgroundReady += background => _cameraRig?.ApplyBackgroundCamera(background);
            }
            if (_socket != null)
            {
                _socket.Opened += () => _bridge?.NotifyConnectionState(true);
                _socket.Closed += OnSocketClosed;
                _socket.MessageReceived += data => WireMessage?.Invoke(data);
            }
        }

        private void Start()
        {
            ParseQuery(TsvsBridge.GetQueryString());
            if (_localMode)
            {
                StartCoroutine(BootLocal());
            }
            else
            {
                // Scene is initialized; tell the shell. It answers with a
                // ticket + __tsvs_setSession (its watchdog re-injects if the
                // ticket would expire before we connect).
                _bridge?.NotifyReady();
            }
        }

        // ------------------------------------------------------------------
        // Local boot (personal spaces: no ticket, no socket).
        // ------------------------------------------------------------------

        private IEnumerator BootLocal()
        {
            string url = TsvsBridge.GetOrigin() + "/unity-space/spaces.json";
#if UNITY_EDITOR
            if (string.IsNullOrEmpty(TsvsBridge.GetOrigin()))
            {
                url = "file://" + Application.streamingAssetsPath + "/spaces.json";
            }
#endif
            string catalogJson = null;
            using (var request = UnityWebRequest.Get(url))
            {
                yield return request.SendWebRequest();
                if (request.result == UnityWebRequest.Result.Success)
                {
                    catalogJson = request.downloadHandler.text;
                }
            }

            SpaceDefinition bootDefinition = null;
            Vector2? catalogSpawn = null;
            if (!string.IsNullOrEmpty(catalogJson))
            {
                try
                {
                    var catalog = JObject.Parse(catalogJson);
                    var spaces = catalog["spaces"] as JArray;
                    if (spaces != null)
                    {
                        foreach (var entry in spaces)
                        {
                            var definition = entry.ToObject<SpaceDefinition>();
                            if (definition == null) continue;
                            if (bootDefinition == null ||
                                (!string.IsNullOrEmpty(_bootSpaceId) && definition.Id == _bootSpaceId))
                            {
                                bootDefinition = definition;
                                // Catalog-only field (DESIGN §3.4): spawn.a is
                                // stripped from shell-delivered definitions,
                                // so only this direct read can use it.
                                var spawn = entry["spawn"]?["a"] as JArray;
                                if (spawn != null && spawn.Count == 2)
                                {
                                    catalogSpawn = new Vector2(spawn[0].Value<float>(), spawn[1].Value<float>());
                                }
                                if (!string.IsNullOrEmpty(_bootSpaceId) && definition.Id == _bootSpaceId) break;
                            }
                        }
                    }
                }
                catch (Exception)
                {
                    bootDefinition = null;
                }
            }

            if (bootDefinition != null)
            {
                if (_bootRestorePoint == null && catalogSpawn != null) _bootRestorePoint = catalogSpawn;
                _spaceLoader?.Apply(bootDefinition);
            }
            _bridge?.NotifyReady();
        }

        // ------------------------------------------------------------------
        // Networked flow.
        // ------------------------------------------------------------------

        private void OnSessionReceived(StageSession session)
        {
            bool firstSession = _session == null;
            _session = session;
            if (session.Space != null && _currentDefinition == null)
            {
                _spaceLoader?.Apply(session.Space);
            }
            TrySpawnSelf();
            if (_socket != null)
            {
                if (!_socket.IsOpen)
                {
                    // Ticket presentation on connect (query / first frame /
                    // subprotocol) belongs to the wire layer — the transport
                    // connects to the origin the shell injected (NOTES).
                    _socket.Connect(session.Ws);
                }
                else if (!firstSession)
                {
                    // Re-injected session while connected: the ticket is for
                    // the wire layer's re-auth; the transport stays up.
                }
            }
        }

        private void OnSocketClosed()
        {
            _bridge?.NotifyConnectionState(false);
            // DESIGN §2.3-3: after a drop, onTicketNeeded is the re-entry —
            // the shell re-issues and re-injects; OnSessionReceived then
            // reconnects the transport.
            _bridge?.NotifyTicketNeeded();
        }

        // ------------------------------------------------------------------
        // Shared application flow.
        // ------------------------------------------------------------------

        private void OnSpaceApplied(SpaceDefinition definition)
        {
            _currentDefinition = definition;
            _presence?.SetDefinition(definition);
            _presence?.RespawnNpcs();
            _cameraRig?.SetSpace(definition);
            TrySpawnSelf();
        }

        private void TrySpawnSelf()
        {
            if (_presence == null || _currentDefinition == null) return;

            if (_presence.Self == null)
            {
                if (_localMode)
                {
                    var self = _presence.SpawnLocalSelf("나", _bootRestorePoint);
                    _cameraRig?.SetTarget(self.transform);
                    _placedSpaceId = _currentDefinition.Id;
                }
                else
                {
                    if (_session == null) return;
                    Vector2? restore = null;
                    if (_session.Restore != null && _session.Restore.SpaceId == _currentDefinition.Id)
                    {
                        restore = new Vector2(_session.Restore.X, _session.Restore.Y);
                    }
                    var self = _presence.SpawnSelf(_session, restore);
                    _cameraRig?.SetTarget(self.transform);
                    _placedSpaceId = _currentDefinition.Id;
                }
                UpdateMovementGate();
            }
            else if (_placedSpaceId != _currentDefinition.Id)
            {
                // A different space was applied in place (the normal flow is
                // an iframe reload; this is the defensive path).
                var door = _currentDefinition.Door;
                if (door != null && door.Length == 2)
                {
                    _presence.Self.PlaceAtDefinitionPoint(door[0], door[1]);
                }
                else
                {
                    _presence.Self.PlaceAtDefinitionPoint(
                        _currentDefinition.Size[0] * 0.5f, _currentDefinition.Size[1] * 0.5f);
                }
                _placedSpaceId = _currentDefinition.Id;
            }
        }

        private void OnEditModeChanged(bool enabled)
        {
            _editMode = enabled;
            _spaceLoader?.SetEditMode(enabled);
            if (_cameraRig != null) _cameraRig.Overview = enabled;
            UpdateMovementGate();
        }

        private void OnVisibilityChanged(bool hidden)
        {
            _hidden = hidden;
            _presence?.SetHidden(hidden);
            UpdateMovementGate();
        }

        private void UpdateMovementGate()
        {
            if (_presence?.Self != null)
            {
                _presence.Self.MovementEnabled = !_editMode && !_hidden;
            }
        }

        private void ParseQuery(string query)
        {
            _localMode = false;
            _bootSpaceId = null;
            _bootRestorePoint = null;
            if (string.IsNullOrEmpty(query)) return;

            var values = new Dictionary<string, string>();
            var trimmed = query.StartsWith("?") ? query.Substring(1) : query;
            foreach (var pair in trimmed.Split('&'))
            {
                if (string.IsNullOrEmpty(pair)) continue;
                int eq = pair.IndexOf('=');
                string key = eq >= 0 ? pair.Substring(0, eq) : pair;
                string value = eq >= 0 ? Uri.UnescapeDataString(pair.Substring(eq + 1)) : "";
                values[Uri.UnescapeDataString(key)] = value;
            }

            _localMode = values.TryGetValue("local", out var local) && local == "1";
            if (values.TryGetValue("space", out var space)) _bootSpaceId = space;
            if (values.TryGetValue("px", out var px) && values.TryGetValue("py", out var py) &&
                float.TryParse(px, NumberStyles.Float, CultureInfo.InvariantCulture, out var x) &&
                float.TryParse(py, NumberStyles.Float, CultureInfo.InvariantCulture, out var y))
            {
                _bootRestorePoint = new Vector2(x, y);
            }
        }
    }
}
