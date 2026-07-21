---
section: solutions
eyebrow: Product packaging
heading: One authorization layer, packaged for how your agents reach production.
cards:
  - kicker: PaloNexus Core
    title: One authorization contract for every agent action
    description: >-
      An agent registry with accountable human owners, task-scoped delegation and
      approvals, and a deny-by-default policy engine — every decision recorded on a
      verifiable authority trail.
    items:
      - Agent registry & accountable owners
      - Task-scoped delegations & approvals
      - Deny-by-default policy engine
      - Authority audit on every decision
  - kicker: PaloNexus Access Broker
    title: Short-lived credentials instead of standing secrets
    description: >-
      Approved actions receive the minimum credential needed — bound to the task and
      delegation, expiring in minutes. Agents and sandboxes never hold durable secrets.
    items:
      - Short-lived runtime credentials (STS)
      - Task- & delegation-bound issuance
      - Cloud & SaaS token connectors (planned)
      - MCP credential injection (planned)
  - kicker: PaloNexus Lifecycle
    title: Authority that ends when the human context changes
    description: >-
      Workforce directory sync ties every agent to a live owner. Leavers, movers, and
      ownership changes cascade into agent access — not just at the next audit.
    items:
      - Workforce directory sync (SCIM & OIDC)
      - Joiner / mover / leaver revocation
      - Owner transfer & orphan quarantine (planned)
      - Access reviews & dormant-agent controls (planned)
  - kicker: PaloNexus Enforcement
    title: Runtime-neutral enforcement at boundaries you already have
    description: >-
      Enforce the same authorization decision wherever agents act — in the SDK, at the
      egress gateway, in the cluster. Keep your runtime; add accountable authorization.
    items:
      - Kubernetes egress gateway & Envoy ext_authz
      - LangChain, LangGraph & Deep Agents adapters
      - Agent-to-agent delegation
      - kagent, Agent Sandbox, OpenAI Agents SDK & MCP (planned)
---
