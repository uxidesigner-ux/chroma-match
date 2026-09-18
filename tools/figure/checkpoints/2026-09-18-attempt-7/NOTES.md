# Attempt 7 — overlapping flowing locks (surface cleanup)

Layered ribbons, no voxel fuse, no extra locks in the cleanup.

`seat_inside` was measured. The binary lift stretched some lock edges up
to 3.5×. The current function uses a depth×root weight, a 0.07 cap, and
neighbour falloff. Max edge stretch after that is ~1.00.

Showroom still treats the named meshes as one hair slot.
