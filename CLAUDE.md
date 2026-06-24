@AGENTS.md

# Working with this user

**Keep the prompt responsive.** For any command/script expected to take longer than ~30 seconds (multi-page scrapes, DB seeds, PDF extractions, sitemap walks, etc.), default to background execution (`run_in_background: true` on Bash, or a subagent for self-contained research). Don't block the conversation waiting for output the user could be redirecting in the meantime. Acknowledge the kick-off in 1-2 lines, then yield back. The user can ask "status?" when they want progress.

**Don't fragment the backlog.** Task chips and subagents are for genuine async hand-offs and parallelisable independent work — not for items already on the active plan that the user is driving continuously. The plan doc is the canonical backlog.
