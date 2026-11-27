"""Generate the frontend SEPS snapshot from the official segmentation PDF.

Run with PyMuPDF installed: python scripts/generate-seps-catalog.py path/to/source.pdf
Check the extracted row count and manually verify the PDF date before updating.
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

document = pymupdf.open(sys.argv[1])
rows = []
for page in document:
    tables = page.find_tables().tables
    if len(tables) != 1:
        raise ValueError('Expected one table per page')
    for row in tables[0].extract():
        cells = [re.sub(r'\s+', ' ', cell).strip() for cell in row if cell and cell.strip()]
        if len(cells) < 4 or not cells[0].isdigit() or not re.fullmatch(r'\d{13}', cells[1]):
            continue
        number, ruc, name = cells[:3]
        if int(number) != len(rows) + 1:
            raise ValueError(f'Missing or out-of-order row: {number}')
        rows.append({'ruc': ruc, 'name': name})

if len(rows) != 393 or len({row['ruc'] for row in rows}) != len(rows):
    raise ValueError(f'Unexpected row count or duplicate RUC: {len(rows)}')

output = Path(__file__).resolve().parents[1] / 'src/app/constants/seps-financial-entities.json'
output.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Generated {len(rows)} entries in {output}')
