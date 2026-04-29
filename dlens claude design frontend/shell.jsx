// ── Shell Components: Header, LeftRail, Breadcrumb, Shell ──

function LeftRail({ currentView, mode, onNav }) {
  const items = [
    { id: 'collect', icon: '◎', activeIcon: '◉', views: ['collect'] },
    { id: 'inbox', icon: '✉', activeIcon: '✉', views: ['inbox', 'classification'] },
    { id: 'topic-detail', icon: '☷', activeIcon: '☷', views: ['topic-detail'], topicOnly: true },
    { id: 'compare', icon: '⚖', activeIcon: '⚖', views: ['compare-setup', 'analysis-result', 'evidence-detail'], topicOnly: true },
    { id: 'library', icon: '☐', activeIcon: '☐', views: ['library'], topicOnly: true },
    { id: 'filter', icon: '▽', activeIcon: '▼', views: ['actionable-filter', 'improvement-suggestions'], productOnly: true },
  ];

  const bottomItems = [
    { id: 'settings', icon: '⚙', activeIcon: '⚙', views: ['settings'] },
  ];

  const navTarget = (id) => {
    if (id === 'collect') return 'collect';
    if (id === 'inbox') return mode === 'product' ? 'classification' : 'inbox';
    if (id === 'topic-detail') return 'topic-detail';
    if (id === 'compare') return 'compare-setup';
    if (id === 'library') return 'library';
    if (id === 'filter') return 'actionable-filter';
    if (id === 'settings') return 'settings';
    return 'collect';
  };

  const isActive = (item) => item.views.includes(currentView);

  const renderItem = (item) => {
    if (item.productOnly && mode !== 'product') return null;
    if (item.topicOnly && mode === 'product') return null;
    const active = isActive(item);
    return (
      <button
        key={item.id}
        onClick={() => onNav(navTarget(item.id))}
        style={{
          width: 40, height: 40, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
          border: 'none', cursor: 'pointer',
          color: active ? '#fff' : '#8899aa',
          fontSize: 18, transition: 'all 0.15s',
        }}
        title={item.id}
      >
        {active ? item.activeIcon : item.icon}
      </button>
    );
  };

  return (
    <div style={{
      width: 56, minWidth: 56, height: '100%',
      background: '#1a2332', display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 8, paddingBottom: 8, gap: 4,
    }}>
      {items.map(renderItem)}
      <div style={{ marginTop: 'auto' }}></div>
      {bottomItems.map(renderItem)}
    </div>
  );
}

