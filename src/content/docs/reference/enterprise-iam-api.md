---
title: Enterprise IAM API
description: The agent-idp enterprise-IAM HTTP API — directory sync, employee identity resolution, agent ownership governance, governance delegations, revocation cascade, human-authority delegation, STS token exchange, and compliance/provenance governance credentials. Method, path, body, response, and status codes for every endpoint.
sidebar:
  order: 3
---

Use this page when you're integrating the workforce side of PaloNexus — syncing a directory,
resolving an employee from a login token, governing who owns an agent, exchanging a
delegation for a short-lived token, or issuing/verifying a governance credential. It's the
full request/response contract for the core enterprise identity-and-access-management (IAM)
features (F1–F6) plus the
compliance and provenance credential dimensions (F20, F24, F25) — the F-numbers are
PaloNexus feature identifiers, reused in the section headings below — so you can drive directory,
governance, Security Token Service (STS), and credential flows over HTTP.

These features live in the **agent-idp** service, alongside the
agent onboarding / delegation / revocation APIs documented in
[HTTP API §4](/docs/reference/http-api/#4-agent-idp-api-8090). They turn PaloNexus from an
agent-only control plane into one that knows the *workforce* behind each agent: who an
employee is, who owns an agent, who may delegate authority, and what short-lived token an
agent may exchange that delegation for. For the why, see
[Connect agents to enterprise authority](/docs/concepts/enterprise-iam/).

**Base URL** — same service as the rest of agent-idp: `:8090` (env `PORT`). All these
endpoints are unauthenticated management-plane calls in the MVP; the cryptographic edge is
the STS token they mint (F6) and the verifiable-presentation (VP) verification under onboarding.

**Conventions**

- **Request bodies are camelCase** (`tenantId`, `ownerRef`, `agentProof`) — they are
  Pydantic models. **Responses are snake_case** (`employee_subject`, `owner_active`,
  `authority_basis`) — they are stored records, returned as-is minus internal `_seq`
  cursors.
- **Fail-closed.** Unknown owner, inactive approver, cross-tenant reference, unusable
  delegation, disallowed audience — every ambiguous case denies. A stale login token can
  never reactivate an inactive employee, and a suspended agent can never receive a
  delegation or mint a token.
- **Errors** use the envelope `{"error": {"code", "message"}}`.
- **Tenant-scoped.** Every record carries a `tenant_id`; a call for tenant A never reads or
  writes tenant-B state.
- Live machine-readable contract: **OpenAPI at `/openapi.json`**, **Swagger UI at `/docs`**.

---

## 1. Directory lifecycle sync (F1)

Ingest a per-tenant **SCIM (System for Cross-domain Identity Management) 2.0 snapshot** (the full desired state of Users + Groups) and
reconcile it into the directory. Snapshot diffing gives joiner / mover / leaver / rehire
handling and idempotency for free: re-posting the same snapshot reports everything
`unchanged`.

The **stable enterprise subject** is `<idp>:<tenant_id>:<external_id>` — derived from the
identity provider's (IdP's) durable id (Entra ID `oid` / Okta `id`, surfaced as SCIM `externalId`), **never from
email**, so an email change can never fork a person.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/directory/sync` | reconcile a SCIM snapshot (auto-runs the F4 cascade after) |
| GET | `/v1/directory/employees?tenant=&status=` | list employees (filter by tenant + status) |
| GET | `/v1/directory/employees/{subject}` | one employee by stable subject (`404` if absent) |
| GET | `/v1/directory/groups?tenant=` | list groups |
| GET | `/v1/directory/groups/{group_key}` | one group (`404` if absent) |
| GET | `/v1/directory/syncs?tenant=` | sync-run history, newest first |
| GET | `/v1/directory/conflicts?tenant=` | on-demand dangling/inactive-manager conflicts (`tenant` required) |

### `POST /v1/directory/sync`

Request — `tenantId` and `idp` are control fields; `users`/`groups` are raw SCIM 2.0
resources (camelCase, including the enterprise extension):

```json
{
  "tenantId": "acme-corp",
  "idp": "entra",
  "mode": "snapshot",
  "users": [
    {
      "schemas": [
        "urn:ietf:params:scim:schemas:core:2.0:User",
        "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
      ],
      "id": "8a1f-acme-1001",
      "externalId": "oid-1001",
      "userName": "alice.chen@acme-corp.example",
      "name": { "givenName": "Alice", "familyName": "Chen" },
      "displayName": "Alice Chen",
      "title": "Engineering Manager",
      "emails": [{ "value": "alice.chen@acme-corp.example", "primary": true }],
      "active": true,
      "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
        "department": "Engineering",
        "manager": { "value": "oid-1000" }
      }
    }
  ],
  "groups": [
    {
      "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      "externalId": "eng-all",
      "displayName": "Engineering - All",
      "members": [{ "value": "oid-1001" }]
    }
  ]
}
```

`idp` defaults to `entra`; `mode` defaults to `snapshot`. App assignments ride on the SCIM
`entitlements` attribute; groups/roles on `groups`/`roles`.

Response — the **sync report** (a sync-run record) with a `cascade` block appended (the F4
revocation cascade that auto-runs after every sync):

```json
{
  "id": "uuid",
  "tenant_id": "acme-corp",
  "idp": "entra",
  "started_at": "ISO8601",
  "finished_at": "ISO8601",
  "status": "ok",
  "counts": {
    "users_created": 1, "users_updated": 0, "users_deactivated": 0,
    "users_reactivated": 0, "users_unchanged": 0,
    "groups_created": 1, "groups_updated": 0, "groups_unchanged": 0,
    "errors": 0
  },
  "errors": [],
  "conflicts": [],
  "cascade": {
    "agents_suspended": 0, "agents_quarantined": 0,
    "delegations_revoked": 0, "delegations_invalidated": 0,
    "delegations_expired": 0, "by_reason": {}
  }
}
```

`status` is `"ok"`, or `"partial"` if any record failed to parse (those land in `errors[]`
and are skipped — one bad row never corrupts the rest). Lifecycle outcomes:

| Snapshot change | Effect |
|---|---|
| new stable subject appears | **create** (`users_created`) |
| dept / manager / group / app / email change (same `external_id`) | **update**, same subject |
| `active:false`, or subject absent from snapshot | **deactivate** (`users_deactivated`) |
| previously-inactive subject reappears active | **reactivate** (`users_reactivated`) |

```bash
curl -s -XPOST localhost:8090/v1/directory/sync -H 'content-type: application/json' \
  -d @snapshot.json | jq '.status, .counts'
