# Contributing

Use the local setup in the README. Keep code changes scoped and include validation of behavior that could regress. Format Python with Black/isort and the frontend with Prettier. Run the API suite and production build; run relevant browser tests for UI changes.

For changes to the schema, create an Alembic revision and check both the upgrade path and model drift. For AI changes, report retrieval and answer-generation behavior separately. Never weaken citation or tenant checks to improve a test score. Update evaluation limitations when changing fixtures.

A useful change description explains the problem, resulting behavior, important tradeoff and tests run. Include screenshots for interface changes. Do not commit `.env`, local databases, credentials, generated test traces, dependency directories, or IDE settings.
