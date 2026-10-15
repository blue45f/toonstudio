extends RefCounted
## GLB 런타임 로더: GLTFDocument 로 바이트에서 씬을 만들고 StandardMaterial3D 를 툰 머티리얼 + 외곽선으로 바꾼다.
##
## 공식 근거(2026-10-15 확인):
##  - docs.godotengine.org/en/4.4/classes/class_gltfdocument.html (append_from_buffer / generate_scene)
##  - docs.godotengine.org/en/4.4/tutorials/io/runtime_file_loading_and_saving.html (런타임 로드 주의점)
## 저장소 실측 근거: apps/api/src/modules/studio-godot-space-layout/studio-godot-background-glb.ts 는 2026-10-12 헤드리스 실측으로
## EXT_meshopt_compression·KHR_mesh_quantization·KHR_draco_mesh_compression·KHR_texture_basisu 가 required 면 append 가 거절된다고 기록한다.
## 이 PoC 는 같은 경로를 실제 압축 GLB 로 다시 시험한다(measure/run.mjs 의 extension-matrix).

const TOON_SHADER: Shader = preload("res://shaders/toon.gdshader")
const OUTLINE_SHADER: Shader = preload("res://shaders/outline.gdshader")

var toon_bands := 3
var toon_softness := 0.02
var outline_px := 2.0
var outline_enabled := true

var _outline_material: ShaderMaterial

func _init() -> void:
	_outline_material = ShaderMaterial.new()
	_outline_material.shader = OUTLINE_SHADER
	_outline_material.set_shader_parameter("outline_px", outline_px)

func supported_extensions() -> PackedStringArray:
	return GLTFDocument.get_supported_gltf_extensions()

## GLB 바이트를 파싱해 Node3D 루트를 만든다. 결과 Dictionary 의 "ok" 로 성공 여부를 판단한다.
func load_bytes(bytes: PackedByteArray, toon: bool) -> Dictionary:
	var result := {"ok": false, "bytes": bytes.size()}
	var t0 := Time.get_ticks_usec()
	var state := GLTFState.new()
	var doc := GLTFDocument.new()
	var err := doc.append_from_buffer(bytes, "", state)
	var t1 := Time.get_ticks_usec()
	result["parseMs"] = float(t1 - t0) / 1000.0
	if err != OK:
		result["error"] = "append_from_buffer 실패: %s (%d)" % [error_string(err), err]
		result["errorCode"] = int(err)
		return result
	var json_dict: Dictionary = state.json if state.json != null else {}
	result["extensionsUsed"] = json_dict.get("extensionsUsed", [])
	result["extensionsRequired"] = json_dict.get("extensionsRequired", [])
	var root: Node = doc.generate_scene(state)
	var t2 := Time.get_ticks_usec()
	result["generateMs"] = float(t2 - t1) / 1000.0
	if root == null or not (root is Node3D):
		result["error"] = "generate_scene 이 Node3D 루트를 만들지 못했습니다."
		return result
	var root3d: Node3D = root
	if toon:
		result["toonSurfaces"] = convert_to_toon(root3d)
	var t3 := Time.get_ticks_usec()
	result["toonMs"] = float(t3 - t2) / 1000.0
	result["ok"] = true
	result["root"] = root3d
	return result

## 모든 MeshInstance3D 표면을 툰 셰이더 + 외곽선 next_pass 로 바꾼다. 변환한 표면 수를 돌려준다.
func convert_to_toon(node: Node) -> int:
	var count := 0
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null:
			for s in range(mi.mesh.get_surface_count()):
				var src: Material = mi.get_active_material(s)
				var toon := ShaderMaterial.new()
				toon.shader = TOON_SHADER
				toon.set_shader_parameter("bands", toon_bands)
				toon.set_shader_parameter("softness", toon_softness)
				if src is BaseMaterial3D:
					var base: BaseMaterial3D = src
					toon.set_shader_parameter("albedo", base.albedo_color)
					if base.albedo_texture != null:
						toon.set_shader_parameter("albedo_tex", base.albedo_texture)
						toon.set_shader_parameter("use_tex", true)
				if outline_enabled:
					toon.next_pass = _outline_material
				mi.set_surface_override_material(s, toon)
				count += 1
	for child in node.get_children():
		count += convert_to_toon(child)
	return count

