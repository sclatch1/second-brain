import { useState } from "react";

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

   if (!token) {
      return <LoginForm onLogin={handleLogin} />;
    }

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

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);


    try {
      const res = await fetch(`${API_URL}/api/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
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
        "Authorization": `Bearer ${token}`,
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
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Second Brain</h1>
        <button onClick={() => { localStorage.removeItem("token"); setToken(null); }} style={{ padding: "4px 12px" }}>
          Log out
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask something about my notes..."
          style={{ flex: 1, padding: 8, fontSize: 16 }}
        />
        <input
          type="file"
          accept=".txt,.md,.pdf"
          onChange={handleFileUpload}
        />
        <button type="submit" disabled={loading} style={{ padding: "8px 16px", backgroundColor: "#007bff", color: "#fff", border: "none", borderRadius: "4px" }}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </form>

      {error && <p style={{ color: "red", marginTop: 16 }}>{error}</p>}

      {answer && (
        <div style={{ marginTop: 24 }}>
          <h3>Answer</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>

          {sources.length > 0 && (
            <p style={{ color: "#666", fontSize: 14 }}>
              Sources: {sources.join(", ")}
            </p>
          )}
        </div>
      )}
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
    <div style={{ maxWidth: 400, margin: "100px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <h2>Second Brain</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          style={{ width: "100%", padding: 8, fontSize: 16, boxSizing: "border-box" }}
        />
        <button
          type="submit"
          disabled={loading || !password}
          style={{ marginTop: 12, padding: "8px 16px", width: "100%" }}
        >
          {loading ? "Checking..." : "Log in"}
        </button>
        {error && <p style={{ color: "red", marginTop: 12 }}>{error}</p>}
      </form>
    </div>
  );
}

export default App;