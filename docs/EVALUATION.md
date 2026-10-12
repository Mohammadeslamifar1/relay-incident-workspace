# Evaluation methodology

The `relay-retrieval-v1` dataset lives in `apps/api/relay/evaluation.py`. It has six answerable queries spanning four fictional services and two out-of-domain queries. The reference corpus is the five documents in `seed.py`, independent of a user's uploaded documents. Query text, expected source and retrieved source titles are visible in the Quality lab.

| Metric | Definition | Limitation |
| --- | --- | --- |
| Recall@3 | Fraction of answerable queries with the expected document in the first three results | One labeled source per query, only six answerable examples |
| MRR | Mean reciprocal rank of the expected source | Does not measure usefulness of every retrieved source |
| Abstention accuracy | Fraction of two unanswerable queries that return no brief actions | Very small negative set, no calibrated threshold |
| Citation validity | Fraction of answerable briefs whose claims have valid supplied reference IDs | ID integrity, not semantic entailment or truth |

The reference-corpus evaluation treats each fixture document as one candidate. The application uses ingested chunks. API tests separately cover the actual ingestion/retrieval/analysis path. This distinction is intentional and must be preserved when interpreting scores.

Run `python scripts/evaluate.py` for a JSON report. A run in the UI persists its result and timestamp. The current expected regression baseline is 1.0 on all four metrics. Perfect scores on eight deliberately small synthetic cases should not be described as 100% AI accuracy.

The OpenAI adapter is tested with HTTP mocks for successful structured responses, refusal/incomplete output handling, malformed JSON, and provider failure. No claim is made about live LLM accuracy, latency, or cost based on those tests.

## Next defensible experiments

Collect a consented or synthetic held-out set with paraphrases, ambiguous services, stale runbooks, contradictory sources, prompt-injection attempts, and near-match negatives. Separate retrieval recall from answer faithfulness. Human-label support at the claim level. Measure retrieval/total p50 and p95 latency, provider token usage, and abstention precision/recall before changing thresholds. Version both the corpus and prompt and compare every change against the same baseline.
