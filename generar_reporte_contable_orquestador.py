# generar_reporte_contable_orquestador.py
# Orquestador maestro: lee los 4 reportes contables ya generados (sin Columna A)
# y exporta datos_reporte_contable.js para que Fincontrol los visualice automáticamente.
#
# Uso: py generar_reporte_contable_orquestador.py JUNIO 2026

import os, sys, json, openpyxl
from datetime import datetime

BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
OUTPUT_JS       = os.path.join(BASE_DIR, "datos_reporte_contable.js")
OUTPUT_MAESTROS = os.path.join(BASE_DIR, "FORMATO", "MAESTROS")
OUTPUT_CS       = os.path.join(BASE_DIR, "FORMATO", "CS")

MONTH_NAMES_ES = {
    "ENERO": "Enero", "FEBRERO": "Febrero", "MARZO": "Marzo", "ABRIL": "Abril",
    "MAYO": "Mayo", "JUNIO": "Junio", "JULIO": "Julio", "AGOSTO": "Agosto",
    "SEPTIEMBRE": "Septiembre", "OCTUBRE": "Octubre", "NOVIEMBRE": "Noviembre", "DICIEMBRE": "Diciembre"
}

def clean_str(val):
    if val is None: return ""
    return str(val).strip()

def clean_code(val):
    s = clean_str(val)
    if s.endswith('.0'): s = s[:-2]
    return s

def safe_float(val, default=0.0):
    if val is None: return default
    try:
        return float(val)
    except (ValueError, TypeError):
        import re
        s = re.sub(r'[^\d.\-]', '', str(val).strip().replace(',', '.'))
        try: return float(s) if s else default
        except: return default

def find_latest_report(directory, prefix, target_month, target_year):
    target_upper = target_month.upper()
    exact_final = os.path.join(directory, f"{prefix}_{target_upper}_{target_year}_FINAL.xlsx")
    if os.path.exists(exact_final):
        return exact_final
    for f in sorted(os.listdir(directory), reverse=True):
        if f.startswith(f"{prefix}_{target_upper}") and f.endswith(".xlsx"):
            return os.path.join(directory, f)
    return None

# ============================================================
# MÓDULO 1: MAESTROS INTERNO
# Hoja "Servicios MAESTRO - Interno":
#   Col 0 (A):  Código Producto (RMS)
#   Col 1 (B):  Descripción Producto
#   Col 8 (I):  OT
#   Col 9 (J):  CECO
#   Col 13 (N): VENTA MO $
#   Col 16 (Q): M/O Horas
# ============================================================
def read_maestros_interno(target_upper, target_year):
    report_file = find_latest_report(OUTPUT_MAESTROS, "REPORTE_COSTO_SERVICIOS_MAESTROS", target_upper, target_year)
    if not report_file or not os.path.exists(report_file):
        print(f"  [AVISO] No se encontró reporte MAESTROS Interno para {target_upper} {target_year}")
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "cecoBreakdown": {}, "totalHoras": 0, "archivo": ""}

    print(f"  Leyendo MAESTROS Interno: {os.path.basename(report_file)}")
    wb = openpyxl.load_workbook(report_file, data_only=True, read_only=True)
    if "Servicios MAESTRO - Interno" not in wb.sheetnames:
        wb.close()
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "cecoBreakdown": {}, "totalHoras": 0, "archivo": ""}

    ws = wb["Servicios MAESTRO - Interno"]
    tipo_cambio = 36.62
    try:
        tc = ws.cell(2, 16).value
        if tc: tipo_cambio = safe_float(tc, 36.62)
    except: pass

    registros = []
    ceco_breakdown = {}
    total_usd = 0.0
    total_horas = 0.0

    for row in ws.iter_rows(min_row=4, values_only=True):
        rms = clean_code(row[0])   # Col A (idx 0): Código Producto
        if not rms or rms in ["", "0", "None"]:
            continue
        desc   = clean_str(row[1])   # Col B (idx 1): Descripción
        ot     = clean_code(row[8])  # Col I (idx 8): OT
        ceco   = clean_str(row[9])   # Col J (idx 9): CECO
        pv_usd = safe_float(row[13]) # Col N (idx 13): VENTA MO $
        horas  = safe_float(row[16]) # Col Q (idx 16): Horas

        total_usd   += pv_usd
        total_horas += horas

        if ceco and ceco != "0":
            if ceco not in ceco_breakdown:
                ceco_breakdown[ceco] = {"totalUSD": 0.0, "count": 0}
            ceco_breakdown[ceco]["totalUSD"] += pv_usd
            ceco_breakdown[ceco]["count"]    += 1

        registros.append({
            "rms":      rms,
            "desc":     desc,
            "ceco":     ceco,
            "ot":       ot,
            "horas":    round(horas, 2),
            "montoUSD": round(pv_usd, 2),
            "montoNIO": round(pv_usd * tipo_cambio, 2),
        })

    wb.close()
    return {
        "registros":     registros,
        "totalUSD":      round(total_usd, 2),
        "totalNIO":      round(total_usd * tipo_cambio, 2),
        "totalHoras":    round(total_horas, 2),
        "cecoBreakdown": {k: {"totalUSD": round(v["totalUSD"], 2), "count": v["count"]} for k, v in ceco_breakdown.items()},
        "archivo":       os.path.basename(report_file),
        "tipoCambio":    tipo_cambio,
    }

