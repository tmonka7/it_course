import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LoadingOutlined, VideoCameraOutlined, DisconnectOutlined, ToolOutlined } from '@ant-design/icons';
import { TOKEN_KEY } from '../api';
import { t } from '../i18n';

const RETRY_MS = 10000;

/** Browser-playable URL for a camera: its own live URL, else the media gateway's HLS stream. */
export function liveSource(camera, gatewayEnabled) {
  if (!camera) return null;
  if (camera.liveUrl) return camera.liveUrl;
  if (gatewayEnabled && camera.streamUrl) return `/api/live/${encodeURIComponent(camera.cameraId)}/index.m3u8`;
  return null;
}

const kindOf = (src) => {
  if (/\.m3u8(\?|$)/i.test(src)) return 'hls';
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(src)) return 'video';
  return 'image'; // MJPEG stream or periodically refreshed snapshot
};

function Placeholder({ icon, text }) {
  return (
    <div className="player-placeholder">
      {icon}
      <span>{text}</span>
    </div>
  );
}

/** `onMedia(element)` receives the <video>/<img> showing the stream (null when it goes away), e.g. for AI detection. */
function LivePlayer({ camera, gatewayEnabled, fit = 'cover', onMedia }) {
  const videoRef = useRef(null);
  const onMediaRef = useRef(onMedia);
  onMediaRef.current = onMedia;
  const setVideo = useCallback((el) => {
    videoRef.current = el;
    onMediaRef.current?.(el);
  }, []);
  const setImage = useCallback((el) => onMediaRef.current?.(el), []);
  const [state, setState] = useState('loading'); // loading | playing | error
  const [attempt, setAttempt] = useState(0);
  const src = liveSource(camera, gatewayEnabled);
  const kind = src ? kindOf(src) : null;
  const offline = camera?.status === 'Offline' || camera?.status === 'Maintenance';

  // Retry a failed stream after a pause (cameras reboot, gateways restart).
  useEffect(() => {
    if (state !== 'error') return undefined;
    const timer = setTimeout(() => {
      setState('loading');
      setAttempt((a) => a + 1);
    }, RETRY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    setState('loading');
  }, [src]);

  useEffect(() => {
    if (!src || offline || kind === 'image') return undefined;
    const video = videoRef.current;
    if (!video) return undefined;
    let hls;
    let cancelled = false;
    const onPlaying = () => setState('playing');
    const onError = () => setState('error');
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onError);

    if (kind === 'video') {
      video.src = src;
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && !src.startsWith('/api/')) {
      video.src = src; // Safari plays HLS natively (only for URLs that need no auth header)
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setState('error');
          return;
        }
        hls = new Hls({
          liveSyncDurationCount: 2,
          maxBufferLength: 10,
          // Streams proxied by our API need the login token.
          xhrSetup: (xhr, url) => {
            if (new URL(url, window.location.href).pathname.startsWith('/api/')) {
              xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem(TOKEN_KEY)}`);
            }
          },
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) setState('error');
        });
        hls.loadSource(src);
        hls.attachMedia(video);
      });
    }
    video.play?.().catch(() => {});

    return () => {
      cancelled = true;
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onError);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, kind, offline, attempt]);

  if (!camera) return <Placeholder icon={<VideoCameraOutlined />} text={t('No camera')} />;
  if (camera.status === 'Maintenance') return <Placeholder icon={<ToolOutlined />} text={t('Under maintenance')} />;
  if (camera.status === 'Offline') return <Placeholder icon={<DisconnectOutlined />} text={t('Offline')} />;
  if (!src) return <Placeholder icon={<VideoCameraOutlined />} text={camera.streamUrl ? t('Media gateway not configured') : t('No stream configured')} />;

  return (
    <div className="player">
      {kind === 'image' ? (
        <img
          key={attempt}
          ref={setImage}
          src={src}
          alt={camera.name}
          style={{ objectFit: fit }}
          onLoad={() => setState('playing')}
          onError={() => setState('error')}
        />
      ) : (
        <video ref={setVideo} muted autoPlay playsInline style={{ objectFit: fit }} />
      )}
      {state === 'loading' && <Placeholder icon={<LoadingOutlined />} text={t('Connecting...')} />}
      {state === 'error' && <Placeholder icon={<DisconnectOutlined />} text={t('No signal - retrying')} />}
    </div>
  );
}

export default memo(LivePlayer);
