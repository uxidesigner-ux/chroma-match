"""Initial tube-clump blockout. Writes only to assets/long-wave/generated/.

Does not overwrite the editable original (.blend) or the shipped hair GLB.
Those come from a hand-edited original plus export_hair.py.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402
from character import to_blender, head_surface  # noqa: E402

# Viewer's right. Hair is thrown across to the viewer's left.
PART = (0.22, 0.92, 0.08)

ASSET_DIR = Path(__file__).resolve().parent / "assets" / "long-wave"
PUBLIC = Path(__file__).resolve().parents[2] / "public" / "figure"


def bang_pt(x, y, clearance, z_guess=0.75):
    """Centreline in front of the formula forehead. Inner sides may graze."""
    r = math.sqrt(x * x + y * y + z_guess * z_guess) or 1.0
    surface = head_surface((x / r, y / r, z_guess / r))
    return (x, y, surface[2] + clearance)


def _auth(co):
    return (co.x, co.z, -co.y)


def tube(name, path, widths, flatten=0.58, tilt=0.0, resolution=18):
    """ZEPETO-style hair tube: a clump, not a one-sided plane."""
    obj = lib.ribbon(
        name,
        [to_blender(p) for p in path],
        widths,
        flatten=flatten,
        tilt=tilt,
        resolution=resolution,
    )
    obj.name = name
    obj.data.name = name
    lib.shaded_smooth(obj)
    return obj


def fuse_clump(objects, name, voxel=0.048):
    """Union overlapping tubes in one region. Do not run this on the open scalp."""
    merged = lib.join(objects, name)
    lib.fuse(merged, voxel=voxel)
    lib.relax(merged, 0.28, 2)
    lib.shaded_smooth(merged)
    merged.name = name
    merged.data.name = name
    return merged


def build_scalp():
    """Open skull cap. Face window is authored, not a boolean visor.

    Front vertices below the hairline are removed, then the remaining
    surface is given thickness. Voxel remesh is not applied here — remeshing
    an open cap closes the hole and becomes a helmet.
    """
    offset = 0.145

    def shape(d):
        p = head_surface((d.x, d.z, -d.y))
        r = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
        q = (
            p[0] + p[0] / r * offset,
            p[1] + p[1] / r * offset,
            p[2] + p[2] / r * offset,
        )
        return to_blender(q)

    obj = lib.sphere_cage(48, 32, shape)
    obj.name = "hair_scalp"
    obj.data.name = "hair_scalp"

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    kill = []
    for vertex in bm.verts:
        q = _auth(vertex.co)
        # Front hairline of the cap only. The bang covers the left forehead
        # below this. The part side stays higher so the face stays open.
        hairline = 0.58 + 0.12 * max(0.0, q[0])
        if q[2] > 0.22 and q[1] < hairline and abs(q[0]) < 0.70:
            kill.append(vertex)
    if kill:
        bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    lib.solidify(obj, thickness=0.11, offset=1.0)
    _smooth_rim(obj)
    lib.relax(obj, 0.22, 1)
    lib.shaded_smooth(obj)
    obj.name = "hair_scalp"
    obj.data.name = "hair_scalp"
    return obj


def _smooth_rim(obj, rounds=10, factor=0.55):
    """Average boundary vertices so the face opening is a hairline, not stairs."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for _ in range(rounds):
        boundary = [v for v in bm.verts if v.is_boundary]
        stored = {v: v.co.copy() for v in boundary}
        for vertex in boundary:
            linked = [e.other_vert(vertex) for e in vertex.link_edges if e.other_vert(vertex).is_boundary]
            if not linked:
                continue
            acc = stored[vertex].copy()
            for other in linked:
                acc += stored[other]
            vertex.co = acc / (1 + len(linked))
            vertex.co = vertex.co.lerp(stored[vertex], 1.0 - factor)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def build_bang():
    """Wide diagonal bang, centreline in front of the finished forehead.

    Negative tilt lays width down the forehead. flatten is a convex sheet,
    not a sausage into the skull (attempt 7/8 diagnosis).
    """
    path = [
        PART,
        bang_pt(0.10, 0.82, 0.06, 0.50),
        bang_pt(-0.02, 0.68, 0.12, 0.74),
        bang_pt(-0.16, 0.54, 0.14, 0.82),
        bang_pt(-0.32, 0.42, 0.13, 0.80),
        bang_pt(-0.48, 0.30, 0.10, 0.62),
        bang_pt(-0.58, 0.16, 0.08, 0.42),
        (-0.72, -0.55, 0.22),
        (-0.80, -1.25, 0.16),
        (-0.70, -1.90, 0.08),
    ]
    widths = [0.28, 0.55, 0.72, 0.78, 0.70, 0.52, 0.40, 0.36, 0.24, 0.12]
    tilt = [0.14, -0.50, -0.82, -0.88, -0.78, -0.42, -0.08, 0.06, 0.04, 0.02]
    return tube("hair_bang", path, widths, flatten=0.34, tilt=tilt, resolution=20)