# ============================================================
# MÓDULO 2: MAESTROS EXTERNO
# Hoja "Servicios Taller Externo":
#   Col 0 (A):  Código Producto (RMS)
#   Col 1 (B):  Descripción Producto
#   Col 11 (L): TIKET
#   Col 12 (M): FACTURA
#   Col 14 (O): VENTA MO $
#   Col 15 (P): VENTA TOTAL C$
# ============================================================
def read_maestros_externo(target_upper, target_year):
    report_file = find_latest_report(OUTPUT_MAESTROS, "REPORTE_COSTO_SERVICIOS_MAESTROS", target_upper, target_year)
    if not report_file or not os.path.exists(report_file):
        print(f"  [AVISO] No se encontró reporte MAESTROS Externo para {target_upper} {target_year}")
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "archivo": ""}

    print(f"  Leyendo MAESTROS Externo: {os.path.basename(report_file)}")
    wb = openpyxl.load_workbook(report_file, data_only=True, read_only=True)
    if "Servicios Taller Externo" not in wb.sheetnames:
        wb.close()
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "archivo": ""}

    ws = wb["Servicios Taller Externo"]
    tipo_cambio = 36.6243
    try:
        tc = ws.cell(2, 17).value
        if tc: tipo_cambio = safe_float(tc, 36.6243)
    except: pass

    registros = []
    total_usd = 0.0

    for row in ws.iter_rows(min_row=4, values_only=True):
        rms = clean_code(row[0])   # Col A (idx 0): Código RMS
        if not rms or rms in ["", "0", "None"]:
            continue
        desc      = clean_str(row[1])   # Col B (idx 1): Descripción
        ticket    = clean_str(row[11])  # Col L (idx 11): TICKET
        factura   = clean_str(row[12])  # Col M (idx 12): FACTURA
        venta_usd = safe_float(row[14]) # Col O (idx 14): VENTA MO $
        venta_nio = safe_float(row[15]) # Col P (idx 15): VENTA TOTAL C$

        total_usd += venta_usd
        registros.append({
            "rms":      rms,
            "desc":     desc,
            "ticket":   ticket,
            "factura":  factura,
            "ventaUSD": round(venta_usd, 2),
            "ventaNIO": round(venta_nio, 2),
        })

    wb.close()
    return {
        "registros":  registros,
        "totalUSD":   round(total_usd, 2),
        "totalNIO":   round(total_usd * tipo_cambio, 2),
        "archivo":    os.path.basename(report_file),
        "tipoCambio": tipo_cambio,
    }