```

### Employee record schema

Keyed by `employee_subject`. `source` is always `scim`; `session` is set only by F2
identity resolution (token-sourced, never authoritative).

| Field | Type | Meaning |
|---|---|---|
| `employee_subject` | string | stable subject `<idp>:<tenant_id>:<external_id>` (the key) |
| `idp` | string | `entra` / `okta` |
| `tenant_id` | string | PaloNexus tenant |
| `external_id` | string | IdP stable id (Entra `oid` / Okta `id`, via SCIM `externalId`) |
| `external_idp_id` | string\|null | the SCIM `id` if distinct from `externalId` |
| `email` | string\|null | primary email |
| `display_name` | string\|null | |
| `given_name`, `family_name`, `title`, `department` | string\|null | |
| `manager_subject` | string\|null | the manager's stable subject |
| `groups` | []string | directory group external ids (sorted, deduped) |
| `roles` | []string | directory roles |
| `app_assignments` | []string | from SCIM `entitlements` |
| `status` | string | `active` / `inactive` |
| `active` | bool | `status == "active"` |
| `source` | `"scim"` | provenance |
| `created_at`, `updated_at`, `deactivated_at`, `last_synced_at` | RFC3339\|null | |
| `session` | object\|null | F2 token session (see §2); never set by sync |

**Group record:** `group_key` (`<tenant_id>:<external_id>`, the key), `tenant_id`,
`external_id`, `display_name`, `members` (list of `employee_subject`), and
`created_at` / `updated_at` / `last_synced_at`.

**Sync-run record:** `id`, `tenant_id`, `idp`, `started_at`, `finished_at`, `status`
(`ok` / `partial`), `counts` (the table above), `errors` (`[{resource_type, external_id,
error}]`), `conflicts`.

**Conflicts** (`/v1/directory/conflicts` and the `conflicts` array on a sync) surface
manager references that dangle. Each is `{type, subject, detail}` with `type` one of
`manager_missing` (manager not in the tenant) or `manager_inactive` (manager deactivated).

---

## 2. Employee identity / token precedence (F2)

Resolve a decoded **login-token claim set** against the SCIM directory under explicit
source precedence. SCIM is authoritative; the token contributes session context and surfaces
conflicts — it never mutates an authoritative field.

> MVP: claims are trusted edge input — no JSON Web Token (JWT) signature verification (deferred to BACKLOG).

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/identity/resolve` | resolve token claims → effective identity + session + conflicts |
| GET | `/v1/identity/sessions?tenant=` | employees with a recent sign-in, newest first |

### `POST /v1/identity/resolve`

Request — `idp`/`tenant` are optional hints; otherwise the token `iss` (or Entra `tid`) is
matched through the issuer map:

```json
{
  "claims": {
    "iss": "https://login.microsoftonline.com/1111…/v2.0",
    "oid": "oid-1001",
    "email": "alice.chen@acme-corp.example",
    "groups": ["eng-all"],
    "roles": []
  },
  "idp": "entra",
  "tenant": "acme-corp"
}
```

**Subject derivation** is per-IdP and never from email:

| IdP | subject claim | stable subject |
|---|---|---|
| `entra` | `oid` (falls back to `sub`/`oid`) | `entra:<tenant>:<oid>` |
| `okta` | `sub` | `okta:<tenant>:<sub>` |

Without `idp`+`tenant`, the token `iss` is looked up in the issuer map; an Entra token can
also be matched by its `tid` GUID embedded in a mapped issuer.

Response:

