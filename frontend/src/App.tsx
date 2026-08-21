import { useState } from "react";
import "./App.css";

interface QueryResponse {
  answer: string;
  sources: string[];
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function App() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));

  async function handleLogin(password: string) {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error("Login failed");
    const { token } = await res.json();
    localStorage.setItem("token", token);
    setToken(token);
  }

  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const res = await fetch(`${API_URL}/api/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      const data: QueryResponse = await res.json();
      setAnswer(data.answer);
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    fetch(`${API_URL}/api/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Ingestion failed: ${res.status}`);
        }
        alert("File ingested successfully!");
      })
      .catch((err) => {
        alert(err instanceof Error ? err.message : "Something went wrong during ingestion");
      });
  }

  return (
    <div className="app-shell">
      <div className="main-app">
        <div className="app-header">
          <h1 className="wordmark">Second Brain</h1>
          <button
            className="btn-ghost"
            onClick={() => {
              localStorage.removeItem("token");
              setToken(null);
            }}
          >
            Log out
          </button>
        </div>

        <form onSubmit={handleSubmit} className="ask-form">
          <input
            type="text"
            className="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask something about your notes…"
          />
          <label className="file-label" title="Upload a note or PDF">
            +
            <input type="file" accept=".txt,.md,.pdf" onChange={handleFileUpload} />
          </label>
          <button
            type="submit"
            className={`btn-primary ask-button${loading ? " thinking" : ""}`}
            disabled={loading}
          >
            {loading ? "Thinking…" : "Ask"}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}

        {answer && (
          <div className="answer-block">
            <p className="answer-label">Answer</p>
            <p className="answer-text">{answer}</p>
            {sources.length > 0 && (
              <p className="sources-line">Sources: {sources.join(", ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LoginForm({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <p className="wordmark">Second Brain</p>
        <p className="tagline">your notes, queryable</p>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
          />
          <button type="submit" className="btn-primary" disabled={loading || !password}>
            {loading ? "Checking…" : "Log in"}
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      </div>
    </div>
  );
}

export default App;
