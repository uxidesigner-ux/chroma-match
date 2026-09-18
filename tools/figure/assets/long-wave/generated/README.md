# generated/ — not the editable original

| file | kind |
|---|---|
| `blockout.blend` | Frozen **generation**: tube-clump. Input to `seed_hair_original.py` only. |
| `sculpt_attempt.blend` | Frozen **unadopted** attempt: measured clumps, visor bang. Do not ship. |
| `preview-sculpt-attempt/` | Stills of that unadopted attempt. |
| `sculpt-ops.md` | bpy operator notes from 2026-09-18 (context / SIGSEGV). |

`hair_long_wave.py` and `sculpt_long_wave.py` write **only this folder**.

`export_hair.py` does not copy `blockout.blend` into the original slot.
If `../hair_long_wave.blend` is missing, export fails. Creating it from this
freeze is `python3.11 tools/figure/seed_hair_original.py`.
