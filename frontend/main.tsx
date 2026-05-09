import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import App from './app/App';
import { AuthProvider } from './lib/auth';
import { ConfirmProvider } from './app/components/shared/ConfirmDialog';
import './styles/index.css';

// Load Vercel Analytics via script tag
if (typeof window !== 'undefined') {
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://cdn.vercel-analytics.com/v1/script.js';
  document.head.appendChild(script);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
   <React.StrictMode>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={true} storageKey="theme">
         <AuthProvider>
            <ConfirmProvider>
               <App />
               <Analytics />
            </ConfirmProvider>
            <Toaster
               position="bottom-right"
               theme="system"
               toastOptions={{
                  style: {
                     background: 'var(--background)',
                     color: 'var(--foreground)',
                     border: '1px solid rgba(255,255,255,0.1)',
                  },
               }}
            />
         </AuthProvider>
      </ThemeProvider>
   </React.StrictMode>
);
