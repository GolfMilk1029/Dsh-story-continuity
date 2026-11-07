// Read the last admitted request, including host agent/request overrides.
// Single implementation: index.mjs imports this, so the auxiliary route can never
// drift from the tested one. `inherit` keeps the main chat's effort untouched.
export function extractionModelSelection(agent,reasoningEffort='inherit'){
 const persisted=agent.session.requestHeader?.()?.config;
 const selected={...(agent.options??{}),...(persisted??{})};
 if(!selected.provider||!selected.model)throw Error('No resolved RP provider/model available');
 if(reasoningEffort!=='inherit'){
  if(!['low','medium','high'].includes(reasoningEffort))throw Error('Invalid auxiliary reasoning effort');
  selected.reasoningEffort=reasoningEffort;
 }
 return selected;
}
