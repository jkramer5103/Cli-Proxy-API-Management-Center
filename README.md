<div align="center">

<img src="./logo.jpg" alt="CLI Proxy API" width="144">

# CLI Proxy API Management Center

A lean web UI for [CLI Proxy API](https://github.com/router-for-me/CLIProxyAPI): credentials, OAuth sign-in,
quotas, providers, and logs, shipped as a single HTML file.

</div>

---

This is a trimmed fork of the upstream management center. It keeps the account-management parts
and drops the dashboard, the config editor, plugins, the light theme, and the extra UI languages.

> [!IMPORTANT]
> Requires **CLI Proxy API ≥ 8.0.0**. This repository is the management UI, not the proxy. It uses
> only the **v8 Management API** (`/v8/management`) and the v8 configuration layout.

## Pages

| Page           | What it does                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Quota**      | Quota and usage per credential for Claude, Antigravity, Codex, xAI, Kimi, Devin, and Meta, with a reset timeline. This is the landing page.                                                   |
| **Auth Files** | Search, filter, sort, and batch enable/disable/delete credentials. Edit priority, proxy, and note; everything else lives under **Advanced**. Also manages OAuth model aliases and exclusions. |
| **Login**      | Browser and device-code OAuth sign-in per provider, plus Vertex service-account import and SIWC binding.                                                                                      |
| **Providers**  | API-key providers by category (Claude, Codex, OpenAI-compatible, Gemini, Vertex, xAI, Meta, …) with an edit sheet; rarely used fields sit under **Advanced**.                                 |
| **Logs**       | Live tail with follow, search, and level filter; error request logs. Download and clear live in the overflow menu.                                                                            |
| **System**     | Server and UI versions, update check, and the request-logging toggle.                                                                                                                         |

## Quick start

The UI ships with CLI Proxy API, so the standard setup needs no separate deployment.

1. Start your CLI Proxy API service.
2. Open `http://<host>:<api_port>/management.html`.
3. Enter your **management key** and connect.

The API address comes from the page URL and can be overridden on the login screen. Addresses such
as `localhost:8317` or `https://example.com:8317/v8/management` are accepted; the management suffix
is stripped. Remote access may need `management.allow-remote: true` on the server.

> [!NOTE]
> The **management key** signs you into this UI. Client keys in `access.api-keys` authorize proxy
> requests. The two are not interchangeable.

## Building

Use **Bun 1.4.3**:

```bash
bun install --frozen-lockfile
bun run build
```

The output is **`dist/index.html`**, with JavaScript, CSS, and assets inlined. The release workflow
renames it to `management.html`. Tags matching `vX.Y.Z` trigger a release. The UI version comes
from `VERSION`, then git tags, then `package.json`, falling back to `dev`.

## Development

```bash
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:5173` and connect to a backend.

**Built with** React 19 · TypeScript · Vite · Zustand · Axios · React Router · Motion · SCSS Modules · i18next.

| Command              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `bun run dev`        | Start the Vite dev server                 |
| `bun run build`      | TypeScript compilation + production build |
| `bun run preview`    | Serve the build locally                   |
| `bun run test`       | Run Bun tests                             |
| `bun run lint`       | Run ESLint                                |
| `bun run type-check` | Run `tsc --noEmit`                        |
| `bun run verify`     | Run tests, lint, and build                |
| `bun run format`     | Format source files with Prettier         |

See [AGENTS.md](AGENTS.md) for repository conventions.

## Security

Treat the management key as a secret. With **Remember password** on, the key is stored in browser
storage using reversible obfuscation, **not encryption**. Use a trusted device or a dedicated
browser profile.

## Troubleshooting

**Claude banked resets:** System → Claude banked resets offers server-side auto-apply during the
final five minutes before a grant expires. It is off by default and applies to all Claude OAuth
accounts when enabled. The backend must support `upstream.claude.auto-apply-banked-resets`; older
backends show a disabled switch. Eligibility and cooldowns still apply, and uncertain claims pause
automation for the affected account. The management page can be closed after enabling it.

- **Cannot connect / 401:** check the API address and management key. Remote connections may require remote management to be enabled, and repeated failures can get a remote IP temporarily blocked.
- **Logs page asks for file logging:** enable `logging-to-file` in the backend config.
- **Provider test fails:** the test runs in the browser and depends on the provider's reachability and CORS policy. A failure doesn't always mean the backend can't reach it.

---

<div align="center">

[CLI Proxy API](https://github.com/router-for-me/CLIProxyAPI) · [MIT License](LICENSE)

</div>
