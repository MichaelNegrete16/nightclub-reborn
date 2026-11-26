# Caddy with the DuckDNS plugin: it gets and renews the https certificate through DuckDNS (DNS challenge), so it never needs port 80.
FROM caddy:2-builder AS build
RUN xcaddy build --with github.com/caddy-dns/duckdns
FROM caddy:2
COPY --from=build /usr/bin/caddy /usr/bin/caddy
