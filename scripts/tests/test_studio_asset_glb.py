"""Synthetic structural tests; no rendering or artistic approval implied."""
import copy
from dataclasses import replace
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import normalize_studio_asset_glb as n

COLOR_IMAGE = 'color.png'


class GlbTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source.glb'
        self.out = self.root / 'result.glb'
        self.texture = b'\x89PNG\r\n\x1a\nsynthetic-signature-only'
        (self.root / COLOR_IMAGE).write_bytes(self.texture)
        self.doc = {'asset': {'version': '2.0'}, 'buffers': [{'byteLength': 4}],
                    'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': 4}],
                    'images': [{'uri': COLOR_IMAGE}], 'nodes': [], 'meshes': []}
        self.save()

    def save(self):
        self.source.write_bytes(n.write_glb(self.doc, b'1234'))

    def test_external_image_embedded_without_geometry_change(self):
        report = n.normalize(self.source, self.out)
        doc, data = n.read_glb(self.out.read_bytes())
        self.assertEqual(data[:4], b'1234')
        self.assertNotIn('uri', doc['images'][0])
        view = doc['bufferViews'][doc['images'][0]['bufferView']]
        self.assertEqual(data[view['byteOffset']:view['byteOffset'] + view['byteLength']], self.texture)
        self.assertTrue(report['geometryBytesPreserved'])
        self.assertFalse(report['studioRuntimeVerified'])

    def test_already_embedded_is_byte_identical(self):
        n.normalize(self.source, self.out)
        other = self.root / 'second.glb'
        n.normalize(self.out, other)
        self.assertEqual(self.out.read_bytes(), other.read_bytes())

    def test_invalid_header_and_lengths(self):
        for data in [b'bad', b'nope' + self.source.read_bytes()[4:], self.source.read_bytes()[:-1]]:
            with self.subTest(data=data[:8]), self.assertRaises(ValueError):
                n.read_glb(data)

    def test_external_and_traversal_uris_rejected(self):
        for uri in ['../color.png', '/etc/passwd', 'https://example.org/a.png', 'data:image/png;base64,AAAA', '%2e%2e/color.png']:
            with self.subTest(uri=uri):
                self.doc['images'][0]['uri'] = uri
                self.save()
                with self.assertRaises((ValueError, OSError)):
                    n.normalize(self.source, self.out)
                self.assertFalse(self.out.exists())

    def test_texture_symlink_rejected(self):
        (self.root / 'link.png').symlink_to(self.root / COLOR_IMAGE)
        self.doc['images'][0]['uri'] = 'link.png'
        self.save()
        with self.assertRaises(ValueError):
            n.normalize(self.source, self.out)

    def test_font_or_unknown_image_signature_rejected(self):
        (self.root / COLOR_IMAGE).write_bytes(b'not-an-image')
        with self.assertRaises(ValueError):
            n.normalize(self.source, self.out)

    def test_existing_destination_never_overwritten(self):
        self.out.write_bytes(b'keep')
        with self.assertRaises(ValueError):
            n.normalize(self.source, self.out)
        self.assertEqual(self.out.read_bytes(), b'keep')

    def test_buffer_view_outside_binary_rejected(self):
        self.doc['bufferViews'][0]['byteLength'] = 99
        self.save()
        with self.assertRaises(ValueError):
            n.normalize(self.source, self.out)


