export const meta = {
  name: 'release',
  description: 'Integrate parallel work: merge glossary reviews, rebuild data, run every gate, update docs, commit and push the feature branch',
  whenToUse: 'At the end of a team round, when no other agent is editing the tree. args: {summary: "what changed, for the commit message"}',
  phases: [{ title: 'Integrate' }, { title: 'QA' }],
}

// Project roles live in .claude/agents/<name>.md. A session that started before a role file existed
// does not have it registered, so fall back to a general agent that loads the role file itself.
const run = (prompt, opts = {}) => !opts.agentType ? agent(prompt, opts) : agent(prompt, opts).catch(() => {
  const { agentType, ...rest } = opts
  return agent(`Your role is defined in /home/user/ManuVP90/.claude/agents/${agentType}.md. Read that file first and follow it exactly as your instructions.\n\n${prompt}`, rest)
})
phase('Integrate')
const rel = await run(`Prepare and commit the release. Summary of the round: ${(args && args.summary) || '(derive it from git diff)'}.`,
  { label: 'release', phase: 'Integrate', agentType: 'release-manager',
    schema: { type: 'object', properties: { commit: { type: 'string' }, gates: { type: 'string' }, notes: { type: 'string' } }, required: ['commit', 'gates', 'notes'] } })
phase('QA')
const qa = await run('Post-release verification on the committed tree: run all gates again and check the last commit contains no unwanted files (node_modules, root README.md edits, hand-edited app/data).',
  { label: 'qa', phase: 'QA', agentType: 'qa-engineer',
    schema: { type: 'object', properties: { go: { type: 'boolean' }, gates: { type: 'string' }, problems: { type: 'string' } }, required: ['go', 'gates', 'problems'] } })
return { rel, qa }
