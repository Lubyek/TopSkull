#!/usr/bin/env python3
"""Склеивает сайт в один файл dist/topskill-standalone.html.

Нужен, чтобы сайт открывался двойным кликом (file://): Chrome не загружает ES-модули
с диска. Для GitHub Pages / Netlify сборка не нужна — выкладывайте папку как есть.
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPORT_NAMED = re.compile(r"import\s*\{([^}]*)\}\s*from\s*'\./([\w-]+)\.js';?")
IMPORT_STAR = re.compile(r"import\s*\*\s*as\s+(\w+)\s+from\s*'\./([\w-]+)\.js';?")
EXPORT_DECL = re.compile(r"^export\s+((?:async\s+)?(?:function\*?|const|let|class))\s+([\w$]+)", re.M)


def deps(src: str) -> list[str]:
    return [m.group(2) for m in IMPORT_NAMED.finditer(src)] + [m.group(2) for m in IMPORT_STAR.finditer(src)]


def transform(name: str, src: str) -> str:
    def named(m: re.Match) -> str:
        items = [i.strip().replace(" as ", ": ") for i in m.group(1).split(",") if i.strip()]
        return f"const {{ {', '.join(items)} }} = __m['{m.group(2)}'];"

    src = IMPORT_NAMED.sub(named, src)
    src = IMPORT_STAR.sub(lambda m: f"const {m.group(1)} = __m['{m.group(2)}'];", src)
    names = [m.group(2) for m in EXPORT_DECL.finditer(src)]
    src = EXPORT_DECL.sub(lambda m: f"{m.group(1)} {m.group(2)}", src)
    return f"__m['{name}'] = (() => {{\n{src}\nreturn {{ {', '.join(names)} }};\n}})();\n"


def main() -> None:
    sources = {p.stem: p.read_text(encoding="utf-8") for p in (ROOT / "js").glob("*.js")}
    order: list[str] = []

    def visit(n: str) -> None:
        if n in order:
            return
        for d in deps(sources[n]):
            visit(d)
        order.append(n)

    visit("app")
    js = "const __m = {};\n" + "".join(transform(n, sources[n]) for n in order)
    # Картинки из assets/, на которые ссылается JS, вшиваются как data:-адреса.
    mime = {"webp": "image/webp", "png": "image/png", "jpg": "image/jpeg", "svg": "image/svg+xml"}

    def inline(m: re.Match) -> str:
        data = base64.b64encode((ROOT / "assets" / m.group(1)).read_bytes()).decode()
        return f"'data:{mime[m.group(2)]};base64,{data}'"

    js = re.sub(r"'assets/(([\w-]+)\.(?:webp|png|jpg|svg))'", lambda m: inline(re.match(r"(.+\.(\w+))", m.group(1))), js)
    js = js.replace("</script", "<\\/script")

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    # В одиночном файле перенаправление на себя не нужно (иначе бесконечная перезагрузка).
    html = re.sub(r"\s*<!-- file-redirect.*?<!-- /file-redirect -->", "", html, flags=re.S)
    html = re.sub(
        r'<link rel="stylesheet" href="(styles/[\w-]+\.css)">',
        lambda m: f"<style>\n{(ROOT / m.group(1)).read_text(encoding='utf-8')}\n</style>",
        html,
    )
    html = html.replace('<script type="module" src="js/app.js"></script>', f"<script>\n{js}</script>")
    icon = base64.b64encode((ROOT / "assets/favicon.svg").read_bytes()).decode()
    html = html.replace('href="assets/favicon.svg"', f'href="data:image/svg+xml;base64,{icon}"')

    out = ROOT / "dist" / "topskill-standalone.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} КБ, модулей: {len(order)}")


if __name__ == "__main__":
    main()
