#!/usr/bin/env python3
"""
Gera o SQL de seed para a tabela exam_catalog a partir do catálogo txt.
Uso: python3 seed-exam-catalog.py > seed-exam-catalog.sql
"""
import sys

CATALOG_FILE = '/home/ubuntu/upload/catalogo_exames_radiologia_titulos_laudo.txt'

# Mapeamento de seções para códigos DICOM de modalidade
MODALITY_MAP = {
    'RADIOGRAFIA': 'CR',
    'TOMOGRAFIA COMPUTADORIZADA': 'CT',
    'RESSONÂNCIA MAGNÉTICA': 'MR',
    'MAMOGRAFIA': 'MG',
    'DENSITOMETRIA': 'DX',
    'ULTRASSOM': 'US',
    'FLUOROSCOPIA': 'RF',
}

# Seções que são variações/observações, não exames reais
SKIP_SECTIONS = {
    'VARIAÇÕES DE CONTRASTE', 'VARIAÇÕES DE LATERALIDADE',
    'VARIAÇÕES OPERACIONAIS', 'PADRÕES ADICIONAIS',
    'SUGESTÃO DE ESTRUTURA', 'OBSERVAÇÃO FINAL',
    'PROCEDIMENTOS RELACIONADOS', 'EXAMES CONTRASTADOS',
}

def escape_sql(s):
    return s.replace("'", "\\'")

def main():
    with open(CATALOG_FILE, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    current_modality = 'CR'
    skip_section = False
    entries = []

    for line in lines:
        line_stripped = line.strip()
        if not line_stripped:
            continue

        # Detectar seções a pular
        upper = line_stripped.upper()
        if any(skip in upper for skip in SKIP_SECTIONS):
            skip_section = True
            continue

        # Detectar mudança de modalidade
        for key, code in MODALITY_MAP.items():
            if key in upper and not line_stripped.startswith('-'):
                current_modality = code
                skip_section = False
                break

        if skip_section:
            continue

        # Coletar títulos de exames (linhas que começam com "- ")
        if line_stripped.startswith('- '):
            title = line_stripped[2:].strip()
            if not title or len(title) < 5:
                continue
            # Gerar keywords simplificadas
            kw = title.lower()
            for prefix in ['radiografia de ', 'tomografia computadorizada de ',
                           'ressonância magnética de ', 'mamografia ',
                           'densitometria óssea de ', 'angiotomografia de ',
                           'angiorressonância de ', 'artro-ressonância de ']:
                kw = kw.replace(prefix, '')
            entries.append((current_modality, title, kw[:499]))

    print("-- Seed: exam_catalog")
    print("-- Gerado automaticamente por seed-exam-catalog.py")
    print(f"-- Total: {len(entries)} exames")
    print()
    print("INSERT INTO exam_catalog (modality, title, keywords, active) VALUES")
    rows = []
    for mod, title, kw in entries:
        rows.append(f"  ('{escape_sql(mod)}', '{escape_sql(title)}', '{escape_sql(kw)}', 1)")
    print(',\n'.join(rows) + ';')
    print()
    print(f"-- {len(entries)} registros inseridos.")

if __name__ == '__main__':
    main()
