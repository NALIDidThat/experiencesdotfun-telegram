# Dependency security remediation

Verified on 2026-10-13.

## Manifest inventory and automatic fixes

The initial inventory used a filesystem walk from the workspace root, pruning
`node_modules`, `.git`, `vendor`, `.venv`, `venv`, `target`, `dist`, `build`,
`.next`, `.expo`, `.cache`, and `generated-artifacts` before traversal.
This includes untracked manifests; it does not depend on Git's file list.

| Manifest | Manager / lock | Automatic fix |
| --- | --- | --- |
| `package.json` | pnpm / root `pnpm-lock.yaml` | `pnpm audit --fix` in its directory |
| `artifacts/api-server/package.json` | pnpm / shared root lock | Same |
| `artifacts/mobile/package.json` | pnpm / shared root lock | Same |
| `artifacts/mockup-sandbox/package.json` | pnpm / shared root lock | Same |
| `lib/api-client-react/package.json` | pnpm / shared root lock | Same |
| `lib/api-spec/package.json` | pnpm / shared root lock | Same |
| `lib/api-zod/package.json` | pnpm / shared root lock | Same |
| `lib/db/package.json` | pnpm / shared root lock | Same |
| `lib/integrations-openai-ai-server/package.json` | pnpm / shared root lock | Same |
| `scripts/package.json` | pnpm / shared root lock | Same |
| `.local/skills/ai-integrations-anthropic/templates/lib/integrations-anthropic-ai/package.json` | pnpm template, no independent lock | Same, resolves nearest workspace |
| `.local/skills/ai-integrations-gemini/templates/lib/integrations-gemini-ai/package.json` | pnpm template, no independent lock | Same, resolves nearest workspace |
| `.local/skills/ai-integrations-openai/templates/lib/integrations-openai-ai-react/package.json` | pnpm template, no independent lock | Same, resolves nearest workspace |
| `.local/skills/ai-integrations-openai/templates/lib/integrations-openai-ai-server/package.json` | pnpm template, no independent lock | Same, resolves nearest workspace |
| `.local/skills/ai-integrations-openrouter/templates/lib/integrations-openrouter-ai/package.json` | pnpm template, no independent lock | Same, resolves nearest workspace |
| `.local/skills/object-storage/templates/lib/object-storage-web/package.json` | pnpm template, no independent lock | Same, resolves nearest workspace |
| `.local/skills/replit-auth/templates/lib/replit-auth-web/package.json` | pnpm template, no independent lock | Same, resolves nearest workspace |
| `pyproject.toml` | uv / `uv.lock` | Exported frozen, fully pinned requirements; ran `pip-audit --fix` with `--no-deps --disable-pip` against the export |

The Python audit found no vulnerabilities. Its temporary audit tooling was
removed afterward; the Python manifest and lockfile remain unchanged.
Templates are not active workspace importers and contain no direct pins to any
of the three affected packages.

## Remediation

| Advisory | Remediation |
| --- | --- |
| GHSA-qhr7-859c-m2p7 | Range-scoped override to brace-expansion 5.0.12 |
| GHSA-6j4f-fj2g-mc7p | Same override; 5.0.12 includes the 5.0.10 fix |
| GHSA-q2hr-2g5m-vwhr | Same override; requires 5.0.12 |
| GHSA-hrr3-gc8f-f4qj | Range-scoped override to fast-uri 3.1.8, preserving AJV's 3.x API |
| GHSA-86w9-cpqp-85rv | Local backport of the proposed upstream nested DigestAlgorithm element-count fix from https://github.com/digitalbazaar/forge/pull/1152 |

Automatic fixing also upgraded source-map-js and shell-quote to patched versions.
The package release-age protection and all pre-existing overrides are preserved.

### Explicit node-forge exception

The registry's latest node-forge release is still 1.4.0, and the advisory lists
no patched release. The latest Expo CLI and code-signing certificate helper also
still depend on node-forge. Removing or replacing the package blindly would
break their certificate APIs. The affected verification function is reachable
from Expo's code-signing helper, so an "unreachable" exemption is not appropriate.

Instead, pnpm applies the committed source patch to every resolved node-forge
consumer. The lockfile records the patch hash. Tests resolve through Expo CLI
and its signing helper, prove they share the patched module, reject extra nested
ASN.1 children on an exponent-3 RSA key, and retain valid RSA/PSS signatures.

**The literal node-forge 1.4.0 package metadata remains in the lockfile.**
Version-based audits do not inspect local patches and still report this advisory.
This is not a clean-version replacement and does not satisfy a literal
"no listed package/version pairs" requirement. No advisory has been suppressed,
and no package version has been relabelled to hide the finding.
Replace this backport with an official fixed release when one is available.

### Explicit braces exception

The latest `braces` 3.x release is still 3.0.3, and its advisory is open with no
fixed release. Expo's Metro file-map dependency uses micromatch, which calls
`braces`; therefore the path is reachable and cannot be dismissed as unused.
The committed patch bounds brace nesting to 100 before recursive AST walkers
run. This is below the reported stack-overflow threshold (roughly 3,500 levels
in Node 26) and still permits valid nested patterns. The cap also applies when
callers pass a custom depth option. Consumer tests verify normal brace matching
and that both compile and expand reject deeper input.

**The literal `braces@3.0.3` package metadata also remains in the lockfile.**
The version-only scanner cannot understand the source patch and keeps reporting
the advisory, just as it does for node-forge. No advisory is muted.

## Verification results

- Filesystem recheck: all 17 JavaScript manifests, Python manifest, workspace
  configuration, and both ecosystem lockfiles inspected. No vulnerable
  brace-expansion 5.0.9 or fast-uri 3.1.7 pins remain. Every node-forge snapshot
  is patch-hashed; its upstream package metadata is the explicit exception above.
- `pnpm install --frozen-lockfile`: passed.
- `pnpm --filter @workspace/scripts run test`: all 9 security/compatibility tests passed.
- API and mobile typechecks: passed; composite library typecheck passed.
- API build, sandbox Vite build, and Expo web export: passed.
- All three managed workflows restarted successfully. API health endpoint returned
  `{"status":"ok"}`; the unauthenticated mobile landing page rendered correctly.
  Signed-in UI was not verified.
- Full workspace test suite: all 77 API tests and all 9 security/compatibility
  tests passed.
- Full workspace typecheck: passed after aligning React type packages across
  peers in the workspace.
- Fresh dependency audit: two high findings remain: version-only node-forge
  metadata and GHSA-vfj7-8cjw-p6xm in braces 3.0.3. Both affected consumers are
  covered by committed backports and regression tests; package-version audits
  cannot inspect those patches. No findings remain for the originally listed
  brace-expansion and fast-uri versions.
- XP award-redemption concurrency integration test: passed after correcting its
  PostgreSQL activity query to match the qualified `UPDATE public.xp_awards`
  statement; the previous filter could never match that statement.
