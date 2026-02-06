#!/usr/bin/env osascript -l JavaScript

// JXA implementation of cfs_filter functionality
// Migrated from zsh to improve performance for Alfred workflow

ObjC.import("Foundation");
ObjC.import("Cocoa");

// Global time format preference - read once at startup
// "0" = 12-hour format (AM/PM), "1" = 24-hour format
const TIME_FORMAT_VAR =
	$.NSProcessInfo.processInfo.environment.objectForKey("alfred_time_format");
const TIME_FORMAT = TIME_FORMAT_VAR ? TIME_FORMAT_VAR.js : "0"; // Default to 12-hour

// Helper function to pad numbers with zero
function padZero(num) {
	const n = parseInt(String(num).replace(/^0+/, "")) || 0;
	return n < 10 ? `0${n}` : String(n);
}

// Helper function to convert AM/PM hour to 24-hour format
function convertTo24hFormat(hour, ampm) {
	hour = parseInt(String(hour).replace(/^0+/, "")) || 0;

	if (/[pP]/.test(ampm) && hour < 12) {
		return hour + 12;
	} else if (/[aA]/.test(ampm) && hour === 12) {
		return 0;
	} else {
		return hour;
	}
}

// Helper function to calculate future time from minutes
function calculateFutureTime(totalMinutes, currentHour, currentMinute) {
	const totalCurrentMinutes = currentHour * 60 + currentMinute;
	const futureTotal = totalCurrentMinutes + totalMinutes;

	const futureHour = Math.floor(futureTotal / 60) % 24;
	const futureMinute = futureTotal % 60;

	return `TIME:${padZero(futureHour)}:${padZero(futureMinute)}`;
}

// Function to get current time efficiently
function getCurrentTime() {
	const now = new Date();
	return {
		hour: now.getHours(),
		minute: now.getMinutes(),
	};
}

// Centralized time formatting function (DRY principle)
function formatTime(dateOrTimestamp, includeSeconds = false) {
	const date =
		typeof dateOrTimestamp === "number"
			? new Date(dateOrTimestamp)
			: dateOrTimestamp;

	const formatter = $.NSDateFormatter.alloc.init;

	if (TIME_FORMAT === "0") {
		// 12-hour format with AM/PM
		formatter.setDateFormat(includeSeconds ? "h:mm:ss a" : "h:mm a");
		return formatter.stringFromDate(date).js.replace(/^\s+/, "");
	} else {
		// 24-hour format
		formatter.setDateFormat(includeSeconds ? "HH:mm:ss" : "HH:mm");
		return formatter.stringFromDate(date).js;
	}
}

// Function to calculate end time based on minutes (simplified with DRY)
function calculateEndTime(minutes) {
	const futureTimestamp = Date.now() + minutes * 60000;
	return formatTime(futureTimestamp, true); // Include seconds
}

// Function to get nearest future time based on input hour and minute
function getNearestFutureTime(hour, minute, currentHour, currentMinute) {
	const currentTotal = currentHour * 60 + currentMinute;

	// Handle 12 AM conversion
	const amHour = hour === 12 ? 0 : hour;
	const pmHour = hour < 12 ? hour + 12 : hour;

	const amTotal = amHour * 60 + minute;
	const pmTotal = pmHour * 60 + minute;

	const amDiff = amTotal - currentTotal;
	const pmDiff = pmTotal - currentTotal;

	if (amDiff < 0 && pmDiff > 0) {
		return pmDiff;
	} else if (amDiff > 0) {
		return amDiff;
	} else {
		return amDiff + 1440; // Add 24 hours
	}
}

// Function to format duration in hours and minutes
function formatDuration(totalMinutes) {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours > 0 && minutes > 0) {
		if (hours === 1 && minutes === 1) {
			return "1 hour 1 minute";
		} else if (hours === 1) {
			return `1 hour ${minutes} minutes`;
		} else if (minutes === 1) {
			return `${hours} hours 1 minute`;
		} else {
			return `${hours} hours ${minutes} minutes`;
		}
	} else if (hours > 0) {
		return hours === 1 ? "1 hour" : `${hours} hours`;
	} else {
		return minutes === 1 ? "1 minute" : `${minutes} minutes`;
	}
}

