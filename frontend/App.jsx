import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./context/AuthContext";
import { SocketProvider } from "./context/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DocumentListPage from "./pages/DocumentListPage";
import EditorPage from "./pages/EditorPage";

const AppHeader = () => {
  const { user, logout, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <p className="text-sm text-slate-600">
          Signed in as <span className="font-semibold text-slate-900">{user?.name || user?.email}</span>
        </p>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          Logout
        </button>
      </div>
    </header>
  );
};

const App = () => {
  const { isAuthenticated, token } = useAuth();

  return (
    <SocketProvider token={token}>
      <AppHeader />
      <Routes>
        <Route
          path="/"
          element={<Navigate to={isAuthenticated ? "/documents" : "/login"} replace />}
        />
        <Route
          path="/documents"
          element={
            <ProtectedRoute>
              <DocumentListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/:id"
          element={
            <ProtectedRoute>
              <EditorPage />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    </SocketProvider>
  );
};

export default App;
