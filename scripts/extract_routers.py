#!/usr/bin/env python3
"""
Extrai cada sub-router do routers.ts monolítico para server/routers/<name>.ts
Preserva os imports necessários em cada arquivo.
"""
import re, os, textwrap

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'server', 'routers.ts')
OUT_DIR = os.path.join(ROOT, 'server', 'routers')
os.makedirs(OUT_DIR, exist_ok=True)

with open(SRC) as f:
    content = f.read()
    lines = content.splitlines(keepends=True)

# Cabeçalho de imports do arquivo original (linhas 1-103)
header_lines = lines[:103]
header = ''.join(header_lines)

# Localizar sub-routers
router_starts = []
for i, line in enumerate(lines):
    if re.match(r'^  [a-zA-Z]+: router\(\{', line):
        name = re.match(r'^  ([a-zA-Z]+):', line).group(1)
        router_starts.append((i, name))

# Extrair o conteúdo de cada sub-router (sem a linha "name: router({" e o fechamento "  }),")
router_bodies = {}
for idx, (start, name) in enumerate(router_starts):
    end = router_starts[idx+1][0] if idx+1 < len(router_starts) else len(lines) - 3
    body_lines = lines[start:end]
    router_bodies[name] = (start, end, ''.join(body_lines))

# Template para cada arquivo de módulo
MODULE_TEMPLATE = """\
import {{ publicProcedure, router, protectedProcedure, adminProcedure }} from "../_core/trpc";
import {{ TRPCError }} from "@trpc/server";
import {{ z }} from "zod";
{extra_imports}

export const {name}Router = router({{
{body}
}});
"""

# Mapeamento de imports extras por módulo
EXTRA_IMPORTS = {
    'auth': '''import bcrypt from "bcryptjs";
import { sdk } from "../_core/sdk";
import { AuthService } from "../auth.service";
import { getSessionCookieOptions } from "../_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { createAuditLog, createLocalUser, updateUserPassword } from "../db";''',

    'units': '''import {
  getAllUnits, getUnitById, createUnit, updateUnit, deleteUnit,
  getStudiesByUnitId, getDb,
} from "../db";
import { eq } from "drizzle-orm";''',

    'studies': '''import { getStudyById, getStudyByInstanceUid, getDb } from "../db";
import { studies_cache } from "../../drizzle/schema";
import { eq } from "drizzle-orm";''',

    'templates': '''import {
  getTemplatesByUnitId, getGlobalTemplates, getTemplateById,
  createTemplate, updateTemplate, deleteTemplate, getDb,
} from "../db";
import sanitizeHtml from "sanitize-html";''',

    'reports': '''import {
  getReportByStudyId, getReportById, createReport, updateReport,
  createAuditLog, getDb, resolveEffectiveUnitId,
} from "../db";
import { reports } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { REPORT_SANITIZE_OPTIONS } from "../reportSanitize";''',

    'pacs': '''import { getDb, getStudyMetadata, getStudyMetadataBatch } from "../db";
import { cFind } from "../dicom.service";
import type { CFindResult } from "../dicom.service";
import { MAX_UPLOAD_BYTES } from "../../shared/const";''',

    'anamnesis': '''import { getDb, createAuditLog } from "../db";''',

    'admin': '''import {
  createAuditLog, getDb, resolveEffectiveUnitId,
} from "../db";
import bcrypt from "bcryptjs";
import { AuthService } from "../auth.service";''',

    'annotations': '''import { getAnnotationsByStudy, upsertAnnotation, deleteAnnotation } from "../db";''',

    'anamnesisSimple': '''import { getAnamnesisSimple, saveAnamnesisSimple } from "../db";''',

    'studyMetadata': '''import { getStudyMetadata, getStudyMetadataBatch, upsertStudyMetadata } from "../db";''',

    'phrases': '''import { getDb } from "../db";''',

    'medicalData': '''import { getDb } from "../db";''',

    'billing': '''import { getDb } from "../db";''',
}

print("Sub-routers encontrados:")
for start, name in router_starts:
    end = router_starts[router_starts.index((start,name))+1][0] if router_starts.index((start,name))+1 < len(router_starts) else len(lines)-3
    print(f"  {name}: linha {start+1} até {end} ({end-start} linhas)")

print("\nArquivos que seriam criados em server/routers/:")
for _, name in router_starts:
    print(f"  server/routers/{name}.ts")

print("\nNOTA: Este script apenas analisa. A extração real será feita manualmente para garantir precisão.")
