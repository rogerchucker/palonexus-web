---
section: use-cases
eyebrow: Start here
heading: Prevent agents and coding sandboxes from receiving standing production credentials.
items:
  - >-
    Denied by default. During incident INC-4821, an SRE agent requests a production
    deployment restart. It holds no standing credentials, so the action stops at the
    decision point.
  - >-
    Owner-verified approval. PaloNexus routes the request to the service owner — and
    verifies that this person is actually entitled to approve this action on this
    resource.
  - >-
    Five minutes of scoped access. On approval, the agent receives a short-lived
    credential bound to that task, that deployment, and that window. Nothing else.
  - >-
    Auto-revoked, fully attributable. Access expires with the elevation window, and the
    authority trail records the agent, owner, delegation, approver, policy, and
    credential behind the action.
---
