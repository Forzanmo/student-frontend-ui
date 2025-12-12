import { useMemo, useState } from "react";

const DEFAULT_JSON = `{
  "school":"GP",
  "sex":"F",
  "age":18,
  "address":"U",
  "famsize":"GT3",
  "Pstatus":"T",
  "Medu":4,
  "Fedu":4,
  "Mjob":"teacher",
  "Fjob":"teacher",
  "reason":"course",
  "guardian":"mother",
  "traveltime":2,
  "studytime":2,
  "failures":0,
  "schoolsup":"yes",
  "famsup":"no",
  "paid":"no",
  "activities":"yes",
  "nursery":"yes",
  "higher":"yes",
  "internet":"yes",
  "romantic":"no",
  "famrel":4,
  "freetime":3,
  "goout":4,
  "Dalc":1,
  "Walc":1,
  "health":3,
  "absences":4,
  "G1":14,
  "G2":15
}`;

export default function App() {
  const apiBase = useMemo(
    () => import.meta.env.VITE_API_URL || "https://student-backend-api-fnlo.onrender.com",
    []
  );

  const [jsonText, setJsonText] = useState(DEFAULT_JSON);
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");

  const predict = async () => {
    setErr("");
    setOut(null);

    let data;
    try {
      data = JSON.parse(jsonText);
    } catch {
      setErr("Invalid JSON. Please fix the input.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(JSON.stringify(body));

      setOut(body);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 980, margin: "40px auto", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 6 }}>Student Pass/Fail Predictor</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Backend: <code>{apiBase}</code> — <a href={`${apiBase}/docs`} target="_blank" rel="noreferrer">docs</a>
      </div>

      <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>Input JSON</label>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        rows={18}
        style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #444" }}
      />

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          onClick={predict}
          disabled={loading}
          style={{ padding: "10px 16px", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 700 }}
        >
          {loading ? "Predicting..." : "Predict"}
        </button>
      </div>

      {err && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid #c00" }}>
          <b style={{ color: "#c00" }}>Error:</b> {err}
        </div>
      )}

      {out && (
        <pre style={{ marginTop: 14, padding: 14, borderRadius: 12, background: "#111", color: "#0f0", overflowX: "auto" }}>
          {JSON.stringify(out, null, 2)}
        </pre>
      )}
    </div>
  );
}
