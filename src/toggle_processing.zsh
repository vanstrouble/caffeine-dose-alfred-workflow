#!/bin/zsh --no-rcs

# Use hotkey_value if provided, otherwise use first argument
INPUT="${hotkey_value:-$1}"

# Default for allowing display sleep
local display_sleep_allow=${display_sleep_allow:-false}

# Send notifications using notificator
function notification {
    if [[ -n "$2" ]]; then
        ./notificator --message "${1}" --title "${alfred_workflow_name}" --sound "$2"
    else
        ./notificator --message "${1}" --title "${alfred_workflow_name}"
    fi
}

if [[ "$INPUT" == "off" ]]; then
    # Stop all caffeinate processes
    pkill -x "caffeinate" 2>/dev/null
    notification "Caffeinate deactivated" "Boop"
elif [[ "$INPUT" == "on" ]]; then
    # Ensure no existing caffeinate processes to avoid duplicates
    pkill -x "caffeinate" 2>/dev/null

    # Start caffeinate with appropriate flags using nohup
    if [[ "$display_sleep_allow" == "true" ]]; then
        # Allow display to sleep; prevent only idle sleep (-i)
        nohup caffeinate -i >/dev/null 2>&1 &
        notification "Caffeinate activated indefinitely (display can sleep)"
    else
        # Prevent both idle and display sleep
        nohup caffeinate -d -i >/dev/null 2>&1 &
        notification "Caffeinate activated indefinitely"
    fi
else
    notification "Error: Invalid input. Use 'on' or 'off'"
    exit 1
fi
