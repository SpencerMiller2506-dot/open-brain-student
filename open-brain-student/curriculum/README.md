# The curriculum

The eight teaching prompts for building your Open Brain, step by step.

**Do them in order.** Each level assumes the previous one is working.

| | |
|---|---|
| [Level 0](Level-0-Setup.md) | Set up your computer and accounts |
| [Level 1](Level-1-Build.md) | First working app, deployed, saving to your database |
| [Level 2](Level-2-Feed.md) | Voice, YouTube, PDF, links, search — and install it on your phone |
| [Level 3](Level-3-Telegram.md) | A Telegram bot, and your first code running in the cloud |
| [Level 4](Level-4-MCP.md) | Claude reads your brain natively, through MCP |
| [Level 5](Level-5-Agents.md) | Agents that tag your thoughts and write you a weekly digest |
| [Level 6](Level-6-Connect.md) | Search by meaning, and a graph that connects your ideas |
| [Level 7](Level-7-Retrieve.md) | Hybrid search, chunking, and a backfill over everything you have already captured |

Open Level 0, paste it into Claude, and follow along. When it is done, open
Level 1.

**Something that was working has stopped?** → [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
finds it by what you're seeing, not by which Level built it.

---

## Two ways to build this

**This course** teaches you to build every piece yourself. You will understand
what a database is, what an API key does, why a webhook needs a header, and how
to deploy code to a server. It takes 8–15 hours and you come out able to build
the next thing on your own.

**[Open Brain Express](https://github.com/King-Tuerto/open-brain-express)** is
the same system, already written, installed for you by Claude Code in about
three hours. You set up the accounts; it does the rest.

Different goals. If you want to *learn to build*, stay here. If you want the
thing *working*, go there.

---

## If a level does not work

First, check whether it's actually a symptom covered on
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) — a paused project, a save that
fails, search coming up empty, enrichment not tagging things, or a quiet
Telegram bot all have a known cause and a known fix there.

If it's not one of those, the express repository is the known-good
implementation of everything this course teaches. When something you built
will not run, compare it against the working version:

| What you are building | The working version |
|---|---|
| Telegram bot (Level 3) | [telegram-bot](https://github.com/King-Tuerto/open-brain-express/blob/main/supabase/functions/telegram-bot/index.ts) |
| MCP server (Level 4) | [open-brain-mcp](https://github.com/King-Tuerto/open-brain-express/blob/main/supabase/functions/open-brain-mcp/index.ts) |
| Enrichment agent (Level 5) | [enrich-thought](https://github.com/King-Tuerto/open-brain-express/blob/main/supabase/functions/enrich-thought/index.ts) |
| Embeddings and the graph (Level 6) | [migration.sql](https://github.com/King-Tuerto/open-brain-express/blob/main/migration.sql) |
| Hybrid search, chunking, backfill (Level 7) | [migration.sql](https://github.com/King-Tuerto/open-brain-express/blob/main/migration.sql), [backfill-brain](https://github.com/King-Tuerto/open-brain-express/blob/main/supabase/functions/backfill-brain/index.ts) |
| YouTube capture | [capture-youtube](https://github.com/King-Tuerto/open-brain-express/blob/main/supabase/functions/capture-youtube/index.ts) |

Use these to spot what is missing from yours — not to copy wholesale. Reading
working code to find the one line you are missing is a real skill, and it is
most of what professional debugging actually is.

Note that the express versions are structured a little differently, because they
were written to be installed rather than taught.

---

## A note on these files

They are prompts, not documentation. They are written to be pasted into Claude,
which then teaches you. Reading them directly works, but it is not what they are
for.
