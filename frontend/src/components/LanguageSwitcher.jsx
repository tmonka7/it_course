import { Button, Dropdown } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { LANGUAGES, useLanguage } from '../i18n';
import api, { TOKEN_KEY } from '../api';

/** Language menu (English / 日本語). The choice is remembered in this browser and on the account. */
export default function LanguageSwitcher({ size = 'middle' }) {
  const { lang, setLang } = useLanguage();
  const current = LANGUAGES.find((l) => l.value === lang) || LANGUAGES[0];
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        selectable: true,
        selectedKeys: [lang],
        items: LANGUAGES.map((l) => ({ key: l.value, label: l.label })),
        onClick: ({ key }) => {
          if (key === lang) return;
          setLang(key);
          if (localStorage.getItem(TOKEN_KEY)) api.put('/auth/preferences', { language: key }).catch(() => {});
        },
      }}
    >
      <Button type="text" size={size} icon={<GlobalOutlined />} aria-label="Language">
        {current.label}
      </Button>
    </Dropdown>
  );
}
