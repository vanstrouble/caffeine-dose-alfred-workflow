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

// Global display sleep preference - read once at startup
const DISPLAY_SLEEP_ALLOW_VAR =
	$.NSProcessInfo.processInfo.environment.objectForKey("display_sleep_allow");
const DISPLAY_SLEEP_ALLOW = DISPLAY_SLEEP_ALLOW_VAR ? DISPLAY_SLEEP_ALLOW_VAR.js === "true" : false;

// Global icon path - easy to change if needed
const ICON_PATH = "icon.png";

function convertTo24hFormat(hour, ampm) {
	hour = parseInt(hour) || 0;
	if (/[pP]/.test(ampm) && hour < 12) return hour + 12;
	if (/[aA]/.test(ampm) && hour === 12) return 0;
	return hour;
}

function calculateFutureTime(totalMinutes, currentHour, currentMinute) {
	const futureTotal = currentHour * 60 + currentMinute + totalMinutes;
	const futureHour = Math.floor(futureTotal / 60) % 24;
	const futureMinute = futureTotal % 60;
	return `TIME:${String(futureHour).padStart(2, '0')}:${String(futureMinute).padStart(2, '0')}`;
}

function formatTime(dateOrTimestamp, includeSeconds = false) {
	const date = typeof dateOrTimestamp === "number" ? new Date(dateOrTimestamp) : dateOrTimestamp;
	const formatter = $.NSDateFormatter.alloc.init;
	formatter.setDateFormat(TIME_FORMAT === "0"
		? (includeSeconds ? "h:mm:ss a" : "h:mm a")
		: (includeSeconds ? "HH:mm:ss" : "HH:mm"));
	return formatter.stringFromDate(date).js.replace(/^\s+/, "");
}

function calculateEndTime(minutes) {
	return formatTime(Date.now() + minutes * 60000, true);
}

function getNearestFutureTime(hour, minute, currentHour, currentMinute) {
	const currentTotal = currentHour * 60 + currentMinute;
	const amHour = hour === 12 ? 0 : hour;
	const pmHour = hour < 12 ? hour + 12 : hour;
	const amDiff = amHour * 60 + minute - currentTotal;
	const pmDiff = pmHour * 60 + minute - currentTotal;
	if (amDiff < 0 && pmDiff > 0) return pmDiff;
	if (amDiff > 0) return amDiff;
	return amDiff + 1440;
}

function formatDuration(totalMinutes) {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	const hText = hours === 1 ? "1 hour" : `${hours} hours`;
	const mText = minutes === 1 ? "1 minute" : `${minutes} minutes`;
	if (hours > 0 && minutes > 0) return `${hText} ${mText}`;
	if (hours > 0) return hText;
	return mText;
}

function formatRemainingTime(remainingSeconds, displaySleepInfo) {
	if (remainingSeconds < 60) return `${remainingSeconds}s left${displaySleepInfo}`;
	if (remainingSeconds < 3600) {
		const m = Math.floor(remainingSeconds / 60);
		const s = remainingSeconds % 60;
		return `${m}m${s > 0 ? ` ${s}s` : ''} left${displaySleepInfo}`;
	}
	const h = Math.floor(remainingSeconds / 3600);
	const m = Math.floor((remainingSeconds % 3600) / 60);
	return `${h}h${m > 0 ? ` ${m}m` : ''} left${displaySleepInfo}`;
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
		const startDate = new Date(startTime);
		const durationSeconds = Math.floor((Date.now() - startDate.getTime()) / 1000);
		const displaySleepInfo = caffinateArgs.includes("-d") ? " - Display stays awake" : " - Display can sleep";

		const tIndex = caffinateArgs.indexOf("-t");
		if (tIndex !== -1) {
			const afterT = caffinateArgs.substring(tIndex + 2).trim();
			const spaceIndex = afterT.indexOf(" ");
			const totalSeconds = parseInt(spaceIndex === -1 ? afterT : afterT.substring(0, spaceIndex));

			if (!isNaN(totalSeconds)) {
				const remainingSeconds = Math.max(0, totalSeconds - durationSeconds);
				const endDate = new Date(startDate.getTime() + totalSeconds * 1000);
				const endTimeStr = formatTime(endDate);
				const title = `Caffeinate active until ${endTimeStr}`;
				const subtitle = formatRemainingTime(remainingSeconds, displaySleepInfo);
				const needsRerun = remainingSeconds <= 3600 ? "true" : "false";
				return `${title}|${subtitle}|${needsRerun}`;
			}
		}

		return `Caffeinate active indefinitely|Session running indefinitely${displaySleepInfo}|false`;
	} catch (error) {
		return errorResponse;
	}
}

