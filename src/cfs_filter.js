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

// Function to get display sleep status
function getDisplaySleepStatus(caffinateArgs) {
	return caffinateArgs.includes("-d")
		? " - Display stays awake"
		: " - Display can sleep";
}

// Function to check caffeinate status
function checkStatus() {
	try {
		// Use NSRunningApplication to check for caffeinate process
		const task = $.NSTask.alloc.init;
		task.setLaunchPath("/usr/bin/pgrep");
		task.setArguments(["-x", "caffeinate"]);

		const pipe = $.NSPipe.pipe;
		task.setStandardOutput(pipe);
		task.launch;
		task.waitUntilExit;

		const data = pipe.fileHandleForReading.readDataToEndOfFile;
		const pidString = $.NSString.alloc.initWithDataEncoding(
			data,
			$.NSUTF8StringEncoding,
		).js;

		if (!pidString.trim()) {
			return "Caffeinate deactivated|Run a command to start caffeinate|false";
		}

		const pid = pidString.trim();

		// Get process info using ps
		const psTask = $.NSTask.alloc.init;
		psTask.setLaunchPath("/bin/ps");
		psTask.setArguments(["-o", "lstart=,command=", "-p", pid]);

		const psPipe = $.NSPipe.pipe;
		psTask.setStandardOutput(psPipe);
		psTask.launch;
		psTask.waitUntilExit;

		const psData = psPipe.fileHandleForReading.readDataToEndOfFile;
		const psOutput = $.NSString.alloc.initWithDataEncoding(
			psData,
			$.NSUTF8StringEncoding,
		).js;

		if (!psOutput.trim()) {
			return "Caffeinate deactivated|Run a command to start caffeinate|false";
		}

		// Parse the ps output
		const psLine = psOutput.trim();
		const caffinateIndex = psLine.indexOf("caffeinate");
		if (caffinateIndex === -1) {
			return "Caffeinate deactivated|Run a command to start caffeinate|false";
		}

		const startTime = psLine.substring(0, caffinateIndex).trim();
		const caffinateArgs = psLine.substring(caffinateIndex + 10).trim();

		// Parse start time and calculate duration
		const startDate = new Date(startTime);
		const currentDate = new Date();
		const durationSeconds = Math.floor((currentDate - startDate) / 1000);

		const displaySleepInfo = getDisplaySleepStatus(caffinateArgs);

		// Check for timed session
		const timedMatch = caffinateArgs.match(/-t\s+(\d+)/);
		if (timedMatch) {
			const totalSeconds = parseInt(timedMatch[1]);
			let remainingSeconds = totalSeconds - durationSeconds;
			remainingSeconds = Math.max(0, remainingSeconds);

			// Calculate end time using centralized formatting
			const endDate = new Date(startDate.getTime() + totalSeconds * 1000);
			const endTimeStr = formatTime(endDate); // No seconds for status

			const title = `Caffeinate active until ${endTimeStr}`;

			// Format remaining time
			let subtitle;
			if (remainingSeconds < 60) {
				subtitle = `${remainingSeconds}s left${displaySleepInfo}`;
			} else if (remainingSeconds < 3600) {
				const minutes = Math.floor(remainingSeconds / 60);
				const seconds = remainingSeconds % 60;
				subtitle =
					seconds === 0
						? `${minutes}m left${displaySleepInfo}`
						: `${minutes}m ${seconds}s left${displaySleepInfo}`;
			} else {
				const hours = Math.floor(remainingSeconds / 3600);
				const minutes = Math.floor((remainingSeconds % 3600) / 60);
				subtitle =
					minutes === 0
						? `${hours}h left${displaySleepInfo}`
						: `${hours}h ${minutes}m left${displaySleepInfo}`;
			}

			const needsRerun = remainingSeconds <= 3600 ? "true" : "false";
			return `${title}|${subtitle}|${needsRerun}`;
		} else {
			// Indefinite session
			const title = "Caffeinate active indefinitely";
			const subtitle = `Session running indefinitely${displaySleepInfo}`;
			return `${title}|${subtitle}|false`;
		}
	} catch (error) {
		return "Caffeinate deactivated|Run a command to start caffeinate|false";
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

// Input pattern handlers using strategy pattern (DRY principle)
const INPUT_PATTERNS = [
	// Status command
	{ regex: /^s$/, handler: () => "status" },

	// Indefinite mode
	{ regex: /^i$/, handler: () => "indefinite" },

	// Hours format: 2h
	{ regex: /^(\d+)h$/, handler: (match) => String(parseInt(match[1]) * 60) },

	// Direct minutes: 30
	{ regex: /^\d+$/, handler: (match) => match[0] },

	// Hour with colon: 8:
	{
		regex: /^(\d{1,2}):$/,
		handler: (match) => {
			const hour = parseInt(match[1].replace(/^0+/, "")) || 0;
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
			return futureTime.replace(/:(\d+)$/, ":00"); // Force minutes to 00
		},
	},

	// Hour only: 8
	{
		regex: /^(\d{1,2})$/,
		handler: (match) => {
			const hour = parseInt(match[1].replace(/^0+/, "")) || 0;
			return parseTimeInput(hour);
		},
	},

	// Hour with AM/PM: 8am, 8p, 8pm
	{
		regex: /^(\d{1,2})([aApP])m?$/,
		handler: (match) => {
			const hour = parseInt(match[1]);
			const ampm = match[2];
			return parseTimeInput(hour, 0, ampm);
		},
	},

	// Time with AM/PM: 8:30am, 8:30p
	{
		regex: /^(\d{1,2}):(\d{1,2})([aApP])m?$/,
		handler: (match) => {
			const hour = parseInt(match[1]);
			const minute = parseInt(match[2]);
			const ampm = match[3];
			return parseTimeInput(hour, minute, ampm);
		},
	},

	// Time without AM/PM: 8:30
	{
		regex: /^(\d{1,2}):(\d{1,2})$/,
		handler: (match) => {
			const hour = parseInt(match[1]);
			const minute = parseInt(match[2]);
			return parseTimeInput(hour, minute);
		},
	},
];

// Function to parse input and calculate total minutes
function parseInput(input) {
	// Handle empty input
	if (!input || input.trim() === "") {
		return "0";
	}

	const parts = input.trim().split(/\s+/);

	// Handle single input using pattern matching
	if (parts.length === 1) {
		const part = parts[0];

		// Try each pattern until one matches
		for (const pattern of INPUT_PATTERNS) {
			const match = part.match(pattern.regex);
			if (match) {
				return pattern.handler(match);
			}
		}

		return "0"; // No pattern matched
	}

	// Handle two-part input (hours and minutes)
	if (parts.length === 2) {
		const hoursMatch = parts[0].match(/^\d+$/);
		const minutesMatch = parts[1].match(/^\d+$/);

		if (hoursMatch && minutesMatch) {
			return String(parseInt(parts[0]) * 60 + parseInt(parts[1]));
		}
	}

	return "0"; // Invalid input
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