```json
{
  "resolved": true,
  "reason": "ok",
  "employee_subject": "entra:acme-corp:oid-1001",
  "idp": "entra",
  "tenant_id": "acme-corp",
  "effective": {
    "employee_subject": "entra:acme-corp:oid-1001",
    "email": "alice.chen@acme-corp.example",
    "display_name": "Alice Chen",
    "department": "Engineering",
    "manager_subject": "entra:acme-corp:oid-1000",
    "groups": ["eng-all"],
    "roles": [],
    "status": "active",
    "active": true
  },
  "session": {
    "last_seen_at": "ISO8601",
    "idp_issuer": "https://login.microsoftonline.com/1111…/v2.0",
    "token_email": "alice.chen@acme-corp.example",
    "token_groups": ["eng-all"],
    "token_roles": [],
    "preferred_username": "alice.chen@acme-corp.example",
    "conflicts": []
  },
  "conflicts": [],
  "precedence": { "...": "..." }
}
```

`resolved=false` (with `reason` and an `unresolved` conflict) when the issuer is unknown, a
subject claim is missing, or the subject has no SCIM employee (not auto-provisioned in MVP).
`effective.active` is **SCIM** status, so a stale token over an inactive employee yields
`active:false` — access denied.

**Precedence map** (returned as `precedence`):

| Field | Source of truth |
|---|---|
| `subject` | issuer + tenant + IdP subject (never email) |
| `status` | scim — a token can **never** make an inactive employee active |
| `manager` | scim |
| `department` | scim |
| `groups` | scim for durable membership; token groups kept as session claims |
| `email` | scim (token updates session only) |
| `display_name` | scim (token updates session only) |
| `roles` | scim / explicit (raw token roles are not auto-privileged) |

**Conflict types** (in `conflicts[]`, each `{type, detail}`):

| Type | When |
|---|---|
| `email_conflict` | token email ≠ directory email (directory kept) |
| `group_conflict` | token claims groups not in the directory (kept as session claims only) |
| `stale_token_inactive` | token presented but the employee is inactive — access denied |
| `unresolved` | claims could not be mapped to a stable subject / no matching employee |

`GET /v1/identity/sessions` returns, per employee with a session,
`{employee_subject, display_name, tenant_id, status, email, department, session}`.

```bash
curl -s -XPOST localhost:8090/v1/identity/resolve -H 'content-type: application/json' \
  -d '{"claims":{"iss":"https://globex.okta.com","sub":"00u-7","email":"sam@globex"},"tenant":"globex","idp":"okta"}' \
  | jq '.resolved, .effective.active, .conflicts'
```

---

## 3. Ownership governance (F3)

