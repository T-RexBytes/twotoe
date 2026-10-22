# Deploying the demo card

The hosted card at twotoe.tech is a static Vite build of `apps/card`. It only shows the three bundled example briefs (fixtures f22, f06, f23). It never receives data from anyone's machine; the real card runs locally with `twotoe card` on 127.0.0.1:4777.

Host: DigitalOcean App Platform, static site. The spec is in [`.do/app.yaml`](../.do/app.yaml).

Sources checked on 2026-10-22:
- App spec reference: https://docs.digitalocean.com/products/app-platform/reference/app-spec/
- Node.js buildpack (pnpm, Node version): https://docs.digitalocean.com/products/app-platform/reference/buildpacks/nodejs/
- Monorepos: https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-monorepo/
- Custom domains: https://docs.digitalocean.com/products/app-platform/how-to/manage-domains/
- `doctl apps create`: https://docs.digitalocean.com/reference/doctl/reference/apps/create/

## 1. Build locally first

```powershell
pnpm install
pnpm --filter @twotoe/card build        # writes apps/card/dist
pnpm --filter @twotoe/card preview      # http://127.0.0.1:4173
```

To refresh the examples (uses the local model if Ollama is running, else the template):

```powershell
pnpm --filter @twotoe/card examples
```

## 2. Create the app

Either:
- Control panel: Create App, pick GitHub `T-RexBytes/twotoe`, branch `main`, then edit the generated spec to match `.do/app.yaml`, or
- CLI: `doctl apps create --spec .do/app.yaml` (later changes: add `--upsert --update-sources`).

What the build does, per the DigitalOcean docs:
- `pnpm-lock.yaml` at the repo root makes the Node buildpack use pnpm; `packageManager: pnpm@11.28.7` pins the exact version through Corepack.
- The Node version comes from `engines.node` in the root `package.json` (`^22.23.4 || ^24.22.1 || >=26.12.1`).
- The build runs from the repo root (the workspace lives there) and publishes `apps/card/dist`.

Not verified until the first deploy: whether the buildpack already offers Node 24.22.1 (released Oct 21). If the build fails on the Node version, the error names the versions it has; `^22.23.4` is also accepted by `engines`.

## 3. Point twotoe.tech at the app

1. Claim the free `.tech` domain from the Hacktoberfest promos page (hacktoberfest.com/my/promos). Suggested: `twotoe.tech`, fallbacks `twotoe-sloth.tech`, `sleepytriage.tech`.
2. In App Platform, open the app, then Networking, then Domains, then Add domain. Enter `twotoe.tech`, choose "You manage your domain", and copy the CNAME alias that ends in `ondigitalocean.app`. Repeat for `www.twotoe.tech` (the spec already lists both).
3. At the `.tech` registrar's DNS settings:
   - `www.twotoe.tech`: CNAME to the copied `...ondigitalocean.app` alias.
   - `twotoe.tech` (apex): a CNAME only works if the DNS provider supports CNAME flattening at the root. If it does not, use the A records App Platform shows in the Add domain dialog. The other option is to switch the domain's nameservers to `ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com` and let DigitalOcean manage DNS.
   - If the domain has CAA records, allow both `letsencrypt.org` and `pki.goog`, or certificates cannot be issued.
4. Back in App Platform, finish Add domain. DNS can take up to 72 hours to propagate; the dashboard shows progress. HTTPS: the spec sets `minimum_tls_version: "1.2"`. The docs do not describe certificate issuance for a plain custom domain beyond the CAA note, so check that `https://twotoe.tech` serves a valid certificate before linking it in the post.

## What the hosted page must not do

- No `curl | sh` installer (SPEC 11.5). TwoToe is a security tool; people should read the code, clone it, and run `pnpm install`.
- No analytics, fonts or scripts from other hosts. Fonts are bundled; the page fetches only its own files. `brief.json` does not exist on the hosted site, so the card falls back to the examples.
