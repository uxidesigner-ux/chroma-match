"""
Hair from overlapping soft volumes — attempt 5c (kept as best of this round).

Attempt history for this remake round is in NOTES.md. Short version:

  5a  bands + bang ribbons fused     → still leaf / plate silhouette
  5b  one open shell + bang lift     → still slabs, flat crown
  5c  overlapping ellipsoids + remesh → diagonal bang readable; seams remain
  5d  fewer masses, coarser remesh   → one helmet; style lost (checkpointed)

5c is kept: it is the only pass this round where the large form still shows a
diagonal bang and side/back volume without collapsing into a hood. The seams
between volumes are a remaining sculpt defect, not an approved design.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Euler

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402
from character import to_blender  # noqa: E402

PART = (0.44, 0.96, 0.10)


def ellipsoid(name, centre, radii, rotation=(0.0, 0.0, 0.0), segments=30, rings=22):
    rx, ry, rz = radii

    def shape(d):
        ax, ay, az = d.x * rx, d.z * ry, (-d.y) * rz
        return to_blender((ax, ay, az))

    obj = lib.sphere_cage(segments, rings, shape)
    obj.name = name
    ax, ay, az = rotation
    obj.rotation_euler = Euler((ax, -az, ay), "XYZ")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(rotation=True)
    obj.location = Vector(to_blender(centre))
    bpy.ops.object.transform_apply(location=True)
    return obj


def build_hair() -> bpy.types.Object:
    pieces = [
        ellipsoid("crown", (0.08, 0.90, -0.10), (1.10, 0.78, 1.00), segments=32, rings=24),
        ellipsoid("back", (0.06, -0.55, -0.50), (1.20, 1.50, 0.75), segments=32, rings=24),
        ellipsoid(
            "left_len",
            (-0.95, -1.15, 0.08),
            (0.58, 1.50, 0.52),
            rotation=(0.20, 0.0, 0.40),
        ),
        ellipsoid(
            "right_len",
            (1.08, -1.10, 0.02),
            (0.52, 1.45, 0.48),
            rotation=(-0.12, 0.0, -0.35),
        ),
        ellipsoid(
            "bang",
            (-0.20, 0.58, 0.58),
            (1.05, 0.48, 0.42),
            rotation=(0.60, 0.20, 0.90),
            segments=32,
            rings=22,
        ),
        ellipsoid(
            "bang_short",
            (0.78, 0.48, 0.48),
            (0.52, 0.42, 0.36),
            rotation=(-0.40, -0.12, -0.60),
        ),
        ellipsoid("side_l", (-1.08, -0.20, -0.12), (0.48, 0.78, 0.55)),
        ellipsoid("side_r", (1.18, -0.20, -0.12), (0.45, 0.75, 0.52)),
        ellipsoid("nape", (0.08, -1.85, -0.30), (1.00, 0.75, 0.58)),
    ]

    hair = lib.join(pieces, "hair")
    lib.fuse(hair, voxel=0.040)
    lib.relax(hair, 0.55, 6)

    cutter = lib.round_box(
        "face_cut",
        to_blender((0.02, -0.08, 0.72)),
        (0.58, 0.72, 0.52),
        radius=0.30,
        segments=5,
    )
    lib.boolean(hair, cutter, operation="DIFFERENCE")

    for vertex in hair.data.vertices:
        p = vertex.co
        q = (p.x, p.z, -p.y)
        dx = q[0] - PART[0]
        on = math.exp(-(dx * dx) / (2 * 0.09 ** 2))
        along = lib.smoothstep(-0.30, 0.50, q[2]) * lib.smoothstep(0.40, 1.25, q[1])
        amount = 0.085 * on * along
        if amount <= 1e-5:
            continue
        r = math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2) or 1.0
        scale = 1.0 - amount / r
        vertex.co = Vector((p.x * scale, p.y * scale, p.z * scale))
    hair.data.update()

    for vertex in hair.data.vertices:
        p = vertex.co
        q = (p.x, p.z, -p.y)
        if q[1] > 0.2:
            continue
        ang = math.atan2(q[0], q[2])
        w = 0.035 * math.sin(ang * 2.8 + q[1] * 2.5)
        w *= lib.smoothstep(0.3, -1.5, q[1])
        horiz = math.hypot(q[0], q[2]) or 1.0
        q2 = (q[0] + w * q[0] / horiz, q[1], q[2] + w * q[2] / horiz)
        vertex.co = Vector(to_blender(q2))
    hair.data.update()

    lib.relax(hair, 0.35, 3)
    lib.shaded_smooth(hair)
    return hair