Every agent must have accountable, tenant-scoped ownership. No agent is orphaned, and none
reaches `active` without a valid **active owner + business sponsor + risk tier + approved
runtime**. Owner health is re-derived from the live directory, so an F1 sync that deactivates
an employee instantly shows `owner_inactive` on every agent they own.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/governance/agents` | register a governed agent (`201`) |
| GET | `/v1/governance/agents?tenant=&status=` | list governed agents |
| GET | `/v1/governance/agents/{name}` | one governed agent (`404` if absent) |
| POST | `/v1/governance/agents/{name}/transition` | move lifecycle status |
| POST | `/v1/governance/agents/{name}/transfer-ownership` | reassign owner |
| GET | `/v1/governance/issues?tenant=` | orphan / inactive-owner / incomplete-active surface |

### `POST /v1/governance/agents`

```json
{
  "agentName": "triage-agent",
  "tenantId": "acme-corp",
  "ownerType": "employee",
  "ownerRef": "entra:acme-corp:oid-1001",
  "teamRef": "acme-corp:grp-sre",
  "businessSponsor": "entra:acme-corp:oid-1000",
  "riskTier": "high",
  "approvedRuntime": "doks_prod",
  "createdBy": "entra:acme-corp:oid-1001"
}
```

`ownerType=employee` → `ownerRef` is an F2 subject; `ownerType=team` /
`service_account_owner_group` → `ownerRef` is a group key `<tenant>:<external_id>`. An
unknown or cross-tenant owner is rejected `400`. An inactive owner may register but the agent
stays `draft` (it cannot activate). `transition` to `active` rejects `409 activation_blocked`
with the blocker list if the gate is not met.

### Governed-agent record schema

`GET`/`POST` responses are **enriched** with live owner health (`owner_*`, `sponsor_*`,
`activation_blockers`):

| Field | Type | Meaning |
|---|---|---|
| `agent_name` | string | the key |
| `tenant_id` | string | |
| `owner_type` | string | `employee` / `team` / `service_account_owner_group` |
| `owner_ref` | string | F2 subject or group key |
| `team_ref` | string\|null | optional owning team |
| `business_sponsor` | string\|null | sponsoring employee subject |
| `risk_tier` | string\|null | `low` / `medium` / `high` / `critical` |
| `approved_runtime` | string\|null | one of the approved runtimes (below) |
| `status` | string | lifecycle status (below) |
| `created_by`, `created_at`, `updated_at`, `last_reviewed_at` | | |
| `history` | []object | append-only `{at, action, by, detail}` audit trail |
| `owner_display` | string | resolved owner display name (enriched) |
| `owner_ok` / `owner_active` | bool | live owner health (enriched) |
| `sponsor_display` / `sponsor_active` | | if a sponsor is set (enriched) |
| `activation_blockers` | []string | what stops `active` — empty = ready (enriched) |

**Taxonomy**

| Owner types | Risk tiers |
|---|---|
| `employee`, `team`, `service_account_owner_group` | `low`, `medium`, `high`, `critical` |

| Approved runtimes |
|---|
| `local_dev`, `doks_dev`, `doks_stage`, `doks_prod`, `github_actions`, `kubernetes_job`, `external_mcp_client` |

These are **example runtime labels** describing *where* an agent runs; the `doks_*`
values are illustrative (substitute e.g. `k8s_prod`, `eks_prod`) and imply no
DigitalOcean/DOKS dependency — PaloNexus runs on any Kubernetes or via Docker Compose.

**Statuses:** `draft`, `pending_approval`, `approved`, `active`, `suspended`,
`quarantined`, `retired`. The F4 cascade sets `suspended`/`quarantined` directly; the
endpoints below govern manual transitions.

**Status-transition map** (`POST …/transition` `{status, by}`):

| From | Allowed targets |
|---|---|
| `draft` | `pending_approval`, `retired` |
| `pending_approval` | `approved`, `draft`, `retired` |
| `approved` | `active`, `suspended`, `retired` |
| `active` | `suspended`, `quarantined`, `retired` |
| `suspended` | `active`, `quarantined`, `retired` |
| `quarantined` | `active`, `retired` |
| `retired` | _(terminal)_ |

A disallowed move returns `409 bad_transition`; `→ active` re-checks the activation gate, so
a recovered-but-orphaned agent still cannot re-activate.

`POST …/transfer-ownership` takes `{ownerType, ownerRef, by}`; the new owner must resolve and
be **active** (`400` otherwise).

`GET /v1/governance/issues` returns `[{agent_name, type, detail, status}]` with `type` one of
`owner_missing`, `owner_inactive`, `incomplete_active`.

```bash
curl -s -XPOST localhost:8090/v1/governance/agents -H 'content-type: application/json' -d '{
  "agentName":"triage-agent","tenantId":"acme-corp","ownerType":"employee",
  "ownerRef":"entra:acme-corp:oid-1001","businessSponsor":"entra:acme-corp:oid-1000",
  "riskTier":"high","approvedRuntime":"doks_prod"}'
curl -s -XPOST localhost:8090/v1/governance/agents/triage-agent/transition -d '{"status":"approved","by":"admin"}'
```

---

## 4. Governance delegations + revocation cascade (F4)

A **governance delegation** grants a governed agent authority to act, by an accountable
human. Revocation is durable persistent state, not a transient denial: the cascade
suspends/quarantines agents and revokes/invalidates delegations whenever the underlying
human, owner, sponsor, group, or agent state goes bad — and writes a reason-coded log row.

> `POST /v1/authority/delegations` is the **grant** endpoint. It is also an authorization
> decision (the F5 human-authority gate) — see §5 for the authority fields and bases.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/authority/delegations` | grant a delegation (`201`; authorized — see §5) |
| GET | `/v1/authority/delegations?tenant=&agent=&status=` | list, newest first |
| GET | `/v1/authority/delegations/{id}` | one delegation (`404` if absent) |
| GET | `/v1/authority/delegations/{id}/usable` | is it usable right now? |
| POST | `/v1/authority/delegations/{id}/revoke` | revoke `{reason?, by?}` |
| POST | `/v1/revocation/cascade?tenant=` | run the cascade on demand; returns a report |
| GET | `/v1/revocation/log?tenant=` | durable revocation-event log, newest first |

### Gov-delegation record schema

| Field | Type | Meaning |
|---|---|---|
| `delegation_id` | string | the key |
| `tenant_id`, `agent_id` | string | |
| `granted_by` | string | approving/granting employee subject |
| `requester_ref` | string\|null | the human who requested it |
| `task_id`, `task_description` | string\|null | |
| `action` | string | e.g. `runbook:read` |
| `resource` | string | e.g. `runbooks-api:/runbooks/*` (trailing `/*` glob) |
| `resource_type` | string\|null | |
| `required_group` | string\|null | a group the granter must remain in |
| `status` | string | `pending` / `approved` / `active` / `revoked` / `expired` / `superseded` / `invalidated` |
| `vc_status` | string | `valid` / `revoked` / `expired` / `superseded` |
| `authority_basis`, `authority_evidence`, `policy_decision` | | F5 — see §5 |
| `expires_at` | int\|null | unix seconds |
| `created_at`, `approved_at`, `revoked_at` | RFC3339\|null | |
| `revocation_reason` | string\|null | reason code if terminated |
| `history` | []object | append-only `{at, action, by, detail}` |

`GET …/usable` returns `{usable, status, reason}` — `usable=true` only for an `active`,
non-expired delegation; this is exactly what the F6 STS consumes.

