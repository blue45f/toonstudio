// Minimal WebSocket transport for the Unity WebGL stage.
//
// Unity WebGL has no built-in WebSocket client, so the stage presence socket
// is a thin wrapper over the browser WebSocket API. Events are forwarded to
// the "RealtimeSocket" GameObject in RealtimeSocket.cs, packed as JSON
// strings: {"id":<int>,"data":"<text frame>"} for messages, {"id":<int>} for
// lifecycle events. This file is transport only — the wire message schema
// lives in RealtimeSocket.cs / PresenceSync.cs (see NOTES for what is and is
// not pinned by the shell contract).

mergeInto(LibraryManager.library, {
  TsvsSocket_Create: function (id) {
    window.__tsvsSockets = window.__tsvsSockets || {};
    window.__tsvsSockets[id] = null;
  },

  TsvsSocket_Connect: function (id, urlPtr) {
    window.__tsvsSockets = window.__tsvsSockets || {};
    var previous = window.__tsvsSockets[id];
    if (previous) {
      try { previous.close(); } catch (e) { /* already closed */ }
      window.__tsvsSockets[id] = null;
    }
    var url = UTF8ToString(urlPtr);
    var socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      sendLifecycle("JsSocketError", id);
      return;
    }
    window.__tsvsSockets[id] = socket;

    function send(method, arg) {
      var instance = window.__tsvsUnityInstance;
      if (instance && typeof instance.SendMessage === "function") {
        instance.SendMessage("RealtimeSocket", method, arg);
      }
    }
    function sendLifecycle(method, socketId) {
      send(method, JSON.stringify({ id: socketId }));
    }

    socket.onopen = function () { sendLifecycle("JsSocketOpen", id); };
    socket.onmessage = function (event) {
      send("JsSocketMessage", JSON.stringify({ id: id, data: String(event.data) }));
    };
    socket.onerror = function () { sendLifecycle("JsSocketError", id); };
    socket.onclose = function () {
      if (window.__tsvsSockets[id] === socket) window.__tsvsSockets[id] = null;
      sendLifecycle("JsSocketClose", id);
    };
  },

  TsvsSocket_Send: function (id, messagePtr) {
    var sockets = window.__tsvsSockets || {};
    var socket = sockets[id];
    if (socket && socket.readyState === 1 /* OPEN */) {
      socket.send(UTF8ToString(messagePtr));
    }
  },

  TsvsSocket_Close: function (id) {
    var sockets = window.__tsvsSockets || {};
    var socket = sockets[id];
    if (socket) {
      try { socket.close(); } catch (e) { /* already closed */ }
      sockets[id] = null;
    }
  },
});
