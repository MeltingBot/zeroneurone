import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage, InvestigationPage } from './pages';
import { ToastContainer } from './components/common';

function App() {
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
