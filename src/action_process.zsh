#!/bin/zsh --no-rcs

# Unified action processor for Caffeine Dose Alfred Workflow
# Handles inputs from both cfs_filter.js and toggle_filter.zsh
# Migrated from cfs_processing.zsh + toggle_processing.zsh for better maintainability

# Global time format preference - read once at startup
# "0" = 12-hour format (AM/PM), "1" = 24-hour format
readonly TIME_FORMAT=${alfred_time_format:-0}

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

    if [[ "$TIME_FORMAT" == "0" ]]; then
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
    local time_str=${1#TIME:}
    local hour=${time_str%%:*}
    local minute=${time_str#*:}

    if [[ ! "$hour" =~ ^[0-9]+$ || ! "$minute" =~ ^[0-9]+$ || $hour -gt 23 || $minute -gt 59 ]]; then
        notification "Error: Invalid time format: $time_str"
        exit 1
    fi

    echo "$hour $minute"
}

# Calculate minutes from now until target time (handles next-day wrap)
calculate_minutes_until_target() {
    local target_minutes=$(( $1 * 60 + $2 ))
    local current_minutes=$(( $(date +"%-H") * 60 + $(date +"%-M") ))
    local duration=$(( target_minutes - current_minutes ))

    [[ $duration -le 0 ]] && duration=$(( duration + 1440 ))
    echo "$duration"
}

# Format time for display based on user preference
format_display_time() {
    local hour=$1 minute=$2 time_format=${3:-0}

    if [[ "$time_format" == "0" ]]; then
        printf "%d:%02d %s" $(( hour == 0 ? 12 : hour > 12 ? hour - 12 : hour )) $minute $(( hour >= 12 ? "PM" : "AM" ))
    else
        printf "%02d:%02d" $hour $minute
    fi
}

# Generate and send notification message
output_message() {
    local time_text="$1"
    [[ "$2" == "true" ]] && time_text="around $time_text"
    local suffix=$([[ "$3" == "true" ]] && echo " (Display can sleep)" || echo "")

    notification "Keeping awake until ${time_text}${suffix}"
}

# Kill existing caffeinate processes and their wrapper subshells
kill_existing_caffeinate() {
    pkill -x "caffeinate" 2>/dev/null
}

# Start caffeinate session (timed or indefinite)
start_caffeinate_session() {
    local duration=$1 allow_display_sleep=$2 indefinite=$3

    [[ -z "$indefinite" && ( ! "$duration" =~ ^[0-9]+$ || $duration -eq 0 ) ]] && {
        notification "Error: Invalid duration: $duration minutes"
        exit 1
    }

    kill_existing_caffeinate

    # Build caffeinate arguments dynamically
    local -a caff_args=(-i)
    [[ "$allow_display_sleep" != "true" ]] && caff_args=(-d -i)

    if [[ "$indefinite" == "true" ]]; then
        nohup caffeinate "${caff_args[@]}" >/dev/null 2>&1 &
        notification "Keeping awake indefinitely$([[ "$allow_display_sleep" == "true" ]] && echo " (Display can sleep)")"
    else
        local timeout_seconds=$(( duration * 60 ))
        (
            caffeinate "${caff_args[@]}" -t "$timeout_seconds"
            [[ $? -eq 0 ]] && notification "Caffeinate session ended" "Boop"
        ) &
    fi
}

# Handle TIME:HH:MM input format
handle_target_time() {
    read -r hour minute <<< "$(parse_time_format "$1")"
    local duration=$(calculate_minutes_until_target "$hour" "$minute")

    start_caffeinate_session "$duration" "$2"
    output_message "$(format_display_time "$hour" "$minute" "$TIME_FORMAT")" "false" "$2"
}

# Handle numeric minute duration input
handle_duration() {
    start_caffeinate_session "$1" "$2"
    output_message "$(calculate_end_time "$1")" "true" "$2"
}

# Main processing logic
main() {
    local INPUT="${hotkey_value:-$1}"
    local display_sleep="${display_sleep_allow:-false}"

    [[ -z "$INPUT" || "$INPUT" == "0" ]] && {
        notification "Error: Invalid input. Please provide a valid duration."
        exit 1
    }

    case "$INPUT" in
        indefinite)
            start_caffeinate_session "" "$display_sleep" "true"
            ;;
        deactivate)
            kill_existing_caffeinate
            notification "Caffeinate deactivated" "Boop"
            ;;
        TIME:*)
            handle_target_time "$INPUT" "$display_sleep"
            ;;
        [0-9]*)
            [[ "$INPUT" =~ ^[0-9]+$ ]] && handle_duration "$INPUT" "$display_sleep" || {
                notification "Error: Invalid input format: $INPUT"
                exit 1
            }
            ;;
        *)
            notification "Error: Invalid input format: $INPUT"
            exit 1
            ;;
    esac
}

main "$@"
