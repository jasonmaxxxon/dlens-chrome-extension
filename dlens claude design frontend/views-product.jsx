// ── Product Mode Views ──

function ClassificationView({ onNav }) {
  const cls = FIXTURES.product.classification;
  const [selectedCat, setSelectedCat] = React.useState('產品改善');
  const [selectedSignal, setSelectedSignal] = React.useState(0);

  const maxCount = Math.max(...cls.categories.map(c => c.count));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#1a2332' }}>分類整理</h2>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>AI 已分類 {cls.total} 則 collected posts</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Badge>分類整理</Badge>
          <span style={{ color: '#aaa' }}>›</span>
          <Badge bg="#1a2332" color="#fff" border="none">{selectedCat}</Badge>
        </div>
      </div>

      {/* Category breakdown */}
      <SectionCard style={{ marginBottom: 14, marginTop: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>分類構成</div>
        {cls.categories.map(cat => (
          <div key={cat.name} onClick={() => setSelectedCat(cat.name)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid #f0f0ee' }}>
            <span style={{ color: cat.color, fontSize: 8 }}>●</span>
            <Badge bg={selectedCat === cat.name ? '#f0f0ee' : '#fff'} border="1px solid #ddd">{cat.name}</Badge>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 36 }}>{cat.count} 則</span>
            <div style={{ flex: 1, height: 6, background: '#f0f0ee', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${(cat.count / maxCount) * 100}%`, height: '100%', background: cat.color, borderRadius: 3 }}></div>
            </div>
            <span style={{ color: '#ccc' }}>›</span>
          </div>
        ))}
      </SectionCard>

      <div style={{ display: 'flex', gap: 12 }}>
        {/* Signal list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{selectedCat} · {cls.categories.find(c=>c.name===selectedCat)?.count} 則</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>最新在前 ▼</span>
          </div>
          {cls.signals.map((sig, i) => (
            <Card key={i} onClick={() => setSelectedSignal(i)} style={{
              marginBottom: 6, padding: 10, cursor: 'pointer',
              borderColor: selectedSignal === i ? '#2f4a3a' : '#e5e3d8',
              background: selectedSignal === i ? '#f2f0e7' : '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Badge bg="#fff" border="1px solid #ddd"><span style={{ fontSize: 10 }}>{sig.icon}</span> {sig.source}</Badge>
                <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>{sig.time}</span>
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.5, margin: '4px 0 6px', color: '#333', whiteSpace: 'pre-line' }}>{sig.text}</p>
              <Badge bg="#fef2e8" color="#c2550a" border="1px solid #e8c4a0">{sig.tag}</Badge>
            </Card>
          ))}
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: '#888' }}>
            <TextButton>查看全部 12 則 ▼</TextButton>
          </div>
        </div>

        {/* Selected post detail */}
        <div style={{ width: 280, minWidth: 280 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>選中 post</div>
          <Card style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Threads · {cls.selectedPost.time}</div>
            <SectionCard style={{ padding: 10, marginBottom: 10 }}>
              <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: '#222', whiteSpace: 'pre-line' }}>{cls.selectedPost.text}</p>
            </SectionCard>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: '#888' }}>AI 建議分類</span>
              <Badge bg="#1a2332" color="#fff" border="none" style={{ marginLeft: 8 }}>{cls.selectedPost.aiCategory}</Badge>
            </div>
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>分類原因</span>
              <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>{cls.selectedPost.reason}</p>
            </div>
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>相關 topic</span>
              <Card style={{ padding: 8, marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: 12 }}>{cls.selectedPost.relatedTopic}</span>
                <span style={{ color: '#aaa' }}>›</span>
              </Card>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>改分類</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {cls.selectedPost.reclassifyOptions.map((opt, i) => (
                <Badge key={opt} bg={i < 2 ? '#4a7c59' : i < 4 ? '#2d5a8e' : '#c2550a'}
                  color="#fff" border="none"
                  style={{ cursor: 'pointer' }}>{opt}</Badge>
              ))}
            </div>
            <PrimaryButton style={{ background: '#4a7c59', marginBottom: 6 }}>✓ 確認分類</PrimaryButton>
            <div style={{ display: 'flex', gap: 6 }}>
              <SecondaryButton style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}>↻ 重新分類</SecondaryButton>
              <SecondaryButton style={{ flex: 1, fontSize: 12, padding: '6px 8px' }}>＋ 建立 topic</SecondaryButton>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ActionableFilterView({ onNav }) {
  const af = FIXTURES.product.actionableFilter;
  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#1a2332' }}>可行性過濾</h2>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 10px' }}>把外面的聲音，過濾成對你產品可試的東西</p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <Badge>🛡 Apeiron Guard</Badge>
        <Badge>👥 香港旅客</Badge>
        <Badge>📄 README 已接入</Badge>
        <Badge>📋 AGENTS.md 已接入</Badge>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{af.totalEvaluated} 則訊號已評估</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {af.stats.map(s => (
          <Card key={s.label} style={{ flex: 1, padding: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: s.color, fontWeight: 600, marginBottom: 2 }}>{s.icon} {s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.count}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14 }}>
        {/* Left: actionable items */}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>值得兩週內試</div>
          {af.items.map(item => (
            <Card key={item.num} style={{ marginBottom: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: '#1a2332' }}>{item.num}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{item.title}</span>
                </div>
                <Badge bg="#4a7c59" color="#fff" border="none">{item.badge}</Badge>
              </div>
              <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>{item.source}</p>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: '#444', marginBottom: 4 }}>
                <div style={{ marginBottom: 4 }}>💡 <strong>為什麼不是噪音：</strong>{item.whyNot.split('：')[1]}</div>
                <div style={{ marginBottom: 4 }}>🔧 <strong>可以試：</strong>{item.canTry.split('：')[1]}</div>
                <div>📊 <strong>驗證：</strong>{item.verify.split('：')[1]}</div>
              </div>
              <SecondaryButton onClick={() => onNav('improvement-suggestions')} style={{ marginTop: 8, fontSize: 12, padding: '6px 12px' }}>
                查看證據鏈 ›
              </SecondaryButton>
            </Card>
          ))}
        </div>

        {/* Right: noise/insufficient */}
        <div style={{ width: 220, minWidth: 220 }}>
          <Card style={{ marginBottom: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>噪音樣本</span>
              <span style={{ color: '#888' }}>⊖</span>
            </div>
            <SectionCard style={{ padding: 8, marginBottom: 8 }}>
              <p style={{ fontSize: 12, margin: 0, color: '#333' }}>{af.noiseExample.text}</p>
            </SectionCard>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>原因：</div>
            <p style={{ fontSize: 11, color: '#555', margin: '0 0 8px', lineHeight: 1.5 }}>{af.noiseExample.reason}</p>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, fontSize: 11, color: '#888' }}>
              <span>ⓘ</span>
              <span>{af.noiseExample.note}</span>
            </div>
          </Card>

          <Card style={{ marginBottom: 10, padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{af.insufficientData.text}</span>
              <span style={{ color: '#d4903a' }}>❓</span>
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{af.insufficientData.note}</p>
            <span style={{ color: '#aaa', fontSize: 11, cursor: 'pointer' }}>▼</span>
          </Card>

          <Card style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>保留觀察</span>
              <Badge bg="#2d5a8e" color="#fff" border="none">{af.holdObservation.count}</Badge>
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{af.holdObservation.note}</p>
            <span style={{ color: '#aaa', fontSize: 11, cursor: 'pointer' }}>▼</span>
          </Card>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <PrimaryButton style={{ flex: 1, padding: '10px 0', background: '#4a7c59', fontSize: 13 }}>＋ 建立實驗假設</PrimaryButton>
        <SecondaryButton style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>≡ 查看全部訊號</SecondaryButton>
        <SecondaryButton style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>↻ 更新產品背景</SecondaryButton>
      </div>
    </div>
  );
}

function ImprovementSuggestionsView({ onNav }) {
  const is = FIXTURES.product.improvementSuggestions;
  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ marginBottom: 10 }}>
        <SecondaryButton onClick={() => onNav('actionable-filter')} style={{ padding: '4px 12px', fontSize: 12, display: 'inline-flex' }}>← 返回值得嘗試</SecondaryButton>
      </div>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{is.title}</h2>
          <Badge bg="#1a2332" color="#fff" border="none">{is.tagBadge}</Badge>
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>{is.support} · {is.confidence} · {is.basedOn}</p>
      </div>

      {is.signals.map((sig, i) => (
        <Card key={i} style={{ marginBottom: 10, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Avatar size={24} />
              <span style={{ fontWeight: 600 }}>{sig.handle}</span>
              <span style={{ color: '#888' }}>· {sig.platform} · {sig.likes} likes</span>
            </div>
            <span style={{ color: '#aaa', cursor: 'pointer' }}>↗</span>
          </div>
          <SectionCard style={{ padding: 10, marginBottom: 10 }}>
            <p style={{ fontSize: 13, margin: 0, color: '#333', lineHeight: 1.6 }}>❝ {sig.quote}</p>
          </SectionCard>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
              <span style={{ color: '#4a7c59', fontSize: 10, marginTop: 3 }}>●</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#4a7c59' }}>為什麼相關</div>
                <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>{sig.whyRelated}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ fontSize: 10, marginTop: 3, color: '#888' }}>🛡</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12 }}>產品比對</div>
                <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>{sig.productMatch}</p>
              </div>
              <Badge bg={sig.actionColor} color="#fff" border="none">✓ {sig.action}</Badge>
            </div>
          </div>
        </Card>
      ))}

      {/* Fixed bottom toolbar */}
      <div style={{
        position: 'sticky', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: '1px solid #eee',
        padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: 11, color: '#888' }}>
          <span>👥 {is.bottomBar.support}</span>
          <span>🧠 {is.bottomBar.confidence}</span>
          <span style={{ fontSize: 10 }}>{is.bottomBar.reference}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <PrimaryButton style={{ flex: 0, padding: '8px 16px', background: '#4a7c59', fontSize: 12 }}>🔬 建立實驗假設</PrimaryButton>
          <SecondaryButton onClick={() => onNav('actionable-filter')} style={{ flex: 0, fontSize: 12, padding: '8px 12px' }}>← 返回可行性過濾</SecondaryButton>
          <SecondaryButton style={{ flex: 0, fontSize: 12, padding: '8px 12px' }}>📋 標記為資料不足</SecondaryButton>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ClassificationView, ActionableFilterView, ImprovementSuggestionsView });
