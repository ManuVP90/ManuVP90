export const meta = {
  name: 'dev-change',
  description: 'Implement an app change with the game developer, then an independent QA gate review',
  whenToUse: 'Features or bug fixes in app/. args: {brief: "what to build/fix, with acceptance criteria"}',
  phases: [{ title: 'Build' }, { title: 'QA' }],
}
if (!args || !args.brief) throw new Error('args.brief is required')
phase('Build')
const built = await agent(args.brief, { label: 'build', phase: 'Build', agentType: 'game-developer',
  schema: { type: 'object', properties: { done: { type: 'string' }, not_done: { type: 'string' }, tests: { type: 'string' } }, required: ['done', 'not_done', 'tests'] } })
phase('QA')
const qa = await agent(`Independent review of the change just made for this brief:\n${args.brief}\n\nDeveloper report:\n${JSON.stringify(built)}\n\nRun all gates and look at the screenshots of the changed screens. Also check the brief's acceptance criteria one by one.`,
  { label: 'qa', phase: 'QA', agentType: 'qa-engineer',
    schema: { type: 'object', properties: { go: { type: 'boolean' }, gates: { type: 'string' }, problems: { type: 'string' } }, required: ['go', 'gates', 'problems'] } })
return { built, qa }
