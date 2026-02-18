import { exec } from "../utils/exec.js";
import { ok, err } from "../utils/response.js";

const PROXY_BASE = "/api/v1/namespaces/monitoring/services/http:mimir-nginx:80/proxy/prometheus";

async function mimirQuery(path: string): Promise<unknown> {
  const raw = `${PROXY_BASE}${path}`;
  const { stdout } = await exec("kubectl", ["get", "--raw", raw]);
  const json = JSON.parse(stdout);
  if (json.status !== "success") throw new Error(json.error ?? "Mimir returned non-success status");
  return json.data;
}

export async function grafanaMetrics({ action, pattern, label, query, limit }: {
  action: "search" | "label_values" | "query";
  pattern?: string;
  label?: string;
  query?: string;
  limit: number;
}) {
  try {
    if (action === "search") {
      let re: RegExp | undefined;
      if (pattern) {
        try {
          re = new RegExp(pattern);
        } catch {
          return err(`Invalid regex pattern: ${pattern}`);
        }
      }
      const names = await mimirQuery("/api/v1/label/__name__/values") as string[];
      const filtered = re ? names.filter((n) => re!.test(n)) : names;
      return ok({ action, count: filtered.length, metrics: filtered.slice(0, limit) });
    }

    if (action === "label_values") {
      if (!label) return err("label is required for label_values action");
      const values = await mimirQuery(`/api/v1/label/${encodeURIComponent(label)}/values`) as string[];
      return ok({ action, label, count: values.length, values: values.slice(0, limit) });
    }

    if (action === "query") {
      if (!query) return err("query is required for query action");
      const data = await mimirQuery(`/api/v1/query?query=${encodeURIComponent(query)}`) as { result: unknown[] };
      const result = data.result.slice(0, limit);
      return ok({ action, query, count: result.length, result });
    }

    return err(`Unknown action: ${action}`);
  } catch (e) {
    return err(`grafana_metrics failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
