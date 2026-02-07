#!/bin/zsh --no-rcs

if pgrep -x "caffeinate" >/dev/null 2>&1; then
    echo '{"items":[{"title":"Turn Off","subtitle":"Allow computer to sleep","arg":"deactivate","icon":{"path":"icon.png"}}]}'
else
    echo '{"items":[{"title":"Turn On","subtitle":"Prevent sleep indefinitely","arg":"indefinite","icon":{"path":"icon.png"},"mods":{"cmd":{"subtitle":"⌘ Allow display sleep","arg":"indefinite","variables":{"display_sleep_allow":"true"}}}}]}'
fi
