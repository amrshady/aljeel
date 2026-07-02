import re
from pathlib import Path
from pypdf import PdfReader

def extract_pdf_text_safe(path: Path) -> str:
    try:
        reader = PdfReader(path)
        text = ''
        for p in reader.pages:
            text += p.extract_text() + '\n'
        return text.strip()
    except Exception as e:
        return f"[PDF Extraction Error: {e}]"

if __name__ == "__main__":
    pass
