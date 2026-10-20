using System;
using System.Threading.Tasks;
using GLTFast;
using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// Loads the space's background GLB at runtime (definition.background.glb).
    ///
    /// Contract points honored here:
    ///   - The shell polls window.__godotBgState (idle|loading|ready|failed)
    ///     and will not inject a session or a layout while a background load
    ///     is in flight — the Godot stage corrupted loads when requests
    ///     overlapped, so this loader serializes loads and always settles the
    ///     state, including on failure.
    ///   - Injected references are already stage-ready: absolute content URLs
    ///     for uploads, stage-base absolute paths ("/unity-space/...") for
    ///     static defaults.
    ///     A bare relative reference only appears in local boot (catalog copy
    ///     shipped with the stage) and is resolved against the shell's static
    ///     stage base, mirroring resolveGodotBackgroundForStage.
    ///   - hideNodes names are deactivated after instantiation; camera fields
    ///     are handed to CameraRig via BackgroundReady, never applied here.
    /// </summary>
    public sealed class BackgroundLoader : MonoBehaviour
    {
        // Unity stage base (DESIGN §3.3/§6: the shell converts static
        // references to this base when injecting; the Godot-era base was
        // "/godot-space/"). Used only for bare relative refs in local boot.
        public const string StageBasePath = "/unity-space/";

        /// <summary>Raised after a background finishes loading (or clears), with its camera block.</summary>
        public event Action<SpaceBackgroundDef> BackgroundReady;

        private GameObject _currentInstance;
        private int _loadSerial;

        public string CurrentGlb { get; private set; }

        private void Start()
        {
            TsvsBridge.SetBackgroundState("idle");
        }

        public async Task LoadAsync(SpaceBackgroundDef background)
        {
            int serial = ++_loadSerial;
            ClearCurrent();

            if (background == null || string.IsNullOrEmpty(background.Glb))
            {
                CurrentGlb = null;
                TsvsBridge.SetBackgroundState("idle");
                BackgroundReady?.Invoke(null);
                return;
            }

            CurrentGlb = background.Glb;
            TsvsBridge.SetBackgroundState("loading");
            try
            {
                string url = ResolveUrl(background.Glb);
                var import = new GltfImport();
                bool loaded = await import.Load(url);
                if (serial != _loadSerial)
                {
                    import.Dispose();
                    return; // superseded by a newer load; the newer one owns the state
                }
                if (!loaded)
                {
                    import.Dispose();
                    TsvsBridge.SetBackgroundState("failed");
                    BackgroundReady?.Invoke(background);
                    return;
                }

                var holder = new GameObject("background:" + background.Glb);
                holder.transform.SetParent(transform, false);
                bool instantiated = await import.InstantiateMainSceneAsync(holder.transform);
                if (serial != _loadSerial)
                {
                    Destroy(holder);
                    import.Dispose();
                    return;
                }
                if (!instantiated)
                {
                    Destroy(holder);
                    import.Dispose();
                    TsvsBridge.SetBackgroundState("failed");
                    BackgroundReady?.Invoke(background);
                    return;
                }

                ApplyHideNodes(holder.transform, background.HideNodes);
                _currentInstance = holder;
                TsvsBridge.SetBackgroundState("ready");
                BackgroundReady?.Invoke(background);
            }
            catch (Exception)
            {
                if (serial == _loadSerial)
                {
                    TsvsBridge.SetBackgroundState("failed");
                    BackgroundReady?.Invoke(background);
                }
            }
        }

        private void ClearCurrent()
        {
            if (_currentInstance != null)
            {
                Destroy(_currentInstance);
                _currentInstance = null;
            }
        }

        private static void ApplyHideNodes(Transform root, string[] hideNodes)
        {
            if (hideNodes == null || hideNodes.Length == 0) return;
            var targets = new System.Collections.Generic.HashSet<string>(hideNodes);
            foreach (var child in root.GetComponentsInChildren<Transform>(true))
            {
                if (targets.Contains(child.name)) child.gameObject.SetActive(false);
            }
        }

        private static string ResolveUrl(string glb)
        {
            if (glb.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                glb.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return glb;
            }
            string origin = TsvsBridge.GetOrigin();
            if (glb.StartsWith("/")) return origin + glb;
            return origin + StageBasePath + glb;
        }
    }
}