function LeftRailSVG({ currentView, mode, onNav }) {
  const items = [
    { id: 'collect', label: 'Collect', views: ['collect'],
      path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a7 7 0 015.5 2.7.75.75 0 01-1.2.9A5.5 5.5 0 0012 12a5.5 5.5 0 00-4.3 1.6.75.75 0 01-1.2-.9A7 7 0 0112 10z' },
    { id: 'inbox', label: 'Inbox', views: ['inbox', 'classification'],
      path: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm2 0l7 5 7-5' },
    { id: 'topic-detail', label: 'Topic', views: ['topic-detail'], topicOnly: true,
      path: 'M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z' },
    { id: 'compare', label: 'Compare', views: ['compare-setup', 'analysis-result', 'evidence-detail'], topicOnly: true,
      path: 'M12 3v18M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5' },
    { id: 'library', label: 'Library', views: ['library'], topicOnly: true,
      path: 'M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zm1 2v14h14V5H5zm2 2h4v4H7V7zm6 0h4v2h-4V7zm0 4h4v2h-4v-2zM7 13h10v2H7v-2z' },
    { id: 'filter', label: 'Filter', views: ['actionable-filter', 'improvement-suggestions'], productOnly: true,
      path: 'M3 4h18l-7 8v5l-4 2V12L3 4z' },
  ];
  const bottomItems = [
    { id: 'settings', label: 'Settings', views: ['settings'],
      path: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3c0-.3 0-.6-.1-.9l2-1.6-2-3.4-2.4.8a7 7 0 00-1.5-.9L15 4h-4l-.4 2a7 7 0 00-1.5.9L6.7 6l-2 3.4 2 1.6a7 7 0 000 1.8l-2 1.6 2 3.4 2.4-.8c.4.4.9.7 1.5.9L11 20h4l.4-2a7 7 0 001.5-.9l2.4.8 2-3.4-2-1.6c.1-.3.1-.6.1-.9z' },
  ];

  const navTarget = (id) => {
    if (id === 'collect') return 'collect';
    if (id === 'inbox') return mode === 'product' ? 'classification' : 'inbox';
    if (id === 'topic-detail') return 'topic-detail';
    if (id === 'compare') return 'compare-setup';
    if (id === 'library') return 'library';
    if (id === 'filter') return 'actionable-filter';
    if (id === 'settings') return 'settings';
    return 'collect';
  };

  const renderBtn = (item) => {
    if (item.productOnly && mode !== 'product') return null;
    if (item.topicOnly && mode === 'product') return null;
    const active = item.views.includes(currentView);
    return (
      <button key={item.id} onClick={() => onNav(navTarget(item.id))} title={item.label}
        style={{
          width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active ? '#fff' : 'transparent',
          boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px #e5e3d8' : 'none',
          transition: 'all 0.15s',
        }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
          stroke={active ? '#2f4a3a' : '#8a8880'} strokeWidth={active ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round">
          <path d={item.path}></path>
        </svg>
      </button>
    );
  };

  return (
    <div style={{
      width: 56, minWidth: 56, height: '100%',
      background: '#f2f0e7', borderRight: '1px solid #e5e3d8',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 12, paddingBottom: 12, gap: 6,
    }}>
      {items.map(renderBtn)}
      <div style={{ marginTop: 'auto' }}></div>
      {bottomItems.map(renderBtn)}
    </div>
  );
}

function Header({ folderName, mode }) {
  const pillStyle = mode === 'product'
    ? { background: '#2f4a3a', color: '#fff', border: '1px solid #2f4a3a' }
    : mode === 'topic'
    ? { background: 'transparent', color: '#1a2332', border: '1.5px solid #1a2332' }
    : { background: '#ebe9e0', color: '#666', border: '1px solid #ebe9e0' };

  const modeLabel = mode === 'product' ? 'Product' : mode === 'topic' ? 'Topic' : 'Archive';

  return (
    <div style={{
      height: 52, minHeight: 52, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 22px', borderBottom: '1px solid #ebe9e0',
      background: '#faf9f5',
    }}>
      <div style={{ fontFamily: '"Noto Serif TC", serif', fontWeight: 900, fontSize: 20, color: '#2f4a3a', letterSpacing: '-0.02em' }}>DLens</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#555', fontWeight: 500 }}>
          <span style={{ fontSize: 13 }}>📁</span> {folderName} <span style={{ fontSize: 9, color: '#888' }}>▼</span>
        </button>
        <span style={{
          ...pillStyle, padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          {mode === 'product' && <span style={{ fontSize: 8, color: '#86bc90' }}>●</span>}
          {modeLabel}
        </span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#888', letterSpacing: 2 }}>···</button>
      </div>
    </div>
  );
}

function Breadcrumb({ items }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888', marginBottom: 12, flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: '#ccc' }}>/</span>}
          {item.onClick ? (
            <button onClick={item.onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 12, padding: 0 }}>
              {i === 0 ? `← ${item.label}` : item.label}
            </button>
          ) : (
            <span style={{ color: '#444' }}>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Shell({ mode, currentView, onNav, children }) {
  return (
    <div style={{
      width: 800, height: 600, display: 'flex', flexDirection: 'column',
      background: '#faf9f5', overflow: 'hidden', borderRadius: 14,
      boxShadow: '0 8px 32px rgba(26,35,50,0.12), 0 2px 8px rgba(0,0,0,0.04)',
      border: '1px solid #d8d6cc',
      fontFamily: '"Noto Sans TC", -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    }}>
      <Header folderName={FIXTURES.folder} mode={mode} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <LeftRailSVG currentView={currentView} mode={mode} onNav={onNav} />
        <div style={{ flex: 1, overflow: 'hidden auto', padding: '20px 24px', background: '#faf9f5' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// Badge components
function Badge({ children, bg, color, border, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 14, fontSize: 11, fontWeight: 500,
      background: bg || '#f2f0e7', color: color || '#4a4840',
      border: border || '1px solid #e5e3d8', whiteSpace: 'nowrap',
      lineHeight: 1.4, ...style,
    }}>{children}</span>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{
      border: '1px solid #e5e3d8', borderRadius: 12, padding: 14,
      background: '#fff', boxShadow: '0 1px 2px rgba(26,35,50,0.03)', ...style,
      cursor: onClick ? 'pointer' : 'default',
    }}>{children}</div>
  );
}

function SectionCard({ children, style }) {
  return (
    <div style={{
      background: '#f2f0e7', border: '1px solid #e5e3d8', borderRadius: 12, padding: 16,
      ...style,
    }}>{children}</div>
  );
}

function EngagementRow({ likes, comments, reposts, style }) {
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#888', marginTop: 8, ...style }}>
      <span>♡ {likes}</span>
      <span>💬 {comments}</span>
      <span>🔄 {reposts}</span>
      <span>✈</span>
    </div>
  );
}

function ThreadsBadge() {
  return <Badge bg="#fff" border="1px solid #ddd"><span style={{fontSize:11}}>🧵</span> Threads</Badge>;
}

function StatusDot({ color, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ color: color || '#4a7c59', fontSize: 10 }}>●</span>
      <span style={{ fontSize: 11, color: '#666' }}>{label}</span>
    </div>
  );
}

function PrimaryButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      background: '#2f4a3a', color: '#fff', border: 'none', borderRadius: 10,
      padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      width: '100%', boxShadow: '0 1px 2px rgba(47,74,58,0.12)',
      fontFamily: 'inherit', lineHeight: 1.3, ...style,
    }}>{children}</button>
  );
}

function SecondaryButton({ children, onClick, style }) {
  return (
    <button onClick={onClick} style={{
      background: '#fff', color: '#2f4a3a', border: '1px solid #d8d6cc', borderRadius: 10,
      padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      fontFamily: 'inherit', lineHeight: 1.3, ...style,
    }}>{children}</button>
  );
}

function TextButton({ children, onClick, color, style }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', color: color || '#666', border: 'none',
      fontSize: 13, cursor: 'pointer', padding: '6px 0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      ...style,
    }}>{children}</button>
  );
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e8e8e4' }}>
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} style={{
          flex: 1, padding: '8px 16px', fontSize: 13, fontWeight: 500,
          border: 'none', cursor: 'pointer',
          background: value === opt ? '#1a2332' : '#fff',
          color: value === opt ? '#fff' : '#444',
          transition: 'all 0.15s',
        }}>{opt}</button>
      ))}
    </div>
  );
}

function Avatar({ size }) {
  const s = size || 36;
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%', background: '#ddd',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: s * 0.5, color: '#999', flexShrink: 0,
    }}>👤</div>
  );
}

Object.assign(window, {
  Shell, Header, LeftRailSVG, LeftRail, Breadcrumb,
  Badge, Card, SectionCard, EngagementRow, ThreadsBadge, StatusDot,
  PrimaryButton, SecondaryButton, TextButton, SegmentedControl, Avatar,
});
