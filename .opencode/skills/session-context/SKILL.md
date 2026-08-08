---
name: session-context
description: Persistent cross-session context system. Auto-loads on session start, logs key decisions, enforces completion rules. Use for maintaining continuity across opencode sessions.
---

# Session Context Skill

This skill provides persistent cross-session context by:
1. **Auto-loading** on session start - reads registry, flags incomplete sessions, loads recent context
2. **Logging key decisions** during session - captures root causes, architectural choices, confirmations
3. **Enforcing completion** - requires explicit user confirmation before marking session COMPLETE
4. **Semantic search** - embeddings-based search across all sessions

## Architecture

### File Structure
```
.opencode/session-context/
├── index.json                      # Registry of all sessions
└── sessions/
    └── {name}_{YYYY-MM-DD}_{HH-MM-SS}_{INCOMPLETE|COMPLETE}.json
```

### Session File Schema
```json
{
  "id": "unique-session-id",
  "status": "INCOMPLETE | COMPLETE",
  "created": "ISO timestamp",
  "updated": "ISO timestamp",
  "objective": "What this session aims to accomplish",
  "plan": ["step 1", "step 2", ...],
  "actions": [
    {
      "step": 1,
      "description": "What was done",
      "files": ["file1.ts", "file2.ts"],
      "done": true,
      "key_decision": "Why this approach was chosen"
    }
  ],
  "key_decisions": ["Root cause: ...", "Strategy: ..."],
  "files_modified": ["file1.ts", "file2.ts"],
  "done": false,
  "user_confirmed": false,
  "confirmation_timestamp": null
}
```

## Hooks

### 1. Session Start (`experimental.session.compacting`)
- Read `index.json`
- Find all `INCOMPLETE` sessions → present to user with summary
- Load most recent 5 sessions for context (full session files)
- Create new session file for current session (INCOMPLETE)

### 2. Tool Execute After (`tool.execute.after`)
- Detect significant actions: git commits, file writes, test runs
- Append to current session's `actions` array
- Update `updated` timestamp
- Update `index.json`

### 3. Key Decision Detection (`experimental.chat.messages.transform`)
- Scan for patterns: "root cause", "fixed by", "decided to", "strategy", "architecture", "confirmed", "works"
- Extract and append to `key_decisions` array
- Redact secrets before write

## Commands

### `session-context:list`
List all sessions with status, date, summary.

### `session-context:show <id>`
Show full session details.

### `session-context:complete <id>`
Mark session as COMPLETE:
- Set `status: "COMPLETE"`, `done: true`, `user_confirmed: true`
- Update `confirmation_timestamp` to now
- Rename file from `_INCOMPLETE.json` to `_COMPLETE.json`
- Update `index.json`

### `session-context:search <query>`
Semantic search across sessions using embeddings.
Returns top 5 matches with relevance scores.

### `session-context:current`
Show current session being logged.

### `session-context:add-decision <text>`
Manually add a key decision to current session.

## Redaction Rules

Before writing any session file, strip:
- API keys, tokens, secrets, passwords
- Authorization headers, Bearer tokens
- Email addresses
- JWTs
- Any string matching patterns: `api[_-]?key`, `token`, `secret`, `password`, `authorization`, `bearer`, `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`

## Name Generation

From first user message:
1. Extract 2-3 keywords (nouns/verbs, skip stop words)
2. Kebab-case, max 40 chars
3. Format: `{keywords}_{YYYY-MM-DD}_{HH-MM-SS}_INCOMPLETE`

Example: "fix search profile bug" → `search-profile-fix_2026-08-08_14-30-00_INCOMPLETE.json`

## Semantic Search (Embeddings)

Uses `@xenova/transformers` with `Xenova/all-MiniLM-L6-v2` (384-dim, local, no API key).

Embeddings generated for:
- `objective` + `key_decisions` joined
- `summary` from index

Stored in `index.json` alongside session metadata.

Search: embed query → cosine similarity → top-K results.

## Configuration

Add to `opencode.json`:
```json
{
  "instructions": ["AGENTS.md", ".opencode/skills/session-context/SKILL.md"],
  "skills": { "paths": [".opencode/skills"] }
}
```

Add to `AGENTS.md`:
```markdown
# Session Context Protocol

- **On session start**: Skill reads `.opencode/session-context/index.json`, flags any `INCOMPLETE` sessions, loads recent context (last 5).
- **During session**: New session file created at first user interaction. Key decisions appended automatically.
- **On task completion**: When you confirm a fix works, run `session-context:complete <id>` or tell the agent "mark session complete".
- **Rule 1**: If any prior session is `INCOMPLETE`, skill MUST surface it at session start with summary.
- **Rule 2**: Skill handles all file I/O for session logging automatically.
- **Secrets**: API keys, tokens, passwords, emails are auto-redacted before write.
```