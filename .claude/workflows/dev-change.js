export const meta = {
  name: 'dev-change',
  description: 'Implement an app change with the game developer, then an independent QA gate review',
  whenToUse: 'Features or bug fixes in app/. args: {brief: "what to build/fix, with acceptance criteria"}',
  phases: [{ title: 'Build' }, { title: 'QA' }],
}

// Project roles live in .claude/agents/<name>.md. A session that started before a role file existed
// does not have it registered, so fall back to a general agent that loads the role file itself.
const run = (prompt, opts = {}) => !opts.agentType ? agent(prompt, opts) : agent(prompt, opts).catch(() => {
  const { agentType, ...rest } = opts
  return agent(`Your role is defined in /home/user/ManuVP90/.claude/agents/${agentType}.md. Read that file first and follow it exactly as your instructions.\n\n${prompt}`, rest)
})
if (!args || !args.brief) throw new Error('args.brief is required')
phase('Build')
const built = await run(args.brief, { label: 'build', phase: 'Build', agentType: 'game-developer',
  schema: { type: 'object', properties: { done: { type: 'string' }, not_done: { type: 'string' }, tests: { type: 'string' } }, required: ['done', 'not_done', 'tests'] } })
phase('QA')
const qa = await run(`Independent review of the change just made for this brief:\n${args.brief}\n\nDeveloper report:\n${JSON.stringify(built)}\n\nRun all gates and look at the screenshots of the changed screens. Also check the brief's acceptance criteria one by one.`,
  { label: 'qa', phase: 'QA', agentType: 'qa-engineer',
    schema: { type: 'object', properties: { go: { type: 'boolean' }, gates: { type: 'string' }, problems: { type: 'string' } }, required: ['go', 'gates', 'problems'] } })
return { built, qa }