# ============================================================
# MÓDULO 3: CS INTERNO
# Hoja "Servicios Taller - Interno":
#   Col 0 (A):  COD MO (RMS)
#   Col 1 (B):  NOMBRE ACTIVIDAD (Descripción)
#   Col 8 (I):  No. OT
#   Col 9 (J):  CECO
#   Col 10 (K): VENTA $
#   Col 13 (N): HORAS DE MO
# ============================================================
def read_cs_interno(target_upper, target_year):
    report_file = find_latest_report(OUTPUT_CS, "REPORTE_COSTO_SERVICIOS_CS", target_upper, target_year)
    if not report_file or not os.path.exists(report_file):
        print(f"  [AVISO] No se encontró reporte CS Interno para {target_upper} {target_year}")
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "cecoBreakdown": {}, "totalHoras": 0, "archivo": ""}

    print(f"  Leyendo CS Interno: {os.path.basename(report_file)}")
    wb = openpyxl.load_workbook(report_file, data_only=True, read_only=True)
    if "Servicios Taller - Interno" not in wb.sheetnames:
        wb.close()
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "cecoBreakdown": {}, "totalHoras": 0, "archivo": ""}

    ws = wb["Servicios Taller - Interno"]
    tipo_cambio = 36.62
    try:
        tc = ws.cell(2, 12).value
        if tc: tipo_cambio = safe_float(tc, 36.62)
    except: pass

    registros = []
    ceco_breakdown = {}
    total_usd = 0.0
    total_horas = 0.0

    for row in ws.iter_rows(min_row=4, values_only=True):
        rms = clean_code(row[0])   # Col A (idx 0): COD MO (RMS)
        if not rms or rms in ["", "0", "None"]:
            continue
        desc   = clean_str(row[1])   # Col B (idx 1): NOMBRE ACTIVIDAD
        ot     = clean_code(row[8])  # Col I (idx 8): OT
        ceco   = clean_str(row[9])   # Col J (idx 9): CECO
        pv_usd = safe_float(row[10]) # Col K (idx 10): VENTA $ (USD)
        horas  = safe_float(row[13]) # Col N (idx 13): HORAS DE MO

        total_usd   += pv_usd
        total_horas += horas

        if ceco and ceco != "0":
            if ceco not in ceco_breakdown:
                ceco_breakdown[ceco] = {"totalUSD": 0.0, "count": 0}
            ceco_breakdown[ceco]["totalUSD"] += pv_usd
            ceco_breakdown[ceco]["count"]    += 1

        registros.append({
            "rms":      rms,
            "desc":     desc,
            "ceco":     ceco,
            "ot":       ot,
            "horas":    round(horas, 2),
            "montoUSD": round(pv_usd, 2),
            "montoNIO": round(pv_usd * tipo_cambio, 2),
        })

    wb.close()
    return {
        "registros":     registros,
        "totalUSD":      round(total_usd, 2),
        "totalNIO":      round(total_usd * tipo_cambio, 2),
        "totalHoras":    round(total_horas, 2),
        "cecoBreakdown": {k: {"totalUSD": round(v["totalUSD"], 2), "count": v["count"]} for k, v in ceco_breakdown.items()},
        "archivo":       os.path.basename(report_file),
        "tipoCambio":    tipo_cambio,
    }

