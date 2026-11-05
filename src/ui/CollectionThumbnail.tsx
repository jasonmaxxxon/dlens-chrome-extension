import { useState, type CSSProperties } from "react";
import type { CollectionPost } from "../viewmodel/collection-browser";
import { collectionTileTint, tokens } from "./tokens";

export function CollectionThumbnail({ post, miniature = false }: { post: CollectionPost; miniature?: boolean }) {
  const url = post.imageUrls[0];
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const size = miniature ? tokens.panel.size.avatar : tokens.panel.size.thumb;
  const hasImage = !!url && failedUrl !== url;
  const style: CSSProperties = { display: "grid", placeItems: "center", position: "relative", overflow: "hidden",
    width: size, height: size, borderRadius: miniature || !hasImage ? tokens.panel.radius.pill : tokens.panel.radius.sm, flexShrink: 0,
    ...collectionTileTint(post.author), fontFamily: tokens.font.sans, ...tokens.panel.type.title };
  const initial = [...post.author.replace(/^@+/, "").trim()][0]?.toUpperCase() || "？";
  return <span data-collection-thumbnail="" aria-hidden="true" style={style}>
    <span data-collection-type-tile="">{initial}</span>
    {hasImage ? <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
      data-collection-image-loaded={loadedUrl === url ? "true" : "false"} onLoad={() => setLoadedUrl(url)} onError={() => setFailedUrl(url)}
      style={{ display: "block", position: "absolute", inset: 0, width: size, height: size, objectFit: "cover" }} /> : null}
  </span>;
}
