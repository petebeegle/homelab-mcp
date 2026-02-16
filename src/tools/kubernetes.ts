import { exec, execJson } from "../utils/exec.js";
import { ok, err } from "../utils/response.js";

interface Deployment {
  spec: {
    selector: {
      matchLabels: Record<string, string>;
    };
  };
}

export async function podLogs({ namespace, pod_name, label, deployment, container, since, limit, previous }: {
  namespace: string;
  pod_name?: string;
  label?: string;
  deployment?: string;
  container?: string;
  since?: string;
  limit: number;
  previous: boolean;
}) {
  try {
    // If deployment provided, resolve to label selector
    let resolvedLabel = label;
    if (deployment && !label && !pod_name) {
      const dep = await execJson<Deployment>("kubectl", ["get", "deployment", deployment, "-n", namespace]);
      const labels = dep.spec.selector.matchLabels;
      resolvedLabel = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join(",");
    }

    const args = ["logs", "-n", namespace];

    if (pod_name) {
      args.push(pod_name);
    } else if (resolvedLabel) {
      args.push("-l", resolvedLabel);
    } else {
      return err("Must specify pod_name, label, or deployment");
    }

    if (container) {
      args.push("-c", container);
    }
    if (since) {
      args.push(`--since=${since}`);
    }
    if (limit) {
      args.push(`--tail=${limit}`);
    }
    if (previous) {
      args.push("--previous");
    }

    const result = await exec("kubectl", args);
    const lines = (result.stdout || "").split("\n").filter(Boolean);
    return ok({ lines });
  } catch (error: any) {
    return err(`Error getting pod logs: ${error.message}`);
  }
}
