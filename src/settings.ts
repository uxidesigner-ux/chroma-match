/**
 * The preferences that outlive a session.
 *
 * Sound was not one of them: the toggle flipped a field on the Sfx object and
 * nothing wrote it down, so a player who muted the game got it back at full
 * volume on the next load — every load. The skin has been remembered since it
 * was built, which is why it is not here; it keeps its own key next to the
 * skins themselves.
 *
 * Reads are defensive because the whole of storage is: a browser in private
 * mode throws on access rather than returning null, and a preference that
 * cannot be read is simply the default rather than a crash on boot.
 */

const SOUND_KEY = 'chroma-match:sound'
const HAPTICS_KEY = 'chroma-match:haptics'

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === '1'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* private mode, or a full quota; the setting holds for this session */
  }
}

export function soundOn(): boolean {
  return readFlag(SOUND_KEY, true)
}

export function setSoundOn(value: boolean): void {
  writeFlag(SOUND_KEY, value)
}

/**
 * Whether the device can vibrate at all.
 *
 * iOS Safari does not implement `navigator.vibrate`, so on an iPhone this is
 * not a setting that is turned off — it is a setting that does nothing. The
 * row says so instead of pretending, because a switch that visibly moves and
 * changes nothing is worse than a switch that explains itself.
 */
export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function hapticsOn(): boolean {
  return hapticsSupported() && readFlag(HAPTICS_KEY, true)
}

export function setHapticsOn(value: boolean): void {
  writeFlag(HAPTICS_KEY, value)
}
