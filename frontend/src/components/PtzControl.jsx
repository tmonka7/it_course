import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Empty, Input, Popconfirm, Slider, Space, Tag, Tooltip, Typography } from 'antd';
import {
  AimOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CaretRightOutlined,
  DeleteOutlined,
  HomeOutlined,
  MinusOutlined,
  PauseOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  StopOutlined,
} from '@ant-design/icons';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n';

// While a direction is held the camera is told to move for HOLD_TIMEOUT_S and the command is repeated
// every REPEAT_MS. If the release never reaches the server the camera stops on its own.
const HOLD_TIMEOUT_S = 2;
const REPEAT_MS = 1200;
const NUDGE = 0.06; // how far a single click moves, as a fraction of the full range

// [label, icon, pan, tilt] for the eight directions around the centre of the pad.
const DIRECTIONS = [
  ['Up left', null, -1, 1],
  ['Up', <ArrowUpOutlined key="u" />, 0, 1],
  ['Up right', null, 1, 1],
  ['Left', <ArrowLeftOutlined key="l" />, -1, 0],
  [null, null, 0, 0], // centre: Stop
  ['Right', <ArrowRightOutlined key="r" />, 1, 0],
  ['Down left', null, -1, -1],
  ['Down', <ArrowDownOutlined key="d" />, 0, -1],
  ['Down right', null, 1, -1],
];

const diagonal = (pan, tilt) => {
  if (pan < 0 && tilt > 0) return '↖';
  if (pan > 0 && tilt > 0) return '↗';
  if (pan < 0 && tilt < 0) return '↙';
  return '↘';
};

const KEYS = {
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const SNAPSHOT_MS = 1000; // how often a new still is fetched while the preview is on

/**
 * Live-ish picture for the pad, built from ONVIF JPEG stills fetched through our own API.
 *
 * This is what makes PTZ usable without a media gateway: no MediaMTX, no transcoding, no Docker and
 * no internet - just the camera on the local network. Each frame is fetched with the app's auth
 * header (so it cannot be a plain <img src>), turned into an object URL, and the previous one is
 * revoked to avoid leaking blobs.
 *
 * Polling is sequential rather than on a timer, so a slow camera cannot pile up overlapping requests.
 */
function SnapshotPreview({ cameraId, paused, onUnsupported }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState('');
  const urlRef = useRef(null);

  useEffect(() => {
    if (!cameraId || paused) return undefined;
    let stopped = false;
    let timer;

    const revoke = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };

    const tick = async () => {
      try {
        const { data } = await api.get(`/cameras/${cameraId}/snapshot`, { responseType: 'blob' });
        if (stopped) return;
        const next = URL.createObjectURL(data);
        revoke();
        urlRef.current = next;
        setSrc(next);
        setError('');
      } catch (err) {
        if (stopped) return;
        const message = errMsg(err);
        setError(message);
        // A camera with no snapshot service will never start working; stop asking.
        if (err?.response?.status === 400 || /did not report a snapshot/i.test(message)) {
          onUnsupported?.(message);
          return;
        }
      }
      if (!stopped) timer = setTimeout(tick, SNAPSHOT_MS);
    };
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
      revoke();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, paused]);

  return (
    <div className="ptz-preview">
      {src ? <img src={src} alt={t('Camera snapshot')} /> : <div className="ptz-preview-empty">{error || t('Waiting for a picture...')}</div>}
      {src && error && <div className="ptz-preview-stale">{t('Picture is not updating')}</div>}
      {paused && <div className="ptz-preview-stale">{t('Preview paused')}</div>}
    </div>
  );
}

/**
 * Pan / tilt / zoom control for one camera.
 *
 * Press and hold a direction to move continuously (the command repeats while held and a Stop is sent
 * on release); click it for a single nudge. Presets are the ones stored on the camera itself.
 *
 * Renders nothing but a short note when the camera cannot be steered, so it is safe to drop in
 * wherever a camera happens to be selected.
 */
