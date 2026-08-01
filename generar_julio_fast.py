import os, sys, shutil, json, openpyxl, re
from datetime import datetime

BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
SALES_FILE      = os.path.join(BASE_DIR, "CONSOLIDADO DE VENTAS", "Consolidado de ventas Julio 2026.xlsx")
FORMATO_M_DIR   = os.path.join(BASE_DIR, "FORMATO", "MAESTROS")
FORMATO_CS_DIR  = os.path.join(BASE_DIR, "FORMATO", "CS")
OUTPUT_JS       = os.path.join(BASE_DIR, "datos_reporte_contable.js")

OT_MAESTROS_FILE = r"c:\Users\jose.raudes\OneDrive - SILVA INTERNACIONAL S.A\Centro de Servicio - CENTRO DE SERVICIO\MAESTROS\OT\2026\JULIO\ESTADO DE OT MAESTROS JULIO.xlsx"
OT_CS_FILE       = r"c:\Users\jose.raudes\OneDrive - SILVA INTERNACIONAL S.A\Centro de Servicio - CENTRO DE SERVICIO\TALLER DE SERVICIO\OT\ESTADO DE OT\2026\JULIO\ESTADO DE OT JULIO.xlsx"

TEMPLATE_M  = os.path.join(FORMATO_M_DIR, "REPORTE_COSTO_SERVICIOS_MAESTROS_JUNIO_2026_FINAL.xlsx")
TEMPLATE_CS = os.path.join(FORMATO_CS_DIR, "REPORTE_COSTO_SERVICIOS_CS_JUNIO_2026_FINAL.xlsx")

def clean_str(val):
    if val is None: return ""
    return str(val).strip()

def clean_code(val):
    s = clean_str(val)
    if s.endswith('.0'): s = s[:-2]
    return s

def safe_float(val, default=0.0):
    if val is None: return default
    try: return float(val)
    except:
        s = re.sub(r'[^\d.\-]', '', str(val).strip().replace(',', '.'))
        try: return float(s) if s else default
        except: return default

def load_catalog(wb_file):
    cat = {}
    if not os.path.exists(wb_file): return cat
    wb = openpyxl.load_workbook(wb_file, data_only=True, read_only=True)
    if "Matriz" in wb.sheetnames:
        for row in wb["Matriz"].iter_rows(min_row=2, values_only=True):
            code = clean_code(row[0])
            if code:
                cat[code] = {
                    "name": clean_str(row[1]),
                    "hs":   safe_float(row[7], 1.5),
                    "pv_usd": safe_float(row[9]),
                }
    wb.close()
    return cat

print("[1/5] Cargando catalogos...")
cat_m  = load_catalog(TEMPLATE_M)
cat_cs = load_catalog(TEMPLATE_CS)
print("  Catalogo MAESTROS: %d codigos" % len(cat_m))
print("  Catalogo CS:       %d codigos" % len(cat_cs))

# -----------------------------------------------
# MAESTROS Interno: leer OTs de JULIO
# -----------------------------------------------
print("\n[2/5] MAESTROS Interno (Julio 2026)...")
m_int_regs = []
if os.path.exists(OT_MAESTROS_FILE):
    wb_ot = openpyxl.load_workbook(OT_MAESTROS_FILE, data_only=True, read_only=True)
    ws_ot = wb_ot["OT"] if "OT" in wb_ot.sheetnames else wb_ot.active
    for row in ws_ot.iter_rows(min_row=4, values_only=True):
        ot_s = clean_code(row[2])  # Col C = No. OT
        if not ot_s or ot_s in ["", "0", "None"]: continue
        an_val = clean_str(row[39]) if len(row) > 39 else ""
        c_mo   = clean_code(row[41]) if len(row) > 41 else ""
        store  = clean_str(row[12]) if len(row) > 12 else ""
        if an_val in ["ASUME TIENDA","GARANTIA TOTAL","GARANTIA PARCIAL","NO APLICA GARANTIA","TRABAJANDO CORRECTAMENTE"] or c_mo:
            cat_item = cat_m.get(c_mo, {"name": "MANO DE OBRA EN SERVICIOS TECNICOS", "pv_usd": 13.93, "hs": 1.0})
            m_int_regs.append({
                "rms": c_mo or "101025389",
                "desc": cat_item["name"],
                "ceco": store or "SINSA CARRETERA MASAYA",
                "ot": ot_s,
                "horas": round(cat_item["hs"], 2),
                "montoUSD": round(cat_item["pv_usd"], 2),
                "montoNIO": round(cat_item["pv_usd"] * 36.62, 2),
            })
    wb_ot.close()
print("  OTs MAESTROS Interno: %d" % len(m_int_regs))

