import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, register } from '../api/auth';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const result = await (isRegistering ? register : login)(username.trim(), password);
      localStorage.setItem('token', result.token);
      localStorage.setItem('username', result.user.username);
      navigate('/lobby', { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="panel auth-form" onSubmit={handleSubmit}>
        <p className="eyebrow">Zeichnen. Bewerten. Zusammen spielen.</p>
        <h1>Sketchle</h1>
        <label>
          Benutzername
          <input
            autoComplete="username"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_]+"
            required
            value={username}
            onChange={event => setUsername(event.target.value)}
          />
        </label>
        <label>
          Passwort
          <input
            autoComplete={isRegistering ? 'new-password' : 'current-password'}
            minLength={isRegistering ? 8 : undefined}
            maxLength={72}
            required
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
        </label>
        {isRegistering && <p className="help-text">3–30 Zeichen für den Namen; Passwort mindestens 8 Zeichen.</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Bitte warten …' : isRegistering ? 'Konto erstellen' : 'Anmelden'}
        </button>
        <button
          className="text-button"
          disabled={isSubmitting}
          onClick={() => {
            setIsRegistering(value => !value);
            setError('');
          }}
          type="button"
        >
          {isRegistering ? 'Schon ein Konto? Anmelden' : 'Noch kein Konto? Registrieren'}
        </button>
      </form>
    </main>
  );
}

export default Login;