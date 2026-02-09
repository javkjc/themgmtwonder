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

The test suite covers features from v1 to v8.1:
- **v1**: Task lifecycle (create, edit, pin, remarks)
- **v2**: Calendar view accessibility
- **v3-v8.1**: OCR review flow with field validation
- **v4**: Parent/child task linking
- **v5-v7**: Workflow menu access

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
