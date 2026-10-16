# Deploying Bits & Gates (ModularCircuits+) to a VPS

The app runs as one Docker container: a single Node process where Express serves both the API (`/api`) and the built React client. The server's shared Caddy container sits in front of it and provides HTTPS. Sign-in is handled by Auth0, and the Free plan is enough.

Throughout, replace `your-tenant.us.auth0.com` with your Auth0 tenant domain.

## 1. Auth0 setup (once)

1. Create a free tenant at <https://auth0.com>.
2. **Applications → APIs → Create API**
   - Identifier (this is the *audience*): `https://modularcircuits-api`. It's a name, not a URL that must exist.
   - In the API's Settings, enable **Allow Offline Access** (needed for refresh tokens, which keep users signed in).
   - On the API's **Application Access** tab, authorize the SPA from the next step for **user access**, or set the user-access policy to Allow. Without this, sign-in fails with *Client "…" is not authorized to access resource server "https://modularcircuits-api"*. No client-credentials grant is needed.
3. **Applications → Applications → Create Application → Single Page Application**
   - Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins:
     `https://bitsandgates.com, http://localhost:5173` (`www` redirects to the bare domain, so it does not need its own entry)
   - Under Refresh Token Rotation, make sure **Rotation** is enabled.
   - Note the **Domain** and **Client ID**.
4. **Authentication → Social**: add Google, GitHub, Microsoft, and so on. For each one:
   - Create an OAuth app with that provider (e.g. Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type "Web application").
   - Set its authorized redirect URI to `https://your-tenant.us.auth0.com/login/callback`.
   - Paste its Client ID/Secret into Auth0. **Don't go live on Auth0's dev keys**: they are only for testing.
   - On the connection's **Applications** tab, enable it for your SPA.
5. Optional: if you want social sign-in only, disable the default *Username-Password-Authentication* database connection for the app.

## 2. DNS (once)

At your registrar, create these records for **bitsandgates.com**:

| Type | Name | Value |
|---|---|---|
| A | `@` | `46.62.222.239` |
| A | `www` | `46.62.222.239` |
| AAAA | `@` | `2a01:4f9:c014:8a83::1` |
| AAAA | `www` | `2a01:4f9:c014:8a83::1` |

Wait until `nslookup bitsandgates.com` returns those addresses before step 4. Caddy requests the HTTPS certificate as soon as the site file is loaded, and repeated failed attempts count against Let's Encrypt rate limits.

## 3. The server

The target is the Hetzner Cloud VPS in Helsinki, `ubuntu-8gb-hel1-1` (Ubuntu 24.04). It **also serves bexleytechnology.co.uk and other sites**, so nothing here touches their config:

- **Caddy** runs in Docker as `site-caddy` (`~/site-deploy/docker-compose.yml`). It owns ports 80/443, gets TLS certificates automatically, and imports one file per site from `~/site-deploy/sites/*.caddy`. No nginx or certbot is involved.
- **Apps** run as separate hardened containers on Caddy's Docker network, `site-deploy_default`, with no published ports. Bits & Gates follows the same pattern as `bexley-quote`.
- **Access:** SSH is only reachable over the VPN at `10.10.0.1` (user `iyad`). A firewall in front of the server allows only 80/443 publicly.

## 4. First deployment

On the server (`ssh 10.10.0.1`):

```bash
mkdir -p ~/site-deploy/bits-and-gates/data
cd ~/site-deploy/bits-and-gates
git clone https://github.com/iyad/ModularCircuitsPlus.git src

cp src/deploy/compose.yml .
cp src/deploy/app.env.example .env        # then fill in the Auth0 values from step 1
nano .env

APP_TAG=$(git -C src rev-parse --short HEAD) docker compose up -d --build
docker compose ps                          # wait for "(healthy)"
docker compose logs --tail 20              # expect "auth enabled"
```

On first start the container copies the starter library from the image into `data/circuits.db`. After that, the live database in `data/` is never overwritten by deploys.

Once DNS resolves (step 2), add the site to Caddy and reload it. Reloading is graceful: the other sites stay up.

```bash
cp src/deploy/bitsandgates.caddy ~/site-deploy/sites/
docker exec site-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec site-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker logs site-caddy --since 2m 2>&1 | grep -i bitsandgates   # look for "certificate obtained"
```

Then open <https://bitsandgates.com>.

## 5. Updating

```bash
cd ~/site-deploy/bits-and-gates
git -C src pull
APP_TAG=$(git -C src rev-parse --short HEAD) docker compose up -d --build
```

Each release is tagged with its commit, so the previous image stays available. To roll back, run `APP_TAG=<previous-commit> docker compose up -d` (without `--build`); `docker images bits-and-gates` lists the tags. If `deploy/compose.yml` or `deploy/bitsandgates.caddy` changed, copy them again as in step 4. After changing the Caddy file, validate and reload.

## 6. Starter library and admins

- Circuits whose `owner_id` is NULL form the shared **starter library**. Everyone sees them, including guests. Signed-in users can open them and "Save a Copy" into their own circuits.
- To edit the live library, put your Auth0 user id in `ADMIN_USER_IDS` in `.env`, e.g. `google-oauth2|1234567890`. Find it under User Management → Users. Then run `docker compose up -d`.
- Local dev without Auth0 configured writes straight into the library in the repo's `circuits.db`. That copy only reaches production on the very first start, never on later deploys.

## 7. Backups

SQLite runs in WAL mode, so use its online backup API rather than copying the file:

```bash
cd ~/site-deploy/bits-and-gates
docker exec -w /app/packages/server bits-and-gates node -e \
  "new (require('better-sqlite3'))('/data/circuits.db').backup('/data/backup.db').then(() => console.log('ok'))"
mv data/backup.db ~/site-deploy/backups/bitsandgates-$(date +%F).db
```

Run that from a daily cron job and copy the backups off the server.
