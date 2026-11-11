const EventEmitter = require('events');
const path = require('path');
const fs = require('fs-extra');
const ftpService = require('./ftpService');

class QueueManager extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.isProcessing = false;
    this.activeTask = null;
  }

  getQueue() {
    return this.queue;
  }

  addTask(task) {
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newTask = {
      id,
      name: task.name || path.basename(task.sourcePath),
      type: task.type, // 'upload' | 'download'
      sourcePath: task.sourcePath,
      destinationPath: task.destinationPath,
      size: task.size || 0,
      transferred: 0,
      progress: 0,
      status: 'Queued', // 'Queued' | 'Transferring' | 'Completed' | 'Failed' | 'Paused'
      speed: '',
      error: null,
      sessionId: task.sessionId,
      isDirectory: !!task.isDirectory,
      isTempFile: !!task.isTempFile,
      addedAt: new Date().toISOString()
    };

    this.queue.push(newTask);
    this.emit('queueUpdated', this.queue);
    this.processNext();
    return newTask;
  }

  addBatch(tasks) {
    const added = tasks.map(t => {
      const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      return {
        id,
        name: t.name || path.basename(t.sourcePath),
        type: t.type,
        sourcePath: t.sourcePath,
        destinationPath: t.destinationPath,
        size: t.size || 0,
        transferred: 0,
        progress: 0,
        status: 'Queued',
        speed: '',
        error: null,
        sessionId: t.sessionId,
        isDirectory: !!t.isDirectory,
        isTempFile: !!t.isTempFile,
        addedAt: new Date().toISOString()
      };
    });

    this.queue.push(...added);
    this.emit('queueUpdated', this.queue);
    this.processNext();
    return added;
  }

  removeTask(id) {
    const idx = this.queue.findIndex(t => t.id === id);
    if (idx >= 0) {
      if (this.queue[idx].status === 'Transferring') {
        // cannot easily cancel active stream, mark failed
        this.queue[idx].status = 'Cancelled';
      }
      this.queue.splice(idx, 1);
      this.emit('queueUpdated', this.queue);
    }
  }

  moveTask(id, direction) {
    const idx = this.queue.findIndex(t => t.id === id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx >= 0 && targetIdx < this.queue.length) {
      const temp = this.queue[idx];
      this.queue[idx] = this.queue[targetIdx];
      this.queue[targetIdx] = temp;
      this.emit('queueUpdated', this.queue);
    }
  }

  clearFinished() {
    this.queue = this.queue.filter(t => t.status === 'Queued' || t.status === 'Transferring');
    this.emit('queueUpdated', this.queue);
  }

  async processNext() {
    if (this.isProcessing) return;
    const nextTask = this.queue.find(t => t.status === 'Queued');
    if (!nextTask) {
      this.activeTask = null;
      return;
    }

    this.isProcessing = true;
    this.activeTask = nextTask;
    nextTask.status = 'Transferring';
    this.emit('queueUpdated', this.queue);

    const startTime = Date.now();
    let lastBytes = 0;

    const onProgress = (prog) => {
      nextTask.transferred = prog.transferred || 0;
      nextTask.progress = prog.percent || (nextTask.size > 0 ? Math.round((nextTask.transferred / nextTask.size) * 100) : 100);
      
      const elapsedSec = (Date.now() - startTime) / 1000;
      if (elapsedSec > 0.5) {
        const speedBps = nextTask.transferred / elapsedSec;
        nextTask.speed = formatSpeed(speedBps);
      }

      this.emit('taskProgress', { task: nextTask });
    };

    const onLog = (logObj) => {
      this.emit('log', logObj);
    };

    try {
      if (nextTask.type === 'upload') {
        // Upload from local to remote
        await ftpService.uploadFile(
          nextTask.sessionId,
          nextTask.sourcePath,
          nextTask.destinationPath,
          onProgress,
          onLog,
          nextTask.name
        );
      } else if (nextTask.type === 'download') {
        // Download from remote to local
        await ftpService.downloadFile(
          nextTask.sessionId,
          nextTask.sourcePath,
          nextTask.destinationPath,
          onProgress,
          onLog,
          { isDirectory: nextTask.isDirectory, size: nextTask.size, modifiedDate: nextTask.modifiedDate }
        );
      }

      nextTask.status = 'Completed';
      nextTask.progress = 100;
      nextTask.speed = 'Done';
      this.emit('taskCompleted', { task: nextTask });
    } catch (err) {
      console.error(`Task ${nextTask.id} failed:`, err);
      nextTask.status = 'Failed';
      nextTask.error = err.message;
      this.emit('taskFailed', { task: nextTask, error: err.message });
    } finally {
      if (nextTask.isTempFile && nextTask.sourcePath) {
        fs.remove(nextTask.sourcePath).catch(() => {});
      }
      this.isProcessing = false;
      this.activeTask = null;
      this.emit('queueUpdated', this.queue);
      // Process next item
      setTimeout(() => this.processNext(), 100);
    }
  }
}

function formatSpeed(bps) {
  if (bps > 1024 * 1024) {
    return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  if (bps > 1024) {
    return `${(bps / 1024).toFixed(1)} KB/s`;
  }
  return `${Math.round(bps)} B/s`;
}

module.exports = new QueueManager();
