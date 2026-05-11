import ReactMarkdown from 'react-markdown';
import { Video } from '../types';
import { X, ExternalLink, Check, Archive, User, Calendar } from 'lucide-react';

interface Props {
  video: Video;
  content: string;
  onClose: () => void;
  onUpdateStatus: (id: string, status: string) => void;
}

export function NoteViewer({ video, content, onClose, onUpdateStatus }: Props) {
  return (
    <div className="mac-detail-pane flex h-full flex-col overflow-hidden">
      <header className="mac-toolbar shrink-0">
        <div className="mac-toolbar-leading">
          <button 
            onClick={onClose}
            className="mac-toolbar-button"
            type="button"
          >
            <X size={14} />
          </button>
          <div className="mac-toolbar-title-group">
            <h1>{video.title}</h1>
            <span>{video.uploader}</span>
          </div>
        </div>
        
        <div className="mac-toolbar-trailing">
          <button 
            onClick={() => onUpdateStatus(video.id, 'reviewed')}
            className="mac-toolbar-button"
            type="button"
          >
            <Check size={12} /> <span>已复核</span>
          </button>
          <button 
            onClick={() => onUpdateStatus(video.id, 'archived')}
            className="mac-toolbar-button"
            type="button"
          >
            <Archive size={12} /> <span>归档</span>
          </button>
          <a 
            href={video.url} 
            target="_blank" 
            rel="noreferrer"
            className="mac-toolbar-button"
          >
            <ExternalLink size={12} /> <span>观看</span>
          </a>
        </div>
      </header>
      
      <div className="mac-note-reader custom-scrollbar">
        <article>
          <header>
            <h1>{video.title}</h1>
            <div className="mac-row-meta mb-6">
              <div className="flex items-center gap-1.5"><User size={12} /> {video.uploader}</div>
              <div className="flex items-center gap-1.5"><Calendar size={12} /> {video.pubdate}</div>
              <div className="mac-tag-pill">{video.category}</div>
            </div>
          </header>
          
          <div className="mac-markdown">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </article>
      </div>
    </div>
  );
}
