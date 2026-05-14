"""
Extrai o schema completo do VM2 a partir do arquivo Textocolado.txt.
O arquivo tem formato: tabela: X  coluna: Y  tabela: X  coluna: Z ...
"""
import re
from collections import defaultdict

content = open('/home/ubuntu/upload/Textocolado.txt').read()

# Parse: cada linha tem pares (tabela: X, coluna: Y) intercalados
# Formato: "tabela:  X  coluna:  Y  tabela:  X  coluna:  Z"
# Ou: "coluna:  Y  tabela:  X  coluna:  Z"

schema = defaultdict(list)

# Extrair todos os pares (tabela, coluna) em ordem
# O arquivo lista: tabela atual, coluna atual, próxima tabela, próxima coluna...
# Vamos usar regex para extrair todos os tokens
tokens = re.findall(r'(tabela|coluna):\s+(\S+)', content)

current_table = None
for kind, value in tokens:
    if kind == 'tabela':
        current_table = value
    elif kind == 'coluna' and current_table:
        if value not in schema[current_table]:
            schema[current_table].append(value)

print("=== SCHEMA COMPLETO DO VM2 ===\n")
for table in sorted(schema.keys()):
    print(f"{table}:")
    for col in schema[table]:
        print(f"  - {col}")
    print()
