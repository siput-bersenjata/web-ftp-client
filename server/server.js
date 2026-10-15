const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const profileService = require('./profileService');
const localService = require('./localService');
const ftpService = require('./ftpService');
const queueManager = require('./queueManager');

const fs = require('fs-extra');
const multer = require('multer');

const uploadTempDir = path.join(__dirname, '../data/temp/uploads');
fs.ensureDirSync(uploadTempDir);
const upload = multer({ dest: uploadTempDir });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Never cache API responses so directory listings are always fresh
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Serve static frontend build if present
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

// WebSocket broadcast helper
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Subscribe queue events to WS broadcast
queueManager.on('queueUpdated', (queue) => {
  broadcast({ type: 'QUEUE_UPDATE', payload: queue });
});

queueManager.on('taskProgress', ({ task }) => {
  broadcast({ type: 'TASK_PROGRESS', payload: task });
});

queueManager.on('log', (logObj) => {
  broadcast({ type: 'FTP_LOG', payload: logObj });
});

queueManager.on('taskCompleted', ({ task }) => {
  broadcast({ type: 'TASK_DONE', payload: task });
});

queueManager.on('taskFailed', ({ task, error }) => {
  broadcast({ type: 'TASK_DONE', payload: task });
  broadcast({ type: 'FTP_LOG', payload: { timestamp: new Date().toLocaleTimeString(), message: `[Error] ${task.name}: ${error}` } });
});

// Broadcast client connection
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'INIT',
    payload: {
      queue: queueManager.getQueue(),
      timestamp: new Date().toISOString()
    }
  }));
});

// --- API ROUTES ---

// 1. Connection Profiles
app.get('/api/profiles', async (req, res) => {
  try {
    const profiles = await profileService.getProfiles();
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profiles', async (req, res) => {
  try {
    const saved = await profileService.saveProfile(req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/profiles/:id', async (req, res) => {
  try {
    const result = await profileService.deleteProfile(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Local File System
app.get('/api/local/list', async (req, res) => {
  try {
    const folderPath = req.query.path;
    const data = await localService.listLocalDirectory(folderPath);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/local/mkdir', async (req, res) => {
  try {
    const { parentPath, name } = req.body;
    const result = await localService.createLocalDirectory(parentPath, name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/local/item', async (req, res) => {
  try {
    const { path: itemPath } = req.body;
    const result = await localService.deleteLocalItem(itemPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/local/rename', async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    const result = await localService.renameLocalItem(oldPath, newPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/local/shortcuts', (req, res) => {
  try {
    const shortcuts = localService.getLocalShortcuts();
    res.json(shortcuts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. FTP Operations
app.post('/api/ftp/test', async (req, res) => {
  try {
    const result = await ftpService.testConnection(req.body, (log) => {
      broadcast({ type: 'FTP_LOG', payload: log });
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ftp/connect', async (req, res) => {
  try {
    const { sessionId, config } = req.body;
    const result = await ftpService.connect(sessionId, config, (log) => {
      broadcast({ type: 'FTP_LOG', payload: log });
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/ftp/list', async (req, res) => {
  try {
    const { sessionId, path: remotePath } = req.query;
    const data = await ftpService.list(sessionId, remotePath, (log) => {
      broadcast({ type: 'FTP_LOG', payload: log });
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ftp/mkdir', async (req, res) => {
  try {
    const { sessionId, parentPath, name } = req.body;
    const result = await ftpService.createDirectory(sessionId, parentPath, name, (log) => {
      broadcast({ type: 'FTP_LOG', payload: log });
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ftp/item', async (req, res) => {
  try {
    const { sessionId, path: remotePath, isDir } = req.body;
    const result = await ftpService.deleteItem(sessionId, remotePath, isDir, (log) => {
      broadcast({ type: 'FTP_LOG', payload: log });
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ftp/rename', async (req, res) => {
  try {
    const { sessionId, oldPath, newPath } = req.body;
    const result = await ftpService.renameItem(sessionId, oldPath, newPath, (log) => {
      broadcast({ type: 'FTP_LOG', payload: log });
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ftp/disconnect', async (req, res) => {
  try {
    const { sessionId } = req.body;
    const result = await ftpService.disconnect(sessionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direct upload from browser (drag & drop from desktop or file input)
app.post('/api/ftp/upload-direct', upload.array('files'), (req, res) => {
  try {
    const { sessionId, destinationPath } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId diperlukan' });
    }
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Tidak ada file yang diterima' });
    }
    const targetDir = destinationPath || '/';
    const tasks = files.map(file => ({
      name: file.originalname,
      type: 'upload',
      sourcePath: file.path,
      destinationPath: targetDir,
      size: file.size,
      sessionId,
      isTempFile: true
    }));
    const added = queueManager.addBatch(tasks);
    res.json({ success: true, count: added.length, tasks: added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Transfer Queue Endpoints
app.get('/api/queue', (req, res) => {
  res.json(queueManager.getQueue());
});

app.post('/api/queue/add', (req, res) => {
  try {
    const { tasks } = req.body;
    if (Array.isArray(tasks)) {
      const added = queueManager.addBatch(tasks);
      res.json(added);
    } else {
      const added = queueManager.addTask(req.body);
      res.json(added);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/queue/:id', (req, res) => {
  queueManager.removeTask(req.params.id);
  res.json({ success: true });
});

app.post('/api/queue/move', (req, res) => {
  const { id, direction } = req.body;
  queueManager.moveTask(id, direction);
  res.json({ success: true });
});

app.post('/api/queue/clear-finished', (req, res) => {
  queueManager.clearFinished();
  res.json({ success: true });
});

// Catch-all route to serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('FTP Web Client Backend Running. Start Vite dev server on port 5173.');
    }
  });
});

server.listen(PORT, () => {
  console.log(`=============================================`);
  console.log(`🚀 FTP Web Client Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server active on ws://localhost:${PORT}/ws`);
  console.log(`=============================================`);
});
