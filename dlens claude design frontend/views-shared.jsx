// ── Shared Views: Collect, Settings, Library ──

function CollectView({ mode, onNav }) {
  const isTopic = mode === 'topic';
  const post = isTopic ? FIXTURES.topic.collectPost : FIXTURES.product.collectPost;

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#1a2332' }}>收集</h2>
      <p style={{ fontSize: 13, color: '#8a8880', margin: '0 0 16px' }}>
        {isTopic ? '● Threads 訊號會加入收件匣' : 'Threads 訊號會加入產品收件匣'}
      </p>

      {!isTopic && (
        <Card style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🛡</span>
            <div>
              <div style={{ fontSize: 11, color: '#888' }}>Product Profile</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{FIXTURES.product.name}</div>
            </div>
          </div>
          <Badge>👥 {FIXTURES.product.audience}</Badge>
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        {!isTopic && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
            <span>目前選取的 Threads 訊號</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888' }}>來源 <ThreadsBadge /></span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <Avatar />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{post.handle}</span>
                <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>{post.time} · 於 Threads</span>
              </div>
              {isTopic && <ThreadsBadge />}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.7, margin: '8px 0', whiteSpace: 'pre-line', color: '#222' }}>{post.text}</p>
        <EngagementRow likes={post.likes} comments={post.comments} reposts={post.reposts} />
        {!isTopic && post.impacts && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#888' }}>
            可能影響：{post.impacts.map(t => <Badge key={t}>{t}</Badge>)}
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <PrimaryButton style={{ flex: 1 }}>
          📥 {isTopic ? '加入收件匣' : '加入產品收件匣'}
        </PrimaryButton>
        <SecondaryButton style={{ width: 44, padding: 0, justifyContent: 'center' }}>↻</SecondaryButton>
        <SecondaryButton style={{ width: 44, padding: 0, justifyContent: 'center' }}>✕</SecondaryButton>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          收集模式 <span style={{ fontSize: 11, color: '#aaa' }}>ⓘ</span>
        </div>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e8e8e4' }}>
          <button style={{ flex: 1, padding: '8px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: '#2f4a3a', color: '#fff', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            ◎ Hover preview
          </button>
          <button style={{ flex: 1, padding: '8px 12px', fontSize: 12, border: 'none', cursor: 'pointer', background: '#fff', color: '#444' }}>
            ⊡ Manual select
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid #e8e8e4', borderRadius: 8, padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <span style={{ fontWeight: 500 }}>儲存位置</span>
        <Badge>📁 {FIXTURES.folder}</Badge>
        <span style={{ color: '#ccc' }}>→</span>
        <Badge>{isTopic ? '📥 Signal inbox' : '📥 Product Signal Inbox'}</Badge>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '8px 0', borderTop: '1px solid #eee', fontSize: 11, color: '#888' }}>
        <StatusDot color="#4a7c59" label={<><span style={{fontWeight:600}}>Backend</span><br/>Ready</>} />
        <StatusDot color="#4a7c59" label={<><span style={{fontWeight:600}}>{isTopic ? 'AI (Local Key)' : 'AI 本機金鑰'}</span><br/>Ready</>} />
        {isTopic ? (
          <StatusDot color="#888" label={<><span style={{fontWeight:600}}>Last captured</span><br/>2 min ago</>} />
        ) : (
          <StatusDot color="#4a7c59" label={<><span style={{fontWeight:600}}>Product Profile</span><br/>Ready</>} />
        )}
      </div>
    </div>
  );
}

function SettingsView({ mode, onModeChange }) {
  const [provider, setProvider] = React.useState('Google');

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#1a2332' }}>設定</h2>
      <p style={{ fontSize: 13, color: '#8a8880', margin: '0 0 18px' }}>連接、AI key、folder mode</p>

      <SectionCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ background: '#2f4a3a', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>1</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Connection</span>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Backend URL</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input readOnly value={FIXTURES.settings.backendUrl} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, background: '#fff' }} />
          <span style={{ fontSize: 11, color: '#4a7c59' }}>● backend ready</span>
          <SecondaryButton style={{ padding: '6px 12px', fontSize: 12 }}>測試連接</SecondaryButton>
        </div>
      </SectionCard>

      <SectionCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ background: '#2f4a3a', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>2</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>AI provider</span>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>Provider</div>
        <SegmentedControl options={['Google', 'OpenAI', 'Claude']} value={provider} onChange={setProvider} />
        <div style={{ fontSize: 12, color: '#666', marginTop: 12, marginBottom: 4 }}>API key</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="password" readOnly value={FIXTURES.settings.apiKey} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }} />
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>👁</button>
        </div>
        <div style={{ fontSize: 11, color: '#4a7c59', marginTop: 6 }}>● local key only <span style={{ color: '#888' }}>key stays in chrome.storage.local</span></div>
      </SectionCard>

      <SectionCard style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ background: '#2f4a3a', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>3</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Folder mode</span>
        </div>
        <SegmentedControl options={['Archive', 'Topic', 'Product']} value={mode.charAt(0).toUpperCase() + mode.slice(1)} onChange={(v) => onModeChange(v.toLowerCase())} />
        <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
          {mode === 'product' ? 'Product mode 會啟用 Judgment 與產品脈絡。' : mode === 'topic' ? 'Topic mode 會啟用主題分析與成對比較。' : 'Archive mode 僅做收集與保存。'}
        </p>
      </SectionCard>

      {mode === 'product' && (
        <SectionCard style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ background: '#2f4a3a', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>4</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Product Profile</span>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>產品名稱</div>
          <input readOnly value="Apeiron Guard" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>類別</div>
          <input readOnly value="Travel service" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>受眾</div>
          <input readOnly value="香港旅客" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <textarea readOnly placeholder="貼上 150 字描述" style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, height: 36, resize: 'none' }}></textarea>
            <SecondaryButton style={{ padding: '6px 12px', fontSize: 12 }}>自動填入</SecondaryButton>
          </div>
        </SectionCard>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '10px 0', fontSize: 11, color: '#888', borderTop: '1px solid #eee' }}>
        <span>🔒 本地設定</span>
        <span>🔐 不傳送 user API key 到 backend</span>
      </div>
    </div>
  );
}

