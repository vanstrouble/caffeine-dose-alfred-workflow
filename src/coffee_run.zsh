#!/bin/zsh --no-rcs

# Use hotkey_value if provided, otherwise use first argument
INPUT="${hotkey_value:-$1}"

# Default value for display_sleep_allow if not set
local display_sleep_allow=${display_sleep_allow:-false}

if [[ "$INPUT" == "off" ]]; then
    # Kill all caffeinate processes
    pkill -x "caffeinate" 2>/dev/null
    echo "Caffeinate deactivated."
elif [[ "$INPUT" == "on" ]]; then
    # Kill any previous instance to ensure a clean execution
    pkill -x "caffeinate" 2>/dev/null

    # Start caffeinate with appropriate flags using nohup
    if [[ "$display_sleep_allow" == "true" ]]; then
        # Allow display to sleep (-i prevents idle sleep only)
        nohup caffeinate -i >/dev/null 2>&1 &
    else
        # Prevent both idle sleep and display sleep
        nohup caffeinate -d -i >/dev/null 2>&1 &
    fi

    # Build display message efficiently
    local display_text=""
    [[ "$display_sleep_allow" == "true" ]] && display_text=" (display can sleep)"
    echo "Caffeinate activated${display_text}."
else
    echo "Error: Invalid input. Use 'on' or 'off'."
    exit 1
fi
