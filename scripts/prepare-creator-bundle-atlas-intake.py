#!/usr/bin/env python3
"""명시한 소유 팩의 atlas만 내부화하여 새 private 인제스션 입력을 준비한다."""
from __future__ import annotations

import argparse
import copy
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile

import normalize_studio_asset_glb as glb

REPO = Path(__file__).resolve().parents[1]
RIGHTS = REPO / 'config/creator-bundle-pack-rights.json'
PROJECTION = REPO / 'apps/web/public/assets/3d/environments/bundle-v1/theme-packs.json'
SCHEMA = 'toonstudio.creator-bundle-atlas-intake.v1'
SHA = re.compile(r'[a-f0-9]{64}')
IDENTIFIER = re.compile(r'[a-z0-9][a-z0-9._+\-]{0,159}')


def fail(message):
    raise ValueError(message + ' 입력 recipe·원장·경로를 확인하고 새 private 출력 경로로 다시 실행하세요.')


def digest(body):
    return hashlib.sha256(body).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail('JSON에 중복된 키가 있습니다: ' + key)
        result[key] = value
    return result


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=unique_object)


def relative(value):
    if (not isinstance(value, str) or not value or value != value.strip()
            or '\\' in value or Path(value).is_absolute() or ':' in value
            or any(ord(c) < 32 or ord(c) == 127 for c in value)
            or any(p in {'', '.', '..'} for p in value.split('/'))):
        fail('모호하거나 루트 밖으로 이동하는 상대 경로를 거부합니다.')
    return value


def checked_path(root, name, *, directory=False):
    current = root
    for part in relative(name).split('/'):
        if not current.is_dir():
            fail('중간 경로가 디렉터리가 아닙니다.')
        names = [p.name for p in current.iterdir() if p.name.casefold() == part.casefold()]
        if names != [part]:
            fail('파일이 없거나 경로의 대소문자가 모호합니다.')
        current /= part
        if current.is_symlink():
            fail('심볼릭 링크 입력을 거부합니다.')
    if not (current.is_dir() if directory else current.is_file()):
        fail('필요한 일반 파일 또는 디렉터리가 없습니다.')
    return current


def absolute_directory(value):
    path = Path(value).expanduser().absolute()
    if '..' in path.parts:
        fail('절대 루트의 상위 이동을 거부합니다.')
    return checked_path(Path(path.anchor), path.relative_to(path.anchor).as_posix(), directory=True)


def file_state(path):
    return {'bytes': path.stat().st_size, 'sha256': glb.sha256_file(path)}


def remember(states, root, name):
    path = checked_path(root, name)
    # 공용 atlas는 모델마다 반복 해시하지 않고 마지막 입력 스냅샷 검사에서 다시 대조한다.
    if path in states:
        return path, states[path]['state']
    state = file_state(path)
    states[path] = {'root': root, 'relative': name, 'state': state}
    return path, state


def assert_current(plan):
    for directory, expected in plan.get('sourceTrees', {}).items():
        if glb_files(directory) != expected:
            fail('계획 이후 sourceDirectory의 GLB 목록이 변경됐습니다.')
    for path, item in plan['states'].items():
        if checked_path(item['root'], item['relative']) != path or file_state(path) != item['state']:
            fail('계획 이후 원본·텍스처·설정·기존 입력이 변경됐습니다.')


def glb_files(directory):
    result = []
    def walk(current):
        entries = sorted(current.iterdir(), key=lambda p: p.name)
        if len({p.name.casefold() for p in entries}) != len(entries):
            fail('같은 디렉터리에 대소문자가 충돌하는 이름이 있습니다.')
        for path in entries:
            if path.is_symlink():
                fail('모델 디렉터리의 심볼릭 링크를 거부합니다.')
            if path.is_dir():
                walk(path)
            elif path.is_file() and path.suffix == '.glb':
                result.append(path)
            elif path.suffix.lower() == '.glb':
                fail('GLB 확장자 대소문자가 계약과 다릅니다. 소문자 .glb 경로를 명시한 입력을 사용하세요.')
            elif not path.is_file():
                fail('모델 디렉터리의 특수 파일을 거부합니다.')
    walk(directory)
    if not result:
        fail('지정한 sourceDirectory에 GLB가 없습니다.')
    return result


