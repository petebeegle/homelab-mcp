import { exec, execJson } from "../utils/exec.js";
import { ok, err } from "../utils/response.js";

interface K8sNode {
  metadata: { name: string; labels: Record<string, string> };
  status: {
    addresses: { type: string; address: string }[];
  };
}

interface K8sNodeList {
  items: K8sNode[];
}

interface NodeInfo {
  name: string;
  ip: string;
  roles: string;
}

async function getNodeIPs(nodeName?: string): Promise<NodeInfo[]> {
  const result = await execJson<K8sNodeList>("kubectl", ["get", "nodes"]);
  let nodes = result.items;

  if (nodeName) {
    // Match by name or IP
    nodes = nodes.filter(n =>
      n.metadata.name === nodeName ||
      n.status.addresses.some(a => a.address === nodeName)
    );
  }

  return nodes.map(n => ({
    name: n.metadata.name,
    ip: n.status.addresses.find(a => a.type === "InternalIP")?.address || "",
    roles: Object.keys(n.metadata.labels)
      .filter(l => l.startsWith("node-role.kubernetes.io/"))
      .map(l => l.replace("node-role.kubernetes.io/", ""))
      .join(", ") || "worker",
  }));
}

export async function talosNodes({ node }: { node?: string }) {
  try {
    const nodes = await getNodeIPs(node);

    if (nodes.length === 0) {
      return err(node ? `Node "${node}" not found` : "No nodes found");
    }

    const nodeList = await Promise.all(nodes.map(async n => {
      if (!n.ip) {
        return { name: n.name, ip: "", roles: n.roles, talosVersion: "No InternalIP found", services: [] };
      }

      const [versionResult, serviceResult] = await Promise.all([
        exec("talosctl", ["-n", n.ip, "version", "--short"]).catch(e => ({ stdout: `Error: ${e.message}`, stderr: "" })),
        exec("talosctl", ["-n", n.ip, "service"]).catch(e => ({ stdout: `Error: ${e.message}`, stderr: "" })),
      ]);

      const versionLines = versionResult.stdout.trim().split("\n");
      const talosVersion = versionLines.find(l => l.includes("Tag:"))?.split(":")[1]?.trim() || "unknown";

      const serviceLines = serviceResult.stdout.trim().split("\n");
      const services: { service: string; state: string; health: string; lastChange: string }[] = [];
      if (serviceLines.length > 1) {
        for (const line of serviceLines.slice(1)) {
          const parts = line.trim().split(/\s{2,}/);
          if (parts.length >= 3) {
            services.push({
              service: parts[0] || "",
              state: parts[1] || "",
              health: parts[2] || "",
              lastChange: parts[3] || "",
            });
          }
        }
      }

      return { name: n.name, ip: n.ip, roles: n.roles, talosVersion, services };
    }));

    return ok({ nodes: nodeList });
  } catch (error: any) {
    return err(`Error getting Talos node status: ${error.message}`);
  }
}

export async function talosLogs({ node, service, since, limit }: { node: string; service: string; since?: string; limit: number }) {
  try {
    const nodes = await getNodeIPs(node);
    const target = nodes[0];

    if (!target) {
      return err(`Node "${node}" not found`);
    }

    const args = ["-n", target.ip, "logs", service];
    if (since) {
      args.push(`--since=${since}`);
    }

    const result = await exec("talosctl", args);
    const lines = result.stdout.trim().split("\n").slice(-limit).filter(Boolean);

    return ok({ node: target.name, service, lines });
  } catch (error: any) {
    return err(`Error getting Talos logs: ${error.message}`);
  }
}