// Helper function to format remaining time efficiently (DRY principle)
function formatRemainingTime(remainingSeconds, displaySleepInfo) {
	if (remainingSeconds < 60) {
		return `${remainingSeconds}s left${displaySleepInfo}`;
	} else if (remainingSeconds < 3600) {
		const minutes = Math.floor(remainingSeconds / 60);
		const seconds = remainingSeconds % 60;
		return seconds === 0
			? `${minutes}m left${displaySleepInfo}`
			: `${minutes}m ${seconds}s left${displaySleepInfo}`;
	} else {
		const hours = Math.floor(remainingSeconds / 3600);
		const minutes = Math.floor((remainingSeconds % 3600) / 60);
		return minutes === 0
			? `${hours}h left${displaySleepInfo}`
			: `${hours}h ${minutes}m left${displaySleepInfo}`;
	}
}

// Function to get display sleep status
function getDisplaySleepStatus(caffinateArgs) {
	return caffinateArgs.includes("-d")
		? " - Display stays awake"
		: " - Display can sleep";
}

// Optimized function to check caffeinate status (performance critical for instant display)
function checkStatus() {
	const errorResponse =
		"Caffeinate deactivated|Run a command to start caffeinate|false";

	try {
		// Single optimized subprocess call - combine pgrep + ps for efficiency
		const task = $.NSTask.alloc.init;
		task.setLaunchPath("/bin/sh");
		task.setArguments([
			"-c",
			"pgrep -x caffeinate | head -1 | xargs -I {} ps -o lstart=,command= -p {}",
		]);

		const pipe = $.NSPipe.pipe;
		task.setStandardOutput(pipe);
		task.launch;
		task.waitUntilExit;

		const data = pipe.fileHandleForReading.readDataToEndOfFile;
		const output = $.NSString.alloc
			.initWithDataEncoding(data, $.NSUTF8StringEncoding)
			.js.trim();

		if (!output) {
			return errorResponse;
		}

		// Parse output more efficiently
		const caffinateIndex = output.indexOf("caffeinate");
		if (caffinateIndex === -1) {
			return errorResponse;
		}

		const startTime = output.substring(0, caffinateIndex).trim();
		const caffinateArgs = output.substring(caffinateIndex + 10).trim();

		// Calculate duration once
		const startDate = new Date(startTime);
		const durationSeconds = Math.floor(
			(Date.now() - startDate.getTime()) / 1000,
		);
		const displaySleepInfo = getDisplaySleepStatus(caffinateArgs);

		// Check for timed session using direct string search (faster than regex)
		const tIndex = caffinateArgs.indexOf("-t");
		if (tIndex !== -1) {
			// Extract seconds value efficiently
			const afterT = caffinateArgs.substring(tIndex + 2).trim();
			const spaceIndex = afterT.indexOf(" ");
			const totalSeconds = parseInt(
				spaceIndex === -1 ? afterT : afterT.substring(0, spaceIndex),
			);

			if (!isNaN(totalSeconds)) {
				const remainingSeconds = Math.max(
					0,
					totalSeconds - durationSeconds,
				);

				// Calculate end time using centralized formatting
				const endDate = new Date(
					startDate.getTime() + totalSeconds * 1000,
				);
				const endTimeStr = formatTime(endDate);

				const title = `Caffeinate active until ${endTimeStr}`;
				const subtitle = formatRemainingTime(
					remainingSeconds,
					displaySleepInfo,
				);
				const needsRerun = remainingSeconds <= 3600 ? "true" : "false";

				return `${title}|${subtitle}|${needsRerun}`;
			}
		}

		// Indefinite session
		return `Caffeinate active indefinitely|Session running indefinitely${displaySleepInfo}|false`;
	} catch (error) {
		return errorResponse;
	}
}

