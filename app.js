// MASAKI SEMBA PERFORMANCE AI - COMBAT SYSTEM v2.0
// ----------------------------------------------------

const MATCH_DATE = new Date("2026-04-25T00:00:00+09:00");
const TARGET_WEIGHT = 53.0;

// State Management
let AppState = {
    history: JSON.parse(localStorage.getItem('semba_ai_history')) || [],
    currentDay: {
        m: null, // morning
        p: null, // practice
        n: null  // night
    }
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
    
    // Sort by date
    AppState.history.sort((a,b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('semba_ai_history', JSON.stringify(AppState.history));
    
    updateDashboard();
}

// --- SCORING ENGINE ---
function calculateScores(dayInputs) {
    const { m, p, n } = dayInputs;
    if (!m || !p || !n) return null;

    // 0-100 logic
    const nerve = (parseInt(p.p_react) + parseInt(p.p_focus) + parseInt(m.m_sleep_qual) + parseInt(n.n_mental)) / 4;
    const muscle = (parseInt(m.m_muscle) + parseInt(p.p_intensity)) / 2;
    const cardio = (parseInt(m.m_hr > 60 ? 100 : m.m_hr * 1.5) + parseInt(p.p_breath)) / 2; // HR simple proxy
    const fatigue = (parseInt(m.m_fatigue) + muscle + cardio) / 3;
    const recovery = (Math.min(100, (m.m_sleep_time / 8) * 100) + parseInt(m.m_sleep_qual) + parseInt(n.n_food)) / 3;
    
    // Weight Stability (diff from target)
    const weightDiff = Math.abs(parseFloat(n.n_weight) - TARGET_WEIGHT);
    const weightScore = Math.max(0, 100 - weightDiff * 10);

    const winProb = (nerve * 0.4) + (recovery * 0.3) - (fatigue * 0.2) + (weightScore * 0.1);

    return { nerve, fatigue, recovery, weightScore, winProb: Math.round(winProb) };
}

// --- TREND ANALYSIS ---
function getTrend() {
    const hist = AppState.history;
    if (hist.length < 2) return null;
    
    const last2 = hist.slice(-2).map(h => calculateScores(h.inputs)).filter(s => s !== null);
    if (last2.length < 2) return null;

    return {
        nerveDiff: last2[1].nerve - last2[0].nerve,
        fatigueDiff: last2[1].fatigue - last2[0].fatigue,
        weightDiff: parseFloat(hist[hist.length-1].inputs.n.n_weight) - parseFloat(hist[hist.length-2].inputs.n.n_weight)
    };
}

// --- DECISION ENGINE ---
function getDecision(scores, trend, daysLeft) {
    if (!scores) return { state: "WAITING", command: "INPUT DATA" };

    let state = "MAINTAIN (維持)";
    let command = "「質を研ぎ澄ませ」";
    let redFlag = false;
    let redFlagMsg = "";

    // Red Flags
    if (scores.nerve < 60) {
        state = "RECOVER (回復)";
        command = "「全感覚をオフにせよ」";
    }
    
    if (scores.winProb < 50 || scores.nerve < 50) {
        state = "FORCED RECOVERY (強制回復)";
        command = "「動くな。絶対命令だ」";
        redFlag = true;
        redFlagMsg = "神経系崩壊リスク検知";
    }

    if (scores.nerve > 75 && scores.fatigue < 40 && !redFlag) {
        state = "ATTACK (攻め)";
        command = "「限界を塗り替えろ」";
    }

    if (daysLeft <= 6 && scores.fatigue > 30) {
        state = "RECOVER (回復)";
        command = "「疲労を削ぎ落とせ」";
    }

    return { state, command, redFlag, redFlagMsg };
}

// --- NUTRITION ENGINE ---
function getNutrition(scores, trend, daysLeft) {
    let cal = 2400, p = 150, c = 300, f = 50, water = 4000, salt = 8;
    
    if (daysLeft < 14) {
        cal = 2000; c = 200; f = 40; water = 5000; salt = 10; // Water loading phase
    }
    
    if (scores && scores.fatigue > 60) {
        c += 50; // Add carbs for recovery
    }

    if (trend && trend.weightDiff > 0.5) {
        cal -= 200; c -= 50; // Cut if weight spikes
    }

    if (daysLeft === 1) {
        cal = 1200; c = 50; p = 120; water = 1000; salt = 2; // Weight cut peak
    }

    return { cal, p, c, f, water, salt };
}

// --- VISUALIZATION ---
let trendChart = null;
function renderCharts() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    const hist = AppState.history.slice(-14); // Last 14 days
    const labels = hist.map(h => h.date.split('-').slice(1).join('/'));
    const winScores = hist.map(h => calculateScores(h.inputs)?.winProb || 0);
    const nerveScores = hist.map(h => calculateScores(h.inputs)?.nerve || 0);

    if (trendChart) trendChart.destroy();
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '勝率',
                    data: winScores,
                    borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: '神経',
                    data: nerveScores,
                    borderColor: '#ef4444',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// --- UI UPDATES ---
function updateDashboard() {
    const daysLeft = calculateDaysLeft();
    const phase = determinePhase(daysLeft);
    const todayData = AppState.history.find(d => d.date === getTodayStr());
    
    document.getElementById('currentDateDisplay').innerText = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    document.getElementById('currentPhaseText').innerText = phase;

    const trend = getTrend();
    
    if (!todayData || !todayData.inputs.n) {
        document.getElementById('winProbScore').innerText = "--";
        document.getElementById('todayStateText').innerText = "データ入力待ち";
        if (trend) document.getElementById('learningInsight').innerText = `過去データ検知: ${AppState.history.length}日分。本日の夜データを入力してください。`;
        return;
    }

    const scores = trend.latest;
    const decision = getDecision(scores, trend, daysLeft);
    const nutrition = getNutrition(scores, trend, daysLeft);

    // Score
    document.getElementById('winProbScore').innerText = scores.winProb;
    
    // Decision
    document.getElementById('todayStateText').innerText = decision.state;
    document.getElementById('dashCommand').innerText = decision.command;
    
    // Red Flag
    const redFlagEl = document.getElementById('redFlagArea');
    if (decision.redFlag) {
        redFlagEl.classList.remove('hidden');
        document.getElementById('redFlagText').innerText = decision.redFlagMsg;
    } else {
        redFlagEl.classList.add('hidden');
    }

    // Actions & Prohibited
    let actions = ["フォームの微調整", "睡眠9時間確保"];
    let prohibited = "不要な外出、無目的のスマホ作業";
    
    if (decision.state.includes("ATTACK")) {
        actions = ["高強度スパーリング実行可能", "VO2Max刺激トレーニング", "神経系を叩く爆発的動作"];
        prohibited = "練習中の集中力欠如、妥協";
    } else if (decision.state.includes("RECOVER")) {
        actions = ["アクティブリカバリー(20分散歩)", "入浴・マッサージ", "CBD等での神経リラックス"];
        prohibited = "高強度トレーニング、夜更かし、カフェイン過剰摂取";
    } else if (decision.state.includes("FORCED")) {
        actions = ["完全休養", "軽めのストレッチのみ", "デジタルデトックス"];
        prohibited = "あらゆる練習、SNSチェック、遅い食事";
    }

    document.getElementById('dashActions').innerHTML = actions.map(a => `<li>${a}</li>`).join('');
    document.getElementById('dashProhibited').innerText = prohibited;

    // Nutrition
    document.getElementById('dashNutrition').innerHTML = `
        <div class="nutri-box"><span>CALORIES</span><strong>${nutrition.cal}</strong></div>
        <div class="nutri-box"><span>PROTEIN</span><strong>${nutrition.p}g</strong></div>
        <div class="nutri-box"><span>CARBS</span><strong>${nutrition.c}g</strong></div>
        <div class="nutri-box"><span>FAT</span><strong>${nutrition.f}g</strong></div>
        <div class="nutri-box"><span>WATER</span><strong>${nutrition.water}ml</strong></div>
        <div class="nutri-box"><span>SALT</span><strong>${nutrition.salt}g</strong></div>
    `;

    // History Tab Insights
    document.getElementById('learningInsight').innerHTML = `
        3日平均勝率: ${trend.avg3}% | 7日平均勝率: ${trend.avg7}% | 神経前日差: ${trend.nerveDrift > 0 ? '+' : ''}${trend.nerveDrift}
    `;

    renderCharts();

    updatePeakingView(daysLeft, scores);

    if (phase === "MATCH DAY") {
        updateMatchDayView();
    }
}

function updatePeakingView(daysLeft, scores) {
    if (daysLeft > 7) {
        document.getElementById('peakingContent').innerHTML = "<p class='text-muted'>ピーキング期間外です（試合7日前から開始）</p>";
        return;
    }
    
    let volume = "100%";
    if (daysLeft <= 7) volume = "70%";
    if (daysLeft <= 4) volume = "50%";
    if (daysLeft <= 2) volume = "20%";
    
    // If high fatigue, reduce further
    if (scores && scores.fatigue > 50) volume = (parseInt(volume) - 20) + "%";

    const content = `
        <div class="peaking-stats">
            <div class="glass-panel mb-3 border">
                <h3>現在の練習量制限</h3>
                <div class="big-text text-blue">${volume}</div>
                <p class="mt-3">※強度は落とさず、セット数や時間を削減せよ。</p>
            </div>
            <div class="glass-panel border">
                <h3>ピーキング・チェックリスト</h3>
                <ul class="action-list">
                    <li>ビタミンC/Eの積極摂取</li>
                    <li>交代浴による血流促進</li>
                    <li>20時以降のデジタルデトックス</li>
                    <li>イメージトレーニング（1RKOシーンの反復）</li>
                </ul>
            </div>
        </div>
    `;
    document.getElementById('peakingContent').innerHTML = content;
}


function updateMatchDayView() {
    const content = `
        <div class="match-instructions">
            <h3>② 最優先事項</h3>
            <p class="ultimate-command bg-red">「後は倒すだけだ」</p>
            <ul class="action-list mt-3">
                <li>アップ開始: 試合2時間前</li>
                <li>水分: 200mlずつ30分おき</li>
                <li>呼吸をコントロールし、ゾーンに入れ</li>
            </ul>
        </div>
    `;
    document.getElementById('matchDayContent').innerHTML = content;
}

// --- EVENT HANDLERS ---
document.querySelectorAll('.nav-menu li').forEach(li => {
    li.addEventListener('click', () => {
        const tab = li.getAttribute('data-tab');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-menu li').forEach(i => i.classList.remove('active'));
        
        document.getElementById(`tab-${tab}`).classList.add('active');
        li.classList.add('active');
        document.getElementById('viewTitle').innerText = li.innerText;
    });
});

document.getElementById('formMorning').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    AppState.currentDay.m = Object.fromEntries(formData);
    // Auto-switch to next tab for speed
    document.querySelector('[data-tab="practice"]').click();
});

document.getElementById('formPractice').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    AppState.currentDay.p = Object.fromEntries(formData);
    document.querySelector('[data-tab="night"]').click();
});

document.getElementById('formNight').addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    AppState.currentDay.n = Object.fromEntries(formData);
    saveData();
    document.querySelector('[data-tab="dashboard"]').click();
});

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

