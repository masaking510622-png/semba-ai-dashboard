// COMBAT SYSTEM v4.0 - PROFESSIONAL RECONSTRUCTION
// ----------------------------------------------------

const MATCH_DATE = new Date("2026-04-25T00:00:00+09:00");
const TARGET_WEIGHT = 53.0;

const PRESETS = {
    "鶏むね肉": { p: 23, c: 0, f: 1.5, cal: 108 },
    "白米": { p: 2.5, c: 37, f: 0.3, cal: 168 },
    "ブロッコリー": { p: 4.3, c: 5.2, f: 0.5, cal: 33 },
    "プロテイン": { p: 25, c: 3, f: 1, cal: 120 },
    "オートミール": { p: 13.7, c: 69.1, f: 5.7, cal: 380 },
    "鮭": { p: 20, c: 0, f: 4.5, cal: 130 },
    "卵": { p: 12.3, c: 0.3, f: 10.3, cal: 151 }
};

let AppState = {
    history: JSON.parse(localStorage.getItem('combat_history')) || [],
    currentDay: { m: null, p: null, n: null, meals: [], reaction_ms: null },
    nutritionGoals: { cal: 2400, p: 150, c: 300, f: 50, salt: 8, water: 4000 }
};

const todayStr = new Date().toISOString().split('T')[0];
const todayInHist = AppState.history.find(h => h.date === todayStr);
if (todayInHist) AppState.currentDay = JSON.parse(JSON.stringify(todayInHist.inputs));

// --- NEURO TEST ---
window.startReactionTest = function() {
    const box = document.getElementById('reactionTarget');
    const msg = document.getElementById('reactionMsg');
    box.style.background = "#ef4444";
    msg.innerText = "集中せよ... 緑になったら叩け";
    
    let trials = [];
    const runTrial = () => {
        const delay = 1000 + Math.random() * 3000;
        setTimeout(() => {
            box.style.background = "#22c55e";
            const startTime = performance.now();
            box.onclick = () => {
                const endTime = performance.now();
                trials.push(endTime - startTime);
                box.style.background = "#1e293b"; box.onclick = null;
                if (trials.length < 3) {
                    msg.innerText = `${trials.length}/3 完了. 次へ...`;
                    setTimeout(runTrial, 800);
                } else {
                    const avg = trials.reduce((a,b)=>a+b)/3;
                    AppState.currentDay.reaction_ms = Math.round(avg);
                    msg.innerText = `完了！平均: ${Math.round(avg)}ms`;
                    saveData();
                }
            };
        }, delay);
    };
    runTrial();
};

