import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';
import { useState } from 'react';
function App() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);
  async function handleSubmit(e) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch('http://localhost:3001/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }
  return _jsxs('div', {
    style: {
      maxWidth: 700,
      margin: '40px auto',
      fontFamily: 'sans-serif',
      padding: '0 16px',
    },
    children: [
      _jsx('h1', { children: 'Second Brain' }),
      _jsxs('form', {
        onSubmit: handleSubmit,
        style: { display: 'flex', gap: 8 },
        children: [
          _jsx('input', {
            type: 'text',
            value: question,
            onChange: (e) => setQuestion(e.target.value),
            placeholder: 'Ask something about your notes...',
            style: { flex: 1, padding: 8, fontSize: 16 },
          }),
          _jsx('button', {
            type: 'submit',
            disabled: loading,
            style: { padding: '8px 16px' },
            children: loading ? 'Thinking...' : 'Ask',
          }),
        ],
      }),
      error &&
        _jsx('p', { style: { color: 'red', marginTop: 16 }, children: error }),
      answer &&
        _jsxs('div', {
          style: { marginTop: 24 },
          children: [
            _jsx('h3', { children: 'Answer' }),
            _jsx('p', { style: { whiteSpace: 'pre-wrap' }, children: answer }),
            sources.length > 0 &&
              _jsxs('p', {
                style: { color: '#666', fontSize: 14 },
                children: ['Sources: ', sources.join(', ')],
              }),
          ],
        }),
    ],
  });
}
export default App;
//# sourceMappingURL=App.js.map
