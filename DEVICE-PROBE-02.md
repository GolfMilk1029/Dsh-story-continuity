# Device probe 02 — 2026-11-01

- GitHub contains the 11 staged files; local Git blob hashes match remote listing.
- Official ElecKoi Git installation completed, version 0.1.0-experimental.1.
- Bundle enabled and component disabled are distinct states. Continuity component remains disabled.
- Created a separate user-authorized character conversation; existing conversation/card not edited.
- User saved Gemini selection. One non-explicit synthetic baseline turn completed with two model requests; UI cost approximately CNY 0.02. NOT a continuity-plugin test.
- Trajectory shows initial system prompt, runtime context, model options, tool calls and usage.
- Default terminal login shell exited 1. Other shell choices were not tested.
- Local src/eleckoi-binding.mjs resolves explicit conversation IDs via the public Conversations API and separates runtime session identity. Five synthetic assertions passed; NOT wired, published or installed.

## Blockers
Installed config still has placeholder dataRoot and empty bindings. Disabled component detail showed no configuration form. Do not enable blindly. Need supported setup surface, explicit isolated-conversation binding and private storage resolution; then logged automatic extraction and true final-request verification. Persistence/restart/edit/delete/regenerate/branches remain unverified.

No character content, personal dialogue, credentials or runtime identifiers in this report. Local only, not published.

New source: real-loop memory mode passes; durable auxiliary session logs remain unverified. No live calls for development tests.
