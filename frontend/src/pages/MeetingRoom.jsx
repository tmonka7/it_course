import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App, Avatar, Badge, Button, Input, Result, Space, Spin, Tooltip, Typography } from 'antd';
import {
  AudioMutedOutlined,
  AudioOutlined,
  CopyOutlined,
  DesktopOutlined,
  EditOutlined,
  LogoutOutlined,
  MessageOutlined,
  PoweroffOutlined,
  PushpinOutlined,
  SendOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import useMeeting from '../meeting/useMeeting';
import Whiteboard from '../meeting/Whiteboard';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n';

const MESH_LIMIT = 6; // peer-to-peer mesh: every participant sends to every other one

function StreamVideo({ stream, muted, mirrored, contain }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${mirrored ? 'mirrored' : ''} ${contain ? 'contain' : ''}`} />;
}

function VideoTile({ name, stream, media, isSelf, pinned, onPin, large }) {
  const showVideo = stream && (media?.video || media?.screen);
  return (
    <div className={`meet-tile ${large ? 'large' : ''} ${media?.screen ? 'sharing' : ''}`} onDoubleClick={onPin}>
      {/* Always render the element so remote audio keeps playing even when the camera is off. */}
      <StreamVideo stream={stream} muted={isSelf} mirrored={isSelf && !media?.screen} contain={media?.screen} />
      {!showVideo && (
        <div className="meet-avatar">
          <Avatar size={large ? 96 : 56} style={{ background: '#1664ff', fontSize: large ? 40 : 24 }}>
            {name?.[0]?.toUpperCase() || '?'}
          </Avatar>
        </div>
      )}
      <div className="meet-tile-label">
        {media?.audio ? <AudioOutlined /> : <AudioMutedOutlined style={{ color: '#f87171' }} />}
        <span>
          {name}
          {isSelf ? t(' (You)') : ''}
          {media?.screen ? t(' · presenting') : ''}
        </span>
      </div>
      {onPin && (
        <Tooltip title={pinned ? t('Unpin') : t('Pin to stage')}>
          <button type="button" className={`meet-pin ${pinned ? 'active' : ''}`} onClick={onPin}>
            <PushpinOutlined />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function ChatPanel({ messages, onSend, selfUserId }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    if (!(await onSend(t))) setText(t);
  };
  return (
    <div className="meet-panel-body">
      <div className="meet-chat" ref={listRef}>
        {messages.length === 0 && <Typography.Text type="secondary">{t('No messages yet.')}</Typography.Text>}
        {messages.map((m) => (
          <div key={m._id} className={`chat-msg ${String(m.user) === String(selfUserId) ? 'mine' : ''}`}>
            <div className="chat-meta">
              <strong>{m.name}</strong> <span>{dayjs(m.createdAt).format('HH:mm')}</span>
            </div>
            <div className="chat-text">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="meet-chat-input">
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoSize={{ minRows: 1, maxRows: 4 }}
          placeholder={t('Send a message')}
          maxLength={2000}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button type="primary" icon={<SendOutlined />} onClick={send} />
      </div>
    </div>
  );
}

function Lobby({ m, code, onJoin, onBack }) {
  const { user } = useAuth();
  useEffect(() => {
    m.startPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="meet-lobby">
      <div className="meet-lobby-preview">
        <VideoTile name={user?.name} stream={m.localStream} media={m.media} isSelf large />
        <div className="meet-lobby-controls">
          <ControlButton on={m.media.audio} onIcon={<AudioOutlined />} offIcon={<AudioMutedOutlined />} label={t('Microphone')} onClick={m.toggleMic} />
          <ControlButton on={m.media.video} onIcon={<VideoCameraOutlined />} offIcon={<VideoCameraOutlined />} label={t('Camera')} onClick={m.toggleCamera} />
        </div>
      </div>
      <div className="meet-lobby-side">
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          {t('Ready to join?')}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          {t('Meeting code')} <Typography.Text code>{code}</Typography.Text>
        </Typography.Paragraph>
        {m.error && <Typography.Paragraph type="danger">{m.error}</Typography.Paragraph>}
        {!m.localStream?.getTracks().length && m.localStream && (
          <Typography.Paragraph type="secondary">{t('No camera or microphone available. You can still join to watch, chat and draw.')}</Typography.Paragraph>
        )}
        <Space>
          <Button type="primary" size="large" loading={m.phase === 'joining'} onClick={onJoin}>
            {t('Join now')}
          </Button>
          <Button size="large" onClick={onBack}>
            {t('Back')}
          </Button>
        </Space>
      </div>
    </div>
  );
}

function ControlButton({ on, onIcon, offIcon, label, onClick, toggle, badge }) {
  return (
    <Tooltip title={label}>
      <Badge count={badge} size="small" offset={[-4, 4]}>
        <button type="button" className={`meet-ctl ${on ? 'on' : 'off'} ${toggle ? 'toggle' : ''}`} onClick={onClick} aria-label={label} aria-pressed={!!on}>
          {on ? onIcon : offIcon}
        </button>
      </Badge>
    </Tooltip>
  );
}

export default function MeetingRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const m = useMeeting(code);
  const [panel, setPanel] = useState(null); // 'chat' | 'people' | null
  const [board, setBoard] = useState(false);
  const [pinned, setPinned] = useState(null); // tile id on stage
  const [seenMessages, setSeenMessages] = useState(0);
  const [seenBoard, setSeenBoard] = useState(0);

  useEffect(() => {
    if (panel === 'chat') setSeenMessages(m.messages.length);
  }, [panel, m.messages.length]);
  useEffect(() => {
    if (board) setSeenBoard(m.boardActivity);
  }, [board, m.boardActivity]);

  const leave = () => {
    m.leave();
    navigate('/meetings');
  };

  const tiles = useMemo(() => {
    const self = { id: 'self', name: user?.name, stream: m.media.screen ? m.screenStream : m.localStream, media: m.media, isSelf: true };
    return [self, ...m.peers.map((p) => ({ id: p.id, name: p.name, stream: p.stream, media: p.media }))];
  }, [m.peers, m.media, m.localStream, m.screenStream, user]);

  if (m.phase === 'lobby' || m.phase === 'joining') {
    return <Lobby m={m} code={code} onJoin={m.join} onBack={() => navigate('/meetings')} />;
  }
  if (m.phase === 'ended') {
    return (
      <Result
        status="info"
        title={t('The meeting has ended')}
        extra={<Button type="primary" onClick={() => navigate('/meetings')}>{t('Back to meetings')}</Button>}
      />
    );
  }
  if (m.phase === 'error') {
    return (
      <Result
        status="warning"
        title={t('Unable to continue')}
        subTitle={m.error}
        extra={[
          <Button key="retry" type="primary" onClick={() => window.location.reload()}>
            {t('Rejoin')}
          </Button>,
          <Button key="back" onClick={leave}>
            {t('Back to meetings')}
          </Button>,
        ]}
      />
    );
  }
  if (!m.meeting) return <Spin fullscreen />;

  const presenter = tiles.find((t) => t.media?.screen);
  const stageTile = board ? null : tiles.find((t) => t.id === pinned) || presenter || null;
  const stripTiles = stageTile || board ? tiles.filter((t) => t !== stageTile) : tiles;
  const isHost = m.meeting.hostId === user?._id || user?.role === 'admin';
  const unreadChat = panel === 'chat' ? 0 : Math.max(0, m.messages.length - seenMessages);
  const boardBadge = !board && m.boardActivity > seenBoard ? 1 : 0;
  const inviteLink = `${window.location.origin}/meetings/room/${m.meeting.code}`;

  const toggleScreen = async () => {
    if (m.media.screen) await m.stopScreenShare();
    else if (!(await m.startScreenShare())) message.info(t('Screen sharing was cancelled or is not supported in this browser'));
  };

  const endForAll = () =>
    modal.confirm({
      title: t('End the meeting for everyone?'),
      okText: t('End meeting'),
      okButtonProps: { danger: true },
      onOk: () => m.endForAll(),
    });

  return (
    <div className="meet-room">
      <header className="meet-header">
        <div>
          <strong>{m.meeting.title}</strong>
          <span className="meet-code">{m.meeting.code}</span>
        </div>
        <Space>
          {tiles.length > MESH_LIMIT && <Typography.Text type="warning">{t('Large meetings may lag (peer-to-peer)')}</Typography.Text>}
          <Button
            size="small"
            icon={<CopyOutlined />}
            onClick={() => navigator.clipboard?.writeText(inviteLink).then(() => message.success(t('Invite link copied')))}
          >
            {t('Copy invite link')}
          </Button>
        </Space>
      </header>

      <div className="meet-main">
        <div className={`meet-content ${stageTile || board ? 'has-stage' : ''}`}>
          {board && (
            <div className="meet-stage">
              <Whiteboard socketRef={m.socket} store={m.whiteboardRef} />
            </div>
          )}
          {stageTile && (
            <div className="meet-stage">
              <VideoTile {...stageTile} large pinned={pinned === stageTile.id} onPin={() => setPinned(pinned === stageTile.id ? null : stageTile.id)} />
            </div>
          )}
          <div className={`meet-grid ${stageTile || board ? 'strip' : `count-${Math.min(stripTiles.length, 9)}`}`}>
            {stripTiles.map((t) => (
              <VideoTile key={t.id} {...t} pinned={pinned === t.id} onPin={() => setPinned(pinned === t.id ? null : t.id)} />
            ))}
          </div>
        </div>

        {panel && (
          <aside className="meet-panel">
            <div className="meet-panel-head">
              <strong>{panel === 'chat' ? t('Chat') : t('People ({count})', { count: tiles.length })}</strong>
              <Button type="text" size="small" onClick={() => setPanel(null)}>
                {t('Close')}
              </Button>
            </div>
            {panel === 'chat' ? (
              <ChatPanel messages={m.messages} onSend={m.sendChat} selfUserId={user?._id} />
            ) : (
              <div className="meet-panel-body meet-people">
                {tiles.map((p) => (
                  <div key={p.id} className="person">
                    <Avatar size="small" style={{ background: '#1664ff' }}>
                      {p.name?.[0]?.toUpperCase()}
                    </Avatar>
                    <span className="person-name">
                      {p.name}
                      {p.isSelf ? t(' (You)') : ''}
                    </span>
                    {p.media?.screen && <DesktopOutlined style={{ color: '#1664ff' }} />}
                    {p.media?.audio ? <AudioOutlined /> : <AudioMutedOutlined style={{ color: '#ef4444' }} />}
                    <VideoCameraOutlined style={{ color: p.media?.video ? undefined : '#cbd5e1' }} />
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="meet-controls">
        <ControlButton on={m.media.audio} onIcon={<AudioOutlined />} offIcon={<AudioMutedOutlined />} label={m.media.audio ? t('Mute') : t('Unmute')} onClick={m.toggleMic} />
        <ControlButton on={m.media.video} onIcon={<VideoCameraOutlined />} offIcon={<VideoCameraOutlined />} label={m.media.video ? t('Turn camera off') : t('Turn camera on')} onClick={m.toggleCamera} />
        <ControlButton on={m.media.screen} onIcon={<DesktopOutlined />} offIcon={<DesktopOutlined />} label={m.media.screen ? t('Stop sharing') : t('Share screen')} toggle onClick={toggleScreen} />
        <ControlButton on={board} onIcon={<EditOutlined />} offIcon={<EditOutlined />} label={t('Whiteboard')} toggle badge={boardBadge} onClick={() => setBoard((b) => !b)} />
        <ControlButton on={panel === 'chat'} onIcon={<MessageOutlined />} offIcon={<MessageOutlined />} label={t('Chat')} toggle badge={unreadChat} onClick={() => setPanel(panel === 'chat' ? null : 'chat')} />
        <ControlButton on={panel === 'people'} onIcon={<TeamOutlined />} offIcon={<TeamOutlined />} label={t('People')} toggle onClick={() => setPanel(panel === 'people' ? null : 'people')} />
        <span className="meet-ctl-gap" />
        <Button danger type="primary" shape="round" icon={<LogoutOutlined />} onClick={leave}>
          {t('Leave')}
        </Button>
        {isHost && (
          <Tooltip title={t('End the meeting for everyone')}>
            <Button danger shape="round" icon={<PoweroffOutlined />} onClick={endForAll}>
              {t('End')}
            </Button>
          </Tooltip>
        )}
      </footer>
    </div>
  );
}
