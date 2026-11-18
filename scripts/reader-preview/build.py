"""Build an offline reading workspace from saved DLens GET /captures/{id} JSON files."""

import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit


HERE = Path(__file__).resolve().parent
DEFAULT_OUTPUT = HERE.parents[1] / "docs/mockups/2026-11-18-google-reader.html"

# These are editorial navigation labels. The backend owns the cluster membership.
# Key them by representative comment ID so a changed clustering cannot reuse an old label.
POST_TITLES = {
    "DfoQFMIEo3P": "Claude 在香港的使用限制",
    "DfhH6abmnuL": "黃仁勳新聞與存款討論",
}
GROUP_LABELS = {
    "DfoXjosEyC5": ("外國身份與香港身份證的驗證問題", "身份驗證"),
    "DfoRxpbkuAF": ("香港面對的服務限制", "地區限制"),
    "DfoR8XUjGZp": ("帳號風控與替代工具", "帳號與工具"),
    "DfhL5OIGUWX": ("一位留言者的金融選擇", "個人選擇"),
    "DfhTyf9mb-D": ("讀者追問幾則新聞之間的關係", "新聞脈絡"),
    "DfhfraCkWwy": ("存款問題涉及哪些地區", "影響範圍"),
}
METHODS = {
    "DfoQFMIEo3P": [
        ("改用本地語言模型", ["DfoShjeEljx"]),
        ("用 Arena 尋找替代工具", ["DfoXGDNE23g"]),
        ("改用 Kimi", ["DforhkwGtzP", "DfoSy5ok6OE"]),
    ]
}


def threads_url(value):
    if not isinstance(value, str):
        return None
    parsed = urlsplit(value)
    hosts = {"threads.net", "www.threads.net", "threads.com", "www.threads.com"}
    if parsed.scheme == "https" and parsed.netloc in hosts and "/post/" in parsed.path:
        return value
    return None


def project(capture):
    result = capture["result"]
    post = result["canonical_post"]
    post_id = post["post_id"]
    analysis = capture.get("analysis") or {}
    model = result["thread_read_model"]
    replies = model["discussion_replies"]
    reply_ids = {reply["comment_id"] for reply in replies}
    if len(reply_ids) != len(replies):
        raise ValueError(f"{post_id}: duplicate comment IDs")

    membership = {}
    groups = []
    group_ids = set()
    for index, cluster in enumerate(analysis.get("clusters") or [], 1):
        key = str(cluster["cluster_key"])
        ids = cluster["member_comment_ids"]
        if key in group_ids or len(ids) != cluster["comment_count"]:
            raise ValueError(f"{post_id}: invalid cluster {key}")
        group_ids.add(key)
        for comment_id in ids:
            if comment_id not in reply_ids or comment_id in membership:
                raise ValueError(f"{post_id}: invalid cluster member {comment_id}")
            membership[comment_id] = key
        representative = cluster.get("top_comment_id")
        if representative is not None and representative not in ids:
            raise ValueError(f"{post_id}: representative outside cluster {key}")
        neutral = f"留言組 {index}"
        label, short = GROUP_LABELS.get(representative, (neutral, neutral))
        groups.append(dict(id=key, label=label, short=short, representativeId=representative))

    comments = [
        dict(
            id=reply["comment_id"],
            author=reply.get("author") or "",
            text=reply.get("text") or "",
            likes=reply.get("like_count"),
            replies=reply.get("reply_count"),
            groupId=membership.get(reply["comment_id"]),
            url=threads_url(reply.get("source_locator")),
            parentId=reply.get("parent_comment_id"),
        )
        for reply in replies
    ]
    methods = []
    for title, source_ids in METHODS.get(post_id, []):
        ids = [item for item in source_ids if item in membership]
        if ids:
            methods.append(dict(title=title, ids=ids))
    metrics = post.get("metrics") or {}
    return dict(
        id=post_id,
        title=POST_TITLES.get(post_id, post["text"][:32]),
        author=post["author"],
        text=model.get("assembled_content") or post["text"],
        url=threads_url(post.get("url")),
        capturedAt=result.get("fetched_at") or capture.get("captured_at"),
        totalReplies=metrics.get("reply_count"),
        postLikes=metrics.get("likes"),
        groups=groups,
        comments=comments,
        methods=methods,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("captures", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if args.output.suffix.lower() != ".html":
        parser.error("output must be an HTML file")
    posts = [project(json.loads(path.read_text(encoding="utf-8"))) for path in args.captures]
    if len({p["id"] for p in posts}) != len(posts):
        parser.error("each input must contain a distinct post")
    payload = json.dumps(posts, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    template = (HERE / "frame.html").read_text(encoding="utf-8")
    for marker, content in [
        ("/*__CSS__*/", (HERE / "style.css").read_text(encoding="utf-8")),
        ("/*__JS__*/", (HERE / "reader.js").read_text(encoding="utf-8")),
        ("__CAPTURES__", payload.replace("<", r"\u003c")),
    ]:
        if template.count(marker) != 1:
            raise ValueError(f"missing or ambiguous template marker {marker}")
        template = template.replace(marker, content)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(template, encoding="utf-8")
    print(args.output.resolve())


if __name__ == "__main__":
    main()
