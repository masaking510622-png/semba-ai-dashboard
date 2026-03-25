// api.js
import axios from 'axios';

const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY"; // Secure this in production

export const analyzeMealImage = async (base64Image) => {
  const payload = {
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "この食事画像を解析し、以下のJSON形式で返してください: { 'food': '料理名', 'p': 0, 'f': 0, 'c': 0, 'salt': 0, 'cal': 0, 'weight': 0 }. 重量(g)も推定してください。" },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
        ]
      }
    ],
    response_format: { type: "json_object" }
  };

  const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
  });
  return JSON.parse(response.data.choices[0].message.content);
};

export const getDecisionEngineAdvice = async (context) => {
  const { p, f, c, goals, rules, feedback } = context;
  const remP = Math.max(0, goals.p - p);
  const remF = Math.max(0, goals.f - f);
  const remC = Math.max(0, goals.c - c);

  const prompt = `
    あなたはプロ格闘家のパフォーマンスエージェントです。
    本日の総摂取: P:${p}g, F:${f}g, C:${c}g
    本日残り目標: P:${remP}g, F:${remF}g, C:${remC}g
    
    【禁止ルール(緊急)】
    ${rules && rules.length > 0 ? rules.join('\n') : "特になし"}
    
    【過去フィードバック】
    ${feedback || "なし"}
    
    【意思決定ルール】
    1. 1日完遂戦略を1つだけ出せ。
    2. 禁止ルールを最優先で遵守せよ。
    3. 過去にパフォーマンスが良かったパターンを優先、悪かったパターンを回避せよ。
    
    【フォーマット】
    【評価】(現状)
    【問題】(ボトルネック)
    【今日の行動】(21時まで等の時間軸を含む完遂プラン 1つ)
  `;

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: "gpt-4o",
    messages: [{ role: "system", content: "You are a total-performance AI agent." }, { role: "user", content: prompt }]
  }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });

  return response.data.choices[0].message.content;
};

export const getRecoveryAdvice = async (failedAction, context) => {
  const prompt = `
    以下の行動プランが未遂に終わりました: "${failedAction}"
    現在の残り目標: P:${context.goals.p - context.p}g, F:${context.goals.f - context.f}g
    
    今日を救うための「5分以内に実行可能な強制リカバリ行動」を1つだけ提示せよ。
    
    【強制リカバリ】
    (例: 5分以内にプロテイン20g摂取しろ。等。具体的かつ即実行可能なこと)
  `;

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }]
  }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
  return response.data.choices[0].message.content;
};
