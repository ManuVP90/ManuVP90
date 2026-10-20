export const meta = {
  name: 'team-meeting',
  description: 'Team meeting: five role leads review the real project and propose prioritized next steps',
  whenToUse: 'Planning. args: {topic: "optional focus question"}',
  phases: [{ title: 'Reviews' }, { title: 'Minutes' }],
}
const topic = (args && args.topic) || 'What should we do next, and in which order?'
const ROLES = [
  { agentType: 'product-designer', lens: 'game design and player retention' },
  { agentType: 'game-developer', lens: 'technical health, performance, accessibility, maintainability (read-only: do NOT modify files in this meeting)' },
  { agentType: 'question-writer', lens: 'question bank coverage and quality by book/world/difficulty (read-only: do NOT modify files in this meeting)' },
  { agentType: 'terminologist', lens: 'official-names compliance per language and the verification backlog (read-only: do NOT modify files in this meeting)' },
  { agentType: 'qa-engineer', lens: 'quality gates, real usability on a phone, risks before release' },
]
const SCHEMA = { type: 'object', properties: {
  diagnostico: { type: 'string' },
  propuestas: { type: 'array', items: { type: 'object', properties: { titulo: { type: 'string' }, detalle: { type: 'string' }, impacto: { type: 'string', enum: ['alto', 'medio', 'bajo'] }, esfuerzo: { type: 'string', enum: ['alto', 'medio', 'bajo'] }, cuando: { type: 'string', enum: ['ya', 'corto plazo', 'medio plazo', 'largo plazo'] } }, required: ['titulo', 'detalle', 'impacto', 'esfuerzo', 'cuando'] } },
  riesgos: { type: 'string' }, preguntas_para_el_cliente: { type: 'array', items: { type: 'string' } },
}, required: ['diagnostico', 'propuestas', 'riesgos', 'preguntas_para_el_cliente'] }
phase('Reviews')
const inputs = (await parallel(ROLES.map(r => () => agent(
  `TEAM MEETING (you are one participant; this is a review, do not change any file). Topic: ${topic}. Your lens: ${r.lens}. Ground every point in what you actually find in the repo; up to 6 prioritized proposals; answer in Spanish.`,
  { label: `meeting:${r.agentType}`, phase: 'Reviews', agentType: r.agentType, schema: SCHEMA }).then(x => x && ({ rol: r.agentType, ...x }))))).filter(Boolean)
phase('Minutes')
const minutes = await agent(`Write the meeting minutes in Spanish markdown (for docs/ROADMAP.md): common diagnosis, consensus and disagreements (with a lead recommendation), a phased plan table (task, area, impact, effort), and the deduplicated questions for the owner.\n\nINPUTS JSON:\n${JSON.stringify(inputs)}`,
  { label: 'minutes', phase: 'Minutes', agentType: 'product-designer' })
return { inputs, minutes }
