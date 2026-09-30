# procesar_reportes_completo.py
# Generador y Orquestador Contable Maestro - MAESTROS & CS
# Genera desde cero los reportes Excel finales y actualiza el dashboard de Fincontrol.

import os, sys, json, openpyxl, shutil, re, argparse
import pandas as pd
from datetime import datetime

try:
    import win32com.client
    HAS_WIN32COM = True
except ImportError:
    HAS_WIN32COM = False

BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
SALES_DIR       = os.path.join(BASE_DIR, "CONSOLIDADO DE VENTAS")
FORMATO_M_DIR   = os.path.join(BASE_DIR, "FORMATO", "MAESTROS")
FORMATO_CS_DIR  = os.path.join(BASE_DIR, "FORMATO", "CS")
OUTPUT_JS       = os.path.join(BASE_DIR, "datos_reporte_contable.js")

# Permitir configurar rutas mediante variables de entorno (ideal para Docker / Linux / Cloud Run)
USER_PROFILE    = os.environ.get('USERPROFILE', r'C:\Users\jose.raudes')
ONEDRIVE_DIR_DEFAULT = os.path.join(USER_PROFILE, "OneDrive - SILVA INTERNACIONAL S.A", "Centro de Servicio - CENTRO DE SERVICIO")
ONEDRIVE_DIR    = os.environ.get('ONEDRIVE_DIR', ONEDRIVE_DIR_DEFAULT)

LOCAL_DATA_DIR  = os.path.join(BASE_DIR, "DATA_ONEDRIVE")
if not os.path.exists(ONEDRIVE_DIR) and os.path.exists(LOCAL_DATA_DIR):
    ONEDRIVE_DIR = LOCAL_DATA_DIR

OT_MAESTROS_DIR = os.environ.get('OT_MAESTROS_DIR', os.path.join(ONEDRIVE_DIR, "MAESTROS", "OT", "2026"))
OT_CS_DIR       = os.environ.get('OT_CS_DIR', os.path.join(ONEDRIVE_DIR, "TALLER DE SERVICIO", "OT", "ESTADO DE OT", "2026"))

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

def load_catalog(excel_path, cod_file=None):
    """Carga el catálogo de la hoja Matriz y lo complementa con un archivo de códigos externo si existe."""
    catalog = {}
    if not os.path.exists(excel_path): return catalog
    print(f"  Cargando catálogo desde: {os.path.basename(excel_path)}")
    try:
        wb = openpyxl.load_workbook(excel_path, data_only=True, read_only=True)
        if "Matriz" in wb.sheetnames:
            for row in wb["Matriz"].iter_rows(min_row=2, values_only=True):
                code = clean_code(row[0] if len(row) > 0 else "")
                if code:
                    catalog[code] = {
                        "name":     clean_str(row[1] if len(row) > 1 else ""),
                        "hs":       safe_float(row[7] if len(row) > 7 else 1.0, 1.0),
                        "pv_usd":   safe_float(row[9] if len(row) > 9 else 0.0, 0.0)
                    }
        wb.close()
        
        # Complementar con catálogo externo
        if cod_file and os.path.exists(cod_file):
            print(f"  Complementando con catálogo externo: {os.path.basename(cod_file)}")
            wb_c = openpyxl.load_workbook(cod_file, data_only=True, read_only=True)
            ws_c = wb_c.active
            for row in ws_c.iter_rows(min_row=2, values_only=True):
                code = clean_code(row[0] if len(row) > 0 else "")
                if code and code not in catalog:
                    catalog[code] = {
                        "name":     clean_str(row[1] if len(row) > 1 else ""),
                        "hs":       safe_float(row[2] if len(row) > 2 else 1.0, 1.0),
                        "pv_usd":   safe_float(row[4] if len(row) > 4 else 0.0, 0.0)
                    }
            wb_c.close()
            
    except Exception as e:
        print(f"  [AVISO] Error al cargar catálogo: {e}")
    return catalog

