import importlib
for m in ("markitdown", "pptx", "fitz"):
    try:
        importlib.import_module(m)
        print(m, "OK")
    except Exception as e:
        print(m, "MISSING", type(e).__name__)
