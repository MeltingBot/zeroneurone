import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, InvestigationPage } from './pages';
import { ToastContainer } from './components/common';
import { useTagSetStore } from './stores';

function App() {
  const loadTagSets = useTagSetStore((state) => state.load);

  // Initialize TagSets on app startup
  useEffect(() => {
    loadTagSets();
  }, [loadTagSets]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/investigation/:id" element={<InvestigationPage />} />
      </Routes>
      <ToastContainer />
    </BrowserRouter>
  );
}

export default App;
