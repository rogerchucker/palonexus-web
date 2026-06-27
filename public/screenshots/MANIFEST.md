# PaloNexus Operator Portal — Screenshot Manifest

Captured from the live `palonexus-doks` operator console at `http://165.227.252.142`
(LoadBalancer for the portal, image `:h13`) on **2026-06-26** at desktop viewport
**1440×900**, light/as-shipped theme. All captures are read-only views of real
Next.js pages backed by live control-plane data (React Query). No forms were
submitted and no mutating actions (reseed / cleanup / revoke / approve) were clicked.

State legend: **rich** = page shows real populated data; **initial** = a
form/console rendered with its default inputs but no run output yet (a meaningful,
documentable starting state); **empty** = a real empty-queue state with its
empty-state copy.

| File | Route | Screen name | Alt text (accessibility) | Suggested caption | Suggested doc home | State |
|------|-------|-------------|--------------------------|-------------------|--------------------|-------|
| `overview.png` | `/` | Control-plane overview | Operator dashboard with four headline metric cards reading 22 authorization decisions (15 allow, 7 deny), 21 provisioned agent identities, 0 active delegations and 2,769 tokens, above a live feed of recent allow and deny decisions for the remediation agent | Live posture of the PaloNexus control plane: authorization decisions, agent identities, delegations and consumption in one view. | getting-started/overview | rich |
| `onboarding.png` | `/onboarding` | Day-0 onboarding wizard (Step 1) | Four-step onboarding wizard with step 1 "Connect Logto" active; a tenant-connected panel confirms the sandbox Logto tenant with a stored secret and offers Validate and Skip/offline buttons | The Day-0 path: connect Logto, seed demo data, register your first agent, then run the hero flow. | getting-started/quickstart | rich |
| `tenant-setup.png` | `/settings/tenant` | Tenant setup | Tenant settings form showing organization ID, sandbox environment, and default data-class (internal) and risk-tier (medium) selectors applied to new agent registrations, beside a summary of current values | Organization defaults for the tenant: org id, environment, and the data-class and risk-tier applied to new agents. | sdk/config-env or getting-started | rich |
| `settings-logto.png` | `/settings/logto` | Logto connector setup | Logto connector configuration with a connected sandbox tenant, read-only base-URL, management-API and M2M app-ID fields sourced from environment secrets, and a directory-sync panel reporting an OK sync of 6 created identities | Connect the sandbox Logto tenant; credentials are validated server-side and never exposed to the browser. | concepts/enterprise-iam | rich |
| `settings-seed.png` | `/settings/seed` | Seed test data | Seed-data console targeting the connected Logto tenant and palonexus-demo namespace, with an offline-mode toggle and Plan, Apply, Reseed and Cleanup action cards each describing what the seed-logto CLI step does | Load the Northstar demo identity environment via the seed-logto CLI: plan, apply, reseed or cleanup. | getting-started/quickstart | initial |
| `api-keys.png` | `/settings/keys` | SDK API keys | API-key console with a new-key form offering an environment selector and deny-by-default scope toggles, above a keys table listing one revoked test key (ops-smoke-h11) with its scopes and last-used time | Create, scope, rotate and revoke the SDK keys the palonexus client presents; keys are hashed at rest and fail closed when revoked. | sdk/config-env | rich |
| `agent-registry.png` | `/agents` | Agent registry | Agent registry listing many governed agents as cards, each showing the agent name, role, did:key identifier, granted capabilities such as deployment:scale, and a provisioned status badge | Every governed agent with its identity, delegated access and consumption; click through for the per-agent view. | concepts/consoles | rich |
| `governance.png` | `/governance` | Governance console | Governance console for tenant acme-corp showing 5 governed agents (3 active, 1 orphaned, 1 draft), a governance-issue alert that hr-bot's owner is inactive, a governed-agents table with owner/sponsor/risk/lifecycle columns, and delegation-authority and token-exchange panels | Accountable agent ownership and the revocation cascade: owners, sponsors, delegations and short-lived token exchange in one console. | concepts/consoles | rich |
| `approvals.png` | `/approvals` | Approvals queue (empty) | Human-in-the-loop approvals console with an operator approver field, showing zero pending delegation requests and zero active credentials with "the queue is clear" empty-state messaging | The human-in-the-loop queue where operators approve or deny delegation requests; shown here with a clear queue. | develop/delegations-and-approvals (and the temporary-elevation guide) | empty |
| `audit-explorer.png` | `/audit` | Audit explorer | Hash-chained audit log with a Verify-chain button and task/agent/scenario filters, above a table of decisions showing sequence, action, actor-to-subject, outcome (allow/deny), reason, truncated hash and per-row Tempo trace links | The tamper-evident, hash-chained decision log; filter, deep-link any event to its Tempo trace, and verify the chain. | concepts/security-model (or operations/observability) | rich |
| `policy-simulator.png` | `/simulate` | Policy simulator | Policy simulator with Authority-preview and Live-decision tabs; the authority-preview tab shows persona, scenario and authority-action selectors for a design-time eligibility query, with a note that only Live decision yields a trustworthy allow or deny | What-if over the real decision paths: design-time authority preview versus a runtime-faithful live dry-run. | concepts/egress-enforcement (or develop) | initial |
| `egress.png` | `/egress` | Egress approvals (empty) | Egress-approvals console with an operator approver field, showing zero pending outbound requests held at the egress proxy and zero recent decisions, with "nothing is being held" empty-state messaging | The console where operators release or block outbound agent calls held at the egress proxy; shown with no held requests. | concepts/egress-enforcement | empty |
| `directory.png` | `/directory` | Workforce directory | Workforce directory for tenant acme-corp showing 22 employees (20 active, 2 inactive) synced via SCIM, a sign-in precedence panel with simulated tokens flagging stale and group-conflict cases, and full employee and group tables keyed by stable subject | Workforce identity synced from the enterprise IdP via SCIM, keyed by stable subject so joiner/mover/leaver state stays accountable. | concepts/persistence-and-identity | rich |
| `decisions.png` | `/decisions` | Decisions breakdown | Decisions view with an allow-versus-deny bar chart per target (model-openai, scale_deployment, echo, orders, runbooks-operator) above a detailed table of every ext_authz verdict with actor, subject, task, outcome and rule | Allow versus deny outcomes per target, derived from the audit trail; every bar is a real ext_authz verdict. | concepts/consoles | rich |
| `identity.png` | `/identity` | Identity and delegations | Identity page showing the did:web issuer trust anchor and its public key, a table of provisioned agents with did:key identifiers and capabilities, and a delegations table mapping actor-to-resource grants, tasks, approvers and expiry | The trust anchor, the agents it provisions, the task-scoped delegations granting access, and revocations. | concepts/persistence-and-identity | rich |
| `playground.png` | `/playground` | SDK playground | SDK playground for the DevOps-incident scenario showing the seed personas (owner, approver, denied), the governed call parameters, and an editable but read-only canonical PaloNexus.offline() hero-flow Python snippet, with an empty output panel awaiting a run | Run the shipped palonexus hero flow against PaloNexus.offline(): register, deny-by-default, delegate, approve, succeed — no cluster or API key. | getting-started/quickstart (or sdk) | initial |

## Notes / portal rendering observations

- Every page rendered cleanly at 1440×900; the persistent left nav (Overview, Registry,
  Decisions, Simulator, Audit, Identity, Directory, Governance, Approvals, Egress
  Approvals, Agents, Traces, Playground + Settings group) is captured consistently in
  each shot.
- The portal exposes two nav routes not in the capture scope: `/registry` and `/traces`.
  They were not captured (not requested). Consider whether they warrant doc coverage.
- `/agents` and `/identity` list a large number of QA-generated agents
  (e.g. `qa-egress-…`, `qa-probe-…`, `apps-target-qa-…`). These read as test noise in a
  docs screenshot. For a cleaner published image, consider a freshly seeded tenant with
  only the canonical Northstar agents before re-capturing.
- `/identity` delegations are almost all in `expired` state and `/governance` shows 0
  active delegations on the overview — accurate, but a docs-quality capture of an
  *active* delegation + a *pending* approval would tell the temporary-elevation story
  better (see BACKLOG).
