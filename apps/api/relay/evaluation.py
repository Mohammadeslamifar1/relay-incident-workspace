"""Versioned offline regression set; scores measure retrieval, not LLM truthfulness."""

from relay.ai import extractive_brief, validate_brief
from relay.retrieval import rank
from relay.seed import DOCUMENTS

DATASET_VERSION = "relay-retrieval-v1"
CASES = [
    (
        "checkout-pool",
        "Checkout connection pool exhaustion database worker concurrency",
        "Checkout latency & connection pools",
    ),
    (
        "checkout-history",
        "Previous checkout workers increased from 4 to 12 database CPU normal",
        "Checkout pool exhaustion · previous incident",
    ),
    (
        "webhook-backoff",
        "Webhook queue backlog provider HTTP 429 retry backoff",
        "Payment webhook delivery",
    ),
    (
        "index-mapping",
        "Search indexing consumer lag schema mapping conflict",
        "Search index freshness",
    ),
    (
        "edge-origin",
        "Regional edge HTTP 502 origin connection DNS errors",
        "Edge cache & origin errors",
    ),
    (
        "payment-replay",
        "Webhook replay idempotency deduplication duplicate events",
        "Payment webhook delivery",
    ),
    ("unknown-domain", "Lunar habitat oxygen scrubber titanium calibration", None),
    ("unknown-storage", "Glacier archival tape robot spindle alignment", None),
]


def run_evaluation() -> dict:
    candidates = [
        {
            **doc,
            "chunk_id": f"fixture-{i}",
            "document_id": f"fixture-{i}",
            "start_line": 1,
            "end_line": len(doc["content"].splitlines()),
        }
        for i, doc in enumerate(DOCUMENTS)
    ]
    results = []
    reciprocal_ranks, hits, abstentions, valid_citations = [], [], [], []
    for case_id, query, expected in CASES:
        evidence = rank(query, candidates, limit=3)
        brief = extractive_brief(query, evidence)
        validate_brief(brief, evidence)
        titles = [item["title"] for item in evidence]
        if expected:
            hit = expected in titles
            hits.append(int(hit))
            reciprocal_ranks.append(1 / (titles.index(expected) + 1) if hit else 0)
            passed = hit
        else:
            passed = brief.abstained
            abstentions.append(int(passed))
        claims = [*brief.actions, *brief.hypotheses]
        if claims:
            valid_citations.append(int(all(claim.evidence_ids for claim in claims)))
        results.append(
            {
                "id": case_id,
                "query": query,
                "expected": expected or "Abstain",
                "retrieved": titles,
                "passed": passed,
            }
        )
    return {
        "dataset_version": DATASET_VERSION,
        "provider": "extractive",
        "cases": results,
        "metrics": {
            "recall_at_3": round(sum(hits) / len(hits), 3),
            "mrr": round(sum(reciprocal_ranks) / len(reciprocal_ranks), 3),
            "abstention_accuracy": sum(abstentions) / len(abstentions),
            "citation_validity": sum(valid_citations) / len(valid_citations),
        },
        "limitations": "Eight synthetic cases on a fixed reference corpus. Citation validity checks IDs, not semantic support. These results do not measure live model quality or production reliability.",
    }
