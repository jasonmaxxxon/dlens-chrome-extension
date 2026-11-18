import React from 'react';
import { ArrowRight, LocateFixed } from 'lucide-react';

function groupStyle(group) {
  return { '--group-color': 'var(--group-' + (group.index % 3) + ')' };
}

function point(radius, angle) {
  return [100 + radius * Math.cos(angle), 100 + radius * Math.sin(angle)].join(' ');
}

function sectorPath(start, end, outer) {
  const inner = 44;
  const large = end - start > Math.PI ? 1 : 0;
  return ['M', point(outer, start), 'A', outer, outer, 0, large, 1, point(outer, end),
    'L', point(inner, end), 'A', inner, inner, 0, large, 0, point(inner, start), 'Z'].join(' ');
}

function Wheel({ groups, selected, count, likes, share }) {
  let start = -Math.PI / 2;
  const slices = groups.map(group => {
    const end = start + 2 * Math.PI * group.members.length / count;
    const gap = Math.min(.014, (end - start) / 8);
    const middle = (start + end) / 2;
    // A seven-unit band keeps zero-like groups visible on a fixed 0–100% scale.
    const outer = 51 + 38 * (likes ? group.likes / likes : 0);
    const path = sectorPath(start + gap, end - gap, outer);
    start = end;
    return (
      <path key={group.id} d={path} data-action="group" data-value={group.id}
        className={'wheel-slice' + (group.id === selected.id ? ' is-selected' : '')}
        fill="var(--group-color)" style={{ ...groupStyle(group),
          '--sector-x': (Math.cos(middle) * 4).toFixed(2) + 'px',
          '--sector-y': (Math.sin(middle) * 4).toFixed(2) + 'px' }} />
    );
  });
  return <>
    <div className="wheel-stage">
      <svg className="wheel" aria-hidden="true" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="89" fill="none" stroke="currentColor" opacity=".2" strokeDasharray="2 4"/>
        {slices}
      </svg>
      <div className="wheel-center"><span>留言</span><strong>{share(selected.members.length, count)}</strong><small>獲讚 {share(selected.likes, likes)}</small></div>
    </div>
    <p className="wheel-legend">弧寬代表留言佔比，環厚代表獲讚佔比</p>
  </>;
}

export function ReaderOverview({ groups, group, count, likes, missingLikes, groupName, pure, share, formatCount }) {
  if (!group) return <p className="empty-state">這篇貼文尚未有留言分群。</p>;

  const leading = [...groups].sort((a,b) => b.likes - a.likes || b.members.length - a.members.length)[0];
  const rep = group.members.find(c => c.id === group.representativeId)
    || [...group.members].sort((a,b) => (b.likes ?? -1) - (a.likes ?? -1))[0];
  const commentShare = share(leading.members.length, count);
  const headline = likes ? groupName(leading) + '佔 ' + commentShare + ' 留言，獲 ' + share(leading.likes, likes) + ' 讚'
    : groupName(leading) + '留言最多，佔樣本 ' + commentShare;
  const complete = group.members.every(c => Number.isFinite(c.likes) && c.likes >= 0);
  const concentration = complete && group.likes > 0
    ? ' · 佔組內讚數 ' + (rep.likes * 100 / group.likes).toLocaleString('zh-HK', {maximumFractionDigits: 1}) + '%'
    : '';
  const dot = <span className="topic-dot" aria-hidden="true" />;

  return <div className="overview">
    <div className="insight-intro">
      <div className="card-eyebrow">分群樣本</div><h3 className="insight-headline">{headline}</h3>
      <p className="sample-base">依 {count} 則分群留言、{likes} 個已知讚計算{missingLikes ? ' · ' + missingLikes + ' 則缺少讚數' : ''}</p>
    </div>
    <Wheel groups={groups} selected={group} count={count} likes={likes} share={share} />
    <div className="topic-chips topic-list" role="group" aria-label="選擇留言群組">
      {groups.map(item => <button key={item.id} className="topic-chip topic-btn" style={groupStyle(item)}
        data-action="group" data-value={item.id} aria-pressed={item.id === group.id}>{dot}{groupName(item)}</button>)}
    </div>
    <article className="focus-card" key={group.id} style={groupStyle(group)}>
      <div className="card-eyebrow">{dot}{pure ? '選取群組' : '話題焦點'}</div>
      <h3 className="focus-title">{groupName(group, true)}</h3>
      <p className="focus-metrics">{group.members.length} 則留言 · {group.likes} 個已知讚</p>
      <div className="focus-actions">
        <button className="primary-action" data-action="group-evidence">看這組原文 <span>{group.members.length}</span> <ArrowRight className="icon" size={16} aria-hidden="true"/></button>
        <button className="text-action" data-action="jump" data-value={rep.id}><LocateFixed className="icon" size={16} aria-hidden="true"/> 定位引文</button>
      </div>
      <blockquote><p>{rep.text?.trim() ? rep.text : <span className="empty-text">（擷取時沒有文字）</span>}</p>
        <footer>@{rep.author} · {formatCount(rep.likes)} 讚{concentration}</footer>
      </blockquote>
    </article>
  </div>;
}
