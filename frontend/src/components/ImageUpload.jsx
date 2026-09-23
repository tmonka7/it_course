import { App, Avatar, Button, Space, Upload } from 'antd';
import { UserOutlined } from '@ant-design/icons';

const MAX_BYTES = 500 * 1024;

// Controlled form input that stores the chosen image as a data URL.
export default function ImageUpload({ value, onChange, shape = 'circle', size = 96, buttonText = 'Upload Photo', placeholder }) {
  const { message } = App.useApp();

  const beforeUpload = (file) => {
    if (!file.type.startsWith('image/')) {
      message.error('Please choose an image file');
    } else if (file.size > MAX_BYTES) {
      message.error('Image must be smaller than 500 KB');
    } else {
      const reader = new FileReader();
      reader.onload = () => onChange?.(reader.result);
      reader.readAsDataURL(file);
    }
    return Upload.LIST_IGNORE;
  };

  return (
    <Space direction="vertical" align="center">
      <Avatar
        size={size}
        shape={shape}
        src={value || undefined}
        icon={!value && (placeholder || <UserOutlined />)}
        style={{ background: value ? 'transparent' : '#e6efff', color: '#1664ff' }}
      />
      <Space size={4}>
        <Upload accept="image/*" showUploadList={false} beforeUpload={beforeUpload}>
          <Button size="small">{buttonText}</Button>
        </Upload>
        {value && (
          <Button size="small" type="text" danger onClick={() => onChange?.(null)}>
            Remove
          </Button>
        )}
      </Space>
    </Space>
  );
}
