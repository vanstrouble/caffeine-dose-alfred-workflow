#!/usr/bin/env osascript -l JavaScript

// JXA implementation of cfs_filter functionality
// Migrated from zsh to improve performance for Alfred workflow

ObjC.import('Foundation');
ObjC.import('Cocoa');

// Helper function to pad numbers with zero
function padZero(num) {
    const n = parseInt(String(num).replace(/^0+/, '')) || 0;
    return n < 10 ? `0${n}` : String(n);
}

// Helper function to convert AM/PM hour to 24-hour format
function convertTo24hFormat(hour, ampm) {
    hour = parseInt(String(hour).replace(/^0+/, '')) || 0;
    
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
        minute: now.getMinutes()
    };
}

// Function to calculate end time based on minutes
function calculateEndTime(minutes) {
    const future = new Date(Date.now() + (minutes * 60000));
    
    // Get Alfred time format preference (default to 12-hour)
    const timeFormat = $.NSProcessInfo.processInfo.environment.objectForKey('alfred_time_format') || 'a';
    
    if (timeFormat === 'a') {
        // 12-hour format with AM/PM
        const formatter = $.NSDateFormatter.alloc.init;
        formatter.setDateFormat('h:mm:ss a');
        const timeStr = formatter.stringFromDate(future);
        return timeStr.replace(/^\s+/, ''); // Remove leading space
    } else {
        // 24-hour format
        const formatter = $.NSDateFormatter.alloc.init;
        formatter.setDateFormat('HH:mm:ss');
        return formatter.stringFromDate(future);
    }
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
    return caffinateArgs.includes('-d') ? " - Display stays awake" : " - Display can sleep";
}

// Function to check caffeinate status
function checkStatus() {
    try {
        // Use NSRunningApplication to check for caffeinate process
        const task = $.NSTask.alloc.init;
        task.setLaunchPath('/usr/bin/pgrep');
        task.setArguments(['-x', 'caffeinate']);
        
        const pipe = $.NSPipe.pipe;
        task.setStandardOutput(pipe);
        task.launch;
        task.waitUntilExit;
        
        const data = pipe.fileHandleForReading.readDataToEndOfFile;
        const pidString = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
        
        if (!pidString.trim()) {
            return "Caffeinate deactivated|Run a command to start caffeinate|false";
        }
        
        const pid = pidString.trim();
        
        // Get process info using ps
        const psTask = $.NSTask.alloc.init;
        psTask.setLaunchPath('/bin/ps');
        psTask.setArguments(['-o', 'lstart=,command=', '-p', pid]);
        
        const psPipe = $.NSPipe.pipe;
        psTask.setStandardOutput(psPipe);
        psTask.launch;
        psTask.waitUntilExit;
        
        const psData = psPipe.fileHandleForReading.readDataToEndOfFile;
        const psOutput = $.NSString.alloc.initWithDataEncoding(psData, $.NSUTF8StringEncoding).js;
        
        if (!psOutput.trim()) {
            return "Caffeinate deactivated|Run a command to start caffeinate|false";
        }
        
        // Parse the ps output
        const psLine = psOutput.trim();
        const caffinateIndex = psLine.indexOf('caffeinate');
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
            
            // Calculate end time
            const endDate = new Date(startDate.getTime() + (totalSeconds * 1000));
            const timeFormat = $.NSProcessInfo.processInfo.environment.objectForKey('alfred_time_format') || 'a';
            
            let endTimeStr;
            if (timeFormat === 'a') {
                const formatter = $.NSDateFormatter.alloc.init;
                formatter.setDateFormat('h:mm a');
                endTimeStr = formatter.stringFromDate(endDate).replace(/^\s+/, '');
            } else {
                const formatter = $.NSDateFormatter.alloc.init;
                formatter.setDateFormat('HH:mm');
                endTimeStr = formatter.stringFromDate(endDate);
            }
            
            const title = `Caffeinate active until ${endTimeStr}`;
            
            // Format remaining time
            let subtitle;
            if (remainingSeconds < 60) {
                subtitle = `${remainingSeconds}s left${displaySleepInfo}`;
            } else if (remainingSeconds < 3600) {
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = remainingSeconds % 60;
                subtitle = seconds === 0 ? `${minutes}m left${displaySleepInfo}` : `${minutes}m ${seconds}s left${displaySleepInfo}`;
            } else {
                const hours = Math.floor(remainingSeconds / 3600);
                const minutes = Math.floor((remainingSeconds % 3600) / 60);
                subtitle = minutes === 0 ? `${hours}h left${displaySleepInfo}` : `${hours}h ${minutes}m left${displaySleepInfo}`;
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

// Function to parse input and calculate total minutes
function parseInput(input) {
    if (!input || input.trim() === "") {
        return "0";
    }
    
    const parts = input.trim().split(/\s+/);
    
    // Check for status command
    if (parts[0] === "s") {
        return "status";
    }
    
    // Handle single input cases
    if (parts.length === 1) {
        const part = parts[0];
        
        // Special value for indefinite mode
        if (part === "i") {
            return "indefinite";
        }
        
        // Format: 2h (hours)
        const hoursMatch = part.match(/^(\d+)h$/);
        if (hoursMatch) {
            return String(parseInt(hoursMatch[1]) * 60);
        }
        
        // Direct number input (minutes)
        const numberMatch = part.match(/^\d+$/);
        if (numberMatch) {
            return part;
        }
        
        // Format: 8 or 8: (hour only)
        const hourOnlyMatch = part.match(/^(\d{1,2}):?$/);
        if (hourOnlyMatch) {
            const currentTime = getCurrentTime();
            const hour = parseInt(hourOnlyMatch[1].replace(/^0+/, '')) || 0;
            
            if (part.endsWith(':')) {
                // Calculate specific time with colon
                const totalMinutes = getNearestFutureTime(hour, 0, currentTime.hour, currentTime.minute);
                const futureTime = calculateFutureTime(totalMinutes, currentTime.hour, currentTime.minute);
                return futureTime.replace(/:(\d+)$/, ':00'); // Force minutes to 00
            } else {
                // Return minutes
                return String(getNearestFutureTime(hour, 0, currentTime.hour, currentTime.minute));
            }
        }
        
        // Format: 8a, 8am, 8p, 8pm
        const ampmMatch = part.match(/^(\d{1,2})([aApP])?(m)?$/);
        if (ampmMatch) {
            let hour = parseInt(ampmMatch[1]);
            const ampm = ampmMatch[2] || "";
            
            if (ampm) {
                // With AM/PM indicator
                hour = convertTo24hFormat(hour, ampm);
                return `TIME:${padZero(hour)}:00`;
            } else {
                // Without AM/PM, use nearest future time
                const currentTime = getCurrentTime();
                return String(getNearestFutureTime(hour, 0, currentTime.hour, currentTime.minute));
            }
        }
        
        // Format: 8:30, 8:30a, 8:30am, 8:30p, 8:30pm
        const timeMatch = part.match(/^(\d{1,2}):(\d{1,2})([aApP])?([mM])?$/);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2]);
            const ampm = timeMatch[3] || "";
            
            if (ampm) {
                // With AM/PM indicator
                hour = convertTo24hFormat(hour, ampm);
                return `TIME:${padZero(hour)}:${padZero(minute)}`;
            } else {
                // Without explicit AM/PM, calculate future time
                const currentTime = getCurrentTime();
                const totalMinutes = getNearestFutureTime(hour, minute, currentTime.hour, currentTime.minute);
                return calculateFutureTime(totalMinutes, currentTime.hour, currentTime.minute);
            }
        }
        
        return "0"; // Invalid single input
    }
    
    // Handle two-part input (hours and minutes)
    if (parts.length === 2) {
        const hours = parts[0].match(/^\d+$/);
        const minutes = parts[1].match(/^\d+$/);
        
        if (hours && minutes) {
            return String(parseInt(parts[0]) * 60 + parseInt(parts[1]));
        }
        
        return "0"; // Invalid two-part input
    }
    
    return "0"; // Default case: invalid input
}