// Helper function to parse time input with AM/PM logic (DRY principle)
function parseTimeInput(hour, minute = 0, ampm = "") {
	const currentTime = getCurrentTime();

	if (ampm) {
		// With explicit AM/PM - return TIME format
		const convertedHour = convertTo24hFormat(hour, ampm);
		return `TIME:${padZero(convertedHour)}:${padZero(minute)}`;
	} else {
		// Without AM/PM - calculate nearest future time
		const totalMinutes = getNearestFutureTime(
			hour,
			minute,
			currentTime.hour,
			currentTime.minute,
		);
		return minute > 0
			? calculateFutureTime(
					totalMinutes,
					currentTime.hour,
					currentTime.minute,
				)
			: String(totalMinutes);
	}
}

// Optimized input parser without regex overhead (more efficient than pattern matching)
function parseInput(input) {
	// Handle empty input - show current status directly (simple and elegant)
	if (!input || input.trim() === "") {
		return "status";
	}

	const parts = input.trim().split(/\s+/);

	// Handle two-part input first (hours and minutes)
	if (parts.length === 2) {
		const hours = parseInt(parts[0]);
		const minutes = parseInt(parts[1]);

		if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && minutes >= 0) {
			return String(hours * 60 + minutes);
		}
		return "0"; // Invalid two-part input
	}

	// Handle single input - analyze by character structure
	if (parts.length === 1) {
		const part = parts[0];
		const len = part.length;

		// Direct string comparisons (faster than regex)
		if (part === "s") return "status";
		if (part === "i") return "indefinite";

		// Pure numbers (minutes)
		if (/^\d+$/.test(part)) {
			return part;
		}

		// Hours format (ends with 'h')
		if (part.endsWith("h") && len > 1) {
			const hours = parseInt(part.slice(0, -1));
			if (!isNaN(hours) && hours >= 0) {
				return String(hours * 60);
			}
		}

		// Time format analysis by structure
		if (part.includes(":")) {
			return parseTimeFormat(part);
		}

		// AM/PM format analysis
		const lastChar = part.toLowerCase().slice(-1);
		const secondLastChar = part.toLowerCase().slice(-2, -1);

		if (
			lastChar === "a" ||
			lastChar === "p" ||
			(lastChar === "m" &&
				(secondLastChar === "a" || secondLastChar === "p"))
		) {
			return parseAMPMFormat(part);
		}

		// Single hour format (just numbers, check if valid hour)
		const hour = parseInt(part);
		if (!isNaN(hour) && hour >= 0 && hour <= 23) {
			return parseTimeInput(hour);
		}

		return "0"; // No valid format found
	}

	return "0"; // Invalid input
}

// Helper function to parse time formats (HH:MM)
function parseTimeFormat(part) {
	const colonIndex = part.indexOf(":");

	// Hour with colon only (8:)
	if (colonIndex === part.length - 1) {
		const hour = parseInt(part.slice(0, -1));
		if (!isNaN(hour) && hour >= 0 && hour <= 23) {
			const currentTime = getCurrentTime();
			const totalMinutes = getNearestFutureTime(
				hour,
				0,
				currentTime.hour,
				currentTime.minute,
			);
			const futureTime = calculateFutureTime(
				totalMinutes,
				currentTime.hour,
				currentTime.minute,
			);
			return futureTime.replace(/:(\d+)$/, ":00");
		}
		return "0";
	}

	// Split time parts
	const timeParts = part.split(":");
	if (timeParts.length !== 2) return "0";

	const hourPart = timeParts[0];
	let minutePart = timeParts[1];
	let ampm = "";

	// Check for AM/PM in minute part
	const lastChar = minutePart.toLowerCase().slice(-1);
	const secondLastChar = minutePart.toLowerCase().slice(-2, -1);

	if (lastChar === "a" || lastChar === "p") {
		ampm = lastChar;
		minutePart = minutePart.slice(0, -1);
	} else if (
		lastChar === "m" &&
		(secondLastChar === "a" || secondLastChar === "p")
	) {
		ampm = secondLastChar;
		minutePart = minutePart.slice(0, -2);
	}

	const hour = parseInt(hourPart);
	const minute = parseInt(minutePart);

	if (
		!isNaN(hour) &&
		!isNaN(minute) &&
		hour >= 0 &&
		hour <= 23 &&
		minute >= 0 &&
		minute <= 59
	) {
		return parseTimeInput(hour, minute, ampm);
	}

	return "0";
}

