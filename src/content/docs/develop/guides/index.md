---
title: Guides
description: End-to-end, copy-pasteable PaloNexus walkthroughs that string the SDK, the consoles, and the audit chain into one narrated flow on the real Northstar seed personas.
sidebar:
  order: 7
---

Longer-form, end-to-end walkthroughs that narrate a complete flow — SDK, consoles, and the
audit chain together — on the real **devops-incident** seed personas (no invented users). Where
the [recipes](/docs/develop/recipes/) are short single-pattern snippets, a guide is the full
story from `register` to `revoke`.

## The guides

| Guide | What it covers |
|---|---|
| [Temporary elevation walkthrough (INC-4821)](/docs/develop/guides/temporary-elevation-walkthrough/) | An agent acting on behalf of Ethan Park is denied a regulated runbook, requests a task-scoped delegation, Maya Chen approves, the read succeeds, and access is audited then revoked — deny-by-default, JIT elevation, audit-by-construction. |

## Related

- [Quickstart](/docs/getting-started/quickstart/) — the typed API the guides use.
- [Authority delegation](/docs/develop/delegations-and-approvals/) — the human-in-the-loop layer.
- [Recipes](/docs/develop/recipes/) — short single-pattern offline snippets.
- [Glossary](/docs/getting-started/glossary/) — the IAM acronyms.
