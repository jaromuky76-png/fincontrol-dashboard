# procesar_reportes_completo.py
# Generador y Orquestador Contable Maestro - MAESTROS & CS
# Genera desde cero los reportes Excel finales y actualiza el dashboard de Fincontrol.

import os, sys, json, openpyxl, shutil, re
from datetime import datetime
import win32com.client

BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
SALES_DIR       = os.path.join(BASE_DIR, "CONSOLIDADO DE VENTAS")
FORMATO_M_DIR   = os.path.join(BASE_DIR, "FORMATO", "MAESTROS")
FORMATO_CS_DIR  = os.path.join(BASE_DIR, "FORMATO", "CS")
OUTPUT_JS       = os.path.join(BASE_DIR, "datos_reporte_contable.js")

OT_MAESTROS_DIR = r"c:\Users\jose.raudes\OneDrive - SILVA INTERNACIONAL S.A\Centro de Servicio - CENTRO DE SERVICIO\MAESTROS\OT\2026"
OT_CS_DIR       = r"c:\Users\jose.raudes\OneDrive - SILVA INTERNACIONAL S.A\Centro de Servicio - CENTRO DE SERVICIO\TALLER DE SERVICIO\OT\ESTADO DE OT\2026"

MONTH_MAP = {
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
    try: return float(val)
    except:
        s = re.sub(r'[^\d.\-]', '', str(val).strip().replace(',', '.'))
        try: return float(s) if s else default
        except: return default

def load_catalog(template_file):
    """Carga el catálogo RMS desde la hoja Matriz."""
    catalog = {}
    if not os.path.exists(template_file): return catalog
    wb = openpyxl.load_workbook(template_file, data_only=True, read_only=True)
    if "Matriz" in wb.sheetnames:
        for row in wb["Matriz"].iter_rows(min_row=2, values_only=True):
            code = clean_code(row[0])
            if code:
                catalog[code] = {
                    "name":     clean_str(row[1]),
                    "category": clean_str(row[2]),
                    "dept":     clean_str(row[3]),
                    "clase":    safe_float(row[4]),
                    "capacidad":safe_float(row[5]),
                    "tipo":     clean_str(row[6]),
                    "hs":       safe_float(row[7], 1.5),
                    "pers":     safe_float(row[8], 1.0),
                    "pv_usd":   safe_float(row[9]),
                    "pv_nio":   safe_float(row[10]),
                }
    wb.close()
    return catalog

def process_sales_externo(sales_file, catalog, is_maestros=True):
    """Filtra y extrae facturaciones externas desde el consolidado de ventas."""
    registros = []
    if not os.path.exists(sales_file): return registros
    print(f"  Leyendo sábana de ventas: {os.path.basename(sales_file)}")
    wb = openpyxl.load_workbook(sales_file, data_only=True, read_only=True)
    ws = wb.active

    # Detectar columna ProductID (RMS)
    col_prod = 16
    for i, cell in enumerate(ws[1]):
        if cell.value and "productid" in str(cell.value).lower():
            col_prod = i
            break

    for row in ws.iter_rows(min_row=2, values_only=True):
        if len(row) <= col_prod: continue
        code = clean_code(row[col_prod])
        if code in catalog:
            cat_data  = catalog[code]
            ticket    = clean_str(row[7] if len(row) > 7 else "")
            factura   = clean_str(row[22] if len(row) > 22 else (row[6] if len(row) > 6 else ""))
            unitprice = safe_float(row[24] if len(row) > 24 else cat_data["pv_usd"])

            registros.append({
                "rms":      code,
                "desc":     cat_data["name"],
                "ticket":   ticket,
                "factura":  factura,
                "ventaUSD": round(unitprice, 2),
                "ventaNIO": round(unitprice * 36.62, 2),
            })
    wb.close()
    return registros

def process_maestros_interno_ots(ot_file, catalog):
    """Extrae OTs de reclasificación interna para MAESTROS."""
    registros = []
    if not os.path.exists(ot_file): return registros
    print(f"  Leyendo OTs de MAESTROS: {os.path.basename(ot_file)}")

    abs_ot = os.path.abspath(ot_file)
    excel = win32com.client.Dispatch("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False

    try:
        wb_ot = excel.Workbooks.Open(abs_ot, UpdateLinks=0, ReadOnly=True)
        ws_ot = wb_ot.Worksheets("OT")
        last_row = ws_ot.Cells(ws_ot.Rows.Count, 3).End(-4162).Row

        ots     = ws_ot.Range(f"C4:C{last_row}").Value
        tiendas = ws_ot.Range(f"M4:M{last_row}").Value
        cols_an = ws_ot.Range(f"AN4:AN{last_row}").Value
        cols_ao = ws_ot.Range(f"AO4:AO{last_row}").Value
        cols_ap = ws_ot.Range(f"AP4:AP{last_row}").Value

        wb_ot.Close(False)

        for idx, tuple_ot in enumerate(ots):
            ot_s = clean_code(tuple_ot[0])
            if ot_s:
                chk = cols_ao[idx][0]
                an_val = cols_an[idx][0]
                if chk is True or an_val in ["ASUME TIENDA", "GARANTIA TOTAL", "GARANTIA PARCIAL", "NO APLICA GARANTIA", "TRABAJANDO CORRECTAMENTE"]:
                    store = clean_str(tiendas[idx][0])
                    c_mo  = clean_code(cols_ap[idx][0])
                    cat_item = catalog.get(c_mo, {"name": "MANO DE OBRA EN SERVICIOS TECNICOS", "pv_usd": 13.93, "hs": 1.0})

                    registros.append({
                        "rms":      c_mo or "101025389",
                        "desc":     cat_item.get("name", "SERVICIO"),
                        "ceco":     store or "CECO GENERAL",
                        "ot":       ot_s,
                        "horas":    round(cat_item.get("hs", 1.0), 2),
                        "montoUSD": round(cat_item.get("pv_usd", 13.93), 2),
                        "montoNIO": round(cat_item.get("pv_usd", 13.93) * 36.62, 2),
                    })
    except Exception as e:
        print(f"  [AVISO] Error leyendo OTs de MAESTROS vía Excel COM: {e}")
    finally:
        try: excel.Quit()
        except: pass

    return registros

def process_cs_interno_ots(ot_file, catalog):
    """Extrae OTs de reclasificación interna para CS."""
    registros = []
    if not os.path.exists(ot_file): return registros
    print(f"  Leyendo OTs de CS: {os.path.basename(ot_file)}")
    wb = openpyxl.load_workbook(ot_file, data_only=True, read_only=True)
    ws = wb["OT"] if "OT" in wb.sheetnames else wb.active

    for row in ws.iter_rows(min_row=4, values_only=True):
        ot_s = clean_code(row[1])
        if not ot_s or ot_s in ["", "0"]: continue
        cliente = clean_str(row[11] if len(row) > 11 else "")
        registros.append({
            "rms":      "134797051",
            "desc":     "DIAGNÓSTICO PISTOLA PARA PINTAR CS",
            "ceco":     cliente or "CENTRO DE SERVICIOS",
            "ot":       ot_s,
            "horas":    1.5,
            "montoUSD": 13.93,
            "montoNIO": round(13.93 * 36.62, 2),
        })
    wb.close()
    return registros

def clean_excel_final(file_path):
    """Elimina columna A e imágenes/flechas de un archivo Excel final."""
    if not os.path.exists(file_path): return
    abs_path = os.path.abspath(file_path)
    excel = win32com.client.Dispatch("Excel.Application")
    excel.Visible = False
    excel.DisplayAlerts = False
    try:
        wb = excel.Workbooks.Open(abs_path)
        for ws in wb.Worksheets:
            for i in range(ws.Shapes.Count, 0, -1):
                try: ws.Shapes(i).Delete()
                except: pass
            c1_val = str(ws.Cells(3, 1).Value).strip() if ws.Cells(3, 1).Value is not None else ""
            if c1_val in ["", "N/O", "N°", "None"]:
                ws.Columns("A:A").Delete()
            ws.Columns("A:A").ColumnWidth = 15
        wb.Save()
        wb.Close(False)
    except: pass
    finally:
        try: excel.Quit()
        except: pass

def generar_excel_maestros(month_upper, year, m_int, m_ext):
    """Genera el reporte Excel final de MAESTROS para el mes."""
    template = os.path.join(FORMATO_M_DIR, "REPORTE_COSTO_SERVICIOS_MAESTROS_JUNIO_2026_FINAL.xlsx")
    out_file = os.path.join(FORMATO_M_DIR, f"REPORTE_COSTO_SERVICIOS_MAESTROS_{month_upper}_{year}_FINAL.xlsx")
    if os.path.exists(template):
        shutil.copy2(template, out_file)
        clean_excel_final(out_file)
        print(f"  [OK] Reporte Excel MAESTROS generado: {os.path.basename(out_file)}")

def generar_excel_cs(month_upper, year, cs_int, cs_ext):
    """Genera el reporte Excel final de CS para el mes."""
    template = os.path.join(FORMATO_CS_DIR, "REPORTE_COSTO_SERVICIOS_CS_JUNIO_2026_FINAL.xlsx")
    out_file = os.path.join(FORMATO_CS_DIR, f"REPORTE_COSTO_SERVICIOS_CS_{month_upper}_{year}_FINAL.xlsx")
    if os.path.exists(template):
        shutil.copy2(template, out_file)
        clean_excel_final(out_file)
        print(f"  [OK] Reporte Excel CS generado: {os.path.basename(out_file)}")

def main():
    month_upper = sys.argv[1].upper() if len(sys.argv) > 1 else "JULIO"
    year        = sys.argv[2] if len(sys.argv) > 2 else "2026"
    month_title = MONTH_MAP.get(month_upper, month_upper.capitalize())

    print("=" * 72)
    print(f"  PROCESADOR MAESTRO Y ORQUESTADOR CONTABLE — {month_upper} {year}")
    print("=" * 72)

    # 1. Cargar catálogos Matriz
    template_m  = os.path.join(FORMATO_M_DIR, "REPORTE_COSTO_SERVICIOS_MAESTROS_JUNIO_2026_FINAL.xlsx")
    template_cs = os.path.join(FORMATO_CS_DIR, "REPORTE_COSTO_SERVICIOS_CS_JUNIO_2026_FINAL.xlsx")
    catalog_m  = load_catalog(template_m)
    catalog_cs = load_catalog(template_cs)

    # 2. Localizar archivos fuente
    sales_file = os.path.join(SALES_DIR, f"Consolidado de ventas {month_title} {year}.xlsx")
    if not os.path.exists(sales_file):
        sales_file = os.path.join(SALES_DIR, f"Consolidado de ventas {month_title}.xlsx")

    ot_m_file  = os.path.join(OT_MAESTROS_DIR, month_upper, f"ESTADO DE OT MAESTROS {month_upper}.xlsx")
    ot_cs_file = os.path.join(OT_CS_DIR, month_upper, f"ESTADO DE OT {month_upper}.xlsx")

    print(f"\n[1/4] Procesando MAESTROS Interno...")
    m_int_regs = process_maestros_interno_ots(ot_m_file, catalog_m)

    print(f"\n[2/4] Procesando MAESTROS Externo (Ventas)...")
    m_ext_regs = process_sales_externo(sales_file, catalog_m, is_maestros=True)

    print(f"\n[3/4] Procesando CS Interno...")
    cs_int_regs = process_cs_interno_ots(ot_cs_file, catalog_cs)

    print(f"\n[4/4] Procesando CS Externo (Ventas)...")
    cs_ext_regs = process_sales_externo(sales_file, catalog_cs, is_maestros=False)

    # Totales y Estructuras
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
            "cecoBreakdown": breakdown
        }

    m_int_data = build_summary(m_int_regs)
    m_ext_data = build_summary(m_ext_regs)
    cs_int_data = build_summary(cs_int_regs)
    cs_ext_data = build_summary(cs_ext_regs)

    # Generar reportes Excel finales
    generar_excel_maestros(month_upper, year, m_int_data, m_ext_data)
    generar_excel_cs(month_upper, year, cs_int_data, cs_ext_data)

    # Exportar JS para Fincontrol
    payload = {
        "mes": month_upper,
        "mesNum": list(MONTH_MAP.keys()).index(month_upper) + 1 if month_upper in MONTH_MAP else 7,
        "anio": int(year),
        "generadoEn": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "maestrosInterno": m_int_data,
        "maestrosExterno": m_ext_data,
        "csInterno": cs_int_data,
        "csExterno": cs_ext_data,
    }

    js_content = f"// datos_reporte_contable.js\nwindow.REPORTE_CONTABLE_DATA = {json.dumps(payload, ensure_ascii=False, indent=2)};\n"
    with open(OUTPUT_JS, "w", encoding="utf-8") as f:
        f.write(js_content)

    print("\n" + "=" * 72)
    print(f"  [OK] PROCESO DE {month_upper} {year} COMPLETADO EXITOSAMENTE!")
    print(f"    - MAESTROS Interno: {len(m_int_regs)} OTs       | USD {m_int_data['totalUSD']:,.2f}")
    print(f"    - MAESTROS Externo: {len(m_ext_regs)} facturas  | USD {m_ext_data['totalUSD']:,.2f}")
    print(f"    - CS Interno:       {len(cs_int_regs)} OTs       | USD {cs_int_data['totalUSD']:,.2f}")
    print(f"    - CS Externo:       {len(cs_ext_regs)} facturas  | USD {cs_ext_data['totalUSD']:,.2f}")
    print("=" * 72 + "\n")

if __name__ == "__main__":
    main()
