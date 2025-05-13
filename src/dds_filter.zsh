#!/bin/zsh --no-rcs

# Function to calculate the end time based on the given minutes
calculate_end_time() {
    local minutes=$1

    # Check Alfred variable for time format preference
    # 'a' is 12-hour format, 'b' is 24-hour format
    if [[ "${alfred_time_format:-a}" == "a" ]]; then
        # 12-hour format with AM/PM including seconds
        date -v+"$minutes"M +"%l:%M:%S %p" | sed 's/^ //'
    else
        # 24-hour format including seconds
        date -v+"$minutes"M +"%H:%M:%S"
    fi
}

# Function to get the nearest future time based on input hour and minute
get_nearest_future_time() {
    local hour=$1
    local minute=$2
    local current_hour=$3
    local current_minute=$4

    # Calculate current time in minutes since midnight (once instead of twice)
    local current_total=$(( current_hour * 60 + current_minute ))

    # Special handling for hour 12 and conversion to AM/PM using shorter syntax
    local am_hour=$hour
    local pm_hour=$hour
    [[ $hour -eq 12 ]] && am_hour=0  # 12 AM is actually 0 in 24-hour format
    [[ $hour -lt 12 ]] && pm_hour=$(( hour + 12 ))

    # Calculate minutes for AM and PM interpretations
    local am_total=$(( am_hour * 60 + minute ))
    local pm_total=$(( pm_hour * 60 + minute ))

    # Calculate differences once
    local am_diff=$(( am_total - current_total ))
    local pm_diff=$(( pm_total - current_total ))

    # Use the same logic but with pre-calculated differences
    if [[ $am_diff -lt 0 && $pm_diff -gt 0 ]]; then
        echo $pm_diff
    elif [[ $am_diff -gt 0 ]]; then
        echo $am_diff
    else
        echo $(( am_diff + 1440 ))
    fi
}

