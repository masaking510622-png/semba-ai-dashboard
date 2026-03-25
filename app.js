// MASAKI SEMBA PERFORMANCE AI - COMBAT SYSTEM v3.0 (ULTIMATE)
// ----------------------------------------------------

const MATCH_DATE = new Date("2026-04-25T00:00:00+09:00");
const TARGET_WEIGHT = 53.0;

// State Management
let AppState = {
    history: JSON.parse(localStorage.getItem('semba_ai_history')) || [],
    currentDay: {
        m: null, // morning
        p: null, // practice
        n: null, // night
        meals: [] // detailed meals [{type, img, calories, p, c, f, salt, water, timestamp}]
    },
    nutritionGoals: { cal: 2400, p: 150, c: 300, f: 50, salt: 8, water: 4000 }
};

// --- CORE UTILS ---
function getTodayStr() {
    return new Date().toISOString().split('T')[0];
}

function calculateDaysLeft() {
    const diff = MATCH_DATE.getTime() - new Date().getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function determinePhase(daysLeft) {
    if (daysLeft === 0) return "MATCH DAY";
    if (daysLeft <= 6) return "PEAKING";
    if (daysLeft <= 13) return "ADJUSTMENT (調整期)";
    if (daysLeft <= 20) return "STRENGTHEN (強化期)";
    if (daysLeft <= 28) return "BUILD (構築期)";
    return "PRE-BUILD";
}

// --- DATA PERSISTENCE ---
function saveData() {
    const todayStr = getTodayStr();
    const existingIdx = AppState.history.findIndex(d => d.date === todayStr);
    const dayData = {
        date: todayStr,
        inputs: AppState.currentDay,
        timestamp: new Date().getTime()
    };
    
    if (existingIdx >= 0) AppState.history[existingIdx] = dayData;
    else AppState.history.push(dayData);
    
    AppState.history.sort((a,b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('semba_ai_history', JSON.stringify(AppState.history));
    
    updateDashboard();
}

// --- SCORING & PREDICTION ENGINE ---
function calculateScores(dayInputs) {
    const { m, p, n, meals } = dayInputs;
    if (!m) return null;

    // Nerve Score (Neurological focus)
    const nerve = ( (p?.p_react || 80) / 1 + (p?.p_focus || 80) / 1 + (m?.m_sleep_qual || 80) / 1 + (n?.n_mental || 80) / 1) / 4;
    
    // Fatigue Score
    const fatigue = ( (m?.m_fatigue || 20) / 1 + (p?.p_intensity || 50) / 1 + (m?.m_muscle || 20) / 1 ) / 3;

    // Meal Score (0-100)
    let mealScore = 0;
    if (meals && meals.length > 0) {
        const totalP = meals.reduce((sum, meal) => sum + (parseFloat(meal.p) || 0), 0);
        const totalC = meals.reduce((sum, meal) => sum + (parseFloat(meal.c) || 0), 0);
        const pRatio = Math.min(1.2, totalP / AppState.nutritionGoals.p);
        const cRatio = Math.min(1.2, totalC / AppState.nutritionGoals.c);
        mealScore = (pRatio * 50) + (cRatio * 50);
    } else {
        mealScore = n?.n_food || 50;
    }

    // Win Probability %
    const recovery = (Math.min(100, (m.m_sleep_time / 8) * 100) + parseInt(m.m_sleep_qual) + mealScore) / 3;
    const weightDiff = Math.abs(parseFloat(n?.n_weight || m.m_weight) - TARGET_WEIGHT);
    const weightScore = Math.max(0, 100 - weightDiff * 15);
    
    const winProb = (nerve * 0.4) + (recovery * 0.3) - (fatigue * 0.2) + (weightScore * 0.1);

    return { nerve, fatigue, recovery, mealScore, weightScore, winProb: Math.round(winProb) };
}

function predictTomorrow(scores) {
    if (!scores) return "データ不足";
    if (scores.nerve < 65) return "明日：パフォーマンス低下予測。神経系回復を最優先せよ。";
    if (scores.fatigue > 70) return "明日：怪我リスク上昇。強度を30%削減すべき。";
    return "明日：コンディション維持予測。攻めの練習が可能。";
}

// --- DECISION ENGINE ---
function getDecision(scores, daysLeft) {
    if (!scores) return { state: "WAITING", command: "朝データを入力せよ", actions: ["計量機に乗る", "白湯200ml摂取"] };

    if (scores.nerve < 60) {
        return {
            state: "FORCED RECOVERY (強制回復)",
            command: "「絶対安静：動くな」",
            actions: ["消化の良い食事のみ", "20時就寝", "スマホをオフにしろ"],
            isForced: true
        };
    }

    if (daysLeft <= 3 && scores.fatigue > 30) {
        return {
            state: "PEAKING RECOVERY",
            command: "「疲労のミリ単位での削ぎ落とし」",
            actions: ["マッサージ30分", "赤身肉150g", "塩分2g以下に抑制"],
            isForced: false
        };
    }

    if (scores.nerve > 80 && scores.fatigue < 40) {
        return { state: "ATTACK (攻め)", command: "「限界を突破しろ」", actions: ["対人スパー 5R以上", "高強度HIIT実行", "タンパク質+30g追加"], isForced: false };
    }

    return { state: "MAINTAIN (維持)", command: "「精度を研ぎ澄ませ」", actions: ["シャドー 10分", "技術練習中心", "睡眠9時間確保"], isForced: false };
}

// --- NUTRITION LOGIC ---
function getNutritionAdvice(scores, dayInputs) {
    const advice = [];
    const meals = dayInputs.meals || [];
    const totalP = meals.reduce((sum, m) => sum + (parseFloat(m.p) || 0), 0);
    const totalC = meals.reduce((sum, m) => sum + (parseFloat(m.c) || 0), 0);
    const totalW = meals.reduce((sum, m) => sum + (parseFloat(m.water) || 0), 0) + (parseFloat(dayInputs.n?.n_water) || 0);

    if (totalP < AppState.nutritionGoals.p) advice.push(`タンパク質 +${Math.round(AppState.nutritionGoals.p - totalP)}g 不足 (鶏むね肉150g追加せよ)`);
    if (totalC > AppState.nutritionGoals.c + 50) advice.push(`炭水化物 ${Math.round(totalC - AppState.nutritionGoals.c)}g 過多 (白米100g減らせ)`);

    if (scores) {
        if (scores.fatigue > 70) advice.push("疲労高：炭水化物を+50g増やして回復を早めろ");
        if (scores.nerve < 65) advice.push("神経消耗：消化の良い食事とMCTオイルを摂取せよ");
    }

    if (totalW < AppState.nutritionGoals.water) advice.push(`水分 -${Math.round(AppState.nutritionGoals.water - totalW)}ml 不足 (今すぐ500ml飲め)`);

    return advice;
}

// --- UI UPDATES ---
function updateDashboard() {
    const daysLeft = calculateDaysLeft();
    const phase = determinePhase(daysLeft);
    const todayData = AppState.history.find(d => d.date === getTodayStr());
    const dayInputs = todayData ? todayData.inputs : AppState.currentDay;
    
    document.getElementById('currentDateDisplay').innerText = new Date().toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' });
    document.getElementById('currentPhaseText').innerText = phase;
    document.getElementById('daysLeftText').innerText = `${daysLeft} DAYS LEFT`;

    const scores = calculateScores(dayInputs);
    const decision = getDecision(scores, daysLeft);
    
    // Forced Mode UI Handling
    const appBody = document.body;
    if (decision.isForced) {
        appBody.classList.add('forced-mode');
        // Hide other tabs in bottom nav except home/input
        document.querySelectorAll('.nav-item').forEach(el => {
            const tab = el.getAttribute('data-tab');
            if (tab !== 'dashboard' && tab !== 'morning') el.style.display = 'none';
        });
    } else {
        appBody.classList.remove('forced-mode');
        document.querySelectorAll('.nav-item').forEach(el => el.style.display = 'flex');
    }

    if (scores) {
        document.getElementById('winProbScore').innerText = scores.winProb;
        document.getElementById('winProbScore').style.borderColor = scores.winProb > 80 ? 'var(--accent-green)' : (scores.winProb < 60 ? 'var(--accent-red)' : 'var(--accent-blue)');
        
        document.getElementById('todayStateText').innerText = decision.state;
        document.getElementById('dashCommand').innerText = decision.command;
        document.getElementById('dashActions').innerHTML = decision.actions.map(a => `<li>${a}</li>`).join('');
        
        // Prediction
        document.getElementById('futurePrediction').innerText = predictTomorrow(scores);

        // Nutrition Overview (Dash)
        const meals = dayInputs.meals;
        const totalP = meals.reduce((sum, m) => sum + (parseFloat(m.p) || 0), 0);
        const totalC = meals.reduce((sum, m) => sum + (parseFloat(m.c) || 0), 0);
        document.getElementById('dashNutritionSummary').innerHTML = `
            <div class="mini-nutri">P: ${totalP}/${AppState.nutritionGoals.p}g</div>
            <div class="mini-nutri">C: ${totalC}/${AppState.nutritionGoals.c}g</div>
        `;
    }

    // Update Meal Tab
    updateMealTab(dayInputs);
    
    // Charts
    if (AppState.history.length > 0) renderCharts();
}

function updateMealTab(dayInputs) {
    const meals = dayInputs.meals;
    const listEl = document.getElementById('mealLogList');
    if (!listEl) return;

    listEl.innerHTML = meals.map((m, idx) => `
        <div class="meal-item glass-panel">
            <div class="meal-info">
                <strong>${m.type}</strong>
                <span>P:${m.p} C:${m.c} F:${m.f}</span>
            </div>
            <button class="delete-meal" onclick="deleteMeal(${idx})"><i data-lucide="x-circle"></i></button>
        </div>
    `).join('');
    
    const scores = calculateScores(dayInputs);
    const advice = getNutritionAdvice(scores, dayInputs);
    document.getElementById('mealAdviceList').innerHTML = advice.map(a => `<div class="advice-card">${a}</div>`).join('');
    
    const mealScore = scores?.mealScore || 0;
    document.getElementById('mealTotalScore').innerText = mealScore;
    
    lucide.createIcons();
}

window.addDetailedMeal = function(e) {
    e.preventDefault();
    const form = e.target;
    const meal = {
        type: form.meal_type.value || "食事",
        p: form.meal_p.value,
        c: form.meal_c.value,
        f: form.meal_f.value,
        salt: form.meal_salt.value,
        water: form.meal_water.value,
        timestamp: new Date().getTime()
    };
    AppState.currentDay.meals.push(meal);
    saveData();
    form.reset();
};

window.deleteMeal = function(idx) {
    AppState.currentDay.meals.splice(idx, 1);
    saveData();
};

// --- CHARTS ---
let trendChart = null;
function renderCharts() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    const hist = AppState.history.slice(-7);
    const labels = hist.map(h => h.date.split('-')[2]);
    const winScores = hist.map(h => calculateScores(h.inputs)?.winProb || 0);

    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: '勝率',
                data: winScores,
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: { y: { min: 0, max: 100 } }
        }
    });
}

