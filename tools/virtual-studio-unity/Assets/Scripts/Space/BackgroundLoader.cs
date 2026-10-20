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
    ///   - Format gate (multiformat design §2 / §5-5): only glTF-family
    ///     backgrounds ("glb" / "gltf") are loadable at runtime. The format
    ///     is taken from background.format when present, otherwise inferred
    ///     from the Glb reference's extension. Any other format (fbx / obj /
    ///     dae / blend / unknown) is rejected before a load is attempted:
    ///     the state settles to "failed" and BackgroundReady is raised,
    ///     exactly like a failed load, so the shell never waits on a load
    ///     that cannot succeed. Unity WebGL has no runtime importer for
    ///     FBX/OBJ/DAE/blend — those enter the stage only as editor-imported
    ///     prefabs (see README "Bundle assets"), never through this loader.
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
                // Format gate: reject non-glTF formats before any load
                // attempt. This follows the same settlement contract as a
                // failed load below — state "failed", BackgroundReady raised
                // with the background, then return — and it happens before
                // the first await, so this load still owns the serial and
                // no supersede check is needed here.
                string format = ResolveFormat(background);
                if (!IsRuntimeLoadableFormat(format))
                {
                    TsvsBridge.SetBackgroundState("failed");
                    BackgroundReady?.Invoke(background);
                    return;
                }

                string url = ResolveUrl(background.Glb);
                var import = new GltfImport();
                // Serving requirement for multi-file .gltf (design §6):
                // glTFast 6.9.0 resolves the .gltf's external .bin buffers
                // and texture images by their relative URIs against the
                // main file's URL. Those dependencies must therefore be
                // served under the same base with the original relative
                // folder structure preserved (e.g. "../Textures/..." and
                // "textures/..." references must resolve as authored) —
                // uploading or copying the .gltf file alone is not enough.
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

        /// <summary>
        /// Effective background format: the explicit background.format when
        /// present, otherwise inferred from the Glb reference (its file
        /// extension, or the uploaded-background content route — see
        /// InferFormatFromReference). Returns a normalized lower-case value
        /// without a leading dot, or null when no source yields a format.
        /// </summary>
        private static string ResolveFormat(SpaceBackgroundDef background)
        {
            if (!string.IsNullOrWhiteSpace(background.Format))
            {
                return NormalizeFormat(background.Format);
            }
            return InferFormatFromReference(background.Glb);
        }

        private static bool IsRuntimeLoadableFormat(string format)
        {
            return format == "glb" || format == "gltf";
        }

        private static string NormalizeFormat(string format)
        {
            if (string.IsNullOrWhiteSpace(format)) return null;
            string normalized = format.Trim().ToLowerInvariant();
            if (normalized.StartsWith(".", StringComparison.Ordinal))
            {
                normalized = normalized.Substring(1);
            }
            return normalized.Length == 0 ? null : normalized;
        }

        private static string InferFormatFromReference(string reference)
        {
            if (string.IsNullOrEmpty(reference)) return null;
            string path = reference;
            int queryIndex = path.IndexOfAny(new[] { '?', '#' });
            if (queryIndex >= 0) path = path.Substring(0, queryIndex);
            // Compatibility: uploaded backgrounds reach the stage as an
            // extensionless content URL (".../godot-space-backgrounds/
            // <assetId>/content", see unitySpaceBackgroundContentUrl in
            // the shell). That route has no extension to infer from, but
            // it is GLB by construction — the upload pipeline validates
            // GLB at its boundary and stays GLB-only by design (design
            // §3-2) — so it must not fall into the unknown-format reject
            // below; every other extensionless reference still does.
            if (path.IndexOf("/godot-space-backgrounds/", StringComparison.OrdinalIgnoreCase) >= 0 &&
                path.EndsWith("/content", StringComparison.OrdinalIgnoreCase))
            {
                return "glb";
            }
            int lastSlash = path.LastIndexOf('/');
            int lastDot = path.LastIndexOf('.');
            if (lastDot < 0 || lastDot < lastSlash || lastDot == path.Length - 1)
            {
                return null;
            }
            return NormalizeFormat(path.Substring(lastDot + 1));
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
