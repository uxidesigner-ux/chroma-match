/** Compact evidence without full board definitions or per-turn/frame traces. */
export function formatBalanceReport(report) {
  // Keep readable objects while storing each seed outcome on one line.
  const scalarArray = /\[(?:\s*(?:"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)\s*,?)+\]/g
  return JSON.stringify(report, null, 2).replace(scalarArray, value => JSON.stringify(JSON.parse(value))) + '\n'
}

export function compactBalanceReport(report) {
  const outcomeColumns = ['seedOffset', 'status', 'turns', 'movesRemaining', 'goalCoverage', 'remainingWork', 'maxGoalStall', 'maxWorkStall', 'shuffles', 'powersCreated', 'minimumLegal', 'shuffleCalls', 'startupShuffleCalls', 'silentShuffleCalls']
  const flagged = new Set(report.consecutiveOutlierCandidates.map(row => row.id))
  const specialCases = report.rows.filter(row => row.errors.length || row.policy === 'objective' && row.status !== 'won' && (flagged.has(row.id) || row.goals.some(g => g.firstProgressTurn === null || g.maxStall >= 10)))
    .map(row => ({ policy:row.policy,id:row.id,seedOffset:row.seedOffset,status:row.status,turns:row.turns,powersCreated:row.powersCreated,acceptedDamageEvents:row.acceptedDamageEvents,
      errors:row.errors,goals:row.goals.filter(g=>g.remaining>0).map(g=>({kind:g.kind,...(g.colour===undefined?{}:{colour:g.colour}),remaining:g.remaining,work:g.work,firstProgressTurn:g.firstProgressTurn,maxStall:g.maxStall,trailingStall:g.trailingStall})) }))
  return {
    schema:report.schema,label:report.label,repositoryHead:report.repositoryHead,sourceHashes:report.sourceHashes,policyHash:report.policyHash,
    limitations:report.limitations,configuration:report.configuration,elapsedSeconds:report.elapsedSeconds,
    summary:report.summary,objectiveProgress:report.objectiveProgress,consecutiveOutlierCandidates:report.consecutiveOutlierCandidates,
    seedOutcomeColumns:outcomeColumns,
    perLevel:report.perLevel.map(row=>({policy:row.policy,band:row.band,id:row.id,name:row.name,difficulty:row.difficulty,runs:row.runs,completed:row.completed,
      meanGoalCoverage:row.meanGoalCoverage,meanWorkClearedFraction:row.meanWorkClearedFraction,meanTurns:row.meanTurns,moveBudget:row.meanMoveBudget,
      maxGoalStall:row.maxGoalStall,maxWorkStall:row.maxWorkStall,
      seedOutcomes:report.rows.filter(run=>run.policy===row.policy&&run.id===row.id).map(run=>outcomeColumns.map(column=>run[column]))})),
    specialCases,
    definitionHashes:report.definitions.map(({band,sha256,level})=>({band,id:level.id,sha256})),
  }
}
