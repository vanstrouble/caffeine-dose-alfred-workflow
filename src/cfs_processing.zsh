#!/bin/zsh --no-rcs

# Function to send notifications using notificator
function notification {
    if [[ -n "$2" ]]; then
        ./notificator --message "${1}" --title "${alfred_workflow_name}" --sound "$2"
    else
        ./notificator --message "${1}" --title "${alfred_workflow_name}"
    fi
}

# Calculate end time by adding minutes to current time
calculate_end_time() {
    local minutes=$1

    if [[ "${alfred_time_format:-a}" == "a" ]]; then
        # 12-hour format with AM/PM
        local time_output=$(date -v+"$minutes"M +"%l:%M %p")
        echo "${time_output# }"
    else
        # 24-hour format
        date -v+"$minutes"M +"%H:%M"
    fi
}

# Extract and validate hour and minute from TIME:HH:MM format
parse_time_format() {
    local time_str=$1

    time_str=${time_str#TIME:}
    local hour=${time_str%%:*}
    local minute=${time_str#*:}

    if [[ ! "$hour" =~ ^[0-9]+$ || ! "$minute" =~ ^[0-9]+$ || "$hour" -gt 23 || "$minute" -gt 59 ]]; then
        notification "Error: Invalid time format: $time_str"
        exit 1
    fi

    echo "$hour $minute"
}

# Calculate minutes from now until target time (handles next-day wrap)
calculate_minutes_until_target() {
    local hour=$1
    local minute=$2

    local current_time_data=$(date +"%H:%M")
    local current_hour=${current_time_data%:*}
    local current_minute=${current_time_data#*:}

    local target_minutes=$(( hour * 60 + minute ))
    local current_minutes=$(( current_hour * 60 + current_minute ))
    local duration_minutes=$(( target_minutes - current_minutes ))

    # Add 24 hours if target time is earlier (next day)
    [[ $duration_minutes -le 0 ]] && duration_minutes=$(( duration_minutes + 1440 ))

    echo "$duration_minutes"
}

# Format time for display based on user preference
format_display_time() {
    local hour=$1
    local minute=$2
    local time_format=${3:-a}

    local formatted_minute=$(printf "%02d" "$minute")

    if [[ "$time_format" == "a" ]]; then
        if [[ $hour -gt 12 ]]; then
            echo "$((hour-12)):${formatted_minute} PM"
        elif [[ $hour -eq 12 ]]; then
            echo "12:${formatted_minute} PM"
        elif [[ $hour -eq 0 ]]; then
            echo "12:${formatted_minute} AM"
        else
            echo "${hour}:${formatted_minute} AM"
        fi
    else
        local formatted_hour=$(printf "%02d" "$hour")
        echo "${formatted_hour}:${formatted_minute}"
    fi
}

# Generate and send notification message
output_message() {
    local message=$1
    local approximate=$2
    local allow_display_sleep=$3

    local prefix="Keeping awake"
    local time_part
    local suffix

    if [[ "$message" == "indefinitely" ]]; then
        time_part="indefinitely"
    elif [[ "$approximate" == "true" ]]; then
        time_part="until around $message"
    else
        time_part="until $message"
    fi

    if [[ "$allow_display_sleep" == "true" ]]; then
        suffix=". (Display can sleep)"
    else
        suffix="."
    fi

    notification "${prefix} ${time_part}${suffix}"
}

# Kill existing caffeinate processes and their wrapper subshells
kill_existing_caffeinate() {
    pkill -f "caffeinate.*-[idt]" 2>/dev/null
    pkill -f "trap.*exit.*caffeinate" 2>/dev/null
}

# Start timed caffeinate session
start_caffeinate_session() {
    local total_minutes=$1
    local allow_display_sleep=$2

    if [[ ! "$total_minutes" =~ ^[0-9]+$ || "$total_minutes" -eq 0 ]]; then
        notification "Error: Invalid duration: $total_minutes minutes"
        exit 1
    fi

    local total_seconds=$(( total_minutes * 60 ))
    kill_existing_caffeinate

    # Background subshell prevents false notifications when interrupted
    (
        if [[ "$allow_display_sleep" == "true" ]]; then
            caffeinate -i -t "$total_seconds"
        else
            caffeinate -d -i -t "$total_seconds"
        fi
        # Only notify on natural completion (exit code 0)
        if [[ $? -eq 0 ]]; then
            notification "Caffeinate session ended" "Boop"
        fi
    ) &
}

# Start indefinite caffeinate session
start_indefinite_session() {
    local allow_display_sleep=$1

    kill_existing_caffeinate

    (
        if [[ "$allow_display_sleep" == "true" ]]; then
            caffeinate -i
        else
            caffeinate -d -i
        fi
        if [[ $? -eq 0 ]]; then
            notification "Caffeinate session ended" "Boop"
        fi
    ) &

    output_message "indefinitely" "false" "$allow_display_sleep"
}

# Handle TIME:HH:MM input format
handle_target_time() {
    local target_time=$1
    local allow_display_sleep=$2

    read -r hour minute <<< "$(parse_time_format "$target_time")"
    local duration_minutes=$(calculate_minutes_until_target "$hour" "$minute")

    start_caffeinate_session "$duration_minutes" "$allow_display_sleep"

    local display_time=$(format_display_time "$hour" "$minute" "${alfred_time_format:-a}")
    output_message "$display_time" "false" "$allow_display_sleep"
}

# Handle numeric minute duration input
handle_duration() {
    local minutes=$1
    local allow_display_sleep=$2

    local end_time=$(calculate_end_time "$minutes")
    start_caffeinate_session "$minutes" "$allow_display_sleep"
    output_message "$end_time" "true" "$allow_display_sleep"
}

# Main processing logic
main() {
    if [[ "$INPUT" == "0" ]]; then
        notification "Error: Invalid input. Please provide a valid duration."
        exit 1
    fi

    # Default value for display_sleep_allow if not set
    local display_sleep_allow=${display_sleep_allow:-false}

    # Handle different input types from the Filter Script with early returns
    if [[ "$INPUT" == "indefinite" ]]; then
        start_indefinite_session "$display_sleep_allow"
        return
    fi

    if [[ "$INPUT" == "status" ]]; then
        # Just for completeness - status is handled in the filter script
        if pgrep -x "caffeinate" >/dev/null; then
            notification "Caffeinate is active."
        else
            notification "Caffeinate is not active."
        fi
        return
    fi

    if [[ "$INPUT" == TIME:* ]]; then
        handle_target_time "$INPUT" "$display_sleep_allow"
        return
    fi

    if [[ "$INPUT" =~ ^[0-9]+$ ]]; then
        handle_duration "$INPUT" "$display_sleep_allow"
        return
    fi

    # If we get here, input is invalid
    notification "Error: Invalid input format: $INPUT"
    exit 1
}

INPUT="$1"
main
