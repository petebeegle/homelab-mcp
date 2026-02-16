import { exec, execJson } from "../utils/exec.js";
import { ago } from "../utils/format.js";
import { ok, err } from "../utils/response.js";

interface FluxCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

interface FluxResource {
  metadata: { name: string; namespace: string };
  status?: {
    conditions?: FluxCondition[];
    lastAppliedRevision?: string;
  };
}

interface FluxResourceList {
  items: FluxResource[];
}

interface K8sEvent {
  metadata: { creationTimestamp: string };
  type: string;
  reason: string;
  message: string;
  lastTimestamp?: string;
}

interface K8sEventList {
  items: K8sEvent[];
}

export async function fluxStatus({ resource_type, name, namespace }: { resource_type: string; name?: string; namespace?: string }) {
  try {
    const types: string[] = [];

    if (resource_type === "kustomization" || resource_type === "all") {
      types.push("kustomizations.kustomize.toolkit.fluxcd.io");
    }
    if (resource_type === "helmrelease" || resource_type === "all") {
      types.push("helmreleases.helm.toolkit.fluxcd.io");
    }

    // Single resource mode
    if (name && types.length === 1) {
      const crd = types[0];
      const args = ["get", crd];
      if (namespace) {
        args.push("-n", namespace);
      } else {
        args.push("-A");
      }

      const result = await execJson<FluxResourceList>("kubectl", args);
      const items = result.items.filter(i => i.metadata.name === name);

      if (items.length === 0) {
        return err(`Resource "${name}" not found`);
      }

      const item = items[0];
      const conditions = (item.status?.conditions || []).map(c => ({
        type: c.type,
        status: c.status,
        reason: c.reason || "",
        message: c.message || "",
        age: c.lastTransitionTime ? ago(c.lastTransitionTime) : "",
      }));

      let events: { age: string; type: string; reason: string; message: string }[] = [];
      try {
        const evResult = await execJson<K8sEventList>("kubectl", [
          "get", "events",
          "--field-selector", `involvedObject.name=${item.metadata.name}`,
          "-n", item.metadata.namespace,
          "--sort-by=.lastTimestamp",
        ]);
        events = evResult.items.slice(-10).map(e => ({
          age: e.lastTimestamp ? ago(e.lastTimestamp) : "",
          type: e.type,
          reason: e.reason,
          message: e.message,
        }));
      } catch {
        // Events may not be available
      }

      return ok({
        type: crd.includes("kustomization") ? "kustomization" : "helmrelease",
        name: item.metadata.name,
        namespace: item.metadata.namespace,
        revision: item.status?.lastAppliedRevision || "",
        conditions,
        events,
      });
    }

    // List mode
    const data: Record<string, any> = {};

    for (const crd of types) {
      const args = ["get", crd];
      if (namespace) {
        args.push("-n", namespace);
      } else {
        args.push("-A");
      }

      const result = await execJson<FluxResourceList>("kubectl", args);
      let items = result.items;
      if (name) {
        items = items.filter(i => i.metadata.name === name);
      }

      const key = crd.includes("kustomization") ? "kustomizations" : "helmReleases";
      data[key] = items.map(i => {
        const ready = i.status?.conditions?.find(c => c.type === "Ready");
        return {
          namespace: i.metadata.namespace,
          name: i.metadata.name,
          ready: ready?.status || "Unknown",
          message: ready?.message || "",
        };
      });
    }

    return ok(data);
  } catch (error: any) {
    return err(`Error getting flux status: ${error.message}`);
  }
}

export async function fluxLogs({ level, since, limit }: { level: string; since?: string; limit: number }) {
  try {
    const args = ["logs", `--level=${level}`];
    if (since) {
      args.push(`--since=${since}`);
    }

    const result = await exec("flux", args);
    const lines = result.stdout.trim().split("\n").slice(0, limit).filter(Boolean);

    return ok({ lines });
  } catch (error: any) {
    return err(`Error getting flux logs: ${error.message}`);
  }
}

export async function fluxReconcile({ resource_type, name, namespace, with_source }: { resource_type: string; name: string; namespace?: string; with_source: boolean }) {
  try {
    const args = ["reconcile", resource_type, name];
    if (namespace) {
      args.push("-n", namespace);
    }
    if (with_source) {
      args.push("--with-source");
    }

    const result = await exec("flux", args);
    return ok({ output: result.stdout || result.stderr || "Reconciliation triggered" });
  } catch (error: any) {
    return err(`Error triggering reconciliation: ${error.message}`);
  }
}
