# Deploying Bits & Gates (ModularCircuits+) to a VPS

The production setup is a single Node process. Express serves both the API (`/api`) and the built React client from one origin. nginx sits in front of it to provide HTTPS. Sign-in is handled by Auth0, and the Free plan is enough.

These steps assume Ubuntu/Debian and the domain `bitsandgates.com`. Replace `your-tenant.us.auth0.com` with your Auth0 tenant domain.

## 1. Auth0 setup (once)

1. Create a free tenant at <https://auth0.com>.
2. **Applications → APIs → Create API**
   - Identifier (this is the *audience*): `https://modularcircuits-api`. It's a name, not a URL that must exist.
   - In the API's Settings, enable **Allow Offline Access** (needed for refresh tokens, which keep users signed in).
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

## 2. Server preparation (once)

```bash
# Node 22 + pnpm
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git
sudo corepack enable

# Service user, code, and data directories
sudo useradd --system --home /opt/modularcircuits --shell /usr/sbin/nologin modularcircuits
sudo git clone <your-repo-url> /opt/modularcircuits
sudo mkdir -p /var/lib/modularcircuits /etc/modularcircuits

# Seed the live database with the starter library committed in the repo
sudo cp /opt/modularcircuits/circuits.db /var/lib/modularcircuits/circuits.db
sudo chown -R modularcircuits: /opt/modularcircuits /var/lib/modularcircuits
```

Configure and build:

```bash
cd /opt/modularcircuits
sudo -u modularcircuits cp packages/client/.env.example packages/client/.env   # then edit the three values
sudo -u modularcircuits pnpm install --frozen-lockfile
sudo -u modularcircuits pnpm build

sudo cp deploy/server.env.example /etc/modularcircuits/server.env             # then edit it
sudo chmod 640 /etc/modularcircuits/server.env && sudo chown root:modularcircuits /etc/modularcircuits/server.env
```

Run it as a service, then put nginx and HTTPS in front:

```bash
sudo cp deploy/modularcircuits.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now modularcircuits
sudo journalctl -u modularcircuits -f      # expect "auth enabled"

sudo cp deploy/nginx.conf /etc/nginx/sites-available/modularcircuits
sudo ln -s /etc/nginx/sites-available/modularcircuits /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bitsandgates.com -d www.bitsandgates.com
```

At your registrar, add DNS `A` records for `bitsandgates.com` and `www.bitsandgates.com` pointing to the VPS's IP address (plus `AAAA` records if it has IPv6), and wait until `dig +short bitsandgates.com` returns that IP before running certbot. Keep port 3001 closed to the internet (e.g. `sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable`). Only nginx should reach the app.

## 3. Updating

```bash
cd /opt/modularcircuits
sudo -u modularcircuits git pull
sudo -u modularcircuits pnpm install --frozen-lockfile
sudo -u modularcircuits pnpm build
sudo systemctl restart modularcircuits
```

The live database at `DB_PATH` isn't touched by updates. Schema migrations run automatically when the server starts.

## 4. Starter library and admins

- Circuits whose `owner_id` is NULL form the shared **starter library**. Everyone sees them, including guests. Signed-in users can open them and "Save a Copy" into their own circuits.
- To edit the live library, set `ADMIN_USER_IDS` in `server.env` to your Auth0 user id, e.g. `google-oauth2|1234567890`. Find it under User Management → Users. Then restart the service.
- Local dev without Auth0 configured writes straight into the library in the repo's `circuits.db`. That copy only reaches production on the first deploy (the seeding step above), never on later updates.

## 5. Backups

SQLite runs in WAL mode, so copy it with the online backup command rather than `cp`:

```bash
sudo apt install -y sqlite3
sudo -u modularcircuits sqlite3 /var/lib/modularcircuits/circuits.db ".backup '/var/lib/modularcircuits/backup-$(date +%F).db'"
```

Put that in a daily cron job and copy the backups off the server.
