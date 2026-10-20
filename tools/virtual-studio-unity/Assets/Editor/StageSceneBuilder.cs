#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Tsvs.Stage.Editor
{
    /// <summary>
    /// Generates the Stage scene from code (Menu: TSVS &gt; Create Stage Scene),
    /// so no binary scene has to be authored or committed blind. Run it once
    /// after opening the project; re-running rebuilds the scene from scratch.
    ///
    /// Scene layout produced:
    ///   Main Camera        (CameraRig + AudioListener) — tag MainCamera
    ///   Directional Light
    ///   TsvsBridge         (TsvsBridge)   — name is CONTRACTUAL: the page
    ///                        glue SendMessage targets exactly "TsvsBridge"
    ///   RealtimeSocket     (RealtimeSocket) — name is contractual with
    ///                        RealtimeSocket.jslib
    ///   StageBootstrap     (StageBootstrap)
    ///   SpaceLoader        (SpaceLoader + PropFactory)
    ///     BackgroundRoot   (BackgroundLoader)
    ///   PresenceSync       (PresenceSync)
    ///     AvatarRoot       (avatars spawn here)
    ///
    /// Everything else (floor, zones, props, avatars, nameplates) is built
    /// at runtime from the space definition; the scene is intentionally
    /// almost empty.
    /// </summary>
    public static class StageSceneBuilder
    {
        private const string SceneDir = "Assets/Scenes";
        private const string ScenePath = SceneDir + "/Stage.unity";

        [MenuItem("TSVS/Create Stage Scene")]
        public static void Create()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // Camera + rig. Initial framing assumes the default room's span
            // (16 x 12 m from plane origin); CameraRig takes over at runtime.
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.fieldOfView = 46f;
            camera.nearClipPlane = 0.1f;
            camera.farClipPlane = 200f;
            cameraObject.AddComponent<AudioListener>();
            cameraObject.AddComponent<CameraRig>();
            cameraObject.transform.position = new Vector3(8f, 10.5f, 18f);
            cameraObject.transform.LookAt(new Vector3(8f, 0f, 6f));

            var lightObject = new GameObject("Directional Light");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            lightObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            var bridgeObject = new GameObject("TsvsBridge");
            bridgeObject.AddComponent<TsvsBridge>();

            var socketObject = new GameObject("RealtimeSocket");
            socketObject.AddComponent<RealtimeSocket>();

            var bootstrapObject = new GameObject("StageBootstrap");
            bootstrapObject.AddComponent<StageBootstrap>();

            var loaderObject = new GameObject("SpaceLoader");
            var spaceLoader = loaderObject.AddComponent<SpaceLoader>();
            var propFactory = loaderObject.AddComponent<PropFactory>();
            spaceLoader.PropFactory = propFactory;

            var backgroundRoot = new GameObject("BackgroundRoot");
            backgroundRoot.transform.SetParent(loaderObject.transform, false);
            var backgroundLoader = backgroundRoot.AddComponent<BackgroundLoader>();
            spaceLoader.BackgroundLoader = backgroundLoader;

            var presenceObject = new GameObject("PresenceSync");
            var presence = presenceObject.AddComponent<PresenceSync>();
            var avatarRoot = new GameObject("AvatarRoot");
            avatarRoot.transform.SetParent(presenceObject.transform, false);
            presence.AvatarRoot = avatarRoot.transform;

            Directory.CreateDirectory(SceneDir);
            EditorSceneManager.SaveScene(scene, ScenePath);

            var scenes = EditorBuildSettings.scenes;
            bool alreadyListed = false;
            foreach (var entry in scenes)
            {
                if (entry.path == ScenePath) alreadyListed = true;
            }
            if (!alreadyListed)
            {
                var list = new System.Collections.Generic.List<EditorBuildSettingsScene>(scenes)
                {
                    new EditorBuildSettingsScene(ScenePath, true),
                };
                EditorBuildSettings.scenes = list.ToArray();
            }

            Debug.Log($"[TSVS] Stage scene created at {ScenePath}");
        }
    }
}
#endif
