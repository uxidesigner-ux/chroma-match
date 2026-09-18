"""
Hair from a few heavily overlapping volumes — attempt 5d.

5c's ellipsoids still read as separate bulbs because they did not overlap
enough and the remesh kept their seams. This pass uses fewer, larger masses
with deep overlap, and a coarser voxel size so the union is one form before
any detail is added.
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
    # Five masses only. Each overlaps its neighbours by roughly half a radius
    # so the remesh has continuous solid to walk through, not a contact seam.
    pieces = [
        # Skull wrap + crown height.
        ellipsoid("crown", (0.10, 0.70, -0.20), (1.25, 0.95, 1.15), segments=36, rings=26),
        # One continuous hanging volume — left, back and right as ONE ellipsoid
        # stretched wide, so there is no left/right plate split.
        ellipsoid("hang", (0.05, -1.20, -0.25), (1.55, 1.70, 0.85), segments=36, rings=28),
        # Diagonal bang — large, deeply overlapping the crown.
        ellipsoid(
            "bang",
            (-0.25, 0.50, 0.45),
            (1.20, 0.55, 0.55),
            rotation=(0.50, 0.25, 0.75),
            segments=34,
            rings=24,
        ),
        # Short side — overlaps crown and hang.
        ellipsoid(
            "short",
            (0.70, 0.35, 0.35),
            (0.70, 0.55, 0.50),
            rotation=(-0.30, -0.15, -0.45),
        ),
    ]

    hair = lib.join(pieces, "hair")
    lib.fuse(hair, voxel=0.055)
    lib.relax(hair, 0.60, 8)

    # Face opening: tall rounded box, steep meeting angle.
    cutter = lib.round_box(
        "face_cut",
        to_blender((0.0, -0.15, 0.78)),
        (0.55, 0.80, 0.58),
        radius=0.32,
        segments=6,
    )
    lib.boolean(hair, cutter, operation="DIFFERENCE")

    # Clean boolean rim.
    lib.fuse(hair, voxel=0.045)
    lib.relax(hair, 0.45, 5)

    # Parting.
    for vertex in hair.data.vertices:
        p = vertex.co
        q = (p.x, p.z, -p.y)
        dx = q[0] - PART[0]
        on = math.exp(-(dx * dx) / (2 * 0.10 ** 2))
        along = lib.smoothstep(-0.25, 0.45, q[2]) * lib.smoothstep(0.35, 1.20, q[1])
        amount = 0.09 * on * along
        if amount <= 1e-5:
            continue
        r = math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2) or 1.0
        scale = 1.0 - amount / r
        vertex.co = Vector((p.x * scale, p.y * scale, p.z * scale))
    hair.data.update()

    # Soft wave — low amplitude, long wavelength.
    for vertex in hair.data.vertices:
        p = vertex.co
        q = (p.x, p.z, -p.y)
        if q[1] > 0.15:
            continue
        ang = math.atan2(q[0], -q[2] if abs(q[2]) > 1e-6 else 1e-6)
        w = 0.04 * math.sin(ang * 2.2 + q[1] * 1.8)
        w *= lib.smoothstep(0.2, -2.0, q[1])
        horiz = math.hypot(q[0], q[2]) or 1.0
        q2 = (q[0] + w * q[0] / horiz, q[1], q[2] + w * q[2] / horiz)
        vertex.co = Vector(to_blender(q2))
    hair.data.update()

    lib.relax(hair, 0.30, 2)
    lib.shaded_smooth(hair)
    return hair
