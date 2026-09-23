import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { t } from '../i18n';

/** Shows a "no access" page instead of `children` when the user may not view `page`. */
export default function PageGuard({ page, admin, children }) {
  const { can, isAdmin } = useAuth();
  const navigate = useNavigate();
  const allowed = admin ? isAdmin : can(page, 'view');
  if (allowed) return children;
  return (
    <Result
      status="403"
      title={t('Access denied')}
      subTitle={t('You do not have permission to view this page. Ask an administrator if you need access.')}
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          {t('Back to Home')}
        </Button>
      }
    />
  );
}
