import test from 'node:test'
import assert from 'node:assert/strict'
import { campaignGeometry, campaignGeometryCount, connected, matchableCells, neighbours, openSquares, playableCells } from './campaign-geometry.ts'
import { campaignMoves, campaignProfile, campaignWork } from './campaign-profile.ts'
import { createBlankLevel, getLevel, validateLevel } from './levels.ts'
import { MAX_LEVEL } from './progression.ts'

test('the bounded geometry catalog contains unique connected silhouettes, including its wrap boundary', () => {
  const count = campaignGeometryCount(), masks = new Set<string>(), families = new Set<string>()
  assert.ok(count >= 500 && count <= 2000)
  let previous = ''
  for (let i = 0; i <= count; i++) {
    const geometry = campaignGeometry(33 + i), key = geometry.mask.join('/'), cells = playableCells(geometry)
    assert.notEqual(key, previous, 'catalog wrap must also change the actual mask')
    if (i < count) { assert.ok(!masks.has(key)); masks.add(key); families.add(geometry.family) }
    assert.ok(geometry.cols <= 8 && geometry.rows <= 9)
    assert.ok(cells.size >= 42 && connected(cells, geometry.cols, geometry.rows))
    assert.ok(openSquares(cells, geometry.cols, geometry.rows).length)
    previous = key
  }
  assert.equal(families.size, 12)
})

test('generated windows keep piece corridors, accessible obstacles, bounded pressure and four readable goals', () => {
  const starts = [33, 103, 1003, 12003, 1000003, MAX_LEVEL - 119]
  for (const start of starts) {
    let previous = ''
    for (let offset = 0; offset < 120; offset++) {
      const id = start + offset, level = getLevel(id), profile = campaignProfile(id), work = campaignWork(level)
      assert.deepEqual(validateLevel(level).errors, [], `invalid generated level ${id}`)
      const key = level.mask.join('/'), playable = playableCells(level), occupied = new Set(level.obstacles.flatMap(o => o.cells))
      const free = new Set([...playable].filter(cell => !occupied.has(cell))), venues = matchableCells(free, level.cols, level.rows)
      assert.notEqual(key, previous, `adjacent repeated mask at ${id}`); previous = key
      assert.ok(level.cols <= 8 && level.rows <= 9 && level.goals.length <= 4)
      assert.ok(free.size >= 20 && connected(free, level.cols, level.rows), `separated piece corridor at ${id}`)
      assert.ok(openSquares(free, level.cols, level.rows).length, `no free 3×3 at ${id}`)
      assert.ok(venues.size >= Math.ceil(free.size * .7), `too many unmatchable free cells at ${id}`)
      assert.ok(work.density <= .52)
      assert.equal(work.kinds, Math.min(profile.kinds, level.jelly.length ? 3 : 4), `placement lost a requested mechanic at ${id}`)
      for (const o of level.obstacles) {
        if (o.kind !== 'stone') assert.ok(o.cells.some(cell => neighbours(cell, level.cols, level.rows).some(n => venues.has(n))), `power-only ${o.kind} at ${id}`)
        if (o.kind === 'ice') assert.equal(o.hp, o.cells.length, 'ice hit layers must agree with its shrinking footprint')
      }
      assert.ok(level.jelly.every(cell => venues.has(cell)), `jelly seed cannot participate in a match at ${id}`)
      assert.equal(level.moves, campaignMoves(level, profile), 'moves use actual placed work')
      assert.ok(level.moves >= 24 && level.moves <= 54)
    }
  }
})

test('difficulty rhythm includes recovery and a bounded final challenge without consulting player history', () => {
  for (const start of [33, 103, 1003, 12003, 1000003]) {
    const profiles = Array.from({ length: 40 }, (_, i) => campaignProfile(start + i))
    assert.equal(profiles.filter(p => p.recovery).length, 8)
    assert.equal(profiles.filter(p => p.difficulty === 'hard').length, 8)
    assert.equal(profiles.filter(p => p.difficulty === 'super-hard').length, 3)
    assert.equal(profiles.filter(p => p.difficulty === 'extreme').length, 1)
    for (let i = 1; i < profiles.length; i++) assert.ok(profiles[i]!.growth >= profiles[i - 1]!.growth)
  }
  assert.equal(campaignProfile(MAX_LEVEL).growth, 1)
  assert.ok(campaignProfile(1003).growth > campaignProfile(103).growth)
  assert.ok(campaignProfile(12003).growth > campaignProfile(1003).growth)
})

test('actual structural workload grows across campaign bands while recovery stays lighter', () => {
  const summary = (start: number) => {
    const rows = Array.from({ length: 200 }, (_, i) => {
      const level = getLevel(start + i), profile = campaignProfile(level.id), work = campaignWork(level)
      return { ...work, recovery: profile.recovery, rank: profile.rank, pressure: work.effort / level.moves }
    })
    const mean = (items: typeof rows, key: 'hitWork' | 'density' | 'pressure') => items.reduce((sum, row) => sum + row[key], 0) / items.length
    const recovery = rows.filter(row => row.recovery), normal = rows.filter(row => !row.recovery && row.rank === 0), challenge = rows.filter(row => row.rank >= 2)
    assert.ok(mean(recovery, 'pressure') < mean(normal, 'pressure'), `recovery band must provide relief at ${start}`)
    assert.ok(mean(challenge, 'pressure') > mean(normal, 'pressure'), `challenge band must add actual work at ${start}`)
    return { hits: mean(rows, 'hitWork'), density: mean(rows, 'density'), pressure: mean(rows, 'pressure') }
  }
  const early = summary(33), middle = summary(1003), late = summary(12003), upper = summary(100003), high = summary(MAX_LEVEL - 199)
  assert.ok(middle.hits > early.hits * 1.1)
  assert.ok(late.hits > middle.hits * 1.15)
  assert.ok(upper.hits > late.hits * 1.15)
  assert.ok(early.density < middle.density && middle.density < late.density && late.density < upper.density)
  assert.ok(Math.abs(high.hits - upper.hits) / upper.hits < .15, 'very high IDs should stay within the designed workload plateau')
})

test('work measurement distinguishes collectible yield, repeated hits and helpful dynamite blasts', () => {
  const level = createBlankLevel()
  level.goals = []
  level.obstacles = [
    { id: 'gift', kind: 'gift', cells: [0, 8], hp: 4, stock: 6 },
    { id: 'bird', kind: 'cuckoo', cells: [1], hp: 2, stock: 3 },
    { id: 'blast', kind: 'dynamite', cells: [2], hp: 1, stock: 2 },
    { id: 'stone', kind: 'stone', cells: [3], hp: 3 },
  ]
  const work = campaignWork(level)
  assert.equal(work.hitWork, 15, 'a gift yields all six toys after four hits, not twenty-four')
  assert.equal(work.birdHits, 6)
  assert.equal(work.dynamiteHits, 2)
  assert.ok(Math.abs(work.effort - 15.85) < 1e-9, 'board-wide dynamite assistance offsets part of the other hit work')
})
