import { StrictMode, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthLoading, AuthScreen } from './components/AuthScreen';
import { ToastProvider } from './components/ui/Toaster';
import { useSession } from './hooks/useSession';
import { initAccent } from './lib/theme';
import './styles.css';

initAccent();

/**
 * Decides which of the three screens Pocket has to show. App is only mounted
 * once there is a session, so nothing inside it has to cope with not having one.
 */
function Pocket() {
  const session = useSession();
  const { adopt, refresh, signOut } = session;

  const handleSignOut = useCallback(() => void signOut(), [signOut]);

  switch (session.status) {
    case 'loading':
      return <AuthLoading />;
    case 'unreachable':
      return <AuthLoading error={session.error} onRetry={() => void refresh()} />;
    case 'setup':
      return <AuthScreen mode="setup" onSignedIn={adopt} />;
    case 'signed-out':
      return <AuthScreen mode="signin" onSignedIn={adopt} />;
    default:
      return (
        <App
          // Remounting on a change of account throws away the previous
          // library's state, which is the only safe thing to do with it.
          key={session.user!.id}
          user={session.user!}
          onUserChanged={adopt}
          onSignOut={handleSignOut}
        />
      );
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('The #root element is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <Pocket />
    </ToastProvider>
  </StrictMode>,
);
