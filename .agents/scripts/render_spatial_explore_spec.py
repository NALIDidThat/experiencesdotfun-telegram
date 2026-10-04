from pathlib import Path
import fitz


source = Path("attached_assets/experiences_fun_spatial_explore_spec_1791080538890.pdf")
output = Path(".agents/outputs")
output.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"Pages: {document.page_count}")
for index, page in enumerate(document):
    image_path = output / f"spatial-explore-page-{index + 1:02d}.png"
    page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False).save(image_path)
    print(f"{index + 1}: {page.rect.width:.0f}x{page.rect.height:.0f} -> {image_path}")