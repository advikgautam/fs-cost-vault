# Formula Student Cost Report Vault

A local web application for managing our Formula Student car's Cost Report components, supporting documents (calculations, invoices, quotes, CAD drawings), and photos—with built-in GitHub sync so every subsystem can add and update parts without merge conflicts.

---

## Features

* **Subsystem Organization:** Browse components by Main Part (`Body & Aero`, `Brakes`, `Suspension`, `Frame & Chassis`, `Powertrain`, `Electrical`, `Steering`, `Wheels & Tires`, `Misc`).
* **Real-Time Search:** Quickly filter components by Custom ID, Component Name, or Main Part.
* **Multiple Documents & Photo Gallery:** Attach multiple PDFs, spreadsheets, or drawings alongside multiple photos per component, viewed in a dedicated detail tab with a thumbnail gallery.
* **One-Click GitHub Sync:** Pull teammates' additions (`↓ PULL`) and push your own updates (`↑ PUSH`) straight from the top bar.
* **CSV Export:** Export the full component list, descriptions, and attached filenames to `fs_cost_report.csv` in one click.
* **Conflict-Free Vault Storage:** Every component lives in its own folder (`vault/<COMPONENT_ID>/meta.json`), so multiple subsystems can push updates in parallel without corrupting a shared database.

---

## Prerequisites

Make sure you have the following before setting up the app:

1. **Repository Access:** Ask the repo owner to add your GitHub account under **Settings → Collaborators** and accept the invite email.
2. **Python 3:** Install from [python.org](https://www.python.org/downloads/) *(Windows users: check **"Add Python to PATH"** during setup)*.
3. **Git:** Install from [git-scm.com](https://git-scm.com/downloads).

---

## One-Time Setup

### 1. Clone the repository

```bash
git clone https://github.com/advikgautam/fs-cost-vault.git
cd fs-cost-vault
```

### 2. Configure Git (first time on your laptop)

Set your GitHub name and email so commits are attributed to you:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-github-email@example.com"
```

*(Windows users on restricted or campus networks: run this once so Git HTTPS pulls/pushes don't get blocked by SSL revocation checks)*:

```powershell
git config --global http.schannelCheckRevoke false
```

### 3. Install Flask

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

1. Open a terminal inside the `fs-cost-vault` folder and start the local server:
   * **Windows:**
     ```powershell
     py app.py
     ```
   * **macOS / Linux:**
     ```bash
     python3 app.py
     ```
2. Open your browser and go to: **`http://127.0.0.1:8000`**
3. **Keep the terminal open** while using the app.
   > **Tip:** Do not press `Ctrl + C` inside the terminal to copy the URL—`Ctrl + C` stops the server.

---

## Team Workflow (Follow Every Session)

1. **Click `↓ PULL` first**
   Always pull before adding anything so you have the latest components from other subsystems.
2. **Click `+` to add a component**
   * **Name / ID:** Use your subsystem prefix and a clear part name (see naming table below).
   * **Main Part:** Select the subsystem from the dropdown.
   * **Documents:** Select all supporting files (cost calculations, invoices, quotes, CAD sheets). Multiple files are supported.
   * **Photos:** Select one or more photos of the component.
   * **Description:** Enter unit cost, quantity, material specs, manufacturing processes, or calculation notes.
3. **Review or Delete**
   Click any component in the list to open its detail page in a new tab. Deleting a component removes its folder and files from `vault/`.
4. **Click `↑ PUSH` when done**
   The app automatically stages changes in `vault/`, commits them, pulls any remote updates, and pushes to GitHub.
   *(On your very first push on Windows, if a **CredentialHelperSelector** popup appears, choose **`manager`**, check **"Always use this from now on"**, click **Select**, and sign in via your browser.)*

---

## Component Naming Convention

Use a consistent subsystem prefix so IDs stay searchable and never collide:

| Subsystem | Prefix | Example Name / ID |
| :--- | :--- | :--- |
| Body & Aero | `BA` | `BA-01 Front Wing Endplate` |
| Brakes | `BR` | `BR-01 Master Cylinder` |
| Suspension | `SU` | `SU-04 Front Upright` |
| Frame & Chassis | `FR` | `FR-02 Main Hoop` |
| Powertrain | `PT` | `PT-01 Motor Mount` |
| Electrical | `EL` | `EL-03 Shutdown Circuit PCB` |
| Steering | `ST` | `ST-01 Quick Release Hub` |
| Wheels & Tires | `WT` | `WT-02 Front Wheel Rim` |
| Misc | `MS` | `MS-01 Fire Extinguisher Mount` |

---

## Project Structure

```text
fs-cost-vault/
├── app.py                      # Flask backend, JSON vault storage, and Git sync routes
├── templates/
│   ├── index.html              # Main dashboard, search bar, and Add Component modal
│   └── detail.html             # Component detail tab (documents, photo gallery, description)
├── vault/                      # Auto-created component folders (synced via GitHub)
│   └── <COMPONENT_ID>/
│       ├── meta.json           # Component metadata and description
│       ├── PHOTO_*             # Uploaded component photos
│       └── *                   # Uploaded supporting documents
├── .gitignore                  # Excludes local cache and environment files
└── README.md                   # Team setup and usage guide
```

---

## Troubleshooting

* **`ERR_CONNECTION_REFUSED` in the browser:**
  The Flask server is not running (or was stopped with `Ctrl + C`). Run `py app.py` (Windows) or `python3 app.py` (macOS/Linux) in the project folder and refresh the page.
* **`No module named pip` or `No module named flask` on Windows:**
  Use `py` instead of `python` (`py -m pip install flask` and `py app.py`) so Windows uses the right Python installation instead of MSYS2 or another environment.
* **`CRYPT_E_REVOCATION_OFFLINE (0x80092013)` when cloning, pulling, or pushing:**
  Run `git config --global http.schannelCheckRevoke false` in your terminal and retry. If the network still blocks it, run `git config --global http.sslBackend openssl`.
* **`↓ PULL` or `↑ PUSH` fails with an authentication error:**
  Confirm you accepted the GitHub collaborator invite, then run `git push` once manually in the terminal to trigger the GitHub browser login.
* **"Component already exists" error:**
  Every component requires a unique `Name / ID`. Click **`↓ PULL`** and search for the part first to check if a teammate already added it.