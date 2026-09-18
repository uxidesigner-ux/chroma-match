"""
Hair as a thick open wrap around the skull, plus hanging locks — attempt 6.

Closed helmet + face hole = hood. Crown-only scalp + tubes = two tails.
This pass:

  * keeps the sides and back of a skull-hugging shell
  * deletes only the face oval, so temples stay covered
  * solidifies that wrap thick enough to read as clay, not a sheet
  * adds a diagonal bang and hanging S-curve locks from the wrap
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

PART = (0.30, 0.86, 0.14)


def clay_tube(name, path, radii, resolution=16):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    spline = curve.splines.new("NURBS")
    spline.points.add(len(path) - 1)
    for i, point in enumerate(path):
        spline.points[i].co = (*to_blender(point), 1.0)
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(path))
    curve.bevel_depth = 1.0
    curve.bevel_resolution = 4
    curve.use_fill_caps = True
    curve.twist_mode = "MINIMUM"

    taper = bpy.data.curves.new(name + "_taper", "CURVE")
    taper.dimensions = "3D"
    tspline = taper.splines.new("NURBS")
    tspline.points.add(len(radii) - 1)
    span = max(1, len(radii) - 1)
    for i, radius in enumerate(radii):
        tspline.points[i].co = (i / span * 2.0, float(radius), 0.0, 1.0)
    tspline.use_endpoint_u = True
    taper_obj = bpy.data.objects.new(name + "_taper", taper)
    bpy.context.scene.collection.objects.link(taper_obj)
    curve.taper_object = taper_obj

    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.select_set(False)
    bpy.data.objects.remove(taper_obj, do_unlink=True)
    obj.name = name
    return obj


def seat_inside(obj, clearance=0.05):
    for vertex in obj.data.vertices:
        p = vertex.co
        q = (p.x, p.z, -p.y)
        radius = math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2)
        if radius < 1e-6:
            continue
        d = (q[0] / radius, q[1] / radius, q[2] / radius)
        surface = head_surface(d)
        reach = math.sqrt(surface[0] ** 2 + surface[1] ** 2 + surface[2] ** 2) + clearance
        if radius >= reach:
            continue
        scale = reach / radius
        vertex.co = Vector((p.x * scale, p.y * scale, p.z * scale))
    obj.data.update()
    return obj


def build_wrap():
    """Skull wrap: sides, back, crown. Face oval is simply not there."""

    def shape(d):
        q = (d.x, d.z, -d.y)
        p = list(head_surface(q))
        r = math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2) or 1.0
        # Slightly more thickness at the sides than on the crown.
        side = lib.smoothstep(0.15, 0.70, abs(q[0]))
        grow = 0.10 + 0.08 * side
        return to_blender((p[0] + grow * p[0] / r, p[1] + grow * p[1] / r, p[2] + grow * p[2] / r))

    wrap = lib.sphere_cage(44, 30, shape)
    wrap.name = "wrap"
    lib.subsurf(wrap, 1)

    bm = bmesh.new()
    bm.from_mesh(wrap.data)
    kill = []
    for v in bm.verts:
        x, y, z = v.co.x, v.co.z, -v.co.y
        hairline = 0.64 + 0.22 * lib.smoothstep(-0.10, 0.70, x)
        in_face = z > 0.12 and y < hairline and y > -0.70 and abs(x) < 0.80
        under_jaw = y < -0.32 and z > -0.18
        if in_face or under_jaw:
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(wrap.data)
    bm.free()
    wrap.data.update()

    lib.solidify(wrap, thickness=0.14, offset=1.0)
    lib.relax(wrap, 0.30, 2)
    return wrap


def bang_ribbon():
    path = [
        PART,
        (0.06, 0.70, 0.50),
        (-0.24, 0.50, 0.86),
        (-0.54, 0.24, 0.90),
        (-0.80, -0.08, 0.74),
        (-1.00, -0.55, 0.54),
        (-1.16, -1.20, 0.40),
        (-1.28, -1.90, 0.36),
        (-1.34, -2.50, 0.50),
        (-1.20, -3.00, 0.22),
        (-1.34, -3.32, 0.04),
    ]
    widths = [0.44, 0.80, 1.05, 0.98, 0.80, 0.64, 0.54, 0.48, 0.40, 0.24, 0.08]
    obj = lib.ribbon(
        "bang",
        [to_blender(p) for p in path],
        widths,
        flatten=0.84,
        tilt=0.18,
        resolution=20,
    )
    obj.name = "bang"
    return obj


LOCKS = [
    (
        "short",
        [
            (0.42, 0.82, 0.20),
            (0.66, 0.62, 0.52),
            (0.90, 0.28, 0.56),
            (1.08, -0.12, 0.44),
            (1.20, -0.80, 0.32),
            (1.30, -1.55, 0.36),
            (1.18, -2.25, 0.46),
            (1.12, -2.85, 0.18),
            (1.26, -3.28, 0.02),
        ],
        [0.16, 0.26, 0.30, 0.28, 0.24, 0.22, 0.18, 0.12, 0.05],
    ),
    (
        "len_l",
        [
            (-0.55, 0.20, 0.20),
            (-0.92, -0.35, 0.28),
            (-1.14, -1.10, 0.34),
            (-1.28, -1.85, 0.30),
            (-1.22, -2.55, 0.42),
            (-1.16, -3.05, 0.18),
            (-1.30, -3.35, 0.02),
        ],
        [0.28, 0.32, 0.30, 0.26, 0.22, 0.14, 0.05],
    ),
    (
        "len_r",
        [
            (0.70, 0.18, 0.18),
            (1.02, -0.38, 0.26),
            (1.22, -1.12, 0.32),
            (1.32, -1.88, 0.28),
            (1.20, -2.58, 0.40),
            (1.14, -3.05, 0.16),
            (1.28, -3.35, 0.02),
        ],
        [0.26, 0.30, 0.28, 0.24, 0.20, 0.14, 0.05],
    ),
    (
        "back_l",
        [
            (0.12, 0.84, -0.18),
            (-0.30, 0.50, -0.50),
            (-0.70, 0.00, -0.58),
            (-0.90, -0.70, -0.46),
            (-0.96, -1.60, -0.32),
            (-1.04, -2.50, -0.20),
            (-0.96, -3.15, -0.10),
        ],
        [0.24, 0.30, 0.30, 0.26, 0.20, 0.14, 0.06],
    ),
    (
        "back_r",
        [
            (0.42, 0.82, -0.18),
            (0.78, 0.46, -0.50),
            (1.02, -0.04, -0.56),
            (1.12, -0.75, -0.44),
            (1.08, -1.65, -0.30),
            (1.14, -2.55, -0.18),
            (1.04, -3.15, -0.10),
        ],
        [0.24, 0.30, 0.28, 0.24, 0.20, 0.14, 0.06],
    ),
]


def build_hair() -> bpy.types.Object:
    pieces = [build_wrap(), bang_ribbon()]
    seat_inside(pieces[-1], clearance=0.04)
    for name, path, radii in LOCKS:
        obj = clay_tube(name, path, radii)
        seat_inside(obj, clearance=0.05)
        pieces.append(obj)

    hair = lib.join(pieces, "hair")
    lib.fuse(hair, voxel=0.022)
    lib.relax(hair, 0.45, 6)

    for vertex in hair.data.vertices:
        p = vertex.co
        q = [p.x, p.z, -p.y]
        if q[1] > -0.45:
            continue
        t = lib.smoothstep(-0.45, -2.6, q[1])
        flare = 1.0 + 0.22 * t
        wave = 0.11 * t * math.sin(q[1] * 2.3 + math.atan2(q[0], q[2] + 1e-6) * 2.1)
        horiz = math.hypot(q[0], q[2]) or 1.0
        q[0] *= flare
        q[2] += wave * (q[2] / horiz)
        vertex.co = Vector(to_blender(q))
    hair.data.update()
    lib.relax(hair, 0.28, 2)
    lib.shaded_smooth(hair)
    return hair
