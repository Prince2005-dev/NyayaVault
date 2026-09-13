import type React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { AuthProvider } from './app/providers/AuthProvider';
import { QueryProvider } from './app/providers/QueryProvider';
import { ErrorBoundary } from './components/feedback/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
};

export default App;
