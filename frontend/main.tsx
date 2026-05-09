import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import App from './app/App';
import { AuthProvider } from './lib/auth';
import { ConfirmProvider } from './app/components/shared/ConfirmDialog';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
   <React.StrictMode>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={true} storageKey="theme">
         <AuthProvider>
            <ConfirmProvider>
               <App />
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
