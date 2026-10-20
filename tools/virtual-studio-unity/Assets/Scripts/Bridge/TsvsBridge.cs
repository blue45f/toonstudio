using System;
using System.Runtime.InteropServices;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// The shell &lt;-&gt; stage boundary, Unity side (DESIGN §2/§4 — the names in
    /// this file are frozen by the design's bridge contract table):
    ///
    ///   shell -&gt; stage : the page glue (TsvsStage WebGL template) defines the
    ///     `__tsvs_*` globals on this iframe's window and forwards them as
    ///     SendMessage("TsvsBridge", "On*", arg). This GameObject MUST be
    ///     named "TsvsBridge" and the On* method names must match DESIGN §4.2.
    ///     Boolean arguments arrive as "1"/"0" strings (SendMessage carries a
    ///     single string/number argument).
    ///     `__tsvs_requestReconnect` is deliberately NOT implemented: the
    ///     shell declares it but never calls it (DESIGN §2.2 #4).
    ///   stage -&gt; shell : `window.parent.__tsvsHost.*` (13 methods, one JSON
    ///     string each) via TsvsHost.jslib — see the Notify* methods.
    ///
    /// Ownership split (unchanged): the shell owns account session, ticket
    /// issuing/renewal, connection liveness policy, chat log, and layout
    /// persistence. This stage owns space rendering, movement, and zone
    /// judgement, and only reports facts upward.
    /// </summary>
    public sealed class TsvsBridge : MonoBehaviour
    {
        public static TsvsBridge Instance { get; private set; }

        // ---- shell -> stage events (subscribed by StageBootstrap / PresenceSync / SpaceLoader)
        public event Action<StageSession> SessionReceived;
        public event Action<bool> VisibilityChanged;
        public event Action BridgePingReceived;
        /// <summary>Raw JSON of a meeting signal record from the shell's meeting session (opaque — relay only).</summary>
        public event Action<string> SignalFromShell;
        public event Action<string, string> BubbleRequested;   // actorId, text
        public event Action<string, string> EmoteRequested;    // actorId, emote id
        public event Action<bool> EditModeChanged;
        /// <summary>Definition pushed by the shell ({spec} unwrapped).</summary>
        public event Action<SpaceDefinition> LayoutApplied;
        /// <summary>Raw JSON of a layout command (add/update/delete).</summary>
        public event Action<string> LayoutCommandReceived;
        public event Action<string, long> LayoutNotified;      // spaceId, revision

        private bool _editMode;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        private void Start()
        {
            // The scene is initialized: let the page glue flush any shell
            // calls it queued before the Unity instance was ready (§4.2).
#if UNITY_WEBGL && !UNITY_EDITOR
            TsvsBridge_FlushQueue();
#endif
        }

        // ------------------------------------------------------------------
        // shell -> stage entry points (DESIGN §4.2). Called by the page glue
        // through SendMessage — GameObject name, method names, and the
        // single-string argument convention are contractual.
        // ------------------------------------------------------------------

        public void OnSetSession(string json)
        {
            StageSession session = null;
            try
            {
                session = JsonConvert.DeserializeObject<StageSession>(json);
            }
            catch (Exception)
            {
                // A malformed session is the shell's bug, not a stage state:
                // stay unconnected; the shell re-injects on its own timers.
                session = null;
            }
            if (session != null) SessionReceived?.Invoke(session);
        }

        public void OnSetVisibility(string hidden)
        {
            VisibilityChanged?.Invoke(hidden == "1");
        }

        public void OnBridgePing(string ignored)
        {
            BridgePingReceived?.Invoke();
        }

        public void OnSendSignal(string json)
        {
            SignalFromShell?.Invoke(json);
        }

        public void OnShowBubble(string json)
        {
            var payload = ParseObject(json);
            if (payload == null) return;
            BubbleRequested?.Invoke(
                payload.Value<string>("actorId") ?? string.Empty,
                payload.Value<string>("text") ?? string.Empty);
        }

        public void OnShowEmote(string json)
        {
            var payload = ParseObject(json);
            if (payload == null) return;
            EmoteRequested?.Invoke(
                payload.Value<string>("actorId") ?? string.Empty,
                payload.Value<string>("emote") ?? string.Empty);
        }

        public void OnSetEditMode(string enabled)
        {
            _editMode = enabled == "1";
            EditModeChanged?.Invoke(_editMode);
        }

        public void OnApplyLayout(string json)
        {
            var payload = ParseObject(json);
            var spec = payload?["spec"] as JObject;
            if (spec == null) return;
            try
            {
                var definition = spec.ToObject<SpaceDefinition>();
                if (definition != null) LayoutApplied?.Invoke(definition);
            }
            catch (Exception)
            {
                // Ignore a spec the stage cannot model; the shell keeps its draft.
            }
        }

        public void OnLayoutCommand(string json)
        {
            LayoutCommandReceived?.Invoke(json);
        }

        public void OnNotifyLayout(string json)
        {
            var payload = ParseObject(json);
            if (payload == null) return;
            LayoutNotified?.Invoke(
                payload.Value<string>("spaceId") ?? string.Empty,
                payload.Value<long?>("revision") ?? 0);
        }

        // ------------------------------------------------------------------
        // stage -> shell notifications (window.parent.__tsvsHost.*, DESIGN
        // §4.3). Every host method takes exactly one JSON string; the two
        // argument-less notifications pass "" exactly as the design maps.
        // ------------------------------------------------------------------

        public void NotifyReady() => Notify("onGodotReady", "");

        public void NotifyTicketNeeded() => Notify("onTicketNeeded", "");

        public void NotifyConnectionState(bool connected)
        {
            var payload = new JObject { ["state"] = connected ? "connected" : "disconnected" };
            Notify("onConnectionState", payload.ToString(Formatting.None));
        }

        public void NotifyZoneChanged(JObject payload) =>
            Notify("onZoneChanged", payload.ToString(Formatting.None));

        public void NotifyProximityChanged(int size)
        {
            var payload = new JObject { ["size"] = size };
            Notify("onProximityChanged", payload.ToString(Formatting.None));
        }

        /// <summary>Relay a signal record received from a peer to the shell's meeting session (envelope only; payload stays opaque).</summary>
        public void NotifySignal(string fromClientId, string signalJson)
        {
            var payload = new JObject
            {
                ["fromClientId"] = fromClientId,
                ["payload"] = string.IsNullOrEmpty(signalJson) ? new JObject() : JToken.Parse(signalJson),
            };
            Notify("onSignal", payload.ToString(Formatting.None));
        }

        public void NotifyBubble(string fromActorId, string text)
        {
            var payload = new JObject { ["fromActorId"] = fromActorId, ["text"] = text };
            Notify("onBubble", payload.ToString(Formatting.None));
        }

        public void NotifyEmote(string fromActorId, string emote)
        {
            var payload = new JObject { ["fromActorId"] = fromActorId, ["emote"] = emote };
            Notify("onEmote", payload.ToString(Formatting.None));
        }

        public void NotifyInteract(string kind)
        {
            var payload = new JObject { ["kind"] = kind };
            Notify("onInteract", payload.ToString(Formatting.None));
        }

        /// <summary>Own position report, in definition (plane) units — the shell persists it locally (30-day TTL).</summary>
        public void NotifyPosition(string spaceId, float x, float y)
        {
            var payload = new JObject { ["spaceId"] = spaceId, ["x"] = x, ["y"] = y };
            Notify("onPosition", payload.ToString(Formatting.None));
        }

        /// <summary>Stage-normalized definition after an in-stage edit (shell adopts it as its draft).</summary>
        public void NotifyLayoutChanged(SpaceDefinition definition)
        {
            var payload = new JObject { ["spec"] = JObject.FromObject(definition) };
            Notify("onLayoutChanged", payload.ToString(Formatting.None));
        }

        /// <summary>Selection in edit mode; pass null to clear (shell maps {} to no selection). The discriminator key is "type".</summary>
        public void NotifyLayoutSelection(JObject selection)
        {
            var payload = new JObject { ["selection"] = selection ?? new JObject() };
            Notify("onLayoutSelection", payload.ToString(Formatting.None));
        }

        public void NotifyLayoutRemote(string spaceId)
        {
            var payload = new JObject { ["spaceId"] = spaceId };
            Notify("onLayoutRemote", payload.ToString(Formatting.None));
        }

        // ------------------------------------------------------------------
        // Stage state + page facts the shell reads directly.
        // ------------------------------------------------------------------

        /// <summary>Background loader state: idle | loading | ready | failed (published as both __godotBgState and __tsvsBgState during transition).</summary>
        public static void SetBackgroundState(string state)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            TsvsBridge_SetBgState(state);
#endif
        }

        /// <summary>Boot query string of the stage page (?space=, ?local=1, &amp;px=, &amp;py=).</summary>
        public static string GetQueryString()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return TsvsBridge_GetQuery();
#else
            return string.Empty;
#endif
        }

        /// <summary>Page origin, for absolutizing stage-relative GLB paths.</summary>
        public static string GetOrigin()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            return TsvsBridge_GetOrigin();
#else
            return string.Empty;
#endif
        }

        private static JObject ParseObject(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            try { return JObject.Parse(json); }
            catch (Exception) { return null; }
        }

        private static void Notify(string method, string json)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            TsvsHost_Notify(method, json);
#else
            // Editor / non-WebGL: no shell exists; notifications are dropped by design.
            _ = method; _ = json;
#endif
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void TsvsHost_Notify(string method, string json);
        [DllImport("__Internal")] private static extern void TsvsBridge_SetBgState(string state);
        [DllImport("__Internal")] private static extern void TsvsBridge_FlushQueue();
        [DllImport("__Internal")] private static extern string TsvsBridge_GetQuery();
        [DllImport("__Internal")] private static extern string TsvsBridge_GetOrigin();
#endif
    }
}
