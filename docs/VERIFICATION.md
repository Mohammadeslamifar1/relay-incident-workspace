# Verification record

Verified locally on 2026-10-12 using Windows, Python 3.14.2, Node.js 24.18.0 and Microsoft Edge through Playwright.

| Check | Observed result |
| --- | --- |
| Python/API suite | 24 tests passed |
| Backend statement coverage | 95.04% (705 statements; this is not branch coverage) |
| Browser journeys | 7 tests passed |
| Automated accessibility | No axe WCAG 2 A/AA or 2.1 AA violations on the tested entry and overview pages |
| Responsive layout | No horizontal overflow at a 390px viewport on overview and knowledge pages |
| Frontend production build | TypeScript check and Vite build passed |
| Formatting/static checks | Black, isort, Flake8 and Prettier checks passed |
| Schema drift | `alembic check`: no new upgrade operations detected |
| Offline evaluation | 8/8 fixture scenarios passed; all four metrics 1.0 on the small reference set |
| Container image | Multi-stage Docker build passed |
| PostgreSQL container smoke test | Healthy startup, served UI, demo provisioning, document listing, completed analysis, recorded review, status update, evaluation and Markdown export passed |

Browser checks cover investigation, evidence inspection, approval, Markdown download, incident resolution, duplicate document handling, deletion, abstention, search, evaluation persistence, account login/logout, and mobile navigation. Screenshots in `docs/images/` come from the running application with fictional sample data.

Windows blocked Playwright's downloaded headless-shell binary. Tests succeeded using the already-installed Microsoft Edge through Playwright's supported browser channel. The configuration defaults to Edge on Windows and bundled Chromium on Linux; `RELAY_BROWSER_CHANNEL` can select another installed supported channel.

The Python suite emits one dependency deprecation warning: the installed Starlette test client currently accepts `httpx` but recommends `httpx2`. Tests pass with the locked dependency set; migration of the test transport can be handled separately from the production HTTP adapter.

No paid live-model request was made. Provider tests use HTTP mocks. No load test, formal security audit, comprehensive manual accessibility audit, or externally hosted deployment is claimed. The [GitHub Actions history](https://github.com/Mohammadeslamifar1/relay-incident-workspace/actions/workflows/ci.yml) records verification for published commits; the table above records the original local verification.