# ============================================================
# MÓDULO 4: CS EXTERNO
# Hoja "Servicios Taller - Clientes":
#   Col 0 (A):  Código Producto (RMS)
#   Col 1 (B):  Descripción Producto
#   Col 14 (O): TICKET
#   Col 15 (P): FACTURA
#   Col 16 (Q): VENTA C$
# ============================================================
def read_cs_externo(target_upper, target_year):
    report_file = find_latest_report(OUTPUT_CS, "REPORTE_COSTO_SERVICIOS_CS", target_upper, target_year)
    if not report_file or not os.path.exists(report_file):
        print(f"  [AVISO] No se encontró reporte CS Externo para {target_upper} {target_year}")
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "archivo": ""}

    print(f"  Leyendo CS Externo: {os.path.basename(report_file)}")
    wb = openpyxl.load_workbook(report_file, data_only=True, read_only=True)
    if "Servicios Taller - Clientes" not in wb.sheetnames:
        wb.close()
        return {"registros": [], "totalUSD": 0, "totalNIO": 0, "archivo": ""}

    ws = wb["Servicios Taller - Clientes"]
    tipo_cambio = 36.62
    try:
        tc = ws.cell(2, 16).value
        if tc: tipo_cambio = safe_float(tc, 36.62)
    except: pass

    registros = []
    total_nio = 0.0

    for row in ws.iter_rows(min_row=4, values_only=True):
        rms = clean_code(row[0])   # Col A (idx 0): Código RMS
        if not rms or rms in ["", "0", "None"]:
            continue
        desc      = clean_str(row[1])   # Col B (idx 1): Descripción
        ticket    = clean_str(row[14])  # Col O (idx 14): TICKET
        factura   = clean_str(row[15])  # Col P (idx 15): FACTURA
        venta_nio = safe_float(row[16]) # Col Q (idx 16): VENTA C$

        total_nio += venta_nio
        registros.append({
            "rms":      rms,
            "desc":     desc,
            "ticket":   ticket,
            "factura":  factura,
            "ventaUSD": round(venta_nio / tipo_cambio, 2) if tipo_cambio else 0,
            "ventaNIO": round(venta_nio, 2),
        })

    wb.close()
    total_usd = round(total_nio / tipo_cambio, 2) if tipo_cambio else 0
    return {
        "registros":  registros,
        "totalUSD":   total_usd,
        "totalNIO":   round(total_nio, 2),
        "archivo":    os.path.basename(report_file),
        "tipoCambio": tipo_cambio,
    }

# ============================================================
# EXPORTAR datos_reporte_contable.js
# ============================================================
def export_js(target_upper, target_year, maestros_int, maestros_ext, cs_int, cs_ext):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    month_num = list(MONTH_NAMES_ES.keys()).index(target_upper) + 1 if target_upper in MONTH_NAMES_ES else 1

    payload = {
        "mes":             target_upper,
        "mesNum":          month_num,
        "anio":            int(target_year),
        "generadoEn":      ts,
        "maestrosInterno": maestros_int,
        "maestrosExterno": maestros_ext,
        "csInterno":       cs_int,
        "csExterno":       cs_ext,
    }

    js_content = f"""// datos_reporte_contable.js
// Generado automáticamente por generar_reporte_contable_orquestador.py
// Fecha: {ts}
// Mes: {target_upper} {target_year}
// NO EDITAR MANUALMENTE.

window.REPORTE_CONTABLE_DATA = {json.dumps(payload, ensure_ascii=False, indent=2)};
"""

    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n--> datos_reporte_contable.js exportado exitosamente: {OUTPUT_JS}")
    print(f"    • MAESTROS Interno: {len(maestros_int['registros'])} OTs       | USD {maestros_int['totalUSD']:,.2f}")
    print(f"    • MAESTROS Externo: {len(maestros_ext['registros'])} facturas  | USD {maestros_ext['totalUSD']:,.2f}")
    print(f"    • CS Interno:       {len(cs_int['registros'])} OTs       | USD {cs_int['totalUSD']:,.2f}")
    print(f"    • CS Externo:       {len(cs_ext['registros'])} facturas  | USD {cs_ext['totalUSD']:,.2f}")

def main():
    target_month = sys.argv[1].upper() if len(sys.argv) > 1 else "JUNIO"
    target_year  = sys.argv[2] if len(sys.argv) > 2 else "2026"

    print("=" * 72)
    print(f"  ORQUESTADOR DE REPORTES CONTABLES - {target_month} {target_year}")
    print("=" * 72)

    print("\n[1/4] Leyendo MAESTROS Interno...")
    maestros_int = read_maestros_interno(target_month, target_year)

    print("\n[2/4] Leyendo MAESTROS Externo...")
    maestros_ext = read_maestros_externo(target_month, target_year)

    print("\n[3/4] Leyendo CS Interno...")
    cs_int = read_cs_interno(target_month, target_year)

    print("\n[4/4] Leyendo CS Externo...")
    cs_ext = read_cs_externo(target_month, target_year)

    export_js(target_month, target_year, maestros_int, maestros_ext, cs_int, cs_ext)

    print("\n" + "=" * 72)
    print("  OK PROCESO COMPLETADO - Abre Fincontrol para ver el dashboard")
    print("=" * 72 + "\n")

if __name__ == "__main__":
    main()
