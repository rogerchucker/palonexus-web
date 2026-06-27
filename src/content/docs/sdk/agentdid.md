---
title: agentdid — DID & Verifiable Credentials
description: API reference for the agentdid Python package — Ed25519 keys, did:web/did:key, JWT-VC issuance/verification, Verifiable Presentations, delegation chains, challenge-response, revocation, and the DID Resolver.
sidebar:
  order: 2
---

`agentdid` is the cryptographic foundation for **AgentDIDs + Verifiable
Credentials** on PaloNexus. It is a stand-alone, src-layout Python package
(`agentdid/`) with no platform dependencies, imported by agent-idp, the agents,
and `runbooks-api`. All crypto is real and tested (47 tests, no network).

```python
from agentdid import (
    generate_keypair, did_for, did_key_for, build_did_document, Resolver,
    issue_vc, verify_vc, build_vp, verify_vp, verify_delegation_chain,
    make_challenge, respond_challenge, verify_challenge, state_commitment,
    enforce_capability, is_revoked,
)
```

Dependencies: `cryptography` (Ed25519), `PyJWT[crypto]` (JWT-VC EdDSA), `httpx`
(network DID resolution — unused in test mode). `__version__ = "0.1.0"`.

## Keys — Ed25519

Public keys use the W3C `Ed25519VerificationKey2020` convention:
`multibase(base58btc, 0xed01 ‖ raw_ed25519_pubkey)` — i.e. the 32-byte raw key is
prefixed with the `ed25519-pub` multicodec varint (`0xed 0x01`) and base58btc
encoded with a leading `z`. Private keys are base64 of the 32-byte raw seed.

| Signature | Purpose |
|---|---|
| `generate_keypair() -> tuple[str, str]` | Ed25519 keypair → `(priv_b64, pub_multibase)`. `priv_b64` is base64 of the 32-byte seed; `pub_multibase` is the `z…` form. |
| `pub_to_multibase(pub: Ed25519PublicKey) -> str` | Public key object → `z…` multibase. |
| `multibase_to_pub(mb: str) -> Ed25519PublicKey` | Multibase → public key object (validates the `0xed01` prefix and 32-byte length). |
| `multibase_to_raw(mb: str) -> bytes` | Multibase → the 32 raw key bytes. |
| `raw_to_multibase(raw: bytes) -> str` | 32 raw bytes → `z…` multibase. |
| `priv_from_b64(b64: str) -> Ed25519PrivateKey` | Decode a `priv_b64` seed to a private-key object. |
| `b58encode(b: bytes) -> str` / `b58decode(s: str) -> bytes` | base58btc (Bitcoin alphabet) helpers. |

```python
from agentdid import generate_keypair, did_key_for

priv_b64, pub_mb = generate_keypair()
agent_did = did_key_for(pub_mb)     # "did:key:z…" — self-certifying, no registration
```

## DIDs — `did:web` (issuer) + `did:key` (agents)

Two methods: `did:web` is the network-resolved issuer/root (rotatable);
`did:key` is the self-certifying agent DID (the DID *is* the key).

| Signature | Purpose |
|---|---|
| `did_for(name: str, host=DEFAULT_HOST) -> str` | The agent's `did:web`: `did:web:<host>:agents:<name>`. |
| `did_key_for(pub_multibase: str) -> str` | The agent DID for an Ed25519 key: just `"did:key:" + pub_multibase`. |
| `kid_for(did: str) -> str` | Default verificationMethod id / JWT `kid`. `did:key:z…` → `…#z…` (fragment repeats the multibase); everything else → `<did>#key-1`. Used internally by `issue_vc`/`build_vp`/`respond_challenge`. |
| `build_did_document(did, pub_multibase, service_endpoint, capabilities) -> dict` | W3C **did:web** DID Document: vm id `<did>#key-1` (`Ed25519VerificationKey2020`), `authentication`+`assertionMethod` referencing it, one `AgentService` service entry, and `metadata.capabilities`. (did:key docs are synthesized by the resolver, not built here.) |
| `ROOT_DID` | `"did:web:agent-idp.agent-idp.svc"` — the issuer/controller of all agent DIDs. |
| `DEFAULT_HOST` | `"agent-idp.agent-idp.svc"` — the default did:web host. |

## Resolver

Maps a DID to its DID Document. `did:key` is resolved offline (the doc is
synthesized from the multibase); `did:web` is fetched over HTTP(S), with a dev
exception allowing plain `http` for `*.svc` / `*.svc.cluster.local` hosts.

