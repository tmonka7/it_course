import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App, Avatar, Badge, Button, Card, Col, Descriptions, Empty, Form, InputNumber, Progress,
  Row, Segmented, Select, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import { ControlOutlined, LoadingOutlined, PictureOutlined, PlayCircleOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import LivePlayer from '../components/LivePlayer';
import PtzControl from '../components/PtzControl';
import { descriptorFromPhoto } from '../components/StudentFaces';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import { SEMESTERS, academicYears, toOptions } from '../constants';
import { DEFAULT_MATCH_THRESHOLD, analyze, drawDetections, faceThumbnail, frameReady, loadModels, matchFace } from '../vision';
import { t } from '../i18n';

const FACE_SCORE = 0.55; // classroom faces are small and side-on; below the registration threshold on purpose
const FRAMES_PER_POSITION = 3; // analyse a few frames at each stop, so a blink or a turned head is not fatal
const STATUS_COLOR = { Present: 'green', Late: 'orange', Absent: 'red', Excused: 'blue' };
const YEARS = academicYears(3);

const currentSemester = () => {
  const month = dayjs().month(); // 0 = January
  if (month >= 7) return 'Fall';
  if (month >= 4) return 'Summer';
  return 'Spring';
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Automated attendance: the operator picks a camera and a class, and the page sweeps the room with
 * the camera's PTZ while recognising every enrolled student's face.
 *
 * The sweep loop lives here rather than on the server because recognition runs in this browser
 * (onnxruntime-web), so moving and looking have to stay in step: move -> wait for the stream to catch
 * up -> analyse a few frames -> report who was seen -> move again.
 */
export default function Attendance() {
  const { message, modal } = App.useApp();
  const { can } = useAuth();
  const [tab, setTab] = useState('scan');

  // Setup
  const [cameras, setCameras] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [gatewayEnabled, setGatewayEnabled] = useState(false);
  const [form] = Form.useForm();
  const [cameraId, setCameraId] = useState(null);
  const [ptz, setPtz] = useState(null); // { supported, message }

  // Run
  const [session, setSession] = useState(null);
  const [records, setRecords] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [plan, setPlan] = useState([]);
  const [progress, setProgress] = useState({ index: 0, pass: 1, total: 0, passes: 1 });
  const [phase, setPhase] = useState('idle'); // idle | preparing | scanning | finishing | done
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ presentCount: 0, expectedCount: 0, unknownFaces: 0 });

  // Bulk face enrolment from ID photos
  const [enrolling, setEnrolling] = useState(null); // { done, total, enrolled, failed }

  // History
  const [sessions, setSessions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const mediaRef = useRef(null);
  const canvasRef = useRef(null);
  const abortRef = useRef(false);
  const resultRef = useRef(null);

  const canEdit = can('attendance', 'edit');
  const canCreate = can('attendance', 'create');

  const setMedia = useCallback((el) => {
    mediaRef.current = el;
  }, []);

  useEffect(() => {
    Promise.allSettled([
      api.get('/cameras', { params: { pageSize: 1000 } }),
      api.get('/schedules', { params: { pageSize: 1000 } }),
      api.get('/live'),
    ]).then(([c, s, live]) => {
      if (c.status === 'fulfilled') setCameras(c.value.data.items);
      if (s.status === 'fulfilled') setSchedules(s.value.data.items);
      if (live.status === 'fulfilled') setGatewayEnabled(live.value.data.enabled);
    });
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    api
      .get('/attendance/sessions', { params: { pageSize: 25 } })
      .then(({ data }) => setSessions(data.items))
      .catch((err) => message.error(errMsg(err)))
      .finally(() => setHistoryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // Ask the camera whether it can actually be steered, so the operator is not surprised mid-scan.
  useEffect(() => {
    if (!cameraId) {
      setPtz(null);
      return;
    }
    setPtz({ checking: true });
    api
      .get(`/cameras/${cameraId}/ptz`)
      .then(({ data }) => setPtz(data))
      .catch((err) => setPtz({ supported: false, message: errMsg(err) }));
  }, [cameraId]);

  const camera = cameras.find((c) => c._id === cameraId) || null;

  // Keep the overlay aligned when the window is resized.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      if (mediaRef.current) drawDetections(canvas, mediaRef.current, resultRef.current, { fit: 'contain' });
    });
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [phase]);

  /** Analyses the current frame a few times and returns the students recognised, strongest match each. */
  const scanPosition = useCallback(
    async (people, threshold) => {
      const best = new Map();
      let faceCount = 0;
      let unknown = 0;

      for (let frame = 0; frame < FRAMES_PER_POSITION; frame += 1) {
        if (abortRef.current) break;
        const media = mediaRef.current;
        if (!frameReady(media)) {
          await sleep(300);
          continue;
        }
        let result;
        try {
          result = await analyze(media, { objects: false, faces: true, embed: true, faceScore: FACE_SCORE });
        } catch (err) {
          if (err?.name === 'SecurityError') throw err;
          await sleep(150);
          continue;
        }
        const faces = result.faces || [];
        faceCount = Math.max(faceCount, faces.length);
        let matchedThisFrame = 0;
        faces.forEach((face) => {
          const match = matchFace(face.descriptor, people, threshold);
          if (!match) return;
          matchedThisFrame += 1;
          face.match = match; // so the overlay labels the box
          const previous = best.get(match.user._id);
          if (!previous || match.similarity > previous.similarity) {
            best.set(match.user._id, {
              student: match.user._id,
              similarity: match.similarity,
              thumbnail: faceThumbnail(media, face.box),
            });
          }
        });
        unknown = Math.max(unknown, faces.length - matchedThisFrame);

        resultRef.current = result;
        if (canvasRef.current && media) drawDetections(canvasRef.current, media, result, { fit: 'contain' });
        await sleep(120);
      }
      return { faces: [...best.values()], faceCount, unknown };
    },
    []
  );

  const refreshRecords = useCallback(async (id) => {
    const { data } = await api.get(`/attendance/sessions/${id}`);
    setRecords(data.records);
    setSession(data.session);
    return data;
  }, []);

  /** The whole run: create the session, then sweep the grid once per pass. */
  const start = async (values) => {
    setError('');
    abortRef.current = false;
    setStopping(false);
    setPhase('preparing');
    resultRef.current = null;

    let created;
    try {
      const { data } = await api.post('/attendance/sessions', {
        camera: values.camera,
        schedule: values.schedule || undefined,
        academicYear: values.academicYear,
        semester: values.semester,
        rosterSource: values.rosterSource,
        passes: values.passes,
        lateAfterMinutes: values.lateAfterMinutes,
        matchThreshold: values.matchThreshold,
      });
      created = data;
    } catch (err) {
      setError(errMsg(err));
      setPhase('idle');
      return;
    }

    setSession(created);
    setPlan(created.plan || []);
    setStats({ presentCount: 0, expectedCount: created.expectedCount, unknownFaces: 0 });
    setProgress({ index: 0, pass: 1, total: (created.plan || []).length, passes: created.passes });

    let people = [];
    try {
      const [registryRes] = await Promise.all([api.get(`/attendance/sessions/${created._id}/registry`), loadModels(['yunet', 'sface'])]);
      people = registryRes.data;
      setRegistry(people);
      await refreshRecords(created._id);
    } catch (err) {
      setError(err?.response ? errMsg(err) : t('Could not load the AI models: {error}', { error: err.message }));
      await finish(created._id, 'Failed', err.message);
      return;
    }

    if (!people.length) {
      setError(t('None of the expected students has a registered face, so nobody can be recognised. Register faces on the Student Management page first.'));
      await finish(created._id, 'Failed', 'No registered faces on the roster');
      return;
    }

    setPhase('scanning');
    const threshold = values.matchThreshold || DEFAULT_MATCH_THRESHOLD;
    const positions = created.plan || [];
    const streamDelay = values.streamDelayMs ?? 2500;

    try {
      for (let pass = 1; pass <= created.passes && !abortRef.current; pass += 1) {
        for (let index = 0; index < positions.length && !abortRef.current; index += 1) {
          const position = positions[index];
          setProgress({ index, pass, total: positions.length, passes: created.passes });

          let moveError = '';
          try {
            await api.post(`/cameras/${values.camera}/ptz/move`, { pan: position.pan, tilt: position.tilt, zoom: position.zoom, settle: true });
            // The HLS stream lags the camera by a couple of seconds, so what is on screen right after a
            // move is still the previous position. Wait it out before believing the picture.
            await sleep(streamDelay);
          } catch (err) {
            moveError = errMsg(err);
          }
          if (abortRef.current) break;

          const seen = moveError ? { faces: [], faceCount: 0, unknown: 0 } : await scanPosition(people, threshold);
          try {
            const { data } = await api.post(`/attendance/sessions/${created._id}/sightings`, {
              positionIndex: index,
              faces: seen.faces,
              faceCount: seen.faceCount,
              unknown: seen.unknown,
              error: moveError || undefined,
            });
            setStats({ presentCount: data.presentCount, expectedCount: data.expectedCount, unknownFaces: data.unknownFaces });
          } catch (err) {
            // A dropped report must not abandon the sweep; the position is simply unrecorded.
            console.warn('[attendance] could not report a position:', errMsg(err));
          }
          setPlan((current) =>
            current.map((p, i) => (i === index ? { ...p, scannedAt: new Date().toISOString(), faces: seen.faceCount, recognised: seen.faces.length, error: moveError } : p))
          );
          await refreshRecords(created._id).catch(() => {});
        }
      }
    } catch (err) {
      if (err?.name === 'SecurityError') {
        setError(t('This stream cannot be analysed because the camera does not allow other sites to read its pictures. Play it through the media gateway instead (leave the camera\'s Live URL empty).'));
      } else {
        setError(errMsg(err));
      }
      await finish(created._id, 'Failed', err.message);
      return;
    }

    await finish(created._id, abortRef.current ? 'Cancelled' : 'Completed');
  };

  const finish = async (id, status, failure) => {
    setPhase('finishing');
    try {
      const { data } = await api.post(`/attendance/sessions/${id}/complete`, { status, error: failure });
      setSession(data);
      await refreshRecords(id).catch(() => {});
      if (status === 'Completed') message.success(t('Attendance scan finished'));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setPhase('done');
    }
  };

  /**
   * Derives a face signature from every active student's ID photo and registers it in one batch.
   * The signatures are computed here (the models only run in the browser); the server stores them and
   * skips students who already have a photo-derived sample.
   */
  const enrolFromPhotos = async () => {
    setError('');
    let students = [];
    try {
      const { data } = await api.get('/students', { params: { pageSize: 1000, status: 'Active' } });
      students = data.items.filter((student) => student.photo && !student.faceCount);
    } catch (err) {
      message.error(errMsg(err));
      return;
    }
    if (!students.length) {
      message.info(t('Every active student with a photo already has a registered face.'));
      return;
    }

    setEnrolling({ done: 0, total: students.length, enrolled: 0, failed: 0 });
    try {
      await loadModels(['yunet', 'sface']);
    } catch (err) {
      setError(t('Could not load the AI models: {error}', { error: err.message }));
      setEnrolling(null);
      return;
    }

    const samples = [];
    let failed = 0;
    for (let i = 0; i < students.length; i += 1) {
      try {
        const { descriptor, image } = await descriptorFromPhoto(students[i].photo);
        samples.push({ student: students[i]._id, descriptor, image });
      } catch {
        failed += 1; // an unusable photo (no face, or several) is reported in the summary
      }
      setEnrolling({ done: i + 1, total: students.length, enrolled: samples.length, failed });
    }

    try {
      const { data } = await api.post('/students/faces/bulk', { samples });
      message.success(t('Registered {count} student face(s) from ID photos', { count: data.enrolled.length }));
      if (failed || data.skipped.length || data.errors.length) {
        modal.info({
          title: t('Enrolment finished'),
          content: (
            <Space direction="vertical">
              <span>{t('Registered: {count}', { count: data.enrolled.length })}</span>
              {!!failed && <span>{t('No usable face in the photo: {count}', { count: failed })}</span>}
              {!!data.skipped.length && <span>{t('Skipped: {count}', { count: data.skipped.length })}</span>}
              {!!data.errors.length && <span>{t('Failed: {count}', { count: data.errors.length })}</span>}
            </Space>
          ),
        });
      }
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setEnrolling(null);
    }
  };

  const stop = () => {
    abortRef.current = true;
    setStopping(true);
    message.info(t('Finishing the current position, then stopping...'));
  };

  const override = (record, status) => {
    modal.confirm({
      title: t('Change {name} to {status}?', { name: record.student?.name, status: t(status) }),
      okText: t('Save'),
      cancelText: t('Cancel'),
      onOk: async () => {
        try {
          await api.put(`/attendance/records/${record._id}`, { status });
          await refreshRecords(session._id);
          message.success(t('Attendance updated'));
        } catch (err) {
          message.error(errMsg(err));
        }
      },
    });
  };

  const scheduleOptions = useMemo(
    () =>
      schedules.map((s) => ({
        value: s._id,
        label: `${s.course?.code || '?'} ${s.course?.name || ''} - ${t('Day {day}', { day: s.day })}, ${t('Period {period}', { period: s.period + 1 })}, ${s.room}`,
      })),
    [schedules]
  );

  const running = phase === 'preparing' || phase === 'scanning' || phase === 'finishing';
  const scannedCount = plan.filter((p) => p.scannedAt).length;
  const overallDone = progress.total ? ((progress.pass - 1) * progress.total + progress.index) / (progress.total * progress.passes) : 0;
  const byStatus = useMemo(() => {
    const groups = { Present: [], Late: [], Absent: [], Excused: [] };
    records.forEach((r) => groups[r.status]?.push(r));
    return groups;
  }, [records]);

  const rosterColumns = [
    {
      title: t('Student'),
      key: 'student',
      render: (_, r) => (
        <Space>
          <Avatar size="small" src={r.thumbnail || r.student?.photo || undefined} icon={<UserOutlined />} />
          <span>
            {r.student?.name}
            <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
              {r.student?.studentId}
            </Typography.Text>
          </span>
        </Space>
      ),
    },
    {
      title: t('Status'),
      dataIndex: 'status',
      width: 120,
      render: (status, r) => (
        <Tooltip title={r.overriddenByName ? t('Corrected by {name}', { name: r.overriddenByName }) : undefined}>
          <Tag color={STATUS_COLOR[status]} bordered={false}>
            {t(status)}
            {r.overriddenByName ? ' *' : ''}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: t('First seen'),
      dataIndex: 'firstSeenAt',
      width: 110,
      render: (v) => (v ? dayjs(v).format('HH:mm:ss') : '-'),
    },
    {
      title: t('Confidence'),
      dataIndex: 'bestSimilarity',
      width: 110,
      render: (v) => (v ? `${Math.round(v * 100)}%` : '-'),
    },
    ...(canEdit
      ? [
          {
            title: t('Correct'),
            key: 'actions',
            width: 180,
            render: (_, r) => (
              <Space size={4}>
                {['Present', 'Absent', 'Excused'].map((s) => (
                  <Button key={s} size="small" type="text" disabled={r.status === s || running} onClick={() => override(r, s)}>
                    {t(s)}
                  </Button>
                ))}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <h1 className="page-title">{t('Automated Attendance')}</h1>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'scan', label: t('Take attendance') },
          { value: 'history', label: t('Past sessions') },
        ]}
        style={{ marginBottom: 16 }}
      />

      {tab === 'history' ? (
        <Card bordered={false} className="page-card">
          <Table
            rowKey="_id"
            loading={historyLoading}
            dataSource={sessions}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: t('Date'), dataIndex: 'date', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
              { title: t('Course'), key: 'course', render: (_, r) => (r.course ? `${r.course.code} ${r.course.name}` : t('All active students')) },
              { title: t('Room'), dataIndex: 'room' },
              { title: t('Camera'), key: 'camera', render: (_, r) => r.camera?.name },
              {
                title: t('Present'),
                key: 'present',
                render: (_, r) => (
                  <Space>
                    <span>
                      {r.presentCount} / {r.expectedCount}
                    </span>
                    <Progress
                      type="line"
                      percent={r.expectedCount ? Math.round((r.presentCount / r.expectedCount) * 100) : 0}
                      size="small"
                      style={{ width: 80 }}
                      showInfo={false}
                    />
                  </Space>
                ),
              },
              { title: t('Status'), dataIndex: 'status', render: (v) => <Tag bordered={false} color={v === 'Completed' ? 'green' : v === 'Scanning' ? 'blue' : 'default'}>{t(v)}</Tag> },
              { title: t('Started by'), dataIndex: 'startedByName' },
            ]}
          />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={14}>
            <Card bordered={false} className="page-card" style={{ marginBottom: 16 }} title={t('Scan setup')}>
              <Form
                form={form}
                layout="vertical"
                disabled={running}
                initialValues={{
                  rosterSource: 'Enrollment',
                  academicYear: YEARS[0],
                  semester: currentSemester(),
                  passes: 1,
                  lateAfterMinutes: 10,
                  matchThreshold: DEFAULT_MATCH_THRESHOLD,
                  streamDelayMs: 2500,
                }}
                onFinish={start}
              >
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item name="camera" label={t('Camera')} rules={[{ required: true, message: t('A camera is required') }]}>
                      <Select
                        placeholder={t('Select a camera')}
                        onChange={setCameraId}
                        options={cameras.map((c) => ({
                          value: c._id,
                          label: `${c.name} (${c.cameraId})${c.type === 'PTZ' ? ' - PTZ' : ''}`,
                          disabled: c.status !== 'Online',
                        }))}
                        popupMatchSelectWidth={false}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item name="schedule" label={t('Class')} extra={t('Leave empty to scan without a timetabled class')}>
                      <Select allowClear showSearch optionFilterProp="label" placeholder={t('Select a class')} options={scheduleOptions} popupMatchSelectWidth={false} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col xs={24} md={8}>
                    <Form.Item name="rosterSource" label={t('Expected students')}>
                      <Select
                        options={[
                          { value: 'Enrollment', label: t('Enrolled in the course') },
                          { value: 'AllActive', label: t('All active students') },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item name="academicYear" label={t('Academic Year')}>
                      <Select options={toOptions(YEARS)} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item name="semester" label={t('Semester')}>
                      <Select options={toOptions(SEMESTERS)} />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={12}>
                  <Col xs={12} md={6}>
                    <Form.Item name="passes" label={t('Sweeps')} tooltip={t('Repeat the sweep to catch students who looked away the first time')}>
                      <InputNumber min={1} max={10} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="lateAfterMinutes" label={t('Late after (min)')}>
                      <InputNumber min={0} max={240} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="matchThreshold" label={t('Match threshold')} tooltip={t('Lower recognises more students but risks confusing similar faces')}>
                      <InputNumber min={0.2} max={0.95} step={0.02} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="streamDelayMs" label={t('Stream delay (ms)')} tooltip={t('How far the live stream lags the camera. The scan waits this long after each move before looking.')}>
                      <InputNumber min={0} max={15000} step={500} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>

                {ptz && !ptz.checking && !ptz.supported && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={t('This camera cannot be steered')}
                    description={`${t('The scan will still recognise faces, but only where the camera already points.')} ${ptz.message || ''}`}
                  />
                )}
                {ptz?.checking && (
                  <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                    <LoadingOutlined /> {t('Checking PTZ control...')}
                  </Typography.Text>
                )}
                {ptz?.supported && (
                  <Alert type="success" showIcon style={{ marginBottom: 12 }} message={t('PTZ control is available on this camera')} />
                )}

              </Form>

              {/* Outside the <Form>, whose `disabled` while scanning would otherwise disable Stop too. */}
              <Space wrap>
                {running ? (
                  <Button danger icon={<StopOutlined />} onClick={stop} disabled={stopping} loading={stopping}>
                    {t(stopping ? 'Stopping...' : 'Stop scan')}
                  </Button>
                ) : (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => form.submit()} disabled={!canCreate}>
                    {t('Start attendance scan')}
                  </Button>
                )}
                <Button
                  icon={<PictureOutlined />}
                  onClick={enrolFromPhotos}
                  loading={!!enrolling}
                  disabled={!canEdit || running}
                  title={t('Register a face for every active student who has an ID photo but no face yet')}
                >
                  {enrolling
                    ? t('Reading photos {done}/{total}...', { done: enrolling.done, total: enrolling.total })
                    : t('Enrol faces from ID photos')}
                </Button>
                {phase === 'done' && (
                  <Button
                    onClick={() => {
                      setPhase('idle');
                      setSession(null);
                      setRecords([]);
                      setPlan([]);
                      resultRef.current = null;
                    }}
                  >
                    {t('New scan')}
                  </Button>
                )}
              </Space>
            </Card>

            <Card bordered={false} className="page-card" bodyStyle={{ padding: 12 }}>
              <div className="detect-stage">
                <LivePlayer camera={camera} gatewayEnabled={gatewayEnabled} fit="contain" onMedia={setMedia} />
                <canvas ref={canvasRef} className="detect-overlay" />
                {phase === 'preparing' && (
                  <div className="detect-status">
                    <LoadingOutlined /> {t('Loading AI models and the class roster...')}
                  </div>
                )}
                {phase === 'scanning' && (
                  <div className="detect-status">
                    {t('Sweep {pass} of {passes} - position {index} of {total}', {
                      pass: progress.pass,
                      passes: progress.passes,
                      index: progress.index + 1,
                      total: progress.total,
                    })}
                  </div>
                )}
              </div>
              {running && <Progress percent={Math.round(overallDone * 100)} status="active" style={{ marginTop: 12 }} />}
            </Card>
          </Col>

          <Col xs={24} xl={10}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {error && <Alert type="error" showIcon closable onClose={() => setError('')} message={error} />}

              <Card bordered={false} className="page-card" size="small">
                <Row gutter={8}>
                  <Col span={8}>
                    <Statistic title={t('Present')} value={stats.presentCount} suffix={`/ ${stats.expectedCount || '-'}`} valueStyle={{ color: '#12b76a' }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title={t('Absent')} value={Math.max(0, stats.expectedCount - stats.presentCount)} valueStyle={{ color: '#f04438' }} />
                  </Col>
                  <Col span={8}>
                    <Statistic title={t('Unknown faces')} value={stats.unknownFaces} />
                  </Col>
                </Row>
                {session && (
                  <Descriptions size="small" column={1} style={{ marginTop: 12 }}>
                    <Descriptions.Item label={t('Room')}>{session.room || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('Course')}>{session.course ? `${session.course.code} ${session.course.name}` : t('All active students')}</Descriptions.Item>
                    <Descriptions.Item label={t('Registered faces')}>
                      {t('{count} of {total} expected students', { count: registry.length, total: stats.expectedCount })}
                    </Descriptions.Item>
                  </Descriptions>
                )}
              </Card>

              {camera && !running && (
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

              {plan.length > 0 && (
                <Card bordered={false} className="page-card" size="small" title={t('Coverage')} extra={<Tag bordered={false}>{t('{done} / {total} positions', { done: scannedCount, total: plan.length })}</Tag>}>
                  <div className="ptz-coverage">
                    {plan.map((p, i) => {
                      const active = phase === 'scanning' && i === progress.index;
                      const state = p.error ? 'error' : p.scannedAt ? 'done' : 'pending';
                      return (
                        <Tooltip
                          key={`${p.row}-${p.column}-${i}`}
                          title={
                            p.error
                              ? p.error
                              : `${t('Pan')} ${p.pan.toFixed(2)}, ${t('Tilt')} ${p.tilt.toFixed(2)}${p.scannedAt ? ` - ${t('{faces} face(s), {n} recognised', { faces: p.faces || 0, n: p.recognised || 0 })}` : ''}`
                          }
                        >
                          <div className={`ptz-cell ${state} ${active ? 'active' : ''}`}>{p.scannedAt ? p.recognised || 0 : ''}</div>
                        </Tooltip>
                      );
                    })}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {t('Each square is one camera position; the number is how many students were recognised there.')}
                  </Typography.Text>
                </Card>
              )}

              {registry.length > 0 && registry.length < stats.expectedCount && (
                <Alert
                  type="warning"
                  showIcon
                  message={t('{count} expected student(s) have no registered face', { count: stats.expectedCount - registry.length })}
                  description={t('They cannot be recognised and will be marked absent. Register their faces on the Student Management page.')}
                />
              )}

              <Card
                bordered={false}
                className="page-card"
                size="small"
                title={t('Roster')}
                extra={
                  <Space size={4}>
                    <Badge count={byStatus.Present.length} showZero color="#12b76a" title={t('Present')} />
                    <Badge count={byStatus.Late.length} showZero color="#f79009" title={t('Late')} />
                    <Badge count={byStatus.Absent.length} showZero color="#f04438" title={t('Absent')} />
                  </Space>
                }
              >
                {records.length ? (
                  <Table rowKey="_id" size="small" dataSource={records} columns={rosterColumns} pagination={{ pageSize: 8, size: 'small' }} />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('Start a scan to build the roster')} />
                )}
              </Card>
            </Space>
          </Col>
        </Row>
      )}
    </>
  );
}
