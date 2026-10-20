export const meta = {
  name: 'beta-round',
  description: 'Beta test round with the four tester personas (lenient to very demanding), then a deduplicated, prioritized findings list',
  whenToUse: 'Before releasing or after a batch of fixes. args: {round: 1, previous: "path to previous report (regression rounds)", focus: "extra focus", testers: ["lucia","marc","hannah","ignacio"]}',
  phases: [{ title: 'Test' }, { title: 'Triage' }],
}
const a = args || {}
const testers = a.testers || ['lucia', 'marc', 'hannah', 'ignacio']
const SHOTS = `/tmp/cosmere-beta-round-${a.round || 'x'}`
const FINDING = { type: 'object', properties: { titulo: { type: 'string' }, severidad: { type: 'string', enum: ['bloqueante', 'grave', 'molesto', 'menor', 'sugerencia'] }, pasos: { type: 'string' }, esperado: { type: 'string' }, obtenido: { type: 'string' }, evidencia: { type: 'string' } }, required: ['titulo', 'severidad', 'pasos', 'esperado', 'obtenido', 'evidencia'] }
const SCHEMA = { type: 'object', properties: {
  tester: { type: 'string' }, nota: { type: 'integer' }, veredicto: { type: 'string' },
  recomendacion: { type: 'string', enum: ['sí', 'sí, con reservas', 'todavía no'] },
  verificacion: { type: 'array', items: { type: 'object', properties: { hallazgo: { type: 'string' }, estado: { type: 'string', enum: ['arreglado', 'parcialmente', 'no arreglado', 'empeorado'] }, evidencia: { type: 'string' } }, required: ['hallazgo', 'estado', 'evidencia'] } },
  hallazgos: { type: 'array', items: FINDING },
}, required: ['tester', 'nota', 'veredicto', 'recomendacion', 'verificacion', 'hallazgos'] }
phase('Test')
const reports = (await parallel(testers.map((t, i) => () => agent(
  `Beta round ${a.round || ''}. Use port ${8800 + i}; screenshots and scripts in ${SHOTS}/${t}/.` +
  (a.previous ? ` This is a REGRESSION round: your previous findings are in ${a.previous}; mark each one in "verificacion".` : ' First round: leave "verificacion" empty.') +
  (a.focus ? ` Extra focus: ${a.focus}.` : ''),
  { label: `beta:${t}`, phase: 'Test', agentType: `beta-${t}`, schema: SCHEMA })))).filter(Boolean)
phase('Triage')
const triage = await agent(`You are triaging a beta round of "Trivia del Cosmere". Merge these tester reports into ONE deduplicated list (same root cause = one item; keep every tester who hit it), ordered by severity then by how many testers hit it. Verify suspicious claims against the code before keeping them. Output Spanish markdown suitable for docs/BETA-<round>.md: a table of ratings and recommendations, then sections Bloqueante/Grave/Molesto/Menor/Sugerencias with evidence and the suspected file:line.\n\nREPORTS JSON:\n${JSON.stringify(reports)}`,
  { label: 'triage', phase: 'Triage', agentType: 'product-designer' })
return { reports, triage }
