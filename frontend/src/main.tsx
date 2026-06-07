import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { BrandProvider } from './components/BrandProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </BrandProvider>
  </StrictMode>,
);
