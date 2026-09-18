"""
Hair as overlapping flowing locks — attempt 7.

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


def seat_inside(obj, clearance=0.045):
    """Lift vertices that punched *deep* into the skull.

    A lock is supposed to bury its inner side in the scalp volume. Pushing
    every inside vertex out to the surface flattens a thick lock into a
    visor or a cap. Only the scalp region is considered, and only vertices
    well inside the skull — hanging hair and the inner half of a lock are
    left alone.
    """
    for vertex in obj.data.vertices:
        p = vertex.co
        q = (p.x, p.z, -p.y)
        if q[1] < 0.12:
            continue
        radius = math.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2)
        if radius < 1e-6:
            continue
        d = (q[0] / radius, q[1] / radius, q[2] / radius)
        surface = head_surface(d)
        reach = math.sqrt(surface[0] ** 2 + surface[1] ** 2 + surface[2] ** 2)
        if radius >= reach * 0.86:
            continue
        scale = (reach + clearance) / radius
        vertex.co = Vector((p.x * scale, p.y * scale, p.z * scale))
    obj.data.update()
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
            (-0.28, 0.82, -0.42),
            (0.10, 0.88, -0.72),
            (0.22, 0.48, -1.10),
            (0.10, 0.02, -1.16),
            (0.04, -0.50, -1.02),
            (0.06, -1.10, -0.82),
            (0.02, -1.70, -0.58),
        ],
        [0.70, 1.05, 1.22, 1.18, 1.02, 0.78, 0.48],
        0.92,
        [0.08, 0.04, 0.00, 0.04, 0.06, 0.08, 0.06],
    ),
    # The missing mass: occiput → nape → below the shoulders, OUTSIDE the skull.
    # Stays wide at the bottom so the back does not split into two tails.
    (
        "back_vol_c",
        [
            (0.08, 0.68, -0.96),
            (0.04, 0.22, -1.20),
            (0.02, -0.38, -1.12),
            (0.00, -1.08, -0.92),
            (0.04, -1.80, -0.68),
            (0.00, -2.48, -0.48),
            (0.06, -3.02, -0.30),
            (0.00, -3.36, -0.16),
        ],
        [0.72, 1.05, 1.18, 1.16, 1.04, 0.86, 0.58, 0.26],
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
            (-0.32, 0.88, 0.08),
            (-0.58, 0.55, 0.32),
            (-0.70, 0.14, 0.40),
            (-0.76, -0.40, 0.24),
            (-0.92, -1.15, 0.20),
            (-1.12, -1.88, 0.38),
            (-0.94, -2.52, 0.12),
            (-1.16, -3.10, 0.18),
            (-1.02, -3.38, 0.02),
        ],
        [0.48, 0.78, 0.90, 0.92, 0.82, 0.70, 0.50, 0.28, 0.10],
        0.90,
        [0.16, 0.10, 0.06, 0.04, 0.08, 0.10, 0.04, 0.04, 0.02],
    ),
    (
        "back_vol_side_r",
        [
            (0.48, 0.86, 0.06),
            (0.70, 0.52, 0.26),
            (0.82, 0.10, 0.36),
            (0.88, -0.44, 0.20),
            (1.00, -1.18, 0.16),
            (1.18, -1.90, 0.34),
            (0.98, -2.54, 0.10),
            (1.18, -3.12, 0.16),
            (1.04, -3.38, 0.02),
        ],
        [0.42, 0.70, 0.84, 0.86, 0.76, 0.64, 0.46, 0.26, 0.10],
        0.90,
        [0.14, 0.08, 0.06, 0.04, 0.08, 0.10, 0.04, 0.04, 0.02],
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
    # Bang body: a round volume on the left forehead, not a visor strip.
    # Path goes down the left forehead, then turns to the side above the eyes.
    # Tilt lays it on the skull at the forehead, then near 0 as it hangs.
    (
        "lock_p_bang",
        [
            PART,
            (0.10, 0.84, 0.50),
            (-0.10, 0.72, 0.90),
            (-0.34, 0.56, 0.88),
            (-0.56, 0.36, 0.50),
            (-0.70, 0.06, 0.26),
            (-0.84, -0.52, 0.18),
            (-0.98, -1.22, 0.24),
            (-0.88, -1.88, 0.08),
            (-1.06, -2.50, 0.14),
            (-0.96, -3.05, 0.04),
        ],
        [0.32, 0.55, 0.62, 0.52, 0.42, 0.40, 0.44, 0.34, 0.20, 0.08],
        0.94,
        [0.08, 0.12, 0.10, 0.08, 0.06, 0.04, 0.06, 0.04, 0.02, 0.02],
    ),
    # Large wrapping mass over the left crown — the original's left-forehead
    # volume. Starts on the left scalp, not at the part.
    (
        "lock_p_over_l",
        [
            (0.06, 0.94, -0.06),
            (-0.22, 0.80, 0.40),
            (-0.48, 0.56, 0.62),
            (-0.66, 0.22, 0.32),
            (-0.82, -0.35, 0.18),
            (-0.96, -1.08, 0.16),
            (-1.14, -1.78, 0.30),
            (-0.96, -2.42, 0.08),
            (-1.18, -3.04, 0.14),
            (-1.04, -3.36, 0.00),
        ],
        [0.48, 0.78, 0.88, 0.76, 0.64, 0.60, 0.54, 0.38, 0.22, 0.08],
        0.90,
        [0.18, 0.22, 0.16, 0.10, 0.08, 0.06, 0.08, 0.04, 0.04, 0.02],
    ),
    # Main left wave. Starts on the left scalp, not at the part.
    (
        "lock_p_left",
        [
            (-0.20, 0.88, 0.08),
            (-0.50, 0.50, 0.30),
            (-0.70, 0.06, 0.36),
            (-0.82, -0.55, 0.18),
            (-1.02, -1.30, 0.26),
            (-0.86, -2.00, 0.06),
            (-1.20, -2.68, 0.24),
            (-1.00, -3.18, 0.06),
            (-1.14, -3.42, -0.04),
        ],
        [0.46, 0.80, 0.96, 0.98, 0.86, 0.68, 0.48, 0.26, 0.08],
        0.88,
        [0.14, 0.08, 0.05, 0.04, 0.08, 0.04, 0.10, 0.04, 0.02],
    ),
    # Main right wave. More forehead stays open on this side.
    (
        "lock_p_right",
        [
            (0.52, 0.86, 0.08),
            (0.70, 0.56, 0.30),
            (0.84, 0.12, 0.36),
            (0.94, -0.45, 0.18),
            (1.10, -1.15, 0.20),
            (0.92, -1.85, 0.34),
            (1.18, -2.50, 0.12),
            (1.02, -3.12, 0.16),
            (1.12, -3.40, -0.02),
        ],
        [0.40, 0.72, 0.88, 0.90, 0.80, 0.64, 0.46, 0.24, 0.08],
        0.88,
        [0.12, 0.08, 0.05, 0.04, 0.08, 0.10, 0.06, 0.04, 0.02],
    ),
    # Side-to-back wrap, left: crown → behind the ear → nape → hang.
    (
        "lock_p_wrap_l",
        [
            (-0.14, 0.82, -0.06),
            (-0.52, 0.48, -0.42),
            (-0.72, 0.10, -0.70),
            (-0.64, -0.42, -0.48),
            (-0.80, -1.12, -0.18),
            (-0.96, -1.82, 0.12),
            (-0.86, -2.52, 0.04),
            (-1.04, -3.12, 0.08),
        ],
        [0.40, 0.74, 0.88, 0.80, 0.70, 0.54, 0.32, 0.12],
        0.86,
        [0.24, 0.14, 0.08, 0.06, 0.06, 0.08, 0.04, 0.02],
    ),
    (
        "lock_p_wrap_r",
        [
            (0.36, 0.80, -0.04),
            (0.66, 0.46, -0.40),
            (0.84, 0.08, -0.68),
            (0.74, -0.44, -0.46),
            (0.90, -1.14, -0.16),
            (1.04, -1.84, 0.10),
            (0.92, -2.54, 0.04),
            (1.08, -3.12, 0.06),
        ],
        [0.36, 0.68, 0.82, 0.76, 0.66, 0.50, 0.30, 0.12],
        0.86,
        [0.22, 0.12, 0.08, 0.06, 0.06, 0.08, 0.04, 0.02],
    ),
    # Temple join, left: bang / left wave / back volume meet here.
    (
        "lock_p_temple_l",
        [
            (-0.08, 0.80, -0.04),
            (-0.44, 0.44, 0.08),
            (-0.70, -0.02, 0.12),
            (-0.88, -0.68, 0.08),
            (-1.02, -1.45, 0.12),
            (-0.90, -2.18, 0.00),
            (-1.12, -2.86, 0.08),
            (-0.98, -3.28, -0.04),
        ],
        [0.36, 0.66, 0.80, 0.76, 0.64, 0.46, 0.28, 0.10],
        0.84,
        [0.18, 0.10, 0.06, 0.05, 0.04, 0.06, 0.04, 0.02],
    ),
    (
        "lock_p_temple_r",
        [
            (0.46, 0.78, -0.02),
            (0.74, 0.42, 0.08),
            (0.92, -0.06, 0.10),
            (1.04, -0.70, 0.06),
            (1.12, -1.48, 0.10),
            (0.98, -2.20, 0.00),
            (1.16, -2.88, 0.06),
            (1.02, -3.28, -0.04),
        ],
        [0.34, 0.62, 0.76, 0.72, 0.60, 0.42, 0.26, 0.10],
        0.84,
        [0.16, 0.08, 0.06, 0.05, 0.04, 0.06, 0.04, 0.02],
    ),
]


# ---------------------------------------------------------------------------
# Secondary locks. Same outline; different roots, lengths, and tip landings.
# ---------------------------------------------------------------------------

SECONDARY = [
    (
        "lock_s_part_l",
        [
            (0.16, 0.90, 0.06),
            (-0.08, 0.74, 0.16),
            (-0.36, 0.40, 0.14),
            (-0.58, -0.12, 0.08),
            (-0.74, -0.82, 0.06),
            (-0.84, -1.55, 0.10),
            (-0.76, -2.18, 0.02),
            (-0.88, -2.72, -0.02),
        ],
        [0.20, 0.38, 0.46, 0.42, 0.34, 0.26, 0.14, 0.06],
        0.84,
        [0.18, 0.12, 0.08, 0.06, 0.04, 0.06, 0.04, 0.02],
    ),
    (
        "lock_s_part_r",
        [
            (0.38, 0.86, 0.14),
            (0.56, 0.66, 0.28),
            (0.72, 0.32, 0.26),
            (0.84, -0.18, 0.14),
            (0.92, -0.88, 0.12),
            (0.96, -1.55, 0.14),
            (0.88, -2.12, 0.04),
            (0.98, -2.65, -0.02),
        ],
        [0.16, 0.32, 0.40, 0.38, 0.30, 0.22, 0.12, 0.05],
        0.82,
        [0.14, 0.10, 0.06, 0.04, 0.06, 0.04, 0.04, 0.02],
    ),
    # Behind the bang, closer to the skull, so the bang has body without
    # becoming a visor in front of the eyes.
    (
        "lock_s_bang_under",
        [
            (0.20, 0.86, 0.00),
            (-0.08, 0.68, 0.20),
            (-0.38, 0.36, 0.22),
            (-0.64, -0.12, 0.14),
            (-0.80, -0.88, 0.10),
            (-0.90, -1.65, 0.12),
            (-0.84, -2.32, 0.04),
            (-0.96, -2.90, -0.04),
        ],
        [0.22, 0.42, 0.50, 0.46, 0.38, 0.30, 0.16, 0.06],
        0.86,
        [0.22, 0.14, 0.10, 0.06, 0.04, 0.06, 0.04, 0.02],
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
            (0.44, 0.80, 0.20),
            (0.62, 0.56, 0.36),
            (0.76, 0.18, 0.30),
            (0.86, -0.38, 0.16),
            (0.92, -1.05, 0.12),
            (0.86, -1.68, 0.08),
            (0.94, -2.20, 0.02),
        ],
        [0.16, 0.28, 0.34, 0.30, 0.22, 0.12, 0.05],
        0.78,
        [0.12, 0.08, 0.06, 0.04, 0.06, 0.04, 0.02],
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
