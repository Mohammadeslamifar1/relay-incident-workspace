from datetime import timedelta

from relay.db import Audit, Incident, now
from relay.retrieval import add_document
from sqlalchemy.orm import Session

DOCUMENTS = [
    {
        "title": "Checkout latency & connection pools",
        "service": "checkout-api",
        "kind": "runbook",
        "content": """# Checkout latency & connection pools
Owner: Commerce platform · Reviewed: 2026-09-28

## Symptoms
Checkout p95 latency above 2 seconds with database connection wait time increasing can indicate connection pool exhaustion. A deploy that increases worker concurrency without adjusting the pool budget is a known trigger.

## Investigation
Compare active PostgreSQL connections, pool wait time, worker concurrency, and checkout request latency against the last known healthy release. Check the deployment timestamp before attributing causality.

## Mitigation
Review the last checkout deployment and prepare a rollback plan with the incident commander. Confirm the target release and connection budget before any rollback. Do not increase the pool limit beyond the database maximum connections.

## Verification
Observe checkout p95 latency below 500 ms and connection utilization below 70% for 15 minutes. Confirm payment success rate has recovered before resolving the incident.""",
    },
    {
        "title": "Checkout pool exhaustion · previous incident",
        "service": "checkout-api",
        "kind": "postmortem",
        "content": """# Previous incident: checkout connection exhaustion
Historical example, not evidence of the current root cause.
Checkout workers were increased from 4 to 12 in a release. Each worker opened a separate connection pool, exhausting the shared PostgreSQL connection budget. Checkout p95 latency reached 3.2 seconds while database CPU remained normal.
The incident commander approved a rollback to the previous worker configuration. Connection wait time fell within 6 minutes.
Follow-up: enforce a connection budget in release review and alert on pool wait time. Compare current metrics and deployment changes before applying this historical mitigation.""",
    },
    {
        "title": "Payment webhook delivery",
        "service": "payments-worker",
        "kind": "runbook",
        "content": """# Payment webhook delivery
Webhook delivery retries can cause queue backlog when the downstream payment provider returns HTTP 429 responses.
Inspect the webhook queue depth, oldest message age, provider response codes, and retry interval. Confirm event idempotency keys are present before replaying messages.
Review the retry backoff configuration with the payments owner. Use exponential backoff with jitter and honor Retry-After. Replaying an entire queue without a deduplication check can create duplicate side effects.
Verify the queue drains and successful webhook delivery recovers before resolving the incident.""",
    },
    {
        "title": "Search index freshness",
        "service": "search-indexer",
        "kind": "runbook",
        "content": """# Search index freshness
Search results become stale when the indexing consumer lag grows. The primary signals are consumer lag, document update age, and failed indexing batches.
Inspect the consumer checkpoint and dead-letter queue. A schema mapping conflict can cause repeated batch failures after a catalog schema deployment.
Compare the rejected document fields with the active search index mapping. Prepare a compatible mapping change for review before retrying a failed batch.
Verify that consumer lag decreases and a newly updated catalog item appears in search.""",
    },
    {
        "title": "Edge cache & origin errors",
        "service": "edge-gateway",
        "kind": "architecture",
        "content": """# Edge gateway routing and cache
The edge gateway routes traffic to regional origins and caches public catalog responses. An increase in HTTP 502 errors may indicate origin connection failures, DNS resolution errors, or unhealthy upstream instances.
Check origin health, regional error distribution, and DNS resolution before changing routing. Compare edge error rate against origin error rate to distinguish cache behavior from upstream availability.
Prepare a regional failover proposal only after confirming spare capacity and obtaining incident commander approval. Verify recovery from multiple regions.""",
    },
]

INCIDENTS = [
    (
        "Checkout latency after release",
        "checkout-api",
        "SEV1",
        "investigating",
        "Checkout p95 latency rose from 240 ms to 2.8 s after release v2.18. Database connection wait time is increasing, while database CPU is stable at 42%. Worker concurrency changed in this release. Payment success rate has fallen to 94.2%.",
    ),
    (
        "Payment webhook retries increasing",
        "payments-worker",
        "SEV2",
        "investigating",
        "Webhook delivery queue backlog is growing. The downstream payment provider is returning HTTP 429 responses. Oldest message age is 12 minutes and retry volume has doubled.",
    ),
    (
        "Search results are behind catalog updates",
        "search-indexer",
        "SEV2",
        "monitoring",
        "Search indexing consumer lag increased after a catalog schema deployment. Failed indexing batches report a schema mapping conflict. Document updates take 8 minutes to appear.",
    ),
    (
        "Regional gateway errors recovered",
        "edge-gateway",
        "SEV3",
        "resolved",
        "HTTP 502 errors increased in one region due to unhealthy upstream origin instances. Origin health checks recovered and regional error distribution returned to baseline after investigation.",
    ),
]


def seed_workspace(db: Session, workspace_id: str, actor: str):
    for doc in DOCUMENTS:
        add_document(db, workspace_id, **doc)
    for index, (title, service, severity, status, summary) in enumerate(INCIDENTS):
        incident = Incident(
            workspace_id=workspace_id,
            number=1042 - index,
            title=title,
            service=service,
            severity=severity,
            status=status,
            summary=summary,
            created_at=now() - timedelta(minutes=18 + index * 73),
            updated_at=now() - timedelta(minutes=3 + index * 29),
        )
        db.add(incident)
        db.flush()
        db.add(
            Audit(
                workspace_id=workspace_id,
                actor=actor,
                action="incident.created",
                resource_id=incident.id,
                detail=f"Sample incident RLY-{incident.number}",
            )
        )