// --- CORE LOGIC ---
function calculateDaysLeft() {
    const diff = MATCH_DATE.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function updateStrategy() {
    const dL = calculateDaysLeft();
    const scores = calculateScores(AppState.currentDay);
    let strategy = "STRENGTHEN";
    AppState.nutritionGoals = { cal: 2400, p: 160, c: 300, f: 50, salt: 8, water: 4000 };

    if (dL === 0) {
        strategy = "MATCH_DAY";
        AppState.nutritionGoals = { cal: 3500, p: 120, c: 600, f: 40, salt: 12, water: 3000 };
    } else if (scores.nerve < 65 || scores.fatigue > 75) {
        strategy = "RECOVERY";
        AppState.nutritionGoals = { cal: 2600, p: 140, c: 450, f: 60, salt: 10, water: 5000 };
    } else if (dL <= 7) {
        strategy = "PEAKING";
        AppState.nutritionGoals = { cal: 1800, p: 180, c: dL <= 3 ? 150 : 250, f: 40, salt: dL <= 3 ? 3 : 6, water: dL > 3 ? 6000 : 2000 };
    }
    return strategy;
}

function calculateScores(day) {
    const { m, p, n, meals, reaction_ms } = day;
    let nerve = ( (parseFloat(p?.p_react) || 80) + (parseFloat(p?.p_focus) || 80) + (parseFloat(m?.m_sleep_qual) || 80) + (parseFloat(n?.n_mental) || 80) ) / 4;
    if (reaction_ms) nerve += Math.max(-30, (250 - reaction_ms) / 5);

    const fatigue = ( (parseFloat(m?.m_fatigue) || 20) + (parseFloat(p?.p_intensity) || 50) ) / 2;
    const totalP = meals.reduce((s, m) => s + (parseFloat(m.p) || 0), 0);
    const totalC = meals.reduce((s, m) => s + (parseFloat(m.c) || 0), 0);
    const mealScore = Math.min(100, ( (totalP / AppState.nutritionGoals.p) * 50 + (totalC / AppState.nutritionGoals.c) * 50 ));
    const weightDiff = Math.abs((parseFloat(n?.n_weight) || parseFloat(m?.m_weight) || 53) - TARGET_WEIGHT);
    const weightScore = Math.max(0, 100 - weightDiff * 20);
    const winProb = (nerve * 0.4) + (mealScore * 0.3) - (fatigue * 0.2) + (weightScore * 0.1);

    return { nerve: Math.round(nerve), fatigue: Math.round(fatigue), winProb: Math.round(winProb), mealScore: Math.round(mealScore) };
}

function saveData() {
    const today = new Date().toISOString().split('T')[0];
    const idx = AppState.history.findIndex(d => d.date === today);
    const dayData = { date: today, inputs: AppState.currentDay, timestamp: Date.now() };
    if (idx >= 0) AppState.history[idx] = dayData;
    else AppState.history.push(dayData);
    localStorage.setItem('combat_history', JSON.stringify(AppState.history));
    updateDashboard();
}

function getSpecificAdvice(scores, dL) {
    if (dL === 0) return ["09:00 リロード開始 (粉飴50g)", "12:00 白米250g+ささみ", "15:00 試合前最終補給 (バナナ)", "17:00 カフェイン200mg"];
    
    const totalP = AppState.currentDay.meals.reduce((s, m) => s + (parseFloat(m.p) || 0), 0);
    const totalC = AppState.currentDay.meals.reduce((s, m) => s + (parseFloat(m.c) || 0), 0);
    const pG = AppState.nutritionGoals.p - totalP;
    const cG = AppState.nutritionGoals.c - totalC;
    
    const advice = [];
    if (pG > 15) advice.push(`鶏むね肉 ${Math.round(pG / 0.23)}g 追加せよ`);
    if (cG > 30) advice.push(`白米 ${Math.round(cG / 0.37)}g 追加せよ`);
    if (scores.nerve < 65) advice.push("BCAA 10g + グルタミン摂取");
    return advice.length > 0 ? advice : ["現状を維持せよ"];
}

// --- DASHBOARD ---
function updateDashboard() {
    const strategy = updateStrategy();
    const scores = calculateScores(AppState.currentDay);
    const dL = calculateDaysLeft();

    // Lockout logic
    if (scores.nerve < 50 || scores.fatigue > 85) {
        document.body.classList.add('forced-mode');
        document.getElementById('dashCommand').innerText = "「禁止：オーバートレーニング停止」";
        document.getElementById('todayStateText').innerText = "STOP TRAINING";
    } else if (scores.nerve < 60) {
        document.body.classList.add('forced-mode');
        document.getElementById('dashCommand').innerText = "「絶対安静：全機能を停止せよ」";
        document.getElementById('todayStateText').innerText = "FORCED RECOVERY";
    } else {
        document.body.classList.remove('forced-mode');
        document.getElementById('dashCommand').innerText = scores.winProb > 85 ? "「KOを奪いに行け」" : "「精度を研ぎ澄ませ」";
        document.getElementById('todayStateText').innerText = scores.winProb > 85 ? "ATTACK" : "MAINTAIN";
    }

    document.getElementById('currentDateDisplay').innerText = `${new Date().toLocaleDateString('ja-JP')} [${strategy}]`;
    document.getElementById('daysLeftText').innerText = `${dL} DAYS LEFT`;
    document.getElementById('winProbScore').innerText = scores.winProb;
    document.getElementById('dashReactionValue').innerText = AppState.currentDay.reaction_ms ? `${AppState.currentDay.reaction_ms}ms` : "--";

    const advice = getSpecificAdvice(scores, dL);
    document.getElementById('dashActions').innerHTML = `
        <li class="primary-action-item"><strong>最優先：</strong> ${advice[0]}</li>
        ${advice.slice(1).map(a => `<li>${a}</li>`).join('')}
    `;

    const hist = AppState.history.slice(-3);
    const pred = hist.length >= 3 ? (calculateScores(hist[hist.length-1].inputs).nerve < 65 ? "⚠️ 3日後：神経疲労リスク「大」" : "✅ 3日後：コンディション安定") : "データ蓄積中...";
    document.getElementById('futurePrediction').innerText = pred;

    const tP = AppState.currentDay.meals.reduce((s, m) => s + (parseFloat(m.p) || 0), 0);
    const tC = AppState.currentDay.meals.reduce((s, m) => s + (parseFloat(m.c) || 0), 0);
    const kcal = AppState.currentDay.meals.reduce((s, m) => s + (m.cal || 0), 0);
    document.getElementById('dashNutritionSummary').innerHTML = `
        <div class="mini-nutri">P: ${Math.round(tP)}g</div>
        <div class="mini-nutri">C: ${Math.round(tC)}g</div>
        <div class="mini-nutri">CAL: ${Math.round(kcal)}</div>
    `;

    updateMealUI();
    if (AppState.history.length > 0) renderCharts();
}

function updateMealUI() {
    const list = document.getElementById('mealLogList');
    if (!list) return;
    list.innerHTML = AppState.currentDay.meals.map((m, i) => `
        <div class="glass-panel text-center mb-1">
            <strong>${m.type} (${m.weight}g)</strong><br>
            <span>P:${m.p} C:${m.c} F:${m.f} | ${m.cal}kcal</span>
            <button onclick="deleteMeal(${i})" style="color:var(--accent-red); background:none; border:none; margin-left:10px;">消去</button>
        </div>
    `).join('');
}

window.addDetailedMeal = function(e) {
    e.preventDefault();
    const f = e.target;
    const type = f.meal_type.value;
    const w = parseFloat(f.meal_weight.value) || 100;
    let p=0, c=0, f_nutri=0, cal=0;
    if (PRESETS[type]) {
        const fac = w/100;
        p = PRESETS[type].p * fac; c = PRESETS[type].c * fac; f_nutri = PRESETS[type].f * fac; cal = PRESETS[type].cal * fac;
    } else {
        p = parseFloat(f.meal_p.value); c = parseFloat(f.meal_c.value); f_nutri = parseFloat(f.meal_f.value); cal = (p*4)+(c*4)+(f_nutri*9);
    }
    AppState.currentDay.meals.push({ type, weight: w, p: p.toFixed(1), c: c.toFixed(1), f: f_nutri.toFixed(1), cal: Math.round(cal) });
    saveData(); f.reset();
};

window.deleteMeal = function(i) { AppState.currentDay.meals.splice(i, 1); saveData(); };

// --- CHARTS ---
let trendChart = null;
function renderCharts() {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const hist = AppState.history.slice(-7);
    const labels = hist.map(h => h.date.split('-')[2]);
    const winScores = hist.map(h => calculateScores(h.inputs).winProb);
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets: [{ label: '勝率', data: winScores, borderColor: '#0ea5e9', tension: 0.4, fill: true, backgroundColor: 'rgba(14, 165, 233, 0.1)' }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
    });
}