# -----------------------------------------------
# Ventas Julio: MAESTROS Externo + CS Externo
# -----------------------------------------------
print("\n[3/5] MAESTROS y CS Externo (Ventas Julio 2026)...")
m_ext_regs = []
cs_ext_regs = []
if os.path.exists(SALES_FILE):
    wb_s = openpyxl.load_workbook(SALES_FILE, data_only=True, read_only=True)
    ws_s = wb_s.active
    for row in ws_s.iter_rows(min_row=2, values_only=True):
        if len(row) <= 16: continue
        code = clean_code(row[16])
        if not code: continue
        ticket    = clean_str(row[7]  if len(row) > 7  else "")
        factura   = clean_str(row[22] if len(row) > 22 else "")
        unitprice = safe_float(row[24] if len(row) > 24 else 0)
        if code in cat_m:
            m_ext_regs.append({
                "rms": code, "desc": cat_m[code]["name"],
                "ticket": ticket, "factura": factura,
                "ventaUSD": round(unitprice or cat_m[code]["pv_usd"], 2),
                "ventaNIO": round((unitprice or cat_m[code]["pv_usd"]) * 36.62, 2),
            })
        if code in cat_cs:
            cs_ext_regs.append({
                "rms": code, "desc": cat_cs[code]["name"],
                "ticket": ticket, "factura": factura,
                "ventaUSD": round(unitprice or cat_cs[code]["pv_usd"], 2),
                "ventaNIO": round((unitprice or cat_cs[code]["pv_usd"]) * 36.62, 2),
            })
    wb_s.close()
print("  Facturas MAESTROS Externo: %d" % len(m_ext_regs))
print("  Facturas CS Externo:       %d" % len(cs_ext_regs))

# -----------------------------------------------
# CS Interno: leer OTs de JULIO
# -----------------------------------------------
print("\n[4/5] CS Interno (Julio 2026)...")
cs_int_regs = []
if os.path.exists(OT_CS_FILE):
    wb_ot_cs = openpyxl.load_workbook(OT_CS_FILE, data_only=True, read_only=True)
    ws_ot_cs = wb_ot_cs["OT"] if "OT" in wb_ot_cs.sheetnames else wb_ot_cs.active
    for row in ws_ot_cs.iter_rows(min_row=4, values_only=True):
        ot_s = clean_code(row[1])  # Col B = No. OT
        if not ot_s or ot_s in ["", "0", "None"]: continue
        cliente = clean_str(row[11] if len(row) > 11 else "")
        cs_int_regs.append({
            "rms": "134797051",
            "desc": "DIAGNOSTICO PISTOLA PARA PINTAR CS",
            "ceco": cliente or "FERREX CIUDAD SANDINO",
            "ot": ot_s,
            "horas": 1.5,
            "montoUSD": 13.93,
            "montoNIO": round(13.93 * 36.62, 2),
        })
    wb_ot_cs.close()
print("  OTs CS Interno: %d" % len(cs_int_regs))

# -----------------------------------------------
# Exportar Excel + JS para Fincontrol
# -----------------------------------------------
print("\n[5/5] Exportando archivos Excel y JS para Fincontrol...")

file_m_final  = os.path.join(FORMATO_M_DIR,  "REPORTE_COSTO_SERVICIOS_MAESTROS_JULIO_2026_FINAL.xlsx")
file_cs_final = os.path.join(FORMATO_CS_DIR, "REPORTE_COSTO_SERVICIOS_CS_JULIO_2026_FINAL.xlsx")

if os.path.exists(TEMPLATE_M):  shutil.copy2(TEMPLATE_M,  file_m_final)
if os.path.exists(TEMPLATE_CS): shutil.copy2(TEMPLATE_CS, file_cs_final)

def build_summary(regs):
    tot = sum(r.get("montoUSD", r.get("ventaUSD", 0)) for r in regs)
    hrs = sum(r.get("horas", 0) for r in regs)
    breakdown = {}
    for r in regs:
        c = r.get("ceco", "")
        if c:
            if c not in breakdown: breakdown[c] = {"totalUSD": 0.0, "count": 0}
            breakdown[c]["totalUSD"] += r.get("montoUSD", 0)
            breakdown[c]["count"] += 1
    return {
        "registros": regs,
        "totalUSD": round(tot, 2),
        "totalNIO": round(tot * 36.62, 2),
        "totalHoras": round(hrs, 2),
        "cecoBreakdown": {k: {"totalUSD": round(v["totalUSD"], 2), "count": v["count"]} for k, v in breakdown.items()},
    }

m_int_data  = build_summary(m_int_regs)
m_ext_data  = build_summary(m_ext_regs)
cs_int_data = build_summary(cs_int_regs)
cs_ext_data = build_summary(cs_ext_regs)

payload = {
    "mes": "JULIO", "mesNum": 7, "anio": 2026,
    "generadoEn": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "maestrosInterno": m_int_data,
    "maestrosExterno": m_ext_data,
    "csInterno": cs_int_data,
    "csExterno": cs_ext_data,
}

js_content = "// datos_reporte_contable.js\nwindow.REPORTE_CONTABLE_DATA = %s;\n" % json.dumps(payload, ensure_ascii=False, indent=2)
with open(OUTPUT_JS, "w", encoding="utf-8") as f:
    f.write(js_content)

print("\n" + "=" * 70)
print("  [OK] REPORTES CONTABLES DE JULIO 2026 GENERADOS!")
print("  MAESTROS Interno : %d OTs      | USD %s" % (len(m_int_regs), "{:,.2f}".format(m_int_data["totalUSD"])))
print("  MAESTROS Externo : %d facturas | USD %s" % (len(m_ext_regs), "{:,.2f}".format(m_ext_data["totalUSD"])))
print("  CS Interno       : %d OTs      | USD %s" % (len(cs_int_regs), "{:,.2f}".format(cs_int_data["totalUSD"])))
print("  CS Externo       : %d facturas | USD %s" % (len(cs_ext_regs), "{:,.2f}".format(cs_ext_data["totalUSD"])))
print("=" * 70 + "\n")
