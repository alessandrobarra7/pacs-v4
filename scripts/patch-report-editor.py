#!/usr/bin/env python3
"""
Patch ReportEditorPage.tsx to add multi-section support.
Uses line-number based insertion to avoid unicode collisions.
"""
import sys

filepath = "/home/ubuntu/pacs-portal/client/src/pages/ReportEditorPage.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

# ── Patch 1: Add multiStudies state after showDeleteModal declaration ──────────
# Find the line: "  const [showDeleteModal, setShowDeleteModal] = useState(false);"
insert_after_1 = None
for i, line in enumerate(lines):
    if "const [showDeleteModal, setShowDeleteModal] = useState(false);" in line:
        insert_after_1 = i
        break

if insert_after_1 is None:
    print("ERROR: Could not find showDeleteModal line")
    sys.exit(1)

new_lines_1 = [
    "  // Estudos múltiplos selecionados no modal do buscador\n",
    "  const [multiStudies, setMultiStudies] = useState<{ studyInstanceUid: string; examTitle: string; modality: string }[]>([]);\n",
    "  const isMultiSection = multiStudies.length > 1;\n",
]
lines = lines[:insert_after_1 + 1] + new_lines_1 + lines[insert_after_1 + 1:]
print(f"Patch 1 applied at line {insert_after_1 + 1}")

# ── Patch 2: Add multiStudies loading inside the study useEffect ──────────────
# Find the line that ends the study useEffect: "  }, [studyUid]);"
# But we need the FIRST one (the study loading one), not others.
# The study useEffect has: sessionStorage.getItem(`study_${studyUid}`)
# Find the closing of that specific useEffect
insert_after_2 = None
in_study_effect = False
for i, line in enumerate(lines):
    if "sessionStorage.getItem(`study_${studyUid}`)" in line:
        in_study_effect = True
    if in_study_effect and "}, [studyUid]);" in line:
        insert_after_2 = i
        break

if insert_after_2 is None:
    print("ERROR: Could not find study useEffect closing")
    sys.exit(1)

# Replace the closing line with extended version
old_closing = lines[insert_after_2]
new_closing = (
    "    const multiRaw = sessionStorage.getItem(`multi_studies_${studyUid}`);\n"
    "    if (multiRaw) {\n"
    "      try {\n"
    "        const studies = JSON.parse(multiRaw);\n"
    "        if (Array.isArray(studies) && studies.length > 1) setMultiStudies(studies);\n"
    "      } catch { /* ignore */ }\n"
    "    }\n"
    + old_closing
)
lines[insert_after_2] = new_closing
print(f"Patch 2 applied at line {insert_after_2 + 1}")

# ── Patch 3: Initialize docRef with multi-section template when no existing report ──
# Find the study useEffect's setExamTitle line and add multi-section init after it
# We'll add a new useEffect after the existing report loading useEffect
# Find: "  }, [existingReport]);" (the second useEffect)
insert_after_3 = None
found_existing_report_effect = False
for i, line in enumerate(lines):
    if "existingReport?.body && docRef.current" in line:
        found_existing_report_effect = True
    if found_existing_report_effect and "}, [existingReport]);" in line:
        insert_after_3 = i
        break

if insert_after_3 is None:
    print("ERROR: Could not find existingReport useEffect closing")
    sys.exit(1)

new_effect = [
    "\n",
    "  // Inicializar documento com template multi-seção (apenas para novos laudos)\n",
    "  useEffect(() => {\n",
    "    if (!isMultiSection || !docRef.current) return;\n",
    "    if (existingReport?.body) return; // laudo já existe, não sobrescrever\n",
    "    const template = multiStudies.map((s) =>\n",
    "      `<div class=\"report-section\" data-uid=\"${s.studyInstanceUid}\" style=\"margin-bottom:24px;\">`\n",
    "      + `<div class=\"section-title\" style=\"font-weight:bold;font-size:13pt;text-transform:uppercase;`\n",
    "      + `letter-spacing:0.05em;border-bottom:1px solid #1a6b8a;padding-bottom:4px;margin-bottom:10px;color:#1a6b8a;\">`\n",
    "      + `${s.examTitle}</div>`\n",
    "      + `<div class=\"section-body\" style=\"min-height:40mm;\"><br/></div>`\n",
    "      + `</div>`\n",
    "    ).join('');\n",
    "    docRef.current.innerHTML = template;\n",
    "  }, [isMultiSection, multiStudies, existingReport]);\n",
]
lines = lines[:insert_after_3 + 1] + new_effect + lines[insert_after_3 + 1:]
print(f"Patch 3 applied at line {insert_after_3 + 1}")

with open(filepath, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("All patches applied successfully!")