| Signature | Purpose |
|---|---|
| `Resolver(registry_base_url=None, *, docs=None, resolve_fn=None, http_client=None)` | Construct a resolver. `registry_base_url` re-points `did:web` resolution at one origin (the IdP) while keeping the did:web path. `docs={did: doc}` and `resolve_fn` are test/in-memory backends checked before the network. |
| `.resolve(did) -> dict` | Return the DID Document. `did:key` → synthesized locally (no network); `docs`/`resolve_fn` checked next; otherwise fetched. Tolerates a `#fragment`/kid suffix. |
| `.public_key(did_or_kid) -> Ed25519PublicKey` | Resolve the doc, find the matching verificationMethod, decode its `publicKeyMultibase`. Accepts a bare DID or a `<did>#kid`. |
| `.add_document(did, doc) -> None` | Register an in-memory DID Document at runtime (test mode). |
| `did_web_to_url(did: str) -> str` | The DID-Document URL a `did:web` resolves to: root `did:web:host` → `…/.well-known/did.json`; pathful `did:web:host:a:b` → `…/a/b/did.json`. |

```python
from agentdid import Resolver, ROOT_DID, build_did_document, generate_keypair

issuer_priv, issuer_pub_mb = generate_keypair()
issuer_doc = build_did_document(ROOT_DID, issuer_pub_mb,
                                service_endpoint="http://agent-idp.agent-idp.svc",
                                capabilities=[])
# Test mode: in-memory doc for the did:web issuer; agent did:key resolves offline.
resolver = Resolver(docs={ROOT_DID: issuer_doc})
```

## Verifiable Credentials (JWT-VC, EdDSA)

| Signature | Purpose |
|---|---|
| `issue_vc(issuer_did, issuer_priv_b64, subject_did, vc_type, capability, *, ttl_s, parent_jwt=None) -> str` | Issue a JWT-VC signed EdDSA. Header `{alg:"EdDSA", kid:kid_for(issuer_did), typ:"vc+jwt"}`. Payload carries `iss/sub/jti(uuid4)/iat/exp` and `vc{type:["VerifiableCredential", <vc_type>], credentialSubject{id, capability?}, parent?}`. `capability=None` → a membership VC; `parent_jwt` embeds the parent VC for delegation chains. |
| `verify_vc(vc_jwt, resolver, *, status_url=None) -> dict` | Resolve the issuer key via `kid`, verify EdDSA + `exp`, require the `kid` issuer DID == the `iss` claim. If `status_url` is given, raise if the VC `jti` is revoked. Returns the claims; raises on any failure. |

`vc_type` is the specific type appended after `VerifiableCredential` —
`"MembershipCredential"`, `"CapabilityCredential"`, or `"DelegationCredential"`.
Capability shape:

```python
cap = {
    "action": "runbook:read",
    "resource": "runbooks-api:/runbooks/*",          # trailing /* glob supported
    "constraints": {
        "notBefore": "2026-06-21T00:00:00Z",          # epoch or ISO-8601
        "notAfter":  "2026-06-21T00:05:00Z",
        "maxCalls": 5,                                  # NOT enforced by enforce_capability
        "execContext": {"ticketSource": "incy"},
    },
}
```

## Verifiable Presentations

| Signature | Purpose |
|---|---|
| `build_vp(holder_did, holder_priv_b64, vc_jwts, *, audience, nonce, ttl_s=300) -> str` | Wrap `vc_jwts` in a holder-signed JWT-VP bound to `audience` + `nonce`. |
| `verify_vp(vp_jwt, resolver, *, audience, nonce) -> dict` | Verify the holder signature + `aud` + `nonce`; require the `kid` to match the holder `iss`. Returns `{"holder_did": str, "vc_jwts": list}`. Raises on mismatch. |

## Delegation chains

A leaf delegation VC embeds its parent under `vc.parent`. Verification walks the
chain leaf → … → root.

| Signature | Purpose |
|---|---|
| `verify_delegation_chain(leaf_vc_jwt, resolver, *, root_did, action, resource, status_url=None, max_depth=16) -> bool` | Walk the embedded `parent` links, verifying each link's signature, that the chain terminates at a `CapabilityCredential` whose `iss == root_did`, and that each child capability ⊆ its parent (same `action`; child `resource` covered by the parent's trailing-`/*` glob; child time window within the parent's; child `execContext` ⊇ parent's; each child's `iss` == its parent's `sub`, so only the delegatee may sub-delegate). Also requires the leaf to authorize the requested `action`/`resource`. Returns `True`/`False` (never raises). |

> Phase-1 constraint: the parent VC must be **embedded** under `vc.parent`. A bare
> `jti` reference is rejected (no second registry round trip).

## Capability enforcement

| Signature | Purpose |
|---|---|
| `enforce_capability(capability, *, action, resource, context) -> bool` | Pure, stateless check: `action` equals; `resource` glob-matches (trailing `/*`); now within `constraints.notBefore`/`notAfter` (epoch or ISO-8601); `constraints.execContext` ⊆ `context`. **`maxCalls` is NOT enforced here** — it is a stateful rate cap the verifier must track. |
| `resource_matches(pattern, resource) -> bool` | Trailing-`/*` glob match used by `enforce_capability` and the delegation-subset check. |