class OwnerPackImageBindingTests(unittest.TestCase):
    """합성 파일의 bytes/경로 계약이며 실제 구매 모델·PNG decode 검사가 아니다."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.temp_root = Path(self.temp.name).resolve()
        self.root = self.temp_root / 'owned-pack'
        self.source_relative = 'Models/Farm Plants/Lettuce_C.glb'
        self.texture_relative = 'Textures/atlas_nature.png'
        self.uri = '../../Textures/atlas_nature.png'
        self.source = self.root / self.source_relative
        self.texture_path = self.root / self.texture_relative
        self.source.parent.mkdir(parents=True)
        self.texture_path.parent.mkdir(parents=True)
        self.texture = b'\x89PNG\r\n\x1a\nsynthetic-signature-only'
        self.texture_path.write_bytes(self.texture)
        self.original_binary = struct.pack('<3f', 1, 2, 3)
        self.doc = {
            'asset': {'version': '2.0', 'generator': 'synthetic-owner-pack-test'},
            'buffers': [{'byteLength': len(self.original_binary), 'name': 'original buffer'}],
            'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(self.original_binary)}],
            'accessors': [{'bufferView': 0, 'componentType': 5126, 'count': 1, 'type': 'VEC3',
                           'min': [1, 2, 3], 'max': [1, 2, 3]}],
            'images': [{'uri': self.uri, 'name': 'original atlas', 'extras': {'keep': True}}],
            'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
            'textures': [{'sampler': 0, 'source': 0}],
            'materials': [{'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}},
                           'extensions': {'KHR_materials_unlit': {}}}],
            'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'mode': 0, 'material': 0}]}],
            'nodes': [{'mesh': 0, 'translation': [0, 1, 0]}], 'scenes': [{'nodes': [0]}], 'scene': 0,
            'skins': [], 'animations': [], 'extensionsUsed': ['KHR_materials_unlit'],
            'extras': {'retained': 'root metadata'},
        }
        self.binding = n.OwnerPackImageBindings(
            owner_pack_id='cbv1-030-nature-megapack-extended', pack_root=self.root,
            source_relative=self.source_relative, image_paths={self.uri: self.texture_relative},
        )
        self.out = self.temp_root / 'derived.glb'
        self.save()

    def save(self):
        self.source.write_bytes(n.write_glb(self.doc, self.original_binary))

    def assert_binding_rejected(self, binding: n.OwnerPackImageBindings):
        with self.assertRaises((ValueError, OSError)):
            n.normalize(self.source, self.out, owner_pack_images=binding)
        self.assertFalse(self.out.exists())

    def assert_preserved_normalization(self):
        original = self.source.read_bytes()
        report = n.normalize(self.source, self.out, owner_pack_images=self.binding)
        doc, binary = n.read_glb(self.out.read_bytes())
        self.assertEqual(self.source.read_bytes(), original)
        self.assertEqual(binary[:len(self.original_binary)], self.original_binary)
        image = doc['images'][0]
        view = doc['bufferViews'][image['bufferView']]
        self.assertEqual(binary[view['byteOffset']:view['byteOffset'] + view['byteLength']], self.texture)
        expected = copy.deepcopy(self.doc)
        offset = len(self.original_binary) + (-len(self.original_binary) % 4)
        expected['buffers'][0]['byteLength'] = offset + len(self.texture)
        expected['images'][0].pop('uri')
        expected['images'][0].update({'mimeType': 'image/png', 'bufferView': len(expected['bufferViews'])})
        expected['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(self.texture)})
        self.assertEqual(doc, expected)
        self.assertEqual(report['ownerPackBinding'], {
            'ownerPackId': self.binding.owner_pack_id, 'sourceRelative': self.binding.source_relative,
            'imagePaths': dict(self.binding.image_paths), 'policy': 'exact-owner-pack-atlas-v1',
        })
        self.assertTrue(report['geometryBytesPreserved'])
        self.assertFalse(report['studioRuntimeVerified'])
        second = self.temp_root / 'derived-again.glb'
        default_report = n.normalize(self.out, second)
        self.assertEqual(second.read_bytes(), self.out.read_bytes())
        self.assertNotIn('ownerPackBinding', default_report)

    def test_nature_parent_atlas_preserves_binary_json_and_image_bytes(self):
        self.assert_preserved_normalization()

    def test_medieval_parent_atlas_preserves_binary_json_and_image_bytes(self):
        self.source_relative = 'Models/Docks/Pier_D_2.glb'
        self.texture_relative = 'Textures/atlas.png'
        self.uri = '../../Textures/atlas.png'
        self.source = self.root / self.source_relative
        self.source.parent.mkdir(parents=True)
        (self.root / self.texture_relative).write_bytes(self.texture)
        self.doc['images'][0]['uri'] = self.uri
        self.binding = replace(self.binding, owner_pack_id='cbv1-023-medieval-megapack-low-poly',
                               source_relative=self.source_relative, image_paths={self.uri: self.texture_relative})
        self.save()
        self.assert_preserved_normalization()

    def test_existing_directory_may_be_walked_then_left_inside_pack(self):
        (self.root / 'Existing').mkdir()
        uri = '../../Existing/../Textures/atlas_nature.png'
        self.doc['images'][0]['uri'] = uri
        self.binding = replace(self.binding, image_paths={uri: self.texture_relative})
        self.save()
        self.assert_preserved_normalization()

    def test_uri_filename_is_decoded_once(self):
        relative = 'Textures/atlas space.png'
        (self.root / relative).write_bytes(self.texture)
        uri = '../../Textures/atlas%20space.png'
        self.doc['images'][0]['uri'] = uri
        self.binding = replace(self.binding, image_paths={uri: relative})
        self.save()
        self.assert_preserved_normalization()

    def test_default_two_argument_call_still_rejects_parent_atlas(self):
        with self.assertRaises(ValueError):
            n.normalize(self.source, self.out)
        self.assertFalse(self.out.exists())

    def test_bound_output_must_stay_outside_owner_pack(self):
        inside = self.root / 'derived.glb'
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('source read before output admission')) as reads:
            with self.assertRaisesRegex(ValueError, '소유 팩 밖의 새 경로를 destination으로 지정하세요'):
                n.normalize(self.source, inside, owner_pack_images=self.binding)
            reads.assert_not_called()
        self.assertFalse(inside.exists())

    def test_incomplete_opt_in_rejected(self):
        for binding in [replace(self.binding, owner_pack_id=''), replace(self.binding, source_relative=''),
                        replace(self.binding, image_paths={}), replace(self.binding, pack_root=Path('owned-pack')),
                        replace(self.binding, pack_root=self.source)]:
            with self.subTest(binding=binding):
                self.assert_binding_rejected(binding)

    def test_declared_source_must_match_actual_source(self):
        other_relative = 'Models/Other.glb'
        (self.root / other_relative).write_bytes(self.source.read_bytes())
        self.assert_binding_rejected(replace(self.binding, source_relative=other_relative))

    def test_actual_source_outside_pack_rejected(self):
        outside = self.temp_root / 'outside.glb'
        outside.write_bytes(self.source.read_bytes())
        with self.assertRaises(ValueError):
            n.normalize(outside, self.out, owner_pack_images=self.binding)
        self.assertFalse(self.out.exists())

    def test_invalid_opt_in_rejected_before_source_body_or_glb_parse(self):
        outside = self.temp_root / 'outside.glb'
        outside.write_bytes(n.write_glb(self.doc, self.original_binary))
        link = self.source.parent / 'source-link.glb'
        link.symlink_to(self.source)
        cases = [
            (outside, self.binding),
            (link, replace(self.binding, source_relative='Models/Farm Plants/source-link.glb')),
            (self.source, replace(self.binding, owner_pack_id='')),
            (self.source, replace(self.binding, image_paths={})),
            (self.source, replace(self.binding, source_relative='')),
            (self.source, replace(self.binding, pack_root=Path('relative-pack'))),
        ]
        for source, binding in cases:
            with self.subTest(source=source, binding=binding):
                with patch.object(Path, 'read_bytes', side_effect=AssertionError('source read before admission')) as reads:
                    with patch.object(n, 'read_glb', side_effect=AssertionError('GLB parse before admission')) as parse:
                        with self.assertRaises((ValueError, OSError)):
                            n.normalize(source, self.out, owner_pack_images=binding)
                        reads.assert_not_called()
                        parse.assert_not_called()
                self.assertFalse(self.out.exists())

    def test_declared_source_escape_rejected(self):
        self.assert_binding_rejected(replace(self.binding, source_relative='../outside.glb'))

    def test_missing_source_rejected(self):
        self.assert_binding_rejected(replace(self.binding, source_relative='Models/Absent.glb'))

    def test_texture_binding_mismatch_rejected(self):
        other = 'Textures/other.png'
        (self.root / other).write_bytes(self.texture)
        self.assert_binding_rejected(replace(self.binding, image_paths={self.uri: other}))

    def test_texture_binding_escape_rejected(self):
        self.assert_binding_rejected(replace(self.binding, image_paths={self.uri: '../outside.png'}))

    def test_unbound_or_unused_uri_rejected(self):
        missing = 'unused.png'
        extra = self.source.parent / missing
        extra.write_bytes(self.texture)
        self.assert_binding_rejected(replace(self.binding, image_paths={missing: self.source_relative.rsplit('/', 1)[0] + '/' + missing}))

    def test_root_escape_and_sibling_prefix_rejected(self):
        sibling = self.temp_root / 'owned-pack-extra'
        sibling.mkdir()
        (sibling / 'outside.png').write_bytes(self.texture)
        for uri in ['../../../owned-pack-extra/outside.png', '../../../owned-pack/Textures/atlas_nature.png']:
            with self.subTest(uri=uri):
                self.doc['images'][0]['uri'] = uri
                self.save()
                self.assert_binding_rejected(replace(self.binding, image_paths={uri: self.texture_relative}))

    def test_missing_or_file_intermediate_component_not_collapsed(self):
        (self.root / 'not-a-directory').write_bytes(b'synthetic')
        for component in ['Absent', 'not-a-directory']:
            uri = f'../../{component}/../Textures/atlas_nature.png'
            with self.subTest(component=component):
                self.doc['images'][0]['uri'] = uri
                self.save()
                self.assert_binding_rejected(replace(self.binding, image_paths={uri: self.texture_relative}))

    def test_symlink_source_rejected(self):
        real = self.root / 'real.glb'
        self.source.rename(real)
        self.source.symlink_to(real)
        self.assert_binding_rejected(self.binding)

    def test_symlink_source_directory_rejected(self):
        real = self.root / 'Real Plants'
        source_directory = self.source.parent
        source_directory.rename(real)
        source_directory.symlink_to(real, target_is_directory=True)
        self.assert_binding_rejected(self.binding)

    def test_symlink_final_texture_rejected_even_inside_pack(self):
        real = self.root / 'real.png'
        self.texture_path.rename(real)
        self.texture_path.symlink_to(real)
        self.assert_binding_rejected(self.binding)

    def test_symlink_texture_directory_rejected(self):
        (self.root / 'TextureLink').symlink_to(self.texture_path.parent, target_is_directory=True)
        uri = '../../TextureLink/atlas_nature.png'
        self.doc['images'][0]['uri'] = uri
        self.save()
        self.assert_binding_rejected(replace(self.binding, image_paths={uri: 'TextureLink/atlas_nature.png'}))

    def test_canceled_symlink_component_rejected_before_parent_step(self):
        (self.root / 'link').symlink_to(self.texture_path.parent, target_is_directory=True)
        uri = '../../link/../Textures/atlas_nature.png'
        self.doc['images'][0]['uri'] = uri
        self.save()
        self.assert_binding_rejected(replace(self.binding, image_paths={uri: self.texture_relative}))

    def test_symlink_pack_root_rejected(self):
        alias = self.temp_root / 'pack-link'
        alias.symlink_to(self.root, target_is_directory=True)
        self.assert_binding_rejected(replace(self.binding, pack_root=alias))

    def test_case_mismatch_or_case_collision_rejected(self):
        self.assert_binding_rejected(replace(self.binding, image_paths={self.uri: 'Textures/ATLAS_NATURE.PNG'}))
        alternate = self.texture_path.parent / 'ATLAS_NATURE.PNG'
        original_iterdir = Path.iterdir

        def entries(path: Path):
            if path == self.texture_path.parent:
                return iter((self.texture_path, alternate))
            return original_iterdir(path)

        # 물리 FS의 대소문자 정책과 무관하게 충돌하는 directory listing을 합성한다.
        with patch.object(Path, 'iterdir', entries):
            self.assert_binding_rejected(self.binding)

    def test_external_absolute_query_fragment_and_encoded_uris_rejected(self):
        for uri in [
            'https://example.invalid/atlas.png', '//example.invalid/atlas.png', 'data:image/png;base64,AAAA',
            '/outside.png', 'C:/outside.png', r'C:\outside.png', '../../Textures/atlas_nature.png?',
            '../../Textures/atlas_nature.png#', '../../Textures/atlas_nature.png?x=1',
            '../../Textures/atlas_nature.png#part', '%2e%2e/%2e%2e/Textures/atlas_nature.png',
            '..%2F..%2FTextures%2Fatlas_nature.png', '%2Foutside.png', '../../Textures/%00.png',
            '../../Textures/%zz.png', '%252e%252e/%252e%252e/Textures/atlas_nature.png',
        ]:
            with self.subTest(uri=uri):
                self.doc['images'][0]['uri'] = uri
                self.save()
                self.assert_binding_rejected(replace(self.binding, image_paths={uri: self.texture_relative}))

    def assert_serialized_mutation_rejected(self, mutate, message):
        original = self.source.read_bytes()
        writer = n.write_glb

        def corrupt_serialized_output(document, binary):
            changed_document, changed_binary = mutate(copy.deepcopy(document), binary)
            return writer(changed_document, changed_binary)

        for mode in ('pure', 'owner-wrapper'):
            with self.subTest(mode=mode), patch.object(n, 'write_glb', side_effect=corrupt_serialized_output):
                with self.assertRaisesRegex(ValueError, message):
                    if mode == 'pure':
                        n.normalize_bytes(original, lambda uri: self.texture)
                    else:
                        n.normalize(self.source, self.out, owner_pack_images=self.binding)
                self.assertFalse(self.out.exists())
                self.assertEqual(self.source.read_bytes(), original)
                self.assertEqual(self.texture_path.read_bytes(), self.texture)

    def test_pure_and_owner_wrapper_reject_new_json_metadata_after_embedding(self):
        # 원본 key만 순회하는 부분 비교로는 새로 추가된 JSON 필드를 찾지 못한다.
        for target in ('root', 'buffer', 'image', 'extension'):
            def add_unapproved_field(document, binary):
                if target == 'root':
                    document['unexpectedMetadata'] = {'changed': True}
                elif target == 'buffer':
                    document['buffers'][0]['unexpectedMetadata'] = True
                elif target == 'image':
                    document['images'][0]['unexpectedMetadata'] = True
                else:
                    document['extensions'] = {'UNAPPROVED_extension': {'changed': True}}
                return document, binary

            with self.subTest(target=target):
                self.assert_serialized_mutation_rejected(add_unapproved_field, 'GLB JSON')

    def test_pure_and_owner_wrapper_reject_changed_embedded_image_bytes(self):
        def change_image_byte(document, binary):
            view = document['bufferViews'][document['images'][0]['bufferView']]
            changed = bytearray(binary)
            changed[view['byteOffset'] + view['byteLength'] - 1] ^= 1
            return document, bytes(changed)

        self.assert_serialized_mutation_rejected(change_image_byte, '텍스처 바이트')


if __name__ == '__main__':
    unittest.main()
