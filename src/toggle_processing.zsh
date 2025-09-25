#!/bin/zsh --no-rcs

# Use hotkey_value if provided, otherwise use first argument
INPUT="${hotkey_value:-$1}"

# Default value for display_sleep_allow if not set
local display_sleep_allow=${display_sleep_allow:-false}

# Function to send notifications using notificator
function notification {
    if [[ -n "$2" ]]; then
        ./notificator --message "${1}" --title "${alfred_workflow_name}" --sound "$2"
    else
        ./notificator --message "${1}" --title "${alfred_workflow_name}"
    fi
}

if [[ "$INPUT" == "off" ]]; then
    # Kill all caffeinate processes
    pkill -x "caffeinate" 2>/dev/null
    notification "Caffeinate deactivated" "Boop"
elif [[ "$INPUT" == "on" ]]; then
    # Kill any previous instance to ensure a clean execution
    pkill -x "caffeinate" 2>/dev/null

    # Start caffeinate with appropriate flags using nohup
    if [[ "$display_sleep_allow" == "true" ]]; then
        # Allow display to sleep (-i prevents idle sleep only)
        nohup caffeinate -i >/dev/null 2>&1 &
        notification "Caffeinate activated (display can sleep)"
    else
        # Prevent both idle sleep and display sleep
        nohup caffeinate -d -i >/dev/null 2>&1 &
        notification "Caffeinate activated"
    fi
else
    notification "Error: Invalid input. Use 'on' or 'off'"
    exit 1
fi
