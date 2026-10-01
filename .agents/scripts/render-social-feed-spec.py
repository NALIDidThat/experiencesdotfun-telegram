from pathlib import Path

import fitz


source = Path("attached_assets/experiences_fun_social_feed_agent_spec_v2_1790880600848.pdf")
output = Path(".agents/outputs/social-feed-spec")
output.mkdir(parents=True, exist_ok=True)

with fitz.open(source) as document:
    for page_number, page in enumerate(document, start=1):
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
        pixmap.save(output / f"page-{page_number:02}.png")
    print(f"Rendered {document.page_count} pages to {output}")