### Revocation-log event schema

`POST /v1/revocation/cascade` returns the **report**
`{agents_suspended, agents_quarantined, delegations_revoked, delegations_invalidated,
delegations_expired, by_reason}`. Each consequence also appends a durable log row
(`GET /v1/revocation/log`):

| Field | Type | Meaning |
|---|---|---|
| `id` | string | |
| `tenant_id` | string | |
| `kind` | string | `agent_suspend` / `agent_quarantine` / `delegation_revoke` / `delegation_invalidate` / `delegation_expire` / `vc_revoke` |
| `reason_code` | string | one of the reason codes below |
| `agent_id`, `delegation_id` | string\|null | the affected subject |
| `source` | string | `auto` (lifecycle) / `admin` (manual) |
| `by` | string | actor |
| `detail` | string\|null | |
| `at` | RFC3339 | |

### Reason codes (16)

The cascade emits the marked codes automatically; the rest are part of the charter set and
may be supplied to manual revoke.

| Reason code | Engine-emitted | Trigger |
|---|---|---|
| `owner_inactive` | ✅ | owning employee deactivated → agent **suspended**, its live delegations revoked |
| `owner_missing` | ✅ | owner unresolvable/cross-tenant → agent **quarantined**, delegations revoked |
| `sponsor_inactive` | ✅ | business sponsor deactivated → agent **suspended** |
| `delegation_expired` | ✅ | `expires_at` reached → delegation **expired** |
| `delegation_grantor_lost_authority` | ✅ | the granting human went inactive → delegation **invalidated** |
| `group_removed` | ✅ | granter no longer in the delegation's `required_group` → **invalidated** |
| `agent_inactive` | ✅ | agent suspended/quarantined/retired → its live delegations **invalidated** |
| `manual_admin_revocation` | ✅ (default) | the default reason for `…/revoke` |
| `owner_transferred` | — | charter reason code |
| `sponsor_changed` | — | charter reason code |
| `team_inactive` | — | charter reason code |
| `role_removed` | — | charter reason code |
| `manager_changed` | — | charter reason code |
| `employee_disabled` | — | charter reason code |
| `tenant_disabled` | — | charter reason code |
| `policy_changed` | — | charter reason code |

```bash
curl -s -XPOST 'localhost:8090/v1/authority/delegations/'$ID'/revoke' \
  -d '{"reason":"manual_admin_revocation","by":"admin"}'
curl -s -XPOST 'localhost:8090/v1/revocation/cascade?tenant=acme-corp' | jq '.by_reason'
```

---

## 5. Delegation authority (F5)

F4 records *who* granted a delegation; F5 makes the grant an **authorization decision**. The
human requester and approver must be authenticated, **active** employees in the agent's
tenant, and the approver must actually hold authority over the resource/task. The proven
basis and its evidence are written onto the delegation (`authority_basis`,
`authority_evidence`, `policy_decision`) and audited, so every grant is explainable.

The decision uses the F1/F2 directory + F3 governance — no separate policy engine.

### `POST /v1/authority/delegations` (the authorized grant)

The §4 grant body, plus the F5 authority fields:

```json
{
  "tenantId": "acme-corp",
  "agentId": "triage-agent",
  "approverRef": "entra:acme-corp:oid-1000",
  "requesterRef": "entra:acme-corp:oid-1001",
  "action": "runbook:read",
  "resource": "runbooks-api:/runbooks/db-failover",
  "taskId": "INC-42",
  "requiredGroup": "acme-corp:grp-sre",
  "expiresInSeconds": 3600,
  "breakGlass": false
}
```

- `approverRef` is the approving human (an **active** employee subject). `grantedBy` is
  accepted as an alias; one of the two is required (`400 missing_approver` otherwise).
- `requesterRef` defaults to the approver if omitted.
- `breakGlass:true` short-circuits to the `manual_break_glass` basis (explicit, audited).

On success → `201` with the full gov-delegation record (`status:"active"`) carrying the
`authority_basis` / `authority_evidence` / `policy_decision`.

### Authority bases (first match wins)

| # | Basis | How it is evidenced |
|---|---|---|
| 1 | `manual_break_glass` | `breakGlass:true` explicitly invoked |
| 2 | `palo_nexus_admin` | approver holds the `palonexus_admin` role or is in an admin group (`grp-security`) |
| 3 | `business_sponsor` | approver is the agent's `business_sponsor` |
| 4 | `service_owner` | approver is the agent's employee owner (`owner_ref`) |
| 5 | `team_owner` | approver is in the agent's owning team/group |
| 6 | `resource_owner` | approver owns the resource (or is in the team that owns it) per the resource-ownership map |
| 7 | `manager_chain` | approver is in the requester's manager chain |
| 8 | `group_membership` | approver is a member of the delegation's `requiredGroup` |
| — | _(none)_ | no basis matched → `403 authority_denied` |

### Denial codes

