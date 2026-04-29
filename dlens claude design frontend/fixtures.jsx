// ── Fixture Data for DLens Prototype ──

const FIXTURES = {
  folder: '航班觀察',

  // ── Topic Mode ──
  topic: {
    name: '香港航班調整反應',
    badge: '觀察',
    signals: 12,
    pairs: 3,
    updatedAgo: '更新 8 分鐘前',
    scoreLabel: '值得回應',
    score: 8.0,
    scoreReason: '航班調整已持續影響商務客行程安排與信任，透明且及時的溝通可降低不確定性。',
    suggestion: '整理一則回應航班安排透明度的帖文',
    clusters: [
      { icon: '⚠️', label: '重複關切', desc: '調整通知太晚、資訊不一致、改期選項不足。', signals: 6 },
      { icon: '⚖️', label: '受眾張力', desc: '商務客重視時間成本；休閒旅客較能接受彈性。', signals: 7 },
      { icon: '🔍', label: '缺乏證據', desc: '缺少官方理由與補償標準，引發不安與負面推測。', signals: 5 },
    ],
    evidenceSnapshot: [
      { source: 'Threads', time: '23m', text: '長榮 5/1 起調整部分台北-東京航班時刻，上午班次減少，改到下午和晚間...', likes: 23, comments: 8, reposts: 2, color: '#1a2332' },
      { source: 'Threads', time: '47m', text: '國泰 5 月起香港-曼谷航班增加一班紅眼航班，對接早上曼谷轉機需求。', likes: 19, comments: 6, reposts: 1, color: '#c2550a' },
      { source: 'Threads', time: '1h', text: 'HK Express 宣佈 6 月起增加香港-大阪航班，票價促銷中，適合暑假出遊。', likes: 15, comments: 4, reposts: 0, color: '#888' },
    ],
    pairPreview: {
      a: { handle: '@skyplanner_hk', time: '2h', text: '航班調整是營運考量，長期可帶來更穩定服務與更準確時刻。', likes: 12, comments: 5, reposts: 0, cluster: '安排資訊 / 時刻調整' },
      b: { handle: '@flyer_not_happy', time: '2h', text: '通知太晚沒有替代方案，行程被打亂還要自己扛損失。', likes: 31, comments: 14, reposts: 3, cluster: '信任質疑 / 溝通不足' },
    },
    collectPost: {
      handle: 'skyliner_77',
      time: '2 小時前',
      platform: 'Threads',
      text: '長榮 5/1 起調整部分台北－東京航班時刻，\n上午班次減少，改到下午和晚間，\n轉機時間變緊，對商務客比較不方便⋯\n\n客服說系統排程調整中，後續可能再微調。',
      likes: 23, comments: 8, reposts: 2,
    },
    inbox: [
      { source: 'Threads', time: '23m', text: '長榮 5/1 起調整部分台北-東京航班時刻，上午班次減少，改到下午和晚間...', tags: ['高相關', '建議主題'], unread: true, handle: 'skyliner_77' },
      { source: 'Threads', time: '47m', text: '國泰 5 月起香港-曼谷航班增加一班紅眼航班，對接早上曼谷轉機需求。', tags: ['中相關', '可建新主題'], unread: false },
      { source: 'Threads', time: '1h', text: 'HK Express 宣佈 6 月起增加香港-大阪航班，票價促銷中，適合暑假出遊。', tags: ['低相關', '可能不需進 topic'], unread: false },
      { source: 'Threads', time: '2h', text: '機場快線將於 5/4-5/10 進行系統維護，預辦登機服務時間將調整。', tags: ['低相關', '可能不需進 topic'], unread: false },
    ],
    inboxPreview: {
      handle: 'skyliner_77',
      time: '2 小時前',
      platform: 'Threads',
      text: '長榮 5/1 起調整部分台北-東京航班時刻，上午班次減少，改到下午和晚間，轉機時間變緊，對商務客比較不方便...\n\n客服說系統排程調整中，後續可能再微調。',
      likes: 23, comments: 8, reposts: 2,
      suggestedTopic: '香港航班調整反應',
    },
    comparePostA: {
      handle: 'skyplanner_hk',
      time: '2 小時前',
      text: '長榮 5/1 起調整部分台北-東京航班時刻，上午班次減少，改到下午和晚上，轉機時間變緊，對商務客比較不方便...',
      status: 'Ready',
      comments: 23,
      cluster: '安排資訊 / 時刻調整',
    },
    comparePostB: {
      handle: 'flyer_not_happy',
      time: '1 小時前',
      text: '通知太晚沒有替代方案，行程被打亂還要自己扛損失。\n對航空公司信任度大幅下降。',
      status: 'Ready',
      comments: 31,
      cluster: '信任質疑 / 溝通不足',
    },
    analysisResult: {
      aiBrief: 82,
      updatedAgo: '更新 6 分鐘前',
      coreConclusion: '信任問題正在蓋過航班安排資訊',
      subtext: 'A 聚焦安排變更，B 將討論推向透明度與補償期待',
      confidence: '中高',
      coverage: '良好',
      basedOn: '依據 12 訊號分析',
      observations: [
        { icon: '💬', title: '質疑信任與動機', desc: '多數回應質疑航空公司動機與資訊透明度。', evidence: ['e1', 'e3', 'e6'] },
        { icon: '💰', title: '補償期待升高', desc: '對改票彈性與補償方案的期待明顯上升。', evidence: ['e2', 'e5', 'e7'] },
        { icon: 'ℹ️', title: '安排資訊被視為次要', desc: '航班調整本身資訊被視為不足且不完整。', evidence: ['e4', 'e8', 'e9'] },
      ],
      postA: { title: 'Post A reading', desc: '提供安排資訊，但未觸及信任疑慮。', cluster: '安排資訊 / 時刻調整' },
      postB: { title: 'Post B reading', desc: '將討論導向透明度質疑與補償期待。', cluster: '信任質疑 / 溝通不足' },
      creatorTip: '回應時先承認資訊不透明，再補充具體改票安排。',
    },
    evidenceDetail: {
      postAHandle: 'skyplanner_hk',
      postATime: '2 小時前',
      postAText: '長榮 5/1 起調整部分台北-東京航班，上午班次減少，改到下午和晚間，轉機時間變緊，對商務客比較不方便...',
      corePoint: '討論核心集中在航班安排資訊是否清楚。',
      mainThread: '航班時間變動與銜接影響',
      emotion: '無奈、擔心行程受影響',
      gap: '缺少改票彈性與補償說明',
      clusters: [
        { name: '安排變更', pct: 42, type: 'dominant' },
        { name: '退款補償', pct: 22, type: 'supporting' },
        { name: '客服回應', pct: 16, type: 'low' },
        { name: '資訊透明', pct: 20, type: 'supporting' },
      ],
      evidence: [
        { id: 'e1', time: '1 小時前', quote: '「改到下午班次，接駁時間變緊，出差行程要重排，訊息也太晚了。」', comments: 18, likes: 42, reposts: 6, analysis: '聚焦航班時間變動與轉機銜接問題，反映商務旅客的主要痛點。', tag: '安排變更' },
        { id: 'e2', time: '55 分鐘前', quote: '「如果能免費改或延後就好了，臨時改真的很麻煩。」', comments: 12, likes: 31, reposts: 3, analysis: '期待改票彈性與費用減免，屬於補償與彈性需求的表達。', tag: '退款補償' },
        { id: 'e3', time: '40 分鐘前', quote: '「打客服超難打，等很久才有人回，也沒明確答覆。」', comments: 9, likes: 21, reposts: 2, analysis: '指向客服可及性與回應品質問題，影響整體信任感。', tag: '客服回應' },
        { id: 'e4', time: '25 分鐘前', quote: '「官網也沒看到完整說明，到底怎麼改、怎算都看不懂。」', comments: 14, likes: 28, reposts: 4, analysis: '資訊揭露不足，導致旅客難以理解改票規則與細節。', tag: '資訊透明' },
      ],
    },
  },

  // ── Product Mode ──
  product: {
    name: 'Apeiron Guard',
    category: 'Travel service',
    audience: '香港旅客',
    collectPost: {
      handle: 'jason.wong.hk',
      time: '2 小時前',
      platform: 'Threads',
      text: '聽說下個月開始，部分航班會臨時更改時間，沒有提前通知⋯ 這樣很影響行程安排，希望航司能提供更透明的資訊。',
      likes: 56, comments: 18, reposts: 6,
      impacts: ['信任', '服務透明度'],
    },
    classification: {
      total: 35,
      categories: [
        { name: '產品改善', count: 12, color: '#4a7c59' },
        { name: '技術討論', count: 9, color: '#2d5a8e' },
        { name: 'PR 反例', count: 5, color: '#c2550a' },
        { name: '競品分析', count: 4, color: '#3b6ea5' },
        { name: '創辦人觀點', count: 3, color: '#5a9a7a' },
        { name: '市場故事', count: 2, color: '#d4903a' },
      ],
      signals: [
        { source: 'Threads', time: '12 分鐘前', text: '每次用 agent 都要重講 repo 規範...', tag: '流程摩擦', icon: '🧵' },
        { source: 'GitHub', time: '28 分鐘前', text: 'permission trace 看不出\n哪個 tool blocked', tag: '可靠測性', icon: '🐙' },
        { source: 'Tech news', time: '45 分鐘前', text: '新工具主打 team context\n但 setup 很重', tag: 'onboarding gap', icon: '📰' },
        { source: 'Founder', time: '1 小時前', text: '團隊 context 比模型\nbenchmark 更影響採用', tag: '產品定位', icon: '👤' },
      ],
      selectedPost: {
        handle: null,
        platform: 'Threads',
        time: '12 分鐘前',
        text: '真正卡住的不是模型能力，\n是它不知道我團隊怎樣定義 done。\ntesting、PR、release convention\n每次都要重講。',
        aiCategory: '產品改善',
        reason: '描述重複設定與 team context 無法保存。',
        relatedTopic: 'Team memory / repo conventions',
        reclassifyOptions: ['產品改善', '技術討論', 'PR 反例', '競品分析', '創辦人觀點', '市場故事'],
      },
    },
    actionableFilter: {
      totalEvaluated: 35,
      stats: [
        { label: '值得嘗試', count: 2, color: '#4a7c59', icon: '✅' },
        { label: '噪音 / 前提不符', count: 20, color: '#888', icon: '⊖' },
        { label: '資料不足', count: 8, color: '#d4903a', icon: '❓' },
        { label: '保留觀察', count: 5, color: '#2d5a8e', icon: '🔖' },
      ],
      items: [
        {
          num: 1,
          title: '改簽提示簡化',
          badge: '值得嘗試',
          source: '來源：3 則用戶抱怨 + 1 則競品比對',
          whyNot: '為什麼不是噪音：你已有航班查詢入口，改簽是下一個自然步驟。',
          canTry: '可以試：在查詢結果頁加一個「需要改簽？」soft CTA。',
          verify: '驗證：點擊率 / 後續查詢行為 / 放棄率',
        },
        {
          num: 2,
          title: '航班延誤預警',
          badge: '值得嘗試',
          source: '來源：5 則情緒訊號（通知延遲的不滿）',
          whyNot: '為什麼不是噪音：香港旅客對即時性期待高，受眾完全符合。',
          canTry: '可以試：延遲通知比官方早 15 分鐘，先做小範圍測試。',
          verify: '驗證：留存 / 重開率 / 投訴下降',
        },
      ],
      noiseExample: { text: 'AI 客服減少 40% 工單', reason: '前提不符：目前產品沒有客服 workflow，和核心入口距離太遠。', note: '不代表內容錯，只是暫時不適合你的產品。' },
      insufficientData: { text: '資料不足', note: '需要更多來源才轉成假設' },
      holdObservation: { count: 5, note: '暫時不轉成兩週實驗' },
    },
    improvementSuggestions: {
      title: '改簽提示簡化',
      tagBadge: '證據鏈',
      support: '3 則支持',
      confidence: '推論信心：中等',
      basedOn: '基於 agent.md 第 2 段',
      signals: [
        {
          handle: 'skyliner_77',
          platform: 'Threads',
          likes: 23,
          quote: '改簽要打電話，app 入面完全搵唔到下一步...',
          whyRelated: '改簽是高頻場景，用戶明確表達痛點。',
          productMatch: '你有航班查詢，但無改簽入口。',
          action: '前提符合',
          actionColor: '#4a7c59',
        },
        {
          handle: 'fly_not_happy',
          platform: 'Threads',
          likes: 41,
          quote: 'XX 航空 app 可以一步改簽，點解其他服務仲要打電話...',
          whyRelated: '競品主打零步驟改簽，直接對比你的空白。',
          productMatch: '競品已教育用戶期待，你目前缺這個流程。',
          action: '競品驗證',
          actionColor: '#4a7c59',
        },
        {
          handle: 'gate_delay',
          platform: 'Threads',
          likes: 18,
          quote: '如果 delay 同改簽提示可以同一頁處理，會少好多焦慮...',
          whyRelated: '痛點同查詢場景相連，不是抽象 AI hype。',
          productMatch: '查詢結果頁是自然入口，可用 soft CTA 驗證需求。',
          action: '可小步測試',
          actionColor: '#d4903a',
        },
      ],
      bottomBar: {
        support: '3 則支持',
        confidence: '推論信心：中等',
        reference: '依據：\nProductProfile + agent.md 第 2 段',
      },
    },
  },

  // ── Library ──
  library: {
    folders: [
      { name: '航班觀察', saved: 42, updated: '更新 8 分鐘前', sources: ['Threads', 'News', '+1'] },
      { name: '品牌回覆素材', saved: 31, updated: '更新 2 天前', sources: ['Threads', 'Web'] },
    ],
    cases: [
      { name: '香港航班調整反應', signals: 12, pairs: 3, updated: '更新 8 分鐘前', selected: true },
      { name: '客服回覆信任危機', signals: 9, pairs: 2, updated: '更新 1 天前' },
    ],
    topics: [
      { name: '資訊透明', captures: 18, tags: ['資訊', '透明度', '航班'] },
      { name: '退款補償', captures: 15, tags: ['補償', '退款', '期待'] },
    ],
    preview: {
      title: '香港航班調整反應',
      type: 'Case',
      signals: 12,
      pairs: 3,
      summary: '集中保存與航班安排變更、透明度、補償期待相關的討論訊號。',
      sources: ['Threads', 'News', 'Web', '+1'],
      lastUpdated: '8 分鐘前',
    },
  },

  // ── Settings ──
  settings: {
    backendUrl: 'http://127.0.0.1:8000',
    aiProvider: 'Google',
    apiKey: '••••••••••••••••••••••••••••••••••••••',
  },
};

window.FIXTURES = FIXTURES;
