import { execJson } from "../utils/exec.js";
import { ago } from "../utils/format.js";
import { ok, err } from "../utils/response.js";

interface K8sNode {
  metadata: { name: string; labels: Record<string, string> };
  status: {
    conditions: { type: string; status: string }[];
    nodeInfo: { kubeletVersion: string };
  };
}

interface K8sNodeList {
  items: K8sNode[];
}

interface FluxResource {
  metadata: { name: string; namespace: string };
  status?: {
    conditions?: { type: string; status: string; message?: string; lastTransitionTime?: string }[];
  };
}

interface FluxResourceList {
  items: FluxResource[];
}

interface K8sPod {
  metadata: { name: string; namespace: string; creationTimestamp: string };
  status: {
    phase: string;
    containerStatuses?: { name: string; restartCount: number; state: Record<string, any> }[];
  };
}

interface K8sPodList {
  items: K8sPod[];
}

interface K8sPVC {
  metadata: { name: string; namespace: string };
  status: { phase: string };
  spec: { storageClassName?: string };
}

interface K8sPVCList {
  items: K8sPVC[];
}

export async function clusterHealth() {
  try {
    const [nodes, kustomizations, pods, helmreleases, pvcs] = await Promise.all([
      execJson<K8sNodeList>("kubectl", ["get", "nodes"]),
      execJson<FluxResourceList>("kubectl", ["get", "kustomizations.kustomize.toolkit.fluxcd.io", "-A"]),
      execJson<K8sPodList>("kubectl", ["get", "pods", "-A"]),
      execJson<FluxResourceList>("kubectl", ["get", "helmreleases.helm.toolkit.fluxcd.io", "-A"]),
      execJson<K8sPVCList>("kubectl", ["get", "pvc", "-A"]),
    ]);

    const nodeList = nodes.items.map(node => {
      const ready = node.status.conditions.find(c => c.type === "Ready");
      const roles = Object.keys(node.metadata.labels)
        .filter(l => l.startsWith("node-role.kubernetes.io/"))
        .map(l => l.replace("node-role.kubernetes.io/", ""))
        .join(", ") || "worker";
      return {
        name: node.metadata.name,
        status: ready?.status === "True" ? "Ready" : "NotReady",
        version: node.status.nodeInfo.kubeletVersion,
        roles,
      };
    });

    const kustomizationList = kustomizations.items.map(ks => {
      const ready = ks.status?.conditions?.find(c => c.type === "Ready");
      return {
        namespace: ks.metadata.namespace,
        name: ks.metadata.name,
        ready: ready?.status || "Unknown",
        message: ready?.message || "",
      };
    });

    const problemPods = pods.items
      .filter(p => p.status.phase !== "Running" && p.status.phase !== "Succeeded")
      .map(p => ({
        namespace: p.metadata.namespace,
        name: p.metadata.name,
        status: p.status.phase,
        restarts: p.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) ?? 0,
        age: ago(p.metadata.creationTimestamp),
      }));

    const helmReleaseList = helmreleases.items.map(hr => {
      const ready = hr.status?.conditions?.find(c => c.type === "Ready");
      return {
        namespace: hr.metadata.namespace,
        name: hr.metadata.name,
        ready: ready?.status || "Unknown",
        message: ready?.message || "",
      };
    });

    const pvcIssues = pvcs.items
      .filter(p => p.status.phase !== "Bound")
      .map(p => ({
        namespace: p.metadata.namespace,
        name: p.metadata.name,
        status: p.status.phase,
        storageClass: p.spec.storageClassName || "",
      }));

    return ok({ nodes: nodeList, kustomizations: kustomizationList, problemPods, helmReleases: helmReleaseList, pvcIssues });
  } catch (error: any) {
    return err(`Error getting cluster health: ${error.message}`);
  }
}
