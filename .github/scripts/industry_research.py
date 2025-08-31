#!/usr/bin/env python3
"""
Daily industry research report using Gemini API.
Writes a concise report to the GitHub Actions Job Summary and exits.
No issues/PRs are created.
"""
import os
import sys
import json
import logging
import requests
from datetime import datetime

try:
    import google.generativeai as genai
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "google-generativeai"])
    import google.generativeai as genai

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

def write_summary(text: str, header=False):
    path = os.getenv('GITHUB_STEP_SUMMARY')
    if not path:
        print(text)
        return
    with open(path, 'a', encoding='utf-8') as f:
        if header:
            f.write("# Daily Industry Research Report\n\n")
        f.write(text)
        if not text.endswith("\n"):
            f.write("\n")

def github_api(endpoint: str, token: str) -> dict:
    url = f"https://api.github.com/repos/{os.getenv('GITHUB_REPOSITORY','')}/{endpoint}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    try:
        r = requests.get(url, headers=headers, timeout=20)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"GitHub API error for {endpoint}: {e}")
        return {}

def gather_context():
    token = os.getenv('GH_TOKEN') or os.getenv('GITHUB_TOKEN')
    repo_full = os.getenv('GITHUB_REPOSITORY','')
    ctx = {"repo": repo_full, "time": datetime.utcnow().isoformat() + "Z"}
    if token and repo_full:
        ctx["repo_info"] = github_api("", token)
        ctx["languages"] = github_api("languages", token)
        ctx["recent_commits"] = github_api("commits?per_page=5", token)
        ctx["open_prs"] = github_api("pulls?state=open&per_page=5", token)
        ctx["open_issues"] = github_api("issues?state=open&per_page=5", token)
    return ctx

def build_prompt(ctx: dict) -> str:
    descr = ctx.get("repo_info", {}).get("description", "")
    langs = ", ".join(ctx.get("languages", {}).keys()) or "unknown"
    return f"""
You are a research assistant. Produce a concise, high-signal daily industry research report for the repository {ctx.get('repo','')}.

Repository context:
- Description: {descr}
- Languages: {langs}
- Open issues: {len(ctx.get('open_issues', [])) if isinstance(ctx.get('open_issues'), list) else 'n/a'}
- Open PRs: {len(ctx.get('open_prs', [])) if isinstance(ctx.get('open_prs'), list) else 'n/a'}
- Recent commits: {len(ctx.get('recent_commits', [])) if isinstance(ctx.get('recent_commits'), list) else 'n/a'}

Constraints:
- Do not produce code changes.
- Provide links to sources when possible.
- Output must be markdown only. No YAML frontmatter.

Report structure:
1. Executive Summary (3–6 bullets)
2. Notable News and Releases (5–10 items: each line has [name](url) — one-line context)
3. Tech Trends Relevant to this repo (1–3 short paragraphs)
4. Opportunities and Risks (bullets)
5. Sources (bullet list of links)

Include a final note:
> AI-generated content by this workflow may contain mistakes.
"""

def main():
    api_key = os.getenv('GOOGLE_AI_API_KEY') or os.getenv('GEMINI_API_KEY')
    if not api_key:
        logger.error("GOOGLE_AI_API_KEY or GEMINI_API_KEY is required")
        sys.exit(1)

    genai.configure(api_key=api_key)
    model_name = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')
    model = genai.GenerativeModel(model_name)

    ctx = gather_context()
    prompt = build_prompt(ctx)

    write_summary("", header=True)

    try:
        resp = model.generate_content(prompt)
        text = (resp.text or "").strip()
        if not text:
            raise ValueError("Empty response from model")
        write_summary(text)
        logger.info("Report written to job summary")
    except Exception as e:
        logger.error(f"Failed to generate report: {e}")
        write_summary(f"❌ Failed to generate report: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

