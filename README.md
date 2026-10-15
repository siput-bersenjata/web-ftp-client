# Web-Based Dual-Pane FTP Client Manager

A modern, desktop-grade web application for transferring files between local PC folders and FTP/FTPS/SFTP accounts. Features persistent local profile storage, instant Quick Connect, dual-pane file management, live drag-and-drop transfers, transfer queue with speed metrics, and real-time FTP logs.

---

## ✨ Features

- 🖥️ **PC Local & Remote FTP Explorer**: Side-by-side dual panes with breadcrumbs, path jumping, sorting, file type icons (Excel, Word, Archives, Images, etc.), and status summary.
- ⚡ **Quick Connect & Persistent Profiles**: Saved profiles are stored on your machine and sync with `localStorage` so you never have to re-enter credentials upon returning.
- 📝 **Create Connection Profile Wizard**:
  - Select local PC folder (e.g. `C:\Users\bram\Documents`)
  - Set Host IP / Domain, Username, Password, Anonymous mode
  - Protocol support: FTP, FTPS (Explicit/Implicit), SFTP (SSH)
  - Port & Passive mode toggles
  - Home folder path
  - Built-in "Test Connection" button with live status verification
- 🗂️ **Tabbed Multi-Session Interface**: Switch effortlessly between multiple FTP servers.
- 🔄 **Real-Time Transfer Engine & Queue**:
  - Upload & download using center transfer buttons (`->` and `<-`) or direct drag-and-drop between panes.
  - Queue manager with progress bars, transfer speeds (KB/s, MB/s), queue reordering (Move Up, Move Down), and item removal.
- 📜 **Live Transfer Log Terminal**: Real-time FTP command stream (`USER`, `PASS`, `PASV`, `RETR`, `STOR`, `226 Transfer complete`) powered by WebSockets.

---

## 🚀 How to Run

### 1. Start the Server
```powershell
npm start
```
This runs the unified Express backend and static client on **http://localhost:5000**.

### 2. Development Mode (Hot Reload)
To run both backend with auto-restart and Vite client with instant HMR:
```powershell
npm run dev
```
- Frontend Dev Server: **http://localhost:5173**
- Backend API & WebSockets: **http://localhost:5000**
