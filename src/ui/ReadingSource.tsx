import {useReadingSourceFocus} from './useReadingSourceFocus';
import type {resolveReadingSource} from '../viewmodel/reading-source';
import {ReaderReply} from './ReaderReply';
import {tokens} from './tokens';
/** Already inside Chrome's side panel reader; show captured context without a network request. */
export function ReadingSource({source}:{source:ReturnType<typeof resolveReadingSource>}) {
 const target=useReadingSourceFocus(source);
 return <section data-reading-source="" aria-label="引用原文" style={{marginTop:tokens.spacing.md}}>
  {source.missing ? <p role="status">{source.missing}</p> : <>
   {source.postText ? <p>{source.postText}</p> : null}
   {source.rows.map((entry,i)=><div key={entry.id} ref={entry.target?target:undefined} tabIndex={entry.target?-1:undefined} data-reading-source-target={entry.target?entry.id:undefined} style={entry.target?{borderRadius:tokens.radius.card,outline:`${tokens.reading.sourceOutlineWidth}px solid ${tokens.deepReading.accent}`} : undefined}><ReaderReply row={entry.row} threaded={i>0}/></div>)}
  </>}
 </section>;
}
