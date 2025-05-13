#!/bin/bash

# Function to calculate the end time based on the given minutes
calculate_end_time() {
    local minutes=$1

    # Check Alfred variable for time format preference
    if [[ "${alfred_time_format:-a}" == "a" ]]; then
        # 12-hour format with AM/PM
        date -v+"$minutes"M +"%l:%M %p" | sed 's/^ //'
    else
        # 24-hour format
        date -v+"$minutes"M +"%H:%M"
    fi
}

# Function to extract hour and minute from TIME:HH:MM format
parse_time_format() {
    local time_str=$1

    # Remove the TIME: prefix
    time_str=${time_str#TIME:}

    # Extract hour and minute directly
    local hour=${time_str%%:*}
    local minute=${time_str#*:}

    # Validate input - purely numeric and in range
    if [[ ! "$hour" =~ ^[0-9]+$ || ! "$minute" =~ ^[0-9]+$ || "$hour" -gt 23 || "$minute" -gt 59 ]]; then
        echo "Error: Invalid time format: $time_str" >&2
        exit 1
    fi

    # Return as space-separated values
    echo "$hour $minute"
}

# Function to calculate minutes until target time
calculate_minutes_until_target() {
    local hour=$1
    local minute=$2

    # Get current time
    local current_hour=$(date +"%H")
    local current_minute=$(date +"%M")

    # Calculate total minutes
    local target_minutes=$(( hour * 60 + minute ))
    local current_minutes=$(( current_hour * 60 + current_minute ))
    local duration_minutes=$(( target_minutes - current_minutes ))

    # If target time is earlier than current time, add 24 hours
    [[ $duration_minutes -le 0 ]] && duration_minutes=$(( duration_minutes + 1440 ))

    echo "$duration_minutes"
}

# Function to format time for display
format_display_time() {
    local hour=$1
    local minute=$2
    local time_format=${3:-a}

    local display_time

    if [[ "$time_format" == "a" ]]; then
        # 12-hour format
        if [[ "$hour" -gt 12 ]]; then
            display_time="$((hour-12)):${minute} PM"
        elif [[ "$hour" -eq 12 ]]; then
            display_time="12:${minute} PM"
        elif [[ "$hour" -eq 0 ]]; then
            display_time="12:${minute} AM"
        else
            display_time="${hour}:${minute} AM"
        fi

        # Ensure minutes have leading zero if needed
        [[ ${#minute} -eq 1 ]] && display_time="${display_time/\:$minute/\:0$minute}"
    else
        # 24-hour format
        [[ ${#hour} -eq 1 ]] && hour="0$hour"
        [[ ${#minute} -eq 1 ]] && minute="0$minute"
        display_time="${hour}:${minute}"
    fi

    echo "$display_time"
}

# Function to print output message based on display sleep setting
output_message() {
    local message=$1
    local approximate=$2
    local allow_display_sleep=$3

    local prefix="Keeping awake"
    local suffix

    if [[ "$allow_display_sleep" == "true" ]]; then
        suffix=". (Display can sleep)"
    else
        suffix="."
    fi

    if [[ -n "$approximate" && "$approximate" == "true" ]]; then
        echo "${prefix} until around ${message}${suffix}"
    else
        echo "${prefix} until ${message}${suffix}"
    fi
}

# Function to print indefinite output message based on display sleep setting
output_indefinite_message() {
    local allow_display_sleep=$1

    if [[ "$allow_display_sleep" == "true" ]]; then
        echo "Keeping awake indefinitely. (Display can sleep)"
    else
        echo "Keeping awake indefinitely."
    fi
}

# Function to ensure no other caffeinate processes are running
kill_existing_caffeinate() {
    pkill -x "caffeinate" 2>/dev/null
}

# Function to start a caffeinate session with specific duration
start_caffeinate_session() {
    local total_minutes=$1
    local allow_display_sleep=$2

    # Ensure the minutes are a valid number and greater than 0
    if [[ ! "$total_minutes" =~ ^[0-9]+$ || "$total_minutes" -eq 0 ]]; then
        echo "Error: Invalid duration: $total_minutes minutes" >&2
        exit 1
    fi

    # Convert minutes to seconds for caffeinate
    local total_seconds=$(( total_minutes * 60 ))

    # Kill any existing caffeinate processes
    kill_existing_caffeinate

    # Start caffeinate with appropriate flags
    if [[ "$allow_display_sleep" == "true" ]]; then
        # Allow display to sleep (-i prevents idle sleep only)
        nohup caffeinate -i -t "$total_seconds" >/dev/null 2>&1 &
    else
        # Prevent both idle sleep and display sleep
        nohup caffeinate -d -i -t "$total_seconds" >/dev/null 2>&1 &
    fi
}

# Function to start an indefinite caffeinate session
start_indefinite_session() {
    local allow_display_sleep=$1

    # Kill any existing caffeinate processes
    kill_existing_caffeinate

    # Start caffeinate with appropriate flags for indefinite duration
    if [[ "$allow_display_sleep" == "true" ]]; then
        # Allow display to sleep (-i prevents idle sleep only)
        nohup caffeinate -i >/dev/null 2>&1 &
    else
        # Prevent both idle sleep and display sleep
        nohup caffeinate -d -i >/dev/null 2>&1 &
    fi

    output_indefinite_message "$allow_display_sleep"
}

# Function to handle target time input
handle_target_time() {
    local target_time=$1
    local allow_display_sleep=$2

    # Extract hour and minute
    read -r hour minute <<< "$(parse_time_format "$target_time")"

    # Calculate minutes until target time
    local duration_minutes=$(calculate_minutes_until_target "$hour" "$minute")

    # Start the caffeinate session
    start_caffeinate_session "$duration_minutes" "$allow_display_sleep"

    # Format time for display
    local display_time=$(format_display_time "$hour" "$minute" "${alfred_time_format:-a}")

    # Output result message
    output_message "$display_time" "false" "$allow_display_sleep"
}

# Function to handle minute duration input
handle_duration() {
    local minutes=$1
    local allow_display_sleep=$2

    # Calculate end time for display
    local end_time=$(calculate_end_time "$minutes")

    # Start the caffeinate session
    start_caffeinate_session "$minutes" "$allow_display_sleep"

    # Output result message using the common function
    output_message "$end_time" "true" "$allow_display_sleep"
}

# Main function
main() {
    # Default value for display_sleep_allow if not set
    display_sleep_allow=${display_sleep_allow:-false}

    # Handle different input types from the Filter Script
    if [[ "$INPUT" == "0" ]]; then
        echo "Error: Invalid input. Please provide a valid duration."
        exit 1
    elif [[ "$INPUT" == "indefinite" ]]; then
        start_indefinite_session "$display_sleep_allow"
    elif [[ "$INPUT" == "status" ]]; then
        # Just for completeness - status is handled in the filter script
        if pgrep -x "caffeinate" >/dev/null; then
            echo "Caffeinate is active."
        else
            echo "Caffeinate is not active."
        fi
    elif [[ "$INPUT" == TIME:* ]]; then
        handle_target_time "$INPUT" "$display_sleep_allow"
    elif [[ "$INPUT" =~ ^[0-9]+$ ]]; then
        handle_duration "$INPUT" "$display_sleep_allow"
    fi
}

INPUT="$1"
main
