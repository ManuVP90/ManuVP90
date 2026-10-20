export const meta = {
  name: 'translate',
  description: 'Translate every new/changed English question since a revision into es/fr/de/it in parallel',
  whenToUse: 'After editing content/en. args: {rev: "git rev (default HEAD)", langs: ["es","fr","de","it"]}',
  phases: [{ title: 'Translate' }],
}

// Project roles live in .claude/agents/<name>.md. A session that started before a role file existed
// does not have it registered, so fall back to a general agent that loads the role file itself.
const run = (prompt, opts = {}) => !opts.agentType ? agent(prompt, opts) : agent(prompt, opts).catch(() => {
  const { agentType, ...rest } = opts
  return agent(`Your role is defined in /home/user/ManuVP90/.claude/agents/${agentType}.md. Read that file first and follow it exactly as your instructions.\n\n${prompt}`, rest)
})
const rev = (args && args.rev) || 'HEAD'
const langs = (args && args.langs) || ['es', 'fr', 'de', 'it']
const REPORT = { type: 'object', properties: { summary: { type: 'string' }, unverified: { type: 'string' }, issues: { type: 'string' } }, required: ['summary', 'unverified', 'issues'] }
phase('Translate')
return await parallel(langs.map(l => () =>
  run(`Translate new/changed ids since ${rev} into ${l}.`, { label: `translate:${l}`, phase: 'Translate', agentType: `translator-${l}`, schema: REPORT })))