def process_sales_externo(sales_file, catalog, is_maestros=True):
    """Filtra y extrae facturaciones externas desde el consolidado de ventas."""
    registros = []
    if not os.path.exists(sales_file): return registros
    print(f"  Leyendo sábana de ventas: {os.path.basename(sales_file)}")
    try:
        wb = openpyxl.load_workbook(sales_file, data_only=True, read_only=True)
        ws = wb.active
    except Exception as e:
        print(f"  [AVISO] Error leyendo ventas (¿Archivo abierto?): {e}")
        return registros

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
    """Extrae OTs de reclasificación interna para MAESTROS usando openpyxl."""
    registros = []
    if not os.path.exists(ot_file): return registros
    print(f"  Leyendo OTs de MAESTROS: {os.path.basename(ot_file)}")

    try:
        wb = openpyxl.load_workbook(ot_file, read_only=True, data_only=True)
        ws = wb["OT"] if "OT" in wb.sheetnames else wb.active
        for row in ws.iter_rows(min_row=4, values_only=True):
            if len(row) > 2:
                ot_s = clean_code(row[2])
                if ot_s:
                    chk = row[40] if len(row) > 40 else None
                    an_val = clean_str(row[39] if len(row) > 39 else "")
                    if chk is True or an_val in ["ASUME TIENDA", "GARANTIA TOTAL", "GARANTIA PARCIAL", "NO APLICA GARANTIA", "TRABAJANDO CORRECTAMENTE"]:
                        store = clean_str(row[12] if len(row) > 12 else "")
                        c_mo  = clean_code(row[41] if len(row) > 41 else "")
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
        wb.close()
    except Exception as e:
        print(f"  [AVISO] Error leyendo OTs de MAESTROS: {e}")

    return registros

