import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Object3D, Vector3 } from 'three'
import { VRMHumanoid } from '@pixiv/three-vrm'
import type { VRMHumanBones } from '@pixiv/three-vrm'
import { armPose, GESTURE_SECONDS, gestureWeight } from './gesture-pose.ts'
import { readGlb } from '../studio-export.ts'

test('every elbow is a bounded mirrored forward hinge throughout every gesture', () => {
  for (const gesture of [null, 'wave', 'cheer', 'pose'] as const) {
    for (let seconds = 0; seconds <= 3; seconds += .025) for (const side of ['left', 'right'] as const) {
      const pose = armPose(side, gesture, seconds)
      assert.ok(pose.flex >= .12 && pose.flex <= 1.62)
      assert.equal(pose.lower.x, 0, 'no forearm twisting in place')
      assert.equal(pose.lower.z, 0, 'no sideways elbow bend')
      const extension = new Vector3(side === 'left' ? 1 : -1, 0, 0).applyQuaternion(pose.lower)
      assert.ok(extension.z > 0, 'elbow extends backward instead of flexing forward')
      for (const q of [pose.upper, pose.lower, pose.wrist]) assert.ok(Math.abs(q.length() - 1) < 1e-7)
    }
  }
})

test('cheer arms mirror one another; inactive arms return to precisely the same rest', () => {
  for (const seconds of [0, .15, .5, 1, 2.4, 2.8, 3]) {
    const left = armPose('left', 'cheer', seconds), right = armPose('right', 'cheer', seconds)
    for (const part of ['upper', 'lower'] as const) {
      assert.ok(Math.abs(left[part].x - right[part].x) < 1e-7)
      assert.ok(Math.abs(left[part].y + right[part].y) < 1e-7)
      assert.ok(Math.abs(left[part].z + right[part].z) < 1e-7)
    }
  }
  for (const gesture of ['wave', 'cheer', 'pose'] as const) for (const side of ['left', 'right'] as const)
    assert.deepEqual(armPose(side, gesture, GESTURE_SECONDS), armPose(side, null, 0))
})

test('wave oscillates the wrist while keeping elbow flexion stable', () => {
  const a = armPose('right', 'wave', .75), b = armPose('right', 'wave', 1.1)
  assert.deepEqual(a.lower, b.lower)
  assert.notDeepEqual(a.wrist, b.wrist)
  assert.equal(gestureWeight(0), 0)
  assert.equal(gestureWeight(GESTURE_SECONDS), 0)
  assert.ok(gestureWeight(.001) < .0001, 'smooth arrival, no abrupt snap')
})

test('the actual Seed rig raises a greeting hand and flexes the pose forward', () => {
  // Load the real node/rest transforms without textures/WebGL. SDK retargeting
  // must agree with canonical hinge math, not just a synthetic arm fixture.
  const file = readFileSync(new URL('../../../public/avatars/seed-v1/seed-san.vrm', import.meta.url))
  const { json } = readGlb(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
  const nodes = json.nodes.map(data => {
    const node = new Object3D()
    node.position.fromArray(data.translation ?? [0, 0, 0])
    node.quaternion.fromArray(data.rotation ?? [0, 0, 0, 1])
    node.scale.fromArray(data.scale ?? [1, 1, 1])
    return node
  })
  json.nodes.forEach((data, i) => data.children?.forEach(child => nodes[i]!.add(nodes[child]!)))
  const scene = new Object3D()
  nodes.filter(node => !node.parent).forEach(node => scene.add(node))
  scene.updateMatrixWorld(true)
  const rig = new VRMHumanoid(Object.fromEntries(Object.entries(json.extensions.VRMC_vrm.humanoid.humanBones)
    .map(([name, data]) => [name, { node: nodes[data!.node] }])) as VRMHumanBones)
  for (const [side, gesture] of [['right', 'wave'], ['left', 'pose'], ['right', 'cheer'], ['left', 'cheer']] as const) {
    rig.resetNormalizedPose()
    const arm = armPose(side, gesture, .75)
    rig.getNormalizedBoneNode(`${side}UpperArm`)!.quaternion.copy(arm.upper)
    rig.getNormalizedBoneNode(`${side}LowerArm`)!.quaternion.copy(arm.lower)
    rig.update()
    const elbow = rig.getRawBoneNode(`${side}LowerArm`)!.getWorldPosition(new Vector3())
    const hand = rig.getRawBoneNode(`${side}Hand`)!.getWorldPosition(new Vector3())
    if (gesture === 'pose') assert.ok(hand.z > elbow.z + .12, 'presentation hand is not in front of elbow')
    else assert.ok(hand.y > elbow.y + .12, 'greeting/cheering hand fails to rise naturally')
  }
})
