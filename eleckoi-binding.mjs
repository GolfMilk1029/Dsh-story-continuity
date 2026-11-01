// Public ElecKoi API only; no internal lifecycle access.
export async function resolveElecKoiBinding(api, conversationId, signal) {
  if (!api || typeof api.list !== 'function') throw Error('ElecKoi public Conversations API unavailable');
  if (typeof conversationId !== 'string' || !conversationId) throw Error('Explicit conversationId required');
  signal?.throwIfAborted();
  const rows = await api.list(signal);
  signal?.throwIfAborted();
  if (!Array.isArray(rows)) throw Error('Invalid ElecKoi conversation catalog');
  // A unique explicit title is a usable UI alternative to copying an opaque ID.
  const title=conversationId.startsWith('title:')?conversationId.slice(6):null;
  if(title!==null&&!title.trim())throw Error('Explicit title required');
  const matches = rows.filter(row => title===null?row.id===conversationId:row.title===title);
  if (matches.length !== 1) throw Error('Conversation binding is missing or ambiguous');
  const row = matches[0];
  if (typeof row.runtimeSessionId !== 'string' || !row.runtimeSessionId ||
      typeof row.metadata?.characterName !== 'string' || !row.metadata.characterName ||
      typeof row.metadata?.characterId !== 'string' || !row.metadata.characterId) {
    throw Error('Incomplete ElecKoi runtime identity');
  }
  return {sessionId: row.runtimeSessionId, character: row.metadata.characterName,
    characterId: row.metadata.characterId, storyId: `eleckoi:${row.id}`};
}
