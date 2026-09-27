#!/usr/bin/env python3
"""
Generate a procedural PBR multi-cubie glTF/GLB model from a cube-assembler fixture.

Each visible cubie is an independent node in the glTF scene graph with:
- Rounded corners and beveled edges matching realistic stickerless speedcubes
- Calibrated PBR materials with smooth surface sheen and accurate fixture colors
- Dark interior mechanism core visible through the realistic seam grooves
"""

import json
import math
import os
import struct
import sys
from pathlib import Path


def srgb_to_linear(c):
    v = c / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def get_face_seams(face, x, y, z, n):
    last = n - 1
    if face == 'u':
        return (z > 0, z < last, x < last, x > 0)
    if face == 'd':
        return (z < last, z > 0, x < last, x > 0)
    if face == 'f':
        return (y < last, y > 0, x < last, x > 0)
    if face == 'b':
        return (y < last, y > 0, x > 0, x < last)
    if face == 'r':
        return (y < last, y > 0, z > 0, z < last)
    if face == 'l':
        return (y < last, y > 0, z < last, z > 0)
    return (True, True, True, True)


def make_beveled_face(u_axis, v_axis, n_axis, H=0.495, r=0.058, seams=(True, True, True, True)):
    s = H - r
    d = r * 0.4
    miter = r * 0.50
    z_outer = H - r * 0.65
    z_skirt = H - 0.14
    seam_top, seam_bot, seam_rt, seam_lt = seams

    def pt(u, v, n):
        return [
            round(u * u_axis[0] + v * v_axis[0] + n * n_axis[0], 5),
            round(u * u_axis[1] + v * v_axis[1] + n * n_axis[1], 5),
            round(u * u_axis[2] + v * v_axis[2] + n * n_axis[2], 5),
        ]

    def norm(nu, nv, nn):
        l = math.hypot(nu, nv, nn) or 1.0
        return [
            round((nu * u_axis[0] + nv * v_axis[0] + nn * n_axis[0]) / l, 5),
            round((nu * u_axis[1] + nv * v_axis[1] + nn * n_axis[1]) / l, 5),
            round((nu * u_axis[2] + nv * v_axis[2] + nn * n_axis[2]) / l, 5),
        ]

    c0, nc0 = pt(-s, -s, H), norm(0, 0, 1)
    c1, nc1 = pt(s, -s, H), norm(0, 0, 1)
    c2, nc2 = pt(s, s, H), norm(0, 0, 1)
    c3, nc3 = pt(-s, s, H), norm(0, 0, 1)

    v_top = H if seam_top else H - miter
    z_top = z_outer if seam_top else H - miter
    e_top0, ne_top0 = pt(-s, v_top, z_top), norm(0, 0.7, 0.7)
    e_top1, ne_top1 = pt(s, v_top, z_top), norm(0, 0.7, 0.7)

    v_bot = -H if seam_bot else -(H - miter)
    z_bot = z_outer if seam_bot else H - miter
    e_bot0, ne_bot0 = pt(-s, v_bot, z_bot), norm(0, -0.7, 0.7)
    e_bot1, ne_bot1 = pt(s, v_bot, z_bot), norm(0, -0.7, 0.7)

    u_rt = H if seam_rt else H - miter
    z_rt = z_outer if seam_rt else H - miter
    e_rt0, ne_rt0 = pt(u_rt, -s, z_rt), norm(0.7, 0, 0.7)
    e_rt1, ne_rt1 = pt(u_rt, s, z_rt), norm(0.7, 0, 0.7)

    u_lt = -H if seam_lt else -(H - miter)
    z_lt = z_outer if seam_lt else H - miter
    e_lt0, ne_lt0 = pt(u_lt, -s, z_lt), norm(-0.7, 0, 0.7)
    e_lt1, ne_lt1 = pt(u_lt, s, z_lt), norm(-0.7, 0, 0.7)

    # 1. Top-Right (TR)
    if seam_rt and seam_top:
        crn_tr = pt(H - d, H - d, z_outer)
        ncrn_tr = norm(0.6, 0.6, 0.5)
    elif not seam_rt and not seam_top:
        crn_tr = pt(H - miter, H - miter, H - miter)
        ncrn_tr = norm(0.577, 0.577, 0.577)
    elif seam_rt and not seam_top:
        crn_tr = pt(H, H - miter, H - miter)
        ncrn_tr = norm(0, 0.7, 0.7)
    else:
        crn_tr = pt(H - miter, H, H - miter)
        ncrn_tr = norm(0.7, 0, 0.7)

    # 2. Top-Left (TL)
    if seam_lt and seam_top:
        crn_tl = pt(-(H - d), H - d, z_outer)
        ncrn_tl = norm(-0.6, 0.6, 0.5)
    elif not seam_lt and not seam_top:
        crn_tl = pt(-(H - miter), H - miter, H - miter)
        ncrn_tl = norm(-0.577, 0.577, 0.577)
    elif seam_lt and not seam_top:
        crn_tl = pt(-H, H - miter, H - miter)
        ncrn_tl = norm(0, 0.7, 0.7)
    else:
        crn_tl = pt(-(H - miter), H, H - miter)
        ncrn_tl = norm(-0.7, 0, 0.7)

    # 3. Bottom-Left (BL)
    if seam_lt and seam_bot:
        crn_bl = pt(-(H - d), -(H - d), z_outer)
        ncrn_bl = norm(-0.6, -0.6, 0.5)
    elif not seam_lt and not seam_bot:
        crn_bl = pt(-(H - miter), -(H - miter), H - miter)
        ncrn_bl = norm(-0.577, -0.577, 0.577)
    elif seam_lt and not seam_bot:
        crn_bl = pt(-H, -(H - miter), H - miter)
        ncrn_bl = norm(0, -0.7, 0.7)
    else:
        crn_bl = pt(-(H - miter), -H, H - miter)
        ncrn_bl = norm(-0.7, 0, 0.7)

    # 4. Bottom-Right (BR)
    if seam_rt and seam_bot:
        crn_br = pt(H - d, -(H - d), z_outer)
        ncrn_br = norm(0.6, -0.6, 0.5)
    elif not seam_rt and not seam_bot:
        crn_br = pt(H - miter, -(H - miter), H - miter)
        ncrn_br = norm(0.577, -0.577, 0.577)
    elif seam_rt and not seam_bot:
        crn_br = pt(H, -(H - miter), H - miter)
        ncrn_br = norm(0, -0.7, 0.7)
    else:
        crn_br = pt(H - miter, -H, H - miter)
        ncrn_br = norm(0.7, 0, 0.7)

    verts = [
        c0, c1, c2, c3,
        e_top0, e_top1, e_bot0, e_bot1,
        e_rt0, e_rt1, e_lt0, e_lt1,
        crn_tr, crn_tl, crn_bl, crn_br,
    ]
    norms = [
        nc0, nc1, nc2, nc3,
        ne_top0, ne_top1, ne_bot0, ne_bot1,
        ne_rt0, ne_rt1, ne_lt0, ne_lt1,
        ncrn_tr, ncrn_tl, ncrn_bl, ncrn_br,
    ]
    indices = [
        0, 1, 2,  0, 2, 3,
        3, 2, 5,  3, 5, 4,
        6, 7, 1,  6, 1, 0,
        1, 8, 9,  1, 9, 2,
        10, 0, 3,  10, 3, 11,
        2, 9, 12,  2, 12, 5,
        3, 4, 13,  3, 13, 11,
        0, 10, 14,  0, 14, 6,
        1, 7, 15,  1, 15, 8,
    ]

    # Side skirts into internal seam grooves ONLY
    if seam_top:
        idx_base = len(verts)
        verts.extend([pt(-s, H, z_skirt), pt(s, H, z_skirt)])
        ns = norm(0, 1, 0)
        norms.extend([ns, ns])
        indices.extend([4, 5, idx_base + 1, 4, idx_base + 1, idx_base])

    if seam_bot:
        idx_base = len(verts)
        verts.extend([pt(-s, -H, z_skirt), pt(s, -H, z_skirt)])
        ns = norm(0, -1, 0)
        norms.extend([ns, ns])
        indices.extend([7, 6, idx_base, 7, idx_base, idx_base + 1])

    if seam_rt:
        idx_base = len(verts)
        verts.extend([pt(H, -s, z_skirt), pt(H, s, z_skirt)])
        ns = norm(1, 0, 0)
        norms.extend([ns, ns])
        indices.extend([9, 8, idx_base, 9, idx_base, idx_base + 1])

    if seam_lt:
        idx_base = len(verts)
        verts.extend([pt(-H, -s, z_skirt), pt(-H, s, z_skirt)])
        ns = norm(-1, 0, 0)
        norms.extend([ns, ns])
        indices.extend([10, 11, idx_base + 1, 10, idx_base + 1, idx_base])

    return verts, norms, indices


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
            'W': [215, 218, 205],
            'Y': [195, 215, 38],
            'O': [239, 85, 34],
            'R': [200, 32, 45],
            'G': [12, 168, 58],
            'B': [5, 70, 140],
        }

    # Color index mapping: 0..5 = W, Y, O, R, G, B
    color_keys = ['W', 'Y', 'O', 'R', 'G', 'B']
    mat_index = {c: i for i, c in enumerate(color_keys)}

    # Build PBR materials
    materials = []
    for c in color_keys:
        rgb = learned[c]
        lin_rgb = [round(srgb_to_linear(v), 4) for v in rgb]
        materials.append(
            {
                'name': f'Plastic_Stickerless_{c}',
                'pbrMetallicRoughness': {
                    'baseColorFactor': [lin_rgb[0], lin_rgb[1], lin_rgb[2], 1.0],
                    'roughnessFactor': 0.22,
                    'metallicFactor': 0.0,
                },
            }
        )

    # Geometry buffers
    positions_data = bytearray()
    normals_data = bytearray()
    indices_data = bytearray()

    def add_geom(vertices, normals, indices):
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

    # Rounded beveled face caps with tight gap and smoothed rounded miters
    # Right-handed coordinate frames (u x v = n)
    face_axes_def = {
        'u': ([1, 0, 0], [0, 0, -1], [0, 1, 0]),
        'd': ([1, 0, 0], [0, 0, 1], [0, -1, 0]),
        'f': ([1, 0, 0], [0, 1, 0], [0, 0, 1]),
        'b': ([-1, 0, 0], [0, 1, 0], [0, 0, -1]),
        'r': ([0, 0, -1], [0, 1, 0], [1, 0, 0]),
        'l': ([0, 0, 1], [0, 1, 0], [-1, 0, 0]),
    }

    # Find all unique (f_key, seams) combinations across the cube
    needed_combos = set()
    for z in range(n):
        for y in range(n):
            for x in range(n):
                if x != 0 and x != last and y != 0 and y != last and z != 0 and z != last:
                    continue
                if y == last:
                    needed_combos.add(('u', get_face_seams('u', x, y, z, n)))
                if y == 0:
                    needed_combos.add(('d', get_face_seams('d', x, y, z, n)))
                if z == last:
                    needed_combos.add(('f', get_face_seams('f', x, y, z, n)))
                if z == 0:
                    needed_combos.add(('b', get_face_seams('b', x, y, z, n)))
                if x == last:
                    needed_combos.add(('r', get_face_seams('r', x, y, z, n)))
                if x == 0:
                    needed_combos.add(('l', get_face_seams('l', x, y, z, n)))

    beveled_geoms = {}
    for f_key, seams in sorted(needed_combos):
        u_ax, v_ax, n_ax = face_axes_def[f_key]
        v, n_vecs, idx = make_beveled_face(u_ax, v_ax, n_ax, H=0.495, r=0.040, seams=seams)
        beveled_geoms[(f_key, seams)] = add_geom(v, n_vecs, idx)

    # Align binary chunks to 4 bytes
    def pad4(b, pad_byte=b'\x00'):
        rem = len(b) % 4
        if rem != 0:
            b.extend(pad_byte * (4 - rem))

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
        {
            'buffer': 0,
            'byteOffset': 0,
            'byteLength': pos_len,
            'target': 34962,
        },
        {
            'buffer': 0,
            'byteOffset': norm_start,
            'byteLength': norm_len,
            'target': 34962,
        },
        {
            'buffer': 0,
            'byteOffset': idx_start,
            'byteLength': idx_len,
            'target': 34963,
        },
    ]

    # Accessors for Beveled Face Caps:
    accessors = []
    beveled_accessors = {}
    for (f_key, seams), g in sorted(beveled_geoms.items()):
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
        beveled_accessors[(f_key, seams)] = (pos_acc, norm_acc, idx_acc)

    nodes = []
    meshes = []
    scene_nodes = []

    def get_facelet_color(x, y, z, face):
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

                primitives = []

                # Exterior rounded caps
                if y == last:
                    color = get_facelet_color(x, y, z, 'u')
                    seams = get_face_seams('u', x, y, z, n)
                    pos_acc, norm_acc, idx_acc = beveled_accessors[('u', seams)]
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if y == 0:
                    color = get_facelet_color(x, y, z, 'd')
                    seams = get_face_seams('d', x, y, z, n)
                    pos_acc, norm_acc, idx_acc = beveled_accessors[('d', seams)]
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if z == last:
                    color = get_facelet_color(x, y, z, 'f')
                    seams = get_face_seams('f', x, y, z, n)
                    pos_acc, norm_acc, idx_acc = beveled_accessors[('f', seams)]
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if z == 0:
                    color = get_facelet_color(x, y, z, 'b')
                    seams = get_face_seams('b', x, y, z, n)
                    pos_acc, norm_acc, idx_acc = beveled_accessors[('b', seams)]
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if x == last:
                    color = get_facelet_color(x, y, z, 'r')
                    seams = get_face_seams('r', x, y, z, n)
                    pos_acc, norm_acc, idx_acc = beveled_accessors[('r', seams)]
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )
                if x == 0:
                    color = get_facelet_color(x, y, z, 'l')
                    seams = get_face_seams('l', x, y, z, n)
                    pos_acc, norm_acc, idx_acc = beveled_accessors[('l', seams)]
                    primitives.append(
                        {
                            'attributes': {'POSITION': pos_acc, 'NORMAL': norm_acc},
                            'indices': idx_acc,
                            'material': mat_index[color],
                        }
                    )

                mesh_idx = len(meshes)
                meshes.append({'name': f'mesh_cubie_{x}_{y}_{z}', 'primitives': primitives})

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

    # glTF JSON
    gltf_dict = {
        'asset': {
            'version': '2.0',
            'generator': f'cube-assembler-stickerless-glb ({n}x{n})',
        },
        'scene': 0,
        'scenes': [{'name': f'Speedcube {n}x{n}', 'nodes': scene_nodes}],
        'nodes': nodes,
        'meshes': meshes,
        'materials': materials,
        'accessors': accessors,
        'bufferViews': buffer_views,
        'buffers': [{'byteLength': len(combined_bin)}],
    }

    json_bytes = json.dumps(gltf_dict, separators=(',', ':')).encode('utf-8')
    json_pad = (4 - (len(json_bytes) % 4)) % 4
    json_chunk_data = json_bytes + b' ' * json_pad
    json_chunk_header = struct.pack('<II', len(json_chunk_data), 0x4E4F534A)

    bin_pad = (4 - (len(combined_bin) % 4)) % 4
    bin_chunk_data = combined_bin + b'\x00' * bin_pad
    bin_chunk_header = struct.pack('<II', len(bin_chunk_data), 0x004E4942)

    total_len = 12 + 8 + len(json_chunk_data) + 8 + len(bin_chunk_data)
    glb_header = struct.pack('<III', 0x46546C67, 2, total_len)

    os.makedirs(os.path.dirname(os.path.abspath(output_glb_path)), exist_ok=True)
    with open(output_glb_path, 'wb') as f:
        f.write(glb_header)
        f.write(json_chunk_header)
        f.write(json_chunk_data)
        f.write(bin_chunk_header)
        f.write(bin_chunk_data)

    print(
        f'Generated {output_glb_path}: size={os.path.getsize(output_glb_path)} bytes, nodes={len(nodes)}'
    )


if __name__ == '__main__':
    fixtures = [
        ('test/fixtures/cube-5x5-2026-09-27T09-10-28', 'cube-5x5.glb'),
        ('test/fixtures/cube-7x7-2026-09-27T09-11-33', 'cube-7x7.glb'),
    ]
    for fix_dir, out_name in fixtures:
        if os.path.exists(fix_dir):
            create_cube_glb(fix_dir, out_name)
            art_dir = '/Users/werner/.gemini/antigravity-ide/brain/299cd6a7-d4bb-48ee-a72a-939254337a3b/scratch/'
            create_cube_glb(fix_dir, os.path.join(art_dir, out_name))
