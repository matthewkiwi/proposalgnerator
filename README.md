# Robot.com Proposal App

A team proposal generator with PDF export, saved proposals, and an admin settings panel.

---

## Deploy in 5 minutes on Railway (free)

### Step 1 — Push to GitHub
1. Go to github.com and create a new repository (e.g. `robotcom-proposals`)
2. Upload all the files from this folder into that repo

### Step 2 — Deploy on Railway
1. Go to railway.app and sign up (free)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `robotcom-proposals` repo
4. Railway will auto-detect Node.js and deploy

### Step 3 — Set environment variables (optional but recommended)
In Railway, go to your project → **Variables** and add:
```
APP_PASSWORD=robot
SESSION_SECRET=pick-any-long-random-string
PORT=3000
```

### Step 4 — Get your URL
Railway gives you a free URL like `https://robotcom-proposals.up.railway.app`
Share that with your team — done!

---

## Run locally (for testing)

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
http://localhost:3000
```

**Note:** PDF generation uses Puppeteer (headless Chrome). On first run it downloads Chromium automatically (~170MB). This only happens once.

---

## File structure

```
robotcom-app/
  server.js          ← Express backend (API + PDF generation)
  package.json       ← Dependencies
  public/
    index.html       ← Full frontend (login, generator, saved, admin)
  data/
    proposals.json   ← Saved proposals (auto-created)
    settings.json    ← Admin settings (auto-created)
```

---

## Features

| Feature | Details |
|---|---|
| Login | Password: `robot` (change via APP_PASSWORD env var) |
| Proposal generator | Multiple options (A/B/C...), client info, notes |
| PDF download | Branded Robot.com PDF, downloads instantly |
| Save proposals | Stored in `data/proposals.json` on the server |
| Load & edit | Open any saved proposal back into the editor |
| Admin panel | Edit intro text, operator note, included items, robot models, service tiers |

---

## Changing the password

Set the `APP_PASSWORD` environment variable in Railway, or edit line 7 of `server.js`:
```js
const PASSWORD = process.env.APP_PASSWORD || 'robot';
```

---

## Backup your proposals

The `data/` folder holds everything. To back it up, just copy `data/proposals.json`.
On Railway, proposals persist as long as your deployment is running.
For permanent storage, consider Railway's free PostgreSQL add-on later.
