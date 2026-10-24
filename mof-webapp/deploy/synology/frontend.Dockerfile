FROM node:20-alpine

RUN apk add --no-cache git nginx

COPY scripts/git-sync.sh /usr/local/bin/git-sync
COPY scripts/frontend-entrypoint.sh /usr/local/bin/frontend-entrypoint

RUN chmod +x /usr/local/bin/git-sync /usr/local/bin/frontend-entrypoint \
    && mkdir -p /run/nginx /usr/share/nginx/html

ENTRYPOINT ["/usr/local/bin/frontend-entrypoint"]