// Helper function to parse AM/PM formats (8am, 8p, etc.)
function parseAMPMFormat(part) {
	let hour, ampm;

	// Extract AM/PM indicator
	if (part.toLowerCase().endsWith("am")) {
		hour = parseInt(part.slice(0, -2));
		ampm = "a";
	} else if (part.toLowerCase().endsWith("pm")) {
		hour = parseInt(part.slice(0, -2));
		ampm = "p";
	} else if (part.toLowerCase().endsWith("a")) {
		hour = parseInt(part.slice(0, -1));
		ampm = "a";
	} else if (part.toLowerCase().endsWith("p")) {
		hour = parseInt(part.slice(0, -1));
		ampm = "p";
	} else {
		return "0";
	}

	if (!isNaN(hour) && hour >= 1 && hour <= 12) {
		return parseTimeInput(hour, 0, ampm);
	}

	return "0";
}

// Centralized Alfred JSON response generator (DRY principle)
function createAlfredResponse(title, subtitle, arg, needsRerun = false) {
	const response = {
		items: [
			{
				title: title,
				subtitle: subtitle,
				arg: arg,
				icon: { path: "icon.png" },
			},
		],
	};

	if (needsRerun) {
		response.rerun = 1;
	}

	return JSON.stringify(response);
}

// Function to generate Alfred JSON output
function generateOutput(inputResult) {
	// Check for invalid input first
	if (inputResult === "0") {
		return createAlfredResponse(
			"Invalid input",
			"Please provide a valid time format",
			"0",
		);
	}

	// Check for indefinite mode
	if (inputResult === "indefinite") {
		return createAlfredResponse(
			"Active indefinitely",
			"Keep your Mac awake until manually disabled",
			"indefinite",
		);
	}

	// Check for status command
	if (inputResult === "status") {
		const statusData = checkStatus();
		const parts = statusData.split("|");
		const title = parts[0];
		const subtitle = parts[1];
		const needsRerun = parts[2] === "true";

		return createAlfredResponse(title, subtitle, "status", needsRerun);
	}

	// Check for target time format
	if (inputResult.startsWith("TIME:")) {
		const targetTime = inputResult.substring(5);

		// Parse target time and format using centralized function
		let displayTime;
		try {
			const [hour, minute] = targetTime
				.split(":")
				.map((n) => parseInt(n));
			const tempDate = new Date();
			tempDate.setHours(hour, minute, 0, 0);
			displayTime = formatTime(tempDate); // Use centralized formatting
		} catch (error) {
			displayTime = targetTime;
		}

		return createAlfredResponse(
			`Active until ${displayTime}`,
			"Keep awake until specified time",
			inputResult,
		);
	}

	// Handle duration in minutes
	const minutes = parseInt(inputResult);
	const endTime = calculateEndTime(minutes);
	const formattedDuration = formatDuration(minutes);

	return createAlfredResponse(
		`Active for ${formattedDuration}`,
		`Keep awake until around ${endTime}`,
		inputResult,
		true, // Always needs rerun for duration
	);
}

// Main function
function run(argv) {
	const input = argv.length > 0 ? argv[0] : "";
	const inputResult = parseInput(input);
	return generateOutput(inputResult);
}
