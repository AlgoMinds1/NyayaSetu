// k6 load test: AICTE KPI endpoint. Not run in this build.
// Run:  k6 run -e BASE_URL=http://localhost:3000 -e SESSION_COOKIE='<value of the sb-* auth cookie>' load/dashboard.js
// Use a demo officer session. Set VUS to 1000 only against a staging deployment, never production.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
const VUS = Number(__ENV.VUS || 50);

export const options = {
  scenarios: {
    dashboard: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "1m", target: VUS }, { duration: "3m", target: VUS }, { duration: "30s", target: 0 }] },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

export default function dashboard() {
  const res = http.get(`${BASE_URL}/api/dashboard/kpis`, { headers: { Cookie: SESSION_COOKIE } });
  check(res, { "status is 200": (r) => r.status === 200, "has total": (r) => r.json("total") !== undefined });
  sleep(1);
}
