import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Empty, Image, Popconfirm, Space, Tag, Typography } from 'antd';
import { CameraOutlined, DeleteOutlined, LoadingOutlined, PictureOutlined, StopOutlined } from '@ant-design/icons';
import api, { errMsg } from '../api';
import { analyze, drawDetections, faceThumbnail, frameReady, loadModels } from '../vision';
import { cameraError } from './FaceRegistration';
import { t } from '../i18n';

const MAX_SAMPLES = 5; // same limit as the server (utils/faces.js)
const FACE_SCORE = 0.7;
const MIN_CAPTURE_SCORE = 0.8;
const MIN_FACE_PX = 90;

/**
 * Computes a face signature from an image data URL (a student's ID photo).
 * Returns { descriptor, image } or throws a reason the photo cannot be used.
 */
export async function descriptorFromPhoto(photo) {
  const img = new window.Image();
  img.src = photo;
  await img.decode();
  const result = await analyze(img, { objects: false, faces: true, embed: true, faceScore: 0.5 });
  const faces = result.faces || [];
  if (!faces.length) throw new Error(t('No face found in the photo'));
  if (faces.length > 1) throw new Error(t('The photo shows more than one face'));
  return { descriptor: faces[0].descriptor, image: faceThumbnail(img, faces[0].box) };
}

/** What the live preview says about the current frame, and whether a sample can be taken. */
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

/**
 * Face samples for one student, registered on their behalf: derived from the ID photo already on the
 * record, or captured live. Staff register their own face on My Profile instead (see FaceRegistration).
 */
export default function StudentFaces({ student, onChange }) {
  const { message } = App.useApp();
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [live, setLive] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const publish = useCallback(
    (list) => {
      setSamples(list);
      onChange?.(list);
    },
    [onChange]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get(`/students/${student._id}/faces`)
      .then(({ data }) => {
        if (!cancelled) setSamples(data);
      })
      .catch((err) => !cancelled && message.error(errMsg(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student._id]);

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
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

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn]);

  // Live preview: outline faces a few times a second so the operator can frame the student.
  useEffect(() => {
    if (!cameraOn || !modelsReady) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      const video = videoRef.current;
      if (frameReady(video) && !busy) {
        try {
          const result = await analyze(video, { objects: false, faces: true, embed: false, faceScore: FACE_SCORE });
          if (stopped) return;
          setLive(result);
          if (canvasRef.current) drawDetections(canvasRef.current, video, result, { showLabels: false });
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
  }, [cameraOn, modelsReady, busy]);

  const state = assess(live);
  const full = samples.length >= MAX_SAMPLES;

  const save = async (payload, successText) => {
    const { data } = await api.post(`/students/${student._id}/faces`, payload);
    publish(data);
    message.success(successText);
    return data;
  };

  const capture = async () => {
    setBusy('capture');
    try {
      const result = await analyze(videoRef.current, { objects: false, faces: true, embed: true, faceScore: FACE_SCORE });
      const check = assess(result);
      if (!check.ok) {
        message.warning(check.hint);
        return;
      }
      const face = result.faces[0];
      const data = await save(
        { descriptor: face.descriptor, image: faceThumbnail(videoRef.current, face.box), source: 'Camera' },
        t('Face sample saved')
      );
      if (data.length >= MAX_SAMPLES) stopCamera();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy('');
    }
  };

  const enrolFromPhoto = async () => {
    setBusy('photo');
    setError('');
    try {
      await loadModels(['yunet', 'sface']);
      const { descriptor, image } = await descriptorFromPhoto(student.photo);
      await save({ descriptor, image, source: 'Photo' }, t('Face registered from the photo'));
    } catch (err) {
      setError(err?.response ? errMsg(err) : err.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (id) => {
    try {
      const { data } = await api.delete(`/students/${student._id}/faces/${id}`);
      publish(data);
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const removeAll = async () => {
    try {
      await api.delete(`/students/${student._id}/faces`);
      publish([]);
      message.success(t('Face registration removed'));
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const hasPhotoSample = samples.some((s) => s.source === 'Photo');

  return (
    <>
      <Typography.Paragraph type="secondary">
        {t('Automated attendance recognises this student by these samples. The ID photo gives a usable signature; two or three live captures from slightly different angles make recognition at classroom distance much more reliable.')}
      </Typography.Paragraph>

      <Space style={{ marginBottom: 12 }}>
        <Tag color={samples.length ? 'green' : 'default'}>{t('{count} / {total} samples', { count: samples.length, total: MAX_SAMPLES })}</Tag>
        {!samples.length && !loading && <Tag color="orange">{t('Cannot be recognised yet')}</Tag>}
      </Space>

      {error && <Alert type="error" showIcon closable onClose={() => setError('')} message={error} style={{ marginBottom: 12 }} />}

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
            <Button type="primary" icon={<CameraOutlined />} onClick={capture} loading={busy === 'capture'} disabled={!modelsReady || !state.ok || full}>
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
        <Button
          icon={<PictureOutlined />}
          onClick={enrolFromPhoto}
          loading={busy === 'photo'}
          disabled={!student.photo || full || hasPhotoSample}
          title={!student.photo ? t('This student has no photo on file') : undefined}
        >
          {t('Use the ID photo')}
        </Button>
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
              <Image src={s.image} width={88} height={88} alt="" preview={false} fallback="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />
              <Tag bordered={false} style={{ fontSize: 11 }}>
                {t(s.source === 'Photo' ? 'From photo' : 'Live capture')}
              </Tag>
              <Popconfirm title={t('Delete this sample?')} onConfirm={() => remove(s._id)} okText={t('Delete')} cancelText={t('Cancel')}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={t('Delete')} />
              </Popconfirm>
            </div>
          ))}
        </div>
      ) : (
        !loading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No face registered yet')} />
      )}
    </>
  );
}
