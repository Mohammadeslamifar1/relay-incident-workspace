# Five-minute demonstration

**0:00 — The problem.** “During an incident, context is spread across runbooks and past incidents. Relay brings relevant evidence into a reviewable investigation.” Open the demo workspace and explain that all sample incidents are fictional.

**0:40 — The incident.** Open **Checkout latency after release**. Point out observed symptoms and explain that a recent release is a clue, not proof of causality.

**1:10 — The investigation.** Click **Run investigation**. Explain the default offline extraction mode. Show the Retrieve → Inspect → Compose → Validate trace and open an E1 reference. Compare the hypothesis to the saved source passage.

**2:00 — Human control.** Approve one proposal with a rationale and reject another. Explain that approval records a decision and executes nothing. Export the Markdown brief. Move the incident through monitoring to resolved and show the timeline.

**3:00 — Your own knowledge.** Open the knowledge base. Add a short runbook, show the passage count, and explain content deduplication. A custom incident can now use it. Mention that historical snapshots survive source deletion.

**3:40 — Measured behavior.** Run the Quality lab. Explain recall@3, MRR, abstention and citation validity. Show an out-of-domain case. State clearly that eight regression cases do not prove general LLM accuracy.

**4:20 — Engineering depth.** Discuss tenant-scoped queries, stale-write rejection, idempotent jobs, single-worker failure recovery and the difference between a validated citation ID and a supported claim.

**4:50 — Next step.** “I would expand the held-out evaluation set and compare lexical retrieval with hybrid retrieval before adding complexity. For deployment at scale, I would add leased worker claims, centralized limits, SSO and observability.”