// Function to generate Alfred JSON output
function generateOutput(inputResult) {
    // Check for invalid input first
    if (inputResult === "0") {
        return JSON.stringify({
            items: [{
                title: "Invalid input",
                subtitle: "Please provide a valid time format",
                arg: "0",
                icon: { path: "icon.png" }
            }]
        });
    }
    
    // Check for indefinite mode
    if (inputResult === "indefinite") {
        return JSON.stringify({
            items: [{
                title: "Active indefinitely",
                subtitle: "Keep your Mac awake until manually disabled",
                arg: "indefinite",
                icon: { path: "icon.png" }
            }]
        });
    }
    
    // Check for status command
    if (inputResult === "status") {
        const statusData = checkStatus();
        const parts = statusData.split('|');
        const title = parts[0];
        const subtitle = parts[1];
        const needsRerun = parts[2] === "true";
        
        const result = {
            items: [{
                title: title,
                subtitle: subtitle,
                arg: "status",
                icon: { path: "icon.png" }
            }]
        };
        
        if (needsRerun) {
            result.rerun = 1;
        }
        
        return JSON.stringify(result);
    }
    
    // Check for target time format
    if (inputResult.startsWith("TIME:")) {
        const targetTime = inputResult.substring(5);
        const timeFormat = $.NSProcessInfo.processInfo.environment.objectForKey('alfred_time_format') || 'a';
        
        let displayTime;
        if (timeFormat === 'a') {
            try {
                const [hour, minute] = targetTime.split(':').map(n => parseInt(n));
                const tempDate = new Date();
                tempDate.setHours(hour, minute, 0, 0);
                
                const formatter = $.NSDateFormatter.alloc.init;
                formatter.setDateFormat('h:mm a');
                displayTime = formatter.stringFromDate(tempDate).replace(/^\s+/, '');
            } catch (error) {
                displayTime = targetTime;
            }
        } else {
            displayTime = targetTime;
        }
        
        return JSON.stringify({
            items: [{
                title: `Active until ${displayTime}`,
                subtitle: "Keep awake until specified time",
                arg: inputResult,
                icon: { path: "icon.png" }
            }]
        });
    }
    
    // Handle duration in minutes
    const minutes = parseInt(inputResult);
    const endTime = calculateEndTime(minutes);
    const formattedDuration = formatDuration(minutes);
    
    return JSON.stringify({
        rerun: 1,
        items: [{
            title: `Active for ${formattedDuration}`,
            subtitle: `Keep awake until around ${endTime}`,
            arg: inputResult,
            icon: { path: "icon.png" }
        }]
    });
}

// Main function
function run(argv) {
    const input = argv.length > 0 ? argv[0] : "";
    const inputResult = parseInput(input);
    return generateOutput(inputResult);
}
