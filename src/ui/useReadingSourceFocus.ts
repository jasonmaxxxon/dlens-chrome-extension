import {useEffect,useRef} from 'react';
/** Source disclosure owns the element; the hook owns focus and scroll effects. */
export function useReadingSourceFocus(source:unknown) {
 const target=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  target.current?.scrollIntoView?.({block:'nearest'});
  target.current?.focus({preventScroll:true});
 },[source]);
 return target;
}
