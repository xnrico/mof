FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc git postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY scripts/git-sync.sh /usr/local/bin/git-sync
COPY scripts/backend-entrypoint.sh /usr/local/bin/backend-entrypoint

RUN chmod +x /usr/local/bin/git-sync /usr/local/bin/backend-entrypoint

ENTRYPOINT ["/usr/local/bin/backend-entrypoint"]
