import { List } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import StatusTag from './StatusTag';
import { NOTIFICATION_COLORS } from '../notifications';

dayjs.extend(relativeTime);

export default function NotificationItem({ item, onOpen }) {
  return (
    <List.Item className={`notif-item ${item.read ? '' : 'notif-unread'}`} onClick={() => onOpen(item)}>
      <span className="notif-dot" style={{ background: item.read ? 'transparent' : NOTIFICATION_COLORS[item.type] }} />
      <div className="notif-body">
        <div className="notif-title">{item.title}</div>
        {item.message && <div className="notif-message">{item.message}</div>}
        <div className="notif-time">{dayjs(item.createdAt).fromNow()}</div>
      </div>
      <StatusTag value={item.type} />
    </List.Item>
  );
}
