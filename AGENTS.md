# Coding Agent

## Scope
- Work only inside this folder and its subfolders. Do not read or modify files outside it.
- Follow existing NestJS conventions: modules, controllers, services, DTOs, providers.

## Design
- Before implementing features or changing the data model, API routes, or tenancy logic, read `DESIGN.md` and follow it — it is the source of truth for schema, API contracts, and embed flow.

## Log your work in `BUILDLOG.md`
After making a meaningful change, append a concise entry to `BUILDLOG.md` at the root of this folder.

Each entry has three fields:
- **Where AI helped** — what you changed and why (1–2 lines).
- **Where AI was wrong** — any mistake you made, whether corrected by you or by the human.
- **What the human changed** — anything the human altered or rejected from your suggestions, and why.

Fill in **Where AI was wrong** and **What the human changed** only when your suggestions were not all approved as-is. If everything was accepted unchanged, omit both fields.

### Logging rules
- Log decisions and corrections, not trivial edits. Do not record every micro-action.
- One entry per working session is enough; add more only for something notable.
- If you did no meaningful work, do not add an entry.
- If you don't know what AI got wrong or what the human changed, ask in chat and log the answer in your own words.

## Comments rules
- Don't over-explain — skip comments for self-explanatory code.
- Explain the *why*, not the *what*.
- For placeholders, comment directly above them in UPPER CASE stating what to paste there, and flag it in the chat.
