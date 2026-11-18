(() => {
  'use strict';

  const posts = JSON.parse(document.querySelector('#capture-data').textContent);
  const app = document.querySelector('#app');
  const dateFormat = new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium', timeZone: 'Asia/Hong_Kong' });
  const iconPaths = {
    heart: '<path d="M20.8 8c0 4.5-5.1 7.9-8.8 11C8.3 15.9 3.2 12.5 3.2 8a4.6 4.6 0 0 1 8.8-1.8A4.6 4.6 0 0 1 20.8 8Z"/>',
    reply: '<path d="M20.5 11.5a8.3 8.3 0 0 1-8.5 8.2 10 10 0 0 1-3.5-.6l-5 1.1 1.2-4.3a8 8 0 0 1-1.3-4.4 8.5 8.5 0 0 1 17.1 0Z"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    external: '<path d="M14 4h6v6m0-6L9 15m1-10H5v14h14v-5"/>',
    back: '<path d="m10 6-6 6 6 6M4 12h15"/>',
    locate: '<circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  };
  function icon(name) {
    return '<svg class="icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + iconPaths[name] + '</svg>';
  }
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const known = value => Number.isFinite(value) && value >= 0;
  const formatCount = value => known(value) ? value.toLocaleString('zh-HK') : '未提供';
  const share = (value, total) => total > 0 ? Math.round(value * 100 / total) + '%' : '—';
  const visibleText = text => (text || '').trim() ? escape(text) : '<span class="empty-text">（擷取時沒有文字）</span>';
  function sourceLink(url, label) {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' && /^(www\.)?threads\.(net|com)$/.test(target.hostname)) {
        return '<a class="source-link text-action" rel="noopener noreferrer" target="_blank" href="' + escape(target.href) + '">' + label + ' ' + icon('external') + '</a>';
      }
    } catch { /* A capture may have no public URL. */ }
    return '';
  }
  function dated(value) {
    const date = new Date(value);
    return value && Number.isFinite(date.getTime()) ? dateFormat.format(date) : '';
  }

  let post, groups, grouped, commentsById, methods, totalLikes, missingLikes;
  let selected, tab, pure = false, filter, from, jumpTrigger, mobileSource = false;

  function loadPost(value) {
    post = posts.find(item => item.id === value) || posts[0];
    if (!post) {
      app.textContent = '未有可閱讀的貼文。';
      return;
    }
    commentsById = new Map(post.comments.map(c => [c.id, c]));
    groups = post.groups.map((group, index) => {
      const members = post.comments.filter(c => c.groupId === group.id);
      return { ...group, index, members, likes: members.reduce((sum, c) => sum + (known(c.likes) ? c.likes : 0), 0) };
    }).filter(group => group.members.length);
    grouped = groups.flatMap(group => group.members);
    totalLikes = groups.reduce((sum, group) => sum + group.likes, 0);
    missingLikes = grouped.filter(c => !known(c.likes)).length;
    methods = (post.methods || []).map(method => ({ ...method, ids: [...new Set(method.ids)].filter(id => commentsById.has(id)) })).filter(method => method.ids.length);
    selected = [...groups].sort((a,b) => b.likes - a.likes || b.members.length - a.members.length)[0]?.id;
    tab = 'overview'; filter = 'all'; from = null; jumpTrigger = null; mobileSource = false;
    renderShell();
  }
  const current = () => groups.find(group => group.id === selected);
  function groupName(group, full = false) {
    return pure ? '群組 ' + (group.index + 1) : (full ? group.label : group.short) || group.label;
  }
  function groupStyle(group) {
    return '--group-color:var(--group-' + (group.index % 3) + ');--topic-color:var(--group-color)';
  }
  const dot = '<span class="topic-dot" aria-hidden="true"></span>';
  function avatar(author, large = false) {
    return '<span class="avatar' + (large ? ' avatar-large' : '') + '" aria-hidden="true">' + escape((author || '？').slice(0,1).toUpperCase()) + '</span>';
  }
  function replyStats(c) {
    return '<span class="metric" aria-label="' + formatCount(c.likes) + ' 讚">' + icon('heart') + ' ' + formatCount(c.likes) + '</span>';
  }
  function feedReply(c) {
    return '<article class="comment feed-reply" data-comment-id="' + escape(c.id) + '" tabindex="-1">' +
      avatar(c.author) + '<div class="comment-main"><div class="comment-meta"><strong class="comment-author">@' + escape(c.author) + '</strong>' +
      (c.author === post.author ? '<span class="author-tag">樓主</span>' : '') + '</div><p class="comment-text">' +
      visibleText(c.text) + '</p><div class="comment-actions">' + replyStats(c) + ' ' + sourceLink(c.url, 'Threads') + '</div></div></article>';
  }
  function feedMarkup() {
    const ordered = [...post.comments].sort((a,b) => (b.likes ?? -1) - (a.likes ?? -1));
    return '<div class="feed-heading"><h2>原帖與留言</h2><button class="text-action mobile-only return-reader" data-action="return">' + icon('back') + ' 返回分析</button></div>' +
      '<div class="feed-scroll"><article class="post-card"><div class="post-meta">' + avatar(post.author, true) +
      '<div><strong>@' + escape(post.author) + '</strong><div class="post-date">擷取於 ' + escape(dated(post.capturedAt)) + '</div></div>' +
      sourceLink(post.url, '開啟原帖') + '</div><p class="post-body">' + visibleText(post.text) +
      '</p><div class="metrics"><span class="metric">' + icon('heart') + ' ' + formatCount(post.postLikes) + ' 讚</span>' +
      '<span class="metric">' + icon('reply') + ' ' + formatCount(post.totalReplies) + ' 回覆</span></div></article>' +
      '<div class="replies-heading"><h3>已擷取留言 <span>' + ordered.length + '</span></h3><small>依讚數排列</small></div>' +
      '<div class="reply-list">' + ordered.map(feedReply).join('') + '</div></div>';
  }
  function renderShell() {
    const options = posts.map(item => '<option value="' + escape(item.id) + '"' + (item.id === post.id ? ' selected' : '') + '>' + escape(item.title || '@' + item.author) + '</option>').join('');
    app.innerHTML = '<header class="topbar"><div class="topbar-inner"><div class="brand"><svg class="brand-mark" width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><g fill="none" stroke="#fff" stroke-width="2"><circle cx="16" cy="16" r="9"/><path d="M16 7v9l7 5"/></g></svg><strong>DLens</strong></div>' +
      '<span class="workspace-label work-title">貼文閱讀室</span><label class="post-switch post-picker"><span>切換貼文</span><select aria-label="切換貼文">' + options + '</select></label></div></header>' +
      '<main class="workspace"><section class="feed" aria-label="原帖與留言">' + feedMarkup() + '</section>' +
      '<aside class="reader" aria-label="留言分析"><div class="reader-header reader-head"></div><div class="reader-tabs" role="tablist" aria-label="閱讀分頁"></div><div class="reader-scroll reader-body" id="reader-pane" role="tabpanel"></div></aside></main>';
    renderReader();
  }
  function tabs() {
    return [['overview','概覽'], ...(!pure && methods.length ? [['methods','留言做法']] : []), ['evidence','原文']];
  }
  function renderReader() {
    const head = app.querySelector('.reader-head');
    head.innerHTML = '<div class="reader-heading-row"><h2 class="reader-title">留言分析</h2><div class="layer-switch" role="group" aria-label="顯示內容">' +
      [['full','綜合'],['pure','純統計']].map(([key,label]) => '<button data-action="mode" data-value="' + key + '" aria-pressed="' + ((key === 'pure') === pure) + '">' + label + '</button>').join('') +
      '</div></div><div class="coverage">平台回覆 ' + formatCount(post.totalReplies) + ' <span>·</span> 已擷取 ' + post.comments.length + ' <span>·</span> 已分群 ' + grouped.length + '</div>' +
      '<button class="mobile-only view-source text-action" data-action="source">查看原帖與留言 ' + icon('arrow') + '</button>';
    app.querySelector('.reader-tabs').innerHTML = tabs().map(([key,label]) => '<button id="tab-' + key + '" role="tab" aria-controls="reader-pane" aria-selected="' + (tab === key) + '" tabindex="' + (tab === key ? 0 : -1) + '" data-action="tab" data-value="' + key + '">' + label + '</button>').join('');
    const panel = app.querySelector('.reader-body');
    panel.setAttribute('aria-labelledby', 'tab-' + tab);
    panel.innerHTML = tab === 'overview' ? overview() : tab === 'methods' ? methodList() : evidence();
  }
  function wheel(group) {
    const inner = 44, maximum = 89;
    let angle = -Math.PI / 2;
    const point = (r,a) => [100 + r * Math.cos(a), 100 + r * Math.sin(a)].join(' ');
    const paths = groups.map(g => {
      const end = angle + 2 * Math.PI * g.members.length / grouped.length;
      const pad = Math.min(.014, (end-angle)/8), a = angle + pad, z = end - pad;
      angle = end;
      // A constant 7-unit band keeps a zero-like group selectable; the extra thickness uses a fixed 0–100% scale.
      const outer = inner + 7 + (maximum-inner-7) * (totalLikes ? g.likes / totalLikes : 0);
      const flag = z-a > Math.PI ? 1 : 0;
      const path = ['M',point(outer,a),'A',outer,outer,0,flag,1,point(outer,z),'L',point(inner,z),'A',inner,inner,0,flag,0,point(inner,a),'Z'].join(' ');
      return '<path class="wheel-slice' + (g === group ? ' is-selected' : '') + '" fill="var(--group-color)" style="' + groupStyle(g) + '" data-action="group" data-value="' + escape(g.id) + '" d="' + path + '"/>';
    }).join('');
    return '<div class="wheel-stage"><svg class="wheel" aria-hidden="true" viewBox="0 0 200 200"><circle cx="100" cy="100" r="89" fill="none" stroke="currentColor" opacity=".2" stroke-dasharray="2 4"/>' + paths +
      '</svg><div class="wheel-center"><span>留言</span><strong>' + share(group.members.length,grouped.length) + '</strong><small>獲讚 ' + share(group.likes,totalLikes) +
      '</small></div></div><p class="wheel-legend">弧寬代表留言佔比，環厚代表獲讚佔比</p>';
  }
  function groupPills() {
    return '<div class="topic-chips topic-list" role="group" aria-label="選擇留言群組">' + groups.map(g =>
      '<button class="topic-chip topic-btn" style="' + groupStyle(g) + '" data-action="group" data-value="' + escape(g.id) + '" aria-pressed="' + (g.id === selected) + '">' + dot + escape(groupName(g)) + '</button>').join('') + '</div>';
  }
  function overview() {
    const group = current();
    if (!group) return '<p class="empty-state">這篇貼文尚未有留言分群。</p>';
    const leading = [...groups].sort((a,b) => b.likes-a.likes || b.members.length-a.members.length)[0];
    const rep = group.members.find(c => c.id === group.representativeId) || [...group.members].sort((a,b) => (b.likes ?? -1)-(a.likes ?? -1))[0];
    const leadingName = escape(groupName(leading));
    const commentShare = share(leading.members.length, grouped.length);
    const headline = totalLikes
      ? leadingName + '佔 ' + commentShare + ' 留言，獲 ' + share(leading.likes, totalLikes) + ' 讚'
      : leadingName + '留言最多，佔樣本 ' + commentShare;
    const fullLikeCounts = group.members.every(c => known(c.likes));
    const concentration = fullLikeCounts && group.likes > 0 && known(rep.likes)
      ? ' · 佔組內讚數 ' + new Intl.NumberFormat('zh-HK', {maximumFractionDigits:1}).format(rep.likes * 100 / group.likes) + '%'
      : '';
    const note = missingLikes ? ' · ' + missingLikes + ' 則缺少讚數' : '';
    return '<div class="overview"><div class="insight-intro"><div class="card-eyebrow">分群樣本</div><h3 class="insight-headline">' + headline +
      '</h3><p class="sample-base">依 ' + grouped.length + ' 則分群留言、' + totalLikes + ' 個已知讚計算' + note + '</p></div>' + wheel(group) + groupPills() +
      '<article class="focus-card" style="' + groupStyle(group) + '"><div class="card-eyebrow">' + dot + (pure ? '選取群組' : '話題焦點') + '</div>' +
      '<h3 class="focus-title">' + escape(groupName(group,true)) + '</h3><p class="focus-metrics">' + group.members.length + ' 則留言 · ' + group.likes + ' 個已知讚</p>' +
      '<div class="focus-actions"><button class="primary-action" data-action="group-evidence">看這組原文 <span>' + group.members.length + '</span> ' + icon('arrow') + '</button>' +
      '<button class="text-action" data-action="jump" data-value="' + escape(rep.id) + '">' + icon('locate') + ' 定位引文</button></div>' +
      '<blockquote><p>' + visibleText(rep.text) + '</p><footer>@' + escape(rep.author) + ' · ' + formatCount(rep.likes) + ' 讚' + concentration + '</footer></blockquote></article></div>';
  }
  function methodList() {
    return '<div class="methods"><div class="section-heading"><h3>留言中提到的做法</h3><p>依原留言整理</p></div>' + methods.map((method,index) =>
      '<article class="method-card"><h3>' + escape(method.title) + '</h3><button class="text-action" data-action="method-evidence" data-value="' + index + '">查看 ' + method.ids.length + ' 則來源 ' + icon('arrow') + '</button></article>').join('') + '</div>';
  }
  function evidence() {
    const method = from?.kind === 'method' ? methods[from.index] : null;
    const rows = method ? method.ids.map(id => commentsById.get(id)) : filter === 'all' ? post.comments : groups.find(g => g.id === filter)?.members || [];
    const sorted = [...rows].sort((a,b) => (b.likes ?? -1)-(a.likes ?? -1));
    return '<div class="evidence">' + (from ? '<button class="text-action back-action" data-action="back-evidence">' + icon('back') + ' 返回' + (method ? '留言做法' : '話題焦點') + '</button>' : '') +
      '<div class="section-heading"><h3>' + (method ? escape(method.title) : '留言原文') + '</h3><p>' + rows.length + ' 則 · 依讚數排列</p></div>' +
      (!method ? '<div class="filters" role="group" aria-label="按群組篩選原文">' + [['all','全部'],...groups.map(g => [g.id,groupName(g)])].map(([id,label]) => '<button class="filter-chip" aria-pressed="' + (id === filter) + '" data-action="filter" data-value="' + escape(id) + '">' + escape(label) + '</button>').join('') + '</div>' : '') +
      sorted.map(c => '<article class="evidence-card"><div class="evidence-meta"><strong>@' + escape(c.author) + '</strong>' + replyStats(c) + '</div><p>' +
        visibleText(c.text) + '</p><button class="text-action" data-action="jump" data-value="' + escape(c.id) + '">' + icon('locate') + ' 定位留言</button></article>').join('') + '</div>';
  }
  function setTab(next) {
    if (next === 'evidence' && tab !== 'evidence') { filter = tab === 'overview' && selected ? selected : 'all'; from = tab === 'overview' && selected ? {kind:'group'} : null; }
    if (next !== 'evidence') from = null;
    tab = next; renderReader();
    app.querySelector('.reader-body').scrollTop = 0;
    app.querySelector('#tab-' + tab).focus({preventScroll:true});
  }
  function revealSource(id) {
    const trigger = document.activeElement;
    if (trigger instanceof HTMLElement && trigger.closest('.reader')) jumpTrigger = trigger;
    mobileSource = true;
    app.querySelector('.workspace').classList.add('show-source');
    const previous = app.querySelector('.is-target');
    if (previous) previous.classList.remove('is-target');
    const target = id ? [...app.querySelectorAll('.feed-reply')].find(row => row.dataset.commentId === id) : app.querySelector('.feed-heading');
    if (!target) return;
    if (id) target.classList.add('is-target');
    if (!id) {
      target.setAttribute('tabindex', '-1');
      app.querySelector('.feed-scroll').scrollTop = 0;
    }
    target.focus({preventScroll:true});
    target.scrollIntoView({behavior:'instant',block:id ? 'center':'start'});
  }
  function returnReader() {
    mobileSource = false;
    app.querySelector('.workspace').classList.remove('show-source');
    if (jumpTrigger?.isConnected) jumpTrigger.focus();
    else app.querySelector('#tab-' + tab)?.focus();
  }
  app.addEventListener('change', event => {
    if (event.target.matches('.post-switch select')) {
      loadPost(event.target.value);
      app.querySelector('.post-switch select').focus({preventScroll:true});
    }
  });
  app.addEventListener('click', event => {
    const node = event.target.closest('[data-action]');
    if (!node) return;
    const {action,value} = node.dataset;
    switch (action) {
      case 'tab': setTab(value); return;
      case 'source': revealSource(null); return;
      case 'jump': revealSource(value); return;
      case 'return': returnReader(); return;
      case 'group':
        selected = value; renderReader();
        [...app.querySelectorAll('.topic-chip')].find(button => button.dataset.value === value)?.focus({preventScroll:true});
        return;
      case 'mode':
        pure = value === 'pure';
        if (pure && (tab === 'methods' || from?.kind === 'method')) { tab = 'overview'; filter = 'all'; from = null; }
        renderReader();
        app.querySelector('.layer-switch [aria-pressed="true"]').focus({preventScroll:true});
        return;
      case 'group-evidence': tab = 'evidence'; filter = selected; from = {kind:'group'}; break;
      case 'method-evidence': tab = 'evidence'; from = {kind:'method', index:Number(value)}; break;
      case 'back-evidence': tab = from?.kind === 'method' ? 'methods' : 'overview'; from = null; break;
      case 'filter':
        filter = value; from = null; renderReader();
        app.querySelector('.filters [aria-pressed="true"]').focus({preventScroll:true}); return;
      default: return;
    }
    renderReader(); app.querySelector('.reader-body').scrollTop = 0;
    app.querySelector('#tab-' + tab).focus({preventScroll:true});
  });
  app.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobileSource) { returnReader(); return; }
    if (!event.target.closest('[role="tab"]')) return;
    const keys = tabs().map(([key]) => key), index = keys.indexOf(tab);
    const next = { ArrowRight: (index+1)%keys.length, ArrowLeft: (index+keys.length-1)%keys.length, Home: 0, End: keys.length-1 }[event.key];
    if (next !== undefined) { event.preventDefault(); setTab(keys[next]); }
  });
  loadPost(posts[0]?.id);
})();
