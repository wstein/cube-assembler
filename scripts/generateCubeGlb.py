#!/usr/bin/env python3
"""
Generate a procedural PBR multi-cubie glTF/GLB model from a cube-assembler fixture.

Each visible cubie is an independent node in the glTF scene graph with:
- Dark matte plastic body geometry (beveled / seam gap)
- Colored sticker facets matching the fixture's calibrated colors
- Standard glTF 2.0 PBR materials (metallicRoughness)
"""

import json
import os
import struct
import sys
from pathlib import Path


def srgb_to_linear(c):
    v = c / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def facelet_position(n, face, index):
    r = index // n
    c = index % n
    last = n - 1
    if face == 'u':
        return (c, last, r)
    if face == 'd':
        return (c, 0, last - r)
    if face == 'f':
        return (c, last - r, last)
    if face == 'b':
        return (last - c, last - r, 0)
    if face == 'r':
        return (last, last - r, last - c)
    if face == 'l':
        return (0, last - r, c)
    raise ValueError(f'Unknown face {face}')


def create_cube_glb(fixture_path, output_glb_path):
    with open(os.path.join(fixture_path, 'meta.json'), 'r') as f:
        meta = json.load(f)

    n = meta['gridSize']
    last = n - 1

    # Extract facelet colors in U, R, F, D, L, B order
    assembled = meta.get('capture', {}).get('assembledURFDLB')
    if not assembled:
        assembled = meta.get('colorsURFDLB')
    blocks = assembled.split()
    u, r, f, d, l, b = blocks

    # Palette
    learned = meta.get('capture', {}).get('colorCalibration', {}).get('learnedColors')
    if not learned:
        learned = {
            'W': [209, 213, 201],
            'Y': [187, 212, 36],
            'O': [239, 83, 33],
            'R': [198, 32, 44],
            'G': [10, 165, 56],
            'B': [4, 67, 135],
        }

    # Color index mapping: 0 = BlackPlastic, 1..6 = W, Y, O, R, G, B
    color_keys = ['W', 'Y', 'O', 'R', 'G', 'B']
    mat_index = {c: i + 1 for i, c in enumerate(color_keys)}

    # Build materials
    materials = [
        {
            'name': 'Plastic_Black',
            'pbrMetallicRoughness': {
                'baseColorFactor': [0.03, 0.03, 0.03, 1.0],
                'roughnessFactor': 0.6,
                'metallicFactor': 0.0,
            },
        }
    ]
    for c in color_keys:
        rgb = learned[c]
        lin_rgb = [srgb_to_linear(v) for v in rgb]
        materials.append(
            {
                'name': f'Plastic_{c}',
                'pbrMetallicRoughness': {
                    'baseColorFactor': [lin_rgb[0], lin_rgb[1], lin_rgb[2], 1.0],
                    'roughnessFactor': 0.28,
                    'metallicFactor': 0.0,
                },
            }
        )

    # Geometry constants
    h = 0.47  # Half width of cubie body (cubie size 0.94, leaving 0.06 seam gap)
    s = 0.42  # Half width of sticker quad (leaving 0.05 plastic border around sticker)
    eps = 0.005  # Sticker raised offset to avoid z-fighting

    # Vertex buffers for:
    # 1. Cubie black box (24 vertices, 36 indices)
    # 2. Six sticker quads (+Y, -Y, +Z, -Z, +X, -X; each 4 vertices, 6 indices)
    positions_data = bytearray()
    normals_data = bytearray()
    indices_data = bytearray()

    accessors = []
    buffer_views = []

    def add_geom(vertices, normals, indices):
        # Align to 4 bytes
        nonlocal positions_data, normals_data, indices_data
        pos_offset = len(positions_data)
        norm_offset = len(normals_data)
        idx_offset = len(indices_data)

        min_pos = [min(v[i] for v in vertices) for i in range(3)]
        max_pos = [max(v[i] for v in vertices) for i in range(3)]

        for v in vertices:
            positions_data.extend(struct.pack('<fff', *v))
        for norm in normals:
            normals_data.extend(struct.pack('<fff', *norm))
        for idx in indices:
            indices_data.extend(struct.pack('<H', idx))

        v_count = len(vertices)
        i_count = len(indices)
        return {
            'pos_offset': pos_offset,
            'norm_offset': norm_offset,
            'idx_offset': idx_offset,
            'v_count': v_count,
            'i_count': i_count,
            'min_pos': min_pos,
            'max_pos': max_pos,
        }

    # 1. Unit box (6 faces)
    box_verts = []
    box_norms = []
    box_indices = []

    faces_def = [
        # +Y
        ([[-h, h, -h], [h, h, -h], [h, h, h], [-h, h, h]], [0, 1, 0]),
        # -Y
        ([[-h, -h, h], [h, -h, h], [h, -h, -h], [-h, -h, -h]], [0, -1, 0]),
        # +Z
        ([[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], [0, 0, 1]),
        # -Z
        ([[-h, h, -h], [h, h, -h], [h, -h, -h], [-h, -h, -h]], [0, 0, -1]),
        # +X
        ([[h, -h, -h], [h, h, -h], [h, h, h], [h, -h, h]], [1, 0, 0]),
        # -X
        ([[-h, -h, h], [-h, h, h], [-h, h, -h], [-h, -h, -h]], [-1, 0, 0]),
    ]

    for face_verts, norm in faces_def:
        base_idx = len(box_verts)
        box_verts.extend(face_verts)
        box_norms.extend([norm] * 4)
        box_indices.extend(
            [base_idx, base_idx + 1, base_idx + 2, base_idx, base_idx + 2, base_idx + 3]
        )

    box_geom = add_geom(box_verts, box_norms, box_indices)

    # 2. Sticker quads for each of the 6 faces
    # Order: U (+Y), D (-Y), F (+Z), B (-Z), R (+X), L (-X)
    sticker_geoms = {}
    sticker_faces_def = {
        'u': ([[-s, h + eps, -s], [s, h + eps, -s], [s, h + eps, s], [-s, h + eps, s]], [0, 1, 0]),
        'd': ([[-s, -h - eps, s], [s, -h - eps, s], [s, -h - eps, -s], [-s, -h - eps, -s]], [0, -1, 0]),
        'f': ([[-s, -s, h + eps], [s, -s, h + eps], [s, s, h + eps], [-s, s, h + eps]], [0, 0, 1]),
        'b': ([[-s, s, -h - eps], [s, s, -h - eps], [s, -s, -h - eps], [-s, -s, -h - eps]], [0, 0, -1]),
        'r': ([[h + eps, -s, -s], [h + eps, s, -s], [h + eps, s, s], [h + eps, -s, s]], [1, 0, 0]),
        'l': ([[-h - eps, -s, s], [-h - eps, s, s], [-h - eps, s, -s], [-h - eps, -s, -s]], [-1, 0, 0]),
    }

    for f_key, (f_verts, f_norm) in sticker_faces_def.items():
        s_verts = f_verts
        s_norms = [f_norm] * 4
        s_indices = [0, 1, 2, 0, 2, 3]
        sticker_geoms[f_key] = add_geom(s_verts, s_norms, s_indices)

    # Now assemble binary buffer:
    # positions, then normals, then indices
    # Ensure 4-byte alignment
    def pad4(b, pad_byte=b'\x00'):
        rem = len(b) % 4
        if rem != 0:
            b.extend(pad_byte * (4 - rem))

    pos_start = 0
    pad4(positions_data)
    pos_len = len(positions_data)

    norm_start = pos_len
    pad4(normals_data)
    norm_len = len(normals_data)

    idx_start = norm_start + norm_len
    pad4(indices_data)
    idx_len = len(indices_data)

    combined_bin = positions_data + normals_data + indices_data
    pad4(combined_bin)

    buffer_views = [
        # 0: Positions
        {
            'buffer': 0,
            'byteOffset': pos_start,
            'byteLength': pos_len,
            'target': 34962,  # ARRAY_BUFFER
        },
        # 1: Normals
        {
            'buffer': 0,
            'byteOffset': norm_start,
            'byteLength': norm_len,
            'target': 34962,  # ARRAY_BUFFER
        },
        # 2: Indices
        {
            'buffer': 0,
            'byteOffset': idx_start,
            'byteLength': idx_len,
            'target': 34963,  # ELEMENT_ARRAY_BUFFER
        },
    ]

    # Accessors for Box:
    # Accessor 0: Box pos
    # Accessor 1: Box norm
    # Accessor 2: Box indices
    accessors = [
        {
            'bufferView': 0,
            'byteOffset': box_geom['pos_offset'],
            'componentType': 5126,  # FLOAT
            'count': box_geom['v_count'],
            'type': 'VEC3',
            'min': box_geom['min_pos'],
            'max': box_geom['max_pos'],
        },
        {
            'bufferView': 1,
            'byteOffset': box_geom['norm_offset'],
            'componentType': 5126,  # FLOAT
            'count': box_geom['v_count'],
            'type': 'VEC3',
        },
        {
            'bufferView': 2,
            'byteOffset': box_geom['idx_offset'],
            'componentType': 5123,  # UNSIGNED_SHORT
            'count': box_geom['i_count'],
            'type': 'SCALAR',
        },
    ]

    # Accessors for Stickers:
    sticker_accessors = {}
    for f_key in ['u', 'd', 'f', 'b', 'r', 'l']:
        g = sticker_geoms[f_key]
        pos_acc = len(accessors)
        accessors.append(
            {
                'bufferView': 0,
                'byteOffset': g['pos_offset'],
                'componentType': 5126,
                'count': g['v_count'],
                'type': 'VEC3',
                'min': g['min_pos'],
                'max': g['max_pos'],
            }
        )
        norm_acc = len(accessors)
        accessors.append(
            {
                'bufferView': 1,
                'byteOffset': g['norm_offset'],
                'componentType': 5126,
                'count': g['v_count'],
                'type': 'VEC3',
            }
        )
        idx_acc = len(accessors)
        accessors.append(
            {
                'bufferView': 2,
                'byteOffset': g['idx_offset'],
                'componentType': 5123,
                'count': g['i_count'],
                'type': 'SCALAR',
            }
        )
        sticker_accessors[f_key] = (pos_acc, norm_acc, idx_acc)

    # Now create nodes & meshes for all visible cubies
    nodes = []
    meshes = []
    scene_nodes = []

    # Helper to get sticker color for facelet
    def get_sticker(x, y, z, face):
        if face == 'u':
            return u[z * n + x]
        if face == 'd':
            return d[(last - z) * n + x]
        if face == 'f':
            return f[(last - y) * n + x]
        if face == 'b':
            return b[(last - y) * n + (last - x)]
        if face == 'r':
            return r[(last - y) * n + (last - z)]
        if face == 'l':
            return l[(last - y) * n + z]

    for z in range(n):
        for y in range(n):
            for x in range(n):
                # Only surface cubies
                if (
                    x != 0
                    and x != last
                    and y != 0
                    and y != last
                    and z != 0
                    and z != last
                ):
                    continue

                primitives = [
                    {
                        'attributes': {'POSITION': 0, 'NORMAL': 1},
                        'indices': 2,
                        'material': 0,  # Black plastic
                    }
                ]

                # Check exterior faces
                if y == last:
                    color = get_sticker(x, y, z, 'u')
                    pos_acc, norm_acc, idx_acc = sticker_accessors['u']
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if y == 0:
                    color = get_sticker(x, y, z, 'd')
                    pos_acc, norm_acc, idx_acc = sticker_accessors['d']
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if z == last:
                    color = get_sticker(x, y, z, 'f')
                    pos_acc, norm_acc, idx_acc = sticker_accessors['f']
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if z == 0:
                    color = get_sticker(x, y, z, 'b')
                    pos_acc, norm_acc, idx_acc = sticker_accessors['b']
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if x == last:
                    color = get_sticker(x, y, z, 'r')
                    pos_acc, norm_acc, idx_acc = sticker_accessors['r']
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if x == 0:
                    color = get_sticker(x, y, z, 'l')
                    pos_acc, norm_acc, idx_acc = sticker_accessors['l']
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )

                mesh_idx = len(meshes)
                meshes.append({'name': f'mesh_cubie_{x}_{y}_{z}', 'primitives': primitives})

                # Position translation centered at 0
                cx = (x - last / 2.0) * 1.0
                cy = (y - last / 2.0) * 1.0
                cz = (z - last / 2.0) * 1.0

                node_idx = len(nodes)
                nodes.append(
                    {
                        'name': f'cubie_{x}_{y}_{z}',
                        'mesh': mesh_idx,
                        'translation': [round(cx, 4), round(cy, 4), round(cz, 4)],
                    }
                )
                scene_nodes.append(node_idx)

    # Construct complete glTF JSON
    gltf_dict = {
        'asset': {
            'version': '2.0',
            'generator': f'cube-assembler-glb-generator ({n}x{n})',
        },
        'scene': 0,
        'scenes': [{'name': f'Cube {n}x{n}', 'nodes': scene_nodes}],
        'nodes': nodes,
        'meshes': meshes,
        'materials': materials,
        'accessors': accessors,
        'bufferViews': buffer_views,
        'buffers': [{'byteLength': len(combined_bin)}],
    }

    # Encode JSON to UTF-8
    json_bytes = json.dumps(gltf_dict, separators=(',', ':')).encode('utf-8')
    # Pad JSON chunk to 4 bytes with spaces (0x20)
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_chunk_data = json_bytes + b' ' * json_pad
    json_chunk_header = struct.pack('<II', len(json_chunk_data), 0x4E4F534A)  # 'JSON'

    # Bin chunk
    bin_pad = (4 - (len(combined_bin) % 4)) % 4
    bin_chunk_data = combined_bin + b'\x00' * bin_pad
    bin_chunk_header = struct.pack('<II', len(bin_chunk_data), 0x004E4942)  # 'BIN\0'

    # GLB Header
    total_len = 12 + 8 + len(json_chunk_data) + 8 + len(bin_chunk_data)
    glb_header = struct.pack('<III', 0x46546C67, 2, total_len)  # 'glTF', version 2

    os.makedirs(os.path.dirname(os.path.abspath(output_glb_path)), exist_ok=True)
    with open(output_glb_path, 'wb') as f:
        f.write(glb_header)
        f.write(json_chunk_header)
        f.write(json_chunk_data)
        f.write(bin_chunk_header)
        f.write(bin_chunk_data)

    print(
        f'Created GLB: {output_glb_path} (size: {os.path.getsize(output_glb_path)} bytes, nodes: {len(nodes)})'
    )


if __name__ == '__main__':
    fixtures = [
        ('test/fixtures/cube-5x5-2026-09-27T09-10-28', 'cube-5x5.glb'),
        ('test/fixtures/cube-7x7-2026-09-27T09-11-33', 'cube-7x7.glb'),
    ]
    for fix_dir, out_name in fixtures:
        if os.path.exists(fix_dir):
            create_cube_glb(fix_dir, out_name)
            # Also save to scratch artifact directory
            art_dir = '/Users/werner/.gemini/antigravity-ide/brain/299cd6a7-d4bb-48ee-a72a-939254337a3b/scratch/'
            create_cube_glb(fix_dir, os.path.join(art_dir, out_name))
