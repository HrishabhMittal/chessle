import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await signIn(email, password);
    if (error) setError(error.message); else navigate('/');
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 h-full">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-xl">
        <div className="flex flex-col items-center mb-8">
           <div className="w-12 h-12 bg-zinc-200 text-zinc-900 flex items-center justify-center rounded-xl font-bold text-3xl mb-4">♞</div>
           <h2 className="text-2xl font-bold text-zinc-100">Welcome Back</h2>
        </div>
        {error && <div className="mb-4 p-3 bg-red-950/50 border border-red-900 text-red-400 text-sm rounded-lg text-center">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="Email" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-zinc-500" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Password" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-200 focus:outline-none focus:border-zinc-500" />
          <button type="submit" className="w-full bg-zinc-200 hover:bg-white text-zinc-900 font-bold py-3 rounded-lg transition-colors mt-2">Sign In</button>
        </form>
        <p className="text-center text-zinc-500 text-sm mt-6">New here? <Link to="/register" className="text-zinc-300 hover:text-white">Create account</Link></p>
      </div>
    </div>
  );
}
