export const meta = {
  name: 'release',
  description: 'Integrate parallel work: merge glossary reviews, rebuild data, run every gate, update docs, commit and push the feature branch',
  whenToUse: 'At the end of a team round, when no other agent is editing the tree. args: {summary: "what changed, for the commit message"}',
  phases: [{ title: 'Integrate' }, { title: 'QA' }],
}
phase('Integrate')
const rel = await agent(`Prepare and commit the release. Summary of the round: ${(args && args.summary) || '(derive it from git diff)'}.`,
  { label: 'release', phase: 'Integrate', agentType: 'release-manager',
    schema: { type: 'object', properties: { commit: { type: 'string' }, gates: { type: 'string' }, notes: { type: 'string' } }, required: ['commit', 'gates', 'notes'] } })
phase('QA')
const qa = await agent('Post-release verification on the committed tree: run all gates again and check the last commit contains no unwanted files (node_modules, root README.md edits, hand-edited app/data).',
  { label: 'qa', phase: 'QA', agentType: 'qa-engineer',
    schema: { type: 'object', properties: { go: { type: 'boolean' }, gates: { type: 'string' }, problems: { type: 'string' } }, required: ['go', 'gates', 'problems'] } })
return { rel, qa }
