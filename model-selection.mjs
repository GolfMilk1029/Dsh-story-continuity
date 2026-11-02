// Read the last admitted request, including host agent/request overrides.
export function extractionModelSelection(agent){
 const persisted=agent.session.requestHeader?.()?.config;
 const selected={...(agent.options??{}),...(persisted??{})};
 if(!selected.provider||!selected.model)throw Error("No resolved RP provider/model available");
 return selected;
}