## Challenge-response (live-state proof)

Proves the agent is the live holder in the expected execution state at call time —
defeating stolen/replayed credentials. The signature is EdDSA over the ASCII
string `f"{nonce}.{state_commitment}"`.

| Signature | Purpose |
|---|---|
| `make_challenge(required_state: list) -> dict` | The verifier issues a challenge: `{"nonce": os.urandom(16).hex(), "required_state": [...]}`. |
| `respond_challenge(holder_priv_b64, holder_did, nonce, state) -> dict` | The holder signs and returns `{"state", "state_commitment", "sig", "kid"}` (`kid = kid_for(holder_did)`). |
| `verify_challenge(resp, holder_did, resolver, *, nonce, constraints) -> bool` | Resolve the holder key; verify the signature over `nonce.state_commitment`; recompute and match the commitment; check the state satisfies `constraints` (`execContext` ⊆ state; every name in `constraints["required_state"]`/`["required"]` present and non-empty). |
| `state_commitment(state: dict) -> str` | SHA-256 hex over canonical JSON (sorted keys, no whitespace). |

<!-- no-doctest: illustrative fragment — uses `priv_b64` from a neighbouring block (not standalone-runnable) -->
```python
from agentdid import make_challenge, respond_challenge, verify_challenge

challenge = make_challenge(["active_ticket_id"])                 # verifier side
resp = respond_challenge(priv_b64, agent_did, challenge["nonce"],
                         {"active_ticket_id": "INC-123", "ticketSource": "incy"})
ok = verify_challenge(resp, agent_did, resolver,
                      nonce=challenge["nonce"],
                      constraints={"required_state": ["active_ticket_id"],
                                   "execContext": {"ticketSource": "incy"}})
```

## Revocation

| Signature | Purpose |
|---|---|
| `is_revoked(vc_id, status_url, *, fetch=None) -> bool` | Is the VC `jti` revoked per the StatusList at `status_url`? `fetch` is an injectable `url -> dict` (tests); it defaults to an httpx GET. **A missing list or fetch error → not revoked** (fail-open for demo availability). |

The IdP serves `GET /status/{list_id}` in one of two shapes (both accepted):

```json
{ "revoked": ["<vc_jti>", "<vc_jti>"] }
```

A VC is revoked iff its `jti` is in `revoked`. A StatusList2021 bitstring form
(big-endian, MSB-first, with an optional `jti → bit index` map) is also accepted.

## Worked example — issue → present → verify

A complete offline flow (test mode, no network): an issuer issues a Capability VC
to an agent `did:key`; the agent presents it; the verifier checks it.

```python
from agentdid import (
    generate_keypair, did_key_for, ROOT_DID, build_did_document, Resolver,
    issue_vc, build_vp, verify_vp, verify_vc,
)

# 1. Keys. Issuer is the did:web root; the agent is a did:key subject.
issuer_priv, issuer_pub_mb = generate_keypair()
agent_priv,  agent_pub_mb  = generate_keypair()
agent_did = did_key_for(agent_pub_mb)        # did:key:z…  (offline, self-certifying)

# 2. A resolver primed with the issuer's did:web document.
issuer_doc = build_did_document(ROOT_DID, issuer_pub_mb,
                                service_endpoint="http://agent-idp.agent-idp.svc",
                                capabilities=[])
resolver = Resolver(docs={ROOT_DID: issuer_doc})

# 3. Issue a Capability VC: agent may runbook:read this incident's runbook, 5 min.
cap = {"action": "runbook:read",
       "resource": "runbooks-api:/runbooks/db-failover",
       "constraints": {"execContext": {"task": "INC-123", "ticketSource": "incy"}}}
vc = issue_vc(ROOT_DID, issuer_priv, agent_did,
              "CapabilityCredential", cap, ttl_s=300)

# 4. The agent wraps it in a presentation bound to the verifier + a nonce.
vp = build_vp(agent_did, agent_priv, [vc], audience="runbooks-api", nonce="abc123")

# 5. The verifier checks the presentation, then each VC.
pres = verify_vp(vp, resolver, audience="runbooks-api", nonce="abc123")
for vc_jwt in pres["vc_jwts"]:
    claims = verify_vc(vc_jwt, resolver,
                       status_url="http://agent-idp.agent-idp.svc/status/default")
    print("verified:", claims["vc"]["credentialSubject"]["capability"]["action"])
# -> verified: runbook:read
```

For a delegation, pass `issue_vc(..., parent_jwt=parent_vc)` and verify the whole
chain with `verify_delegation_chain(leaf, resolver, root_did=ROOT_DID,
action=..., resource=..., status_url=...)`.

## See also

- [palonexus_agent scaffold](/docs/sdk/palonexus-agent/) — how the runtime consumes these primitives.
- [Egress proxy & sidecar](/docs/sdk/egress-proxy-client/) — VP-on-every-call enforcement.
