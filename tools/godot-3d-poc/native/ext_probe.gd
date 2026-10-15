extends SceneTree
## glTF 확장 호환 네이티브 프로브: 폴더의 *.glb 를 GLTFDocument 로 열어 결과를 파일마다 한 줄 JSON 으로 낸다.
## 웹 측정(measure/run.mjs 의 ext 스위트)과 같은 호출(append_from_buffer -> generate_scene)을 쓰고,
## `--headless`(더미 디스플레이·렌더 드라이버)와 Xvfb + Mesa 소프트웨어 GL 두 경로에서 결과가 같은지 비교하는 용도다(probe-ext.sh).
## 환경 변수 TS3D_FIXTURES 에 픽스처 폴더의 절대 경로를 준다. 프로젝트(res://) 밖의 파일이라 웹 pck 에 들어가지 않는다.
## 출력: 환경 한 줄 `[ext-probe-env] {json}` 과 파일마다 한 줄 `[ext-probe] {json}` (표준 출력).

func _initialize() -> void:
	call_deferred("_run")

func _format_name(format_value: int) -> String:
	for constant_name in ClassDB.class_get_integer_constant_list("Image"):
		if constant_name.begins_with("FORMAT_") and constant_name != "FORMAT_MAX" and ClassDB.class_get_integer_constant("Image", constant_name) == format_value:
			return constant_name
	return str(format_value)

func _count(node: Node, acc: Dictionary) -> void:
	acc["nodes"] += 1
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh != null:
			acc["meshInstances"] += 1
			acc["surfaces"] += mesh_instance.mesh.get_surface_count()
	for child in node.get_children():
		_count(child, acc)

func _probe(file_name: String, bytes: PackedByteArray) -> Dictionary:
	var info := {"file": file_name, "bytes": bytes.size()}
	var state := GLTFState.new()
	var doc := GLTFDocument.new()
	var err := doc.append_from_buffer(bytes, "", state)
	info["appendOk"] = err == OK
	info["appendError"] = error_string(err)
	if err != OK:
		return info
	var decoded: Array = []
	for texture in state.get_images():
		if texture == null:
			decoded.append(null)
		elif texture is ImageTexture:
			var image_texture := texture as ImageTexture
			decoded.append({"width": image_texture.get_width(), "height": image_texture.get_height(), "format": _format_name(image_texture.get_format())})
		else:
			decoded.append({"class": texture.get_class()})
	info["images"] = decoded
	var root := doc.generate_scene(state)
	info["sceneOk"] = root != null
	if root != null:
		var counts := {"nodes": 0, "meshInstances": 0, "surfaces": 0}
		_count(root, counts)
		info["counts"] = counts
		root.free()
	return info

func _run() -> void:
	var dir_path := OS.get_environment("TS3D_FIXTURES")
	if dir_path.is_empty() or not DirAccess.dir_exists_absolute(dir_path):
		printerr("TS3D_FIXTURES 가 없거나 폴더가 아닙니다: ", dir_path)
		quit(2)
		return
	var names: Array = []
	for file_name in DirAccess.get_files_at(dir_path):
		if file_name.ends_with(".glb"):
			names.append(file_name)
	names.sort()
	var env := {
		"engine": Engine.get_version_info().get("string", ""),
		"displayDriver": DisplayServer.get_name(),
		"renderingMethod": RenderingServer.get_current_rendering_method(),
		"adapter": RenderingServer.get_video_adapter_name(),
		"supportedExtensions": Array(GLTFDocument.get_supported_gltf_extensions()),
	}
	print("[ext-probe-env] ", JSON.stringify(env))
	for file_name in names:
		var bytes := FileAccess.get_file_as_bytes(dir_path.path_join(file_name))
		print("[ext-probe] ", JSON.stringify(_probe(file_name, bytes)))
	quit(0)
