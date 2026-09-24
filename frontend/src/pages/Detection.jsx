import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, App, Avatar, Button, Card, Col, Empty, List, Popconfirm, Row, Select, Slider, Space, Statistic, Switch, Tag, Tooltip, Typography } from 'antd';
import { CaretRightOutlined, ControlOutlined, DeleteOutlined, LoadingOutlined, PauseOutlined, ReloadOutlined, ScanOutlined, UserOutlined, VideoCameraOutlined } from '@ant-design/icons';
import LivePlayer from '../components/LivePlayer';
import PtzControl from '../components/PtzControl';
import { cameraError } from '../components/FaceRegistration';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import { COCO_CLASSES, analyze, className, classColor, drawDetections, frameReady, loadModels, matchFace } from '../vision';
import { t } from '../i18n';

const WEBCAM = 'webcam';
const FACE_SCORE = 0.6;

/** Live object detection (YOLO26n) and face recognition (YuNet + SFace) on a camera or this device's webcam. */
export default function Detection() {
  const { message } = App.useApp();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const [cameras, setCameras] = useState([]);
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [registry, setRegistry] = useState([]);
  const [source, setSource] = useState(searchParams.get('camera') || WEBCAM);
  const [running, setRunning] = useState(false);
  const [objectsOn, setObjectsOn] = useState(true);
  const [facesOn, setFacesOn] = useState(true);
  const [minScore, setMinScore] = useState(0.4);
  const [classFilter, setClassFilter] = useState([]); // empty = every class
  const [models, setModels] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [fps, setFps] = useState(0);
  const mediaRef = useRef(null);
  const canvasRef = useRef(null);
  const webcamRef = useRef(null);
  const streamRef = useRef(null);
  const resultRef = useRef(null);

  const loadRegistry = useCallback(
    () =>
      api
        .get('/faces')
        .then(({ data }) => setRegistry(data))
        .catch((err) => message.error(errMsg(err))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    // Cameras are optional here: without camera access the webcam still works.
    Promise.allSettled([api.get('/cameras', { params: { pageSize: 1000 } }), api.get('/live')]).then(([c, live]) => {
      if (c.status === 'fulfilled') setCameras(c.value.data.items);
      if (live.status === 'fulfilled') setGatewayEnabled(live.value.data.enabled);
    });
    loadRegistry();
  }, [loadRegistry]);

  const camera = source === WEBCAM ? null : cameras.find((c) => c._id === source);
  const fit = 'contain';

  const setMedia = useCallback((el) => {
    mediaRef.current = el;
  }, []);
  const setWebcam = useCallback((el) => {
    webcamRef.current = el;
    mediaRef.current = el;
  }, []);

  const clearOverlay = () => {
    resultRef.current = null;
    setResult(null);
    if (canvasRef.current && mediaRef.current) drawDetections(canvasRef.current, mediaRef.current, null);
  };

  // The webcam runs only while detection is on.
  useEffect(() => {
    if (source !== WEBCAM || !running) return undefined;
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!webcamRef.current) return;
        webcamRef.current.srcObject = stream;
        webcamRef.current.play().catch(() => {});
      })
      .catch((err) => {
        setError(cameraError(err));
        setRunning(false);
      });
    if (!navigator.mediaDevices) {
      setError(cameraError());
      setRunning(false);
    }
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (webcamRef.current) webcamRef.current.srcObject = null;
    };
  }, [source, running]);

  // Load the models the current options need.
  useEffect(() => {
    if (!running) return;
    const needed = [...(objectsOn ? ['yolo'] : []), ...(facesOn ? ['yunet', 'sface'] : [])];
    if (!needed.length) return;
    setModels((m) => (m === 'ready' ? m : 'loading'));
    loadModels(needed)
      .then(() => setModels('ready'))
      .catch((err) => {
        setModels('error');
        setError(t('Could not load the AI models: {error}', { error: err.message }));
        setRunning(false);
      });
  }, [running, objectsOn, facesOn]);

  const classKey = classFilter.join(',');

  // Detection loop: one frame at a time; the next starts when the previous result is back.
  useEffect(() => {
    if (!running || models !== 'ready' || (!objectsOn && !facesOn)) return undefined;
    const wanted = classKey ? new Set(classKey.split(',').map(Number)) : null;
    let stopped = false;
    let timer;
    let last = performance.now();
    const tick = async () => {
      const media = mediaRef.current;
      if (frameReady(media)) {
        try {
          const r = await analyze(media, { objects: objectsOn, faces: facesOn, embed: facesOn, minScore, faceScore: FACE_SCORE });
          if (stopped) return;
          if (wanted) r.objects = r.objects.filter((o) => wanted.has(o.classId));
          r.faces.forEach((f) => {
            f.match = matchFace(f.descriptor, registry);
          });
          const now = performance.now();
          setFps((prev) => {
            const current = 1000 / Math.max(now - last, 1);
            return prev ? prev * 0.7 + current * 0.3 : current;
          });
          last = now;
          resultRef.current = r;
          setResult(r);
          if (canvasRef.current && mediaRef.current) drawDetections(canvasRef.current, mediaRef.current, r, { fit });
        } catch (err) {
          if (stopped) return;
          if (err?.name === 'SecurityError') {
            setError(t('This stream cannot be analysed because the camera does not allow other sites to read its pictures. Play it through the media gateway instead (leave the camera\'s Live URL empty).'));
            setRunning(false);
            return;
          }
        }
      }
      if (!stopped) timer = setTimeout(tick, frameReady(media) ? 0 : 300);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running, models, objectsOn, facesOn, minScore, classKey, registry]);

  useEffect(() => {
    if (!running) {
      clearOverlay();
      setFps(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, source]);

  // Keep boxes aligned when the page is resized.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (mediaRef.current) drawDetections(canvas, mediaRef.current, resultRef.current, { fit });
    });
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  const start = () => {
    setError('');
    setRunning(true);
  };

  const removeRegistration = async (user) => {
    try {
      await api.delete(`/faces/${user._id}`);
      message.success(t('Face registration removed'));
      loadRegistry();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const counts = useMemo(() => {
    const map = new Map();
    (result?.objects || []).forEach((o) => map.set(o.classId, (map.get(o.classId) || 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [result]);
  const people = (result?.faces || []).filter((f) => f.match);
  const unknownFaces = (result?.faces || []).length - people.length;

  const sourceOptions = [
    { value: WEBCAM, label: t('This device\'s camera') },
    ...cameras.map((c) => ({ value: c._id, label: `${c.name} (${c.cameraId})`, disabled: c.status !== 'Online' })),
  ];

  return (
    <>
      <h1 className="page-title">{t('AI Detection')}</h1>
      <Card bordered={false} className="page-card" style={{ marginBottom: 16 }}>
        <div className="detect-toolbar">
          <Select
            value={source}
            onChange={(v) => {
              setRunning(false);
              setSource(v);
            }}
            options={sourceOptions}
            style={{ minWidth: 240 }}
            popupMatchSelectWidth={false}
            aria-label={t('Source')}
          />
          <Space>
            <Switch checked={objectsOn} onChange={setObjectsOn} />
            {t('Objects')}
          </Space>
          <Space>
            <Switch checked={facesOn} onChange={setFacesOn} />
            {t('Faces')}
          </Space>
          <Space style={{ minWidth: 220 }}>
            <span>{t('Confidence')}</span>
            <Slider min={0.1} max={0.9} step={0.05} value={minScore} onChange={setMinScore} style={{ width: 120 }} tooltip={{ formatter: (v) => `${Math.round(v * 100)}%` }} disabled={!objectsOn} />
          </Space>
          <Select
            mode="multiple"
            allowClear
            value={classFilter}
            onChange={setClassFilter}
            placeholder={t('All objects')}
            options={COCO_CLASSES.map((_, i) => ({ value: i, label: className(i) }))}
            optionFilterProp="label"
            maxTagCount="responsive"
            style={{ minWidth: 200, flex: 1 }}
            disabled={!objectsOn}
          />
          {running ? (
            <Button icon={<PauseOutlined />} onClick={() => setRunning(false)}>
              {t('Stop')}
            </Button>
          ) : (
            <Button type="primary" icon={<CaretRightOutlined />} onClick={start} disabled={!objectsOn && !facesOn}>
              {t('Start detection')}
            </Button>
          )}
        </div>
      </Card>

      {error && <Alert type="error" showIcon closable onClose={() => setError('')} message={error} style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={17}>
          <div className="detect-stage">
            {source === WEBCAM ? (
              <>
                <video ref={setWebcam} muted playsInline autoPlay style={{ objectFit: fit }} />
                {!running && (
                  <div className="player-placeholder">
                    <VideoCameraOutlined />
                    <span>{t('Click Start detection to turn on the camera')}</span>
                  </div>
                )}
              </>
            ) : (
              <LivePlayer camera={camera} gatewayEnabled={gatewayEnabled} fit={fit} onMedia={setMedia} />
            )}
            <canvas ref={canvasRef} className="detect-overlay" />
            {running && models === 'loading' && (
              <div className="detect-status">
                <LoadingOutlined /> {t('Loading AI models...')}
              </div>
            )}
          </div>
        </Col>
        <Col xs={24} xl={7}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {camera && (
              <Card
                bordered={false}
                className="page-card"
                size="small"
                title={
                  <Space>
                    <ControlOutlined />
                    {t('PTZ Control')}
                  </Space>
                }
              >
                <PtzControl camera={camera} />
              </Card>
            )}

            <Card bordered={false} className="page-card" size="small">
              <Row gutter={8}>
                <Col span={12}>
                  <Statistic title={t('Speed')} value={running && fps ? fps.toFixed(1) : '-'} suffix={running && fps ? 'fps' : ''} />
                </Col>
                <Col span={12}>
                  <Statistic title={t('Inference')} value={running && result ? result.ms : '-'} suffix={running && result ? 'ms' : ''} />
                </Col>
              </Row>
            </Card>

            {objectsOn && (
              <Card bordered={false} className="page-card" size="small" title={t('Objects')}>
                {counts.length ? (
                  <Space size={[6, 6]} wrap>
                    {counts.map(([id, n]) => (
                      <Tag key={id} color={classColor(id)} bordered={false}>
                        {className(id)} × {n}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Typography.Text type="secondary">{t(running ? 'Nothing detected' : 'Not running')}</Typography.Text>
                )}
              </Card>
            )}

            {facesOn && (
              <Card bordered={false} className="page-card" size="small" title={t('Recognised People')}>
                {people.length ? (
                  <List
                    size="small"
                    dataSource={people}
                    renderItem={(f) => (
                      <List.Item key={f.match.user._id} extra={<Tag color="green">{Math.round(f.match.similarity * 100)}%</Tag>}>
                        <List.Item.Meta avatar={<Avatar src={f.match.user.avatar || undefined} icon={<UserOutlined />} />} title={f.match.user.name} description={f.match.user.username} />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Typography.Text type="secondary">{t(running ? 'No registered person recognised' : 'Not running')}</Typography.Text>
                )}
                {unknownFaces > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Tag color="orange">{t('Unknown faces: {count}', { count: unknownFaces })}</Tag>
                  </div>
                )}
              </Card>
            )}

            <Card
              bordered={false}
              className="page-card"
              size="small"
              title={
                <Space>
                  <ScanOutlined />
                  {t('Registered Faces')}
                </Space>
              }
              extra={
                <Tooltip title={t('Refresh')}>
                  <Button type="text" size="small" icon={<ReloadOutlined />} onClick={loadRegistry} />
                </Tooltip>
              }
            >
              {registry.length ? (
                <List
                  size="small"
                  dataSource={registry}
                  renderItem={(u) => (
                    <List.Item
                      key={u._id}
                      actions={
                        isAdmin
                          ? [
                              <Popconfirm key="del" title={t('Remove this person\'s face registration?')} onConfirm={() => removeRegistration(u)} okText={t('Delete')} cancelText={t('Cancel')}>
                                <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={t('Delete')} />
                              </Popconfirm>,
                            ]
                          : undefined
                      }
                    >
                      <List.Item.Meta
                        avatar={<Avatar size="small" src={u.avatar || undefined} icon={<UserOutlined />} />}
                        title={u.name}
                        description={t('{count} samples', { count: u.descriptors.length })}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No faces registered yet')} />
              )}
              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
                {t('Each person registers their own face on the My Profile page.')} <Link to="/profile">{t('Open')}</Link>
              </Typography.Paragraph>
            </Card>
          </Space>
        </Col>
      </Row>
    </>
  );
}
