---
title: Deploy an Agent
description: Package a LangGraph agent as a container, deploy the default fully-governed Deployment (agent + egress sidecar + shared identity volume + proxy-only NetworkPolicy), register it, and wire the model broker.
sidebar:
  order: 2
---

This is the step-by-step path to running a LangChain/LangGraph agent as a governed
workload. Every step maps to a template in the
[`deploy-langgraph-agent-to-palonexus` skill](/docs/sdk/palonexus-agent/), which
ships the exact files referenced below.

## 1. Package the agent as a container

Default to a **custom FastAPI/uvicorn container** wrapping a compiled `StateGraph`:
lightweight, no LangSmith license, and easy to inject the egress middleware. (Use
the LangGraph Agent Server only if you need managed threads/durable runs and hold
a LangSmith Enterprise license; its health endpoint is `GET /ok` on port `8000`.)

Start from the skill's `templates/Dockerfile`:

```dockerfile
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
# requirements.txt pins: langgraph, langchain, langgraph-checkpoint-postgres,
#   fastapi, uvicorn[standard], httpx, opentelemetry-sdk, opentelemetry-exporter-otlp
COPY . .
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin appuser
USER 10001
EXPOSE 8000
# app:app must expose GET /readyz and GET /healthz, call checkpointer.setup() on
# startup, and mount the palonexus egress middleware on the agent.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t ghcr.io/palonexus/triage-agent:dev .
```

:::caution[Use a persistent checkpointer]
The graph **must** use `AsyncPostgresSaver`, not an in-memory saver — durable
threads and the human-in-the-loop approval pause both require it. Run
`await checkpointer.setup()` once on startup. No provider API keys belong in the
image.
:::

## 2. The default fully-governed Deployment

The skill's `templates/deployment.yaml` is the **default, fully-governed shape** —
use it as-is. It ships four things that together make egress inescapable:

1. the **agent** container,
2. an **egress-sidecar** container (the agent's model-egress endpoint),
3. a shared **`palonexus-identity` emptyDir** the agent writes its identity to and
   the sidecar reads,
4. the **`palonexus.io/agent: "true"`** pod label that the admission webhook keys on.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: triage-agent
  namespace: apps                      # agents live in the apps namespace
  labels: { app: triage-agent }
spec:
  replicas: 2
  selector: { matchLabels: { app: triage-agent } }
  template:
    metadata:
      labels:
        app: triage-agent
        palonexus.io/agent: "true"     # admission webhook keys on this
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile: { type: RuntimeDefault }
      volumes:
        - name: palonexus-identity     # shared agent -> sidecar identity file
          emptyDir: {}
      containers:
        - name: agent
          image: ghcr.io/palonexus/triage-agent:dev
          ports: [{ name: http, containerPort: 8000 }]
          env:
            - { name: PALONEXUS_AGENT_NAME, value: "triage-agent" }
            - { name: PALONEXUS_EGRESS_URL, value: "http://egress.palonexus.svc.cluster.local" }
            - { name: PALONEXUS_TOKEN_PATH, value: "/var/run/secrets/palonexus/token" }
            # --- network-layer egress: route everything through the proxy / sidecar ---
            - { name: PALONEXUS_USE_EGRESS_SIDECAR, value: "1" }
            - { name: PALONEXUS_BROKER_URL, value: "http://localhost:8788" }   # model calls -> sidecar
            - { name: PALONEXUS_IDENTITY_FILE, value: "/var/run/palonexus-identity/identity.json" }
            - { name: LANGCHAIN_OPENAI_TCP_KEEPALIVE, value: "0" }
            - { name: HTTPS_PROXY, value: "http://egress-proxy.palonexus.svc.cluster.local" }
            - { name: HTTP_PROXY,  value: "http://egress-proxy.palonexus.svc.cluster.local" }
            - { name: NO_PROXY, value: "agent-idp.agent-idp.svc,egress.palonexus.svc,localhost,127.0.0.1,kubernetes.default.svc" }
            - { name: DATABASE_URI, valueFrom: { secretKeyRef: { name: triage-db, key: uri } } }
            # NOTE: no provider API keys here — model calls go via the broker.
          volumeMounts:
            - { name: palonexus-identity, mountPath: /var/run/palonexus-identity }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          readinessProbe: { httpGet: { path: /readyz, port: http } }   # /ok for the Agent Server
          livenessProbe:  { httpGet: { path: /healthz, port: http } }
        # --- egress identity sidecar: the agent's model-egress endpoint ---
        - name: egress-sidecar
          image: ghcr.io/palonexus/egress-sidecar:dev
          env:
            - { name: REAL_BROKER_URL, value: "http://model-broker.palonexus.svc.cluster.local:8080" }
            - { name: EGRESS_PROXY_URL, value: "http://egress-proxy.palonexus.svc.cluster.local" }
            - { name: PALONEXUS_IDENTITY_FILE, value: "/var/run/palonexus-identity/identity.json" }
          ports: [{ name: sidecar, containerPort: 8788 }]
          securityContext:
            runAsUser: 10002
            runAsNonRoot: true
            allowPrivilegeEscalation: false
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: palonexus-identity, mountPath: /var/run/palonexus-identity, readOnly: true }
      terminationGracePeriodSeconds: 120   # let in-flight runs checkpoint and drain
