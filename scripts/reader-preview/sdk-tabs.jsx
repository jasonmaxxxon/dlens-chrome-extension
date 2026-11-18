import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Tabs, TabsList, TabsTab, TabsIndicator, TabsPanel } from '@ui-sdk/react/tabs';

function ReaderTabs({ items, value, content, onSelect }) {
  function select(next, details) {
    if (next && next !== value && details.reason !== 'item-removed') onSelect(next);
  }
  function markScroll(event) {
    const scroller = event.currentTarget;
    scroller.closest('.reader').toggleAttribute('data-reader-scrolled', scroller.scrollTop > 0);
  }

  return (
    <Tabs className="reader-sdk" value={value} onValueChange={select}>
      <div className="reader-scroll reader-body" onScroll={markScroll}>
        <TabsList className="reader-tabs" aria-label="閱讀分頁" data-wheel-tabs="">
          {items.map(([key, label]) => (
            <TabsTab key={key} value={key} data-wheel-tab={key}>{label}</TabsTab>
          ))}
          <TabsIndicator className="reader-tab-ink" data-wheel-ink="" />
        </TabsList>
        {items.map(([key]) => (
          <TabsPanel key={key} value={key} className="reader-panel" data-wheel-pane={key}>
            {value === key && (typeof content === 'string' ? <div dangerouslySetInnerHTML={{ __html: content }} /> : content)}
          </TabsPanel>
        ))}
      </div>
    </Tabs>
  );
}

export function mountReaderTabs(host) {
  const root = createRoot(host);
  return {
    render(props) {
      // The existing workspace restores focus and scroll immediately after a navigation.
      flushSync(() => root.render(<ReaderTabs {...props} />));
    },
    unmount() { root.unmount(); },
  };
}
