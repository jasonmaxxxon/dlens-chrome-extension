// ── Topic Mode Views ──

function InboxView({ onNav }) {
  const t = FIXTURES.topic;
  const [selectedIdx, setSelectedIdx] = React.useState(0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#1a2332' }}>收件匣</h2>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>● 處理新 capture，要不要進 topic</p>
        </div>
        <SecondaryButton style={{ padding: '4px 10px', fontSize: 12 }}>▽ 篩選</SecondaryButton>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        {/* Left: signal list */}
        <div style={{ width: 260, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>
            待處理訊號 <Badge bg="#f0f0ee">4</Badge>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>最新 ▼ ≡</span>
          </div>
          {t.inbox.map((sig, i) => (
            <Card key={i} onClick={() => setSelectedIdx(i)} style={{
              marginBottom: 6, padding: 10, cursor: 'pointer',
              borderColor: selectedIdx === i ? '#2f4a3a' : '#e5e3d8',
              background: selectedIdx === i ? '#f2f0e7' : '#fff',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Badge bg="#fff" border="1px solid #ddd"><span style={{fontSize:10}}>🧵</span> {sig.source}</Badge>
                <span style={{ fontSize: 11, color: '#888' }}>{sig.time} {sig.unread && <span style={{color:'#2d5a8e'}}>●</span>}</span>
              </div>
              <p style={{ fontSize: 12, lineHeight: 1.5, margin: '4px 0 6px', color: '#333' }}>{sig.text}</p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {sig.tags.map(tag => (
                  <Badge key={tag} bg={tag.includes('高') ? '#fef2e8' : tag.includes('中') ? '#fef2e8' : '#f5f5f3'}
                    color={tag.includes('高') || tag.includes('建議') ? '#c2550a' : '#888'}
                    border={tag.includes('高') || tag.includes('建議') ? '1px solid #e8c4a0' : '1px solid #e5e3d8'}>
                    {tag}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Right: preview + actions */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>訊號預覽</div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
              <Avatar />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t.inboxPreview.handle}</span>
                    <div style={{ fontSize: 11, color: '#888' }}>{t.inboxPreview.time} · 於 Threads</div>
                  </div>
                  <ThreadsBadge />
                </div>
              </div>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, margin: '6px 0', whiteSpace: 'pre-line', color: '#222' }}>{t.inboxPreview.text}</p>
            <EngagementRow likes={t.inboxPreview.likes} comments={t.inboxPreview.comments} reposts={t.inboxPreview.reposts} />
          </Card>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>建議主題</div>
          <Card style={{ marginBottom: 8, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => onNav('topic-detail')}>
            <span><span style={{ color: '#c2550a' }}>●</span> {t.inboxPreview.suggestedTopic}</span>
            <span style={{ color: '#aaa' }}>›</span>
          </Card>

          <PrimaryButton onClick={() => onNav('topic-detail')} style={{ marginBottom: 8 }}>
            📥 加入現有主題
          </PrimaryButton>

          <div style={{ display: 'flex', gap: 0, flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <select style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}>
                <option>香港航班調整反應</option>
              </select>
            </div>
            <SecondaryButton style={{ width: '100%', marginBottom: 6 }}>＋ 建立新主題</SecondaryButton>
            <TextButton color="#c2550a" style={{ width: '100%', justifyContent: 'center' }}>🗑 歸檔</TextButton>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #eee', fontSize: 11, color: '#888', marginTop: 8 }}>
        <span>📥 4 待處理</span>
        <span>💡 2 已建議主題</span>
        <span>● 本地儲存</span>
      </div>
    </div>
  );
}

function TopicDetailView({ onNav }) {
  const t = FIXTURES.topic;
  const [tab, setTab] = React.useState('總覽');

  return (
    <div>
      <Breadcrumb items={[
        { label: '案例本', onClick: () => onNav('library') },
        { label: t.name },
      ]} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1a2332' }}>{t.name}</h2>
        <Badge bg="#c2550a" color="#fff" border="none">{t.badge}</Badge>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 12, color: '#888' }}>
        <Badge>⚡ {t.signals} signals</Badge>
        <Badge>🔗 {t.pairs} pairs</Badge>
        <span>⏱ {t.updatedAgo}</span>
        <span style={{ marginLeft: 'auto', cursor: 'pointer' }}>🔖</span>
        <span style={{ cursor: 'pointer' }}>···</span>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #eee', marginBottom: 14 }}>
        {['總覽', '討論訊號', '成對分析'].map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: tab === tb ? 600 : 400,
            border: 'none', borderBottom: tab === tb ? '2px solid #2f4a3a' : '2px solid transparent',
            background: 'none', cursor: 'pointer', color: tab === tb ? '#2f4a3a' : '#8a8880',
            marginBottom: -2,
          }}>{tb}</button>
        ))}
      </div>

      {tab === '總覽' && (
        <div>
          {/* Score card */}
          <SectionCard style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Product judgment</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#1a2332' }}>⚖ {t.scoreLabel}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#888' }}>相關性</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ width: 24, height: 8, borderRadius: 2, background: i <= 4 ? '#c2550a' : '#ddd' }}></div>
                  ))}
                </div>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#c2550a' }}>{t.score} / 10</span>
              </div>
            </div>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, margin: '8px 0 4px' }}>{t.scoreReason}</p>
            <p style={{ fontSize: 12, color: '#c2550a' }}>建議：{t.suggestion}</p>
          </SectionCard>

          {/* Clusters */}
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>累積脈絡</div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {t.clusters.map(c => (
              <Card key={c.label} style={{ flex: 1, padding: 10 }}>
                <div style={{ fontSize: 16, marginBottom: 4 }}>{c.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{c.label}</div>
                <p style={{ fontSize: 11, color: '#666', lineHeight: 1.5, margin: '0 0 6px' }}>{c.desc}</p>
                <Badge>{c.signals} signals</Badge>
              </Card>
            ))}
          </div>

          {/* Evidence snapshot */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>證據快照</span>
            <TextButton style={{ fontSize: 12 }}>查看全部 12 ›</TextButton>
          </div>
          <div style={{ fontSize: 11, color: '#888', display: 'flex', gap: 0, marginBottom: 6, padding: '4px 0', borderBottom: '1px solid #eee' }}>
            <span style={{ width: 80 }}>來源</span>
            <span style={{ flex: 1 }}>內容摘錄</span>
            <span style={{ width: 100, textAlign: 'right' }}>互動</span>
          </div>
          {t.evidenceSnapshot.map((ev, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '6px 0', borderBottom: '1px solid #f0f0ee', fontSize: 12 }}>
              <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: ev.color, fontSize: 8 }}>●</span>
                <span style={{ fontSize: 11 }}>🧵 {ev.source}<br/><span style={{color:'#aaa'}}>{ev.time}</span></span>
              </div>
              <div style={{ flex: 1, color: '#333' }}>{ev.text}</div>
              <div style={{ width: 100, textAlign: 'right', color: '#888', fontSize: 11 }}>
                ♡ {ev.likes}　💬 {ev.comments}　🔄 {ev.reposts}
              </div>
            </div>
          ))}

          {/* Pair preview */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>成對預覽</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#888' }}>最新成對 ▼</span>
              <SecondaryButton onClick={() => onNav('compare-setup')} style={{ padding: '4px 10px', fontSize: 11 }}>查看成對分析</SecondaryButton>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[t.pairPreview.a, t.pairPreview.b].map((p, i) => (
              <Card key={i} style={{ flex: 1, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Badge bg={i === 0 ? '#1a2332' : '#c2550a'} color="#fff" border="none">{i === 0 ? 'A' : 'B'}</Badge>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{p.handle}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>{p.time}</span>
                </div>
                <p style={{ fontSize: 12, lineHeight: 1.5, margin: '4px 0 6px', color: '#333' }}>{p.text}</p>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#888', marginBottom: 6 }}>
                  <span>🧵 Threads</span>
                  <span>♡ {p.likes}</span>
                  <span>💬 {p.comments}</span>
                  <span>🔄 {p.reposts}</span>
                </div>
              </Card>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative', left: -5 }}>
              <span style={{ fontSize: 11, color: '#888', background: '#fff', borderRadius: '50%', border: '1px solid #ddd', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', left: -12 }}>vs</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareSetupView({ onNav }) {
  const t = FIXTURES.topic;
  return (
    <div>
      <Breadcrumb items={[
        { label: '案例本', onClick: () => onNav('library') },
        { label: t.name, onClick: () => onNav('topic-detail') },
        { label: '成對檢視' },
      ]} />
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#1a2332' }}>成對檢視</h2>
      <p style={{ fontSize: 13, color: '#888', margin: '0 0 14px' }}>● 選擇兩則 ready 訊號，建立比較閱讀</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', marginBottom: 14, position: 'relative' }}>
        {[{label:'Post A', badge:'A', color:'#1a2332', post:t.comparePostA}, {label:'Post B', badge:'B', color:'#c2550a', post:t.comparePostB}].map((side, i) => (
          <Card key={i} style={{ flex: 1, padding: 12, borderColor: side.color, borderWidth: i===1?2:1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{side.label}</span>
                <Badge bg={side.color} color="#fff" border="none">{side.badge}</Badge>
              </div>
              <span style={{ color: '#aaa' }}>▼</span>
            </div>
            <div style={{ marginBottom: 6 }}><ThreadsBadge /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Avatar size={32} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{side.post.handle}</div>
                <div style={{ fontSize: 11, color: '#888' }}>{side.post.time}</div>
              </div>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 8px', color: '#333' }}>{side.post.text}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ color: '#4a7c59', fontSize: 11 }}>✓ {side.post.status}</span>
              <span style={{ fontSize: 11, color: '#888' }}>💬 {side.post.comments}</span>
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>主要群組　<Badge bg={i===0?'#eef2f7':'#fef2e8'} color={side.color} border="none">{side.post.cluster}</Badge></div>
          </Card>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-20px 0 8px' }}>
        <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, zIndex: 1 }}>⇄</div>
      </div>

      {/* Status badges */}
      <div style={{ display: 'flex', gap: 0, justifyContent: 'center', marginBottom: 14 }}>
        {['crawl ready', 'analysis ready', 'topic context linked'].map((s, i) => (
          <div key={s} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '10px 8px', fontSize: 12,
            borderRight: i < 2 ? '1px solid #eee' : 'none',
          }}>
            <span style={{ color: '#4a7c59', fontSize: 16 }}>✓</span>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{s}</div>
            <div style={{ fontSize: 10, color: '#888', textAlign: 'center' }}>{['兩則訊號已完整擷取','AI 分析完成','已連結至本主題脈絡'][i]}</div>
          </div>
        ))}
      </div>

      {/* Compare preview */}
      <SectionCard style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>比較預覽</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚖</span>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6, color: '#333' }}>同一事件下，A 偏向安排資訊，B 偏向信任質疑。</p>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          <div>
            <Badge bg="#1a2332" color="#fff" border="none">A</Badge>
            <span style={{ fontSize: 12, marginLeft: 6 }}>主要群組</span>
            <div style={{ marginTop: 4 }}><Badge bg="#eef2f7" color="#1a2332" border="none">{t.comparePostA.cluster}</Badge></div>
          </div>
          <div>
            <Badge bg="#c2550a" color="#fff" border="none">B</Badge>
            <span style={{ fontSize: 12, marginLeft: 6 }}>主要群組</span>
            <div style={{ marginTop: 4 }}><Badge bg="#fef2e8" color="#c2550a" border="none">{t.comparePostB.cluster}</Badge></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: '#666' }}>
          <span>🔒 信心度 <Badge bg="#1a2332" color="#fff" border="none">中高</Badge></span>
          <span>📊 覆蓋度 <Badge bg="#4a7c59" color="#fff" border="none">良好</Badge></span>
          <span style={{ color: '#888' }}>依據 12 訊號分析</span>
        </div>
      </SectionCard>

      <PrimaryButton onClick={() => onNav('analysis-result')} style={{ marginBottom: 8 }}>📈 開始分析</PrimaryButton>
      <SecondaryButton onClick={() => {}} style={{ width: '100%', justifyContent: 'center' }}>↻ 重新選擇</SecondaryButton>
    </div>
  );
}

function AnalysisResultView({ onNav }) {
  const a = FIXTURES.topic.analysisResult;
  return (
    <div>
      <Breadcrumb items={[
        { label: '案例本', onClick: () => onNav('library') },
        { label: FIXTURES.topic.name, onClick: () => onNav('topic-detail') },
        { label: '分析結果' },
      ]} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1a2332' }}>分析結果</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Badge>AI Brief · {a.aiBrief}%</Badge>
          <span style={{ fontSize: 11, color: '#888' }}>⏱ {a.updatedAgo}</span>
        </div>
      </div>

      <SectionCard style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>核心結論</div>
        <h3 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: '#1a2332' }}>{a.coreConclusion}</h3>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 8px' }}>{a.subtext}</p>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666' }}>
          <span>信心度：<Badge bg="#1a2332" color="#fff" border="none">{a.confidence}</Badge></span>
          <span>覆蓋度：<Badge bg="#4a7c59" color="#fff" border="none">{a.coverage}</Badge></span>
          <span style={{ color: '#888' }}>{a.basedOn}</span>
        </div>
      </SectionCard>

      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>關鍵觀察</div>
      {a.observations.map((obs, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f0f0ee' }}>
          <span style={{ fontSize: 18, marginTop: 2 }}>{obs.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13, textDecoration: 'underline', marginBottom: 2 }}>{obs.title}</div>
            <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{obs.desc}</p>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#888' }}>證據</span>
            {obs.evidence.map(e => <Badge key={e}>{e}</Badge>)}
          </div>
        </div>
      ))}

      {/* A/B Reading */}
      <div style={{ fontWeight: 700, fontSize: 15, marginTop: 16, marginBottom: 8 }}>A / B 閱讀</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        {[a.postA, a.postB].map((p, i) => (
          <Card key={i} style={{ flex: 1, borderColor: i === 0 ? '#1a2332' : '#c2550a', borderWidth: 2, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{p.title}</span>
              <Badge bg={i === 0 ? '#1a2332' : '#c2550a'} color="#fff" border="none">{i === 0 ? 'A' : 'B'}</Badge>
            </div>
            <p style={{ fontSize: 12, color: '#555', margin: '0 0 8px', lineHeight: 1.5 }}>{p.desc}</p>
            <div style={{ fontSize: 11, color: '#888' }}>主導群組</div>
            <Badge bg={i===0?'#eef2f7':'#fef2e8'} color={i===0?'#1a2332':'#c2550a'} border="none">{p.cluster}</Badge>
          </Card>
        ))}
      </div>

      {/* Creator tip */}
      <SectionCard style={{ marginBottom: 14, background: '#fef9f3', border: '1px solid #f0e0c8' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>創作者提示</div>
            <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{a.creatorTip}</p>
          </div>
        </div>
      </SectionCard>

      <PrimaryButton onClick={() => onNav('evidence-detail')} style={{ background: '#c2550a', marginBottom: 8 }}>
        🔍 查看證據詳情<br/><span style={{ fontSize: 11, fontWeight: 400 }}>discourse · evidence · cluster map</span>
      </PrimaryButton>
      <SecondaryButton onClick={() => onNav('compare-setup')} style={{ width: '100%', justifyContent: 'center' }}>← 回到成對檢視</SecondaryButton>
    </div>
  );
}

function ClusterViz() {
  const clusters = FIXTURES.topic.evidenceDetail.clusters;
  // Generate static scatter positions
  const dots = React.useMemo(() => {
    const result = [];
    const centers = [{x:120,y:100},{x:280,y:60},{x:100,y:200},{x:280,y:190}];
    const colors = ['#1a2332','#6b7a8f','#d1d5db','#6b7a8f'];
    clusters.forEach((c, ci) => {
      const count = Math.round(c.pct * 0.8);
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 40 + 5;
        result.push({
          x: centers[ci].x + Math.cos(angle) * r,
          y: centers[ci].y + Math.sin(angle) * r,
          color: colors[ci],
          size: 3 + Math.random() * 3,
        });
      }
    });
    return result;
  }, []);

  return (
    <svg viewBox="0 0 360 260" style={{ width: '100%', height: 'auto' }}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.size} fill={d.color} opacity={0.6} />
      ))}
      {/* Labels */}
      <g fontSize="11" fontWeight="600">
        <rect x="70" y="42" width="70" height="20" rx="4" fill="#c2550a" />
        <text x="105" y="56" fill="#fff" textAnchor="middle" fontSize="10">{clusters[0].name}</text>
        <text x="105" y="38" fill="#888" textAnchor="middle" fontSize="10">{clusters[0].pct}%</text>

        <rect x="248" y="20" width="70" height="20" rx="4" fill="#6b7a8f" />
        <text x="283" y="34" fill="#fff" textAnchor="middle" fontSize="10">{clusters[1].name}</text>
        <text x="283" y="16" fill="#888" textAnchor="middle" fontSize="10">{clusters[1].pct}%</text>

        <text x="80" y="250" fill="#888" textAnchor="middle" fontSize="10">{clusters[2].name}</text>
        <text x="80" y="238" fill="#888" textAnchor="middle" fontSize="10">{clusters[2].pct}%</text>

        <text x="290" y="240" fill="#888" textAnchor="middle" fontSize="10">{clusters[3].name}</text>
        <text x="290" y="228" fill="#888" textAnchor="middle" fontSize="10">{clusters[3].pct}%</text>
      </g>
      {/* Legend */}
      <circle cx="130" cy="250" r="4" fill="#1a2332" />
      <text x="138" y="254" fontSize="9" fill="#888">dominant</text>
      <circle cx="195" cy="250" r="4" fill="#6b7a8f" />
      <text x="203" y="254" fontSize="9" fill="#888">supporting</text>
      <circle cx="270" cy="250" r="4" fill="#d1d5db" />
      <text x="278" y="254" fontSize="9" fill="#888">low signal</text>
    </svg>
  );
}