def pack_owner(pack, ledger, projection):
    definitions = [p for p in projection['packs'] if pack['catalogId'] in p.get('catalogIds', [])]
    owners = [p for p in ledger['packs'] if pack['catalogId'] in p.get('catalogIds', [])]
    if len(definitions) != 1 or len(owners) != 1:
        fail('카탈로그 팩의 projection 또는 권리 소유권이 유일하지 않습니다.')
    definition, owner = definitions[0], owners[0]
    if (pack['ingestId'] not in definition.get('ingestPackIds', [])
            or owner.get('group') != 'pack' or owner.get('serve') != 'allow'
            or any(owner.get(k) != definition.get(k) for k in ('title', 'creator'))):
        fail('현재 원장의 allow·팩 식별·인제스션 계약과 다릅니다.')
    grant = owner.get('grant', {})
    projected = {'serve': 'allow', **{key: grant.get(key) for key in
                 ('status', 'licenseName', 'commercialUse', 'attributionRequired')}}
    if 'attribution' in grant:
        projected['attribution'] = grant['attribution']
    if (definition.get('rights') != projected or grant.get('status') not in {'licensed', 'public-domain'}
            or not isinstance(grant.get('licenseName'), str) or not grant['licenseName'].strip()
            or grant.get('commercialUse') is not True or type(grant.get('attributionRequired')) is not bool):
        fail('projection의 권리 블록이 현재 원장의 grant와 다릅니다. 정본 생성기로 projection을 다시 생성하세요.')
    parts = relative(pack['packRoot']).split('/')
    if len(parts) < 2 or parts[1] not in owner.get('libraryPacks', []):
        fail('packRoot가 해당 원장의 정확한 libraryPacks 소유권과 다릅니다.')
    claims = [p for p in ledger['packs'] if parts[1] in p.get('libraryPacks', [])]
    if len(claims) != 1:
        fail('라이브러리 팩을 여러 원장 항목이 주장하여 소유권이 모호합니다.')
    return owner


def output_path(value, protected):
    requested = Path(value).expanduser().absolute()
    parent = absolute_directory(requested.parent)
    output = parent / requested.name
    if (output.exists() or output.is_symlink()
            or any(output.is_relative_to(root) or root.is_relative_to(output) for root in protected)
            or any(p in {'public', 'dist'} for p in output.parts)):
        fail('출력은 저장소·원본·기존 입력·public·dist 밖의 새 디렉터리여야 합니다.')
    return output