# Helper function to format hours with leading zero
format_hour() {
    local hour=$1
    # Ensure hour is a number without leading zeros
    hour=${hour#0}
    [[ -z "$hour" ]] && hour=0
    [[ "$hour" -lt 10 ]] && echo "0$hour" || echo "$hour"
}

# Helper function to format minutes with leading zero
format_minute() {
    local minute=$1
    # Ensure minute is a number without leading zeros
    minute=${minute#0}
    [[ -z "$minute" ]] && minute=0
    [[ "$minute" -lt 10 ]] && echo "0$minute" || echo "$minute"
}

# Helper function to convert AM/PM hour to 24-hour format
convert_to_24h_format() {
    local hour=$1
    local ampm=$2

    # Trim leading zeros
    hour=${hour#0}
    [[ -z "$hour" ]] && hour=0

    if [[ "$ampm" =~ [pP] && "$hour" -lt 12 ]]; then
        echo $(( hour + 12 ))
    elif [[ "$ampm" =~ [aA] && "$hour" -eq 12 ]]; then
        echo 0
    else
        echo $hour
    fi
}

# Helper function to calculate future time from minutes
calculate_future_time() {
    local total_minutes=$1
    local current_hour=$2
    local current_minute=$3

    local future_hour=$(( (total_minutes + current_hour * 60 + current_minute) / 60 % 24 ))
    local future_minute=$(( (total_minutes + current_hour * 60 + current_minute) % 60 ))

    # Format with leading zeros (after removing any existing leading zeros)
    future_hour=$(format_hour "$future_hour")
    future_minute=$(format_minute "$future_minute")

    echo "TIME:$future_hour:$future_minute"
}

# Function to parse the input and calculate the total minutes
parse_input() {
    local input=(${(@s/ /)1})  # Split the input into parts
    local current_hour=$(date +"%H")
    local current_minute=$(date +"%M")

    # Early return for invalid input when empty
    [[ -z "${input[1]}" ]] && echo "0" && return

    # Check for status command
    [[ "${input[1]}" == "s" ]] && echo "status" && return

    # Handle single input cases with early returns
    if [[ "${#input[@]}" -eq 1 ]]; then
        # Special value for indefinite mode
        [[ "${input[1]}" == "i" ]] && echo "indefinite" && return

        # Format: 2h (hours)
        if [[ "${input[1]}" =~ ^[0-9]+h$ ]]; then
            echo $(( ${input[1]%h} * 60 ))
            return
        fi

        # Direct number input (minutes)
        if [[ "${input[1]}" =~ ^[0-9]+$ ]]; then
            echo "${input[1]}"
            return
        fi

        # Format: 8 or 8: (hour only)
        if [[ "${input[1]}" =~ ^([0-9]{1,2}):?$ ]]; then
            local hour=${match[1]}
            local minute=0

            # Parameter expansion is more efficient than sed
            hour=${hour#0}

            # Check if the input has a colon at the end
            if [[ "${input[1]}" =~ :$ ]]; then
                # If it has a colon, calculate specific time
                local total_minutes=$(get_nearest_future_time "$hour" "$minute" "$current_hour" "$current_minute")

                # Use helper function to calculate future time
                local future_time=$(calculate_future_time "$total_minutes" "$current_hour" "$current_minute")
                # For hour-only format with colon, we want to force minutes to 00
                echo "${future_time%:*}:00"
            else
                # No colon, return minutes
                local total_minutes=$(get_nearest_future_time "$hour" "$minute" "$current_hour" "$current_minute")
                echo "$total_minutes"
            fi
            return
        fi

        # Format: 8a, 8am, 8p, 8pm
        if [[ "${input[1]}" =~ ^([0-9]{1,2})([aApP])?(m)?$ ]]; then
            local hour=${match[1]}
            local ampm=${match[2]:-""}
            local minute=0

            # With AM/PM indicator
            if [[ -n "$ampm" ]]; then
                # Convert to 24-hour format using helper function
                hour=$(convert_to_24h_format "$hour" "$ampm")

                # Format hour with leading zero
                hour=$(format_hour "$hour")
                echo "TIME:$hour:00"
            else
                # Without AM/PM, use nearest future time
                hour=${hour#0}
                echo $(get_nearest_future_time "$hour" "$minute" "$current_hour" "$current_minute")
            fi
            return
        fi

        # Format: 8:30, 8:30a, 8:30am, 8:30p, 8:30pm
        if [[ "${input[1]}" =~ ^([0-9]{1,2}):([0-9]{1,2})([aApP])?([mM])?$ ]]; then
            local hour=${match[1]}
            local minute=${match[2]}
            local ampm=${match[3]:-""}

            # With AM/PM indicator
            if [[ -n "$ampm" ]]; then
                # Convert to 24-hour format using helper function
                hour=$(convert_to_24h_format "$hour" "$ampm")

                # Format output with leading zeros
                hour=$(format_hour "$hour")
                minute=$(format_minute "$minute")
                echo "TIME:$hour:$minute"
            else
                # Without explicit AM/PM, calculate future time
                hour=${hour#0}
                local total_minutes=$(get_nearest_future_time "$hour" "$minute" "$current_hour" "$current_minute")

                # Use helper function to calculate and format future time
                echo $(calculate_future_time "$total_minutes" "$current_hour" "$current_minute")
            fi
            return
        fi

        # If we get here, it's an invalid single input
        echo "0"
        return
    fi

    # Handle two-part input (hours and minutes)
    if [[ "${#input[@]}" -eq 2 ]]; then
        if [[ "${input[1]}" =~ ^[0-9]+$ && "${input[2]}" =~ ^[0-9]+$ ]]; then
            echo $(( input[1] * 60 + input[2] ))
            return
        fi

        # Invalid two-part input
        echo "0"
        return
    fi

    # Default case: invalid input
    echo "0"
}

# Function to format the duration in hours and minutes
format_duration() {
    local total_minutes=$1
    local hours=$(( total_minutes / 60 ))
    local minutes=$(( total_minutes % 60 ))

    if [[ "$hours" -gt 0 && "$minutes" -gt 0 ]]; then
        echo "$hours hour(s) $minutes minute(s)"
    elif [[ "$hours" -gt 0 ]]; then
        echo "$hours hour(s)"
    else
        echo "$minutes minute(s)"
    fi
}

# Format time with proper leading zeros
format_time() {
    local hours=$1
    local minutes=$2
    local seconds=$3

    local formatted="${hours}h:"
    [[ $minutes -lt 10 ]] && formatted="${formatted}0${minutes}m:" || formatted="${formatted}${minutes}m:"
    [[ $seconds -lt 10 ]] && formatted="${formatted}0${seconds}s" || formatted="${formatted}${seconds}s"

    echo "$formatted"
}

# Get display sleep status based on caffeinate arguments
get_display_sleep_status() {
    local caffeinate_args=$1
    [[ "$caffeinate_args" == *"-d"* ]] && echo "Display sleep prevention active" || echo "Display can sleep (idle prevention only)"
}

# Format message for timed session
format_timed_session_message() {
    local remaining_seconds=$1
    local end_time=$2
    local display_sleep_info=$3
    local total_seconds=$4

    local hours=$((remaining_seconds / 3600))
    local minutes=$(((remaining_seconds % 3600) / 60))
    local seconds=$((remaining_seconds % 60))

    local remaining_formatted=$(format_time "$hours" "$minutes" "$seconds")

    # If it's a long duration (likely a target time session)
    if [[ $total_seconds -gt 7200 ]]; then
        echo "Active until $end_time - $display_sleep_info"
    else
        echo "Remaining: $remaining_formatted - Will end at $end_time - $display_sleep_info"
    fi
}

# Format message for indefinite session
format_indefinite_session_message() {
    local duration_seconds=$1
    local display_sleep_info=$2

    local hours=$((duration_seconds / 3600))
    local minutes=$(((duration_seconds % 3600) / 60))
    local seconds=$((duration_seconds % 60))

    local duration_formatted=$(format_time "$hours" "$minutes" "$seconds")

    echo "Running for $duration_formatted - $display_sleep_info"
}

# Generate JSON output with conditional rerun
generate_alfred_json() {
    local title=$1
    local subtitle=$2
    local arg=$3
    local needs_rerun=$4

    local rerun_part=""
    [[ "$needs_rerun" == "true" ]] && rerun_part='"rerun":1,'

    echo '{'${rerun_part}'"items":[{"title":"'"$title"'","subtitle":"'"$subtitle"'","arg":"'"$arg"'","icon":{"path":"icon.png"}}]}'
}

# Helper function to determine if a session needs rerun
needs_rerun() {
    local session_type=$1
    local total_seconds=$2

    # For target time sessions or very long sessions (>2h), we don't need frequent updates
    if [[ "$session_type" == "timed" && $total_seconds -gt 7200 ]]; then
        echo "false"
    elif [[ "$session_type" == "target_time" ]]; then
        echo "false"
    elif [[ "$session_type" == "indefinite" ]]; then
        # Indefinite sessions show elapsed time, so we want updates
        echo "true"
    elif [[ "$session_type" == "timed" ]]; then
        # Regular timed sessions show remaining time, so we want updates
        echo "true"
    else
        # Default to not needing rerun
        echo "false"
    fi
}

# Format message for target time session
format_target_time_message() {
    local end_time=$1
    local display_sleep_info=$2

    echo "Active until $end_time - $display_sleep_info"
}

# Format message for timed session
format_timed_session_message() {
    local remaining_seconds=$1
    local end_time=$2
    local display_sleep_info=$3

    local hours=$((remaining_seconds / 3600))
    local minutes=$(((remaining_seconds % 3600) / 60))
    local seconds=$((remaining_seconds % 60))

    local remaining_formatted=$(format_time "$hours" "$minutes" "$seconds")

    echo "Remaining: $remaining_formatted - Will end at $end_time - $display_sleep_info"
}

# Format message for indefinite session
format_indefinite_session_message() {
    local duration_seconds=$1
    local display_sleep_info=$2

    local hours=$((duration_seconds / 3600))
    local minutes=$(((duration_seconds % 3600) / 60))
    local seconds=$((duration_seconds % 60))

    local duration_formatted=$(format_time "$hours" "$minutes" "$seconds")

    echo "Running for $duration_formatted - $display_sleep_info"
}

# Function to check caffeinate status and return JSON output
check_status() {
    # Check if caffeinate is running
    local caffeinate_pid=$(pgrep -x "caffeinate")

    if [[ -n "$caffeinate_pid" ]]; then
        # Get process info
        local caffeinate_info=$(ps -o lstart=,command= -p "$caffeinate_pid")
        local caffeinate_start=${caffeinate_info%% caffeinate*}
        local caffeinate_args=${caffeinate_info#*caffeinate }

        # Get display sleep status
        local display_sleep_info=$(get_display_sleep_status "$caffeinate_args")

        # Calculate timestamps
        local start_seconds=$(date -j -f "%a %b %d %T %Y" "$caffeinate_start" "+%s" 2>/dev/null)
        local current_seconds=$(date "+%s")
        local duration_seconds=$(( current_seconds - start_seconds ))

        local subtitle=""
        local session_type=""

        # Determine session type and format appropriate message
        if [[ "$caffeinate_args" =~ -t[[:space:]]+([0-9]+) ]]; then
            # Timed session
            local total_seconds=${match[1]}
            local remaining_seconds=$(( total_seconds - duration_seconds ))
            [[ $remaining_seconds -lt 0 ]] && remaining_seconds=0

            # Calculate end time
            local end_time=$(date -r $(( start_seconds + total_seconds )) "+%l:%M %p" | sed 's/^ //')

            # Determine if this is a regular timed session or a target time session
            if [[ $total_seconds -gt 7200 ]]; then
                session_type="target_time"
                subtitle=$(format_target_time_message "$end_time" "$display_sleep_info")
            else
                session_type="timed"
                subtitle=$(format_timed_session_message "$remaining_seconds" "$end_time" "$display_sleep_info")
            fi
        else
            # Indefinite session
            session_type="indefinite"
            subtitle=$(format_indefinite_session_message "$duration_seconds" "$display_sleep_info")
        fi

        # Determine if we need rerun based on session type
        local needs_rerun=$(needs_rerun "$session_type" "$total_seconds")

        # Escape special characters in JSON
        subtitle=${subtitle//\"/\\\"}

        generate_alfred_json "Caffeinate Session Active" "$subtitle" "status" "$needs_rerun"
    else
        generate_alfred_json "No Caffeinate Session Active" "Run a command to start caffeinate" "status" "false"
    fi
}

# Function to generate Alfred JSON output
generate_output() {
    local input_result=$1

    # Check for invalid input first (fastest check)
    if [[ "$input_result" == "0" ]]; then
        echo '{"items":[{"title":"Invalid input","subtitle":"Please provide a valid time format","arg":"0","icon":{"path":"icon.png"}}]}'
        return
    fi

    # Check for indefinite mode (no rerun needed)
    if [[ "$input_result" == "indefinite" ]]; then
        echo '{"items":[{"title":"Active indefinitely","subtitle":"Keep your Mac awake until manually disabled","arg":"indefinite","icon":{"path":"icon.png"}}]}'
        return
    fi

    # Check for status command
    if [[ "$input_result" == "status" ]]; then
        check_status
        return
    fi

    # Check for target time format
    if [[ "$input_result" == TIME:* ]]; then
        local target_time=${input_result#TIME:}
        local hour=${target_time%:*}
        local minute=${target_time#*:}

        # To display the time in a user-friendly format
        local display_time=$(date -j -f "%H:%M" "$target_time" "+%l:%M %p" 2>/dev/null | sed 's/^ //')
        [[ $? -ne 0 ]] && display_time="$target_time"

        echo '{"items":[{"title":"Active until '"$display_time"'","subtitle":"Keep awake until specified time","arg":"'"$input_result"'","icon":{"path":"icon.png"}}]}'
        return
    fi

    # Finally, handle duration in minutes (most common case)
    local end_time=$(calculate_end_time "$input_result")
    local formatted_duration=$(format_duration "$input_result")
    echo '{"rerun":1,"items":[{"title":"Active for '"$formatted_duration"'","subtitle":"Keep awake until around '"$end_time"'","arg":"'"$input_result"'","icon":{"path":"icon.png"}}]}'
}

# Main function
main() {
    local total_minutes=$(parse_input "$1")
    generate_output "$total_minutes"
}

# Execute the main function with the input
main "$1"
