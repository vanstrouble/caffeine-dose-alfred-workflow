#!/bin/zsh --no-rcs

# Function to calculate the end time based on the given minutes
calculate_end_time() {
    local minutes=$1

    # Check Alfred variable for time format preference and calculate in single call
    if [[ "${alfred_time_format:-a}" == "a" ]]; then
        # 12-hour format with AM/PM - avoid pipe and sed
        local time_output=$(date -v+"$minutes"M +"%l:%M %p")
        echo "${time_output# }"  # Remove leading space with parameter expansion
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

    # Get current time in single call for efficiency
    local current_time_data=$(date +"%H:%M")
    local current_hour=${current_time_data%:*}
    local current_minute=${current_time_data#*:}

    # Calculate total minutes efficiently
    local target_minutes=$(( hour * 60 + minute ))
    local current_minutes=$(( current_hour * 60 + current_minute ))
    local duration_minutes=$(( target_minutes - current_minutes ))

    # If target time is earlier than current time, add 24 hours
    [[ $duration_minutes -le 0 ]] && duration_minutes=$(( duration_minutes + 1440 ))

    echo "$duration_minutes"
}

# Function to format time for display - optimized with parameter expansion
format_display_time() {
    local hour=$1
    local minute=$2
    local time_format=${3:-a}

    # Ensure minute has leading zero using printf for efficiency
    local formatted_minute=$(printf "%02d" "$minute")

    if [[ "$time_format" == "a" ]]; then
        # 12-hour format with efficient conditionals
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
        # 24-hour format with leading zeros
        local formatted_hour=$(printf "%02d" "$hour")
        echo "${formatted_hour}:${formatted_minute}"
    fi
}

# Function to generate output message based on display sleep setting
output_message() {
    local message=$1
    local approximate=$2
    local allow_display_sleep=$3

    # Build message components efficiently
    local prefix="Keeping awake"
    local time_part
    local suffix

    # Handle different message types
    if [[ "$message" == "indefinitely" ]]; then
        time_part="indefinitely"
    elif [[ "$approximate" == "true" ]]; then
        time_part="until around $message"
    else
        time_part="until $message"
    fi

    # Handle display sleep status
    if [[ "$allow_display_sleep" == "true" ]]; then
        suffix=". (Display can sleep)"
    else
        suffix="."
    fi

    echo "${prefix} ${time_part}${suffix}"
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

    output_message "indefinitely" "false" "$allow_display_sleep"
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
    # Early return for invalid input
    if [[ "$INPUT" == "0" ]]; then
        echo "Error: Invalid input. Please provide a valid duration."
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
            echo "Caffeinate is active."
        else
            echo "Caffeinate is not active."
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
    echo "Error: Invalid input format: $INPUT"
    exit 1
}

INPUT="$1"
main
