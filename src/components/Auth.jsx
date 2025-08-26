import React, { useState } from 'react'
import { supabase } from '../supabase';

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setStatus(error.message);
  };

  const handleSignup = async () => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setStatus(error.message);
    else setStatus('Signup successful! Check your email to verify.');
  };

  return (
    <div className="flex items-center justify-center w-screen h-screen bg-gray-100">
      <div className="bg-white p-6 rounded-lg shadow-lg w-[350px] text-center">
        <h3 className="text-xl font-semibold mb-4">Login / Signup</h3>
        <input 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          placeholder="Email" 
          className="w-[90%] border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input 
          type="password" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          placeholder="Password" 
          className="w-[90%] border border-gray-300 rounded px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button 
          onClick={handleLogin} 
          className="w-[90%] bg-blue-500 text-white rounded px-3 py-2 mb-2 hover:bg-blue-600"
        >
          Login
        </button>
        <button 
          onClick={handleSignup} 
          className="w-[90%] bg-green-500 text-white rounded px-3 py-2 hover:bg-green-600"
        >
          Signup
        </button>
        {status && <p className="text-red-500 mt-2">{status}</p>}
      </div>
    </div>
  );
}

export default Auth