```

The same template includes the **Service** and the **ingress HTTPRoute**. The
HTTPRoute tags the registry service name the control plane resolves — identical to
the `orders`/`echo` demo routes:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: triage-agent, namespace: apps }
spec:
  parentRefs: [{ name: edge, namespace: palonexus }]
  rules:
    - matches: [{ path: { type: PathPrefix, value: /agents/triage } }]
      filters:
        - type: RequestHeaderModifier
          requestHeaderModifier:
            set: [{ name: X-Palonexus-Service, value: triage-agent }]
      backendRefs: [{ name: triage-agent, port: 80 }]
```

Why the sidecar plus `HTTPS_PROXY` rather than just one of them: LangChain's OpenAI
client talks to its `base_url` and does **not** reliably honour the process proxy
env, so a `ChatOpenAI` call would silently escape `/authz`. Model calls go through
the sidecar (a `base_url` the client can't strip); everything else goes through
`HTTPS_PROXY`; both land at the same `/authz`. Full rationale in
[Credential-safe action enforcement](/docs/develop/egress-enforcement/).

## 3. The proxy-only NetworkPolicy

Without it, the sidecar and middleware are advisory. The skill's
`templates/networkpolicy.yaml` is **proxy-only egress lockdown** — the enforcement
teeth. An agent pod may egress only to DNS, agent-idp (identity bootstrap, which
must bypass the proxy), the control-plane egress proxy, and its own checkpointer DB:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: triage-agent-egress, namespace: apps }
spec:
  podSelector: { matchLabels: { app: triage-agent } }
  policyTypes: [Egress]
  egress:
    - to: [{ namespaceSelector: {}, podSelector: { matchLabels: { k8s-app: kube-dns } } }]
      ports: [{ protocol: UDP, port: 53 }, { protocol: TCP, port: 53 }]
    - to: [{ namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: agent-idp } } }]
      ports: [{ protocol: TCP, port: 8090 }]                  # identity bootstrap (no VP yet)
    - to: [{ namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: palonexus } } }]
      ports: [{ protocol: TCP, port: 80 }, { protocol: TCP, port: 9092 }]
    - to: [{ podSelector: { matchLabels: { app: triage-db } } }]
      ports: [{ protocol: TCP, port: 5432 }]
```

:::caution[Pod-port gotcha]
NetworkPolicy enforces the **pod** port (post-DNAT), not the Service port. The
`egress-proxy` Service is `:80` but the control-plane pod serves the proxy on
`9092` — so allow **both** `80` (the egress decision alias) and `9092` (the proxy
pod port). The `egress-enforcement` component handles this for the platform agents.
:::

For the four platform agents, prefer the **`egress-enforcement` +
`egress-sidecar` + `agent-admission`** Kustomize components over hand-rolling
these — they supply the proxy, flip each agent's egress policy to proxy-only,
stamp the proxy env, and reject any `palonexus.io/agent=true` pod whose agent
isn't registered + provisioned at the IdP. See
[self-hosting](/docs/operations/self-hosting/) for the prerequisites (Gateway API
CRDs + Envoy Gateway) and `kubectl apply -k`.

## 4. Register the agent and its egress allowlist

Use the skill's `templates/register-services.sh` (or, in prod, a GitOps reconciler
/ `Agent` CRDs). Register three kinds of entry against the mgmt API on `:8181`:

```bash
MGMT="${PALONEXUS_MGMT_URL:-http://localhost:8181}"
reg() { curl -fsS -X POST "$MGMT/v1/registry/services" -H 'Content-Type: application/json' -d "$1"; }

# The agent itself. Callers must hold scope agent:triage:invoke. The Allow* lists
# are its egress allowlist; budget caps token/call rate.
reg '{
  "name":"triage-agent","upstream":"triage-agent.apps.svc.cluster.local:80","owner":"sre",
  "requireScope":"agent:triage:invoke","kind":"agent",
  "allowModels":["model-openai"],"allowTools":["runbooks-api"],"allowAgents":[],
  "budget":{"tokensPerHour":2000000,"callsPerHour":500}}'

