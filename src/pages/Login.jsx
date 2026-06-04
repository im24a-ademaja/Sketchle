import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {login, register} from '../api/auth';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function handleSubmit(action) {
    setError('');
    const fn = action === 'login' ? login : register;
    const result = await fn(username, password);
    if (data.error) return setError(data.error);
    localStorage.setItem('token', result.token);
    localStorage.setItem('username', data.user.username);
    navigate('/lobby');
  }

  return (    
    <div style={{ maxWidth: 400, margin: '100px auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1>Sketchle</h1>
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input placeholder="Passwort" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={() => handleSubmit('login')}>Login</button>
      <button onClick={() => handleSubmit('register')}>Registrieren</button>
    </div>
  );
}  
