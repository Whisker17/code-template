// Research fork: the labels the research template and its components show (reading paths, figure captions, prerequisite and
// finding cards), keyed by language id like the files in this directory. A language without an entry shows English.
// Kept in one fork-owned file so the upstream language files stay as they are.
const LABELS = {
  zh: {
    paths: { label: '阅读路径', short: '5 分钟 · 总览', medium: '30 分钟 · + 背景与发现', deep: '完整' },
    overview: '总览',
    fig: { n: '图 {n}', q: '问：', read: '读法：', takeaway: '要点：', pending: '图形渲染中…（离线查看前需运行 am bake）' },
    prereq: { what: '是什么', why: '为什么这里需要', example: '最小例子', misconception: '常见误解', deeper: '深入', needs: '依赖' },
    finding: { claim: '论断', evidence: '证据', implication: '影响', confidence: '置信度' },
  },
  'zh-Hant': {
    paths: { label: '閱讀路徑', short: '5 分鐘 · 總覽', medium: '30 分鐘 · + 背景與發現', deep: '完整' },
    overview: '總覽',
    fig: { n: '圖 {n}', q: '問：', read: '讀法：', takeaway: '要點：', pending: '圖形繪製中…（離線查看前需執行 am bake）' },
    prereq: { what: '是什麼', why: '為什麼這裡需要', example: '最小例子', misconception: '常見誤解', deeper: '深入', needs: '依賴' },
    finding: { claim: '論斷', evidence: '證據', implication: '影響', confidence: '信心度' },
  },
  en: {
    paths: { label: 'Reading path', short: '5 min · overview', medium: '30 min · + background + findings', deep: 'Deep · everything' },
    overview: 'Overview',
    fig: { n: 'Fig {n}', q: 'Q: ', read: 'Read: ', takeaway: 'Takeaway: ', pending: 'Drawing… (run am bake for an offline copy)' },
    prereq: { what: 'What it is', why: 'Why it matters here', example: 'Minimal example', misconception: 'Common misconception', deeper: 'Go deeper', needs: 'Needs' },
    finding: { claim: 'Claim', evidence: 'Evidence', implication: 'Implication', confidence: 'confidence' },
  },
  ja: {
    paths: { label: '読み方', short: '5 分 · 概要', medium: '30 分 · + 背景と発見', deep: 'すべて' },
    overview: '概要',
    fig: { n: '図 {n}', q: '問い：', read: '読み方：', takeaway: '要点：', pending: '図を描画中…（オフラインで見るには am bake を実行）' },
    prereq: { what: 'これは何か', why: 'ここで必要な理由', example: '最小の例', misconception: 'よくある誤解', deeper: 'さらに詳しく', needs: '前提' },
    finding: { claim: '主張', evidence: '根拠', implication: '影響', confidence: '確度' },
  },
  he: {
    paths: { label: 'מסלול קריאה', short: '5 דקות · סקירה', medium: '30 דקות · + רקע וממצאים', deep: 'הכול' },
    overview: 'סקירה',
    fig: { n: 'איור {n}', q: 'שאלה: ', read: 'איך לקרוא: ', takeaway: 'השורה התחתונה: ', pending: 'מצייר… (הריצו am bake לעותק לא מקוון)' },
    prereq: { what: 'מה זה', why: 'למה זה חשוב כאן', example: 'דוגמה מינימלית', misconception: 'טעות נפוצה', deeper: 'להעמקה', needs: 'דורש' },
    finding: { claim: 'טענה', evidence: 'ראיות', implication: 'השלכה', confidence: 'ודאות' },
  },
};

export const researchLabels = (id) => LABELS[id] ?? LABELS.en;
export const researchLabelIds = () => Object.keys(LABELS);
