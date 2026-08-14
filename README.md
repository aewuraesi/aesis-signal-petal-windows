# Aesi's Signal Petal for Windows

A private, local browser app for tracking issues, follow-ups, actions, outcomes, and delivery health. Everything stays on this PC in its browser storage.

## What you need

- A Windows PC
- **Node.js 22 LTS or newer**, available from [nodejs.org](https://nodejs.org/)
- An internet connection for the first setup only

## Start the app

1. On this repository's GitHub page, choose **Code** then **Download ZIP**.
2. Right-click the downloaded ZIP file and choose **Extract All**.
3. Open the extracted folder.
4. Double-click **Start Aesi's Signal Petal.cmd**.
5. On its first run, the app installs what it needs and starts at [http://localhost:3000](http://localhost:3000).

Keep the Command Prompt window open while you use the app. Press `Ctrl + C` in that window when you want to stop it.

## PowerShell option

Right-click inside the extracted folder and choose **Open in Terminal**, or open PowerShell and move to the app folder. For example:

```powershell
cd "$HOME\Downloads\aesis-signal-petal-windows"
```

Install and start the app:

```powershell
corepack pnpm install
corepack pnpm dev
```

Open the local address printed in the terminal window—normally [http://localhost:3000](http://localhost:3000).

## Everyday use

After the first setup, simply double-click **Start Aesi's Signal Petal.cmd** again. It opens the app locally in your browser.

## Your data

- Issues, updates, themes, and your profile stay in this browser on this PC.
- Sharing this repository or ZIP does **not** share your logged work.
- Clearing browser data for `localhost` removes this app's local records, so keep important long-term notes elsewhere as well.

## Troubleshooting

- **Node.js is missing:** install Node.js 22 LTS or newer from [nodejs.org](https://nodejs.org/), then start the app again.
- **A Windows security prompt appears:** choose **More info** then **Run anyway** only after confirming the file came from this repository.
- **The page does not open:** make sure the Command Prompt or PowerShell window remains open and use the exact local address it displays.
- **Port 3000 is busy:** use the alternate local address shown in the terminal window.
