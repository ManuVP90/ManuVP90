export const meta = {
  name: 'marketing-launch',
  description: 'Marketing department: launch plan, copy (es/en + fr/de/it), community posts, press kit images, then compliance review',
  whenToUse: 'Preparing a launch or campaign. args: {goal: "optional focus", languages: ["fr","de","it"]}',
  phases: [{ title: 'Plan' }, { title: 'Create' }, { title: 'Localize' }, { title: 'Review' }],
}
// Project roles live in .claude/agents/<name>.md. A session that started before a role file existed
// does not have it registered, so fall back to a general agent that loads the role file itself.
const run = (prompt, opts = {}) => !opts.agentType ? agent(prompt, opts) : agent(prompt, opts).catch(() => {
  const { agentType, ...rest } = opts
  return agent(`Your role is defined in /home/user/ManuVP90/.claude/agents/${agentType}.md. Read that file first and follow it exactly as your instructions.\n\n${prompt}`, rest)
})
const a = args || {}
const langs = a.languages || ['fr', 'de', 'it']
const OUT = { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, owner_decisions: { type: 'string' } }, required: ['files', 'summary', 'owner_decisions'] }
phase('Plan')
const plan = await run(`Prepare the launch plan (docs/marketing/PLAN.md). ${a.goal || ''}`, { label: 'plan', phase: 'Plan', agentType: 'marketing-lead', schema: OUT })
phase('Create')
const [copy, community, kit] = await parallel([
  () => run(`Write the launch copy following docs/marketing/PLAN.md.`, { label: 'copy', phase: 'Create', agentType: 'marketing-copywriter', schema: OUT }),
  () => run(`Research the target communities in docs/marketing/PLAN.md and draft the posts and reply bank (Spanish and English first; one post per target community).`, { label: 'community', phase: 'Create', agentType: 'community-manager', schema: OUT }),
  () => run(`Build the press kit images following docs/marketing/PLAN.md.`, { label: 'press-kit', phase: 'Create', agentType: 'press-kit-designer', schema: OUT }),
])
phase('Localize')
const loc = await parallel(langs.map(l => () =>
  run(`Localize docs/marketing/COPY.md into ${l} (docs/marketing/COPY.${l}.md) and adapt any community post that targets ${l} speakers.`, { label: `loc:${l}`, phase: 'Localize', agentType: 'marketing-localizer', schema: OUT })))
phase('Review')
const review = await run('Review all marketing material in docs/marketing/ and write docs/marketing/COMPLIANCE.md.', { label: 'compliance', phase: 'Review', agentType: 'brand-compliance', schema: OUT })
const index = await run(`Write docs/marketing/README.md (Spanish): what is in the launch kit, the launch-day checklist for the owner (what to post where, in order, with links to each file), and the open decisions from these reports:\n${JSON.stringify({ plan, copy, community, kit, loc, review })}`, { label: 'index', phase: 'Review', agentType: 'marketing-lead', schema: OUT })
return { plan, copy, community, kit, loc, review, index }
