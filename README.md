# @core/shipping

[![genpm](https://api.genpm.net/v1/badge/@core/shipping.svg)](https://genpm.net/p/@core/shipping) ![license](https://img.shields.io/badge/license-MIT-blue)

> Shipping zones and rates (flat, weight, order value, free over X) with delivery estimates and tracking URLs

A [GenPM](https://genpm.net) module: **source code + AI rules + MCP config**, injected into your project instead of hidden in `node_modules`. The code lands in `src/lib/shipping`, pinned to a verified commit, and you own it.

## Install

```bash
genpm add @core/shipping
```

No genpm yet? `curl -fsSL https://genpm.net/install.sh | sh` (macOS/Linux), `irm https://genpm.net/install.ps1 | iex` (Windows), or one-off with `npx @genpm-net/cli add @core/shipping`.

Or let your AI agent do it: run `genpm mcp setup` once, then ask *"add @core/shipping with genpm"* in Claude Code, Cursor, VS Code, Windsurf, Codex or Gemini CLI. It shows you a dry-run plan before writing anything.

## What it does

Shipping zones (ISO country lists, `*` = rest of world) and rates per zone: flat price, weight and order-value
ranges, free shipping over an amount (after discounts) and delivery estimates in days. Registers the `shipping`
step (order 200) of the @core/cart totals pipeline and builds tracking URLs for common carriers.
No label purchase or live carrier quotes. Tables: `shipping_zones`, `shipping_rates`.

## At a glance

- **GenPM dependencies** (installed with it): [@core/db](https://genpm.net/p/@core/db), [@core/cart](https://genpm.net/p/@core/cart), [@core/money](https://genpm.net/p/@core/money), [@core/contracts](https://genpm.net/p/@core/contracts)
- **npm dependencies** (proposed, never installed without asking): `zod`
- **AI rules**: [`AGENTS.md`](AGENTS.md), loaded by your agent only when it works in `src/lib/shipping`

## Security

GenPM installs a 40-character commit SHA (never a branch), verifies an Ed25519-signed manifest, never runs install scripts and scans AI rules for prompt injection. Details: [genpm.net/docs/security](https://genpm.net/docs/security).

## License

MIT — see [LICENSE](LICENSE). Browse the full catalog at [genpm.net](https://genpm.net).
