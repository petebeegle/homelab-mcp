# homelab-mcp

MCP (Model Context Protocol) server for homelab Kubernetes operations.

This server exposes a small set of tools that shell out to common cluster CLIs (primarily `kubectl`, plus `flux` and `talosctl`) and returns structured responses suitable for use by MCP clients.

## Requirements

- Node.js + npm
- Cluster access configured in the environment where the server runs:
  - `kubectl` configured (KUBECONFIG / current context)
  - `flux` CLI available (for Flux-related tools)
  - `talosctl` CLI available (for Talos-related tools)
- For `grafana_metrics`: a Kubernetes `Service` named `mimir-nginx` in namespace `monitoring` that exposes the Prometheus-compatible API (the tool uses the Kubernetes API proxy).

## Install

```bash
npm install
```

## Run

This MCP server uses stdio transport.

```bash
# Run once
npm run start

# Watch mode (recommended for development)
npm run dev
```

You can also run via:

```bash
npm run mcp
```

## MCP client configuration

Most MCP clients that support stdio transports let you register a server with a `command` and `args`.

Example (Claude Desktop-style `mcpServers`):

```json
{
  "mcpServers": {
    "homelab": {
      "command": "node",
      "args": ["--import", "tsx", "src/index.ts"],
      "cwd": "/ABSOLUTE/PATH/TO/homelab-mcp",
      "env": {
        "KUBECONFIG": "/ABSOLUTE/PATH/TO/kubeconfig"
      }
    }
  }
}
```

Notes:
- Set `cwd` to this repo root so `src/index.ts` resolves.
- `env.KUBECONFIG` is optional if your client environment already has a working `kubectl` context.
- The server also exposes `npm run mcp` if your client prefers running `npm` scripts.

## Tools

Tool names below match what the MCP server registers.

### `cluster_health`

Aggregated health view across the cluster.

- Inputs: none
- Uses: `kubectl get nodes`, `kubectl get pods -A`, Flux CRDs, PVCs
- Returns (high level): nodes, kustomizations, helmReleases, problemPods, pvcIssues

### `flux_status`

Status for Flux kustomizations and/or helmreleases.

Inputs:
- `resource_type`: `kustomization | helmrelease | all`
- `name` (optional): filter to a specific resource name
- `namespace` (optional): namespace to query (defaults to all namespaces)

### `flux_logs`

Flux controller logs filtered by level.

Inputs:
- `level`: `error | warn | info` (default: `error`)
- `since` (optional): duration like `5m` or `1h`
- `limit`: number (default: `50`)

### `flux_reconcile`

Trigger reconciliation of a Flux resource.

Inputs:
- `resource_type`: `kustomization | helmrelease`
- `name`: resource name
- `namespace` (optional)
- `with_source`: boolean (default: `true`)

### `talos_nodes`

Talos node status with service health.

- Auto-discovers node IPs via `kubectl get nodes -o json` and uses the node `InternalIP`.

Inputs:
- `node` (optional): node name or IP (omit to list all)

### `talos_logs`

Logs from a Talos service on a specific node.

Inputs:
- `node`: node name or IP
- `service`: Talos service name (e.g. `kubelet`, `etcd`)
- `since` (optional)
- `limit`: number (default: `100`)

### `pod_logs`

Fetch Kubernetes pod logs by pod name, label selector, or deployment.

Inputs:
- `namespace`: namespace to query
- `pod_name` (optional)
- `label` (optional): label selector string like `app=myapp`
- `deployment` (optional): deployment name (resolved to a label selector)
- `container` (optional)
- `since` (optional)
- `limit`: number (default: `100`)
- `previous`: boolean (default: `false`)

### `helmrelease_debug`

Deep dive for a HelmRelease: conditions, recent events, and optionally rendered values.

Inputs:
- `name`: HelmRelease name
- `namespace`: HelmRelease namespace
- `show_values`: boolean (default: `false`)

### `grafana_metrics`

Search or query Prometheus metrics via Mimir (through the Kubernetes API proxy).

Inputs:
- `action`: `search | label_values | query`
- `pattern` (optional): regex pattern to filter metric names (`search`)
- `label` (optional): label name (`label_values`)
- `query` (optional): PromQL expression (`query`)
- `limit`: number (default: `50`)

## Development notes

- Tools live in `src/tools/*` and should return structured data, not raw CLI dumps.
- CLI execution helpers are in `src/utils/exec.ts`.

See `CLAUDE.md` for additional repo-specific conventions.