| Code | HTTP | When |
|---|---|---|
| `inactive_requester` | 403 | requester is an inactive employee |
| `inactive_approver` | 403 | approver is an inactive employee |
| `cross_tenant` | 403 | agent / approver / requester belongs to a different tenant |
| `authority_denied` | 403 | no authority basis matched |
| `agent_not_active` | 409 | the agent is suspended / quarantined / retired |

(Also: `invalid_approver` / `invalid_requester` `400` for an unknown employee,
`agent_not_governed` `404`.)

### `GET /v1/authority/resource-owners?tenant=`

The MVP resource-ownership map used by the `resource_owner` basis (`tenant` required):

```json
[
  { "resource": "runbooks-api:/runbooks/*", "owner_type": "team", "owner_ref": "acme-corp:grp-sre" },
  { "resource": "k8s:ml-namespace", "owner_type": "employee", "owner_ref": "entra:acme-corp:oid-1013" }
]
```

```bash
curl -s -XPOST localhost:8090/v1/authority/delegations -H 'content-type: application/json' -d '{
  "tenantId":"acme-corp","agentId":"triage-agent","approverRef":"entra:acme-corp:oid-1000",
  "requesterRef":"entra:acme-corp:oid-1001","action":"runbook:read",
  "resource":"runbooks-api:/runbooks/db-failover","taskId":"INC-42","expiresInSeconds":3600}' \
  | jq '.authority_basis, .status'
```

---

## 6. STS token exchange (F6)

Exchange delegation evidence + an agent proof-of-possession into a short-lived,
audience-bound **EdDSA JWT** that an ordinary resource server can verify. The token separates
the agent subject (`sub`) from the human actor (`act`) and carries the `delegation_id` /
`task_id` it was minted from. The F4 cascade composes for free: a revoked / invalidated /
expired delegation is not `usable`, so the STS refuses to mint.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/sts/token` | exchange → short-lived agent access token |
| GET | `/v1/sts/tokens?tenant=` | STS audit log (issued + denied; metadata only) |

### `POST /v1/sts/token`

```json
{
  "tenantId": "acme-corp",
  "agentId": "triage-agent",
  "delegationId": "uuid",
  "taskId": "INC-42",
  "action": "runbook:read",
  "resource": "runbooks-api:/runbooks/db-failover",
  "audience": "https://runbooks.acme.internal",
  "agentProof": { "type": "mock_pop", "value": "pop:triage-agent" },
  "requestedTtl": 600
}
```

Response envelope:

```json
{
  "access_token": "<eddsa-jwt>",
  "token_type": "Bearer",
  "expires_in": 600,
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "delegation_id": "uuid",
  "task_id": "INC-42",
  "audience": "https://runbooks.acme.internal",
  "jti": "uuid",
  "claims": { "...": "the decoded claim set (below)" }
}
```

**TTL cap:** `requestedTtl` is clamped to **900s** (`MAX_TTL`); default **600s**. An excessive
request is reduced, not denied.

**Audience allowlist** — the `audience` must be one of:

```text
https://api.acme.internal/k8s
https://runbooks.acme.internal
https://pagerduty.acme.internal
```

**Proof-of-possession (MVP):** `agentProof` must be `{"type":"mock_pop","value":"pop:<agentId>"}`.
Its SHA-256 binds into the `cnf` claim. DPoP / mutual-TLS (mTLS) / DID-bound proofs are deferred.

**Signing key:** the token reuses the **existing issuer Ed25519 key**
(`ISSUER_PRIVATE_KEY_B64`) — no new signing key; header `alg=EdDSA`, `typ=at+jwt`,
`kid=<issuer DID>`. JWKS / rotation are deferred.

### Token claims

| Claim | Value |
|---|---|
| `iss` | the issuer DID |
| `sub` | `agent:<tenant_id>:<agent_id>` |
| `sub_type` | `agent` |
| `act` | the human actor (requester, else granter) |
| `act_type` | `employee` |
| `aud` | the requested (allowlisted) audience |
| `iat` / `exp` | issued-at / expiry (`iat + ttl`) |
| `jti` | unique token id |
| `tenant_id`, `agent_id` | |
| `delegation_id` | the delegation it was minted from |
| `task_id` | request `taskId`, else the delegation's |
| `action`, `resource`, `resource_type` | from request, else the delegation |
| `cnf` | `{ "mock_pop_sha256": "<first 32 hex of proof hash>" }` |
| `scope` | the effective `action` |

### Denial reason codes

Every outcome (issued **or** denied) is written to the durable token log (metadata only,
never token contents). Denials return `403` with one of:

| Code | When |
|---|---|
| `agent_not_found` | agent is not governed |
| `tenant_mismatch` | agent or delegation belongs to a different tenant |
| `agent_inactive` | agent is suspended / quarantined / retired |
| `owner_invalid` | agent owner is not valid/active |
| `delegation_not_found` | no such delegation |
| `delegation_agent_mismatch` | delegation is for a different agent |
| `delegation_expired` | delegation reached its expiry |
| `delegation_revoked` | delegation is revoked / invalidated / otherwise unusable |
| `task_mismatch` | request `taskId` ≠ the delegation's |
| `action_mismatch` | request `action` ≠ the delegation's |
| `resource_mismatch` | request `resource` not covered by the delegation's |
| `actor_inactive` | the human actor is inactive |
| `audience_not_allowed` | audience not in the allowlist |
| `missing_proof` / `invalid_proof` | `agentProof` absent / wrong type or value |

`GET /v1/sts/tokens` returns the log rows: `{id, tenant_id, decision (issued/denied), reason,
agent_id, delegation_id, jti, sub, act, aud, task_id, iat, exp, at}`.

```bash
curl -s -XPOST localhost:8090/v1/sts/token -H 'content-type: application/json' -d '{
  "tenantId":"acme-corp","agentId":"triage-agent","delegationId":"'$ID'",
  "audience":"https://runbooks.acme.internal",
  "agentProof":{"type":"mock_pop","value":"pop:triage-agent"}}' \
  | jq '.expires_in, .claims.sub, .claims.act'