// --- EVENTS ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const scores = calculateScores(AppState.currentDay);
        if ((scores.nerve < 60 || scores.fatigue > 85) && item.getAttribute('data-tab') !== 'dashboard') {
            alert("制限モード：ホーム画面以外は利用できません。"); return;
        }
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const tab = item.getAttribute('data-tab');
        document.getElementById(`tab-${tab}`).classList.add('active');
        item.classList.add('active');
    });
});

document.getElementById('formMorning').addEventListener('submit', (e) => {
    e.preventDefault();
    AppState.currentDay.m = Object.fromEntries(new FormData(e.target));
    saveData();
    document.querySelector('[data-tab="meal"]').click();
});

document.getElementById('formPractice').addEventListener('submit', (e) => {
    e.preventDefault();
    AppState.currentDay.p = Object.fromEntries(new FormData(e.target));
    saveData();
    alert("練習記録を保存しました");
});

document.getElementById('formNight').addEventListener('submit', (e) => {
    e.preventDefault();
    AppState.currentDay.n = Object.fromEntries(new FormData(e.target));
    saveData();
    document.querySelector('[data-tab="dashboard"]').click();
});

document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (confirm("全てのデータをリセットしますか？")) {
        localStorage.removeItem('combat_history');
        location.reload();
    }
});

lucide.createIcons();
updateDashboard();
if (AppState.history.length > 0) renderCharts();
