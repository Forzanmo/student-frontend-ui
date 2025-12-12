import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_INPUT = {
  // categorical
  school: "GP",
  sex: "F",
  address: "U",
  famsize: "GT3",
  Pstatus: "T",
  Mjob: "teacher",
  Fjob: "teacher",
  reason: "course",
  guardian: "mother",
  schoolsup: "yes",
  famsup: "no",
  paid: "no",
  activities: "yes",
  nursery: "yes",
  higher: "yes",
  internet: "yes",
  romantic: "no",

  // numeric
  age: 18,
  Medu: 4,
  Fedu: 4,
  traveltime: 2,
  studytime: 2,
  failures: 0,
  famrel: 4,
  freetime: 3,
  goout: 4,
  Dalc: 1,
  Walc: 1,
  health: 3,
  absences: 4,
  G1: 14,
  G2: 15,
};

const SELECTS = {
  school: ["GP", "MS"],
  sex: ["F", "M"],
  address: ["U", "R"],
  famsize: ["LE3", "GT3"],
  Pstatus: ["T", "A"],
  Mjob: ["teacher", "health", "services", "at_home", "other"],
  Fjob: ["teacher", "health", "services", "at_home", "other"],
  reason: ["home", "reputation", "course", "other"],
  guardian: ["mother", "father", "other"],
  yesno: ["yes", "no"],
};

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  if (!rows?.length) return "time,prediction,pass_probability\n";
  const headers = ["time", "prediction", "pass_probability"];
  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([escape(r.at), escape(r.prediction), escape(r.pass_probability)].join(","));
  }
  return lines.join("\n");
}