```

---

## 7. Compliance credentials (F20)

A named-standard attestation about an agent (GDPR, HIPAA, SOC2-TypeII, EU-AI-Act-Art50, ...),
issued by an accountable human holding the `compliance_auditor` role. Query is public;
issuance requires the role. **Revocation does not currently check the role** — a known,
tracked gap (unlike provenance credentials in §9, where revoke does check it). See
[Governance credentials](/docs/concepts/identity-and-credentials/) for the concept.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/compliance/credentials` | issue a compliance credential (role-gated) |
| GET | `/v1/compliance/credentials?agent=&standard=&status=` | query credentials (public) |
| POST | `/v1/compliance/credentials/{credential_id}/revoke` | revoke a credential (**not** role-gated — see note above) |
| GET | `/v1/agents/{agent_id}/compliance` | the agent's currently-valid compliance credentials |
| GET | `/v1/agents/{agent_id}/disclosure` | combined compliance + provenance disclosure artifact |

### `POST /v1/compliance/credentials`

```json
{
  "agentId": "securityops-agent",
  "standard": "GDPR",
  "scope": "PII access during containment actions",
  "issuerRef": "entra:acme-corp:oid-1042",
  "evidenceRef": "https://audit-evidence.acme-corp.internal/gdpr-2026",
  "expiresAt": "2027-07-03T00:00:00Z"
}
```

Response (`201`) — the stored record plus the signed Verifiable Credential (VC) (Feature 24):

```json
{
  "credential_id": "uuid",
  "agent_id": "securityops-agent",
  "standard": "GDPR",
  "scope": "PII access during containment actions",
  "issuer_ref": "entra:acme-corp:oid-1042",
  "evidence_ref": "https://audit-evidence.acme-corp.internal/gdpr-2026",
  "issued_at": "2026-07-03T18:00:00Z",
  "expires_at": "2027-07-03T00:00:00Z",
  "status": "valid",
  "revoked_at": null,
  "revocation_reason": null,
  "vc_jwt": "eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDp3ZWI6Li4uIn0...",
  "vc_jti": "uuid"
}
```

`expiresAt` omitted means "no expiry" — modeled internally as a long TTL on the signed VC
(the JWT-VC schema has no "never expires" claim shape), not a separate code path.

### Denial codes

| Code | When |
|---|---|
| `invalid_issuer` | `issuerRef` is not a known employee |
| `inactive_issuer` | issuer employee is inactive |
| `compliance_issuer_not_authorized` | issuer does not hold `compliance_auditor` |
| `missing_standard` | `standard` is empty |
| `not_found` | (revoke) no such `credential_id` |

`GET /v1/agents/{agent_id}/disclosure` response shape:

```json
{
  "agent_id": "securityops-agent",
  "provenance": { "...": "see F25 below, or null if none current" },
  "compliance": [
    { "standard": "GDPR", "scope": "PII access during containment actions", "status": "valid",
      "issued_at": "2026-07-03T18:00:00Z", "expires_at": "2027-07-03T00:00:00Z",
      "issuer_ref": "entra:acme-corp:oid-1042" }
  ],
  "generated_at": "2026-07-04T12:05:00Z"
}
```

---

## 8. Cryptographic verifiability & issuer key history (F24)

The infrastructure both compliance and provenance credentials sign against — not a separate
credential type, but what makes `vc_jwt` on either one independently verifiable.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/issuer/key-history` | the issuer's current + superseded signing keys |
| GET | `/status/{list_id}` | StatusList2021 revocation list (same endpoint delegation VCs use) |
| GET | `/.well-known/did.json` | the issuer's `did:web` DID document |

### `GET /v1/issuer/key-history`

```json
{
  "keys": [
    { "kid": "did:web:agent-idp.agent-idp.svc#key-1", "pub_multibase": "z6Mk...",
      "valid_from": "2026-01-01T00:00:00Z", "valid_until": "2026-06-01T00:00:00Z",
      "superseded_by": "did:web:agent-idp.agent-idp.svc#key-2", "current": false },
    { "kid": "did:web:agent-idp.agent-idp.svc#key-2", "pub_multibase": "z6Mk...",
      "valid_from": null, "valid_until": null, "superseded_by": null, "current": true }
  ]
}
```

A credential signed under a since-rotated key still verifies: the Decentralized Identifier (DID) document lists every
historical key alongside the current one, and `agentdid`'s resolver matches a JWT's `kid`
header against any `verificationMethod` entry, not just the current key.

### Offline verification (no PaloNexus API call)

`agentdid.verify_bundle(vc_jwt, did_document, status_snapshot)` verifies a credential fully
offline from three fetched artifacts — no dependency on agent-idp being reachable:

```python
from agentdid import verify_bundle

