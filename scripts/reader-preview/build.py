"""Build an offline reading workspace from saved DLens GET /captures/{id} JSON files."""

import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEFAULT_OUTPUT = ROOT / "docs/mockups/2026-11-18-google-reader.html"

# These are editorial navigation labels. The backend owns the cluster membership.
# Key them by representative comment ID so a changed clustering cannot reuse an old label.
POST_TITLES = {
    "DfoQFMIEo3P": "Claude 在香港的使用限制",
    "DfhH6abmnuL": "黃仁勳新聞與存款討論",
}
EDITORIAL_READINGS = {
    "DfoQFMIEo3P": [
        ("DfoRxpbkuAF", "有人擔心香港可用的服務會繼續減少。"),
        ("DfoR8XUjGZp", "亦有人推測帳號驗證牽涉多個因素。"),
    ],
    "DfhH6abmnuL": [
        ("DfhTyf9mb-D", "有人追問幾則新聞是否相關。"),
        ("DfhfraCkWwy", "亦有人追問存款問題涉及香港還是全球。"),
    ],
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


def known_ids(ids, allowed):
    return list(dict.fromkeys(value for value in ids if isinstance(value, str) and value in allowed))


def comment_ids(items):
    return (item.get("comment_id") for item in items or [] if isinstance(item, dict))


def public_link(value):
    if not isinstance(value, str) or any(char.isspace() for char in value):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme in {"http", "https"} and parsed.hostname and parsed.username is None:
            return value
    except ValueError:
        pass
    return None


def reading_blocks(analysis, reply_ids):
    blocks = {block["type"]: block.get("items") or [] for block in analysis.get("blocks") or []}
    questions = []
    for item in blocks.get("qa_pairs", []):
        question_id = (item.get("question") or {}).get("comment_id")
        if question_id in reply_ids:
            questions.append(dict(
                id=question_id, status=item.get("status") or "unknown",
                answerIds=known_ids(comment_ids(item.get("answers")), reply_ids),
            ))

    links = []
    for item in blocks.get("entity_list", []):
        url = public_link(item.get("url"))
        ids = known_ids(item.get("comment_ids") or [], reply_ids)
        if url and ids:
            title = (item.get("enrichment") or {}).get("title") or item.get("name") or url
            links.append(dict(url=url, title=title, ids=ids))

    low_content = [
        dict(id=comment_id, flag=item["flag"])
        for item in blocks.get("noise_summary", []) if item.get("flag")
        for comment_id in known_ids(item.get("comment_ids") or [], reply_ids)
    ]
    top_ids = known_ids(comment_ids(blocks.get("top_comments")), reply_ids)
    return dict(questions=questions, links=links, lowContent=low_content, topIds=top_ids)


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
    evidence = {str(row["cluster_key"]): row.get("comments") for row in analysis.get("evidence") or []}
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
        groups.append(dict(
            id=key, label=label, short=short, representativeId=representative,
            evidenceIds=known_ids(comment_ids(evidence.get(key)), set(ids)),
        ))

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
    excluded = (analysis.get("eligibility") or {}).get("excluded") or {}
    return dict(
        id=post_id,
        title=POST_TITLES.get(post_id, post["text"][:32]),
        author=post["author"],
        text=model.get("assembled_content") or post["text"],
        reading=[
            dict(text=text, id=comment_id) for comment_id, text in EDITORIAL_READINGS.get(post_id, [])
            if comment_id in reply_ids
        ],
        url=threads_url(post.get("url")),
        capturedAt=result.get("fetched_at") or capture.get("captured_at"),
        totalReplies=metrics.get("reply_count"),
        postLikes=metrics.get("likes"),
        views=metrics.get("views"),
        shares=metrics.get("share_count"),
        reposts=metrics.get("repost_count"),
        excluded={
            key: excluded[key] for key in ("op", "root", "unknown", "duplicates", "empty_text")
            if isinstance(excluded.get(key), int) and not isinstance(excluded[key], bool) and excluded[key] >= 0
        },
        groups=groups,
        comments=comments,
        methods=methods,
        **reading_blocks(analysis, reply_ids),
    )


def bundle_reader():
    esbuild = ROOT / "node_modules/.bin/esbuild"
    if not esbuild.is_file():
        raise SystemExit("請先在專案根目錄執行 npm ci，再建立離線閱讀室。")
    return subprocess.check_output(
        [
            str(esbuild), str(HERE / "reader.js"), "--bundle", "--format=iife",
            "--platform=browser", "--jsx=automatic", "--charset=utf8",
            "--minify", "--legal-comments=inline", '--define:process.env.NODE_ENV="production"',
        ],
        cwd=ROOT, encoding="utf-8",
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
        ("/*__CSS__*/", "\n".join((HERE / name).read_text(encoding="utf-8") for name in ("style.css", "reader-details.css"))),
        ("/*__JS__*/", bundle_reader()),
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
