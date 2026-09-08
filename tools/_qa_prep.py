# -*- coding: utf-8 -*-
import glob, os, shutil, subprocess, sys

os.makedirs("build", exist_ok=True)
pptx = glob.glob("*.pptx")[0]
pdf = glob.glob("*.pdf")[0]
shutil.copy(pptx, r"build\qa.pptx")
shutil.copy(pdf, r"build\qa.pdf")
print("copied:", pptx, "->", os.path.getsize(r"build\qa.pptx"), "bytes")
print("copied:", pdf, "->", os.path.getsize(r"build\qa.pdf"), "bytes")

# text extraction via python-pptx (markitdown output is GBK-mixed on this box)
subprocess.run([sys.executable, "tools/_qa_pptx_text.py"])

# pypdf text extraction
import pypdf
r = pypdf.PdfReader(r"build\qa.pdf")
print("PDF pages:", len(r.pages))
with open(r"build\qa_pdf.txt", "w", encoding="utf-8") as f:
    for i, pg in enumerate(r.pages):
        f.write("=== PAGE %d ===\n" % (i + 1))
        f.write((pg.extract_text() or "") + "\n")
