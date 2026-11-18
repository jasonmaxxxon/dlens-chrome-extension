import React from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, LocateFixed } from 'lucide-react';

const LOW_CONTENT = {
  emoji_only: '只有表情',
  placeholder: '引用帖佔位',
  bookmark: '收藏記號',
  acknowledgment: '簡短回應',
  reaction: '反應用語',
  tag_friend: '標記朋友',
  very_short: '短留言',
};

function resolve(ids, byId) {
  return [...new Set(ids || [])].map(id => byId.get(id)).filter(Boolean);
}

function readableCount(value, unit) {
  return Number.isFinite(value) && value >= 0 ? `${value.toLocaleString('zh-HK')} ${unit}` : `${unit}未提供`;
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function author(comment) {
  return comment.author ? `@${comment.author}` : '作者未提供';
}

function CommentText({ comment }) {
  return <p className="captured-text">{comment.text?.trim() ? comment.text : '（擷取時沒有文字）'}</p>;
}

function Jump({ comment, children = '定位留言' }) {
  return <button type="button" className="text-action" data-action="jump" data-value={comment.id} data-jump-comment="">
    <LocateFixed size={14} aria-hidden="true" /> {children}
  </button>;
}

function statusText(status, answers) {
  if (answers.length) return status === 'answered_by_op' ? '已收錄樓主回覆' : '已收錄回覆';
  if (status === 'unanswered') return '樣本中未見回覆';
  if (status === 'replies_not_captured') return '有回覆，未擷取到原文';
  if (status === 'answered' || status === 'answered_by_op') return '已標記為有回覆，原文未收錄';
  return '回覆狀態未提供';
}

export function QuestionsPanel({ questions, commentsById }) {
  return <section className="reader-details questions">
    <header className="section-heading"><h3>留言中的提問</h3><p>快照收錄 {questions.length} 個問題</p></header>
    {questions.map(question => {
      const comment = commentsById.get(question.id);
      if (!comment) return null;
      const answers = resolve(question.answerIds, commentsById);
      return <article key={comment.id} className="detail-entry">
        <header className="detail-meta"><strong>{author(comment)}</strong><span>{statusText(question.status, answers)}</span></header>
        <CommentText comment={comment} /><Jump comment={comment}>定位問題</Jump>
        {answers.map(answer => <div key={answer.id} className="answer">
          <strong>{author(answer)} 回覆</strong><CommentText comment={answer}/><Jump comment={answer}>定位回覆</Jump>
        </div>)}
      </article>;
    })}
  </section>;
}

export function MethodsPanel({ methods, commentsById }) {
  return <section className="reader-details methods">
    <header className="section-heading"><h3>留言中提到的做法</h3><p>依原留言整理</p></header>
    {methods.map((method, index) => {
      const sources = resolve(method.ids, commentsById);
      if (!sources.length) return null;
      const example = sources[0];
      return <article key={index} className="detail-entry method-card">
        <h4>{method.title}</h4>
        <blockquote><CommentText comment={example} /><footer>{author(example)} · {readableCount(example.likes, '讚')}</footer></blockquote>
        <div className="detail-actions">
          <button type="button" className="text-action" data-action="method-evidence" data-value={index}>
            查看 {sources.length} 則來源 <ArrowRight size={14} aria-hidden="true" />
          </button>
          <Jump comment={example}>定位引文</Jump>
        </div>
      </article>;
    })}
  </section>;
}

function ParentContext({ parent }) {
  const chars = Array.from(parent.text || '');
  const excerpt = chars.length > 48 ? chars.slice(0, 48).join('') + '…' : chars.join('');
  const url = publicUrl(parent.url);
  return <div className="parent-context">
    <span>回覆 </span>
    {url ? <a href={url.href} data-action="jump" data-value={parent.id}>{author(parent)}</a> : author(parent)}
    {excerpt && <span>「{excerpt}」</span>}
  </div>;
}

function SourceLinks({ links }) {
  return links.map(({ url, title }) => {
    const href = publicUrl(url);
    return href ? <div className="source-reference" key={href.href}>
      <span>{href.hostname}</span>
      <a href={href.href} target="_blank" rel="noopener noreferrer">{title || href.href} <ArrowUpRight size={14} aria-hidden="true" /></a>
    </div> : null;
  });
}

function EvidenceComment({ comment, post, parent, flag, links }) {
  return <article className="detail-entry evidence-card" data-evidence-id={comment.id}>
    <header className="detail-meta">
      <strong>{author(comment)}{post.author && comment.author === post.author && ' · 樓主'}</strong>
      <span>{readableCount(comment.likes, '讚')} · {readableCount(comment.replies, '回覆')}</span>
    </header>
    {flag && <small>{LOW_CONTENT[flag] || '低資訊留言'}</small>}
    <CommentText comment={comment}/>
    <Jump comment={comment} />
    {parent && <ParentContext parent={parent} />}
    <SourceLinks links={links} />
  </article>;
}

export function EvidencePanel({ post, groups, groupName, filter, from, methods, commentsById }) {
  const method = from?.kind === 'method' ? methods[from.index] : null;
  const links = (post.links || []).filter(link => publicUrl(link.url));
  const flags = new Map((post.lowContent || []).map(item => [item.id, item.flag]));
  const scopes = [
    { id: 'all', label: '全部', rows: post.comments },
    { id: 'top', label: '高讚選錄', rows: resolve(post.topIds, commentsById) },
    { id: 'op', label: '樓主回覆', rows: post.comments.filter(c => post.author && c.author === post.author) },
    { id: 'links', label: '附連結', rows: resolve(links.flatMap(item => item.ids), commentsById) },
    { id: 'low', label: '低資訊', rows: resolve(flags.keys(), commentsById) },
    ...groups.map(group => ({ id: group.id, label: groupName(group), rows: group.members })),
  ].filter(scope => scope.rows.length || scope.id === 'all');
  const scope = scopes.find(item => item.id === filter) || scopes[0];
  const rows = method ? resolve(method.ids, commentsById) : scope.rows;
  const heading = method?.title || (scope.id === 'all' ? '全部留言原文' : scope.label);
  const sorted = [...rows].sort((a,b) => (b.likes ?? -1) - (a.likes ?? -1));
  return <section className="reader-details evidence">
    {from && <button type="button" className="text-action back-action" data-action="back-evidence">
      <ArrowLeft size={14} aria-hidden="true"/> 返回{method ? '留言做法' : '話題焦點'}
    </button>}
    <header className="section-heading"><h3>{heading}</h3><p>{rows.length} 則原文 · 依讚數排列</p></header>
    {!method && <div className="filters" role="group" aria-label="篩選全帖的已擷取留言">
      {scopes.map(item => <button key={item.id} type="button" className="filter-chip" aria-pressed={scope.id === item.id}
        data-action="filter" data-value={item.id}>{item.label} {item.rows.length}</button>)}
    </div>}
    {sorted.map(comment => <EvidenceComment key={comment.id} comment={comment} post={post}
      parent={commentsById.get(comment.parentId)} flag={flags.get(comment.id)}
      links={links.filter(item => item.ids.includes(comment.id))} />)}
  </section>;
}
