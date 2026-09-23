/** Crop the stable bust capture for small profile surfaces, not the 3D editor.
 * Keep this at display time so existing cached portraits get the same framing
 * without changing character codes or forcing another model download.
 *
 * The capture is a bust: head, neck and the collar under it. A profile avatar
 * is 44 pixels across, and at that size a collar is a smear the face has to
 * share the circle with — so the crop sits on the head, not on the bust.
 *
 * It is sized against the widest head this character can have. Measured on the
 * 256px capture, the hair reaches y=16 on a max-size head over long hair and
 * the chin sits at y≈151 whatever the build; the crop runs 24 to 163, which
 * holds every ordinary head whole, takes less off the tallest hair than the
 * bust framing did, and leaves nothing below the chin but a little neck.
 */
export function portraitFrame(edge: number) {
  const size = edge / 1.85
  return { x: (edge - size) / 2, y: edge * 0.365 - size / 2, size }
}
