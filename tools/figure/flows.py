"""
The reference hairstyle's flow, as curves, before any surface exists.

Every number here comes from measuring the reference render and converting at
its own scale: the distance between the eyes is one unit there and 0.524 head
units here, so a measurement in eye-separations transfers without having to
assume the two heads are the same size.

What the measurement gave (eye-separations, from the eye line, + is up and the
viewer's right):

    hair rises above the eye line      3.06        -> +1.60 head units
    widest across                      6.00        ->  3.14
    widest at, below the eye line      0.74        -> -0.39
    parting, right of face centre      0.84        -> +0.44
    hairline peak above the eye line   1.61        -> +0.84
    hairline at the temple             -0.15       -> -0.08

The two that matter most are the ones the current model misses by the widest
margin. The parting is on the viewer's right and the mass is thrown across to
the left, which is the asymmetry; and the hair stands 0.6 units above the skull
rather than the 0.06 the present scalp has, which is the volume.
"""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402
from character import to_blender  # noqa: E402

# The parting is a line on the scalp, not the top of the hair. Solving the
# skull's own surface at x = +0.44 puts it at y = +0.88; the first placement had
# it at +1.46, which is half a unit above the crown, and every flow left from
# a point floating over the head.
PART = (0.44, 0.96, 0.10)

# The measured hairline, in head units: x across, y above the eye line. The
# flows have to cross the brow just above this, and it is not symmetric — the
# peak is at +0.27, left of the parting, and the left side falls away gently to
# the temple while the right side drops steeply.
#
#   x    -0.86  -0.55  -0.24   0.00  +0.27  +0.48  +0.58  +0.79
#   y    -0.08  +0.16  +0.42  +0.65  +0.85  +0.73  +0.59   0.00

# Each flow is a path through that design. `certain` marks the ones the
# reference actually shows: the front and the sides are visible, the back is
# not, and neither is anything below the crop.
FLOWS = [
    # The big diagonal. Out of the parting, forward over the brow just above the
    # hairline, across to the far temple, then down. This one carries the style.
    ("sweep_across", True, [
        PART, (0.20, 1.06, 0.40), (-0.26, 0.98, 0.64), (-0.72, 0.56, 0.62),
        (-1.02, -0.18, 0.46), (-1.18, -1.10, 0.34), (-1.06, -2.02, 0.42),
        (-1.32, -2.90, 0.16)]),
    # Behind it, the same direction, hugging the skull rather than the brow.
    ("sweep_across_2", True, [
        PART, (0.10, 1.12, 0.06), (-0.40, 1.00, -0.06), (-0.86, 0.46, -0.04),
        (-1.14, -0.40, 0.00), (-1.24, -1.34, 0.10), (-1.14, -2.28, 0.04),
        (-1.40, -2.96, -0.06)]),
    # The short side of the parting, over the right brow.
    ("sweep_short", True, [
        (0.50, 0.94, 0.08), (0.74, 0.86, 0.38), (0.98, 0.42, 0.44),
        (1.16, -0.30, 0.34), (1.28, -1.20, 0.38), (1.16, -2.10, 0.26),
        (1.36, -2.86, 0.06)]),
    ("sweep_short_2", True, [
        (0.48, 0.92, -0.08), (0.80, 0.82, -0.02), (1.06, 0.34, -0.04),
        (1.24, -0.54, -0.08), (1.18, -1.48, 0.00), (1.38, -2.42, -0.10)]),
    # Down the back of the head. Not visible in the reference — designed.
    ("back_left", False, [
        (0.34, 0.94, -0.24), (-0.10, 1.02, -0.56), (-0.60, 0.50, -0.72),
        (-0.90, -0.42, -0.68), (-0.86, -1.46, -0.54), (-1.00, -2.50, -0.36)]),
    ("back_right", False, [
        (0.54, 0.92, -0.24), (0.78, 0.86, -0.56), (0.96, 0.36, -0.72),
        (1.06, -0.52, -0.66), (0.98, -1.56, -0.52), (1.12, -2.56, -0.34)]),
    ("back_centre", False, [
        (0.42, 0.96, -0.18), (0.22, 1.00, -0.62), (0.12, 0.20, -0.86),
        (0.06, -0.80, -0.82), (0.10, -1.86, -0.66), (0.04, -2.72, -0.46)]),
    # Over the ear, between the sweep and the back. Without these the mass
    # splits into a front group and a back group with the side of the head
    # showing between them, and the whole thing reads as two thick tails
    # rather than a head of hair. The reference has no such gap; the flow is
    # continuous from the brow round to the nape.
    ("side_left", True, [
        (0.06, 1.06, -0.10), (-0.46, 0.92, -0.28), (-0.92, 0.28, -0.34),
        (-1.16, -0.62, -0.26), (-1.10, -1.60, -0.14), (-1.26, -2.60, -0.14)]),
    ("side_right", True, [
        (0.52, 1.02, -0.12), (0.88, 0.86, -0.28), (1.14, 0.24, -0.34),
        (1.30, -0.66, -0.24), (1.22, -1.64, -0.12), (1.38, -2.60, -0.12)]),
]


def curve_tube(name, path, radius):
    """The evaluated curve, made visible.

    A polyline through the control points is not the curve — a NURBS control
    polygon can have a bend in it that the evaluated curve smooths away, which
    is exactly the trap of calling a wave done because the numbers zig-zag. So
    the curve is evaluated and swept with a round section, and what renders is
    the path itself.
    """
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 48
    spline = curve.splines.new("NURBS")
    spline.points.add(len(path) - 1)
    for i, point in enumerate(path):
        spline.points[i].co = (*to_blender(point), 1.0)
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(path))
    curve.bevel_depth = radius
    curve.bevel_resolution = 6
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.select_set(False)
    lib.shaded_smooth(obj)
    return obj


def build():
    lib.reset()
    seen = lib.material("flow_seen", (0.95, 0.42, 0.18), 0.45)
    guess = lib.material("flow_guess", (0.42, 0.62, 0.95), 0.45)
    knot = lib.material("flow_knot", (0.30, 0.86, 0.45), 0.35)

    for name, certain, path in FLOWS:
        lib.assign(curve_tube(name, path, 0.030), seen if certain else guess)

    # The parting, marked where it is.
    ball = lib.sphere_cage(20, 14, lambda d: (d.x * 0.075, d.y * 0.075, d.z * 0.075))
    lib.subsurf(ball, 1)
    lib.shaded_smooth(ball)
    ball.name = "parting"
    ball.location = to_blender(PART)
    lib.assign(ball, knot)

    out = Path(__file__).resolve().parents[2] / "public" / "figure" / "flows.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    lib.export(str(out))
    print(f"BUILT {out} bytes={out.stat().st_size}")


if __name__ == "__main__":
    build()
