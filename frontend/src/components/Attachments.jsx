import { useEffect, useState } from 'react';
import { App, Button, List, Popconfirm, Space, Tooltip, Typography, Upload } from 'antd';
import { DeleteOutlined, DownloadOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api, { errMsg } from '../api';

export const formatSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Uploads File objects to a work order; resolves the updated attachment list. */
export async function uploadAttachments(commandId, files) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const { data } = await api.post(`/commands/${commandId}/attachments`, form);
  return data;
}

// Downloads need the login token, so fetch as a blob instead of a plain link.
async function download(commandId, att) {
  const { data } = await api.get(`/commands/${commandId}/attachments/${att._id}`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** List of a work order's attachments with download and (optionally) delete. */
export function AttachmentList({ commandId, attachments, onChange, canDelete = true, emptyText = 'No attachments' }) {
  const { message } = App.useApp();
  const [items, setItems] = useState(attachments || []);
  useEffect(() => setItems(attachments || []), [attachments]);

  const remove = async (att) => {
    try {
      const { data } = await api.delete(`/commands/${commandId}/attachments/${att._id}`);
      setItems(data);
      onChange?.(data);
      message.success('Attachment removed');
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  if (!items.length) return <Typography.Text type="secondary">{emptyText}</Typography.Text>;
  return (
    <List
      size="small"
      className="attachment-list"
      dataSource={items}
      renderItem={(att) => (
        <List.Item
          actions={[
            <Tooltip key="dl" title="Download">
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => download(commandId, att).catch((err) => message.error(errMsg(err)))}
              />
            </Tooltip>,
            canDelete && (
              <Popconfirm key="rm" title={`Remove ${att.name}?`} onConfirm={() => remove(att)}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          ].filter(Boolean)}
        >
          <Space size={8} style={{ minWidth: 0 }}>
            <PaperClipOutlined />
            <div style={{ minWidth: 0 }}>
              <Typography.Text ellipsis={{ tooltip: att.name }} style={{ maxWidth: 280, display: 'block' }}>
                {att.name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {formatSize(att.size)} · {att.uploadedBy} · {dayjs(att.createdAt).format('YYYY-MM-DD HH:mm')}
              </Typography.Text>
            </div>
          </Space>
        </List.Item>
      )}
    />
  );
}

/** Button that uploads straight away (used in the work order drawer). */
export function AttachmentUploadButton({ commandId, onUploaded }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Upload
      multiple
      showUploadList={false}
      beforeUpload={(file, fileList) => {
        // Upload the whole selection once, when antd hands us its last file.
        if (file !== fileList[fileList.length - 1]) return false;
        setBusy(true);
        uploadAttachments(commandId, fileList)
          .then((list) => {
            message.success(`Uploaded ${fileList.length} file(s)`);
            onUploaded?.(list);
          })
          .catch((err) => message.error(errMsg(err)))
          .finally(() => setBusy(false));
        return false;
      }}
    >
      <Button icon={<UploadOutlined />} loading={busy}>
        Attach files
      </Button>
    </Upload>
  );
}
