## Nodeboard

Nodeboard is a lightweight, local-first visual board for organizing ideas, tasks, reminders and small projects using draggable nodes, connections and customizable layouts.

**Use Cases / Examples**

- Daily planning: create nodes for today's tasks and to-dos, move and mark them complete as you make progress.
- Project mapping: group related nodes into collections, connect nodes to show dependencies, and collapse collections when you want a simpler view (collapse not yet added).
- Routines & reminders: define per-day routines and single reminders; mark routine items done each day and see pending items at a glance.
- Quick capture & edit: paste or type an idea to create a node, edit its title & description, color it or add it to a collection.
- Backups & snapshots: automatic local backups plus manual export/import of JSON snapshots for sharing or versioning.
- Lightweight task conversion (not yet added): convert a node into a to-do or routine item and track it from the board or the reminders panel.
- Portable preview & restore: preview backup JSON in Settings and restore a snapshot when you need to roll back.

**The Idea**

Nodeboard focuses on being a small, personal workspace where structure is light and flexible. It lets you visually arrange ideas and tasks, persist snapshots (backups) locally, and import/export JSON snapshots to share or archive boards. The app is intentionally offline-first and stores user data locally by default.

**Key Features**
- Visual nodes and draggable connections
- Collections and grouping (panels/containers)
- Import / Export JSON snapshots
- Automatic local backups (configurable) and Backups Viewer (list / view / restore / delete)
- In-app modals for alerts and confirmations (avoids native dialogs)
- Reminders, todos and simple routines
- Resizable column layout (left/mid/right) and board scaling

**Backups & Data**
- Backups are stored under the app user data directory (userData/backups). The main process handles writing and reading backup files.
- Automatic backups: configurable (default creates a snapshot every ~5 changes). Manual backup is available in Settings.
- Backups can be previewed, restored, deleted, or cleared from the Backups Viewer in the Settings.

**Privacy & Local Storage**
- All primary data is stored locally (localStorage and the app userData folder). No remote services are used by default (and, for now, there are no remote service options).
- Backups are plain JSON files stored on disk — handle them like any other file if you need encryption or cloud sync.

**Development / Installation**
- Installation and build instructions:
    - Windows
        - Zip:
            - Download and extract the Windows zip package in [releases](https://github.com/RikkaDoesThings/Nodeboard/releases).
            - Run the .exe file labeled "Nodeboard.exe"

        - Installer:
            - Download the "Nodeboard Setup {version}.exe" from the [releases](https://github.com/RikkaDoesThings/Nodeboard/releases) page.
            - Run the installer and install the Nodeboard.

    - macOS
        - Zip:
            - (Explanation when version is published to [releases](https://github.com/RikkaDoesThings/Nodeboard/releases) page)

        - Installer:
            - (Explanation when version is published to [releases](https://github.com/RikkaDoesThings/Nodeboard/releases) page)

    - Linux
        - Zip:
            - (Explanation when version is published to [releases](https://github.com/RikkaDoesThings/Nodeboard/releases) page)

        - Installer:
            - (Explanation when version is published to [releases](https://github.com/RikkaDoesThings/Nodeboard/releases) page)

    - Build
        - Install [npm and Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm), unless already installed.
        - Download and extract the source code from the [GitHub](https://github.com/RikkaDoesThings/Nodeboard)
        - (Just in case) run "npm run dev" to make sure your source code works.
        - To build, run `npm run package:{platform}` (replace {platform} with your platform of choice: win, linux, mac. Example: `npm run package:linux`)
        - When finished, you'll have an installer and a folder containing the raw Nodeboard package.

- Developer notes: The renderer is built with Vite + React; Electron is used for the desktop shell. Typical dev flow uses `npm run dev` for local development and `npm run package:win` (or equivalent) for packaging.

**Troubleshooting / Notes**
- If you encounter focus or dialog issues: the app uses in-app modals for most confirmations and alerts to avoid platform-native dialog focus problems.
- Backups failing to save often indicate permission issues in the user data directory — check file permissions for the application profile folder.
- If your problem is unlisted, please (***please***) create an issue post about it on the GitHub repository so that I can fix it.

**Contributing**
- Bug fixes, small features and documentation improvements are all welcome. Keep PRs (pull requests) focused and include a brief plan.

### Changes & To-Do
*Version 0.9.7*
```
Added
[+] backup and restore; [ 'automatic backup (every 3 changes)', 'view, restore, delete, and delete all backups', 'turning on and off automatic backups' ]

Changed
[/] Added license and published to GitHub

Fixed
[*] Fixed backups not working properly in some cases.

To be fixed/added!
[+] Backups creating a backup way too frequently
[+] Error handling for all operations
[+] Collapsing collections
[+] Node conversion (from node to routine or to-do item)
```

### Contact & License
- Discord: [kishirooo](https://discordapp.com/users/1009717580270948372)
- Email: [rikkadoesthings@gmail.com](mailto:rikkadoesthings@gmail.com)
- Copyright © 2025 Rikka. All rights reserved.
- Licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt)
