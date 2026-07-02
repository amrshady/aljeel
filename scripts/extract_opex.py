import re
from pathlib import Path
from pypdf import PdfReader

# The pattern needs to match:
# Employee No Name Amount
# 1000433 Mazen Abo Hammoud 20,000.00
EMP_NO_RE = re.compile(r'Employee No Name Amount\n(\d{5,7})', re.IGNORECASE)
EMP_NO_RE_2 = re.compile(r'Employee No:\s*(\d{5,7})', re.IGNORECASE)

def extract_opex_emp_no(folder: Path | None) -> str:
    if not folder or not folder.exists():
        return ""
    for pdf_path in folder.rglob("*.pdf"):
        try:
            reader = PdfReader(pdf_path)
            text = ''
            for p in reader.pages:
                text += p.extract_text() + '\n'
            
            m = EMP_NO_RE.search(text)
            if m:
                return m.group(1).strip()
            
            m2 = EMP_NO_RE_2.search(text)
            if m2:
                return m2.group(1).strip()
        except:
            pass
    return ""

if __name__ == "__main__":
    folder = Path('/home/clawdbot/.openclaw/workspace/aljeel/archive/raw-J26-788/01-07may/01may/IEPC AF  EP-2026-16/')
    print("Extracted Emp:", extract_opex_emp_no(folder))
