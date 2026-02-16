import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Import tool handlers
import { clusterHealth } from "./tools/cluster-health.js";
import { fluxStatus, fluxLogs, fluxReconcile } from "./tools/flux.js";
import { talosNodes, talosLogs } from "./tools/talos.js";
import { podLogs } from "./tools/kubernetes.js";
import { helmreleaseDebug } from "./tools/helmrelease.js";

const server = new McpServer({
  name: "homelab",
  version: "1.0.0",
});

// Register tools
server.tool("cluster_health", "Aggregated cluster health: nodes, flux, pods, helmreleases, PVCs", {}, clusterHealth);

server.tool("flux_status", "Status of Flux kustomizations and/or helmreleases", {
  resource_type: z.enum(["kustomization", "helmrelease", "all"]).describe("Type of Flux resource"),
  name: z.string().optional().describe("Specific resource name"),
  namespace: z.string().optional().describe("Kubernetes namespace"),
}, fluxStatus);

server.tool("flux_logs", "Flux controller logs filtered by level", {
  level: z.enum(["error", "warn", "info"]).default("error"),
  since: z.string().optional().describe("Duration like '5m' or '1h'"),
  limit: z.number().default(50).describe("Max lines to return"),
}, fluxLogs);

server.tool("flux_reconcile", "Trigger reconciliation of a Flux resource", {
  resource_type: z.enum(["kustomization", "helmrelease"]),
  name: z.string(),
  namespace: z.string().optional(),
  with_source: z.boolean().default(true),
}, fluxReconcile);

server.tool("talos_nodes", "Talos node status with service health (auto-discovers IPs)", {
  node: z.string().optional().describe("Node name or IP (omit for all nodes)"),
}, talosNodes);

server.tool("talos_logs", "Logs from a Talos service on a specific node", {
  node: z.string().describe("Node name or IP"),
  service: z.string().describe("Service name: kubelet, etcd, controller-runtime, etc."),
  since: z.string().optional(),
  limit: z.number().default(100),
}, talosLogs);

server.tool("pod_logs", "Kubernetes pod logs by name, label, or deployment", {
  namespace: z.string(),
  pod_name: z.string().optional(),
  label: z.string().optional(),
  deployment: z.string().optional(),
  container: z.string().optional(),
  since: z.string().optional(),
  limit: z.number().default(100),
  previous: z.boolean().default(false),
}, podLogs);

server.tool("helmrelease_debug", "Deep dive on a HelmRelease: conditions, events, values", {
  name: z.string(),
  namespace: z.string(),
  show_values: z.boolean().default(false),
}, helmreleaseDebug);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
