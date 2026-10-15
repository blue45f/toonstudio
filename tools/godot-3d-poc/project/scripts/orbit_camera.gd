extends Node3D
## 궤도 카메라 + 렌즈 시프트(2점 투시 보정).
##
## 렌즈 시프트는 Camera3D 의 PROJECTION_FRUSTUM 모드(size, frustum_offset)로 구현한다.
## 공식 근거(2026-10-15 확인): docs.godotengine.org/en/4.4/classes/class_camera3d.html
##  - frustum_offset: "tilted frustum" 효과(예: Y-shearing), PROJECTION_FRUSTUM 에서만 유효.
##  - size: 문서는 "미터"로 표기하지만 KEEP_HEIGHT 에서는 near 평면에서의 세로 폭으로 동작한다(verify-two-point 가 수치로 확인).
##
## 규약은 apps/web 의 SceneDocument 카메라와 같다(`studio-bg3d-lens.ts` / `studio-bg3d-scene-document.ts`):
##  - fovDegrees 는 세로 화각(Camera3D.fov 와 KEEP_HEIGHT 에서 동일).
##  - lensShift [sx, sy] 는 프레임 전체 폭/높이에 대한 비율이다. sy > 0 이면 내용이 위로 이동한다.
##  - 2점 투시: 시선을 수평으로 만들고(target.y := position.y) 원래 타깃을 프레임 안으로 되돌리는
##    lensShiftY = -tanPitch / (2 * tanHalfFov) 를 적용한다.

signal view_changed(state: Dictionary)

var camera: Camera3D

var target := Vector3(0.0, 1.0, 0.0)
var yaw_deg := 30.0
var pitch_deg := 15.0
var distance := 6.0
var fov_deg := 40.0
var near := 0.05
var far := 200.0
## true 면 위의 pitch 로 위치만 정하고 시선은 수평으로 유지하며 lensShiftY 를 자동 계산한다.
var two_point := false
## 사용자가 지정한 추가 렌즈 시프트(프레임 비율). two_point 의 자동 시프트에 더해진다.
var lens_shift := Vector2.ZERO

var _drag := false

func _init() -> void:
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	add_child(camera)

func _ready() -> void:
	camera.make_current()
	apply()

func eye_position() -> Vector3:
	var yaw := deg_to_rad(yaw_deg)
	var pitch := deg_to_rad(pitch_deg)
	var dir := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	return target + dir * distance

## 시선이 바라보는 점. 2점 투시면 눈높이의 수평 점이다.
func look_point() -> Vector3:
	var eye := eye_position()
	if two_point and Vector2(target.x - eye.x, target.z - eye.z).length() > 1e-4:
		return Vector3(target.x, eye.y, target.z)
	return target

## 프레임 비율 단위의 유효 렌즈 시프트(사용자 시프트 + 2점 투시 자동 시프트).
func effective_shift() -> Vector2:
	var shift := lens_shift
	if two_point:
		var eye := eye_position()
		var horizontal := Vector2(target.x - eye.x, target.z - eye.z).length()
		if horizontal > 1e-4:
			var tan_pitch := (target.y - eye.y) / horizontal
			var tan_half_fov := tan(deg_to_rad(fov_deg) * 0.5)
			shift.y += clampf(-tan_pitch / (2.0 * tan_half_fov), -2.0, 2.0)
	return shift

## cam 의 투영(원근/프러스텀)을 현재 상태와 주어진 종횡비로 맞춘다. 위치·방향은 건드리지 않는다.
func configure_projection(cam: Camera3D, aspect: float) -> void:
	cam.keep_aspect = Camera3D.KEEP_HEIGHT
	cam.near = near
	cam.far = far
	var shift := effective_shift()
	if shift.is_zero_approx():
		cam.projection = Camera3D.PROJECTION_PERSPECTIVE
		cam.fov = fov_deg
	else:
		# near 평면에서의 세로 폭 size = 2 * near * tan(fov/2). 가로 오프셋은 종횡비를 곱한다.
		var size_v := 2.0 * near * tan(deg_to_rad(fov_deg) * 0.5)
		cam.projection = Camera3D.PROJECTION_FRUSTUM
		cam.size = size_v
		cam.frustum_offset = Vector2(shift.x * size_v * aspect, -shift.y * size_v)

## 현재 상태를 Camera3D 에 반영하고 DTO 로 돌려준다.
func apply() -> Dictionary:
	var eye := eye_position()
	var forward := look_point() - eye
	if forward.length() < 1e-6:
		forward = Vector3.FORWARD
	camera.transform = Transform3D(Basis.looking_at(forward.normalized(), Vector3.UP), eye)
	configure_projection(camera, _aspect())
	var state := to_dto()
	var shift := effective_shift()
	state["effectiveLensShift"] = [shift.x, shift.y]
	view_changed.emit(state)
	return state

func _aspect() -> float:
	var viewport := get_viewport()
	if viewport == null:
		return 16.0 / 9.0
	var size := viewport.get_visible_rect().size
	return size.x / maxf(size.y, 1.0)

func to_dto() -> Dictionary:
	return {
		"yaw": yaw_deg, "pitch": pitch_deg, "distance": distance, "fovDegrees": fov_deg,
		"target": [target.x, target.y, target.z], "near": near, "far": far,
		"twoPoint": two_point, "lensShift": [lens_shift.x, lens_shift.y],
		"projection": "frustum" if camera.projection == Camera3D.PROJECTION_FRUSTUM else "perspective",
	}

## SceneDocument 카메라 DTO(부분 갱신 허용)를 적용한다.
func apply_dto(dto: Dictionary) -> Dictionary:
	yaw_deg = float(dto.get("yaw", yaw_deg))
	pitch_deg = clampf(float(dto.get("pitch", pitch_deg)), -89.0, 89.0)
	distance = maxf(float(dto.get("distance", distance)), 0.05)
	fov_deg = clampf(float(dto.get("fovDegrees", fov_deg)), 10.0, 120.0)
	if dto.has("target"):
		var t: Array = dto["target"]
		if t.size() == 3:
			target = Vector3(float(t[0]), float(t[1]), float(t[2]))
	near = maxf(float(dto.get("near", near)), 0.001)
	far = maxf(float(dto.get("far", far)), near + 0.01)
	two_point = bool(dto.get("twoPoint", two_point))
	if dto.has("lensShift"):
		var s: Array = dto["lensShift"]
		if s.size() == 2:
			lens_shift = Vector2(clampf(float(s[0]), -2.0, 2.0), clampf(float(s[1]), -2.0, 2.0))
	return apply()

## 모델 AABB 에 맞춰 타깃·거리·클립을 맞춘다.
func frame_aabb(aabb: AABB) -> Dictionary:
	var center := aabb.get_center()
	var radius := maxf(aabb.size.length() * 0.5, 0.05)
	target = center
	distance = radius / sin(deg_to_rad(fov_deg) * 0.5) * 1.15
	near = maxf(distance * 0.01, 0.02)
	far = distance + radius * 4.0
	return apply()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_drag = mb.pressed
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			distance = maxf(distance * 0.9, 0.05)
			apply()
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			distance *= 1.1
			apply()
	elif event is InputEventMouseMotion and _drag:
		var mm := event as InputEventMouseMotion
		yaw_deg -= mm.relative.x * 0.4
		pitch_deg = clampf(pitch_deg + mm.relative.y * 0.4, -89.0, 89.0)
		apply()
