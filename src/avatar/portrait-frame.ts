/** Crop the stable bust capture for small profile surfaces, not the 3D editor.
 * Keep this at display time so existing cached portraits get the same framing
 * without changing character codes or forcing another model download.
 */
export function portraitFrame(edge: number) {
  const size = edge / 1.65
  return { x: (edge - size) / 2, y: edge * 0.43 - size / 2, size }
}
