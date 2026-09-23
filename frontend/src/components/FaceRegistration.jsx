import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Empty, Image, Popconfirm, Space, Tag, Typography } from 'antd';
import { CameraOutlined, DeleteOutlined, LoadingOutlined, ScanOutlined, StopOutlined } from '@ant-design/icons';
import api, { errMsg } from '../api';
import { analyze, drawDetections, faceThumbnail, frameReady, loadModels } from '../vision';
import { t } from '../i18n';

const MAX_SAMPLES = 5; // same limit as the server (routes/profile.js)
const FACE_SCORE = 0.7;
const MIN_CAPTURE_SCORE = 0.8;
const MIN_FACE_PX = 90; // smaller faces give unreliable signatures

export function cameraError(err) {
  if (!navigator.mediaDevices?.getUserMedia) return t('Camera access needs HTTPS or localhost');
  if (err?.name === 'NotAllowedError') return t('Camera permission was denied');
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return t('No camera found');
  return t('Could not start the camera');
}

// What the live preview says about the current frame, and whether a sample can be taken.
function assess(result) {
  const faces = result?.faces || [];
  if (!result) return { ok: false, hint: t('Looking for a face...') };
  if (faces.length === 0) return { ok: false, hint: t('No face detected') };
  if (faces.length > 1) return { ok: false, hint: t('Only one person should be in view') };
  const [x1, , x2] = faces[0].box;
  if (x2 - x1 < MIN_FACE_PX) return { ok: false, hint: t('Move closer to the camera') };
  if (faces[0].score < MIN_CAPTURE_SCORE) return { ok: false, hint: t('Face the camera in good light') };
  return { ok: true, hint: t('Ready: hold still and click Capture') };
}

/** Face samples for the signed-in user: webcam preview with live face check, capture, list and delete. */
export default function FaceRegistration() {
  const { message } = App.useApp();
  const [samples, setSamples] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    api
      .get('/profile/faces')
      .then(({ data }) => setSamples(data))
      .catch((err) => message.error(errMsg(err)))
      .finally(() => setListLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
    setLive(null);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      setError(cameraError(err));
      return;
    }
    try {
      await loadModels(['yunet', 'sface']);
      setModelsReady(true);
    } catch (err) {
      setError(t('Could not load the AI models: {error}', { error: err.message }));
    }
  };

  // Attach the stream once the <video> exists.
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  // Live preview: find faces (no signature) a few times a second and outline them.
  useEffect(() => {
    if (!cameraOn || !modelsReady) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      const video = videoRef.current;
      if (frameReady(video) && !capturing) {
        try {
          const result = await analyze(video, { objects: false, faces: true, embed: false, faceScore: FACE_SCORE });
          if (stopped) return;
          setLive(result);
          if (canvasRef.current) drawDetections(canvasRef.current, video, result, { mirror: true, showLabels: false });
        } catch {
          /* a skipped frame is fine */
        }
      }
      if (!stopped) timer = setTimeout(tick, 150);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [cameraOn, modelsReady, capturing]);

  const state = assess(live);
  const full = samples.length >= MAX_SAMPLES;

  const capture = async () => {
    const video = videoRef.current;
    setCapturing(true);
    try {
      const result = await analyze(video, { objects: false, faces: true, embed: true, faceScore: FACE_SCORE });
      const check = assess(result);
      if (!check.ok) {
        message.warning(check.hint);
        return;
      }
      const face = result.faces[0];
      const { data } = await api.post('/profile/faces', { descriptor: face.descriptor, image: faceThumbnail(video, face.box) });
      setSamples(data);
      message.success(t('Face sample saved'));
      if (data.length >= MAX_SAMPLES) stopCamera();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setCapturing(false);
    }
  };

  const remove = async (id) => {
    try {
      const { data } = await api.delete(`/profile/faces/${id}`);
      setSamples(data);
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const removeAll = async () => {
    try {
      await api.delete('/profile/faces');
      setSamples([]);
      message.success(t('Face registration removed'));
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  return (
    <Card
      bordered={false}
      className="page-card"
      title={
        <Space>
          <ScanOutlined />
          {t('Face Registration')}
        </Space>
      }
      extra={<Tag color={samples.length ? 'green' : 'default'}>{t('{count} / {total} samples', { count: samples.length, total: MAX_SAMPLES })}</Tag>}
    >
      <Typography.Paragraph type="secondary">
        {t('Register your face so AI Detection can recognise you on cameras. Capture 3 to 5 samples: look straight at the camera, then turn your head slightly to each side. Each sample is stored as a face signature with a small thumbnail, and you can delete it at any time.')}
      </Typography.Paragraph>

      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      {cameraOn && (
        <div className="face-cam">
          <video ref={videoRef} muted playsInline autoPlay />
          <canvas ref={canvasRef} />
          <div className={`face-cam-hint ${state.ok ? 'ok' : ''}`}>
            {modelsReady ? (
              state.hint
            ) : (
              <>
                <LoadingOutlined /> {t('Loading AI models...')}
              </>
            )}
          </div>
        </div>
      )}

      <Space wrap style={{ marginBottom: 16 }}>
        {cameraOn ? (
          <>
            <Button type="primary" icon={<CameraOutlined />} onClick={capture} loading={capturing} disabled={!modelsReady || !state.ok || full}>
              {t('Capture')}
            </Button>
            <Button icon={<StopOutlined />} onClick={stopCamera}>
              {t('Stop camera')}
            </Button>
          </>
        ) : (
          <Button type="primary" icon={<CameraOutlined />} onClick={startCamera} disabled={full}>
            {t(samples.length ? 'Add samples' : 'Start camera')}
          </Button>
        )}
        {samples.length > 0 && (
          <Popconfirm title={t('Delete all face samples?')} onConfirm={removeAll} okText={t('Delete')} cancelText={t('Cancel')}>
            <Button danger icon={<DeleteOutlined />}>
              {t('Delete all')}
            </Button>
          </Popconfirm>
        )}
      </Space>

      {samples.length ? (
        <div className="face-samples">
          {samples.map((s) => (
            <div key={s._id} className="face-sample">
              <Image src={s.image} width={88} height={88} alt="" preview={false} />
              <Popconfirm title={t('Delete this sample?')} onConfirm={() => remove(s._id)} okText={t('Delete')} cancelText={t('Cancel')}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('Delete')} />
              </Popconfirm>
            </div>
          ))}
        </div>
      ) : (
        !listLoading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No face registered yet')} />
      )}
    </Card>
  );
}
