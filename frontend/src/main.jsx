import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import './styles.css';

const theme = {
  token: {
    colorPrimary: '#1664ff',
    borderRadius: 8,
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: '#f7faff', bodyBg: '#f4f7fd' },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: '#dbe8ff',
      itemSelectedColor: '#1664ff',
      itemColor: '#344054',
      itemBorderRadius: 10,
      itemHeight: 46,
      itemMarginBlock: 4,
      iconSize: 18,
    },
    Table: { headerBg: '#f7f9fc' },
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <AntApp>
        <BrowserRouter>
          <SettingsProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </SettingsProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
