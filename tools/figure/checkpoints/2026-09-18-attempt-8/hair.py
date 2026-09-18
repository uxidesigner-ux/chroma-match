"""
Hair as overlapping flowing locks — attempt 8.

Spheres and helmet remeshes are out. A closed wrap with a face hole is a hood.
This pass is three layers, kept as separate meshes (no voxel fuse):

  base     — scalp coverage plus the missing back / nape / shoulder volume
  primary  — the large flows: bang, wrapping waves, side-to-back joins
  secondary — smaller locks in the same silhouette, different roots

Each lock is a ribbon whose width, thickness (flatten), and section roll
change along its length. Roots sit in different scalp zones, not one crown
point. Secondary locks sit inside the final outline; they do not invent it.

Hanging locks keep tilt near 0 so their width faces the camera. Large tilt
on a vertical lock turns the section edge-on and reads as a curtain.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import lib  # noqa: E402
from character import to_blender, head_surface  # noqa: E402

# Part on the viewer's right. The long bang is thrown across to the left,
# but it stays above the eyes.
PART = (0.30, 0.88, 0.10)


def bang_pt(x, y, clearance, z_guess=0.75):
    """A bang centreline point in front of the *formula* forehead.

    `seat_inside` only lifts buried roots, and never more than 0.07, so it
    cannot place a bang that was authored through the skull. The visible
    face of the bang has to be authored outside the head; inner sides may
    still graze the skin.
    """
    r = math.sqrt(x * x + y * y + z_guess * z_guess) or 1.0
    surface = head_surface((x / r, y / r, z_guess / r))
    return (x, y, surface[2] + clearance)


def _smoothstep(t):
    t = 0.0 if t < 0.0 else 1.0 if t > 1.0 else t
    return t * t * (3.0 - 2.0 * t)


def seat_inside(obj, clearance=0.045):
    """Ease roots that punched the skull, without slamming a hard shell.

    Measured on attempt 7: a binary lift of any vertex inside 0.86 × skull
    radius moved some verts 0.3–0.7 head units and stretched edges up to
    3.5× (lock_s_part_l, lock_s_bang_under). That ridge is a saw-tooth
    hairline, not a seated root.

    This version:
      - weights the lift by how deep the vert is *and* whether it is on
        the scalp (roots) rather than hanging hair
      - never moves a vert more than MAX_LIFT
      - spreads the displacement to neighbours so the move falls off
    Inner sides of a lock may stay inside the volume. That is intended.
    """
    mesh = obj.data
    n = len(mesh.vertices)
    delta = [Vector((0.0, 0.0, 0.0)) for _ in range(n)]
    max_lift = 0.07

    for i, vertex in enumerate(mesh.vertices):
        p = vertex.co
        q = (p.x, p.z, -p.y)
        radius = math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2)
        if radius < 1e-6:
            continue
        direction = (q[0] / radius, q[1] / radius, q[2] / radius)
        surface = head_surface(direction)
        reach = math.sqrt(surface[0] ** 2 + surface[1] ** 2 + surface[2] ** 2)
        inside = _smoothstep((reach - radius) / (reach * 0.34))
        root = _smoothstep((q[1] + 0.15) / 0.90)
        weight = inside * root
        if weight < 1e-4:
            continue
        target = radius + (reach + clearance * 0.35 - radius) * (0.40 * weight)
        lift = target - radius
        if lift <= 0.0:
            continue
        if lift > max_lift:
            lift = max_lift
        delta[i] = p.normalized() * lift

    adj = [[] for _ in range(n)]
    for edge in mesh.edges:
        a, b = edge.vertices
        adj[a].append(b)
        adj[b].append(a)

    for _ in range(2):
        spread = [Vector(item) for item in delta]
        for i in range(n):
            if not adj[i]:
                continue
            acc = Vector(delta[i])
            for j in adj[i]:
                acc += delta[j]
            spread[i] = acc / (1 + len(adj[i]))
        for i in range(n):
            delta[i] = delta[i] * 0.35 + spread[i] * 0.65

    for i, vertex in enumerate(mesh.vertices):
        vertex.co += delta[i]
    mesh.update()
    return obj


def lock(name, path, widths, flatten, tilt, clearance=0.04, resolution=18):
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
    seat_inside(obj, clearance=clearance)
    lib.relax(obj, 0.16, 1)
    lib.shaded_smooth(obj)
    return obj


# ---------------------------------------------------------------------------
# Base volume. Must already read as long hair from the back, without a hood.
# Hanging paths sit outside the skull. Face stays open (forehead / eyes).
# ---------------------------------------------------------------------------

BASE = [
    # Crown, left of the part — continues down the left side so the scalp is
    # not a separate cap sitting on the hanging hair.
    (
        "scalp_l",
        [
            PART,
            (0.02, 0.97, -0.04),
            (-0.36, 0.90, -0.18),
            (-0.60, 0.64, -0.12),
            (-0.70, 0.32, 0.04),
            (-0.74, -0.02, 0.10),
        ],
        [0.36, 0.58, 0.62, 0.52, 0.38, 0.18],
        0.90,
        [0.50, 0.62, 0.55, 0.35, 0.18, 0.08],
    ),
    (
        "scalp_r",
        [
            PART,
            (0.54, 0.93, -0.02),
            (0.72, 0.72, -0.16),
            (0.80, 0.44, -0.12),
            (0.82, 0.12, 0.04),
        ],
        [0.30, 0.50, 0.48, 0.36, 0.16],
        0.90,
        [0.48, 0.60, 0.42, 0.22, 0.08],
    ),
    # Occiput coverage so the back of the skull is not a bare cap.
    (
        "back_vol_occiput",
        [
            (-0.18, 0.90, -0.32),
            (0.08, 0.92, -0.55),
            (0.12, 0.58, -0.82),
            (0.06, 0.18, -0.92),
            (0.04, -0.35, -0.88),
            (0.04, -0.95, -0.74),
            (0.02, -1.55, -0.56),
        ],
        [0.58, 0.84, 0.98, 1.02, 0.94, 0.74, 0.46],
        0.88,
        [0.08, 0.04, 0.02, 0.04, 0.06, 0.06, 0.04],
    ),
    # Occiput → nape → below the shoulders, outside the skull, joined to
    # the occiput lock so the back is one mass, not a ball plus strands.
    (
        "back_vol_c",
        [
            (0.06, 0.82, -0.72),
            (0.04, 0.38, -1.02),
            (0.02, -0.28, -1.04),
            (0.00, -0.98, -0.90),
            (0.04, -1.72, -0.68),
            (0.00, -2.42, -0.48),
            (0.06, -2.98, -0.30),
            (0.00, -3.32, -0.16),
        ],
        [0.78, 1.10, 1.22, 1.20, 1.08, 0.88, 0.58, 0.28],
        0.88,
        [0.06, 0.02, 0.00, 0.04, 0.06, 0.06, 0.04, 0.02],
    ),
    # Left back-side: starts ON the left crown, wraps behind the ear, hangs
    # with an S-wave so side and back are one flow.
    (
        "back_vol_l",
        [
            (-0.18, 0.90, -0.22),
            (-0.48, 0.58, -0.70),
            (-0.72, 0.12, -0.88),
            (-0.82, -0.55, -0.70),
            (-0.98, -1.35, -0.42),
            (-0.86, -2.12, -0.24),
            (-1.12, -2.82, -0.14),
            (-0.98, -3.32, -0.06),
        ],
        [0.52, 0.92, 1.12, 1.16, 1.00, 0.76, 0.44, 0.14],
        0.88,
        [0.22, 0.14, 0.08, 0.04, 0.06, 0.08, 0.04, 0.02],
    ),
    (
        "back_vol_r",
        [
            (0.38, 0.88, -0.20),
            (0.62, 0.56, -0.68),
            (0.82, 0.10, -0.86),
            (0.92, -0.58, -0.68),
            (1.04, -1.38, -0.40),
            (0.90, -2.14, -0.22),
            (1.14, -2.84, -0.12),
            (1.00, -3.32, -0.04),
        ],
        [0.48, 0.86, 1.06, 1.10, 0.94, 0.72, 0.42, 0.14],
        0.88,
        [0.20, 0.12, 0.08, 0.04, 0.06, 0.08, 0.04, 0.02],
    ),
    # Forward side fill — starts on the crown so the front camera sees one
    # wrapping mass, not a cap plus two curtains. Close to the face.
    (
        "back_vol_side_l",
        [
            (-0.28, 0.90, 0.04),
            (-0.52, 0.58, 0.22),
            (-0.68, 0.18, 0.34),
            (-0.74, -0.32, 0.22),
            (-0.86, -1.05, 0.16),
            (-0.98, -1.78, 0.28),
            (-0.88, -2.48, 0.12),
            (-1.04, -3.08, 0.14),
            (-0.94, -3.36, 0.02),
        ],
        [0.52, 0.86, 1.02, 1.04, 0.94, 0.80, 0.58, 0.32, 0.14],
        0.90,
        [0.12, 0.08, 0.05, 0.04, 0.06, 0.08, 0.04, 0.04, 0.02],
    ),
    (
        "back_vol_side_r",
        [
            (0.44, 0.88, 0.02),
            (0.64, 0.56, 0.18),
            (0.78, 0.16, 0.30),
            (0.84, -0.34, 0.18),
            (0.94, -1.08, 0.14),
            (1.04, -1.80, 0.26),
            (0.92, -2.50, 0.10),
            (1.08, -3.10, 0.12),
            (0.96, -3.36, 0.02),
        ],
        [0.46, 0.78, 0.94, 0.96, 0.86, 0.74, 0.54, 0.30, 0.14],
        0.90,
        [0.10, 0.06, 0.05, 0.04, 0.06, 0.08, 0.04, 0.04, 0.02],
    ),
    # Closest to the face — ear can peek; does not cover eyes.
    (
        "back_vol_cheek_l",
        [
            (-0.62, 0.42, 0.28),
            (-0.74, 0.02, 0.38),
            (-0.78, -0.48, 0.22),
            (-0.88, -1.18, 0.20),
            (-1.02, -1.90, 0.32),
            (-0.90, -2.58, 0.10),
            (-1.06, -3.18, 0.08),
        ],
        [0.34, 0.58, 0.70, 0.64, 0.50, 0.32, 0.12],
        0.92,
        [0.10, 0.06, 0.04, 0.06, 0.08, 0.04, 0.02],
    ),
    (
        "back_vol_cheek_r",
        [
            (0.72, 0.40, 0.22),
            (0.82, 0.00, 0.34),
            (0.86, -0.50, 0.18),
            (0.96, -1.20, 0.16),
            (1.08, -1.92, 0.28),
            (0.94, -2.60, 0.08),
            (1.10, -3.18, 0.06),
        ],
        [0.30, 0.54, 0.66, 0.60, 0.46, 0.30, 0.12],
        0.92,
        [0.08, 0.06, 0.04, 0.06, 0.08, 0.04, 0.02],
    ),
    (
        "back_vol_nape_l",
        [
            (-0.24, 0.70, -0.14),
            (-0.58, 0.28, -0.38),
            (-0.78, -0.35, -0.28),
            (-0.90, -1.15, -0.14),
            (-1.00, -1.95, -0.04),
            (-0.88, -2.68, 0.02),
            (-1.06, -3.22, -0.04),
        ],
        [0.42, 0.76, 0.92, 0.86, 0.66, 0.40, 0.14],
        0.86,
        [0.16, 0.10, 0.06, 0.04, 0.06, 0.04, 0.02],
    ),
    (
        "back_vol_nape_r",
        [
            (0.44, 0.68, -0.12),
            (0.72, 0.26, -0.36),
            (0.90, -0.38, -0.26),
            (1.00, -1.18, -0.12),
            (1.08, -1.98, -0.02),
            (0.94, -2.70, 0.04),
            (1.10, -3.22, -0.02),
        ],
        [0.38, 0.72, 0.86, 0.80, 0.62, 0.38, 0.14],
        0.86,
        [0.14, 0.08, 0.06, 0.04, 0.06, 0.04, 0.02],
    ),
]


# ---------------------------------------------------------------------------
# Primary flows. Same silhouette as the base; they carry the style.
# Bang stays above the eyes, then turns to the side — not a visor.
# ---------------------------------------------------------------------------

PRIMARY = [
    # Wide diagonal bang: part → left forehead → temple.
    #
    # Measured on the exported mesh (attempt 7): tilt +1.15 at the forehead
    # stood the section into the skull, so the front camera saw a hairline
    # curve and the width hung off the left cheek. flatten 0.94 made a
    # sausage whose inner half was inside the head. Negative tilt lays the
    # *width* down the forehead (sheet) and the *thickness* toward the
    # camera (convex). Centreline z is head_surface + clearance, not a
    # guess; seat_inside is not asked to pull the outer face out.
    (
        "lock_p_bang",
        [
            PART,
            bang_pt(0.16, 0.82, 0.06, 0.50),
            bang_pt(0.02, 0.70, 0.12, 0.74),
            bang_pt(-0.12, 0.58, 0.13, 0.82),
            bang_pt(-0.26, 0.50, 0.13, 0.82),
            bang_pt(-0.40, 0.40, 0.11, 0.68),
            bang_pt(-0.52, 0.28, 0.09, 0.48),
            (-0.68, -0.40, 0.22),
            (-0.82, -1.12, 0.18),
            (-0.90, -1.82, 0.10),
            (-0.86, -2.70, 0.06),
        ],
        [0.22, 0.44, 0.56, 0.60, 0.54, 0.42, 0.36, 0.36, 0.26, 0.16, 0.10],
        0.32,
        [0.16, -0.48, -0.82, -0.86, -0.80, -0.50, -0.10, 0.06, 0.04, 0.03, 0.02],
    ),
    # Left-crown wrap sitting *behind* the bang, not a second forehead edge.
    (
        "lock_p_over_l",
        [
            (0.04, 0.94, -0.08),
            (-0.26, 0.80, 0.16),
            (-0.50, 0.52, 0.28),
            (-0.66, 0.18, 0.24),
            (-0.80, -0.40, 0.16),
            (-0.92, -1.12, 0.14),
            (-1.04, -1.80, 0.24),
            (-0.92, -2.44, 0.08),
            (-1.08, -3.02, 0.12),
            (-0.98, -3.32, 0.02),
        ],
        [0.50, 0.80, 0.90, 0.80, 0.68, 0.62, 0.54, 0.40, 0.24, 0.12],
        0.90,
        [0.16, 0.12, 0.08, 0.06, 0.06, 0.06, 0.08, 0.04, 0.04, 0.02],
    ),
    (
        "lock_p_left",
        [
            (-0.18, 0.88, 0.04),
            (-0.46, 0.52, 0.24),
            (-0.66, 0.10, 0.30),
            (-0.76, -0.48, 0.16),
            (-0.90, -1.22, 0.20),
            (-0.80, -1.92, 0.08),
            (-1.04, -2.60, 0.18),
            (-0.92, -3.12, 0.06),
            (-1.04, -3.38, -0.02),
        ],
        [0.50, 0.86, 1.02, 1.04, 0.92, 0.74, 0.52, 0.30, 0.12],
        0.88,
        [0.12, 0.08, 0.05, 0.04, 0.06, 0.04, 0.08, 0.04, 0.02],
    ),
    (
        "lock_p_right",
        [
            (0.50, 0.86, 0.06),
            (0.66, 0.56, 0.24),
            (0.78, 0.14, 0.30),
            (0.88, -0.42, 0.16),
            (0.98, -1.12, 0.16),
            (0.88, -1.82, 0.26),
            (1.06, -2.48, 0.10),
            (0.94, -3.08, 0.12),
            (1.04, -3.36, -0.02),
        ],
        [0.44, 0.78, 0.94, 0.96, 0.86, 0.70, 0.50, 0.28, 0.12],
        0.88,
        [0.10, 0.06, 0.05, 0.04, 0.06, 0.08, 0.05, 0.04, 0.02],
    ),
    # Side-to-back wrap, left: crown → behind the ear → nape → hang.
    (
        "lock_p_wrap_l",
        [
            (-0.14, 0.84, -0.08),
            (-0.48, 0.50, -0.38),
            (-0.66, 0.12, -0.62),
            (-0.60, -0.40, -0.42),
            (-0.76, -1.10, -0.16),
            (-0.90, -1.80, 0.10),
            (-0.82, -2.50, 0.04),
            (-0.96, -3.10, 0.06),
        ],
        [0.44, 0.78, 0.92, 0.86, 0.74, 0.56, 0.34, 0.14],
        0.86,
        [0.18, 0.12, 0.08, 0.06, 0.06, 0.08, 0.04, 0.02],
    ),
    (
        "lock_p_wrap_r",
        [
            (0.36, 0.82, -0.06),
            (0.62, 0.48, -0.36),
            (0.78, 0.10, -0.60),
            (0.70, -0.42, -0.40),
            (0.84, -1.12, -0.14),
            (0.96, -1.82, 0.08),
            (0.86, -2.52, 0.04),
            (1.00, -3.10, 0.06),
        ],
        [0.40, 0.72, 0.86, 0.80, 0.70, 0.52, 0.32, 0.14],
        0.86,
        [0.16, 0.10, 0.08, 0.06, 0.06, 0.08, 0.04, 0.02],
    ),
    # Temple join, left: bang / left wave / back volume meet here.
    (
        "lock_p_temple_l",
        [
            (-0.08, 0.82, -0.04),
            (-0.40, 0.48, 0.06),
            (-0.64, 0.04, 0.10),
            (-0.80, -0.62, 0.08),
            (-0.92, -1.38, 0.10),
            (-0.84, -2.12, 0.02),
            (-1.00, -2.80, 0.06),
            (-0.90, -3.22, -0.02),
        ],
        [0.40, 0.70, 0.84, 0.80, 0.68, 0.50, 0.30, 0.12],
        0.84,
        [0.14, 0.08, 0.06, 0.05, 0.04, 0.06, 0.04, 0.02],
    ),
    (
        "lock_p_temple_r",
        [
            (0.44, 0.80, -0.02),
            (0.70, 0.46, 0.06),
            (0.86, 0.00, 0.08),
            (0.96, -0.64, 0.06),
            (1.04, -1.40, 0.08),
            (0.92, -2.14, 0.00),
            (1.08, -2.82, 0.04),
            (0.96, -3.22, -0.02),
        ],
        [0.36, 0.66, 0.80, 0.76, 0.64, 0.46, 0.28, 0.12],
        0.84,
        [0.12, 0.08, 0.06, 0.05, 0.04, 0.06, 0.04, 0.02],
    ),
]


# ---------------------------------------------------------------------------
# Secondary locks. Same outline; different roots, lengths, and tip landings.
# ---------------------------------------------------------------------------

SECONDARY = [
    (
        "lock_s_part_l",
        [
            (0.16, 0.90, 0.04),
            (-0.06, 0.74, 0.10),
            (-0.32, 0.42, 0.10),
            (-0.52, -0.10, 0.06),
            (-0.68, -0.80, 0.06),
            (-0.76, -1.50, 0.08),
            (-0.70, -2.12, 0.02),
            (-0.82, -2.62, -0.02),
        ],
        [0.22, 0.40, 0.48, 0.44, 0.36, 0.26, 0.16, 0.08],
        0.84,
        [0.12, 0.08, 0.06, 0.05, 0.04, 0.05, 0.04, 0.02],
    ),
    (
        "lock_s_part_r",
        [
            (0.38, 0.86, 0.10),
            (0.54, 0.66, 0.22),
            (0.68, 0.32, 0.20),
            (0.80, -0.18, 0.12),
            (0.86, -0.88, 0.10),
            (0.90, -1.50, 0.12),
            (0.82, -2.08, 0.04),
            (0.92, -2.55, -0.02),
        ],
        [0.18, 0.34, 0.42, 0.40, 0.32, 0.22, 0.14, 0.08],
        0.82,
        [0.10, 0.08, 0.05, 0.04, 0.05, 0.04, 0.04, 0.02],
    ),
    # Behind the bang, on the skull, so it adds body without a second edge.
    (
        "lock_s_bang_under",
        [
            (0.18, 0.86, -0.02),
            (-0.06, 0.68, 0.12),
            (-0.34, 0.38, 0.14),
            (-0.58, -0.10, 0.10),
            (-0.74, -0.84, 0.08),
            (-0.82, -1.58, 0.10),
            (-0.76, -2.22, 0.04),
            (-0.88, -2.78, -0.02),
        ],
        [0.24, 0.44, 0.52, 0.48, 0.40, 0.30, 0.18, 0.08],
        0.86,
        [0.14, 0.10, 0.08, 0.05, 0.04, 0.05, 0.04, 0.02],
    ),
    # Starts lower on the left — not from the crown.
    (
        "lock_s_left_low",
        [
            (-0.60, 0.16, 0.14),
            (-0.82, -0.42, 0.22),
            (-0.96, -1.15, 0.16),
            (-1.10, -1.88, 0.26),
            (-0.98, -2.52, 0.10),
            (-1.14, -3.12, 0.04),
            (-1.04, -3.38, -0.04),
        ],
        [0.26, 0.46, 0.50, 0.44, 0.32, 0.16, 0.06],
        0.80,
        [0.10, 0.06, 0.08, 0.10, 0.04, 0.04, 0.02],
    ),
    (
        "lock_s_right_low",
        [
            (0.74, 0.12, 0.10),
            (0.94, -0.46, 0.18),
            (1.06, -1.18, 0.14),
            (1.16, -1.90, 0.24),
            (1.02, -2.55, 0.08),
            (1.16, -3.12, 0.02),
            (1.04, -3.38, -0.04),
        ],
        [0.24, 0.42, 0.48, 0.42, 0.30, 0.16, 0.06],
        0.80,
        [0.08, 0.06, 0.08, 0.10, 0.04, 0.04, 0.02],
    ),
    (
        "lock_s_nape_l",
        [
            (-0.20, 0.52, -0.36),
            (-0.48, 0.02, -0.42),
            (-0.66, -0.62, -0.32),
            (-0.78, -1.40, -0.20),
            (-0.84, -2.18, -0.12),
            (-0.74, -2.82, -0.06),
            (-0.86, -3.22, -0.08),
        ],
        [0.28, 0.48, 0.54, 0.46, 0.34, 0.18, 0.07],
        0.86,
        [0.08, 0.04, 0.06, 0.04, 0.04, 0.04, 0.02],
    ),
    (
        "lock_s_nape_r",
        [
            (0.38, 0.50, -0.34),
            (0.64, 0.00, -0.40),
            (0.82, -0.64, -0.30),
            (0.92, -1.42, -0.18),
            (0.96, -2.20, -0.10),
            (0.86, -2.82, -0.04),
            (0.96, -3.22, -0.06),
        ],
        [0.26, 0.46, 0.50, 0.44, 0.32, 0.16, 0.07],
        0.86,
        [0.08, 0.04, 0.06, 0.04, 0.04, 0.04, 0.02],
    ),
    # A shorter right-brow lock so the short side of the part has a tip of
    # its own, not a copy of the main right wave.
    (
        "lock_s_brow_r",
        [
            (0.46, 0.78, 0.14),
            (0.62, 0.54, 0.28),
            (0.74, 0.16, 0.24),
            (0.82, -0.38, 0.12),
            (0.88, -1.00, 0.10),
            (0.82, -1.58, 0.06),
            (0.90, -2.08, 0.02),
        ],
        [0.18, 0.30, 0.36, 0.32, 0.24, 0.14, 0.08],
        0.80,
        [0.10, 0.06, 0.05, 0.04, 0.05, 0.04, 0.02],
    ),
    # Extra inner wave on the left, shorter, different landing.
    (
        "lock_s_wave_l",
        [
            (-0.40, 0.48, 0.08),
            (-0.66, -0.08, 0.16),
            (-0.80, -0.78, 0.10),
            (-0.92, -1.50, 0.18),
            (-0.82, -2.15, 0.04),
            (-0.98, -2.75, 0.08),
            (-0.88, -3.15, -0.02),
        ],
        [0.22, 0.40, 0.46, 0.40, 0.28, 0.16, 0.06],
        0.82,
        [0.10, 0.06, 0.04, 0.08, 0.04, 0.04, 0.02],
    ),
    (
        "lock_s_wave_r",
        [
            (0.58, 0.44, 0.06),
            (0.80, -0.12, 0.14),
            (0.92, -0.82, 0.08),
            (1.02, -1.52, 0.16),
            (0.90, -2.18, 0.02),
            (1.06, -2.78, 0.06),
            (0.96, -3.16, -0.02),
        ],
        [0.20, 0.36, 0.42, 0.36, 0.26, 0.14, 0.06],
        0.82,
        [0.08, 0.06, 0.04, 0.08, 0.04, 0.04, 0.02],
    ),
]


def build_hair():
    """Return the hair as separate objects, grouped by layer in the name."""
    pieces = []
    for name, path, widths, flatten, tilt in BASE:
        pieces.append(lock(name, path, widths, flatten, tilt, clearance=0.035))
    for name, path, widths, flatten, tilt in PRIMARY:
        pieces.append(lock(name, path, widths, flatten, tilt, clearance=0.05))
    for name, path, widths, flatten, tilt in SECONDARY:
        pieces.append(lock(name, path, widths, flatten, tilt, clearance=0.055))
    return pieces
