import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

const SplashPage = lazy(() => import("./pages/SplashPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const VerifyPage = lazy(() => import("./pages/VerifyPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));

function GuestRoute({ children }) {
  const { user } = useAuth();
  return user ? <Navigate to="/app" replace /> : children;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-300">Loading Nextalk...</div>;
  }
  return user ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-300">Loading Nextalk...</div>}>
      <Routes>
        <Route path="/" element={<GuestRoute><SplashPage /></GuestRoute>} />
        <Route path="/auth" element={<GuestRoute><AuthPage /></GuestRoute>} />
        <Route path="/verify" element={<GuestRoute><VerifyPage /></GuestRoute>} />
        <Route path="/app" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
