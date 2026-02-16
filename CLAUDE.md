# homelab-mcp

MCP server for homelab Kubernetes cluster operations.

## Commands
- `npm run start` -- Start the MCP server (stdio transport)
- `npm run dev` -- Start with file watching
- `npm run build` -- Compile TypeScript

## Architecture
- Tools shell out to CLI tools (kubectl, flux, talosctl) using `utils/exec.ts`
- Use `-o json` flags for reliable parsing wherever possible
- Return structured markdown responses, not raw CLI output
- Each tool file exports a handler function matching the MCP tool handler signature

## Key Patterns
- Node IP auto-discovery: `kubectl get nodes -o json` -> extract InternalIP
- Flux resources use full CRD names: `kustomizations.kustomize.toolkit.fluxcd.io`, `helmreleases.helm.toolkit.fluxcd.io`
- Error handling: return `isError: true` with a helpful message if a command fails
- Parallel execution: use `Promise.all` for independent commands (e.g., cluster_health)
