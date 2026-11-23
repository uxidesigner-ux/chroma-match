#!/usr/bin/env node
/**
 * Reproducible real-engine balance diagnostics, not human win-rate estimates.
 * node scripts/royal-balance-audit.mjs --output docs/royal-preview/v13-balance/engine-baseline.json --source-root /tmp/chroma-balance-ddb965b --label ddb965b
 * Optional: --ids 1-72,993-1012 --seed-offsets 7,777,2026 --policies objective,hint
 * Full per-run state summaries: --raw-output /tmp/royal-balance-raw.json
 * Only actual tap/swap/update advance the game. No tools, boosters, unlimited
 * moves, engine mutation, future RNG inspection, or speculative game rollouts.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chooseVisibleMove, visibleMoves, visibleGoalWork } from './royal-balance-policy.mjs'
import { compactBalanceReport, formatBalanceReport } from './royal-balance-report.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
const supportedOptions = new Set(['source-root','output','raw-output','label','seed-offsets','policies','ids'])
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith('--') || !process.argv[i + 1]) throw new Error('Expected --option value pairs')
  if (!supportedOptions.has(process.argv[i].slice(2))) throw new Error(`Unknown option: ${process.argv[i]}`)
  args.set(process.argv[i].slice(2), process.argv[i + 1])
}
const sourceRoot = resolve(args.get('source-root') ?? repoRoot)
const output = resolve(args.get('output') ?? 'docs/royal-preview/v13-balance/engine-audit.json')
const seedOffsets = (args.get('seed-offsets') ?? '7,777,2026,104729,2654435761').split(',').map(Number)
if (!seedOffsets.length || seedOffsets.some(n => !Number.isSafeInteger(n) || n < 0 || n > 0xffffffff)) throw new Error('Seed offsets must be unsigned 32-bit integers')
const policies = (args.get('policies') ?? 'objective,hint').split(',')
if (policies.some(p => !['objective', 'hint'].includes(p))) throw new Error('Policies: objective,hint')
const range = (start, count) => Array.from({ length: count }, (_, i) => start + i)
const bands = [
  ['authored', range(1, 32)], ['firstGenerated', range(33, 40)], ['hundred', range(93, 20)],
  ['thousand', range(993, 20)], ['twelveThousand', range(11993, 20)], ['growthCap', range(100023, 20)],
  ['million', range(999993, 20)], ['maxSafe', range(Number.MAX_SAFE_INTEGER - 9, 10)],
]
const customIds = args.get('ids')?.split(',').flatMap(part => {
  const [start, end = start] = part.split('-').map(Number)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start > 10000) throw new Error(`Invalid ID range: ${part}`)
  return range(start, end - start + 1)
})
const selected = customIds ? [['custom', [...new Set(customIds)]]] : bands
const { getLevel, validateLevel } = await import(pathToFileURL(resolve(sourceRoot, 'src/royal/levels.ts')).href)
const { RoyalEngine } = await import(pathToFileURL(resolve(sourceRoot, 'src/royal/engine.ts')).href)
// Count silent constructor/cascade-cap shuffles as well as public effects.
// The observer delegates unchanged and never inspects or replaces the RNG.
const shuffleCounts = new WeakMap()
class AuditedEngine extends RoyalEngine {
  shuffleBoard(emit) {
    const count = shuffleCounts.get(this) ?? { total:0, silent:0 }
    count.total++; if (!emit) count.silent++
    shuffleCounts.set(this,count)
    return super.shuffleBoard(emit)
  }
}
const sourceFiles = ['src/royal/engine.ts', 'src/royal/levels.ts', 'src/royal/campaign-generator.ts', 'src/royal/campaign-profile.ts', 'src/royal/campaign-geometry.ts', 'src/royal/targeting.ts', 'src/royal/timing.ts', 'src/game/rng.ts']
const hash = content => createHash('sha256').update(content).digest('hex')
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, hash(await readFile(resolve(sourceRoot, path)))])))
const policyHash = hash(await readFile(new URL('./royal-balance-policy.mjs', import.meta.url)))
const definitions = selected.flatMap(([band, ids]) => ids.map(id => ({ band, level: getLevel(id) })))
const round = n => +n.toFixed(4), mean = a => a.length ? a.reduce((s,v)=>s+v,0) / a.length : 0
const key = g => `${g.kind}:${g.colour ?? ''}`
const sumWork = goals => goals.reduce((sum, g) => sum + g.work, 0)
const rows = [], started = performance.now()

for (const policy of policies) for (const { band, level } of definitions) for (const seedOffset of seedOffsets) {
  const game = new AuditedEngine(level, { seed: (level.seed + seedOffset) >>> 0 })
  const starting = visibleMoves(game.state), initialWork = visibleGoalWork(game.state), totalGoals = level.goals.reduce((s,g)=>s+g.count,0)
  const row = { policy, band, id: level.id, seedOffset, seed: (level.seed + seedOffset) >>> 0, moveBudget: level.moves,
    initialLegal: starting.length, initialOrdinary: starting.filter(c=>!c.power).length,
    unexpectedStartingPowers: Math.max(0, game.state.pieces.filter(p=>p?.power).length - (level.pieces ?? []).filter(p=>p.power).length),
    initialWork: sumWork(initialWork), minimumLegal: starting.length, lowChoiceTurns: 0, turns: 0, shuffles: 0, startupShuffleCalls:shuffleCounts.get(game)?.total??0, powersCreated: 0,
    activations: 0, acceptedDamageEvents: 0, maximumSettleSeconds: 0, maxGoalStall: 0, maxWorkStall: 0,
    errors: validateLevel(level).errors.map(e=>`validation: ${e}`), goals: initialWork.map(g=>({ ...g, initialWork:g.work, initialRemaining:g.remaining, firstProgressTurn:null, maxStall:0, trailingStall:0 })) }
  let goalStall = 0, workStall = 0, legalTotal = 0
  game.drainEvents()
  while (game.state.status === 'playing' && row.turns < 250) {
    const choices = visibleMoves(game.state), before = visibleGoalWork(game.state)
    row.minimumLegal = Math.min(row.minimumLegal, choices.length); legalTotal += choices.length
    if (choices.length <= 2) row.lowChoiceTurns++
    const move = policy === 'objective' ? chooseVisibleMove(game.state) : game.hint()
    if (!move) { row.errors.push('no available action while playing'); break }
    if (!(move[0] === move[1] ? game.tap(move[0]) : game.swap(...move))) { row.errors.push(`rejected action ${move}`); break }
    row.turns++
    let updates = 0
    do {
      game.update(.1); updates++
      for (const event of game.drainEvents()) {
        if (event.kind === 'shuffle') row.shuffles++
        if (event.kind === 'power') row.powersCreated++
        if (event.kind === 'activate') row.activations++
        if (event.kind === 'damage') row.acceptedDamageEvents++
      }
    } while (game.state.locked.size && game.state.status === 'playing' && updates < 500)
    row.maximumSettleSeconds = Math.max(row.maximumSettleSeconds, updates / 10)
    if (game.state.locked.size) { row.errors.push('settlement exceeded 50 simulation seconds'); break }
    const after = visibleGoalWork(game.state)
    goalStall = after.some((g,i)=>g.remaining<before[i].remaining) ? 0 : goalStall + 1
    workStall = sumWork(after) < sumWork(before) ? 0 : workStall + 1
    row.maxGoalStall = Math.max(row.maxGoalStall, goalStall); row.maxWorkStall = Math.max(row.maxWorkStall, workStall)
    for (let i = 0; i < after.length; i++) {
      const goal = row.goals[i], next = after[i], previous = before[i]
      if (previous.remaining > 0) {
        if (next.work < previous.work || next.remaining < previous.remaining) { goal.firstProgressTurn ??= row.turns; goal.trailingStall = 0 }
        else { goal.trailingStall++; goal.maxStall = Math.max(goal.maxStall, goal.trailingStall) }
      }
      goal.work = next.work; goal.remaining = next.remaining
    }
  }
  if (game.state.status === 'playing' && !row.errors.length) row.errors.push('turn cap reached')
  row.status = game.state.status; row.movesRemaining = game.state.moves; row.meanLegal = round(legalTotal / Math.max(1,row.turns))
  row.shuffleCalls=shuffleCounts.get(game)?.total??0;row.silentShuffleCalls=shuffleCounts.get(game)?.silent??0
  row.remainingWork = sumWork(visibleGoalWork(game.state)); row.workClearedFraction = row.initialWork ? round(1-row.remainingWork/row.initialWork) : 1
  row.goalCoverage = round(1-game.state.goals.reduce((s,g)=>s+g.remaining,0)/Math.max(1,totalGoals))
  rows.push(row)
}

const summarize = values => ({ runs: values.length, completed: values.filter(r=>r.status==='won').length, completionFraction:round(mean(values.map(r=>r.status==='won'?1:0))),
  meanGoalCoverage:round(mean(values.map(r=>r.goalCoverage))), meanWorkClearedFraction:round(mean(values.map(r=>r.workClearedFraction))),
  meanMoveBudget:round(mean(values.map(r=>r.moveBudget))), meanTurns:round(mean(values.map(r=>r.turns))), meanMovesLeftOnCompletion:round(mean(values.filter(r=>r.status==='won').map(r=>r.movesRemaining))),
  minInitialOrdinary:Math.min(...values.map(r=>r.initialOrdinary)), meanInitialLegal:round(mean(values.map(r=>r.initialLegal))),
  unexpectedStartingPowers:values.reduce((s,r)=>s+r.unexpectedStartingPowers,0), shuffles:values.reduce((s,r)=>s+r.shuffles,0), shuffleCalls:values.reduce((s,r)=>s+r.shuffleCalls,0), startupShuffleCalls:values.reduce((s,r)=>s+r.startupShuffleCalls,0), silentShuffleCalls:values.reduce((s,r)=>s+r.silentShuffleCalls,0), errors:values.filter(r=>r.errors.length).length,
  maxGoalStall:Math.max(...values.map(r=>r.maxGoalStall)), maxWorkStall:Math.max(...values.map(r=>r.maxWorkStall)),
  meanPowersCreated:round(mean(values.map(r=>r.powersCreated))), meanDamageEvents:round(mean(values.map(r=>r.acceptedDamageEvents))), maximumSettleSeconds:Math.max(...values.map(r=>r.maximumSettleSeconds)) })
const summary = policies.flatMap(policy => selected.map(([band])=>({policy,band,...summarize(rows.filter(r=>r.policy===policy&&r.band===band))})))
const perLevel = policies.flatMap(policy=>definitions.map(({band,level})=>({policy,band,id:level.id,name:level.name,difficulty:level.difficulty,...summarize(rows.filter(r=>r.policy===policy&&r.id===level.id))})))
const outliers = perLevel.filter(r=>r.policy==='objective'&&r.id<=72).flatMap(row=>{
  const neighbours=perLevel.filter(r=>r.policy===row.policy&&r.id!==row.id&&Math.abs(r.id-row.id)<=2)
  const localCompletion=mean(neighbours.map(r=>r.completionFraction)),localCoverage=mean(neighbours.map(r=>r.meanGoalCoverage))
  return row.meanGoalCoverage < .7 || localCompletion-row.completionFraction>=.4 || localCoverage-row.meanGoalCoverage>=.15
    ? [{id:row.id,difficulty:row.difficulty,completionFraction:row.completionFraction,meanGoalCoverage:row.meanGoalCoverage,localCompletion:round(localCompletion),localGoalCoverage:round(localCoverage)}] : []
})
const objectiveProgress=policies.map(policy=>({policy,goals:[...new Set(rows.flatMap(r=>r.goals.map(key)))].map(goalKey=>{
  const goals=rows.filter(r=>r.policy===policy).flatMap(r=>r.goals.filter(g=>key(g)===goalKey))
  return {key:goalKey,runs:goals.length,neverProgressed:goals.filter(g=>g.firstProgressTurn===null&&g.initialRemaining>0).length,cleared:goals.filter(g=>g.remaining===0).length,meanRemainingWork:round(mean(goals.map(g=>g.work))),maxStall:Math.max(...goals.map(g=>g.maxStall))}
})}))
let head = 'unavailable'
try { head = execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim() } catch {}
const report={schema:1,label:args.get('label')??head,repositoryHead:head,sourceHashes,policyHash,
  limitations:['Automated visible-board heuristic outcomes are not human win rates or a proof of all-seed solvability.','Power/homing/chain scores approximate currently visible outcomes; no future RNG or cascade rollout is used.','Goal coverage weights goal units, so inspect per-goal remaining work alongside jelly-heavy totals.','Local consecutive-level outliers are candidates for review; five seeds and difficulty labels do not establish statistical significance.','Max goal stall counts collection-free turns; work stall separately includes useful partial HP damage.'],
  configuration:{policies,seedOffsets,seedFormula:'(level.seed + seedOffset) >>> 0',bands:selected.map(([band,ids])=>({band,ids})),tools:false,boosters:false,unlimitedMoves:false,maxTurns:250,maxSettleSeconds:50,updateSeconds:.1},
  elapsedSeconds:round((performance.now()-started)/1000),summary,objectiveProgress,consecutiveOutlierCandidates:outliers,perLevel,rows,
  definitions:definitions.map(({band,level})=>({band,sha256:hash(JSON.stringify(level)),level}))}
await mkdir(dirname(output),{recursive:true});await writeFile(output,formatBalanceReport(compactBalanceReport(report)))
if (args.has('raw-output')) { const rawOutput=resolve(args.get('raw-output'));await mkdir(dirname(rawOutput),{recursive:true});await writeFile(rawOutput,JSON.stringify(report,null,2)+'\n') }
console.log(JSON.stringify({output,elapsedSeconds:report.elapsedSeconds,summary,outliers},null,2))
if (rows.some(row=>row.errors.length)) process.exitCode=1
