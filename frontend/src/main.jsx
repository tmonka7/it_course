import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import './styles.css';

// Keep these in step with the tokens at the top of styles.css.
const theme = {
  token: {
    colorPrimary: '#1664ff',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorText: '#344054',
    colorTextHeading: '#1d2b53',
    colorTextSecondary: '#667085',
    colorTextPlaceholder: '#98a2b3',
    colorBorder: '#e9edf5',
    colorBorderSecondary: '#f1f4f9',
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 36,
    fontSize: 14,
    boxShadowTertiary: '0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)',
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: '#ffffff', bodyBg: '#f4f7fd', headerHeight: 64, headerPadding: '0 24px' },
    Menu: {
      itemSelectedBg: '#1664ff',
      itemSelectedColor: '#ffffff',
      itemBorderRadius: 8,
      itemMarginInline: 0,
      itemHeight: 42,
      iconSize: 17,
    },
    Table: {
      headerBg: '#f7f9fc',
      headerSplitColor: 'transparent',
      rowHoverBg: '#eef4ff',
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
      borderColor: '#f1f4f9',
    },
    Card: { headerFontSize: 15, headerHeight: 52, paddingLG: 20 },
    Button: { primaryShadow: '0 1px 2px rgba(22, 100, 255, 0.18)', fontWeight: 500 },
    Input: { activeShadow: '0 0 0 3px rgba(22, 100, 255, 0.12)' },
    Select: { optionSelectedBg: '#eef4ff' },
    Modal: { borderRadiusLG: 16, titleFontSize: 16 },
    Tag: { borderRadiusSM: 6 },
    Segmented: { itemSelectedBg: '#1664ff', itemSelectedColor: '#ffffff' },
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
