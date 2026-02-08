# <img src="img/caffeine-dose-logo.PNG" alt="Caffeinate Dose Alfred Workflow Icon" width="45" align="center"/> Caffeine Dose | Alfred Workflow

Keeps your Mac awake using the `caffeinate` command-line utility. No third-party or dedicated apps required. From Alfred you can start/stop sessions, set a duration or end time, and check the status.

## Download

- Available on the Alfred Gallery. [Get it here](https://alfred.app/workflows/vanstrouble/caffeine-dose/).
-   Get it on GitHub [here](https://github.com/vanstrouble/caffeine-dose-alfred-workflow/releases).

**Using Amphetamine? No worries — grab the workflow dose [here](https://github.com/vanstrouble/dose-alfred-workflow).**

## Usage

Start typing your action in Alfred using your configured keyword (default: `caff` or `cfs`, or your preferred trigger).

### Keep your Mac awake (caff)

<img src="img/caff.png" alt="Alfred toggle Caffeinate image" width="550"/>

Use the `caff` keyword to toggle caffeinate on or off, preventing macOS from sleeping.

- **Keyword:** `caff`

Hold the **Command (⌘)** key while using the `caff` command, the session will allow the display to sleep.

### One command for everything (cfs)

<img src="img/cfs.png" alt="Alfred set Caffeinate duration image" width="550"/>

The `cfs` command allows you to set caffeinate to keep your Mac awake for a specific duration or until a specific time. It also displays a simple status indicator showing whether caffeinate is currently active or inactive. It supports natural input formats for minutes, hours, and specific times, making it flexible and easy to use.

- **Keyword:** `cfs [duration or time]`

Hold the **Command (⌘)** key while using the `cfs` command, the session will allow the display to sleep.

#### Examples:

| Command     | Description                                     |
|-------------|-------------------------------------------------|
| `cfs s`     | Shows status, time left, and if display can sleep. |
| `cfs d`     | Deactivates caffeinate. |
| `cfs i`     | Keeps your Mac awake indefinitely.              |
| `cfs 15`    | Keeps your Mac awake for 15 minutes.            |
| `cfs 2h`    | Keeps your Mac awake for 2 hours.               |
| `cfs 1 30`  | Keeps your Mac awake for 1 hour and 30 minutes. |
| `cfs 9:30`  | Keeps your Mac awake until the next 9:30.       |
| `cfs 8am`   | Keeps your Mac awake until 8:00 AM.             |
| `cfs 11:40pm`| Keeps your Mac awake until 11:40 PM.           |

The `cfs` command supports both 12-hour (AM/PM) and 24-hour time formats.

### Customization

**Keywords:**

Both `caff` and `cfs` commands can be customized in the workflow settings. You can modify their keywords or behavior to better suit your needs.

**Time format:**

Set to 12-hour (AM/PM) or 24-hour in the workflow settings. This changes how times are shown in notifications and status.

**Hotkeys:**

Set hotkeys for quick and direct actions, like toggling caffeinate or starting a session instantly.
