import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
}

const { MISSIONS_PER_DAY, claimMission, claimable, missionsForDay, report, todayMissions } =
  await import('./missions.ts')
const { coins } = await import('./meta.ts')

const at = (iso: string): Date => new Date(`${iso}T12:00:00`)

beforeEach(() => store.clear())

test('the day decides the missions, so every device gets the same three', () => {
  // No storage and no sync: the set is a pure function of the date, which is
  // what lets two friends compare what they were asked for today.
  const first = missionsForDay('2026-09-17')
  assert.deepEqual(first, missionsForDay('2026-09-17'))
  assert.equal(first.length, MISSIONS_PER_DAY)
})

test('no two missions in a day share a kind', () => {
  // Three score missions on one day read as one mission worth three rewards,
  // which is exactly the sameness these exist to break up.
  for (let day = 1; day <= 366; day++) {
    const date = new Date(2026, 0, day)
    const picked = missionsForDay(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    )
    assert.equal(picked.length, MISSIONS_PER_DAY, 'every day gets a full set')
    assert.equal(new Set(picked.map((m) => m.kind)).size, MISSIONS_PER_DAY)
  }
})

test('the set actually varies from day to day', () => {
  const seen = new Set<string>()
  for (let day = 1; day <= 60; day++) {
    seen.add(
      missionsForDay(`2026-01-${String(day).padStart(2, '0')}`)
        .map((m) => m.id)
        .join(),
    )
  }
  assert.ok(seen.size > 8, `only ${seen.size} distinct sets in two months`)
})

test('counting missions add up and best-run missions take the highest', () => {
  const day = at('2026-09-17')
  report('gems', 30, day)
  report('gems', 40, day)
  report('score', 5000, day)
  report('score', 3000, day)

  const progress = new Map(
    // Read back by kind, because which missions are running today is the
    // thing this test must not depend on.
    Object.entries({ gems: 70, score: 5000 }),
  )
  for (const [kind, expected] of progress) {
    const mission = todayMissions(day).find((entry) => entry.kind === kind)
    if (!mission) continue
    assert.equal(mission.progress, Math.min(expected, mission.need), `${kind} progress`)
  }
  // A grind of one at a time must not complete a "land a ×5 chain" mission.
  report('chain', 1, day)
  report('chain', 1, day)
  const chain = todayMissions(day).find((entry) => entry.kind === 'chain')
  if (chain) assert.equal(chain.progress, 1)
})

test('a reward is paid once, and only when the mission is finished', () => {
  const day = at('2026-09-17')
  const mission = todayMissions(day)[0]
  assert.ok(mission)

  assert.equal(claimMission(mission.id, day), 0, 'unfinished pays nothing')
  assert.equal(coins(), 0)

  report(mission.kind, mission.need, day)
  assert.equal(claimable(day), 1)
  assert.equal(claimMission(mission.id, day), mission.reward)
  assert.equal(coins(), mission.reward)

  assert.equal(claimMission(mission.id, day), 0, 'a second claim pays nothing')
  assert.equal(coins(), mission.reward)
  assert.equal(claimable(day), 0)
})

test('yesterday’s progress does not carry into today', () => {
  const yesterday = at('2026-09-17')
  const today = at('2026-09-18')
  const mission = todayMissions(yesterday)[0]
  assert.ok(mission)
  report(mission.kind, mission.need, yesterday)

  for (const entry of todayMissions(today)) {
    assert.equal(entry.progress, 0, `${entry.kind} started fresh`)
    assert.equal(entry.claimed, false)
  }
})

test('a hand-edited progress file cannot produce a finished mission', () => {
  const day = at('2026-09-17')
  store.set('chroma-match:missions', 'not json')
  assert.equal(todayMissions(day).every((m) => m.progress === 0), true)

  store.set('chroma-match:missions', JSON.stringify({ day: '2026-09-17', progress: { gems: -5 }, claimed: 7 }))
  for (const entry of todayMissions(day)) assert.ok(entry.progress >= 0)
})
