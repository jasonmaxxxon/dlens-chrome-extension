import React from 'react';
import { ArrowRight, Check, LocateFixed } from 'lucide-react';

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
    <p className="wheel-legend">弧寬＝留言 · 環厚＝獲讚</p>
  </>;
}

function RepresentativeQuote({ comment, group, formatCount, showConcentration }) {
  const complete = group.members.every(c => Number.isFinite(c.likes) && c.likes >= 0);
  const concentration = showConcentration && complete && group.likes > 0
    ? ' · 佔組內讚數 ' + (comment.likes * 100 / group.likes).toLocaleString('zh-HK', {maximumFractionDigits: 1}) + '%'
    : '';
  return <blockquote><p>{comment.text?.trim() ? comment.text : <span className="empty-text">（擷取時沒有文字）</span>}</p>
    <footer>
      <span>@{comment.author} · {formatCount(comment.likes)} 讚{concentration}</span>
      <button className="text-action" data-action="jump" data-value={comment.id}><LocateFixed size={14} aria-hidden="true"/> 定位引文</button>
    </footer>
  </blockquote>;
}

export function ReaderOverview({ groups, group, count, likes, missingLikes, groupName, share, formatCount, pure, reading = [] }) {
  if (!group) return <p className="empty-state">這篇貼文尚未有留言分群。</p>;

  const ranked = [...groups].sort((a, b) => b.members.length - a.members.length || a.index - b.index);
  const discussed = ranked[0];
  const liked = ranked.reduce((best, item) => item.likes > best.likes ? item : best);
  const audience = groupName(discussed) + '佔 ' + share(discussed.members.length, count) + ' 留言';
  const comparison = liked.id === discussed.id ? '，獲 ' : '，' + groupName(liked) + '獲 ';
  const headline = likes ? audience + comparison + share(liked.likes, likes) + (missingLikes ? ' 已知讚' : ' 讚') : audience;
  const byId = new Map(group.members.map(comment => [comment.id, comment]));
  const quotes = [...new Set([group.representativeId, ...(group.evidenceIds || [])])]
    .map(id => byId.get(id)).filter(Boolean);
  if (!quotes.length) quotes.push(group.members.reduce((best, c) => (c.likes ?? -1) > (best.likes ?? -1) ? c : best));

  return <div className="overview">
    <div className="insight-intro">
      <h3 className="insight-headline">{headline}</h3>
      <p className="sample-base">依 {count} 則分群留言、{likes} 個已知讚計算{missingLikes ? ' · ' + missingLikes + ' 則缺少讚數' : ''}</p>
    </div>
    <div className={'overview-graphic' + (!pure && reading.length ? ' with-reading' : '')}>
      <div className="overview-wheel"><Wheel groups={groups} selected={group} count={count} likes={likes} share={share} /></div>
      {!pure && reading.length > 0 && <div className="reading-extract">
        <div className="reading-credit">編輯摘讀</div>
        {reading.map(clause => <p key={clause.id}><button className="reading-clause" data-action="jump" data-value={clause.id}
          aria-label={clause.text + '，定位原文'}>{clause.text}</button></p>)}
      </div>}
    </div>
    <div className="topic-comparison" role="group" aria-label="比較並選擇留言群組">
      <div className="comparison-head" aria-hidden="true"><span>話題</span><span>留言佔比</span><span>{missingLikes ? '已知讚佔比' : '獲讚佔比'}</span></div>
      {ranked.map(item => <button key={item.id} className="topic-chip" data-action="group"
        data-value={item.id} aria-pressed={item.id === group.id}
        aria-label={groupName(item) + '，' + item.members.length + ' 則，佔留言 ' + share(item.members.length, count) + '，佔已知讚 ' + share(item.likes, likes)}>
        <span className="topic-name">{groupName(item)}<Check className="topic-check" size={13} aria-hidden="true"/></span>
        <span><small>{item.members.length} 則</small>{share(item.members.length, count)}</span>
        <span>{share(item.likes, likes)}</span>
      </button>)}
    </div>
    <article className="focus-card" key={group.id}>
      <h3 className="focus-title">{groupName(group, true)}</h3>
      <div className="focus-metrics">
        <button className="text-action" data-action="group-evidence">查看 {group.members.length} 則原文 <ArrowRight size={14} aria-hidden="true"/></button>
        <span>{group.likes} 個已知讚</span>
      </div>
      <RepresentativeQuote comment={quotes[0]} group={group} formatCount={formatCount} showConcentration />
      {quotes.length > 1 && <details className="other-quotes">
        <summary>其他代表留言（{quotes.length - 1}）</summary>
        {quotes.slice(1).map(comment => <RepresentativeQuote key={comment.id} comment={comment} group={group} formatCount={formatCount}/>)}
      </details>}
    </article>
  </div>;
}