def build_plan(*, recipe_path, library_root, output_root=None, existing_root=None,
               pack_rights=RIGHTS, projection_path=PROJECTION):
    library = absolute_directory(library_root)
    states = {}
    controls = {}
    documents = []
    for name, value in [('recipe', recipe_path), ('rights', pack_rights), ('projection', projection_path)]:
        path = Path(value).expanduser().absolute()
        root = absolute_directory(path.parent)
        path, state = remember(states, root, path.name)
        controls[name] = state
        documents.append(read_json(path))
    recipe, ledger, projection = documents
    if (set(recipe) != {'schema', 'version', 'generatedAt', 'packs'} or recipe['schema'] != SCHEMA
            or recipe['version'] != 1 or not isinstance(recipe['packs'], list) or not recipe['packs']):
        fail('recipe의 schema·version·packs 형식이 올바르지 않습니다.')
    stamp = recipe['generatedAt']
    if not isinstance(stamp, str) or not stamp.endswith('Z'):
        fail('generatedAt에 UTC ISO 날짜를 지정해야 합니다.')
    if datetime.fromisoformat(stamp.replace('Z', '+00:00')).tzinfo is None:
        fail('generatedAt에는 시각과 UTC 시간대가 함께 필요합니다.')
    if (ledger.get('schema') != 'toonstudio.creator-bundle-pack-rights.v1'
            or ledger.get('version') != 1 or not isinstance(ledger.get('packs'), list)
            or projection.get('schema') != 'toonstudio.bg3d-bundle-theme-packs.v1'
            or not isinstance(projection.get('packs'), list)):
        fail('현재 권리 원장 또는 projection 스키마가 다릅니다.')
    existing = absolute_directory(existing_root) if existing_root else None
    output = output_path(output_root, [REPO, library] + ([existing] if existing else [])) if output_root else None
    assets, copies, additions, ids, paths, sources, actual_sources = [], [], [], set(), set(), set(), set()
    source_trees = {}
    def register(asset):
        primary = asset['files'][0]
        source = (asset['packId'], asset['sourcePath'])
        if asset['id'] in ids or primary['path'] in paths or source in sources:
            fail('에셋 ID·출력 경로 또는 동일 팩의 sourcePath가 중복됩니다.')
        ids.add(asset['id']); paths.add(primary['path']); sources.add(source)
        assets.append(asset)
    base = None
    if existing:
        manifest_path, state = remember(states, existing, 'manifest-v2.json')
        controls['existingManifest'] = state
        base = read_json(manifest_path)
        if (base.get('kind') != 'toonstudio.asset-bundle.v2' or base.get('version') != 2
                or base.get('inServiceOnly') is not True or base.get('downloadable') is not False
                or not isinstance(base.get('assets'), list)
                or base.get('totals', {}).get('assets') != len(base['assets'])):
            fail('기존 manifest-v2의 서비스 전용·합계 계약이 다릅니다.')
        for asset in copy.deepcopy(base['assets']):
            files = asset.get('files')
            if (asset.get('role') != 'runtime' or asset.get('format') != 'glb'
                    or not isinstance(files, list) or len(files) != 1 or files[0].get('kind') != 'primary'
                    or not isinstance(asset.get('id'), str) or not IDENTIFIER.fullmatch(asset.get('packId', ''))
                    or not asset['id'].startswith(asset['packId'] + '-')):
                fail('기존 descriptor의 ID·팩·포맷·primary 계약이 다릅니다.')
            primary = files[0]
            relative(asset['sourcePath']); relative(primary['path'])
            if (not asset['sourcePath'].endswith('.glb')
                    or primary['path'] != asset['packId'] + '/native/' + asset['sourcePath']
                    or type(primary.get('bytes')) is not int or primary['bytes'] <= 0
                    or not isinstance(primary.get('sha256'), str) or not SHA.fullmatch(primary['sha256'])):
                fail('기존 descriptor의 경로·바이트·SHA256 계약이 다릅니다.')
            source, state = remember(states, existing, primary['path'])
            if state != {k: primary[k] for k in ('bytes', 'sha256')}:
                fail('기존 GLB의 바이트·SHA256이 descriptor와 다릅니다.')
            document, _ = glb.read_glb(source.read_bytes())
            if any('uri' in image for image in document.get('images', [])):
                fail('기존 입력에 외부 이미지 URI가 남아 있습니다.')
            register(asset); copies.append((source, primary))
    ingests = set()
    for pack in recipe['packs']:
        if (not isinstance(pack, dict) or set(pack) != {'catalogId', 'ingestId', 'packRoot', 'sourceDirectory', 'imagePaths'}
                or not isinstance(pack['catalogId'], str) or not IDENTIFIER.fullmatch(pack['ingestId'])
                or pack['ingestId'] in ingests or not isinstance(pack['imagePaths'], dict) or not pack['imagePaths']):
            fail('추가 팩 recipe의 필드·식별자·URI 매핑이 올바르지 않거나 중복됩니다.')
        ingests.add(pack['ingestId'])
        owner = pack_owner(pack, ledger, projection)
        root = checked_path(library, pack['packRoot'], directory=True)
        directory = checked_path(root, pack['sourceDirectory'], directory=True)
        used = set()
        candidates = glb_files(directory)
        source_trees[directory] = candidates
        for source in candidates:
            if source in actual_sources:
                fail('같은 소유 팩의 원본 GLB를 여러 번 선택했습니다.')
            actual_sources.add(source)
            name = source.relative_to(root).as_posix()
            source, state = remember(states, root, name)
            doc, _ = glb.read_glb(source.read_bytes())
            uris = [image['uri'] for image in doc.get('images', []) if 'uri' in image]
            if any(not isinstance(uri, str) or uri not in pack['imagePaths'] for uri in uris):
                fail('원문 이미지 URI의 명시적인 imagePaths 매핑이 없습니다.')
            binding = None
            if uris:
                mapping = {uri: pack['imagePaths'][uri] for uri in sorted(set(uris))}
                binding = glb.OwnerPackImageBindings(owner['id'], root, name, mapping)
                for image in glb._resolve_owner_pack_images(source, binding).values():
                    _, image_state = remember(states, root, image.relative_to(root).as_posix())
                    with image.open('rb') as stream:
                        signature = stream.read(8)
                    if image_state['bytes'] > 16 * 1024 * 1024 or not signature.startswith((b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff')):
                        fail('텍스처 크기 또는 PNG·JPEG 파일 서명이 내부화 계약과 다릅니다.')
                used.update(uris)
            source_name = source.relative_to(directory).as_posix()
            if (pack['ingestId'], source_name) in sources:
                fail('기존 입력에 동일 팩의 sourcePath가 이미 있습니다.')
            sources.add((pack['ingestId'], source_name))
            additions.append({'source': source, 'state': state, 'binding': binding,
                              'packId': pack['ingestId'], 'sourcePath': source_name, 'catalogId': pack['catalogId']})
        if used != set(pack['imagePaths']):
            fail('imagePaths에 원본 GLB가 사용하지 않는 매핑이 있습니다.')
    plan = {'states': states, 'sourceTrees': source_trees, 'controls': controls, 'output': output, 'assets': assets,
            'copies': copies, 'additions': additions, 'base': base, 'stamp': stamp,
            'ids': ids, 'paths': paths, 'summary': {'existingAssets': len(assets), 'addedAssets': len(additions)}}
    assert_current(plan)
    return plan


def write_plan(plan):
    assert_current(plan)
    output = plan['output']
    if output is None:
        fail('--write에는 --output-root로 새 private 출력 경로를 지정해야 합니다.')
    output.mkdir(mode=0o700)
    owner = output.stat()
    stage = Path(tempfile.mkdtemp(prefix='.staging-', dir=output))
    published = False
    try:
        assets = copy.deepcopy(plan['assets'])
        proofs = []
        for source, primary in plan['copies']:
            destination = stage / primary['path']
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with source.open('rb') as src, destination.open('xb') as dst:
                shutil.copyfileobj(src, dst)
            if file_state(destination) != {k: primary[k] for k in ('bytes', 'sha256')}:
                fail('기존 입력 복사본의 바이트·SHA256이 다릅니다.')
        for item in plan['additions']:
            path = item['packId'] + '/native/' + item['sourcePath']
            destination = stage / path
            report = glb.normalize(item['source'], destination, owner_pack_images=item['binding'])
            state = file_state(destination)
            if report['sourceSha256'] != item['state']['sha256'] or report['normalizedSha256'] != state['sha256']:
                fail('내부화 과정의 원본·파생본 해시가 준비 계획과 다릅니다.')
            suffix = digest((item['sourcePath'] + '\0' + state['sha256']).encode())[:20]
            identifier = item['packId'] + '-' + suffix
            if identifier in plan['ids'] or path in plan['paths']:
                fail('파생 에셋 ID 또는 출력 경로가 기존 입력과 충돌합니다.')
            plan['ids'].add(identifier); plan['paths'].add(path)
            assets.append({'id': identifier, 'packId': item['packId'], 'role': 'runtime', 'format': 'glb',
                           'sourcePath': item['sourcePath'], 'files': [{'kind': 'primary', 'path': path, **state}]})
            proofs.append({'catalogId': item['catalogId'], 'sourcePath': item['sourcePath'], 'outputPath': path,
                           'source': item['state'], 'derived': state, 'normalization': report})
        for asset in assets:
            primary = asset['files'][0]
            if file_state(checked_path(stage, primary['path'])) != {k: primary[k] for k in ('bytes', 'sha256')}:
                fail('게시 전 최종 GLB가 manifest의 바이트·SHA256과 다릅니다.')
        assert_current(plan)
        manifest = copy.deepcopy(plan['base']) if plan['base'] else {'kind': 'toonstudio.asset-bundle.v2', 'version': 2}
        manifest.update(inServiceOnly=True, downloadable=False, generatedAt=plan['stamp'], assets=assets,
                        totals={**manifest.get('totals', {}), 'assets': len(assets)})
        proof = {'schema': SCHEMA + '-proof', 'controls': plan['controls'], 'assets': proofs,
                 'inputFiles': [{'path': str(path), **item['state']} for path, item in plan['states'].items()],
                 'copyPolicy': 'copy-only-no-hardlinks', 'productApplied': False, 'studioRuntimeVerified': False}
        for filename, document in [('manifest-v2.json', manifest), ('preparation-proof.json', proof)]:
            with (stage / filename).open('x', encoding='utf-8') as stream:
                os.chmod(stream.name, 0o600)
                json.dump(document, stream, ensure_ascii=False, indent=2); stream.write('\n')
        assert_current(plan)
        if output.is_symlink() or output.stat().st_ino != owner.st_ino or (output / 'input').exists():
            fail('예약한 출력 경로가 변경되어 게시를 중단합니다.')
        stage.rename(output / 'input')
        published = True
        return {**plan['summary'], 'inputRoot': str(output / 'input')}
    finally:
        if not published and not output.is_symlink() and output.stat().st_ino == owner.st_ino:
            shutil.rmtree(stage)
            if not any(output.iterdir()):
                output.rmdir()


def main(argv=None):
    class Parser(argparse.ArgumentParser):
        def error(self, message):
            self.exit(2, '입력 인자 오류: ' + message + '\n--help에서 필수 경로와 실행 모드를 확인하세요.\n')
    parser = Parser(description=__doc__)
    for name in ('recipe', 'library-root'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--output-root')
    parser.add_argument('--existing-root')
    parser.add_argument('--pack-rights', default=str(RIGHTS))
    parser.add_argument('--projection', dest='projection_path', default=str(PROJECTION))
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='입력과 계획만 검사하며 영속 출력을 만들지 않는다.')
    mode.add_argument('--write', action='store_true', help='새 private envelope/input에만 완성된 입력을 게시한다.')
    args = vars(parser.parse_args(argv)); write = args.pop('write'); args.pop('check')
    args['recipe_path'] = args.pop('recipe')
    try:
        if write and not args['output_root']:
            fail('--write에는 --output-root로 새 private 출력 경로를 지정해야 합니다.')
        plan = build_plan(**args)
        result = write_plan(plan) if write else {**plan['summary'], 'mode': 'check', 'persistentOutputWritten': False}
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (ValueError, OSError, KeyError, TypeError, AttributeError) as error:
        print('인제스션 준비 실패: ' + str(error) + '\n입력 recipe·원장·경로를 확인하고 --check로 다시 검사하세요.', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
