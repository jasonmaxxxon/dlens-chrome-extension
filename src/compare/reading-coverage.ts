/** Snapshot at input construction; never reconstruct coverage from a completed result. */
export interface ReadingCoverage {
 posts:{included:number;omitted:number;captured:number};
 bodyCharacters:{sent:number;captured:number};
 replyQuotes:{sent:number;captured:number};
 summaries:{sent:number;available:number};
 reductions:({kind:'summaries-cleared'|'replies-cleared'|'replies-selected'|'replies-cut'|'posts-dropped'}|{kind:'bodies-cut';limit:number})[];
}
export function normalizeReadingCoverage(value:unknown):ReadingCoverage|undefined {
 if(!value || typeof value!=='object')return undefined;
 const c=value as ReadingCoverage;
 const pair=(v:unknown,names:string[])=>!!v && typeof v==='object' && names.every(k=>Number.isInteger((v as Record<string,number>)[k]) && (v as Record<string,number>)[k]>=0);
 if(!pair(c.posts,['included','omitted','captured']) || !pair(c.bodyCharacters,['sent','captured']) || !pair(c.replyQuotes,['sent','captured']) || !pair(c.summaries,['sent','available']) || !Array.isArray(c.reductions))return undefined;
 if(!c.reductions.every(r=>r && (r.kind==='bodies-cut' ? Number.isInteger(r.limit) && r.limit>0 : ['summaries-cleared','replies-cleared','replies-selected','replies-cut','posts-dropped'].includes(r.kind))))return undefined;
 return c;
}
export function readingCoverageLabel(c:ReadingCoverage|undefined):string {
 if(!c)return '覆蓋：未知';
 const bodyCap=c.reductions.filter((r):r is {kind:'bodies-cut';limit:number}=>r.kind==='bodies-cut').at(-1)?.limit;
 const notes=[c.reductions.some(r=>r.kind==='summaries-cleared')?'預分析已移除':'',c.reductions.some(r=>r.kind==='replies-cleared')?'留言原句已移除':'',c.reductions.some(r=>r.kind==='replies-cut')?'留言原句已縮短':'',c.reductions.some(r=>r.kind==='replies-selected')?'留言經抽樣':'',c.posts.omitted?`${c.posts.omitted} 篇未納入`:''].filter(Boolean);
 const captured=c.replyQuotes.captured>c.replyQuotes.sent?`（已抓取 ${c.replyQuotes.captured} 則）`:'';
 const summaries=c.summaries.available?` · ${c.summaries.sent} 份預分析`:'';
 return `送入模型：${c.posts.included} 篇正文${bodyCap?`（截至 ${bodyCap} 字）`:''} · ${c.replyQuotes.sent} 則留言原句${captured}${summaries}${notes.length?`。${notes.join('；')}`:''}`;
}
