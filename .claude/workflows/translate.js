export const meta = {
  name: 'translate',
  description: 'Translate every new/changed English question since a revision into es/fr/de/it in parallel',
  whenToUse: 'After editing content/en. args: {rev: "git rev (default HEAD)", langs: ["es","fr","de","it"]}',
  phases: [{ title: 'Translate' }],
}
const rev = (args && args.rev) || 'HEAD'
const langs = (args && args.langs) || ['es', 'fr', 'de', 'it']
const REPORT = { type: 'object', properties: { summary: { type: 'string' }, unverified: { type: 'string' }, issues: { type: 'string' } }, required: ['summary', 'unverified', 'issues'] }
phase('Translate')
return await parallel(langs.map(l => () =>
  agent(`Translate new/changed ids since ${rev} into ${l}.`, { label: `translate:${l}`, phase: 'Translate', agentType: `translator-${l}`, schema: REPORT })))
