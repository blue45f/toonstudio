using System;
using System.Collections;
using System.Runtime.InteropServices;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// WebSocket transport to the realtime origin (session.ws), backed by
    /// RealtimeSocket.jslib — Unity WebGL has no built-in WebSocket client.
    /// This GameObject MUST be named "RealtimeSocket" (jslib SendMessage
    /// target).
    ///
    /// Transport only. How the ticket is presented on connect (query, first
    /// frame, subprotocol) and the virtual-space message schema are defined
    /// by the Worker / stage protocol, which is not part of the shell
    /// contract files — see NOTES.md "미확인". PresenceSync owns everything
    /// above this layer.
    /// </summary>
    public sealed class RealtimeSocket : MonoBehaviour
    {
        public event Action Opened;
        public event Action<string> MessageReceived;
        public event Action Closed;
        public event Action Errored;

        private const int SocketId = 1;
        private string _lastUrl;
        private bool _created;

        public bool IsOpen { get; private set; }

        public void Connect(string url)
        {
            if (string.IsNullOrEmpty(url)) return;
            _lastUrl = url;
#if UNITY_WEBGL && !UNITY_EDITOR
            if (!_created)
            {
                TsvsSocket_Create(SocketId);
                _created = true;
            }
            TsvsSocket_Connect(SocketId, url);
#else
            // Editor / non-WebGL stub: pretend the socket opened so stage
            // logic can be exercised without a server. Sends are dropped.
            StartCoroutine(EditorOpenStub());
#endif
        }

        public void Reconnect()
        {
            if (!string.IsNullOrEmpty(_lastUrl)) Connect(_lastUrl);
        }

        public void Send(string message)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (IsOpen) TsvsSocket_Send(SocketId, message);
#else
            _ = message; // stub transport drops frames by design
#endif
        }

        public void Close()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            if (_created) TsvsSocket_Close(SocketId);
#endif
            IsOpen = false;
        }

        private IEnumerator EditorOpenStub()
        {
            yield return null;
            IsOpen = true;
            Opened?.Invoke();
        }

        // ---- jslib callbacks (names contractual with RealtimeSocket.jslib) ----

        public void JsSocketOpen(string json)
        {
            if (!Matches(json)) return;
            IsOpen = true;
            Opened?.Invoke();
        }

        public void JsSocketMessage(string json)
        {
            var payload = Parse(json);
            if (payload == null) return;
            var data = payload.Value<string>("data");
            if (data != null) MessageReceived?.Invoke(data);
        }

        public void JsSocketClose(string json)
        {
            if (!Matches(json)) return;
            IsOpen = false;
            Closed?.Invoke();
        }

        public void JsSocketError(string json)
        {
            if (!Matches(json)) return;
            Errored?.Invoke();
        }

        private static JObject Parse(string json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            try { return JObject.Parse(json); }
            catch (Exception) { return null; }
        }

        private static bool Matches(string json)
        {
            var payload = Parse(json);
            return payload != null && payload.Value<int?>("id") == SocketId;
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void TsvsSocket_Create(int id);
        [DllImport("__Internal")] private static extern void TsvsSocket_Connect(int id, string url);
        [DllImport("__Internal")] private static extern void TsvsSocket_Send(int id, string message);
        [DllImport("__Internal")] private static extern void TsvsSocket_Close(int id);
#endif
    }
}
