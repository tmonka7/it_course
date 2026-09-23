import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, App, Button, Empty, Segmented, Select, Space, Spin, Switch, Tooltip } from 'antd';
import {
  CompressOutlined,
  ExpandOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import LivePlayer from '../components/LivePlayer';
import api, { errMsg } from '../api';
import { t } from '../i18n';

// Channel layouts as on an NVR. "8" is one large channel plus seven small ones.
const LAYOUTS = [1, 4, 8, 9, 16];
const TOUR_MS = 20000;
const STORAGE_KEY = 'sist:camera-wall';

const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};
const savePrefs = (prefs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: preferences just aren't remembered */
  }
};

function TileClock() {
  const [now, setNow] = useState(dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tile-clock">{now.format('YYYY-MM-DD HH:mm:ss')}</span>;
}

function Tile({ channel, camera, cameras, gatewayEnabled, fit, onAssign, onToggleMax, maximized }) {
  const [picking, setPicking] = useState(false);
  const statusClass = camera ? `dot-${camera.status.toLowerCase()}` : 'dot-none';
  return (
    <div className="cam-tile" onDoubleClick={onToggleMax} title={t('Double-click to enlarge')}>
      <LivePlayer camera={camera} gatewayEnabled={gatewayEnabled} fit={fit} />
      <div className="tile-top">
        <span className="tile-ch">CH{String(channel + 1).padStart(2, '0')}</span>
        {camera && (
          <span className="tile-name">
            <i className={`tile-dot ${statusClass}`} />
            {camera.name}
            <span className="tile-loc"> · {camera.location}</span>
          </span>
        )}
        {camera?.status === 'Online' && <TileClock />}
      </div>
      <div className="tile-actions" onDoubleClick={(e) => e.stopPropagation()}>
        {picking ? (
          <Select
            size="small"
            autoFocus
            defaultOpen
            showSearch
            optionFilterProp="label"
            style={{ width: 200 }}
            value={camera?._id}
            onChange={(id) => {
              onAssign(channel, id);
              setPicking(false);
            }}
            onBlur={() => setPicking(false)}
            options={[{ value: '', label: t('(empty channel)') }, ...cameras.map((c) => ({ value: c._id, label: `${c.cameraId} ${c.name}` }))]}
          />
        ) : (
          <Tooltip title={t('Change camera')}>
            <Button size="small" icon={<SwapOutlined />} onClick={() => setPicking(true)} />
          </Tooltip>
        )}
        <Tooltip title={maximized ? t('Back to grid') : t('Enlarge')}>
          <Button size="small" icon={maximized ? <CompressOutlined /> : <ExpandOutlined />} onClick={onToggleMax} />
        </Tooltip>
      </div>
    </div>
  );
}

export default function CameraView() {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const wallRef = useRef(null);
  const [cameras, setCameras] = useState(null);
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const prefs = useMemo(loadPrefs, []);
  const [layout, setLayout] = useState(LAYOUTS.includes(prefs.layout) ? prefs.layout : 4);
  const [page, setPage] = useState(0);
  const [onlineOnly, setOnlineOnly] = useState(!!prefs.onlineOnly);
  const [fit, setFit] = useState(prefs.fit || 'cover');
  const [tour, setTour] = useState(false);
  const [assign, setAssign] = useState(prefs.assign || {}); // channel index -> camera id ('' = empty)
  const [maximized, setMaximized] = useState(null); // camera id shown full size
  const [fullscreen, setFullscreen] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.get('/cameras', { params: { pageSize: 1000 } }), api.get('/live')])
      .then(([c, live]) => {
        setCameras(c.data.items);
        setGatewayEnabled(live.data.enabled);
      })
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(load, [load]);

  // /camera-view?camera=<id> opens one camera enlarged (from Camera Management).
  useEffect(() => {
    const id = searchParams.get('camera');
    if (id) setMaximized(id);
  }, [searchParams]);

  useEffect(() => {
    savePrefs({ layout, onlineOnly, fit, assign });
  }, [layout, onlineOnly, fit, assign]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wallRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const visible = useMemo(() => (cameras || []).filter((c) => !onlineOnly || c.status === 'Online'), [cameras, onlineOnly]);
  const byId = useMemo(() => Object.fromEntries((cameras || []).map((c) => [c._id, c])), [cameras]);
  const pages = Math.max(1, Math.ceil(visible.length / layout));

  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [page, pages]);

  // Tour: cycle through pages automatically.
  useEffect(() => {
    if (!tour || pages < 2 || maximized) return undefined;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), TOUR_MS);
    return () => clearInterval(id);
  }, [tour, pages, maximized]);

  const cameraFor = (channel) => {
    if (Object.prototype.hasOwnProperty.call(assign, channel)) return byId[assign[channel]] || null;
    return visible[channel] || null;
  };

  const onAssign = (channel, id) => setAssign((a) => ({ ...a, [channel]: id }));

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wallRef.current?.requestFullscreen?.();
  };

  if (!cameras) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const first = page * layout;
  const channels = Array.from({ length: layout }, (_, i) => first + i);
  const maxCamera = maximized ? byId[maximized] : null;

  return (
    <div className="camera-view">
      <div className="cam-toolbar">
        <h1 className="page-title" style={{ margin: 0 }}>
          {t('Camera View')}
        </h1>
        <Space wrap>
          <Segmented
            value={layout}
            onChange={(v) => {
              setLayout(v);
              setPage(0);
              setMaximized(null);
            }}
            options={LAYOUTS.map((n) => ({ value: n, label: t('{count} ch', { count: n }) }))}
          />
          <Space size={4}>
            <Button icon={<LeftOutlined />} disabled={pages < 2} onClick={() => setPage((p) => (p - 1 + pages) % pages)} />
            <span className="cam-page">
              {page + 1} / {pages}
            </span>
            <Button icon={<RightOutlined />} disabled={pages < 2} onClick={() => setPage((p) => (p + 1) % pages)} />
          </Space>
          <Space size={6}>
            <Switch size="small" checked={tour} onChange={setTour} disabled={pages < 2} /> {t('Tour')}
          </Space>
          <Space size={6}>
            <Switch size="small" checked={onlineOnly} onChange={setOnlineOnly} /> {t('Online only')}
          </Space>
          <Segmented size="small" value={fit} onChange={setFit} options={[{ value: 'cover', label: t('Fill') }, { value: 'contain', label: t('Fit') }]} />
          {Object.keys(assign).length > 0 && (
            <Button size="small" onClick={() => setAssign({})}>
              {t('Reset channels')}
            </Button>
          )}
          <Tooltip title={t('Reload camera list')}>
            <Button icon={<ReloadOutlined />} onClick={load} />
          </Tooltip>
          <Button type="primary" icon={<ExpandOutlined />} onClick={toggleFullscreen}>
            {t('Full screen')}
          </Button>
        </Space>
      </div>

      {!gatewayEnabled && cameras.some((c) => c.streamUrl && !c.liveUrl) && (
        <Alert
          type="info"
          showIcon
          closable
          style={{ marginBottom: 12 }}
          message={t('RTSP cameras need the media gateway to play in the browser.')}
          description={t('Start MediaMTX (docker compose up -d mediamtx) and set MEDIAMTX_API_URL and MEDIAMTX_HLS_URL in backend/.env, or give each camera a browser-playable Live URL (HLS, MJPEG or MP4).')}
        />
      )}

      {cameras.length === 0 ? (
        <Empty description={t('No cameras yet. Add them in Camera Management.')} />
      ) : (
        <div ref={wallRef} className={`cam-wall ${fullscreen ? 'is-fullscreen' : ''}`}>
          {maxCamera ? (
            <div className="cam-grid layout-1">
              <Tile
                channel={Math.max(0, visible.indexOf(maxCamera))}
                camera={maxCamera}
                cameras={cameras}
                gatewayEnabled={gatewayEnabled}
                fit={fit}
                maximized
                onAssign={(_, id) => setMaximized(id || null)}
                onToggleMax={() => setMaximized(null)}
              />
            </div>
          ) : (
            <div className={`cam-grid layout-${layout}`}>
              {channels.map((ch) => {
                const camera = cameraFor(ch);
                return (
                  <Tile
                    key={ch}
                    channel={ch}
                    camera={camera}
                    cameras={cameras}
                    gatewayEnabled={gatewayEnabled}
                    fit={fit}
                    onAssign={onAssign}
                    onToggleMax={() => camera && setMaximized(camera._id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