export default function PtzControl({ camera, compact = false }) {
  const { message } = App.useApp();
  const { can } = useAuth();
  const [state, setState] = useState({ checking: true });
  const [presets, setPresets] = useState([]);
  const [position, setPosition] = useState(null);
  const [speed, setSpeed] = useState(0.5);
  const [busy, setBusy] = useState('');
  const [presetName, setPresetName] = useState('');
  // The preview is the only picture available without a media gateway, so it is on by default.
  const [previewOn, setPreviewOn] = useState(true);
  const [previewUnsupported, setPreviewUnsupported] = useState('');
  const [active, setActive] = useState(null); // direction being held, for the pressed style
  const repeatRef = useRef(null);
  const holdingRef = useRef(false);
  const padRef = useRef(null);
  const cameraId = camera?._id;
  const canEditCameras = can('cameras', 'edit');

  const loadPresets = useCallback((id) => {
    api
      .get(`/cameras/${id}/ptz/presets`)
      .then(({ data }) => setPresets(data.presets || []))
      .catch(() => setPresets([]));
  }, []);

  const refreshPosition = useCallback((id) => {
    api
      .get(`/cameras/${id}/ptz`)
      .then(({ data }) => {
        setState(data);
        setPosition(data.position || null);
      })
      .catch((err) => setState({ supported: false, message: errMsg(err) }));
  }, []);

  useEffect(() => {
    if (!cameraId) {
      setState({ supported: false });
      return;
    }
    setState({ checking: true });
    setPresets([]);
    setPosition(null);
    setPreviewUnsupported('');
    api
      .get(`/cameras/${cameraId}/ptz`)
      .then(({ data }) => {
        setState(data);
        setPosition(data.position || null);
        if (data.supported) loadPresets(cameraId);
      })
      .catch((err) => setState({ supported: false, message: errMsg(err) }));
  }, [cameraId, loadPresets]);

  /** Always runs on release, and on unmount, so a held button can never leave the camera moving. */
  const endMove = useCallback(() => {
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
    setActive(null);
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (cameraId) {
      api.post(`/cameras/${cameraId}/ptz/stop`).catch(() => {});
      // Give the camera a moment to come to rest before asking where it ended up.
      setTimeout(() => cameraId && refreshPosition(cameraId), 700);
    }
  }, [cameraId, refreshPosition]);

  // Stop if the component goes away, or the window loses focus mid-hold.
  useEffect(() => {
    const onBlur = () => endMove();
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      endMove();
    };
  }, [endMove]);

  const startMove = useCallback(
    (key, pan, tilt, zoom = 0) => {
      if (!cameraId || !state.supported) return;
      holdingRef.current = true;
      setActive(key);
      const send = () =>
        api
          .post(`/cameras/${cameraId}/ptz/continuous`, {
            pan: pan * speed,
            tilt: tilt * speed,
            zoom: zoom * speed,
            timeoutSec: HOLD_TIMEOUT_S,
          })
          .catch((err) => {
            endMove();
            message.error(errMsg(err));
          });
      send();
      repeatRef.current = setInterval(() => {
        if (holdingRef.current) send();
      }, REPEAT_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cameraId, state.supported, speed, endMove]
  );

  /** A plain click nudges by a fixed step instead of holding. */
  const nudge = async (pan, tilt, zoom = 0) => {
    if (!cameraId) return;
    try {
      const { data } = await api.post(`/cameras/${cameraId}/ptz/relative`, {
        pan: pan * NUDGE,
        tilt: tilt * NUDGE,
        zoom: zoom * NUDGE,
        speed,
      });
      if (data.position) setPosition(data.position);
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  /**
   * A press that is released quickly counts as a click (nudge); a longer press moves continuously.
   * The window listeners catch a release outside the button, which is what leaves cameras stuck.
   */
  const press = (key, pan, tilt, zoom = 0) => (event) => {
    event.preventDefault();
    let held = false;
    const timer = setTimeout(() => {
      held = true;
      startMove(key, pan, tilt, zoom);
    }, 220);

    const release = () => {
      clearTimeout(timer);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      if (held) endMove();
      else nudge(pan, tilt, zoom);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };

  // Arrow keys steer while the pad has focus.
  useEffect(() => {
    const pad = padRef.current;
    if (!pad || !state.supported) return undefined;
    const down = (e) => {
      const dir = KEYS[e.key];
      if (!dir || e.repeat || holdingRef.current) return;
      e.preventDefault();
      startMove(e.key, dir[0], dir[1]);
    };
    const up = (e) => {
      if (KEYS[e.key]) endMove();
    };
    pad.addEventListener('keydown', down);
    pad.addEventListener('keyup', up);
    return () => {
      pad.removeEventListener('keydown', down);
      pad.removeEventListener('keyup', up);
    };
  }, [state.supported, startMove, endMove]);

  const act = async (label, request) => {
    setBusy(label);
    try {
      await request();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy('');
      if (cameraId) setTimeout(() => refreshPosition(cameraId), 700);
    }
  };

  const savePreset = () =>
    act('save', async () => {
      const { data } = await api.post(`/cameras/${cameraId}/ptz/presets`, { name: presetName.trim() });
      setPresets(data.presets || []);
      setPresetName('');
      message.success(t('Preset saved'));
    });

  const removePreset = (token) =>
    act('delete', async () => {
      const { data } = await api.delete(`/cameras/${cameraId}/ptz/presets/${encodeURIComponent(token)}`);
      setPresets(data.presets || []);
    });

  if (!cameraId) return null;

  if (state.checking) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        <ReloadOutlined spin /> {t('Checking PTZ control...')}
      </Typography.Text>
    );
  }

  if (!state.supported) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t('This camera cannot be steered')}
        {state.message ? ` — ${state.message}` : ''}
      </Typography.Text>
    );
  }

  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : '-');

  return (
    <div className={`ptz-panel ${compact ? 'is-compact' : ''}`}>
      {previewUnsupported ? (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          {t('This camera provides no snapshot, so there is no picture here.')}
        </Typography.Text>
      ) : (
        <>
          <SnapshotPreview cameraId={cameraId} paused={!previewOn} onUnsupported={setPreviewUnsupported} />
          <div className="ptz-preview-bar">
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t('Still images straight from the camera, about one a second - no media gateway needed.')}
            </Typography.Text>
            <Tooltip title={previewOn ? t('Pause preview') : t('Resume preview')}>
              <Button type="text" size="small" icon={previewOn ? <PauseOutlined /> : <CaretRightOutlined />} onClick={() => setPreviewOn((v) => !v)} />
            </Tooltip>
          </div>
        </>
      )}

      <div className="ptz-pad-row">
        {/* tabIndex makes the pad focusable, which is what enables arrow-key steering. */}
        <div className="ptz-pad" ref={padRef} tabIndex={0} role="group" aria-label={t('Pan and tilt')}>
          {DIRECTIONS.map(([label, icon, pan, tilt], i) => {
            if (!label) {
              return (
                <Tooltip key="stop" title={t('Stop')}>
                  <button type="button" className="ptz-key ptz-stop" onClick={() => act('stop', () => api.post(`/cameras/${cameraId}/ptz/stop`))} aria-label={t('Stop')}>
                    <StopOutlined />
                  </button>
                </Tooltip>
              );
            }
            const key = `${pan},${tilt}`;
            return (
              <Tooltip key={key} title={t(label)}>
                <button
                  type="button"
                  className={`ptz-key ${active === key ? 'is-active' : ''}`}
                  onPointerDown={press(key, pan, tilt)}
                  aria-label={t(label)}
                >
                  {icon || <span className="ptz-diag">{diagonal(pan, tilt)}</span>}
                </button>
              </Tooltip>
            );
          })}
        </div>

        <div className="ptz-side">
          <Tooltip title={t('Zoom in')}>
            <button type="button" className={`ptz-key ${active === 'zoom+' ? 'is-active' : ''}`} onPointerDown={press('zoom+', 0, 0, 1)} aria-label={t('Zoom in')}>
              <PlusOutlined />
            </button>
          </Tooltip>
          <Tooltip title={t('Zoom out')}>
            <button type="button" className={`ptz-key ${active === 'zoom-' ? 'is-active' : ''}`} onPointerDown={press('zoom-', 0, 0, -1)} aria-label={t('Zoom out')}>
              <MinusOutlined />
            </button>
          </Tooltip>
          <Tooltip title={t('Home position')}>
            <button type="button" className="ptz-key" onClick={() => act('home', () => api.post(`/cameras/${cameraId}/ptz/home`, { speed }))} aria-label={t('Home position')}>
              <HomeOutlined />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="ptz-speed">
        <span>{t('Speed')}</span>
        <Slider min={0.1} max={1} step={0.1} value={speed} onChange={setSpeed} tooltip={{ formatter: (v) => `${Math.round(v * 100)}%` }} />
      </div>

      <Space size={4} wrap style={{ marginBottom: 8 }}>
        <Tag bordered={false} icon={<AimOutlined />}>
          {t('Pan')} {fmt(position?.pan)}
        </Tag>
        <Tag bordered={false}>
          {t('Tilt')} {fmt(position?.tilt)}
        </Tag>
        <Tag bordered={false}>
          {t('Zoom')} {fmt(position?.zoom)}
        </Tag>
        <Tooltip title={t('Read the current position')}>
          <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => refreshPosition(cameraId)} />
        </Tooltip>
      </Space>

      {!compact && (
        <>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
            {t('Click to nudge, press and hold to keep moving. With the pad focused, the arrow keys work too.')}
          </Typography.Text>

          <div className="ptz-presets">
            <Typography.Text strong style={{ fontSize: 13 }}>
              {t('Presets')}
            </Typography.Text>
            {presets.length ? (
              <Space size={[6, 6]} wrap style={{ marginTop: 6 }}>
                {presets.map((p) => (
                  <span key={p.token} className="ptz-preset">
                    <Button size="small" loading={busy === `goto:${p.token}`} onClick={() => act(`goto:${p.token}`, () => api.post(`/cameras/${cameraId}/ptz/presets/${encodeURIComponent(p.token)}/goto`, { speed }))}>
                      {p.name}
                    </Button>
                    {canEditCameras && (
                      <Popconfirm title={t('Delete this preset?')} onConfirm={() => removePreset(p.token)} okText={t('Delete')} cancelText={t('Cancel')}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('Delete')} />
                      </Popconfirm>
                    )}
                  </span>
                ))}
              </Space>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No presets stored on this camera')} style={{ margin: '4px 0' }} />
            )}

            {canEditCameras && (
              <Space.Compact style={{ marginTop: 8, width: '100%' }}>
                <Input
                  size="small"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onPressEnter={() => presetName.trim() && savePreset()}
                  placeholder={t('Name this position')}
                  maxLength={64}
                />
                <Button size="small" icon={<SaveOutlined />} loading={busy === 'save'} disabled={!presetName.trim()} onClick={savePreset}>
                  {t('Save preset')}
                </Button>
              </Space.Compact>
            )}
          </div>
        </>
      )}
    </div>
  );
}
