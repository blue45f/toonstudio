// TSVS stage -> shell notifications (WebGL JavaScript interop).
//
// The React shell registers `window.__tsvsHost` (13 methods, each taking one
// JSON string) on the TOP window; this stage runs in a same-origin iframe, so
// the calls go to `window.parent.__tsvsHost` (DESIGN §4.3 — names are frozen,
// do not rename). Shell -> stage calls are NOT here: the page glue in the
// TsvsStage WebGL template defines the `__tsvs_*` globals and forwards them
// via unityInstance.SendMessage("TsvsBridge", "On*", ...), queueing calls
// that arrive before the instance is ready (DESIGN §4.2).
//
// Also here: the background-load state the shell polls. During the engine
// transition the value is published under BOTH names — the current shell
// polls `__godotBgState`; the renamed shell will poll `__tsvsBgState`
// (DESIGN §4.2). Keep them in sync.

mergeInto(LibraryManager.library, {
  // C# -> shell notification. `method` is the __tsvsHost member name
  // (onGodotReady, onZoneChanged, ...); `json` is the payload string.
  TsvsHost_Notify: function (methodPtr, jsonPtr) {
    var method = UTF8ToString(methodPtr);
    var json = UTF8ToString(jsonPtr);
    var host = null;
    try {
      host = (window.parent && window.parent.__tsvsHost) || window.__tsvsHost || null;
    } catch (e) {
      host = window.__tsvsHost || null;
    }
    if (host && typeof host[method] === "function") {
      host[method](json);
    }
  },

  // Background load state: idle | loading | ready | failed (both names).
  TsvsBridge_SetBgState: function (statePtr) {
    var state = UTF8ToString(statePtr);
    window.__godotBgState = state;
    window.__tsvsBgState = state;
  },

  // Ask the page glue to flush any shell->stage calls queued before the
  // Unity instance was ready (called from TsvsBridge.Start).
  TsvsBridge_FlushQueue: function () {
    if (typeof window.__tsvsFlushQueue === "function") {
      window.__tsvsFlushQueue();
    }
  },

  // Boot query string, pre-parsed by the page glue into
  // window.__tsvsBootQuery (DESIGN §4.2); falls back to location.search.
  TsvsBridge_GetQuery: function () {
    var query = window.__tsvsBootQuery || window.location.search || "";
    var bufferSize = lengthBytesUTF8(query) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(query, buffer, bufferSize);
    return buffer;
  },

  // Origin used to absolutize stage-relative background GLB paths.
  TsvsBridge_GetOrigin: function () {
    var origin = window.location.origin || "";
    var bufferSize = lengthBytesUTF8(origin) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(origin, buffer, bufferSize);
    return buffer;
  },
});
