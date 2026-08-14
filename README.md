# Aesi's Signal Petal

A private, local browser app for SREs to log issues, coordinate follow-ups, record outcomes, and track delivery health. Each person runs their own copy on their own computer.

## What it includes

- Issue and task tracking, ownership, ETAs, status, actions, outcomes, and update timelines
- Dashboard, daily calendar, and delivery insights
- Desktop follow-up and daily check-in notifications (when the browser is open and permission is granted)
- Ten light themes and matching dark themes
- Local-only storage: data stays in the browser on that computer

## Before you start

Install **Node.js 22 LTS or newer** from [nodejs.org](https://nodejs.org/). Node is the small runtime that lets this local app run.

You also need an internet connection the first time you install the app, so its dependencies can download. After installation, day-to-day use is local.

## macOS setup

1. Unzip the `aesis-signal-petal-v1.2.zip` file.
2. For the easiest start, double-click **Start Aesi's Signal Petal.command**. If macOS blocks it, right-click the file, choose **Open**, then choose **Open** again.
3. The first launch downloads the app’s required components, then opens it at [http://localhost:3000](http://localhost:3000).

### Terminal alternative

Open **Terminal** and move into the unzipped folder. For example:

```bash
cd ~/Downloads/aesis-signal-petal
```

Then enable the included package manager and install the app:

```bash
corepack enable
pnpm install
```

Start the app:

```bash
pnpm dev
```

Open the local address shown in Terminal—normally [http://localhost:3000](http://localhost:3000).

Leave Terminal running while you use the app. To stop it, return to Terminal and press `Control + C`.

## Windows setup

1. Right-click `aesis-signal-petal-v1.2.zip` and choose **Extract All**.
2. Open the extracted `aesis-signal-petal` folder.
3. Double-click **Start Aesi's Signal Petal.cmd**. The first launch downloads the required components, then the app starts at [http://localhost:3000](http://localhost:3000).

### PowerShell alternative

Right-click inside the extracted folder and choose **Open in Terminal** (or open PowerShell and navigate to the folder). Enable the included package manager, then install the app:

```powershell
corepack enable
pnpm install
```

Start the app:

```powershell
pnpm dev
```

Open the address shown in the terminal window—normally [http://localhost:3000](http://localhost:3000).

Keep that terminal window open while using the app. Press `Ctrl + C` to stop it.

## Everyday use

After the one-time installation, open a terminal in the app folder and run:

```bash
pnpm dev
```

Then visit [http://localhost:3000](http://localhost:3000).

## Data and sharing notes

- Your issues, updates, and theme choice are saved only in your browser on the computer where you use the app.
- Sharing this zip gives someone the application, **not** your logged work or browser data.
- Each person has their own separate local workspace. There is no shared team database in this version.
- Clearing browser storage for `localhost` clears that local app data, so keep important records elsewhere if you need a long-term backup.

## Troubleshooting

- **`pnpm` is not recognized:** close and reopen Terminal/PowerShell after running `corepack enable`, then try again.
- **The local address will not open:** make sure `pnpm dev` is still running and use the exact address printed in the terminal.
- **Port 3000 is already in use:** the terminal will offer another local address; use that one instead.
