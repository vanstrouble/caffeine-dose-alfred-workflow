#!/bin/zsh --no-rcs

allow_sleep="false"
case "${hotkey_allow_sleep:l}" in
    true|1|yes|on)
        allow_sleep="true"
        ;;
esac

if pgrep -x "caffeinate" >/dev/null 2>&1; then
    echo "{\"alfredworkflow\":{\"arg\":\"deactivate\",\"variables\":{\"display_sleep_allow\":\"$allow_sleep\"}}}"
else
    echo "{\"alfredworkflow\":{\"arg\":\"indefinite\",\"variables\":{\"display_sleep_allow\":\"$allow_sleep\"}}}"
fi
