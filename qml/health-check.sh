#!/bin/bash
# Liveness probe for a wireless ADB endpoint. Exits as soon as a TCP connect
# to the phone's ADB port fails or the probe itself hangs.

serial="$1"
ip="${serial%:*}"
port="${serial##*:}"

while true; do
    if ! timeout 10 bash -c 'exec 3<>/dev/tcp/"$0"/"$1"' "$ip" "$port" >/dev/null 2>&1; then
        exit 1
    fi
    sleep 15
done