claims = verify_bundle(
    vc_jwt,              # the credential's "vc_jwt" field
    did_document,         # GET /.well-known/did.json
    status_snapshot=status_doc,  # GET /status/default
)
```

This same function verifies **both** compliance and provenance credentials with no code
changes between them — the underlying mechanism (`agentdid.issue_vc`'s `extra_subject`
param) is credential-type-agnostic, not hardcoded to one type.

---

## 9. Provenance credentials (F25)

A self-declared attestation of what produced an agent's outputs — base model, training-data
lineage, declared model owner — issued by a distinct `provenance_attestor` role. Query is
public; issuance and revocation require the role. See
[Governance credentials](/docs/concepts/identity-and-credentials/) for the supersession model.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/provenance/credentials` | issue a provenance credential (role-gated); auto-supersedes the agent's prior valid one |
| GET | `/v1/provenance/credentials?agent=&status=` | query credentials (public) |
| POST | `/v1/provenance/credentials/{credential_id}/revoke` | revoke a credential (role-gated) |
| GET | `/v1/agents/{agent_id}/provenance` | the agent's current (valid) provenance credential, or `null` |

### `POST /v1/provenance/credentials`

```json
{
  "agentId": "securityops-agent",
  "baseModel": "claude-sonnet-5",
  "modelVersion": "2026-05-snapshot",
  "trainingDataSources": ["public-web-corpus", "anthropic-hh-rlhf"],
  "watermarkingScheme": "none declared",
  "declaredOwner": "Anthropic",
  "issuerRef": "entra:acme-corp:oid-2091",
  "evidenceRef": "https://model-registry.acme-corp.internal/models/claude-sonnet-5"
}
```

Response (`201`):

```json
{
  "credential_id": "uuid",
  "agent_id": "securityops-agent",
  "base_model": "claude-sonnet-5",
  "model_version": "2026-05-snapshot",
  "training_data_sources": ["public-web-corpus", "anthropic-hh-rlhf"],
  "watermarking_scheme": "none declared",
  "declared_owner": "Anthropic",
  "issuer_ref": "entra:acme-corp:oid-2091",
  "evidence_ref": "https://model-registry.acme-corp.internal/models/claude-sonnet-5",
  "issued_at": "2026-07-04T12:00:00Z",
  "status": "valid",
  "superseded_at": null,
  "superseded_by": null,
  "revoked_at": null,
  "revocation_reason": null,
  "vc_jwt": "eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDp3ZWI6Li4uIn0...",
  "vc_jti": "uuid"
}
```

Issuing a second credential for the same agent marks the prior one `superseded` in the same
response cycle — no separate call needed. Revoking requires `issuerRef` in the request body,
same role check as issuance:

```json
{ "issuerRef": "entra:acme-corp:oid-2091", "reason": "false base-model declaration" }
```

### Denial codes

| Code | When |
|---|---|
| `invalid_issuer` | `issuerRef` is not a known employee |
| `inactive_issuer` | issuer employee is inactive |
| `provenance_issuer_not_authorized` | issuer does not hold `provenance_attestor` |
| `missing_base_model` / `missing_declared_owner` | required field is empty |
| `not_found` | (revoke) no such `credential_id` |

**Supersession vs. revocation:** issuing a new credential for an agent that already has a
`valid` one flips the prior record to `superseded` — a plain store update, never a
revocation-log entry, never a cascade suspend. Only an explicit revoke of a *required*
credential (a governed agent with `require_provenance_credential: true`) feeds the F4
revocation cascade, with reason code `provenance_credential_revoked`.

---

## See also

- [Connect agents to enterprise authority](/docs/concepts/enterprise-iam/) — the concept and the F1–F6 story
- [Governance credentials](/docs/concepts/identity-and-credentials/) — the compliance/provenance
  concept and the cryptographic-verifiability story (F20, F24, F25)
- [HTTP API](/docs/reference/http-api/) — the control-plane, egress, and agent-idp onboarding APIs
- **Requirements docs** in the platform repo (`docs/requirements/`): `01-directory-sync.md`
  (F1), `02-employee-identity.md` (F2), `03-agent-ownership-governance.md` (F3),
  `04-revocation-cascade.md` (F4), `05-human-authority-delegation.md` (F5),
  `06-agent-sts-token-exchange.md` (F6), `20-compliance-credential-vc.md` (F20),
  `24-cryptographically-verifiable-credentials.md` (F24),
  `25-provenance-credential-vc.md` (F25)
