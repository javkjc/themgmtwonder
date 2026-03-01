# Playwright E2E Tests

## Running Tests Locally

### Prerequisites
1. Ensure Docker is running
2. Start the application with `docker-compose up`
3. Wait for all services to be healthy (API on port 3000, Web on port 3001)

### Run Tests
```bash
# From the root directory

# Run all tests
npm run test:e2e

# Run tests in UI mode (interactive)
npm run test:e2e:ui

# Run tests in debug mode
npm run test:e2e:debug

# Run a specific test file
npx playwright test tests/features_v1_to_v8_1.spec.ts
```

## CI/CD

The tests run automatically on every push to `main` or `master` branches via GitHub Actions.

The CI workflow:
1. Checks out the code
2. Installs dependencies
3. Creates a `.env` file with test credentials
4. Starts Docker services
5. Waits for services to be healthy
6. Runs Playwright tests with 2 retries
7. Uploads test reports as artifacts

## Test Configuration

- **Base URL**: `http://localhost:3001`
- **Browser**: Chromium
- **Retries**: 2 in CI, 0 locally
- **Workers**: 1 (serial execution)
- **Screenshots**: Captured on failure
- **Videos**: Retained on failure
- **Trace**: Captured on first retry

## Authentication

Tests use a shared authentication state:
- Admin credentials are used in `beforeAll` hook
- Authentication state is saved to `.auth/user.json`
- All tests reuse this authenticated session

## Test Coverage

### `features_v1_to_v8_1.spec.ts` (5 tests)
- **v1**: Task lifecycle (create, edit, pin, remarks)
- **v2**: Calendar view accessibility
- **v3-v8.1**: OCR review flow with field validation (confirmed fixture, VerificationPanel layout)
- **v4**: Parent/child task linking
- **v5-v7**: Workflow menu access (skipped gracefully if Workflows nav link absent)

### `full_e2e_suite.spec.ts` (comprehensive, ~57 tests)
- **Auth** — login form, register toggle, wrong credentials, successful login
- **Dashboard / Task CRUD** — create, edit, pin/unpin, done/undone, delete, bulk delete
- **Task Detail** — remarks, attachment upload/delete (PNG buffer + native dialog accept), parent-child linking
- **Scheduling** — schedule modal open/cancel/confirm, calendar widget
- **OCR Review** — fixture attachment field value, page structure
- **Activity Log** — page load, filter buttons, refresh
- **Admin / User Management** — search, You badge, self-demotion guard, reset password flow
- **Admin / Field Library** — page load, status filter, create field modal, create field e2e
- **Admin / Document Types** — page load, create type, field template panel
- **Admin / ML Metrics** — page load, date filters, Refresh, Sync RAG Memory, invalid date validation
- **Navigation** — sidebar links to Tasks, Calendar, Activity, Admin
- **Auth Guards** — unauthenticated redirects for /, /admin, /activity
- **Logout** — logout button returns to login page
- **Settings** — profile page loads, change-password button present
- **Toast Notifications** — success toast on task creation

### `review_page_e2e.spec.ts` (~40 tests across 4 suites)
Uses two fixture modes:
- **Confirmed fixture** (`e7a531b5…`) — has spatial/bounding-box data → renders `VerificationPanel` layout
- **Mutable fixture** (created fresh per suite via `gotoMutableReviewPage`) — no spatial data → renders `renderPanel3()` layout with Fields/Tables tabs

**Suite A — Page Structure**: heading, sidebar, image panel, Back to Task button
**Suite B — Field Verification**: field cards visible, total field value (`$241.50`), tier summary (`Flag: N`), `Confirm All High-Confidence` button
**Suite C — VerificationPanel**: tier summary, confirm button, field input cards
**Suite D — Table Management** (mutable, `[mutable]` tag):
- Edit a table cell value saves via API and updates DOM
- Delete a table row decrements row count
- Selecting a column field mapping persists and updates header
- "Find" button highlights the target row without errors
- Mark as Reviewed then Confirm Baseline sets confirmed/read-only state

## Troubleshooting

### Tests failing locally?
1. Ensure Docker services are running: `docker-compose ps`
2. Check service logs: `docker-compose logs`
3. Verify web is accessible: `curl http://localhost:3001`
4. Verify API is accessible: `curl http://localhost:3000`

### Tests failing in CI?
1. Check GitHub Actions logs for service startup errors
2. Look for Docker logs in the workflow output
3. Download the playwright-report artifact for detailed traces
