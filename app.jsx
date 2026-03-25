import React, { useState, useEffect } from 'react';
import { db, auth, storage } from './firebase';
import { collection, addDoc, query, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { analyzeMealImage, getDecisionEngineAdvice } from './api';
import './App.css';

const App = () => {
  const [meals, setMeals] = useState([]);
  const [pendingMeal, setPendingMeal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState("");
  const [dailyTotal, setDailyTotal] = useState({ p: 0, f: 0, c: 0 });

  // Real-time Firestore Sync
  useEffect(() => {
    const q = query(collection(db, "meal_logs"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMeals(logs);
      calculateDaily(logs);
    });
    return () => unsubscribe();
  }, []);

  const calculateDaily = async (logs) => {
    const today = new Date().toDateString();
    const todayLogs = logs.filter(l => new Date(l.timestamp?.toDate()).toDateString() === today);
    const totals = todayLogs.reduce((acc, current) => ({
      p: acc.p + current.p, f: acc.f + current.f, c: acc.c + current.c
    }), { p: 0, f: 0, c: 0 });
    
    // Calculate Remaining
    const goals = { p: 160, f: 50, c: 200 };
    const remaining = {
      p: Math.max(0, goals.p - totals.p),
      f: Math.max(0, goals.f - totals.f),
      c: Math.max(0, goals.c - totals.c)
    };
    
    setDailyTotal(remaining);
    const res = await getDecisionEngineAdvice({ ...totals, goals });
    setAdvice(res);
  };

  const getLearnedBias = (foodName) => {
    const history = meals.filter(m => m.food === foodName && m.original);
    if (history.length === 0) return { p: 1, f: 1, c: 1 };
    
    // Median Bias Calculation
    const biases = history.map(m => ({
      p: m.p / m.original.p || 1,
      f: m.f / m.original.f || 1,
      c: m.c / m.original.c || 1
    }));
    
    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)];
    };

    return {
      p: median(biases.map(b => b.p)),
      f: median(biases.map(b => b.f)),
      c: median(biases.map(b => b.c))
    };
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      try {
        const mealData = await analyzeMealImage(base64);
        
        // v5.2 Learning/Correction
        const bias = getLearnedBias(mealData.food);
        const corrected = {
          ...mealData,
          p: Math.round(mealData.p * bias.p),
          f: Math.round(mealData.f * bias.f),
          c: Math.round(mealData.c * bias.c),
          cal: Math.round(mealData.cal * ((bias.p+bias.f+bias.c)/3))
        };

        setPendingMeal({ ...corrected, rice: "普通", fat: "普通", original: mealData });
      } catch (err) { alert("Error: Analysis Failed."); }
      finally { setLoading(false); }
    };
    reader.readAsDataURL(file);
  };

  const adjustMeal = (type, level) => {
    const nextMeal = { ...pendingMeal, [type]: level };
    const base = pendingMeal.original;
    const rScale = { "少": 0.7, "普通": 1.0, "多": 1.3 }[nextMeal.rice];
    const fScale = { "少": 0.5, "普通": 1.0, "多": 1.8 }[nextMeal.fat];
    nextMeal.c = Math.round(base.c * rScale);
    nextMeal.f = Math.round(base.f * fScale);
    nextMeal.cal = Math.round((nextMeal.p * 4) + (nextMeal.c * 4) + (nextMeal.f * 9));
    setPendingMeal(nextMeal);
  };

  const saveMeal = async () => {
    if (!pendingMeal) return;
    await addDoc(collection(db, "meal_logs"), {
      ...pendingMeal,
      timestamp: Timestamp.now()
    });
    setPendingMeal(null);
  };

  const [commandStatus, setCommandStatus] = useState("pending");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rules, setRules] = useState([]);

  // Guardrail Detection (3x Failure = Rule)
  const detectGuardrails = (logs) => {
    const failures = logs.filter(l => l.status === "failed");
    const counts = {};
    failures.forEach(f => {
      const type = f.logic_failure_type || "general";
      counts[type] = (counts[type] || 0) + 1;
    });
    const newRules = Object.entries(counts)
      .filter(([_, count]) => count >= 3)
      .map(([type]) => `禁止：${type.toUpperCase()}の再発`);
    setRules(newRules);
  };

  const handleCommandStatus = async (status) => {
    setCommandStatus(status);
    if (status === "failed") {
      const recovery = await getRecoveryAdvice(advice, { ...dailyTotal, goals: { p: 160, f: 50, c: 200 } });
      setAdvice(recovery);
    }
  };

  const submitFeedback = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    await addDoc(collection(db, "feedback"), { ...data, timestamp: Timestamp.now() });
    setFeedbackOpen(false);
    alert("Feedback Learned.");
  };

  return (
    <div className="athlete-ai-container">
      <header className="home-header">
        <h1>ATHLETE AI</h1>
        <div className="status-badge">GUARDRAIL ACTIVE: {rules.length}</div>
      </header>

      <main className="snap-container">
        <section className={`decision-card ${commandStatus}`}>
          <div className="label">DAILY COMMAND</div>
          <div className="advice-content whitespace-pre-wrap">{advice || "CALCULATING..."}</div>
          
          <div className="track-btns">
            <button onClick={() => handleCommandStatus("executed")}>✅ DONE</button>
            <button onClick={() => handleCommandStatus("failed")}>⚠️ FAIL</button>
          </div>
        </section>

        {/* Feedback Section (EOD) */}
        <button className="sec-button mb-1" onClick={() => setFeedbackOpen(true)}>1日の振り返り</button>

        {feedbackOpen && (
          <div className="correction-overlay">
            <form className="adjustment-ui glass-panel" onSubmit={submitFeedback}>
              <h3>FEEDBACK & LEARNING</h3>
              <div className="input-group">
                <label>体重変化(kg)</label>
                <input type="number" name="w_diff" step="0.1" required />
              </div>
              <div className="adj-group">
                <span>満腹感:</span>
                {[1, 2, 3].map(v => <button type="button" key={v} onClick={() => {}}>{v}</button>)}
              </div>
              <div className="adj-group">
                <span>キレ:</span>
                {[1, 2, 3].map(v => <button type="button" key={v} onClick={() => {}}>{v}</button>)}
              </div>
              <button type="submit" className="save-btn">AIに学習させる</button>
            </form>
          </div>
        )}

        {/* Correction UI (Same as v5.1) */}
        {pendingMeal && (
          <div className="correction-overlay">
            <div className="adjustment-ui glass-panel">
              <div className="label">AUTO-CORRECTED ANALYSIS</div>
              <h3>{pendingMeal.food}</h3>
              <div className="adj-group">
                <span>ご飯量:</span>
                {["少", "普通", "多"].map(l => (
                  <button key={l} className={pendingMeal.rice === l ? "active" : ""} onClick={() => adjustMeal("rice", l)}>{l}</button>
                ))}
              </div>
              <div className="adj-group">
                <span>脂質量:</span>
                {["少", "普通", "多"].map(l => (
                  <button key={l} className={pendingMeal.fat === l ? "active" : ""} onClick={() => adjustMeal("fat", l)}>{l}</button>
                ))}
              </div>
              <div className="pfc-preview">P:{pendingMeal.p} C:{pendingMeal.c} F:{pendingMeal.f}</div>
              <button className="save-btn" onClick={saveMeal}>STRATEGYに反映</button>
            </div>
          </div>
        )}

        {/* Simplified Stats: REMAINING ONLY */}
        <section className="stats-grid">
          <div className="stat-box"><span>REMAIN P</span><strong>{dailyTotal.p}g</strong></div>
          <div className="stat-box"><span>REMAIN F</span><strong style={{color: dailyTotal.f === 0 ? 'var(--neon-red)' : 'inherit'}}>{dailyTotal.f}g</strong></div>
          <div className="stat-box"><span>REMAIN C</span><strong>{dailyTotal.c}g</strong></div>
        </section>

        <div className="camera-fab">
          <input type="file" accept="image/*" onChange={handleImageUpload} id="cam-input" />
          <label htmlFor="cam-input">{loading ? <div className="spinner"></div> : <span>📷 解析</span>}</label>
        </div>

        <div className="meal-log">
          <h3>HISTORY</h3>
          {meals.slice(0, 5).map((m, i) => (
            <div key={i} className="meal-item">
              <div>{m.food}</div>
              <div className="pfc-tag">P:{m.p} C:{m.c} F:{m.f}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default App;
