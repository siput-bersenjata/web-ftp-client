import React from 'react';
import { ArrowRight, ArrowLeft, UploadCloud, DownloadCloud } from 'lucide-react';

export default function TransferBar({
  onUpload,
  onDownload,
  canUpload,
  canDownload,
  uploadCount = 0,
  downloadCount = 0
}) {
  return (
    <div className="transfer-bar">
      <button
        className="transfer-action-btn"
        title={canUpload ? `Upload ${uploadCount} file ke remote FTP` : 'Pilih file PC untuk di-upload'}
        disabled={!canUpload}
        onClick={onUpload}
      >
        <ArrowRight size={17} />
        {uploadCount > 0 && <span className="transfer-badge">{uploadCount}</span>}
      </button>

      <button
        className="transfer-action-btn"
        title={canDownload ? `Download ${downloadCount} file ke PC lokal` : 'Pilih file FTP untuk di-download'}
        disabled={!canDownload}
        onClick={onDownload}
      >
        <ArrowLeft size={17} />
        {downloadCount > 0 && <span className="transfer-badge">{downloadCount}</span>}
      </button>
    </div>
  );
}
