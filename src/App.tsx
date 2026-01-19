import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, InvestigationPage, JoinPage } from './pages';
import { ToastContainer, MinResolutionGuard } from './components/common';
import { useTagSetStore } from './stores';

function App() {
  const loadTagSets = useTagSetStore((state) => state.load);

  // Initialize TagSets on app startup
  useEffect(() => {
    loadTagSets();
  }, [loadTagSets]);

  return (
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
  );
}

export default App;