def build_left():
    # Large S-wave on the viewer's left (negative x). Volume, not a curtain.
    upper = tube(
        "hair_side_l_upper",
        [
            (-0.20, 0.86, 0.06),
            (-0.52, 0.58, 0.28),
            (-0.82, 0.12, 0.38),
            (-1.08, -0.55, 0.22),
            (-0.86, -1.25, 0.12),
            (-1.18, -1.95, 0.28),
            (-0.92, -2.55, 0.10),
            (-1.02, -3.05, 0.04),
        ],
        [0.62, 0.95, 1.12, 1.08, 0.92, 0.78, 0.48, 0.18],
        flatten=0.58,
        tilt=[0.10, 0.06, 0.04, 0.08, 0.12, 0.06, 0.04, 0.02],
    )
    under = tube(
        "hair_side_l_under",
        [
            (-0.40, 0.62, -0.06),
            (-0.72, 0.18, 0.16),
            (-0.98, -0.50, 0.10),
            (-0.78, -1.20, 0.04),
            (-1.10, -1.88, 0.18),
            (-0.88, -2.50, 0.06),
            (-0.96, -3.02, 0.00),
        ],
        [0.50, 0.78, 0.88, 0.80, 0.64, 0.38, 0.14],
        flatten=0.60,
        tilt=0.06,
    )
    lib.relax(upper, 0.18, 1)
    lib.relax(under, 0.18, 1)
    return [upper, under]


def build_right():
    # Part side: less forehead, ear can show. Wave still has real width.
    upper = tube(
        "hair_side_r_upper",
        [
            (0.48, 0.88, 0.04),
            (0.72, 0.52, 0.26),
            (0.96, 0.06, 0.34),
            (1.12, -0.58, 0.18),
            (0.88, -1.28, 0.10),
            (1.16, -1.95, 0.26),
            (0.92, -2.55, 0.08),
            (0.98, -3.05, 0.02),
        ],
        [0.52, 0.82, 0.98, 0.96, 0.82, 0.68, 0.42, 0.16],
        flatten=0.58,
        tilt=[0.10, 0.06, 0.04, 0.08, 0.12, 0.06, 0.04, 0.02],
    )
    under = tube(
        "hair_side_r_under",
        [
            (0.58, 0.58, -0.08),
            (0.82, 0.12, 0.14),
            (1.02, -0.55, 0.08),
            (0.82, -1.22, 0.02),
            (1.08, -1.90, 0.16),
            (0.86, -2.52, 0.04),
            (0.92, -3.00, -0.02),
        ],
        [0.44, 0.70, 0.80, 0.72, 0.56, 0.32, 0.12],
        flatten=0.60,
        tilt=0.06,
    )
    lib.relax(upper, 0.18, 1)
    lib.relax(under, 0.18, 1)
    return [upper, under]


def build_back():
    top = tube(
        "hair_back_top",
        [
            (0.04, 0.94, -0.32),
            (0.02, 0.58, -0.72),
            (0.00, 0.08, -0.82),
            (0.02, -0.55, -0.62),
            (0.00, -1.25, -0.42),
            (0.02, -1.95, -0.28),
            (0.00, -2.60, -0.16),
            (0.02, -3.10, -0.08),
        ],
        [0.70, 1.10, 1.22, 1.18, 1.02, 0.82, 0.50, 0.20],
        flatten=0.70,
        tilt=0.04,
    )
    nape_l = tube(
        "hair_back_nape_l",
        [
            (-0.22, 0.52, -0.58),
            (-0.48, -0.08, -0.52),
            (-0.62, -0.85, -0.36),
            (-0.52, -1.60, -0.20),
            (-0.70, -2.30, -0.12),
            (-0.56, -2.90, -0.06),
        ],
        [0.48, 0.72, 0.78, 0.64, 0.40, 0.16],
        flatten=0.64,
        tilt=0.04,
    )
    nape_r = tube(
        "hair_back_nape_r",
        [
            (0.30, 0.52, -0.58),
            (0.54, -0.08, -0.50),
            (0.66, -0.85, -0.34),
            (0.56, -1.60, -0.18),
            (0.74, -2.30, -0.10),
            (0.58, -2.90, -0.06),
        ],
        [0.46, 0.70, 0.76, 0.62, 0.38, 0.14],
        flatten=0.64,
        tilt=0.04,
    )
    for piece in (top, nape_l, nape_r):
        lib.relax(piece, 0.18, 1)
    return [top, nape_l, nape_r]


def build_hair():
    """Blockout pieces. Kept separate so a later sculpt can edit one region."""
    pieces = [build_scalp(), build_bang()]
    pieces.extend(build_left())
    pieces.extend(build_right())
    pieces.extend(build_back())
    return pieces


def assign_hair(objects, mat):
    for obj in objects:
        lib.assign(obj, mat)
    return objects


def save_blend(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print(f"BLEND {path} bytes={path.stat().st_size}")


def export_objects(objects, path: Path, mat=None):
    """Export only these objects as a GLB, by hiding the rest."""
    hidden = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        if obj not in objects and obj.visible_get():
            obj.hide_set(True)
            hidden.append(obj)
    path.parent.mkdir(parents=True, exist_ok=True)
    lib.export(str(path), visible_only=True)
    for obj in hidden:
        obj.hide_set(False)
    print(f"GLB {path.name} bytes={path.stat().st_size}")


if __name__ == "__main__":
    from asset_paths import GENERATED
    from character import build_head
    lib.reset()
    hair_mat = lib.material("hair", (0.210, 0.145, 0.125), 0.62)
    skin = lib.material("skin", (0.945, 0.710, 0.560), 0.80)
    lib.assign(build_head(), skin)
    pieces = assign_hair(build_hair(), hair_mat)
    GENERATED.mkdir(parents=True, exist_ok=True)
    export_objects(pieces, GENERATED / "blockout_hair.glb")
    save_blend(GENERATED / "blockout.blend")
    print("wrote generated/ only; editable original untouched")
