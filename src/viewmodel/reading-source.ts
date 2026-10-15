import type { SessionItem } from '../state/types';
import {readCrawlComments, readOpHandle, normalizeHandle} from '../compare/inline-reading';
import {buildReplyThreads} from '../compare/reply-thread';
import {inlineReplyRow} from './inline-card';
import {threadsReplyUrl} from '../compare/deep-reading';
export interface ReadingSourceRef {itemId:string;captureId:string;commentId?:string;url?:string|null}
/** Only the cited capture may satisfy a source. Never substitute the same id from a later capture. */
export function resolveReadingSource(items:SessionItem[],ref:ReadingSourceRef) {
 const item=items.find(i=>i.id===ref.itemId);
 if(!item || item.latestCapture?.id!==ref.captureId)return {missing:'原留言已唔喺最新抓取入面',rows:[],url:null};
 if(!ref.commentId)return {missing:null,rows:[],postText:typeof item.latestCapture.result?.canonical_post?.text==='string' ? item.latestCapture.result.canonical_post.text : item.descriptor.text_snippet || '',url:threadsReplyUrl(item.descriptor.post_url)};
 const op=normalizeHandle(readOpHandle(item));
 const thread=buildReplyThreads(readCrawlComments(item),op);
 const cited=thread.find(c=>c.id===ref.commentId);
 if(!cited)return {missing:'原留言已唔喺最新抓取入面',rows:[],url:null};
 const chain=[cited];const seen=new Set([cited.id]);let current=cited;
 while(current.answers){const parent=thread.find(c=>c.id===current.answers);if(!parent || seen.has(parent.id))break;seen.add(parent.id);chain.unshift(parent);current=parent;}
 chain.push(...thread.filter(c=>c.answers===cited.id && !seen.has(c.id)));
 const raw=item.latestCapture.result?.comments?.find(c=>(c.comment_id || c.source_comment_id)===cited.id);
 return {missing:null,url:threadsReplyUrl(raw?.url),rows:chain.map(c=>({id:c.id,target:c.id===cited.id,row:inlineReplyRow(c,op)}))};
}
