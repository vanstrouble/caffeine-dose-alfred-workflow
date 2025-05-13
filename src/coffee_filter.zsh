#!/bin/zsh --no-rcs

if pgrep -x "caffeinate" >/dev/null 2>&1; then
    echo '{"items":[{"title":"Turn Off","subtitle":"Allow computer to sleep","arg":"off","icon":{"path":"icon.png"}}]}'
else
    echo '{"items":[{"title":"Turn On","subtitle":"Prevent sleep indefinitely","arg":"on","icon":{"path":"icon.png"}}]}'
fi
