# Load test (k6)

`dashboard.js` ramps virtual users against `GET /api/dashboard/kpis`. It is not run as part of the build.

1. Install k6 (https://k6.io/docs/get-started/installation/).
2. Sign in as a demo officer in a browser and copy the `sb-*` auth cookie value.
3. Run against staging, not production:

```
k6 run -e BASE_URL=https://staging.example.test -e SESSION_COOKIE='sb-...=...' -e VUS=1000 load/dashboard.js
```

The target from the plan is 1000 concurrent dashboard loads. Record p95 latency and error rate for the report.