export default function App() {
  const apiBase = useMemo(
    () => import.meta.env.VITE_API_URL || "https://student-backend-api-fnlo.onrender.com",
    []
  );

  const [mode, setMode] = useState("form"); // "form" | "json"
  const [backendOk, setBackendOk] = useState(null);

  const [form, setForm] = useState(DEFAULT_INPUT);
  const [jsonText, setJsonText] = useState(JSON.stringify(DEFAULT_INPUT, null, 2));

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [out, setOut] = useState(null);

  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("pred_history") || "[]");
    } catch {
      return [];
    }
  });

  const fileRef = useRef(null);

  // Keep JSON in sync with Form
  useEffect(() => {
    setJsonText(JSON.stringify(form, null, 2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // Save history
  useEffect(() => {
    localStorage.setItem("pred_history", JSON.stringify(history.slice(0, 20)));
  }, [history]);

  // Backend health
  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const r = await fetch(`${apiBase}/health`);
        if (!mounted) return;
        setBackendOk(r.ok);
      } catch {
        if (!mounted) return;
        setBackendOk(false);
      }
    }
    check();
    const id = setInterval(check, 20000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [apiBase]);

  function setField(key, value) {
    setForm((p) => ({ ...p, [key]: value }));
  }

  function resetAll() {
    setErr("");
    setOut(null);
    setForm(DEFAULT_INPUT);
    setMode("form");
  }

  function parseJsonToForm(text) {
    const obj = JSON.parse(text);
    if (typeof obj !== "object" || obj == null) throw new Error("JSON must be an object.");
    setForm((p) => ({ ...p, ...obj }));
  }

  async function predictUsing(dataObj) {
    setErr("");
    setOut(null);
    setBusy(true);

    try {
      const res = await fetch(`${apiBase}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataObj }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail ? String(body.detail) : JSON.stringify(body));

      const payload = {
        at: new Date().toISOString(),
        prediction: body?.prediction,
        pass_probability: body?.pass_probability,
        result_raw: body,
        input: dataObj,
      };

      setOut(payload);
      setHistory((h) => [payload, ...h].slice(0, 20));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPredict() {
    if (backendOk === false) {
      setErr("Backend appears offline. Open /docs once to wake Render, then try again.");
      return;
    }

    if (mode === "form") {
      return predictUsing(form);
    }

    // JSON mode
    try {
      const obj = JSON.parse(jsonText);
      return predictUsing(obj);
    } catch {
      setErr("Invalid JSON. Fix syntax (quotes/commas) and try again.");
    }
  }

  function onUploadClick() {
    fileRef.current?.click();
  }

  async function onFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow uploading same file again
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      setErr("Please upload a .json file.");
      return;
    }

    try {
      const text = await file.text();
      setJsonText(text);
      parseJsonToForm(text); // update form too
      setMode("form");
      setErr("");
    } catch (ex) {
      setErr("Failed to read JSON file: " + String(ex));
    }
  }

  const prob = clamp01(out?.pass_probability);
  const probPct = Math.round(prob * 100);
  const isPass = out?.prediction === 1;

  return (
    <div style={styles.page}>
      <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={onFileChange} />

      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.title}>Student Pass/Fail Predictor</div>
            <div style={styles.sub}>
              Backend: <code style={styles.code}>{apiBase}</code>{" "}
              <a style={styles.link} href={`${apiBase}/docs`} target="_blank" rel="noreferrer">
                API Docs
              </a>
            </div>
          </div>

          <div style={styles.status}>
            <span
              style={{
                ...styles.dot,
                background: backendOk === true ? "#22c55e" : backendOk === false ? "#ef4444" : "rgba(255,255,255,.35)",
              }}
            />
            <span style={{ opacity: 0.85, fontSize: 13 }}>
              {backendOk === true ? "Backend Online" : backendOk === false ? "Backend Offline" : "Checking…"}
            </span>
          </div>
        </header>

        <div style={styles.toolbar}>
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tab, ...(mode === "form" ? styles.tabActive : {}) }}
              onClick={() => setMode("form")}
            >
              Form Mode (Friendly)
            </button>
            <button
              style={{ ...styles.tab, ...(mode === "json" ? styles.tabActive : {}) }}
              onClick={() => setMode("json")}
            >
              JSON Mode (Advanced)
            </button>
          </div>

          <div style={styles.actions}>
            <button style={styles.btnGhost} onClick={onUploadClick} disabled={busy}>
              Upload JSON
            </button>
            <button
              style={styles.btnGhost}
              onClick={() => downloadText("student_input.json", JSON.stringify(form, null, 2), "application/json")}
              disabled={busy}
            >
              Download Input
            </button>
            <button
              style={styles.btnGhost}
              onClick={() => out && downloadText("prediction_result.json", JSON.stringify(out.result_raw, null, 2), "application/json")}
              disabled={!out}
            >
              Download Result
            </button>
            <button
              style={styles.btnGhost}
              onClick={() => downloadText("prediction_history.csv", toCSV(history), "text/csv")}
              disabled={history.length === 0}
            >
              Download History (CSV)
            </button>
            <button style={styles.btnGhost} onClick={resetAll} disabled={busy}>
              Reset
            </button>
          </div>
        </div>

        <main style={styles.grid}>
          <section style={styles.card}>
            <div style={styles.cardTitle}>Input</div>

            {mode === "form" ? (
              <div style={styles.formGrid}>
                {/* Friendly Form */}
                <FieldSelect label="school" value={form.school} options={SELECTS.school} onChange={(v) => setField("school", v)} />
                <FieldSelect label="sex" value={form.sex} options={SELECTS.sex} onChange={(v) => setField("sex", v)} />
                <FieldNumber label="age" value={form.age} min={10} max={30} onChange={(v) => setField("age", v)} />

                <FieldSelect label="address" value={form.address} options={SELECTS.address} onChange={(v) => setField("address", v)} />
                <FieldSelect label="famsize" value={form.famsize} options={SELECTS.famsize} onChange={(v) => setField("famsize", v)} />
                <FieldSelect label="Pstatus" value={form.Pstatus} options={SELECTS.Pstatus} onChange={(v) => setField("Pstatus", v)} />

                <FieldNumber label="studytime (1–4)" value={form.studytime} min={1} max={4} onChange={(v) => setField("studytime", v)} />
                <FieldNumber label="failures" value={form.failures} min={0} max={5} onChange={(v) => setField("failures", v)} />
                <FieldNumber label="absences" value={form.absences} min={0} max={100} onChange={(v) => setField("absences", v)} />

                <FieldNumber label="G1" value={form.G1} min={0} max={20} onChange={(v) => setField("G1", v)} />
                <FieldNumber label="G2" value={form.G2} min={0} max={20} onChange={(v) => setField("G2", v)} />
                <FieldNumber label="traveltime (1–4)" value={form.traveltime} min={1} max={4} onChange={(v) => setField("traveltime", v)} />

                <FieldSelect label="Mjob" value={form.Mjob} options={SELECTS.Mjob} onChange={(v) => setField("Mjob", v)} />
                <FieldSelect label="Fjob" value={form.Fjob} options={SELECTS.Fjob} onChange={(v) => setField("Fjob", v)} />
                <FieldSelect label="reason" value={form.reason} options={SELECTS.reason} onChange={(v) => setField("reason", v)} />

                <FieldSelect label="guardian" value={form.guardian} options={SELECTS.guardian} onChange={(v) => setField("guardian", v)} />
                <FieldYesNo label="internet" value={form.internet} onChange={(v) => setField("internet", v)} />
                <FieldYesNo label="higher" value={form.higher} onChange={(v) => setField("higher", v)} />

                <details style={styles.details}>
                  <summary style={styles.summary}>More fields (optional)</summary>
                  <div style={styles.moreGrid}>
                    <FieldNumber label="Medu" value={form.Medu} min={0} max={4} onChange={(v) => setField("Medu", v)} />
                    <FieldNumber label="Fedu" value={form.Fedu} min={0} max={4} onChange={(v) => setField("Fedu", v)} />
                    <FieldYesNo label="schoolsup" value={form.schoolsup} onChange={(v) => setField("schoolsup", v)} />
                    <FieldYesNo label="famsup" value={form.famsup} onChange={(v) => setField("famsup", v)} />
                    <FieldYesNo label="paid" value={form.paid} onChange={(v) => setField("paid", v)} />
                    <FieldYesNo label="activities" value={form.activities} onChange={(v) => setField("activities", v)} />
                    <FieldYesNo label="nursery" value={form.nursery} onChange={(v) => setField("nursery", v)} />
                    <FieldYesNo label="romantic" value={form.romantic} onChange={(v) => setField("romantic", v)} />
                    <FieldNumber label="famrel" value={form.famrel} min={1} max={5} onChange={(v) => setField("famrel", v)} />
                    <FieldNumber label="freetime" value={form.freetime} min={1} max={5} onChange={(v) => setField("freetime", v)} />
                    <FieldNumber label="goout" value={form.goout} min={1} max={5} onChange={(v) => setField("goout", v)} />
                    <FieldNumber label="Dalc" value={form.Dalc} min={1} max={5} onChange={(v) => setField("Dalc", v)} />
                    <FieldNumber label="Walc" value={form.Walc} min={1} max={5} onChange={(v) => setField("Walc", v)} />
                    <FieldNumber label="health" value={form.health} min={1} max={5} onChange={(v) => setField("health", v)} />
                  </div>
                </details>
              </div>
            ) : (
              <>
                <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 8 }}>
                  Tip: Upload a JSON file to fill this automatically.
                </div>
                <textarea
                  style={styles.editor}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                />
                <button
                  style={styles.btnSmall}
                  onClick={() => {
                    try {
                      parseJsonToForm(jsonText);
                      setErr("");
                    } catch (e) {
                      setErr(String(e));
                    }
                  }}
                >
                  Apply JSON → Form
                </button>
              </>
            )}

            <div style={styles.row}>
              <button style={styles.btnPrimary} onClick={onPredict} disabled={busy || backendOk === false}>
                {busy ? "Predicting…" : "Predict"}
              </button>
              <button style={styles.btn} onClick={() => { setErr(""); setOut(null); }} disabled={busy}>
                Clear result
              </button>
            </div>

            {err && <div style={styles.alert}><b>Error:</b> {err}</div>}
          </section>

          <section style={styles.card}>
            <div style={styles.cardTitle}>Output</div>

            {!out ? (
              <div style={styles.empty}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>No prediction yet</div>
                <div style={{ opacity: 0.8, marginTop: 6 }}>Fill the form and click <b>Predict</b>.</div>
              </div>
            ) : (
              <>
                <div style={styles.resultTop}>
                  <span style={{ ...styles.badge, background: isPass ? "rgba(34,197,94,.16)" : "rgba(239,68,68,.16)" }}>
                    {isPass ? "PASS" : "FAIL"}
                  </span>
                  <div style={{ opacity: 0.85 }}>
                    <div><b>Pass probability:</b> {probPct}%</div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(out.at).toLocaleString()}</div>
                  </div>
                </div>

                <div style={styles.barWrap}>
                  <div style={{ ...styles.bar, width: `${probPct}%` }} />
                </div>

                <pre style={styles.pre}>{JSON.stringify(out.result_raw, null, 2)}</pre>
              </>
            )}
          </section>

          <section style={{ ...styles.card, gridColumn: "1 / -1" }}>
            <div style={styles.cardTitle}>History</div>

            {history.length === 0 ? (
              <div style={{ opacity: 0.8 }}>No history yet.</div>
            ) : (
              <div style={styles.histGrid}>
                {history.map((h, i) => {
                  const pass = h.prediction === 1;
                  const pct = Math.round(clamp01(h.pass_probability) * 100);
                  return (
                    <button
                      key={h.at + i}
                      style={styles.histItem}
                      onClick={() => setOut(h)}
                      title="Click to load this result"
                    >
                      <span style={{ ...styles.tag, background: pass ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.14)" }}>
                        {pass ? "PASS" : "FAIL"}
                      </span>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 800 }}>{pct}%</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{new Date(h.at).toLocaleString()}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button style={styles.btnGhost} onClick={() => setHistory([])} disabled={history.length === 0}>
                Clear history
              </button>
              <button
                style={styles.btnGhost}
                onClick={() => downloadText("prediction_history.json", JSON.stringify(history, null, 2), "application/json")}
                disabled={history.length === 0}
              >
                Download History (JSON)
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function FieldSelect({ label, value, options, onChange }) {
  return (
    <div style={styles.field}>
      <div style={styles.label}>{label}</div>
      <select style={styles.input} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldYesNo({ label, value, onChange }) {
  return <FieldSelect label={label} value={value} options={["yes", "no"]} onChange={onChange} />;
}

function FieldNumber({ label, value, min, max, onChange }) {
  return (
    <div style={styles.field}>
      <div style={styles.label}>{label}</div>
      <input
        style={styles.input}
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      />
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "26px 14px",
    background:
      "radial-gradient(1000px 600px at 20% 10%, #1A1B3A 0%, transparent 60%), radial-gradient(900px 650px at 80% 30%, #2A154D 0%, transparent 55%), linear-gradient(180deg,#070A12,#0B1020)",
    color: "#EAF0FF",
    fontFamily: "Arial, sans-serif",
  },
  shell: { maxWidth: 1150, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 },
  title: { fontSize: 26, fontWeight: 900 },
  sub: { marginTop: 6, opacity: 0.82, fontSize: 13 },
  code: { background: "rgba(255,255,255,.08)", padding: "3px 8px", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)" },
  link: { color: "rgba(234,240,255,.95)", textDecoration: "underline", textUnderlineOffset: 3 },
  status: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.06)",
    backdropFilter: "blur(10px)",
  },
  dot: { width: 10, height: 10, borderRadius: 999 },

  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: {
    padding: "9px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.06)",
    color: "#EAF0FF",
    fontWeight: 800,
    cursor: "pointer",
  },
  tabActive: { background: "linear-gradient(180deg, rgba(124,58,237,.55), rgba(124,58,237,.24))", borderColor: "rgba(124,58,237,.55)" },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },

  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  card: {
    borderRadius: 18,
    padding: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.04))",
    backdropFilter: "blur(12px)",
    boxShadow: "0 20px 60px rgba(0,0,0,.35)",
  },
  cardTitle: { fontWeight: 900, marginBottom: 10 },

  formGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  moreGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 10 },
  details: { marginTop: 8 },
  summary: { cursor: "pointer", fontWeight: 800, opacity: 0.9 },

  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, opacity: 0.8, fontWeight: 800 },
  input: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.22)",
    color: "#EAF0FF",
    outline: "none",
  },

  editor: {
    width: "100%",
    minHeight: 360,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.22)",
    color: "#EAF0FF",
    padding: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
  },

  row: { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" },
  btnPrimary: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(124,58,237,.55)",
    background: "linear-gradient(180deg, rgba(124,58,237,.55), rgba(124,58,237,.24))",
    color: "#EAF0FF",
    fontWeight: 900,
    cursor: "pointer",
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.06)",
    color: "#EAF0FF",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnGhost: {
    padding: "9px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background: "transparent",
    color: "#EAF0FF",
    fontWeight: 900,
    cursor: "pointer",
  },
  btnSmall: {
    marginTop: 10,
    padding: "9px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.06)",
    color: "#EAF0FF",
    fontWeight: 900,
    cursor: "pointer",
  },

  alert: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(239,68,68,.35)",
    background: "rgba(239,68,68,.10)",
  },

  empty: { padding: 16, borderRadius: 16, border: "1px dashed rgba(255,255,255,.18)", background: "rgba(0,0,0,.18)" },
  resultTop: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 },
  badge: { padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", fontWeight: 900, letterSpacing: 1 },
  barWrap: { height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.12)", overflow: "hidden" },
  bar: { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, rgba(34,197,94,.85), rgba(124,58,237,.85))" },
  pre: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.22)",
    overflowX: "auto",
    fontSize: 12,
  },

  histGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
  histItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(0,0,0,.18)",
    color: "#EAF0FF",
    cursor: "pointer",
  },
  tag: { width: 64, textAlign: "center", padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.12)", fontWeight: 900 },
};
