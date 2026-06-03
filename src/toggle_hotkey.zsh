#!/bin/zsh --no-rcs

if pgrep -x "caffeinate" >/dev/null 2>&1; then
    echo -n "deactivate"
else
    echo -n "indefinite"
fi
