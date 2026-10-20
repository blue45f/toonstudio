using UnityEngine;

namespace Tsvs.Stage
{
    /// <summary>
    /// Stage camera. Two modes:
    ///
    ///   Follow (play): perspective camera trailing the local avatar using
    ///     the background's camera block (definition.background: camHeight,
    ///     camDist, camFov, yaw, camTargetLead) — the same fields the Godot
    ///     stage consumed. Defaults are the static catalog's studio-room
    ///     values (10.5 / 12 / 46 / 0), so a space without a background still
    ///     frames sensibly. Mouse wheel adjusts distance (4..26).
    ///   Overview (edit mode): raised wide shot of the whole space so layout
    ///     dragging reads as a plan.
    ///
    /// Camera placement follows DESIGN §3.3: aim point = actor position +
    /// forward * camTargetLead; camera = aim point + yaw-rotated camDist
    /// (horizontal) + camHeight (vertical); FOV = camFov. The yaw=0 reference
    /// direction is part of the stage-3 A/B verification, like the plane
    /// scale in SpaceCoordinates.
    /// </summary>
    public sealed class CameraRig : MonoBehaviour
    {
        private Camera _camera;
        private Transform _target;
        private SpaceDefinition _definition;

        private float _height = 10.5f;
        private float _distance = 12f;
        private float _fov = 46f;
        private float _yawDeg = 0f;
        private float _targetLead = 0f;

        public bool Overview { get; set; }

        private void Awake()
        {
            _camera = GetComponent<Camera>();
            if (_camera == null) _camera = gameObject.AddComponent<Camera>();
            _camera.fieldOfView = _fov;
        }

        public void SetTarget(Transform target) => _target = target;

        public void SetSpace(SpaceDefinition definition) => _definition = definition;

        /// <summary>Apply a background's camera block; absent fields keep current values.</summary>
        public void ApplyBackgroundCamera(SpaceBackgroundDef background)
        {
            if (background == null) return;
            if (background.CamHeight.HasValue) _height = background.CamHeight.Value;
            if (background.CamDist.HasValue) _distance = background.CamDist.Value;
            if (background.CamFov.HasValue)
            {
                _fov = background.CamFov.Value;
                if (_camera != null) _camera.fieldOfView = _fov;
            }
            if (background.Yaw.HasValue) _yawDeg = background.Yaw.Value;
            if (background.CamTargetLead.HasValue) _targetLead = background.CamTargetLead.Value;
        }

        private void LateUpdate()
        {
            if (_camera == null) return;

            if (Overview && _definition != null)
            {
                float w = SpaceCoordinates.ToWorldLength(_definition.Size[0]);
                float h = SpaceCoordinates.ToWorldLength(_definition.Size[1]);
                float radius = Mathf.Max(w, h);
                var center = SpaceCoordinates.SpaceCenterWorld(_definition);
                var desired = center + new Vector3(0f, radius * 0.95f, radius * 0.45f);
                transform.position = Vector3.Lerp(
                    transform.position, desired, 1f - Mathf.Exp(-Time.deltaTime * 4f));
                transform.LookAt(center, Vector3.up);
                return;
            }

            if (_target == null) return;

            float scroll = Input.GetAxis("Mouse ScrollWheel");
            if (Mathf.Abs(scroll) > 0.001f)
            {
                _distance = Mathf.Clamp(_distance * (1f - scroll), 4f, 26f);
            }

            float yaw = _yawDeg * Mathf.Deg2Rad;
            var forward = new Vector3(-Mathf.Sin(yaw), 0f, -Mathf.Cos(yaw));
            // DESIGN §3.3: aim point leads the actor; the camera hangs back
            // from the aim point by camDist and above it by camHeight.
            var aimPoint = _target.position + forward * _targetLead;
            var desiredPosition = aimPoint - forward * _distance + Vector3.up * _height;
            transform.position = Vector3.Lerp(
                transform.position, desiredPosition, 1f - Mathf.Exp(-Time.deltaTime * 6f));
            transform.LookAt(aimPoint + Vector3.up * 1.2f, Vector3.up);
        }
    }
}