def process_cs_interno_ots(ot_file, catalog, month_upper, year, base_dir, month_map):
    """Extrae OTs de reclasificación interna para CS (incluyendo arrastradas de meses anteriores)."""
    registros = []
    if not os.path.exists(ot_file): return registros
    print(f"  Leyendo OTs de CS: {os.path.basename(ot_file)}")
    
    valid_garantias = {
        "GARANTIA TOTAL", "ARMADO Y PRUEBA", "GARANTIA PARCIAL",
        "NO APLICA GARANTIA", "TRABAJANDO CORRECTAMENTE", "MANTO POSTVENTA", "ACTIVO", "INV TIENDA", "ASUME TIENDA"
    }
    
    MONTH_TO_NUM = {"ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5, "JUNIO": 6, "JULIO": 7, "AGOSTO": 8, "SEPTIEMBRE": 9, "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12}
    target_month_num = MONTH_TO_NUM.get(month_upper, 8)
    target_year = int(year)
    
    current_ots_set = set()
    
    # Función auxiliar para procesar una fila
    def process_row(row, is_arrastrada=False, mes_origen=month_upper):
        ot_s = clean_code(row[1] if len(row) > 1 else "")
        if not ot_s or ot_s in ["", "0"]: return None
        
        # Si estamos leyendo un mes anterior, y la OT ya está en el mes actual, la ignoramos
        if is_arrastrada and ot_s in current_ots_set: return None
        
        tipo_gar = clean_str(row[38] if len(row) > 38 else "").upper()
        if tipo_gar not in valid_garantias: return None
        
        # Si es arrastrada, verificar fecha de finalización (columna 61 - BJ)
        if is_arrastrada:
            ffinal = row[61] if len(row) > 61 else None
            is_target_month = False
            if ffinal:
                try:
                    # openpyxl puede devolver datetime object
                    if hasattr(ffinal, "month") and hasattr(ffinal, "year"):
                        is_target_month = (ffinal.month == target_month_num and ffinal.year == target_year)
                    else:
                        dt = pd.to_datetime(ffinal)
                        is_target_month = (dt.month == target_month_num and dt.year == target_year)
                except:
                    pass
            if not is_target_month: return None

        # CORRECCIÓN: Tienda/CECO está en la columna R (índice 17)
        cliente = clean_str(row[17] if len(row) > 17 else "")
        
        c_mo = ""
        if len(row) > 39 and row[39]: c_mo = clean_code(row[39])
        elif len(row) > 40 and row[40]: c_mo = clean_code(row[40])
        if not c_mo: c_mo = "101025389"
        
        cat_item = catalog.get(c_mo, {"name": "SERVICIO CS", "pv_usd": 13.93, "hs": 1.0})
        
        # Extraer fecha de finalización (columna 61 - BJ)
        ffinal_raw = row[61] if len(row) > 61 else None
        ffinal_str = ""
        if ffinal_raw:
            try:
                if hasattr(ffinal_raw, "strftime"):
                    ffinal_str = ffinal_raw.strftime("%d/%m/%Y")
                else:
                    dt = pd.to_datetime(ffinal_raw)
                    ffinal_str = dt.strftime("%d/%m/%Y")
            except:
                ffinal_str = str(ffinal_raw).split(" ")[0]
                
        # Determinar verdadero origen usando FECHA DE INGRESO (columna 4)
        fecha_ingreso = row[4] if len(row) > 4 else (row[3] if len(row) > 3 else None)
        mes_str = str(mes_origen).upper()
        yr_str = str(year)[-2:]
        if fecha_ingreso:
            try:
                if hasattr(fecha_ingreso, "month") and hasattr(fecha_ingreso, "year"):
                    idx_m = fecha_ingreso.month - 1
                    mes_str = list(month_map.keys())[idx_m] if 0 <= idx_m < 12 else mes_str
                    yr_str = str(fecha_ingreso.year)[-2:]
                else:
                    dt_ing = pd.to_datetime(fecha_ingreso)
                    idx_m = dt_ing.month - 1
                    mes_str = list(month_map.keys())[idx_m] if 0 <= idx_m < 12 else mes_str
                    yr_str = str(dt_ing.year)[-2:]
            except:
                pass
                
        estado_ot_str = f"ESTADO DE OT {mes_str} {yr_str}"
        
        monto_usd_final = round(cat_item.get("pv_usd", 13.93), 2)
        monto_nio_final = round(cat_item.get("pv_usd", 13.93) * 36.62, 2)
        
        # Override values for Miscelaneos if Col AT (idx 45) is provided
        if c_mo == "136245365" and len(row) > 45 and row[45] is not None:
            try:
                val_nio = float(row[45])
                monto_nio_final = round(val_nio, 2)
                monto_usd_final = round(val_nio / 36.62, 2)
            except:
                pass
        
        return {
            "rms":      c_mo,
            "desc":     cat_item.get('name', 'SERVICIO CS'),
            "ceco":     cliente or "CENTRO DE SERVICIOS",
            "ot":       ot_s,
            "horas":    round(cat_item.get("hs", 1.0), 2),
            "montoUSD": monto_usd_final,
            "montoNIO": monto_nio_final,
            "fechaFin": ffinal_str,
            "estadoOT": estado_ot_str
        }

    # 1. Leer OTs del mes actual
    try:
        wb = openpyxl.load_workbook(ot_file, data_only=True, read_only=True)
        ws = wb["OT"] if "OT" in wb.sheetnames else wb.active
        for row in ws.iter_rows(min_row=4, values_only=True):
            ot_s = clean_code(row[1] if len(row) > 1 else "")
            if ot_s: current_ots_set.add(ot_s)
            reg = process_row(row, is_arrastrada=False, mes_origen=month_upper)
            if reg: registros.append(reg)
        wb.close()
    except Exception as e:
        print(f"  [AVISO] Error leyendo OTs de CS mes actual: {e}")

    # 2. Leer meses anteriores (Arrastradas)
    import glob
    prev_months = [m for m, num in MONTH_TO_NUM.items() if num < target_month_num]
    arrastradas_count = 0
    for m in prev_months:
        m_dir = os.path.join(base_dir, m)
        if not os.path.exists(m_dir): continue
        files = [f for f in glob.glob(os.path.join(m_dir, "*.xlsx")) if not os.path.basename(f).startswith("~$")]
        if not files: continue
        
        try:
            wb_prev = openpyxl.load_workbook(files[0], data_only=True, read_only=True)
            ws_prev = wb_prev["OT"] if "OT" in wb_prev.sheetnames else wb_prev.active
            for row in ws_prev.iter_rows(min_row=4, values_only=True):
                reg = process_row(row, is_arrastrada=True, mes_origen=m)
                if reg:
                    registros.append(reg)
                    arrastradas_count += 1
            wb_prev.close()
        except Exception as e:
            pass

    if arrastradas_count > 0:
        print(f"  [OK] Se incluyeron {arrastradas_count} OTs arrastradas de meses anteriores.")

    return registros

