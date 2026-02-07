#!/usr/bin/env osascript -l JavaScript

// JXA implementation of toggle_filter functionality
// Migrated from zsh for Alfred workflow, DRY with cfs_filter.js

ObjC.import("Foundation");

const ICON_PATH = "icon.png";

function createAlfredResponse(title, subtitle, arg, allowMods = false) {
	const item = { title, subtitle, arg, icon: { path: ICON_PATH }, valid: true };
	if (allowMods) {
		item.mods = {
			cmd: {
				subtitle: "⌘ Allow display sleep",
				arg,
				variables: { display_sleep_allow: "true" }
			}
		};
	}
	return JSON.stringify({ items: [item] });
}

function isCaffeinateActive() {
	try {
		const task = $.NSTask.alloc.init;
		task.setLaunchPath("/usr/bin/pgrep");
		task.setArguments(["-x", "caffeinate"]);
		const pipe = $.NSPipe.pipe;
		task.setStandardOutput(pipe);
		task.launch;
		task.waitUntilExit;
		return task.terminationStatus === 0;
	} catch (e) {
		return false;
	}
}

function run(argv) {
	return isCaffeinateActive()
		? createAlfredResponse("Turn Off", "Allow computer to sleep", "off")
		: createAlfredResponse("Turn On", "Prevent sleep indefinitely", "on", true);
}
