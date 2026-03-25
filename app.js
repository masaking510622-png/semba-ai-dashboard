// COMBAT SYSTEM v4.0 (WORLD CHAMPION ENGINE)
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
    "卵": { p: 12.3, c: 0.3, f: 10.3, cal: 151 },
    "アボカド": { p: 2.5, c: 6.2, f: 18.7, cal: 187 }
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
        const delay = 1500 + Math.random() * 3000;
        setTimeout(() => {
            box.style.background = "#22c55e";
            const startTime = performance.now();
            box.onclick = () => {
                const endTime = performance.now();
                const diff = endTime - startTime;
                trials.push(diff);
                box.style.background = "#1e293b";
                box.onclick = null;
                if (trials.length < 3) {
                    msg.innerText = `Trial ${trials.length}/3: ${Math.round(diff)}ms. 次へ...`;
                    setTimeout(runTrial, 1000);
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

// --- STRATEGY MANAGER ---
function updateStrategy() {
    const daysLeft = calculateDaysLeft();
    const scores = calculateScores(AppState.currentDay);
    
    // Default: STRENGTHEN
    let strategy = "STRENGTHEN";
    AppState.nutritionGoals = { cal: 2400, p: 160, c: 300, f: 50, salt: 8, water: 4000 };

    if (daysLeft === 0) {
        strategy = "MATCH_DAY";
        AppState.nutritionGoals = { cal: 3500, p: 120, c: 600, f: 40, salt: 12, water: 3000 };
    } else if (scores.nerve < 65 || scores.fatigue > 75) {
        strategy = "RECOVERY";
        AppState.nutritionGoals = { cal: 2600, p: 140, c: 450, f: 60, salt: 10, water: 5000 };
    } else if (daysLeft <= 7) {
        strategy = "PEAKING";
        const carb = daysLeft <= 3 ? 150 : 250;
        AppState.nutritionGoals = { cal: 1800, p: 180, c: carb, f: 40, salt: daysLeft <= 3 ? 3 : 6, water: daysLeft > 3 ? 6000 : 2000 };
    }
    return strategy;
}

// --- CORE UTILS ---
function getTodayStr() { return new Date().toISOString().split('T')[0]; }
function calculateDaysLeft() {
    const diff = MATCH_DATE.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function saveData() {
    const today = getTodayStr();
    const existingIdx = AppState.history.findIndex(d => d.date === today);
    const dayData = { date: today, inputs: AppState.currentDay, timestamp: Date.now() };
    if (existingIdx >= 0) AppState.history[existingIdx] = dayData;
    else AppState.history.push(dayData);
    localStorage.setItem('combat_history', JSON.stringify(AppState.history));
    updateDashboard();
}

function calculateScores(dayInputs) {
    const { m, p, n, meals, reaction_ms } = dayInputs;
    const m_w = parseFloat(m?.m_weight) || 0;
    
    // Neuro Score with Reaction integration
    let nerve = ( (parseFloat(p?.p_react) || 80) + (parseFloat(p?.p_focus) || 80) + (parseFloat(m?.m_sleep_qual) || 80) + (parseFloat(n?.n_mental) || 80) ) / 4;
    if (reaction_ms) {
        const reactBonus = Math.max(-30, (250 - reaction_ms) / 5);
        nerve += reactBonus;
    }

    const fatigue = ( (parseFloat(m?.m_fatigue) || 20) + (parseFloat(p?.p_intensity) || 50) + (parseFloat(m?.m_muscle) || 20) ) / 3;
    const totalP = meals.reduce((sum, meal) => sum + (parseFloat(meal.p) || 0), 0);
    const totalC = meals.reduce((sum, meal) => sum + (parseFloat(meal.c) || 0), 0);
    const mealScore = Math.min(100, ( (totalP / AppState.nutritionGoals.p) * 50 + (totalC / AppState.nutritionGoals.c) * 50 ));
    const weightDiff = Math.abs((parseFloat(n?.n_weight) || m_w) - TARGET_WEIGHT);
    const weightScore = Math.max(0, 100 - weightDiff * 15);
    const winProb = (nerve * 0.4) + ( ( ( (parseFloat(m?.m_sleep_time||8)/8*100) + mealScore ) /2 ) * 0.3) - (fatigue * 0.2) + (weightScore * 0.1);

    return { nerve: Math.round(nerve), fatigue: Math.round(fatigue), winProb: Math.round(winProb), mealScore: Math.round(mealScore) };
}

// --- ACTION ENGINE ---
function getDietaryAdvice(scores) {
    const totalP = AppState.currentDay.meals.reduce((sum, m) => sum + (parseFloat(m.p) || 0), 0);
    const totalC = AppState.currentDay.meals.reduce((sum, m) => sum + (parseFloat(m.c) || 0), 0);
    const pGap = AppState.nutritionGoals.p - totalP;
    const cGap = AppState.nutritionGoals.c - totalC;
    
    const actions = [];
    if (pGap > 15) actions.push(`鶏むね肉 ${Math.round(pGap / 0.23)}g 追加せよ`);
    if (cGap > 30) actions.push(`白米 ${Math.round(cGap / 0.37)}g 追加せよ`);
    if (AppState.currentDay.p?.p_intensity > 80) actions.push("電解質補給：ナトリウム 2g (塩 5g) 追加");
    
    return actions;
}

function getMatchDayPlan() {
    return [
        "07:00: 起床・計量最終確認",
        "09:00: リロード開始（マルトデキストリン 50g）",
        "12:00: 白米250g + 鶏ささみ100g",
        "15:00: 試合3時間前：バナナ + OS-1 500ml",
        "17:00: 神経活性：カフェイン 200mg 摂取"
    ];
}

// --- DASHBOARD UPDATE ---
function updateDashboard() {
    const strategy = updateStrategy();
    const scores = calculateScores(AppState.currentDay);
    const daysLeft = calculateDaysLeft();

    // OVERTRAINING LOCKOUT
    if (scores.nerve < 50 || scores.fatigue > 85) {
        document.body.classList.add('forced-mode');
        document.getElementById('dashCommand').innerText = "「禁止：オーバートレーニング停止」";
        document.getElementById('todayStateText').innerText = "STOP TRAINING (EMERGENCY)";
    } else if (scores.nerve < 65) {
        document.body.classList.add('forced-mode');
        document.getElementById('dashCommand').innerText = "「絶対安静：全機能を停止せよ」";
    } else {
        document.body.classList.remove('forced-mode');
        document.getElementById('todayStateText').innerText = scores.winProb > 85 ? "ATTACK" : "MAINTAIN";
        document.getElementById('dashCommand').innerText = scores.winProb > 85 ? "「KOを奪いに行け」" : "「精度を研ぎ澄ませ」";
    }

    document.getElementById('currentDateDisplay').innerText = `${new Date().toLocaleDateString('ja-JP')} [${strategy}]`;
    document.getElementById('daysLeftText').innerText = `${daysLeft} DAYS LEFT`;
    document.getElementById('winProbScore').innerText = scores.winProb;

    // One Action
    const dActions = getDietaryAdvice(scores);
    const mPlan = (daysLeft === 0) ? getMatchDayPlan() : dActions;
    document.getElementById('dashActions').innerHTML = `
        <li class="primary-action-item"><strong>最優先：</strong> ${mPlan[0]}</li>
        ${mPlan.slice(1).map(a => `<li>${a}</li>`).join('')}
    `;

    // 3-Day Forecast
    const hist = AppState.history.slice(-3);
    const predMsg = hist.length >= 3 ? ( (calculateScores(hist[2].inputs).nerve < 65) ? "⚠️ 3日後：神経疲労ピーク。怪我リスク「極大」" : "✅ 3日後：コンディション安定予測" ) : "データ蓄積中...";
    document.getElementById('futurePrediction').innerHTML = `<div style="font-size:0.8rem; opacity:0.8;">3日予測</div><div>${predMsg}</div>`;

    // Update Reaction UI
    const reactEl = document.getElementById('dashReactionValue');
    if (reactEl) reactEl.innerText = AppState.currentDay.reaction_ms ? `${AppState.currentDay.reaction_ms}ms` : "--";

    updateMealUI();
    if (AppState.history.length > 0) renderCharts();
}

function updateMealUI() {
    const listEl = document.getElementById('mealLogList');
    if (!listEl) return;
    listEl.innerHTML = AppState.currentDay.meals.map((m, idx) => `
        <div class="meal-item glass-panel">
            <div class="meal-info">
                <strong>${m.type} (${m.weight || 0}g)</strong><br>
                <span>P:${m.p} C:${m.c} F:${m.f} | ${m.cal}kcal</span>
            </div>
            <button class="delete-meal" onclick="deleteMeal(${idx})"><i data-lucide="x-circle"></i></button>
        </div>
    `).join('');
    lucide.createIcons();
    const scores = calculateScores(AppState.currentDay);
    document.getElementById('mealTotalScore').innerText = scores.mealScore;
    
    // Detailed Dietary Action List
    const actions = getSpecificDietaryActions();
    document.getElementById('mealAdviceList').innerHTML = actions.map(a => `<div class="advice-card">${a}</div>`).join('');
}

window.addDetailedMeal = function(e) {
    if (e) e.preventDefault();
    const form = e.target;
    const name = form.meal_type.value;
    const weight = parseFloat(form.meal_weight?.value) || 100;
    if (!name) { alert("食事内容を入力してください"); return; }
    let p=0, c=0, f=0, cal=0;
    if (PRESETS[name]) {
        const factor = weight / 100;
        p = PRESETS[name].p * factor;
        c = PRESETS[name].c * factor;
        f = PRESETS[name].f * factor;
        cal = PRESETS[name].cal * factor;
    } else {
        p = parseFloat(form.meal_p.value) || 0;
        c = parseFloat(form.meal_c.value) || 0;
        f = parseFloat(form.meal_f.value) || 0;
        cal = (p * 4) + (c * 4) + (f * 9);
    }
    const meal = { type: name, weight, p:p.toFixed(1), c:c.toFixed(1), f:f.toFixed(1), cal: Math.round(cal), timestamp: Date.now() };
    AppState.currentDay.meals.push(meal);
    saveData();
    form.reset();
};

window.deleteMeal = function(idx) {
    AppState.currentDay.meals.splice(idx, 1);
    saveData();
};

let trendChart = null;
function renderCharts() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    const hist = AppState.history.slice(-7);
    const labels = hist.map(h => h.date.split('-')[2]);
    const winScores = hist.map(h => calculateScores(h.inputs).winProb);
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: '勝率', data: winScores, borderColor: '#0ea5e9', tension: 0.4, fill: true, backgroundColor: 'rgba(14, 165, 233, 0.1)' }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
    });
}

// --- INITIALIZATION & EVENTS ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const scores = calculateScores(AppState.currentDay);
        if (scores.nerve < 60 && item.getAttribute('data-tab') !== 'dashboard') {
            alert("強制回復モード：許可されたアクションのみ実行可能です。"); return;
        }
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        const tab = item.getAttribute('data-tab');
        document.getElementById(`tab-${tab}`).classList.add('active');
        item.classList.add('active');
        window.scrollTo(0,0);
    });
});

document.getElementById('formMorning').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    if (!data.m_weight) { alert("体重を入力してください"); return; }
    AppState.currentDay.m = data;
    saveData();
    document.querySelector('[data-tab="meal"]').click();
});

document.getElementById('formPractice').addEventListener('submit', (e) => {
    e.preventDefault();
    AppState.currentDay.p = Object.fromEntries(new FormData(e.target));
    saveData();
    document.querySelector('[data-tab="analysis"]').click();
});

document.getElementById('formNight')?.addEventListener('submit', (e) => {
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

// Mock Vision
window.mockAnalyze = function(type) {
    const outputs = {
        meal: "【解析結果】高タンパク・中炭水化物。理想的だが塩分がやや高い可能性あり。水分を多めに摂取せよ。",
        body: "【解析結果】腹筋のカット良好。むくみ無し。ピーキング順調。",
        video: "【解析結果】反応速度0.23s。キレ良好。"
    };
    alert(outputs[type] || "解析完了");
};

// Start
lucide.createIcons();
updateDashboard();
if (AppState.history.length > 0) renderCharts();