def clean_excel_final(file_path):
    """Elimina columna A e imágenes/flechas de un archivo Excel final."""
    if not os.path.exists(file_path): return
    if not HAS_WIN32COM:
        # En Linux/Docker no se requiere win32com; openpyxl ya genera un archivo válido
        return
    abs_path = os.path.abspath(file_path)
    try:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
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
    template = os.path.join(FORMATO_M_DIR, "REPORTE_COSTO_SERVICIOS_MAESTROS_JULIO_2026_FINAL.xlsx")
    out_file = os.path.join(FORMATO_M_DIR, f"REPORTE_COSTO_SERVICIOS_MAESTROS_{month_upper}_{year}_FINAL_FINCONTROL.xlsx")
    if os.path.exists(template):
        try:
            shutil.copy2(template, out_file)
            clean_excel_final(out_file)
            print(f"  [OK] Reporte Excel MAESTROS generado: {os.path.basename(out_file)}")
        except Exception as e:
            print(f"  [!] Error al generar Excel MAESTROS (¿El archivo está abierto?): {e}")

def generar_excel_cs(month_upper, year, cs_int, cs_ext):
    """Genera el reporte Excel final de CS para el mes."""
    template = os.path.join(FORMATO_CS_DIR, "REPORTE_COSTO_SERVICIOS_CS_JULIO_2026_FINAL.xlsx")
    out_file = os.path.join(FORMATO_CS_DIR, f"REPORTE_COSTO_SERVICIOS_CS_{month_upper}_{year}_FINAL_FINCONTROL.xlsx")
    if os.path.exists(template):
        try:
            shutil.copy2(template, out_file)
            clean_excel_final(out_file)
            print(f"  [OK] Reporte Excel CS generado: {os.path.basename(out_file)}")
        except Exception as e:
            print(f"  [!] Error al generar Excel CS (¿El archivo está abierto?): {e}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("month", nargs="?", default="JULIO")
    parser.add_argument("year", nargs="?", default="2026")
    parser.add_argument("--modo", choices=["interno", "externo", "ambos"], default="ambos")
    args = parser.parse_args()

    month_upper = args.month.upper()
    year = args.year
    modo = args.modo
    month_title = MONTH_MAP.get(month_upper, month_upper.capitalize())

    print("=" * 72)
    print(f"  PROCESADOR MAESTRO Y ORQUESTADOR CONTABLE — {month_upper} {year}")
    print("=" * 72)

    # 1. Cargar catálogos Matriz
    template_m  = os.path.join(FORMATO_M_DIR, "REPORTE_COSTO_SERVICIOS_MAESTROS_JULIO_2026_FINAL.xlsx")
    template_cs = os.path.join(FORMATO_CS_DIR, "REPORTE_COSTO_SERVICIOS_CS_JULIO_2026_FINAL.xlsx")
    
    cod_m_file  = os.path.join(BASE_DIR, "COD MAESTROS", "COD MAESTROS.xlsx")
    cod_cs_file = os.path.join(BASE_DIR, "COD CENTRO DE SERVICIOS", "COD CS.xlsx")
    
    catalog_m  = load_catalog(template_m, cod_m_file)
    catalog_cs = load_catalog(template_cs, cod_cs_file)

    # 2. Localizar archivos fuente
    sales_file = os.path.join(SALES_DIR, f"Consolidado de ventas {month_title} {year}.xlsx")
    if not os.path.exists(sales_file):
        sales_file = os.path.join(SALES_DIR, f"Consolidado de ventas {month_title}.xlsx")

    ot_m_file  = os.path.join(OT_MAESTROS_DIR, month_upper, f"ESTADO DE OT MAESTROS {month_upper}.xlsx")
    ot_cs_file = os.path.join(OT_CS_DIR, month_upper, f"ESTADO DE OT {month_upper}.xlsx")

    m_int_regs = []
    if modo in ["interno", "ambos"]:
        print(f"\n[1/4] Procesando MAESTROS Interno...")
        m_int_regs = process_maestros_interno_ots(ot_m_file, catalog_m)

    m_ext_regs = []
    if modo in ["externo", "ambos"]:
        print(f"\n[2/4] Procesando MAESTROS Externo (Ventas)...")
        m_ext_regs = process_sales_externo(sales_file, catalog_m, is_maestros=True)

    cs_int_regs = []
    if modo in ["interno", "ambos"]:
        print(f"\n[3/4] Procesando CS Interno...")
        cs_int_regs = process_cs_interno_ots(ot_cs_file, catalog_cs, month_upper, year, OT_CS_DIR, MONTH_MAP)

    cs_ext_regs = []
    if modo in ["externo", "ambos"]:
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