# A tool it may reach.
reg '{
  "name":"runbooks-api","upstream":"runbooks.apps.svc.cluster.local:8080","owner":"sre",
  "kind":"tool","dataClass":"internal"}'

# The model broker (holds the provider key; agents never do).
reg '{
  "name":"model-openai","upstream":"model-broker.palonexus.svc.cluster.local:8080",
  "owner":"platform","kind":"model"}'
```

`MayReach` is deny-by-default: a target not on the matching `Allow*` list (or an
unknown kind) returns false. Registry mutations are themselves audited — expect a
`registry.upsert` record. Full schema and the `Allow*` / `Budget` semantics live in
[Budgets and allowlists](/docs/develop/budgets-and-allowlists/) and the
[HTTP API reference](/docs/reference/http-api/).

:::note[dataClass: internal vs regulated]
`runbooks-api` is registered `dataClass: internal` because its fine-grained,
human-approved DID/VC enforcement is **server-side** — the proxy can only do the
coarse allowlist gate, so the fine gate happens at the resource. Targets with **no**
server-side gate (e.g. `scale_deployment`) stay `regulated`, so the proxy *holds*
them for human approval. See [Authority delegation](/docs/develop/delegations-and-approvals/).
:::

## 5. The model broker

The model broker is a thin LiteLLM proxy holding the real provider key (from a
Secret) and metering every completion. Agents call it with a **logical** model
name and get an OpenAI-compatible API; the broker maps the logical name to the
real model id and attaches the key.

| Logical name (registry) | Real model | Use |
|---|---|---|
| `model-openai` | `openai/gpt-4o-mini` | cheap default (demo) |
| `model-openai-large` | `openai/gpt-4o` | stronger model |

The agent's LLM client points at the broker (or, with the sidecar, at the localhost
sidecar) and stamps the actor header:

<!-- no-doctest: live-model illustration — `ChatOpenAI(...)` wiring, not offline-runnable -->
```python
ChatOpenAI(base_url=BROKER_URL, model="model-openai",
           api_key=BROKER_API_KEY,                       # never an OpenAI key
           default_headers={"x-palonexus-actor": AGENT_NAME})
```

On each call: agent → egress proxy (`/authz` decides *may `<agent>` reach
`model-openai`?* via `allowModels` + budget) → broker maps `model-openai` →
`openai/gpt-4o-mini`, attaches the key → OpenAI → on success the broker POSTs
`/v1/usage {agent, model, tokens, costUsd}` to the control plane, feeding the
budget meter and the `palonexus_token_usage_total` / `palonexus_agent_cost_usd_total`
metrics.

Deploy the broker Secret out-of-band (it is gitignored) and register the broker:

```bash
cp deploy/kustomize/base/model-broker/secret.example.yaml \
   deploy/kustomize/base/model-broker/secret.yaml          # edit -> OPENAI_API_KEY
kubectl apply -f deploy/kustomize/base/model-broker/secret.yaml
PALONEXUS_MGMT_URL=http://localhost:8181 ./model-broker/register.sh
```

## 6. Verify

- [ ] Pod becomes Ready on its health probe; in-flight runs survive a rollout.
- [ ] **Ingress:** a call to the route with no/invalid token is denied; a valid
      token with the right scope is allowed (check the audit record).
- [ ] **Egress allowlist:** the agent **cannot** reach a model/tool/peer not in its
      `Allow*` set (`403` + an `egress.proxy` `allow=false` audit row + a metric).
- [ ] **NetworkPolicy:** the pod cannot egress anywhere except the proxy
      (`palonexus:9092`) + agent-idp + DNS — a direct provider call must fail.
- [ ] **No provider API key** exists in the pod spec or image.

```bash
curl -s localhost:8181/v1/audit?limit=10           # recent hash-chained records
curl -s localhost:8181/v1/audit/verify             # {"ok":true,"brokenAtSeq":-1}
curl -s localhost:8181/metrics | grep palonexus_   # decisions, token usage, cost
```

Once it is registered and provisioned, the agent appears in the **Agent registry**
(`/agents`) alongside every other governed workload:

![PaloNexus Agent registry listing governed agents as cards, each showing the agent name, role, did:key identifier, granted capabilities and a provisioned status badge](/docs/screenshots/agent-registry.png)

*The `/agents` registry — every authority-bound agent with its identity (`did:key`),
delegated access and a provisioned status badge. A freshly deployed agent shows here
with its capabilities once `register` + `provision` succeed.*

Next: [Credential-safe action enforcement](/docs/develop/egress-enforcement/) explains how each
outbound call actually traverses `/authz`.
