#!/usr/bin/env sh
set -eu

conf_file="frontend/nginx.conf"

grep -Eq "^\\s*location /api/" "$conf_file"
grep -Eq "proxy_pass\\s+http://backend:8000" "$conf_file"
grep -Eq "client_max_body_size\\s+16m" "$conf_file"

echo "nginx production API proxy config checks passed."
