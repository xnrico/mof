# Synology deployment

This deployment is intended to live at `/volume1/docker/mof-webapp` on the
Synology. The same folder may be accessed from another computer as
`smb://rico-synology.local/docker/mof-webapp`.

PostgreSQL data is stored in `data/postgres` on the Synology's local
filesystem. Do not run PostgreSQL against a CIFS/SMB mount hosted by another
machine.

## Initial configuration

```sh
cp .env.example .env
cp config/backend.env.example config/backend.env
./scripts/set-github-pat.sh
chmod 600 .env config/backend.env
```

Use a fine-grained, read-only GitHub PAT restricted to the `xnrico/mof`
repository. Update `.env` with a strong URL-safe PostgreSQL password and copy
the old host's `mof-webapp/backend/.env` values into `config/backend.env`.
Do not set `DATABASE_URL` in `config/backend.env`; Compose supplies it.

## Database migration

On the old host, from the repository root:

```sh
./mof-webapp/deploy/synology/scripts/export-current-db.sh
```

Copy this `deploy/synology` directory, including the generated dump and the
untracked configuration files, to the Synology destination. On the Synology:

```sh
cd /volume1/docker/mof-webapp
sudo ./scripts/restore-db.sh backups/mof-TIMESTAMP.dump
```

The restore script recreates the target database. Only use it during the
migration or when intentionally replacing all target data.

Synology Container Manager normally exposes its Docker socket only to root,
so the deployment commands use `sudo`. The scripts automatically locate the
Container Manager Docker CLI even when `/usr/local/bin` is absent from SSH's
non-interactive `PATH`.

## Start and update

```sh
sudo ./scripts/start.sh
```

Every backend or frontend container start performs an authenticated fetch and
hard reset to `origin/$GIT_BRANCH`. Restart both application containers to
deploy the latest commit without restarting PostgreSQL:

```sh
sudo ./scripts/refresh.sh
```

The frontend is available on port `3000` and the backend on port `8000` by
default. Override `FRONTEND_PORT` or `BACKEND_PORT` in `.env` if needed.

## Security notes

- Never commit `.env`, `config/backend.env`, database dumps, or the PAT file.
- Use a fine-grained PAT with read-only Contents access and an expiry date.
- The PAT is supplied as a Docker secret and is not embedded in the Git URL.
- Restrict ports `3000` and `8000` with the Synology firewall or reverse proxy.