## 이미 변환된 씬의 툰 파라미터를 갱신한다.
func update_toon(root: Node, bands: int, softness: float, outline_px_value: float, outline_on: bool) -> int:
	toon_bands = bands
	toon_softness = softness
	outline_px = outline_px_value
	outline_enabled = outline_on
	_outline_material.set_shader_parameter("outline_px", outline_px)
	return _update_toon_recursive(root)

func _update_toon_recursive(node: Node) -> int:
	var count := 0
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null:
			for s in range(mi.mesh.get_surface_count()):
				var mat: Material = mi.get_surface_override_material(s)
				if mat is ShaderMaterial and (mat as ShaderMaterial).shader == TOON_SHADER:
					var sm: ShaderMaterial = mat
					sm.set_shader_parameter("bands", toon_bands)
					sm.set_shader_parameter("softness", toon_softness)
					sm.next_pass = _outline_material if outline_enabled else null
					count += 1
	for child in node.get_children():
		count += _update_toon_recursive(child)
	return count

func collect_mesh_instances(root: Node) -> Array[MeshInstance3D]:
	var out: Array[MeshInstance3D] = []
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D:
			out.append(n)
		for c in n.get_children():
			stack.append(c)
	return out

## 노드·메시·삼각형·텍스처·스켈레톤·블렌드셰이프 수와 월드 AABB 를 센다. 루트가 씬 트리 안에 있을 때만 호출한다.
func scene_stats(root: Node3D) -> Dictionary:
	var stats := {
		"nodes": 0, "meshInstances": 0, "surfaces": 0, "triangles": 0, "vertices": 0,
		"textures": 0, "skeletons": 0, "bones": 0, "blendShapes": 0,
	}
	var seen_textures := {}
	var aabb := AABB()
	var has_aabb := false
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		stats["nodes"] += 1
		if n is Skeleton3D:
			stats["skeletons"] += 1
			stats["bones"] += (n as Skeleton3D).get_bone_count()
		if n is MeshInstance3D:
			var mi: MeshInstance3D = n
			stats["meshInstances"] += 1
			if mi.mesh != null:
				stats["blendShapes"] += mi.get_blend_shape_count()
				var array_mesh := mi.mesh as ArrayMesh
				for s in range(mi.mesh.get_surface_count()):
					stats["surfaces"] += 1
					if array_mesh != null:
						var idx: int = array_mesh.surface_get_array_index_len(s)
						var vtx: int = array_mesh.surface_get_array_len(s)
						stats["vertices"] += vtx
						stats["triangles"] += (idx if idx > 0 else vtx) / 3
					var mat: Material = mi.mesh.surface_get_material(s)
					if mat is BaseMaterial3D:
						var tex: Texture2D = (mat as BaseMaterial3D).albedo_texture
						if tex != null and not seen_textures.has(tex.get_rid()):
							seen_textures[tex.get_rid()] = true
				var world_aabb := mi.global_transform * mi.get_aabb()
				aabb = world_aabb if not has_aabb else aabb.merge(world_aabb)
				has_aabb = true
		for c in n.get_children():
			stack.append(c)
	stats["textures"] = seen_textures.size()
	if has_aabb:
		stats["aabb"] = [aabb.position.x, aabb.position.y, aabb.position.z, aabb.size.x, aabb.size.y, aabb.size.z]
	return stats

## 월드 AABB(Godot AABB). 없으면 길이 0 AABB.
func world_aabb(root: Node3D) -> AABB:
	var out := AABB()
	var has := false
	for mi in collect_mesh_instances(root):
		var a := mi.global_transform * mi.get_aabb()
		out = a if not has else out.merge(a)
		has = true
	return out
