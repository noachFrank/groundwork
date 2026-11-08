import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { App } from './App.tsx';
import { OnlineProvider } from './online.tsx';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <OnlineProvider>
      <App />
    </OnlineProvider>
  </BrowserRouter>,
);
