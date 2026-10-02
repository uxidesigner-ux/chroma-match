import { Euler, Quaternion } from 'three'

export type Gesture = 'wave' | 'cheer' | 'pose'
export const GESTURE_SECONDS = 2.8
const ease = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v) }

export function gestureWeight(seconds: number): number {
  return ease(seconds / .35) * ease((GESTURE_SECONDS - seconds) / .5)
}

/** VRM normalized T-pose: arms along ±X, face +Z. Mirrored Y elbow flexion,
 * never sideways Z or an X forearm twist. The shoulder's axial rotation chooses
 * the plane of the same hinge. Swing before axial rotation (ZYX).
 */
export function armPose(side: 'left' | 'right', gesture: Gesture | null, seconds: number, weightShift = 0) {
  const hand = side === 'left' ? 1 : -1
  const active = gesture === 'cheer' || (gesture === 'wave' && side === 'right') || (gesture === 'pose' && side === 'left')
  const blend = active ? gestureWeight(seconds) : 0
  const mix = (rest: number, target: number) => rest + (target - rest) * blend
  const drop = mix(1.12, gesture === 'cheer' ? -.6 : gesture === 'wave' ? .28 : .94)
  const axial = mix(0, gesture === 'pose' ? -.35 : -Math.PI / 2)
  const forward = mix(.06, gesture === 'pose' ? .28 : .08)
  const flex = mix(.12, gesture === 'wave' ? 1.62 : gesture === 'cheer' ? .72 : 1.32)
  return {
    upper: new Quaternion().setFromEuler(new Euler(axial, -hand * forward, -hand * drop + weightShift * .4, 'ZYX')),
    lower: new Quaternion().setFromEuler(new Euler(0, -hand * flex, 0)),
    // Wave with the wrist, not by reversing the elbow's hinge repeatedly.
    wrist: new Quaternion().setFromEuler(new Euler(0, 0, gesture === 'wave' && active ? blend * Math.sin(seconds * 9) * .18 : 0)),
    flex,
  }
}
