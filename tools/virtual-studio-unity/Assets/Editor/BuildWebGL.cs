#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Tsvs.Stage.Editor
{
    /// <summary>
    /// WebGL stage build (DESIGN §5/§7). Menu: TSVS &gt; Build WebGL Stage.
    /// Also callable headless:
    ///   Unity -batchmode -quit -projectPath &lt;this project&gt; \
    ///         -executeMethod Tsvs.Stage.Editor.BuildWebGL.Build
    ///
    /// Output: apps/web/public/unity-space/ at the repo root (the shell
    /// serves the stage from there; build artifacts are committed like the
    /// Godot export was). If this project moves to the DESIGN §6.4 home
    /// (unity/VirtualStudio/), recount the ".." segments below.
    ///
    /// Serving requirements for whoever wires the static host (shell side):
    ///   - Threading is DISABLED (threadsSupport = false), matching the
    ///     current Godot build: no SharedArrayBuffer, no cross-origin
    ///     isolation requirement beyond the replicated path header rules
    ///     (DESIGN §5.1).
    ///   - index.html: no-cache; other build files: long cache (the file
    ///     names carry no hash, so index.html is the update channel).
    ///   - Brotli outputs (*.br) need Content-Encoding: br from the server;
    ///     decompressionFallback is enabled so a host without encoding rules
    ///     still boots (at a CPU cost) instead of failing.
    ///   - *.wasm must be served as application/wasm.
    /// </summary>
    public static class BuildWebGL
    {
        private const string ScenePath = "Assets/Scenes/Stage.unity";
        private const string TemplateName = "PROJECT:TsvsStage";

        [MenuItem("TSVS/Build WebGL Stage")]
        public static void Build()
        {
            ConfigurePlayerSettings();

            string outputPath = ResolveOutputPath();
            Directory.CreateDirectory(outputPath);

            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outputPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            BuildSummary summary = report.summary;
            if (summary.result != BuildResult.Succeeded)
            {
                throw new Exception($"WebGL build failed: {summary.result} ({summary.totalErrors} errors)");
            }
            Debug.Log($"[TSVS] WebGL stage built: {summary.totalSize} bytes -> {outputPath}");
        }

        private static void ConfigurePlayerSettings()
        {
            PlayerSettings.productName = "ToonStudio Virtual Stage";
            PlayerSettings.WebGL.template = TemplateName;
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;
            PlayerSettings.WebGL.decompressionFallback = true;
            // DESIGN §5.1: keep threading OFF — no SharedArrayBuffer need,
            // exactly like the current Godot export (GODOT_THREADS_ENABLED=false).
            PlayerSettings.WebGL.threadsSupport = false;
            PlayerSettings.WebGL.linkerTarget = WebGLLinkerTarget.Wasm;
            PlayerSettings.WebGL.dataCaching = true;
            // Strip to what the stage uses; keeps the wasm payload lean.
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.None;
        }

        private static string ResolveOutputPath()
        {
            // Application.dataPath = <project>/Assets
            //   .. = <project> (tools/virtual-studio-unity)
            //   ../.. = repo root
            string repoRoot = Path.GetFullPath(Path.Combine(
                Application.dataPath, "..", "..", ".."));
            return Path.Combine(repoRoot, "apps", "web", "public", "unity-space");
        }
    }
}
#endif
