import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GamePage from './pages/GamePage';
import ProfilePage from './pages/ProfilePage';
import AnalysisPage from './pages/AnalysisPage'; // <-- Add this import

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /></div>;
    if (!user) return <Navigate to="/login" />;
    return <>{children}</>;
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <div className="min-h-screen bg-[#09090B] text-zinc-200 flex flex-col font-sans selection:bg-zinc-800">
                    <Navbar />
                    <Routes>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />
                        <Route path="/" element={<ProtectedRoute><LandingPage /></ProtectedRoute>} />
                        <Route path="/game/:gameId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
                        {/* Add the Analysis Route here: */}
                        <Route path="/analysis/:gameId" element={<ProtectedRoute><AnalysisPage /></ProtectedRoute>} />
                        <Route path="/profile/:username?" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                    </Routes>
                </div>
            </BrowserRouter>
        </AuthProvider>
    );
}
