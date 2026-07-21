---
section: why-now
eyebrow: Why now
heading: Sandboxes isolate where agent code runs. Nobody isolates what it may do.
---

The agent ecosystem itself is pointing at the gap: LangChain's sandbox guidance says to
keep credentials outside the sandbox and inject them through an outbound proxy, and
OpenAI's agent architecture keeps authentication and audit outside the workspace. Both
name the broker; neither ships it. PaloNexus is that missing layer — it resolves the
agent's owner, task, and delegation, then issues short-lived, scoped access outside the
untrusted boundary, so no agent or sandbox ever holds a standing production credential.
