import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Home from './pages/Home';
import Game from './pages/Game';
import Submit from './pages/Submit';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="bottom-center" />
      
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/games/:gameId" element={<Game />} />
        <Route path="/games/:gameId/submit" element={<Submit />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