// --- EVENT LISTENERS ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        
        document.getElementById(`tab-${tab}`).classList.add('active');
        item.classList.add('active');
        window.scrollTo(0,0);
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
    document.querySelector('[data-tab="night"]').click();
});

document.getElementById('formNight').addEventListener('submit', (e) => {
    e.preventDefault();
    AppState.currentDay.n = Object.fromEntries(new FormData(e.target));
    saveData();
    document.querySelector('[data-tab="dashboard"]').click();
});

document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (confirm("全データをリセットしますか？")) {
        localStorage.clear();
        location.reload();
    }
});

// Mock Vision
window.mockAnalyze = function(type) {
    const target = type === 'meal' ? 'meal_p' : ''; 
    if(target) document.getElementsByName(target)[0].value = 30; // Mock setting protein
    alert("AI解析完了: P+30g C+40g F+10g を推定入力しました");
};

// Start
lucide.createIcons();
updateDashboard();

document.getElementById('resetDataBtn').addEventListener('click', () => {
    if (confirm("全データを消去しますか？")) {
        localStorage.removeItem('semba_ai_history');
        AppState.history = [];
        location.reload();
    }
});

// --- MOCK VISION AI ---
window.mockAnalyze = function(type) {
    const outputs = {
        meal: "【解析結果】高タンパク・中炭水化物。理想的だが塩分がやや高い可能性あり。水分を多めに摂取せよ。",
        body: "【解析結果】腹筋のカット良好。むくみ無し。ピーキング順調。",
        video: "【解析結果】パンチの引きが0.05秒遅延。神経疲労の兆候あり。本日のインターバルは80%に抑えよ。"
    };
    const target = type === 'meal' ? 'mockMealOut' : (type === 'body' ? 'mockBodyOut' : 'mockVideoOut');
    document.getElementById(target).innerText = outputs[type];
};

// Initialization
lucide.createIcons();
updateDashboard();
if (AppState.history.length > 0) renderCharts();

