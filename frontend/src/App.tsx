import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GamePage from './pages/GamePage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (!user) return <Navigate to="/login" replace />;
    return <>{children}</>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (user) return <Navigate to="/" replace />;
    return <>{children}</>;
}
export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Navbar />
                <main className="flex-1 overflow-y-auto w-full flex flex-col min-h-0">
                    <Routes>
                        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
                        <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/game/:gameId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
                        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                        <Route path="/profile/:username" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </AuthProvider>
        </BrowserRouter>
    );
}
