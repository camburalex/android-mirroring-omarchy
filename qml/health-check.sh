#!/bin/bash
# Liveness probe for a wireless ADB endpoint. Exits as soon as a TCP connect
# to the phone's ADB port fails or the probe itself hangs.
#
# Each operation (TCP probe or sleep) is started as a background job under
# job control, which gives it its own process group. The helper's PID for the
# active child is therefore also the child's process group ID. Signal handlers
# clean up only that exact process group, so no unrelated process is ever
# targeted.

# Disable the bash 'kill' builtin so negative process-group IDs are handled
# by the real util-linux 'kill' command.
enable -n kill

# Enable job control so every backgrounded child gets its own process group.
set -m

serial="$1"
ip="${serial%:*}"
port="${serial##*:}"

active_child=""
interrupted=0

reap_child() {
    if [ -n "$active_child" ]; then
        # Terminate the exact process group the helper created.
        kill -TERM -- -"$active_child" 2>/dev/null

        # Short, bounded grace period, then a forced KILL if TERM is ignored.
        local i=0
        while kill -0 -- -"$active_child" 2>/dev/null && [ $i -lt 10 ]; do
            sleep 0.1
            i=$((i + 1))
        done
        if kill -0 -- -"$active_child" 2>/dev/null; then
            kill -KILL -- -"$active_child" 2>/dev/null
            while kill -0 -- -"$active_child" 2>/dev/null && [ $i -lt 15 ]; do
                sleep 0.1
                i=$((i + 1))
            done
        fi
        wait "$active_child" 2>/dev/null
        active_child=""
    fi
}

cleanup() {
    interrupted=1
    reap_child
    exit 130
}
trap cleanup TERM INT HUP

while true; do
    # Probe: attempt a TCP connect with a finite 10-second deadline and a
    # short forced-kill escalation. The endpoints are passed positionally;
    # they are not interpolated into the executable shell source.
    timeout --kill-after=2s 10s bash -c 'exec 3<>/dev/tcp/"$1"/"$2"; exec 3<&-' probe "$ip" "$port" >/dev/null 2>&1 &
    active_child=$!
    wait "$active_child"
    probe_rc=$?
    active_child=""
    if [ $probe_rc -ne 0 ]; then
        if [ "$interrupted" -ne 0 ]; then
            exit 130
        fi
        exit 1
    fi

    # Successful-probe cadence.
    sleep 15 &
    active_child=$!
    wait "$active_child"
    sleep_rc=$?
    active_child=""
    if [ $sleep_rc -ne 0 ]; then
        if [ "$interrupted" -ne 0 ]; then
            exit 130
        fi
        # A sleep failure is unexpected; treat it like a failed probe.
        exit 1
    fi
done
