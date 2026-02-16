import { exec, execJson } from "../utils/exec.js";
import { ago } from "../utils/format.js";
import { ok, err } from "../utils/response.js";

interface HelmReleaseCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

interface HelmRelease {
  metadata: { name: string; namespace: string };
  spec: {
    chart?: {
      spec?: {
        chart?: string;
        version?: string;
        sourceRef?: { name: string; kind: string };
      };
    };
    values?: Record<string, any>;
  };
  status?: {
    conditions?: HelmReleaseCondition[];
    lastAppliedRevision?: string;
    lastAttemptedRevision?: string;
  };
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

export async function helmreleaseDebug({ name, namespace, show_values }: { name: string; namespace: string; show_values: boolean }) {
  try {
    const promises: Promise<any>[] = [
      execJson<HelmRelease>("kubectl", ["get", `helmrelease.helm.toolkit.fluxcd.io/${name}`, "-n", namespace]),
      execJson<K8sEventList>("kubectl", ["get", "events", "--field-selector", `involvedObject.name=${name}`, "-n", namespace, "--sort-by=.lastTimestamp"]),
    ];

    if (show_values) {
      promises.push(exec("flux", ["debug", "helmrelease", name, "-n", namespace, "--show-values"]).catch(() => ({ stdout: "Could not retrieve values", stderr: "" })));
    }

    const results = await Promise.all(promises);
    const hr: HelmRelease = results[0];
    const events: K8sEventList = results[1];

    const chartName = hr.spec.chart?.spec?.chart || "unknown";
    const chartVersion = hr.spec.chart?.spec?.version || "";
    const sourceRef = hr.spec.chart?.spec?.sourceRef;
    const ready = hr.status?.conditions?.find(c => c.type === "Ready");
    const revision = hr.status?.lastAppliedRevision || hr.status?.lastAttemptedRevision || "";

    const conditions = (hr.status?.conditions || []).map(c => ({
      type: c.type,
      status: c.status,
      reason: c.reason || "",
      message: c.message || "",
      age: c.lastTransitionTime ? ago(c.lastTransitionTime) : "",
    }));

    const eventList = events.items.slice(-10).map(e => ({
      age: e.lastTimestamp ? ago(e.lastTimestamp) : "",
      type: e.type,
      reason: e.reason,
      message: e.message,
    }));

    const data: Record<string, any> = {
      name,
      namespace,
      chart: chartName,
      chartVersion,
      sourceRef: sourceRef ? `${sourceRef.name}/${chartName}` : "",
      revision,
      ready: { status: ready?.status || "Unknown", message: ready?.message || "" },
      conditions,
      events: eventList,
    };

    if (show_values && results[2]) {
      data.values = results[2].stdout || "";
    }

    return ok(data);
  } catch (error: any) {
    return err(`Error debugging HelmRelease: ${error.message}`);
  }
}