function EvidenceDetailView({ onNav }) {
  const ed = FIXTURES.topic.evidenceDetail;
  const [postTab, setPostTab] = React.useState('Post A');

  return (
    <div>
      <Breadcrumb items={[
        { label: '分析結果', onClick: () => onNav('analysis-result') },
        { label: '證據詳情' },
      ]} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1a2332' }}>證據詳情</h2>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #ddd' }}>
          {['Post A', 'Post B'].map(t => (
            <button key={t} onClick={() => setPostTab(t)} style={{
              padding: '5px 16px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
              background: postTab === t ? '#2f4a3a' : '#fff',
              color: postTab === t ? '#fff' : (t === 'Post B' ? '#c2550a' : '#444'),
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        {/* Post A discourse */}
        <Card style={{ flex: 1, padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Post A discourse</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Avatar size={28} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{ed.postAHandle}</div>
              <div style={{ fontSize: 10, color: '#888' }}>{ed.postATime}</div>
            </div>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 10px', color: '#333' }}>{ed.postAText}</p>
          <SectionCard style={{ padding: 8, fontSize: 11, marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>核心論點</div>
            <p style={{ margin: 0, color: '#555' }}>{ed.corePoint}</p>
          </SectionCard>
          <div style={{ fontSize: 11, color: '#666' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>🔗 主線　<span style={{color:'#333'}}>{ed.mainThread}</span></div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>😔 情緒　<span style={{color:'#333'}}>{ed.emotion}</span></div>
            <div style={{ display: 'flex', gap: 8 }}>❓ 缺口　<span style={{color:'#333'}}>{ed.gap}</span></div>
          </div>
        </Card>

        {/* Cluster viz */}
        <Card style={{ flex: 1, padding: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Cluster 分布</div>
          <ClusterViz />
        </Card>
      </div>

      {/* Evidence list */}
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>對應證據</div>
      {ed.evidence.map((ev, i) => (
        <Card key={ev.id} style={{ marginBottom: 8, padding: 12, borderColor: i === 0 ? '#c2550a' : '#e5e3d8', borderWidth: i === 0 ? 2 : 1 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ textAlign: 'center', minWidth: 40 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#c2550a' }}>{ev.id}</div>
              <div style={{ fontSize: 10, color: '#888' }}>{ev.time}</div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, margin: '0 0 6px', color: '#333', lineHeight: 1.5, background: '#f8f8f6', padding: 8, borderRadius: 6 }}>{ev.quote}</p>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#888' }}>
                <span>💬 {ev.comments}</span>
                <span>♡ {ev.likes}</span>
                <span>🔄 {ev.reposts}</span>
              </div>
            </div>
            <div style={{ width: 200, minWidth: 200, fontSize: 12 }}>
              <p style={{ margin: '0 0 6px', color: '#555', lineHeight: 1.5 }}>剖析：{ev.analysis}</p>
              <Badge bg={ev.tag === '安排變更' ? '#c2550a' : '#6b7a8f'} color="#fff" border="none">{ev.tag}</Badge>
            </div>
          </div>
        </Card>
      ))}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #eee', fontSize: 11, color: '#888', marginTop: 8 }}>
        <span>💬 12 comments captured<br/><span style={{fontSize:10}}>本貼文證據已擷取</span></span>
        <span>🔗 4 clusters<br/><span style={{fontSize:10}}>群集已建立</span></span>
        <span>✓ top evidence shown<br/><span style={{fontSize:10}}>顯示代表性證據</span></span>
      </div>
    </div>
  );
}

Object.assign(window, { InboxView, TopicDetailView, CompareSetupView, AnalysisResultView, EvidenceDetailView, ClusterViz });
