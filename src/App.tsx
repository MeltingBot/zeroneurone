import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, InvestigationPage, JoinPage } from './pages';
import { ToastContainer, MinResolutionGuard, ErrorBoundary } from './components/common';
import { useTagSetStore } from './stores';

/**
 * Global error fallback for unrecoverable errors
 */
function GlobalErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-error/10">
          <svg
            className="w-8 h-8 text-error"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-text-primary mb-2">
          Erreur critique
        </h1>
        <p className="text-sm text-text-secondary mb-6">
          L'application a rencontré une erreur inattendue et ne peut pas continuer.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-accent rounded hover:bg-accent-hover"
          >
            Recharger l'application
          </button>
          <button
            onClick={() => {
              window.location.href = '/';
            }}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const loadTagSets = useTagSetStore((state) => state.load);

  // Initialize TagSets on app startup
  useEffect(() => {
    loadTagSets();
  }, [loadTagSets]);

  return (
    <ErrorBoundary fallback={<GlobalErrorFallback />}>
      <MinResolutionGuard>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/investigation/:id" element={<InvestigationPage />} />
            <Route path="/join/:roomId" element={<JoinPage />} />
          </Routes>
          <ToastContainer />
        </BrowserRouter>
      </MinResolutionGuard>
    </ErrorBoundary>
  );
}

export default App;
