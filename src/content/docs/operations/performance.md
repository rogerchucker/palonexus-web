---
title: Performance — is the egress decision a bottleneck?
description: The /authz egress decision is on every agent action's critical path. This is the benchmark proving the decision logic costs microseconds — never the bottleneck — plus the per-stage latency metric and the method for a live p99.
sidebar:
  order: 9
---

Every agent action — model call, tool call, agent→agent hop — passes through the control
plane's egress `/authz` decision (`control-plane/internal/authz/authz.go` `serveEgress`). So a
fair question for any evaluator is: **does governing every outbound call slow agents down?**

**Verdict: no, at the decision layer.** The pure in-process decision costs **~2.9 microseconds**
— roughly **350,000 decisions/sec per core** — and is flat across allow, deny, needs-approval,
and regulated-allow verdicts. That is 3–4 orders of magnitude cheaper than the network calls it
governs (an LLM call is tens-to-hundreds of ms), so the decision cannot be the bottleneck. The
only latency that matters comes from the *optional* network hops the decision makes (OPA veto,
agent-idp delegation check) and VP crypto — isolated and bounded below.

## Tier 1 — decision micro-benchmark (hermetic, reproducible)

`control-plane/internal/authz/bench_test.go` drives the real `serveEgress` handler (identity
verify → registry ×2 → `EvaluateEgress` inline+budget+delegation → audit append) with in-memory
stores and an in-memory delegation fake — no OPA, no agent-idp, no network. Run it:

```bash
make bench-egress
# or: cd control-plane && go test ./internal/authz -run '^$' \
#       -bench BenchmarkServeEgress -benchmem -benchtime=1000000x -count=5
```

### Results (Apple M3 Max, Go 1.25, darwin/arm64)

| Verdict path | ns/op | ≈ decisions/sec/core | allocs/op |
|---|---:|---:|---:|
| Allow (public model) | ~2,880 | ~347,000 | 23 |
| Deny (not allowlisted) | ~2,660 | ~376,000 | 19 |
| NeedsApproval (regulated, no delegation) | ~2,880 | ~347,000 | 23 |
| RegulatedAllow (regulated, valid delegation) | ~2,890 | ~346,000 | 24 |
| AllowWithBudget (budget gate read every call) | ~2,940 | ~340,000 | 23 |

These **include** the test-harness response-recorder allocation per iteration, so they are a
**conservative upper bound** on the real decision cost. The budget meter adds ~100ns (O(1)
rolling window); the per-stage instrumentation adds ~185ns (3 histogram observations, 0 extra
allocs). The verdict does not change the cost — deny-by-default is as cheap as allow, so an
adversary cannot make the decision expensive by forcing denies.

## Per-stage latency — where the time goes

The control plane emits `palonexus_authz_stage_duration_seconds{stage}` for the egress decision,
so you can see *which* stage costs time directly in Grafana:

| `stage` | Covers | Typical cost |
|---|---|---|
| `identity` | token verify (header/JWKS) + optional VP Ed25519 verify | µs (header) — sub-ms (VP crypto) |
| `registry` | caller + target lookups | µs (in-memory) |
| `policy` | allowlist + budget + **delegation** + OPA | µs in-process; **ms when the delegation/OPA network hop is wired** |

Query: `histogram_quantile(0.99, sum by (le, stage) (rate(palonexus_authz_stage_duration_seconds_bucket[5m])))`.
This answers "did the delegation check cost the decision?" without guesswork.

## Tier 2 — end-to-end server under load (record at launch)

Tier 1 proves the logic is cheap; Tier 2 validates the real HTTP server under concurrency and
confirms the `palonexus_authz_duration_seconds` histogram. Run against the built binary (the dev
overlay = OIDC off = a clean control-plane-only number):

```bash
make build && ./bin/control-plane &      # :9191 decision plane
# register a triage agent + a model target first (deploy/compose/seed/register-services.sh)
hey -z 30s -c 50 -m POST \
    -H 'X-Palonexus-Actor: triage' \
    -H 'X-Palonexus-Service: model-openai' \
    -H 'X-Palonexus-Target-Kind: model' \
    http://localhost:9191/authz
```

Record p50/p95/p99 + RPS, then repeat against the **full stack** (OPA + agent-idp wired) for the
realistic regulated-path number including the two network hops — the honest "all gates on"
latency. Expectation from Tier 1: the server is network/scheduler-bound, not CPU-bound, well
before the decision logic shows up.

## Known cost surfaces (honest accounting)

| Surface | Cost | Mitigation |
|---|---|---|
| OPA veto (`OPA_URL` set) | 1 HTTP round-trip per vetoed decision | co-locate OPA as a sidecar (the deploy shape); keep-alive |
| agent-idp delegation check | 1 HTTP round-trip | only on `dataClass: regulated` targets; cache valid-delegation TTL |
| VP verification (`AGENT_IDENTITY_MODE=vc`) | Ed25519 verify per presented VP | header mode for non-regulated paths; VP where spoofing matters |
| Budget meter | ~100ns, O(1) | none needed |

The benchmark isolates the first three to **zero** (header identity, no OPA, in-memory
delegation) to show the floor; this table is the ceiling each adds. See also
[Observability](/docs/operations/observability/) for the live dashboards and alerts on
`palonexus_authz_duration_seconds`.