function LibraryView({ onNav }) {
  const lib = FIXTURES.library;
  const [selected, setSelected] = React.useState('香港航班調整反應');

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: '#1a2332' }}>保存庫</h2>
      <p style={{ fontSize: 13, color: '#8a8880', margin: '0 0 14px' }}>Folders · Cases · Topics</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <input placeholder="搜尋 folder / case / topic" style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 12 }} />
        {['全部', 'Folder', 'Case', 'Topic'].map((f, i) => (
          <button key={f} style={{
            padding: '5px 12px', borderRadius: 16, fontSize: 12, border: '1px solid #ddd',
            background: i === 0 ? '#2f4a3a' : '#fff', color: i === 0 ? '#fff' : '#444',
            cursor: 'pointer', fontWeight: 500, whiteSpace: 'nowrap',
          }}>{f}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, minHeight: 380 }}>
        {/* Left panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Folders */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>📁 Folders</span>
            <span style={{ background: '#c2550a', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>2</span>
          </div>
          {lib.folders.map(f => (
            <Card key={f.name} style={{ marginBottom: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>📁 {f.name}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{f.saved} saved　{f.updated}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {f.sources.map(s => <Badge key={s}>{s}</Badge>)}
                  </div>
                </div>
                <span style={{ color: '#aaa', cursor: 'pointer' }}>···</span>
              </div>
            </Card>
          ))}

          {/* Cases */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>📋 Specific cases</span>
            <span style={{ background: '#c2550a', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>2</span>
          </div>
          {lib.cases.map(c => (
            <Card key={c.name} onClick={() => setSelected(c.name)} style={{
              marginBottom: 8, padding: 10,
              background: selected === c.name ? '#f2f0e7' : '#fff',
              borderColor: selected === c.name ? '#2f4a3a' : '#e5e3d8',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>📋 {c.name}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.signals} signals　{c.pairs} pairs</div>
                  <div style={{ fontSize: 11, color: '#aaa' }}>{c.updated}</div>
                </div>
                <span style={{ color: '#aaa', cursor: 'pointer' }}>···</span>
              </div>
            </Card>
          ))}

          {/* Topics */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>🏷 Topics</span>
            <span style={{ background: '#c2550a', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>2</span>
          </div>
          {lib.topics.map(t => (
            <Card key={t.name} style={{ marginBottom: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>🏷 {t.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{t.captures} linked captures</div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {t.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}
              </div>
            </Card>
          ))}
        </div>

        {/* Right panel */}
        <div style={{ width: 260, minWidth: 260 }}>
          <Card style={{ padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>📖 預覽</div>
            <div style={{ color: '#c2550a', fontSize: 11, fontWeight: 600, marginBottom: 8 }}>● Selected</div>
            <div style={{ background: '#f5f5f3', borderRadius: 8, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, height: 60 }}>
              <span style={{ fontSize: 32, color: '#ccc' }}>📄</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{lib.preview.title}</div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{lib.preview.type} · {lib.preview.signals} signals · {lib.preview.pairs} pairs</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>保存摘要</div>
            <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, margin: '0 0 10px' }}>{lib.preview.summary}</p>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>來源總覽</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {lib.preview.sources.map(s => <Badge key={s}>{s}</Badge>)}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>最後更新</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>⏱ {lib.preview.lastUpdated}</div>
            <PrimaryButton onClick={() => onNav('topic-detail')}>📖 開啟</PrimaryButton>
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <span style={{ color: '#aaa', cursor: 'pointer', fontSize: 16 }}>···</span>
            </div>
          </Card>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-around', padding: '10px 0', borderTop: '1px solid #eee', fontSize: 11, color: '#888', marginTop: 8 }}>
        <span>💾 本地儲存</span>
        <span>🔖 24 saved items</span>
        <span>✓ Archive mode</span>
      </div>
    </div>
  );
}

Object.assign(window, { CollectView, SettingsView, LibraryView });
