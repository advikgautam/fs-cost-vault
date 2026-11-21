# Formula Student Cost Report Vault

A local web application for organizing our Formula Student car's Cost Report components, supporting documents (calculations, invoices, CAD drawings), and photos—with built-in GitHub sync so every subsystem can update their parts without merge conflicts.

---

## Features

* **Subsystem Organization:** Browse components by Main Part (`Body & Aero`, `Brakes`, `Suspension`, `Frame & Chassis`, `Powertrain`, `Electrical`, `Steering`, `Wheels & Tires`, `Misc`).
* **Instant Search:** Filter components in real time by Name, Custom ID, or Main Part.
* **Multiple Documents & Photos:** Upload multiple supporting files (PDFs, Excel sheets, quotes, CAD screenshots) and multiple photos per component, complete with a thumbnail gallery viewer.
* **Built-in GitHub Sync:** Pull teammates' updates (`↓ PULL`) and push your own additions (`↑ PUSH`) directly from the top bar.
* **CSV Export:** One-click export of all components, descriptions, photos, and linked documents (`fs_cost_report.csv`).
* **Conflict-Free Storage:** Each component is stored inside its own folder (`vault/<COMPONENT_ID>/meta.json`), allowing different subsystems to work in parallel without breaking a shared database file.

---

## Prerequisites

Before setting up the project, make sure you have the following installed on your laptop:

1. **Python 3** — Download from [python.org](https://www.python.org/downloads/) *(Windows users: check **"Add Python to PATH"** during installation).*
2. **Git** — Download from [git-scm.com](https://git-scm.com/downloads) and sign in with your GitHub account.
3. **Repository Access** — Make sure you have been added as a collaborator to the team's GitHub repository.

---

## One-Time Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/advikgautam/fs-cost-vault.git
   cd fs-cost-vault
   ```

2. **Install Flask (the only dependency):**
   * **Windows (PowerShell / Command Prompt):**
     ```powershell
     py -m pip install flask
     ```
   * **macOS / Linux:**
     ```bash
     pip3 install flask
     ```

---

## Running the App

1. Open a terminal inside the project folder and start the local server:
   * **Windows:**
     ```powershell
     py app.py
     ```
   * **macOS / Linux:**
     ```bash
     python3 app.py
     ```
2. Open your web browser and go to: **`http://127.0.0.1:8000`**
3. **Keep the terminal window open** while using the app.
   > **Note:** Do not press `Ctrl + C` inside the terminal unless you want to stop the server.

---

## Team Workflow (Follow Every Session)

To keep everyone's work synced and avoid duplicates, follow these three steps every time you add or edit parts:

1. **Pull Latest Changes First**
   Click **`↓ PULL`** in the top bar before adding anything. This downloads the latest components uploaded by other teammates.

2. **Add Your Component**
   Click the **`+`** button and fill in the fields:
   * **Name / ID:** Use a clear, unique subsystem prefix so IDs stay organized and never clash (see naming guide below).
   * **Main Part:** Choose your subsystem from the dropdown.
   * **Documents:** Select all supporting files (cost calculations, quotes, invoices, manufacturing sheets). Multiple files are supported.
   * **Photos:** Select one or more photos of the part.
   * **Description:** Enter unit price, quantity, material specs, manufacturing process, or calculation notes.

3. **Push Your Updates**
   Click **`↑ PUSH`** when you finish. The app automatically stages the `vault/` folder, commits your additions, pulls any remote changes, and pushes everything to GitHub.

---

## Recommended Component Naming Convention

Use your subsystem prefix followed by a number and clear part name:

| Subsystem | Prefix | Example Name / ID |
| :--- | :---: | :--- |
| Body & Aero | `BA` | `BA-01 Front Wing Endplate` |
| Brakes | `BR` | `BR-01 Master Cylinder` |
| Suspension | `SU` | `SU-04 Front Upright` |
| Frame & Chassis | `FR` | `FR-02 Main Hoop` |
| Powertrain | `PT` | `PT-01 Chain Tensioner` |
| Electrical | `EL` | `EL-03 Shutdown Circuit PCB` |
| Steering | `ST` | `ST-01 Quick Release Hub` |
| Wheels & Tires | `WT` | `WT-02 Front Wheel Rim` |
| Misc | `MS` | `MS-01 Fire Extinguisher Mount` |

---

## Project Structure

```text
├── app.py                      # Flask backend, JSON vault storage, and Git sync API
├── templates/
│   ├── index.html              # Main dashboard & Add Component modal
│   └── detail.html             # Component detail window (documents, photo gallery, description)
├── vault/                      # Auto-managed component folders (synced via GitHub)
│   └── <COMPONENT_ID>/
│       ├── meta.json           # Component metadata & description
│       ├── PHOTO_*.jpg         # Uploaded component photos
│       └── *.pdf               # Uploaded supporting documents
├── .gitignore                  # Excludes local cache & environment files
└── README.md                   # Team setup & usage guide
```

---

## Troubleshooting

* **`ERR_CONNECTION_REFUSED` in the browser:**
  The local server isn't running (or was closed with `Ctrl + C`). Open your terminal in the project folder and run `py app.py` (Windows) or `python3 app.py` (macOS/Linux), then refresh the page.
* **`No module named pip` or `No module named flask` on Windows:**
  Always use `py` instead of `python` so Windows uses the right Python installation (`py -m pip install flask` and `py app.py`).
* **`↓ PULL` or `↑ PUSH` returns an error:**
  Make sure Git is configured with your name/email and signed into GitHub on your machine:
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "your.email@example.com"
  ```
  Then try running `git push` once in the terminal to trigger the GitHub sign-in prompt if you haven't logged in yet.
* **"Component already exists" error:**
  Every component requires a unique `Name / ID`. Click **`↓ PULL`** and use the search bar to check if a teammate already created it.