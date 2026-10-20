export const meta = {
  name: 'content-pipeline',
  description: 'Write new questions for one world, fact-check them, then translate into es/fr/de/it',
  whenToUse: 'Adding questions. args: {world: "roshar|scadrial|sel|nalthis|otros|cosmere", counts: {d1,d2,d3,d4}, scope: "books/topics to cover", rev: "git rev before the change (default HEAD)"}',
  phases: [{ title: 'Write' }, { title: 'Fact-check' }, { title: 'Translate' }],
}
const a = args || {}
if (!a.world || !a.counts) throw new Error('args.world and args.counts are required')
const rev = a.rev || 'HEAD'
const counts = Object.entries(a.counts).map(([k, v]) => `${v}× difficulty ${k.replace('d', '')}`).join(', ')
const REPORT = { type: 'object', properties: { summary: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, doubts: { type: 'string' } }, required: ['summary', 'ids', 'doubts'] }

phase('Write')
const written = await agent(`World: ${a.world}. Append ${counts} to content/en/${a.world}.json. Scope: ${a.scope || 'balanced across the world\'s books and topics, prioritising the least covered works'}.`,
  { label: `write:${a.world}`, phase: 'Write', agentType: 'question-writer', schema: REPORT })
phase('Fact-check')
const checked = await agent(`Check the new/changed ids since ${rev} (node tools/changed-ids.mjs ${rev}). The writer reported these doubts: ${written ? written.doubts : 'n/a'}`,
  { label: 'fact-check', phase: 'Fact-check', agentType: 'fact-checker', schema: REPORT })
phase('Translate')
const translations = await parallel(['es', 'fr', 'de', 'it'].map(l => () =>
  agent(`Translate new/changed ids since ${rev} into ${l}.`, { label: `translate:${l}`, phase: 'Translate', agentType: `translator-${l}`, schema: REPORT })))
log('Done. Next: run the "release" workflow (or merge-glossary + build + gates) to integrate and commit.')
return { written, checked, translations }
