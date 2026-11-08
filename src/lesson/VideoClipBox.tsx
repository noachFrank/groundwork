import { useState } from 'react';
import { NeedsInternet } from '../online.tsx';
import type { VideoClip } from '../../shared/types.ts';

/**
 * Videos are embedded, never downloaded. The player loads only after a click, so a
 * slow connection isn't spent on a video nobody asked for. The referrer policy keeps
 * YouTube's "Error 153" away when playing from a localhost address.
 */
export function VideoClipBox({ clip }: { clip: VideoClip }) {
  const [play, setPlay] = useState(false);
  const params = new URLSearchParams({ rel: '0', autoplay: '1' });
  if (clip.start) params.set('start', String(clip.start));
  if (clip.end) params.set('end', String(clip.end));
  return (
    <div className="video">
      <p className="video-title">
        <strong>{clip.title}</strong> <span className="muted">by {clip.channel}</span>
      </p>
      {clip.note && <p className="muted small">{clip.note}</p>}
      <NeedsInternet what="watch this video">
        {play ? (
          <iframe
            title={clip.title}
            src={`https://www.youtube-nocookie.com/embed/${clip.id}?${params}`}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button className="btn ghost" onClick={() => setPlay(true)}>▶ Play video</button>
        )}
      </NeedsInternet>
    </div>
  );
}