function parseTimeInput(hour, minute = 0, ampm = "") {
	const now = new Date();
	const currentHour = now.getHours();
	const currentMinute = now.getMinutes();

	if (ampm) {
		const convertedHour = convertTo24hFormat(hour, ampm);
		return `TIME:${String(convertedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
	}
	const totalMinutes = getNearestFutureTime(hour, minute, currentHour, currentMinute);
	return minute > 0 ? calculateFutureTime(totalMinutes, currentHour, currentMinute) : String(totalMinutes);
}

function parseInput(input) {
	if (!input || input.trim() === "") return "simple_status";

	const parts = input.trim().split(/\s+/);

	if (parts.length === 2) {
		const hours = parseInt(parts[0]);
		const minutes = parseInt(parts[1]);
		if (!isNaN(hours) && !isNaN(minutes) && hours >= 0 && minutes >= 0) {
			return String(hours * 60 + minutes);
		}
		return "0";
	}

	if (parts.length === 1) {
		const part = parts[0];
		if (part === "s") return "status";
		if (part === "i") return "indefinite";
		if (part === "d") return "deactivate";
		if (/^\d+$/.test(part)) return part;

		if (part.endsWith("h") && part.length > 1) {
			const hours = parseInt(part.slice(0, -1));
			if (!isNaN(hours) && hours >= 0) return String(hours * 60);
		}

		if (part.includes(":")) return parseTimeFormat(part);

		const lastChar = part.toLowerCase().slice(-1);
		const secondLastChar = part.toLowerCase().slice(-2, -1);
		if (lastChar === "a" || lastChar === "p" || (lastChar === "m" && (secondLastChar === "a" || secondLastChar === "p"))) {
			return parseAMPMFormat(part);
		}

		const hour = parseInt(part);
		if (!isNaN(hour) && hour >= 0 && hour <= 23) return parseTimeInput(hour);
		return "0";
	}
	return "0";
}

function parseTimeFormat(part) {
	const colonIndex = part.indexOf(":");

	if (colonIndex === part.length - 1) {
		const hour = parseInt(part.slice(0, -1));
		if (!isNaN(hour) && hour >= 0 && hour <= 23) {
			const now = new Date();
			const totalMinutes = getNearestFutureTime(hour, 0, now.getHours(), now.getMinutes());
			const futureTime = calculateFutureTime(totalMinutes, now.getHours(), now.getMinutes());
			return futureTime.replace(/:(\d+)$/, ":00");
		}
		return "0";
	}

	const timeParts = part.split(":");
	if (timeParts.length !== 2) return "0";

	let minutePart = timeParts[1];
	let ampm = "";
	const lastChar = minutePart.toLowerCase().slice(-1);
	const secondLastChar = minutePart.toLowerCase().slice(-2, -1);

	if (lastChar === "a" || lastChar === "p") {
		ampm = lastChar;
		minutePart = minutePart.slice(0, -1);
	} else if (lastChar === "m" && (secondLastChar === "a" || secondLastChar === "p")) {
		ampm = secondLastChar;
		minutePart = minutePart.slice(0, -2);
	}

	const hour = parseInt(timeParts[0]);
	const minute = parseInt(minutePart);
	if (!isNaN(hour) && !isNaN(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
		return parseTimeInput(hour, minute, ampm);
	}
	return "0";
}

function parseAMPMFormat(part) {
	const lower = part.toLowerCase();
	let hour, ampm;

	if (lower.endsWith("am")) {
		hour = parseInt(part.slice(0, -2));
		ampm = "a";
	} else if (lower.endsWith("pm")) {
		hour = parseInt(part.slice(0, -2));
		ampm = "p";
	} else if (lower.endsWith("a")) {
		hour = parseInt(part.slice(0, -1));
		ampm = "a";
	} else if (lower.endsWith("p")) {
		hour = parseInt(part.slice(0, -1));
		ampm = "p";
	} else {
		return "0";
	}

	if (!isNaN(hour) && hour >= 1 && hour <= 12) return parseTimeInput(hour, 0, ampm);
	return "0";
}

function createAlfredResponse(title, subtitle, arg, needsRerun = false, allowMods = true, valid = true) {
	const item = {
		title: title,
		subtitle: subtitle,
		arg: arg,
		icon: { path: ICON_PATH },
		valid: valid,
	};

	if (allowMods && arg !== "status" && arg !== "0") {
		item.mods = {
			cmd: {
				subtitle: "⌘ Allow display sleep",
				arg: arg,
				variables: { display_sleep_allow: "true" },
			},
		};
	}

	const response = {
		items: [item],
	};

	if (needsRerun) {
		response.rerun = 1;
	}

	return JSON.stringify(response);
}

function generateOutput(inputResult) {
	if (inputResult === "0") {
		return createAlfredResponse("Invalid input", "Please provide a valid time format", "0", false, false);
	}

	if (inputResult === "indefinite") {
		return createAlfredResponse("Active indefinitely", "Keep your Mac awake until manually disabled", "indefinite");
	}

	if (inputResult === "deactivate") {
		const [statusTitle] = checkStatus().split("|");
		const isActive = statusTitle !== "Caffeinate deactivated";
		if (isActive) {
			return createAlfredResponse("Deactivate caffeinate", "Stop keeping your Mac awake", "deactivate");
		}
		return createAlfredResponse("Caffeinate already deactivated", "No active session to stop", "deactivate", false, false, false);
	}

	if (inputResult === "simple_status") {
		const [originalTitle] = checkStatus().split("|");
		const isActive = originalTitle !== "Caffeinate deactivated";
		const displayTitle = isActive ? originalTitle : "Caffeine Dose";
		const subtitle = isActive
			? "Define a new time or press 's' for details"
			: "Caffeinate deactivated • Set a time to keep your Mac awake";
		return createAlfredResponse(displayTitle, subtitle, "status", false, false, false);
	}

	if (inputResult === "status") {
		const [title, subtitle, needsRerun] = checkStatus().split("|");
		return createAlfredResponse(title, subtitle, "status", needsRerun === "true");
	}

	if (inputResult.startsWith("TIME:")) {
		const targetTime = inputResult.substring(5);
		let displayTime;
		try {
			const [hour, minute] = targetTime.split(":").map((n) => parseInt(n));
			const tempDate = new Date();
			tempDate.setHours(hour, minute, 0, 0);
			displayTime = formatTime(tempDate);
		} catch (error) {
			displayTime = targetTime;
		}
		return createAlfredResponse(`Active until ${displayTime}`, "Keep awake until specified time", inputResult);
	}

	const minutes = parseInt(inputResult);
	return createAlfredResponse(
		`Active for ${formatDuration(minutes)}`,
		`Keep awake until around ${calculateEndTime(minutes)}`,
		inputResult,
		true
	);
}

function run(argv) {
	return generateOutput(parseInput(argv[0] || ""));
}
